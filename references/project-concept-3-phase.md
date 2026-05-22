# Konsep Proyek: Dashboard HRD Terintegrasi

**Versi:** 1.0  
**Tanggal:** 27 April 2026  
**Disusun oleh:** AI Project Concept Architect  
**Basis pembahasan:** Diskusi konsep Manajemen Poin Kinerja, Profiling Karyawan, Review Karyawan, Ticketing Izin/Sakit/Cuti, dan Payroll System.

> Catatan penyelarasan code 2026-05-22: dokumen ini adalah konsep bisnis; untuk status implementasi aktual gunakan kurikulum codebase terbaru.

---

## 1. Ringkasan Eksekutif

Dashboard HRD Terintegrasi adalah sistem internal untuk mengelola data karyawan, produktivitas kerja, evaluasi performa, ticketing izin/sakit/cuti, serta payroll. Sistem ini dibangun dengan tiga ekosistem utama: **Profiling Karyawan**, **Manajemen Poin Kinerja**, dan **Payroll System**.

Fokus awal proyek adalah membangun dasar data karyawan yang kuat, lalu menghubungkannya dengan pencatatan aktivitas harian berbasis poin untuk kelompok TEAMWORK/TW/Operator. Data poin yang sudah disetujui oleh SPV akan menjadi dasar perhitungan performa bulanan, bonus kinerja, bonus prestasi, evaluasi training, dan payroll.

Selain poin produktivitas, sistem juga membutuhkan fitur **Review Karyawan** untuk menilai kualitas kerja, disiplin, pemahaman instruksi, SOP, inisiatif, 5R, dan tanggung jawab. Fitur review ini melengkapi sistem poin karena poin mengukur kuantitas/output, sedangkan review mengukur kualitas/sikap kerja.

Sistem juga akan dilengkapi **Ticketing Izin/Sakit/Cuti** yang berperan penting dalam menentukan target poin, status kehadiran, alpa, potongan gaji, bonus fulltime, dan kuota cuti. Payroll kemudian menjadi final calculation engine yang mengambil data final dari Profiling, Poin Kinerja, Ticketing, Review, Absensi/Jadwal, dan Master Payroll.

---

## 2. Pembagian 3 Phase Besar

Dokumen ini membagi proyek menjadi 3 phase utama agar pengembangan lebih terarah.

| Phase | Nama Phase | Fokus Utama | Output Utama |
|---|---|---|---|
| Phase 1 | Profiling Karyawan & Master Data Foundation | Membangun fondasi data karyawan, role, jabatan, grade, divisi, status kerja, jadwal, dan histori | Master data karyawan siap dipakai oleh modul poin, ticketing, review, dan payroll |
| Phase 2 | Performance Management Engine | Membangun Manajemen Poin Kinerja, Review Karyawan, Training Evaluation, dan Ticketing Izin/Sakit/Cuti | Data performa, target poin, approval SPV, review, dan absensi/ticketing siap menjadi input payroll |
| Phase 3 | Payroll System & Finance Closing | Menghitung gaji, bonus, potongan, kuota cuti, overtime, SP penalty, adjustment, dan history payroll | Payroll final, slip gaji, payroll history, audit trail, dan dashboard finance |

Alasan urutan phase:

1. **Profiling Karyawan harus menjadi fondasi**, karena semua modul bergantung pada data karyawan, divisi, status, grade, jadwal, dan SPV.
2. **Performance Management berjalan setelah fondasi data siap**, karena poin, review, ticketing, dan training membutuhkan profil karyawan yang konsisten.
3. **Payroll menjadi phase terakhir**, karena payroll harus mengambil data final dari semua modul sebelumnya.

---

## 3. Latar Belakang Masalah

### Kondisi Saat Ini

Beberapa data penting masih berada dalam format spreadsheet, antara lain:

- rincian poin pekerjaan per divisi,
- trial payroll,
- evaluasi teamwork,
- data produksi/evaluasi divisi,
- prototype code payroll finance.

Spreadsheet tersebut sudah memiliki konsep dasar yang baik, tetapi masih rawan masalah saat dijadikan proses operasional harian, seperti:

- data tersebar di beberapa file,
- formula payroll sulit diaudit,
- review karyawan belum terstruktur sebagai database,
- approval poin belum menjadi workflow formal,
- izin/sakit/cuti belum otomatis memengaruhi target poin dan payroll,
- perubahan master poin/grade/divisi berisiko mengubah histori lama,
- payroll belum memiliki breakdown komponen yang kuat untuk audit.

### Masalah Utama

1. **Penilaian performa belum sepenuhnya terintegrasi** antara output kerja, review kualitas, absensi, dan payroll.
2. **Poin kinerja perlu sistem approval dan locking**, agar data yang masuk payroll valid.
3. **Profiling karyawan perlu menjadi master data utama**, bukan hanya biodata.
4. **Ticketing izin/sakit/cuti perlu rule otomatis**, karena langsung berdampak ke target poin, gaji pokok, bonus fulltime, dan payroll.
5. **Payroll perlu calculation engine yang auditable**, bukan hanya hasil THP akhir.

### Peluang Perbaikan

Dashboard HRD dapat mengubah seluruh proses menjadi lebih objektif, transparan, dan siap audit:

- karyawan input aktivitas harian,
- SPV approve/tolak,
- HRD memonitor dashboard,
- sistem menghitung performa bulanan,
- ticketing mengatur status izin/sakit/cuti,
- payroll menghitung gaji dan bonus dari data final.

---

## 4. Tujuan dan Outcome

| Jenis | Penjelasan |
|---|---|
| Tujuan bisnis | Membuat sistem HRD dan payroll yang lebih objektif, terukur, dan dapat diaudit |
| Tujuan pengguna | Memudahkan TW, SPV, HRD, Finance, dan Manajemen dalam mencatat, memvalidasi, dan menghitung performa serta payroll |
| Outcome utama | Tersedianya dashboard HRD terintegrasi dengan data karyawan, poin, review, ticketing, dan payroll |
| Indikator keberhasilan | Data payroll bisa ditelusuri ke sumbernya, poin disetujui SPV, target poin sesuai jadwal, izin/sakit/cuti terhitung otomatis, dan histori karyawan tersimpan rapi |

---

## 5. Target Pengguna dan Aktor

| Aktor | Deskripsi | Kebutuhan Utama | Hak Akses/Peran |
|---|---|---|---|
| Karyawan TEAMWORK/TW/Operator | Karyawan produksi/operasional yang dinilai berdasarkan poin | Input aktivitas, lihat poin, ajukan izin/sakit/cuti | Input aktivitas harian, submit tiket, lihat histori pribadi |
| Karyawan Training | Karyawan baru dalam masa training | Input aktivitas, progres training, evaluasi kelulusan | Sama seperti TW, tetapi poin untuk evaluasi training, bukan bonus |
| SPV Divisi | Atasan langsung di divisi | Approve/tolak input, review karyawan, validasi tiket tertentu | Melihat data divisinya sendiri, approve/tolak, beri catatan |
| HRD | Pengelola data karyawan dan evaluasi | Monitor seluruh divisi, validasi review, override, closing data HR | Akses lintas divisi, validasi, override dengan alasan, monitoring |
| Finance/Payroll | Pengelola payroll | Generate payroll, review exception, finalisasi, history | Akses payroll, potongan, tambahan, closing, slip gaji |
| Admin Sistem | Pengelola konfigurasi | Master data, role, variabel sistem, master poin/payroll | CRUD master data dan konfigurasi sistem |
| Manajemen | Pengambil keputusan | Ringkasan performa, produktivitas, payroll, tren SDM | Dashboard summary dan laporan strategis |

---

## 6. Scope Proyek

### Termasuk dalam Scope Versi Awal

- Profiling Karyawan
- Master divisi, jabatan, grade, kelompok karyawan, dan status kerja
- Manajemen Poin Kinerja TEAMWORK
- Approval SPV atas aktivitas harian
- Target poin harian dan bulanan
- Training Evaluation berbasis poin dan review
- Review Karyawan bulanan
- Ticketing izin/sakit/cuti
- Leave quota dasar untuk karyawan > 1 tahun
- Payroll System dengan komponen gaji, bonus, potongan, overtime, dan adjustment
- Dashboard HRD dan Payroll
- Audit trail dan locking periode

### Di Luar Scope Awal

- Integrasi otomatis ke bank/payment gateway
- Integrasi mesin absensi fisik, kecuali nanti tersedia datanya
- Modul KPI managerial yang sangat detail, kecuali sebagai sumber nilai KPI bulanan
- Mobile app native khusus, kecuali sistem web responsive
- Approval multi-level kompleks untuk semua transaksi, kecuali rule dasar SPV/HRD/Finance

### Asumsi Scope

- Sistem awal berbentuk dashboard internal berbasis web.
- Periode payroll menggunakan tanggal 26 sampai 25.
- TEAMWORK/TW/Operator memakai poin kinerja.
- Managerial memakai KPI, bukan poin.
- Payroll mengikuti base rule dari prototype finance yang sudah dianalisis.

---

## 7. Arsitektur Konsep Modul

```text
Dashboard HRD Terintegrasi
|
|-- Phase 1: Profiling Karyawan & Master Data Foundation
|   |-- Employee Profile
|   |-- Master Divisi
|   |-- Master Jabatan & Grade
|   |-- Employee Group: MANAGERIAL / TEAMWORK
|   |-- Status Kerja: Training / Reguler / Nonaktif / Resign
|   |-- Jadwal Kerja
|   |-- Histori Divisi/Jabatan/Grade/SPV
|   |-- Role & Access Control
|
|-- Phase 2: Performance Management Engine
|   |-- Manajemen Poin Kinerja
|   |-- Master Poin Pekerjaan
|   |-- Input Aktivitas Harian
|   |-- Approval SPV
|   |-- Monthly Point Performance
|   |-- Training Evaluation
|   |-- Review Karyawan
|   |-- Incident Log
|   |-- Ticketing Izin/Sakit/Cuti
|   |-- Leave Quota Impact
|
|-- Phase 3: Payroll System & Finance Closing
    |-- Payroll Period
    |-- Employee Payroll Snapshot
    |-- Salary Config
    |-- Master Payroll/Jabatan
    |-- Payroll Calculation Engine
    |-- Additions
    |-- Deductions
    |-- Overtime
    |-- SP Penalty
    |-- Payroll Adjustment
    |-- Payroll History
    |-- Payslip
```

---

# PHASE 1 - PROFILING KARYAWAN & MASTER DATA FOUNDATION

## 8. Tujuan Phase 1

Phase 1 bertujuan membangun fondasi data karyawan yang konsisten. Modul ini bukan hanya biodata, tetapi menjadi pusat data yang mengatur:

- identitas karyawan,
- cabang/penempatan,
- divisi,
- jabatan,
- grade payroll,
- kelompok karyawan,
- status training/reguler,
- SPV penanggung jawab,
- jadwal kerja,
- histori perubahan,
- relasi ke poin, review, ticketing, dan payroll.

Tanpa Profiling yang kuat, modul Poin Kinerja dan Payroll akan sulit akurat.

---

## 9. Struktur Profil Karyawan

### 9.1 Data Identitas Dasar

| Field | Keterangan | Wajib |
|---|---|---|
| employee_id / NIK | ID unik karyawan | Ya |
| nama_lengkap | Nama resmi | Ya |
| nama_panggilan | Nama informal | Opsional |
| foto | Foto profil | Opsional |
| nomor_hp | Kontak karyawan | Opsional |
| alamat | Alamat domisili | Opsional |
| tanggal_masuk | Tanggal mulai kerja/training | Ya |

### 9.2 Data Penempatan dan Organisasi

| Field | Keterangan | Wajib |
|---|---|---|
| cabang / penempatan | Lokasi kerja | Ya |
| divisi_aktif | Divisi operasional saat ini | Ya |
| jabatan | TW, Operator, Staff, TL, SPV, Kabag, dll | Ya |
| jobdesk | Posisi spesifik seperti Packing, Rill, Operator G.1 | Opsional tetapi direkomendasikan |
| grade_payroll | Grade untuk mapping gaji/bonus | Ya |
| spv_id | SPV penanggung jawab | Ya untuk TEAMWORK |

### 9.3 Kelompok dan Status Karyawan

| Field | Nilai | Fungsi |
|---|---|---|
| employee_group | MANAGERIAL / TEAMWORK | Menentukan metode penilaian |
| employment_status | Training / Reguler / Nonaktif / Resign | Menentukan eligibility sistem |
| payroll_status | Training / Reguler / Final Payroll / Nonaktif | Menentukan skema payroll |
| tanggal_lulus_training | Tanggal lulus training | Menentukan kapan masuk TW reguler |

### 9.4 Data Jadwal Kerja

Karena target poin bulanan mengikuti jadwal masing-masing karyawan, profil harus terhubung dengan jadwal kerja.

| Field | Fungsi |
|---|---|
| status_hari | Kerja, Off, Cuti, Sakit, Izin, Alpa, Setengah Hari |
| masuk_target_poin | Ya/Tidak |
| target_poin_harian | Default 13.000 jika masuk target, override 39.000 untuk divisi Offset berdasarkan divisi payroll snapshot |
| sumber_status | Schedule, Ticket Approved, HRD Override, Payroll Locked |

---

## 10. Histori Profil Karyawan

Profil karyawan wajib memiliki histori perubahan agar payroll dan performa tidak berubah karena update data terbaru.

| Histori | Fungsi |
|---|---|
| Histori divisi | Untuk perpindahan divisi dan payroll snapshot |
| Histori jabatan | Untuk perubahan jabatan/promosi |
| Histori grade | Untuk perubahan nominal payroll |
| Histori SPV | Untuk perubahan atasan/approval |
| Histori status kerja | Training, reguler, resign, nonaktif |
| Histori payroll | Untuk audit skema gaji/bonus |

Aturan penting:

```text
Payroll memakai snapshot awal periode.
Perubahan divisi/jabatan/grade di tengah periode tidak mengubah payroll periode berjalan,
kecuali HRD melakukan adjustment resmi.
```

---

## 11. Tampilan Profil Karyawan yang Direkomendasikan

Satu halaman profil karyawan sebaiknya dibagi menjadi tab:

| Tab | Isi Utama |
|---|---|
| Ringkasan | Identitas, status, divisi, jabatan, grade, SPV, performa bulan ini, review terakhir |
| Data Kepegawaian | Tanggal masuk, status, histori divisi, histori jabatan, histori grade |
| Poin Kinerja | Grafik poin harian, target, total approved, persentase, ranking |
| Review/Penilaian | Nilai review per periode, aspek review, catatan SPV/HRD |
| Absensi & Ticketing | Cuti, sakit, izin, alpa, setengah hari, kuota cuti, histori tiket |
| Catatan HRD | Pelanggaran, pembinaan, warning letter, penghargaan, mutasi |
| Payroll Link | Status payroll, grade, komponen gaji, histori slip, adjustment |

---

## 12. Deliverable Phase 1

| Deliverable | Deskripsi | Prioritas |
|---|---|---|
| Master Employee Profile | Data karyawan lengkap | P0 |
| Master Divisi | Daftar divisi dan relasi SPV | P0 |
| Master Jabatan & Grade | Mapping jabatan ke payroll | P0 |
| Employee Group | MANAGERIAL / TEAMWORK | P0 |
| Status Training/Reguler | Menentukan skema performa dan payroll | P0 |
| Jadwal Kerja | Dasar target poin dan payroll attendance | P0 |
| Histori Perubahan | Divisi, jabatan, grade, SPV, status | P1 |
| Role & Access Control | Hak akses TW, SPV, HRD, Finance, Admin | P0 |

---

# PHASE 2 - PERFORMANCE MANAGEMENT ENGINE

## 13. Tujuan Phase 2

Phase 2 adalah inti operasional performa. Modul ini mengubah aktivitas harian menjadi data performa bulanan dan melengkapi penilaian dengan review, training evaluation, dan ticketing.

Phase 2 terdiri dari:

1. Manajemen Poin Kinerja,
2. Review Karyawan,
3. Training Evaluation,
4. Ticketing Izin/Sakit/Cuti,
5. Incident Log dan pengaruh ke review/payroll.

---

## 14. Manajemen Poin Kinerja

### 14.1 Prinsip Dasar

Modul poin hanya digunakan untuk kelompok:

```text
TEAMWORK / TW / Operator
```

Kelompok MANAGERIAL seperti Kabag, SPV, TL, dan Staff tidak memakai sistem poin. Mereka memakai KPI bulanan.

### 14.2 Target Poin

Target dasar:

```text
Default target harian = 13.000 poin
Override target harian divisi Offset = 39.000 poin
```

Rule resolusi target:

```text
Target harian mengikuti divisi payroll snapshot / divisi awal periode.
Jika divisi payroll snapshot = Offset, target harian = 39.000.
Jika bukan Offset, target harian = 13.000.
```

Target bulanan:

```text
Target Poin Bulanan = Target Harian Terselesaikan x Jumlah Hari Masuk Target
```

Periode rekap:

```text
Tanggal 26 bulan sebelumnya sampai tanggal 25 bulan berjalan
```

### 14.3 Status Hari dan Dampaknya ke Target

| Status Hari | Masuk Target? | Target Hari Itu | Poin Aktual |
|---|---:|---:|---:|
| Kerja normal | Ya | 13.000 default / 39.000 Offset | Sesuai input approved |
| Masuk setengah hari | Ya | 13.000 default / 39.000 Offset | Sesuai input approved |
| Alpa / tanpa izin | Ya | 13.000 default / 39.000 Offset | 0 |
| Cuti approved | Tidak | 0 | 0 |
| Sakit approved | Tidak | 0 | 0 |
| Izin approved | Tidak | 0 | 0 |
| Off / libur jadwal | Tidak | 0 | 0 |

### 14.4 Rumus Persentase Kinerja

```text
Persentase Kinerja Bulanan = Total Poin Approved / Target Poin Bulanan x 100%
```

Contoh divisi non-Offset:

```text
Hari masuk target = 22 hari
Target bulanan = 22 x 13.000 = 286.000 poin
Total poin approved = 257.400 poin
Persentase = 257.400 / 286.000 x 100% = 90%
```

Contoh divisi Offset:

```text
Hari masuk target = 22 hari
Target bulanan = 22 x 39.000 = 858.000 poin
Total poin approved = 772.200 poin
Persentase = 772.200 / 858.000 x 100% = 90%
```

---

## 15. Workflow Input Poin Harian

```text
TW/Operator login
-> pilih tanggal kerja
-> pilih pekerjaan sesuai divisi aktual harian
-> isi jumlah pekerjaan
-> sistem ambil poin master
-> sistem hitung total poin
-> TW submit
-> SPV review
-> SPV approve atau tolak
-> jika approve, poin masuk rekap
-> jika tolak, input kembali ke TW untuk revisi
-> data approved masuk dashboard HRD dan payroll
```

### Deadline

| Aktivitas | Deadline |
|---|---|
| TW input aktivitas | Maksimal H+1 dari tanggal kerja |
| SPV approve/tolak | Maksimal H+2 setelah input dari TW |
| TW revisi setelah ditolak | Maksimal H+1 setelah penolakan SPV |
| SPV approve ulang | Maksimal H+1 setelah submit ulang |

### Status Transaksi

| Status | Arti |
|---|---|
| Draft | Belum disubmit |
| Diajukan | Menunggu SPV |
| Ditolak SPV | Ditolak dengan alasan |
| Revisi oleh TW | Sedang diperbaiki TW |
| Diajukan Ulang | Submit ulang setelah revisi |
| Disetujui SPV | Sah masuk rekap |
| Override HRD | Diperbaiki/disahkan HRD dengan alasan |
| Dikunci Payroll | Masuk closing payroll dan tidak bisa diedit normal |

---

## 16. Master Poin Pekerjaan

Master poin berasal dari file rincian poin 2026 dan harus dikunci menggunakan versioning.

| Field | Keterangan |
|---|---|
| kode_pekerjaan | ID unik pekerjaan |
| divisi | Divisi pemilik pekerjaan |
| nama_pekerjaan | Nama aktivitas |
| poin_satuan | Nilai poin per satuan |
| satuan | pcs, job, lembar, transaksi, dll |
| versi_master | Contoh: 2026-v1 |
| status | Aktif, Nonaktif, Perlu Review, Arsip |
| berlaku_mulai | Tanggal mulai berlaku |
| berlaku_sampai | Tanggal akhir jika diganti |

Setiap transaksi wajib menyimpan snapshot:

```text
ID master poin
Versi master poin
Nama pekerjaan saat input
Poin satuan saat input
Satuan saat input
Divisi saat input
```

Tujuannya agar perubahan master poin di masa depan tidak mengubah histori lama.

---

## 17. Aturan Bonus Kinerja TEAMWORK

Level bonus kinerja:

| Persentase Kinerja Bulanan | Bonus Kinerja | Bonus Prestasi |
|---:|---|---|
| < 80% | Tidak dapat | Tidak dapat |
| 80% - 89,99% | Bonus kinerja 80% | Tidak dapat |
| 90% - 99,99% | Bonus kinerja 90% | Tidak dapat |
| 100% - 139,99% | Bonus kinerja 100% | Tidak dapat |
| 140% - 164,99% | Bonus kinerja 100% | Bonus prestasi 140% |
| >= 165% | Bonus kinerja 100% | Bonus prestasi 165% saja |

Aturan:

```text
Jika mencapai 165%, hanya dapat bonus prestasi 165%, bukan 140% + 165%.
Persentase tidak dibulatkan untuk menentukan level bonus.
Nominal bonus kinerja tier 80/90/100 dibayar langsung sesuai rentang, tidak dikalikan lagi dengan persen tier.
```

Contoh:

| Persentase Aktual | Level |
|---:|---|
| 79,99% | Tidak dapat bonus |
| 80,00% | Bonus 80% |
| 89,99% | Tetap bonus 80% |
| 90,00% | Bonus 90% |
| 99,99% | Tetap bonus 90% |
| 100,00% | Bonus 100% |
| 139,99% | Tetap bonus 100% |
| 140,00% | Bonus prestasi 140% |
| 165,00% | Bonus prestasi 165% |

---

## 18. Training Evaluation

Karyawan baru masuk sebagai Training.

Aturan umum:

```text
Gaji training = Rp1.000.000 / bulan
Jika masuk tengah periode, gaji training prorate
Poin tetap dihitung
Poin tidak menentukan bonus
Poin digunakan untuk evaluasi kelulusan training
Minimal training = 1 bulan
Maksimal training = 3 bulan
```

Jika tidak lolos training:

```text
Karyawan dapat dikeluarkan atau dialihkan training ke divisi lain.
```

Jika lulus training di tengah periode:

```text
Status TW Reguler efektif mulai periode payroll berikutnya.
```

### Standar Lulus Training per Divisi

| Divisi | Minimal Persentase Training |
|---|---:|
| Creative | 70% |
| Printing | 75% |
| Finishing | 80% |
| Logistic | 80% |
| Offset | 80% |
| Blangko / Pabrik | 80% |

Catatan:

```text
Divisi yang belum memiliki standar eksplisit seperti AFT, CSM, Sablon, Rembu, Gudang, dan RnD perlu dipetakan atau dibuatkan standar sendiri.
```

---

## 19. Aturan Perpindahan Divisi

Ada dua konsep divisi:

| Jenis Divisi | Fungsi |
|---|---|
| Divisi Aktual Harian | Menentukan pekerjaan yang dapat diinput pada hari tersebut |
| Divisi Payroll Snapshot | Menentukan perhitungan bonus periode berjalan |

Aturan:

```text
Input pekerjaan mengikuti aktivitas aktual harian.
Payroll/bonus/performa target tetap memakai snapshot divisi awal periode.
```

Jika karyawan pindah divisi di tengah periode:

```text
Perhitungan bonus dan target poin tetap mengikuti divisi snapshot sebelumnya sampai periode berjalan selesai.
Divisi baru efektif untuk target performa dan payroll di periode berikutnya.
```

---

## 20. Review Karyawan

Review Karyawan adalah fitur penilaian kualitas kerja yang melengkapi sistem poin.

| Komponen | Fungsi |
|---|---|
| Poin Kinerja | Mengukur kuantitas/output kerja |
| Review Karyawan | Mengukur kualitas, disiplin, SOP, instruksi, inisiatif, 5R, dan tanggung jawab |
| Training Evaluation | Menentukan kelulusan trainee |
| KPI | Menilai managerial/staff |

### Aspek Review Rekomendasi

| Aspek Review | Bobot Rekomendasi | Sumber Penilaian |
|---|---:|---|
| SOP & Kualitas Kerja | 25% | Komplain, pemahaman SOP, kesalahan kerja |
| Pemahaman Instruksi | 15% | Kemampuan menjalankan arahan |
| Absensi & Disiplin | 20% | Telat, alpa, izin, kepatuhan jam kerja |
| Inisiatif, Teamwork & 5R | 20% | Inisiatif, kebersihan, kerja sama |
| Miss Proses & Tanggung Jawab | 20% | Miss produksi, deadline miss, pelanggaran |

### Skala Nilai

| Skor | Kategori | Arti |
|---:|---|---|
| 5 | Sangat Baik | Konsisten dan bisa menjadi contoh |
| 4 | Baik | Sesuai standar |
| 3 | Cukup | Perlu pembinaan ringan |
| 2 | Kurang | Sering bermasalah |
| 1 | Buruk | Tidak memenuhi standar |

Rumus:

```text
Nilai Review = Rata-rata tertimbang skor / 5 x 100
```

Kategori:

| Nilai Review | Kategori |
|---:|---|
| 90 - 100 | Sangat Baik |
| 80 - 89,99 | Baik |
| 70 - 79,99 | Cukup |
| 60 - 69,99 | Kurang |
| < 60 | Buruk |

### Workflow Review

```text
Periode payroll selesai
-> sistem mengumpulkan data poin, absensi, telat, alpa, komplain, miss proses
-> SPV membuka form review
-> sistem menampilkan ringkasan otomatis
-> SPV memberi skor dan catatan
-> HRD validasi
-> review dikunci
-> hasil masuk ke profil karyawan
```

---

## 21. Incident Log

Incident Log mencatat kejadian yang memengaruhi review dan bisa berdampak ke payroll.

Contoh incident:

| Kejadian | Dampak Review | Dampak Payroll Potensial |
|---|---|---|
| Komplain | Mengurangi SOP & Kualitas Kerja | Tidak langsung |
| Miss proses | Mengurangi Miss Proses & Tanggung Jawab | Bisa menjadi potongan/ganti rugi |
| Telat | Mengurangi Absensi & Disiplin | Bisa gugur bonus disiplin |
| Area kerja kotor | Mengurangi Inisiatif, Teamwork & 5R | Tidak langsung |
| Pelanggaran sengaja | Mengurangi Tanggung Jawab | Bisa SP penalty |
| SP1/SP2 | Catatan serius | Mengurangi bonus, bukan gaji pokok |

---

## 22. Ticketing Izin/Sakit/Cuti

Ticketing digunakan agar izin, sakit, cuti, setengah hari, dan emergency leave tercatat resmi.

Jenis tiket:

| Jenis Tiket | Efek ke Target Poin | Efek ke Payroll |
|---|---|---|
| Cuti | Target 0 jika approved | Paid atau unpaid tergantung kuota |
| Sakit | Target 0 jika approved | Paid atau unpaid tergantung kuota/rule |
| Izin | Target 0 jika approved | Paid atau unpaid tergantung pilihan/rule |
| Emergency | Target 0 jika approved | Tergantung validasi HRD/SPV |
| Setengah Hari | Tetap target penuh sesuai hasil resolusi divisi | Tergantung rule payroll |

### Workflow Ticketing

```text
Karyawan mengajukan tiket
-> pilih jenis tiket
-> pilih tanggal atau rentang tanggal
-> isi alasan
-> upload bukti jika wajib
-> sistem validasi aturan
-> status menjadi Auto Approved / Auto Rejected / Need Review
-> jika approved, sistem update jadwal, target poin, dan payroll impact
```

### Status Tiket

| Status | Arti |
|---|---|
| Draft | Belum dikirim |
| Submitted | Sudah diajukan |
| Auto Approved | Disetujui otomatis oleh sistem |
| Auto Rejected | Ditolak otomatis oleh sistem |
| Need Review | Butuh review SPV/HRD |
| Approved by SPV | Disetujui SPV |
| Approved by HRD | Disetujui HRD |
| Rejected | Ditolak |
| Cancelled | Dibatalkan |
| Locked | Sudah masuk payroll closing |

---

## 23. Leave Quota dan Paid Leave

Aturan dasar:

```text
Secara default izin/sakit/cuti harian tidak dibayar.
Artinya gaji pokok dipotong dan bonus fulltime tidak didapat.
```

Rule tambahan:

```text
Jika karyawan sudah bekerja lebih dari 1 tahun dan memiliki tunjangan tahunan,
maka karyawan memiliki kuota cuti bulanan 1 kali dan cuti tahunan sampai 3 kali.
```

Efek cuti berkuota:

```text
Gaji pokok tidak dipotong.
Uang harian tidak dibayar jika tidak hadir.
Bonus fulltime tetap tidak didapat.
Target poin tidak dihitung.
```

### Auto Logic

Kasus pertama dalam periode:

```text
Jika karyawan eligible cuti dan izin/sakit pertama kali pada periode tersebut,
sistem otomatis mengambil kuota cuti bulanan 1 kali.
```

Kasus kedua dan seterusnya:

```text
Sistem memberi pilihan:
1. Gunakan kuota cuti tahunan
2. Ajukan izin biasa/unpaid leave
```

Jika pilih cuti tahunan:

```text
Kuota tahunan berkurang.
Gaji pokok tidak dipotong.
Bonus fulltime tidak didapat.
```

Jika pilih izin biasa:

```text
Gaji pokok dipotong.
Bonus fulltime tidak didapat.
```

---

## 24. Deliverable Phase 2

| Deliverable | Deskripsi | Prioritas |
|---|---|---|
| Master Poin Pekerjaan | Master aktivitas dan poin per divisi | P0 |
| Input Aktivitas Harian | Form input TW | P0 |
| Approval SPV | Approve/tolak dengan catatan | P0 |
| Monthly Point Performance | Rekap target, total poin, persentase | P0 |
| Training Evaluation | Evaluasi trainee per divisi | P0 |
| Review Karyawan | Penilaian kualitas kerja bulanan | P1 |
| Incident Log | Catatan pelanggaran/miss/komplain | P1 |
| Ticketing Izin/Sakit/Cuti | Pengajuan izin dan dampak ke target/payroll | P0 |
| Leave Quota | Kuota bulanan/tahunan untuk eligible employee | P1 |
| Dashboard HRD Performance | Total poin, produktivitas divisi, histori pekerjaan, training | P0 |

---

# PHASE 3 - PAYROLL SYSTEM & FINANCE CLOSING

## 25. Tujuan Phase 3

Payroll System adalah final calculation engine. Payroll tidak menjadi tempat input data mentah utama, tetapi mengambil data final dari modul lain.

Sumber data payroll:

```text
Profiling Karyawan = identitas, status, grade, gaji pokok, snapshot
Poin Kinerja = performa TEAMWORK
KPI = performa MANAGERIAL
Ticketing = izin/sakit/cuti, paid/unpaid leave
Jadwal/Absensi = hadir, telat, alpa, hari kerja
Review/Incident = SP, missprint, pelanggaran, disiplin
Payroll Master = gaji, tunjangan, bonus, variabel
Additions/Deductions = tambahan dan potongan manual
```

---

## 26. Periode Payroll

Periode payroll:

```text
Tanggal 26 bulan sebelumnya sampai tanggal 25 bulan berjalan
```

Status periode:

| Status | Arti |
|---|---|
| OPEN | Periode berjalan, data operasional masuk |
| DATA_REVIEW | Data poin, ticketing, absensi, dan review dicek |
| DRAFT | Payroll preview dapat dihitung |
| FINALIZED | Payroll final sudah disetujui |
| PAID | Payroll sudah dibayarkan |
| LOCKED | Data periode terkunci |

---

## 27. Skema Payroll per Kelompok Karyawan

### 27.1 TEAMWORK Training

```text
THP = Gaji Training Prorate + Tambahan Manual - Potongan
```

Aturan:

- Gaji training = Rp1.000.000/bulan.
- Jika masuk tengah periode, prorate berdasarkan hari aktif/kerja dalam periode.
- Tidak mendapat bonus kinerja poin.
- Tidak mendapat bonus prestasi.
- Poin hanya untuk evaluasi lulus training.

### 27.2 TEAMWORK Reguler

```text
THP =
Gaji Pokok Dibayar
+ Tunjangan Grade
+ Tunjangan Masa Kerja
+ Uang Harian
+ Overtime
+ Bonus Fulltime
+ Bonus Disiplin
+ Bonus Kinerja Poin
+ Bonus Prestasi
+ Penambah Manual
- Potongan
- Potongan Unpaid Leave
+/- Adjustment
```

### 27.3 MANAGERIAL

```text
THP =
Gaji Pokok Dibayar
+ Tunjangan Grade
+ Tunjangan Masa Kerja
+ Uang Harian
+ Overtime jika berlaku
+ Bonus Fulltime jika berlaku
+ Bonus Disiplin jika berlaku
+ Bonus KPI
+ Bonus Team jika berlaku
+ Penambah Manual
- Potongan
+/- Adjustment
```

MANAGERIAL tidak memakai poin harian. Nilai performa berasal dari KPI bulanan.

---

## 28. Komponen Payroll Final

| Kelompok Komponen | Isi |
|---|---|
| Komponen Tetap | Gaji pokok, tunjangan grade, tunjangan masa kerja |
| Komponen Harian | Transport harian, konsumsi harian |
| Komponen Produktivitas | Bonus kinerja, bonus prestasi, bonus team, bonus KPI |
| Komponen Disiplin | Bonus fulltime, bonus disiplin, SP penalty |
| Komponen Operasional | Overtime, counter mesin, bonus omset, kinerja SM tambahan |
| Komponen Manual | Penambah gaji, potongan gaji, kasbon, cicilan, BPJS, ganti rugi, adjustment |

---

## 29. Gaji Pokok

Aturan dasar:

```text
Gaji pokok reguler default = Rp1.200.000 / bulan
```

Rekomendasi sistem:

```text
Jika salary_config.gaji_pokok kosong, gunakan default Rp1.200.000.
Jika salary_config.gaji_pokok diisi, gunakan nilai dari salary_config.
```

Tujuannya agar sistem tetap fleksibel jika ada karyawan khusus.

---

## 30. Potongan Unpaid Leave

Secara default, izin/sakit/cuti harian tidak dibayar kecuali memakai kuota paid leave.

Rumus:

```text
Potongan Gaji Pokok = Gaji Pokok / Jumlah Hari Kerja Terjadwal Periode x Jumlah Hari Unpaid Leave
```

Contoh:

```text
Gaji pokok = Rp1.200.000
Hari kerja terjadwal = 24 hari
Unpaid leave = 2 hari
Potongan = 1.200.000 / 24 x 2 = Rp100.000
Gaji pokok dibayar = Rp1.100.000
```

Catatan:

```text
Pembagi ideal adalah jumlah hari kerja terjadwal karyawan pada periode 26-25,
bukan jumlah hari global perusahaan.
```

---

## 31. Bonus Fulltime

Aturan:

```text
Bonus fulltime hanya didapat jika karyawan benar-benar hadir penuh.
```

Tidak mendapat bonus fulltime jika ada:

- izin,
- sakit,
- cuti,
- alpa,
- tidak hadir.

Walaupun cuti menggunakan kuota paid leave dan gaji pokok tidak dipotong, bonus fulltime tetap tidak didapat.

| Kondisi | Gaji Pokok | Bonus Fulltime |
|---|---|---|
| Hadir penuh | Dibayar penuh | Dapat |
| Izin biasa | Dipotong | Tidak dapat |
| Sakit biasa | Dipotong | Tidak dapat |
| Cuti biasa | Dipotong | Tidak dapat |
| Cuti pakai kuota | Tidak dipotong | Tidak dapat |
| Alpa | Dipotong | Tidak dapat |

---

## 32. Bonus Disiplin

Aturan final:

```text
Bonus disiplin didapat jika:
1. Tidak telat
2. Tidak alpa
3. Nilai performa minimal 80%
```

Untuk TEAMWORK:

```text
Nilai performa = persentase poin bulanan
```

Untuk MANAGERIAL:

```text
Nilai performa = KPI bulanan
```

Level bonus disiplin:

| Performa | Syarat Tidak Telat | Bonus Disiplin |
|---:|---|---|
| < 80% | Ya/Tidak | Tidak dapat |
| 80% - 89,99% | Tidak telat | Bonus disiplin 80% |
| 90% - 99,99% | Tidak telat | Bonus disiplin 90% |
| >= 100% | Tidak telat | Bonus disiplin 100% |

Catatan implementasi sementara:

```text
Payroll preview belum membayar bonus disiplin otomatis dari input persentase manual/KPI.
Bonus disiplin baru diaktifkan setelah sumber absensi, telat, dan alpa final tersedia.
```

---

## 33. Bonus Kinerja dan Bonus Prestasi

### TEAMWORK Reguler

Sumber performa:

```text
Monthly Point Performance
```

Aturan bonus mengikuti tabel Phase 2:

- < 80%: tidak dapat bonus kinerja,
- 80% - 89,99%: nominal bonus kinerja tier 80%,
- 90% - 99,99%: nominal bonus kinerja tier 90%,
- >= 100%: nominal bonus kinerja tier 100%,
- 140% - 164,99%: bonus prestasi 140%,
- >= 165%: bonus prestasi 165% saja.

Nominal bonus kinerja tier 80/90/100 dibayar langsung sesuai rentang performa; tidak ada perkalian ulang dengan 80%, 90%, atau 100%.

### MANAGERIAL

Sumber performa:

```text
KPI Bulanan
```

Rekomendasi:

```text
Gunakan level bonus 80%, 90%, 100% seperti struktur payroll,
tetapi sumber persentasenya dari KPI, bukan poin.
```

---

## 34. Overtime

Istilah yang digunakan di UI sebaiknya **Overtime**, bukan lembur, karena sesuai istilah internal yang dibahas.

Base logic dari code finance dipertahankan:

- Overtime 1 jam,
- Overtime 2 jam,
- Overtime 3 jam,
- Overtime full,
- Patch logic dari overtime sesuai code.

Catatan konsep:

```text
Overtime dipertahankan sesuai logic code finance.
Paid/unpaid leave tetap mengikuti ticketing quota.
```

---

## 35. SP Penalty

Aturan:

```text
SP penalty mengurangi persentase performa payroll secara absolut sebelum tier bonus dipilih.
SP1: performa -10 poin persentase.
SP2: performa -20 poin persentase.
Jika SP1 dan SP2 sama-sama aktif, pakai penalty tertinggi yaitu SP2.
Contoh: performa 70% + SP1 menjadi 60%, bukan 63%.
```

Yang terkena dampak:

- bonus kinerja,
- bonus prestasi,
- bonus team/KPI jika relevan.

Yang tidak terkena sebagai potongan nominal langsung:

- gaji pokok,
- tunjangan grade,
- tunjangan masa kerja,
- uang harian,
- overtime,
- potongan resmi.

---

## 36. Additions, Deductions, dan Adjustment

### Additions

Contoh tambahan:

- bonus omset,
- kinerja SM tambahan,
- counter mesin,
- insentif khusus,
- koreksi tambah.

Setiap penambah gaji wajib punya:

```text
employee_id
periode
jenis_tambahan
nominal
keterangan
created_by
approved_by
status
```

### Deductions

Contoh potongan:

- kasbon,
- cicilan,
- BPJS,
- missprint,
- ganti rugi personal,
- ganti rugi team,
- koreksi kurang.

Setiap potongan wajib punya approval/status:

```text
Draft -> Submitted -> Approved -> Active -> Settled / Cancelled
```

### Adjustment

Aturan adjustment:

```text
Jika payroll belum dibayarkan, HRD/Finance boleh koreksi di periode yang sama.
Jika payroll sudah dibayarkan, adjustment masuk sebagai koreksi periode berikutnya.
```

---

## 37. Payroll Snapshot dan Audit

Payroll wajib memakai snapshot agar histori tidak berubah.

### Employee Payroll Snapshot

```text
period_id
employee_id
nama
cabang
divisi_payroll
jabatan
grade
employee_group
employment_status
payroll_status
gaji_pokok
tunjangan_grade
transport_harian
konsumsi_harian
tanggal_masuk
tanggal_lulus_training
```

### Payroll Components

Payroll history tidak cukup hanya menyimpan THP. Harus menyimpan breakdown komponen:

```text
gaji_pokok
potongan_unpaid_leave
tunjangan_grade
tunjangan_masa_kerja
uang_harian
overtime
bonus_fulltime
bonus_disiplin
bonus_kinerja
bonus_prestasi
bonus_team
penambah_manual
potongan
adjustment
thp
```

Atau secara fleksibel:

```text
payroll_id
component_group
component_name
amount
source_module
source_id
calculation_note
```

---

## 38. Workflow Payroll

```text
1. Periode payroll berjalan: 26-25
2. Sistem mengumpulkan data:
   - profil karyawan
   - jadwal kerja
   - ticketing
   - absensi
   - poin approved
   - KPI
   - review/incident
   - overtime
   - additions
   - deductions
3. Sistem membuat payroll draft
4. HRD/Finance review exception
5. Finance finalisasi payroll
6. Payroll menjadi FINALIZED
7. Payroll dibayarkan dan status menjadi PAID
8. Periode dikunci menjadi LOCKED
9. Jika ada koreksi setelah paid, masuk adjustment periode berikutnya
```

---

## 39. Payroll Exception Dashboard

Payroll harus menampilkan exception sebelum finalisasi:

| Exception | Dampak |
|---|---|
| Karyawan belum punya grade | Bonus/gaji tidak bisa dipetakan |
| Gaji pokok kosong | Perlu default atau koreksi |
| Poin belum final | Bonus TW belum valid |
| KPI belum final | Bonus managerial belum valid |
| Ticketing pending | Target/gaji bisa berubah |
| Approval SPV belum selesai | Poin belum sah |
| Absensi kosong | Uang harian/fulltime tidak valid |
| Potongan belum approved | THP belum final |
| Training/resign tengah periode | Perlu prorate |
| Pindah divisi tengah periode | Perlu cek snapshot |

---

## 40. Deliverable Phase 3

| Deliverable | Deskripsi | Prioritas |
|---|---|---|
| Payroll Period | Periode 26-25 dan status closing | P0 |
| Payroll Employee Snapshot | Snapshot data karyawan per periode | P0 |
| Salary Config | Gaji pokok, tunjangan, harian | P0 |
| Master Payroll/Jabatan | Bonus 80/90/100, prestasi 140/165, disiplin | P0 |
| Payroll Calculation Engine | Hitung THP berdasarkan rule | P0 |
| Leave Payroll Impact | Paid/unpaid leave dan potongan gaji pokok | P0 |
| Overtime Engine | Logic overtime sesuai code finance | P1 |
| SP Penalty | Multiplier bonus, bukan gaji pokok | P1 |
| Additions/Deductions | Tambahan dan potongan dengan approval | P0 |
| Payroll History | Histori dan breakdown komponen | P0 |
| Payslip | Slip gaji karyawan | P1 |
| Payroll Adjustment | Koreksi periode sama/berikutnya | P1 |

---

## 41. Kebutuhan Data Utama

| Data | Digunakan Oleh | Sumber | Aksi Utama | Catatan |
|---|---|---|---|---|
| Employee Profile | Semua modul | HRD/Admin | CRUD | Fondasi sistem |
| Master Divisi | Profiling, Poin, Approval | HRD/Admin | CRUD | Relasi SPV penting |
| Master Jabatan/Grade | Profiling, Payroll | Finance/HRD | CRUD | Mapping bonus/gaji |
| Jadwal Kerja | Poin, Ticketing, Payroll | HRD/SPV/Admin | CRUD | Per karyawan |
| Master Poin | Poin Kinerja | Admin/HRD | CRUD versi | Wajib versioning |
| Daily Activity | Poin Kinerja | TW | Create/update | Wajib approval SPV |
| Approval Log | Poin/Review/Ticketing | SPV/HRD | Create | Audit trail |
| Monthly Performance | Payroll | Sistem | Generate | Dari poin approved |
| Review Karyawan | Profiling/HRD | SPV/HRD | Create/approve | Kualitas kerja |
| Ticketing | Profiling/Poin/Payroll | Karyawan/SPV/HRD | CRUD/approve | Izin/sakit/cuti |
| Leave Quota | Ticketing/Payroll | Sistem/HRD | Generate/update | Untuk eligible > 1 tahun |
| Payroll Snapshot | Payroll | Sistem | Generate | Snapshot awal/closing periode |
| Payroll Components | Payroll History | Sistem/Finance | Generate | Breakdown THP |
| Adjustment Log | Payroll/Audit | HRD/Finance | Create/approve | Koreksi resmi |

---

## 42. Kebutuhan Non-Fungsional

### Keamanan

- Role-based access control untuk TW, SPV, HRD, Finance, Admin, dan Manajemen.
- SPV hanya melihat data divisinya sendiri.
- HRD dan Finance memiliki akses lintas divisi sesuai kebutuhan.
- Payroll dan gaji hanya bisa diakses role tertentu.

### Audit dan Logging

- Semua approval, rejection, override, adjustment, dan perubahan master harus terekam.
- Payroll history harus menyimpan breakdown komponen, bukan hanya THP.
- Master poin dan payroll harus memiliki versioning/snapshot.

### Performa

- Dashboard harus mampu memfilter data per periode, divisi, cabang, karyawan, dan status.
- Perhitungan payroll sebaiknya bisa preview/draft sebelum finalized.

### Ketersediaan dan Backup

- Data payroll, aktivitas, dan profil wajib dibackup berkala.
- Periode locked tidak boleh berubah tanpa adjustment resmi.

### Kemudahan Penggunaan

- Form TW harus sederhana: pilih tanggal, pekerjaan, jumlah, submit.
- SPV harus punya halaman approval cepat.
- HRD/Finance harus punya dashboard exception sebelum closing.

---

## 43. Risiko dan Mitigasi

| Risiko | Kategori | Dampak | Mitigasi |
|---|---|---|---|
| Master poin berubah dan mengubah histori | Data/Audit | Tinggi | Versioning dan snapshot transaksi |
| TW telat input | Operasional | Sedang | Reminder H+1 dan deadline otomatis |
| SPV telat approval | Operasional | Tinggi | Dashboard pending dan HRD override |
| Ticketing belum final saat payroll | Payroll | Tinggi | Payroll exception dashboard |
| Cuti paid/unpaid salah hitung | Payroll | Tinggi | Leave quota dan payroll impact per tiket |
| Payroll finalisasi berulang merusak cicilan | Teknis | Tinggi | Finalisasi harus idempotent |
| Profil karyawan tidak lengkap | Data | Tinggi | Mandatory field dan exception before payroll |
| Review terlalu subjektif | HR | Sedang | Skala jelas, incident log, validasi HRD |
| Training tidak dievaluasi tepat waktu | HR | Sedang | Reminder bulan ke-1/2/3 |
| Adjustment setelah payroll tidak tercatat | Audit | Tinggi | Adjustment log dan periode koreksi |

---

## 44. Roadmap Pengembangan 3 Phase

| Phase | Fokus | Deliverable | Catatan |
|---|---|---|---|
| Phase 1 | Profiling Karyawan & Master Data | Employee profile, master divisi, jabatan, grade, status, jadwal, role | Wajib sebelum modul lain stabil |
| Phase 2 | Performance Management Engine | Poin, approval SPV, review, training, ticketing, leave quota | Menjadi sumber performa dan absensi untuk payroll |
| Phase 3 | Payroll System & Finance Closing | Payroll engine, snapshot, additions, deductions, overtime, SP penalty, history, payslip | Final calculation engine dan audit payroll |

### Rekomendasi Urutan MVP

1. Master karyawan, divisi, jabatan, grade, status, role.
2. Master poin pekerjaan dan input aktivitas TW.
3. Approval SPV dan monthly performance.
4. Ticketing izin/sakit/cuti sederhana.
5. Payroll draft berdasarkan data final.
6. Review karyawan dan training evaluation.
7. Leave quota paid/unpaid.
8. Payroll finalization, adjustment, dan payslip.

---

## 45. Keputusan yang Sudah Final

1. Dashboard dibagi menjadi 3 ekosistem utama: Profiling Karyawan, Manajemen Poin Kinerja, dan Payroll System.
2. Modul poin hanya untuk TEAMWORK/TW/Operator.
3. Managerial memakai KPI, bukan poin.
4. Default target harian poin adalah 13.000.
5. Divisi Offset memakai target harian khusus 39.000.
6. Periode payroll dan performa adalah tanggal 26 sampai 25.
7. Target bulanan mengikuti jadwal kerja masing-masing karyawan dan target harian hasil resolusi divisi snapshot.
8. Cuti/sakit/izin approved tidak masuk target poin.
9. Alpa tetap masuk target dan poin aktual 0.
10. Setengah hari tetap memakai target penuh sesuai hasil resolusi target divisi.
11. Poin harus approved SPV agar masuk rekap.
12. SPV hanya approve/tolak, tidak mengubah data.
13. HRD boleh override dengan alasan wajib.
14. Master poin dikunci dengan versioning dan snapshot.
15. Bonus kinerja TW memakai level 80/90/100.
16. Bonus prestasi aktif di 140% dan 165%.
17. Jika 165%, hanya dapat bonus prestasi 165%.
18. Persentase tidak dibulatkan untuk menentukan level bonus.
19. Training gaji Rp1.000.000/bulan dan prorate jika masuk tengah periode.
20. Lulus training di tengah periode efektif reguler periode berikutnya.
21. Pindah divisi tengah periode: input mengikuti aktivitas aktual, target performa dan payroll mengikuti snapshot awal periode.
22. Review karyawan memakai 5 aspek utama.
23. Ticketing izin/sakit/cuti memengaruhi target poin dan payroll impact.
24. Secara default izin/sakit/cuti harian tidak dibayar.
25. Karyawan > 1 tahun dengan tunjangan tahunan mendapat kuota cuti bulanan 1 kali dan cuti tahunan sampai 3 kali.
26. Izin/sakit pertama otomatis mengambil kuota cuti bulanan jika eligible.
27. Izin berikutnya bisa memilih cuti tahunan atau izin biasa/unpaid.
28. Gaji pokok reguler default Rp1.200.000.
29. Bonus fulltime hanya jika benar-benar hadir penuh tanpa izin/sakit/cuti.
30. Bonus disiplin butuh tidak telat, tidak alpa, dan performa minimal 80%.
31. Overtime logic dipertahankan sesuai code finance.
32. SP penalty mengurangi performa payroll secara absolut: SP1 -10 poin, SP2 -20 poin; bukan multiplier nominal bonus.
33. Jika payroll sudah dibayar, adjustment masuk periode berikutnya.

---

## 46. Bagian yang Masih Perlu Diputuskan Nanti

1. Standar training untuk divisi yang belum disebut: AFT, CSM, Sablon, Rembu, Gudang, RnD.
2. Tanggal pembayaran gaji final setiap periode.
3. Apakah KPI Managerial memakai threshold bonus yang sama 80/90/100.
4. Apakah semua ticketing butuh lampiran bukti atau hanya sakit/emergency.
5. Apakah HRD override payroll butuh approval tambahan dari manajemen.
6. Apakah payroll payslip akan dikirim otomatis ke karyawan atau hanya dapat dilihat di dashboard.
7. Format final penamaan divisi dan jabatan agar konsisten dengan master payroll.
8. Apakah potongan BPJS/pajak akan dihitung otomatis atau input manual di MVP.
9. Apakah review karyawan akan memengaruhi kenaikan grade secara otomatis atau hanya rekomendasi.
10. Apakah integrasi absensi fisik diperlukan di fase lanjutan.

---

## 47. Prompt Lanjutan untuk AI/Developer

```text
Kamu adalah senior system analyst, product architect, dan HR payroll system consultant. Saya sedang membangun Dashboard HRD Terintegrasi yang dibagi menjadi 3 phase: Phase 1 Profiling Karyawan & Master Data Foundation, Phase 2 Performance Management Engine, dan Phase 3 Payroll System & Finance Closing.

Konteks utama:
- Profiling Karyawan menjadi fondasi data karyawan, divisi, jabatan, grade, status kerja, jadwal, SPV, dan payroll snapshot.
- TEAMWORK/TW/Operator dinilai menggunakan Manajemen Poin Kinerja.
- MANAGERIAL seperti Kabag, SPV, TL, dan Staff dinilai menggunakan KPI, bukan poin.
- Default target poin harian adalah 13.000.
- Divisi Offset memakai target poin harian 39.000.
- Periode performa dan payroll adalah tanggal 26 sampai 25.
- Target bulanan = target harian hasil resolusi divisi snapshot x jumlah hari masuk target sesuai jadwal karyawan.
- Cuti/sakit/izin approved tidak masuk target. Alpa tetap masuk target dengan poin 0. Setengah hari tetap target penuh sesuai hasil resolusi divisi.
- TW input aktivitas maksimal H+1. SPV approve/tolak maksimal H+2. Jika ditolak, TW revisi maksimal H+1 setelah penolakan. SPV approve ulang maksimal H+1 setelah submit ulang.
- Bonus kinerja TW: <80% tidak dapat, 80%-89,99% bonus 80%, 90%-99,99% bonus 90%, >=100% bonus 100%.
- Bonus prestasi: 140%-164,99% mendapat prestasi 140%, >=165% mendapat prestasi 165% saja.
- Persentase tidak dibulatkan.
- Master poin wajib versioning dan snapshot.
- Training gaji Rp1.000.000/bulan, prorate jika masuk tengah periode, poin untuk evaluasi lulus training, bukan bonus.
- Standar lulus training: Creative 70%, Printing 75%, Finishing 80%, Logistic 80%, Offset 80%, Blangko/Pabrik 80%.
- Review karyawan memakai aspek SOP & Kualitas Kerja, Pemahaman Instruksi, Absensi & Disiplin, Inisiatif/Teamwork/5R, dan Miss Proses & Tanggung Jawab.
- Ticketing izin/sakit/cuti harus memengaruhi target poin dan payroll impact.
- Secara default izin/sakit/cuti harian tidak dibayar dan menggugurkan bonus fulltime.
- Karyawan yang sudah >1 tahun dan punya tunjangan tahunan mendapat kuota cuti bulanan 1 kali dan cuti tahunan sampai 3 kali. Izin/sakit pertama otomatis mengambil kuota cuti bulanan jika eligible. Izin berikutnya dapat memilih cuti tahunan atau izin biasa/unpaid.
- Payroll memakai gaji pokok reguler default Rp1.200.000, bonus fulltime hanya jika benar-benar hadir penuh, bonus disiplin butuh tidak telat/tidak alpa/performa minimal 80%, overtime logic dipertahankan, dan SP penalty mengurangi performa payroll secara absolut sebelum tier bonus dipilih.

Tolong lanjutkan analisis ini menjadi salah satu output berikut sesuai kebutuhan:
1. ERD konseptual dan tabel database,
2. user flow detail per role,
3. backlog MVP per sprint,
4. wireframe dashboard HRD/payroll,
5. business rules matrix,
6. technical specification untuk developer,
7. QA checklist dan edge case payroll.

Gunakan bahasa Indonesia yang rapi, praktis, dan siap dibahas dengan stakeholder serta developer. Jangan mengubah keputusan final tanpa memberi alasan dan menandai sebagai rekomendasi baru.
```

---

## 48. Kesimpulan

Konsep Dashboard HRD ini sudah memiliki fondasi yang cukup kuat untuk masuk tahap desain sistem. Tiga phase yang disarankan menjaga proyek tetap terarah:

```text
Phase 1: Profiling Karyawan & Master Data Foundation
Phase 2: Performance Management Engine
Phase 3: Payroll System & Finance Closing
```

Keputusan paling penting adalah menjadikan Profiling Karyawan sebagai fondasi, Performance Management sebagai engine operasional, dan Payroll sebagai final calculation engine. Dengan pemisahan ini, sistem akan lebih mudah dikembangkan, diaudit, dan diperluas di masa depan.
