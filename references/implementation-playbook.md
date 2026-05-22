# Implementation Playbook

Gunakan playbook ini saat agent mengerjakan kode proyek HRD Dashboard.

## Status Code Aktual

Repo saat ini memakai alur:

```text
src/app/(dashboard) page/client
-> src/server/actions atau route handler
-> src/lib/validations Zod
-> src/lib/auth/session role/scope check
-> Drizzle query/transaction
-> src/server/*-engine helper/rule
-> PostgreSQL
-> revalidatePath/response ke UI
```

Action dan helper aktual mencakup `users`, `settings`, `me`, `schedule`, `work-schedules`, `employees` (termasuk placement helper), `performance`, `tickets`, `attendance`, `reviews`, `training`, `payroll`, serta route handler export karyawan/payroll XLSX dan payslip PDF. Modul `settings` juga sudah mencakup self-service profil enrichment karyawan (hobi, riwayat pendidikan, kompetensi). Jangan memakai dokumen konsep lama sebagai status implementasi tanpa membandingkan code.

## 1. Sebelum Coding

Untuk setiap task, tentukan:

1. Modul: profiling, performance, attendance, review, ticketing, payroll, atau finance.
2. Phase: 1, 2, atau 3.
3. Role terkait: TW, SPV, HRD, Finance, Admin, Managerial.
4. Data sumber dan data output.
5. Aturan bisnis yang berlaku.
6. Risiko audit, payroll, atau keamanan.

Jangan langsung membuat UI jika schema dan rule engine belum jelas.

## 2. Urutan Implementasi Fitur

Urutan umum:

1. Schema/migration.
2. Types/generated type.
3. Server service/rule engine.
4. Server action/route handler.
5. UI form/table/detail.
6. Audit log.
7. Test/validation.
8. Dokumentasi perubahan.

## 3. Pattern Server Action

Mutation harus melalui server action atau route handler.

Mutation wajib:
- validate input dengan Zod;
- cek permission server-side;
- gunakan transaction jika menyentuh payroll, quota, approval, atau adjustment;
- tulis audit log;
- return result yang jelas: success, error, validation issue.

## 4. Pattern Rule Engine

Letakkan rule engine di folder `server/*-engine`.

Folder engine/helper aktual:

```text
src/server/point-engine/
src/server/attendance-engine/
src/server/payroll-engine/
src/server/ticketing-engine/
src/server/review-engine/
```

Rule engine harus pure sebisa mungkin:
- input data eksplisit;
- output data eksplisit;
- minim side effect;
- mudah ditest.

Untuk modul poin kinerja:
- target poin harian berbasis divisi snapshot saat ini memakai `src/config/constants.ts` dan `calculateMonthlyPointPerformance()`;
- daftar pekerjaan harian mengikuti divisi aktual harian di action performance;
- performa bulanan dihitung dari poin approved/locked vs target snapshot.
- input managerial bulanan tersedia di `src/server/actions/performance.ts` dan menulis ke `managerial_kpi_summaries` untuk role KABAG/SPV/MANAGERIAL.

Untuk modul ticketing:
- antrian approval tersedia di route `/ticketingapproval`;
- role approver aktif saat ini: `SUPER_ADMIN`, `HRD`, `SPV`, `KABAG`;
- tetap enforce scope/role check di server action ticketing.

Untuk payroll:
- level bonus memakai `resolveBonusLevel()`;
- periode 26-25 memakai `resolvePayrollPeriod()`;
- eligibility bonus fulltime/disiplin memakai `resolveAttendancePayrollEligibility()` dari data absensi periode;
- bonus disiplin tier memakai rule jumlah telat periode (`0 => 100%`, `<=3 => 90%`, `<=7 => 80%`, `>=8 => 0%`);
- untuk karyawan yang lulus training di tengah periode, bonus fulltime dan bonus disiplin diprorate dengan rasio sisa hari kerja terjadwal sejak tanggal lulus terhadap total hari kerja terjadwal periode;
- tunjangan masa kerja dihitung dari `training_graduation_date` melalui `resolveTenureAllowanceAmount()` dengan bucket anchor:
  - Jan-Feb-Mar -> April setelah 13-15 bulan;
  - Apr-Mei-Jun -> Juli setelah 13-15 bulan;
  - Jul-Ags-Sep -> Oktober setelah 13-15 bulan;
  - Okt-Nov-Des -> Januari setelah 13-15 bulan;
- kalkulasi TEAMWORK/MANAGERIAL memakai engine payroll;
- PDF/XLSX memakai builder server-side.

## 5. Database Rules

Gunakan snake_case untuk nama tabel/kolom database.
Gunakan enum/status yang eksplisit.
Gunakan timestamp untuk created_at, updated_at, submitted_at, approved_at, locked_at.

Tabel penting harus punya:
- created_by
- updated_by bila relevan
- status
- audit trail atau related log table

## 6. RLS & Permission

RLS minimal:
- TW hanya melihat data diri sendiri.
- SPV melihat data karyawan di divisinya.
- HRD melihat semua data HRD/performance/ticketing.
- Finance melihat payroll dan finance modules.
- Admin mengelola master data.

Tetap lakukan permission check di server action, jangan hanya mengandalkan UI hidden state.

Catatan code aktual:
- `user_roles.employee_id` dipakai untuk self-service employee-linked account.
- `user_role_divisions` dipakai untuk SPV/KABAG division scope.
- RLS policy lengkap perlu diverifikasi di database/migration; server-side checks tetap wajib.

## 7. Payroll Rules

Payroll tidak boleh dihitung dari data mentah yang belum final.

Payroll membaca:
- payroll_employee_snapshot;
- monthly_point_performance;
- KPI summary untuk managerial;
- attendance summary;
- approved ticket payroll impact;
- approved additions/deductions;
- adjustment log.

Finalization harus:
- memakai transaction;
- idempotent;
- mengunci periode;
- menyimpan breakdown komponen;
- menulis audit log.

## 8. Output Jawaban Agent

Setelah task selesai, berikan ringkasan:

```text
Yang dikerjakan:
- ...

File diubah:
- ...

Aturan bisnis yang diterapkan:
- ...

Validasi/test:
- ...

Risiko/catatan:
- ...
```

## 9. Larangan

- Jangan hardcode rule payroll di komponen UI.
- Jangan hardcode target poin divisi langsung di banyak tempat; gunakan satu resolver rule server-side.
- Jangan menggunakan service role key di client.
- Jangan memakai `src/lib/supabase/admin.ts` dari client component.
- Jangan menghapus histori payroll, aktivitas, approval, atau ticket tanpa audit.
- Jangan mengubah master poin lama tanpa versioning.
- Jangan membuat finalization yang bisa dijalankan berulang dengan efek samping ganda.
- Jangan mengabaikan edge case training, cuti berbayar, pindah divisi, dan locked period.
