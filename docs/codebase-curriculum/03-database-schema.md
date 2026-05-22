# Database Schema

## 1. Tujuan Dokumen

Menjelaskan semua schema Drizzle yang benar-benar ada di repo:

- `auth.ts`
- `master.ts`
- `employee.ts`
- `point.ts`
- `hr.ts`
- `payroll.ts`

## 2. Peta Schema

| Schema file | Fokus bisnis |
|---|---|
| `src/lib/db/schema/auth.ts` | role user, scope divisi, employee link |
| `src/lib/db/schema/master.ts` | cabang, divisi, jabatan, grade, kelompok karyawan |
| `src/lib/db/schema/employee.ts` | profil karyawan, histori, jadwal kerja, shift master, self-service profile |
| `src/lib/db/schema/point.ts` | katalog poin, aktivitas harian, log approval, performa bulanan |
| `src/lib/db/schema/hr.ts` | ticketing, leave quota, overtime, attendance, review, incident |
| `src/lib/db/schema/payroll.ts` | salary config, payroll period, snapshot, result, adjustment, audit |

## 3. Schema `auth.ts`

### Tabel

| Tabel | Kolom penting | Fungsi bisnis | Modul yang memakai |
|---|---|---|---|
| `user_roles` | `user_id`, `role`, `employee_id`, `division_id` | menyimpan role aplikasi dan scope SPV | auth, layout, semua server action |
| `user_role_divisions` | `user_role_id`, `division_id` | scope aktif SPV/KABAG lintas divisi | auth, layout, scoped action |

### Enum

| Enum | Nilai |
|---|---|
| `user_role` | `SUPER_ADMIN`, `HRD`, `FINANCE`, `SPV`, `TEAMWORK`, `MANAGERIAL`, `PAYROLL_VIEWER` |

### Relasi

- `division_id` → `divisions.id`
- `division_id = null` dipakai sebagai akses global
- `user_role_divisions.division_id` → `divisions.id`

## 4. Schema `master.ts`

### Enum

| Enum | Nilai | Dipakai oleh |
|---|---|---|
| `employee_group` | `MANAGERIAL`, `TEAMWORK`, `KARYAWAN_TETAP`, `MITRA_KERJA`, `BORONGAN`, `TRAINING` | position, employee, payroll snapshot |

### Tabel

| Tabel | Kolom penting | Fungsi bisnis | Modul yang memakai |
|---|---|---|---|
| `branches` | `name`, `address`, `is_active` | master cabang/penempatan | employee, master data, payroll snapshot |
| `divisions` | `name`, `code`, `branch_id`, `training_pass_percent`, `is_active` | master divisi dan standar lulus training | employee, performance, ticketing, training, payroll |
| `positions` | `name`, `code`, `employee_group`, `is_active` | master jabatan dan kelompok karyawan | employee, payroll snapshot |
| `grades` | `name`, `code`, `description`, `is_active` | master grade | employee, payroll snapshot |

## 5. Schema `employee.ts`

### Enum

| Enum | Nilai |
|---|---|
| `employment_status` | `TRAINING`, `REGULER`, `DIALIHKAN_TRAINING`, `TIDAK_LOLOS`, `NONAKTIF`, `RESIGN` |
| `payroll_status` | `TRAINING`, `REGULER`, `FINAL_PAYROLL`, `NONAKTIF` |
| `work_day_status` | `KERJA`, `OFF`, `CUTI`, `SAKIT`, `IZIN`, `ALPA`, `SETENGAH_HARI` |

### Tabel Utama

| Tabel | Kolom penting | Fungsi bisnis | Modul yang memakai |
|---|---|---|---|
| `employees` | `employee_code`, `full_name`, `start_date`, `branch_id`, `division_id`, `position_id`, `grade_id`, `employee_group`, `employment_status`, `payroll_status`, `supervisor_employee_id`, `training_graduation_date`, `is_active` | profil utama karyawan | hampir semua modul |
| `employee_division_histories` | `previous_division_id`, `new_division_id`, `effective_date` | snapshot histori divisi | employee, performance snapshot, payroll snapshot |
| `employee_position_histories` | `previous_position_id`, `new_position_id`, `effective_date` | histori jabatan | employee, payroll snapshot |
| `employee_grade_histories` | `previous_grade_id`, `new_grade_id`, `effective_date` | histori grade | employee, payroll snapshot |
| `employee_supervisor_histories` | `previous_supervisor_employee_id`, `new_supervisor_employee_id` | histori atasan | employee |
| `employee_status_histories` | `previous_employment_status`, `new_employment_status`, `previous_payroll_status`, `new_payroll_status` | histori status kerja/payroll | employee, audit manual |
| `work_schedules` | `code`, `name`, `description`, `is_active` | template jadwal mingguan | master data, employee, performance, payroll |
| `work_shift_masters` | `code`, `name`, `start_time`, `end_time`, `break_start`, `break_end`, `check_in_tolerance_minutes`, `break_tolerance_minutes`, `check_out_tolerance_minutes` | master shift dan toleransi absensi | master data, absensi, payroll |
| `work_schedule_days` | `schedule_id`, `day_of_week`, `day_status`, `is_working_day`, `start_time`, `end_time`, `break_start`, `break_end`, `check_in_tolerance_minutes`, `break_tolerance_minutes`, `check_out_start`, `check_out_tolerance_minutes`, `target_points` | detail 7 hari per jadwal | performance target day, payroll scheduled work day |
| `employee_schedule_assignments` | `employee_id`, `schedule_id`, `effective_start_date`, `effective_end_date` | histori penugasan jadwal | employee detail, performance, payroll |
| `employee_hobbies` | `employee_id`, `hobby_name`, `notes` | self-service profil hobi | settings, profile enrichment |
| `employee_education_histories` | `employee_id`, `institution_name`, `degree`, `major`, `start_year`, `end_year` | self-service riwayat pendidikan | settings, profile enrichment |
| `employee_competencies` | `employee_id`, `competency_name`, `level`, `issuer`, `certified_at` | self-service kompetensi | settings, profile enrichment |

### Relasi Penting

- `employees.branch_id` → `branches.id`
- `employees.division_id` → `divisions.id`
- `employees.position_id` → `positions.id`
- `employees.grade_id` → `grades.id`
- `employees.supervisor_employee_id` → `employees.id`
- semua history table → `employees.id`
- `employee_schedule_assignments.schedule_id` → `work_schedules.id`
- `employee_group` di UI dan search `/positioning` dinormalisasi ke label baru; karyawan point-based tanpa `training_graduation_date` disimpan sebagai `TRAINING`

## 6. Schema `point.ts`

### Enum

| Enum | Nilai |
|---|---|
| `point_catalog_version_status` | `DRAFT`, `ACTIVE`, `ARCHIVED` |
| `activity_status` | `DRAFT`, `DIAJUKAN`, `DITOLAK_SPV`, `REVISI_TW`, `DIAJUKAN_ULANG`, `DISETUJUI_SPV`, `OVERRIDE_HRD`, `DIKUNCI_PAYROLL` |
| `point_approval_action` | `SUBMIT`, `APPROVE_SPV`, `REJECT_SPV`, `RESUBMIT`, `OVERRIDE_HRD`, `LOCK_PAYROLL` |
| `monthly_point_performance_status` | `DRAFT`, `FINALIZED`, `LOCKED` |

### Tabel

| Tabel | Kolom penting | Fungsi bisnis | Modul yang memakai |
|---|---|---|---|
| `point_catalog_versions` | `code`, `status`, `effective_start_date`, `effective_end_date`, `source_file_name` | versioning master poin | point catalog |
| `division_point_target_rules` | `version_id`, `division_name`, `target_points`, `is_default` | target harian per divisi | point catalog, performance |
| `point_catalog_entries` | `version_id`, `division_name`, `work_name`, `point_value`, `unit_description`, `is_active` | katalog pekerjaan dan poin | performance input |
| `daily_activity_entries` | snapshot lengkap poin dan transaksi harian | histori aktivitas yang aman terhadap perubahan master | performance, payroll lock |
| `daily_activity_approval_logs` | `activity_entry_id`, `action`, `actor_user_id`, `actor_role`, `notes` | audit approval aktivitas | performance, payroll finalize |
| `monthly_point_performances` | `employee_id`, `period_start_date`, `period_end_date`, `division_snapshot_name`, `target_daily_points`, `target_days`, `total_target_points`, `total_approved_points`, `performance_percent`, `status` | rekap bulanan yang menjadi basis payroll TEAMWORK dan training | performance, training, payroll, dashboard |

### Relasi Penting

- `daily_activity_entries.employee_id` → `employees.id`
- `daily_activity_entries.actual_division_id` → `divisions.id`
- `daily_activity_entries.point_catalog_entry_id` → `point_catalog_entries.id`
- `daily_activity_entries.point_catalog_version_id` → `point_catalog_versions.id`
- `monthly_point_performances.employee_id` → `employees.id`

## 7. Schema `hr.ts`

### Enum

| Enum | Nilai |
|---|---|
| `ticket_type` | `CUTI`, `CUTI_TAHUNAN`, `CUTI_BULANAN`, `CUTI_HAMIL_LAHIR`, `CUTI_NIKAH`, `SAKIT`, `IZIN`, `IZIN_ACARA`, `IZIN_JAM`, `MENINGGAL`, `EMERGENCY`, `SETENGAH_HARI`, `RESIGN` |
| `ticket_status` | `DRAFT`, `SUBMITTED`, `AUTO_APPROVED`, `AUTO_REJECTED`, `NEED_REVIEW`, `APPROVED_SPV`, `APPROVED_HRD`, `REJECTED`, `CANCELLED`, `LOCKED` |
| `ticket_payroll_impact` | `UNPAID`, `PAID_QUOTA_MONTHLY`, `PAID_QUOTA_ANNUAL` |
| `attendance_status` | `HADIR`, `ALPA`, `IZIN`, `SAKIT`, `CUTI`, `OFF` |
| `attendance_punctuality_status` | `TEPAT_WAKTU`, `TELAT` |
| `attendance_source` | `MANUAL`, `FINGERPRINT_ADMS` |
| `attendance_fallback_status` | `PENDING`, `APPROVED`, `REJECTED` |
| `overtime_type` | `OVERTIME_1H`, `OVERTIME_2H`, `OVERTIME_3H`, `LEMBUR_FULLDAY`, `PATCH_ABSENCE_3H` |
| `overtime_request_status` | `PENDING`, `APPROVED`, `REJECTED` |
| `overtime_placement` | `BEFORE_SHIFT`, `AFTER_SHIFT` |
| `review_status` | `DRAFT`, `SUBMITTED`, `VALIDATED`, `LOCKED` |
| `incident_type` | `KOMPLAIN`, `MISS_PROSES`, `TELAT`, `AREA_KOTOR`, `PELANGGARAN`, `SP1`, `SP2`, `PENGHARGAAN` |
| `incident_impact` | `REVIEW_ONLY`, `PAYROLL_POTENTIAL`, `NONE` |

### Tabel

| Tabel | Kolom penting | Fungsi bisnis | Modul yang memakai |
|---|---|---|---|
| `attendance_tickets` | `employee_id`, `ticket_type`, `start_date`, `end_date`, `days_count`, `status`, `payroll_impact`, `approved_by_user_id`, `rejection_reason`, `created_by_user_id` | tiket izin/sakit/cuti | tickets, dashboard, payroll |
| `employee_attendance_records` | `employee_id`, `attendance_date`, `attendance_status`, `check_in_time`, `check_out_time`, `punctuality_status`, `source` | rekap kehadiran manual/fingerprint | absensi, payroll |
| `attendance_fallback_requests` | `employee_id`, `attendance_date`, `photo_url`, `status`, `review_notes` | fallback saat fingerprint gagal | absensi, payroll review |
| `overtime_requests` | `employee_id`, `request_date`, `overtime_type`, `overtime_placement`, `overtime_hours`, `base_amount`, `meal_amount`, `total_amount`, `period_code`, `status` | request overtime dan komponen THP | overtime, payroll |
| `overtime_draft_entries` | `overtime_request_id`, `employee_id`, `work_date`, `job_id`, `work_name`, `quantity`, `point_value`, `total_points` | draft detail overtime yang bisa diaudit | overtime, payroll |
| `leave_quotas` | `employee_id`, `year`, `monthly_quota_total/used`, `annual_quota_total/used` | kuota paid leave | tickets, payroll effect |
| `employee_reviews` | skor 5 aspek, `total_score`, `category`, `status`, `validated_by_user_id` | review kualitas kerja | reviews, dashboard |
| `incident_logs` | `incident_type`, `impact`, `payroll_deduction`, `recorded_by_role`, `is_active` | kejadian yang bisa berdampak ke review/payroll | reviews, dashboard, payroll |

### Relasi Penting

- semua tabel utama terhubung ke `employees.id`
- `incident_logs.division_id` → `divisions.id`

## 8. Schema `payroll.ts`

### Enum

| Enum | Nilai |
|---|---|
| `payroll_period_status` | `OPEN`, `DATA_REVIEW`, `DRAFT`, `FINALIZED`, `PAID`, `LOCKED` |
| `payroll_adjustment_type` | `ADDITION`, `DEDUCTION` |
| `managerial_kpi_status` | `DRAFT`, `VALIDATED`, `LOCKED` |
| `payroll_audit_action` | `CREATE_PERIOD`, `GENERATE_PREVIEW`, `FINALIZE`, `MARK_PAID`, `LOCK`, `ADD_ADJUSTMENT` |

### Tabel

| Tabel | Kolom penting | Fungsi bisnis | Modul yang memakai |
|---|---|---|---|
| `employee_salary_configs` | semua nominal base payroll per employee | sumber nominal saat preview | payroll |
| `payroll_periods` | `period_code`, `period_start_date`, `period_end_date`, `status`, timestamp lifecycle | periode payroll anchor | payroll, finance |
| `managerial_kpi_summaries` | `period_id`, `employee_id`, `performance_percent`, `status` | sumber performa managerial | payroll |
| `payroll_employee_snapshots` | snapshot branch/division/position/grade/status/salary pada periode | menjaga payroll tetap stabil | payroll |
| `payroll_results` | komponen nominal dibayar, deduction, THP, `breakdown` JSON, status | hasil payroll per employee | payroll, finance, payslip |
| `payroll_adjustments` | `adjustment_type`, `amount`, `reason`, actor | koreksi manual per periode | payroll |
| `payroll_audit_logs` | `action`, actor, notes, payload | audit trail payroll | payroll |

### Relasi Penting

- `payroll_employee_snapshots.period_id` → `payroll_periods.id`
- `payroll_results.snapshot_id` → `payroll_employee_snapshots.id`
- `payroll_results.monthly_performance_id` → `monthly_point_performances.id`
- `payroll_results.managerial_kpi_summary_id` → `managerial_kpi_summaries.id`
- `payroll_adjustments.period_id` → `payroll_periods.id`

## 9. Tabel yang Menjadi Fondasi Antar Modul

| Tabel | Dipakai lintas modul karena apa |
|---|---|
| `employees` | hampir semua modul butuh identitas, divisi, status, kelompok |
| `employee_division_histories` | menentukan snapshot divisi untuk performance dan payroll |
| `employee_schedule_assignments` + `work_schedule_days` | menentukan hari target dan scheduled work day |
| `monthly_point_performances` | sumber training, dashboard, payroll TEAMWORK |
| `attendance_tickets` | memengaruhi target poin dan payroll impact |
| `employee_attendance_records` | memengaruhi eligibility bonus fulltime dan disiplin |
| `attendance_fallback_requests` | memengaruhi attendance review dan payroll fallback |
| `overtime_requests` | memengaruhi komponen overtime THP |
| `incident_logs` | memengaruhi review summary dan payroll deduction/SP penalty |
| `payroll_results` | sumber finance dashboard, detail payroll, export, payslip |

## 10. Perlu Review Lanjutan

- `status: sebagian`
- schema sudah cukup lengkap untuk payroll, tetapi beberapa komponen nominal masih perlu dipantau terhadap action preview:
  `dailyAllowanceAmount`, `overtimeRateAmount`, `overtimeAmount`, `dailyAllowancePaid`.
- repo tidak menunjukkan policy RLS pada tabel-tabel ini.
- belum ada tabel audit khusus untuk ticket approval, review validation, atau training decision selain log yang implisit di record utama.
