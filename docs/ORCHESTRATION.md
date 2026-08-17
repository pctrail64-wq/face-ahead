# FACE AHEAD — Orchestration Engine

Patterns borrowed from winning-agent-harness repos (e.g. affaan-m/ecc): deterministic stage pipelines, parallel lanes, structured-output validation at every gate, and fail-closed behavior — adapted to a browser SPA orchestrating 4 YouCam APIs.

## The 6 stages

```
prep     prepare photo        decode (EXIF) · 4 crop candidates @ 1024²
aging    age your face        YouCam aging · 16 frames · 12→70 · 2u
today    scan today           14 concerns + tone + Fitzpatrick (parallel on 1 upload) · 46u
future   scan future          14 concerns on the aged frame · 16u
compare  compare              deltas ▲/▼/= · biggest drops · habit ranking
compose  assemble             report · habits · share card · journey log
```

Every stage is rendered live in the scanning UI (`Pipeline` class + `JOURNEY_DEFS`), showing status, detail, and units — orchestration visibility as a feature.

## Gates (fail-closed)

| Gate | Rule | On failure |
|---|---|---|
| Crop geometry | window must stay inside image | clamp (pure `cropRect`) |
| Upload | PUT must return 2xx | retry ×3 with backoff |
| Skin schema | ≥5 metrics with ui_scores | try next crop → honest error |
| Aging schema | ≥3 frames with res_age + url | try next crop → honest error |
| Tone/Fitz | optional lane | warning banner, journey continues |
| Credits | CreditInsufficiency | explicit message, demo still works |

## Why this design

- **Errors are free**: YouCam charges units only on successful tasks, so the retry ladder (4 crops × cheap failed attempts) costs nothing and dramatically raises success rate.
- **One upload, three tasks**: skin/tone/fitzpatrick tasks run in parallel against a single `file_id` — fewer PUTs, no concurrent-upload aborts, faster journeys.
- **Honesty by construction**: schema validation means the UI can never render a partial/garbage result as if it were real. Demo data is structurally identical but tagged `provider:'demo'` and labeled GENERATED.
