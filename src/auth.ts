import { timingSafeEqual } from "node:crypto";

export async function checkBearer(
  request: Request,
  expectedToken: string | undefined
): Promise<boolean> {
  if (!expectedToken || typeof expectedToken !== "string" || expectedToken.trim().length === 0) {
    return false;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return false;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return false;
  }

  const providedToken = match[1].trim();
  if (providedToken.length === 0) {
    return false;
  }

  const encoder = new TextEncoder();
  const [expectedDigest, providedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(providedToken)),
  ]);

  return timingSafeEqual(new Uint8Array(expectedDigest), new Uint8Array(providedDigest));
}
