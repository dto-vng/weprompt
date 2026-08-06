# Creative Studio v1 — A3 live acceptance record

**Date:** 2026-08-06 · **Tree:** `creative-suite-sprint2@d2b2e70ec` (pushed) · **Driven:** live Electron dev app over CDP (port 9230), real providers, real spend
**Plan:** [v1 delivery plan](creative-studio-v1-delivery-plan.md) §0 definition of done

## Verdict: PASS — every clause verified; one honest deviation (storyboard authored, not assistant-generated)

## The run

| Step | Evidence |
| --- | --- |
| Fresh project from a written brief | Project `2a35d2b4_1abb_4835_a101_3f4d0d18d615`, created through the Studio landing's brief flow ("A 10-second teaser for a mountain coffee brand…") |
| Storyboard | **Deviation:** authored manually in Write (Add shot ×2 — image "Sunrise over the terraces", video "The morning pour", 5s each). The assistant-generated storyboard is the Brief-as-conversation feature, which is post-v1; the landing brief flow creates the project but drafts no shots |
| Engine state | `bytedance/seedance-2.0-fast · Video · up to 15s` + `google/gemini-3-pro-image · Image · up to 60s`, both ready |
| Batch review modal | Named both scenes/providers/models, 5 requested video seconds, 16:9 720p, watermark disabled, audio included, timing advisory shown **non-blocking** (10s vs 18s target). Confirmed at 2026-08-06T12:23:23Z |
| Generation | Both jobs Completed through OpenRouter — image well under a minute, video a few minutes queued at the provider. Single takes auto-selected |
| **Render video** (the new capability) | Progress visible (`Rendering video… 38%`) with a working Cancel; completed in ~4s; result playable in Review from the managed store |
| The file itself | `assets/ce6b36c1_87bb_4696_a9bb_c3a99a6d01b9.mp4` + `.render.json` sidecar, 4,297,983 bytes |
| ffprobe | h264 video 1280×720 (720p/16:9 mapping) **10.0547s**; AAC audio **10.0560s** — Δ 1.3ms; container 10.0757s. Duration = 5s held still + ~5s video take, correct order |
| Export `cut.mp4` | **Verified.** The export flow's native macOS directory picker (`creativeStudioBridge.ts:340`) cannot be driven over CDP, so the user picked the folder; the exported directory contains `cut.mp4`, `scene-01-sunrise-over-the-terraces.png`, `scene-02-the-morning-pour.mp4` and `storyboard.json`. Probed: 2 streams, 10.0757s — and `cut.mp4` is **byte-identical to the managed render** (matching SHA-256 `5670b8ea…`), so export delivers the verified artifact, not a re-encode |

## Incidental live confirmations

- The dev app had to be **restarted** for A3 — the running Electron predated A1/A2, so the render IPC did not exist in it. electron-vite dev does not restart main for merged-in changes; check the Electron PID's age before driving new main-process features.
- `Render another` renders with **no** fabricated `· n/a` cost fragment — the Checkpoint 3 fix confirmed in production.
- **B3 evidence, demonstrated live:** the paid-generation modal's only cost language is "Generation uses your selected provider account and may incur provider charges." No monetary figure anywhere in the flow. This is the honest-cost gap the activation blocker exists to close.
- `FFMPEG_PATH` was set explicitly at app launch; the render used the system ffmpeg 8.1.2.

## Spend

One `gemini-3-pro-image` image + one 5s `seedance-2.0-fast` clip via OpenRouter — the minimum the DoD permits.
