import { normalizeName } from "./names";
import {
  chunkFeature,
  computeContentHash,
  type FeatureInput,
  type FeatureSection,
  type FeatureType,
} from "./chunk";
import { embedDocuments, embedQuery } from "./embed";
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
}

export interface SearchParams {
  query: string;
  project?: string;
  type?: FeatureType;
  library?: string;
  limit?: number;
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

export function sanitizeFts5Query(query: string): string {
  const words = query
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !["AND", "OR", "NOT"].includes(w.toUpperCase()));

  if (words.length === 0) {
    return '""';
  }

  return words.map((w) => `"${w.replace(/"/g, "")}"`).join(" OR ");
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

  const normalizedInput: FeatureInput = {
    project,
    name,
    type,
    importance,
    library,
    summary: params.summary.trim(),
    sections: params.sections,
    files,
    tags,
  };

  const contentHash = await computeContentHash(normalizedInput);

  // Check if existing record exists in D1
  const existing = await env.DB.prepare(
    "SELECT id, content_hash, chunk_count, indexed_at FROM features WHERE project = ? AND name = ?"
  )
    .bind(project, name)
    .first<{
      id: number;
      content_hash: string;
      chunk_count: number;
      indexed_at: string | null;
    }>();

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
        sections_json, files_json, tags_json, content_hash,
        chunk_count, indexed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))`
    )
      .bind(
        project,
        name,
        type,
        importance,
        library,
        normalizedInput.summary,
        JSON.stringify(normalizedInput.sections),
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

  const grouped = fuseAndGroupResults(vectorResults, ftsResults, tieBreakers);
  const topGrouped = grouped.filter((g) => featureMap.has(g.feature_id)).slice(0, limit);

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

    // Clean snippet
    const snippetText = g.matched_text || f.summary || "";
    const snippet = snippetText.length > 300 ? `${snippetText.slice(0, 300)}...` : snippetText;

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
  let sql = `SELECT id, project, name, type, importance, library, summary, files_json, tags_json, chunk_count, indexed_at, created_at, updated_at
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
    `SELECT project, count(id) as feature_count, sum(chunk_count) as total_chunks, max(updated_at) as last_updated
     FROM features
     GROUP BY project
     ORDER BY last_updated DESC`
  ).all<any>();

  const projectsList = [];

  for (const r of results || []) {
    const project = r.project;
    const { results: featRows } = await env.DB.prepare(
      "SELECT type, tags_json FROM features WHERE project = ?"
    )
      .bind(project)
      .all<any>();

    const typesSet = new Set<string>();
    const tagsSet = new Set<string>();

    for (const f of featRows || []) {
      if (f.type) typesSet.add(f.type);
      try {
        const parsedTags = JSON.parse(f.tags_json || "[]");
        if (Array.isArray(parsedTags)) {
          parsedTags.forEach((t) => tagsSet.add(t));
        }
      } catch {}
    }

    projectsList.push({
      project,
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

export async function getOverviewGraph(env: Env): Promise<{
  projects: any[];
  features: any[];
  stats: {
    total_projects: number;
    total_features: number;
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
    });

    // Link Project -> Feature
    links.push({
      source: `proj:${f.project}`,
      target: featNodeId,
      type: "has_feature",
    });

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

  return {
    projects: projectsData,
    features: featuresData,
    stats: {
      total_projects: projectsData.length,
      total_features: featuresData.length,
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
