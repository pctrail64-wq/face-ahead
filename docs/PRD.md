# FACE AHEAD — Product Requirements

## Vision
Meet the face you're building. A private, in-browser skin AI lab: one selfie becomes a skin diagnostic, an ageing projection, and a virtual try-on — all served by the YouCam API with no backend.

## 1. Core Promise
Upload a selfie → scan your skin today → age to 50 → scan again → see the habit impact. No login, no server, no secrets leaving the browser.

## 2. Non-Goals
- Real-time AR (no WebRTC streaming)
- Video input (still photos only)
- Offline mode (requires YouCam API)
- User accounts (everything is device-local)

## 3. Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **State**: Zustand (single store at `store/app.ts`)
- **Routing**: React Router HashRouter (GitHub Pages compatible)
- **Build**: Vite static build → `dist/`
- **Deploy**: GitHub Actions → GitHub Pages

### API Layer (`src/api/`)
- `client.ts` — HTTP transport, rate limiting, diagnostics publishing
- `keypool.ts` — per-key health states, failover logic
- `features.ts` — feature registry (verified YouCam paths)
- `orchestrator.ts` — DAG pipeline runner

### Key Decisions
1. **Zero-backend**: YouCam serves CORS headers allowing direct browser calls. No proxy or Lambda needed.
2. **Multi-key pool**: Keys stored in localStorage. Users add 5-10 keys; the pool auto-rotates on failure.
3. **Diagnostics Bus**: Every raw HTTP request/response is published to a pub/sub bus before error classification. Nothing is lost to a "friendly error" wrapper.
4. **S3 PUT is mandatory**: The File API returns a presigned URL; you MUST PUT the image bytes, or task calls return 500/404.
5. **Errors are free**: YouCam only charges units on successful tasks. Retry ladders cost nothing.
6. **Polling uses the same key**: A running task is tied to the key that created it — never abandon a task or it can expire as InvalidTaskId while still charging.

## 4. Diagnostics Bus
Every request, regardless of which layer produced it, is published unfiltered:
- Method, URL, request body (truncated)
- HTTP status code
- Response headers and body (truncated)
- Duration, key display (masked), network error (if any)

The UI subscribes via `useStore.diagnostics` and renders live on `/diagnostics`. Max 500 events in memory.

## 5. Key Pool Health Model

| State | Meaning | Auto-transition |
|-------|---------|-----------------|
| `unverified` | Newly added, never used | → `ready` on first success |
| `ready` | Available for requests | → `cooling` on 429 |
| `cooling` | Rate-limited, waiting | → `ready` after cooldown |
| `exhausted` | Out of units (1,000/key) | No auto-transition |
| `invalid` | Bad key or missing scope | No auto-transition |

### Failover Rules
- **401 / InvalidApiKey / InvalidAccessToken** → mark `invalid`, try next key
- **CreditInsufficiency** → mark `exhausted`, try next key
- **429** → mark `cooling` (45s default), try next key
- **5xx** → retry same key with exponential backoff
- **4xx with error_code** → surface immediately, do NOT rotate keys

## 6. Pipeline (DAG Runner)

A Pipeline is a directed acyclic graph of Steps. The runner:
1. Uploads each source image ONCE (dedup by slot)
2. Runs independent steps concurrently (bounded to 3)
3. Chains dependent steps via `dst_id` (no re-upload, no re-charge)
4. Streams per-step status to the UI
5. Never lets one failed step kill the whole run

### Framing Recovery
YouCam's most common failure is `error_face_position_too_small` — the face is a small part of a phone photo. The runner auto-crop ladder: full → 1.6x → 2.2x → 3.0x zoom, retrying each framing error. Verified live.

### Pre-built Pipelines
| Pipeline | Steps | Cost |
|----------|-------|------|
| timeMachine | scan → age → forecast → tone | ~9u |
| styleMatch | tone → fitz → try-on | ~8u |
| deepScan | enhance → scan → face-analysis | ~25u |
| glowUp | hairstyle → teeth → portrait | ~12u |

## 7. Screens

| Route | Purpose |
|-------|---------|
| `/` | Home — hero flows, feature gallery, key status |
| `/run` | Capture/upload, pipeline runner, live progress |
| `/results` | Scan results, ageing timeline, comparison |
| `/history` | Saved journeys, revisit, delete |
| `/settings` | Key pool management, theme toggle |
| `/diagnostics` | Raw HTTP log from the Diagnostics Bus |
| `/mask-editor` | Paint a mask for object removal |

## 8. Error Taxonomy

| YouCam Code | User Message | Pool Action |
|-------------|-------------|-------------|
| `CreditInsufficiency` | Key out of units | mark exhausted |
| `InvalidApiKey` | Bad key | mark invalid |
| `InvalidAccessToken` | No task scope | mark invalid (auth-only) |
| `error_src_face_too_small` | Move closer | auto-crop + retry |
| `error_face_position_too_small` | Fill the frame more | auto-crop + retry |
| `error_face_position_invalid` | Face not centered | recrop + retry |
| `error_face_not_forward_facing` | Look straight | retry prompt |
| `error_face_angle_upward` | Chin down | retry prompt |
| `error_face_angle_downward` | Chin up | retry prompt |
| `exceed_max_filesize` | Image too large | client-side resize |
| `error_no_face_detected` | No face found | retry prompt |
| `error_multiple_faces` | Multiple faces | retry prompt |
| `error_nsfw_content_detected` | Content filtered | retry prompt |
| `429` | Rate limited | mark cooling |
| `5xx` | Server error | retry w/ backoff |

## 9. Data Persistence

| Store | Key | Content |
|-------|-----|---------|
| Key pool | `face-ahead-keys-v1` | Array of PoolKey objects |
| Journeys | `face-ahead-journeys-v1` | Array of JourneyEntry objects |
| Current session | sessionStorage | In-progress pipeline images |

Keys and journeys are device-scoped. Clearing localStorage wipes everything.

## 10. Testing

Tests use Node's built-in `node:test` runner against `test/*.test.mjs`.
- `keypool.test.mjs` — key states, classification, failover
- `orchestrator.test.mjs` — pipeline construction, cost calculation
- `failover.test.mjs` — rotation behavior, cooldown recovery
- `logic.test.mjs` — skin parsing, URL extraction, concern weights

Run with: `npm test`

## 11. Privacy

- API keys never leave the browser (sent only to YouCam in Authorization headers)
- No analytics, no tracking pixels
- No third-party scripts
- All processing happens server-side at YouCam; the browser is the only client
