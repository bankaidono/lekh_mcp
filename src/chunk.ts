export interface FeatureSection {
  title: string;
  content: string;
}

export type FeatureType = "feature" | "pattern" | "decision" | "fix" | "refactor";

export interface NestedChildEntry {
  name: string;
  type: FeatureType;
  importance: number;
  library?: string | null;
  summary: string;
  sections: FeatureSection[];
  files: string[];
  tags: string[];
  updated_at: string;
}

export interface FeatureInput {
  project: string;
  name: string;
  type?: FeatureType;
  importance?: number;
  library?: string | null;
  summary: string;
  sections: FeatureSection[];
  children?: NestedChildEntry[];
  files?: string[];
  tags?: string[];
}

export interface ChunkItem {
  idx: number;
  section: string;
  text: string;
}

export function splitSectionContent(content: string, maxLen = 1500): string[] {
  const trimmed = content.trim();
  if (trimmed.length <= maxLen) {
    return [trimmed];
  }

  const paragraphs = trimmed.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;

    if (p.length > maxLen) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      const lines = p.split(/\n/);
      let lineAccum = "";
      for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        if (l.length > maxLen) {
          if (lineAccum.length > 0) {
            chunks.push(lineAccum);
            lineAccum = "";
          }
          for (let i = 0; i < l.length; i += maxLen) {
            const slice = l.slice(i, i + maxLen).trim();
            if (slice) chunks.push(slice);
          }
        } else if (lineAccum.length + l.length + 1 <= maxLen) {
          lineAccum = lineAccum ? `${lineAccum}\n${l}` : l;
        } else {
          chunks.push(lineAccum);
          lineAccum = l;
        }
      }
      if (lineAccum.length > 0) {
        chunks.push(lineAccum);
      }
    } else if (currentChunk.length + p.length + 2 <= maxLen) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${p}` : p;
    } else {
      chunks.push(currentChunk);
      currentChunk = p;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

export function chunkFeature(input: FeatureInput): ChunkItem[] {
  const chunks: ChunkItem[] = [];

  // Deduplicate files and tags across parent and all children for Chunk 0
  const fileSet = new Set<string>((input.files ?? []).filter((f) => f && f.trim().length > 0));
  const tagSet = new Set<string>((input.tags ?? []).filter((t) => t && t.trim().length > 0));

  for (const child of input.children ?? []) {
    for (const f of child.files ?? []) {
      if (f && f.trim().length > 0) fileSet.add(f.trim());
    }
    for (const t of child.tags ?? []) {
      if (t && t.trim().length > 0) tagSet.add(t.trim());
    }
  }

  const files = Array.from(fileSet);
  const tags = Array.from(tagSet);

  // Chunk 0: Summary & Files/Tags
  const chunk0Parts: string[] = [input.summary.trim()];

  if (files.length > 0) {
    chunk0Parts.push(`Files: ${files.join(", ")}`);
  }
  if (tags.length > 0) {
    chunk0Parts.push(`Tags: ${tags.join(", ")}`);
  }

  const chunk0Body = chunk0Parts.join("\n");
  chunks.push({
    idx: 0,
    section: "summary",
    text: `${input.project} | ${input.name} | summary\n${chunk0Body}`,
  });

  // Section Chunks (1..N)
  let nextIdx = 1;
  for (const sec of input.sections) {
    const secTitle = sec.title.trim() || "section";
    const subParts = splitSectionContent(sec.content, 1500);

    for (const part of subParts) {
      chunks.push({
        idx: nextIdx++,
        section: secTitle,
        text: `${input.project} | ${input.name} | ${secTitle}\n${part}`,
      });
    }
  }

  // Children Chunks (nested-updates)
  if (input.children && input.children.length > 0) {
    const childBlocks = input.children.map((child) => {
      const parts = [`[${child.type}] ${child.name}: ${child.summary}`];
      if (child.sections && child.sections.length > 0) {
        parts.push(child.sections.map((s) => `${s.title}: ${s.content}`).join("\n"));
      }
      if (child.files && child.files.length > 0) {
        parts.push(`Files: ${child.files.join(", ")}`);
      }
      return parts.join("\n");
    });

    const combinedChildrenText = childBlocks.join("\n\n---\n\n");
    const childSubParts = splitSectionContent(combinedChildrenText, 1500);

    for (const part of childSubParts) {
      chunks.push({
        idx: nextIdx++,
        section: "nested-updates",
        text: `${input.project} | ${input.name} | nested-updates\n${part}`,
      });
    }
  }

  return chunks;
}

export async function computeContentHash(input: FeatureInput): Promise<string> {
  const canonical = JSON.stringify({
    project: input.project,
    name: input.name,
    type: input.type ?? "feature",
    importance: input.importance ?? 2,
    library: input.library ?? null,
    summary: input.summary.trim(),
    sections: input.sections.map((s) => ({
      title: s.title.trim(),
      content: s.content.trim(),
    })),
    children: (input.children ?? []).map((c) => ({
      name: c.name,
      type: c.type,
      importance: c.importance,
      library: c.library ?? null,
      summary: c.summary.trim(),
      sections: (c.sections || []).map((cs) => ({
        title: cs.title.trim(),
        content: cs.content.trim(),
      })),
      files: (c.files ?? []).map((f) => f.trim()).filter(Boolean).sort(),
      tags: (c.tags ?? []).map((t) => t.trim()).filter(Boolean).sort(),
    })),
    files: (input.files ?? []).map((f) => f.trim()).filter(Boolean).sort(),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).sort(),
  });

  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
