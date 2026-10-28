import { createMcpHandler } from "agents/mcp/server";
import { checkBearer } from "./auth";
import { createServer } from "./mcp";
import { renderDashboardHtml } from "./ui";
import { getOverviewGraph, getFeature, searchFeatures } from "./store";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
};

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function unauthorized(message = "Unauthorized: Invalid or missing Bearer token"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer",
      ...corsHeaders,
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // 0. Handle CORS Preflight for all routes
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 1. Health check
    if (url.pathname === "/health") {
      return json({ status: "ok" });
    }

    // 2. Favicon handler (avoids 404 aborts in browsers)
    if (url.pathname === "/favicon.ico") {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧠</text></svg>`,
        {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=86400",
            ...corsHeaders,
          },
        }
      );
    }

    // 3. Visual Dashboard
    if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(renderDashboardHtml(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...corsHeaders,
        },
      });
    }

    // 4. MCP Endpoint
    if (url.pathname === "/mcp") {
      const isAuthed = await checkBearer(request, env.MCP_AUTH_TOKEN);
      if (!isAuthed) {
        return unauthorized();
      }

      const mcpHandler = createMcpHandler(() => createServer(env));
      return mcpHandler(request, env, ctx);
    }

    // 5. Authenticated JSON API for Dashboard
    if (url.pathname.startsWith("/api/")) {
      const isAuthed = await checkBearer(request, env.MCP_AUTH_TOKEN);
      if (!isAuthed) {
        return unauthorized();
      }

      if (url.pathname === "/api/overview" && (request.method === "GET" || request.method === "HEAD")) {
        try {
          const overview = await getOverviewGraph(env);
          return json(overview);
        } catch (err: any) {
          return json({ error: err.message || String(err) }, 500);
        }
      }

      if (url.pathname === "/api/feature" && request.method === "GET") {
        const project = url.searchParams.get("project");
        const name = url.searchParams.get("name");
        if (!project || !name) {
          return json(
            { error: "Missing required query parameters: 'project' and 'name'" },
            400
          );
        }

        try {
          const feat = await getFeature(env, project, name);
          if (!feat) {
            return json(
              { error: `Feature '${name}' in project '${project}' not found` },
              404
            );
          }
          return json(feat);
        } catch (err: any) {
          return json({ error: err.message || String(err) }, 500);
        }
      }

      if (url.pathname === "/api/search" && request.method === "POST") {
        try {
          const body = (await request.json()) as any;
          if (!body || typeof body.query !== "string") {
            return json(
              { error: "Invalid search payload: 'query' string is required" },
              400
            );
          }
          const results = await searchFeatures(env, {
            query: body.query,
            project: body.project,
            type: body.type,
            library: body.library,
            limit: body.limit,
          });
          return json(results);
        } catch (err: any) {
          return json({ error: err.message || String(err) }, 500);
        }
      }

      return json({ error: "API route not found" }, 404);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
