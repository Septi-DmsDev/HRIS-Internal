import { describe, expect, it } from "vitest";
import { resolveTenureAllowanceAmount, resolveTenureYears } from "./resolve-tenure-allowance";

describe("resolveTenureAllowanceAmount", () => {
  it("JAN-FEB-MAR bucket -> efektif APR setelah 13-15 bulan", () => {
    const graduation = new Date(2024, 1, 15); // Feb 15, 2024
    expect(resolveTenureYears(graduation, new Date(2025, 2, 31))).toBe(0); // Mar 2025
    expect(resolveTenureYears(graduation, new Date(2025, 3, 1))).toBe(1); // Apr 2025
    expect(resolveTenureAllowanceAmount(graduation, new Date(2025, 3, 1))).toBe(100000);
  });

  it("APR-MAY-JUN bucket -> efektif JUL setelah 13-15 bulan", () => {
    const graduation = new Date(2024, 4, 10); // May 10, 2024
    expect(resolveTenureYears(graduation, new Date(2025, 5, 30))).toBe(0); // Jun 2025
    expect(resolveTenureYears(graduation, new Date(2025, 6, 1))).toBe(1); // Jul 2025
  });

  it("JUL-AUG-SEP bucket -> efektif OCT setelah 13-15 bulan", () => {
    const graduation = new Date(2024, 7, 5); // Aug 5, 2024
    expect(resolveTenureYears(graduation, new Date(2025, 8, 30))).toBe(0); // Sep 2025
    expect(resolveTenureYears(graduation, new Date(2025, 9, 1))).toBe(1); // Oct 2025
  });

  it("OCT-NOV-DEC bucket -> efektif JAN setelah 13-15 bulan", () => {
    const graduationNov = new Date(2024, 10, 20); // Nov 20, 2024
    expect(resolveTenureYears(graduationNov, new Date(2025, 11, 31))).toBe(0); // Dec 2025
    expect(resolveTenureYears(graduationNov, new Date(2026, 0, 1))).toBe(1); // Jan 2026

    const graduationJan = new Date(2024, 0, 20); // Jan 20, 2024
    expect(resolveTenureYears(graduationJan, new Date(2025, 2, 31))).toBe(0); // Mar 2025
    expect(resolveTenureYears(graduationJan, new Date(2025, 3, 1))).toBe(1); // Apr 2025
  });

  it("naik 100rb setiap tahun pada anchor month yang sama", () => {
    const graduation = new Date(2022, 1, 10); // Feb 2022 -> anchor Apr
    expect(resolveTenureAllowanceAmount(graduation, new Date(2023, 3, 1))).toBe(100000); // Apr 2023
    expect(resolveTenureAllowanceAmount(graduation, new Date(2024, 3, 1))).toBe(200000); // Apr 2024
    expect(resolveTenureAllowanceAmount(graduation, new Date(2026, 3, 1))).toBe(400000); // Apr 2026
  });

  it("kelulusan desember baru aktif Januari dua tahun kalender berikutnya", () => {
    const graduation = new Date(2024, 11, 15); // Dec 15, 2024
    expect(resolveTenureYears(graduation, new Date(2025, 11, 31))).toBe(0); // Dec 2025
    expect(resolveTenureYears(graduation, new Date(2026, 0, 1))).toBe(1); // Jan 2026
  });

  it("0 jika belum lulus training", () => {
    expect(resolveTenureYears(null, new Date(2026, 4, 1))).toBe(0);
    expect(resolveTenureAllowanceAmount(undefined, new Date(2026, 4, 1))).toBe(0);
  });
});
