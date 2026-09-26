"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ArrowUpRight, TriangleAlert } from "lucide-react";
import { HourlyBars, MixDonut, RevenueTrendChart } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Chip, type Tone } from "@/components/ui/chip";
import { EmptyState, ProgressBar, Skeleton } from "@/components/ui/misc";
import { PillGroup } from "@/components/ui/pill-group";
import { StatCard } from "@/components/ui/stat-card";
import { ackAll } from "@/lib/repo/alerts";
import { queryDashboard, type DashboardData } from "@/lib/repo/queries";
import { useLive } from "@/lib/hooks/use-live";
import { downloadCsv } from "@/lib/csv";
import { rangeLabel } from "@/lib/domain/analytics";
import type { RangePreset } from "@/lib/domain/dates";
import { date, litres, moneyShort, pct, relative, signedMoney } from "@/lib/domain/format";
import { useSession } from "@/lib/session/session-store";

const RANGES: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

function delta(now: number, prev: number): { text: string; up: boolean } | null {
  if (!prev) return null;
  const d = ((now - prev) / Math.abs(prev)) * 100;
  return { text: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}% vs prev`, up: d >= 0 };
}

function varianceTone(v: number, tolerance = 1): Tone {
  if (Math.abs(v) <= tolerance) return "ok";
  return v < 0 ? "short" : "over";
}

export default function DashboardPage() {
  const scope = useSession((s) => s.scope);
  const profileId = useSession((s) => s.profileId);
  const [preset, setPreset] = useState<RangePreset>("7d");
  const data = useLive<DashboardData | null>(
    () => queryDashboard(scope, preset),
    [scope, preset, profileId],
    null,
  );

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { kpisNow, kpisPrev } = data;
  const revDelta = delta(kpisNow.revenuePaise, kpisPrev.revenuePaise);
  const ltrDelta = delta(kpisNow.litresMl, kpisPrev.litresMl);
  const health = data.tankStats.length
    ? data.tankStats.reduce((a, t) => a + t.pct, 0) / data.tankStats.length
    : 0;
  const lowestTank = [...data.tankStats].sort((a, b) => a.pct - b.pct)[0];
  const unacked = data.alerts.filter((a) => !a.acked);
  const stationName = new Map(data.stations.map((s) => [s.id, s.name]));

  const exportCsv = () => {
    downloadCsv(
      `fuelops-${preset}.csv`,
      ["Day", "Revenue (INR)", "Litres", "Sales"],
      data.trend.map((p) => [p.day, (p.revenuePaise / 100).toFixed(0), (p.litresMl / 1000).toFixed(1), p.sales]),
    );
  };

  const columns: Column<(typeof data.leaderboard)[number]>[] = [
    {
      key: "rank",
      header: "#",
      width: "44px",
      render: (r) => <span className="mono-label text-muted">{data.leaderboard.indexOf(r) + 1}</span>,
    },
    {
      key: "station",
      header: "Station",
      sortValue: (r) => r.station.name,
      render: (r) => (
        <div className="min-w-0">
          <Link href={`/stations?id=${r.station.id}`} className="text-ink hover:text-action-blue hover:underline">
            {r.station.name}
          </Link>
          <p className="mono-label text-muted">{r.station.code} · {r.station.city}</p>
        </div>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortValue: (r) => r.revenuePaise,
      render: (r) => <span className="tabular-nums">{moneyShort(r.revenuePaise)}</span>,
    },
    {
      key: "litres",
      header: "Litres",
      align: "right",
      sortValue: (r) => r.litresMl,
      render: (r) => <span className="tabular-nums text-body-muted">{litres(r.litresMl)}</span>,
    },
    {
      key: "variance",
      header: "Cash variance",
      align: "right",
      sortValue: (r) => r.variancePaise,
      render: (r) => (
        <Chip tone={varianceTone(r.variancePaise)}>{signedMoney(r.variancePaise)}</Chip>
      ),
    },
    {
      key: "health",
      header: "Tank health",
      width: "170px",
      sortValue: (r) => {
        const tanks = data.tankStats.filter((t) => t.stationId === r.station.id);
        return tanks.length ? tanks.reduce((a, t) => a + t.pct, 0) / tanks.length : 0;
      },
      render: (r) => {
        const tanks = data.tankStats.filter((t) => t.stationId === r.station.id);
        const avg = tanks.length ? tanks.reduce((a, t) => a + t.pct, 0) / tanks.length : 0;
        const tone = avg <= 12 ? "critical" : avg <= 25 ? "warning" : "ok";
        return (
          <div className="flex items-center gap-3">
            <ProgressBar pct={avg} tone={tone} className="w-24" />
            <span className="mono-label tabular-nums text-body-muted">{avg.toFixed(0)}%</span>
          </div>
        );
      },
    },
  ];

  const mixBar = [
    { k: "cash", v: data.mix.shares.cash, c: "bg-deep-green" },
    { k: "upi", v: data.mix.shares.upi, c: "bg-action-blue" },
    { k: "card", v: data.mix.shares.card, c: "bg-form-focus" },
    { k: "credit", v: data.mix.shares.credit, c: "bg-coral" },
  ];

  return (
    <div>
      <PageHeader
        crumbs="Dashboard"
        title="Network overview"
        sub={rangeLabel(data.range.from, data.range.to)}
        actions={
          <>
            <PillGroup ariaLabel="Date range" options={RANGES} value={preset} onChange={setPreset} />
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Revenue"
          value={moneyShort(kpisNow.revenuePaise)}
          sub={
            revDelta && (
              <span className={revDelta.up ? "text-deep-green" : "text-error"}>
                {revDelta.text}
              </span>
            )
          }
        />
        <StatCard
          label="Fuel volume"
          value={litres(kpisNow.litresMl)}
          sub={
            ltrDelta && (
              <span className={ltrDelta.up ? "text-deep-green" : "text-error"}>{ltrDelta.text}</span>
            )
          }
        />
        <StatCard
          label="Cash variance"
          value={signedMoney(data.variancePaise)}
          tone={Math.abs(data.variancePaise) <= 1 ? "positive" : data.variancePaise < 0 ? "negative" : "neutral"}
          sub={`${data.recentRecons.length} reconciliations in range`}
        />
        <StatCard label="Collections mix" value={moneyShort(data.mix.total)} sub={kpisNow.salesCount + " sales in range"}>
          <div className="flex h-2 overflow-hidden rounded-full bg-soft-stone" aria-hidden>
            {mixBar.map((m) => (
              <div key={m.k} className={m.c} style={{ width: `${Math.max(0, m.v * 100)}%` }} />
            ))}
          </div>
        </StatCard>
        <StatCard
          label="Credit outstanding"
          value={moneyShort(data.creditOutstandingPaise)}
          tone={data.creditOverduePaise > 0 ? "negative" : "default"}
          sub={data.creditOverduePaise > 0 ? `${moneyShort(data.creditOverduePaise)} overdue` : "nothing overdue"}
        />
        <StatCard
          label="Avg tank health"
          value={pct(health, 0)}
          tone={health <= 25 ? "negative" : health <= 40 ? "neutral" : "positive"}
          sub={lowestTank ? `Lowest: ${lowestTank.stationName} ${lowestTank.name} ${pct(lowestTank.pct, 0)}` : "No tanks"}
        />
      </div>

      {/* Live ops band */}
      <section className="mt-6 rounded-lg bg-deep-green p-6 text-white">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity className="size-4 text-coral" aria-hidden />
            <h2 className="mono-label uppercase text-white/70">Live operations</h2>
            <Chip tone={unacked.length ? "critical" : "dark"} className="border-white/25 bg-white/10 text-white">
              {unacked.length} open alerts
            </Chip>
            {data.longOpenShifts > 0 && (
              <Chip tone="warning" className="border-coral bg-coral/20 text-coral-soft">
                {data.longOpenShifts} shift open &gt; 10 h
              </Chip>
            )}
          </div>
          <Link href="/pos">
            <Button size="sm" className="border-white bg-white text-deep-green hover:bg-coral hover:text-white hover:border-coral">
              Record sale
              <ArrowUpRight className="size-4" aria-hidden />
            </Button>
          </Link>
        </div>
        {data.openShifts.length === 0 ? (
          <p className="text-[14px] text-white/70">No open shifts in scope. Start one from Shifts.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.openShifts.map((sh) => (
              <li key={sh.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{stationName.get(sh.stationId) ?? sh.stationId}</p>
                  <p className="mono-label text-white/50">
                    {sh.name} · since {relative(sh.openTs, data.now)}
                  </p>
                </div>
                <Chip tone="ok" className="border-deep-green/50 bg-pale-green/15 text-pale-green">
                  Open
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-card-border bg-white p-5 lg:col-span-2">
          <RevenueTrendChart points={data.trend} />
        </div>
        <div className="rounded-md border border-card-border bg-white p-5">
          <MixDonut shares={data.mix.shares} />
        </div>
      </div>

      {/* Leaderboard */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[20px] text-primary">Outlet leaderboard</h2>
          <span className="mono-label text-muted">{rangeLabel(data.range.from, data.range.to)}</span>
        </div>
        <DataTable columns={columns} rows={data.leaderboard} rowKey={(r) => r.station.id} empty="No stations in scope" />
      </section>

      {/* Bottom row */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <section className="rounded-md border border-card-border bg-white p-5 lg:col-span-1">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] text-primary">Tank health</h2>
            <Link href="/inventory" className="mono-label text-action-blue hover:underline">
              Inventory →
            </Link>
          </div>
          {data.tankStats.length === 0 ? (
            <p className="text-[14px] text-body-muted">No tanks in scope.</p>
          ) : (
            <ul className="space-y-4">
              {[...data.tankStats]
                .sort((a, b) => a.pct - b.pct)
                .slice(0, 7)
                .map((t) => (
                  <li key={t.tankId}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] text-ink">
                        {t.stationName} · {t.name}
                      </span>
                      <span className="mono-label tabular-nums text-body-muted">{pct(t.pct, 0)}</span>
                    </div>
                    <ProgressBar
                      pct={t.pct}
                      tone={t.stockStatus === "critical" ? "critical" : t.stockStatus === "low" ? "warning" : "ok"}
                    />
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-card-border bg-white p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] text-primary">Alerts</h2>
            <div className="flex items-center gap-3">
              {unacked.length > 0 && (
                <button
                  type="button"
                  onClick={() => ackAll()}
                  className="mono-label text-action-blue hover:underline"
                >
                  Ack all
                </button>
              )}
              <Link href="/alerts" className="mono-label text-action-blue hover:underline">
                All →
              </Link>
            </div>
          </div>
          {data.alerts.length === 0 ? (
            <EmptyState title="All clear" description="No active alerts in this scope." />
          ) : (
            <ul className="divide-y divide-card-border">
              {data.alerts.slice(0, 6).map((a) => (
                <li key={a.id} className={`flex gap-3 py-3 ${a.acked ? "opacity-50" : ""}`}>
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      a.severity === "critical" ? "bg-error" : a.severity === "warning" ? "bg-coral" : "bg-action-blue"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[14px] leading-snug text-ink">{a.title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-body-muted">{a.message}</p>
                    <p className="mono-label mt-1 text-muted">{relative(a.ts, data.now)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-card-border bg-white p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] text-primary">Recent reconciliations</h2>
            <Link href="/shifts" className="mono-label text-action-blue hover:underline">
              Shifts →
            </Link>
          </div>
          {data.recentRecons.length === 0 ? (
            <p className="text-[14px] text-body-muted">No shifts closed in this range.</p>
          ) : (
            <ul className="divide-y divide-card-border">
              {data.recentRecons.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-ink">{stationName.get(r.stationId) ?? r.stationId}</p>
                    <p className="mono-label text-muted">{date(r.ts)} · counted {moneyShort(r.countedPaise)}</p>
                  </div>
                  <Chip tone={varianceTone(r.variancePaise)}>{signedMoney(r.variancePaise)}</Chip>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 border-t border-card-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="mono-label text-muted">Hourly pattern</span>
              <TriangleAlert className="size-3.5 text-muted" aria-hidden />
            </div>
            <HourlyBars buckets={data.hourly} />
          </div>
        </section>
      </div>
    </div>
  );
}
