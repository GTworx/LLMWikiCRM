# LLM Wiki CRM

An AI-first CRM whose database is a **git-backed markdown wiki**. Drop meeting transcripts, emails, contracts or purchase orders into `crm-data/incoming/`. A local LLM (Ollama) extracts accounts, contacts, deals, purchases and action items, and writes them as markdown pages with YAML frontmatter. A Next.js dashboard sits on top with a Kanban pipeline, a Customer 360 view, an action-item hub, search and inline editing.

See [`LLM Wiki CRM.md`](./LLM%20Wiki%20CRM.md) for the product spec.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

Required in `.env.local`:

| Variable | What |
|---|---|
| `BREVO_API_KEY` | Brevo transactional email API key (login codes) |
| `BREVO_SENDER_EMAIL` | A sender or domain **verified in Brevo** |
| `ADMIN_EMAIL` | Seeded as the first admin on startup |
| `AUTH_SECRET` | 32+ random characters (`openssl rand -hex 32`) |
| `OLLAMA_MODEL` | Defaults to `qwen3.8:latest`; Ollama must be running |

Optional: `OWN_COMPANY_DOMAINS` (so your reps aren't created as customer contacts), `COMPANY_NAME`, `DEFAULT_CURRENCY`, `CRM_DATA_DIR`, `APP_URL`.

In development, if Brevo isn't configured yet, the login code and link are printed to the server console.

## How it works

```
crm-data/                      ← its own git repo; every write is a commit
├── .system/users/*.md         ← users + roles (admin | crm_editor | crm_viewer)
├── .system/prompts/extraction.md  ← editable LLM prompt (Admin → Extraction prompt)
├── incoming/<customer>/       ← drop files here (folder name = account hint)
├── .archive/{processed,failed}/  ← ingested originals (not committed)
└── accounts/<slug>/
    ├── _index.md              ← account overview + frontmatter
    ├── contacts/  deals/  interactions/  purchases/
```

- **Ingestion**: a watcher plus a UI upload feed a serial queue. Each file is turned into text (`.eml .pdf .docx .vtt .srt .txt .md .csv .html`), then sent to Ollama with a JSON schema. Entity resolution uses the folder hint, then the LLM's match, then email domain, then name. Results are merged into the wiki and committed as `LLM Ingest`.
- **Human edits win**: editing a field in the UI, or dragging a deal on the Kanban, adds that field to `locked_fields`. Ingestion never overwrites locked fields and reports what it skipped. Editing a page's text locks it against LLM summary rewrites. Use the 🔓/🔒 icons to toggle.
- **Bi-directional**: you can also edit the markdown directly (VS Code, Obsidian, `git pull`); the UI picks up changes immediately. Each record's History panel shows git commits and diffs.
- **Auth**: passwordless. You enter your email and receive a 6-digit code plus a magic link via Brevo. Both are a signed, 10-minute, single-use token. Sessions are HTTP-only cookies and are re-checked against the user file on every request. `assigned_accounts` on a user limits which accounts they can see (empty = all).

## Importing a bootcamp cohort

`scripts/import-course.mjs` imports a course repo's `reports/data.json` and `reports/*.md` as one account. Each participant becomes a contact, and each weekly session plus each report becomes a timeline entry. Ollama then writes a profile for each participant.

```bash
node scripts/import-course.mjs ./MyCRM ../AgenticAISooezySezon2 --name="Agentic AI Sooezy – Season 3" --rep=you@company.com
```

`--phase=a` runs only the exact import, and `--phase=b` runs only the LLM profiles. `--force` regenerates profiles that were already written. The script refuses to run if the account already exists.

## Limitations

- Single-process: the job queue, rate limits and used-token list live in memory. Run one instance.
- Audio/video must be transcribed first (`.vtt`/`.srt`/`.txt`). Email attachments are listed but not parsed.
- Search is keyword-based (no vector index yet).
