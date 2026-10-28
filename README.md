# Lekh (लेख) — Feature Memory MCP Server

[![CI Typecheck & Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020.svg)]()
[![Package Manager](https://img.shields.io/badge/package%20manager-Bun-fbf0df.svg)]()
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-v2.3.1-blue.svg)]()

> **Lekh** is a high-performance remote Model Context Protocol (MCP) server and visual knowledge explorer deployed on a single Cloudflare Worker. It stores architecture documentation, design patterns, decisions, and bug fixes authored by coding agents across all your repositories, making them searchable via Hybrid Search (Dense 1024d Cosine + Sparse D1 FTS5 BM25 with Reciprocal Rank Fusion).

---

## ✨ Features

- **Stateless MCP Transport (`/mcp`):** Built on the official Cloudflare Agents SDK (`agents/mcp/server`) and `@modelcontextprotocol/server@2.3.1` (Streamable HTTP, zero Durable Object lock-in).
- **Hybrid Search Engine:** Combines dense semantic vector retrieval via Cloudflare Vectorize (`@cf/qwen/qwen3-embedding-0.6b`, 1024 dimensions) with exact keyword/symbol search via Cloudflare D1 SQLite FTS5 BM25, fused via Reciprocal Rank Fusion ($k=60$).
- **Contextual Chunking:** Prefixes every chunk with `${project} | ${name} | ${section}` so embeddings retain surrounding context. Automatically splits long sections at 1,500-character paragraph boundaries.
- **Idempotent Updates & Stale Pruning:** Keyed on `(project, name)`. SHA-256 canonical hashing skips unneeded re-indexing; updating with fewer sections automatically deletes obsolete vectors from Vectorize.
- **Visual Web Dashboard (`GET /`):** Interactive dark-mode dashboard featuring a D3.js force-directed knowledge graph of Projects, Features, Tags, and Files, plus a chunk inspector and live hybrid search playground.
- **Timing-Safe Authentication:** Constant-time comparison (`crypto.timingSafeEqual` over SHA-256 digests) prevents timing attacks on the Bearer token.

---

## 🛠️ MCP Tools (6 Registered)

| Tool | Description |
|---|---|
| `save_feature` | Idempotent upsert of feature architecture documentation, patterns, or decisions keyed on `(project, name)` where `project` is the name of the current working directory. |
| `search_features` | Hybrid search across Dense Vectorize + Sparse D1 FTS5 with Reciprocal Rank Fusion ($k=60$), optionally filtered by working directory and type. |
| `get_feature` | Retrieve the complete record and all contextual chunks for a feature by working directory and feature name. |
| `list_features` | List stored features with summary, files, and tags, filtered by working directory, type, or tag. |
| `list_projects` | Aggregates project statistics, feature counts, total chunks, and cross-cutting tags. |
| `delete_feature` | Deletes a feature, cascading deletes to D1 chunks, FTS5 virtual table, and dense vectors in Vectorize. |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Bun](https://bun.sh) (`v1.4+`)
- Cloudflare Account with D1, Vectorize, and Workers AI enabled

### 1. Install Dependencies
\`\`\`bash
bun install
\`\`\`

### 2. Run Tests & Typecheck
\`\`\`bash
bun test
bun run typecheck
\`\`\`

### 3. Local Development with Cloudflare Preview
Set your secret in `.dev.vars`:
\`\`\`bash
echo "MCP_AUTH_TOKEN=your-dev-secret-token" > .dev.vars
\`\`\`

Start the remote dev worker:
\`\`\`bash
bun run dev --remote
\`\`\`

### 4. Run End-to-End Tests & Retrieval Benchmark
\`\`\`bash
bun run e2e
\`\`\`

---

## 🌐 Visual Dashboard & Inspection APIs

- **Dashboard:** Open `http://localhost:8787/` (or your deployed URL) in your browser. Enter your `MCP_AUTH_TOKEN` in the top right to explore your knowledge graph.
- **API Overview:** `GET /api/overview` (returns graph nodes, links, and project statistics).
- **API Feature Inspector:** `GET /api/feature?project=<proj>&name=<name>` (returns feature details and raw chunk vector IDs).
- **API Search Playground:** `POST /api/search` with JSON `{ "query": "auth middleware", "limit": 5 }`.

---

## 🤖 Connecting Coding Agents

Refer to [docs/AGENT_INSTRUCTIONS.md](docs/AGENT_INSTRUCTIONS.md) for full configuration details for Claude Code, Cursor, Antigravity (`agy`), and OpenCode.
