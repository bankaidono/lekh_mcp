import { describe, expect, it } from "bun:test";
import { renderDashboardHtml } from "../src/ui";

describe("renderDashboardHtml", () => {
  it("renders non-empty HTML document with title and doctype", () => {
    const html = renderDashboardHtml();
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Lekh — Feature Memory Explorer</title>");
  });

  it("contains syntactically valid inline JavaScript in all script tags", () => {
    const html = renderDashboardHtml();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);

    for (const [_, scriptCode] of scripts) {
      // Validates syntax without executing
      expect(() => new Function(scriptCode)).not.toThrow();
    }
  });
});
