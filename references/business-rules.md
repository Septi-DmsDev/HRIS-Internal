# Business Rules HRD Dashboard

Dokumen ini merangkum aturan bisnis yang wajib dijaga saat membangun HRD Dashboard.

> Catatan code 2026-05-15:
> Business rules di bawah adalah sumber aturan bisnis. Jika implementasi aktual berbeda, catat sebagai gap dan jangan mengubah rule diam-diam. Gap yang diketahui: enforcement deadline H+1/H+2 belum lengkap, dan beberapa hardening payroll lanjutan masih dilacak di `next-update.md`.

## Kelompok Karyawan

| Kelompok baru | Alias legacy | Metode penilaian |
|---|---|---|
| KARYAWAN_TETAP | MANAGERIAL | KPI bulanan |
| MITRA_KERJA | TEAMWORK | Poin kerja harian |
| BORONGAN | - | Poin kerja harian |
| TRAINING | - | Evaluasi poin training |

Kelompok poin-based memiliki status:
- Training
- Reguler
- Dialihkan Training
- Tidak Lolos / Keluar
- Nonaktif / Resign

## Periode Payroll

Periode rekap dan payroll:

```text
Tanggal 26 bulan sebelumnya sampai tanggal 25 bulan berjalan
```

Payroll harus memakai snapshot awal periode untuk divisi payroll, jabatan, grade, gaji, status, dan kelompok karyawan.

## Poin Kinerja MITRA_KERJA / BORONGAN / TRAINING

Target harian diambil dari master divisi (`divisions.daily_point_target`).
Default master adalah 13.000 poin per hari; divisi Offset disetel 39.000 poin per hari lewat master.

Rumus:

```text
Target Bulanan = target harian master divisi snapshot x jumlah hari aktif/non-OFF pada scheduler
Persentase Kinerja = total poin approved / target bulanan x 100%
```

Status hari:

| Status | Masuk target | Target | Poin aktual |
|---|---:|---:|---:|
| Kerja normal | Ya | target harian master divisi | sesuai input approved |
| Setengah hari | Ya | target harian master divisi | sesuai input approved |
| Alpa | Ya | target harian master divisi | 0 |
| Cuti disetujui final | Tidak | 0 | 0 |
| Sakit disetujui final | Tidak | 0 | 0 |
| Izin disetujui final | Tidak | 0 | 0 |
| Off/libur jadwal | Tidak | 0 | 0 |

## Bonus Kinerja MITRA_KERJA / BORONGAN

Tidak ada pembulatan level bonus. Nominal bonus kinerja pada master grade dibayar langsung sesuai tier yang tercapai; nominal tier 80/90/100 tidak dikalikan lagi dengan 80%, 90%, atau 100%.

| Persentase | Bonus kinerja | Bonus prestasi |
|---:|---|---|
| < 80% | 0 | 0 |
| 80% - 89.99% | bonus 80% | 0 |
| 90% - 99.99% | bonus 90% | 0 |
| 100% - 139.99% | bonus 100% | 0 |
| 140% - 164.99% | bonus 100% | prestasi 140% |
| >= 165% | bonus 100% | prestasi 165% saja |

Jika mencapai 165%, bonus prestasi yang didapat hanya 165%, bukan 140% + 165%.

Untuk KARYAWAN_TETAP/KPI, rentang bonus kinerja memakai aturan nominal yang sama: 80% = performa 80-89.99%, 90% = 90-99.99%, dan 100% = minimal 100%.

## Input dan Approval Aktivitas

- TW input aktivitas maksimal H+1 dari tanggal kerja.
- TW hanya bisa memilih pekerjaan sesuai divisi aktual harian.
- Target performa harian dan bulanan mengikuti divisi payroll snapshot / divisi awal periode.
- Total poin = jumlah x poin master.
- SPV hanya bisa approve/tolak, tidak bisa mengubah data.
- SPV approve/tolak maksimal H+2 setelah input.
- Jika ditolak, TW revisi maksimal H+1 setelah penolakan.
- SPV approve ulang maksimal H+1 setelah submit ulang.
- HRD boleh override dengan alasan wajib.
- Setelah payroll closing, perubahan hanya lewat adjustment.

## Master Poin

- Master poin wajib versioning.
- Transaksi aktivitas wajib menyimpan snapshot: point_id, versi, nama pekerjaan, divisi, poin satuan, satuan.
- Perubahan master poin tidak boleh mengubah histori lama.

## Training

- Gaji training Rp1.000.000/bulan.
- Jika masuk tengah periode, prorate berdasarkan hari aktif training.
- Poin training tidak menentukan bonus; poin menentukan kelulusan training.
- Minimal training 1 bulan, maksimal 3 bulan.
- Jika lulus training di tengah periode, status reguler efektif mulai periode payroll berikutnya.
- Jika lulus training di tengah periode payroll berjalan, bonus fulltime dan bonus disiplin diprorate berdasarkan sisa hari kerja terjadwal sejak tanggal lulus sampai akhir periode:
  - rasio prorate = sisa hari kerja terjadwal sejak lulus / total hari kerja terjadwal periode;
  - bonus fulltime dibayar = bonus fulltime nominal x rasio prorate (tetap wajib memenuhi eligibility fulltime);
  - bonus disiplin dibayar = bonus disiplin tier (100/90/80/0 berbasis jumlah telat) x rasio prorate (tetap wajib memenuhi eligibility disiplin).

Standar minimal lulus training:

| Divisi | Minimal |
|---|---:|
| Creative | 70% |
| Printing | 75% |
| Finishing | 80% |
| Logistic | 80% |
| Offset | 80% |
| Blangko / Pabrik | 80% |

## Resolusi Target Divisi

Rule target poin:

```text
Target harian = divisions.daily_point_target dari divisi payroll snapshot / divisi awal periode
Target bulanan = target harian x jumlah hari aktif/non-OFF pada scheduler
```

Rule ini dipakai untuk:
- target harian,
- target bulanan,
- dashboard personal,
- persentase performa bulanan,
- evaluasi training berbasis poin.

Jika karyawan membantu divisi lain di tengah periode:
- daftar pekerjaan tetap mengikuti divisi aktual harian;
- target performa tetap mengikuti divisi snapshot periode berjalan.

## Review Karyawan

Review mengukur kualitas, disiplin, sikap kerja, SOP, dan potensi. Review tidak langsung mengubah bonus kinerja di MVP.

Aspek review:
- SOP & Kualitas Kerja
- Pemahaman Instruksi
- Absensi & Disiplin
- Inisiatif, Teamwork & 5R
- Miss Proses & Tanggung Jawab

Incident log:
- incident yang salah input dapat dihapus oleh role pengelola sesuai scope divisi;
- hapus incident berarti menonaktifkan row (`isActive=false`), sehingga tidak tampil di Incident Log dan tidak memengaruhi payroll preview berikutnya.

## Ticketing Izin/Sakit/Cuti

Semua izin/sakit/cuti harus berbasis tiket.

Default:
- izin/sakit/cuti harian tidak dibayar;
- gaji pokok dipotong;
- bonus fulltime tidak didapat;
- target poin tidak dihitung jika ticket disetujui final.
- Hari aktif/non-OFF adalah tanggal yang punya assignment shift di `employee_schedule_assignments`; tanggal tanpa assignment dianggap OFF dan tidak masuk target bulanan.
- ticket harian penuh yang disetujui final mengosongkan assignment jadwal di `/scheduler` menjadi OFF untuk rentang tanggal ticket; `/schedule` karyawan membaca hasil assignment scheduler tersebut.
- `IZIN_JAM` dan `SETENGAH_HARI` tidak mengubah jadwal menjadi OFF penuh.

Untuk form poin-based:
- field yang ditampilkan cukup jenis tiket, rentang tanggal/durasi, alasan/catatan, dan bukti bila memang diwajibkan;
- akun self-service memakai `user_roles.employee_id` sebagai karyawan tujuan;
- sakit lebih dari 1 hari wajib melampirkan surat dokter atau bukti pendukung lain yang valid.

Untuk karyawan dengan masa kerja > 1 tahun dan punya tunjangan tahunan:
- kuota cuti bulanan 1x;
- kuota cuti tahunan sampai 3x;
- izin/sakit pertama otomatis mengambil kuota cuti bulanan;
- izin berikutnya user memilih cuti tahunan atau izin biasa;
- cuti berkuota tidak memotong gaji pokok, tetapi tetap menggugurkan bonus fulltime.

## Absensi Kehadiran dan Disiplin

Absensi saat ini dapat diinput manual oleh `SUPER_ADMIN` atau `HRD` lewat `/absensi`, dan dapat diingest dari mesin ADMS/fingerprint melalui endpoint server-to-server. Keduanya menulis ke tabel absensi yang sama dan menjadi sumber eligibility bonus fulltime/disiplin payroll.

Sumber data:
- `MANUAL` untuk input HRD/Admin lewat `/absensi`;
- `FINGERPRINT_ADMS` untuk ingest rekap/raw taps ADMS melalui `POST /api/integrations/adms/attendance` dan `POST /api/integrations/adms/taps`;
- `GET /api/integrations/adms/employees` menyediakan sinkronisasi mapping karyawan aktif untuk server ADMS.

Catatan implementasi:
- endpoint ADMS memakai bearer token `ADMS_INGEST_TOKEN`;
- data `MANUAL` tidak ditimpa oleh batch ADMS;
- raw taps diklasifikasikan ke check-in, break, dan check-out sesuai jadwal kerja;
- data kosong dari mesin tidak otomatis menjadi `ALPA`; HRD tetap perlu tindak lanjut.

Aturan payroll:
- jika tidak ada data absensi pada periode payroll, bonus fulltime dan bonus disiplin dianggap tidak eligible sehingga dibayar `0`;
- bonus fulltime hanya eligible jika seluruh hari kerja terjadwal pada periode memiliki record kerja dan semuanya `HADIR`;
- `ALPA`, `IZIN`, `SAKIT`, atau `CUTI` menggugurkan bonus fulltime dan bonus disiplin;
- `TELAT` tidak menggugurkan fulltime, tetapi menggugurkan bonus disiplin;
- ticket izin/sakit/cuti yang disetujui final tetap menggugurkan fulltime meskipun gaji pokoknya tidak selalu dipotong;
- record `OFF` tidak dihitung sebagai hari kerja.

## Payroll

Gaji pokok reguler default:

```text
Rp1.200.000 / bulan
```

Formula umum:

```text
THP =
Gaji Pokok Dibayar
+ Tunjangan Grade
+ Tunjangan Masa Kerja
+ Uang Harian
+ Overtime
+ Bonus Fulltime
+ Bonus Disiplin
+ Bonus Kinerja
+ Bonus Prestasi
+ Bonus Team / KPI
+ Penambah Manual
- Potongan
- Potongan Unpaid Leave
+/- Adjustment
```

Bonus fulltime:
- hanya jika data absensi periode lengkap dan seluruh hari kerja terjadwal berstatus `HADIR`;
- jika data absensi belum ada, bonus fulltime dibayar `0`;
- izin/sakit/cuti/alpa dan ticket cuti berbayar yang disetujui final tetap menggugurkan fulltime.

Bonus disiplin:
- mengikuti data absensi, bukan input persentase manual;
- tier bonus berbasis jumlah `TELAT` periode berjalan:
  - 100% jika tidak telat sama sekali;
  - 90% jika telat maksimal 3x;
  - 80% jika telat maksimal 7x;
  - 0% jika telat 8x atau lebih;
- harus eligible fulltime;
- performa payroll minimal 80%;
- incident `TELAT` aktif pada periode juga menggugurkan bonus disiplin;
- jika data absensi belum ada, bonus disiplin dibayar `0`.

SP penalty:
- SP1 mengurangi performa payroll sebesar 10 poin persentase absolut;
- SP2 mengurangi performa payroll sebesar 20 poin persentase absolut;
- jika SP1 dan SP2 sama-sama aktif, pakai penalty tertinggi yaitu SP2;
- pengurangan dilakukan langsung dari persentase performa sebelum tier bonus dipilih, contoh 70% + SP1 menjadi 60%, bukan 63%;
- incident SP1/SP2 tidak menjadi potongan nominal payroll langsung;
- tidak memotong gaji pokok.

Overtime:
- pertahankan logika base code finance;
- gunakan istilah Overtime di UI.

Payroll finalization:
- harus idempotent;
- tidak boleh mengurangi cicilan/tenor berkali-kali akibat finalisasi ulang;
- setelah paid/locked, koreksi masuk adjustment periode berikutnya.

Tunjangan masa kerja:
- dihitung dari tanggal lulus training (`training_graduation_date`);
- nominal kenaikan per tahun: `Rp100.000`;
- bucket effective pertama:
  - lulus Jan/Feb/Mar -> kenaikan pertama efektif 1 April tahun berikutnya;
  - lulus Apr/Mei/Jun -> kenaikan pertama efektif 1 Juli tahun berikutnya;
  - lulus Jul/Ags/Sep -> kenaikan pertama efektif 1 Oktober tahun berikutnya;
  - lulus Okt/Nov/Des -> kenaikan pertama efektif 1 Januari tahun berikutnya;
- setelah effective pertama, kenaikan berlanjut tiap 12 bulan pada bulan anchor yang sama.

## Profil Karyawan (Self-Service)

Variabel profil tambahan:
- Hobi (multi entry);
- Riwayat pendidikan (multi entry);
- Kompetensi (multi entry, dapat menyimpan link dokumen pendukung/sertifikat).

Aturan akses:
- data profil tambahan diisi oleh karyawan sendiri melalui account settings;
- admin dan HRD hanya melihat data ini di profil karyawan (read-only).

## Variable Penambah Gaji

| Kategori | Berlaku untuk | Aturan |
|---|---|---|
| Penambahan Manual | Semua karyawan | Bebas, keterangan wajib diisi |
| Uang Transport | Semua karyawan aktif | Recurring setiap bulan selama masih aktif bekerja |

## Variable Pengurang Gaji

| Kategori | Berlaku untuk | Aturan |
|---|---|---|
| BPJS | Semua karyawan | Recurring setiap bulan selama masih aktif bekerja |
| Kasbon | Semua karyawan | Maksimum **Rp 300.000** per karyawan per periode payroll |
| Ganti Rugi Personal | Semua karyawan | Satu kali per karyawan per periode; tidak bisa duplikat |
| Ganti Rugi Team | **Karyawan KARYAWAN_TETAP only** | Satu kali per karyawan per periode; tidak bisa duplikat |
| Cicilan | Karyawan tertentu yang punya pinjaman | Recurring setiap bulan; wajib isi sisa tenor (bulan); tenor dicatat bukan otomatis didekrementasi — finance input manual tiap periode sampai tenor habis |

Catatan implementasi:
- Business rules di-enforce server-side di `addPayrollAdjustment` dan `updatePayrollAdjustment` (`src/server/actions/payroll.ts`)
- Kategori period-specific disimpan sebagai prefix di field `reason`; BPJS dan Uang Transport disimpan sebagai recurring adjustment aktif dengan `adjustment_type` tetap `ADDITION`/`DEDUCTION`
- Format: `KASBON`, `BPJS::catatan`, `TRANSPORT::catatan`, `GANTI_RUGI_PERSONAL::deskripsi`, `GANTI_RUGI_TEAM::deskripsi`, `CICILAN::12::deskripsi`, `MANUAL_ADDITION::alasan`
- Edit adjustment (`updatePayrollAdjustment`) hanya mengubah nominal dan keterangan; kategori dan karyawan tidak bisa diubah setelah dibuat
- Batas Rp 300.000 untuk KASBON di-enforce ulang saat edit (menghitung total kasbon lain di periode yang sama, exclude baris yang sedang diedit)

