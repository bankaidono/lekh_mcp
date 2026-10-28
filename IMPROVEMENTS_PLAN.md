# Lekh MCP v2: Bug Fixes, 3-Stage Reranking & Feature Upgrades Plan

Handoff specification for Antigravity CLI (`agy`). Read this entire file before editing any code.

---

## 0. Rules for the Agent (Obey Strictly)

1. **Do not invent APIs.** Every Cloudflare Workers AI, Vectorize, D1, or MCP SDK call must match the verified schemas documented below and in `docs/VERIFIED.md`.
2. **Maintain `docs/VERIFIED.md`.** Whenever you verify a new runtime shape (such as `@cf/baai/bge-reranker-base` or MCP Prompts/Resources), append a row to `docs/VERIFIED.md` with the date, source URL/command, and exact observed shape.
3. **Bun usage only for local tooling.** Use `bun test`, `bun run typecheck`, `bun run e2e`, and `bunx wrangler ...`. Never use `Bun.*` runtime APIs or `bun:` imports inside `src/`.
4. **Confirmation Gates.** Ask the user for explicit approval only before `bunx wrangler deploy`. Local tests (`bun test`, `bun run typecheck`) and read-only checks do not require confirmation.
5. **No regressions.** Existing tools (`save_feature`, `search_features`, `get_feature`, `list_features`, `list_projects`, `delete_feature`, `delete_project`) and existing `/api/*` routes must remain backward-compatible while gaining the new capabilities.

---

## 1. Verified Facts for New Capabilities (Checked 2026-10-28)

| Capability | Verified Specification | Source |
|---|---|---|
| **Cross-Encoder Reranker Model** | Model ID: `@cf/baai/bge-reranker-base` on Workers AI (`env.AI.run`). Unit price: `$0.00311` per 1M input tokens. | `https://developers.cloudflare.com/workers-ai/models/bge-reranker-base/` |
| **Reranker Input Schema** | `{ query: string, top_k?: number, contexts: Array<{ text: string }> }`. Both `query` and `contexts` are required; `contexts` items must be `{ text: string }` with `minLength: 1`. The index in `contexts` is referenced as `id` in the output. | `https://developers.cloudflare.com/workers-ai/models/bge-reranker-base/schema-input.json` |
| **Reranker Output Schema** | `{ response: Array<{ id: number, score: number }> }` where `id` is the 0-based index into the request `contexts` array and `score` is the relevance score. | `https://developers.cloudflare.com/workers-ai/models/bge-reranker-base/schema-output.json` |

---

## 2. Detailed Breakdown of Bugs to Fix & Upgrades to Build

### Fix 1: Dense-Only Snippet Hydration Bug (`src/store.ts` & `src/rank.ts`)
- **Problem:** In `src/rank.ts`, `vectorMatches` from Vectorize only carry `{ vector_id, feature_id, score }`, whereas `ftsMatches` from D1 carry `{ vector_id, feature_id, section, text }`. When a chunk matches via **Vectorize only** (semantic paraphrase with zero keyword overlap in FTS5), `fInfo` is `undefined`, causing `matched_section` to hardcode-fallback to `"summary"` (`src/rank.ts:107`) and `matched_text` to be `""` (`src/rank.ts:108`), which then falls back to `f.summary` in `src/store.ts:442`.
- **Solution:**
  1. In `saveFeature` (`src/store.ts:252`), include `section: c.section` inside the Vectorize vector metadata alongside `feature_id`, `project`, `type`, `library`, and `importance`.
  2. In `searchFeatures` (`src/store.ts`), after `fuseAndGroupResults` identifies the top candidate features and their winning `best_vector_id`s, query D1 `chunks` for any `best_vector_id` whose `matched_text` is empty:
     ```sql
     SELECT vector_id, section, text FROM chunks WHERE vector_id IN (?, ?, ...)
     ```
  3. Hydrate `matched_section` and `matched_text` from D1 `chunks` so every semantic match returns the exact section title and chunk text that matched, and strip the leading `${project} | ${name} | ${section}\n` prefix when building `snippet` for cleaner display.

### Fix 2: Multi-Chunk RRF Bonus (`src/rank.ts`)
- **Problem:** `fuseAndGroupResults` currently sets a feature's `rrf_score` to `chunks[0].rrf` (only its single best chunk), ignoring when multiple chunks of the same feature match the query.
- **Solution:**
  1. In `fuseAndGroupResults` (`src/rank.ts`), sort a feature's matching chunks by `rrf` descending.
  2. Compute the feature's combined `rrf_score` as:
     $$\text{rrf\_score} = \text{chunks}[0].\text{rrf} + 0.25 \times \sum_{i=1}^{\min(\text{chunks.length}-1, 3)} \text{chunks}[i].\text{rrf}$$
  3. Add `matched_chunks_count: number` to `GroupedFeatureResult` and `SearchResult` so callers and the UI can see how many chunks corroborated the match.

### Fix 3: Eliminate N+1 D1 Queries in `listProjects` (`src/store.ts`)
- **Problem:** `listProjects` (`src/store.ts:577-615`) runs 1 `GROUP BY project` query and then loops over each project executing a separate `SELECT type, tags_json FROM features WHERE project = ?` query ($N+1$ round-trips).
- **Solution:**
  - Replace the loop with a single D1 query:
    ```sql
    SELECT
      project,
      COUNT(id) AS feature_count,
      COALESCE(SUM(chunk_count), 0) AS total_chunks,
      MAX(updated_at) AS last_updated,
      GROUP_CONCAT(DISTINCT type) AS types_csv,
      GROUP_CONCAT(tags_json, '||') AS all_tags_json
    FROM features
    GROUP BY project
    ORDER BY last_updated DESC
    ```
  - Parse `types_csv` (split on `,`) and `all_tags_json` (split on `||`, `JSON.parse` each array, deduplicate into a `Set<string>`) in memory. This reduces $N+1$ D1 queries to **1 query**.

### Fix 4: Smarter Technical Tokenizer & Query Sanitizer (`src/store.ts`)
- **Problem:** `sanitizeFts5Query` (`src/store.ts:90-102`) strips dots, slashes, and plus signs (`[^\w\s-]`), turning file paths (`src/store.ts`), model IDs (`qwen3-embedding-0.6b`), or shortcuts (`Cmd+K`) into noisy fragments.
- **Solution:**
  1. Enhance `sanitizeFts5Query(query)`:
     - Extract both full technical tokens (preserving internal `-`, `_`, `.`, `/`) and individual alphanumeric sub-tokens (filtering out common 1-character noise and stop words like `"how"`, `"what"`, `"the"`, `"is"`, `"in"`, `"to"`, `"for"`, `"and"`, `"or"`, `"with"`, `"we"`, `"do"`).
     - Quote each token safely as `"token"` and join with `OR`, and also include prefix matching `"token"*` for alphanumeric identifiers $\ge 4$ chars so partial symbol searches (e.g., `checkBear` $\rightarrow$ `checkBearer`) match in FTS5.
  2. Add a lightweight metadata keyword boost in `searchFeatures`: if a candidate feature's `name`, `library`, `tags`, or `files` contains an exact token from the query, add a small deterministic bonus (`+0.005`) to its `rrf_score`.

### Upgrade 5: Stage-3 Cross-Encoder Reranking with `@cf/baai/bge-reranker-base` (`src/embed.ts` & `src/store.ts`)
- **Architecture:**
  1. In `src/embed.ts`, add `rerankContexts(env: { AI: Ai }, query: string, contexts: string[]): Promise<Map<number, number>>`:
     - Calls `env.AI.run("@cf/baai/bge-reranker-base" as any, { query, contexts: contexts.map(text => ({ text })) })`.
     - Validates the response `{ response: Array<{ id: number, score: number }> }` and returns a `Map<number, number>` mapping context index `id` $\rightarrow$ `score`.
  2. In `SearchParams` (`src/store.ts` and `src/mcp.ts` `search_features`), add optional `rerank?: boolean` (default `true`).
  3. In `searchFeatures` (`src/store.ts`):
     - After Stage 1 (Vectorize + FTS5) and Stage 2 (RRF + D1 chunk text hydration for the top `Math.min(limit * 3, 15)` candidates):
     - If `params.rerank !== false` and there are $>1$ candidates, run `rerankContexts(env, query, candidates.map(c => c.hydrated_text))`.
     - Attach `rerank_score: number | null` to each `SearchResult`.
     - Compute the final sort order using combined score or reranker rank + RRF rank:
       $$\text{final\_score} = \text{rrf\_score} + 0.02 \times \text{sigmoid}(\text{rerank\_score})$$
       (or rank-fuse the reranker order with RRF so both retrieval consensus and cross-encoder precision contribute).
     - Wrap `rerankContexts` in a `try/catch` so if Workers AI reranker ever fails or is mocked in local unit tests, search gracefully falls back to Stage-2 RRF scores without throwing.

### Upgrade 6: Cross-Feature Relationships & `find_related_features` Tool (`src/store.ts` & `src/mcp.ts`)
- **Goal:** Let agents and the UI discover architectural relationships across features and projects.
- **Implementation:**
  1. In `src/store.ts`, implement `findRelatedFeatures(env: Env, projectInput: string, nameInput: string, limit = 5)`:
     - Fetch the target feature and its Chunk 0 (or re-embed its summary / query by its tags, files, and library).
     - Find related features across all projects using two signals:
       - **Structural overlap:** Other features in D1 that share `files`, `tags`, or `library`.
       - **Semantic similarity:** Query Vectorize with the target feature's summary embedding (`embedQuery(env, target.summary)`) to find semantically similar features in other projects.
     - Exclude the target feature itself, merge and score candidates, and return `{ project, name, type, library, similarity_score, shared_files, shared_tags, summary }[]`.
  2. Register `find_related_features` as Tool #8 in `src/mcp.ts`.
  3. Also include `related_features` in `GET /api/feature` response so the Feature Detail Drawer in the web UI shows clickable **"Related Features"** cards!
  4. In `getOverviewGraph` (`src/store.ts`), add `{ source: "feat:...", target: "feat:...", type: "shares_library" }` links when two features wrap the same `library`, enriching the D3 graph.

### Upgrade 7: MCP Prompts (`server.registerPrompt` in `src/mcp.ts`)
- Register 2 built-in MCP Prompts on `McpServer` (check `node_modules/@modelcontextprotocol/server` types for `server.registerPrompt` signature first and log it in `docs/VERIFIED.md`):
  1. `document-feature`: Takes `{ project: z.string(), name: z.string() }` and returns a structured prompt instructing the coding agent to inspect its recent changes and call `save_feature` with comprehensive `overview`, `architecture`, `edge-cases`, and `gotchas` sections.
  2. `check-prior-art`: Takes `{ topic: z.string(), project: z.string().optional() }` and returns a prompt instructing the agent to call `search_features` and `find_related_features` before writing new code.

### Upgrade 8: Web Dashboard Power Features (`src/ui.ts` & `src/index.ts`)
1. **Create / Edit Feature Modal in UI (`src/ui.ts` + `POST /api/feature` in `src/index.ts`):**
   - Add `POST /api/feature` in `src/index.ts` (authenticated with `checkBearer`) that calls `saveFeature(env, body)` so the browser UI can create or edit features directly.
   - Add a **"+ New Feature"** button in the header/Features view and an **"✏️ Edit"** button inside the Feature Detail Drawer that opens a clean modal with fields for `project`, `name`, `type`, `importance`, `library`, `summary`, `files` (comma/newline separated), `tags` (comma separated), and dynamic `sections` (`title` + `content`).
2. **1-Click JSON Export & Import Backup (`GET /api/export` & `POST /api/import`):**
   - `GET /api/export`: Returns a complete JSON bundle `{ version: 1, exported_at, features: [...] }` containing all full feature records from D1.
   - `POST /api/import`: Accepts `{ features: [...] }`, loops through and calls `saveFeature(env, f)` for each, returning `{ imported: number, unchanged: number }`.
   - Add **"⬇️ Export JSON"** and **"⬆️ Import JSON"** buttons in the Stats/Projects view so the user can back up or restore their entire memory bank in one click.
3. **Display Reranker Score & Multi-Chunk Badges in Search Playground (`src/ui.ts`):**
   - In `executeSearch()` in `src/ui.ts`, display the new `Rerank Score`, `Dense Cosine Score`, `FTS5 Match`, and `Matched Chunks Count` badges on search result cards, plus a checkbox toggle for ` Cross-Encoder Reranker (@cf/baai/bge-reranker-base)`.

---

## 3. Phased Execution Plan

### Phase 1: Verify Reranker & MCP Prompt Signatures
1. Inspect `node_modules/@modelcontextprotocol/server` type definitions to verify `registerPrompt` (and/or `registerResource`) exact TypeScript signatures.
2. Log `@cf/baai/bge-reranker-base` and MCP prompt signatures in `docs/VERIFIED.md`.
- **Verify:** `docs/VERIFIED.md` updated.

### Phase 2: Core Engine Fixes & Reranker (`src/embed.ts`, `src/rank.ts`, `src/store.ts`)
1. Update `src/embed.ts` with `rerankContexts(env, query, contexts)`.
2. Update `src/rank.ts` with multi-chunk RRF bonus (`+ 0.25 * sum(other_chunks)`) and `matched_chunks_count`.
3. Update `src/store.ts`:
   - Fix `sanitizeFts5Query` (stopword filtering + technical token preservation + prefix matching).
   - Fix dense-only snippet hydration by querying `chunks WHERE vector_id IN (...)` and stripping the `${project} | ${name} | ${section}\n` prefix for clean snippets.
   - Integrate Stage-3 `rerankContexts` in `searchFeatures` with graceful fallback.
   - Collapse `listProjects` into a single `GROUP BY` SQL query (eliminating N+1 queries).
   - Add `findRelatedFeatures` and `exportAllFeatures` / `importFeatures`.
- **Verify:** Update and add unit tests in `tests/rank.test.ts` and `tests/store.test.ts`. Run `bun test` and `bun run typecheck`.

### Phase 3: MCP Tools, Prompts & API Routes (`src/mcp.ts`, `src/index.ts`)
1. In `src/mcp.ts`:
   - Add `rerank` boolean parameter to `search_features`.
   - Register `find_related_features` tool.
   - Register `document-feature` and `check-prior-art` MCP prompts.
2. In `src/index.ts`:
   - Add `POST /api/feature` (calls `saveFeature`).
   - Add `GET /api/export` and `POST /api/import`.
   - Include `related_features` in `GET /api/feature`.
- **Verify:** `bun run typecheck` and `bun test` pass with 0 errors.

### Phase 4: Dashboard UI Upgrades (`src/ui.ts`)
1. Add **Create / Edit Feature Modal** (`+ New Feature` button and `✏️ Edit` button in the Feature Drawer).
2. Add **Related Features** section in the Feature Drawer.
3. Add **Export JSON** / **Import JSON** buttons.
4. Update **Search Playground** to show `Rerank`, `RRF`, `Dense`, `FTS5`, and `Chunks Matched` badges, plus a `Rerank` toggle.
- **Verify:** `bun run typecheck` passes.

### Phase 5: End-to-End Tests, Live Benchmark & Deploy (CONFIRMATION GATE for Deploy)
1. Update `scripts/e2e.ts` to test:
   - Dense-only snippet hydration (`vector_score !== null` and real `matched_section` / `snippet`).
   - Stage-3 reranker scores (`rerank_score !== null` against live Worker).
   - `find_related_features` tool.
   - `POST /api/feature` and `GET /api/export`.
2. Update `docs/EVAL.md` with real `Cosine Score`, `Rerank Score`, and `RRF Score` columns (no `N/A` values!).
3. **STOP & ASK USER** before running `bunx wrangler deploy`.
4. After deploy approval, deploy to `https://lekh-mcp.detox.workers.dev` and run `bun run e2e` against the live deployment.
