# Knowledge-base retrieval evaluation

Measures how well the per-project knowledge base actually retrieves. Every retrieval knob in that
feature — chunk size, overlap, candidates per list, RRF `k`, top-k, the payload cap — was set by
judgement. This harness is how "did that change help?" stops being an opinion.

It runs the **shipping** retrieval path: `chunkMarkdown` → `buildBm25Index` → optional embeddings →
`loadStore` → `searchKnowledge`. Nothing about ranking is reimplemented here. If a number moves, the
product moved.

## Running it

```bash
bun run eval:kb
```

Hybrid if an embedding model is reachable, BM25-only otherwise — and it says loudly which one you
got, because a BM25-only report mistaken for a full one is worse than no report.

```bash
bun run eval:kb -- --bm25-only          # deterministic, offline
bun run eval:kb -- --overlap=0          # sweep a knob
bun run eval:kb -- --topk=3
bun run eval:kb -- --chunk=1600
bun run eval:kb -- --json=/tmp/run.json # full per-question detail for diffing
bun run eval:kb -- --update-baseline    # re-record baseline.json
bun run eval:kb -- --help
```

Exit code is non-zero when the run regresses against `baseline.json`. A run at non-default knobs is
treated as an experiment and skips the comparison rather than failing it.

### Embeddings

Config is resolved in this order:

1. `KB_EVAL_EMBED_BASE_URL`, `KB_EVAL_EMBED_API_KEY`, `KB_EVAL_EMBED_MODEL` — all three, explicit,
   works headless.
2. The running dev app's `GET /api/providers`, run through the same `pickEmbeddingModel` →
   `resolveEmbedConfigForModel` the ingestion service uses, so you measure the model a real ingest
   would have picked. Override the port with `AIONUI_BACKEND_PORT`.
3. Neither — BM25-only, with the reason printed.

Vectors are cached by content hash in `tests/eval/.cache/` (already gitignored) and keyed by model,
so sweeping a knob does not re-embed the corpus or the queries. Delete the directory to force a
re-embed.

## What is measured

Two levels, because they fail differently:

| Metric      | Question it answers                                                              |
| ----------- | -------------------------------------------------------------------------------- |
| `recall@k`  | Was the expected **file** in the top k? What a citation needs.                   |
| `MRR`       | Reciprocal rank of the first hit from the expected file.                         |
| `answer@k`  | Did some returned passage actually **contain the answer**? What the model needs. |
| `answerMRR` | Reciprocal rank of the first passage holding the answer.                         |

`answerMRR` is the sensitive one. Chunking and overlap move the answer between passages of the same
file without changing which file wins, so `recall@k` and `MRR` sit still while `answerMRR` moves.

BM25-only and hybrid are reported **separately**. The semantic half is optional at runtime, and a
change that helps one can hurt the other.

Unanswerable questions are excluded from every average — the recall of an empty expected set is
undefined, and folding them in would reward over-retrieval. They get their own section.

### Read `recall@6` with care

The fixture is 11 documents / 19 passages, so top-6 is still roughly a third of the corpus. `recall@1`,
`MRR` and `answerMRR` carry the signal; `recall@6` saturates cheaply. Grow the corpus before reading
much into it.

## Knobs this harness cannot sweep

`chunkChars`, `overlapChars` and `topK` are real parameters of the shipping API, so they sweep.

`candidatesPerList` (30, in `common/knowledge/searchCore.ts`) and the RRF `k` (60, in
`common/knowledge/rrf.ts`) are compile-time constants. Exposing them would mean editing the
retrieval code this harness measures — the instrument and the measured thing must not change in the
same commit. Each needs a one-line change to become an optional parameter with its current value as
the default; that belongs in a tuning change, not here.

At this corpus size neither would show anything anyway: 30 candidates already exceeds the whole
19-passage corpus, so there is no truncation to observe. Grow the corpus first.

## The fixture

`fixture/corpus/` — 10 synthetic back-office documents: Vietnamese and English policy memos, an
invoice register, a meeting summary, a nested-heading runbook, an incident postmortem, a service
catalogue. **All synthetic.** Never commit real VNG documents here; author in the same register
instead.

`fixture/corpus-ocr/` — documents whose text is a **model transcription of a scanned PDF**, the
output of the OCR path in `common/knowledge/pdfOcr.ts`. Both roots load into one flat corpus; file
names must be unique across them, because the source id comes from the name.

Two roots rather than an eleventh file in `corpus/`, for two reasons. `corpus/` is at the project's
ten-children ceiling. And the two are different kinds of text that must not be edited into the same
register: `corpus/` says "author in the same register as a real memo", while a transcription has to
keep the shape the model actually produces, or an OCR-derived case measures authored markdown wearing
a scan's file name. Concretely, `renderPagesAsMarkdown` wraps every page in a `## Page N` marker, so a
transcribed document has page markers where an authored one has sections — and when the model emits
the document title as `#`, as it does here, that `#` pops the page marker off the heading stack and
the passage's `headingPath` loses the page number entirely.

`scan-phu-luc-hop-dong-ve-sinh.md` is a three-page Vietnamese service-contract appendix: letterhead,
signature block, two markdown tables the model rebuilt from ruled lines. Synthetic, same rule as
above — real scans stay out of the repo, and so do the PDFs themselves. A scan is megabytes and its
transcription is kilobytes; the transcription is the part retrieval ever sees, so it is the part
worth committing.

`quy-dinh-bao-mat-thong-tin.md` is stored **NFD** (decomposed diacritics) on disk. This is not
decoration: an NFD tokenisation bug found during the knowledge-base build shattered Vietnamese words
at every combining mark and silently destroyed recall, and only a Vietnamese fixture in both forms
catches that class. Without the tokenizer's NFC step that one file yields 1117 fragments instead of
673 tokens, and a query for `mật khẩu` matches nothing. The regression test asserts both that a
document is still stored NFD and that its tokens still collapse without normalisation, so replacing
it with ASCII content fails loudly rather than quietly removing the coverage.

`fixture/questions.json` — 27 golden questions. Beyond plain keyword hits, the hard cases are:

| Kind                       | What it probes                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `semantic-only`            | Question sharing no discriminative words with the answer. There is no stemmer, so "decide" does not match "decision". BM25 cannot win; embeddings must. |
| `cross-language`           | English question, Vietnamese answer. BM25 scores zero across languages. This is the case that justifies a multilingual embedding model.                 |
| `chunk-boundary`           | Answer straddles a chunk boundary; only the 400-char overlap puts the query's keywords and the answer in one passage.                                   |
| `distractor`               | Several files discuss corporate VPN at length and deliberately decline to name the approver. Only one answers.                                          |
| `identifier`               | Exact codes (`INV-2026-0421`, `QUOKKA-7`). BM25 should dominate; there is nothing for an embedding to generalise from.                                  |
| `nfd-corpus` / `nfd-query` | Both normalisation directions.                                                                                                                          |
| `unanswerable`             | The corpus genuinely cannot answer. A harness that never tests this rewards over-retrieval.                                                             |

`kind` says what a case probes; it does not say where the text came from. Provenance is a property of
the document, so the two OCR-derived cases sit in existing kinds on purpose, each paired with an
authored counterpart it can be read against:

| Case                           | kind             | Reads against                                               |
| ------------------------------ | ---------------- | ----------------------------------------------------------- |
| `ocr-cross-lang-response-time` | `cross-language` | `cross-lang-vpn-signoff` — same bridge, without distractors |
| `ocr-id-transcribed-table-row` | `identifier`     | `id-po-vendor` — same in-table lookup, authored table       |

The pairing is the point. An OCR case measured on its own tells you a number; measured against its
authored twin it tells you whether transcription costs anything.

## Adding a case

1. Add or extend a document in `fixture/corpus/` — synthetic, in the same register. Keep the
   directory at 10 files or fewer. A transcription of a scan goes in `fixture/corpus-ocr/` instead,
   keeping the shape `renderPagesAsMarkdown` produces; do not tidy it into authored prose.
2. Add an entry to `fixture/questions.json`:
   ```jsonc
   {
     "id": "kebab-case-unique",
     "kind": "keyword-vn", // see harness/types.ts for the list
     "question": "…",
     "queryForm": "NFD", // optional; decomposes the query at run time
     "expectedSources": ["file.md"], // [] for kind "unanswerable"
     "answerHint": "distinctive substring of the answer",
     "notes": "what this case probes, and why it is hard",
   }
   ```
   `answerHint` is what makes `answer@k` and `answerMRR` work. It is checked, NFC-normalised and
   case-insensitively, against passages from the expected sources. The harness refuses to run if a
   hint is not present in the document it points at — a mistyped hint would otherwise read as a
   retrieval regression forever.
3. Run `bun run eval:kb -- --bm25-only`. Read the per-question detail and confirm the case fails or
   passes for the reason you intended. A case that passes by accident measures nothing.
4. Re-record the baseline: `bun run eval:kb -- --update-baseline`, and say in the commit message why
   the numbers moved.

`notes` is not filler. When a case regresses a year from now, it is the only record of what the case
was for.

## Recorded findings (2026-07-28, BM25-only)

From the first sweep, at 10 documents / 23 scored questions. **Nothing here has been acted on.** The
instrument and the thing it measures must not change in the same commit, so these are recorded for a
separate tuning change.

Read every delta against the resolution of this fixture: 23 scored questions means one question is
worth 0.043. Most differences below are one or two questions wide.

### 1. BM25 alone has a hard ceiling of 0.870 here, and the misses are not random

`recall@3` and `recall@6` are identical at 0.870 in every configuration, because 3 of the 23
questions are unreachable by lexical matching at _any_ k:

- `semantic-delay` — no discriminative word shared with the answer
- `cross-lang-trip-approval` — English question, Vietnamese answer
- `cross-lang-vpn-signoff` — same, with distractor pressure

That is the quantified answer to "does the semantic half earn its cost?": on a bilingual corpus its
value is concentrated almost entirely in **cross-language retrieval**, which BM25 scores at exactly
zero. For a Vietnamese-and-English knowledge base this is not a nice-to-have. Fill in the hybrid
baseline to put a number on the other side.

### 2. Chunk size 3200 is not obviously the best setting — but the fixture cannot call a winner

| chunk             | passages | recall@1  | recall@6  | MRR       | answerMRR |
| ----------------- | -------- | --------- | --------- | --------- | --------- |
| 800               | 95       | 0.870     | 0.870     | 0.870     | 0.786     |
| 1600              | 31       | **0.870** | 0.870     | **0.870** | **0.848** |
| 3200 _(shipping)_ | 17       | 0.826     | 0.870     | 0.848     | 0.826     |
| 6400              | 11       | 0.826     | **0.913** | 0.857     | **0.857** |

1600 leads on file-level metrics and 6400 on answer-level, both by one question. 800 shows the real
trade-off clearly: smaller chunks find the right _file_ more often but return passages too small to
hold the answer, which is exactly what `answerMRR` is for. No retune is justified on this evidence —
grow the fixture first.

### 3. The 400-char overlap does what it was designed to do, and it barely shows

| overlap          | answerMRR |
| ---------------- | --------- |
| 0                | 0.819     |
| 200              | 0.819     |
| 400 _(shipping)_ | 0.826     |
| 800              | 0.826     |

Structurally confirmed: in `boundary-buddy-duration` the overlap is what puts the query's keywords
and the answer in the same passage, moving that passage from rank 3 to rank 2. In aggregate that is
one rank on one question. At 17 passages and top-6 both passages of a two-passage document get
returned anyway, so the overlap rarely changes _whether_ the answer is retrieved — only where it
sits. Expect this to matter more as Stream A grows documents.

### 4. Raising top-k buys very little

top-12 over top-6: `MRR` 0.848 → 0.858, `answerMRR` 0.826 → 0.836. `recall@1` does not move. Double
the payload for one question improving by a few ranks.

### 5. Two knobs are unmeasurable at this corpus size

`candidatesPerList` is 30 against a 17-passage corpus, so nothing is ever truncated and the knob
cannot do anything. RRF `k` only reorders where two lists disagree. Both are also unreachable from
here (see above). This is the same reason the reranker was demoted: **grow the corpus before tuning
fusion.**

### What would make this instrument sharper

In rough order of value: fill in the hybrid baseline against a real provider; grow the corpus so
top-6 is a small fraction of it and `recall@6` stops saturating; add questions in the 40–60 range so
one question is worth less than 0.02; then revisit fusion knobs.

## Recorded findings (2026-07-30, BM25-only, after the OCR-derived case)

The corpus grew to 11 documents / 19 passages and 25 scored questions, and **every aggregate fell**:

| metric         | 23 questions | 25 questions | why                          |
| -------------- | ------------ | ------------ | ---------------------------- |
| recall@1       | 0.826 (19)   | 0.800 (20)   | numerator +1, denominator +2 |
| recall@3, @6   | 0.870 (20)   | 0.840 (21)   | same                         |
| MRR            | 0.848        | 0.820        | same                         |
| answerRecall@1 | 0.783 (18)   | 0.760 (19)   | same                         |
| answerMRR      | 0.826        | 0.800        | same                         |

**None of that is a retrieval change.** Both runs were diffed per question: not one pre-existing case
changed its `sourceRank` or its `answerRank`, and no question stopped retrieving its expected source.
Eleven of them changed only in the tail of the top-6, where the new document displaced a
lower-scoring passage. The drop is arithmetic — two questions were added, one of which BM25 cannot
reach — which is exactly why the fixture and the baseline moved in separate commits. Read the two
sets of numbers as different instruments, not as a regression.

### 6. The BM25 ceiling fell to 0.840, and cross-language is now three quarters of it

Finding 1 above put the lexical ceiling at 0.870, with 3 of 23 questions unreachable. It is now
**0.840, with 4 of 25 unreachable**, and the newcomer is `ocr-cross-lang-response-time`:

- `semantic-delay` — no discriminative word shared with the answer
- `cross-lang-trip-approval` — English question, Vietnamese answer
- `cross-lang-vpn-signoff` — same, with distractor pressure
- `ocr-cross-lang-response-time` — same, against an OCR-derived Vietnamese source

So the entire fall in the ceiling is one question, and it is a cross-language one. Three of the four
lexically unreachable questions are now cross-language, which sharpens finding 1 rather than
changing it: on a bilingual corpus the semantic half's value is concentrated in cross-language
retrieval, and **scanned Vietnamese documents can only ever arrive as that case** — a scan has no text
layer, so its transcription is the only text retrieval will ever see. BM25 scored it at exactly zero
and returned `onboarding-runbook` and `it-service-catalogue` instead, on the strength of the single
token "request".

### 7. A transcribed table retrieves exactly as well as an authored one

`ocr-id-transcribed-table-row` lands at rank 1 with the answer in the top passage — identical to its
authored twin `id-po-vendor`. It also beats the same document's other passage, so the row survived
transcription **and** chunking as a row, hint spanning the pipe. On this evidence markdown that a
multimodal model rebuilt from ruled lines is not measurably worse to retrieve from than markdown a
human typed.

Note what this does **not** establish. The real-corpus observation motivating it was that text-layer
extraction of a scanned annual report shredded tables to one word per line, which would scatter a
code and its description across passages. Confirming that OCR beats text-layer extraction needs both
variants of the _same_ document in the fixture, and only the OCR variant is here. This is the weak
form of the claim — transcribed tables retrieve fine — not the comparison.

### 8. The over-retrieval canary got noisier

`unanswerable-lexical-overlap` ("Chính sách nghỉ phép thai sản") now returns the OCR document at rank
1, on the generic back-office vocabulary any Vietnamese contract shares with a leave policy. Nothing
is gated on it and the question has no expected source, so this is not a regression — but it is the
signal that case exists to give: a growing Vietnamese corpus makes a relevance floor more attractive,
not less. The hard invariant still holds — `unanswerable-no-overlap` returns nothing.

### Still not measured

- **The hybrid half.** `baseline.json` is still `hybrid: null`, so the one question finding 6 raises —
  does the multilingual embedding model bridge an English query to an OCR'd Vietnamese answer? — is
  the question this instrument still cannot answer. The only locally configured provider exposes no
  embedding model, so route 2 cannot resolve one even with the dev app up. Fill it with
  `KB_EVAL_EMBED_BASE_URL` / `_API_KEY` / `_MODEL` pointed at a working embedding model, then
  `bun run eval:kb -- --update-baseline`.
- **Text-layer vs OCR on the same tables** (see finding 7).
- Resolution barely improved: one question is worth 0.040 where it was worth 0.043. The 40–60 range in
  "what would make this instrument sharper" is still the target.

## Baseline and CI

`baseline.json` is the committed reference so a regression is a diff, not a memory test. It records
metrics, the set of questions whose expected source was found, and which unanswerable questions
correctly returned nothing. It does **not** pin per-question ranks: ranks move for legitimate
reasons, and a fixture that pins them becomes noise nobody trusts.

The hybrid block is pinned to one embedding model and only compared when the current run uses the
same one — different model, different vector space, incomparable numbers. **The committed baseline
currently has `hybrid: null`**, recorded on a machine with no embedding provider reachable. The
semantic half is therefore unguarded. Run `bun run eval:kb -- --update-baseline` against a configured
provider to fill it in.

The full harness is deliberately **not** in `bun run test`: it wants the network and takes real time.
The deterministic BM25 half runs in CI via `tests/regression/kbRetrievalBaseline.test.ts`, which
guards tokenisation and fusion for free, plus the hybrid _wiring_ against a stub embedder so that
code path is not untested. Typecheck the harness with `bunx tsc --noEmit -p tests/eval` — the root
config covers `packages/desktop/src` only, so `bunx tsc --noEmit` does not reach `tests/`.
