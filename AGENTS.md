# AGENTS.md - HRIS Internal Project

Use this file as the root instruction for Codex or any coding agent working in this repository.

## Project Identity

This is an internal HRIS/HRD Dashboard built with Next.js App Router, TypeScript, Drizzle ORM, Supabase Auth, and PostgreSQL. The codebase currently covers employee profiling, placement/mutation helpers, master data, role access, performance points, manual and ADMS/fingerprint attendance, employee review, ticketing for leave/sick/permission, ticket approval queue, training evaluation, overtime, payroll lifecycle, finance summary, and exports (employee/payroll XLSX, payroll rekap XLSX, payslip PDF, and bulk slips PDF).

## Required Reading

Before modifying code, read:

1. `references/business-rules.md`
2. `references/implementation-playbook.md`
3. `references/tech-stack.md`
4. `docs/codebase-curriculum/00-overview.md`
5. `docs/codebase-curriculum/01-project-structure.md`
6. `references/project-concept-3-phase.md` when architecture or roadmap context is needed

For restart/context transfer, also read `HANDOVER.md`.

## Current Code Flow

The actual implementation flow is:

```text
Next.js page/client component
-> server action or route handler
-> Zod validation
-> Supabase session + server-side role/scope check
-> Drizzle query/transaction
-> server rule engine/helper
-> PostgreSQL tables
-> revalidatePath/response to UI
```

Primary boundaries:

- UI/routes: `src/app/(dashboard)/*`
- reusable UI/layout: `src/components/*`
- auth/session: `src/proxy.ts`, `src/lib/auth/session.ts`
- permissions: `src/lib/permissions/index.ts`
- validations: `src/lib/validations/*`
- actions: `src/server/actions/*`
- engines: `src/server/point-engine/*`, `src/server/attendance-engine/*`, `src/server/payroll-engine/*`, `src/server/ticketing-engine/*`, `src/server/review-engine/*`
- database schema: `src/lib/db/schema/*`
- migrations: `supabase/migrations/*`

## Non-Negotiable Rules

- Do not calculate payroll, bonus, leave quota consumption, SP penalty, or adjustment in the browser.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client code. Use `src/lib/supabase/admin.ts` only from server-only contexts.
- Use server actions, route handlers, PostgreSQL functions, or server-side services for sensitive mutations.
- Use snapshots for payroll results and master point transactions.
- Use audit logs for approval, override, payroll lifecycle, and adjustment where the schema supports it.
- Keep payroll finalization idempotent.
- Use server-side role/scope checks even when UI hides a feature.
- Respect `user_roles.employee_id` for employee-linked access and `user_role_divisions` for SPV/KABAG division scope.
- Do not change business rules silently. If code differs from the business document, call it out as an implementation gap or request confirmation.

## Tech Stack in This Repo

- Next.js `16.2.4` App Router
- React `19.2.4`
- TypeScript
- Tailwind CSS v4
- shadcn/ui + Radix UI
- Supabase Auth via `@supabase/ssr`
- Supabase/PostgreSQL
- Drizzle ORM + Drizzle Kit migrations
- Zod + React Hook Form
- TanStack Table
- Recharts
- Vitest
- PDF/XLSX export through route handlers

## Implemented Product Areas

- Auth and user role management: `/login`, `/users`
- Operational dashboard: `/dashboard`
- Employee profiling: `/employees`, `/employees/[id]`
- Master data: `/master/branches`, `/master/divisions`, `/master/positions`, `/master/employee-groups`, `/master/grades`, `/master/work-schedules`, `/master/catalogpoin`
- Performance: `/performance`, `/performance/training`
- SPV/KABAG queue helpers and personal TW performance helpers in `src/server/actions/performance.ts`
- Ticketing: `/tickets`
- Ticket approval queue: `/ticketingapproval`
- Manual and ADMS/fingerprint attendance: `/absensi`, `POST /api/integrations/adms/attendance`, `POST /api/integrations/adms/taps`, `GET /api/integrations/adms/employees`
- Overtime request and approval: `/overtime`
- Review and incident: `/reviews`
- History audit: `/history`
- Scheduling views: `/schedule`, `/scheduler`
- Employee placement/mutation: `/positioning` (`/divisi` redirects here)
- Payroll and finance: `/payroll`, `/payroll/[periodId]/[employeeId]`, PDF payslip, bulk slips PDF, XLSX export/rekap, `/finance`

## Preferred Implementation Flow

1. Understand the relevant business rule.
2. Identify phase, module, role, data source, output, tables, and audit/security impact.
3. Update schema/migration if the data model is missing.
4. Add or update Zod validation.
5. Implement server service/rule engine logic.
6. Expose through server action or route handler.
7. Build or update UI.
8. Add audit log when the action changes approval, override, payroll, adjustment, or important master data.
9. Add or update focused tests for rule engines/helpers.
10. Update project documentation whenever the code change modifies product flow, business flow, module boundaries, schema, or operational behavior.
11. Run validation commands that fit the change.
12. Summarize changes and any business-rule gap.

## Validation Commands

Use these when relevant:

```bash
pnpm lint
pnpm vitest run
pnpm exec tsc --noEmit
pnpm build
```

## Known Gaps to Preserve in Notes

- RLS policies are not represented clearly in repo migrations; server-side checks are the current visible guard.
- Deadline enforcement for TW input H+1 and SPV approval H+2 is not complete everywhere.
- Training graduation currently changes status directly in the action; the business rule says regular status should be effective next payroll period.
- Some payroll/master-data items are complete or partial in `next-update.md`; read the latest checkbox notes before starting hardening.
- Audit coverage is strongest in payroll, performance activity logs, and ticket approval logs; other modules may still need audit hardening.

## Response Format

When done, respond with:

- Summary
- Files changed
- Business rules applied
- Tests/validation run
- Risks or follow-up decisions
