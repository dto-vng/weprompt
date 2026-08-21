# Sprint 4 Stream B — EPIC-002 Creation Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove — or disprove — that the merged in-chat template-creation path works for a real user, on both backends and in both supported languages, and close EPIC-002 Epic A on the evidence.

**Architecture:** Nothing is built by default. A0+/1–3 are merged (`!87`, `!90`, `!94`), plus atomic install (`!84`) and Vietnamese intent matching (`!99`), totalling ~1,795 insertions. The only open gate is that the path has never been executed end to end. This plan is a scripted walkthrough with recorded evidence, followed by fix-or-close. Every task writes its result down whether it passes or fails — a failed smoke is the point of running one.

**Tech Stack:** Electron dev build, aioncore 0.1.53 on PATH, Bun 1.3.14, Vitest 4, Chrome DevTools Protocol for inspection.

**Spec:** `docs/readme/sprint4-plan.md` (Stream B)

---

## What the path is supposed to do

1. The user's message matches a template-creation intent (`directive.ts`, English and Vietnamese —
   accented, unaccented, and decomposed Unicode).
2. WePrompt appends `TEMPLATE_CREATION_DIRECTIVE`, which instructs the assistant to write `THEME.md`
   **inside the conversation workspace** and to append exactly one marker as the standalone final line,
   **outside any Markdown fence**:
   `<!-- AIONUI_TEMPLATE_REVIEW_V1 {"file_path":"<absolute path>"} -->`
3. `templatedSendParser.ts` parses that marker fence-aware and renders a review card in chat.
4. One click installs through the atomic path; the main process re-reads and re-hashes the file, and
   refuses if the content changed since the digest was minted.
5. The template appears in the Template Gallery.

### Failure modes to watch for specifically

These are the seams unit tests cannot reach. Record which one you hit rather than "it didn't work":

| Symptom                              | Likely cause                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| No card, assistant sounds successful | Marker emitted **inside** a fence — the parser is fence-aware by design (`templatedSendParser.ts:70`) |
| No card, marker visible in the text  | Non-empty content after the marker line (`:73`), or the line does not end with `' -->'` (`:75`)       |
| Card appears, install fails          | `THEME.md` written outside the conversation workspace — containment rejects it                        |
| Card appears, no file                | Assistant emitted the marker without writing the file                                                 |
| Intent not detected                  | Phrasing outside the intent patterns — record the exact phrasing, it is a product finding             |

## Preconditions

- Dev running from a checkout on `sprint4`, with a backend new enough for the DB:
  `PATH="/Users/lap16603/Projects/WePrompt/resources/bundled-aioncore/darwin-arm64:$PATH" bun run dev`
- Only **two** Electron slots exist on this machine and the packaged app does not take a dev one.
  Check before launching, and never kill another session's app without asking:
  `lsof -nP -iTCP -sTCP:LISTEN | grep -E ":(923[0-9]|517[0-9])"`
- A keyed provider. The `~/.aionui-dev` profile carries Moonshot and OpenRouter, both enabled.
- Both backends reachable: **aionrs** (Aion CLI) and **ACP** (OpenCode is the only installed ACP agent;
  verified 2026-08-17 as `installed: true`, `opencode acp`).
- Gallery root in dev: `~/Library/Application Support/Forge-Dev/presentation-templates`
  (`bridge.ts:81` — `app.getPath('userData')/presentation-templates`).

---

## Task 1: Record the environment and the starting gallery state

**Files:**

- Create: `docs/design/sprint4-epic002-smoke-results.md`

- [ ] **Step 1: Confirm no other dev instance owns the slot**

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ":(923[0-9]|517[0-9])" || echo "no dev instance listening"
```

Expected: either nothing, or only the instance you intend to use. `/Applications/WePrompt.app` may be
running — it uses `~/.aionui` and does not conflict.

- [ ] **Step 2: Launch dev and capture the boot facts**

```bash
cd /Users/lap16603/Projects/WePrompt/.worktrees/sprint4
PATH="/Users/lap16603/Projects/WePrompt/resources/bundled-aioncore/darwin-arm64:$PATH" bun run dev > /tmp/sprint4-dev.log 2>&1 &
sleep 25
grep -E "AIONCORE_LISTENING|Remote debugging port|Renderer did-finish-load" /tmp/sprint4-dev.log
```

Expected: an `AIONCORE_LISTENING` port, a CDP port, and `Renderer did-finish-load`. Record all three.
Read the CDP port from the log — do not assume 9230; it is claimed by whichever app booted first.

- [ ] **Step 3: Record the pre-run gallery contents**

```bash
ls -1 "$HOME/Library/Application Support/Forge-Dev/presentation-templates" 2>/dev/null | sort > /tmp/gallery-before.txt
wc -l < /tmp/gallery-before.txt
```

Expected: a baseline count. Every later install claim is measured against this file, so that "it
appeared" cannot be confused with "it was already there".

- [ ] **Step 4: Create the results document with the environment recorded**

Create `docs/design/sprint4-epic002-smoke-results.md` with: date, branch and head commit, aioncore
version (`./resources/bundled-aioncore/darwin-arm64/aioncore --version`), the three boot facts, the
baseline gallery count, and an empty results table with one row per case (aionrs/English,
aionrs/Vietnamese, ACP/English, ACP/Vietnamese, hash-binding).

- [ ] **Step 5: Commit**

```bash
git add docs/design/sprint4-epic002-smoke-results.md
git commit -m "docs(epic002): open the creation smoke record"
```

**Expected:** an evidence file that exists before any result is claimed.

---

## Task 2: Walk the path on aionrs in English

**Files:**

- Modify: `docs/design/sprint4-epic002-smoke-results.md`

- [ ] **Step 1: Start a new chat on the aionrs runtime**

In the app: new chat, assistant backed by **Aion CLI** (aionrs), model `kimi-k2.6`.

- [ ] **Step 2: Send a message that matches the English intent**

Send verbatim:

```
Create a reusable template from this look: a clean report style with a navy and cream palette, serif headings, and generous whitespace.
```

This matches `/\b(?:create|make|build|generate|draft)\s+…(?:template|theme)\b/i`.

- [ ] **Step 3: Verify the directive was actually appended**

```bash
grep -c "Template creation instructions:" /tmp/sprint4-dev.log
```

Expected: at least 1. **Zero means intent detection did not fire** — record the exact phrasing you
sent as a product finding and stop this case; the rest of the path cannot be under test.

- [ ] **Step 4: Observe the assistant's turn and the card**

Wait for the turn to finish. Record: did a **review card** render in chat, and did the assistant's
prose explain what it created and that confirming installs it?

If no card rendered, work the failure-mode table above before concluding. Reading the raw message text
is the fastest discriminator — the marker is either absent, fenced, or followed by content.

- [ ] **Step 5: Confirm the file exists where containment requires**

```bash
grep -o 'AIONUI_TEMPLATE_REVIEW_V1 {[^}]*}' /tmp/sprint4-dev.log | tail -1
```

Take the `file_path` from the marker and confirm it exists and sits inside the conversation workspace:

```bash
ls -l "<file_path from the marker>"
```

Expected: the file exists. A marker for a file that does not exist is a real defect — record it.

- [ ] **Step 6: Confirm the install, and that it is a new entry**

Click the card's confirm action. Then:

```bash
ls -1 "$HOME/Library/Application Support/Forge-Dev/presentation-templates" | sort > /tmp/gallery-after-en.txt
diff /tmp/gallery-before.txt /tmp/gallery-after-en.txt
```

Expected: exactly one added directory. Open the Template Gallery in the app and confirm the new
template is listed and selectable. Confirm no leftover temp directory is listed (atomic install
excludes them).

- [ ] **Step 7: Record the result**

Fill the aionrs/English row: pass or fail, what you observed, the marker payload, the added gallery
entry, and any failure-mode match. Record the result **even if it passed** — the absence of evidence is
what this stream exists to fix.

- [ ] **Step 8: Commit**

```bash
git add docs/design/sprint4-epic002-smoke-results.md
git commit -m "docs(epic002): record the aionrs English creation smoke"
```

---

## Task 3: Walk the path on aionrs in Vietnamese

**Files:**

- Modify: `docs/design/sprint4-epic002-smoke-results.md`

- [ ] **Step 1: Send the accented Vietnamese phrasing in a new chat**

```
Tạo cho tôi một mẫu báo cáo dùng lại được, phối màu xanh navy và kem, tiêu đề serif.
```

Matches the `(?:tạo|làm|dựng)\s+…(?:template|theme|mẫu)` pattern under `/iu`.

- [ ] **Step 2: Verify the directive fired**

```bash
grep -c "Template creation instructions:" /tmp/sprint4-dev.log
```

Expected: the count increased by at least 1 versus Task 2.

- [ ] **Step 3: Repeat the card, file, and install checks**

Run Task 2's Steps 4–6 unchanged, writing to `/tmp/gallery-after-vi.txt` and diffing against
`/tmp/gallery-after-en.txt`.

Expected: exactly one added directory. Also confirm the card's copy renders in the active UI language
rather than falling back to a raw key.

- [ ] **Step 4: Send the unaccented variant in another new chat**

```
Tao cho toi mot template bao cao dung lai duoc.
```

Expected: the directive fires again — this is the branch BUG-041 added, and it has unit coverage but no
live evidence.

- [ ] **Step 5: Check the deliberate non-trigger**

In a new chat, send:

```
mau nay dep
```

Expected: **no** directive and **no** card. BUG-041 deliberately left bare ambiguous `mau` alone. A
card here is a false positive and a regression.

- [ ] **Step 6: Record and commit**

```bash
git add docs/design/sprint4-epic002-smoke-results.md
git commit -m "docs(epic002): record the aionrs Vietnamese creation smoke"
```

---

## Task 4: Walk the path on the ACP backend

Send-time composition differs per backend, which is the whole reason this case exists separately.

**Files:**

- Modify: `docs/design/sprint4-epic002-smoke-results.md`

- [ ] **Step 1: Confirm the ACP agent is installed and reachable**

```bash
PATH="$HOME/.opencode/bin:$PATH" which opencode && opencode --version
```

Expected: a version. If `opencode` is missing, no ACP agent is installed and this task is **blocked** —
record it as blocked rather than skipped, and say so in the sprint review.

- [ ] **Step 2: Start a chat on OpenCode and run the English case**

Repeat Task 2 Steps 2–6 with an OpenCode-backed assistant, writing to `/tmp/gallery-after-acp.txt`.

- [ ] **Step 3: Run the Vietnamese case on the same backend**

Repeat Task 3 Step 1 on OpenCode.

- [ ] **Step 4: Record both rows and commit**

```bash
git add docs/design/sprint4-epic002-smoke-results.md
git commit -m "docs(epic002): record the ACP creation smoke"
```

**Expected:** either both backends behave identically, or a named difference in the composition path.

---

## Task 5: Prove the hash binding actually bites

This is the security property A0+ kept when it dropped the proposal store: a `THEME.md` is injected
into future model prompts, so a file swapped between review and click is a prompt-injection vector.

**Files:**

- Modify: `docs/design/sprint4-epic002-smoke-results.md`

- [ ] **Step 1: Produce a fresh card without confirming it**

Run Task 2 Steps 1–5 again in a new chat. Stop at the card. Do **not** click confirm.

- [ ] **Step 2: Modify the file between review and click**

```bash
printf '\n<!-- tampered %s -->\n' "$(date -u +%FT%TZ)" >> "<file_path from the marker>"
shasum -a 256 "<file_path from the marker>"
```

- [ ] **Step 3: Click confirm and observe the refusal**

Expected: the card reports the candidate changed — the `CANDIDATE_CHANGED` copy from
`messages.templateReview.failure.CANDIDATE_CHANGED` (`TemplateMessageCard.tsx:28`), rendered as
translated text, **not** a raw i18n key. Nothing is installed.

- [ ] **Step 4: Prove nothing was installed**

```bash
ls -1 "$HOME/Library/Application Support/Forge-Dev/presentation-templates" | sort > /tmp/gallery-after-tamper.txt
diff /tmp/gallery-after-acp.txt /tmp/gallery-after-tamper.txt && echo "NO CHANGE — correct"
```

Expected: no difference. An installed template here is a **P1 security finding**, not a polish item —
stop and file it immediately.

- [ ] **Step 5: Record and commit**

```bash
git add docs/design/sprint4-epic002-smoke-results.md
git commit -m "docs(epic002): record the hash-binding refusal evidence"
```

---

## Task 6: Triage the findings

**Files:**

- Modify: `docs/design/sprint4-epic002-smoke-results.md`
- Modify: `TASKS.md`

- [ ] **Step 1: Classify every failure**

For each failing row, record: the failure-mode match, whether it is a product defect or a model-behaviour
issue (the assistant not following the directive is a **prompt** problem, not a parser bug), severity,
and whether it blocks Epic A.

- [ ] **Step 2: File what you found**

Add a numbered entry to `TASKS.md` for each product defect, with actual/expected and the evidence link.
Do not fold multiple defects into one entry.

- [ ] **Step 3: Commit**

```bash
git add docs/design/sprint4-epic002-smoke-results.md TASKS.md
git commit -m "docs(epic002): triage the creation smoke findings"
```

---

## Task 7: Fix defects, or close Epic A

**Files:** determined by Task 6. Do not pre-guess them.

- [ ] **Step 1: For each product defect, write the failing test first**

Put the test where its subject lives — parser defects in `tests/unit/renderer/.../templatedSendParser.test.ts`,
card defects in `messageTextTemplateReview.dom.test.tsx`, install/containment defects in
`PresentationTemplateService.test.ts`. Prove it fails against current code before fixing.

- [ ] **Step 2: Fix minimally and re-run the focused test**

```bash
bunx vitest run <the test file>
```

Expected: PASS, with no assertion loosened to accommodate the bug.

- [ ] **Step 3: Re-run the affected live case**

A unit test does not close a defect this stream found by observation. Re-walk the specific case and
record it.

- [ ] **Step 4: Run the whole gate before pushing**

```bash
bunx tsc --noEmit
bun run lint -- --quiet
bunx oxfmt --check
node scripts/check-i18n.js
bun run test
```

Expected: all green. Durations inflate several-fold under concurrent sessions — a slow run is not a
failing run.

- [ ] **Step 5: Close or hold Epic A in `TASKS.md`**

If every case passed (or every defect is fixed and re-walked), mark **EPIC-002 Epic A done**, linking
the smoke record. Epic B and Epic C entry criteria are unchanged and remain unscheduled. If anything
is still failing, say plainly that Epic A remains **Active** and why — do not close it on partial
evidence.

- [ ] **Step 6: Commit**

```bash
git add -A
git diff --cached --check
git commit -m "docs(epic002): close Epic A on live creation evidence"
```

---

## Verification checklist

- [ ] All five cases have a recorded outcome: aionrs/English, aionrs/Vietnamese, ACP/English,
      ACP/Vietnamese, hash-binding. Blocked is a valid outcome; silent omission is not.
- [ ] Every install claim is backed by a `diff` against the prior gallery listing, not by eyeballing the
      Gallery.
- [ ] The unaccented Vietnamese variant fired, and bare `mau nay dep` did **not**.
- [ ] The tamper case refused with translated copy and installed nothing.
- [ ] Every defect found has its own `TASKS.md` entry and a test that failed before the fix.
- [ ] Epic A is closed only if every case passed or was fixed and re-walked.

## Preserved assets — do not reopen

`TASKS.md` marks two artifacts do-not-reopen, and both exist **only on this machine**, unpushed: the
retired Store V2 foundation (`2f883cee531d5334250870f4bbe66b6bf472adc2`) and the blocked Epic C
candidate (`a1754a13e01c886458db6c1385fa88e6b0719823`). Nothing in this plan touches them. If Epic B or
C is ever chartered and either is wanted, push it to a remote first — a disk failure loses both.
