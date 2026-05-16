import type { PromptRow, Status } from "./types";

export const SITE_NAME = "PromptVault";

export function promptCard(prompt: PromptRow): string {
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

export function adminPrompt(prompt: PromptRow): string {
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

export function pageShell(body: string, title = SITE_NAME): string {
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

export function html(title: string, body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

export function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusLabel(status: Status): string {
  if (status === "pending") return "待审核";
  if (status === "approved") return "已通过";
  return "已拒绝";
}

function excerpt(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
