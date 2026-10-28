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
    .node text { pointer-events: none; font-size: 11px; fill: #d4d4d8; font-weight: 500; }
    .link { stroke: #27272a; stroke-opacity: 0.6; stroke-width: 1.5px; }
    .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: #18181b; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    @keyframes spin-fast { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinning { animation: spin-fast 0.8s linear infinite; }
  </style>
</head>
<body class="h-screen flex flex-col overflow-hidden">
  <!-- Toast Notification -->
  <div id="toast" class="fixed top-4 right-4 z-50 transform translate-y-[-150%] opacity-0 transition-all duration-300 pointer-events-none">
    <div id="toast-content" class="px-4 py-2.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xl flex items-center space-x-2">
      <span id="toast-icon">ℹ️</span>
      <span id="toast-msg">Notification</span>
    </div>
  </div>

  <!-- Top Navigation Bar -->
  <header class="h-16 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur px-6 flex items-center justify-between shrink-0">
    <div class="flex items-center space-x-3">
      <div class="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base">
        L
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-bold text-zinc-100 tracking-tight text-base">Lekh</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono">MCP Engine</span>
        </div>
        <p class="text-[11px] text-zinc-400">Zero-Hallucination Architectural Memory & Knowledge Explorer</p>
      </div>
    </div>

    <!-- Quick Stats -->
    <div id="stats-bar" class="hidden md:flex items-center space-x-6 text-xs text-zinc-400">
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-indigo-500"></span><span>Projects:</span> <span id="stat-projects" class="font-semibold text-zinc-200">0</span></div>
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>Features:</span> <span id="stat-features" class="font-semibold text-zinc-200">0</span></div>
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-cyan-500"></span><span>Vectors:</span> <span id="stat-chunks" class="font-semibold text-zinc-200">0</span></div>
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-violet-500"></span><span>Tags:</span> <span id="stat-tags" class="font-semibold text-zinc-200">0</span></div>
    </div>

    <!-- Actions (Refresh, Auto-refresh, Auth) -->
    <div class="flex items-center space-x-3">
      <button onclick="refreshData(true)" id="refresh-btn" title="Refresh latest features from Cloudflare" class="text-xs px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition flex items-center space-x-1.5">
        <svg id="refresh-icon" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        <span>Refresh</span>
      </button>

      <button onclick="openAuthModal()" id="auth-status-btn" class="text-xs px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition flex items-center space-x-2">
        <span id="auth-indicator" class="w-2 h-2 rounded-full bg-amber-400"></span>
        <span id="auth-btn-text">Connect Token</span>
      </button>
    </div>
  </header>

  <!-- View Navigation Tabs -->
  <div class="border-b border-zinc-800 bg-zinc-900/60 px-6 flex items-center justify-between text-sm font-medium">
    <div class="flex space-x-6">
      <button onclick="switchView('projects')" id="tab-projects" class="py-3 border-b-2 border-emerald-500 text-emerald-400 transition flex items-center space-x-2">
        <span>📁 Projects</span>
        <span id="badge-projects-count" class="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300">0</span>
      </button>
      <button onclick="switchView('features')" id="tab-features" class="py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition flex items-center space-x-2">
        <span>📚 Features & Chunks</span>
        <span id="badge-features-count" class="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300">0</span>
      </button>
      <button onclick="switchView('graph')" id="tab-graph" class="py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition">
        <span>🌐 Knowledge Graph</span>
      </button>
      <button onclick="switchView('search')" id="tab-search" class="py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition">
        <span>⚡ Hybrid Search</span>
      </button>
    </div>

    <div class="hidden sm:flex items-center space-x-2 text-[11px] text-zinc-400">
      <label class="flex items-center space-x-1.5 cursor-pointer">
        <input type="checkbox" id="auto-refresh-toggle" onchange="toggleAutoRefresh(this.checked)" class="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0">
        <span>Auto-sync (15s)</span>
      </label>
    </div>
  </div>

  <!-- Main Content Area -->
  <main class="flex-1 relative overflow-hidden">
    <!-- VIEW 1: Projects Overview (Default) -->
    <div id="view-projects" class="absolute inset-0 overflow-y-auto p-6 scrollbar-thin">
      <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <h2 class="text-lg font-bold text-zinc-100">All Working Directories & Projects</h2>
            <p class="text-xs text-zinc-400">Click any project card to view its documented features and architecture chunks.</p>
          </div>
          <div id="projects-summary-tag" class="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md">
            Showing <span id="projects-total-count" class="font-semibold text-zinc-200">0</span> active projects
          </div>
        </div>

        <div id="projects-cards-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <!-- Dynamically populated project cards -->
        </div>
      </div>
    </div>

    <!-- VIEW 2: Features Browser -->
    <div id="view-features" class="absolute inset-0 hidden overflow-y-auto p-6 scrollbar-thin">
      <div class="max-w-6xl mx-auto space-y-6">
        <!-- Active Filter Banner (When navigating from Projects) -->
        <div id="active-project-banner" class="hidden bg-indigo-950/40 border border-indigo-800/60 rounded-lg p-3 flex items-center justify-between text-xs text-indigo-300">
          <div class="flex items-center space-x-2">
            <span>📁 Filtered by Project:</span>
            <span id="active-project-name" class="font-mono font-bold text-white px-2 py-0.5 rounded bg-indigo-900/80"></span>
            <span id="active-project-count" class="text-indigo-400"></span>
          </div>
          <button onclick="clearProjectFilter()" class="text-[11px] underline hover:text-white transition">Show All Projects</button>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-zinc-100">Features & Contextual Chunks</h2>
            <p class="text-xs text-zinc-400">Click any feature to inspect its full markdown sections and exact vector embeddings.</p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
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
          <!-- Dynamically populated feature cards -->
        </div>
      </div>
    </div>

    <!-- VIEW 3: Knowledge Graph -->
    <div id="view-graph" class="absolute inset-0 hidden flex">
      <div id="graph-container" class="flex-1 h-full w-full relative">
        <svg id="graph-svg" class="w-full h-full cursor-grab active:cursor-grabbing"></svg>
        <div class="absolute bottom-4 left-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 text-xs space-y-1.5 pointer-events-none backdrop-blur shadow-xl">
          <div class="font-semibold text-zinc-200 mb-1">Knowledge Graph Legend</div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-indigo-500 inline-block"></span><span>Project / Working Dir</span></div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span><span>Feature Component</span></div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-violet-500 inline-block"></span><span>Tag</span></div>
          <div class="flex items-center space-x-2"><span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span><span>File Path</span></div>
        </div>
      </div>
    </div>

    <!-- VIEW 4: Hybrid Search Playground -->
    <div id="view-search" class="absolute inset-0 hidden overflow-y-auto p-6 scrollbar-thin">
      <div class="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 class="text-lg font-bold text-zinc-100">Hybrid Search Inspector</h2>
          <p class="text-xs text-zinc-400">Evaluates Dense Vectorize Cosine Embeddings (1024d) + Sparse D1 FTS5 (BM25) fused with Reciprocal Rank Fusion ($k=60$)</p>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4 shadow-lg">
          <div class="flex flex-col sm:flex-row gap-3">
            <input type="text" id="search-input" onkeydown="if(event.key==='Enter') executeSearch()" placeholder="Type a concept, keyword, component name, or file path..." class="flex-1 bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500">
            <button onclick="executeSearch()" class="px-5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition flex items-center justify-center space-x-1.5">
              <span>Search</span>
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-4 text-xs">
            <div class="flex items-center space-x-1.5">
              <span class="text-zinc-400">Project / CWD:</span>
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
              <span class="text-zinc-400">Top Results:</span>
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

  <!-- Feature Detail Drawer -->
  <div id="feature-drawer" class="fixed inset-y-0 right-0 w-full md:w-[640px] bg-zinc-900 border-l border-zinc-800 shadow-2xl transform translate-x-full transition-transform duration-300 z-50 flex flex-col">
    <div class="h-16 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0">
      <div class="flex items-center space-x-2">
        <span id="drawer-type" class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase font-mono font-medium">feature</span>
        <span id="drawer-name" class="font-bold text-zinc-100 text-sm">Feature Name</span>
      </div>
      <button onclick="closeDrawer()" class="p-2 text-zinc-400 hover:text-zinc-100 transition rounded-md hover:bg-zinc-800">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
    <div id="drawer-body" class="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin text-xs text-zinc-300">
      <!-- Populated via openDrawer -->
    </div>
  </div>

  <!-- In-Page Token Modal -->
  <div id="auth-modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-5">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2.5">
          <div class="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">🔑</div>
          <h3 class="font-bold text-zinc-100 text-base">Connect to Lekh Engine</h3>
        </div>
        <button onclick="closeAuthModal()" class="text-zinc-400 hover:text-zinc-200">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <p class="text-xs text-zinc-400 leading-relaxed">
        Enter your Lekh Bearer token (<code class="bg-zinc-950 px-1 py-0.5 rounded text-emerald-400 font-mono text-[11px]">MCP_AUTH_TOKEN</code>) to query features, inspect chunk boundaries, and synchronize the knowledge graph.
      </p>

      <div class="space-y-1.5">
        <label class="text-[11px] font-medium text-zinc-300">Bearer Token</label>
        <div class="relative">
          <input type="password" id="modal-token-input" placeholder="Paste your 64-char token here..." class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 font-mono">
          <button onclick="toggleTokenVisibility()" class="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300 text-xs">👁️</button>
        </div>
      </div>

      <div id="modal-auth-error" class="hidden text-xs text-red-400 bg-red-950/40 border border-red-900 rounded p-2.5"></div>

      <div class="flex items-center justify-between pt-2">
        <button onclick="clearSavedToken()" class="text-xs text-zinc-500 hover:text-red-400 transition">Clear Saved Token</button>
        <div class="flex items-center space-x-2">
          <button onclick="closeAuthModal()" class="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition">Cancel</button>
          <button onclick="saveModalToken()" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition">Save & Connect</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let overviewData = { projects: [], features: [], stats: {}, graph: { nodes: [], links: [] } };
    let currentView = 'projects';
    let autoRefreshTimer = null;

    function showToast(msg, icon = 'ℹ️') {
      const toast = document.getElementById('toast');
      document.getElementById('toast-msg').textContent = msg;
      document.getElementById('toast-icon').textContent = icon;
      toast.classList.remove('translate-y-[-150%]', 'opacity-0');
      setTimeout(() => {
        toast.classList.add('translate-y-[-150%]', 'opacity-0');
      }, 3000);
    }

    function getToken() {
      return localStorage.getItem("lekh_token") || "";
    }

    function openAuthModal() {
      document.getElementById('modal-token-input').value = getToken();
      document.getElementById('modal-auth-error').classList.add('hidden');
      document.getElementById('auth-modal').classList.remove('hidden');
      document.getElementById('modal-token-input').focus();
    }

    function closeAuthModal() {
      document.getElementById('auth-modal').classList.add('hidden');
    }

    function toggleTokenVisibility() {
      const input = document.getElementById('modal-token-input');
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    async function saveModalToken() {
      const token = document.getElementById('modal-token-input').value.trim();
      if (!token) {
        showModalError("Please enter a valid token.");
        return;
      }

      localStorage.setItem("lekh_token", token);
      updateAuthUI(true);

      try {
        await refreshData(false);
        closeAuthModal();
        showToast("Connected to Lekh successfully!", "✅");
      } catch (err) {
        showModalError("Authentication failed: token rejected by server (401).");
        updateAuthUI(false);
      }
    }

    function clearSavedToken() {
      localStorage.removeItem("lekh_token");
      document.getElementById('modal-token-input').value = "";
      updateAuthUI(false);
      closeAuthModal();
      showToast("Token cleared", "🗑️");
    }

    function showModalError(msg) {
      const errBox = document.getElementById('modal-auth-error');
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    }

    function updateAuthUI(connected) {
      const indicator = document.getElementById('auth-indicator');
      const text = document.getElementById('auth-btn-text');
      if (connected) {
        indicator.className = "w-2 h-2 rounded-full bg-emerald-400";
        text.textContent = "Connected";
      } else {
        indicator.className = "w-2 h-2 rounded-full bg-amber-400";
        text.textContent = "Connect Token";
      }
    }

    function switchView(view) {
      currentView = view;
      ['projects', 'features', 'graph', 'search'].forEach(v => {
        const el = document.getElementById('view-' + v);
        const tab = document.getElementById('tab-' + v);
        if (el && tab) {
          if (v === view) {
            el.classList.remove('hidden');
            tab.classList.add('border-emerald-500', 'text-emerald-400');
            tab.classList.remove('border-transparent', 'text-zinc-400');
          } else {
            el.classList.add('hidden');
            tab.classList.remove('border-emerald-500', 'text-emerald-400');
            tab.classList.add('border-transparent', 'text-zinc-400');
          }
        }
      });

      if (view === 'graph') {
        renderGraph();
      } else if (view === 'features') {
        renderFeaturesList();
      } else if (view === 'projects') {
        renderProjectsGrid();
      }
    }

    async function apiFetch(endpoint, options = {}) {
      const token = getToken();
      if (!token) {
        openAuthModal();
        throw new Error("Missing token");
      }

      const headers = {
        'Authorization': 'Bearer ' + token,
        ...(options.headers || {})
      };

      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401) {
        updateAuthUI(false);
        openAuthModal();
        showModalError("401 Unauthorized: Invalid Bearer token.");
        throw new Error("Unauthorized");
      }
      return res.json();
    }

    async function refreshData(showFeedback = false) {
      const icon = document.getElementById('refresh-icon');
      if (icon) icon.classList.add('spinning');

      try {
        overviewData = await apiFetch('/api/overview');
        updateAuthUI(true);

        // Update stats
        document.getElementById('stat-projects').textContent = overviewData.stats.total_projects || 0;
        document.getElementById('stat-features').textContent = overviewData.stats.total_features || 0;
        document.getElementById('stat-chunks').textContent = overviewData.stats.total_chunks || 0;
        document.getElementById('stat-tags').textContent = overviewData.stats.total_tags || 0;

        document.getElementById('badge-projects-count').textContent = overviewData.stats.total_projects || 0;
        document.getElementById('badge-features-count').textContent = overviewData.stats.total_features || 0;
        document.getElementById('projects-total-count').textContent = overviewData.stats.total_projects || 0;

        // Populate dropdown in features view
        const pSel = document.getElementById('feat-filter-project');
        const prevVal = pSel.value;
        pSel.innerHTML = '<option value="">All Projects</option>';
        (overviewData.projects || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.project;
          opt.textContent = p.project + ' (' + p.feature_count + ')';
          pSel.appendChild(opt);
        });
        if (prevVal) pSel.value = prevVal;

        // Re-render currently visible view
        renderProjectsGrid();
        renderFeaturesList();
        if (currentView === 'graph') renderGraph();

        if (showFeedback) showToast("Features & Knowledge Graph synced!", "🔄");
      } catch (err) {
        console.error("Refresh error:", err);
      } finally {
        if (icon) icon.classList.remove('spinning');
      }
    }

    function toggleAutoRefresh(enabled) {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
      if (enabled) {
        autoRefreshTimer = setInterval(() => refreshData(false), 15000);
        showToast("Auto-refresh enabled (15s)", "⏱️");
      } else {
        showToast("Auto-refresh paused", "⏸️");
      }
    }

    // --- Render Projects View ---
    function renderProjectsGrid() {
      const grid = document.getElementById('projects-cards-grid');
      grid.innerHTML = '';

      const projects = overviewData.projects || [];
      if (projects.length === 0) {
        grid.innerHTML = \`
          <div class="col-span-full py-16 text-center text-zinc-500 border border-zinc-800/80 rounded-xl bg-zinc-950/40 p-8 space-y-3">
            <div class="text-3xl">📁</div>
            <div class="font-semibold text-zinc-300">No projects recorded yet</div>
            <p class="text-xs max-w-md mx-auto text-zinc-500">
              When an agent in Antigravity or OpenCode runs an implementation and calls \`save_feature\`, the working directory project will appear here automatically.
            </p>
          </div>
        \`;
        return;
      }

      projects.forEach(p => {
        const card = document.createElement('div');
        card.className = "bg-zinc-900 border border-zinc-800 hover:border-emerald-500/60 rounded-xl p-5 space-y-4 transition shadow-lg hover:shadow-emerald-950/20 cursor-pointer flex flex-col justify-between group";
        card.onclick = () => selectProjectAndShowFeatures(p.project);

        const typesBadges = (p.types || []).map(t => \`
          <span class="text-[10px] px-2 py-0.5 rounded font-mono font-medium \${
            t === 'decision' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' :
            t === 'pattern' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/60' :
            'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
          }">\${t}</span>
        \`).join(' ');

        const tagsBadges = (p.tags || []).slice(0, 5).map(t => \`
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">#\${t}</span>
        \`).join(' ');

        card.innerHTML = \`
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2.5">
                <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono font-bold text-xs">
                  📁
                </div>
                <div>
                  <h3 class="text-base font-bold text-zinc-100 group-hover:text-emerald-400 transition font-mono">\${p.project}</h3>
                  <div class="text-[11px] text-zinc-500">Last updated: \${p.last_updated}</div>
                </div>
              </div>
            </div>

            <div class="flex items-center space-x-4 py-2 border-y border-zinc-800/80 text-xs">
              <div>
                <span class="font-bold text-zinc-100 text-sm">\${p.feature_count}</span>
                <span class="text-zinc-500 text-[11px] ml-1">\${p.feature_count === 1 ? 'Feature' : 'Features'}</span>
              </div>
              <div class="h-3 w-px bg-zinc-800"></div>
              <div>
                <span class="font-bold text-emerald-400 text-sm">\${p.total_chunks}</span>
                <span class="text-zinc-500 text-[11px] ml-1">Vector Chunks</span>
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex flex-wrap gap-1">\${typesBadges}</div>
              <div class="flex flex-wrap gap-1 pt-1">\${tagsBadges}</div>
            </div>
          </div>

          <div class="pt-2 flex items-center justify-between text-xs text-emerald-400 font-medium group-hover:translate-x-1 transition-transform">
            <span>Explore \${p.feature_count} features & chunks</span>
            <span>→</span>
          </div>
        \`;
        grid.appendChild(card);
      });
    }

    function selectProjectAndShowFeatures(project) {
      const banner = document.getElementById('active-project-banner');
      document.getElementById('active-project-name').textContent = project;

      const pObj = (overviewData.projects || []).find(p => p.project === project);
      const count = pObj ? pObj.feature_count : 0;
      document.getElementById('active-project-count').textContent = \`(\${count} \${count === 1 ? 'feature' : 'features'})\`;

      banner.classList.remove('hidden');
      document.getElementById('feat-filter-project').value = project;

      switchView('features');
    }

    function clearProjectFilter() {
      document.getElementById('active-project-banner').classList.add('hidden');
      document.getElementById('feat-filter-project').value = "";
      renderFeaturesList();
    }

    // --- Render Features List View ---
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
        container.innerHTML = \`
          <div class="col-span-2 text-zinc-500 py-16 text-center border border-zinc-800 rounded-xl bg-zinc-950/40 p-8 space-y-2">
            <div class="text-2xl">🔍</div>
            <div class="font-medium text-zinc-300">No features matched the selected filters</div>
            <button onclick="clearProjectFilter()" class="text-xs text-emerald-400 underline">Reset all filters</button>
          </div>
        \`;
        return;
      }

      filtered.forEach(f => {
        const card = document.createElement('div');
        card.className = "bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 space-y-3 transition cursor-pointer shadow-md";
        card.onclick = () => openDrawer(f.project, f.name);

        const tagsHtml = (f.tags || []).map(t => \`<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-mono">#\${t}</span>\`).join(' ');
        const filesHtml = (f.files || []).slice(0, 3).map(file => \`<div class="text-[11px] text-zinc-400 font-mono truncate">📄 \${file}</div>\`).join('');

        card.innerHTML = \`
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-medium text-indigo-400">📁 \${f.project}</span>
            <span class="text-[10px] px-2 py-0.5 rounded uppercase font-mono font-semibold \${
              f.type === 'decision' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' :
              f.type === 'pattern' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/60' :
              'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
            }">\${f.type}</span>
          </div>
          <h3 class="text-base font-bold text-zinc-100 hover:text-emerald-400 transition tracking-tight">\${f.name}</h3>
          <p class="text-xs text-zinc-300 line-clamp-2 leading-relaxed">\${f.summary}</p>
          <div class="space-y-1">\${filesHtml}</div>
          <div class="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px]">
            <div class="flex flex-wrap gap-1">\${tagsHtml}</div>
            <span class="text-zinc-500 font-mono">\${f.chunk_count} vector chunks</span>
          </div>
        \`;
        container.appendChild(card);
      });
    }

    // --- Render D3 Knowledge Graph View ---
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

      if (nodes.length === 0) return;

      const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(70))
        .force("charge", d3.forceManyBody().strength(-140))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(28));

      const link = g.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "link");

      const node = g.append("g")
        .selectAll(".node")
        .data(nodes)
        .join("g")
        .attr("class", "node cursor-pointer")
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
          if (d.type === 'project' || d.id.startsWith('proj:')) {
            selectProjectAndShowFeatures(d.name);
          } else if (d.type === 'feature' || d.id.startsWith('feat:')) {
            openDrawer(d.project, d.name);
          }
        });

      node.append("circle")
        .attr("r", d => d.type === 'project' ? 16 : (d.type === 'feature' ? 10 : 6))
        .attr("fill", d => {
          if (d.type === 'project') return '#6366f1';
          if (d.type === 'feature') return '#10b981';
          if (d.type === 'tag') return '#8b5cf6';
          return '#f59e0b';
        })
        .attr("stroke", "#18181b")
        .attr("stroke-width", 2);

      node.append("text")
        .attr("x", 14)
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

    // --- Open Feature Drawer ---
    async function openDrawer(project, name) {
      const drawer = document.getElementById('feature-drawer');
      const body = document.getElementById('drawer-body');
      drawer.classList.remove('translate-x-full');

      body.innerHTML = '<div class="py-16 text-center text-zinc-500 text-xs">Loading feature details & chunks from D1 & Vectorize...</div>';

      try {
        const feat = await apiFetch('/api/feature?project=' + encodeURIComponent(project) + '&name=' + encodeURIComponent(name));
        document.getElementById('drawer-name').textContent = feat.project + ' / ' + feat.name;
        document.getElementById('drawer-type').textContent = feat.type;

        let sectionsHtml = (feat.sections || []).map(s => \`
          <div class="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3.5 space-y-1.5">
            <div class="font-bold text-zinc-200 text-xs uppercase tracking-wider text-emerald-400">\${s.title}</div>
            <div class="whitespace-pre-wrap text-zinc-300 leading-relaxed font-sans text-xs">\${s.content}</div>
          </div>
        \`).join('');

        let chunksHtml = (feat.chunks || []).map(c => \`
          <div class="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-1.5">
            <div class="flex items-center justify-between font-mono text-[11px]">
              <span class="text-emerald-400 font-bold">[\${c.vector_id}]</span>
              <span class="text-zinc-500">idx: \${c.idx} • \${c.section}</span>
            </div>
            <pre class="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap leading-tight bg-zinc-900/70 p-2.5 rounded border border-zinc-800/80">\${c.text}</pre>
          </div>
        \`).join('');

        body.innerHTML = \`
          <div class="space-y-5">
            <div>
              <div class="text-[11px] uppercase font-mono text-zinc-500 mb-1 font-semibold">Summary</div>
              <p class="text-xs text-zinc-200 leading-relaxed bg-zinc-950 p-3.5 rounded-lg border border-zinc-800">\${feat.summary}</p>
            </div>

            <div>
              <div class="text-[11px] uppercase font-mono text-zinc-500 mb-1 font-semibold">Files Touched</div>
              <div class="space-y-1 font-mono text-xs">
                \${(feat.files || []).map(f => '<div class="text-zinc-300 bg-zinc-950/60 px-2.5 py-1.5 rounded border border-zinc-800/50 truncate">📄 ' + f + '</div>').join('')}
              </div>
            </div>

            <div class="space-y-3">
              <div class="text-[11px] uppercase font-mono text-zinc-500 font-semibold">Documentation Sections</div>
              \${sectionsHtml}
            </div>

            <div class="space-y-3 pt-4 border-t border-zinc-800">
              <div class="flex items-center justify-between">
                <span class="text-[11px] uppercase font-mono text-emerald-400 font-bold">Dense Vector Chunks (Vectorize)</span>
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

    // --- Hybrid Search Playground ---
    async function executeSearch() {
      const q = document.getElementById('search-input').value.trim();
      if (!q) return;

      const project = document.getElementById('search-project').value.trim() || undefined;
      const type = document.getElementById('search-type').value || undefined;
      const limit = parseInt(document.getElementById('search-limit').value, 10) || 5;

      const resultsContainer = document.getElementById('search-results');
      resultsContainer.innerHTML = '<div class="py-12 text-center text-zinc-500 text-xs">Executing hybrid search across Dense Vectorize & Sparse D1 FTS5...</div>';

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
          card.className = "bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 hover:border-zinc-700 transition cursor-pointer shadow-md";
          card.onclick = () => openDrawer(r.project, r.name);

          card.innerHTML = \`
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center space-x-2">
                <span class="font-mono text-xs text-indigo-400 font-medium">📁 \${r.project}</span>
                <span class="text-zinc-600">/</span>
                <span class="font-bold text-zinc-100 text-sm">\${r.name}</span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">\${r.type}</span>
              </div>
              <div class="flex items-center space-x-2">
                <span class="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono" title="Reciprocal Rank Fusion Score">RRF: \${r.rrf_score}</span>
                \${r.vector_score !== null ? \`<span class="text-[11px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono" title="Cosine Similarity">Dense: \${r.vector_score}</span>\` : ''}
                \${r.fts_matched ? \`<span class="text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-mono" title="Matched in FTS5 keyword index">FTS5 Match</span>\` : ''}
              </div>
            </div>

            <div class="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-1">
              <div class="text-[11px] text-zinc-500 font-mono">Matched Section: <span class="text-emerald-400 font-medium">\${r.matched_section}</span></div>
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

    // --- On Page Load ---
    const initialToken = getToken();
    if (initialToken) {
      updateAuthUI(true);
      refreshData(false);
    } else {
      updateAuthUI(false);
      openAuthModal();
    }
  </script>
</body>
</html>`;
}
