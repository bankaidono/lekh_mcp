import { describe, expect, it } from "bun:test";
import { checkBearer } from "../src/auth";

describe("checkBearer", () => {
  const secret = "test-secret-token-12345!@#";

  it("returns true for exact matching Bearer token", async () => {
    const req = new Request("https://example.com/mcp", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(await checkBearer(req, secret)).toBe(true);
  });

  it("is case-insensitive for the Bearer prefix", async () => {
    const req = new Request("https://example.com/mcp", {
      headers: { Authorization: `bearer ${secret}` },
    });
    expect(await checkBearer(req, secret)).toBe(true);
  });

  it("returns false for incorrect token", async () => {
    const req = new Request("https://example.com/mcp", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(await checkBearer(req, secret)).toBe(false);
  });

  it("returns false if Authorization header is missing", async () => {
    const req = new Request("https://example.com/mcp");
    expect(await checkBearer(req, secret)).toBe(false);
  });

  it("returns false for non-Bearer schemes", async () => {
    const req = new Request("https://example.com/mcp", {
      headers: { Authorization: `Basic ${secret}` },
    });
    expect(await checkBearer(req, secret)).toBe(false);
  });

  it("returns false if expectedToken is empty or undefined", async () => {
    const req = new Request("https://example.com/mcp", {
      headers: { Authorization: "Bearer some-token" },
    });
    expect(await checkBearer(req, undefined)).toBe(false);
    expect(await checkBearer(req, "")).toBe(false);
    expect(await checkBearer(req, "   ")).toBe(false);
  });

  it("returns false if Bearer token in header is empty", async () => {
    const req = new Request("https://example.com/mcp", {
      headers: { Authorization: "Bearer " },
    });
    expect(await checkBearer(req, secret)).toBe(false);
  });
});
