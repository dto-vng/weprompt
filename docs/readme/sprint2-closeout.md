# Sprint 2 Closeout

- **Code-freeze date:** 2026-08-09
- **Accepted WePrompt tip:** `origin/sprint2@296733b0e`
- **Release status:** implementation frozen; packaging and external-backend acceptance remain separate

## Executive outcome

Sprint 2 closes with the core implementation and bug-fix wave integrated. The product is materially
more reliable when users create projects, manage context, generate Office artifacts, inspect agent
activity, and recover from failures. The sprint also delivered the Creative Studio v1 foundation,
but kept it behind its feature flag and moved its remaining product work to Sprint 3.

This is a **code closeout, not a release declaration**. BUG-040 still blocks trustworthy native
packaging evidence, and the AionCore half of Kimi's local token totals is awaiting upstream review.

## User value delivered

- **Artifact creation:** fail-closed Office source extraction, deterministic readiness checks,
  rendered-QA and bounded-repair foundations, safer scratch cleanup, and default-path containment
  for broken literal escapes and false-positive reference tokens.
- **Templates:** built-in PPTX/DOCX template inventory and handoff are integrated; Vietnamese
  template-creation intent now works without broad false positives.
- **Projects and context:** new projects open Project Home for setup; project removal has safe,
  actionable recovery; context controls remain visible and Context.md survives compaction failure.
- **Chat journal and status:** internal execution noise is collapsed into technical details, missing
  thinking subjects receive a truthful fallback, and provider failures retain useful distinctions.
- **Context visibility:** the composer and Project Context now use the same active-conversation
  snapshot and the correct Kimi model window, eliminating conflicting percentages.
- **Creative Studio:** the v1 core and Review workflow are integrated with stronger render lifecycle,
  accessibility, localization, and test reliability. User activation remains a later decision.

## Closeout review

### WePrompt MR !103 — context display consistency

**Verdict:** accepted and merged; no P0-P2 findings.

| Dimension       | Assessment                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Security        | No new IPC, file access, persistence authority, or user-controlled code path.                                                       |
| Correctness     | One conversation-keyed snapshot feeds both surfaces; stale cleanup is identity-guarded; Kimi K2.5, K2.6, and K3 limits are covered. |
| Performance     | `useSyncExternalStore` uses bounded per-conversation listeners and removes the entry on final unsubscribe/unmount.                  |
| Maintainability | Percentage formatting is centralized and the behavior is pinned by focused renderer tests without new locale text.                  |

Evidence: source `af2c48773`, merged as `296733b0e`; full WePrompt gate passed **8,120 tests**, with
19 skipped. A macOS smoke showed the composer and Project Context percentages agree.

### AionCore PR #808 — AionRS provider usage propagation

**Verdict:** code review passes with no P0-P2 finding; external acceptance remains open.

| Dimension       | Assessment                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | Adds only optional non-negative token counters to an existing finish event; no credential or prompt content is exposed.                                                                   |
| Correctness     | Converts cumulative engine totals to per-turn deltas, initializes from resumed-session totals, uses checked subtraction, and conservatively re-baselines after failed or cancelled turns. |
| Performance     | Adds one small asynchronous mutex-protected watermark update per terminal turn; no hot streaming path changes.                                                                            |
| Maintainability | Optional serialized fields preserve older consumers; runtime, relay, resume, reset, and regression behavior have focused coverage.                                                        |

Evidence: [iOfficeAI/AionCore #808](https://github.com/iOfficeAI/AionCore/pull/808), source
`2a9a02e27`, exactly one commit ahead of current upstream `main` at review time. The mandatory
AionCore gate passed **8,366 tests**, with 24 skipped. The PR is open and mergeable, but upstream has
not approved it and GitHub has not reported CI checks.

## Explicit carryover

| Workstream                  | Closeout state                                    | Next admission gate                                                                                                |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| BUG-040 packaging integrity | Open release blocker                              | Real signed AionCore artifacts, independently verified provenance, and genuine packaged lineage-recovery evidence. |
| BUG-015 local token totals  | WePrompt display merged; AionCore #808 open       | Upstream merge/release or an explicit decision to own a fork pin, followed by bundled Kimi acceptance.             |
| EPIC-002 template creation  | A0+ merged; unsafe unified implementation retired | Run create → review → hash-bound confirm → gallery live smokes on both AionRS and ACP.                             |
| EPIC-003 reasoning controls | Planning gate only                                | Prove the narrow runtime capability gap before implementation.                                                     |
| Outlook and FDL connectors  | Seeded, not accepted                              | Packaged login, permission, reconnect, and supported-flow evidence.                                                |
| BUG-017 SQLite access loss  | Needs reproduction                                | Reproduce before designing recovery machinery.                                                                     |

SSO and the platform/CI ownership transfer are owner-gated outside Sprint 2. Controlled Excel
changes and the remaining Creative Studio product work are deferred to Sprint 3.

## Exit gate

| Gate                              | Result                                           | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EG1 — closeout and exact baseline | **Pass, pending closeout integration**           | The frozen implementation baseline is `origin/sprint2@296733b0e` through `!103`. `TASKS.md` distinguishes merged code from package, external-backend, and release acceptance. This closeout branch contains documentation only and must still be integrated into `sprint2`.                                                                                                                                                                |
| EG2 — BUG-040 quarantine          | **Pass for quarantine; release remains blocked** | Every distributable build reaches `prepareAioncore`, which requires an accepted `migration-lineage.json`. The current upstream `v0.1.50` archive lacks it, while the Actions path is pinned to an unresolvable source commit, so both paths fail closed before packaging. This is not signed-artifact or packaged-recovery acceptance.                                                                                                     |
| EG3 — engineering baseline        | **Pass for source acceptance**                   | On the closeout tree: 621 test files passed and 1 skipped; 8,120 tests passed and 19 skipped. TypeScript, Oxfmt, Oxlint, generated i18n types, and the i18n validator passed. Oxlint reported 1,223 existing warnings and zero errors; i18n reported 16 missing Creative Studio plural variants in each of zh-CN, ja-JP, zh-TW, and ko-KR but exited successfully. Native packages, signing, clean install, and upgrade were not executed. |
| EG4 — backlog re-charter          | **Pass**                                         | Open work is explicitly carried forward with an admission gate. Creative Studio remains feature-flagged; SSO is owner-gated; desktop packaging, AionCore #808, connector acceptance, and provider reasoning controls are not represented as shipped.                                                                                                                                                                                       |
| EG5 — clean handoff baseline      | **Pass with preserved local residue**            | The tracked branch is clean apart from these closeout docs. Untracked `.agents/` (local skill mirrors), `.claude/e2e-locale-audit.raw.md` (raw audit evidence), and `dashboard.html` (generated local report) were classified and preserved, not committed or deleted. Create the Sprint 3 branch from the integrated closeout tip, not from this pre-integration branch.                                                                  |

### Exit decision

Sprint 2 is **closed for implementation and source acceptance**. It is **not released or packaged-accepted**.
The release train stays stopped at BUG-040 and the native acceptance matrix; the Kimi local-token-total
outcome additionally waits on AionCore #808 or an explicit owned-fork decision.

## Freeze rule

No new feature or bug-fix slice should target Sprint 2 after this checkpoint. Reopen the branch only
for an explicitly approved release blocker, integration correction, or closeout-document correction.
Every reopened change must update `TASKS.md`, run the full repository gate, and record whether the
result is code acceptance, packaged acceptance, or release acceptance.

## Release handoff

Before calling Sprint 2 shipped:

1. Close BUG-040 with independently verifiable native artifacts and real packaged recovery evidence.
2. Resolve AionCore PR #808 or adopt an explicit, owned fork pin; then repeat the local-token smoke
   against the exact bundled binary.
3. Run the agreed clean-install and upgrade matrix for macOS ARM, macOS Intel, and Windows.
4. Record the final signed artifact identities, checksums, package results, and any intentionally
   disabled feature flags in the release note.
