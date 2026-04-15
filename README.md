# Sparkle.codes

The personal blog and product lab of Xavier Pax (xpx), focused on applied AI, workflow systems, and technical writing.

## 🚀 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Monorepo**: Turborepo + pnpm
- **Content**: Obsidian (Markdown/MDX) + content-collections
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Neon Postgres + Drizzle ORM
- **Deployment**: Docker + 1Panel (Reverse Proxy)

## 🛠 Development

### Setup
```bash
pnpm install
```

### Sync Content from Obsidian
Sync your notes from your local Obsidian vault based on the configuration in `.env.local`:
```bash
pnpm run sync
```

### Start Development Server
```bash
pnpm run dev
```

## 🚢 Deployment (VPS - 1Panel)

This project is optimized for self-hosting on a VPS using Docker and 1Panel.

### 1. VPS Environment Setup
Connect to your VPS and clone the repository:
```bash
# Recommended storage path
mkdir -p /opt/web
cd /opt/web
git clone https://github.com/xiepixie/sparkle.git sparkle-codes
cd sparkle-codes
```

### 2. Environment Configuration
Copy the production environment template and fill in your secrets:
```bash
cp .env.production.example .env.production
# Edit your secrets (Neon DB, R2, Revalidation, etc.)
nano .env.production
```

#### Cache Invalidation (`REVALIDATE_SECRET`)

The `REVALIDATE_SECRET` environment variable secures the on-demand cache revalidation endpoint (`/api/revalidate`). When Sentinel syncs content from Obsidian to the database, it calls this endpoint to purge the Next.js cache so that new or updated posts appear immediately.

| Variable | Required | Description |
| :--- | :--- | :--- |
| `REVALIDATE_SECRET` | Yes | Shared secret between Sentinel and the web app. Must match in both environments. |
| `REVALIDATE_URL` | Local only | Comma-separated revalidation endpoint URLs (e.g., `http://localhost:3000/api/revalidate,https://sparkle.codes/api/revalidate`). Used by Sentinel to trigger cache purges after sync. |

> **Important:** The `REVALIDATE_SECRET` value in `.env.production` must be identical to the one configured for Sentinel. If they do not match, revalidation requests will be rejected with a `401` response.

### 3. Deploy in 1Panel
1.  **Create Compose Orchestration**:
    - Go to `1Panel -> Container -> Orchestration -> Create Compose`.
    - Select the path `/opt/web/sparkle-codes`.
    - 1Panel will automatically detect the `docker-compose.yml` and build the image.
2.  **Verify Service**:
    - Check the logs to ensure the Next.js standalone server is listening on `0.0.0.0:3000`.

### 4. Reverse Proxy & HTTPS
1.  **Create Website**:
    - Go to `1Panel -> Website -> Create Website`.
    - Type: **Reverse Proxy**.
    - Primary Domain: `sparkle.codes`.
    - Proxy Address: `http://127.0.0.1:3000`.
2.  **Enable SSL**:
    - Under Website settings, enable HTTPS using an ACME certificate (Let's Encrypt).
    - Enable HTTP to HTTPS redirection.

## 📁 Repository Structure

- `apps/web`: Main Next.js application.
- `apps/docs`: Documentation (Fumadocs).
- `packages/database`: Drizzle schema and queries.
- `packages/ui`: Shared UI primitives.
- `scripts/`: Maintenance scripts (Obsidian sync, R2 upload).

## 📄 License
MIT
