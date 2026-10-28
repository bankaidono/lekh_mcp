const BASE_URL =
  process.env.BASE_URL || process.env.LEKH_BASE_URL || "https://lekh-mcp.detox.workers.dev";
const TOKEN = process.env.MCP_AUTH_TOKEN;

if (!TOKEN) {
  console.error("ERROR: MCP_AUTH_TOKEN is required. Run with: set -a; source .env; set +a; bun run scripts/consolidate-lekh.ts");
  process.exit(1);
}

const SERVER_CHILDREN = [
  "cross-encoder-reranker",
  "multi-chunk-rrf-bonus",
  "technical-token-sanitizer",
  "cross-feature-relationships",
  "mcp-prompts",
  "dense-snippet-hydration",
];

const UI_CHILDREN = [
  "dashboard-feature-editor",
  "json-backup-export-import",
];

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API GET ${path} failed HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API POST ${path} failed HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`Lekh Project Data Consolidation (Option B: Nested Children)`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`======================================================\n`);

  // 1. Fetch current features in project 'lekh'
  console.log("Step 1: Inspecting current features in 'lekh'...");
  const overview = await apiGet("/api/overview");
  const initialFeatures = (overview.features || []).filter((f: any) => f.project === "lekh");
  console.log(`Found ${initialFeatures.length} features in 'lekh':`);
  for (const f of initialFeatures) {
    console.log(` - ${f.name} (${f.type}, ${f.chunk_count} chunks, ${(f.children || []).length} children)`);
  }

  // 2. Consolidate under feature-memory-server
  console.log("\nStep 2: Consolidating 6 features under 'feature-memory-server'...");
  for (const childName of SERVER_CHILDREN) {
    console.log(`\nProcessing '${childName}' -> parent: 'feature-memory-server'...`);
    let featData;
    try {
      featData = await apiGet(`/api/feature?project=lekh&name=${childName}`);
    } catch (e: any) {
      console.warn(`Could not fetch '${childName}' as standalone feature: ${e.message}`);
      continue;
    }

    const payload = {
      project: "lekh",
      name: featData.name,
      parent_name: "feature-memory-server",
      type: featData.type,
      importance: featData.importance,
      library: featData.library,
      summary: featData.summary,
      sections: featData.sections,
      files: featData.files,
      tags: featData.tags,
    };

    const res = await apiPost("/api/feature", payload);
    console.log(` -> Consolidated '${childName}':`, res);
  }

  // 3. Consolidate under web-explorer-ui
  console.log("\nStep 3: Consolidating 2 features under 'web-explorer-ui'...");
  for (const childName of UI_CHILDREN) {
    console.log(`\nProcessing '${childName}' -> parent: 'web-explorer-ui'...`);
    let featData;
    try {
      featData = await apiGet(`/api/feature?project=lekh&name=${childName}`);
    } catch (e: any) {
      console.warn(`Could not fetch '${childName}' as standalone feature: ${e.message}`);
      continue;
    }

    const payload = {
      project: "lekh",
      name: featData.name,
      parent_name: "web-explorer-ui",
      type: featData.type,
      importance: featData.importance,
      library: featData.library,
      summary: featData.summary,
      sections: featData.sections,
      files: featData.files,
      tags: featData.tags,
    };

    const res = await apiPost("/api/feature", payload);
    console.log(` -> Consolidated '${childName}':`, res);
  }

  // 4. Verify post-consolidation state
  console.log("\nStep 4: Verifying post-consolidation state in 'lekh'...");
  const postOverview = await apiGet("/api/overview");
  const finalFeatures = (postOverview.features || []).filter((f: any) => f.project === "lekh");
  console.log(`\nFinal features in 'lekh' (${finalFeatures.length} remaining):`);
  let totalChunks = 0;
  for (const f of finalFeatures) {
    const childNames = (f.children || []).map((c: any) => c.name).join(", ");
    console.log(` - ${f.name}: ${f.chunk_count} chunks, ${(f.children || []).length} children [${childNames}]`);
    totalChunks += f.chunk_count;
  }
  console.log(`\nTotal dense vector chunks in 'lekh': ${totalChunks} (was originally 40)`);

  const stats = await apiGet("/api/stats");
  console.log("\nSystem Stats:");
  console.log(` - D1 Features: ${stats.d1.total_features}`);
  console.log(` - D1 Total Chunks: ${stats.d1.total_chunks}`);
  console.log(` - Vectorize Vectors: ${stats.vectorize.vector_count}`);

  console.log("\nConsolidation complete!\n");
}

main().catch((err) => {
  console.error("Consolidation error:", err);
  process.exit(1);
});
