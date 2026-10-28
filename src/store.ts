import { normalizeName } from "./names";
import {
  chunkFeature,
  computeContentHash,
  type FeatureInput,
  type FeatureSection,
  type FeatureType,
  type NestedChildEntry,
} from "./chunk";
import { embedDocuments, embedQuery, rerankContexts } from "./embed";
import {
  fuseAndGroupResults,
  type VectorMatchItem,
  type FtsMatchItem,
  type FeatureMetadataTieBreaker,
} from "./rank";

export interface SaveFeatureParams {
  project: string;
  name: string;
  summary: string;
  sections: FeatureSection[];
  parent_name?: string;
  children?: NestedChildEntry[];
  type?: FeatureType;
  importance?: number;
  library?: string;
  files?: string[];
  tags?: string[];
}

export interface SaveFeatureResult {
  status: "created" | "updated" | "unchanged";
  feature_id: number;
  project: string;
  name: string;
  chunks: number;
  nested_under?: string;
  child_name?: string;
}

export interface SearchParams {
  query: string;
  project?: string;
  type?: FeatureType;
  library?: string;
  limit?: number;
  rerank?: boolean;
}

export interface SearchResult {
  feature_id: number;
  project: string;
  name: string;
  type: FeatureType;
  importance: number;
  library: string | null;
  rrf_score: number;
  vector_score: number | null;
  fts_matched: boolean;
  matched_section: string;
  snippet: string;
  summary: string;
  files: string[];
  tags: string[];
  updated_at: string;
  matched_chunks_count: number;
  rerank_score: number | null;
}

export interface FeatureRecord {
  id: number;
  project: string;
  name: string;
  type: FeatureType;
  importance: number;
  library: string | null;
  summary: string;
  sections: FeatureSection[];
  children: NestedChildEntry[];
  files: string[];
  tags: string[];
  chunk_count: number;
  indexed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChunkRecord {
  id: number;
  feature_id: number;
  project: string;
  idx: number;
  section: string;
  text: string;
  vector_id: string;
}

const STOP_WORDS = new Set([
  "how",
  "what",
  "the",
  "is",
  "in",
  "to",
  "for",
  "and",
  "or",
  "with",
  "we",
  "do",
  "a",
  "an",
  "of",
  "on",
  "at",
  "by",
  "from",
  "as",
  "it",
  "not",
  "this",
  "that",
  "can",
  "you",
  "i",
  "are",
]);

export function sanitizeFts5Query(query: string): string {
  const raw = query.trim();
  if (!raw) {
    return '""';
  }

  // Split on whitespace and strip extraneous leading/trailing punctuation except internal technical chars
  const rawTokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w/.-]+|[^\w/.-]+$/g, "").trim())
    .filter((t) => t.length > 0);

  const clauses = new Set<string>();

  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (STOP_WORDS.has(lower) || ["and", "or", "not"].includes(lower)) {
      continue;
    }

    const cleanToken = token.replace(/"/g, "");
    if (!cleanToken) continue;

    // Technical token with punctuation
    if (/[/._-]/.test(cleanToken)) {
      clauses.add(`"${cleanToken}"`);
      const subParts = cleanToken.split(/[/._-]+/).filter(Boolean);
      for (const sp of subParts) {
        const spLower = sp.toLowerCase();
        if (sp.length > 1 && !STOP_WORDS.has(spLower) && !["and", "or", "not"].includes(spLower)) {
          clauses.add(`"${sp}"`);
          if (sp.length >= 4 && /^[a-zA-Z0-9]+$/.test(sp)) {
            clauses.add(`"${sp}"*`);
          }
        }
      }
    } else {
      // Alphanumeric word
      if (cleanToken.length > 1) {
        clauses.add(`"${cleanToken}"`);
        if (cleanToken.length >= 4 && /^[a-zA-Z0-9]+$/.test(cleanToken)) {
          clauses.add(`"${cleanToken}"*`);
        }
      } else if (rawTokens.length === 1) {
        clauses.add(`"${cleanToken}"`);
      }
    }
  }

  if (clauses.size === 0) {
    const fallback = raw
      .replace(/[^\w]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0 && !["AND", "OR", "NOT"].includes(w.toUpperCase()));
    if (fallback.length === 0) {
      return '""';
    }
    return fallback.map((w) => `"${w.replace(/"/g, "")}"`).join(" OR ");
  }

  return Array.from(clauses).join(" OR ");
}

export async function saveFeature(
  env: Env,
  params: SaveFeatureParams
): Promise<SaveFeatureResult> {
  const project = normalizeName(params.project);
  const name = normalizeName(params.name);
  const type: FeatureType = params.type ?? "feature";
  const importance = Math.max(1, Math.min(3, params.importance ?? 2));
  const library = params.library ? normalizeName(params.library) : null;
  const tags = (params.tags ?? []).map((t) => normalizeName(t)).filter(Boolean);
  const files = (params.files ?? []).map((f) => f.trim()).filter(Boolean);

  const parentName = params.parent_name ? normalizeName(params.parent_name) : undefined;

  // Path A: Nested Child Feature (parent_name provided and distinct from child name)
  if (parentName && parentName !== name) {
    const parent = await env.DB.prepare(
      "SELECT * FROM features WHERE project = ? AND name = ?"
    )
      .bind(project, parentName)
      .first<any>();

    if (!parent) {
      throw new Error(
        `Parent feature '${parentName}' not found in project '${project}'. Call list_features first or omit parent_name to create a top-level feature.`
      );
    }

    let existingChildren: NestedChildEntry[] = [];
    let parentSections: FeatureSection[] = [];
    let parentFiles: string[] = [];
    let parentTags: string[] = [];

    try {
      existingChildren = JSON.parse(parent.children_json || "[]");
    } catch {}
    try {
      parentSections = JSON.parse(parent.sections_json || "[]");
    } catch {}
    try {
      parentFiles = JSON.parse(parent.files_json || "[]");
    } catch {}
    try {
      parentTags = JSON.parse(parent.tags_json || "[]");
    } catch {}

    const childEntry: NestedChildEntry = {
      name,
      type,
      importance,
      library,
      summary: params.summary.trim(),
      sections: params.sections,
      files,
      tags,
      updated_at: new Date().toISOString(),
    };

    const childIdx = existingChildren.findIndex((c) => c.name === name);
    if (childIdx >= 0) {
      existingChildren[childIdx] = childEntry;
    } else {
      existingChildren.push(childEntry);
    }

    const mergedFiles = Array.from(new Set([...parentFiles, ...files]));
    const mergedTags = Array.from(new Set([...parentTags, ...tags]));

    // If a standalone top-level feature previously existed for this child, remove it
    const standalone = await env.DB.prepare(
      "SELECT id FROM features WHERE project = ? AND name = ?"
    )
      .bind(project, name)
      .first<{ id: number }>();

    if (standalone) {
      await deleteFeature(env, project, name);
    }

    const parentInput: FeatureInput = {
      project,
      name: parent.name,
      type: parent.type,
      importance: parent.importance,
      library: parent.library,
      summary: parent.summary,
      sections: parentSections,
      children: existingChildren,
      files: mergedFiles,
      tags: mergedTags,
    };

    const parentContentHash = await computeContentHash(parentInput);
    const parentChunks = chunkFeature(parentInput);
    const parentChunkTexts = parentChunks.map((c) => c.text);

    // Embed all chunk texts BEFORE mutating D1
    const parentVectors = await embedDocuments(env, parentChunkTexts);
    const oldChunkCount = parent.chunk_count;

    await env.DB.prepare(
      `UPDATE features SET
        sections_json = ?,
        children_json = ?,
        files_json = ?,
        tags_json = ?,
        content_hash = ?,
        chunk_count = ?,
        indexed_at = NULL,
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        JSON.stringify(parentSections),
        JSON.stringify(existingChildren),
        JSON.stringify(mergedFiles),
        JSON.stringify(mergedTags),
        parentContentHash,
        parentChunks.length,
        parent.id
      )
      .run();

    const batchStatements: D1PreparedStatement[] = [
      env.DB.prepare("DELETE FROM chunks WHERE feature_id = ?").bind(parent.id),
      env.DB.prepare("DELETE FROM chunks_fts WHERE feature_id = ?").bind(parent.id),
    ];

    for (const c of parentChunks) {
      const vectorId = `f${parent.id}-c${c.idx}`;
      batchStatements.push(
        env.DB.prepare(
          "INSERT INTO chunks (feature_id, project, idx, section, text, vector_id) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(parent.id, project, c.idx, c.section, c.text, vectorId)
      );
      batchStatements.push(
        env.DB.prepare(
          "INSERT INTO chunks_fts (vector_id, feature_id, project, section, text) VALUES (?, ?, ?, ?, ?)"
        ).bind(vectorId, parent.id, project, c.section, c.text)
      );
    }

    await env.DB.batch(batchStatements);

    const vectorizePayload = parentChunks.map((c, i) => ({
      id: `f${parent.id}-c${c.idx}`,
      values: parentVectors[i],
      metadata: {
        feature_id: parent.id,
        project,
        type: parent.type,
        library: parent.library ?? "",
        importance: parent.importance,
        section: c.section,
      },
    }));

    await env.VECTORIZE.upsert(vectorizePayload);

    if (oldChunkCount > parentChunks.length) {
      const staleIds: string[] = [];
      for (let idx = parentChunks.length; idx < oldChunkCount; idx++) {
        staleIds.push(`f${parent.id}-c${idx}`);
      }
      await env.VECTORIZE.deleteByIds(staleIds);
    }

    await env.DB.prepare(
      "UPDATE features SET indexed_at = datetime('now'), chunk_count = ? WHERE id = ?"
    )
      .bind(parentChunks.length, parent.id)
      .run();

    return {
      status: "updated",
      feature_id: parent.id,
      project,
      name: parent.name,
      nested_under: parent.name,
      child_name: name,
      chunks: parentChunks.length,
    };
  }

  // Path B: Standard Top-Level Feature
  const existing = await env.DB.prepare(
    "SELECT id, content_hash, chunk_count, indexed_at, children_json FROM features WHERE project = ? AND name = ?"
  )
    .bind(project, name)
    .first<{
      id: number;
      content_hash: string;
      chunk_count: number;
      indexed_at: string | null;
      children_json: string;
    }>();

  let children: NestedChildEntry[] = [];
  if (params.children && Array.isArray(params.children)) {
    children = params.children;
  } else if (existing && existing.children_json) {
    try {
      children = JSON.parse(existing.children_json);
    } catch {}
  }

  const normalizedInput: FeatureInput = {
    project,
    name,
    type,
    importance,
    library,
    summary: params.summary.trim(),
    sections: params.sections,
    children,
    files,
    tags,
  };

  const contentHash = await computeContentHash(normalizedInput);

  if (
    existing &&
    existing.content_hash === contentHash &&
    existing.indexed_at !== null
  ) {
    return {
      status: "unchanged",
      feature_id: existing.id,
      project,
      name,
      chunks: existing.chunk_count,
    };
  }

  // Build chunks
  const chunks = chunkFeature(normalizedInput);
  const chunkTexts = chunks.map((c) => c.text);

  // Embed all chunk texts BEFORE mutating D1 (so transient AI failure leaves D1 untouched)
  const vectors = await embedDocuments(env, chunkTexts);

  let featureId: number;
  let oldChunkCount = 0;
  let status: "created" | "updated" = "created";

  if (existing) {
    status = "updated";
    featureId = existing.id;
    oldChunkCount = existing.chunk_count;

    await env.DB.prepare(
      `UPDATE features SET
        type = ?,
        importance = ?,
        library = ?,
        summary = ?,
        sections_json = ?,
        children_json = ?,
        files_json = ?,
        tags_json = ?,
        content_hash = ?,
        chunk_count = ?,
        indexed_at = NULL,
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        type,
        importance,
        library,
        normalizedInput.summary,
        JSON.stringify(normalizedInput.sections),
        JSON.stringify(children),
        JSON.stringify(files),
        JSON.stringify(tags),
        contentHash,
        chunks.length,
        featureId
      )
      .run();
  } else {
    const insertRes = await env.DB.prepare(
      `INSERT INTO features (
        project, name, type, importance, library, summary,
        sections_json, children_json, files_json, tags_json, content_hash,
        chunk_count, indexed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))`
    )
      .bind(
        project,
        name,
        type,
        importance,
        library,
        normalizedInput.summary,
        JSON.stringify(normalizedInput.sections),
        JSON.stringify(children),
        JSON.stringify(files),
        JSON.stringify(tags),
        contentHash,
        chunks.length
      )
      .run();

    featureId = Number(insertRes.meta.last_row_id);
  }

  // Update chunks and chunks_fts in a single batch
  const batchStatements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM chunks WHERE feature_id = ?").bind(featureId),
    env.DB.prepare("DELETE FROM chunks_fts WHERE feature_id = ?").bind(featureId),
  ];

  for (const c of chunks) {
    const vectorId = `f${featureId}-c${c.idx}`;
    batchStatements.push(
      env.DB.prepare(
        "INSERT INTO chunks (feature_id, project, idx, section, text, vector_id) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(featureId, project, c.idx, c.section, c.text, vectorId)
    );
    batchStatements.push(
      env.DB.prepare(
        "INSERT INTO chunks_fts (vector_id, feature_id, project, section, text) VALUES (?, ?, ?, ?, ?)"
      ).bind(vectorId, featureId, project, c.section, c.text)
    );
  }

  await env.DB.batch(batchStatements);

  // Upsert vectors into Vectorize
  const vectorizePayload = chunks.map((c, i) => ({
    id: `f${featureId}-c${c.idx}`,
    values: vectors[i],
    metadata: {
      feature_id: featureId,
      project,
      type,
      library: library ?? "",
      importance,
      section: c.section,
    },
  }));

  await env.VECTORIZE.upsert(vectorizePayload);

  // If oldChunkCount > chunks.length, delete stale leftover vectors
  if (oldChunkCount > chunks.length) {
    const staleIds: string[] = [];
    for (let idx = chunks.length; idx < oldChunkCount; idx++) {
      staleIds.push(`f${featureId}-c${idx}`);
    }
    await env.VECTORIZE.deleteByIds(staleIds);
  }

  // Mark indexed_at in D1
  await env.DB.prepare(
    "UPDATE features SET indexed_at = datetime('now'), chunk_count = ? WHERE id = ?"
  )
    .bind(chunks.length, featureId)
    .run();

  return {
    status,
    feature_id: featureId,
    project,
    name,
    chunks: chunks.length,
  };
}

export async function searchFeatures(
  env: Env,
  params: SearchParams
): Promise<SearchResult[]> {
  const query = params.query.trim();
  if (!query) {
    return [];
  }

  const limit = Math.max(1, Math.min(20, params.limit ?? 5));
  const normProject = params.project ? normalizeName(params.project) : undefined;
  const filterType = params.type;
  const filterLibrary = params.library ? normalizeName(params.library) : undefined;

  // Build Vectorize metadata filter
  const vecFilter: Record<string, string | number> = {};
  if (normProject) vecFilter.project = normProject;
  if (filterType) vecFilter.type = filterType;
  if (filterLibrary) vecFilter.library = filterLibrary;

  // Run Dense (Vectorize) and Sparse (D1 FTS5) concurrently
  const [vectorResults, ftsResults] = await Promise.all([
    (async (): Promise<VectorMatchItem[]> => {
      try {
        const queryVector = await embedQuery(env, query);
        const topK = Math.min(limit * 4, 50);
        const vRes = await env.VECTORIZE.query(queryVector, {
          topK,
          returnMetadata: "all",
          filter: Object.keys(vecFilter).length > 0 ? vecFilter : undefined,
        });

        return (vRes.matches || []).map((m) => {
          let featureId = 0;
          if (m.metadata && typeof m.metadata.feature_id === "number") {
            featureId = m.metadata.feature_id;
          } else {
            const match = m.id.match(/^f(\d+)-c/);
            if (match) featureId = parseInt(match[1], 10);
          }
          return {
            vector_id: m.id,
            feature_id: featureId,
            score: m.score,
          };
        });
      } catch (err) {
        console.error("Vectorize query failed, falling back to sparse only:", err);
        return [];
      }
    })(),
    (async (): Promise<FtsMatchItem[]> => {
      try {
        const ftsQuery = sanitizeFts5Query(query);
        let sql = `SELECT vector_id, feature_id, section, text
                   FROM chunks_fts
                   WHERE chunks_fts MATCH ?`;
        const binds: any[] = [ftsQuery];

        if (normProject) {
          sql += " AND project = ?";
          binds.push(normProject);
        }

        sql += " ORDER BY bm25(chunks_fts) LIMIT 30";

        const { results } = await env.DB.prepare(sql).bind(...binds).all<{
          vector_id: string;
          feature_id: number;
          section: string;
          text: string;
        }>();

        return (results || []).map((r) => ({
          vector_id: r.vector_id,
          feature_id: r.feature_id,
          section: r.section,
          text: r.text,
        }));
      } catch (err) {
        console.error("FTS5 query failed, falling back to dense only:", err);
        return [];
      }
    })(),
  ]);

  if (vectorResults.length === 0 && ftsResults.length === 0) {
    return [];
  }

  // Pre-fetch candidate feature metadata for tie-breaking and post-filtering
  const candidateFeatureIds = Array.from(
    new Set([
      ...vectorResults.map((v) => v.feature_id),
      ...ftsResults.map((f) => f.feature_id),
    ])
  ).filter((id) => id > 0);

  if (candidateFeatureIds.length === 0) {
    return [];
  }

  // Fetch candidate features from D1
  const placeholders = candidateFeatureIds.map(() => "?").join(",");
  const candidateFeatures = await env.DB.prepare(
    `SELECT id, project, name, type, importance, library, summary, files_json, tags_json, updated_at
     FROM features
     WHERE id IN (${placeholders})`
  )
    .bind(...candidateFeatureIds)
    .all<{
      id: number;
      project: string;
      name: string;
      type: FeatureType;
      importance: number;
      library: string | null;
      summary: string;
      files_json: string;
      tags_json: string;
      updated_at: string;
    }>();

  const featureMap = new Map<number, any>();
  const tieBreakers = new Map<number, FeatureMetadataTieBreaker>();

  for (const f of candidateFeatures.results || []) {
    // Apply filters if not caught by Vectorize/FTS
    if (normProject && f.project !== normProject) continue;
    if (filterType && f.type !== filterType) continue;
    if (filterLibrary && f.library !== filterLibrary) continue;

    featureMap.set(f.id, f);
    tieBreakers.set(f.id, {
      importance: f.importance,
      updated_at: f.updated_at,
    });
  }

function stripChunkPrefix(text: string, project: string, name: string, section: string): string {
  if (!text) return "";
  const prefix = `${project} | ${name} | ${section}\n`;
  if (text.startsWith(prefix)) {
    return text.slice(prefix.length).trim();
  }
  const genericPrefixMatch = text.match(/^[^|\n]+\s*\|\s*[^|\n]+\s*\|\s*[^\n]+\n/);
  if (genericPrefixMatch) {
    return text.slice(genericPrefixMatch[0].length).trim();
  }
  return text.trim();
}

  const grouped = fuseAndGroupResults(vectorResults, ftsResults, tieBreakers);
  const filteredCandidates = grouped.filter((g) => featureMap.has(g.feature_id));

  // Fix 4: Metadata keyword boost (+0.005 if name, library, tags, or files match query token)
  const queryTokens = query
    .toLowerCase()
    .split(/[^a-zA-Z0-9_./-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  for (const g of filteredCandidates) {
    const f = featureMap.get(g.feature_id);
    if (!f) continue;
    let hasMatch = false;
    const fName = f.name.toLowerCase();
    const fLib = (f.library || "").toLowerCase();
    let fTags: string[] = [];
    let fFiles: string[] = [];
    try {
      fTags = JSON.parse(f.tags_json || "[]");
    } catch {}
    try {
      fFiles = JSON.parse(f.files_json || "[]");
    } catch {}

    for (const token of queryTokens) {
      if (
        fName.includes(token) ||
        (fLib && fLib.includes(token)) ||
        fTags.some((t) => t.toLowerCase().includes(token)) ||
        fFiles.some((file) => file.toLowerCase().includes(token))
      ) {
        hasMatch = true;
        break;
      }
    }

    if (hasMatch) {
      g.rrf_score += 0.005;
    }
  }

  // Re-sort after metadata boost
  filteredCandidates.sort((a, b) => b.rrf_score - a.rrf_score);

  // Take candidate pool for snippet hydration and stage-3 reranking
  const poolLimit = Math.max(limit, Math.min(limit * 3, 15));
  const candidatePool = filteredCandidates.slice(0, poolLimit);

  // Fix 1: Hydrate missing chunk text from D1 chunks for vector-only matches
  const missingVectorIds = candidatePool
    .filter((g) => !g.matched_text && g.best_vector_id)
    .map((g) => g.best_vector_id);

  if (missingVectorIds.length > 0) {
    try {
      const qPlaceholders = missingVectorIds.map(() => "?").join(",");
      const { results: chunkRows } = await env.DB.prepare(
        `SELECT vector_id, section, text FROM chunks WHERE vector_id IN (${qPlaceholders})`
      )
        .bind(...missingVectorIds)
        .all<{ vector_id: string; section: string; text: string }>();

      const chunkMap = new Map<string, { section: string; text: string }>();
      for (const row of chunkRows || []) {
        chunkMap.set(row.vector_id, { section: row.section, text: row.text });
      }

      for (const g of candidatePool) {
        if (!g.matched_text && chunkMap.has(g.best_vector_id)) {
          const row = chunkMap.get(g.best_vector_id)!;
          g.matched_section = row.section;
          g.matched_text = row.text;
        }
      }
    } catch (err) {
      console.error("Failed to hydrate missing chunk text from D1:", err);
    }
  }

  // Upgrade 5: Stage-3 Cross-Encoder Reranking
  const shouldRerank = params.rerank !== false;
  if (shouldRerank && candidatePool.length > 1) {
    try {
      const contexts = candidatePool.map((g) => {
        const f = featureMap.get(g.feature_id);
        const clean = stripChunkPrefix(g.matched_text, f.project, f.name, g.matched_section) || f.summary;
        return `${f.name}: ${f.summary}\n${g.matched_section}: ${clean}`.slice(0, 1000);
      });

      const scoreMap = await rerankContexts(env, query, contexts);
      for (let i = 0; i < candidatePool.length; i++) {
        const score = scoreMap.get(i);
        candidatePool[i].rerank_score = typeof score === "number" ? score : null;
      }

      // Rank-fuse Stage-2 RRF rank and Stage-3 Cross-Encoder Reranker rank
      const sortedByRerank = [...candidatePool]
        .filter((c) => c.rerank_score !== null && c.rerank_score !== undefined)
        .sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));

      const rerankRankMap = new Map<number, number>();
      sortedByRerank.forEach((c, idx) => {
        rerankRankMap.set(c.feature_id, idx + 1);
      });

      const rrfRankMap = new Map<number, number>();
      candidatePool.forEach((c, idx) => {
        rrfRankMap.set(c.feature_id, idx + 1);
      });

      candidatePool.sort((a, b) => {
        const rrfRankA = rrfRankMap.get(a.feature_id) ?? candidatePool.length;
        const rrfRankB = rrfRankMap.get(b.feature_id) ?? candidatePool.length;
        const rerankRankA = rerankRankMap.get(a.feature_id) ?? candidatePool.length;
        const rerankRankB = rerankRankMap.get(b.feature_id) ?? candidatePool.length;

        // Weighted RRF: retrieval consensus (weight 1.0) + cross-encoder precision (weight 2.0)
        const scoreA = 1 / (20 + rrfRankA) + 2 / (20 + rerankRankA);
        const scoreB = 1 / (20 + rrfRankB) + 2 / (20 + rerankRankB);
        return scoreB - scoreA;
      });
    } catch (err) {
      console.error("Stage-3 cross-encoder rerank failed, falling back to RRF:", err);
    }
  }

  const topGrouped = candidatePool.slice(0, limit);

  return topGrouped.map((g) => {
    const f = featureMap.get(g.feature_id);
    let files: string[] = [];
    let tags: string[] = [];
    try {
      files = JSON.parse(f.files_json);
    } catch {}
    try {
      tags = JSON.parse(f.tags_json);
    } catch {}

    // Clean snippet with prefix stripped
    const cleanText = stripChunkPrefix(g.matched_text, f.project, f.name, g.matched_section);
    const snippetSource = cleanText || f.summary || "";
    const snippet =
      snippetSource.length > 300 ? `${snippetSource.slice(0, 300)}...` : snippetSource;

    return {
      feature_id: f.id,
      project: f.project,
      name: f.name,
      type: f.type,
      importance: f.importance,
      library: f.library,
      rrf_score: Number(g.rrf_score.toFixed(6)),
      vector_score: g.vector_score !== null ? Number(g.vector_score.toFixed(4)) : null,
      fts_matched: g.fts_matched,
      matched_section: g.matched_section,
      snippet,
      summary: f.summary,
      files,
      tags,
      updated_at: f.updated_at,
      matched_chunks_count: g.matched_chunks_count ?? 1,
      rerank_score:
        g.rerank_score !== null && g.rerank_score !== undefined
          ? Number(g.rerank_score.toFixed(4))
          : null,
    };
  });
}

export async function getFeature(
  env: Env,
  projectInput: string,
  nameInput: string
): Promise<(FeatureRecord & { chunks?: ChunkRecord[] }) | null> {
  const project = normalizeName(projectInput);
  const name = normalizeName(nameInput);

  const row = await env.DB.prepare(
    "SELECT * FROM features WHERE project = ? AND name = ?"
  )
    .bind(project, name)
    .first<any>();

  if (!row) {
    return null;
  }

  const { results: chunkRows } = await env.DB.prepare(
    "SELECT id, feature_id, project, idx, section, text, vector_id FROM chunks WHERE feature_id = ? ORDER BY idx ASC"
  )
    .bind(row.id)
    .all<ChunkRecord>();

  return {
    id: row.id,
    project: row.project,
    name: row.name,
    type: row.type,
    importance: row.importance,
    library: row.library,
    summary: row.summary,
    sections: JSON.parse(row.sections_json || "[]"),
    children: JSON.parse(row.children_json || "[]"),
    files: JSON.parse(row.files_json || "[]"),
    tags: JSON.parse(row.tags_json || "[]"),
    chunk_count: row.chunk_count,
    indexed_at: row.indexed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    chunks: chunkRows || [],
  };
}

export async function listFeatures(
  env: Env,
  params: {
    project?: string;
    type?: FeatureType;
    tag?: string;
    limit?: number;
  }
): Promise<Array<Omit<FeatureRecord, "sections">>> {
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));
  let sql = `SELECT id, project, name, type, importance, library, summary, children_json, files_json, tags_json, chunk_count, indexed_at, created_at, updated_at
             FROM features`;
  const conditions: string[] = [];
  const binds: any[] = [];

  if (params.project) {
    conditions.push("project = ?");
    binds.push(normalizeName(params.project));
  }
  if (params.type) {
    conditions.push("type = ?");
    binds.push(params.type);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY updated_at DESC LIMIT ?";
  binds.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...binds).all<any>();

  let list = (results || []).map((row) => ({
    id: row.id,
    project: row.project,
    name: row.name,
    type: row.type,
    importance: row.importance,
    library: row.library,
    summary: row.summary,
    children: JSON.parse(row.children_json || "[]"),
    files: JSON.parse(row.files_json || "[]"),
    tags: JSON.parse(row.tags_json || "[]"),
    chunk_count: row.chunk_count,
    indexed_at: row.indexed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  if (params.tag) {
    const targetTag = normalizeName(params.tag);
    list = list.filter((item) =>
      item.tags.some((t: string) => normalizeName(t) === targetTag)
    );
  }

  return list;
}

export async function listProjects(env: Env): Promise<
  Array<{
    project: string;
    feature_count: number;
    total_chunks: number;
    last_updated: string;
    types: string[];
    tags: string[];
  }>
> {
  const { results } = await env.DB.prepare(
    `SELECT
       project,
       COUNT(id) AS feature_count,
       COALESCE(SUM(chunk_count), 0) AS total_chunks,
       MAX(updated_at) AS last_updated,
       GROUP_CONCAT(DISTINCT type) AS types_csv,
       GROUP_CONCAT(tags_json, '||') AS all_tags_json
     FROM features
     GROUP BY project
     ORDER BY last_updated DESC`
  ).all<any>();

  const projectsList = [];

  for (const r of results || []) {
    const typesSet = new Set<string>();
    if (r.types_csv) {
      r.types_csv
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean)
        .forEach((t: string) => typesSet.add(t));
    }

    const tagsSet = new Set<string>();
    if (r.all_tags_json) {
      const tagArrays = r.all_tags_json.split("||");
      for (const tStr of tagArrays) {
        try {
          const parsed = JSON.parse(tStr.trim());
          if (Array.isArray(parsed)) {
            parsed.forEach((t: string) => tagsSet.add(t));
          }
        } catch {}
      }
    }

    projectsList.push({
      project: r.project,
      feature_count: r.feature_count,
      total_chunks: r.total_chunks || 0,
      last_updated: r.last_updated,
      types: Array.from(typesSet),
      tags: Array.from(tagsSet),
    });
  }

  return projectsList;
}

export async function deleteFeature(
  env: Env,
  projectInput: string,
  nameInput: string
): Promise<{ deleted: boolean; project: string; name: string; vectors_removed: number }> {
  const project = normalizeName(projectInput);
  const name = normalizeName(nameInput);

  const feature = await env.DB.prepare(
    "SELECT id FROM features WHERE project = ? AND name = ?"
  )
    .bind(project, name)
    .first<{ id: number }>();

  if (!feature) {
    return {
      deleted: false,
      project,
      name,
      vectors_removed: 0,
    };
  }

  const { results: chunkRows } = await env.DB.prepare(
    "SELECT vector_id FROM chunks WHERE feature_id = ?"
  )
    .bind(feature.id)
    .all<{ vector_id: string }>();

  const vectorIds = (chunkRows || []).map((c) => c.vector_id);

  if (vectorIds.length > 0) {
    await env.VECTORIZE.deleteByIds(vectorIds);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM chunks_fts WHERE feature_id = ?").bind(feature.id),
    env.DB.prepare("DELETE FROM chunks WHERE feature_id = ?").bind(feature.id),
    env.DB.prepare("DELETE FROM features WHERE id = ?").bind(feature.id),
  ]);

  return {
    deleted: true,
    project,
    name,
    vectors_removed: vectorIds.length,
  };
}

export async function deleteProject(
  env: Env,
  projectInput: string
): Promise<{ deleted: boolean; project: string; features_removed: number; vectors_removed: number }> {
  const project = normalizeName(projectInput);

  const { results: featureRows } = await env.DB.prepare(
    "SELECT id FROM features WHERE project = ?"
  )
    .bind(project)
    .all<{ id: number }>();

  if (!featureRows || featureRows.length === 0) {
    return {
      deleted: false,
      project,
      features_removed: 0,
      vectors_removed: 0,
    };
  }

  const { results: chunkRows } = await env.DB.prepare(
    "SELECT vector_id FROM chunks WHERE project = ?"
  )
    .bind(project)
    .all<{ vector_id: string }>();

  const vectorIds = (chunkRows || []).map((c) => c.vector_id);

  if (vectorIds.length > 0) {
    for (let i = 0; i < vectorIds.length; i += 500) {
      const batch = vectorIds.slice(i, i + 500);
      await env.VECTORIZE.deleteByIds(batch);
    }
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM chunks_fts WHERE project = ?").bind(project),
    env.DB.prepare("DELETE FROM chunks WHERE project = ?").bind(project),
    env.DB.prepare("DELETE FROM features WHERE project = ?").bind(project),
  ]);

  return {
    deleted: true,
    project,
    features_removed: featureRows.length,
    vectors_removed: vectorIds.length,
  };
}

export async function getOverviewGraph(env: Env): Promise<{
  projects: any[];
  features: any[];
  stats: {
    total_projects: number;
    total_features: number;
    total_children?: number;
    total_chunks: number;
    total_tags: number;
    total_files: number;
  };
  graph: {
    nodes: Array<{ id: string; name: string; type: string; [key: string]: any }>;
    links: Array<{ source: string; target: string; type: string }>;
  };
}> {
  const [projectsData, featuresData] = await Promise.all([
    listProjects(env),
    listFeatures(env, { limit: 200 }),
  ]);

  const nodes: Array<{ id: string; name: string; type: string; [key: string]: any }> = [];
  const links: Array<{ source: string; target: string; type: string }> = [];

  const tagSet = new Set<string>();
  const fileSet = new Set<string>();

  // Add project nodes
  for (const p of projectsData) {
    nodes.push({
      id: `proj:${p.project}`,
      name: p.project,
      type: "project",
      feature_count: p.feature_count,
      total_chunks: p.total_chunks,
    });
  }

  // Add feature nodes and links
  for (const f of featuresData) {
    const featNodeId = `feat:${f.id}`;
    nodes.push({
      id: featNodeId,
      name: f.name,
      project: f.project,
      type: f.type,
      importance: f.importance,
      library: f.library,
      summary: f.summary,
      children_count: (f.children || []).length,
    });

    // Link Project -> Feature
    links.push({
      source: `proj:${f.project}`,
      target: featNodeId,
      type: "has_feature",
    });

    // Add child nodes & links
    for (const child of f.children || []) {
      const childNodeId = `child:${f.id}:${child.name}`;
      nodes.push({
        id: childNodeId,
        name: child.name,
        project: f.project,
        parent_id: f.id,
        parent_name: f.name,
        type: "child",
        sub_type: child.type,
        importance: child.importance,
        library: child.library,
        summary: child.summary,
      });
      links.push({
        source: featNodeId,
        target: childNodeId,
        type: "has_child",
      });
    }

    // Collect tags & files
    for (const tag of f.tags) {
      tagSet.add(tag);
      links.push({
        source: featNodeId,
        target: `tag:${tag}`,
        type: "tagged_with",
      });
    }

    for (const file of f.files) {
      fileSet.add(file);
      links.push({
        source: featNodeId,
        target: `file:${file}`,
        type: "touches_file",
      });
    }
  }

  // Add tag nodes
  for (const tag of tagSet) {
    nodes.push({
      id: `tag:${tag}`,
      name: tag,
      type: "tag",
    });
  }

  // Add file nodes
  for (const file of fileSet) {
    nodes.push({
      id: `file:${file}`,
      name: file,
      type: "file",
    });
  }

  // Upgrade 6: Add shares_library links when multiple features share the same library
  const libMap = new Map<string, string[]>();
  for (const f of featuresData) {
    if (f.library) {
      const key = f.library.toLowerCase();
      const list = libMap.get(key) || [];
      list.push(`feat:${f.id}`);
      libMap.set(key, list);
    }
  }

  for (const [, featIds] of libMap.entries()) {
    if (featIds.length > 1) {
      for (let i = 0; i < featIds.length; i++) {
        for (let j = i + 1; j < featIds.length; j++) {
          links.push({
            source: featIds[i],
            target: featIds[j],
            type: "shares_library",
          });
        }
      }
    }
  }

  return {
    projects: projectsData,
    features: featuresData,
    stats: {
      total_projects: projectsData.length,
      total_features: featuresData.length,
      total_children: featuresData.reduce((acc, f) => acc + (f.children ? f.children.length : 0), 0),
      total_chunks: featuresData.reduce((acc, f) => acc + f.chunk_count, 0),
      total_tags: tagSet.size,
      total_files: fileSet.size,
    },
    graph: {
      nodes,
      links,
    },
  };
}

export async function getSystemStats(env: Env): Promise<{
  ai: {
    model: string;
    dimensions: number;
    total_tokens_estimated: number;
    neurons_used_estimated: number;
    neurons_daily_free_limit: number;
    neuron_rate_per_million_tokens: number;
    estimated_cost_usd: number;
  };
  d1: {
    database_name: string;
    database_size_bytes: number;
    database_size_formatted: string;
    total_projects: number;
    total_features: number;
    total_chunks: number;
    total_fts_entries: number;
    storage_free_limit_bytes: number;
  };
  vectorize: {
    index_name: string;
    vector_count: number;
    dimensions: number;
    metric: string;
    processed_up_to_mutation?: string;
  };
}> {
  // 1. D1 stats & row counts
  const queryRes = await env.DB.prepare(`
    SELECT 
      (SELECT COUNT(DISTINCT project) FROM features) as total_projects,
      (SELECT COUNT(*) FROM features) as total_features,
      (SELECT COUNT(*) FROM chunks) as total_chunks,
      (SELECT COUNT(*) FROM chunks_fts) as total_fts_entries,
      (SELECT COALESCE(SUM(LENGTH(text)), 0) FROM chunks) as total_chunk_chars
  `).all<{
    total_projects: number;
    total_features: number;
    total_chunks: number;
    total_fts_entries: number;
    total_chunk_chars: number;
  }>();

  const counts = queryRes.results[0] || {
    total_projects: 0,
    total_features: 0,
    total_chunks: 0,
    total_fts_entries: 0,
    total_chunk_chars: 0,
  };

  const dbSizeBytes = queryRes.meta?.size_after || 0;
  const dbSizeFormatted =
    dbSizeBytes > 1024 * 1024
      ? `${(dbSizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(dbSizeBytes / 1024).toFixed(1)} KB`;

  // 2. Vectorize stats via .describe()
  let vectorizeStats: any = {
    index_name: "lekh-vectors",
    vector_count: counts.total_chunks,
    dimensions: 1024,
    metric: "cosine",
  };
  try {
    const desc = await env.VECTORIZE.describe();
    const config = desc.config && "dimensions" in desc.config ? desc.config : null;
    vectorizeStats = {
      index_name: desc.name || "lekh-vectors",
      vector_count: (desc.vectorsCount && desc.vectorsCount > 0) ? desc.vectorsCount : counts.total_chunks,
      dimensions: config?.dimensions ?? 1024,
      metric: (config?.metric as string) ?? "cosine",
    };
  } catch (err) {
    console.warn("Vectorize describe error:", err);
  }

  // 3. Workers AI Neuron calculation
  // Cloudflare rate: 1,075 neurons per 1,000,000 input tokens ($0.012 / 1M tokens)
  const estimatedTokens = Math.ceil((counts.total_chunk_chars || 0) / 3.8);
  const neuronsUsed = (estimatedTokens / 1_000_000) * 1075;
  const estimatedCost = (estimatedTokens / 1_000_000) * 0.012;

  return {
    ai: {
      model: "@cf/qwen/qwen3-embedding-0.6b",
      dimensions: 1024,
      total_tokens_estimated: estimatedTokens,
      neurons_used_estimated: Number(neuronsUsed.toFixed(4)),
      neurons_daily_free_limit: 10_000,
      neuron_rate_per_million_tokens: 1075,
      estimated_cost_usd: Number(estimatedCost.toFixed(6)),
    },
    d1: {
      database_name: "lekh-db",
      database_size_bytes: dbSizeBytes,
      database_size_formatted: dbSizeFormatted,
      total_projects: counts.total_projects,
      total_features: counts.total_features,
      total_chunks: counts.total_chunks,
      total_fts_entries: counts.total_fts_entries,
      storage_free_limit_bytes: 5 * 1024 * 1024 * 1024,
    },
    vectorize: vectorizeStats,
  };
}

export interface RelatedFeatureItem {
  project: string;
  name: string;
  type: FeatureType;
  library: string | null;
  similarity_score: number;
  shared_files: string[];
  shared_tags: string[];
  summary: string;
}

export async function findRelatedFeatures(
  env: Env,
  projectInput: string,
  nameInput: string,
  limit = 5
): Promise<RelatedFeatureItem[]> {
  const target = await getFeature(env, projectInput, nameInput);
  if (!target) {
    return [];
  }

  const targetFiles = new Set(target.files || []);
  const targetTags = new Set(target.tags || []);
  const targetLib = target.library ? target.library.toLowerCase() : null;

  // 1. Fetch other candidate features from D1
  const { results: otherFeatures } = await env.DB.prepare(
    "SELECT id, project, name, type, library, summary, files_json, tags_json FROM features WHERE id != ?"
  )
    .bind(target.id)
    .all<{
      id: number;
      project: string;
      name: string;
      type: FeatureType;
      library: string | null;
      summary: string;
      files_json: string;
      tags_json: string;
    }>();

  if (!otherFeatures || otherFeatures.length === 0) {
    return [];
  }

  // 2. Semantic similarity via target summary embedding
  const semanticScores = new Map<number, number>();
  try {
    const queryVec = await embedQuery(env, target.summary);
    const vecResults = await env.VECTORIZE.query(queryVec, {
      topK: Math.min(20, (otherFeatures.length + 1) * 2),
      returnMetadata: "all",
    });

    for (const match of vecResults.matches || []) {
      const featId = match.metadata?.feature_id as number;
      if (featId && featId !== target.id) {
        const current = semanticScores.get(featId) ?? -1;
        if (match.score > current) {
          semanticScores.set(featId, match.score);
        }
      }
    }
  } catch (err) {
    console.error("Semantic search failed in findRelatedFeatures:", err);
  }

  // 3. Structural + Semantic scoring
  const scoredItems: Array<{
    item: RelatedFeatureItem;
    score: number;
  }> = [];

  for (const f of otherFeatures) {
    let fFiles: string[] = [];
    let fTags: string[] = [];
    try {
      fFiles = JSON.parse(f.files_json || "[]");
    } catch {}
    try {
      fTags = JSON.parse(f.tags_json || "[]");
    } catch {}

    const sharedFiles = fFiles.filter((file) => targetFiles.has(file));
    const sharedTags = fTags.filter((tag) => targetTags.has(tag));
    const sameLib = Boolean(targetLib && f.library && f.library.toLowerCase() === targetLib);

    const structuralScore =
      Math.min(sharedFiles.length * 0.35, 0.4) +
      Math.min(sharedTags.length * 0.2, 0.3) +
      (sameLib ? 0.3 : 0);

    const semScore = semanticScores.get(f.id) ?? 0;
    const combinedScore = (semScore > 0 ? semScore * 0.6 : 0) + structuralScore * 0.4;

    if (sharedFiles.length > 0 || sharedTags.length > 0 || sameLib || semScore > 0.65) {
      scoredItems.push({
        item: {
          project: f.project,
          name: f.name,
          type: f.type,
          library: f.library,
          similarity_score: Number(combinedScore.toFixed(4)),
          shared_files: sharedFiles,
          shared_tags: sharedTags,
          summary: f.summary,
        },
        score: combinedScore,
      });
    }
  }

  scoredItems.sort((a, b) => b.score - a.score);
  return scoredItems.slice(0, limit).map((s) => s.item);
}

export interface ExportBundle {
  version: number;
  exported_at: string;
  features: SaveFeatureParams[];
}

export async function exportAllFeatures(env: Env): Promise<ExportBundle> {
  const { results } = await env.DB.prepare(
    "SELECT project, name, type, importance, library, summary, sections_json, children_json, files_json, tags_json FROM features ORDER BY project ASC, name ASC"
  ).all<any>();

  const features: SaveFeatureParams[] = (results || []).map((row) => {
    let sections: FeatureSection[] = [];
    let children: NestedChildEntry[] = [];
    let files: string[] = [];
    let tags: string[] = [];
    try {
      sections = JSON.parse(row.sections_json || "[]");
    } catch {}
    try {
      children = JSON.parse(row.children_json || "[]");
    } catch {}
    try {
      files = JSON.parse(row.files_json || "[]");
    } catch {}
    try {
      tags = JSON.parse(row.tags_json || "[]");
    } catch {}

    return {
      project: row.project,
      name: row.name,
      type: row.type,
      importance: row.importance,
      library: row.library,
      summary: row.summary,
      sections,
      children,
      files,
      tags,
    };
  });

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    features,
  };
}

export async function importFeatures(
  env: Env,
  features: SaveFeatureParams[]
): Promise<{ imported: number; unchanged: number; total: number }> {
  let imported = 0;
  let unchanged = 0;

  for (const f of features) {
    const res = await saveFeature(env, f);
    if (res.status === "created" || res.status === "updated") {
      imported++;
    } else {
      unchanged++;
    }
  }

  return { imported, unchanged, total: features.length };
}
