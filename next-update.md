# Next Update Checklist - Payroll Rules Gap

Dokumen ini mencatat poin-poin dari request terbaru yang belum tersedia penuh di sistem saat ini.
Gunakan checklist ini saat implementasi bertahap agar progres bisa dipantau dengan jelas.

## Cara Pakai

- Ubah `[ ]` menjadi `[x]` jika poin sudah selesai diimplementasikan dan diverifikasi.
- Isi kolom `PIC`, `Tanggal`, dan `Catatan` setiap kali ada progress.
- Jika poin sudah parsial, pecah menjadi sub-task sampai benar-benar sesuai rule bisnis final.

## A. Tunjangan Masa Kerja Otomatis dari Lolos Training (Quarter Rule)

Status 2026-05-23: implemented di `src/server/payroll-engine/resolve-tenure-allowance.ts` dan dipakai `generatePayrollPreview()`. Catatan: bucket yang dipakai code aktual adalah Jan-Feb-Mar, Apr-Mei-Jun, Jul-Ags-Sep, dan Okt-Nov-Des.

- [x] Hitung otomatis tenure dari `trainingGraduationDate` (bukan input manual salary config)
- [x] Terapkan quarter mapping:
- [x] Jan-Feb-Mar -> aktif 1 tahun pada APR tahun berikutnya
- [x] Apr-Mei-Jun -> aktif 1 tahun pada JUL tahun berikutnya
- [x] Jul-Ags-Sep -> aktif 1 tahun pada OKT tahun berikutnya
- [x] Okt-Nov-Des -> aktif 1 tahun pada JAN tahun berikutnya
- [x] Gunakan hasil hitung tenure untuk komponen `tenureAllowancePaid` di payroll preview/final
- [x] Tambah unit test untuk semua skenario quarter boundary
- PIC:
- Tanggal:
- Catatan:

## B. Mitra Training - Prorata Bonus Fulltime & Disiplin

- [x] Tambahkan rule prorata bonus fulltime berdasarkan sisa hari kehadiran sejak lolos training dalam periode payroll berjalan
- [x] Tambahkan rule prorata bonus disiplin dengan metode prorata yang sama
- [x] Pastikan kasus lolos training di tengah periode tidak otomatis 0 bonus
- [x] Tambah test contoh: 13/26 hari -> bonus 50%
- PIC:
- Tanggal:
- Catatan:

## C. Overtime & Lembur + Uang Makan

Status 2026-05-23: matrix nominal dan komponen THP sudah ada di `src/server/actions/overtime.ts` dan `src/server/actions/payroll.ts`. Test per level overtime/lembur masih perlu ditambah.

- [x] Implementasikan matrix nominal:
- [x] 1 jam -> 11.000
- [x] 2 jam -> 22.000
- [x] 3 jam -> 33.000 + uang makan 10.000
- [x] Lembur 1 hari (8 jam + 1 istirahat / jam kerja 1 hari) -> 100.000 + uang makan 20.000
- [x] Pastikan komponen masuk ke `overtimeAmount` dan breakdown payslip/export
- [ ] Tambah test per level overtime/lembur
- PIC:
- Tanggal:
- Catatan:

## D. Penambalan Izin Tidak Masuk via Overtime

Status 2026-05-23: patch request sudah ada, tapi dampak ke eligibility fulltime masih perlu keputusan bisnis eksplisit.

- [x] Tambah rule patch izin/sakit/cuti dengan overtime 3 jam (maks 3x)
- [ ] Jika patch valid, fulltime bonus tetap eligible sesuai ketentuan
- [x] Hitung akumulasi uang overtime dan uang makan dari patch
- [x] Tambah guard agar tidak melebihi limit 3x dalam 1 periode
- PIC:
- Tanggal:
- Catatan:

## E. SP Aktif Per Quarter + Durasi SP2

- [ ] Simpan masa aktif SP berbasis quarter
- [ ] SP1 aktif sampai akhir quarter berjalan
- [ ] SP2 aktif selama 2 quarter
- [ ] Pada quarter setelah masa aktif berakhir, penalty tidak lagi diterapkan
- [ ] Pertahankan rule penalty: SP1 = 10%, SP2 = 20% (bonus-related)
- [ ] Tambah test timeline SP lintas quarter
- PIC:
- Tanggal:
- Catatan:

## F. Variable Pengurang Gaji (Structured Deductions)

- [x] Tambah variable `GANTI_RUGI_PERSONAL` (semua karyawan)
- [x] Tambah variable `GANTI_RUGI_TEAM` (khusus managerial)
- [x] Tambah variable `BPJS` (recurring selama status karyawan aktif)
- [x] Tambah variable `CICILAN` (dengan tenor dan sisa cicilan)
- [x] Tambah variable `KASBON` (maks 300.000 per bulan per karyawan)
- [ ] Tambah variable `MISSPRINT` (pengurangan poin kinerja terpisah dari incident umum)
- [ ] Tambah approval eksplisit jika dibutuhkan untuk kategori tertentu; validasi server dan audit payroll sudah ada untuk kategori yang implemented
- PIC:
- Tanggal:
- Catatan:

## G. Variable Penambah Gaji (Selain Gaji Pokok & Bonus Jabatan)

Status 2026-05-23: kategori penambah manual sudah ada untuk CSM/Printing dan master grade compensation sudah dipakai, tetapi fixed nominal prestasi teamwork 140/165 masih perlu finalisasi kebijakan nominal bila ingin dipisah dari master grade.

- [ ] Pastikan insentif prestasi teamwork:
- [ ] 140% -> 200.000
- [ ] 165% -> 400.000
- [x] Tambah variable manual `BONUS_OMSET_1_CSM` / `BONUS_OMSET_2_CSM` / `BONUS_OMSET_3_CSM`
- [x] Tambah variable manual `BONUS_KINERJA_CSM_TERTINGGI`
- [x] Tambah variable manual `BONUS_COUNTER_MESIN` (Teknisi Printing)
- [x] Tambah validasi eligibility per divisi/role
- [x] Tambah audit log untuk seluruh penambah manual implemented
- PIC:
- Tanggal:
- Catatan:

## H. Integrasi, Verifikasi, dan Release Readiness

- [ ] Semua rule baru berjalan di payroll preview
- [ ] Semua rule baru konsisten di finalize, paid, lock (idempotent)
- [ ] Breakdown payslip + export excel menampilkan komponen baru dengan benar
- [ ] Tambah test unit untuk engine baru
- [ ] Tambah test integrasi server action payroll terkait rules baru
- [ ] Update dokumen referensi bisnis jika ada perubahan detail rule
- PIC:
- Tanggal:
- Catatan:

## I. Perbaikan Jadwal Kerja Berbasis Master Shift Divisi

Latar belakang:
Pembuatan jadwal kerja ke depan harus mengacu ke master shift per divisi, bukan input jam manual bebas per hari.

Master shift rencana:
- Shift 1: 07:00-16:00  
  Cakupan: Finishing, Print, Desain, CSM, Offset, Pabrik, Rembu
- Shift 2A: 12:00-21:00  
  Cakupan: Finishing Perempuan, Print & Desain Perempuan, CSM
- Shift 2B: 14:00-23:00  
  Cakupan: Finishing Laki-laki, Print Laki-laki
- Shift 2C: 16:00-01:00  
  Cakupan: Khusus Desain
- Shift 3A: 14:00-19:00  
  Cakupan: Khusus CSM
- Shift 3B: 22:00-07:00  
  Cakupan: Finishing Laki-laki, Print Laki-laki
- Status IZIN  
  Penanda sistem jika karyawan sedang dalam status izin

Checklist implementasi:
- [x] Tambah master data shift (kode shift, jam masuk, jam pulang, lintas-hari/overnight flag, aktif/tidak)
- [ ] Tambah mapping shift ke divisi + constraint eligibility (termasuk gender jika dibutuhkan oleh rule operasional)
- [x] Integrasikan master shift ke page pembuatan jadwal kerja (`/master/work-schedules`)
- [x] Ubah form jadwal agar memilih shift dari master (bukan ketik jam manual utama)
- [x] Dukung shift malam lintas hari (contoh 16:00-01:00 dan 22:00-07:00) tanpa gagal validasi
- [ ] Tambah opsi status `IZIN` sebagai penanda sistem pada jadwal/attendance context
- [ ] Pastikan rule target poin dan payroll attendance tetap konsisten setelah integrasi shift
- [ ] Tambah audit log untuk perubahan master shift dan assignment shift
- [ ] Tambah unit test validasi shift (normal, lintas hari, dan status izin)
- [ ] Tambah test integrasi action CRUD shift + integrasi ke work schedule
- PIC:
- Tanggal:
- Catatan:

## J. Standarisasi Kategori Karyawan (Master Variable)

Tujuan:
Menetapkan referensi master yang konsisten untuk pengelompokan karyawan ke depan (cabang, divisi, group, posisi, grade).

### 1. Master Cabang

- TEKNOS
- WPI
- MAHARATU

### 2. Master Divisi

- SMB
- DESAIN
- PRINTING
- FINISHING
- REMBU
- OFFSET
- PABRIK

### 3. Master Group dan Posisi

Group:
- KPI BASED
- POIN BASED

Kelompok karyawan:
- KARYAWAN_TETAP (legacy MANAGERIAL)
- MITRA_KERJA (legacy TEAMWORK)
- BORONGAN
- TRAINING

Posisi:
- FINANCE
- HRD
- KABAG
- SPV
- MANAGERIAL
- TEAMWORK

### 4. Master Grade

- Kabag Grade 1
- Kabag Grade 2
- Kabag Grade 3
- Kabag Grade 4
- SPV Grade 1
- SPV Grade 2
- SPV Grade 3
- SPV Grade 4
- TL Grade 1
- TL Grade 2
- TL Grade 3
- TL Grade 4
- TL Printing Grade 1
- TL Printing Grade 2
- TL Printing Grade 3
- TL Printing Grade 4
- TL Desain Grade 1
- TL Desain Grade 2
- TL Desain Grade 3
- TL Desain Grade 4
- TL Offset Grade 1
- TL Offset Grade 2
- TL Offset Grade 3
- TL Offset Grade 4
- Staff Grade 1
- Staff Grade 2
- Staff Grade 3
- Staff Grade 4
- Staff Desain Grade 1
- Staff Desain Grade 2
- Staff Desain Grade 3
- Staff Desain Grade 4
- Staff Printing Grade 1
- Staff Printing Grade 2
- Staff Printing Grade 3
- Staff Printing Grade 4
- Staff Offset Grade 1
- Staff Offset Grade 2
- Staff Offset Grade 3
- Staff Offset Grade 4
- RnD, TPP Grade 1
- RnD, TPP Grade 2
- RnD, TPP Grade 3
- RnD, TPP Grade 4
- Operator Grade 1
- Operator Grade 2
- Operator Grade 3
- Operator Grade 4
- Operator Printing Grade 1
- Operator Printing Grade 2
- Operator Printing Grade 3
- Operator Printing Grade 4
- Op. Pound Grade 1
- Op. Pound Grade 2
- Op. Pound Grade 3
- Op. Pound Grade 4
- Op. Offset Grade 1
- Op. Offset Grade 2
- Op. Offset Grade 3
- Op. Offset Grade 4
- Administrasi
- TW Desain
- TW Offset
- TW Printing
- TW Produksi
- TW SM
- TW Support
- Training

Checklist implementasi:
- [x] Sinkronkan master `branches` sesuai daftar cabang final
- [x] Sinkronkan master `divisions` sesuai daftar divisi final
- [x] Tetapkan mapping `group -> posisi` yang valid (hindari kombinasi bebas)
- [ ] Tetapkan mapping `posisi -> grade` yang valid (whitelist per posisi)
- [ ] Tambah validasi server-side pada create/update employee agar mengikuti mapping di atas
- [x] Siapkan migration/seed untuk update data master existing
- [ ] Siapkan script data-cleanup untuk karyawan yang posisinya belum sesuai katalog baru
- [ ] Tambah test validasi kombinasi `group + posisi + grade`
- [ ] Update dokumen onboarding/curriculum setelah mapping final disepakati
- PIC:
- Tanggal:
- Catatan:

## K. Master Tunjangan dan Bonus Melekat per Jabatan

Tujuan:
Menjadikan data tunjangan + bonus per jabatan/grade sebagai master resmi untuk payroll engine.

Sumber data acuan:
- File JSON: `C:\Users\DIMAS\Downloads\database_tunjangan_bonus_jabatan.json`
- Key utama: `database_tunjangan_bonus_jabatan`

Komponen yang wajib diadopsi dari master:
- `jabatan`
- `tunjangan`
- `bonus.kinerja` (80/90/100)
- `bonus.kinerja_team` (80/90/100)
- `bonus.disiplin` (80/90/100)
- `bonus.prestasi` (140/165)

Catatan data:
- Nilai `null` harus diperlakukan sebagai `tidak berlaku` untuk jabatan terkait.
- Terdapat jabatan tertentu dengan `tunjangan = null` (contoh beberapa kategori TW) dan harus tetap valid di sistem.
- Data ini harus menjadi referensi utama mapping jabatan/grade ke nominal payroll, bukan input manual bebas.

Checklist implementasi:
- [x] Tambah master table/config untuk menyimpan skema tunjangan+bonus per jabatan
- [x] Import/sinkronisasi semua entri dari `database_tunjangan_bonus_jabatan.json`
- [ ] Tambah validasi agar `jabatan` pada master ini konsisten dengan master grade/position (Section J)
- [x] Implement resolver payroll yang membaca nominal otomatis dari master jabatan ini
- [x] Tangani fallback saat nilai bonus/tunjangan `null` (tidak dibayar, bukan error)
- [ ] Tambah audit log ketika ada perubahan nominal master tunjangan/bonus
- [ ] Tambah test unit resolver nominal untuk contoh jabatan:
- [ ] Kabag Grade 1
- [ ] TL Desain Grade 1
- [ ] Operator Printing Grade 4
- [ ] TW Desain
- [ ] Training
- [ ] Pastikan hasil nominal muncul konsisten di preview, detail payroll, payslip PDF, dan export Excel
- PIC:
- Tanggal:
- Catatan:

## L. Settings Akun Login (Self-Service)

Tujuan:
Menyediakan halaman settings untuk akun yang sedang login agar bisa mengelola profil akun sendiri.

Checklist implementasi:
- [x] Buat halaman `/settings` untuk akun login aktif
- [x] Tambahkan form edit `username`, `email`, `nomor HP`, dan `password`
- [x] Simpan perubahan profil karyawan (`nickname`, `phoneNumber`) via server action
- [x] Simpan perubahan auth (`email`, `password`, metadata username) via Supabase server client
- [ ] Tambah upload/ganti foto profil akun
- [ ] Tambah audit log perubahan kredensial/profil akun
- [ ] Tambah test validasi form settings
- PIC:
- Tanggal:
- Catatan:
