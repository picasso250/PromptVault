interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
}

type Status = "pending" | "approved" | "rejected";

interface PromptRow {
  id: string;
  title: string;
  prompt_text: string;
  description: string | null;
  tags: string | null;
  image_key: string;
  image_type: string;
  image_size: number;
  status: Status;
  created_at: string;
  updated_at: string;
  moderated_at: string | null;
}

const SITE_NAME = "PromptVault";
const SITE_HOST = "prompt.io99.xyz";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SESSION_DAYS = 7;
const COOKIE_NAME = "pv_admin";
const IMAGE_TYPE = "image/jpeg";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && (url.pathname === "/styles.css" || url.pathname === "/submit.js")) {
        return env.ASSETS.fetch(request);
      }

      if (request.method === "GET" && url.pathname === "/") return home(env);
      if (request.method === "GET" && url.pathname === "/submit") return submitPage();
      if (request.method === "POST" && url.pathname === "/submit") return submitPrompt(request, env);
      if (request.method === "GET" && url.pathname.startsWith("/p/")) return detail(url, env);
      if (request.method === "GET" && url.pathname.startsWith("/images/")) return image(url, env);
      if (request.method === "GET" && url.pathname === "/admin/login") return adminLoginPage();
      if (request.method === "POST" && url.pathname === "/admin/login") return adminLogin(request, env);
      if (request.method === "POST" && url.pathname === "/admin/logout") return adminLogout(request, env);

      if (url.pathname === "/admin" && request.method === "GET") {
        const session = await requireAdmin(request, env);
        if (session) return session;
        return adminDashboard(env);
      }

      if (request.method === "GET" && url.pathname.startsWith("/admin/images/")) {
        const session = await requireAdmin(request, env);
        if (session) return session;
        return adminImage(url, env);
      }

      if (url.pathname.startsWith("/admin/prompts/") && request.method === "POST") {
        const session = await requireAdmin(request, env);
        if (session) return session;
        return moderate(request, url, env);
      }

      return html("未找到", pageShell("<h1>页面不存在</h1>", "未找到"), 404);
    } catch (error) {
      console.error(error);
      return html("出错了", pageShell("<h1>服务器出错</h1><p>请稍后再试。</p>", "出错了"), 500);
    }
  }
};

async function home(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM prompts WHERE status = 'approved' ORDER BY created_at DESC LIMIT 60"
  ).all<PromptRow>();

  const cards = results.length
    ? results.map(promptCard).join("")
    : `<p class="empty">还没有通过审核的提示词。</p>`;

  return html(
    SITE_NAME,
    pageShell(`
      <section class="topbar">
        <div>
          <h1>${SITE_NAME}</h1>
          <p>收集带参考图片的优质提示词。</p>
        </div>
        <a class="button" href="/submit">提交提示词</a>
      </section>
      <section class="grid">${cards}</section>
    `)
  );
}

function submitPage(message = ""): Response {
  return html(
    `提交 - ${SITE_NAME}`,
    pageShell(`
      <section class="panel narrow">
        <h1>提交提示词</h1>
        ${message}
        <form method="post" action="/submit" enctype="multipart/form-data">
          <label>标题 <input name="title" required maxlength="120"></label>
          <label>提示词 <textarea name="prompt_text" required rows="10" maxlength="8000"></textarea></label>
          <label>说明 <textarea name="description" rows="3" maxlength="1000"></textarea></label>
          <label>标签 <input name="tags" maxlength="200" placeholder="写作、图片、编程"></label>
          <label>图片
            <span class="paste-hint">选择或粘贴图片后，会自动转换为 JPG 85 并移除 EXIF 信息。</span>
            <input id="image-input" name="image" type="file" required accept="image/png,image/jpeg,image/webp">
          </label>
          <div id="image-preview" class="preview" hidden>
            <img alt="">
            <span></span>
          </div>
          <button type="submit">提交审核</button>
        </form>
      </section>
      <script src="/submit.js" defer></script>
    `)
  );
}

async function submitPrompt(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const title = field(form, "title", 120);
  const promptText = field(form, "prompt_text", 8000);
  const description = optionalField(form, "description", 1000);
  const tags = optionalField(form, "tags", 200);
  const imageFile = form.get("image");

  if (!title || !promptText || !isUploadedFile(imageFile)) {
    return submitPage(`<p class="notice error">标题、提示词和图片都必须填写。</p>`);
  }
  if (imageFile.type !== IMAGE_TYPE) {
    return submitPage(`<p class="notice error">图片会在浏览器中转换为 JPG 后上传，请重新选择或粘贴图片。</p>`);
  }
  if (imageFile.size < 1 || imageFile.size > MAX_IMAGE_BYTES) {
    return submitPage(`<p class="notice error">图片大小必须在 1 byte 到 5 MB 之间。</p>`);
  }

  const id = crypto.randomUUID();
  const imageKey = `prompts/${id}.jpg`;
  const now = new Date().toISOString();

  await env.BUCKET.put(imageKey, imageFile.stream(), {
    httpMetadata: { contentType: IMAGE_TYPE }
  });

  await env.DB.prepare(
    `INSERT INTO prompts
      (id, title, prompt_text, description, tags, image_key, image_type, image_size, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(id, title, promptText, description, tags, imageKey, IMAGE_TYPE, imageFile.size, now, now).run();

  return html(
    "已提交",
    pageShell(`
      <section class="panel narrow">
        <h1>已提交</h1>
        <p class="notice">你的提示词正在等待审核。</p>
        <a class="button" href="/">返回首页</a>
      </section>
    `)
  );
}

async function detail(url: URL, env: Env): Promise<Response> {
  const id = url.pathname.split("/").filter(Boolean)[1];
  const prompt = await env.DB.prepare("SELECT * FROM prompts WHERE id = ? AND status = 'approved'")
    .bind(id)
    .first<PromptRow>();
  if (!prompt) return html("未找到", pageShell("<h1>提示词不存在</h1>", "未找到"), 404);

  return html(
    `${prompt.title} - ${SITE_NAME}`,
    pageShell(`
      <article class="panel detail">
        <a href="/">返回</a>
        <img src="/images/${encodeURIComponent(prompt.id)}" alt="" loading="lazy" decoding="async">
        <h1>${escapeHtml(prompt.title)}</h1>
        ${prompt.tags ? `<p class="tags">${escapeHtml(prompt.tags)}</p>` : ""}
        ${prompt.description ? `<p>${escapeHtml(prompt.description)}</p>` : ""}
        <pre>${escapeHtml(prompt.prompt_text)}</pre>
      </article>
    `)
  );
}

async function image(url: URL, env: Env): Promise<Response> {
  const id = url.pathname.split("/").filter(Boolean)[1];
  const prompt = await env.DB.prepare("SELECT image_key, image_type FROM prompts WHERE id = ? AND status = 'approved'")
    .bind(id)
    .first<Pick<PromptRow, "image_key" | "image_type">>();
  if (!prompt) return new Response("Not found", { status: 404 });

  const object = await env.BUCKET.get(prompt.image_key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": prompt.image_type,
      "cache-control": "public, max-age=86400"
    }
  });
}

async function adminImage(url: URL, env: Env): Promise<Response> {
  const id = url.pathname.split("/").filter(Boolean)[2];
  const prompt = await env.DB.prepare("SELECT image_key, image_type FROM prompts WHERE id = ?")
    .bind(id)
    .first<Pick<PromptRow, "image_key" | "image_type">>();
  if (!prompt) return new Response("Not found", { status: 404 });

  const object = await env.BUCKET.get(prompt.image_key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": prompt.image_type,
      "cache-control": "private, max-age=60"
    }
  });
}

function adminLoginPage(message = ""): Response {
  return html(
    `管理员登录 - ${SITE_NAME}`,
    pageShell(`
      <section class="panel narrow">
        <h1>管理员登录</h1>
        ${message}
        <form method="post" action="/admin/login">
          <label>密码 <input name="password" type="password" required autocomplete="current-password"></label>
          <button type="submit">登录</button>
        </form>
      </section>
    `)
  );
}

async function adminLogin(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  if (!ok) return adminLoginPage(`<p class="notice error">密码不正确。</p>`);

  const token = randomToken();
  const tokenHash = await sha256(`${token}.${env.SESSION_SECRET}`);
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await env.DB.prepare("INSERT INTO admin_sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, tokenHash, now.toISOString(), expires.toISOString())
    .run();

  return redirect("/admin", {
    "set-cookie": `${COOKIE_NAME}=${id}.${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`
  });
}

async function adminLogout(request: Request, env: Env): Promise<Response> {
  const cookie = parseSessionCookie(request);
  if (cookie) await env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?").bind(cookie.id).run();
  return redirect("/admin/login", {
    "set-cookie": `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  });
}

async function adminDashboard(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM prompts ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC LIMIT 100"
  ).all<PromptRow>();

  return html(
    `管理后台 - ${SITE_NAME}`,
    pageShell(`
      <section class="topbar">
        <div>
          <h1>审核后台</h1>
          <p>最近 ${results.length} 条提交</p>
        </div>
        <form method="post" action="/admin/logout"><button type="submit">退出登录</button></form>
      </section>
      <section class="admin-list">
        ${results.length ? results.map(adminPrompt).join("") : `<p class="empty">还没有提交。</p>`}
      </section>
    `)
  );
}

async function moderate(request: Request, url: URL, env: Env): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];
  const action = parts[3];
  const now = new Date().toISOString();

  if (action === "approve" || action === "reject") {
    const status = action === "approve" ? "approved" : "rejected";
    await env.DB.prepare("UPDATE prompts SET status = ?, updated_at = ?, moderated_at = ? WHERE id = ?")
      .bind(status, now, now, id)
      .run();
    return redirect("/admin");
  }

  if (action === "delete") {
    const prompt = await env.DB.prepare("SELECT image_key FROM prompts WHERE id = ?").bind(id).first<Pick<PromptRow, "image_key">>();
    if (prompt) await env.BUCKET.delete(prompt.image_key);
    await env.DB.prepare("DELETE FROM prompts WHERE id = ?").bind(id).run();
    return redirect("/admin");
  }

  return html("请求无效", pageShell("<h1>未知操作</h1>", "请求无效"), 400);
}

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  const cookie = parseSessionCookie(request);
  if (!cookie) return redirect("/admin/login");

  const row = await env.DB.prepare("SELECT token_hash, expires_at FROM admin_sessions WHERE id = ?")
    .bind(cookie.id)
    .first<{ token_hash: string; expires_at: string }>();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return redirect("/admin/login");

  const tokenHash = await sha256(`${cookie.token}.${env.SESSION_SECRET}`);
  return timingSafeEqual(tokenHash, row.token_hash) ? null : redirect("/admin/login");
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

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith("sha256:")) {
    const expected = hash.slice("sha256:".length);
    const actual = await sha256(password);
    return timingSafeEqual(actual, expected);
  }
  return timingSafeEqual(password, hash);
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

function field(form: FormData, name: string, max: number): string {
  const value = String(form.get(name) || "").trim();
  return value.length <= max ? value : "";
}

function optionalField(form: FormData, name: string, max: number): string | null {
  const value = field(form, name, max);
  return value || null;
}

function isUploadedFile(value: unknown): value is File {
  return typeof value === "object" && value !== null && "stream" in value && "size" in value && "type" in value;
}

function promptCard(prompt: PromptRow): string {
  return `
    <a class="card" href="/p/${encodeURIComponent(prompt.id)}">
      <img src="/images/${encodeURIComponent(prompt.id)}" alt="" loading="lazy" decoding="async">
      <div>
        <h2>${escapeHtml(prompt.title)}</h2>
        ${prompt.tags ? `<p class="tags">${escapeHtml(prompt.tags)}</p>` : ""}
        <p>${escapeHtml(excerpt(prompt.description || prompt.prompt_text, 150))}</p>
      </div>
    </a>
  `;
}

function adminPrompt(prompt: PromptRow): string {
  return `
    <article class="panel admin-item">
      <img class="admin-thumb" src="/admin/images/${encodeURIComponent(prompt.id)}" alt="" loading="lazy" decoding="async">
      <div>
        <span class="status ${prompt.status}">${statusLabel(prompt.status)}</span>
        <h2>${escapeHtml(prompt.title)}</h2>
        ${prompt.tags ? `<p class="tags">${escapeHtml(prompt.tags)}</p>` : ""}
        ${prompt.description ? `<p>${escapeHtml(prompt.description)}</p>` : ""}
        <pre>${escapeHtml(prompt.prompt_text)}</pre>
      </div>
      <div class="actions">
        <form method="post" action="/admin/prompts/${encodeURIComponent(prompt.id)}/approve"><button type="submit">通过</button></form>
        <form method="post" action="/admin/prompts/${encodeURIComponent(prompt.id)}/reject"><button type="submit">拒绝</button></form>
        <form method="post" action="/admin/prompts/${encodeURIComponent(prompt.id)}/delete"><button class="danger" type="submit">删除</button></form>
      </div>
    </article>
  `;
}

function statusLabel(status: Status): string {
  if (status === "pending") return "待审核";
  if (status === "approved") return "已通过";
  return "已拒绝";
}

function pageShell(body: string, title = SITE_NAME): string {
  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(title)}</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <main>${body}</main>
        <footer><a href="/">prompt.io99.xyz</a> <a href="/admin">管理后台</a></footer>
      </body>
    </html>`;
}

function html(title: string, body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function excerpt(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
