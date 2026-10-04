# Which Forecast?

**An interactive, single-file guide to choosing a time series forecasting model.**

There is no best time series model — only the right one for *this* series. Most courses
teach you six algorithms and none teach you how to pick one, and picking is the part that
actually decides your project. This page teaches the decision procedure, with a live series
generator wired into a working recommender.

Open `index.html` in any modern browser. That's the whole install.

- **No dependencies.** No CDN, no build step, no `npm install`.
- **No network access.** Nothing is fetched; nothing you do leaves the page.
- **~100 KB, one file.** Works offline.

---

## Why this exists

The decision procedure has three stages, and confusing them is the most common mistake in
forecasting work:

| Stage | Question | Can it decide alone? |
|---|---|---|
| **1. Profile** | What structure does this series have? | Yes — deterministic diagnostics |
| **2. Shortlist** | Which 2–3 model families suit that structure? | It narrows a dozen families to a few |
| **3. Backtest** | Which of those actually wins *on your data*? | **Only this stage settles a tie** |

A tool that does only stages 1–2 will confidently hand you the wrong model and you'll have
no way to tell. That's why this page ends with a backtest, and why the recommendation panel
always reports where the rules and the backtest **disagree** — that disagreement is the most
informative output it produces.

---

## Using the lab

Everything on the page is computed live from a synthetic series generated in your browser.
Change anything and every chart, statistic and recommendation below recomputes.

**Start with a scenario** — six presets, each mapped to a classic lab exercise:

| Preset | Structure | What it teaches |
|---|---|---|
| Air passengers | n=144, m=12, multiplicative seasonality | Holt-Winters with `seasonal='mul'` |
| Stock price | 1 year, random walk | Naive is often the honest answer |
| Power demand, 10-min | m=144 on 2000 rows → 14 cycles | The identifiability trap |
| Same data, hourly | m=24 **and** m=168 | Multi-seasonality needs MSTL/TBATS |
| Intermittent parts | 55% zero periods | Continuous models are structurally wrong |
| Retail, weekly + yearly | 2 cycles, curved trend, promotions | Multi-seasonality + regime shifts |

**Then move the knobs.** 14 controls covering length, one or two seasonal periods and their
amplitudes, additive vs. multiplicative, curvature, noise, outliers, changepoints,
intermittency, exogenous driver strength, and a slider that morphs iid noise into a
cumulative random walk.

The point of the generator is that the *same algorithm family* wins and loses as you move
the knobs. That is the concept.

---

## What's inside

| Section | What it covers |
|---|---|
| Thesis | Why structure decides, and the limits of heuristics |
| Lab | Series generator, main/zoom plots, live ACF |
| Anatomy | Classical decomposition; additive vs. multiplicative; two seasonalities |
| Signals | The six numbers that pick the family, each explained and computed live |
| Families | 11 model families: when each works, when it breaks, what it costs |
| Recommender | Ranked shortlist, every score attached to a readable reason |
| Backtest | Rolling-origin evaluation, metric choice, horizon effects |
| Gotchas | 7 failure modes that show up in week one |
| Check yourself | 4 cases with worked answers |
| Build it | How this maps onto a Python starter kit, plus a carry-away decision table |

---

## How the recommender works

Logically four layers, all inside the single `<script>`:

```
diagnose()  -> SeriesProfile   structure of the series (deterministic)
rules       -> ranked shortlist family scores + human-readable reasons + hard blocks
recommend() -> Recommendation   the ranked shortlist
backtest()  -> evidence         rolling-origin error over the shortlist
```

**The diagnostics** are the interesting part, and several are deliberately not the textbook
version because the textbook version is easy to get wrong:

- **Seasonal strength** is measured on a series with a moving-average trend removed, and
  periods are detected by **removing the shortest cycle first and re-measuring on the
  residual**. This matters: `24` divides `168`, so naively stripping the weekly cycle also
  strips the daily one and the daily strength reads zero. Taking the argmax of seasonal
  strength is also wrong — a longer period always fits a shorter one in-sample, so it
  rewards overfitting.
- **Trend strength** uses a wide, period-independent smoother so it is comparable across
  series rather than shifting with the candidate seasonal period.
- **The random-walk call is based on increments**, not on ADF. A random walk's *level* always
  looks strongly trending, so trend strength must not veto it, and ADF over-rejects on short
  or strongly trending series. ADF is displayed as a teaching diagnostic but deliberately
  does not drive the recommendation.
- **Feasibility is enforced as hard refusals.** Below `n/m = 2` cycles a seasonal parameter
  is unidentifiable, and a model merely ranked last will still get used at 2am, so those
  models are struck through with the reason rather than quietly demoted.

The forecasters themselves (ETS, Holt-Winters, ARIMA, dynamic regression, MSTL) are
simplified teaching implementations written in plain JavaScript. They are there to make the
recommendations *falsifiable* against the backtest, not to be production model code.

---

## Tests

Three suites, no test framework required. Run with plain `node`:

```bash
node test-diagnostics.js        # is the analysis CORRECT?
node test-render.js 150         # does the page RENDER? (arg = random configs to sweep)
node test-structure.js          # is it self-contained, no missing element ids?
```

All three exit `0` on success and are safe to run in any order.

- **`test-diagnostics.js`** asserts that each scenario's structure is detected correctly
  (m=12 and multiplicative for Air passengers; random walk for stock; two seasonality for the
  multi-seasonal cases), that feasibility gates fire, that the recommendation routes
  exogenous drivers correctly, and that 400 random configurations produce no crashes and no
  NaN. Also times the pipeline at n=3500.
- **`test-render.js`** executes the page's actual script against a stub DOM, checks every
  section produced output, sweeps all six scenarios through the real `applyScenario` code
  path, then invokes the real randomise/reseed button handlers N times asserting no
  exceptions, no NaN series, always 10 candidate cards, and no `undefined`/`NaN` leaking
  into the rendered HTML.
- **`test-structure.js`** confirms there are no external resource references, a single script
  tag, and no dangling `$('#id')` selectors.

> The render suite caught two bugs that would have broken the page in a real browser but
> which no syntax check can see — a `ReferenceError` from Python-style `True`/`False`
> literals, and an `undefined` knob that poisoned every generated series with `NaN`. Both
> are fixed. See the limitations below for what this suite still cannot prove.

---

## Honest limitations

Worth reading before you rely on any of this.

- **Not a browser test.** `test-render.js` runs the real page script against a *stub DOM*.
  That reliably catches runtime errors and malformed output, but it cannot verify CSS
  layout or SVG chart geometry. Open it in a real browser once. If the chart panels look
  misaligned, that is a rendering issue this suite is structurally blind to.
- **Thresholds are tuned on synthetic series.** The gates in `diagnose()` (seasonal
  strength, trend strength, cycle counts) were calibrated against the six built-in
  generators. They will need recalibrating against your real data before you trust them —
  expect to adjust them against a labelled set of series where you already know the answer.
- **The forecasters are teaching implementations.** Exponential smoothing, Holt-Winters,
  ARIMA, dynamic regression and MSTL are all simplified, grid-searched rather than properly
  optimised, and unvalidated against their reference implementations. Their absolute error
  numbers should not be quoted. They exist so the backtest can falsify the rules.
- **Prophet and gradient boosting are not implemented**, so they are recommended but never
  backtested. That asymmetry is visible in the UI by design.
- **The exogenous driver is fed as *actual future values*** during evaluation. That is
  deliberate — it is oracle leakage, and the page flags it as a red alert precisely so the
  concept is visible. Do not copy that pattern.
- **Synthetic data only.** No real datasets are included, so nothing here is exercised
  against messy real-world series.

---

## Relationship to the Python starter kit

This page is a working prototype of the recommender architecture, not a substitute for it.
The concepts are all fixed, so porting to Python is mostly translation:

```
diagnose()      -> SeriesProfile dataclass
seasonality     -> Hyndman rs_ratio / STL
ADF / KPSS      -> statsmodels.tsa.stattools
linear algebra  -> numpy.linalg / scipy
walkForward()   -> a candidate + a backtesting library
rules           -> declarative rule objects
recommend()     -> ranked shortlist + reasons
```

Three decisions worth getting right when you build it:

1. **Hard refusals vs. soft warnings.** If `n/m < 2`, refuse the seasonal model outright and
   say why.
2. **Reasons are the API.** Return something like
   `Recommendation(model, score, reasons, config)` — never a bare string. The reasons are what
   make the output reviewable.
3. **Keep the backtest pluggable.** The rules propose; the backtest disposes. Where they
   disagree, the backtest wins.

---

## The short version

Measure the structure. Use it to shortlist two or three families with written justification.
Then let rolling-origin error pick the winner — and keep the naive forecast in the comparison
the whole way, because beating "tomorrow equals today" is the only bar that matters.

---

## License

MIT — see [LICENSE](LICENSE).