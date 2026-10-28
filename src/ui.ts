export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
  <title>Lekh — Feature Memory Explorer</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧠</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          screens: {
            'xs': '420px',
          },
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
    body {
      background-color: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100dvh;
      min-height: -webkit-fill-available;
      -webkit-tap-highlight-color: transparent;
    }
    .safe-top { padding-top: env(safe-area-inset-top, 0px); }
    .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
    .node text { pointer-events: none; font-size: 11px; fill: #d4d4d8; font-weight: 500; }
    .link { stroke: #27272a; stroke-opacity: 0.6; stroke-width: 1.5px; }
    .scrollbar-thin::-webkit-scrollbar { width: 5px; height: 5px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: #18181b; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    @keyframes spin-fast { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinning { animation: spin-fast 0.8s linear infinite; }
  </style>
</head>
<body class="h-[100dvh] flex flex-col overflow-hidden safe-top safe-bottom">
  <!-- Toast Notification -->
  <div id="toast" class="fixed top-3 right-3 left-3 sm:left-auto sm:right-4 z-50 transform translate-y-[-150%] opacity-0 transition-all duration-300 pointer-events-none">
    <div id="toast-content" class="px-4 py-2.5 rounded-xl text-xs font-medium bg-zinc-800/95 backdrop-blur text-zinc-100 border border-zinc-700 shadow-2xl flex items-center space-x-2.5">
      <span id="toast-icon">ℹ️</span>
      <span id="toast-msg">Notification</span>
    </div>
  </div>

  <!-- Top Navigation Bar -->
  <header class="h-14 sm:h-16 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-3 sm:px-6 flex items-center justify-between shrink-0 z-20">
    <div class="flex items-center space-x-2.5 sm:space-x-3 truncate">
      <div class="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm sm:text-base shrink-0">
        🧠
      </div>
      <div class="truncate">
        <div class="flex items-center space-x-1.5 sm:space-x-2">
          <span class="font-bold text-zinc-100 tracking-tight text-sm sm:text-base">Lekh</span>
          <span class="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.2 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono">MCP</span>
        </div>
        <p class="hidden md:block text-[11px] text-zinc-400 truncate">Persistent Architecture & Feature Memory</p>
      </div>
    </div>

    <!-- Quick Stats (Visible on desktop) -->
    <div id="stats-bar" class="hidden lg:flex items-center space-x-5 text-xs text-zinc-400">
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-indigo-500"></span><span>Projects:</span> <span id="stat-projects" class="font-semibold text-zinc-200">0</span></div>
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>Features:</span> <span id="stat-features" class="font-semibold text-zinc-200">0</span></div>
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-cyan-500"></span><span>Vectors:</span> <span id="stat-chunks" class="font-semibold text-zinc-200">0</span></div>
      <div class="flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-violet-500"></span><span>Tags:</span> <span id="stat-tags" class="font-semibold text-zinc-200">0</span></div>
    </div>

    <!-- Actions (Refresh, Auth) -->
    <div class="flex items-center space-x-2 shrink-0">
      <button type="button" onclick="openCreateFeatureModal()" title="Create feature" class="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium transition flex items-center space-x-1.5 text-xs shadow-md">
        <span class="text-sm font-bold leading-none">+</span>
        <span class="hidden sm:inline">New Feature</span>
      </button>

      <button type="button" onclick="refreshData(true)" id="refresh-btn" title="Refresh latest features" class="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 border border-zinc-700 transition flex items-center space-x-1.5 text-xs">
        <svg id="refresh-icon" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        <span class="hidden sm:inline">Refresh</span>
      </button>

      <button type="button" onclick="openAuthModal()" id="auth-status-btn" class="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 border border-zinc-700 transition flex items-center space-x-1.5 sm:space-x-2 text-xs">
        <span id="auth-indicator" class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
        <span id="auth-btn-text" class="hidden xs:inline">Connect Token</span>
        <span class="xs:hidden text-xs">🔑</span>
      </button>
    </div>
  </header>

  <!-- View Navigation Tabs (Touch-scrollable on mobile) -->
  <div class="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur px-2 sm:px-6 flex items-center justify-between shrink-0 overflow-x-auto no-scrollbar">
    <div class="flex space-x-1 sm:space-x-4 shrink-0">
      <button type="button" onclick="switchView('projects')" id="tab-projects" class="px-2.5 sm:px-3 py-2.5 sm:py-3 border-b-2 border-emerald-500 text-emerald-400 transition flex items-center space-x-1.5 whitespace-nowrap text-xs sm:text-sm font-medium">
        <span>📁 Projects</span>
        <span id="badge-projects-count" class="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-mono">0</span>
      </button>
      <button type="button" onclick="switchView('features')" id="tab-features" class="px-2.5 sm:px-3 py-2.5 sm:py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition flex items-center space-x-1.5 whitespace-nowrap text-xs sm:text-sm font-medium">
        <span>📚 Features</span>
        <span id="badge-features-count" class="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-mono">0</span>
      </button>
      <button type="button" onclick="switchView('graph')" id="tab-graph" class="px-2.5 sm:px-3 py-2.5 sm:py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap text-xs sm:text-sm font-medium">
        <span>🌐 Graph</span>
      </button>
      <button type="button" onclick="switchView('search')" id="tab-search" class="px-2.5 sm:px-3 py-2.5 sm:py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap text-xs sm:text-sm font-medium">
        <span>⚡ Search</span>
      </button>
      <button type="button" onclick="switchView('stats')" id="tab-stats" class="px-2.5 sm:px-3 py-2.5 sm:py-3 border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap text-xs sm:text-sm font-medium">
        <span>📊 Stats & Usage</span>
      </button>
    </div>

    <div class="hidden md:flex items-center space-x-2 text-[11px] text-zinc-400 shrink-0 pl-4">
      <label class="flex items-center space-x-1.5 cursor-pointer">
        <input type="checkbox" id="auto-refresh-toggle" onchange="toggleAutoRefresh(this.checked)" class="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0">
        <span>Auto-sync (15s)</span>
      </label>
    </div>
  </div>

  <!-- Global Connection Error Banner -->
  <div id="connection-error-banner" class="hidden bg-red-950/80 border-b border-red-800 px-3 sm:px-6 py-2.5 sm:py-3 shrink-0">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-red-200 text-xs">
      <div class="flex items-center space-x-2.5">
        <span class="text-lg">⚠️</span>
        <div>
          <div class="font-bold text-red-100 text-xs" id="error-banner-title">Unable to connect</div>
          <div class="text-[11px] text-red-300 font-mono line-clamp-1" id="error-banner-msg">Network error or invalid token.</div>
        </div>
      </div>
      <div class="flex items-center space-x-2 shrink-0">
        <button type="button" onclick="openAuthModal()" class="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 active:bg-red-700 text-white font-medium transition text-xs">🔑 Connect Token</button>
        <button type="button" onclick="refreshData(true)" class="min-h-[36px] px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 transition text-xs">🔄 Retry</button>
      </div>
    </div>
  </div>

  <!-- Main Content Area -->
  <main class="flex-1 relative overflow-hidden">
    <!-- VIEW 1: Projects Overview (Default) -->
    <div id="view-projects" class="absolute inset-0 overflow-y-auto p-3 sm:p-6 scrollbar-thin">
      <div class="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3 sm:pb-4">
          <div>
            <h2 class="text-base sm:text-lg font-bold text-zinc-100">All Working Directories & Projects</h2>
            <p class="text-xs text-zinc-400">Click any project card to explore features or click 🗑️ to delete.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button type="button" onclick="exportFeaturesJson()" title="Download entire memory bank as JSON backup" class="min-h-[34px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 border border-zinc-800 hover:border-zinc-700 text-xs transition flex items-center space-x-1.5 shadow-sm">
              <span>⬇️</span><span>Export JSON</span>
            </button>
            <button type="button" onclick="triggerImportJson()" title="Import feature memory JSON bundle" class="min-h-[34px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 border border-zinc-800 hover:border-zinc-700 text-xs transition flex items-center space-x-1.5 shadow-sm">
              <span>⬆️</span><span>Import JSON</span>
            </button>
            <div id="projects-summary-tag" class="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md">
              Showing <span id="projects-total-count" class="font-semibold text-zinc-200">0</span> active projects
            </div>
          </div>
        </div>

        <div id="projects-cards-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          <!-- Dynamically populated project cards -->
        </div>
      </div>
    </div>

    <!-- VIEW 2: Features Browser -->
    <div id="view-features" class="absolute inset-0 hidden overflow-y-auto p-3 sm:p-6 scrollbar-thin">
      <div class="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <!-- Active Filter Banner (When navigating from Projects) -->
        <div id="active-project-banner" class="hidden bg-indigo-950/50 border border-indigo-800/70 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-300">
          <div class="flex items-center space-x-2">
            <span>📁 Project:</span>
            <span id="active-project-name" class="font-mono font-bold text-white px-2 py-0.5 rounded bg-indigo-900/80 text-xs"></span>
            <span id="active-project-count" class="text-indigo-400 text-xs"></span>
          </div>
          <button type="button" onclick="clearProjectFilter()" class="text-xs underline hover:text-white transition py-1">Show All Projects</button>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base sm:text-lg font-bold text-zinc-100">Features & Chunks</h2>
            <p class="text-xs text-zinc-400">Click any feature to inspect markdown sections, or click 🗑️ to delete.</p>
          </div>

          <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <button type="button" onclick="openCreateFeatureModal()" class="col-span-2 sm:col-span-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium transition flex items-center justify-center space-x-1.5 text-xs shadow-md">
              <span class="font-bold">+</span><span>New Feature</span>
            </button>
            <select id="feat-filter-project" onchange="renderFeaturesList()" class="bg-zinc-800 border border-zinc-700 text-base sm:text-xs min-h-[40px] rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500 w-full">
              <option value="">All Projects</option>
            </select>
            <select id="feat-filter-type" onchange="renderFeaturesList()" class="bg-zinc-800 border border-zinc-700 text-base sm:text-xs min-h-[40px] rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500 w-full">
              <option value="">All Types</option>
              <option value="feature">feature</option>
              <option value="pattern">pattern</option>
              <option value="decision">decision</option>
              <option value="fix">fix</option>
              <option value="refactor">refactor</option>
            </select>
          </div>
        </div>

        <div id="features-cards" class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <!-- Dynamically populated feature cards -->
        </div>
      </div>
    </div>

    <!-- VIEW 3: Knowledge Graph -->
    <div id="view-graph" class="absolute inset-0 hidden flex">
      <div id="graph-container" class="flex-1 h-full w-full relative touch-none">
        <svg id="graph-svg" class="w-full h-full cursor-grab active:cursor-grabbing"></svg>

        <!-- Mobile Floating Zoom Controls -->
        <div class="absolute bottom-4 right-4 flex flex-col space-y-1.5 z-10">
          <button type="button" onclick="zoomIn()" title="Zoom In" class="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-zinc-900/90 border border-zinc-700 text-zinc-200 flex items-center justify-center text-lg active:bg-zinc-700 shadow-2xl backdrop-blur font-bold">+</button>
          <button type="button" onclick="zoomOut()" title="Zoom Out" class="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-zinc-900/90 border border-zinc-700 text-zinc-200 flex items-center justify-center text-lg active:bg-zinc-700 shadow-2xl backdrop-blur font-bold">−</button>
          <button type="button" onclick="resetZoom()" title="Reset View" class="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-zinc-900/90 border border-zinc-700 text-zinc-200 flex items-center justify-center text-xs active:bg-zinc-700 shadow-2xl backdrop-blur">🎯</button>
        </div>

        <!-- Collapsible Legend -->
        <details class="absolute bottom-4 left-4 bg-zinc-950/90 border border-zinc-800 rounded-xl p-2.5 text-xs backdrop-blur shadow-2xl max-w-[210px] z-10">
          <summary class="cursor-pointer font-semibold text-zinc-300 text-xs select-none">Graph Legend</summary>
          <div class="mt-2 space-y-1.5 pt-1 border-t border-zinc-800/80 text-[11px]">
            <div class="flex items-center space-x-2"><span class="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block shrink-0"></span><span class="truncate">Project / CWD</span></div>
            <div class="flex items-center space-x-2"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0"></span><span class="truncate">Feature</span></div>
            <div class="flex items-center space-x-2"><span class="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block shrink-0"></span><span class="truncate">Tag</span></div>
            <div class="flex items-center space-x-2"><span class="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0"></span><span class="truncate">File Path</span></div>
          </div>
        </details>
      </div>
    </div>

    <!-- VIEW 4: Hybrid Search Playground -->
    <div id="view-search" class="absolute inset-0 hidden overflow-y-auto p-3 sm:p-6 scrollbar-thin">
      <div class="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        <div>
          <h2 class="text-base sm:text-lg font-bold text-zinc-100">Hybrid Search Inspector</h2>
          <p class="text-xs text-zinc-400">Dense Vectorize Cosine Embeddings (1024d) + Sparse D1 FTS5 (BM25) with Reciprocal Rank Fusion ($k=60$)</p>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 sm:p-4 space-y-3 sm:space-y-4 shadow-lg">
          <div class="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <input type="text" id="search-input" onkeydown="if(event.key==='Enter') executeSearch()" placeholder="Type a concept, keyword, component, or file..." class="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-[44px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500">
            <button type="button" onclick="executeSearch()" class="min-h-[44px] px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-sm font-semibold text-white transition flex items-center justify-center space-x-1.5 shrink-0">
              <span>Search</span>
            </button>
          </div>

          <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 text-xs">
            <div class="flex items-center space-x-1.5 col-span-2 sm:col-span-1">
              <span class="text-zinc-400 shrink-0">Project:</span>
              <input type="text" id="search-project" placeholder="optional" class="w-full sm:w-32 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 min-h-[38px] text-base sm:text-xs text-zinc-200">
            </div>
            <div class="flex items-center space-x-1.5">
              <span class="text-zinc-400 shrink-0">Type:</span>
              <select id="search-type" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 min-h-[38px] text-base sm:text-xs text-zinc-200">
                <option value="">Any</option>
                <option value="feature">feature</option>
                <option value="pattern">pattern</option>
                <option value="decision">decision</option>
                <option value="fix">fix</option>
                <option value="refactor">refactor</option>
              </select>
            </div>
            <div class="flex items-center space-x-1.5">
              <span class="text-zinc-400 shrink-0">Top:</span>
              <select id="search-limit" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 min-h-[38px] text-base sm:text-xs text-zinc-200">
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </div>
            <div class="flex items-center space-x-1.5 col-span-2 sm:col-span-1 sm:pl-2">
              <label class="flex items-center space-x-1.5 cursor-pointer text-xs text-zinc-300">
                <input type="checkbox" id="search-rerank" checked class="rounded bg-zinc-950 border-zinc-700 text-emerald-500 focus:ring-0">
                <span title="Stage-3 Cross-Encoder Reranker (@cf/baai/bge-reranker-base)">🎯 Reranker</span>
              </label>
            </div>
          </div>
        </div>

        <div id="search-results" class="space-y-3 sm:space-y-4">
          <!-- Dynamically populated search cards -->
        </div>
      </div>
    </div>

    <!-- VIEW 5: Live Infrastructure & Stats -->
    <div id="view-stats" class="absolute inset-0 hidden overflow-y-auto p-3 sm:p-6 scrollbar-thin">
      <div class="max-w-5xl mx-auto space-y-4 sm:space-y-6 pb-20">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3 sm:pb-4">
          <div>
            <h2 class="text-base sm:text-lg font-bold text-zinc-100">Live Compute & Resource Stats</h2>
            <p class="text-xs text-zinc-400">Real-time stats from Workers AI Neurons, Cloudflare D1, and Vectorize V2.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button type="button" onclick="exportFeaturesJson()" title="Download entire memory bank as JSON backup" class="min-h-[34px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 border border-zinc-800 hover:border-zinc-700 text-xs transition flex items-center space-x-1.5 shadow-sm">
              <span>⬇️</span><span>Export JSON</span>
            </button>
            <button type="button" onclick="triggerImportJson()" title="Import feature memory JSON bundle" class="min-h-[34px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-300 border border-zinc-800 hover:border-zinc-700 text-xs transition flex items-center space-x-1.5 shadow-sm">
              <span>⬆️</span><span>Import JSON</span>
            </button>
            <button type="button" onclick="loadStatsView(true)" class="min-h-[34px] px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 transition flex items-center space-x-1.5 shadow-sm">
              <span>🔄 Refresh Stats</span>
            </button>
          </div>
        </div>

        <div id="stats-content-grid" class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          <!-- Dynamically populated via loadStatsView -->
        </div>
      </div>
    </div>
  </main>

  <!-- Feature Detail Drawer (Full width on mobile, slide-over on desktop) -->
  <div id="feature-drawer" class="fixed inset-y-0 right-0 w-full sm:w-[540px] md:w-[640px] max-w-full bg-zinc-900 border-l border-zinc-800 shadow-2xl transform translate-x-full transition-transform duration-300 z-50 flex flex-col">
    <div class="h-14 sm:h-16 border-b border-zinc-800 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
      <div class="flex items-center space-x-2 truncate pr-2">
        <span id="drawer-type" class="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase font-mono font-medium shrink-0">feature</span>
        <span id="drawer-name" class="font-bold text-zinc-100 text-xs sm:text-sm truncate">Feature Name</span>
      </div>
      <div class="flex items-center space-x-1.5 -mr-2">
        <button type="button" onclick="editCurrentDrawerFeature()" title="Edit this feature" class="min-h-[34px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 transition text-xs flex items-center space-x-1">
          <span>✏️</span><span class="hidden sm:inline">Edit</span>
        </button>
        <button type="button" onclick="closeDrawer()" title="Close drawer" class="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-lg text-zinc-400 hover:text-zinc-100 active:bg-zinc-800 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
    </div>
    <div id="drawer-body" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 scrollbar-thin text-xs text-zinc-300 pb-20">
      <!-- Populated via openDrawer -->
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  <div id="delete-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-3 sm:p-4">
    <div class="bg-zinc-900 border border-red-900/60 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 text-xl font-bold shrink-0">
          ⚠️
        </div>
        <div>
          <h3 class="font-bold text-zinc-100 text-sm sm:text-base" id="delete-modal-title">Confirm Deletion</h3>
          <div class="text-[11px] text-zinc-400" id="delete-modal-subtitle">Permanent removal of vector & database records</div>
        </div>
      </div>

      <div class="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs space-y-2 text-zinc-300">
        <p id="delete-modal-msg" class="leading-relaxed"></p>
        <div class="text-[11px] text-red-400 font-mono bg-red-950/40 p-2 rounded-lg border border-red-950/80">
          ⚠️ Action cannot be undone. Chunks, vector embeddings, and search records will be erased.
        </div>
      </div>

      <div class="flex items-center justify-end space-x-2 pt-2">
        <button type="button" onclick="closeDeleteModal()" class="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition">Cancel</button>
        <button type="button" id="confirm-delete-btn" onclick="executeDeleteAction()" class="min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 active:bg-red-700 text-white transition flex items-center space-x-1.5">
          <span id="delete-btn-spinner" class="hidden">⏳</span>
          <span id="delete-btn-label">Delete Permanently</span>
        </button>
      </div>
    </div>
  </div>

  <!-- In-Page Token Modal -->
  <div id="auth-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-3 sm:p-4">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">🔑</div>
          <h3 class="font-bold text-zinc-100 text-sm sm:text-base">Connect to Lekh Engine</h3>
        </div>
        <button type="button" onclick="closeAuthModal()" class="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-zinc-200">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <p class="text-xs text-zinc-400 leading-relaxed">
        Enter your Lekh Bearer token (<code class="bg-zinc-950 px-1 py-0.5 rounded text-emerald-400 font-mono text-[11px]">MCP_AUTH_TOKEN</code>) to query features, inspect chunk boundaries, and sync memory.
      </p>

      <div class="space-y-1.5">
        <label class="text-[11px] font-medium text-zinc-300">Bearer Token</label>
        <div class="relative">
          <input type="password" id="modal-token-input" onkeydown="if(event.key==='Enter') saveModalToken()" placeholder="Paste your token here..." class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2.5 text-base sm:text-xs min-h-[44px] text-zinc-100 focus:outline-none focus:border-emerald-500 font-mono">
          <button type="button" onclick="toggleTokenVisibility()" class="absolute right-2.5 top-2.5 min-w-[32px] min-h-[32px] text-zinc-500 hover:text-zinc-300 text-xs">👁️</button>
        </div>
      </div>

      <div id="modal-auth-error" class="hidden text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-2.5"></div>

      <div class="flex items-center justify-between pt-1">
        <button type="button" onclick="clearSavedToken()" class="text-xs text-zinc-500 hover:text-red-400 active:text-red-300 transition py-1">Clear Saved</button>
        <div class="flex items-center space-x-2">
          <button type="button" onclick="closeAuthModal()" class="min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition">Cancel</button>
          <button type="button" onclick="saveModalToken()" class="min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition">Save & Connect</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Create / Edit Feature Modal -->
  <div id="feature-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-3 sm:p-4">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">📝</div>
          <h3 class="font-bold text-zinc-100 text-sm sm:text-base" id="modal-feat-title">Create New Feature</h3>
        </div>
        <button type="button" onclick="closeFeatureModal()" class="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-zinc-200">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-zinc-300">Project / Working Directory *</label>
            <input type="text" id="modal-feat-project" placeholder="e.g. lekh" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500">
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-zinc-300">Feature Slug *</label>
            <input type="text" id="modal-feat-name" placeholder="e.g. jwt-auth-middleware" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500">
          </div>
        </div>

        <div class="space-y-1">
          <label class="text-[11px] font-medium text-zinc-300">Parent Feature Slug (Optional — nests under existing feature to prevent vector bloat)</label>
          <input type="text" id="modal-feat-parent" placeholder="e.g. feature-memory-server (leave empty for top-level feature)" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500">
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-zinc-300">Type</label>
            <select id="modal-feat-type" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500">
              <option value="feature">feature</option>
              <option value="pattern">pattern</option>
              <option value="decision">decision</option>
              <option value="fix">fix</option>
              <option value="refactor">refactor</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-zinc-300">Importance</label>
            <select id="modal-feat-importance" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500">
              <option value="1">1 (Minor / Isolated)</option>
              <option value="2" selected>2 (Standard Feature)</option>
              <option value="3">3 (Critical Architecture)</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-zinc-300">Library (Optional)</label>
            <input type="text" id="modal-feat-library" placeholder="e.g. zod, d1" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500">
          </div>
        </div>

        <div class="space-y-1">
          <label class="text-[11px] font-medium text-zinc-300">Summary * (2-4 sentences)</label>
          <textarea id="modal-feat-summary" rows="2" placeholder="Explain what it does, why it exists, and how to use it..." class="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 leading-relaxed"></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-zinc-300">Touched Files (comma or newline separated)</label>
            <textarea id="modal-feat-files" rows="2" placeholder="src/store.ts, src/mcp.ts" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"></textarea>
          </div>
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-zinc-300">Tags (comma separated)</label>
            <textarea id="modal-feat-tags" rows="2" placeholder="auth, security, d1" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"></textarea>
          </div>
        </div>

        <div class="space-y-2 pt-2 border-t border-zinc-800">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-bold uppercase font-mono text-zinc-300">Documentation Sections *</label>
            <button type="button" onclick="addModalSectionRow()" class="text-xs text-emerald-400 hover:text-emerald-300 transition flex items-center space-x-1 py-1">
              <span>+ Add Section</span>
            </button>
          </div>
          <div id="modal-feat-sections" class="space-y-2.5">
            <!-- Dynamic section rows -->
          </div>
        </div>

        <div id="modal-feat-error" class="hidden text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-2.5"></div>
      </div>

      <div class="flex items-center justify-between pt-3 border-t border-zinc-800 shrink-0">
        <button type="button" onclick="closeFeatureModal()" class="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition">Cancel</button>
        <button type="button" id="modal-feat-save-btn" onclick="saveFeatureFromModal()" class="min-h-[40px] px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition flex items-center space-x-1.5 shadow-md">
          <span>Save Feature</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Hidden File Input for JSON Backup Import -->
  <input type="file" id="import-json-file-input" accept=".json" onchange="handleImportJsonFile(event)" class="hidden">

  <script>
    let overviewData = { projects: [], features: [], stats: {}, graph: { nodes: [], links: [] } };
    let currentView = 'projects';
    let autoRefreshTimer = null;
    let currentSvg = null;
    let currentZoom = null;
    let pendingDelete = null; // { type: 'project' | 'feature', project: string, name?: string }
    let currentDrawerFeature = null; // { project: string, name: string }
    let lastLoadedDrawerFeature = null;
    let currentEditingFeature = null;

    // --- Create / Edit Feature Modal Functions ---
    function openCreateFeatureModal(prefillProject = '', prefillParent = '') {
      currentEditingFeature = null;
      document.getElementById('modal-feat-title').textContent = prefillParent ? ('Add Nested Update to ' + prefillParent) : 'Create New Feature';
      document.getElementById('modal-feat-project').value = prefillProject || '';
      document.getElementById('modal-feat-project').disabled = Boolean(prefillProject);
      document.getElementById('modal-feat-name').value = '';
      document.getElementById('modal-feat-name').disabled = false;
      document.getElementById('modal-feat-parent').value = prefillParent || '';
      document.getElementById('modal-feat-parent').disabled = Boolean(prefillParent);
      document.getElementById('modal-feat-type').value = prefillParent ? 'fix' : 'feature';
      document.getElementById('modal-feat-importance').value = '2';
      document.getElementById('modal-feat-library').value = '';
      document.getElementById('modal-feat-summary').value = '';
      document.getElementById('modal-feat-files').value = '';
      document.getElementById('modal-feat-tags').value = '';
      document.getElementById('modal-feat-error').classList.add('hidden');

      const sectionsContainer = document.getElementById('modal-feat-sections');
      sectionsContainer.innerHTML = '';
      if (prefillParent) {
        addModalSectionRow('details', '');
      } else {
        addModalSectionRow('overview', '');
        addModalSectionRow('architecture', '');
        addModalSectionRow('gotchas', '');
      }

      document.getElementById('feature-modal').classList.remove('hidden');
    }

    function openEditFeatureModal(feat) {
      currentEditingFeature = feat;
      document.getElementById('modal-feat-title').textContent = 'Edit Feature: ' + feat.name;
      document.getElementById('modal-feat-project').value = feat.project;
      document.getElementById('modal-feat-project').disabled = true;
      document.getElementById('modal-feat-name').value = feat.name;
      document.getElementById('modal-feat-name').disabled = true;
      document.getElementById('modal-feat-parent').value = '';
      document.getElementById('modal-feat-parent').disabled = true;
      document.getElementById('modal-feat-type').value = feat.type || 'feature';
      document.getElementById('modal-feat-importance').value = String(feat.importance || 2);
      document.getElementById('modal-feat-library').value = feat.library || '';
      document.getElementById('modal-feat-summary').value = feat.summary || '';
      document.getElementById('modal-feat-files').value = (feat.files || []).join('\\n');
      document.getElementById('modal-feat-tags').value = (feat.tags || []).join(', ');
      document.getElementById('modal-feat-error').classList.add('hidden');

      const sectionsContainer = document.getElementById('modal-feat-sections');
      sectionsContainer.innerHTML = '';
      if (feat.sections && feat.sections.length > 0) {
        feat.sections.forEach(s => addModalSectionRow(s.title, s.content));
      } else {
        addModalSectionRow('overview', '');
      }

      document.getElementById('feature-modal').classList.remove('hidden');
    }

    function closeFeatureModal() {
      document.getElementById('feature-modal').classList.add('hidden');
    }

    function addModalSectionRow(title = '', content = '') {
      const container = document.getElementById('modal-feat-sections');
      const div = document.createElement('div');
      div.className = 'section-row bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-2';
      div.innerHTML = \`
        <div class="flex items-center justify-between gap-2">
          <input type="text" placeholder="Section Title (e.g. overview, gotchas)" value="\${title.replace(/"/g, '&quot;')}" class="sec-title-input flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500">
          <button type="button" onclick="this.closest('.section-row').remove()" class="text-zinc-500 hover:text-red-400 p-1 text-xs">✕</button>
        </div>
        <textarea rows="3" placeholder="Detailed section markdown content..." class="sec-content-input w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500">\${content}</textarea>
      \`;
      container.appendChild(div);
    }

    async function saveFeatureFromModal() {
      const errBox = document.getElementById('modal-feat-error');
      errBox.classList.add('hidden');

      const project = document.getElementById('modal-feat-project').value.trim();
      const name = document.getElementById('modal-feat-name').value.trim();
      const parent_name = document.getElementById('modal-feat-parent').value.trim() || undefined;
      const type = document.getElementById('modal-feat-type').value;
      const importance = parseInt(document.getElementById('modal-feat-importance').value, 10) || 2;
      const library = document.getElementById('modal-feat-library').value.trim() || undefined;
      const summary = document.getElementById('modal-feat-summary').value.trim();

      const rawFiles = document.getElementById('modal-feat-files').value;
      const files = rawFiles.split(/[\\n,]+/).map(f => f.trim()).filter(Boolean);

      const rawTags = document.getElementById('modal-feat-tags').value;
      const tags = rawTags.split(/[\\n,]+/).map(t => t.trim()).filter(Boolean);

      if (!project || !name || !summary) {
        errBox.textContent = 'Project, Name, and Summary are required fields.';
        errBox.classList.remove('hidden');
        return;
      }

      const sectionRows = document.querySelectorAll('#modal-feat-sections .section-row');
      const sections = [];
      sectionRows.forEach(row => {
        const sTitle = row.querySelector('.sec-title-input').value.trim();
        const sContent = row.querySelector('.sec-content-input').value.trim();
        if (sTitle && sContent) {
          sections.push({ title: sTitle, content: sContent });
        }
      });

      if (sections.length === 0) {
        errBox.textContent = 'At least one section with non-empty title and content is required.';
        errBox.classList.remove('hidden');
        return;
      }

      const btn = document.getElementById('modal-feat-save-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const payload = { project, name, parent_name, type, importance, library, summary, sections, files, tags };
        await apiFetch('/api/feature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        closeFeatureModal();
        if (parent_name) {
          showToast("Nested update '" + name + "' added under " + parent_name + "!", '✅');
        } else {
          showToast("Feature '" + name + "' saved successfully!", '✅');
        }
        await refreshData(true);
        if (currentDrawerFeature && currentDrawerFeature.project === project) {
          const targetDrawer = parent_name || name;
          if (currentDrawerFeature.name === targetDrawer) {
            openDrawer(project, targetDrawer);
          }
        }
      } catch (err) {
        errBox.textContent = 'Save failed: ' + (err.message || String(err));
        errBox.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Feature';
      }
    }
    }

    // --- 1-Click JSON Backup Export & Import ---
    async function exportFeaturesJson() {
      try {
        showToast("Generating memory backup bundle...", "⬇️");
        const bundle = await apiFetch('/api/export');
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lekh-memory-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Exported " + (bundle.features?.length || 0) + " features!", "✅");
      } catch (err) {
        showToast("Export failed: " + err.message, "❌");
      }
    }

    function triggerImportJson() {
      const fileInput = document.getElementById('import-json-file-input');
      if (fileInput) fileInput.click();
    }

    async function handleImportJsonFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = '';

      try {
        showToast("Reading backup file...", "⬆️");
        const text = await file.text();
        const data = JSON.parse(text);
        const features = Array.isArray(data) ? data : data?.features;
        if (!Array.isArray(features)) {
          throw new Error("Invalid format: expected array of features or { features: [...] }");
        }

        showToast("Importing " + features.length + " features...", "⏳");
        const res = await apiFetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(features)
        });

        showToast("Imported " + res.imported + " features (" + res.unchanged + " unchanged)", "✅");
        await refreshData(true);
      } catch (err) {
        showToast("Import failed: " + err.message, "❌");
      }
    }

    // 0. Auto-extract token from URL query (?token=...) or hash (#token=...)
    (function checkUrlToken() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
        const hashParams = new URLSearchParams(hash);
        const paramToken = urlParams.get('token') || hashParams.get('token');
        if (paramToken && paramToken.trim()) {
          localStorage.setItem("lekh_token", paramToken.trim());
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch (e) {
        console.warn("Could not parse URL token", e);
      }
    })();

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
      return (localStorage.getItem("lekh_token") || "").trim();
    }

    function openAuthModal() {
      document.getElementById('modal-token-input').value = getToken();
      document.getElementById('modal-auth-error').classList.add('hidden');
      document.getElementById('auth-modal').classList.remove('hidden');
      setTimeout(() => {
        const input = document.getElementById('modal-token-input');
        if (input) input.focus();
      }, 50);
    }

    function closeAuthModal() {
      document.getElementById('auth-modal').classList.add('hidden');
    }

    function toggleTokenVisibility() {
      const input = document.getElementById('modal-token-input');
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    function showErrorBanner(title, msg) {
      const b = document.getElementById('connection-error-banner');
      if (b) {
        document.getElementById('error-banner-title').textContent = title;
        document.getElementById('error-banner-msg').textContent = msg;
        b.classList.remove('hidden');
      }
    }

    function hideErrorBanner() {
      const b = document.getElementById('connection-error-banner');
      if (b) b.classList.add('hidden');
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
        showModalError(err.message || "Authentication failed: token rejected by server (401).");
        updateAuthUI(false);
      }
    }

    function clearSavedToken() {
      localStorage.removeItem("lekh_token");
      document.getElementById('modal-token-input').value = "";
      updateAuthUI(false);
      closeAuthModal();
      showToast("Token cleared", "🗑️");
      showErrorBanner("Token Cleared", "Please connect your Bearer token to inspect features.");
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
      ['projects', 'features', 'graph', 'search', 'stats'].forEach(v => {
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
      } else if (view === 'stats') {
        loadStatsView(false);
      }
    }

    async function apiFetch(endpoint, options = {}) {
      const token = getToken();
      if (!token) {
        openAuthModal();
        throw new Error("Missing Bearer token. Please click Connect Token.");
      }

      const headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        ...(options.headers || {})
      };

      let res;
      try {
        res = await fetch(endpoint, { ...options, headers });
      } catch (netErr) {
        throw new Error("Network error (" + (netErr.name || 'FetchFailed') + "): " + (netErr.message || "Connection was blocked or aborted by the browser."));
      }

      if (res.status === 401) {
        updateAuthUI(false);
        openAuthModal();
        showModalError("401 Unauthorized: Invalid Bearer token.");
        throw new Error("401 Unauthorized: Invalid Bearer token");
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error("HTTP " + res.status + ": " + (errText || res.statusText));
      }

      return res.json();
    }

    async function refreshData(showFeedback = false) {
      const icon = document.getElementById('refresh-icon');
      if (icon) icon.classList.add('spinning');

      try {
        overviewData = await apiFetch('/api/overview');
        updateAuthUI(true);
        hideErrorBanner();

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
        if (currentView === 'stats') loadStatsView(false);

        if (showFeedback) showToast("Features & Knowledge Graph synced!", "🔄");
      } catch (err) {
        console.error("Refresh error:", err);
        updateAuthUI(false);
        showErrorBanner("Connection Error", err.message || "Failed to load features. Please check your Bearer token.");
        throw err;
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
        autoRefreshTimer = setInterval(() => {
          refreshData(false).catch(() => {});
        }, 15000);
        showToast("Auto-refresh enabled (15s)", "⏱️");
      } else {
        showToast("Auto-refresh paused", "⏸️");
      }
    }

    // --- Deletion Flow (Projects & Features) ---
    function promptDeleteProject(project, count) {
      pendingDelete = { type: 'project', project };
      document.getElementById('delete-modal-title').textContent = "Delete Project '" + project + "'";
      document.getElementById('delete-modal-subtitle').textContent = "Removes all features & vectors under this project";
      document.getElementById('delete-modal-msg').innerHTML = "Are you sure you want to delete project <strong class='text-white font-mono'>" + project + "</strong> and all its <strong>" + count + " feature(s)</strong>? This will permanently remove its vector embeddings and search indexes.";
      document.getElementById('delete-modal').classList.remove('hidden');
    }

    function promptDeleteFeature(project, name) {
      pendingDelete = { type: 'feature', project, name };
      document.getElementById('delete-modal-title').textContent = "Delete Feature '" + name + "'";
      document.getElementById('delete-modal-subtitle').textContent = "Removes feature record, chunks & embeddings";
      document.getElementById('delete-modal-msg').innerHTML = "Are you sure you want to delete feature <strong class='text-white font-mono'>" + name + "</strong> from project <strong class='text-indigo-400 font-mono'>" + project + "</strong>? All vector chunks and FTS5 entries will be purged.";
      document.getElementById('delete-modal').classList.remove('hidden');
    }

    function closeDeleteModal() {
      document.getElementById('delete-modal').classList.add('hidden');
      pendingDelete = null;
    }

    async function executeDeleteAction() {
      if (!pendingDelete) return;

      const spinner = document.getElementById('delete-btn-spinner');
      const label = document.getElementById('delete-btn-label');
      const btn = document.getElementById('confirm-delete-btn');

      spinner.classList.remove('hidden');
      label.textContent = "Deleting...";
      btn.disabled = true;

      try {
        if (pendingDelete.type === 'project') {
          const res = await apiFetch('/api/project?project=' + encodeURIComponent(pendingDelete.project), {
            method: 'DELETE'
          });
          showToast("Project '" + pendingDelete.project + "' deleted (" + res.features_removed + " features removed)", "🗑️");
        } else if (pendingDelete.type === 'feature') {
          const res = await apiFetch('/api/feature?project=' + encodeURIComponent(pendingDelete.project) + '&name=' + encodeURIComponent(pendingDelete.name), {
            method: 'DELETE'
          });
          showToast("Feature '" + pendingDelete.name + "' deleted (" + res.vectors_removed + " vectors removed)", "🗑️");
          closeDrawer();
        }

        closeDeleteModal();
        await refreshData(false);
      } catch (err) {
        alert("Failed to delete: " + err.message);
      } finally {
        spinner.classList.add('hidden');
        label.textContent = "Delete Permanently";
        btn.disabled = false;
      }
    }

    // --- Render Projects View ---
    function renderProjectsGrid() {
      const grid = document.getElementById('projects-cards-grid');
      grid.innerHTML = '';

      const projects = overviewData.projects || [];
      if (projects.length === 0) {
        grid.innerHTML = \`
          <div class="col-span-full py-12 sm:py-16 text-center text-zinc-500 border border-zinc-800/80 rounded-2xl bg-zinc-950/40 p-6 sm:p-8 space-y-3">
            <div class="text-3xl">📁</div>
            <div class="font-semibold text-zinc-300 text-sm sm:text-base">No projects recorded yet</div>
            <p class="text-xs max-w-md mx-auto text-zinc-500">
              When an agent in Antigravity or OpenCode runs an implementation and calls save_feature, the working directory project will appear here automatically.
            </p>
          </div>
        \`;
        return;
      }

      projects.forEach(p => {
        const card = document.createElement('div');
        card.className = "bg-zinc-900 border border-zinc-800 hover:border-emerald-500/60 active:scale-[0.99] rounded-2xl p-4 sm:p-5 space-y-3.5 sm:space-y-4 transition shadow-lg hover:shadow-emerald-950/20 cursor-pointer flex flex-col justify-between group";
        card.onclick = () => selectProjectAndShowFeatures(p.project);

        const typesBadges = (p.types || []).map(t => \`
          <span class="text-[10px] px-2 py-0.5 rounded font-mono font-medium \${
            t === 'decision' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' :
            t === 'pattern' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/60' :
            'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
          }">\${t}</span>
        \`).join(' ');

        const tagsList = (p.tags || []).slice(0, 5).map(tg => \`
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 font-mono">#\${tg}</span>
        \`).join(' ');

        card.innerHTML = \`
          <div class="space-y-3">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center space-x-2.5 truncate">
                <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0">
                  📁
                </div>
                <div class="truncate">
                  <h3 class="font-bold text-sm sm:text-base text-zinc-100 group-hover:text-emerald-400 transition tracking-tight font-mono truncate">\${p.project}</h3>
                  <div class="text-[11px] text-zinc-500 truncate">Updated \${p.last_updated || 'recently'}</div>
                </div>
              </div>
              <div class="flex items-center space-x-1.5 shrink-0">
                <span class="text-xs font-mono font-semibold px-2 py-1 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                  \${p.feature_count} \${p.feature_count === 1 ? 'Feature' : 'Features'}
                </span>
                <button type="button" onclick="event.stopPropagation(); promptDeleteProject('\${p.project}', \${p.feature_count})" title="Delete project and all its features" class="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 active:text-red-300 hover:bg-zinc-800 transition">
                  🗑️
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80 text-xs">
              <div class="bg-zinc-950/60 p-2 sm:p-2.5 rounded-xl border border-zinc-800/50">
                <div class="text-zinc-500 text-[10px] uppercase font-mono">Dense Vectors</div>
                <div class="font-semibold text-zinc-200 mt-0.5 text-xs sm:text-sm">\${p.total_chunks} chunks</div>
              </div>
              <div class="bg-zinc-950/60 p-2 sm:p-2.5 rounded-xl border border-zinc-800/50">
                <div class="text-zinc-500 text-[10px] uppercase font-mono">Types</div>
                <div class="flex flex-wrap gap-1 mt-1">\${typesBadges}</div>
              </div>
            </div>

            <div class="space-y-1">
              <div class="text-[10px] uppercase font-mono text-zinc-500">Key Tags</div>
              <div class="flex flex-wrap gap-1">\${tagsList}</div>
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
      document.getElementById('active-project-count').textContent = '(' + count + ' ' + (count === 1 ? 'feature' : 'features') + ')';

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
          <div class="col-span-full text-zinc-500 py-12 sm:py-16 text-center border border-zinc-800 rounded-2xl bg-zinc-950/40 p-6 sm:p-8 space-y-2">
            <div class="text-2xl">🔍</div>
            <div class="font-medium text-zinc-300 text-sm sm:text-base">No features matched the selected filters</div>
            <button type="button" onclick="clearProjectFilter()" class="text-xs text-emerald-400 underline py-1">Reset all filters</button>
          </div>
        \`;
        return;
      }

      filtered.forEach(f => {
        const card = document.createElement('div');
        card.className = "bg-zinc-900 border border-zinc-800 hover:border-zinc-700 active:scale-[0.99] rounded-2xl p-4 sm:p-5 space-y-3 transition cursor-pointer shadow-md";
        card.onclick = () => openDrawer(f.project, f.name);

        const tagsHtml = (f.tags || []).map(t => '<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-mono">#' + t + '</span>').join(' ');
        const filesHtml = (f.files || []).slice(0, 2).map(file => '<div class="text-[11px] text-zinc-400 font-mono truncate">📄 ' + file + '</div>').join('');
        const moreFiles = (f.files || []).length > 2 ? \`<div class="text-[10px] text-zinc-500 font-mono pl-1">+ \${f.files.length - 2} more files</div>\` : '';

        const children = f.children || [];
        const childrenBadges = children.map(c => \`
          <span class="text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono inline-flex items-center space-x-1" title="\${c.summary.replace(/"/g, '&quot;')}">
            <span>\${c.type === 'fix' ? '🔧' : c.type === 'pattern' ? '🧩' : c.type === 'decision' ? '⚖️' : c.type === 'refactor' ? '♻️' : '✨'}</span>
            <span>\${c.name}</span>
          </span>
        \`).join(' ');

        const nestedUpdatesHtml = children.length > 0 ? \`
          <div class="pt-2 border-t border-zinc-800/60 space-y-1">
            <div class="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span class="text-indigo-400 font-semibold">Nested Updates</span>
              <span class="px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-900/50">Nested: \${children.length}</span>
            </div>
            <div class="flex flex-wrap gap-1 max-h-16 overflow-hidden">\${childrenBadges}</div>
          </div>
        \` : '';

        card.innerHTML = \`
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-mono font-medium text-indigo-400 truncate">📁 \${f.project}</span>
            <div class="flex items-center space-x-1.5 shrink-0">
              <span class="text-[10px] px-2 py-0.5 rounded uppercase font-mono font-semibold \${
                f.type === 'decision' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' :
                f.type === 'pattern' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/60' :
                'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
              }">\${f.type}</span>
              <button type="button" onclick="event.stopPropagation(); promptDeleteFeature('\${f.project}', '\${f.name}')" title="Delete feature" class="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 active:text-red-300 hover:bg-zinc-800 transition">
                🗑️
              </button>
            </div>
          </div>
          <h3 class="text-sm sm:text-base font-bold text-zinc-100 hover:text-emerald-400 transition tracking-tight truncate">\${f.name}</h3>
          <p class="text-xs text-zinc-300 line-clamp-2 leading-relaxed">\${f.summary}</p>
          <div class="space-y-1">\${filesHtml}\${moreFiles}</div>
          \${nestedUpdatesHtml}
          <div class="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px]">
            <div class="flex flex-wrap gap-1">\${tagsHtml}</div>
            <span class="text-zinc-500 font-mono text-[10px] sm:text-xs shrink-0 pl-2">\${f.chunk_count} chunks</span>
          </div>
        \`;
        container.appendChild(card);
      });
    }

    // --- Render D3 Knowledge Graph View ---
    function renderGraph() {
      const container = document.getElementById('graph-container');
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      if (typeof d3 === 'undefined') {
        console.warn("D3 library not loaded yet");
        return;
      }

      d3.select("#graph-svg").selectAll("*").remove();
      const svg = d3.select("#graph-svg")
        .attr("viewBox", [0, 0, width, height]);

      currentSvg = svg;
      const g = svg.append("g");

      currentZoom = d3.zoom().scaleExtent([0.1, 4]).on("zoom", ({ transform }) => {
        g.attr("transform", transform);
      });

      svg.call(currentZoom);

      const nodes = (overviewData.graph.nodes || []).map(d => ({ ...d }));
      const links = (overviewData.graph.links || []).map(d => ({ ...d }));

      if (nodes.length === 0) return;

      const isMobile = width < 640;
      const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(isMobile ? 55 : 75))
        .force("charge", d3.forceManyBody().strength(isMobile ? -100 : -140))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(isMobile ? 22 : 28));

      const link = g.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "link");

      const node = g.append("g")
        .selectAll("g")
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
          if (d.type === 'feature') {
            openDrawer(d.project, d.name);
          } else if (d.type === 'child') {
            openDrawer(d.project, d.parent_name || d.name);
          } else if (d.type === 'project') {
            selectProjectAndShowFeatures(d.name);
          }
        });

      node.append("circle")
        .attr("r", d => d.type === 'project' ? (isMobile ? 12 : 14) : d.type === 'feature' ? (isMobile ? 8 : 10) : d.type === 'child' ? (isMobile ? 6 : 7) : d.type === 'tag' ? (isMobile ? 5 : 6) : 4)
        .attr("fill", d => {
          if (d.type === 'project') return '#6366f1';
          if (d.type === 'feature') return '#10b981';
          if (d.type === 'child') return '#38bdf8';
          if (d.type === 'tag') return '#a855f7';
          return '#f59e0b';
        })
        .attr("stroke", "#18181b")
        .attr("stroke-width", 2);

      node.append("text")
        .attr("x", isMobile ? 10 : 12)
        .attr("y", 3)
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

    function zoomIn() {
      if (currentSvg && currentZoom) {
        currentSvg.transition().duration(250).call(currentZoom.scaleBy, 1.3);
      }
    }
    function zoomOut() {
      if (currentSvg && currentZoom) {
        currentSvg.transition().duration(250).call(currentZoom.scaleBy, 0.7);
      }
    }
    function resetZoom() {
      if (currentSvg && currentZoom) {
        currentSvg.transition().duration(250).call(currentZoom.transform, d3.zoomIdentity);
      }
    }

    // --- Feature Detail Drawer ---
    async function openDrawer(project, name) {
      currentDrawerFeature = { project, name };
      const drawer = document.getElementById('feature-drawer');
      const body = document.getElementById('drawer-body');
      document.getElementById('drawer-name').textContent = name;
      body.innerHTML = '<div class="py-12 text-center text-zinc-500 text-xs">Loading feature chunks and vectors...</div>';
      drawer.classList.remove('translate-x-full');

      try {
        const feat = await apiFetch('/api/feature?project=' + encodeURIComponent(project) + '&name=' + encodeURIComponent(name));
        lastLoadedDrawerFeature = feat;
        document.getElementById('drawer-type').textContent = feat.type;

        const tagsHtml = (feat.tags || []).map(t => '<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">#' + t + '</span>').join(' ');

        const sectionsHtml = (feat.sections || []).map(s => \`
          <div class="bg-zinc-950 p-3.5 sm:p-4 rounded-xl border border-zinc-800 space-y-1.5">
            <h4 class="font-bold text-zinc-200 text-xs font-mono uppercase text-emerald-400">§ \${s.title}</h4>
            <div class="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed break-words font-sans">\${s.content}</div>
          </div>
        \`).join('');

        const children = feat.children || [];
        const childrenSectionHtml = children.length > 0 ? \`
          <div class="space-y-2.5 pt-3 border-t border-zinc-800">
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase font-mono text-cyan-400 font-bold">Nested Updates & Fixes (\${children.length})</span>
              <span class="text-[10px] text-zinc-500 font-mono">Consolidated Vectors</span>
            </div>
            <div class="space-y-2">
              \${children.map(c => \`
                <div class="bg-zinc-950/90 border border-zinc-800/90 p-3 rounded-xl space-y-2 text-xs">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center space-x-1.5">
                      <span class="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase font-semibold \${
                        c.type === 'fix' ? 'bg-amber-950/80 text-amber-400 border border-amber-900/60' :
                        c.type === 'pattern' ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-900/60' :
                        c.type === 'decision' ? 'bg-purple-950/80 text-purple-400 border border-purple-900/60' :
                        'bg-emerald-950/80 text-emerald-400 border border-emerald-900/60'
                      }">[\${c.type}]</span>
                      <span class="font-bold text-zinc-100 font-mono">\${c.name}</span>
                    </div>
                    <span class="text-[10px] text-zinc-500 font-mono">\${(c.updated_at || '').slice(0, 10)}</span>
                  </div>
                  <p class="text-zinc-300 text-[11px] leading-relaxed">\${c.summary}</p>
                  \${(c.sections && c.sections.length > 0) ? \`
                    <div class="space-y-1 pt-1 border-t border-zinc-900">
                      \${c.sections.map(cs => \`
                        <div class="text-[11px] text-zinc-400 font-mono"><strong class="text-zinc-300 font-semibold">\${cs.title}:</strong> \${cs.content}</div>
                      \`).join('')}
                    </div>
                  \` : ''}
                  \${(c.files && c.files.length > 0) ? \`
                    <div class="text-[10px] text-zinc-500 font-mono truncate">Files: \${c.files.join(', ')}</div>
                  \` : ''}
                </div>
              \`).join('')}
            </div>
          </div>
        \` : '';

        const related = feat.related_features || [];
        const relatedHtml = related.length > 0 ? \`
          <div class="space-y-2.5 pt-3 border-t border-zinc-800">
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase font-mono text-indigo-400 font-bold">🔗 Related Features (\${related.length})</span>
              <span class="text-[10px] text-zinc-500 font-mono">Structural & Semantic Overlap</span>
            </div>
            <div class="grid grid-cols-1 gap-2.5">
              \${related.map(r => \`
                <div onclick="openDrawer('\${r.project}', '\${r.name}')" class="bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 p-3 rounded-xl cursor-pointer transition space-y-1.5 shadow-sm">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-xs text-indigo-400 font-semibold truncate">📁 \${r.project} / \${r.name}</span>
                    <span class="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 font-mono">⚡ \${r.similarity_score}</span>
                  </div>
                  <p class="text-[11px] text-zinc-400 line-clamp-2">\${r.summary}</p>
                  <div class="flex flex-wrap gap-1.5 text-[10px] text-zinc-500 font-mono">
                    \${r.shared_files && r.shared_files.length > 0 ? \`<span class="text-zinc-300">📄 \${r.shared_files.length} shared file\${r.shared_files.length > 1 ? 's' : ''}</span>\` : ''}
                    \${r.shared_tags && r.shared_tags.length > 0 ? \`<span class="text-zinc-300">🏷️ \${r.shared_tags.join(', ')}</span>\` : ''}
                    \${r.library ? \`<span class="text-emerald-400">📦 \${r.library}</span>\` : ''}
                  </div>
                </div>
              \`).join('')}
            </div>
          </div>
        \` : '';

        const chunksHtml = (feat.chunks || []).map(c => \`
          <div class="bg-zinc-950/70 p-3 rounded-xl border border-zinc-800/80 space-y-1 text-[11px] font-mono">
            <div class="flex items-center justify-between text-zinc-500 text-[10px]">
              <span>Chunk \${c.idx} [\${c.section}]</span>
              <span class="text-indigo-400 font-semibold">\${c.vector_id}</span>
            </div>
            <div class="text-zinc-300 whitespace-pre-wrap text-[11px] pt-1 border-t border-zinc-900 break-words leading-relaxed">\${c.text}</div>
          </div>
        \`).join('');

        body.innerHTML = \`
          <div class="space-y-4 sm:space-y-5">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div class="flex items-center space-x-2 truncate">
                <span class="font-mono text-xs text-indigo-400 font-semibold">📁 \${feat.project}</span>
                <span class="text-zinc-600">/</span>
                <span class="font-bold text-zinc-100 text-sm truncate">\${feat.name}</span>
              </div>
              <div class="flex flex-wrap items-center gap-1">\${tagsHtml}</div>
            </div>

            <div>
              <div class="text-[10px] uppercase font-mono text-zinc-500 mb-1 font-semibold">Summary</div>
              <p class="text-xs text-zinc-200 leading-relaxed bg-zinc-950 p-3 sm:p-3.5 rounded-xl border border-zinc-800 break-words">\${feat.summary}</p>
            </div>

            <div>
              <div class="text-[10px] uppercase font-mono text-zinc-500 mb-1 font-semibold">Files Touched</div>
              <div class="space-y-1 font-mono text-xs">
                \${(feat.files || []).map(f => '<div class="text-zinc-300 bg-zinc-950/60 px-2.5 py-1.5 rounded-lg border border-zinc-800/50 break-all text-[11px]">📄 ' + f + '</div>').join('')}
              </div>
            </div>

            <div class="space-y-2.5">
              <div class="text-[10px] uppercase font-mono text-zinc-500 font-semibold">Documentation Sections</div>
              \${sectionsHtml}
            </div>

            \${childrenSectionHtml}

            \${relatedHtml}

            <div class="space-y-2.5 pt-3 border-t border-zinc-800">
              <div class="flex items-center justify-between">
                <span class="text-[10px] uppercase font-mono text-emerald-400 font-bold">Dense Vector Chunks (Vectorize)</span>
                <span class="text-[10px] text-zinc-500 font-mono">\${(feat.chunks || []).length} Chunks</span>
              </div>
              \${chunksHtml}
            </div>

            <div class="pt-4 border-t border-zinc-800 flex items-center space-x-2">
              <button type="button" onclick="openCreateFeatureModal('\${feat.project}', '\${feat.name}')" class="flex-1 py-2.5 rounded-xl border border-emerald-700/60 bg-emerald-950/40 hover:bg-emerald-900/60 active:bg-emerald-800 text-emerald-300 font-medium text-xs transition flex items-center justify-center space-x-1.5 shadow-sm">
                <span>+</span><span>Add Nested Update</span>
              </button>
              <button type="button" onclick="editCurrentDrawerFeature()" class="py-2.5 px-3 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-100 font-medium text-xs transition flex items-center justify-center space-x-1.5 shadow-sm">
                <span>✏️</span><span class="hidden sm:inline">Edit</span>
              </button>
              <button type="button" onclick="promptDeleteFeature('\${feat.project}', '\${feat.name}')" class="py-2.5 px-3 rounded-xl border border-red-900/60 bg-red-950/40 hover:bg-red-900/60 active:bg-red-900 text-red-300 font-medium text-xs transition flex items-center justify-center space-x-1.5">
                <span>🗑️</span>
              </button>
            </div>
          </div>
        \`;
      } catch (err) {
        body.innerHTML = '<div class="py-12 text-center text-red-400 text-xs">Error loading feature: ' + err.message + '</div>';
      }
    }

    function editCurrentDrawerFeature() {
      if (lastLoadedDrawerFeature) {
        openEditFeatureModal(lastLoadedDrawerFeature);
      }
    }

    function closeDrawer() {
      document.getElementById('feature-drawer').classList.add('translate-x-full');
      currentDrawerFeature = null;
    }

    // --- Stats & Usage Inspector ---
    async function loadStatsView(showFeedback = false) {
      const container = document.getElementById('stats-content-grid');
      container.innerHTML = '<div class="col-span-full py-16 text-center text-zinc-500 text-xs">Loading live Cloudflare infrastructure stats...</div>';

      try {
        const stats = await apiFetch('/api/stats');
        const neuronPercent = ((stats.ai.neurons_used_estimated / stats.ai.neurons_daily_free_limit) * 100).toFixed(2);
        const d1StorageMB = (stats.d1.database_size_bytes / (1024 * 1024)).toFixed(2);
        const d1QuotaPercent = ((stats.d1.database_size_bytes / stats.d1.storage_free_limit_bytes) * 100).toFixed(3);

        container.innerHTML = \`
          <!-- CARD 1: Workers AI Neurons -->
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2.5">
                  <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-sm font-bold">🧠</div>
                  <div>
                    <h3 class="font-bold text-zinc-100 text-sm">Workers AI Neurons</h3>
                    <div class="text-[10px] text-zinc-500 font-mono">\${stats.ai.model}</div>
                  </div>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">1024d</span>
              </div>

              <div class="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-2">
                <div class="text-[11px] text-zinc-400">Total Neurons Consumed</div>
                <div class="text-2xl font-bold font-mono text-emerald-400">\${stats.ai.neurons_used_estimated} <span class="text-xs font-normal text-zinc-500">neurons</span></div>
                
                <div class="pt-2 space-y-1">
                  <div class="flex justify-between text-[10px] text-zinc-400">
                    <span>Daily Free Quota: \${stats.ai.neurons_daily_free_limit.toLocaleString()} / day</span>
                    <span>\${neuronPercent}% used</span>
                  </div>
                  <div class="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                    <div class="bg-emerald-500 h-full rounded-full transition-all duration-500" style="width: \${Math.max(1, Math.min(100, neuronPercent))}%"></div>
                  </div>
                </div>
              </div>

              <div class="space-y-1.5 text-xs">
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Estimated Tokens Processed:</span>
                  <span class="font-mono text-zinc-200 font-semibold">\${stats.ai.total_tokens_estimated.toLocaleString()} tokens</span>
                </div>
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Pricing Formula:</span>
                  <span class="font-mono text-zinc-300">1,075 N / 1M tokens</span>
                </div>
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Est. Cloudflare Cost:</span>
                  <span class="font-mono text-emerald-400 font-semibold">\$\${stats.ai.estimated_cost_usd}</span>
                </div>
              </div>
            </div>

            <div class="text-[10px] text-zinc-500 pt-3 border-t border-zinc-800/80">
              Cloudflare includes 10,000 free Neurons every single day (~9.3M embedding tokens/day).
            </div>
          </div>

          <!-- CARD 2: Cloudflare D1 Database -->
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2.5">
                  <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-sm font-bold">🗄️</div>
                  <div>
                    <h3 class="font-bold text-zinc-100 text-sm">Cloudflare D1 SQL</h3>
                    <div class="text-[10px] text-zinc-500 font-mono">\${stats.d1.database_name}</div>
                  </div>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono">SQLite + FTS5</span>
              </div>

              <div class="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-2">
                <div class="text-[11px] text-zinc-400">Database Size</div>
                <div class="text-2xl font-bold font-mono text-indigo-400">\${stats.d1.database_size_formatted} <span class="text-xs font-normal text-zinc-500">(\${stats.d1.database_size_bytes.toLocaleString()} bytes)</span></div>
                
                <div class="pt-2 space-y-1">
                  <div class="flex justify-between text-[10px] text-zinc-400">
                    <span>Free Tier Limit: 5.0 GB</span>
                    <span>\${d1QuotaPercent}% used</span>
                  </div>
                  <div class="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                    <div class="bg-indigo-500 h-full rounded-full transition-all duration-500" style="width: \${Math.max(1, Math.min(100, d1QuotaPercent))}%"></div>
                  </div>
                </div>
              </div>

              <div class="space-y-1.5 text-xs">
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Documented Features:</span>
                  <span class="font-mono text-zinc-200 font-semibold">\${stats.d1.total_features} rows</span>
                </div>
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Indexed Chunks:</span>
                  <span class="font-mono text-zinc-200 font-semibold">\${stats.d1.total_chunks} rows</span>
                </div>
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>FTS5 Search Corpus:</span>
                  <span class="font-mono text-zinc-200 font-semibold">\${stats.d1.total_fts_entries} entries</span>
                </div>
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Active Projects:</span>
                  <span class="font-mono text-zinc-200 font-semibold">\${stats.d1.total_projects} projects</span>
                </div>
              </div>
            </div>

            <div class="text-[10px] text-zinc-500 pt-3 border-t border-zinc-800/80">
              Cloudflare D1 includes 5M read queries/day and 5 GB storage free.
            </div>
          </div>

          <!-- CARD 3: Cloudflare Vectorize V2 -->
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2.5">
                  <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-sm font-bold">🎯</div>
                  <div>
                    <h3 class="font-bold text-zinc-100 text-sm">Vectorize Index</h3>
                    <div class="text-[10px] text-zinc-500 font-mono">\${stats.vectorize.index_name}</div>
                  </div>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">v2</span>
              </div>

              <div class="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 space-y-2">
                <div class="text-[11px] text-zinc-400">Total Vectors Stored</div>
                <div class="text-2xl font-bold font-mono text-cyan-400">\${stats.vectorize.vector_count} <span class="text-xs font-normal text-zinc-500">dense vectors</span></div>
                
                <div class="pt-2 space-y-1">
                  <div class="flex justify-between text-[10px] text-zinc-400">
                    <span>Index Dimensions: \${stats.vectorize.dimensions}d</span>
                    <span class="uppercase font-mono text-emerald-400">\${stats.vectorize.metric}</span>
                  </div>
                  <div class="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                    <div class="bg-cyan-500 h-full rounded-full" style="width: 2%"></div>
                  </div>
                </div>
              </div>

              <div class="space-y-1.5 text-xs">
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Vector Dimension Size:</span>
                  <span class="font-mono text-zinc-200 font-semibold">\${stats.vectorize.dimensions} dimensions</span>
                </div>
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Distance Metric:</span>
                  <span class="font-mono text-zinc-200 capitalize font-semibold">\${stats.vectorize.metric}</span>
                </div>
                <div class="flex justify-between text-zinc-400 text-[11px]">
                  <span>Metadata Indexes:</span>
                  <span class="font-mono text-zinc-200 font-semibold">project, type, library, importance</span>
                </div>
              </div>
            </div>

            <div class="text-[10px] text-zinc-500 pt-3 border-t border-zinc-800/80">
              Cloudflare Vectorize includes 5M dimension queries and storage free per month.
            </div>
          </div>
        \`;

        if (showFeedback) showToast("Live infrastructure stats updated!", "📊");
      } catch (err) {
        container.innerHTML = '<div class="col-span-full py-12 text-center text-red-400 text-xs">Failed to load stats: ' + err.message + '</div>';
      }
    }

    // --- Hybrid Search Playground ---
    async function executeSearch() {
      const q = document.getElementById('search-input').value.trim();
      if (!q) return;

      const project = document.getElementById('search-project').value.trim() || undefined;
      const type = document.getElementById('search-type').value || undefined;
      const limit = parseInt(document.getElementById('search-limit').value, 10) || 5;
      const rerank = document.getElementById('search-rerank')?.checked ?? true;

      const resultsContainer = document.getElementById('search-results');
      resultsContainer.innerHTML = '<div class="py-12 text-center text-zinc-500 text-xs">Searching Vectorize, D1 FTS5 & Workers AI Reranker...</div>';

      try {
        const results = await apiFetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, project, type, limit, rerank })
        });

        if (!results || results.length === 0) {
          resultsContainer.innerHTML = '<div class="py-12 text-center text-zinc-500 text-xs">No features matched query.</div>';
          return;
        }

        resultsContainer.innerHTML = '';
        results.forEach(r => {
          const card = document.createElement('div');
          card.className = "bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-2.5 sm:space-y-3 hover:border-zinc-700 active:scale-[0.99] transition cursor-pointer shadow-md";
          card.onclick = () => openDrawer(r.project, r.name);

          const rerankBadge = r.rerank_score !== null && r.rerank_score !== undefined
            ? \`<span class="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono font-medium" title="Cross-Encoder Reranker Score (@cf/baai/bge-reranker-base)">🎯 Rerank: \${r.rerank_score}</span>\`
            : '';

          const denseBadge = r.vector_score !== null
            ? \`<span class="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono" title="Vector Cosine Similarity">✨ Dense: \${r.vector_score}</span>\`
            : '';

          const ftsBadge = r.fts_matched
            ? '<span class="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/80 font-mono">🔍 FTS5 Match</span>'
            : '<span class="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">Dense Only</span>';

          const chunksCount = r.matched_chunks_count || 1;
          const chunksBadge = \`<span class="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-violet-950 text-violet-400 border border-violet-800/80 font-mono" title="Number of chunks matching query">📑 \${chunksCount} chunk\${chunksCount > 1 ? 's' : ''}</span>\`;

          card.innerHTML = \`
            <div class="flex flex-wrap items-center justify-between gap-1.5">
              <div class="flex items-center space-x-1.5 truncate">
                <span class="font-mono text-xs text-indigo-400 font-medium">📁 \${r.project}</span>
                <span class="text-zinc-600">/</span>
                <span class="font-bold text-zinc-100 text-xs sm:text-sm truncate">\${r.name}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono uppercase">\${r.type}</span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                \${rerankBadge}
                <span class="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono" title="Reciprocal Rank Fusion Score">⚡ RRF: \${r.rrf_score}</span>
                \${denseBadge}
                \${ftsBadge}
                \${chunksBadge}
              </div>
            </div>

            <div class="bg-zinc-950 p-2.5 sm:p-3 rounded-xl border border-zinc-800 space-y-1">
              <div class="text-[10px] text-zinc-500 font-mono">Matched: <span class="text-emerald-400 font-medium">\${r.matched_section}</span></div>
              <div class="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed break-words">\${r.snippet}</div>
            </div>

            <p class="text-xs text-zinc-400 line-clamp-2 leading-relaxed">\${r.summary}</p>
          \`;
          resultsContainer.appendChild(card);
        });
      } catch (err) {
        resultsContainer.innerHTML = '<div class="py-8 text-center text-red-400 text-xs">Search error: ' + err.message + '</div>';
      }
    }

    // --- Window Resize Handler for Graph ---
    window.addEventListener('resize', () => {
      if (currentView === 'graph') {
        renderGraph();
      }
    });

    // --- On Page Load ---
    const initialToken = getToken();
    if (initialToken) {
      updateAuthUI(true);
      refreshData(false).catch(() => {});
    } else {
      updateAuthUI(false);
      openAuthModal();
      showErrorBanner("Token Required", "Please enter your Bearer token above to connect to Lekh memory.");
    }
  </script>
</body>
</html>`;
}
