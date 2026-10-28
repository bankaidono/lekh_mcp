import { describe, expect, it } from "bun:test";
import {
  chunkFeature,
  computeContentHash,
  splitSectionContent,
  type FeatureInput,
} from "../src/chunk";

describe("splitSectionContent", () => {
  it("keeps content under 1500 characters as a single chunk", () => {
    const text = "Short paragraph.";
    const chunks = splitSectionContent(text, 1500);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe("Short paragraph.");
  });

  it("splits paragraphs when content exceeds maxLen", () => {
    const para1 = "A".repeat(800);
    const para2 = "B".repeat(800);
    const content = `${para1}\n\n${para2}`;

    const chunks = splitSectionContent(content, 1500);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  it("splits long single paragraphs exceeding maxLen", () => {
    const line1 = "C".repeat(900);
    const line2 = "D".repeat(900);
    const content = `${line1}\n${line2}`;

    const chunks = splitSectionContent(content, 1500);
    expect(chunks.length).toBe(2);
  });
});

describe("chunkFeature", () => {
  const sampleInput: FeatureInput = {
    project: "lekh-web",
    name: "auth-guard",
    type: "feature",
    importance: 2,
    summary: "Ensures only authenticated users can access protected routes.",
    sections: [
      {
        title: "architecture",
        content: "Uses React Context and router middleware.",
      },
      {
        title: "gotchas",
        content: "Remember to handle token expiration gracefully.",
      },
    ],
    files: ["src/auth/Guard.tsx", "src/auth/context.ts"],
    tags: ["auth", "security"],
  };

  it("creates Chunk 0 with summary, files, and tags", () => {
    const chunks = chunkFeature(sampleInput);
    expect(chunks.length).toBe(3);

    const chunk0 = chunks[0];
    expect(chunk0.idx).toBe(0);
    expect(chunk0.section).toBe("summary");
    expect(chunk0.text).toContain("lekh-web | auth-guard | summary");
    expect(chunk0.text).toContain("Ensures only authenticated users can access protected routes.");
    expect(chunk0.text).toContain("Files: src/auth/Guard.tsx, src/auth/context.ts");
    expect(chunk0.text).toContain("Tags: auth, security");
  });

  it("applies contextual prefix to all section chunks", () => {
    const chunks = chunkFeature(sampleInput);
    expect(chunks[1].idx).toBe(1);
    expect(chunks[1].section).toBe("architecture");
    expect(chunks[1].text.startsWith("lekh-web | auth-guard | architecture\n")).toBe(true);
    expect(chunks[1].text).toContain("Uses React Context and router middleware.");

    expect(chunks[2].idx).toBe(2);
    expect(chunks[2].section).toBe("gotchas");
    expect(chunks[2].text.startsWith("lekh-web | auth-guard | gotchas\n")).toBe(true);
    expect(chunks[2].text).toContain("Remember to handle token expiration gracefully.");
  });

  it("rolls up nested children into consolidated nested-updates chunks and deduplicates files/tags into Chunk 0", () => {
    const inputWithChildren: FeatureInput = {
      ...sampleInput,
      files: ["src/auth/Guard.tsx"],
      tags: ["auth"],
      children: [
        {
          name: "token-refresh-fix",
          type: "fix",
          importance: 2,
          summary: "Fixes silent 401 when refresh token expires during navigation.",
          sections: [
            {
              title: "details",
              content: "Dispatched an auth:logout event when refresh returns 401.",
            },
          ],
          files: ["src/auth/refresh.ts", "src/auth/Guard.tsx"],
          tags: ["auth", "token-refresh"],
          updated_at: "2026-10-28T00:00:00.000Z",
        },
        {
          name: "session-timeout-pattern",
          type: "pattern",
          importance: 1,
          summary: "Pattern for tracking inactivity timeouts.",
          sections: [],
          files: ["src/auth/inactivity.ts"],
          tags: ["security"],
          updated_at: "2026-10-28T00:00:00.000Z",
        },
      ],
    };

    const chunks = chunkFeature(inputWithChildren);
    // Chunk 0 (summary), Chunk 1 (architecture), Chunk 2 (gotchas), Chunk 3 (nested-updates)
    expect(chunks.length).toBe(4);

    // Chunk 0 should have deduplicated merged files & tags
    const chunk0 = chunks[0];
    expect(chunk0.text).toContain("Files: src/auth/Guard.tsx, src/auth/refresh.ts, src/auth/inactivity.ts");
    expect(chunk0.text).toContain("Tags: auth, token-refresh, security");

    // Chunk 3 should be nested-updates section
    const chunk3 = chunks[3];
    expect(chunk3.idx).toBe(3);
    expect(chunk3.section).toBe("nested-updates");
    expect(chunk3.text).toContain("lekh-web | auth-guard | nested-updates");
    expect(chunk3.text).toContain("[fix] token-refresh-fix: Fixes silent 401");
    expect(chunk3.text).toContain("[pattern] session-timeout-pattern: Pattern for tracking inactivity timeouts.");
    expect(chunk3.text).toContain("Files: src/auth/refresh.ts, src/auth/Guard.tsx");
    expect(chunk3.text).toContain("Files: src/auth/inactivity.ts");
  });
});

describe("computeContentHash", () => {
  const baseInput: FeatureInput = {
    project: "lekh-web",
    name: "auth-guard",
    type: "feature",
    importance: 2,
    summary: "A test summary",
    sections: [{ title: "sec1", content: "body1" }],
    files: ["b.ts", "a.ts"],
    tags: ["tag2", "tag1"],
  };

  it("is deterministic and order-independent for files and tags", async () => {
    const hash1 = await computeContentHash(baseInput);
    const hash2 = await computeContentHash({
      ...baseInput,
      files: ["a.ts", "b.ts"],
      tags: ["tag1", "tag2"],
    });

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe("string");
    expect(hash1.length).toBe(64);
  });

  it("changes hash when summary or content changes", async () => {
    const hash1 = await computeContentHash(baseInput);
    const hash2 = await computeContentHash({
      ...baseInput,
      summary: "Different summary",
    });

    expect(hash1).not.toBe(hash2);
  });

  it("changes hash when nested children are added or updated", async () => {
    const hashWithoutChildren = await computeContentHash(baseInput);
    const hashWithChild = await computeContentHash({
      ...baseInput,
      children: [
        {
          name: "sub-fix",
          type: "fix",
          importance: 2,
          summary: "Fixed a bug",
          sections: [],
          files: [],
          tags: [],
          updated_at: "2026-10-28T00:00:00.000Z",
        },
      ],
    });

    expect(hashWithoutChildren).not.toBe(hashWithChild);
  });
});
