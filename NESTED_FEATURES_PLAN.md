# Lekh MCP: Option B — Nested Child Entries (`parent_name`) & Vector Consolidation Plan

Handoff specification for Antigravity CLI (`agy`). Read this entire file before editing any code.

---

## 0. Rules for the Agent

1. **Goal:** Implement **Option B (Parent-Child Nesting with Consolidated Changelog Vector)** so fixes, refactors, decisions, and sub-enhancements nest inside their parent feature in D1 (`children_json`) and roll up into **at most 1–2 consolidated `updates-and-fixes` vector chunks on the parent feature**, instead of spawning 4 separate vectors per fix.
2. **Consolidate Live `lekh` Data:** After implementing the code and deploying, migrate the 8 standalone sub-features/fixes in the live `lekh` project (`cross-encoder-reranker`, `multi-chunk-rrf-bonus`, `technical-token-sanitizer`, `cross-feature-relationships`, `mcp-prompts`, `dense-snippet-hydration`, `dashboard-feature-editor`, `json-backup-export-import`) into nested children under `feature-memory-server` and `web-explorer-ui`, and delete the 8 standalone duplicate records so total vectors drop from **40 back down to ~10 vectors**.
3. **Bun usage only for local tooling:** Run `bun test` and `bun run typecheck` before deploying. Do not use `Bun.*` runtime APIs in `src/`.

---

## 1. Architecture of Option B (Nested Children + Consolidated Vector Rollup)

```text
📁 Project: lekh
 ├── 🟢 Feature: feature-memory-server (Parent Feature Row in D1)
 │    ├── Core Chunks (4 vectors: summary, overview, architecture, gotchas)
 │    ├── Nested Children (stored in features.children_json in D1):
 │    │    ├─ [feature] cross-encoder-reranker
 │    │    ├─ [pattern] multi-chunk-rrf-bonus
 │    │    ├─ [fix]     technical-token-sanitizer
 │    │    ├─ [feature] cross-feature-relationships
 │    │    ├─ [feature] mcp-prompts
 │    │    └─ [fix]     dense-snippet-hydration
 │    └── Rolled-Up Child Chunks (1–2 vectors total for ALL children combined, split at 1500 chars)
 │
 └── 🟢 Feature: web-explorer-ui (Parent Feature Row in D1)
      ├── Core Chunks (4 vectors: summary, overview, architecture, gotchas)
      ├── Nested Children (stored in features.children_json in D1):
      │    ├─ [feature] dashboard-feature-editor
      │    └─ [feature] json-backup-export-import
      └── Rolled-Up Child Chunks (1 vector total for ALL children combined)
```

### Why This Solves Both UI Nesting & Vector Bloat
1. **Rich UI & Agent Inspection:** Every nested fix, pattern, decision, or sub-feature is preserved as a structured child object inside `children_json` on the parent `features` row:
   ```ts
   export interface NestedChildEntry {
     name: string;               // normalized slug, e.g. "dense-snippet-hydration"
     type: FeatureType;          // "fix" | "pattern" | "decision" | "refactor" | "feature"
     importance: number;         // 1 | 2 | 3
     summary: string;
     sections: FeatureSection[];
     files: string[];
     tags: string[];
     updated_at: string;
   }
   ```
2. **Massive Vector Reduction:** Instead of 4 vectors per child (which turned 8 updates into 32 extra vectors!), `chunkFeature` formats all `children` of a parent feature into compact entries:
   ```text
   ### [fix] dense-snippet-hydration
   Summary: ...
   Key Details: ...
   Files: src/store.ts, src/rank.ts
   ```
   and packs them together into a `"nested-updates"` section that is split at the standard 1,500-character boundary.
   - 8 nested children (~2,200 chars total) produce **only 2 vectors total** instead of **32 vectors**!
   - Both Vectorize and D1 FTS5 still index every single child's name, summary, details, and files under the parent feature's chunks (`f{parentId}-c{idx}`), so `search_features` finds them with 100% recall and points directly to the parent feature + matched `nested-updates` section!

---

## 2. Step-by-Step Implementation Details

### Phase 1: D1 Migration (`migrations/0002_nested_children.sql`)
1. Create `migrations/0002_nested_children.sql`:
   ```sql
   ALTER TABLE features ADD COLUMN children_json TEXT NOT NULL DEFAULT '[]';
   ```
2. Apply locally and remotely:
   ```bash
   bunx wrangler d1 migrations apply lekh-db --local
   bunx wrangler d1 migrations apply lekh-db --remote
   ```

### Phase 2: Chunking & Store Support for `parent_name` (`src/chunk.ts` & `src/store.ts`)

1. **In `src/chunk.ts`:**
   - Add `NestedChildEntry` interface and optional `children?: NestedChildEntry[]` to `FeatureInput`.
   - In `chunkFeature(input)`:
     - Include all child `files` and `tags` (deduplicated) in Chunk 0 (`summary`) so file/tag searches match the parent feature immediately.
     - After the parent's `sections` chunks, if `input.children && input.children.length > 0`:
       - Build a combined markdown block where each child is formatted as:
         ```text
         [${child.type}] ${child.name}: ${child.summary}
         ${child.sections.map(s => `${s.title}: ${s.content}`).join("\n")}
         ```
       - Pass this combined block through `splitSectionContent(combinedChildrenText, 1500)` and emit each piece with `section: "nested-updates"` and header `${input.project} | ${input.name} | nested-updates\n${part}`.
   - In `computeContentHash(input)`:
     - Include `children` in the canonical JSON hash calculation so adding/updating a child triggers re-embedding of the parent.

2. **In `src/store.ts` (`SaveFeatureParams` & `saveFeature`):**
   - Add `parent_name?: string` to `SaveFeatureParams`.
   - When `saveFeature(env, params)` is called **WITH `parent_name`** (and `normalizeName(parent_name) !== normalizeName(name)`):
     1. Look up the parent feature in D1 (`WHERE project = ? AND name = ?`).
        - If the parent feature does not exist, throw a descriptive error: `Parent feature '${parentName}' not found in project '${project}'. Call list_features first or omit parent_name to create a top-level feature.`
     2. Parse the parent's existing `children_json` (`NestedChildEntry[]`), `sections_json`, `files_json`, and `tags_json`.
     3. Upsert the child entry in `children` array (keyed by `child.name === name`).
     4. Merge the child's `files` and `tags` into the parent's `files` and `tags` (deduplicated).
     5. If a standalone top-level feature with `(project, name)` previously existed in D1, automatically call `deleteFeature(env, project, name)` so it doesn't linger as a duplicate top-level feature!
     6. Re-compute the parent's chunks (via `chunkFeature` including `children`), re-embed the parent's chunks, update the parent row (`children_json`, `files_json`, `tags_json`, `content_hash`, `chunk_count`), refresh the parent's `chunks` / `chunks_fts` / `VECTORIZE` vectors, and prune any stale vectors if `oldChunkCount > newChunks.length`.
     7. Return `{ status: "updated", feature_id: parent.id, project, name: parent.name, nested_under: parent.name, child_name: name, chunks: parentChunks.length }`.
   - When `saveFeature(env, params)` is called **WITHOUT `parent_name`** (updating an existing parent feature):
     - Preserve its existing `children_json` (unless `children` is explicitly passed in `SaveFeatureParams`, which allows full import/edit).
   - Include `children: NestedChildEntry[]` in `FeatureRecord`, `getFeature`, `listFeatures`, and `exportAllFeatures`.

### Phase 3: MCP Tool Update (`src/mcp.ts`)
1. In `save_feature` tool schema (`src/mcp.ts`):
   - Add optional `parent_name`:
     ```ts
     parent_name: z
       .string()
       .optional()
       .describe(
         "Optional parent feature slug (e.g. 'feature-memory-server', 'web-explorer-ui'). ALWAYS provide parent_name when saving a bug fix, refactor, pattern, decision, or incremental sub-feature that belongs to an existing feature so it nests inside the parent and avoids vector bloat."
       ),
     ```
2. Update the `save_feature` tool description and `document-feature` prompt to instruct agents to pass `parent_name` whenever documenting fixes, refactors, decisions, or sub-enhancements to an existing feature.

### Phase 4: Visual Dashboard Support for Nested Children (`src/ui.ts`)
1. **Features Browser Card (`renderFeaturesList` in `src/ui.ts`):**
   - If a feature has `f.children && f.children.length > 0`, render a nested sub-list inside the card showing compact badges for each child:
     `🔧 dense-snippet-hydration`, `🧩 multi-chunk-rrf-bonus`, `✨ cross-encoder-reranker`, etc., plus a badge `Nested: ${f.children.length}`.
2. **Feature Detail Drawer (`openDrawer` in `src/ui.ts`):**
   - Render an expandable **"Nested Sub-Features, Fixes & Decisions (${feat.children.length})"** accordion/timeline section in the drawer showing each child's `type` badge, `name`, `updated_at`, `summary`, `files`, and expandable `sections`!
   - Add a **"+ Add Nested Fix / Update"** button inside the drawer that opens the Create/Edit Feature Modal with `project` and `parent_name` pre-filled!
3. **Create/Edit Feature Modal (`src/ui.ts`):**
   - Add an optional **"Parent Feature (`parent_name`)"** input/dropdown in the modal so users can also nest features from the UI.
4. **D3 Knowledge Graph (`getOverviewGraph` in `src/store.ts` & `renderGraph` in `src/ui.ts`):**
   - In `getOverviewGraph`, for each child in `f.children`, add a compact child node `child:${f.id}:${child.name}` (type `"child"`, subtype `child.type`) linked to `feat:${f.id}` (`type: "has_child"`) so the D3 Graph visually shows children branching off their parent feature!

### Phase 5: Consolidate Live `lekh` Project Data (40 Vectors $\rightarrow$ ~10 Vectors)
Write and run a one-off script `scripts/consolidate-lekh.ts` (or execute via MCP / API against `https://lekh-mcp.detox.workers.dev` after deploying) that:
1. Fetches the 8 standalone sub-features currently in `project: "lekh"`:
   - Under parent **`feature-memory-server`**:
     - `cross-encoder-reranker`
     - `multi-chunk-rrf-bonus`
     - `technical-token-sanitizer`
     - `cross-feature-relationships`
     - `mcp-prompts`
     - `dense-snippet-hydration`
   - Under parent **`web-explorer-ui`**:
     - `dashboard-feature-editor`
     - `json-backup-export-import`
2. Re-saves each of those 8 with `parent_name: "feature-memory-server"` or `parent_name: "web-explorer-ui"` (which automatically nests them into the parent's `children_json`, re-embeds the consolidated parent chunks, and deletes the standalone duplicate feature + its old vectors!).
3. Verify via `GET /api/stats` and `GET /api/overview` that:
   - `total_features` in `lekh` is **2** top-level features (`feature-memory-server` with 6 nested children, `web-explorer-ui` with 2 nested children).
   - `total_chunks` (vectors) in `lekh` dropped from **40 vectors** down to **~10–11 vectors total**!
4. Update `~/.gemini/AGENTS.md`, `~/.config/opencode/AGENTS.md`, and `docs/AGENT_INSTRUCTIONS.md` to mention `parent_name`.
