export function resolveHeaderMeta(pathname: string) {
  if (pathname.startsWith("/payroll/") && pathname.endsWith("/slips.pdf")) {
    return { title: "Daftar Slip Gaji", description: "Dokumen slip gaji per periode" };
  }
  if (pathname.startsWith("/payroll/") && pathname.endsWith("/payslip.pdf")) {
    return { title: "Slip Gaji", description: "Dokumen pembayaran karyawan" };
  }
  if (/^\/payroll\/[^/]+\/[^/]+$/.test(pathname)) {
    return { title: "Detail Payroll", description: "Rincian per karyawan" };
  }
  if (pathname.startsWith("/payroll")) return { title: "Payroll", description: "Preview dan finalisasi gaji" };
  if (pathname.startsWith("/finance")) return { title: "Finance", description: "Ringkasan biaya payroll" };
  if (pathname.startsWith("/performance/training")) return { title: "Evaluasi Training", description: "Penilaian masa training" };
  if (pathname.startsWith("/performance")) return { title: "Performa", description: "Poin, target, dan aktivitas" };
  if (pathname.startsWith("/teamperformance")) return { title: "Team Performance", description: "Rekap poin teamwork per divisi" };
  if (pathname.startsWith("/employees/")) return { title: "Detail Karyawan", description: "Profil dan histori karyawan" };
  if (pathname.startsWith("/employees")) return { title: "Karyawan", description: "Kelola data pribadi karyawan" };
  if (pathname.startsWith("/positioning")) return { title: "Penempatan", description: "Mutasi massal cabang/divisi/jabatan/grade/kelompok" };
  if (pathname.startsWith("/divisi")) return { title: "Penempatan", description: "Mutasi massal cabang/divisi/jabatan/grade/kelompok" };
  if (pathname.startsWith("/ticketingapproval")) return { title: "Approval Izin", description: "Antrian persetujuan tiket" };
  if (pathname.startsWith("/tickets")) return { title: "Ticketing", description: "Izin, sakit, dan cuti" };
  if (pathname.startsWith("/overtime")) return { title: "Overtime", description: "Pengajuan dan approval overtime" };
  if (pathname.startsWith("/absensi")) return { title: "Absensi", description: "Input dan rekap kehadiran" };
  if (pathname.startsWith("/reviews")) return { title: "Review", description: "Review dan incident kerja" };
  if (pathname === "/master") return { title: "Master Data", description: "Cabang dan katalog poin" };
  if (pathname.startsWith("/master/branches")) return { title: "Master Cabang", description: "Daftar cabang perusahaan" };
  if (pathname.startsWith("/master/divisions")) return { title: "Master Divisi", description: "Daftar divisi aktif" };
  if (pathname.startsWith("/master/positions")) return { title: "Master Jabatan", description: "Daftar jabatan kerja" };
  if (pathname.startsWith("/master/grades")) return { title: "Master Grade", description: "Daftar grade karyawan" };
  if (pathname.startsWith("/master/catalogpoin")) return { title: "Katalog Poin", description: "Manajemen katalog poin performa" };
  if (pathname.startsWith("/master/")) return { title: "Master Data", description: "Pengaturan data referensi" };
  if (pathname.startsWith("/users")) return { title: "Manajemen Pengguna", description: "Role dan akses akun" };
  if (pathname.startsWith("/history")) return { title: "History Sistem", description: "Audit perubahan lintas modul" };
  if (pathname.startsWith("/settings")) return { title: "Pengaturan", description: "Profil akun login" };
  return { title: "Dashboard", description: "Ringkasan operasional" };
}
