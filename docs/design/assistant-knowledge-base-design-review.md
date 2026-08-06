# Assistant Knowledge Base — Design Review

**Date:** 2026-08-05
**Status:** approved direction; contract amendments required before implementation planning
**Reviewed against:** `origin/sprint2` at `343b725c4f4675651a1eb61b725463cb33bd9ac0`
**Source:** _Assistant Knowledge Base — Design Spec_ dated 2026-08-04

## Verdict

The core direction is sound: generalize the shipped project Knowledge Base instead of
building a second retrieval system. However, the current design is not implementation-ready.
It has unresolved storage, ownership, retrieval, citation, privacy, and lifecycle contracts
that can cause destructive index overlap, incorrect citation routing, unsupported product
promises, and inconsistent disable/delete behavior.

The design should remain approved at the direction level, with the amendments below treated
as entry criteria for the implementation plan.

## Release-blocking findings

### P1 — The assistant index namespace can overlap a project store

The proposed assistant index path is:

```text
<project-kb-root>/assistant/<assistantId>
```

The design calls `assistant` reserved, but the current native schema accepts it as a valid
project ID. Persisted projects also accept any string ID, even though newly created projects
normally use UUIDs. A project whose ID is `assistant` therefore owns
`<project-kb-root>/assistant`; removing its store recursively would also remove every nested
assistant index.

Evidence:

- [`payloadSchemas.ts`](../../packages/desktop/src/common/adapter/native/payloadSchemas.ts)
  accepts project Knowledge Base IDs matching `^[A-Za-z0-9_-]+$`.
- [`projectStorage.ts`](../../packages/desktop/src/renderer/pages/conversation/projects/projectStorage.ts)
  accepts persisted project records when `id` is a string.
- [`projectKnowledgeService.ts`](../../packages/desktop/src/process/services/projectKnowledge/projectKnowledgeService.ts)
  maps a project directly beneath the project store root and recursively removes that directory.

Required correction:

```text
Project indexes:   <cacheDir>/project-kb/<projectId>       (unchanged)
Assistant indexes: <cacheDir>/assistant-kb/<safeOwnerKey> (new sibling root)
Assistant files:   <dataDir>/assistant-knowledge/<safeOwnerKey>/Knowledge Base/
```

One shared service does not require one filesystem root. Assistant IDs should be treated as
opaque API values and converted to a fixed, filesystem-safe owner key rather than assumed to
be valid path segments. The original scope identity should remain recorded in the manifest.

### P1 — `KnowledgeScope` cannot locate every source folder

The proposed scope contains identity only:

```ts
type KnowledgeScope = { kind: 'project' | 'assistant'; id: string };
```

That is sufficient for store-only operations such as listing indexed sources or constructing
a session MCP descriptor. It is not sufficient for project add, remove, retry, sync, or watch
operations because the project registry and project-to-workspace mapping remain renderer-owned.
Those operations currently require both `projectId` and `workspace`.

Evidence:

- [`projectKnowledgeService.ts`](../../packages/desktop/src/process/services/projectKnowledge/projectKnowledgeService.ts)
  requires `workspace` for folder mutations and synchronization.
- [`ipcBridge.ts`](../../packages/desktop/src/common/adapter/ipcBridge.ts) documents that main
  currently trusts the renderer's project ID to workspace pairing.

Required correction:

```ts
type KnowledgeScope = { kind: 'project'; id: string } | { kind: 'assistant'; id: string };

type KnowledgeTarget =
  | { scope: { kind: 'project'; id: string }; workspace: string }
  | { scope: { kind: 'assistant'; id: string } };
```

- Store-only operations take `KnowledgeScope`.
- Folder-mutating and watch operations take `KnowledgeTarget`.
- Native validation requires `workspace` for project targets and rejects it for assistant
  targets.
- Main derives assistant paths; the renderer never supplies or constructs them.
- The update event carries the complete scope, not only an ID.

### P1 — Manifest compatibility is undefined

The current manifest is fixed to `schemaVersion: 1` and contains `projectId`. Its read side
rejects unsupported versions. Therefore, “manifest shared verbatim,” “KnowledgeScope
throughout,” and “no migration” cannot all be true without a compatibility adapter.

Evidence:

- [`types.ts`](../../packages/desktop/src/common/knowledge/types.ts) defines the V1
  `KnowledgeManifest` with `projectId`.
- [`store.ts`](../../packages/desktop/src/common/knowledge/store.ts) creates a manifest from a
  project ID.
- [`searchCore.ts`](../../packages/desktop/src/common/knowledge/searchCore.ts) accepts only
  schema version 1.

Required correction:

```ts
type KnowledgeManifestV1 = {
  schemaVersion: 1;
  projectId: string;
  // existing fields
};

type KnowledgeManifestV2 = {
  schemaVersion: 2;
  scope: KnowledgeScope;
  // existing fields
};
```

Both main and MCP readers should validate and normalize V1 as project scope. A subsequent
atomic manifest write may upgrade the metadata to V2 without moving files, rebuilding BM25,
or repeating embedding calls. A V2 manifest whose recorded scope does not match the requested
store must fail closed.

### P1 — Assistant documents lose the whole-document path

The current project search tool tells the model to search first, then use ordinary workspace
file tools for whole-document work. That works because project documents and their extracted
text live inside the conversation workspace.

Assistant documents live in a managed directory outside that workspace. Merely changing the
tool description prefix leaves the model with no correct path for requests such as “summarize
the whole policy.” Search returns a bounded set of passages, not the complete document.

Evidence:

- [`knowledgeServer.ts`](../../packages/desktop/src/process/resources/builtinMcp/knowledgeServer.ts)
  directs whole-document work to relative files under the workspace Knowledge Base folder.
- [`searchCore.ts`](../../packages/desktop/src/common/knowledge/searchCore.ts) formats a bounded
  result payload from matching chunks.

Required decision:

1. Add a bounded, paginated `read_assistant_knowledge_source` tool that reads the indexed
   `converted.md` through the managed store; or
2. Explicitly limit v1 to passage retrieval and remove the whole-document promise.

Exposing the external assistant folder directly to general file tools is not the default
recommendation.

### P1 — Distinct MCP names do not make citation provenance unambiguous

Separate project and assistant server/tool names solve MCP deduplication, but they do not
solve citations in the assistant's final prose. The current citation contract contains only a
filename and optional anchor, and the renderer linkifies exact filenames. If both scopes
contain `policy.pdf`, a filename-only citation cannot identify the correct store.

Evidence:

- [`citationFormat.ts`](../../packages/desktop/src/common/knowledge/citationFormat.ts) encodes
  only filename and anchor in `weprompt-kb://` links.
- [`KnowledgeCitationsContext.tsx`](../../packages/desktop/src/renderer/pages/conversation/knowledge/KnowledgeCitationsContext.tsx)
  resolves sources by filename.
- [`ToolOutputCitations.tsx`](../../packages/desktop/src/renderer/pages/conversation/Messages/components/ToolOutputCitations.tsx)
  recognizes only the project Knowledge Base search tool today.

Required correction:

```ts
type KnowledgeCitationTarget = {
  scope: KnowledgeScope;
  sourceId: string;
  fileName: string;
  anchor?: string;
};
```

- Encode scope and source ID in internal citation links.
- Route preview and open-original operations through main-owned scope-aware IPC.
- Make assistant tool output recognizable and label it as assistant knowledge.
- If filename-only model prose is ambiguous, leave it unlinked or present a scope chooser;
  never silently choose the first match.

### P1 — The privacy statement overpromises the data boundary

“Personal and private” is accurate for ownership, local persistence, and assistant sharing,
but it can be read as local-only processing. The shipped pipeline may send:

- extracted chunks to the configured embedding provider;
- scanned PDF page images to a configured vision provider; and
- retrieved passages to the selected chat-model provider.

Evidence:

- [`embedCore.ts`](../../packages/desktop/src/common/knowledge/embedCore.ts) posts source text
  to the configured embeddings endpoint.
- [`pdfOcr.ts`](../../packages/desktop/src/common/knowledge/pdfOcr.ts) posts rendered page images
  to a vision-capable chat-completions endpoint.
- [`knowledgeServer.ts`](../../packages/desktop/src/process/resources/builtinMcp/knowledgeServer.ts)
  returns retrieved document text as tool output to the active conversation.

Required wording:

> The binding, managed documents, and index remain local to this WePrompt installation and
> are not included when an assistant is shared, duplicated, exported, or imported. Processing
> is not necessarily local: document text may be sent to the configured embedding provider,
> scanned pages may be sent to a configured vision provider, and retrieved excerpts are sent
> to the selected chat-model provider.

This disclosure should appear before or alongside the first enable action.

### P1 — “Every chat” exceeds the proposed attachment path

The design changes `useGuidSend`, which covers new direct conversations created through Guid
and Project New Chat. Team creation, scheduled tasks, channel-created sessions, and other
backend-created conversations do not use this attachment seam. Existing conversations also
retain the session MCP configuration frozen when they were created.

Evidence:

- [`useGuidSend.ts`](../../packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts)
  attaches the project Knowledge Base server during direct conversation creation.
- [`TeamCreateModal.tsx`](../../packages/desktop/src/renderer/pages/team/components/TeamCreateModal.tsx)
  sends team assistant identity and model configuration without session Knowledge Base MCPs.
- [`resolveCronAgentConfig.ts`](../../packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig.ts)
  has no assistant Knowledge Base session-server contract.

Required v1 wording:

> Enabled assistant knowledge attaches only to newly created direct conversations through
> Guid or Project New Chat. Existing conversations, team conversations, scheduled tasks,
> channel-created conversations, and other backend-created sessions do not receive it in v1.

Disable and deletion are not live revocation. An already-created conversation retains its
session descriptor, and a Knowledge Base subprocess that already loaded its store may retain
that content until its runtime ends. The UI should use the existing “New conversations only”
affordance.

### P1 — Assistant lifecycle and watch ownership need a state machine

The design does not yet define what the local enable toggle controls, when its value is
committed, or how concurrent sync and disable/delete interact.

Current behavior creates two concrete risks:

- `syncAndWatch` re-registers a watcher unconditionally in `finally`; an in-flight sync can
  resurrect a watcher after the assistant Knowledge Base was disabled.
- The current assistant deletion handler removes only the backend assistant and refreshes the
  list; it does not unwatch, clear a binding, or remove an index.

Evidence:

- [`projectKnowledgeBridge.ts`](../../packages/desktop/src/process/bridge/projectKnowledgeBridge.ts)
  re-registers the watcher after synchronization.
- [`useAssistantEditor.ts`](../../packages/desktop/src/renderer/hooks/assistant/useAssistantEditor.ts)
  currently performs backend-only assistant deletion.
- [`DeleteAssistantModal.tsx`](../../packages/desktop/src/renderer/pages/settings/AssistantSettings/DeleteAssistantModal.tsx)
  does not know the retained Knowledge Base folder.

Required state machine:

| Event            | Binding                     | Watch and sync                      | Index             | Documents        | Existing conversations |
| ---------------- | --------------------------- | ----------------------------------- | ----------------- | ---------------- | ---------------------- |
| Enable succeeds  | enabled                     | ensure folder, catch-up sync, watch | create/update     | create or retain | unchanged              |
| Enable fails     | disabled/unchanged          | none                                | retain            | retain           | unchanged              |
| Disable          | disabled                    | unwatch; start no new ingestion     | retain            | retain           | unchanged              |
| Delete assistant | remove or cleanup tombstone | unwatch                             | remove with retry | retain           | unchanged              |
| Re-enable        | enabled                     | one catch-up sync, then watch       | resume/update     | retain           | unchanged              |

Main should track desired watch state or a generation token so an older sync cannot reattach a
disabled watcher. In-flight OCR/embedding behavior must also be stated: ideally cancel it; if
cancellation is unavailable, allow the active unit to finish but start no new work.

## Assistant identity and source support

The implementation plan must explicitly cover every persisted assistant source and lifecycle
state:

| State or source               | Required v1 behavior                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| Unsaved assistant             | Hide or disable the KB section with “Create the assistant first”  |
| Existing user assistant       | Supported                                                         |
| Builtin assistant             | Supported only after stable owner identity is guaranteed          |
| Generated CLI assistant       | Explicitly support or explicitly exclude                          |
| Duplicate                     | New assistant starts disabled; no documents or binding copied     |
| Import or share               | Starts disabled; no documents or binding imported                 |
| Retired/disappeared assistant | Preserve documents; remove index only through safe reconciliation |

Backend assistant IDs are not yet a proven immutable filesystem identity. Imported assistants
may also supply IDs. A new assistant that reuses an orphaned ID must never auto-enable or
silently consume the former assistant's documents. If local documents are found, surface an
explicit recovery choice.

An empty-state note is insufficient for a retired builtin because the missing assistant no
longer has an editor in which to display it. Either guarantee stable builtin owner keys or add
a global recovery surface for orphaned assistant knowledge folders.

## Implementation-plan corrections

### Renderer placement

The proposed reuse move correctly reduces `pages/project/components/` from ten direct
children to seven, and `AssistantSettings/editor/` can safely grow from six to seven.
However, `renderer/components/` already has ten direct children. Adding a new `knowledge/`
directory makes eleven, violating the repository's
[directory-size rule](../contributing/file-structure.md#directory-size-limit).

The implementation plan needs one approved, small reorganization before adding the shared
module. It must not turn into unrelated cleanup.

### Binding persistence

Use [`configKeys.ts`](../../packages/desktop/src/common/config/configKeys.ts) and the current
[`configService.ts`](../../packages/desktop/src/common/config/configService.ts) client-settings
store. Do not add new business truth to legacy `ConfigStorage` surfaces. The binding remains
local to the installation and outside assistant create/update/import payloads.

The persisted value needs runtime validation. Corrupt or unknown entries fail disabled, and
successful catalog reconciliation—not a failed or empty fetch—owns orphan cleanup.

### App-shell ownership

Assistant watch registration and orphan reconciliation need an app-shell owner equivalent to
the existing project watcher hook. It should start only after both client configuration and an
authoritative assistant catalog fetch succeed.

### Safe main-owned operations

Add explicit operations whose paths are always derived in main:

- `ensureKnowledgeFolder({ scope })`
- `showKnowledgeFolder({ scope })`
- `openKnowledgeSource({ scope, sourceId })`
- scope-aware watch, unwatch, remove-store, list, retry, and update events

Use platform-neutral UI copy such as “Show knowledge folder,” not “Reveal in Finder.”

### Change sequencing

The physical `process/services/projectKnowledge/` to `knowledge/` rename is cosmetic compared
with the behavioral change. Defer it or isolate it in a separate mechanical commit so the
scope generalization remains reviewable.

“The existing project-KB suite must pass untouched” should mean unchanged project behavior,
not literally unchanged tests. Strict IPC payloads and scope-wide types require minimal test
updates.

## Required acceptance tests

### Storage and manifest

- A project ID of `assistant` cannot overlap or delete assistant stores.
- Arbitrary, Unicode, separator-containing, long, and case-differing assistant IDs map to
  distinct safe owner keys.
- Existing V1 project manifests and new V2 assistant manifests load in both main and MCP.
- Scope mismatch, malformed manifests, and unsupported versions fail closed.
- Project folder targets require a workspace; assistant targets reject renderer-supplied paths.

### Enable, watch, and cleanup

- Enabling creates the managed folder before reveal/watch and persists enabled only after
  success.
- Disabling during sync or a debounced event cannot re-register the watcher.
- Re-enabling performs one catch-up sync.
- Disabling stops future attachment and ingestion while preserving index and documents.
- Store removal waits for queued ingestion; failed cleanup remains retryable.
- Orphan cleanup runs only after a successful assistant-list fetch.

### Conversation attachment

- Project-only, assistant-only, both, neither, and disabled-assistant cases.
- Both servers survive merge for AionRS and ACP with stable, distinct IDs and names.
- One scope descriptor failure still attaches the other and still creates the conversation.
- Team, scheduled, channel, existing, and continuation behavior is explicitly included or
  excluded and tested accordingly.
- Existing conversations retain the documented frozen-session semantics.

### Citations and source access

- `search_assistant_knowledge` output is assistant-labeled, recognized, clickable, and routed
  to the assistant store.
- The same filename in project and assistant scopes opens the correct source from each tool
  output.
- Ambiguous filename-only prose never silently chooses one store.
- Citation links round-trip scope, source ID, filename, and anchor.
- Assistant-only conversations provide citation context without a project ID.
- Open-source and show-folder actions use main-derived paths and reject invalid scopes.

### Assistant lifecycle and UX

- The unsaved create form has no active Knowledge Base owner.
- Duplicate, import, and share never copy or enable the local binding.
- Builtin and generated-assistant support follows the declared support matrix.
- Orphan folder or ID reuse requires explicit recovery.
- The external-provider disclosure appears before first enable.
- New UI copy is localized and uses platform-neutral terminology.
- An automated structure check confirms no modified directory exceeds ten direct children.

## Decisions that remain valid

The following parts of the original design should be retained:

- Generalize one indexing/retrieval engine rather than create a parallel assistant service.
- Keep project index paths unchanged to avoid destructive re-indexing.
- Use distinct project and assistant MCP server/tool identities.
- Key queues, events, and freeze points by the complete owner scope.
- Keep the assistant binding outside assistant API payloads and export/import packages.
- Create managed folders lazily rather than for every assistant in the catalog.
- Preserve user documents when an assistant is deleted.
- Keep project and assistant retrieval separate in v1 rather than introducing merged ranking.

## Implementation-plan entry criteria

The implementation plan can be considered ready once the design records these decisions:

1. Separate assistant index root and safe owner-key derivation.
2. `KnowledgeScope` versus `KnowledgeTarget` contracts.
3. V1-to-V2 manifest normalization and mismatch behavior.
4. Passage-only versus bounded whole-document retrieval.
5. Scope-aware citation identity and ambiguity behavior.
6. Exact v1 conversation surfaces and non-revocation semantics.
7. Privacy disclosure wording.
8. Assistant source/lifecycle support matrix and enable/disable/delete state machine.
9. Main-owned open/reveal operations and app-shell watcher ownership.
10. A directory-compliant renderer module location.

Until those are settled, implementation would require individual workers to invent product
and data-safety behavior independently, which would undermine the purpose of the approved
design.
