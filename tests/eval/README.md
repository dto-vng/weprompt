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
   works headless. **In practice this is the one that works; prefer it.**
2. The running dev app's `GET /api/providers`, run through the same `pickEmbeddingModel` →
   `resolveEmbedConfigForModel` the ingestion service uses, so you measure the model a real ingest
   would have picked. Override the port with `AIONUI_BACKEND_PORT`. See the caveat below — this route
   may be closed to you.
3. Neither — BM25-only, with the reason printed.

All three of the env vars are required together. Setting two of them is not a partial win: the
resolver treats it as unset and falls through to route 2, which is easy to misread as "my env vars
were ignored".

#### Route 2 cannot authenticate, and that is not fixable here

Since `fix(security): require a per-launch secret on every local backend call`, the desktop app
presents an `X-AionUI-Local-Token` header on every local backend call. The secret is minted on each
spawn and **never persisted** — it lives only in the app process's globals — so a separate headless
process has nowhere to read it from. If the backend enforces the header, route 2 answers 401 no
matter what, and adding the header to this harness would not help.

The resolver therefore reports a refusal as a refusal rather than as an outage, because those need
opposite responses from the reader: an outage means start the app, a refusal means stop trying and
use the env vars. Whether the pinned AionCore binary enforces the header has not been confirmed
against a running backend; treat route 2 as "may work, do not rely on it".

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

### The vector-only row is a diagnostic, not a configuration

When an embedding model is available a third row appears, **Vector-only**. Production is always
hybrid and never runs this; it exists to answer the one question a fused result cannot — when hybrid
misses, was the passage never found, or found and then discarded by fusion? Those have completely
different fixes (a different embedding model versus a fusion constant), and the fused ranking cannot
tell them apart.

It is implemented by handing `searchKnowledge` a store whose BM25 index was built from **no chunks**.
`searchBm25` returns `[]` the moment `totalDocs === 0`, so the lexical contribution disappears and
RRF fuses a single list, which is order-preserving. Cosine, the candidate cap and the chunk mapping
are all still the shipping code — nothing about ranking is reimplemented, and `packages/` is
untouched. A regression test asserts the vector row actually differs from the hybrid row, because a
`withoutLexicalHalf` that quietly became a no-op would turn this into a second copy of the hybrid
ranking with every conclusion drawn from it wrong and nothing else failing.

Two things to know when reading it:

- It ranks the **whole corpus**, then truncates to `topK` for its metrics row so the row stays
  comparable. The untruncated rank is what the "where the semantic half ranked what Hybrid missed"
  section reports — a miss measured at top-6 would only repeat what the fused run already said.
- Its scores are RRF scores, `1/(60+rank)`, not cosine similarities. Read the ordering, not the
  number.
- It is deliberately **not** in `baseline.json`. Baselining it would gate a configuration that is
  never shipped and add a third block to re-record on every embedding-model change; the hybrid block
  already guards the semantic path.

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

> **Superseded by finding 9 (2026-07-31).** The hybrid baseline was filled in, and this paragraph's
> conclusion did not survive it. Cross-language is where the semantic half adds **nothing** here; its
> entire contribution is `semantic-delay`, the monolingual case listed above. The reasoning was sound
> and the prediction was wrong — left in place because a findings log that quietly deletes its wrong
> calls cannot be trusted about its right ones.

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

- **Text-layer vs OCR on the same tables** (see finding 7).
- Resolution barely improved: one question is worth 0.040 where it was worth 0.043. The 40–60 range in
  "what would make this instrument sharper" is still the target.

## Recorded findings (2026-07-31, hybrid)

The hybrid baseline is filled in, against `baai/bge-m3` (dim 1024) via `KB_EVAL_EMBED_*`. First
numbers the semantic half has ever produced here.

| metric         | BM25-only | Hybrid    |
| -------------- | --------- | --------- |
| recall@1       | 0.800     | 0.800     |
| recall@3       | 0.840     | 0.840     |
| recall@6       | 0.840     | **0.880** |
| MRR            | 0.820     | 0.828     |
| answerRecall@6 | 0.840     | **0.880** |
| answerMRR      | 0.800     | 0.808     |

### 9. The semantic half rescues one question, and not the one it was for

`foundIds` goes 21 → 22. The single addition is **`semantic-delay`** — the monolingual English case.
All three cross-language questions are still missed: `cross-lang-trip-approval`,
`cross-lang-vpn-signoff`, and `ocr-cross-lang-response-time`.

This is the reverse of finding 1's prediction, which is annotated as superseded above rather than
deleted. On this corpus, at these knobs, with this model, **cross-language is precisely where the
semantic half adds nothing**, and its whole contribution is the one case where an English question
shares no vocabulary with an English answer.

The rescue is also weak. `recall@1` and `recall@3` do not move at all — the top slot is never
improved — and the gain shows only at `recall@6`. The MRR delta of 0.008 across 25 scored questions
pins the new hit's reciprocal rank at 0.2, so it enters at **rank 5**, near the bottom of a top-6
payload.

### 10. Hybrid never abstains, exactly as designed

Hybrid's `zeroHitIds` is empty where BM25's holds `unanswerable-no-overlap`: a question whose every
token is absent from the corpus still returns six passages once vectors are in play. Predicted when
that case was written, now measured. Only the BM25 abstention is gated.

### Why cross-language fails — open at the time, since answered

Two candidates, not separated by _this_ run:

1. `bge-m3` may not bridge English → Vietnamese in this vector space.
2. RRF may be burying a correct semantic hit. At `k = 60`, a passage in only one of the two lists
   scores 1/61 and loses to anything appearing in both — and a cross-language query's BM25 list is
   exactly where the right document is absent.

Telling them apart needed a **vector-only ranking**. That mode was added, run, and **the question is
now settled: it is the fusion, not the model.** See finding 11 below.

## Recorded findings (2026-07-31, vector-only diagnostic)

Same run, same model, with the semantic half isolated:

| metric         | BM25-only | Hybrid | Vector-only |
| -------------- | --------- | ------ | ----------- |
| recall@1       | 0.800     | 0.800  | 0.760       |
| recall@3       | 0.840     | 0.840  | **0.880**   |
| recall@6       | 0.840     | 0.880  | **0.960**   |
| MRR            | 0.820     | 0.828  | 0.818       |
| answerRecall@6 | 0.840     | 0.880  | **0.960**   |
| answerMRR      | 0.800     | 0.808  | 0.778       |

### 11. The embedding model bridges languages fine. Fusion throws the answer away.

```
where the semantic half ranked what Hybrid missed
  [cross-lang-trip-approval]     rank 1 of 19 — FOUND, then lost in fusion
  [cross-lang-vpn-signoff]       rank 5 of 19 — mid-pack
  [ocr-cross-lang-response-time] rank 1 of 19 — FOUND, then lost in fusion
```

Two of the three cross-language questions — including the OCR'd scan — have the correct document at
**rank 1** on pure semantics, the best result available. Hybrid returns six wrong documents for both.
`bge-m3` was never the problem, and finding 9's open question is closed: **it is the combination
rule.**

The mechanism is visible in the report's own scores. RRF at `k = 60` gives a document found by one
list `1/61 = 0.0164`; a document found by **both** lists gets `1/61 + 1/62 = 0.0325`. Roughly double,
regardless of how good either hit was — which is exactly the `0.0164` versus `0.0320` in the
unanswerable section.

So a rank-1 semantic hit loses to any document both retrievers merely noticed. And for a
cross-language query BM25 _structurally cannot_ find the right document — different language, zero
shared tokens — so it can never appear in both lists, so it can never win. This is not a tuning
nicety: **on a bilingual corpus, the current fusion cannot surface the correct document above any
document the two retrievers happen to agree on.**

### 12. The fused result is worse than one of its own inputs

`recall@6`: vector-only 0.960, hybrid 0.880. Fusion is discarding information rather than combining
it. Twenty-four of twenty-five questions are answerable from the semantic list alone at k=6.

But pure semantic is not the answer either, and the fixture says why. Vector-only loses `id-po-vendor`
outright and drops `ocr-id-transcribed-table-row` from rank 1 to 3 — the two identifier-in-a-table
cases, exactly where BM25 was predicted to dominate because an exact code offers an embedding nothing
to generalise from. `recall@1` goes 0.800 → 0.760 for the same reason.

Neither half is right alone. The combination rule is what is broken.

### What this does NOT license

A quick retune. Lowering RRF's `k` does not cleanly fix this: RRF is _designed_ to reward cross-list
agreement, and for a single-list rank-1 hit to beat a document sitting at ranks 3 and 4 of both lists
you need `1/(k+1) > 1/(k+3) + 1/(k+4)`, which only holds at implausibly small `k`. A real fix is more
likely weighted fusion, or a rule for when one list is structurally empty — and either is a change to
`rrf.ts` or `searchCore.ts`, which is **shipping code, not this harness**. It belongs in its own
change, measured with this instrument rather than alongside it.

## Baseline and CI

`baseline.json` is the committed reference so a regression is a diff, not a memory test. It records
metrics, the set of questions whose expected source was found, and which unanswerable questions
correctly returned nothing. It does **not** pin per-question ranks: ranks move for legitimate
reasons, and a fixture that pins them becomes noise nobody trusts.

The hybrid block is pinned to one embedding model and only compared when the current run uses the
same one — different model, different vector space, incomparable numbers. It is now **recorded
against `baai/bge-m3`**, so the semantic half is guarded for anyone running with that model; a run on
a different provider notes the mismatch and skips the comparison rather than reporting a false
regression. CI is unaffected — it runs BM25-only and reports "hybrid not run".

To re-record it after a deliberate change, use the env vars from route 1 — not by starting the app,
for the reason given under "Route 2 cannot authenticate":

```bash
KB_EVAL_EMBED_BASE_URL=… KB_EVAL_EMBED_API_KEY=… KB_EVAL_EMBED_MODEL=… bun run eval:kb -- --update-baseline
```

The full harness is deliberately **not** in `bun run test`: it wants the network and takes real time.
The deterministic BM25 half runs in CI via `tests/regression/kbRetrievalBaseline.test.ts`, which
guards tokenisation and fusion for free, plus the hybrid _wiring_ against a stub embedder so that
code path is not untested. Typecheck the harness with `bunx tsc --noEmit -p tests/eval` — the root
config covers `packages/desktop/src` only, so `bunx tsc --noEmit` does not reach `tests/`.
