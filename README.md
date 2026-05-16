# PromptVault

PromptVault is a single Cloudflare Worker app for collecting prompts with images. Public submissions are anonymous and stay hidden until an admin approves them.

Production domain: `prompt.io99.xyz`

## Setup

Install dependencies:

```sh
npm install
```

Create Cloudflare resources:

```sh
npx wrangler d1 create promptvault-db
npx wrangler r2 bucket create promptvault-images
```

Copy the D1 `database_id` returned by Wrangler into `wrangler.toml`.

Set admin secrets:

```sh
node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_ADMIN_PASSWORD')).then(d=>console.log('sha256:'+[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')))"
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

Use the printed `sha256:...` value for `ADMIN_PASSWORD_HASH`. Use a long random string for `SESSION_SECRET`.

Apply the database migration:

```sh
npm run db:migrate:remote
```

Deploy:

```sh
npm run deploy
```

## Local Development

For local development, create `.dev.vars`:

```ini
ADMIN_PASSWORD_HASH=sha256:REPLACE_WITH_LOCAL_HASH
SESSION_SECRET=replace-with-local-random-secret
```

Then run:

```sh
npm run db:migrate:local
npm run dev
```

## Routes

- `/` approved prompt gallery
- `/submit` anonymous submission form
- `/p/:id` approved prompt detail
- `/admin/login` admin login
- `/admin` moderation dashboard

## Checks

```sh
npm run typecheck
```
