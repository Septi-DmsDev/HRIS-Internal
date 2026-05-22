export const TENURE_ALLOWANCE_PER_YEAR = 100_000;

function resolveAnchorMonth(graduationMonth: number) {
  if (graduationMonth >= 1 && graduationMonth <= 3) return 4;
  if (graduationMonth >= 4 && graduationMonth <= 6) return 7;
  if (graduationMonth >= 7 && graduationMonth <= 9) return 10;
  return 1;
}

function toMonthIndex(date: Date) {
  return date.getFullYear() * 12 + (date.getMonth() + 1);
}

export function resolveTenureYears(trainingGraduationDate: Date | null | undefined, referenceDate: Date) {
  if (!trainingGraduationDate) return 0;

  const graduationYear = trainingGraduationDate.getFullYear();
  const graduationMonth = trainingGraduationDate.getMonth() + 1;
  const anchorMonth = resolveAnchorMonth(graduationMonth);

  // Tunjangan pertama aktif pada quarter anchor pertama setelah 1 tahun masa kerja.
  // Hasilnya menjadi 13-15 bulan setelah tanggal lulus training.
  const firstEffectiveYear = graduationYear + (anchorMonth > graduationMonth ? 1 : 2);
  const firstEffective = new Date(firstEffectiveYear, anchorMonth - 1, 1);
  if (referenceDate < firstEffective) return 0;

  const monthsDiff = toMonthIndex(referenceDate) - toMonthIndex(firstEffective);
  return Math.floor(monthsDiff / 12) + 1;
}

export function resolveTenureAllowanceAmount(trainingGraduationDate: Date | null | undefined, referenceDate: Date) {
  const years = resolveTenureYears(trainingGraduationDate, referenceDate);
  return years * TENURE_ALLOWANCE_PER_YEAR;
}
