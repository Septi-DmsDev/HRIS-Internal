"use client";

import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnFiltersState,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useEffect, useState } from "react";

type DataTableProps<T extends Record<string, unknown>> = {
  data: T[];
  columns: ColumnDef<T>[];
  searchKey?: string;
  searchPlaceholder?: string;
  globalSearch?: boolean;
  toolbarSlot?: ReactNode;
  stateKey?: string;
};

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchKey,
  searchPlaceholder = "Cari...",
  globalSearch = false,
  toolbarSlot,
  stateKey,
}: DataTableProps<T>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  useEffect(() => {
    if (!stateKey) return;
    try {
      const raw = sessionStorage.getItem(stateKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        columnFilters?: ColumnFiltersState;
        globalFilter?: string;
        sorting?: SortingState;
        pagination?: PaginationState;
      };
      if (parsed.columnFilters) setColumnFilters(parsed.columnFilters);
      if (typeof parsed.globalFilter === "string") setGlobalFilter(parsed.globalFilter);
      if (parsed.sorting) setSorting(parsed.sorting);
      if (parsed.pagination) setPagination(parsed.pagination);
    } catch {
      // Ignore invalid persisted state.
    }
  }, [stateKey]);

  useEffect(() => {
    if (!stateKey) return;
    sessionStorage.setItem(
      stateKey,
      JSON.stringify({
        columnFilters,
        globalFilter,
        sorting,
        pagination,
      })
    );
  }, [stateKey, columnFilters, globalFilter, sorting, pagination]);

  const searchValue = globalSearch
    ? globalFilter
    : searchKey === undefined
      ? ""
      : ((columnFilters.find((filter) => filter.id === searchKey)
          ?.value as string | undefined) ?? "");

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "").trim().toLowerCase();
      if (!query) return true;

      const haystack = Object.values(row.original)
        .map((value) => String(value ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { columnFilters, globalFilter, sorting, pagination },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  const showToolbar = searchKey !== undefined || globalSearch || toolbarSlot !== undefined;

  return (
    <div className="space-y-4">
      {showToolbar && (
        <div className="flex items-center justify-between gap-3">
          {(searchKey !== undefined || globalSearch) ? (
            <div className="relative flex-1 max-w-xs">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => {
                  const value = e.target.value;
                  if (globalSearch) {
                    setGlobalFilter(value);
                  } else {
                    setColumnFilters(value ? [{ id: searchKey!, value }] : []);
                  }
                }}
                className="pl-9 h-9 text-sm bg-white border-slate-200 focus-visible:ring-teal-500 placeholder:text-slate-400"
              />
            </div>
          ) : <div />}
          {toolbarSlot && <div className="shrink-0">{toolbarSlot}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-slate-50/80 border-b border-slate-200/80 hover:bg-slate-50/80">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-[11px] font-bold uppercase tracking-wider text-slate-400 h-11 px-4"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                        className={
                          header.column.getCanSort()
                            ? "inline-flex items-center gap-1 text-left hover:text-slate-600 transition-colors"
                            : "inline-flex items-center gap-1 text-left"
                        }
                        disabled={!header.column.getCanSort()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() ? (
                          header.column.getIsSorted() === "asc" ? (
                            <ArrowUp size={12} />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown size={12} />
                          ) : (
                            <ArrowUpDown size={12} />
                          )
                        ) : null}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-slate-400 py-14 text-sm"
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <Search size={14} className="text-slate-400" />
                    </div>
                    <span>Tidak ada data</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="text-sm text-slate-700 px-4 py-3.5"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium">
          {searchKey !== undefined && filteredCount !== totalCount
            ? `${filteredCount} dari ${totalCount} data`
            : `${totalCount} data`}
        </span>

        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              Halaman {pageIndex + 1} / {pageCount}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="h-8 w-8 p-0 border-slate-200"
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="h-8 w-8 p-0 border-slate-200"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
