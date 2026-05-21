import { describe, expect, it } from "vitest";
import { resolveLeaveQuotaEligibility } from "./resolve-leave-quota-eligibility";

describe("resolveLeaveQuotaEligibility", () => {
  it("aktif tepat pada H+1 tahun dari tanggal acuan", () => {
    const result = resolveLeaveQuotaEligibility({
      startDate: new Date("2025-01-15T00:00:00.000Z"),
      requestedYear: 2026,
      today: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(result.effectiveDate.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(result.eligible).toBe(true);
  });

  it("tetap eligible untuk tanggal setelah 1 tahun", () => {
    const result = resolveLeaveQuotaEligibility({
      startDate: new Date("2025-07-10T00:00:00.000Z"),
      requestedYear: 2026,
      today: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(result.effectiveDate.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(result.eligible).toBe(true);
  });

  it("menolak jika belum mencapai 1 tahun", () => {
    const result = resolveLeaveQuotaEligibility({
      startDate: new Date("2025-02-28T00:00:00.000Z"),
      requestedYear: 2026,
      today: new Date("2026-02-27T00:00:00.000Z"),
    });

    expect(result.effectiveDate.toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(result.eligible).toBe(false);
  });

  it("eligible ketika tahun request >= tahun efektif", () => {
    const result = resolveLeaveQuotaEligibility({
      startDate: new Date("2025-02-28T00:00:00.000Z"),
      requestedYear: 2027,
      today: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(result.eligible).toBe(true);
  });
});
