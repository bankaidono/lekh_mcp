import { describe, expect, it } from "bun:test";
import { sanitizeFts5Query } from "../src/store";

describe("sanitizeFts5Query", () => {
  it("preserves technical tokens with dots, slashes, and dashes", () => {
    const query = "src/store.ts";
    const result = sanitizeFts5Query(query);
    expect(result).toContain('"src/store.ts"');
    expect(result).toContain('"src"');
    expect(result).toContain('"store"');
    expect(result).toContain('"store"*');
    expect(result).toContain('"ts"');
  });

  it("filters out stop words and generates OR clauses with prefix wildcards for symbols >= 4 chars", () => {
    const query = "how to use jwt-auth-middleware in workers";
    const result = sanitizeFts5Query(query);
    // "how", "to", "in" are stop words
    expect(result).not.toContain('"how"');
    expect(result).not.toContain('"to"');
    expect(result).not.toContain('"in"');
    // Technical token
    expect(result).toContain('"jwt-auth-middleware"');
    expect(result).toContain('"middleware"*');
    expect(result).toContain('"workers"*');
  });

  it("handles model names and versions cleanly", () => {
    const query = "qwen3-embedding-0.6b";
    const result = sanitizeFts5Query(query);
    expect(result).toContain('"qwen3-embedding-0.6b"');
    expect(result).toContain('"qwen3"*');
    expect(result).toContain('"embedding"*');
  });

  it("returns double quotes for empty or whitespace query", () => {
    expect(sanitizeFts5Query("")).toBe('""');
    expect(sanitizeFts5Query("   ")).toBe('""');
  });

  it("falls back to alphanumeric words if all tokens are stop words", () => {
    const query = "how what the";
    const result = sanitizeFts5Query(query);
    // Should fallback gracefully without empty string
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('"how"');
  });
});
