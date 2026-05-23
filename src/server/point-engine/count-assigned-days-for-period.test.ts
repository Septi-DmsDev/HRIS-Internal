import { describe, expect, it } from "vitest";
import { countAssignedDaysForPeriod } from "./count-assigned-days-for-period";

describe("countAssignedDaysForPeriod", () => {
  it("menghitung semua tanggal yang punya assignment", () => {
    expect(
      countAssignedDaysForPeriod({
        periodStartDate: "2026-05-26",
        periodEndDate: "2026-06-01",
        assignments: [{ effectiveStartDate: "2026-05-01", effectiveEndDate: null }],
      })
    ).toBe(7);
  });

  it("tidak menghitung tanggal OFF/kosong assignment", () => {
    expect(
      countAssignedDaysForPeriod({
        periodStartDate: "2026-05-26",
        periodEndDate: "2026-06-01",
        assignments: [
          { effectiveStartDate: "2026-05-26", effectiveEndDate: "2026-05-28" },
          { effectiveStartDate: "2026-05-30", effectiveEndDate: "2026-06-01" },
        ],
      })
    ).toBe(6);
  });

  it("menghitung overlap assignment satu kali per tanggal", () => {
    expect(
      countAssignedDaysForPeriod({
        periodStartDate: "2026-05-26",
        periodEndDate: "2026-05-29",
        assignments: [
          { effectiveStartDate: "2026-05-26", effectiveEndDate: "2026-05-28" },
          { effectiveStartDate: "2026-05-28", effectiveEndDate: "2026-05-29" },
        ],
      })
    ).toBe(4);
  });
});
