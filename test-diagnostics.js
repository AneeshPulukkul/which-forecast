const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const coreRaw = js.slice(0, js.indexOf('   8 \u00b7 UI WIRING'));
const core = coreRaw.slice(0, coreRaw.lastIndexOf('/*'));

const ctx = { console, Math, Date, isFinite, parseFloat, parseInt };
vm.createContext(ctx);
vm.runInContext(core + '\n;globalThis.__api={generate,profile,recommend,backtest,GEN,setGEN:(g)=>{Object.assign(GEN,g)},DEFAULTS,MODELS,seasonalStrength,mulSeasonalStrength,trendStrength,classicalDecomp,acf,adf,adfOnce,ampDriftFn,maTrend,oddWindow,trendStrength};', ctx);
const A = ctx.__api;

function pad(s, n) { return String(s).padEnd(n); }
function num(v, n = 6) { return typeof v === 'number' ? v.toFixed(n) : String(v); }

let failures = 0;
function check(label, cond, detail) {
  if (!cond) { failures++; console.log('  FAIL  ' + label + '  ' + (detail || '')); }
  else console.log('  ok    ' + label);
}
function mkCtx(P, gm, ser) {
  const m = P.m1 || Math.max(2, gm);
  return { m, type: P.type, ms: P.ms, train: (a, z) => ({ m, type: P.type, ms: P.ms, x: ser.x.slice(0, a), xf: ser.x.slice(a, z) }) };
}

// Recreate SCENARIOS here (they are defined in the UI section, not core)
const SCEN = [
  { id: 'air', name: 'Air passengers', g: { n: 144, m: 12, m2: 0, trend: .75, curve: 0, seas: 'mul', seasAmp: .42, seasAmp2: 0, noise: .05, outl: 0, cp: 0, inter: 0, exog: 0 }, want: { m1: 12, type: 'mul', top: 'hw' } },
  { id: 'stock', name: 'GOOGL stock', g: { n: 250, m: 5, m2: 0, trend: .15, curve: 0, seas: 'none', seasAmp: 0, seasAmp2: 0, noise: .45, outl: .3, cp: 0, inter: 0, exog: 0, rw: 1 }, want: { randomWalk: true } },
  { id: 'power', name: 'Power 10-min (trap)', g: { n: 2000, m: 144, m2: 0, trend: .25, curve: 0, seas: 'mul', seasAmp: .3, seasAmp2: 0, noise: .09, outl: .1, cp: 0, inter: 0, exog: .35 }, want: { m1: 144 } },
  { id: 'hourly', name: 'Power hourly (2 seasons)', g: { n: 3500, m: 24, m2: 168, trend: .3, curve: 0, seas: 'mul', seasAmp: .28, seasAmp2: .45, noise: .08, outl: .1, cp: 0, inter: 0, exog: .35 }, want: { ms2: true, m1: 24 } },
  { id: 'inter', name: 'Intermittent', g: { n: 200, m: 1, m2: 0, trend: .5, curve: 0, seas: 'none', seasAmp: 0, seasAmp2: 0, noise: .5, outl: .3, cp: 0, inter: .55, exog: 0 }, want: { intermittency: true } },
  { id: 'retail', name: 'Retail weekly+yearly', g: { n: 2400, m: 7, m2: 365, trend: .5, curve: .8, seas: 'add', seasAmp: .3, seasAmp2: .5, noise: .1, outl: .4, cp: 2, inter: 0, exog: .2 }, want: { m1: 7, ms2: true } }
];

console.log('=== DIAGNOSTIC DETECTION ===');
const results = {};
for (const s of SCEN) {
  A.setGEN(Object.assign({}, A.DEFAULTS, s.g));
  const ser = A.generate(A.GEN, 20260803);
  const P = A.profile(ser.y, ser.x);
  const R = A.recommend(P);
  const top = R.list[0];
  const bt = A.backtest(ser.y, s.g.n >= 1200 ? 168 : (s.g.n >= 900 ? 90 : (s.g.n >= 250 ? 30 : 12)), 5, mkCtx(P, s.g.m, ser));
  const btSorted = Object.keys(bt).sort((a, b) => bt[a].rmse - bt[b].rmse);
  results[s.id] = { P, top, bt, btBest: btSorted[0] };

  console.log('\n--- ' + s.name + ' ---');
  console.log('  m1=' + P.m1 + '  FS=' + P.FS1.toFixed(2) + ' (' + P.seasonalVerdict + ')  FT=' + P.FT.toFixed(2) + ' (' + P.trendVerdict + ')');
  console.log('  2nd=' + (P.second ? P.second.m + ' FS=' + P.second.FS.toFixed(2) : 'none') + '  type=' + P.type + '  cycles=' + (P.cycles ? P.cycles.toFixed(1) : '-'));
  console.log('  ADF stat=' + P.adf.stat.toFixed(2) + ' stationarity=' + P.adf.stationary + '  randomWalk=' + P.randomWalk + ' (diffACF1=' + P.rwAcf1.toFixed(2) + ')');
  console.log('  zeros=' + (P.zeroFrac * 100).toFixed(0) + '%  exogCorr=' + P.exogCorr.toFixed(2) + '  ampDrift=' + P.ampDrift.toFixed(3));
  console.log('  TOP: ' + top.name + ' (' + top.score.toFixed(0) + ')   #2: ' + R.list[1].name + '   #3: ' + R.list[2].name);
  console.log('  blocked: ' + R.list.filter(r => r.blocked).map(r => r.key + '->"' + r.blocked + '"').join(' | ') || '(none)');
  console.log('  BACKTEST best: ' + btSorted[0] + '  |  ranking: ' + btSorted.map(k => k + ':' + bt[k].rmse.toFixed(1)).join(' '));
  if (bt.naive) console.log('  skill vs naive: ' + btSorted.map(k => k + ':' + (bt[k].skill * 100).toFixed(0) + '%').join(' '));

  if (s.want.m1) check(s.id + ' detects m=' + s.want.m1, P.m1 === s.want.m1, 'got m1=' + P.m1);
  if (s.want.type) check(s.id + ' detects ' + s.want.type + ' seasonality', P.type === s.want.type, 'got ' + P.type);
  if (s.want.randomWalk !== undefined) check(s.id + ' randomWalk=' + s.want.randomWalk, P.randomWalk === s.want.randomWalk, 'got ' + P.randomWalk);
  if (s.want.ms2) check(s.id + ' detects 2 seasonalities', P.ms.length > 1, 'got ' + JSON.stringify(P.ms));
  if (s.want.intermittency) check(s.id + ' flags intermittency', P.zeroFrac > 0.2, 'got ' + P.zeroFrac.toFixed(2));
  if (s.want.top) check(s.id + ' recommends ' + s.want.top, top.key === s.want.top, 'got ' + top.key);
}

console.log('\n=== FEASIBILITY GATES ===');
A.setGEN(Object.assign({}, A.DEFAULTS, { n: 250, m: 144, seas: 'add', seasAmp: .4, noise: .05, trend: 0, exog: 0 }));
let P = A.profile(A.generate(A.GEN, 1).y, null);
let R = A.recommend(P);
check('m=144 with n=250 (1.7 cycles) blocks seasonal models', !!(R.blocks.hw || R.blocks.mstl), 'm1=' + P.m1 + ' cycles=' + (P.cycles || 0).toFixed(2) + ' hw=' + R.blocks.hw);

A.setGEN(Object.assign({}, A.DEFAULTS, { n: 500, m: 7, seas: 'none', seasAmp: 0, trend: 0, noise: .3, exog: 0 }));
P = A.profile(A.generate(A.GEN, 2).y, null);
R = A.recommend(P);
check('no seasonality -> SES ranked top', R.list[0].key === 'ses', 'got ' + R.list[0].key + ' / ' + R.list[1].key);
check('no seasonality -> HW demoted below SES', R.scores.ses > R.scores.hw, 'ses=' + R.scores.ses + ' hw=' + R.scores.hw);

A.setGEN(Object.assign({}, A.DEFAULTS, { n: 400, m: 12, trend: .8, curve: 0, seas: 'none', seasAmp: 0, noise: .06, exog: 0 }));
P = A.profile(A.generate(A.GEN, 3).y, null);
R = A.recommend(P);
check('trend, no season -> Holt leads SES', R.scores.holt > R.scores.ses, 'holt=' + R.scores.holt + ' ses=' + R.scores.ses + ' top=' + R.list[0].key);

console.log('\n=== EXOG ROUTING ===');
A.setGEN(Object.assign({}, A.DEFAULTS, { n: 400, m: 12, trend: .4, seas: 'mul', seasAmp: .3, noise: .08, exog: .9 }));
P = A.profile(A.generate(A.GEN, 4).y, A.generate(A.GEN, 4).x);
R = A.recommend(P);
check('strong driver -> regression promoted into top 3', R.list.slice(0, 3).some(r => r.key === 'regress'), 'top3=' + R.list.slice(0, 3).map(r => r.key).join(',') + ' exogCorr=' + P.exogCorr.toFixed(2));

console.log('\n=== ROBUSTNESS SWEEP (random configs) ===');
let crashes = 0, empty = 0, nanHits = 0;
const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
for (let i = 0; i < 400; i++) {
  const g = {
    n: [20, 40, 80, 150, 300, 700, 1500][Math.floor(rnd() * 7)],
    m: [1, 2, 4, 5, 7, 12, 24, 52, 144, 168, 365][Math.floor(rnd() * 11)],
    trend: rnd() * 2 - 1, curve: rnd() * 2 - 1,
    seas: ['none', 'add', 'mul'][Math.floor(rnd() * 3)],
    seasAmp: rnd(), seasAmp2: rnd() < .4 ? rnd() * .5 : 0,
    noise: rnd() * .6, outl: rnd(), cp: Math.floor(rnd() * 3),
    inter: rnd() < .25 ? rnd() * .8 : 0, exog: rnd()
  };
  try {
    A.setGEN(Object.assign({}, A.DEFAULTS, g));
    const ser = A.generate(A.GEN, i * 7919 + 1);
    const p = A.profile(ser.y, ser.x);
    const r = A.recommend(p);
    const hh = [1, 5, 12, 24, 48][Math.floor(rnd() * 5)];
    const b = A.backtest(ser.y, hh, 5, mkCtx(p, g.m, ser));
    if (!r.list.length) empty++;
    for (const k in b) {
      if (!isFinite(b[k].rmse) || !isFinite(b[k].mae)) nanHits++;
      for (const pt of b[k].points) if (!isFinite(pt.a) || !isFinite(pt.e)) nanHits++;
    }
    if (r.list[0].score !== r.list[0].score) nanHits++;
  } catch (e) { crashes++; if (crashes < 4) console.log('  CRASH: ' + e.message + '\n    cfg=' + JSON.stringify(g)); }
}
check('no crashes in 400 random configs', crashes === 0, crashes + ' crashes');
check('no NaN metrics in sweep', nanHits === 0, nanHits + ' NaN');
check('recommendations always non-empty', empty === 0, empty + ' empty');

console.log('\n=== PERF ===');
const t0 = Date.now();
A.setGEN(Object.assign({}, A.DEFAULTS, SCEN[3].g));
const big = A.generate(A.GEN, 1);
const tGen = Date.now() - t0;
const t1 = Date.now(); const bp = A.profile(big.y, big.x); const tProf = Date.now() - t1;
const t2 = Date.now(); A.recommend(bp); const tRec = Date.now() - t2;
const t3 = Date.now(); A.backtest(big.y, 168, 8, mkCtx(bp, 24, big)); const tBt = Date.now() - t3;
console.log('  n=3500: generate ' + tGen + 'ms | profile ' + tProf + 'ms | recommend ' + tRec + 'ms | backtest ' + tBt + 'ms');
check('profile under 800ms at n=3500', tProf < 800, tProf + 'ms');
check('backtest under 4000ms at n=3500', tBt < 4000, tBt + 'ms');

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
