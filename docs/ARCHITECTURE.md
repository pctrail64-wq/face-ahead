# FACE AHEAD — Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser (Vite + React SPA, static hosting, zero backend)  │
│                                                            │
│  App.tsx ── journey state machine (landing→scanning→journey)│
│    │                                                       │
│    ├── lib/pipeline.ts   6-stage orchestration + live trace│
│    ├── lib/youcam.ts     YouCam v2 client (4 endpoints)    │
│    ├── lib/aging.ts      aging frames (16, 12→70)          │
│    ├── lib/compare.ts    delta engine + habit library      │
│    ├── lib/share.ts      share-card assembly               │
│    ├── lib/demo.ts       GENERATED demo data               │
│    └── lib/store.ts      localStorage journey log          │
│            │                                              │
│            ▼                                              │
│  YouCam API (yce-api-01.makeupar.com, CORS *)              │
│   POST /s2s/v2.0/file/{slug} → presigned PUT → file_id     │
│   POST /s2s/v2.0/task/{slug} → task_id → poll GET          │
└────────────────────────────────────────────────────────────┘
```

## Key design decisions

1. **Static-only** (GitHub Pages): the key is injected at build time from an encrypted repo secret (`VITE_YOUCAM_KEY`). The app detects the key (`hasKey()`) and runs demo mode without it. (Inherent trade-off of static hosting: the key is present in the served bundle — standard for hackathon static apps.)

2. **One upload, three tasks**: `scanPrepared` uploads each crop once and fans out skin/tone/fitzpatrick tasks in parallel against the same `file_id` — minimizes PUT traffic and avoids concurrent-upload aborts.

3. **Crop-candidate fallback**: `CROP_CANDIDATES` (0.7@0.4 → 0.85@0.4 → 0.7@0.55 → 0.9@0.45) at 1024². Errors are free (units charge only on success), so retrying costs nothing. Angle errors break early (no crop fixes them).

4. **Fail-closed schema gates**: `parseSkinOutput` requires ≥5 metrics; `parseAgingFrames` requires ≥3 frames. Incomplete data → retry another crop → honest error. Never fake results.

5. **Graceful degradation**: if tone/Fitzpatrick fail but skin succeeds, the report renders with warnings. If skin fails on all crops, the journey fails with an actionable message.

6. **Variance/verify**: the Verify button re-scans the future frame and reports the ± spread for the biggest-drop metric — the "measurement honesty" layer (TOLERANCE-inspired).

## Data flow (journey)

```
prepareImages(file) → 4 × 1024² JPEG blobs (EXIF-aware)
runAging(blob[i])    → 16 AgeFrames (retry crops until success)
scanPrepared(blobs)  → today: skin(14) + tone + fitzpatrick
scanSourceImage(url) → future: download aged frame → prepare → scanPrepared
buildComparison      → 14 deltas, trends, biggest drop, ranked
rankHabits           → top 3 habits matched to YOUR worst metrics
buildShareCard       → shareable card (image + headline + lines + footer)
saveJourney          → localStorage (id, at, today, future, frames, comparison)
```

## Cost model

| Stage | Units |
|---|---|
| aging | 2 |
| today (skin 16 + tone 20 + fitz 10) | 46 |
| future (skin) | 16 |
| **journey** | **64** |
| verify (extra future scan) | 16 |
| scan-at-age (extra future scan) | 16 |

Errors, polls, and previews are free. Demo mode costs 0.
