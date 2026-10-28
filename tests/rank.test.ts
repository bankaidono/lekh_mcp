import { describe, expect, it } from "bun:test";
import {
  fuseAndGroupResults,
  type VectorMatchItem,
  type FtsMatchItem,
  type FeatureMetadataTieBreaker,
} from "../src/rank";

describe("fuseAndGroupResults", () => {
  it("computes standard RRF with k=60 for combined vector and FTS matches", () => {
    // Rank 1 in both: 1/(60+1) + 1/(60+1) = 2/61 ≈ 0.03278688
    const vectorMatches: VectorMatchItem[] = [
      { vector_id: "f1-c0", feature_id: 1, score: 0.95 },
      { vector_id: "f2-c0", feature_id: 2, score: 0.88 },
    ];

    const ftsMatches: FtsMatchItem[] = [
      { vector_id: "f1-c0", feature_id: 1, section: "summary", text: "sample text" },
      { vector_id: "f3-c0", feature_id: 3, section: "summary", text: "other text" },
    ];

    const results = fuseAndGroupResults(vectorMatches, ftsMatches);

    expect(results.length).toBe(3);

    // Feature 1 should be ranked #1
    expect(results[0].feature_id).toBe(1);
    expect(results[0].fts_matched).toBe(true);
    expect(results[0].vector_rank).toBe(1);
    expect(results[0].fts_rank).toBe(1);

    const expectedRrfF1 = 1 / 61 + 1 / 61;
    expect(Math.abs(results[0].rrf_score - expectedRrfF1)).toBeLessThan(1e-6);

    // Feature 2 (rank 2 in vec only) vs Feature 3 (rank 2 in fts only):
    // 1 / (60 + 2) = 1/62 ≈ 0.016129
    const expectedRrfSingle = 1 / 62;
    expect(Math.abs(results[1].rrf_score - expectedRrfSingle)).toBeLessThan(1e-6);
  });

  it("groups multiple chunks under the same feature_id picking the best chunk and applying multi-chunk bonus", () => {
    const vectorMatches: VectorMatchItem[] = [
      { vector_id: "f10-c1", feature_id: 10, score: 0.92 },
      { vector_id: "f10-c0", feature_id: 10, score: 0.80 },
    ];

    const ftsMatches: FtsMatchItem[] = [
      { vector_id: "f10-c1", feature_id: 10, section: "architecture", text: "Architecture body" },
    ];

    const results = fuseAndGroupResults(vectorMatches, ftsMatches);
    expect(results.length).toBe(1);
    expect(results[0].feature_id).toBe(10);
    expect(results[0].best_vector_id).toBe("f10-c1");
    expect(results[0].matched_section).toBe("architecture");
    expect(results[0].matched_chunks_count).toBe(2);

    const bestChunkRrf = 1 / 61 + 1 / 61; // vec rank 1 + fts rank 1
    const secondChunkRrf = 1 / 62; // vec rank 2
    const expectedRrf = bestChunkRrf + 0.25 * secondChunkRrf;
    expect(Math.abs(results[0].rrf_score - expectedRrf)).toBeLessThan(1e-6);
  });

  it("caps multi-chunk bonus to top 3 additional chunks", () => {
    // 5 chunks for feature 50
    const vectorMatches: VectorMatchItem[] = [
      { vector_id: "f50-c0", feature_id: 50, score: 0.99 }, // rank 1: 1/61
      { vector_id: "f50-c1", feature_id: 50, score: 0.90 }, // rank 2: 1/62
      { vector_id: "f50-c2", feature_id: 50, score: 0.85 }, // rank 3: 1/63
      { vector_id: "f50-c3", feature_id: 50, score: 0.80 }, // rank 4: 1/64
      { vector_id: "f50-c4", feature_id: 50, score: 0.75 }, // rank 5: 1/65 (should be excluded from bonus)
    ];

    const results = fuseAndGroupResults(vectorMatches, []);
    expect(results.length).toBe(1);
    expect(results[0].matched_chunks_count).toBe(5);

    const bestRrf = 1 / 61;
    const bonus = 0.25 * (1 / 62 + 1 / 63 + 1 / 64);
    expect(Math.abs(results[0].rrf_score - (bestRrf + bonus))).toBeLessThan(1e-6);
  });

  it("breaks ties using importance and updated_at", () => {
    // Both features have equal rank in vector results and no FTS match
    const vectorMatches: VectorMatchItem[] = [
      { vector_id: "f1-c0", feature_id: 1, score: 0.90 },
      { vector_id: "f2-c0", feature_id: 2, score: 0.90 },
    ];

    // Give feature 2 higher importance
    const tieBreakers = new Map<number, FeatureMetadataTieBreaker>([
      [1, { importance: 1, updated_at: "2026-10-28T10:00:00Z" }],
      [2, { importance: 3, updated_at: "2026-10-28T09:00:00Z" }],
    ]);

    const results = fuseAndGroupResults(vectorMatches, [], tieBreakers);
    expect(results.length).toBe(2);
    expect(results[0].feature_id).toBe(1); // Rank 1 in vec list (1/61)
    expect(results[1].feature_id).toBe(2); // Rank 2 in vec list (1/62)

    // Now test exact equal RRF score
    // Chunk A is rank 1 in vec (1/61)
    // Chunk B is rank 1 in fts (1/61)
    const vecA: VectorMatchItem[] = [{ vector_id: "fa-c0", feature_id: 100, score: 0.90 }];
    const ftsB: FtsMatchItem[] = [
      { vector_id: "fb-c0", feature_id: 200, section: "summary", text: "text" },
    ];

    const tb = new Map<number, FeatureMetadataTieBreaker>([
      [100, { importance: 2, updated_at: "2026-10-28T08:00:00Z" }],
      [200, { importance: 3, updated_at: "2026-10-28T08:00:00Z" }],
    ]);

    const res = fuseAndGroupResults(vecA, ftsB, tb);
    expect(res.length).toBe(2);
    // Both have RRF = 1/61. Feature 200 has importance 3 vs 100 with importance 2
    expect(res[0].feature_id).toBe(200);
    expect(res[1].feature_id).toBe(100);
  });
});
