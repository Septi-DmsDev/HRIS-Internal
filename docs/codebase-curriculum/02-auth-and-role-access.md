# Auth dan Role Access

## 1. Tujuan Dokumen

Menjelaskan alur autentikasi dan otorisasi yang dipakai code saat ini, termasuk:

- helper auth utama;
- role yang tersedia;
- employee-linked access;
- division scope SPV/KABAG;
- server action yang sensitif;
- risiko jika role check terlewat.

## 2. File dan Folder Terkait

| File/Folder | Fungsi | Catatan |
|---|---|---|
| `src/proxy.ts` | redirect request berdasarkan session Supabase | auth gate Next.js 16 |
| `src/lib/supabase/server.ts` | server client Supabase dengan cookie bridge | memakai anon key |
| `src/lib/supabase/client.ts` | browser client Supabase | jarang dipakai |
| `src/lib/supabase/admin.ts` | Supabase service-role client | server-only, dipakai user management |
| `src/lib/auth/session.ts` | helper auth dan role | pusat role check aktual |
| `src/lib/permissions/index.ts` | matrix permission per role | helper/test, bukan satu-satunya enforcement |
| `src/lib/db/schema/auth.ts` | enum role, `user_roles`, `user_role_divisions` | employee link dan division scope |
| `src/server/actions/auth.ts` | login/logout | Supabase Auth |
| `src/server/actions/users.ts` | user role management | invite/update/remove/upsert employee login |
| `src/server/actions/history.ts` | audit trail lintas modul | HRD/SUPER_ADMIN history viewer |
| `src/app/(auth)/login/*` | UI login | form submit ke `loginAction()` |
| `src/app/(dashboard)/layout.tsx` | guard login + role UI | sidebar/header |

## 3. Alur Auth

```text
Request page
-> src/proxy.ts
-> cek cookie Supabase
-> jika belum login dan route private, redirect /login
-> jika login dan membuka /login, redirect /dashboard atau route internal yang sesuai
```

```text
User submit login form
-> loginAction(formData)
-> validasi loginSchema
-> supabase.auth.signInWithPassword()
-> redirect /dashboard
```

```text
Server action dipanggil
-> requireAuth()
-> getUser()
-> getCurrentUserRoleRow()
-> optional checkRole([...])
-> query/mutation sesuai role, employeeId, dan divisionIds
```

## 4. Fungsi Kunci

| Function | Path | Fungsi |
|---|---|---|
| `getUser()` | `src/lib/auth/session.ts` | mengambil user Supabase dari session cookie |
| `requireAuth()` | `src/lib/auth/session.ts` | redirect ke `/login` bila belum login |
| `getCurrentUserRoleRow()` | `src/lib/auth/session.ts` | mengambil role row, `employeeId`, deprecated `divisionId`, dan `divisionIds` |
| `getCurrentUserRole()` | `src/lib/auth/session.ts` | mengambil string role |
| `checkRole(allowed)` | `src/lib/auth/session.ts` | helper guard role untuk action |

Return penting `getCurrentUserRoleRow()`:

```ts
{
  id: string;
  userId: string;
  role: UserRole;
  employeeId: string | null;
  divisionId: string | null; // deprecated compatibility
  divisionIds: string[];
}
```

## 5. Role yang Tersedia

Role berasal dari enum `user_role` di `src/lib/db/schema/auth.ts` dan `USER_ROLES` di `src/types/index.ts`.

| Role | Akses umum |
|---|---|
| `SUPER_ADMIN` | hampir semua modul, user management, payroll lifecycle |
| `HRD` | master data, employee, performance HR flow, review, ticketing, training, payroll read |
| `KABAG` | scoped division access untuk performance/review/ticket/employee read dan schedule tertentu; ticket review TEAMWORK ke HRD queue |
| `SPV` | scoped division access untuk performance/review/ticket/employee read, overtime approval/schedule tertentu, dan ticket review TEAMWORK ke HRD queue |
| `FINANCE` | payroll/finance dan employee read |
| `TEAMWORK` | self-service performance/ticket/overtime bila linked ke employee |
| `MANAGERIAL` | self-service ticket/schedule/payroll detail bila linked ke employee, KPI source untuk payroll |
| `PAYROLL_VIEWER` | payroll read |

## 6. Data Scope Penting

### Employee-Linked Access

`user_roles.employee_id` menghubungkan akun Supabase dengan record `employees`.

Dipakai oleh:

- `/settings`
- `/schedule`
- `/overtime`
- personal payroll detail
- TEAMWORK personal performance helpers
- ticket create untuk role employee-linked

Jika `employeeId` kosong, fitur employee-linked harus menolak atau menampilkan state "akun belum terhubung".

### Division Scope SPV/KABAG

`user_role_divisions` adalah scope aktif untuk SPV/KABAG.

Pola:

```text
SPV/KABAG login
-> getCurrentUserRoleRow()
-> roleRow.divisionIds
-> query dibatasi ke employees.divisionId IN divisionIds
```

`user_roles.division_id` masih ada sebagai field deprecated untuk compatibility, tetapi code baru harus memakai `divisionIds`.

## 7. Matrix Modul Ringkas

| Modul | Admin/HRD | KABAG/SPV | TEAMWORK/MANAGERIAL | FINANCE/PAYROLL_VIEWER |
|---|---|---|---|---|
| Dashboard | ya | scoped | personal/self where available | finance/payroll where allowed |
| Users | admin only | tidak | tidak | tidak |
| Master data | admin/HRD | read where needed | tidak | terbatas |
| Employee | admin/HRD | scoped read | personal profile | read for payroll roles |
| Performance | admin/HRD | scoped approval | TEAMWORK self-service | tidak |
| Ticketing | HRD/SUPER_ADMIN final approval | review TEAMWORK scoped, bukan tiket sendiri | self ticket | self ticket/payroll impact where allowed |
| Review/Incident | admin/HRD | scoped | personal summary | tidak |
| Training | admin/HRD | scoped read | tidak | tidak |
| Payroll | admin/finance | generally no workspace | personal detail only | read/write by role |
| Finance | admin/finance/viewer | tidak | tidak | read summary |

## 8. Server Action yang Perlu Dicek Ketat

| File action | Kenapa sensitif |
|---|---|
| `src/server/actions/users.ts` | bisa membuka/menutup akses user dan employee link |
| `src/server/actions/settings.ts` | update credential/profile akun aktif |
| `src/server/actions/employees.ts` | mengubah profil, histori, dan jadwal kerja |
| `src/server/actions/performance.ts` | mengubah aktivitas, approval, monthly performance |
| `src/server/actions/tickets.ts` | mengubah ticket dan leave quota |
| `src/server/actions/reviews.ts` | review/incident bisa berdampak ke HR/payroll |
| `src/server/actions/training.ts` | mengubah status training/reguler/tidak lolos |
| `src/server/actions/payroll.ts` | period, snapshot, preview, adjustment, finalisasi, paid, lock |
| payroll PDF/XLSX route handlers | bisa bocor data payroll jika guard longgar |

## 9. Risiko Jika Lupa Role Check

- SPV/KABAG bisa melihat atau mengubah data di luar divisinya.
- Role non-payroll bisa membuka salary dan THP.
- Akun employee-linked bisa melihat data karyawan lain.
- Service-role operation bisa terpanggil dari context yang salah.
- Finalisasi payroll bisa dijalankan pihak yang tidak berwenang.

## 10. Catatan Implementasi

Hal yang sudah ada:

- guard request di `src/proxy.ts`;
- auth helper server-side;
- role enum dan tabel role;
- `employeeId` untuk self-service;
- `user_role_divisions` untuk multi-division scope;
- permission matrix helper;
- route dashboard login-protected;
- user management dan employee login upsert.

Gap yang perlu review:

- RLS policy lengkap tidak terlihat jelas di migration repo;
- error message `checkRole()` masih bisa dibuat lebih spesifik;
- audit log user/credential changes bisa diperkuat bila dibutuhkan.
