# Artifact Quality Epic — Working Plan

**Status:** planned — open questions decided (see Decisions); nothing implemented
**Date:** 2026-08-04
**Extends:** [wms-presentation-quality-incident.md](wms-presentation-quality-incident.md) (incident + triage addendum, adopted slices 2A–2D)
**Inputs:** THEME.md spec-quality review and model/platform analysis (2026-08-04 session)

## Framing (do not re-litigate)

- BUG-003 (closed by !47) gates the _corruption_ class; this epic is the adjacent
  _quality/grounding_ class. A structurally valid deck passes the existing gate by design.
  This is not a regression or a reopening.
- The incident is model-agnostic. Kimi was the reproducer, not the definition. Stronger
  models (Fable/Opus) raise **compliance**, not the **contract** — specs and gates must be
  written for the weakest model routed, and strong-model quality treated as a bonus.
- Deterministic-vs-semantic split holds: escapes/placeholders/render-evidence are hard
  gates; notes and zero-visual checks are conditional workflow policies; typography,
  density, and composition judgments belong only in model-evaluated rendered QA.

## Where the quality contract lives today

| Surface                                                                                                    | Coverage                                                                   |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Template Gallery directives (`packages/desktop/src/renderer/components/chat/TemplateGallery/directive.ts`) | Strong contract, but only for template-selected sends                      |
| Per-template THEME.md specs (`packages/desktop/src/process/resources/presentation-templates/*/THEME.md`)   | 12 packs: 4 HTML / 4 PPTX / 4 DOCX; quality varies by family (see Track 0) |
| `skills/presentation-maker/`                                                                               | Opt-in via Skills Hub import — not guaranteed                              |
| Plain-chat PPTX request                                                                                    | **No contract at all** (the 2B gap)                                        |

---

## Track 0 — Spec-layer containment

Pure THEME.md + directive edits. A manifest `version` bump re-syncs each pack to every
user at next launch (`PresentationTemplateService.syncBuiltins`), so this ships user-facing
protection with zero product code. Ships **before** 2A.

| #   | Item                                              | Files                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Fail-closed extraction rule                       | all 8 office THEME.md (workflow step) + pptx/docx directives in `directive.ts` | "If `officecli view <file> text` returns empty or unusable content, STOP and ask the user — never proceed to build." This is the incident's root cause; currently uncovered everywhere. Editing directive first sentences is forbidden — `templatedSendParser` matches the exported prefixes with `startsWith`.                                                                                    |
| 0.2 | Literal `\n` escape check                         | pptx gate 3, docx gates                                                        | The incident's headline mechanical defect; one grep line per spec.                                                                                                                                                                                                                                                                                                                                 |
| 0.3 | Fix false-positive leftover-token greps           | business-review, project-kickoff, connected-ops (monthly-steerco mostly fine)  | Remove generic vocabulary: `warehouse`, `operator shifts` (project-kickoff — a real WMS deck trips this on correct content), `emea`, `nrr`, `cac payback` (business-review — standard QBR vocabulary), `connected sites` (connected-ops). Keep uniquely-sample tokens (`jordan lee`, `northwind`, `meridian`). Soften "any hit is a leftover" → "verify each hit is not reference sample content." |
| 0.4 | Speaker-notes delivery gate                       | 4 pptx specs                                                                   | Workflow step 5 requires notes on every slide; no gate verifies them. Add a notes check to the delivery gates (conditional policy — this workflow declares notes required).                                                                                                                                                                                                                        |
| 0.5 | DOCX gate parity                                  | 4 docx specs                                                                   | Give docx gate 3 executable greps (like pptx) and add reference-sample-token scans; today leftover reference.docx prose is caught only by the visual pass. Drift evidence for 6/2B.                                                                                                                                                                                                                |
| 0.6 | Interim completion evidence                       | all 8 office specs                                                             | One line in the delivery-gates section: the reply must report extracted / validated / rendered / reviewed as distinct statements. Cheap 2D preview.                                                                                                                                                                                                                                                |
| 0.7 | Trim editorial-field-report §8 "Response pattern" | editorial-field-report                                                         | Drifts against the directive, references a possibly-nonexistent `frontend-design SKILL.md`, hardcodes an English default. Shrink to avoid two drifting instruction surfaces.                                                                                                                                                                                                                       |
| 0.8 | HTML QA story decision                            | 4 HTML specs                                                                   | They have zero gates today. Minimum: a self-check list per spec; real fix arrives with 2C. Decide scope here, don't over-build.                                                                                                                                                                                                                                                                    |

Every touched pack: bump manifest `version`; update `index.test.ts` / directive tests.

## Track V — Verification spikes (short; they shape 2A–2C design)

| #   | Spike                        | Question                                                                                                                                                | Why it matters                                                                                                            |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| V.1 | aioncore vision loop         | Do rendered slide screenshots reach the model **as images** on the aionrs path? (ACP/Claude Code reads PNGs natively.)                                  | If not, gate 4 is dead letter for every model on that path; 2C must degrade honestly instead of pretending the audit ran. |
| V.2 | officecli on ACP PATH        | `injectSkills` is deliberately dropped on ACP (`AcpSendBox.tsx:436`); does the in-band `officecli load_skill` path work end-to-end with a Claude model? | Confirms template parity for Claude-family routing.                                                                       |
| V.3 | Queued-send skill drop       | aionrs queued sends drop `injectSkills` (`AionrsSendBox.tsx:436`); does directive-only naming suffice?                                                  | Known commented trade-off — verify, don't assume.                                                                         |
| V.4 | Model × template eval matrix | Same source doc + template across routed models, scored mechanically against the delivery gates.                                                        | Turns "is Fable better here" into data; becomes the regression harness once 2A gates ship.                                |

## 2A — Mechanical containment (product gates)

- Deterministic delivery gate (extend the `OfficeArtifactService` fail-closed pattern):
  block on failed/unverified source extraction, literal escape sequences, unresolved
  placeholders, missing render evidence, or evidence belonging to a different artifact hash.
- Source-facts record: extraction produces a traceable record before build starts;
  slide claims trace back to it.
- Conditional (never unconditional): missing notes fails only when the workflow requires
  notes; zero-visual checks carry slide-type exemptions (covers, dividers, quotes,
  intentionally minimal). "All content slides text-only" is the defect signal, not any
  single text-only slide.

## 2B — Canonical orchestration

- Detect presentation intent in plain chat → route through one shared artifact contract.
  This is the largest remaining exposure; strong models currently mask it.
- Branching: template selected → clone/preserve reference deck; no template → bundled
  default visual system / layout library (**new work**, not integration). "Never build
  from scratch" is only valid when a reference deck is attached.
- Factor the duplicated contract: workflow / delivery-gates / follow-up-edits sections are
  ~60% copy-pasted across the 8 office specs and already drifting (see 0.5). Invariants
  move into the canonical layer; THEME.md slims to visual system + layout catalog + voice
  - unique sample tokens.

## 2C — Visual-quality loop

- Model-evaluated rendered QA: named defect report, bounded repair (the pptx specs'
  gate-4 language — "overflow, overlap, low contrast, margin violations… max 3 cycles" —
  is the seed; reuse it).
- Cost/latency controls: re-render only changed slides on repair passes, cap cycles and
  audit resolution. Matters more with Fable/Opus pricing, not less.
- Capability-aware degradation (from V.1): when the platform cannot feed renders to the
  model, report "visual QA not performed" — never let it be claimed.

## 2D — Completion semantics

- Surface generated / grounded / validated / rendered / reviewed / delivery-ready as
  distinct states in the completion message. Never collapse to "file created successfully."
- Honest degradation messaging when a gate was skipped or impossible (ties to 2C).

---

## Sequencing

```text
Track 0 (spec edits)  ──┐            2B design ──── 2B build
Track V (spikes)      ──┼── 2A ────┤
                        │            2C (needs V.1, V.4)
                        └───────────  2D threads through 2A→2C
```

- Track 0 and Track V run now, in parallel. Track 0 items 0.1–0.3 are one focused MR.
- V.1 must land before 2C design starts.
- 0.6 is interim 2D; the real 2D lands with UI work after 2A states exist.

## Housekeeping

- The incident doc branch `docs/wms-presentation-incident` (@ `9b0e55417`) is unpushed,
  and the current checkout has the doc untracked — land it before epic issues reference it.

## Decisions (2026-08-04)

1. **2A scope: office artifacts only.** HTML artifacts render immediately in the in-app
   preview (defects visible at delivery) and have no officecli pipeline to gate. HTML gets
   the Track 0.8 self-check list; real HTML QA folds into 2C only if usage shows the need.
2. **2B contract: shared module + renderer send-time composition, aioncore backstop later.**
   Renderer composition (the `composePresentationSend` architecture, extended with plain-chat
   intent detection) is the only surface reaching BOTH aionrs and ACP — `preset_context`/
   `preset_rules` flows to aioncore only and cannot touch Claude Code sessions. Contract text
   lives in one common module. Heuristic detection is acceptable because the 2A main-process
   gate (`OfficeArtifactService`) fails closed on missed detections. A slim `preset_rules`
   standing rule is added later so aionrs follow-up turns stay covered without re-detection.
3. **V.4 eval harness: standalone, deterministic, committed.** A script running the gate
   checks (validate, issues, placeholder/`\n` greps, notes presence, render success) against
   produced files; no LLM judge in v1 (2C builds that properly). Borrow Stream B's runner
   structure if convenient, never couple to it. The script doubles as the executable spec
   for the 2A gate implementation.
4. **Default visual system: 13th builtin pack ("WePrompt Default", pptx first).** Reuses all
   pack machinery (sync, versioning, attachment, hardened contract); the no-template branch
   becomes "auto-select the default pack," keeping "never build from scratch" true on both
   branches. Visible in the gallery. Requires a designer-quality neutral reference deck —
   request design work early; a docx default can follow.
