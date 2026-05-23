# HRIS Internal

Internal HRIS/HRD Dashboard built with Next.js App Router, TypeScript, Supabase Auth, PostgreSQL, and Drizzle ORM.

## What This App Covers

- Auth, user roles, employee login links, and division-scoped access.
- Employee profiling, histories, branches, divisions, positions, grades, work schedules, and shift masters.
- TEAMWORK performance point catalog, daily activities, approval workflow, and monthly performance.
- Input persentase performa bulanan managerial (KABAG/SPV/MANAGERIAL) dari menu `/performance` oleh HRD/SUPER_ADMIN.
- Manual attendance input on `/absensi` for payroll fulltime/discipline eligibility.
- ADMS/fingerprint ingest APIs on `/api/integrations/adms/attendance`, `/api/integrations/adms/taps`, and `/api/integrations/adms/employees` (server-to-server).
- Ticketing for leave/sick/permission, SPV/KABAG scoped review queue, HRD/SUPER_ADMIN final approval, and leave quota handling.
- Employee review, incident log, and training evaluation.
- Payroll period 26-25, snapshots, preview, finalization, paid/locked lifecycle, structured adjustments, overtime, payslip PDF, XLSX export, and finance summary.
- Personal self-service pages for linked employee accounts.

## Tech Stack

- Next.js `16.2.4` App Router
- React `19.2.4`
- TypeScript
- Tailwind CSS v4
- shadcn/ui + Radix UI
- Supabase Auth via `@supabase/ssr`
- PostgreSQL / Supabase
- Drizzle ORM + Drizzle Kit
- Zod + React Hook Form
- TanStack Table
- Recharts
- Vitest

## Local Setup

Install dependencies:

```bash
pnpm install
```

Create `.env.local` with the required environment values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
ADMS_INGEST_TOKEN=
```

Run the development server:

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Main Commands

```bash
pnpm lint
pnpm vitest run
pnpm exec tsc --noEmit
pnpm build
```

## Architecture

The main code flow is:

```text
Page / Client Component
-> Server Action / Route Handler
-> Zod validation
-> Supabase session + role/scope check
-> Drizzle query/transaction
-> server rule engine/helper
-> PostgreSQL
```

Important folders:

- `src/app/(dashboard)/*` - authenticated routes and route handlers.
- `src/components/*` - reusable UI, layout, tables, and shadcn/ui wrappers.
- `src/lib/auth/session.ts` - server-side session and role helpers.
- `src/lib/db/schema/*` - Drizzle schema source of truth.
- `src/lib/validations/*` - Zod contracts.
- `src/server/actions/*` - business query/mutation boundary.
- `src/server/*-engine/*` - testable business rules and helper engines.
- `supabase/migrations/*` - database migrations.

## Documentation Map

- `AGENTS.md` - root instructions for coding agents.
- `CLAUDE.md` - companion AI instructions.
- `agent-startup-prompt.md` - reusable startup prompt.
- `HANDOVER.md` - current handover and operational status.
- `references/business-rules.md` - business rules that must be preserved.
- `references/implementation-playbook.md` - implementation workflow.
- `docs/onboarding-curriculum.md` - practical onboarding guide.
- `docs/codebase-curriculum/` - module-by-module codebase guide.
- `next-update.md` - known payroll/master-data follow-up checklist.

## Security Rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser/client code.
- Do not calculate payroll or sensitive bonus/leave/adjustment logic in client components.
- Use server actions, route handlers, rule engines, transactions, and audit logs for sensitive workflows.
- Keep payroll finalization idempotent.
- Preserve snapshots for payroll and master point transactions.
