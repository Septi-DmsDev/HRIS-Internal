# Server Actions and Business Logic

## 1. Tujuan Dokumen

Dokumen ini merangkum file di `src/server/actions`, karena folder inilah boundary bisnis paling penting di repo. Semua mutation sensitif harus masuk lewat server action, route handler, service server-side, rule engine, atau transaction.

## 2. Ringkasan File Action

| File | Fungsi utama | Modul |
|---|---|---|
| `auth.ts` | login/logout | auth |
| `users.ts` | invite user, update role, remove access, employee login upsert | auth/access |
| `settings.ts` | account settings user aktif | self-service |
| `me.ts`, `me.helpers.ts` | personal dashboard/profile dan helper akses | self-service |
| `schedule.ts` | jadwal pribadi/tim dan assignment schedule | schedule |
| `branches.ts` | CRUD branch | master data |
| `divisions.ts` | CRUD division | master data |
| `positions.ts` | CRUD position | master data |
| `grades.ts` | CRUD grade | master data |
| `work-schedules.ts` | work schedule + work shift master | master data |
| `employees.ts` | employee list/detail/create/update/delete | employee profiling |
| `dashboard.ts` | dashboard summary | dashboard |
| `point-catalog.ts` | katalog poin overview, import workbook, entry CRUD | performance |
| `performance.ts` | activity workflow, self-service TW, SPV/KABAG queue, monthly performance | performance |
| `tickets.ts` | ticket workflow + leave quota | ticketing |
| `attendance.ts` | workspace dan input manual absensi | absensi |
| `overtime.ts` | workspace overtime, draft submit, decision, division schedule | overtime |
| `reviews.ts` | review + incident | review |
| `training.ts` | training evaluation decision | training |
| `payroll.ts`, `payroll.helpers.ts` | payroll workspace, detail, lifecycle, helper personal access | payroll |
| `history.ts` | audit trail lintas modul | history |

## 3. Action Penting per Modul

### Auth/User

| Function | Role yang boleh | Catatan |
|---|---|---|
| `loginAction` | semua user login | Supabase sign-in lalu redirect |
| `logoutAction` | user login | sign out |
| `getUsers` | admin roles | membaca role row, employee link, division scope |
| `inviteUser` | admin roles | memakai Supabase admin client; server-only |
| `updateUser` | admin roles | update role, employee link, divisionIds |
| `removeUserAccess` | admin roles | hapus akses role |
| `getEmployeeLoginInfo` | admin roles | cek akun login per employee |
| `upsertEmployeeLogin` | admin roles | buat/update akun employee-linked |

### Self-Service

| Function | Catatan |
|---|---|
| `getMyDashboard` | membaca employee-linked account dan summary pribadi |
| `getMyProfile` | profile read-only pribadi beserta history |
| `getMyAccountSettings` | data settings akun aktif |
| `updateMyAccountSettings` | update email/password/metadata dan employee profile ringan |
| `getMySchedule` | jadwal pribadi |
| `getTeamSchedules` | jadwal tim sesuai scope |
| `assignEmployeeSchedule` | assignment schedule, perlu role/scope check; cell scheduler juga bisa mengosongkan tanggal jadi OFF |
| target poin bulanan | dihitung dari target harian master divisi x jumlah tanggal aktif/non-OFF pada scheduler |

### Master Data

| Area | Functions |
|---|---|
| Branch | `getBranches`, `createBranch`, `updateBranch`, `deleteBranch` |
| Division | `getDivisions`, `createDivision`, `updateDivision`, `deleteDivision` |
| Position | `getPositions`, `createPosition`, `updatePosition`, `deletePosition` |
| Grade | `getGrades`, `createGrade`, `updateGrade`, `deleteGrade` |
| Work schedule | `getWorkSchedules`, `getActiveWorkSchedules`, `createWorkSchedule`, `updateWorkSchedule`, `deleteWorkSchedule` |
| Shift master | `getWorkShiftMasters`, `createWorkShiftMaster`, `updateWorkShiftMaster`, `deleteWorkShiftMaster` |

### Employee

| Function | Catatan |
|---|---|
| `getEmployees` | list employee dengan role/scope |
| `getEmployeeFormOptions` | opsi master data untuk form |
| `getEmployeeById` | detail employee + histories |
| `createEmployee` | transaction, insert histories awal, schedule assignment |
| `updateEmployee` | transaction, tulis history bila field berubah |
| `deleteEmployee` | hard delete; hati-hati dengan histori/relasi |

### Performance

| Function | Catatan bisnis |
|---|---|
| `getPerformanceWorkspace` | workspace admin/SPV/KABAG/self-service scoped |
| `saveDailyActivityEntry` | menyimpan snapshot master point |
| `submitDailyActivityEntry` | submit draft/revisi dan tulis approval log |
| `approveDailyActivityEntry` | approve SPV/KABAG/HRD dan log |
| `rejectDailyActivityEntry` | reject dengan catatan dan log |
| `generateMonthlyPerformance` | generate target/performance per periode |
| `getTwPerformanceData` | self-service TEAMWORK |
| `batchSubmitDraft` | submit banyak draft personal |
| `getSpvPendingActivities` | queue SPV/KABAG |
| `batchDecideDraftActivities` | batch approve/reject |
| `deleteActivityEntry` | hanya untuk state yang diizinkan |

Rule engine terkait:

- `countAssignedDaysForPeriod()`
- `countTargetDaysForPeriod()`
- `calculateMonthlyPointPerformance()`
- `parseMasterPointWorkbook()`

### Overtime

| Function | Catatan |
|---|---|
| `getOvertimeWorkspace` | workspace overtime admin/approver/self-service |
| `submitOvertimeDraft` | simpan draft overtime beserta detail entry |
| `submitOvertimeRequest` | ajukan request overtime |
| `submitSpvOvertimeRequest` | request overtime untuk scope SPV |
| `scheduleDivisionOvertime` | schedule overtime untuk divisi |
| `getMyShiftForDate` | helper shift self-service |
| `getEmployeeShiftForDate` | helper shift employee target |
| `decideOvertimeRequest` | approve/reject overtime |
| `deleteOvertimeRequest` | hapus overtime request sesuai status |

### Point Catalog

| Function | Catatan |
|---|---|
| `getPointCatalogOverview` | version, entries, target rules |
| `syncPointCatalogFromWorkbook` | import versi katalog dari workbook |
| `upsertCatalogEntry` | tambah/update entry katalog |
| `deleteCatalogEntry` | hapus entry |
| `clearAllCatalogData` | operasi destruktif; gunakan sangat hati-hati |
| `importCatalogEntriesFromXlsx` | import file XLSX |

### Ticketing

| Function | Catatan bisnis |
|---|---|
| `getTickets` | list ticket sesuai role/scope |
| `createTicket` | self-service memakai `user_roles.employee_id` bila role employee-linked |
| `approveTicket` | transaction, consume quota bila eligible |
| `rejectTicket` | rejection reason wajib |
| `cancelTicket` | pembuat atau role tertentu |
| `generateLeaveQuota` | HRD/admin generate quota tahunan |

Helper terkait:

- `resolveLeaveQuotaEligibility()` di `src/server/ticketing-engine`.

### Absensi

| Function | Catatan bisnis |
|---|---|
| `getAttendanceWorkspace` | workspace absensi harian untuk `SUPER_ADMIN` dan `HRD` |
| `upsertAttendanceRecord` | input/update absensi manual per karyawan dan tanggal |
| `submitAttendanceFallbackRequest` | fallback ketika fingerprint gagal |
| `approveAttendanceFallbackRequest` | review fallback attendance |
| `rejectAttendanceFallbackRequest` | reject fallback attendance |
| `overrideAttendancePeriodTotals` | override agregat periode absensi |

Helper terkait:

- `resolveAttendancePayrollEligibility()` di `src/server/attendance-engine`, dipakai payroll preview untuk menentukan bonus fulltime dan disiplin.

### Review, Incident, Training

| Function | Catatan |
|---|---|
| `getReviews` | review + incident scoped |
| `createReview` | hitung 5 aspek review |
| `validateReview` | HRD/admin validate |
| `createIncident` | incident aktif, bisa membawa payroll deduction |
| `deleteIncident` | soft-delete incident aktif dengan scope role/divisi |
| `getTrainingEvaluations` | trainee evaluation scoped |
| `graduateTrainee` | saat ini mengubah status langsung; gap dengan rule efektif periode berikutnya |
| `failTrainee` | update status gagal training |

Helper terkait:

- `resolveReviewerEmployeeId()` di `src/server/review-engine`.

### Payroll

| Function | Catatan bisnis |
|---|---|
| `getPayrollWorkspace` | period/result/adjustment/salary/KPI workspace |
| `getPayrollEmployeeDetail` | detail payroll, juga dipakai personal access |
| `upsertEmployeeSalaryConfig` | salary config per employee |
| `upsertGradeCompensationConfig` | master nominal tunjangan/bonus per grade |
| `upsertManagerialKpiSummary` | KPI managerial validated |
| `createPayrollPeriod` | audit `CREATE_PERIOD` |
| `addPayrollAdjustment` | audit `ADD_ADJUSTMENT` |
| `deletePayrollAdjustment` | hapus period adjustment atau nonaktifkan recurring adjustment |
| `generatePayrollPreview` | membuat snapshot dan draft result; dipanggil otomatis oleh `/payroll/page.tsx` untuk periode editable |
| `finalizePayroll` | lock result, monthly performance, dan activity terkait |
| `markPayrollPaid` | transisi paid |
| `lockPayrollPeriod` | transisi locked |

### History

| Function | Catatan |
|---|---|
| `getSystemHistory` | audit trail lintas modul untuk HRD/SUPER_ADMIN |

Rule/helper terkait:

- `resolvePayrollPeriod()`
- `resolveAttendancePayrollEligibility()`
- `resolveBonusLevel()`
- `calculateTeamworkPayroll()`
- `calculateManagerialPayroll()`
- `resolvePayrollStatusTransition()`
- `buildPayslipBreakdown()`
- `buildPayrollExportRows()`
- `summarizePayrollResults()`
- `canReadPayrollEmployeeDetail()`

## 4. Action Paling Kritis

### `generatePayrollPreview()`

Kenapa kritis:

- membaca input dari banyak modul;
- membuat payroll snapshot;
- menghitung result yang akan masuk payslip/export/finance.
- dipanggil otomatis ketika Finance/Super Admin membuka `/payroll` untuk periode yang belum `FINALIZED/PAID/LOCKED`.

Business rule:

- payroll tidak dihitung di browser;
- TEAMWORK memakai monthly point performance;
- MANAGERIAL memakai KPI;
- bonus kinerja memilih nominal tier 80/90/100 dari grade/salary source sesuai rentang performa, lalu engine membayar nominal itu langsung;
- SP1/SP2 mengurangi performa payroll secara absolut sebelum tier bonus dipilih, bukan mengalikan nominal bonus;
- bonus fulltime dan bonus disiplin membaca absensi periode; tanpa data absensi keduanya dibayar `0`;
- bonus disiplin tetap butuh performa payroll minimal 80%, bukan sekadar input persentase manual;
- bonus disiplin digate oleh `resolveDisciplineBonus()` dan tidak dipicu oleh persentase manual;
- ticket, incident, adjustment, status training/reguler, dan salary config masuk kalkulasi;
- snapshot dipakai agar histori tidak berubah.

### `finalizePayroll()`

Kenapa kritis:

- mengubah draft menjadi final;
- mengunci monthly performance dan activity terkait;
- harus idempotent dan audit-able.

### `approveTicket()`

Kenapa kritis:

- menentukan paid/unpaid leave;
- bisa consume quota;
- berdampak pada payroll.

### `generateMonthlyPerformance()`

Kenapa kritis:

- hasilnya menjadi input training dan payroll TEAMWORK;
- target mengikuti divisi snapshot dan target days jadwal.

### `updateEmployee()`

Kenapa kritis:

- menyentuh profil inti dan history;
- perubahan divisi/jabatan/grade/status memengaruhi snapshot periode berikutnya.

## 5. Catatan Umum

- Repo cukup konsisten memakai `revalidatePath()` setelah mutation.
- Banyak perubahan lintas tabel memakai transaction.
- Audit log paling jelas ada di payroll dan performance approval log.
- RLS belum terlihat sebagai sumber proteksi utama dalam repo; server-side role/scope check tetap wajib.
