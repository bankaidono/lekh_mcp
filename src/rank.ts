export interface VectorMatchItem {
  vector_id: string;
  feature_id: number;
  score: number;
}

export interface FtsMatchItem {
  vector_id: string;
  feature_id: number;
  section: string;
  text: string;
}

export interface FeatureMetadataTieBreaker {
  importance?: number;
  updated_at?: string;
}

export interface GroupedFeatureResult {
  feature_id: number;
  best_vector_id: string;
  rrf_score: number;
  vector_score: number | null;
  vector_rank: number | null;
  fts_rank: number | null;
  fts_matched: boolean;
  matched_section: string;
  matched_text: string;
  matched_chunks_count: number;
  rerank_score?: number | null;
}

export function fuseAndGroupResults(
  vectorMatches: VectorMatchItem[],
  ftsMatches: FtsMatchItem[],
  tieBreakers?: Map<number, FeatureMetadataTieBreaker>
): GroupedFeatureResult[] {
  const K = 60;

  // 1-based rank maps
  const vecMap = new Map<string, { rank: number; score: number; feature_id: number }>();
  vectorMatches.forEach((v, idx) => {
    // Only record first appearance of vector_id
    if (!vecMap.has(v.vector_id)) {
      vecMap.set(v.vector_id, {
        rank: idx + 1,
        score: v.score,
        feature_id: v.feature_id,
      });
    }
  });

  const ftsMap = new Map<
    string,
    { rank: number; feature_id: number; section: string; text: string }
  >();
  ftsMatches.forEach((f, idx) => {
    if (!ftsMap.has(f.vector_id)) {
      ftsMap.set(f.vector_id, {
        rank: idx + 1,
        feature_id: f.feature_id,
        section: f.section,
        text: f.text,
      });
    }
  });

  // Collect all unique vector_ids
  const allVectorIds = new Set<string>([...vecMap.keys(), ...ftsMap.keys()]);

  // Compute RRF score per chunk
  interface ChunkScore {
    vector_id: string;
    feature_id: number;
    rrf: number;
    vector_score: number | null;
    vector_rank: number | null;
    fts_rank: number | null;
    fts_matched: boolean;
    section: string;
    text: string;
  }

  const chunkScores: ChunkScore[] = [];

  for (const vId of allVectorIds) {
    const vInfo = vecMap.get(vId);
    const fInfo = ftsMap.get(vId);

    const featureId = vInfo?.feature_id ?? fInfo?.feature_id;
    if (featureId === undefined) continue;

    let rrf = 0;
    if (vInfo) {
      rrf += 1 / (K + vInfo.rank);
    }
    if (fInfo) {
      rrf += 1 / (K + fInfo.rank);
    }

    chunkScores.push({
      vector_id: vId,
      feature_id: featureId,
      rrf,
      vector_score: vInfo ? vInfo.score : null,
      vector_rank: vInfo ? vInfo.rank : null,
      fts_rank: fInfo ? fInfo.rank : null,
      fts_matched: Boolean(fInfo),
      section: fInfo?.section ?? "summary",
      text: fInfo?.text ?? "",
    });
  }

  // Group chunks by feature_id
  const featureGroups = new Map<number, ChunkScore[]>();
  for (const cs of chunkScores) {
    const list = featureGroups.get(cs.feature_id) ?? [];
    list.push(cs);
    featureGroups.set(cs.feature_id, list);
  }

  const groupedResults: GroupedFeatureResult[] = [];

  for (const [featureId, chunks] of featureGroups.entries()) {
    // Pick the chunk with highest RRF score
    chunks.sort((a, b) => b.rrf - a.rrf);
    const best = chunks[0];

    // Multi-chunk RRF bonus: best.rrf + 0.25 * sum(chunks[1..min(chunks.length-1, 3)].rrf)
    let bonus = 0;
    const maxBonusChunks = Math.min(chunks.length - 1, 3);
    for (let i = 1; i <= maxBonusChunks; i++) {
      bonus += chunks[i].rrf;
    }
    const combinedRrf = best.rrf + 0.25 * bonus;

    // Determine if any chunk in the feature matched FTS
    const anyFtsMatched = chunks.some((c) => c.fts_matched);
    const bestFtsChunk = chunks.find((c) => c.fts_matched);

    groupedResults.push({
      feature_id: featureId,
      best_vector_id: best.vector_id,
      rrf_score: combinedRrf,
      vector_score: best.vector_score,
      vector_rank: best.vector_rank,
      fts_rank: best.fts_rank ?? bestFtsChunk?.fts_rank ?? null,
      fts_matched: anyFtsMatched,
      matched_section: best.section || bestFtsChunk?.section || "summary",
      matched_text: best.text || bestFtsChunk?.text || "",
      matched_chunks_count: chunks.length,
    });
  }

  // Sort grouped features: rrf_score DESC, then importance DESC, then updated_at DESC
  groupedResults.sort((a, b) => {
    if (Math.abs(b.rrf_score - a.rrf_score) > 1e-9) {
      return b.rrf_score - a.rrf_score;
    }

    if (tieBreakers) {
      const tbA = tieBreakers.get(a.feature_id);
      const tbB = tieBreakers.get(b.feature_id);

      const impA = tbA?.importance ?? 2;
      const impB = tbB?.importance ?? 2;
      if (impB !== impA) {
        return impB - impA;
      }

      const dateA = tbA?.updated_at ?? "";
      const dateB = tbB?.updated_at ?? "";
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
    }

    return a.feature_id - b.feature_id;
  });

  return groupedResults;
}
