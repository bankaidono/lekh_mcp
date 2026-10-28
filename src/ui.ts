export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lekh — Feature Memory Explorer</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f0fdf4',
              500: '#22c55e',
              600: '#16a34a',
              700: '#15803d'
            }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .node text { pointer-events: none; font-size: 11px; fill: #d4d4d8; }
    .link { stroke: #27272a; stroke-opacity: 0.6; stroke-width: 1.5px; }
    .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: #18181b; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
  </style>
</head>
<body class="h-screen flex flex-col overflow-hidden">
  <!-- Top Navigation Bar -->
  <header class="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur px-6 flex items-center justify-between shrink-0">
    <div class="flex items-center space-x-3">
      <div class="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
        L
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-semibold text-zinc-100 tracking-tight">Lekh</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/50">MCP Server</span>
        </div>
        <p class="text-[11px] text-zinc-400">Zero-Hallucination Feature Memory & Knowledge Graph</p>
      </div>
    </div>

    <!-- Quick Stats -->
    <div id="stats-bar" class="hidden md:flex items-center space-x-6 text-xs text-zinc-400">
      <div>Projects: <span id="stat-projects" class="font-medium text-zinc-200">0</span></div>
      <div>Features: <span id="stat-features" class="font-medium text-zinc-200">0</span></div>
      <div>Chunks: <span id="stat-chunks" class="font-medium text-zinc-200">0</span></div>
      <div>Tags: <span id="stat-tags" class="font-medium text-zinc-200">0</span></div>
    </div>

    <!-- Auth / Settings -->
    <div class="flex items-center space-x-3">
      <button onclick="promptAuthToken()" class="text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition flex items-center space-x-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
        <span id="auth-status-btn">Set Token</span>
      </button>
    </div>
  </header>

  <!-- View Switcher -->
  <div class="border-b border-zinc-800 bg-zinc-900/50 px-6 flex space-x-6 text-sm font-medium">
    <button onclick="switchView('graph')" id="tab-graph" class="py-3 border-b-2 border-emerald-500 text-emerald-400 transition">Knowledge Graph</button>
    <button onclick="switchView('features')" id="tab-features" class="py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition">Features & Chunks</button>
    <button onclick="switchView('search')" id="tab-search" class="py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition">Hybrid Search Playground</button>
  </div>

  <!-- Main Content Area -->
  <main class="flex-1 relative overflow-hidden">
    <!-- VIEW 1: Knowledge Graph -->
    <div id="view-graph" class="absolute inset-0 flex">
      <div id="graph-container" class="flex-1 h-full w-full relative">
        <svg id="graph-svg" class="w-full h-full cursor-grab active:cursor-grabbing"></svg>
        <div class="absolute bottom-4 left-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 text-xs space-y-1.5 pointer-events-none backdrop-blur">
          <div class="font-medium text-zinc-300 mb-1">Graph Legend</div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-indigo-500 inline-block"></span><span>Project</span></div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span><span>Feature</span></div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-violet-500 inline-block"></span><span>Tag</span></div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span><span>File</span></div>
        </div>
      </div>
    </div>

    <!-- VIEW 2: Features Browser -->
    <div id="view-features" class="absolute inset-0 hidden overflow-y-auto p-6 scrollbar-thin">
      <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 class="text-lg font-semibold text-zinc-100">Saved Features & Vector Chunks</h2>
          <div class="flex items-center space-x-3">
            <select id="feat-filter-project" onchange="renderFeaturesList()" class="bg-zinc-800 border border-zinc-700 text-xs rounded-md px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500">
              <option value="">All Projects</option>
            </select>
            <select id="feat-filter-type" onchange="renderFeaturesList()" class="bg-zinc-800 border border-zinc-700 text-xs rounded-md px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500">
              <option value="">All Types</option>
              <option value="feature">feature</option>
              <option value="pattern">pattern</option>
              <option value="decision">decision</option>
              <option value="fix">fix</option>
              <option value="refactor">refactor</option>
            </select>
          </div>
        </div>

        <div id="features-cards" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Dynamically populated -->
        </div>
      </div>
    </div>

    <!-- VIEW 3: Hybrid Search Playground -->
    <div id="view-search" class="absolute inset-0 hidden overflow-y-auto p-6 scrollbar-thin">
      <div class="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 class="text-lg font-semibold text-zinc-100">Hybrid Search Playground</h2>
          <p class="text-xs text-zinc-400">Dense Vectorize (1024d Cosine) + Sparse D1 FTS5 (BM25) with Reciprocal Rank Fusion ($k=60$)</p>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
          <div class="flex flex-col sm:flex-row gap-3">
            <input type="text" id="search-input" placeholder="Type a search query, feature name, or file path..." class="flex-1 bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500">
            <button onclick="executeSearch()" class="px-5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white transition">Search</button>
          </div>

          <div class="flex flex-wrap items-center gap-4 text-xs">
            <div class="flex items-center space-x-1.5">
              <span class="text-zinc-400">Project:</span>
              <input type="text" id="search-project" placeholder="optional" class="w-32 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
            </div>
            <div class="flex items-center space-x-1.5">
              <span class="text-zinc-400">Type:</span>
              <select id="search-type" class="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
                <option value="">Any</option>
                <option value="feature">feature</option>
                <option value="pattern">pattern</option>
                <option value="decision">decision</option>
                <option value="fix">fix</option>
                <option value="refactor">refactor</option>
              </select>
            </div>
            <div class="flex items-center space-x-1.5">
              <span class="text-zinc-400">Limit:</span>
              <select id="search-limit" class="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </div>
          </div>
        </div>

        <div id="search-results" class="space-y-4">
          <!-- Dynamically populated search cards -->
        </div>
      </div>
    </div>
  </main>

  <!-- Feature Detail Drawer / Modal -->
  <div id="feature-drawer" class="fixed inset-y-0 right-0 w-full md:w-[600px] bg-zinc-900 border-l border-zinc-800 shadow-2xl transform translate-x-full transition-transform duration-300 z-50 flex flex-col">
    <div class="h-16 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0">
      <div class="flex items-center space-x-2">
        <span id="drawer-type" class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase font-mono">feature</span>
        <span id="drawer-name" class="font-semibold text-zinc-100 text-sm">Feature Name</span>
      </div>
      <button onclick="closeDrawer()" class="p-2 text-zinc-400 hover:text-zinc-200">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
    <div id="drawer-body" class="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin text-xs text-zinc-300">
      <!-- Populated via openDrawer -->
    </div>
  </div>

  <script>
    let overviewData = { projects: [], features: [], stats: {}, graph: { nodes: [], links: [] } };

    function getToken() {
      return localStorage.getItem("lekh_token") || "";
    }

    function promptAuthToken() {
      const current = getToken();
      const token = prompt("Enter your Lekh Bearer token (MCP_AUTH_TOKEN):", current);
      if (token !== null) {
        localStorage.setItem("lekh_token", token.trim());
        updateAuthBtn();
        loadOverview();
      }
    }

    function updateAuthBtn() {
      const btn = document.getElementById("auth-status-btn");
      if (getToken()) {
        btn.textContent = "Token Saved";
      } else {
        btn.textContent = "Set Token";
      }
    }

    function switchView(view) {
      ['graph', 'features', 'search'].forEach(v => {
        document.getElementById('view-' + v).classList.toggle('hidden', v !== view);
        const tab = document.getElementById('tab-' + v);
        if (v === view) {
          tab.classList.add('border-emerald-500', 'text-emerald-400');
          tab.classList.remove('border-transparent', 'text-zinc-400');
        } else {
          tab.classList.remove('border-emerald-500', 'text-emerald-400');
          tab.classList.add('border-transparent', 'text-zinc-400');
        }
      });
      if (view === 'graph') {
        renderGraph();
      } else if (view === 'features') {
        renderFeaturesList();
      }
    }

    async function apiFetch(endpoint, options = {}) {
      const token = getToken();
      if (!token) {
        promptAuthToken();
      }
      const headers = {
        'Authorization': 'Bearer ' + getToken(),
        ...(options.headers || {})
      };
      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401) {
        alert("401 Unauthorized: Invalid or missing token.");
        promptAuthToken();
        throw new Error("Unauthorized");
      }
      return res.json();
    }

    async function loadOverview() {
      try {
        overviewData = await apiFetch('/api/overview');
        document.getElementById('stat-projects').textContent = overviewData.stats.total_projects || 0;
        document.getElementById('stat-features').textContent = overviewData.stats.total_features || 0;
        document.getElementById('stat-chunks').textContent = overviewData.stats.total_chunks || 0;
        document.getElementById('stat-tags').textContent = overviewData.stats.total_tags || 0;

        // Populate project filter dropdown
        const pSel = document.getElementById('feat-filter-project');
        pSel.innerHTML = '<option value="">All Projects</option>';
        (overviewData.projects || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.project;
          opt.textContent = p.project + ' (' + p.feature_count + ')';
          pSel.appendChild(opt);
        });

        renderGraph();
        renderFeaturesList();
      } catch (err) {
        console.error("Failed to load overview:", err);
      }
    }

    function renderGraph() {
      const container = document.getElementById('graph-container');
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      d3.select("#graph-svg").selectAll("*").remove();
      const svg = d3.select("#graph-svg")
        .attr("viewBox", [0, 0, width, height]);

      const g = svg.append("g");

      svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", ({ transform }) => {
        g.attr("transform", transform);
      }));

      const nodes = (overviewData.graph.nodes || []).map(d => ({ ...d }));
      const links = (overviewData.graph.links || []).map(d => ({ ...d }));

      const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(60))
        .force("charge", d3.forceManyBody().strength(-120))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(25));

      const link = g.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "link");

      const node = g.append("g")
        .selectAll(".node")
        .data(nodes)
        .join("g")
        .attr("class", "node")
        .call(d3.drag()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }))
        .on("click", (event, d) => {
          if (d.type === 'feature' || d.id.startsWith('feat:')) {
            openDrawer(d.project, d.name);
          }
        });

      node.append("circle")
        .attr("r", d => d.type === 'project' ? 14 : (d.type === 'feature' ? 9 : 6))
        .attr("fill", d => {
          if (d.type === 'project') return '#6366f1';
          if (d.type === 'feature') return '#10b981';
          if (d.type === 'tag') return '#8b5cf6';
          return '#f59e0b';
        })
        .attr("stroke", "#18181b")
        .attr("stroke-width", 1.5);

      node.append("text")
        .attr("x", 12)
        .attr("y", 4)
        .text(d => d.name);

      simulation.on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

        node
          .attr("transform", d => 'translate(' + d.x + ',' + d.y + ')');
      });
    }

    function renderFeaturesList() {
      const container = document.getElementById('features-cards');
      container.innerHTML = '';

      const pFilter = document.getElementById('feat-filter-project').value;
      const tFilter = document.getElementById('feat-filter-type').value;

      const filtered = (overviewData.features || []).filter(f => {
        if (pFilter && f.project !== pFilter) return false;
        if (tFilter && f.type !== tFilter) return false;
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div class="col-span-2 text-zinc-500 py-12 text-center text-sm">No features match the selected filters.</div>';
        return;
      }

      filtered.forEach(f => {
        const card = document.createElement('div');
        card.className = "bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg p-5 space-y-3 transition cursor-pointer";
        card.onclick = () => openDrawer(f.project, f.name);

        const tagsHtml = (f.tags || []).map(t => '<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px]">#' + t + '</span>').join(' ');
        const filesHtml = (f.files || []).map(file => '<div class="text-[11px] text-zinc-400 font-mono truncate">📄 ' + file + '</div>').join('');

        card.innerHTML = \`
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono text-zinc-400">\${f.project}</span>
            <span class="text-[11px] px-2 py-0.5 rounded uppercase font-mono font-medium \${
              f.type === 'decision' ? 'bg-amber-950 text-amber-400' :
              f.type === 'pattern' ? 'bg-indigo-950 text-indigo-400' :
              'bg-emerald-950 text-emerald-400'
            }">\${f.type}</span>
          </div>
          <h3 class="text-base font-semibold text-zinc-100 hover:text-emerald-400 transition">\${f.name}</h3>
          <p class="text-xs text-zinc-300 line-clamp-2 leading-relaxed">\${f.summary}</p>
          <div class="space-y-1">\${filesHtml}</div>
          <div class="flex items-center justify-between pt-2 border-t border-zinc-800/80">
            <div class="flex flex-wrap gap-1">\${tagsHtml}</div>
            <span class="text-[11px] text-zinc-500">\${f.chunk_count} chunks</span>
          </div>
        \`;
        container.appendChild(card);
      });
    }

    async function openDrawer(project, name) {
      const drawer = document.getElementById('feature-drawer');
      const body = document.getElementById('drawer-body');
      drawer.classList.remove('translate-x-full');

      body.innerHTML = '<div class="py-12 text-center text-zinc-500">Loading feature details & chunks...</div>';

      try {
        const feat = await apiFetch('/api/feature?project=' + encodeURIComponent(project) + '&name=' + encodeURIComponent(name));
        document.getElementById('drawer-name').textContent = feat.project + ' / ' + feat.name;
        document.getElementById('drawer-type').textContent = feat.type;

        let sectionsHtml = (feat.sections || []).map(s => \`
          <div class="bg-zinc-950/50 border border-zinc-800/80 rounded-md p-3 space-y-1">
            <div class="font-semibold text-zinc-200 text-xs uppercase tracking-wider">\${s.title}</div>
            <div class="whitespace-pre-wrap text-zinc-300 leading-relaxed font-sans text-xs">\${s.content}</div>
          </div>
        \`).join('');

        let chunksHtml = (feat.chunks || []).map(c => \`
          <div class="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1">
            <div class="flex items-center justify-between font-mono text-[11px]">
              <span class="text-emerald-400 font-medium">[\${c.vector_id}]</span>
              <span class="text-zinc-500">idx: \${c.idx} • \${c.section}</span>
            </div>
            <pre class="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap leading-tight mt-1 bg-zinc-900/60 p-2 rounded">\${c.text}</pre>
          </div>
        \`).join('');

        body.innerHTML = \`
          <div class="space-y-4">
            <div>
              <div class="text-[11px] uppercase font-mono text-zinc-500 mb-1">Summary</div>
              <p class="text-sm text-zinc-200 leading-relaxed bg-zinc-950 p-3 rounded border border-zinc-800">\${feat.summary}</p>
            </div>

            <div>
              <div class="text-[11px] uppercase font-mono text-zinc-500 mb-1">Files Touched</div>
              <div class="space-y-1 font-mono text-xs">
                \${(feat.files || []).map(f => '<div class="text-zinc-300 bg-zinc-950/60 px-2 py-1 rounded border border-zinc-800/50">📄 ' + f + '</div>').join('')}
              </div>
            </div>

            <div class="space-y-3">
              <div class="text-[11px] uppercase font-mono text-zinc-500">Documentation Sections</div>
              \${sectionsHtml}
            </div>

            <div class="space-y-3 pt-4 border-t border-zinc-800">
              <div class="flex items-center justify-between">
                <span class="text-[11px] uppercase font-mono text-emerald-400 font-semibold">Embedded Dense Vectors (Vectorize)</span>
                <span class="text-[11px] text-zinc-500">\${(feat.chunks || []).length} Chunks</span>
              </div>
              \${chunksHtml}
            </div>
          </div>
        \`;
      } catch (err) {
        body.innerHTML = '<div class="py-12 text-center text-red-400 text-xs">Error loading feature: ' + err.message + '</div>';
      }
    }

    function closeDrawer() {
      document.getElementById('feature-drawer').classList.add('translate-x-full');
    }

    async function executeSearch() {
      const q = document.getElementById('search-input').value.trim();
      if (!q) return;

      const project = document.getElementById('search-project').value.trim() || undefined;
      const type = document.getElementById('search-type').value || undefined;
      const limit = parseInt(document.getElementById('search-limit').value, 10) || 5;

      const resultsContainer = document.getElementById('search-results');
      resultsContainer.innerHTML = '<div class="py-8 text-center text-zinc-500 text-xs">Running hybrid search across Dense Vectorize & Sparse D1 FTS5...</div>';

      try {
        const results = await apiFetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, project, type, limit })
        });

        if (!results || results.length === 0) {
          resultsContainer.innerHTML = '<div class="py-12 text-center text-zinc-500 text-sm">No features matched query.</div>';
          return;
        }

        resultsContainer.innerHTML = '';
        results.forEach(r => {
          const card = document.createElement('div');
          card.className = "bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3 hover:border-zinc-700 transition cursor-pointer";
          card.onclick = () => openDrawer(r.project, r.name);

          card.innerHTML = \`
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center space-x-2">
                <span class="font-mono text-xs text-zinc-400">\${r.project}</span>
                <span class="text-zinc-600">/</span>
                <span class="font-semibold text-zinc-100 text-sm">\${r.name}</span>
                <span class="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">\${r.type}</span>
              </div>
              <div class="flex items-center space-x-2">
                <span class="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono" title="Reciprocal Rank Fusion Score">RRF: \${r.rrf_score}</span>
                \${r.vector_score !== null ? \`<span class="text-[11px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono" title="Cosine Similarity">Dense: \${r.vector_score}</span>\` : ''}
                \${r.fts_matched ? \`<span class="text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-mono" title="Matched in FTS5 keyword index">FTS5 Match</span>\` : ''}
              </div>
            </div>

            <div class="bg-zinc-950 p-3 rounded border border-zinc-800/80 space-y-1">
              <div class="text-[11px] text-zinc-500 font-mono">Matched Section: <span class="text-zinc-300">\${r.matched_section}</span></div>
              <div class="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">\${r.snippet}</div>
            </div>

            <p class="text-xs text-zinc-400">\${r.summary}</p>
          \`;
          resultsContainer.appendChild(card);
        });
      } catch (err) {
        resultsContainer.innerHTML = '<div class="py-8 text-center text-red-400 text-xs">Search error: ' + err.message + '</div>';
      }
    }

    // Initialize
    updateAuthBtn();
    loadOverview();
  </script>
</body>
</html>`;
}
