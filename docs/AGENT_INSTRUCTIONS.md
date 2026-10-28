# Agent Instructions for Lekh Feature Memory MCP

Add this snippet to your repository rules (`CLAUDE.md`, `.cursorrules`, `GEMINI.md`, or system prompt) to automatically instruct coding agents to read and persist architectural memory.

---

## Feature Memory MCP (`lekh`)

### Workflow Instructions for Coding Agents

- **Before building a non-trivial feature or component:**
  1. Call `list_projects` or `search_features` with a natural language description, component name, or file path to check how similar features or patterns were implemented across projects.
  2. Call `get_feature` on the best match to review its architecture, library choices, and gotchas before writing code.
- **After completing a feature, reusable pattern, architectural decision, or tricky bug fix:**
  - Call `save_feature` once:
    - `project`: **The name of the current working directory** (e.g., basename of CWD like `"lekh"`, `"shop-app"`). Automatically normalized to lowercase-kebab.
    - `name`: short feature/component slug in `lowercase-kebab` (e.g., `"dropdown-menu"`, `"jwt-auth-middleware"`).
    - `type`: `"feature" | "pattern" | "decision" | "fix" | "refactor"`.
    - `importance`: `1` (low), `2` (normal), or `3` (high/critical architecture).
    - `library`: primary third-party library wrapped or used, if applicable.
    - `summary`: 2–4 sentences explaining what it does, why it exists, and when to reuse it.
    - `sections`: structured breakdown (`overview`, `architecture`, `edge-cases`, `gotchas`).
    - `files`: array of key repository-relative file paths touched.
    - `tags`: lowercase tags for cross-cutting concerns (e.g., `["auth", "security", "middleware"]`).
- Calling `save_feature` again with the same `(project, name)` safely updates the existing record without duplicating vectors.

---

## Client Connection Configurations

### 1. Claude Code
Run in your terminal:
\`\`\`bash
claude mcp add --transport http lekh https://<your-worker>.workers.dev/mcp --header "Authorization: Bearer <YOUR_MCP_AUTH_TOKEN>"
\`\`\`

### 2. Cursor IDE
Add to `.cursor/mcp.json`:
\`\`\`json
{
  "mcpServers": {
    "lekh": {
      "url": "https://<your-worker>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_MCP_AUTH_TOKEN>"
      }
    }
  }
}
\`\`\`

### 3. Google Antigravity CLI (\`agy\`)
Add to `~/.gemini/antigravity-cli/settings.json` or workspace settings:
\`\`\`json
{
  "mcpServers": {
    "lekh": {
      "url": "https://<your-worker>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_MCP_AUTH_TOKEN>"
      }
    }
  }
}
\`\`\`

### 4. OpenCode
Add to `opencode.json`:
\`\`\`json
{
  "mcp": {
    "servers": {
      "lekh": {
        "type": "http",
        "url": "https://<your-worker>.workers.dev/mcp",
        "headers": {
          "Authorization": "Bearer <YOUR_MCP_AUTH_TOKEN>"
        }
      }
    }
  }
}
\`\`\`
