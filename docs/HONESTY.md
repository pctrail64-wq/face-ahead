# FACE AHEAD — Honesty Contract & Evidence Library

## The contract

1. **"AI projection" is printed on every aged face.** The aging model renders a plausible trajectory — it is not a measurement and not a prediction of *your* biology.
2. **GENERATED labels on all demo data.** Without a key, every value is simulated and tagged; nothing is implied to be real.
3. **Citations on every habit.** Each recommendation cites peer-reviewed work with year; confidence is labeled strong / moderate / emerging.
4. **No medical claims.** We give prevention behaviors, not diagnoses or cures. Where evidence is correlational we say so.
5. **Errors are actionable, never raw JSON.** API internals never leak to the user.

## The evidence library (src/lib/compare.ts)

| Habit | Key evidence | Confidence |
|---|---|---|
| Daily SPF 30+ | Flament et al. 2013 — solar exposure and facial signs of aging (J Eur Acad Dermatol) | strong |
| 7–9h sleep | Oyetakin-White et al. 2015 — sleep quality and skin aging (Clin Exp Dermatol) | moderate |
| Don't smoke | Yin et al. 2006 — smoking and facial wrinkles meta-analysis (JAAD) | strong |
| Retinoid routine | Kang et al. 2018 — topical retinoids in photoaging review (Dermatol Ther) | strong |
| Hydration + diet | Palma et al. 2015 — dietary water & skin hydration; Cosgrove et al. 2007 — nutrients & skin aging (AJCN) | moderate |
| Stress + gentle care | Chen & Lyga 2014 — brain-skin connection, stress & inflammation | moderate |

## The behavioral-science backbone (why showing the future works)

- Hershfield et al. — "future-self" interventions: seeing an aged avatar increases long-term saving behavior
- NYU sun-damage photography studies — showing people their UV damage photo increases sunscreen use
- FACE AHEAD applies the same mechanism to skincare: **your own aged face, your own deltas, your own three moves**

## What we deliberately do NOT do

- No fake "with/without SPF" image pairs (the API can't produce them — we don't imply it can)
- No attractiveness scoring, no "you'll look bad" shame framing
- No product sales disguised as analysis
