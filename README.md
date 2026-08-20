<p align="center">
  <img src="docs/assets/hero.png" alt="FACE AHEAD" width="100%" />
</p>

<p align="center">
  <strong>FACE AHEAD — meet the face you're building.</strong><br />
  Upload a selfie → watch your <em>real</em> face age 12→70 → get an honest AI skin report on your future self → the evidence-backed habits that change the curve.
</p>

<p align="center">
  <a href="https://swathigampa354-ship-it.github.io/future-face/"><img src="https://img.shields.io/badge/live-demo-7b4dff?logo=github" alt="Live demo" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/YouCam-17%20APIs-ff7a59" alt="YouCam APIs" />
  <img src="https://img.shields.io/badge/tests-56%20passing-2e9e5b" alt="56 tests" />
</p>

---

## 🎬 Try it live

**https://swathigampa354-ship-it.github.io/future-face/** (GitHub Pages)

> YouCam API keys are entered in-app (Settings → API Key Pool) and stored only in your browser's localStorage. No env vars, no server, no build-time secrets. Without keys the app runs a clearly-labeled **🎬 GENERATED demo** so the product never breaks.

## 💡 The one-liner

Every beauty app tells you what your skin looks like *today*. **FACE AHEAD shows you the face you're building** — and gives you the honest, evidence-backed moves that change it.

## 🧩 What it does (the full journey)

1. **📸 Upload a selfie** — front-facing, any lighting
2. **⏳ Age it 12 → 70** — YouCam's aging model renders **16 frames of YOUR actual face** (3u, ~10s)
3. **🔬 Scan today + future** — full 14-concern skin analysis on your current face **and** on your aged face, plus tone + Fitzpatrick type
4. **📊 Today → Future report** — every metric with an honest delta (▲ better / ▼ worse / = stable), sorted by biggest drop
5. **📏 Error bars, not guesses** — one-tap *Verify* re-scans the future frame and shows the ± spread (inspired by measurement-honesty research)
6. **🛡️ Habits that change the curve** — the top 3 habits ranked against your biggest future drops, each with a citation and honest confidence label
7. **🃏 Share card** — "My face at 60" with headline, deltas, and your #1 move (Web Share / clipboard)
8. **📈 Progress loop** — journeys saved locally; re-take in 90 days and see if your curve moved

## ⚙️ Architecture

### Zero-backend design
YouCam serves `access-control-allow-origin: *`, so the browser calls the API directly. No proxy, no Lambda, no server costs. API keys travel only to `yce-api-01.makeupar.com`.

### API Layer (`src/api/`)
| Module | Responsibility |
|---|---|
| `client.ts` | HTTP transport, 5 QPS rate limiting, Diagnostics Bus publishing, key rotation on failure |
| `keypool.ts` | Per-key health states (unverified/ready/cooling/exhausted/invalid), automatic failover |
| `features.ts` | Registry of 17 YouCam features with verified paths, input specs, and per-unit costs |
| `orchestrator.ts` | DAG pipeline runner with concurrent execution, dst_id chaining, auto-crop recovery |

### Key design decisions
- **Multi-key pool**: Add 5-10 YouCam keys in Settings. The pool auto-rotates on `CreditInsufficiency` (exhausted), `401` (invalid), and `429` (rate limit). Each key has 1,000 units.
- **Diagnostics Bus**: Every raw HTTP request/response is published unfiltered before error classification. Live log on `/diagnostics`.
- **S3 PUT is mandatory**: The File API returns a presigned URL — you MUST PUT the image bytes before calling any task endpoint.
- **Errors are free**: YouCam only charges on success, so retry ladders cost nothing.
- **Polling uses the same key**: A running task is tied to the key that created it — never abandon a task.
- **Auto-crop recovery**: YouCam's most common error is `error_face_position_too_small`. The runner auto-crop-ladders (1x → 1.6x → 2.2x → 3.0x) and retries.

## 🧪 Testing

Tests use Node's built-in `node:test` runner — **56 tests, all passing**.

- `test/keypool.test.mjs` — key states, classification, failover rotation
- `test/orchestrator.test.mjs` — pipeline construction, cost calculation, step readiness
- `test/failover.test.mjs` — error classification, cooldown recovery, failover chains
- `test/logic.test.mjs` — skin report parsing, URL extraction, concern weights

```bash
npm test
```

## 🚀 Run it

```bash
npm ci
npm test    # 56 tests
npm run dev # localhost:5190
```

**Production build:**
```bash
npm run build
npx serve dist
```

**Deploy** (`.github/workflows/pages.yml`): test → build → GitHub Pages. No API keys in the repo.

## 📚 Docs

- [`docs/PRD.md`](docs/PRD.md) — product requirements & judging-criteria map

## 🏆 Built for

**YouCam API Skin AI & Apparel VTO Hackathon** · 17 YouCam features · 4 pre-built pipelines · MIT licensed
