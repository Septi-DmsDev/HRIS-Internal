import { NextResponse } from "next/server";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { getPointCatalogOverview } from "@/server/actions/point-catalog";

export const runtime = "nodejs";

function toNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const overview = await getPointCatalogOverview();
  const rows = overview.latestEntries.map((entry, index) => ({
    NO: index + 1,
    DIVISI: entry.divisionName,
    KODE: entry.externalCode ?? "",
    "JENIS PEKERJAAN": entry.workName,
    POIN: toNumber(entry.pointValue),
    KETERANGAN: entry.unitDescription ?? "",
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 16 },
    { wch: 48 },
    { wch: 12 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Katalog Poin");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const dateLabel = format(new Date(), "yyyyMMdd");
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="katalog-poin-${dateLabel}.xlsx"`,
    },
  });
}
