# FACE AHEAD — Product Requirements & Judging-Criteria Map

**Deadline:** Aug 17, 2026 · 11:45 AM EDT · YouCam API Skin AI & Apparel VTO Hackathon

---

## 1. Vision

**FACE AHEAD is the prevention mirror.** Every beauty app reports the present; FACE AHEAD shows users the face they are building and gives them the evidence-backed habits that change it. It combines the two things the market lacks: a *personal, emotional* look at your future (your own aged face, not a stock photo) and an *honest* skin report (error bars, citations, no fake promises).

## 2. Target user

- Adults 18–45 who care about skincare but get lost in product noise
- People who "know they should wear SPF" but don't — the intervention audience
- Judges who want **Impact**: prevention is the highest-leverage skin story

## 3. Core journey

| Step | What happens | Units |
|---|---|---|
| Upload | front-facing selfie; EXIF-aware decode; 4 crop candidates @ 1024² | 0 |
| Age it | YouCam `aging` → 16 frames of YOUR face (12→70) | 2 |
| Scan today | `skin-analysis` 14 concerns + `skin-tone-analysis` + `fitzpatrick` (parallel, one upload) | 46 |
| Scan future | `skin-analysis` on the age-50 frame | 16 |
| Compare | deltas ▲/▼/=, biggest drops, habit ranking vs YOUR drops | 0 |
| Share/Log | share card; journey saved locally; re-take in 90 days | 0 |

**Journey ≈ 64u.** Demo mode (no key) runs the identical flow with GENERATED data.

## 4. Feature list (v1)

1. Age slider 12→70 on the real aged face (drag + badge)
2. Today → Future 14-metric comparison with trend chips
3. Verify button — re-scan for a ± error bar (honesty)
4. Scan-at-age button — re-scan report at any slider age (16u)
5. Top-3 habit cards with citations + confidence labels
6. Share card modal (Web Share / clipboard)
7. Journey log (localStorage) + "re-take in 90 days" loop
8. Pipeline trace UI during scanning (orchestration visibility)
9. Dark/light mode, mobile-first glass UI
10. Demo mode with explicit GENERATED labels

## 5. Judging-criteria map (how this product satisfies it 100%)

### Technological Implementation
- ✅ 4 YouCam Skin/Fashion APIs: aging, skin-analysis (×2 faces), skin-tone-analysis, fitzpatrick-scale-analyzer
- ✅ Non-trivial orchestration: 6-stage deterministic pipeline, parallel task lanes sharing one upload, crop-candidate fallback, fail-closed schema gates, live pipeline trace in the UI
- ✅ Clear consumer value: prevention tool with a shareable, actionable output
- ✅ Genuine effort: 31 unit tests, live-API E2E, documented API contract, honest error handling

### Design
- ✅ Complete product: landing → journey → report → habits → share → progress log (not a PoC)
- ✅ Coherent Apple-style glass design system, dark/light, mobile-first, consistent copy voice
- ✅ Product loop: share + re-take-in-90-days drives return use

### Potential Impact
- ✅ Credible, specific problem: photoaging is ~80% UV-driven (Flament et al. 2013) — a preventable, measurable problem
- ✅ Real audience: anyone building long-term skin health
- ✅ Demonstrated mechanism: the future-self intervention is validated behavioral research (Hershfield et al.; NYU sun-damage studies) — showing people their aged self changes behavior
- ✅ Demonstrated in-app: user sees their own aged face + their own deltas + 3 specific moves

### Quality of the Idea
- ✅ Creative, non-obvious: the aging endpoint is almost unused in the competition; combining **personal aged face + honest skin report + evidence-based habit plan** exists nowhere in the 122-project gallery
- ✅ Genuine problem-space understanding: the honesty contract, error bars, citations, and "AI projection, not medical prediction" labeling show we understand both the tech and its limits

## 6. Honesty contract (non-negotiables)

1. Aged images always labeled "AI projection" — never presented as measured fact
2. Demo data always labeled GENERATED
3. Every habit card carries a citation + confidence level (strong/moderate)
4. No medical claims — prevention framing only, "correlational evidence" where applicable
5. Errors are shown as actionable messages, never raw API JSON

## 7. Out of scope (v1)

- Realtime video aging, gender swap, hairstyle aging
- Accounts/cloud sync (localStorage only)
- Product purchase links (v2: connect habits → products)
