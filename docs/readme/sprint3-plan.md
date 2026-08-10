# Sprint 3 Plan

- **Drafted:** 2026-08-10
- **Proposed window:** 2026-08-11 → 2026-08-22 (two weeks — confirm)
- **Baseline:** `sprint3` @ `05abda690` (Sprint 2 tip `dc7460883` + three ported commits)
- **Status:** draft for review

## Sprint goal

**Make the delivery chain real, then prove it with a packaged build.**

Sprint 2 closed with working code and an unusable release path: a provenance pin naming a
commit that existed nowhere, packaged acceptance that never ran, and zero automated
verification. Sprint 3's job is to turn "merged" into "shipped" for a reduced platform
matrix, and to leave behind a chain where every link is independently checkable.

Success looks like: a signed macOS ARM and Windows build, installed from scratch and
upgraded from a Sprint 2 database, whose backend binary can be traced to a reviewed commit
by someone who was not in the room.

### Non-goals

- **Creative Studio** — steered separately by the product owner; not in this plan, not in
  this sprint's capacity, and `CREATIVE_STUDIO_ENABLED` stays off.
- macOS Intel packaging — explicitly deferred as an approved reduced matrix.
- SSO, EPIC-004 Excel, and the data connectors — unchanged admission gates, no Sprint 3 work.
- BUG-017 SQLite access loss — still needs a reproduction before any design.

## Platform and ownership decisions already made

| Decision                   | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Development and CI home    | **GitHub (model A)** — GitHub is primary; GitLab receives a mirror |
| WePrompt repository        | `github.com/khoapnt-vng/WePrompt`                                  |
| AionCore repository        | `github.com/khoapnt-vng/aioncore`                                  |
| Platform matrix            | **macOS ARM + Windows**; Intel deferred                            |
| AionCore build and signing | **khoapnt**                                                        |
| EPIC-003 delivery          | **khoapnt**, after this plan is shared                             |
| GitLab CI                  | None — the only instance runner is stale (last contact 11 months)  |

### Standing risk, accepted knowingly

Neither `khoapnt-vng` nor `dto-aiprojects-vng` is a GitHub **organization**; both are personal
accounts. Primary source of truth, CI, and signing therefore sit on individual accounts — the
same exposure Sprint 2 filed as P1 against `minhtq1234/Forge-Aion`, now widened. This is
accepted for Sprint 3, not resolved. **Owner action: file the VNG GitHub org request in week 1
so it is not still open at Sprint 4 planning.**

---

## Track 0 — Unblock (must land before anything else)

Every other track depends on these. **T0.2 is decided**; T0.1 and T0.3 remain open, and T0.3 is
the one with real schedule risk.

### T0.1 Publish the corrected baseline

- [ ] Push `dc7460883` to `khoapnt-vng/WePrompt:sprint2` (verified fast-forward; GitHub's
      `4c523888` is an ancestor).
- [ ] Push `sprint3` @ `05abda690` and make it the working branch.
- [ ] The `build/win-oauth-fix-*` branches are **internal demo builds**, deliberately cut from
      the older `4c523888` snapshot; they are not release candidates and need no rebase. Treat
      them as throwaway. Their useful commit (`658ed0335`) is already ported to `sprint3` as
      `515d0b963`, with two defects fixed — see T0.3 and the port notes.
- [ ] **Release builds come from `sprint3` only.** Because the demo branches are 126 commits
      behind, demo feedback is against pre-freeze code: triage it against `sprint2` before
      filing, or already-fixed issues will be re-reported as new.
- [ ] Configure the GitLab mirror direction and record the cutover point, so `TASKS.md`'s
      `!1`–`!103` evidence links stay readable alongside future GitHub PR numbers.

### T0.2 Release line — **DECIDED 2026-08-10**

**The Sprint 3 AionCore release line is `d4d8e87714690cdb230ab7a6987de3ceacbea275`**, the
target of tag `v0.1.51`. It resolves identically on `code.vng.vn/dto/aioncore` and
`github.com/khoapnt-vng/aioncore`, and it is the release whose cross-verified checksums the
desktop build already pins. `ACCEPTED_AIONCORE_SOURCE_COMMIT` is aligned with it as of
`515d0b963`; no further change is required.

Candidates not chosen, and why it matters that they were considered:

| Candidate  | What it is                | Disposition                                                                                         |
| ---------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `fbe0ac6b` | `fix/mcp-oauth-discovery` | **Not the release line**, despite the decision record designating it. Same tree bar Cargo metadata. |
| `9b418ea3` | target of tag `v0.1.52`   | Newer. Forgone deliberately — see below.                                                            |

Two consequences that must be written into the backend decision record:

- [ ] **The record's designated branch is wrong.** It names `fix/mcp-oauth-discovery` as the
      release line and instructs that this branch be protected. The chosen commit is not on
      that branch's tip lineage — it is the `v0.1.51` tag on `security/pilot-hardening-d01-d06`.
      Restate the branch policy against the line actually being shipped.
- [ ] **The release line is a tag, not a branch head.** `security/pilot-hardening-d01-d06` has
      already advanced past it on GitHub. Pinning an immutable tag is the safer choice, but it
      means "merge accepted changes back into the release line" no longer describes reality:
      future work lands on a branch and is cut as a _new_ tag, which then becomes a new pin.
- [ ] Correct the record's Sprint 2 backend table: BUG-013 has **no recoverable AionCore
      commit**. The `260dbbc05…` value is fabricated and absent from all three hosts.

**Deliberately forgone by this choice:** `v0.1.52` is `v0.1.51` plus exactly two commits —
`b2c329d fix(mcp): send stored OAuth token on MCP connection test` and a version bump. Pinning
`v0.1.51` therefore gives up one MCP OAuth connection-test fix in exchange for staying on the
release whose checksums are already cross-verified. Revisit at the next tag, not mid-sprint.

### T0.3 Local-auth transport for header-less consumers — **design required, P0**

The pinned fork accepts only `Authorization: Bearer`, the `aionui-session` cookie, and — for
WebSocket upgrades only — `Sec-WebSocket-Protocol`. It has **no query-parameter auth path**.
WePrompt's `withLocalTokenQuery` therefore fails against it at four sites:

| Call site                   | Purpose                   | Viable fix                       |
| --------------------------- | ------------------------- | -------------------------------- |
| `SpeechStreamClient.ts:115` | STT WebSocket             | Pass token as subprotocol        |
| `httpBridge.ts:146`         | main `/ws` WebSocket      | Pass token as subprotocol        |
| `WeixinConfigForm.tsx:258`  | EventSource, WeChat login | Cookie, or backend accepts query |
| `platform.ts:61`            | media / `<img src>` URLs  | Cookie, or backend accepts query |

- [ ] Decide the transport for the two header-less cases: issue the `aionui-session` cookie to
      the Electron session, or add a query-parameter path to the fork's extractor.
- [ ] Implement the two WebSocket cases via subprotocol.
- [ ] Cover all four with tests that fail against the pre-fix transport.

**This is a release blocker, not a follow-up.** A packaged build from today's branch ships
broken media, WeChat login, and speech streaming — in exactly the installer this sprint exists
to produce.

---

## Track 1 — Provenance and artifact chain

The half of delivery hardening that needs no new infrastructure. This is the direct answer to
BUG-040.

### T1.1 Define the artifact contract

- [ ] A release artifact must carry: the native binary, the exact source commit,
      `migration-lineage.json`, required managed resources, SHA-256 checksums, and signing or
      provenance evidence.
- [ ] Record the contract in `docs/design/` before changing WePrompt's backend resolver.
- [ ] Confirm the build archives `migration-lineage.json` **alongside** the binary. Upstream's
      release workflow archives the binary only, which is why default packaging fails closed.

### T1.2 Bind the pin to a verifiable source

- [ ] Replace any pin that cannot be resolved on the publishing host.
- [ ] **Required control:** after every build, assert the built SHA resolves on the
      source-of-truth host before the artifact is accepted.

  ```bash
  git ls-remote https://github.com/khoapnt-vng/aioncore.git | grep -q "$BUILT_SHA"
  ```

  This single check is what BUG-040 would have failed. Make it a required release step.

- [ ] No test fixture may act as the authority for a provenance value. A reviewer obtains the
      commit, digest, and signing evidence independently from the published build.

### T1.3 Re-verify what `!79` claimed but never proved

The fabricated pin removed the presumption of accuracy from that MR's other claims. Three were
independently confirmed defective and remain open:

- [ ] No test injects a real lineage failure and proves the rejection → preservation → quit
      chain. The quit path is real; the behavioural proof is not. Write it.
- [ ] The packaged recovery test installs a prebuilt failure object, skips AionCore startup
      entirely, and is excluded from `bun run test`. Make it real: seed a database, exercise
      lineage preflight, prove preservation.
- [ ] Native CI acceptance as written cannot pass, because it consumes an archive that lacks
      `migration-lineage.json`. Fix or retire the claim.

### T1.4 Close BUG-040

- [ ] Close only with a real signed artifact, independently verified provenance, and genuine
      packaged recovery evidence. Until then BUG-013 stays **partially hollow**: runtime
      rejection real, packaged end-to-end acceptance not.

---

## Track 2 — Backend ports (khoapnt + core)

Port by **contract and tests**, never by raw commit transfer. Both original commits were
developed against a different AionCore history.

### T2.1 BUG-013 — migration-lineage fail-closed

- [ ] Port the behaviour onto the chosen release line. There is no source commit to cherry-pick.
- [ ] The chosen baseline already carries migrations `001…027` — **exactly** the lineage
      WePrompt's accepted `migration-lineage.json` matches, and which Sprint 2 verified three
      independent ways. The lineage contract needs no change; inherit the verified provenance.
- [ ] Failing regression test first, focused green evidence, independent exact-head review.

### T2.2 BUG-015 — provider token usage

- [ ] Port the contract from `2a9a02e27` (real, on the GitHub contributor fork via PR #808).
- [ ] Acceptance: a bundled Kimi turn records non-zero local usage, survives reload, and does
      not double-count a replayed finish event.
- [ ] Until that runs against the exact bundled binary, do not claim the local-token-total half
      is shipped.

---

## Track 3 — CI on GitHub Actions

Model A makes this cheap: hosted `macos-14`/`macos-15` (ARM) and `windows-latest` runners exist
today, which is why the GitLab runner problem stopped mattering.

### T3.1 Pull-request pipeline — Linux only

- [ ] `tsc --noEmit`, oxlint, oxfmt, `bun run i18n:types`, `node scripts/check-i18n.js`, and the
      full Vitest suite, on `ubuntu-latest`, on every PR.
- [ ] Baseline to hold: **621 files / 8,120 tests, 19 skipped**, currently green on `sprint3`.

### T3.2 Quarantine the two known flakes on day one

- [ ] `jobManager.test.ts` — the capped-backoff and thirty-minute-deadline tests (BUG-027).
- [ ] `TeamSiderSection.dom.test.tsx` — the teardown that exits 1 after a green run (BUG-030).
- [ ] Each quarantined with a retry and a tracking link, so **a red pipeline always means
      something new**. Without this, the first fortnight of unattributable reds teaches everyone
      to ignore the gate.
- [ ] CI then becomes the reproduction harness both bugs needed and never got locally. Triage
      them from real samples rather than hunting reproductions by hand.

### T3.3 Matrix jobs — concurrency, not cost

Both repositories are **public**, so standard hosted runners — including macOS ARM and
Windows — are free with no minute billing. The 10×/2× private-repo multipliers do not apply
and no paid plan or self-hosted runner is required.

- [ ] Budget against **concurrency** instead: the free tier allows a limited number of
      simultaneous jobs, with macOS the tightest. A wide matrix on every PR will queue.
- [ ] Run the macOS/Windows matrix on release branches and tags; keep per-PR to Linux. This is
      now a latency choice, not a cost one, so relax it if queueing is not a problem in practice.
- [ ] Do not use larger runners — those are billed even on public repositories.

---

## Track 4 — Packaged acceptance (macOS ARM + Windows)

The proof that the sprint goal was met. Runs against the installed application and the bundled
binary, not source tests.

- [ ] Clean installation and first launch.
- [ ] Upgrade from the last accepted Sprint 2 database.
- [ ] Incompatible or malformed lineage fails closed **without mutating user data**.
- [ ] Authenticated local API and WebSocket startup — covers T0.3's four call sites.
- [ ] Provider streaming and token-usage telemetry.
- [ ] MCP OAuth discovery and Dynamic Client Registration.
- [ ] Retry and recovery after backend startup failure.
- [ ] Binary, checksum, signature, and lineage verification.
- [ ] Record artifact identities, checksums, source commit, and lineage fingerprint in the
      release note. Note macOS Intel as deliberately unaccepted.

---

## Track 5 — EPIC-003 reasoning controls (khoapnt)

Capability-driven provider/model reasoning controls. Delivered by khoapnt; this plan is the
handoff artifact.

### Entry gate

- [ ] Track 0 closed and Track 2 merged. No reasoning slice is admitted before the backend line
      and the pin are settled.

### T5.1 Re-charter — the previous gate is dead

- [ ] **DR-3 no longer applies.** It planned a bump to upstream `v0.1.62` to extend lineage
      27 → 37 for ten migrations including `project_bind`, `user_scope`, and
      `conversation_fork`. **None of those exist on the chosen baseline** — verified by grep of
      the `.sql` and `.rs` trees. Do not start against the old gate.
- [ ] Re-charter against migrations `001…027` plus the epic's own prepared `038`/`039`, or
      accept an explicit, costed upstream-merge burden.

### T5.2 Carry forward what still holds

- [ ] **DR-2 stands:** contract discovery rides the startup boundary as a success-path
      `capabilities.reasoning` stage; absent ⇒ `unsupported`; one source for both floors.
- [ ] **DR-1 changes:** pins are slice outputs recorded via `ACCEPTED_AIONCORE_SOURCE_COMMIT`,
      now against the GitHub release line rather than upstream.
- [ ] Existing evidence is tracked: the capability matrix and model-selector contract in
      `docs/design/` and `docs/prds/` (`!89`), and the backend decision record.
- [ ] The 31-task / 406-step / 157-RED-assertion plans are gitignored under
      `docs/superpowers/plans/`. **Publish them to a tracked location before handoff** — they
      cannot be shared from there, and Sprint 2 lost three separate documents this way.

### T5.3 Scope rule

- [ ] Capability-based and provider-agnostic. Do not hard-code Kimi, GreenNode, or Sol-style
      effort labels into the shared contract.

---

## Operating rules

- Branch from the exact accepted head; record base and head commits in every acceptance report.
- One bounded change per PR. A shared-contract PR may precede its consumers; unrelated fixes
  never share one.
- Failing test first for changed behaviour; focused green evidence; full suite before merge.
- Changed user-facing text uses i18n keys in all 12 configured locales, then `bun run i18n:types`
  and `node scripts/check-i18n.js`.
- **Every agent-introduced SHA, run ID, digest, or checksum is verified out-of-band at review
  time.** A sandboxed agent asked for a real-world anchor will produce a plausible fabrication,
  and self-referential tests will green it. This rule exists because that happened.
- Do not test migrations or recovery against real user data. Use synthetic or disposable copies.

## Definition of done — backend-dependent items

```text
WePrompt PR
  -> AionCore PR
  -> accepted release-line commit
  -> passing CI
  -> signed native artifact
  -> independently verified checksum and provenance
  -> exact WePrompt backend pin
  -> packaged end-to-end acceptance
```

A merged PR, a pushed branch, or a green source-only run satisfies only part of this chain.

## Risks

| Risk                                                  | Likelihood | Control                                                    |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| T0.3 auth design slips and blocks packaging           | High       | Decide in week 1; it gates Track 4 entirely                |
| Personal-account ownership of source, CI, and signing | Certain    | Accepted for Sprint 3; org request filed week 1            |
| Matrix jobs queue behind free-tier concurrency limits | Low        | Public repos bill no minutes; keep per-PR to Linux         |
| A newer AionCore tag invites a mid-sprint re-pin      | Low        | Line fixed at `v0.1.51`/`d4d8e877`; re-pin at tags only    |
| Quarantined flakes quietly become permanent           | Medium     | Each carries a tracking link; review at sprint end         |
| EPIC-003 starts against the dead DR-3 gate            | Medium     | T5.1 is an explicit entry condition                        |
| Owner-gated items stall the sprint, as in Sprint 2    | Medium     | Track 3/4 do not block Tracks 1–2; org request is parallel |

## Exit criteria

1. A signed macOS ARM and Windows build exists, from a commit resolvable on the publishing host.
2. Clean install and Sprint 2 upgrade both pass on both platforms.
3. Lineage rejection preserves user data, proven by a test that injects a real failure.
4. All four local-auth call sites authenticate against the bundled binary.
5. BUG-040 is closed with independently verified provenance, or explicitly still open.
6. CI runs the full gate on every PR, and a red pipeline means something new.
7. EPIC-003 is handed off with a re-chartered plan in a tracked location.

Anything not met is carried with a named owner and an admission gate — not folded into a
Done count.
