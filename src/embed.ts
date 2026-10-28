const EMBED_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
const BATCH_SIZE = 32;
const EXPECTED_DIM = 1024;
const QUERY_INSTRUCTION =
  "Given a software engineering search query, retrieve relevant feature architecture, implementation patterns, and documentation passages";

export async function embedDocuments(env: { AI: Ai }, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const allVectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = (await env.AI.run(EMBED_MODEL as any, {
      documents: batch,
    })) as any;

    if (!res || !Array.isArray(res.data)) {
      throw new Error(`Workers AI returned unexpected shape: ${JSON.stringify(res)}`);
    }

    if (res.data.length !== batch.length) {
      throw new Error(
        `Workers AI returned ${res.data.length} vectors for batch of ${batch.length}`
      );
    }

    for (let j = 0; j < res.data.length; j++) {
      const vec = res.data[j];
      if (!Array.isArray(vec) || vec.length !== EXPECTED_DIM) {
        throw new Error(
          `Vector at index ${i + j} has invalid dimension ${vec?.length} (expected ${EXPECTED_DIM})`
        );
      }
      allVectors.push(vec);
    }
  }

  return allVectors;
}

export async function embedQuery(env: { AI: Ai }, query: string): Promise<number[]> {
  const q = query.trim();
  if (q.length === 0) {
    throw new Error("Query string cannot be empty");
  }

  const res = (await env.AI.run(EMBED_MODEL as any, {
    queries: [q],
    instruction: QUERY_INSTRUCTION,
  })) as any;

  if (!res || !Array.isArray(res.data) || res.data.length === 0) {
    throw new Error(`Workers AI query embed returned invalid shape: ${JSON.stringify(res)}`);
  }

  const vec = res.data[0];
  if (!Array.isArray(vec) || vec.length !== EXPECTED_DIM) {
    throw new Error(
      `Query vector has invalid dimension ${vec?.length} (expected ${EXPECTED_DIM})`
    );
  }

  return vec;
}

const RERANK_MODEL = "@cf/baai/bge-reranker-base";

export async function rerankContexts(
  env: { AI: Ai },
  query: string,
  contexts: string[]
): Promise<Map<number, number>> {
  const q = query.trim();
  if (q.length === 0 || contexts.length === 0) {
    return new Map();
  }

  const payload = {
    query: q,
    contexts: contexts.map((text) => ({ text: text || " " })),
  };

  const res = (await env.AI.run(RERANK_MODEL as any, payload)) as any;

  const scoreMap = new Map<number, number>();
  if (res && Array.isArray(res.response)) {
    for (const item of res.response) {
      if (typeof item.id === "number" && typeof item.score === "number") {
        scoreMap.set(item.id, item.score);
      }
    }
  }

  return scoreMap;
}
