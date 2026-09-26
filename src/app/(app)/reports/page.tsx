"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { PillGroup } from "@/components/ui/pill-group";
import { StatCard } from "@/components/ui/stat-card";
import { db } from "@/lib/db/dexie";
import type { FuelProduct } from "@/lib/db/types";
import { dayKey, type RangePreset } from "@/lib/domain/dates";
import { date, litres, money, moneyShort, pct, signedMoney } from "@/lib/domain/format";
import { downloadCsv } from "@/lib/csv";
import { queryCredit, queryReport, type ReportInput } from "@/lib/repo/queries";
import { useLive } from "@/lib/hooks/use-live";
import { useSession } from "@/lib/session/session-store";

type ReportId = "daily" | "collections" | "products" | "shifts" | "expenses" | "stations" | "credit";

interface ReportDef {
  id: ReportId;
  name: string;
  blurb: string;
}

const REPORTS: ReportDef[] = [
  { id: "daily", name: "Daily sales summary", blurb: "Revenue, volume and transactions per day" },
  { id: "collections", name: "Collections by method", blurb: "Cash vs UPI vs card vs credit share" },
  { id: "products", name: "Product volume & margin", blurb: "Litres, revenue and estimated margin" },
  { id: "shifts", name: "Shift reconciliation", blurb: "Expected vs counted, variance status" },
  { id: "expenses", name: "Expenses by category", blurb: "Voucher totals grouped by category" },
  { id: "stations", name: "Station comparison", blurb: "Side-by-side outlet performance" },
  { id: "credit", name: "Credit aging", blurb: "Customer balances with aging buckets" },
];

const RANGES: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

interface BuiltReport {
  title: string;
  subtitle: string;
  header: string[];
  align: ("left" | "right")[];
  rows: (string | number)[][];
  csvName: string;
}

function buildReport(
  id: ReportId,
  input: ReportInput,
  creditRows: Awaited<ReturnType<typeof queryCredit>>,
  products: FuelProduct[],
  stationName: (id: string) => string,
): BuiltReport {
  const { sales, expenses, recons, stations, range } = input;
  const subtitle = `${date(range.from)} → ${date(range.to)} · ${stations.length} station(s)`;

  if (id === "daily") {
    const map = new Map<string, { rev: number; ml: number; n: number; cash: number }>();
    for (const s of sales) {
      const k = dayKey(s.ts);
      const row = map.get(k) ?? { rev: 0, ml: 0, n: 0, cash: 0 };
      row.rev += s.amountPaise;
      row.ml += s.kind === "fuel" ? (s.quantityMl ?? 0) : 0;
      row.n += 1;
      if (s.payment === "cash") row.cash += s.amountPaise;
      map.set(k, row);
    }
    const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, r]) => [day, money(r.rev), litres(r.ml), r.n, money(r.cash)]);
    return { title: "Daily sales summary", subtitle, header: ["Day", "Revenue", "Litres", "Sales", "Cash"], align: ["left", "right", "right", "right", "right"], rows, csvName: "daily-sales" };
  }

  if (id === "collections") {
    const totals = { cash: 0, upi: 0, card: 0, credit: 0 };
    for (const s of sales) totals[s.payment] += s.amountPaise;
    const grand = totals.cash + totals.upi + totals.card + totals.credit || 1;
    const rows = (Object.keys(totals) as (keyof typeof totals)[]).map((k) => [k, money(totals[k]), pct((totals[k] / grand) * 100)]);
    rows.push(["total", money(grand), "100%"]);
    return { title: "Collections by method", subtitle, header: ["Method", "Amount", "Share"], align: ["left", "right", "right"], rows, csvName: "collections" };
  }

  if (id === "products") {
    const productCost = new Map(products.map((p) => [p.code, p.costPaise]));
    const agg = new Map<string, { ml: number; rev: number; margin: number }>();
    for (const s of sales) {
      if (s.kind !== "fuel" || !s.productCode) continue;
      const row = agg.get(s.productCode) ?? { ml: 0, rev: 0, margin: 0 };
      row.ml += s.quantityMl ?? 0;
      row.rev += s.amountPaise;
      const cost = productCost.get(s.productCode) ?? 0;
      row.margin += Math.round((((s.unitPricePaise ?? 0) - cost) * (s.quantityMl ?? 0)) / 1000);
      agg.set(s.productCode, row);
    }
    const rows = [...agg.entries()].sort((a, b) => b[1].ml - a[1].ml).map(([code, r]) => [code, litres(r.ml), money(r.rev), money(r.margin)]);
    return { title: "Product volume & margin", subtitle, header: ["Product", "Litres", "Revenue", "Est. margin"], align: ["left", "right", "right", "right"], rows, csvName: "products" };
  }

  if (id === "shifts") {
    const rows: (string | number)[][] = [];
    for (const r of [...recons].sort((a, b) => b.ts - a.ts)) {
      rows.push([
        date(r.ts),
        stationName(r.stationId),
        money(r.expectedPaise),
        money(r.countedPaise),
        signedMoney(r.variancePaise),
        r.status,
      ]);
    }
    return { title: "Shift reconciliation", subtitle, header: ["Date", "Station", "Expected", "Counted", "Variance", "Status"], align: ["left", "left", "right", "right", "right", "left"], rows, csvName: "shift-recon" };
  }

  if (id === "expenses") {
    const agg = new Map<string, { total: number; n: number; cash: number }>();
    for (const e of expenses) {
      const row = agg.get(e.category) ?? { total: 0, n: 0, cash: 0 };
      row.total += e.amountPaise;
      row.n += 1;
      if (e.paidBy === "cash") row.cash += e.amountPaise;
      agg.set(e.category, row);
    }
    const rows = [...agg.entries()].sort((a, b) => b[1].total - a[1].total).map(([cat, r]) => [cat, r.n, money(r.total), money(r.cash)]);
    return { title: "Expenses by category", subtitle, header: ["Category", "Vouchers", "Total", "From cash"], align: ["left", "right", "right", "right"], rows, csvName: "expenses" };
  }

  if (id === "stations") {
    const rows = stations.map((st) => {
      const rowsOf = sales.filter((s) => s.stationId === st.id);
      const rev = rowsOf.reduce((a, s) => a + s.amountPaise, 0);
      const ml = rowsOf.reduce((a, s) => a + (s.kind === "fuel" ? (s.quantityMl ?? 0) : 0), 0);
      const variance = recons.filter((r) => r.stationId === st.id).reduce((a, r) => a + r.variancePaise, 0);
      return [st.name, money(rev), litres(ml), String(rowsOf.length), signedMoney(variance)];
    });
    return { title: "Station comparison", subtitle, header: ["Station", "Revenue", "Litres", "Sales", "Cash variance"], align: ["left", "right", "right", "right", "right"], rows, csvName: "stations" };
  }

  // credit aging
  const rows = creditRows
    .filter((r) => r.balancePaise !== 0)
    .sort((a, b) => b.balancePaise - a.balancePaise)
    .map((r) => [r.customer.name, money(r.balancePaise), money(r.limitPaise), money(r.aging.current), money(r.aging.d30), money(r.aging.d60 + r.aging.d90 + r.aging.d90plus)]);
  return { title: "Credit aging", subtitle, header: ["Customer", "Balance", "Limit", "Current", "1–30 d", "31+ d"], align: ["left", "right", "right", "right", "right", "right"], rows, csvName: "credit-aging" };
}

export default function ReportsPage() {
  const scope = useSession((s) => s.scope);
  const profileId = useSession((s) => s.profileId);
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [reportId, setReportId] = useState<ReportId>("daily");

  const input = useLive<ReportInput | null>(() => queryReport(scope, preset), [scope, preset, profileId], null);
  const creditRows = useLive(() => queryCredit(), [profileId], null);
  const stations = useLive(() => db.stations.toArray(), [], null);
  const products = useLive(() => db.products.toArray(), [], null);

  const stationName = useMemo(() => {
    const map = new Map((stations ?? []).map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [stations]);

  const report = useMemo(() => {
    if (!input || !creditRows || !products) return null;
    return buildReport(reportId, input, creditRows, products, stationName);
  }, [reportId, input, creditRows, products, stationName]);

  if (!report || !input) return <Skeleton className="h-96" />;

  const totals = input.sales.reduce((a, s) => a + s.amountPaise, 0);
  const totalMl = input.sales.reduce((a, s) => a + (s.kind === "fuel" ? (s.quantityMl ?? 0) : 0), 0);
  const displayRows =
    reportId === "daily"
      ? report.rows.map((row) => [date(Date.parse(`${String(row[0])}T00:00:00`)), ...row.slice(1)])
      : report.rows;

  return (
    <div>
      <PageHeader
        crumbs="Analytics / Reports"
        title="Reports"
        sub="Scoped by the top-bar switcher. Exports CSV, prints clean."
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print
            </Button>
            <Button
              onClick={() =>
                downloadCsv(
                  `fuelops-${report.csvName}-${preset}.csv`,
                  report.header,
                  report.rows,
                )
              }
              disabled={!report.rows.length}
            >
              <Download className="size-4" aria-hidden /> CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="no-print">
          <h2 className="mono-label mb-3 uppercase text-muted">Report</h2>
          <ul className="space-y-2">
            {REPORTS.map((r) => {
              const active = r.id === reportId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setReportId(r.id)}
                    className={`w-full cursor-pointer rounded-md border px-4 py-3 text-left transition-colors ${
                      active ? "border-primary bg-primary text-on-primary" : "border-hairline bg-white hover:border-primary/50"
                    }`}
                  >
                    <span className="block text-[15px]">{r.name}</span>
                    <span className={`mono-label mt-0.5 block ${active ? "text-white/60" : "text-muted"}`}>{r.blurb}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <h2 className="mono-label mb-3 mt-6 uppercase text-muted">Range</h2>
          <PillGroup ariaLabel="Report range" options={RANGES} value={preset} onChange={setPreset} />

          <div className="mt-6 grid gap-3">
            <StatCard label="Revenue in range" value={moneyShort(totals)} />
            <StatCard label="Volume in range" value={litres(totalMl)} />
          </div>
        </aside>

        <section>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-[22px] text-primary">{report.title}</h2>
              <p className="mono-label mt-1 text-muted">{report.subtitle}</p>
            </div>
            <span className="mono-label text-muted">{report.rows.length} rows</span>
          </div>

          {report.rows.length === 0 ? (
            <EmptyState title="Nothing to report" description="No rows in this range and scope." />
          ) : (
            <div className="w-full overflow-x-auto rounded-md border border-card-border bg-white">
              <table className="w-full border-collapse whitespace-nowrap text-[15px]">
                <thead>
                  <tr className="border-b border-hairline">
                    {report.header.map((h, i) => (
                      <th
                        key={h}
                        className={`mono-label bg-white px-4 py-3 font-normal text-muted ${report.align[i] === "right" ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-card-border transition-colors hover:bg-pale-green/50">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`px-4 py-2.5 text-ink ${report.align[ci] === "right" ? "text-right font-mono tabular-nums" : ""} ${ci === 0 ? "" : ""}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
