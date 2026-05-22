# Ticketing Leave Module

## Status

`status: tersedia, perlu hardening audit/integrasi attendance/overtime`

File utama:

- `src/lib/db/schema/hr.ts`
- `src/lib/validations/hr.ts`
- `src/server/actions/tickets.ts`
- `src/server/ticketing-engine/resolve-leave-quota-eligibility.ts`
- `src/app/(dashboard)/tickets/page.tsx`
- `src/app/(dashboard)/tickets/TicketingClient.tsx`

Gap yang perlu dibangun:

- audit log khusus keputusan ticket;
- integrasi lebih kaya dengan attendance/point target engine;
- penyelarasan dengan overtime request flow;
- test action untuk quota consume dan scope SPV/KABAG.

## 1. Tujuan Modul

Modul ini mengelola pengajuan dan approval:

- cuti;
- sakit;
- izin;
- emergency;
- setengah hari.

Modul ini penting karena status tiket memengaruhi payroll dan target performa.

## 2. Alur Kerja Modul

```text
User buka /tickets
-> getTickets()
-> requireAuth()
-> role menentukan data scope
-> DataTable tampil
```

```text
Create ticket
-> createTicket()
-> checkRole()
-> validasi Zod
-> jika role self-service, employeeId diambil dari user_roles.employee_id
-> cek scope SPV/KABAG bila division-scoped
-> hitung daysCount
-> insert attendance_tickets status SUBMITTED
-> revalidate /tickets
```

```text
Approve ticket
-> approveTicket()
-> checkRole(APPROVER_ROLES)
-> validasi input
-> cek status tiket
-> cek scope SPV/KABAG
-> jika payrollImpact belum dipilih dan bukan setengah hari
-> cek eligibility quarter rule
-> konsumsi leave quota bulanan lebih dulu
-> jika penuh, coba annual quota
-> update attendance_tickets dengan status approved dan payrollImpact
```

## 3. Penjelasan File

### `src/lib/db/schema/hr.ts`

Mendefinisikan:

- `attendance_tickets`
- `leave_quotas`
- `overtime_requests`
- `overtime_draft_entries`
- `employee_reviews`
- `incident_logs`

Ticket menyimpan `startDate`, `endDate`, `daysCount`, `status`, `payrollImpact`, actor, dan timestamp.

### `src/server/actions/tickets.ts`

Export utama:

- `getTickets()`
- `createTicket()`
- `approveTicket()`
- `rejectTicket()`
- `cancelTicket()`
- `generateLeaveQuota()`

Logika penting:

- `getTickets()` membatasi SPV/KABAG ke `divisionIds`; role self-service membaca tiket yang dibuat user itu sendiri.
- `createTicket()` memakai `user_roles.employee_id` untuk role employee-linked.
- `createTicket()` untuk TEAMWORK/role self-service hanya membutuhkan form ticket inti; employee picker tidak ditampilkan di UI dan `employeeId` diisi dari role row.
- `createTicket()` menolak akun self-service yang belum terhubung ke employee.
- `createTicket()` mewajibkan lampiran untuk sakit lebih dari 1 hari.
- `approveTicket()` memakai transaction untuk update ticket dan consume quota.
- `approveTicket()` memakai `resolveLeaveQuotaEligibility()` untuk quarter rule.
- `rejectTicket()` mewajibkan alasan penolakan.
- `cancelTicket()` hanya boleh dilakukan pembuat ticket atau HRD/SUPER_ADMIN selama status belum diproses.
- `generateLeaveQuota()` hanya HRD/SUPER_ADMIN dan menolak duplicate quota per tahun.
- overtime diatur lewat `src/server/actions/overtime.ts`, bukan lewat ticket leave.

### `src/server/ticketing-engine/resolve-leave-quota-eligibility.ts`

Helper ini menghitung kapan karyawan eligible quota berdasarkan tanggal masuk + 12 bulan, lalu efektif di akhir quarter.

### UI

- `src/app/(dashboard)/tickets/page.tsx` menyiapkan data ticket dan opsi employee.
- `src/app/(dashboard)/tickets/TicketingClient.tsx` menampilkan list, create, approve, reject, dan cancel.

## 4. Business Rules yang Diterapkan

- Approver: `SUPER_ADMIN`, `HRD`, `SPV`, `KABAG`.
- SPV/KABAG hanya boleh memproses ticket dalam division scope.
- Self-service employee-linked memakai `user_roles.employee_id`.
- Eligible leave quota memakai quarter rule.
- Prioritas quota:
  1. `PAID_QUOTA_MONTHLY`
  2. `PAID_QUOTA_ANNUAL`
  3. `UNPAID`
- Ticket `SETENGAH_HARI` tidak otomatis mengonsumsi quota pada flow approve saat ini.
- Ticket yang sudah diproses tidak bisa dibatalkan normal.
- overtime request punya placement `BEFORE_SHIFT` / `AFTER_SHIFT` dan dihitung terpisah dari ticket leave.

## 5. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `attendance_tickets` | ya | ya | tiket dan status approval |
| `leave_quotas` | ya | ya | kuota leave bulanan/tahunan |
| `overtime_requests` | ya | ya | request overtime per periode |
| `overtime_draft_entries` | ya | ya | detail draft overtime |
| `employees` | ya | tidak | cek masa kerja, divisi, list employee |
| `divisions` | ya | tidak | label divisi pada list |

## 6. Edge Case

- Employee belum eligible quarter rule: quota tidak bisa dibuat dan approve default ke `UNPAID`.
- Quota record belum dibuat: approve tetap berjalan, tetapi impact bisa tetap `UNPAID`.
- Reason penolakan kosong: reject ditolak.
- SPV/KABAG tanpa `divisionIds`: action scoped ditolak.
- Akun self-service tanpa `employeeId`: create ticket ditolak.

## 7. Hal yang Perlu Diperhatikan Developer

- Self-service bergantung pada `user_roles.employee_id`; pastikan user management menjaga link ini benar.
- Belum ada audit log khusus selain kolom timestamp/actor di tabel ticket.
- Modul ini belum mengubah target harian performance secara langsung; integrasi penuh dengan engine target perlu review lanjutan.

## 8. Contoh Alur Nyata

```text
TEAMWORK buka /tickets
-> createTicket() memakai employeeId dari user_roles
-> tiket tersimpan sebagai SUBMITTED
-> SPV/KABAG/HRD approve sesuai scope
-> approveTicket() cek quarter eligibility dan quota
-> payrollImpact tersimpan
-> payroll membaca ticket approved dalam periode aktif
```
