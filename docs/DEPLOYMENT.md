# Deployment options for MyCRM

_Written 2026-11-19 so the options can be re-evaluated later. Nothing here has been set up yet._

## Why not plain Netlify (or Vercel)

Netlify runs a Next.js app's server code as short-lived serverless functions. LLM Wiki CRM is built as a single long-running server with a local disk, so these parts break:

| The app needs | What it's used for | On Netlify |
|---|---|---|
| A writable, persistent disk (`CRM_DATA_DIR`) | Every account, contact, deal, user and prompt is a markdown file | Function file systems are temporary, so writes are lost |
| The `git` program | Commit per write, History panel, diffs (`lib/git.ts`) | Not available inside functions |
| A process that stays running | `incoming/` watcher and serial ingest queue (`lib/ingest.ts`, started by `instrumentation.ts`) | Functions stop after each request |
| Ollama on `localhost:11434` | LLM extraction (`lib/llm.ts`) | Can't reach your Mac |
| One process with memory | Single-use login tokens, OTP attempt counters, rate limits, job list (`lib/auth.ts`, `lib/ingest.ts`) | Each function instance has its own memory |

Deploying there would also mean uploading `MyCRM/`, which holds real participant data, as part of the build.

---

## Things every option needs for production

These apply whichever option you choose:

1. **Run a production build**, not the dev server:
   ```bash
   npm run build && npm start
   ```
   With `NODE_ENV=production`:
   - Session cookies get the `Secure` flag, so the site **must** be served over HTTPS.
   - Brevo becomes mandatory. In dev, login codes fall back to the server console; in production a missing Brevo config is an error.
2. **Set `APP_URL` to the public HTTPS address**, for example `https://crm.example.com`. Magic links in login emails are built from it.
3. **Run a single instance only.** The job queue, rate limits and used-token list are in memory, so a second instance would break single-use login links and could process files twice.
4. **Rate limiting reads `x-forwarded-for`** (`app/api/auth/request/route.ts`). Make sure the proxy or tunnel in front sets it to the real client address and that clients can't spoof it. Otherwise the per-IP limit can be bypassed; the per-email limit still applies.
5. **Back up the wiki.** `MyCRM/` is its own git repo with no remote yet. Add a **private** remote, for example a private GitHub repo, and push regularly:
   ```bash
   git -C MyCRM remote add origin git@github.com:<you>/mycrm-data.git
   ```
6. **Secrets** (`AUTH_SECRET`, `BREVO_API_KEY`) go in the host's secret store or `.env.local`, never in git. Generate a fresh `AUTH_SECRET` for each environment; changing it signs everyone out.
7. **Upload size:** `/api/ingest` accepts files up to 25 MB, so the proxy's request-body limit must allow that.

---

## Option 1: Expose your Mac through a secure tunnel (recommended to start)

Keep MyCRM **and** Ollama running on your Mac, and publish the app over HTTPS with a tunnel. The app needs no code changes.

**How it works:** the tunnel client on your Mac makes an outbound connection to the tunnel provider, which serves an HTTPS address and forwards requests to `localhost:3000`. No router ports are opened.

**Choices:**
- **Cloudflare Tunnel** (`cloudflared`)
  - A quick tunnel gives a random `*.trycloudflare.com` address, fine for a test:
    ```bash
    cloudflared tunnel --url http://localhost:3000
    ```
  - A named tunnel gives a stable address on your own domain (for example `crm.gndlf.io`) when the domain is on Cloudflare. Cloudflare Access can also put an extra login in front of the app.
- **Tailscale Funnel** serves a stable `https://<machine>.<tailnet>.ts.net` address:
  ```bash
  tailscale funnel 3000
  ```
  If only your own devices need access, plain Tailscale without Funnel keeps it entirely private.

**Steps:**
1. Set `APP_URL` in `.env.local` to the tunnel's address.
2. Run `npm run build && npm start`, not `npm run dev`.
3. Keep it running across reboots and crashes with `launchd`, or a process manager such as `pm2`, for both the app and the tunnel.
4. Stop the Mac sleeping while it should be reachable, for example with System Settings → Energy, or `caffeinate`.
5. Add a private remote for `MyCRM/`, as in item 5 above.

**Pros:** no code changes, the data never leaves your Mac, Ollama keeps working, and it's free or cheap. You can set it up in under an hour.
**Cons:** it's only reachable while your Mac is on, awake and online, and your home connection's upload speed limits it.

**Effort:** small.

---

## Option 2: A server with a persistent disk

Run the same app on a host that keeps a long-running process and a mounted disk, such as Fly.io (with a volume), Railway, Render (with a persistent disk), or any VPS.

**What has to change:**
1. **Add a `Dockerfile`.** It needs a Node version that matches local, `git` installed in the image, `npm ci && npm run build`, and `npm start`.
2. **Mount a persistent volume** and point `CRM_DATA_DIR` at it. Copy the current `MyCRM/` into it once, or clone it from the private remote.
3. **Pick an LLM, since Ollama on your Mac isn't reachable:**
   - **A hosted API, for example Claude (recommended).** Only `runExtraction()` in `lib/llm.ts` talks to Ollama. Swap it for an API call that returns the same `Extraction` JSON; the rest of the pipeline is unchanged. The extraction prompt and JSON schema already exist. This adds a per-document API cost, and the documents are sent to that provider.
   - **Ollama on a GPU server.** The current `qwen3.8` 27B model needs about 17 GB of GPU memory, which makes the host much more expensive.
   - **Ollama on your Mac, reached privately** through a Tailscale network between the server and the Mac. This works, but ingestion stops whenever the Mac is offline.
4. Set all environment variables from `.env.example` as host secrets, with `APP_URL` set to the public address.
5. Pin the deployment to **one instance** (see item 3 above).

**Pros:** always online, independent of your Mac, with a proper domain and HTTPS.
**Cons:** a monthly hosting cost plus LLM costs, data stored at a provider, and you have to maintain the server and backups.

**Effort:** medium, roughly a day: Dockerfile, LLM provider swap, deploy and data migration.

---

## Option 3: Rebuild for Netlify (serverless)

Change the architecture so that nothing depends on a local disk or a long-running process.

**What has to change:**
1. **Storage:** replace the file-and-git store (`lib/store.ts`, `lib/git.ts`, `lib/users.ts`) with either:
   - a **GitHub repo through its API**, where every write is a commit and history comes from the API; or
   - **Netlify Blobs** or a database. Git history and the per-field audit trail would then need to be rebuilt in another way.
2. **Concurrency:** today one in-process lock serialises writes. With many function instances this needs optimistic concurrency, such as compare-and-set on file SHA or blob ETags, so human edits and LLM merges can't overwrite each other. Field locking depends on this.
3. **Ingestion:** replace the folder watcher with upload-only ingestion, which queues a **background function** to extract and merge. Dropping files into a folder is no longer possible, except through a separate sync job.
4. **LLM:** a hosted API, as in Option 2.
5. **Auth state:** move used login tokens, OTP attempts and rate limits from memory into Blobs or a key-value store.
6. **Bi-directional sync** (editing the markdown in an editor) only remains possible with the GitHub-repo storage choice, through `git pull`/`git push` of the data repo.

**Pros:** the site is serverless, there's no server to maintain, and it scales to zero.
**Cons:** the biggest change. Locking and history get harder, and LLM API costs apply.

**Effort:** large, several days plus testing.

---

## Comparison

| | Option 1: tunnel | Option 2: server + disk | Option 3: Netlify rebuild |
|---|---|---|---|
| Code changes | None | Dockerfile + LLM swap | Storage, queue, auth state, LLM |
| Always online | Only while the Mac is on | Yes | Yes |
| Where the data lives | Your Mac | Hosting provider | GitHub, or Netlify plus the LLM provider |
| LLM | Local Ollama | Hosted API (or a GPU box) | Hosted API |
| Running cost | About zero | Hosting + LLM | Netlify + LLM |
| Effort | Under an hour | About a day | Several days |

**Suggested path:** start with **Option 1** to use MyCRM remotely right away. Move to **Option 2** if it needs to be online when your Mac isn't. Choose **Option 3** only if serverless hosting is a firm requirement.
