import Link from "next/link";
import { getPublicRecaptDivisions } from "@/server/actions/recapt";

export default async function RecaptIndexPage() {
  const divisions = await getPublicRecaptDivisions();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Recapt Divisi</h1>
      <p className="mt-1 text-sm text-slate-500">Pilih divisi untuk melihat rekap publik.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {divisions.map((division) => (
          <Link
            key={division.id}
            href={`/recapt/${division.slug}`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:border-teal-300 hover:text-teal-700"
          >
            {division.name}
          </Link>
        ))}
      </div>
    </main>
  );
}
