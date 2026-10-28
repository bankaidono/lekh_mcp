import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  saveFeature,
  searchFeatures,
  getFeature,
  listFeatures,
  listProjects,
  deleteFeature,
  deleteProject,
  findRelatedFeatures,
} from "./store";

export function createServer(env: Env): McpServer {
  const server = new McpServer({
    name: "lekh-feature-memory",
    version: "1.0.0",
  });

  // 1. save_feature
  server.registerTool(
    "save_feature",
    {
      description:
        "Save or update feature architecture documentation, patterns, or decisions. Idempotent upsert keyed on (project, name).",
      inputSchema: z.object({
        project: z
          .string()
          .describe(
            "Name of the current working directory (basename of CWD, e.g. 'lekh', 'shop-app'). Automatically normalized to lowercase-kebab."
          ),
        name: z
          .string()
          .describe("Feature slug in lowercase-kebab (e.g. 'dropdown-menu', 'jwt-auth-middleware')"),
        summary: z
          .string()
          .min(10)
          .max(2000)
          .describe(
            "Concise 2-4 sentence summary explaining what it does, why it exists, and how to use it"
          ),
        sections: z
          .array(
            z.object({
              title: z
                .string()
                .min(1)
                .describe("Section title (e.g. 'overview', 'architecture', 'gotchas')"),
              content: z.string().min(1).describe("Detailed section markdown content"),
            })
          )
          .min(1)
          .max(20)
          .describe("Structured sections breaking down the feature"),
        type: z
          .enum(["feature", "pattern", "decision", "fix", "refactor"])
          .default("feature")
          .describe("Classification: feature, pattern, decision, fix, or refactor"),
        importance: z
          .number()
          .int()
          .min(1)
          .max(3)
          .default(2)
          .describe("Importance level: 1 (low), 2 (normal), 3 (critical architecture)"),
        library: z
          .string()
          .optional()
          .describe("Primary third-party library wrapped or used, if applicable"),
        files: z
          .array(z.string())
          .default([])
          .describe("Key repository-relative file paths touched or created"),
        tags: z
          .array(z.string())
          .default([])
          .describe("Cross-cutting concern tags (e.g. ['auth', 'security', 'ui'])"),
      }),
    },
    async (args) => {
      try {
        const result = await saveFeature(env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // 2. search_features
  server.registerTool(
    "search_features",
    {
      description:
        "Search features and architecture documentation using hybrid search (Vectorize cosine + D1 FTS5 BM25 with Reciprocal Rank Fusion).",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Search query, keyword, symbol name, or technical concept"),
        project: z
          .string()
          .optional()
          .describe(
            "Filter results to a specific working directory name (e.g. 'lekh'). Omit to search across all projects."
          ),
        type: z
          .enum(["feature", "pattern", "decision", "fix", "refactor"])
          .optional()
          .describe("Filter by documentation type"),
        library: z.string().optional().describe("Filter by third-party library wrapped"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe("Maximum number of results to return (1-20, default 5)"),
        rerank: z
          .boolean()
          .default(true)
          .describe(
            "Whether to apply Stage-3 Cross-Encoder reranking using @cf/baai/bge-reranker-base (default: true)"
          ),
      }),
    },
    async (args) => {
      try {
        const results = await searchFeatures(env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // 3. get_feature
  server.registerTool(
    "get_feature",
    {
      description:
        "Retrieve the full documentation for a specific feature by working directory and feature name.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("Working directory name the feature belongs to (e.g. 'lekh')"),
        name: z.string().describe("Feature slug (e.g. 'dropdown-menu')"),
      }),
    },
    async ({ project, name }) => {
      try {
        const feature = await getFeature(env, project, name);
        if (!feature) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Feature '${name}' in project '${project}' was not found. Use list_features or search_features to discover existing features.`,
                }),
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(feature, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // 4. list_features
  server.registerTool(
    "list_features",
    {
      description:
        "List stored features with summary, files, and tags, optionally filtered by working directory, type, or tag.",
      inputSchema: z.object({
        project: z
          .string()
          .optional()
          .describe("Filter by working directory name (e.g. 'lekh')"),
        type: z
          .enum(["feature", "pattern", "decision", "fix", "refactor"])
          .optional()
          .describe("Filter by documentation type"),
        tag: z.string().optional().describe("Filter by tag"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Maximum number of features to list (1-200, default 50)"),
      }),
    },
    async (args) => {
      try {
        const list = await listFeatures(env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // 5. list_projects
  server.registerTool(
    "list_projects",
    {
      description:
        "List all known projects with feature counts, chunk totals, last update timestamp, and aggregated tags.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const projects = await listProjects(env);
        return {
          content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // 6. delete_feature
  server.registerTool(
    "delete_feature",
    {
      description:
        "Delete a feature record, all its chunks, and corresponding dense vectors from Vectorize and D1 FTS5.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("Working directory name the feature belongs to (e.g. 'lekh')"),
        name: z.string().describe("Feature slug to delete"),
      }),
    },
    async ({ project, name }) => {
      try {
        const result = await deleteFeature(env, project, name);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // 7. delete_project
  server.registerTool(
    "delete_project",
    {
      description:
        "Delete an entire project, all its feature records, chunks, and dense vectors from Vectorize and D1 FTS5.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("Working directory name of the project to delete (e.g. 'lekh')"),
      }),
    },
    async ({ project }) => {
      try {
        const result = await deleteProject(env, project);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // 8. find_related_features
  server.registerTool(
    "find_related_features",
    {
      description:
        "Discover related features and architectural patterns across projects based on structural overlap (shared files, tags, library) and semantic similarity.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("Working directory name the target feature belongs to (e.g. 'lekh')"),
        name: z.string().describe("Target feature slug (e.g. 'dropdown-menu')"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe("Maximum number of related features to return (1-20, default 5)"),
      }),
    },
    async ({ project, name, limit }) => {
      try {
        const related = await findRelatedFeatures(env, project, name, limit);
        return {
          content: [{ type: "text", text: JSON.stringify(related, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: err.message || String(err) }) }],
        };
      }
    }
  );

  // Prompts
  // 1. document-feature
  server.registerPrompt(
    "document-feature",
    {
      title: "Document Feature Architecture",
      description:
        "Generates a structured prompt instructing the agent to inspect recent changes and document a feature, pattern, or decision using Lekh save_feature.",
      argsSchema: z.object({
        project: z.string().describe("Working directory name (e.g. 'lekh')"),
        name: z.string().describe("Feature slug in lowercase-kebab (e.g. 'jwt-auth-middleware')"),
      }),
    },
    async ({ project, name }) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please inspect the recent changes or implementation for '${name}' in project '${project}'. Then, call the 'save_feature' tool with:
- project: "${project}"
- name: "${name}"
- type: "feature" | "pattern" | "decision" | "fix" | "refactor"
- importance: 1 (minor), 2 (standard), or 3 (critical architecture)
- library: any wrapped third-party library
- summary: 2-4 sentences explaining what it does, why it exists, and when to reuse it
- sections: structured breakdown including 'overview', 'architecture', 'gotchas', and 'trade-offs'
- files: array of repository-relative files touched
- tags: lowercase tags for domain and cross-cutting concerns (e.g. ['auth', 'd1'])`,
            },
          },
        ],
      };
    }
  );

  // 2. check-prior-art
  server.registerPrompt(
    "check-prior-art",
    {
      title: "Check Prior Art in Lekh Memory",
      description:
        "Generates a structured prompt instructing the agent to search existing architectural documentation and related features before implementing new code.",
      argsSchema: z.object({
        topic: z
          .string()
          .describe(
            "Topic, library, or feature area to search (e.g. 'auth middleware', 'd1 migrations')"
          ),
        project: z.string().optional().describe("Optional working directory name to scope search"),
      }),
    },
    async ({ topic, project }) => {
      const projectScope = project ? ` within project '${project}'` : " across all projects";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Before writing code or designing a new solution for '${topic}'${projectScope}, please perform the following checks:
1. Call 'search_features' with query="${topic}"${project ? `, project="${project}"` : ""} to check if an existing pattern or utility exists.
2. If an existing feature is found, call 'get_feature' or 'find_related_features' to inspect its architecture and shared dependencies.
3. Review the discovered conventions, gotchas, and patterns to maintain consistency across the codebase.`,
            },
          },
        ],
      };
    }
  );

  return server;
}
