"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, Fuel, Gauge, MapPin, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState, ProgressBar, Skeleton } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { StoneCard } from "@/components/ui/card";
import { queryStationCards, queryStationDetail, type StationDetailData } from "@/lib/repo/queries";
import { useLive } from "@/lib/hooks/use-live";
import { date, dateTime, litres, money, moneyShort, pct, relative, time } from "@/lib/domain/format";
import { useSession } from "@/lib/session/session-store";

/* --------------------------------- grid --------------------------------- */

function StationGrid() {
  const scope = useSession((s) => s.scope);
  const profileId = useSession((s) => s.profileId);
  const cards = useLive(() => queryStationCards(scope), [scope, profileId], null);

  if (!cards) return <Skeleton className="h-96" />;
  if (!cards.length)
    return <EmptyState title="No stations in scope" description="Switch the scope switcher to 'All outlets'." />;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <StoneCard key={c.station.id} className="p-5 transition-colors hover:bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[18px] leading-snug text-primary">
                <Link href={`/stations?id=${c.station.id}`} className="hover:text-action-blue hover:underline">
                  {c.station.name}
                </Link>
              </h2>
              <p className="mono-label mt-1 flex items-center gap-1.5 text-muted">
                <MapPin className="size-3" aria-hidden /> {c.station.code} · {c.station.city}
              </p>
            </div>
            {c.openShift ? (
              <Chip tone="ok">{c.openShift.name} open</Chip>
            ) : (
              <Chip tone="neutral">No shift</Chip>
            )}
          </div>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="mono-label text-muted">Today</p>
              <p className="display-tight text-[30px] leading-none text-primary">{moneyShort(c.todayPaise)}</p>
            </div>
            <div className="text-right">
              <p className="text-[15px] text-ink">{litres(c.todayLitresMl)}</p>
              <p className="mono-label text-muted">{c.todaySalesCount} sales</p>
            </div>
          </div>

          <ul className="mt-5 space-y-2.5">
            {c.tankStats.map((t) => (
              <li key={t.tankId} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-[13px] text-body-muted">{t.name}</span>
                <ProgressBar
                  pct={t.pct}
                  tone={t.stockStatus === "critical" ? "critical" : t.stockStatus === "low" ? "warning" : "ok"}
                  className="flex-1"
                />
                <span className="mono-label w-10 text-right tabular-nums text-body-muted">{pct(t.pct, 0)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4">
            <span className="mono-label flex items-center gap-1.5 text-muted">
              <Users className="size-3.5" aria-hidden /> {c.staffCount} staff
            </span>
            <Link href={`/stations?id=${c.station.id}`} className="text-[14px] text-action-blue hover:underline">
              Open →
            </Link>
          </div>
        </StoneCard>
      ))}
    </div>
  );
}

/* -------------------------------- detail -------------------------------- */

function ConsolePanel({ nozzles, pumps }: { nozzles: StationDetailData["nozzles"]; pumps: StationDetailData["pumps"] }) {
  const pumpName = new Map(pumps.map((p) => [p.id, p.name]));
  return (
    <div className="rounded-lg bg-dark-navy p-5 text-white">
      <div className="mb-4 flex items-center gap-2">
        <Gauge className="size-4 text-coral" aria-hidden />
        <h3 className="mono-label uppercase text-white/60">Dispensers · live totalizers</h3>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {nozzles.map((n) => (
          <div key={n.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3.5 py-2.5">
            <div>
              <p className="text-[14px]">
                {pumpName.get(n.pumpId) ?? n.pumpId} · N{n.nozzleNo}
              </p>
              <p className="mono-label text-coral-soft">{n.productCode}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[15px] tabular-nums">{(n.totalizerMl / 1000).toFixed(0)} L</p>
              <p className="mono-label text-white/40">{n.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StationDetail({ id }: { id: string }) {
  const profileId = useSession((s) => s.profileId);
  const data = useLive<StationDetailData | null>(() => queryStationDetail(id), [id, profileId], null);
  const [now] = useState(() => Date.now());

  if (!data) return <Skeleton className="h-96" />;
  if (!data.station)
    return <EmptyState title="Station not found" description="Pick a station from the list." action={<Link href="/stations" className="text-action-blue">← All stations</Link>} />;

  const st = data.station;
  const nozzlesByPump = data.nozzles;

  return (
    <div>
      <PageHeader
        crumbs={
          <Link href="/stations" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3" aria-hidden /> Stations
          </Link>
        }
        title={st.name}
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="mono-label text-muted">{st.code}</span>
            <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {st.city}</span>
            <span className="text-body-muted">{st.address}</span>
            <span className="mono-label text-muted">Tolerance ₹{(st.tolerancePaise / 100).toFixed(0)}</span>
          </span>
        }
        actions={
          <Link href={`/pos?station=${st.id}`}>
            <Button>Record sale</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today revenue" value={moneyShort(data.todayPaise)} />
        <StatCard label="Today volume" value={litres(data.todayLitresMl)} />
        <StatCard label="Transactions" value={String(data.todaySales.length)} sub={`${data.todaySales.filter((s) => s.kind === "retail").length} retail`} />
        <StatCard
          label="Current shift"
          value={data.openShift ? data.openShift.name : "—"}
          sub={data.openShift ? `open ${relative(data.openShift.openTs, now)}` : "no shift open"}
          tone={data.openShift ? "positive" : "neutral"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ConsolePanel nozzles={nozzlesByPump} pumps={data.pumps} />
        </div>

        <section className="rounded-md border border-card-border bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Fuel className="size-4 text-deep-green" aria-hidden />
            <h3 className="text-[17px] text-primary">Tanks</h3>
          </div>
          {data.tankStats.length === 0 ? (
            <p className="text-[14px] text-body-muted">No tanks configured.</p>
          ) : (
            <ul className="space-y-4">
              {data.tankStats.map((t) => (
                <li key={t.tankId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-[14px] text-ink">{t.name}</span>
                    <span className="mono-label tabular-nums text-body-muted">
                      {litres(t.levelMl, { precise: true })} / {litres(t.capacityMl)}
                    </span>
                  </div>
                  <ProgressBar
                    pct={t.pct}
                    tone={t.stockStatus === "critical" ? "critical" : t.stockStatus === "low" ? "warning" : "ok"}
                  />
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="mono-label text-muted">
                      {t.lastDipTs ? `dip ${dateTime(t.lastDipTs)}` : "no dip"}
                    </span>
                    <span className={`mono-label ${t.variancePct && Math.abs(t.variancePct) > 0.5 ? "text-coral" : "text-muted"}`}>
                      book vs dip {t.variancePct !== undefined ? `${t.variancePct >= 0 ? "+" : ""}${t.variancePct.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-md border border-card-border bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[17px] text-primary">Current shift</h3>
            <Link href="/shifts" className="mono-label text-action-blue hover:underline">Shifts →</Link>
          </div>
          {data.openShift ? (
            <dl className="space-y-3 text-[14px]">
              <div className="flex justify-between"><dt className="text-body-muted">Name</dt><dd className="text-ink">{data.openShift.name}</dd></div>
              <div className="flex justify-between"><dt className="text-body-muted">Opened</dt><dd className="text-ink">{dateTime(data.openShift.openTs)}</dd></div>
              <div className="flex justify-between"><dt className="text-body-muted">Opening cash</dt><dd className="text-ink">{money(data.openShift.openingCashPaise, { exact: true })}</dd></div>
            </dl>
          ) : (
            <div>
              <p className="text-[14px] text-body-muted">No shift open right now.</p>
              <Link href="/shifts" className="mt-3 inline-block text-[14px] text-action-blue hover:underline">Open a shift →</Link>
            </div>
          )}
        </section>

        <section className="rounded-md border border-card-border bg-white p-5">
          <h3 className="mb-4 text-[17px] text-primary">Staff on roll</h3>
          {data.staff.length === 0 ? (
            <p className="text-[14px] text-body-muted">No active staff.</p>
          ) : (
            <ul className="divide-y divide-card-border">
              {data.staff.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5">
                  <span className="text-[14px] text-ink">{m.name}</span>
                  <Chip tone={m.role === "owner" ? "info" : m.role === "manager" ? "ok" : "neutral"}>{m.role}</Chip>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-card-border bg-white p-5">
          <h3 className="mb-4 text-[17px] text-primary">Recent reconciliations</h3>
          {data.recentRecons.length === 0 ? (
            <p className="text-[14px] text-body-muted">No closed shifts yet.</p>
          ) : (
            <ul className="divide-y divide-card-border">
              {data.recentRecons.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-[14px] text-ink">{date(r.ts)} {time(r.ts)}</p>
                    <p className="mono-label text-muted">{r.status.toUpperCase()}</p>
                  </div>
                  <Chip tone={r.status === "ok" ? "ok" : r.status === "short" ? "short" : "over"}>
                    {r.variancePaise < 0 ? "−" : "+"}₹{Math.abs(r.variancePaise / 100).toFixed(0)}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

function StationsInner() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <StationDetail id={id} /> : <StationGrid />;
}

export default function StationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <StationsInner />
    </Suspense>
  );
}
