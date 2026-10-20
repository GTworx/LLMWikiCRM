Here is an analysis of your draft, key architectural considerations, authentication recommendations, and a restructured Product Requirements Document (PRD) markdown file.

### **Critical Analysis: What’s Missing for a True CRM Product**

Your raw notes cover the core ingestion loop and wiki layout, but standard CRM functionality requires addressing several operational layers:

> 1. **Pipeline & Deal Tracking (Funnel Stages):**  
   * A CRM requires visual pipelines (e.g., Kanban boards: *New Lead $\rightarrow$ Discovery $\rightarrow$ Proposal $\rightarrow$ Negotiation $\rightarrow$ Won/Lost*). A wiki alone represents hierarchy, not deal velocity or stage conversion metrics.  
> 2. **Deterministic Metadata vs. Freeform LLM Markdown:**  
   * Pure Markdown is difficult to filter, aggregate, or sort (e.g., "show all ARR \> \$50k closing this month"). You need a structured header schema (YAML Frontmatter) on every Markdown page so a fast search/query engine can index attributes without running full-text LLM extraction every render.  
> 3. **Bi-directional Sync Conflict Resolution:**  
   * If a human edits a field in the UI (e.g., status changed to Negotiation) while the LLM parses an incoming email and attempts to rewrite the same page, you risk race conditions or LLM hallucinations overwriting verified human data. Human manual edits must take precedence via field-level locking or append-only audit trails.  
> 4. **Activity Timeline & Communication Threading:**  
   * Interactions (emails, meeting notes, call summaries) should not just be static child pages; they need a chronological activity feed with sentiment, actionable follow-ups, and auto-generated "Next Best Action" alerts.  
> 5. **Task Management & Reminders:**  
   * Automatic extraction of action items from incoming conversations (e.g., *"Follow up with pricing sheet by Friday"*) turned into actionable tasks with assignees and due dates.

### **Authentication & User Management Recommendations**

Storing users as Markdown pages while avoiding a relational database is feasible, but email verification and session security require a stateless mechanism:

* **Magic Link / Email OTP Flow:**  
  * **Option A: Managed Passwordless Auth (Recommended):** Use a service like **Supabase Auth** or **Stytch**. They handle rate-limiting, secure token generation, and email dispatch out of the box, mapping the authenticated email to your user wiki page.  
  * **Option B: Self-Contained Cryptographic Tokens:** If you want zero external DB:  
    1. User submits their email in the UI.  
    2. Server verifies that users/{sanitized\_email}.md exists and checks the role attribute in its frontmatter.  
    3. Server generates a signed, encrypted JWT or HMAC token with a short expiration (10–15 minutes) containing the user ID and timestamp, then emails a magic link (/auth/verify?token=...) or 6-digit OTP hash.  
    4. Upon verification, issues an HTTP-only secure session cookie.  
* **Separation of Permissions:**  
  * Keep user profile files outside the public/agent search scope (e.g., in a protected .system/users/ directory).  
  * Use frontmatter to define RBAC:  
    YAML  
    \---  
    email: "alex@company.com"  
    role: "crm\_editor" \# admin | crm\_editor | crm\_viewer  
    status: "active"  
    assigned\_accounts: \["acme-corp", "globex"\]  
    \---

### **Clarifying Questions & Open Areas**

> 1. **File Watcher & Ingestion Mechanism:** How are files added to the incoming/ folder (manual drop, automated email IMAP sync, cloud storage webhook, or API upload)?  
> 2. **Underlying Wiki Engine:** Are you targeting a specific headless markdown/wiki format (e.g., raw git-backed Markdown repo, Obsidian-like structure, or an API-driven engine like Outline/Wiki.js)?  
> 3. **LLM Execution Timing:** Should extraction occur strictly in real-time per file arrival (event-driven), or as a batched reconciliation job to avoid rate limits and aggregate multi-file context?

### **Restructured Product Specification (LLM\_WIKI\_CRM\_SPEC.md)**

Markdown  
\# Product Requirements Document: LLM Wiki CRM (BrainCRM)

\#\# 1\. Executive Summary  
**\*\*LLM Wiki CRM\*\*** is an AI-first Customer Relationship Management system powered by an autonomous LLM extraction engine and a human-readable, file-based Wiki backend. 

Unstructured client interactions (meeting transcripts, email threads, contracts, purchase orders) dropped into an ingestion directory are automatically parsed, linked, and organized into structured Markdown records. A modern web dashboard sits on top of this wiki, offering visual pipelines, search, and direct editing capabilities with bidirectional synchronization.

\---

\#\# 2\. System Architecture & Ingestion Pipeline

\[ Incoming Documents / Conversations \]  
│  
▼  
\[ Ingestion Queue & Worker \]  
│  
▼  
\[ LLM Extraction Engine \]  
(Entity Resolution & Frontmatter Gen)  
│  
▼  
\[ LLM Wiki Core (Markdown Store) \] ◄── Bi-directional ──► \[ Dashboard UI \]  
│ (Kanban/Table/Feeds)  
▼  
\[ Full-Text / Vector Index \]

\#\#\# Ingestion Flow  
1\. \*\*Watcher:\*\* Monitors \`/incoming/{customer\_folder\_or\_batch}\` for PDFs, \`.txt\`, audio/video transcripts, and email files.  
2\. \*\*Entity Resolution:\*\* The LLM inspects content against existing wiki records to match existing accounts or initialize new leads/accounts.  
3\. \*\*Structured Write:\*\* Generates or appends Markdown files using standardized \*\*YAML Frontmatter\*\* schemas.

\---

\#\# 3\. Data Model & Wiki Hierarchy

Every customer entity is represented as a structured directory containing a root overview and specialized child pages.

\`\`\`text  
/crm-data/  
├── .system/  
│   └── users/                      \# Isolated auth & role definitions  
│       └── user\_jane\_doe.md  
├── accounts/  
│   └── acme-corp/  
│       ├── \_index.md               \# Main Customer Overview & Rollup  
│       ├── contacts/  
│       │   └── john\_doe.md         \# Role, influence, contact history  
│       ├── deals/  
│       │   └── q4-enterprise-lic.md \# Pipeline stage, value, close date  
│       ├── interactions/  
│       │   └── 2026-10-20-call.md  \# Raw transcript \+ LLM action items  
│       └── purchases/  
│           └── po-99214.md         \# Invoices, licenses, terms

### **Document Schema Standards (YAML Frontmatter Example)**

Each page uses machine-parseable headers to allow fast filtering without LLM evaluation:

YAML  
\---  
id: "cust\_acme\_01"  
name: "Acme Corporation"  
type: "customer" \# lead | prospect | customer | churned  
tier: "enterprise"  
assigned\_rep: "jane@company.com"  
arr: 75000  
currency: "USD"  
pipeline\_stage: "negotiation"  
tags: \["b2b", "saas", "emea"\]  
last\_activity: "2026-10-20T14:30:00Z"  
locked\_fields: \["arr", "tier"\] \# Protected from automated LLM overwrites  
\---

\# Acme Corporation

\#\# Executive Summary  
Acme is currently evaluating our enterprise tier for a team of 250 engineers.

\#\# Open Action Items  
\- \[ \] Send updated security compliance checklist by Friday.

## **4\. Frontend Dashboard & Features**

> 1. **Kanban Pipeline:** Visual drag-and-drop board organized by pipeline\_stage. Dragging a card writes back to the deal’s frontmatter.  
> 2. **Unified Customer 360:** Displays metadata, key stakeholders, linked deals, and a unified timeline of interactions.  
> 3. **Action Item Hub:** Aggregated list of open tasks extracted by the LLM from incoming meetings and emails.  
> 4. **Field Editing & Sync Safety:**  
   * Field edits from the UI immediately update the Markdown frontmatter.  
   * locked\_fields array prevents LLM ingestion cycles from reverting human adjustments.

## **5\. Authentication & Access Control**

### **Passwordless Authentication Flow**

* **No Credential Database:** System avoids persistent password hashes.  
* **Storage:** Users are stored in protected wiki files at /.system/users/{user\_id}.md.  
* **Login Flow:**  
  1. User enters their work email address.  
  2. The server verifies the file exists under /.system/users/ and reads the assigned role.  
  3. A short-lived (10-minute) cryptographic Magic Link or 6-digit OTP is generated and emailed.  
  4. Once validated, an encrypted HTTP-only session cookie is set.

### **Role-Based Access Control (RBAC)**

* **Admin:** Full access to customer records, system configuration, user definitions, and prompt templates.  
* **CRM Editor (Read/Write):** Full read/write access to customer, lead, deal, and interaction pages.  
* **CRM Viewer (Read-Only):** Read-only access to customer data; cannot trigger manual edits or edit frontmatter.

\---

What underlying wiki format or repository storage (e.g., local Git repository, cloud bucket, or a specific headless wiki tool) are you planning to use for the Markdown files?  
