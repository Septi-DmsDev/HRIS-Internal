"use client";

import { useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PayslipItem = {
  key: string;
  label: string;
  amount: number;
};

type TakeHomePayBreakdown = {
  additions: PayslipItem[];
  deductions: PayslipItem[];
  totalAdditions: number;
  totalDeductions: number;
  takeHomePay: number;
  totalAdditionsLabel: string;
  takeHomePayLabel: string;
};

function formatCurrency(amount: number) {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

export default function TakeHomePayCard({
  value,
  sub,
  breakdown,
}: {
  value: string;
  sub?: string;
  breakdown: TakeHomePayBreakdown | null;
}) {
  const [open, setOpen] = useState(false);

  const additions = useMemo(() => breakdown?.additions ?? [], [breakdown]);
  const deductions = useMemo(() => breakdown?.deductions ?? [], [breakdown]);

  return (
    <>
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Take Home Pay</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setOpen(true)}
              disabled={!breakdown}
            >
              Info
            </Button>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50">
              <CreditCard size={15} className="text-slate-400" />
            </div>
          </div>
        </div>
        <p className="text-2xl font-extrabold tracking-tight text-slate-800">{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail THP</DialogTitle>
          </DialogHeader>

          {!breakdown ? (
            <p className="text-sm text-slate-500">Data breakdown THP belum tersedia untuk periode ini.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Penambah</p>
                <div className="space-y-1.5">
                  {additions.length === 0 ? (
                    <p className="text-slate-400">Tidak ada komponen penambah.</p>
                  ) : (
                    additions.map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pengurang</p>
                <div className="space-y-1.5">
                  {deductions.length === 0 ? (
                    <p className="text-slate-400">Tidak ada komponen pengurang.</p>
                  ) : (
                    deductions.map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{breakdown.totalAdditionsLabel}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(breakdown.totalAdditions)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Total Pengurang</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(breakdown.totalDeductions)}</span>
                </div>
                <div className="flex items-center justify-between text-base">
                  <span className="font-bold text-slate-900">{breakdown.takeHomePayLabel}</span>
                  <span className="font-extrabold text-teal-700">{formatCurrency(breakdown.takeHomePay)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

