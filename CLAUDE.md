# TailoredTunes — Autonomous Agent Workspace

## Mission
Build TailoredTunes.com — AI-powered custom music generation SaaS.
Users pay (Basic $9.99 / Pro $19.99 / Premium $29.99), describe their song, receive MP3+WAV via TemPolor AI.

## Stack
- **Frontend**: React 18 + Vite + Tailwind CSS → `frontend/` → Vercel
- **Backend**: Node.js 18 + Express + JWT → `backend/` → Railway
- **Database**: Supabase PostgreSQL + Storage → `supabase/migrations/`
- **Payments**: Stripe (checkout sessions + webhooks)
- **Music AI**: TemPolor API (async 2-5 min generation)

## How Agents Work Autonomously

### 1. Check Your Tickets
Your Paperclip dashboard: **http://127.0.0.1:3100**
- Find your assigned tickets (look for your agent name)
- Start with CRITICAL priority, then HIGH, then MEDIUM
- One ticket at a time — complete it fully before starting the next

### 2. For Each Ticket
1. Read the full ticket description carefully
2. Write the code (use your file ownership rules below)
3. Test it works (run the dev server, check for errors)
4. Commit: `git add [your files] && git commit -m "TAI-XX: description"`
5. Report completion in the Paperclip issue (add a comment)

### 3. File Ownership — NEVER edit files outside your area
| Agent              | Owns                                           |
|--------------------|------------------------------------------------|
| Frontend Engineer  | `frontend/src/**`, `frontend/vite.config.js`, `frontend/tailwind.config.js` |
| Backend Engineer   | `backend/src/routes/**`, `backend/src/middleware/**`, `backend/src/app.js`, `backend/server.js` |
| Database Engineer  | `supabase/migrations/**`, `supabase/seed/**`   |
| Integration Eng.   | `backend/src/integrations/**`, `backend/src/webhooks/**` |
| DevOps Engineer    | `vercel.json`, `railway.toml`, `.github/**`, `Procfile` |
| QA Engineer        | `**/*.test.js`, `frontend/tests/**`, `e2e/**`  |
| Security Auditor   | Read-only reviewer — file bugs, don't edit     |

### 4. Environment Variables
**Never hardcode secrets.** All config via `process.env.*` or `import.meta.env.*`
- Backend `.env` template: see `WEB_MANAGER_PACKAGE/02_ENVIRONMENT_VARIABLES.md`
- Frontend `.env.local` template: see `WEB_MANAGER_PACKAGE/04_FRONTEND_DEPLOYMENT.md`

### 5. API Contract
All frontend API calls → `import.meta.env.VITE_API_URL` (backend Railway URL)
All backend routes → prefix `/api/`
Auth: `Authorization: Bearer <jwt>` header on protected routes
Error format: `{ error: "message", code: "CODE" }`

### 6. Dev Servers
```bash
# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 5173)
cd frontend && npm run dev
```

### 7. Quality Gates
- No ticket is done until it works end-to-end
- Backend routes: test with curl before marking complete
- Frontend components: visible in browser before marking complete
- Webhooks: tested with Stripe CLI or TemPolor test event

## Reference Docs
- Full deployment guide: `WEB_MANAGER_PACKAGE/01_DEPLOYMENT_INSTRUCTIONS.md`
- All env vars: `WEB_MANAGER_PACKAGE/02_ENVIRONMENT_VARIABLES.md`
- Database schema: `WEB_MANAGER_PACKAGE/03_DATABASE_SETUP.md`
- Testing checklist: `WEB_MANAGER_PACKAGE/06_VERIFICATION_TESTING.md`
- Troubleshooting: `WEB_MANAGER_PACKAGE/07_TROUBLESHOOTING.md`
