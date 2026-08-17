<p align="center">
  <img src="docs/assets/hero.png" alt="FACE AHEAD" width="100%" />
</p>

<p align="center">
  <strong>FACE AHEAD — meet the face you're building.</strong><br />
  Upload a selfie → watch your <em>real</em> face age 12→70 → get an honest AI skin report on your future self → the 3 evidence-backed habits that change the curve.
</p>

<p align="center">
  <a href="https://swathigampa354-ship-it.github.io/future-face/"><img src="https://img.shields.io/badge/live-demo-7b4dff?logo=github" alt="Live demo" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/YouCam-4%20APIs-ff7a59" alt="4 YouCam APIs" />
  <img src="https://img.shields.io/badge/tests-33%20passing-2e9e5b" alt="33 tests" />
</p>

---

## 🎬 Try it live

**https://swathigampa354-ship-it.github.io/future-face/** (GitHub Pages)

> Real mode runs when the build includes a YouCam API key (`VITE_YOUCAM_KEY`, injected from an **encrypted repo secret** — never committed). Without a key the app runs a clearly-labeled **🎬 GENERATED demo** so the product never breaks.

## 💡 The one-liner

Every beauty app tells you what your skin looks like *today*. **FACE AHEAD shows you the face you're building** — and gives you the honest, evidence-backed moves that change it.

## 🧩 What it does (the full journey)

1. **📸 Upload a selfie** — front-facing, any lighting
2. **⏳ Age it 12 → 70** — YouCam's aging model renders **16 frames of YOUR actual face** (2u, ~10s)
3. **🔬 Scan today + future** — full 14-concern skin analysis on your current face **and** on your aged face, plus tone + Fitzpatrick type
4. **📊 Today → Future report** — every metric with an honest delta (▲ better / ▼ worse / = stable), sorted by biggest drop
5. **📏 Error bars, not guesses** — one-tap *Verify* re-scans the future frame and shows the ± spread across scans (inspired by measurement-honesty research)
6. **🛡️ Habits that change the curve** — the top 3 habits ranked against **your** biggest future drops, each with a real citation and an honest confidence label (strong / moderate)
7. **🃏 Share card** — "My face at 60" with headline, deltas, and your #1 move (Web Share / clipboard)
8. **📈 Progress loop** — journeys saved locally; *re-take in 90 days* and see if your curve moved

## 🎯 The problem (why this matters)

- Skin aging from UV is **~80% preventable** — the single largest environmental driver of visible facial aging (Flament et al., 2013)
- Behavioral research shows **people who see their aged self make better long-term decisions** — the "future-self" intervention increases savings *and* sunscreen use (Hershfield et al.; NYU sun-damage photo studies)
- Yet every beauty app avoids the future entirely: no app in this competition shows you your own aged face *with* a skin report and a plan

**That's the impact story: a prevention tool, not a vanity mirror.**

## ⚙️ Technology — 4 YouCam APIs, one orchestrated pipeline

| Endpoint | Purpose | Units |
|---|---|---|
| `aging` | 16 age frames of the uploaded face (12→70) | 2 |
| `skin-analysis` | 14 concerns on today's face (ui_scores + masks) | 16 |
| `skin-tone-analysis` | exact skin/eye/lip/brow/hair colors | 20 |
| `fitzpatrick-scale-analyzer` | sun type I–VI | 10 |
| `skin-analysis` (reuse) | 14 concerns on the **aged** frame | 16 |
| | **Full journey ≈ 64u** | |

**Orchestration design** (`src/lib/pipeline.ts`, ECC-inspired):
- Deterministic 6-stage pipeline with a **live trace UI** (prepare → aging → today → future → compare → compose)
- **Parallel lanes**: three analyses share ONE upload (`file_id`) — 3 tasks in parallel, 1 PUT per crop
- **Fail-closed gates**: structured-output validation before any result renders (`parseSkinOutput`, `parseAgingFrames`); incomplete data → retry, never fake data
- **Crop-candidate fallback**: 4 windows (0.7×/0.85×/0.7×/0.9×) at 1024² — errors are free, only successes charge units; angle errors stop early
- **Graceful degradation**: tone/Fitzpatrick failure → report renders with warnings, never a crash
- **Honest error mapping**: `error_no_face`, `error_face_angle_*`, `error_src_face_too_small`, `error_src_face_out_of_bound`, `error_below_min_image_size`, `CreditInsufficiency`, `[DLQ]` crashes → actionable messages, never raw JSON

## 🧪 Quality

- **31 unit tests** (crop math, error mapping, schema gates, comparison engine, habit ranking, pipeline lifecycle) — `npm test`
- **E2E verified in headless Chrome** against the live API and the deployed site
- **Honesty contract** built in: every aged image is labeled *AI projection*, every demo value is labeled *GENERATED*, every habit carries a citation + confidence level, no medical claims anywhere

## 🚀 Run it

```bash
npm ci
npm test
# optional: real mode
cp .env.example .env   # add VITE_YOUCAM_KEY
VITE_BASE_PATH=/future-face/ npm run build   # Pages subpath build
```

**Deploy** (`.github/workflows/pages.yml`): tests → build with `VITE_YOUCAM_KEY` from the encrypted repo secret → GitHub Pages. No key in the repo, ever.

## 📚 Docs

- [`docs/PRD.md`](docs/PRD.md) — product requirements & judging-criteria map
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — pipeline & data flow
- [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md) — the orchestration engine
- [`docs/HONESTY.md`](docs/HONESTY.md) — the honesty contract & evidence library

## 🏆 Built for

**YouCam API Skin AI & Apparel VTO Hackathon** · 4 YouCam APIs · MIT licensed · deadline Aug 17, 2026
