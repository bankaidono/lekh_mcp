import { describe, expect, it } from "bun:test";
import { normalizeName } from "../src/names";

describe("normalizeName", () => {
  it("converts spaces and underscores to hyphens and lowercases", () => {
    expect(normalizeName("Dropdown Menu")).toBe("dropdown-menu");
    expect(normalizeName("auth_service_v2")).toBe("auth-service-v2");
    expect(normalizeName("  UserProfile_Card  ")).toBe("userprofile-card");
  });

  it("strips non-alphanumeric characters except hyphens", () => {
    expect(normalizeName("feature!@#$%^&*()_+")).toBe("feature");
    expect(normalizeName("v1.2.3-release")).toBe("v123-release");
  });

  it("collapses multiple consecutive hyphens", () => {
    expect(normalizeName("foo---bar___baz")).toBe("foo-bar-baz");
    expect(normalizeName("-leading-and-trailing-")).toBe("leading-and-trailing");
  });

  it("throws on empty or whitespace-only input", () => {
    expect(() => normalizeName("")).toThrow("empty");
    expect(() => normalizeName("   ")).toThrow("empty");
    expect(() => normalizeName("!@#$$%^")).toThrow("empty");
  });

  it("throws when normalized result exceeds 60 characters", () => {
    const longName = "a".repeat(61);
    expect(() => normalizeName(longName)).toThrow("exceeds 60 characters");
  });

  it("accepts exactly 60 characters", () => {
    const exact60 = "a".repeat(60);
    expect(normalizeName(exact60)).toBe(exact60);
  });
});
