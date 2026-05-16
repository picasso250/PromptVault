import type { Env } from "./types";

const COOKIE_NAME = "pv_admin";
const SESSION_DAYS = 7;

export async function createAdminSession(env: Env): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256(`${token}.${env.SESSION_SECRET}`);
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await env.DB.prepare("INSERT INTO admin_sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, tokenHash, now.toISOString(), expires.toISOString())
    .run();

  return `${COOKIE_NAME}=${id}.${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

export async function destroyAdminSession(request: Request, env: Env): Promise<string> {
  const cookie = parseSessionCookie(request);
  if (cookie) await env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?").bind(cookie.id).run();
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function requireAdmin(request: Request, env: Env): Promise<boolean> {
  const cookie = parseSessionCookie(request);
  if (!cookie) return false;

  const row = await env.DB.prepare("SELECT token_hash, expires_at FROM admin_sessions WHERE id = ?")
    .bind(cookie.id)
    .first<{ token_hash: string; expires_at: string }>();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return false;

  const tokenHash = await sha256(`${cookie.token}.${env.SESSION_SECRET}`);
  return timingSafeEqual(tokenHash, row.token_hash);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith("sha256:")) {
    const expected = hash.slice("sha256:".length);
    const actual = await sha256(password);
    return timingSafeEqual(actual, expected);
  }
  return timingSafeEqual(password, hash);
}

function parseSessionCookie(request: Request): { id: string; token: string } | null {
  const header = request.headers.get("cookie") || "";
  const value = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!value) return null;
  const [id, token] = value.split(".");
  if (!id || !token) return null;
  return { id, token };
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
