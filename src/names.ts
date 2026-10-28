export function normalizeName(input: string): string {
  if (typeof input !== "string") {
    throw new Error("Name must be a string");
  }

  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length === 0) {
    throw new Error(`Invalid name: normalized result is empty (input was "${input}")`);
  }

  if (normalized.length > 60) {
    throw new Error(
      `Invalid name: normalized length (${normalized.length}) exceeds 60 characters limit`
    );
  }

  return normalized;
}
