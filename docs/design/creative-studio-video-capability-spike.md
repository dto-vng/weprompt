# Creative Studio — video capability spike

**Status:** proposed spike (rev 3) · **Date:** 2026-08-06 · **Not a sprint-2 commitment**
**Blocks:** the Review editor phase · **Does not block:** EPIC-005 (see §5)

## 1. The question

The product decision is that a finished Creative Studio project produces a **playable video file** — not an assembly-ready package for another editor. Studio therefore needs crop, trim, concat, filter and encode. None of that capability exists in this application.

This spike answers **how**, and produces knowledge rather than shipped code. It is deliberately not an implementation plan: one of its outputs is a legal answer that can invalidate the leading candidate entirely. **(rev 3) That answer has since landed and ffmpeg survives it — see §3.1.**

## 2. What is already known

Measured 2026-08-05, so the spike does not have to rediscover it.

**There is no video processing anywhere.** No ffmpeg in `package.json`, none in `packages/desktop/src`. This is a missing capability layer, not a feature gap.

**The renderer can already decode and frame-capture Studio video.** Tested against a real paid OpenRouter render (`bytedance/seedance-2.0-fast`, 1280×720, 5.085s) through the live app:

- the file loaded from `weprompt-studio://asset/<project>/<asset>` into a `<video>` element
- it seeked and drew to a `<canvas>`
- `canvas.toDataURL('image/png')` returned **883,030 bytes with no `SecurityError`**

The canvas is **not tainted** by the privileged custom scheme. This is the finding that decoupled poster frames from this spike (§5).

**Byte access is asymmetric.** The scheme is registered `{ standard: true, secure: true, stream: true, supportFetchAPI: false, corsEnabled: false }`. `<video>`/`<img>` streaming works; `fetch()` does not. A WebCodecs pipeline therefore needs either `supportFetchAPI: true` — a deliberate widening of a surface that security review exists to guard — or byte transfer over IPC. **Any WebCodecs benchmark must use whichever access path it would really ship with**, or the numbers are meaningless.

**Bundling a native binary is a paved road.** The app already ships a per-platform binary with full supporting machinery: `prepare-aioncore.js`, `aioncore-checksums.js`, `aioncore-trust.js`, `verify-bundled-aioncore-resources.js` — staging, checksums, trust verification, and package completeness verification. A second bundled binary is a new consumer of existing infrastructure, not new infrastructure. **But the road has potholes:** BUG-014 exists because the packaged app reads the wrong resource path and ships no templates at all.

**Electron is 37.10.3**, so WebCodecs `VideoEncoder`/`VideoDecoder` are available.

## 3. What the spike must produce

### 3.1 A licensing answer — the binary gate

Can we ship an ffmpeg build that is LGPL-only, carries the decoders and encoders the verb set needs, and excludes GPL-only filters? And what is the codec-patent posture for a commercially distributed product?

This is a legal and product question, not an engineering one, and it is likely the long pole. **If the answer is no, ffmpeg is dead and WebCodecs becomes the path by default** — which is why no implementation work should start before it lands.

**(rev 3, researched 2026-08-06) Answered: the gate is green.** ffmpeg is not vetoed. A shippable configuration exists, and the two residual items are legal-desk sign-offs that block neither §3.2 nor §3.3.

"Free to use" splits into two independent questions, and only the first is about ffmpeg. The project charges nothing and refuses to sell a proprietary licence at any price, so there is no commercial-licence line item to budget — but an LGPL build grants **zero** patent rights, which is where the real exposure sits.

**Question 1 — the copyright licence. LGPL is viable, and our verb set is clean.**

ffmpeg is LGPL-2.1-or-later by default; GPL applies only if the build passes `--enable-gpl`, which pulls in `libx264`, `libx265`, `libxvid`, `libdavs2`, `librubberband`, `libvidstab`, `frei0r`, `avisynth`, `libcdio`, `libxavs`, `libxavs2` and roughly 33 niche filters (`boxblur`, `delogo`, `hqdn3d`, `eq`, `cropdetect`, `spp`, `nnedi`, `pullup`, `stereo3d`, `tinterlace`, `smartblur` …).

**Nothing the cut model needs is on that list.** `crop`, `scale`, `overlay`, `concat`, `trim`, `fade`, `atrim`, `amix` and — the one that carries the whole v1 filter set — **`colorchannelmixer`** are all LGPL, so the named typed filter ids in `creative-studio-cut-model-design.md` do not collide with the GPL set.

**That was a near-miss worth recording.** `eq` *is* on the GPL list, and `eq` is the obvious filter for brightness, contrast and saturation — the natural implementation of the v1 set. The cut model escapes it only because §5 of that design expresses all four scalars as a single 4×5 colour matrix applied through `colorchannelmixer`, a decision taken for renderer-neutrality with no licensing consideration in mind. Had the filters been specified individually, the design would have quietly required a GPL build and this gate would have come back red. Do not "simplify" that matrix back into per-filter `eq` calls. `--enable-nonfree` (FDK-AAC, OpenSSL-linked builds) produces a binary that **cannot be redistributed at all** and must never be used; ffmpeg's native AAC encoder is LGPL and covers §3.3's audio criteria.

**The one real trap is H.264 encoding**, because ffmpeg has no LGPL software H.264 encoder:

| Path                                                                                                 | Licence    | Notes                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Hardware — `h264_videotoolbox` (macOS), `h264_nvenc` / `h264_qsv` / `h264_amf` / `h264_mf` (Windows) | LGPL-clean | Preferred. macOS always has VideoToolbox; `h264_mf` is the intended Windows OS fallback — **its universal availability is asserted, not measured; see §3.3** |
| `libopenh264` (Cisco)                                                                                | BSD        | Cisco's royalty coverage attaches only to **their** prebuilt binary fetched at runtime — bundling a source build forfeits it. Lower quality |
| `libx264`                                                                                            | **GPL**    | Would relicense the whole application. Off the table                                                                                        |

**The second trap is prebuilt binaries.** Essentially every convenient public build — BtbN, gyan.dev, the `ffmpeg-static` npm package — is a **GPL** build, because they all bundle x264/x265. We must produce our own LGPL build and feed it through the staging, checksum and trust machinery described in §2.

**Question 2 — patents. Separate from the licence, and $0 at our volume.**

ffmpeg's own legal page warns that once a product monetises patented codecs, the pool holders come for their fees, naming MPEG LA (now **Via LA**) specifically. Via LA's AVC/H.264 rates for encoder/decoder products:

| Units per year                | Fee        |
| ----------------------------- | ---------- |
| First 100,000                 | **$0.00**  |
| 100,001 – 5,000,000           | $0.20 each |
| 5,000,001+                    | $0.10 each |
| Annual enterprise cap (2017+) | $9.75M     |

Two consequences. **At WePrompt's distribution scale the AVC royalty is almost certainly $0** — we are nowhere near 100,000 units per year. **But the free tier is granted to one legal entity per affiliated group**, and VNG is a large group; if another VNG product already claims that allowance, ours may not be free. That is a real question for legal, not a hypothetical.

Timing works in our favour: the AVC pool is winding down, with most essential patents expiring around **2027** across major jurisdictions. So does the hardware path — encoding through VideoToolbox, NVENC or Media Foundation uses an encoder Apple, NVIDIA or Microsoft has already licensed, which is the standard posture for desktop applications and a second reason to prefer it. AAC sits in a separate Via LA pool on the same volume-tiered model, with the same conclusion at our scale. A fully royalty-free stack exists — AV1 plus Opus — but providers return H.264, so choosing it means transcoding every asset rather than stream-copying.

**The configuration this gate approves:**

> An LGPL-only build (no `--enable-gpl`, no `--enable-nonfree`), bundled as a separate executable invoked from main rather than linked, hardware H.264 encode with `h264_mf` as the Windows software fallback, ffmpeg's native LGPL AAC for audio, plus the source-hosting and EULA compliance work below.

Invoking a bundled executable as its own process — which is what §2's binary-bundling road already does for aioncore — also sidesteps the LGPL dynamic-linking requirement entirely, since there is no linking to argue about.

**What LGPL compliance obliges at packaging time.** These become inputs to §3.4's recommendation, not new scope:

- host the **matching ffmpeg source**, a `changes.diff` and our exact configure line on the same server as the binaries
- credit ffmpeg and LGPLv2.1 in the About box and the EULA, and state that we do not own the code
- **remove any prohibition on reverse engineering from the EULA** — this is the clause that silently breaks compliance for most commercial applications, and it must be fixed in every translated EULA
- do not rename or obscure the bundled binaries

**Residual — for the legal desk, not for engineering:**

1. Whether another VNG entity has already claimed the affiliated group's free AVC allowance.
2. Sign-off on the EULA edits above.

Neither blocks §3.2 or §3.3, so the benchmarks can start now.

**This is engineering research, not legal sign-off**, and the framing at the top of this section still holds: the decision belongs to whoever signs. Primary sources, for that review: [ffmpeg.org/legal.html](https://www.ffmpeg.org/legal.html) (compliance checklist and the MPEG LA warning), [FFmpeg `LICENSE.md`](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md) (exact GPL and non-free component lists), [the ffmpeg-kit GPL filter list](https://github.com/arthenica/ffmpeg-kit/wiki/GPL-Licensed-Filters), [Via LA's AVC/H.264 programme](https://www.via-la.com/licensing-programs/avc-h-264/) (rates and thresholds), and the [OpenH264 FAQ](https://www.openh264.org/faq.html) with its [binary licence](https://www.openh264.org/BINARY_LICENSE.txt).

### 3.2 A measured minimal build size

Not an estimate. Build the minimal configuration for the actual verb set and weigh it, per platform. The working figure of 50–80MB per platform is an assumption, and a stripped build may be far smaller. Size matters here because it stacks on top of the aioncore binary already shipping.

### 3.3 A head-to-head against a real cut

Both candidates, same task, real Studio assets — not synthetic clips:

> Concatenate N shots, each with a crop rectangle and one filter applied, and encode to H.264 at the project's aspect ratio and resolution.

Report per candidate: wall-clock time, output quality, peak memory, and behaviour when the UI is active (WebCodecs competes with the interface; ffmpeg in main does not). Include codec breadth — the canvas test proved one H.264 MP4 decodes, which says nothing about the next provider's output.

**(rev 3) Windows encoder availability is a blocking measurement, not a footnote.** §3.1 treats `h264_mf` as an always-present Windows fallback. Verify it on a machine with no discrete GPU and no vendor encoder. If a supported Windows configuration can reach *no* usable LGPL H.264 encoder, the failure mode is not "slower" — it is **no render at all**, which is a product-level gap that changes the recommendation rather than its performance numbers.

**(rev 3) The ffmpeg candidate must be benchmarked on the encoder it would actually ship with** — hardware (`h264_videotoolbox` / `h264_nvenc` / `h264_qsv` / `h264_amf`) with `h264_mf` as the Windows software fallback, per §3.1. Numbers produced with `libx264` describe a build we cannot ship and would make the head-to-head meaningless.

**(rev 2) Audio and A/V sync are acceptance criteria, not extras.** OpenRouter video routes request generated audio, so real Studio clips have audio tracks. The benchmark must cover source-audio trim, concatenation and muxing, and assert A/V sync on the output — otherwise the render contract ships with audio unowned, which the landing plan's decision to keep audio makes unacceptable.

### 3.4 A recommendation with packaging consequences stated

Including which lane the work lands in, what the after-pack gate must assert, and how a missing or mismatched binary fails.

## 4. Explicitly not decided here

- **The edit-decision data model.** Crop rectangles, filter parameters, clip order and in/out points must be stored as non-destructive project metadata regardless of who renders. This model is required by every candidate, so it can be specced and built **in parallel with the spike** — it is not gated on the outcome.
- The Review editor UX.
- The Brief and Write phases.

Each gets its own spec.

## 5. Why this is out of sprint 2, and what still ships there

**The poster-frame requirement does not need this spike.** EPIC-005 blocks its activation MR on video posters, because OpenRouter returns no poster and a paid render currently reads as "Video poster unavailable". The §2 canvas result shows the renderer can produce that frame today with no binary, no packaging change and no licensing answer. The poster fix therefore stays with the Creative Suite activation/acceptance lane. **(Updated 2026-08-05: Creative Studio no longer lands in sprint 2 — see the landing plan's RETARGETED banner. Earlier wording here said the poster fix 'ships in sprint 2'.)**

> An earlier argument for bundling ffmpeg was that it would fix posters "for free". That argument is withdrawn: posters do not need ffmpeg, and using them to justify a packaging change was reasoning backwards.

**The capability itself must stay out of sprint 2**, on the project's own rules:

- `TASKS.md` requires packaging, installer and release changes to use their own explicitly approved lane and to never be swept into an ordinary feature merge. Bundling a binary is squarely a packaging change.
- **Both live packaging bugs are in that lane** — BUG-013 (P0, packaged upgrades fail against existing data) and BUG-014 (P1, no built-in templates ship). Adding a second bundled binary with new checksum, trust and after-pack gates while that lane is being stabilised would confound diagnosis of the exact defects being fixed.
- P2 foundations may land hidden only when they do not delay stabilisation, and a stabilisation freeze follows the final release slice.

## 6. Suggested shape

A time box is the user's call. As a starting point: §3.2 and §3.3 are roughly a week of engineering. **(rev 3)** §3.1 no longer runs in parallel — it is answered, and only its two legal-desk residuals remain on someone else's clock. The spike is done when a written recommendation exists with the licensing answer attached — not when the benchmarks finish.

**Decision criteria, in priority order:** licensing viability first (a veto), then output correctness across the codecs providers actually return, then performance under an active UI, then installed size. **(rev 3) The veto has fired green**, so the remaining criteria now decide the outcome on their own.

**(rev 2) A non-licensing argument for ffmpeg-in-main.** The renderer-side video seam (`creative-studio-cut-model-design.md` §5.2) depends on `requestVideoFrameCallback`, which is compositor-gated — a hidden or backgrounded window stalls it, a hazard already observed in this codebase with `requestAnimationFrame`. A final render must survive a backgrounded window, so a renderer-hosted WebCodecs pipeline carries a liveness risk that ffmpeg-in-main does not. **Verify this explicitly** rather than trusting the analogy; if backgrounded WebCodecs does keep running, this argument disappears.

## 7. Open

- ~~Whether the Review editor's non-destructive model should be specced now~~ — **decided and done**: see `creative-studio-cut-model-design.md`. It is required by both candidates and is independent of this spike's outcome.
- Whether a bundled ffmpeg, once it exists, should also serve non-Studio needs — which would change its owning seam from Studio to shared.
