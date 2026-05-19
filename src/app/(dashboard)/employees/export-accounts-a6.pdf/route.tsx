import { NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getEmployeesForExport } from "@/server/actions/employees";

export const runtime = "nodejs";

type AccountRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionName: string;
  username: string;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  card: {
    borderWidth: 1,
    borderColor: "#0f172a",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 7,
    minHeight: 76,
    justifyContent: "center",
  },
  line: {
    marginBottom: 2,
  },
  label: {
    fontWeight: 700,
  },
  footer: {
    fontSize: 7,
    color: "#475569",
    marginTop: 2,
  },
});

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

function AccountCardsPdf({ rows }: { rows: AccountRow[] }) {
  const pages = chunk(rows, 4);
  return (
    <Document>
      {pages.map((group, index) => (
        <Page key={`page-${index + 1}`} size="A6" style={styles.page}>
          {group.map((row) => (
            <View key={row.id} style={styles.card}>
              <Text style={styles.line}>
                <Text style={styles.label}>ID : </Text>
                {row.employeeCode}
              </Text>
              <Text style={styles.line}>
                <Text style={styles.label}>NAMA : </Text>
                {row.fullName}
              </Text>
              <Text style={styles.line}>
                <Text style={styles.label}>DIVISI : </Text>
                {row.divisionName}
              </Text>
              <Text style={styles.line}>
                <Text style={styles.label}>USERNAME : </Text>
                {row.username}
              </Text>
              <Text style={styles.line}>
                <Text style={styles.label}>PASSWORD : </Text>
                12345678
              </Text>
            </View>
          ))}
          <Text style={styles.footer}>Dicetak dari HRIS Internal - Employee Account Card</Text>
        </Page>
      ))}
    </Document>
  );
}

export async function GET() {
  const result = await getEmployeesForExport();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const rows: AccountRow[] = result
    .filter((item) => item.email && item.email !== "-")
    .map((item) => ({
      id: item.id,
      employeeCode: item.employeeCode ?? "XXXX",
      fullName: item.nama,
      divisionName: item.divisi ?? "-",
      username: item.email.split("@")[0] ?? "-",
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Belum ada akun karyawan yang bisa diexport." }, { status: 400 });
  }

  const buffer = await renderToBuffer(<AccountCardsPdf rows={rows} />);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=\"employee-accounts-a6.pdf\"",
    },
  });
}
