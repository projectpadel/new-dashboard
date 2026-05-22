import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { KpiCard } from "@/components/admin/KpiCard";
import { FinanceTransactionFilterDialog } from "@/components/admin/FinanceTransactionFilterDialog";
import { FinanceTransactionTable } from "@/components/admin/FinanceTransactionTable";
import {
  downloadFinanceTransactionsPdf,
  getFinanceTransactionsPage,
  getFinanceTransactionsSummary,
  type FinanceTransactionsCursor,
  type FinanceTransactionsFilterInput,
} from "@/lib/admin-finance.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function downloadBase64Pdf(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/admin/keuangan/transaksi")({
  component: KeuanganTransaksiPage,
});

function KeuanganTransaksiPage() {
  const fetchSummary = useServerFn(getFinanceTransactionsSummary);
  const fetchPage = useServerFn(getFinanceTransactionsPage);
  const fetchPdf = useServerFn(downloadFinanceTransactionsPdf);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [appliedFilters, setAppliedFilters] = useState<FinanceTransactionsFilterInput | undefined>();
  const [pdfLoading, setPdfLoading] = useState(false);

  const filterKey = useMemo(() => JSON.stringify(appliedFilters ?? {}), [appliedFilters]);

  const { data: summary, isLoading: summaryLoad } = useQuery({
    queryKey: ["admin", "finance", "transactions", "summary"],
    queryFn: () => fetchSummary(),
  });

  const {
    data,
    isLoading: listLoad,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["admin", "finance", "transactions", "list", summary?.dataSource, filterKey],
    queryFn: ({ pageParam }) => {
      const p = pageParam as FinanceTransactionsCursor | undefined;
      return fetchPage({
        data: {
          cursorCreatedAt: p?.cursorCreatedAt,
          cursorId: p?.cursorId,
          filters: appliedFilters,
        },
      });
    },
    initialPageParam: undefined as FinanceTransactionsCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: summary !== undefined,
  });

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const isFiltered = data?.pages[0]?.filtered ?? Boolean(appliedFilters);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetchPdf({ data: appliedFilters ?? {} });
      if (!res.base64 || !res.rowCount) {
        toast.error("Tidak ada transaksi untuk diekspor.");
        return;
      }
      downloadBase64Pdf(res.base64, res.filename);
      toast.success(`PDF berisi ${res.rowCount} transaksi berhasil diunduh.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/keuangan/pendapatan">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali ke Pendapatan
          </Link>
        </Button>
      </div>

      <h2 className="text-xl font-semibold tracking-tight">Semua transaksi</h2>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total transaksi"
          value={summaryLoad ? "…" : String(summary?.total ?? 0)}
        />
        <KpiCard
          title="Pending"
          value={summaryLoad ? "…" : String(summary?.pending ?? 0)}
        />
        <KpiCard
          title="Success"
          value={summaryLoad ? "…" : String(summary?.success ?? 0)}
        />
        <KpiCard
          title="Refund"
          value={summaryLoad ? "…" : String(summary?.refund ?? 0)}
        />
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="p-5 border-b flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Riwayat transaksi</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pdfLoading || listLoad}
              onClick={() => void handleDownloadPdf()}
            >
              {pdfLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Unduh PDF
            </Button>
            <FinanceTransactionFilterDialog applied={appliedFilters} onApply={setAppliedFilters} />
          </div>
        </div>
        <FinanceTransactionTable
          rows={rows}
          isLoading={listLoad && !isFetchingNextPage}
          emptyMessage={
            isFiltered ? "Tidak ada transaksi yang cocok dengan filter." : "Belum ada transaksi."
          }
          footer={
            <div ref={loadMoreRef} className="px-5 py-6 flex justify-center min-h-[3rem]">
              {(listLoad || isFetchingNextPage) && (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memuat…
                </span>
              )}
            </div>
          }
        />
      </section>
    </div>
  );
}
