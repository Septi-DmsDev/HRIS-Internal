# Ticketing Leave Module

## Status

`status: tersedia, perlu hardening test/integrasi attendance/overtime`

File utama:

- `src/lib/db/schema/hr.ts`
- `src/lib/validations/hr.ts`
- `src/server/actions/tickets.ts`
- `src/server/ticketing-engine/resolve-leave-quota-eligibility.ts`
- `src/app/(dashboard)/tickets/page.tsx`
- `src/app/(dashboard)/tickets/TicketingClient.tsx`

Gap yang perlu dibangun:

- test action untuk audit keputusan ticket;
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

Modul ini penting karena status tiket memengaruhi payroll, target performa, dan assignment jadwal.
Untuk jadwal, efek OFF hanya ditulis setelah approval final HRD/SUPER_ADMIN atau status final yang setara; review SPV/KABAG saja tidak mengubah jadwal.

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
-> jika role SPV/KABAG, hanya review tiket TEAMWORK dalam scope dan ubah status ke APPROVED_SPV
-> jika role HRD/SUPER_ADMIN, lakukan final approval menjadi APPROVED_HRD
-> jika payrollImpact belum dipilih dan bukan setengah hari/izin jam/resign
-> cek eligibility quarter rule
-> konsumsi leave quota sesuai jenis tiket
-> update attendance_tickets dengan status final dan payrollImpact
-> tulis attendance_ticket_audit_logs
-> untuk tiket harian penuh, kosongkan employee_schedule_assignments pada rentang ticket agar /scheduler menjadi OFF
-> revalidate /schedule dan /scheduler setelah approval final atau reject agar tampilan jadwal ikut sinkron
```

## 3. Penjelasan File

### `src/lib/db/schema/hr.ts`

Mendefinisikan:

- `attendance_tickets`
- `attendance_ticket_audit_logs`
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

- `getTickets()` adalah surface self-service/history dan membaca tiket yang dibuat `user.id`; `getTicketsForApproval()` / `getTicketsForApprovalHistory()` yang membatasi SPV/KABAG ke `divisionIds`.
- `createTicket()` memakai `user_roles.employee_id` untuk role employee-linked.
- `createTicket()` untuk TEAMWORK/role self-service hanya membutuhkan form ticket inti; employee picker tidak ditampilkan di UI dan `employeeId` diisi dari role row.
- `createTicket()` menolak akun self-service yang belum terhubung ke employee.
- `createTicket()` mewajibkan lampiran untuk sakit lebih dari 1 hari.
- `approveTicket()` memakai transaction untuk final approval HRD/SUPER_ADMIN dan consume quota.
- `approveTicket()` untuk tiket harian penuh yang final approved juga memanggil schedule assignment service untuk membuat rentang ticket menjadi OFF di scheduler.
- `approveTicket()` untuk SPV/KABAG hanya memindahkan tiket TEAMWORK ke queue HRD sebagai `APPROVED_SPV`; keputusan final payroll impact tetap di HRD/SUPER_ADMIN.
- `approveTicket()` dan `rejectTicket()` menulis `attendance_ticket_audit_logs` bila enum audit tersedia.
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
- `src/app/(dashboard)/ticketingapproval/*` menampilkan antrian review/approval sesuai role.

## 4. Business Rules yang Diterapkan

- Approver action: `SUPER_ADMIN`, `HRD`, `SPV`, `KABAG`.
- SPV/KABAG hanya boleh memproses tiket TEAMWORK dalam division scope dan tidak boleh memproses tiket sendiri; hasilnya `APPROVED_SPV` untuk queue HRD.
- HRD/SUPER_ADMIN melakukan final approval menjadi `APPROVED_HRD` dan menentukan payroll impact.
- OFF pada `/schedule` mengikuti `employee_schedule_assignments` yang sudah diubah oleh approval final; `/schedule` tidak memakai `APPROVED_SPV` sebagai sumber OFF.
- `IZIN_JAM`, `SETENGAH_HARI`, dan `RESIGN` tidak otomatis mengosongkan jadwal menjadi OFF penuh.
- Self-service employee-linked memakai `user_roles.employee_id`.
- Eligible leave quota memakai quarter rule.
- Payroll impact quota mengikuti jenis tiket:
  1. `CUTI_BULANAN` -> `PAID_QUOTA_MONTHLY`
  2. `CUTI_TAHUNAN` -> `PAID_QUOTA_ANNUAL`
  3. jenis lain default `UNPAID` kecuali dipilih eksplisit oleh approver
- Ticket `SETENGAH_HARI` tidak otomatis mengonsumsi quota pada flow approve saat ini.
- Ticket yang sudah diproses tidak bisa dibatalkan normal.
- overtime request punya placement `BEFORE_SHIFT` / `AFTER_SHIFT` dan dihitung terpisah dari ticket leave.

## 5. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `attendance_tickets` | ya | ya | tiket dan status approval |
| `attendance_ticket_audit_logs` | ya | ya | audit keputusan approval/reject |
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
- Audit keputusan ticket tersedia di `attendance_ticket_audit_logs`, tetapi test action dan reporting audit masih bisa diperkuat.
- Modul ini belum mengubah target harian performance secara langsung; integrasi penuh dengan engine target perlu review lanjutan.

## 8. Contoh Alur Nyata

```text
TEAMWORK buka /tickets
-> createTicket() memakai employeeId dari user_roles
-> tiket tersimpan sebagai SUBMITTED
-> SPV/KABAG review sesuai scope dan ubah ke APPROVED_SPV
-> HRD/SUPER_ADMIN final approve
-> approveTicket() cek quarter eligibility dan quota
-> payrollImpact tersimpan
-> payroll membaca ticket approved dalam periode aktif
-> approval final mengubah assignment jadwal di /scheduler menjadi OFF untuk tanggal ticket harian penuh
-> /schedule karyawan membaca jadwal OFF dari assignment scheduler tersebut
```
