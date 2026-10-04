/* Minimal DOM shim to smoke-test the page's render path headlessly.
   Not a real browser: it just needs to be good enough to catch runtime errors
   thrown while building innerHTML, wiring listeners, and drawing charts. */
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

const STATIC_IDS = ['knobs', 'scenarios', 'fams', 'quizBox', 'chMain', 'chExog', 'chZoom', 'chAcf',
  'decomp', 'sigCard', 'alerts', 'recs', 'btTable', 'chBt', 'pillVerdict',
  'btnShuffle', 'btnRand', 'btnRecompute', 'segOrigins', 'segH'];

let children = [];
const byId = {};

function makeEl(tag, attrs) {
  const el = { tag, id: (attrs.match(/id="([^"]+)"/) || [])[1], dataset: {}, style: {}, value: '', textContent: '' };
  el.cls = ((attrs.match(/class="([^"]+)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
  const dre = /data-([\w-]+)="([^"]*)"/g; let d;
  while ((d = dre.exec(attrs))) el.dataset[d[1]] = d[2];
  const s = new Set(el.cls);
  el.classList = {
    _s: s,
    add(c) { s.add(c); }, remove(c) { s.delete(c); },
    contains(c) { return s.has(c); },
    toggle(c, f) { if (f === undefined) f = !s.has(c); f ? s.add(c) : s.delete(c); }
  };
  el.addEventListener = (ev, fn) => { (el._h = el._h || {})[ev] = fn; };
  el.removeEventListener = () => { };
  el.scrollIntoView = () => { };
  el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 900, height: 150 });
  el.setAttribute = () => { }; el.getAttribute = () => null;
  el.appendChild = c => { children.push(c); return c; };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return _html; },
    set(v) { _html = String(v); children = children.concat(parse(String(v))); }
  });
  el.querySelector = sel => matchAll(sel)[0] || null;
  el.querySelectorAll = sel => matchAll(sel);
  return el;
}

function parse(h) {
  const out = [];
  const re = /<([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)>/g; let m;
  while ((m = re.exec(h))) {
    const el = makeEl(m[1].toLowerCase(), m[2] || '');
    out.push(el);
    if (el.id) byId[el.id] = el;
  }
  return out;
}

// matches the FINAL compound selector only; ancestor scoping is ignored (sufficient for
// a crash test -- we are not asserting on rendered output)
function matchAll(sel) {
  sel = sel.trim();
  const parts = sel.split(/\s+|>/).filter(Boolean);
  const last = parts[parts.length - 1];
  const m = last.match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)(\[[^\]]+\])?$/);
  if (!m) return [];
  const tag = m[1] ? m[1].toLowerCase() : null;
  const classes = (m[2] || '').split('.').filter(Boolean);
  const attr = m[3] ? m[3].slice(1, -1) : null;
  return children.filter(el => {
    if (tag && el.tag !== tag) return false;
    for (const c of classes) if (!el.classList.contains(c)) return false;
    if (attr) {
      const a = attr.split('=');
      const k = a[0];
      const v = a[1] ? a[1].replace(/^["']|["']$/g, '') : undefined;
      if (v === undefined) { if (!(k in el.dataset)) return false; }
      else if (String(el.dataset[k]) !== v) return false;
    }
    return true;
  });
}

for (const id of STATIC_IDS) byId[id] = makeEl('div', 'id="' + id + '"');
parse(html.slice(html.indexOf('<body>'), html.indexOf('<script>')));

const doc = {
  querySelector: sel => (sel[0] === '#' && byId[sel.slice(1)]) || matchAll(sel)[0] || null,
  querySelectorAll: sel => matchAll(sel),
  getElementById: id => byId[id] || null
};
const win = { addEventListener: () => { }, scrollY: 0, innerWidth: 1200, location: { hash: '' } };
const document = Object.assign(doc, {
  addEventListener: () => { },
  body: makeEl('body', ''),
  documentElement: makeEl('html', '')
});

const ctx = {
  console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt, Number, String, Array, Object,
  document, window: win, innerWidth: 1200
};
ctx.globalThis = ctx; ctx.window.document = document;
vm.createContext(ctx);

let fail = 0;
console.log('=== SMOKE TEST: executing the page script against a stub DOM ===');
try {
  vm.runInContext(js, ctx, { timeout: 60000 });
  console.log('  ok    script executed to completion');
} catch (e) {
  fail++;
  console.log('  FAIL  script threw: ' + e.message);
  console.log(String(e.stack || '').split('\n').slice(0, 6).join('\n'));
}

// verify the dynamic sections actually got content
const checks = [
  ['scenarios built', 'scenarios'], ['knobs built', 'knobs'], ['family cards built', 'fams'],
  ['quiz built', 'quizBox'], ['main chart drawn', 'chMain'], ['ACF chart drawn', 'chAcf'],
  ['decomposition panels', 'decomp'], ['signals panel', 'sigCard'],
  ['recommendations rendered', 'recs'], ['backtest table rendered', 'btTable'], ['backtest chart drawn', 'chBt']
];
console.log('\n=== RENDERED OUTPUT ===');
for (const [label, id] of checks) {
  const el = byId[id];
  const len = el ? String(el.innerHTML).length : 0;
  const okv = !!el && len > 40;
  if (!okv) fail++;
  console.log('  ' + (okv ? 'ok   ' : 'FAIL ') + label.padEnd(28) + (len) + ' chars');
  if (okv && /undefined|NaN|\[object/.test(String(el.innerHTML))) {
    fail++;
    console.log('        FAIL contains undefined/NaN/[object');
  }
}
// alerts is legitimately empty for a clean series
const alertLen = String(byId.alerts.innerHTML).length;
console.log('  info  alerts rendered             ' + alertLen + ' chars (0 is valid for a clean series)');

// recs should list 10 candidates with reasons
const recHtml = String(byId.recs.innerHTML);
const nRec = (recHtml.match(/class="rec /g) || []).length;
const nReasons = (recHtml.match(/<li>/g) || []).length;
console.log('\n  recommendation cards: ' + nRec + '   reason bullets: ' + nReasons);
if (nRec !== 10) { fail++; console.log('  FAIL expected 10 candidate cards'); }

const btHtml = String(byId.btTable.innerHTML);
const nRows = (btHtml.match(/<tr/g) || []).length;
console.log('  backtest rows: ' + nRows);
if (nRows < 4) { fail++; console.log('  FAIL backtest table too short'); }

// ---- diagnostics ----
console.log('\n=== DIAGNOSTICS ===');
try {
  vm.runInContext('globalThis.__d={SER:SER,PROF:PROF,GEN:GEN,btContext:btContext,horizonDefault:horizonDefault};', ctx);
  const D = ctx.__d;
  console.log('  GEN.n=' + D.GEN.n + '  GEN.m=' + D.GEN.m + '  h=' + D.horizonDefault());
  console.log('  PROF: m1=' + D.PROF.m1 + ' ms=[' + D.PROF.ms.join(',') + '] type=' + D.PROF.type + ' n=' + D.PROF.n);
  const ctxObj = D.btContext();
  console.log('  btContext m=' + ctxObj.m + ' type=' + ctxObj.type + ' hasTrain=' + (typeof ctxObj.train === 'function'));
  const tctx = ctxObj.train(132, 144);
  console.log('  train(132,144): m=' + tctx.m + ' type=' + tctx.type + ' x.len=' + (tctx.x ? tctx.x.length : 'null') + ' xf.len=' + (tctx.xf ? tctx.xf.length : 'null'));
  for (const k of ['naive', 'hw', 'arima', 'ses']) {
    let r;
    try { r = vm.runInContext(`MODELS.${k}.fn(SER.y.slice(0,132),12,btContext().train(132,144))`, ctx); }
    catch (e) { console.log('    MODELS.' + k + ' THREW: ' + e.message); continue; }
    console.log('    MODELS.' + k + ' -> ' + (r ? 'len=' + r.length + ' finite=' + r.every(v => isFinite(v)) : 'null'));
  }
  const res = vm.runInContext('backtest(SER.y,12,5,btContext())', ctx);
  console.log('  backtest() keys: ' + JSON.stringify(Object.keys(res)));
} catch (e) { console.log('  diagnostics failed: ' + e.message); }

// find the offending token in the ACF chart
// find the offending token in the backtest chart
const acfHtml = String(byId.chBt.innerHTML);
const bad = acfHtml.match(/.{60}(undefined|NaN|\[object).{30}/);
console.log('\n  backtest chart offending fragment: ' + (bad ? JSON.stringify(bad[0]) : 'none found'));

// ---- exercise every scenario through the real UI path ----
console.log('\n=== SCENARIO SWEEP (via applyScenario, i.e. the real UI code path) ===');
const EXPECT = { air: 12, stock: null, power: 144, powerHourly: 24, inter: null, retail: 7 };
const ids = Object.keys(EXPECT);
for (const id of ids) {
  try {
    vm.runInContext(`applyScenario(${JSON.stringify(id)})`, ctx, { timeout: 60000 });
    const D = vm.runInContext('({m1:PROF.m1,ms:PROF.ms.slice(),type:PROF.type,rw:PROF.randomWalk,n:PROF.n,z:PROF.zeroFrac})', ctx);
    const bad2 = D.yNaN;
    const recs = String(byId.recs.innerHTML);
    const rows = (String(byId.btTable.innerHTML).match(/<tr/g) || []).length;
    const nanInYs = vm.runInContext('SER.y.some(v=>!isFinite(v))', ctx);
    const tokens = ['chMain', 'chAcf', 'decomp', 'sigCard', 'recs', 'btTable', 'chBt']
      .filter(k => /undefined|NaN|\[object/.test(String(byId[k].innerHTML)));
    const okAll = D.m1 === EXPECT[id] && !nanInYs && rows >= 3 && tokens.length === 0;
    if (!okAll) fail++;
    console.log('  ' + (okAll ? 'ok   ' : 'FAIL ') + id.padEnd(13) +
      ' m1=' + String(D.m1).padEnd(5) + ' ms=[' + D.ms.join(',').padEnd(8) + ']' +
      ' ' + D.type.padEnd(4) + (D.rw ? ' randWalk' : '        ') +
      ' btRows=' + rows +
      (nanInYs ? '  NaN-IN-SERIES' : '') +
      (tokens.length ? '  tokens in: ' + tokens.join(',') : ''));
  } catch (e) {
    fail++;
    console.log('  FAIL ' + id + ' threw: ' + e.message);
  }
}

// ---- exercise the real randomise + reseed handlers ----
console.log('\n=== RANDOMISE SWEEP (invoking the actual btnRand / btnShuffle handlers) ===');
let crashes = 0, nanRuns = 0, badCards = 0, badTokens = 0, runs = 0;
const RAND_RUNS = Math.max(1, parseInt(process.argv[2] || '60', 10));
const offenders = [];
try {
  const randH = byId.btnRand._h && byId.btnRand._h.click;
  const shufH = byId.btnShuffle._h && byId.btnShuffle._h.click;
  if (!randH || !shufH) { console.log('  FAIL could not locate the real button handlers'); fail++; }
  for (let i = 0; i < RAND_RUNS; i++) {
    randH();
    shufH();
    runs++;
    if (vm.runInContext('SER.y.some(v=>!isFinite(v))', ctx)) nanRuns++;
    const nrec = (String(byId.recs.innerHTML).match(/class="rec /g) || []).length;
    if (nrec !== 10) badCards++;
    const hit = ['chMain', 'decomp', 'sigCard', 'recs', 'btTable', 'chBt']
      .filter(k => /undefined|NaN|\[object/.test(String(byId[k].innerHTML)));
    if (hit.length) {
      badTokens++;
      if (offenders.length < 3) {
        const frag = String(byId[hit[0]].innerHTML).match(/.{55}(undefined|NaN|\[object).{25}/);
        const cfg = vm.runInContext('JSON.stringify(Object.assign({},GEN))', ctx);
        offenders.push({ chart: hit.join(','), frag: frag ? frag[0] : '?', GEN: cfg });
      }
    }
  }
} catch (e) {
  crashes++;
  console.log('  FAIL randomise sweep threw: ' + e.message);
  console.log(String(e.stack || '').split('\n').slice(0, 5).join('\n'));
}
if (crashes || nanRuns || badCards || badTokens) fail++;
console.log('  ' + (!crashes && runs === RAND_RUNS ? 'ok   ' : 'FAIL ') + runs + ' random configs + reseeds rendered, no exceptions');
console.log('  ' + (!nanRuns ? 'ok   ' : 'FAIL ') + 'NaN series: ' + nanRuns);
console.log('  ' + (!badCards ? 'ok   ' : 'FAIL ') + 'runs not rendering 10 candidate cards: ' + badCards);
console.log('  ' + (!badTokens ? 'ok   ' : 'FAIL ') + 'runs emitting undefined/NaN/[object: ' + badTokens);
for (const o of offenders) {
  console.log('       chart=' + o.chart);
  console.log('       frag =' + JSON.stringify(o.frag));
  console.log('       GEN  =' + o.GEN);
}

console.log('\n' + (fail ? fail + ' SMOKE CHECK(S) FAILED' : 'SMOKE TEST PASSED'));
process.exit(fail ? 1 : 0);
