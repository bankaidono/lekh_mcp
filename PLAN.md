# Feature Memory MCP (`lekh`): Zero-Hallucination Build Plan

Handoff document for Antigravity CLI (`agy`). Read this entire file before executing any command or writing any code.

---

## 0. Rules for the Agent (Read First, Obey Strictly)

1. **Do not invent APIs.** Every Cloudflare, MCP SDK, Wrangler, D1, Vectorize, or Bun call you use must be confirmed against the official documentation URL listed in this plan (or discovered via `https://developers.cloudflare.com/llms.txt`) BEFORE you write code that depends on it. Where this plan and live official docs disagree, **the live docs win** — record the discrepancy in `docs/VERIFIED.md` and report it.
2. **Maintain `docs/VERIFIED.md`.** Create `docs/VERIFIED.md` in Phase 0. For every external API, CLI flag, or response shape you rely on, log one row:
   `Component/API | Source URL or CLI command | Date Checked | Exact Signature / Observed JSON Shape`
   If anything cannot be verified, mark it `UNVERIFIED` and stop to ask the user.
3. **Never guess runtime response shapes.** For Workers AI (`@cf/qwen/qwen3-embedding-0.6b`) and Vectorize (`upsert`, `query`, `deleteByIds`), execute a real call in Phase 3 / Phase 4, inspect the raw JSON output, record the exact shape in `docs/VERIFIED.md`, and write your TypeScript types and logic against that observed output.
4. **Stop and ask the user** (do not continue) when:
   - A command fails twice for the same reason.
   - Official documentation contradicts this plan in a way that alters the architecture.
   - You reach a **Confirmation Gate** (creating remote Cloudflare resources, setting secrets, applying remote D1 migrations, deploying, or running Phase 10 Jev).
5. **Confirmation Gates.** Ask the user for explicit approval before the FIRST run of each of these:
   - `bunx wrangler login` (if not already authenticated)
   - `bunx wrangler d1 create ...`
   - `bunx wrangler d1 migrations apply ... --remote`
   - `bunx wrangler vectorize create ...` and `bunx wrangler vectorize create-metadata-index ...`
   - `bunx wrangler secret put ...`
   - `bunx wrangler deploy`
6. **Secrets & Hygiene.** Never print, log, commit, or paste secret values in reports or code. `.dev.vars` and `.env*` must be in `.gitignore` before any file is created. Never hardcode `MCP_AUTH_TOKEN`.
7. **Bun usage.** Bun is the package manager, test runner, and local script runner ONLY. Production code runs on the **Cloudflare Workers runtime** (`workerd`), NOT Bun.
   - Do **not** use `Bun.*` APIs, `bun:` imports, or Node-only APIs unsupported by `workerd` inside `src/`.
   - Enable `"compatibility_flags": ["nodejs_compat"]` in `wrangler.jsonc` (required by `agents/mcp/server` for `AsyncLocalStorage` and allows standard Web/Node `crypto`).
   - Use `bun add`, `bun install`, `bun test`, `bun run`, and `bunx wrangler ...`.
   - Commit `bun.lock` (or `bun.lockb` depending on installed Bun version). Never generate `package-lock.json` or `yarn.lock`.
8. **Small, verifiable steps.** After each phase, run the phase's **Verify** commands, check the real output, and only advance when every check passes.
9. **No placeholders in final code.** No `TODO`, no fake database/index IDs, no stubbed tools or mocked responses in `src/`.
10. **Report format after every phase:**
    - **(a) Files changed/created**
    - **(b) Commands run and their real output**
    - **(c) Verification updates added to `docs/VERIFIED.md`**
    - **(d) Next phase or Confirmation Gate request**

---

## 1. Goal & Scope

Build a **remote MCP server + visual knowledge explorer on a single Cloudflare Worker** that stores feature documentation written by coding agents and lets any agent (or developer) search and inspect it across projects.

### Stack (Fixed)
- **Runtime:** Cloudflare Workers (TypeScript, ES Modules, `nodejs_compat`)
- **Package Manager & Test Runner:** Bun (`bun`, `bun test`, `bunx wrangler`)
- **MCP Transport:** `createMcpHandler` from `agents/mcp/server` + `McpServer` from `@modelcontextprotocol/server` (v2 stateless Streamable HTTP at `/mcp`)
- **Embeddings:** Cloudflare Workers AI `@cf/qwen/qwen3-embedding-0.6b`
- **Dense Vector Store:** Cloudflare Vectorize (cosine metric, 1024 dimensions)
- **Document Store & Keyword Search:** Cloudflare D1 (SQLite tables + **FTS5 BM25** virtual table for hybrid search with Reciprocal Rank Fusion)
- **Auth (v1):** Bearer token verified via constant-time comparison (`crypto.subtle.timingSafeEqual`) against `env.MCP_AUTH_TOKEN`
- **Visual Web Dashboard:** Single-page HTML/JS dashboard served at `GET /` with JSON inspection endpoints at `/api/*` (protected by the same `MCP_AUTH_TOKEN`)

### Out of Scope for v1 (Do NOT Build)
- OAuth / user accounts (static Bearer token only in v1)
- Cross-encoder reranker model
- Automated git repository scanning / code indexing

---

## 2. Facts Already Verified Against Live Docs (Checked 2026-10-28)

Re-verify these in Phase 0 and record them in `docs/VERIFIED.md`:

| Fact | Verified Detail | Official Source |
|---|---|---|
| **Stateless MCP Handler** | Import `createMcpHandler` from `"agents/mcp/server"` and `McpServer` from `"@modelcontextprotocol/server"`. Pass a **factory function** `() => McpServer` so every request gets a fresh server instance. Create the handler at module scope or call inside `fetch`. Requires `"nodejs_compat"` flag in `wrangler.jsonc`. | `https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/` |
| **Package Versions** | `bun add agents @modelcontextprotocol/server@2.3.1 zod` (`@modelcontextprotocol/server` is a peer dependency of `agents`; check `node_modules/agents/package.json` `peerDependencies` after installing `agents` to confirm the exact pinned version, which is `2.3.1` as of Oct 2026, **not** `2.0.0`). | `https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/` |
| **Tool Registration** | `server.registerTool(name, { description, inputSchema: z.object({...}) }, async (args) => ({ content: [{ type: "text", text: JSON.stringify(...) }] }))`. | `https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/` |
| **Qwen3 Embedding Model** | Model ID: `@cf/qwen/qwen3-embedding-0.6b`. Context window: `8,192` tokens. Output dimension: **`1024`**. Output JSON schema: `{ data: number[][], shape: [batch_size, 1024] }`. | `https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/` & `schema-output.json` |
| **Qwen3 Input Schema & Batch Limit** | Supports `documents: string \| string[]` (or alias `text`) for passages, and `queries: string \| string[]` + optional `instruction: string` for asymmetric query embedding. **Hard schema limit: `maxItems: 32`** per call on `documents`, `text`, and `queries`. | `https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/schema-input.json` |
| **Vectorize V2 Limits** | Max dimensions: `1536` (float32). Max vector ID length: **`64 bytes`**. Max metadata per vector: `10 KiB`. Max `topK` with metadata/values: **`50`** (`100` without). Max upsert batch size from Worker: `1,000`. Max metadata indexes per index: `10` (indexed value up to `64 bytes`). | `https://developers.cloudflare.com/vectorize/platform/limits/` |
| **Vectorize Metadata Indexing Rule** | Metadata indexes (`wrangler vectorize create-metadata-index`) **must be created BEFORE vectors are inserted**. Vectors inserted before a metadata index exists are not matched by filters until re-upserted. | `https://developers.cloudflare.com/vectorize/reference/metadata-filtering/` |

---

## 3. Architecture & Data Model

```text
Agent (Claude Code / Cursor / agy / OpenCode)        Browser (Developer)
   │  POST /mcp (Authorization: Bearer <token>)         │  GET / (UI) & /api/* (Bearer <token>)
   ▼                                                    ▼
Cloudflare Worker (src/index.ts) ◄──────────────────────┘
   ├─ src/auth.ts   ──► Constant-time Bearer token check (env.MCP_AUTH_TOKEN)
   ├─ src/mcp.ts    ──► createMcpHandler(factory) exposing 6 MCP tools
   ├─ src/ui.ts     ──► Visual Dashboard (Overview, Knowledge Graph, Hybrid Search Inspector)
   ├─ env.AI        ──► @cf/qwen/qwen3-embedding-0.6b (documents vs queries+instruction, batch <= 32)
   ├─ env.VECTORIZE ──► Dense chunk embeddings (1024d, cosine, ID: "f{featureId}-c{idx}")
   └─ env.DB (D1)   ──► features + chunks + chunks_fts (SQLite FTS5 BM25 keyword index)
```

### D1 Schema (`migrations/0001_init.sql`)

```sql
CREATE TABLE IF NOT EXISTS features (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project       TEXT NOT NULL,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'feature',   -- feature | pattern | decision | fix | refactor
  importance    INTEGER NOT NULL DEFAULT 2,        -- 1 low, 2 normal, 3 high
  library       TEXT,                              -- e.g. wrapped third-party library, nullable
  summary       TEXT NOT NULL,
  sections_json TEXT NOT NULL,                     -- JSON array of {title, content}
  files_json    TEXT NOT NULL DEFAULT '[]',        -- JSON array of strings
  tags_json     TEXT NOT NULL DEFAULT '[]',        -- JSON array of strings
  content_hash  TEXT NOT NULL,                     -- SHA-256 hex of canonical input
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  indexed_at    TEXT,                              -- null until vectors are confirmed written in Vectorize
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project, name)
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id  INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  project     TEXT NOT NULL,
  idx         INTEGER NOT NULL,
  section     TEXT NOT NULL,
  text        TEXT NOT NULL,                       -- Contextualized text: "{project} | {name} | {section}\n{body}"
  vector_id   TEXT NOT NULL UNIQUE,                -- "f{featureId}-c{idx}" (always < 64 bytes)
  UNIQUE (feature_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_features_project ON features(project, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_features_type ON features(type);
CREATE INDEX IF NOT EXISTS idx_chunks_feature ON chunks(feature_id);

-- FTS5 Virtual Table for fast BM25 keyword / symbol / file-path retrieval
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  vector_id UNINDEXED,
  feature_id UNINDEXED,
  project,
  section,
  text,
  tokenize='porter unicode61'
);
```

### Vector IDs & Metadata Rules
- **Vector ID:** `f${featureId}-c${idx}` (e.g., `f12-c0`). Never use `project:feature:chunk` strings because Vectorize enforces a hard **64-byte** limit on vector IDs.
- **Vector Metadata:**
  ```ts
  {
    feature_id: number,
    project: string,     // normalized lowercase-kebab (<= 64 bytes)
    type: string,        // feature | pattern | decision | fix | refactor
    library: string,     // normalized or "" if null
    importance: number   // 1 | 2 | 3
  }
  ```
- **Metadata Indexes (create in Phase 4 before any vectors):**
  - `project` (`string`)
  - `type` (`string`)
  - `library` (`string`)
  - `importance` (`number`)

### Chunking & Contextual Header Rules (`src/chunk.ts`)
1. **Chunk 0 (Summary & Files):**
   - Section title: `"summary"`
   - Body includes `summary`, plus if `files` or `tags` are non-empty: `\nFiles: ${files.join(", ")}\nTags: ${tags.join(", ")}`.
2. **Section Chunks (1..N):**
   - One chunk per item in `sections`.
   - If a section's `content` exceeds **1,500 characters**, split it at paragraph boundaries (`\n\n`) into chunks of at most ~1,500 characters (if a single paragraph exceeds 1,500 characters, split at sentence or line boundaries).
3. **Contextual Header Prefix:**
   - Every chunk's `text` field MUST start with:
     `${project} | ${name} | ${sectionTitle}\n${chunkBody}`
   - This exact `text` is stored in `chunks.text`, indexed in `chunks_fts`, and sent to `@cf/qwen/qwen3-embedding-0.6b`.
4. **Content Hash (`computeContentHash`):**
   - Compute SHA-256 hex via `crypto.subtle.digest("SHA-256", ...)` over canonical JSON `{ project, name, type, importance, library, summary, sections, files, tags }`.

---

## 4. Tool Contracts (Exactly 6 MCP Tools)

All tool inputs use `zod` (`z.object({...})`) with `.describe(...)` on every field. Tool handlers return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`. On validation or operational errors, return `{ isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] }` — never leak raw stack traces.

1. **`save_feature`** (Idempotent upsert keyed on `(project, name)`)
   - **Input:**
     - `project`: `z.string()` (normalized via `normalizeName`)
     - `name`: `z.string()` (normalized via `normalizeName`)
     - `summary`: `z.string().min(10).max(2000)`
     - `sections`: `z.array(z.object({ title: z.string().min(1), content: z.string().min(1) })).min(1).max(20)`
     - `type`: `z.enum(["feature", "pattern", "decision", "fix", "refactor"]).default("feature")`
     - `importance`: `z.number().int().min(1).max(3).default(2)`
     - `library`: `z.string().optional()`
     - `files`: `z.array(z.string()).default([])`
     - `tags`: `z.array(z.string()).default([])`
   - **Execution Order:**
     1. Normalize `project`, `name`, `tags`, and optional `library`.
     2. Compute `content_hash`. Check D1 if `(project, name)` already exists:
        - If it exists AND `existing.content_hash === content_hash` AND `existing.indexed_at !== null`, skip re-embedding and return `{ status: "unchanged", feature_id: existing.id, chunks: existing.chunk_count }`.
     3. Build chunks via `chunkFeature(...)`.
     4. Embed all chunk texts using `embedDocuments(env, chunkTexts)` (calls `@cf/qwen/qwen3-embedding-0.6b` with `{ documents: batch }` in batches of $\le 32$). Verify every returned vector has length `1024`. (Embedding happens *before* mutating D1 so a transient AI failure leaves existing data intact).
     5. Upsert the `features` row in D1 (`indexed_at = NULL` initially, preserving `created_at` on update) and retrieve `feature_id` and `old_chunk_count`.
     6. In a `env.DB.batch([...])`:
        - Delete old rows for `feature_id` from `chunks` and `chunks_fts`.
        - Insert new rows into `chunks` and `chunks_fts` with `vector_id = f${feature_id}-c${idx}`.
     7. Upsert vectors into `env.VECTORIZE.upsert(...)` with IDs `f${feature_id}-c${idx}` and metadata `{ feature_id, project, type, library: library ?? "", importance }`.
     8. If `old_chunk_count > newChunks.length`, call `env.VECTORIZE.deleteByIds(...)` for stale IDs `f${feature_id}-c${newChunks.length}` through `f${feature_id}-c${old_chunk_count - 1}`.
     9. Update `features` in D1: `SET indexed_at = datetime('now'), chunk_count = ? WHERE id = ?`.
   - **Output:** `{ status: "created" | "updated" | "unchanged", feature_id, project, name, chunks }`.

2. **`search_features`** (Hybrid Search: Dense Vectorize + Sparse D1 FTS5 with Reciprocal Rank Fusion)
   - **Input:**
     - `query`: `z.string().min(1)`
     - `project`: `z.string().optional()`
     - `type`: `z.enum(["feature", "pattern", "decision", "fix", "refactor"]).optional()`
     - `library`: `z.string().optional()`
     - `limit`: `z.number().int().min(1).max(20).default(5)`
   - **Execution Order:**
     1. Run Dense and Sparse searches concurrently via `Promise.all`:
        - **Dense (Vectorize):** Embed `query` via `embedQuery(env, query)` (uses `{ queries: [query], instruction: "Given a software engineering search query, retrieve relevant feature architecture, implementation patterns, and documentation passages" }`). Query `env.VECTORIZE.query(vector, { topK: Math.min(limit * 4, 50), returnMetadata: "all", filter })`.
        - **Sparse (D1 FTS5):** Sanitize `query` into safe FTS5 tokens (strip FTS5 syntax characters like `"`, `*`, `^`, `:`, `(`, `)`, join words with `OR`), query `chunks_fts` with `bm25(chunks_fts)` ranking (`LIMIT 30`), optionally filtering by `project`.
     2. **Reciprocal Rank Fusion (RRF) & Feature Grouping (`src/rank.ts`):**
        - For each chunk $c$, compute:
          $$\text{rrf}(c) = \frac{1}{60 + \text{rank}_{\text{vec}}(c)} + \frac{1}{60 + \text{rank}_{\text{fts}}(c)}$$
          (where rank is 1-based; omit term if not present in that list).
        - Group chunks by `feature_id`. A feature's score is its best chunk's `rrf` score (also retain `vector_score` and `fts_rank` for debugging/UI).
     3. Fetch the top `limit` feature rows + winning chunk text from D1 (applying `type`/`library` filter in SQL as well if provided).
     4. Return array of `{ feature_id, project, name, type, importance, library, rrf_score, vector_score, fts_matched, matched_section, snippet, summary, files, tags, updated_at }`.

3. **`get_feature`**
   - **Input:** `project: z.string()`, `name: z.string()`.
   - **Output:** Full feature object (`id`, `project`, `name`, `type`, `importance`, `library`, `summary`, `sections`, `files`, `tags`, `chunk_count`, `indexed_at`, `created_at`, `updated_at`). If not found, return `isError: true` with hint to call `list_features` or `list_projects`.

4. **`list_features`**
   - **Input:** `project?: z.string()`, `type?: z.enum(...)`, `tag?: z.string()`, `limit?: z.number().int().min(1).max(200).default(50)`.
   - **Output:** Array of `{ id, project, name, type, importance, library, summary, files, tags, chunk_count, updated_at }`.

5. **`list_projects`**
   - **Input:** `{}` (no required args).
   - **Behavior:** Aggregates across `features` in D1 (`GROUP BY project`) returning project stats.
   - **Output:** Array of `{ project, feature_count, total_chunks, last_updated, types: string[], tags: string[] }`.

6. **`delete_feature`**
   - **Input:** `project: z.string()`, `name: z.string()`.
   - **Behavior:** Look up `feature` and all its `vector_id`s from `chunks`. Call `env.VECTORIZE.deleteByIds(vectorIds)`, delete from `chunks_fts`, `chunks`, and `features`.
   - **Output:** `{ deleted: boolean, project, name, vectors_removed: number }`.

---

## 5. Visual Web Dashboard & API (`GET /` and `/api/*`)

To give the user a rich visual representation of what the MCP server stores without requiring separate hosting:

1. **Public HTML Shell (`GET /`):**
   - Serves a clean, dark-mode Single-Page Application (`src/ui.ts`) built with Tailwind CSS (via CDN) and D3.js (`d3-force` via CDN for the interactive graph).
   - On load, checks `localStorage.getItem("lekh_token")`. If missing or `401`, prompts for the Bearer token (`MCP_AUTH_TOKEN`). Never embeds the secret in the HTML source.
2. **Authenticated JSON API (`/api/*` — requires `Authorization: Bearer <token>`):**
   - `GET /api/overview`: Returns `{ projects, features, stats, graph: { nodes, links } }` where:
     - `nodes` include Projects, Features, Tags, and shared Files.
     - `links` connect `Project -> Feature`, `Feature -> Tag`, and `Feature -> File` so the user can visually see how features connect across files and tags.
   - `GET /api/feature?project=...&name=...`: Returns the full feature record **plus** all rows from `chunks` (`idx`, `vector_id`, `section`, `text`) so the user can inspect exact chunk boundaries.
   - `POST /api/search`: Runs `search_features` and returns the hybrid search breakdown (`rrf_score`, `vector_score`, `fts_matched`, `matched_section`, `snippet`).
3. **Three Interactive Views in the UI:**
   - **Knowledge Graph View:** Force-directed interactive graph (`Project` $\leftrightarrow$ `Feature` $\leftrightarrow$ `Tag` / `File`). Clicking a feature node opens its full documentation and chunk drawer.
   - **Projects & Features Browser:** Filter by project, type, or tag; view formatted sections, file paths, and exact embedded chunks (`f{id}-c{idx}`).
   - **Hybrid Search Playground:** Type a query, filter by project/type, and inspect side-by-side `RRF Score`, `Vectorize Cosine Score`, and `D1 FTS5 Match` badges.

---

## 6. Phased Implementation Plan

### Phase 0: Preflight & Docs Verification (No Code Yet)
1. Run `bun --version`, `node --version`, `git --version`, and `bunx wrangler --version`.
2. Check authentication status with `bunx wrangler whoami`.
3. Fetch and verify the official docs:
   - `https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/index.md`
   - `https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/index.md`
   - `https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/schema-input.json`
   - `https://developers.cloudflare.com/vectorize/platform/limits/index.md`
4. Create `docs/VERIFIED.md` recording the versions and verified API facts.
- **Verify:** `docs/VERIFIED.md` exists and is populated.

### Phase 1: Project Scaffold (Local Only)
1. Run `git init` (if not already a git repo) and create `.gitignore` (`node_modules/`, `.wrangler/`, `.dev.vars`, `.env*`, `dist/`).
2. Create `package.json` with scripts:
   - `"dev": "wrangler dev"`
   - `"types": "wrangler types"`
   - `"test": "bun test"`
   - `"typecheck": "tsc --noEmit"`
   - `"deploy": "wrangler deploy"`
3. Install dependencies with Bun:
   ```bash
   bun add agents @modelcontextprotocol/server@2.3.1 zod
   bun add -d wrangler typescript @types/node
   ```
   *(Verify `node_modules/agents/package.json` `peerDependencies` to confirm `@modelcontextprotocol/server` version matches cleanly).*
4. Create `tsconfig.json` and `wrangler.jsonc` (`name: "lekh-mcp"`, `main: "src/index.ts"`, `compatibility_date: "2026-10-28"`, `compatibility_flags: ["nodejs_compat"]`).
5. Create a minimal `src/index.ts` returning `new Response("ok")` on `/health` and run `bunx wrangler types`.
- **Verify:** `bun run typecheck` passes with 0 errors.

### Phase 2: Cloudflare D1 Setup & Local Migrations (CONFIRMATION GATE for Remote)
1. Write `migrations/0001_init.sql` with the exact schema from Section 3 (`features`, `chunks`, `chunks_fts`).
2. **STOP & ASK USER** before running `bunx wrangler d1 create lekh-db`.
3. Once approved, create `lekh-db`, copy the real `database_id` into `wrangler.jsonc` under `d1_databases` (`binding: "DB"`), and add `"ai": { "binding": "AI" }`.
4. Apply the migration locally:
   ```bash
   bunx wrangler d1 migrations apply lekh-db --local
   ```
5. Re-run `bunx wrangler types`.
- **Verify:**
  `bunx wrangler d1 execute lekh-db --local --command "SELECT name FROM sqlite_master WHERE type='table'"` lists `features`, `chunks`, and `chunks_fts`.

### Phase 3: Measure & Verify `@cf/qwen/qwen3-embedding-0.6b`
1. Add a temporary dev route `GET /__dev/test-embed` in `src/index.ts` that calls:
   - `env.AI.run("@cf/qwen/qwen3-embedding-0.6b", { documents: ["hello world", "dropdown component"] })`
   - `env.AI.run("@cf/qwen/qwen3-embedding-0.6b", { queries: ["how is dropdown built"], instruction: "Given a software engineering query, retrieve relevant docs" })`
   and returns `{ shape, dim: data[0].length, isArray: Array.isArray(data) }`.
2. Run `bunx wrangler dev` (using `--remote` if needed for Workers AI binding) and curl `/__dev/test-embed`.
3. Record the exact observed response shape and dimension `D` (`1024`) in `docs/VERIFIED.md`.
- **Verify:** `D === 1024` is confirmed and logged in `docs/VERIFIED.md`.

### Phase 4: Vectorize Index & Metadata Indexes (CONFIRMATION GATE)
1. **STOP & ASK USER** for approval to create the Vectorize index `lekh-vectors` with `--dimensions=1024 --metric=cosine` and its 4 metadata indexes.
2. Once approved, run:
   ```bash
   bunx wrangler vectorize create lekh-vectors --dimensions=1024 --metric=cosine
   bunx wrangler vectorize create-metadata-index lekh-vectors --property-name=project --type=string
   bunx wrangler vectorize create-metadata-index lekh-vectors --property-name=type --type=string
   bunx wrangler vectorize create-metadata-index lekh-vectors --property-name=library --type=string
   bunx wrangler vectorize create-metadata-index lekh-vectors --property-name=importance --type=number
   ```
3. Add the `vectorize` binding (`binding: "VECTORIZE"`, `index_name: "lekh-vectors"`) to `wrangler.jsonc` and run `bunx wrangler types`.
4. Test a single vector upsert, filtered query, and `deleteByIds` via the temporary dev route, record the exact responses in `docs/VERIFIED.md`, and then remove the temporary dev route.
- **Verify:** Upsert, filtered query, and delete succeed; shapes recorded in `docs/VERIFIED.md`.

### Phase 5: Pure Core Modules & Unit Tests (`bun test`)
Implement and unit-test with `bun test`:
1. `src/names.ts`: `normalizeName(input)` — lowercase, trim, spaces/underscores to `-`, strip non-`[a-z0-9-]`, collapse multiple `-`, reject empty or >60 chars.
2. `src/auth.ts`: `checkBearer(request, expectedToken)` — extracts `Bearer <token>`, encodes both strings with `TextEncoder`, hashes or pads to fixed 32-byte SHA-256 digests, and compares with `crypto.subtle.timingSafeEqual`. Rejects if `expectedToken` is empty/undefined.
3. `src/chunk.ts`: `chunkFeature(input)` and `computeContentHash(input)` — implements Chunk 0 summary+files+tags, section splitting at 1,500 chars on paragraph breaks, and `{project} | {name} | {section}\n` prefixing.
4. `src/rank.ts`: `fuseAndGroupResults(vectorMatches, ftsMatches)` — implements Reciprocal Rank Fusion ($k=60$), deduplicates by `vector_id`, groups by `feature_id`, picks the best chunk per feature, and breaks ties by `importance` DESC then `updated_at` DESC.
5. `src/embed.ts`: `embedDocuments(env, texts)` (batches of $\le 32$, validates length `1024`) and `embedQuery(env, query)`.
6. `src/store.ts`: D1 + FTS5 + Vectorize operations (`saveFeature`, `searchFeatures`, `getFeature`, `listFeatures`, `listProjects`, `deleteFeature`, `getOverviewGraph`).
- **Verify:** `bun test` passes all unit tests (`names.test.ts`, `auth.test.ts`, `chunk.test.ts`, `rank.test.ts`) and `bun run typecheck` passes.

### Phase 6: MCP Server (`src/mcp.ts`) & Visual Dashboard (`src/ui.ts`, `src/index.ts`)
1. Implement `createServer(env: Env)` in `src/mcp.ts` using `new McpServer({ name: "lekh-feature-memory", version: "1.0.0" })` and register all **6 tools**:
   - `save_feature`
   - `search_features`
   - `get_feature`
   - `list_features`
   - `list_projects`
   - `delete_feature`
2. Implement `src/ui.ts` serving the single-page Visual Dashboard at `GET /` (Overview stats, D3 Force-Directed Knowledge Graph of Projects/Features/Tags/Files, Feature Chunk Inspector, and Live Hybrid Search Debugger).
3. Wire `src/index.ts`:
   - `GET /` $\rightarrow$ returns HTML dashboard (200 OK).
   - `GET /health` $\rightarrow$ returns `{ status: "ok" }` (200 OK).
   - `/mcp` and `/api/*` $\rightarrow$ require `checkBearer(request, env.MCP_AUTH_TOKEN)`. If unauthorized, return `401` with `WWW-Authenticate: Bearer`.
   - `/mcp` $\rightarrow$ delegates to `createMcpHandler(() => createServer(env))(request, env, ctx)`.
   - `/api/overview`, `/api/feature`, `/api/search` $\rightarrow$ call `src/store.ts` functions and return JSON.
- **Verify:**
  - `bun run typecheck` and `bun test` pass.
  - With `.dev.vars` containing a local test `MCP_AUTH_TOKEN`, start `bunx wrangler dev`:
    - `curl -i http://localhost:<port>/mcp` without header returns `401`.
    - `curl -i http://localhost:<port>/` returns `200` with the HTML dashboard.
    - Connect via MCP client or JSON-RPC POST to `/mcp` with `Authorization: Bearer <token>` and verify `tools/list` returns all 6 tools.

### Phase 7: End-to-End Integration & Retrieval Evaluation
1. Create `scripts/e2e.ts` (run via `bun run scripts/e2e.ts`) that connects to the running Worker and verifies:
   - `save_feature` creates a feature (`status: "created"`).
   - Re-saving identical content returns `status: "unchanged"`.
   - Updating with modified content returns `status: "updated"` and updates chunks without growing stale vectors.
   - Re-saving with *fewer* sections removes leftover vectors from Vectorize and `chunks_fts`.
   - `search_features` finds features both by semantic paraphrase (Vectorize) and exact file path / symbol identifier (FTS5).
   - `list_projects`, `list_features`, `get_feature`, and `delete_feature` work as specified.
   - `/api/overview` returns valid graph nodes and edges.
2. Seed 10–15 realistic sample features across 2 projects, run 10 evaluation queries (comparing semantic, exact identifier, and filtered queries), record Recall@1 and Recall@3 in `docs/EVAL.md`, and clean up test data afterward.
- **Verify:** `scripts/e2e.ts` passes 100% of assertions and `docs/EVAL.md` is written.

### Phase 8: Production Secret, Remote Migration & Deploy (CONFIRMATION GATE)
1. Confirm no dev routes remain and `git status` shows no tracked secrets (`.dev.vars` is git-ignored).
2. **STOP & ASK USER** before:
   - Applying remote D1 migration: `bunx wrangler d1 migrations apply lekh-db --remote`
   - Setting production secret `MCP_AUTH_TOKEN` (`bunx wrangler secret put MCP_AUTH_TOKEN`)
   - Deploying: `bunx wrangler deploy`
3. Smoke-test the deployed `https://<worker>.workers.dev` endpoint (`/health`, `401` check on `/mcp`, authenticated `tools/list`, and `/` dashboard).
4. Write `README.md` and `docs/AGENT_INSTRUCTIONS.md` with exact connection commands for Claude Code, Cursor, Antigravity (`agy`), and OpenCode.

---

## 7. Agent Instructions Snippet (`docs/AGENT_INSTRUCTIONS.md`)

```markdown
## Feature Memory MCP (`lekh`)

- **Before building a non-trivial feature or component:**
  1. Call `list_projects` or `search_features` with a description, component name, or file path to check how similar features or patterns were implemented across projects.
  2. Call `get_feature` on the best match to review its architecture, library choices, and gotchas.
- **After completing a feature, reusable pattern, architectural decision, or tricky bug fix:**
  - Call `save_feature` once:
    - `project`: this repository's slug in `lowercase-kebab` (e.g., `"lekh-web"`, `"billing-service"`).
    - `name`: short feature/component slug in `lowercase-kebab` (e.g., `"dropdown-menu"`, `"jwt-auth-middleware"`).
    - `type`: `"feature" | "pattern" | "decision" | "fix" | "refactor"`.
    - `importance`: `1` (low), `2` (normal), or `3` (high/critical architecture).
    - `library`: primary third-party library wrapped or used, if applicable.
    - `summary`: 2–4 sentences explaining what it does, why it exists, and when to reuse it.
    - `sections`: structured breakdown (`overview`, `architecture`, `edge-cases`, `gotchas`).
    - `files`: array of key repository-relative file paths touched.
    - `tags`: lowercase tags for cross-cutting concerns (e.g., `["auth", "security", "middleware"]`).
- Calling `save_feature` again with the same `(project, name)` safely updates the existing record.
```

---

## 8. Final Acceptance Checklist

- [ ] `docs/VERIFIED.md` logs every external API, CLI command, and observed response shape; zero `UNVERIFIED` items remain.
- [ ] All 6 MCP tools (`save_feature`, `search_features`, `get_feature`, `list_features`, `list_projects`, `delete_feature`) work end-to-end.
- [ ] Hybrid Search (Vectorize 1024-dim cosine + D1 FTS5 BM25 with RRF) is active and verified.
- [ ] Visual Web Dashboard (`GET /`) and `/api/*` endpoints work and render the Project/Feature/Tag/File graph and Chunk Inspector.
- [ ] `bun test` and `bun run typecheck` pass with zero errors.
- [ ] Re-saving identical content is a fast no-op (`unchanged`); shrinking sections deletes stale vectors from Vectorize.
- [ ] Unauthenticated requests to `/mcp` and `/api/*` return `401 Unauthorized`.
- [ ] Zero `Bun.*` runtime APIs are used inside `src/`.
