import type { SessionClaims } from "./types";

const enc = new TextEncoder();
// Cloudflare Workers' production runtime caps PBKDF2 at 100k iterations
// (NotSupportedError above that). This is the supported maximum.
const ITER = 100_000;

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64u(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function pbkdf2(pw: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as Uint8Array<ArrayBuffer>, iterations: ITER }, key, 256);
  return b64u(bits);
}

export async function hashPassword(pw: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await pbkdf2(pw, salt), salt: b64u(salt) };
}

export async function verifyPassword(pw: string, hash: string, salt: string): Promise<boolean> {
  const h = await pbkdf2(pw, unb64u(salt));
  if (h.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// A fixed salt used only to burn the same PBKDF2 cost on the no-such-user login
// branch, so response timing doesn't reveal whether a username exists. (Review M15.)
const DUMMY_SALT = new Uint8Array(16);
export async function dummyVerify(pw: string): Promise<void> {
  await pbkdf2(pw, DUMMY_SALT);
}

// Unambiguous alphabet (no 0/O/1/I/l) for a human-shareable one-time password.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A fresh, unique temporary password (admin password-reset). (Review M14.) */
export function generateTempPassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[bytes[i]! % TEMP_ALPHABET.length];
  return out;
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(claims)));
  return `${body}.${await hmac(body, secret)}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body, secret);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(unb64u(body))) as SessionClaims;
    // Reject an expired token (signature alone is not enough). (Review M12.)
    if (claims.exp != null && Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}
