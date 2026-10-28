import { createMcpHandler } from "agents/mcp/server";
import { checkBearer } from "./auth";
import { createServer } from "./mcp";
import { renderDashboardHtml } from "./ui";
import { getOverviewGraph, getFeature, searchFeatures } from "./store";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // 2. Visual Dashboard
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(renderDashboardHtml(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    // 3. MCP Endpoint
    if (url.pathname === "/mcp") {
      const isAuthed = await checkBearer(request, env.MCP_AUTH_TOKEN);
      if (!isAuthed) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid or missing Bearer token" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "WWW-Authenticate": "Bearer",
            },
          }
        );
      }

      const mcpHandler = createMcpHandler(() => createServer(env));
      return mcpHandler(request, env, ctx);
    }

    // 4. Authenticated JSON API for Dashboard
    if (url.pathname.startsWith("/api/")) {
      const isAuthed = await checkBearer(request, env.MCP_AUTH_TOKEN);
      if (!isAuthed) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid or missing Bearer token" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "WWW-Authenticate": "Bearer",
            },
          }
        );
      }

      if (url.pathname === "/api/overview" && request.method === "GET") {
        try {
          const overview = await getOverviewGraph(env);
          return Response.json(overview);
        } catch (err: any) {
          return Response.json({ error: err.message || String(err) }, { status: 500 });
        }
      }

      if (url.pathname === "/api/feature" && request.method === "GET") {
        const project = url.searchParams.get("project");
        const name = url.searchParams.get("name");
        if (!project || !name) {
          return Response.json(
            { error: "Missing required query parameters: 'project' and 'name'" },
            { status: 400 }
          );
        }

        try {
          const feat = await getFeature(env, project, name);
          if (!feat) {
            return Response.json(
              { error: `Feature '${name}' in project '${project}' not found` },
              { status: 404 }
            );
          }
          return Response.json(feat);
        } catch (err: any) {
          return Response.json({ error: err.message || String(err) }, { status: 500 });
        }
      }

      if (url.pathname === "/api/search" && request.method === "POST") {
        try {
          const body = (await request.json()) as any;
          if (!body || typeof body.query !== "string") {
            return Response.json(
              { error: "Invalid search payload: 'query' string is required" },
              { status: 400 }
            );
          }
          const results = await searchFeatures(env, {
            query: body.query,
            project: body.project,
            type: body.type,
            library: body.library,
            limit: body.limit,
          });
          return Response.json(results);
        } catch (err: any) {
          return Response.json({ error: err.message || String(err) }, { status: 500 });
        }
      }

      return Response.json({ error: "API route not found" }, { status: 404 });
    }

    return new Response("Not found", { status: 404 });
  },
};
