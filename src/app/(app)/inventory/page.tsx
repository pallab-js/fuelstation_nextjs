"use client";

import { useState } from "react";
import { Droplet, Truck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, ProgressBar, Skeleton, Tabs } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { toast } from "@/components/ui/toast";
import { dateTime, litres, money, pct, relative } from "@/lib/domain/format";
import { DomainError } from "@/lib/repo/common";
import { adjustRetailStock, recordDelivery, recordDip } from "@/lib/repo/ops";
import { queryInventory, type InventoryData } from "@/lib/repo/queries";
import { useLive } from "@/lib/hooks/use-live";
import { useSession } from "@/lib/session/session-store";

export default function InventoryPage() {
  const scope = useSession((s) => s.scope);
  const profileId = useSession((s) => s.profileId);
  const data = useLive<InventoryData | null>(() => queryInventory(scope), [scope, profileId], null);

  const [tab, setTab] = useState("tanks");
  const [dipFor, setDipFor] = useState<string | null>(null);
  const [delivFor, setDelivFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dipForm, setDipForm] = useState({ tankId: "", level: "" });
  const [delivForm, setDelivForm] = useState({ tankId: "", volume: "", rate: "", invoice: "", supplier: "HPCL" });

  if (!data) return <Skeleton className="h-96" />;

  const critical = data.tankStats.filter((t) => t.stockStatus === "critical");
  const low = data.tankStats.filter((t) => t.stockStatus === "low");
  const totalCapacity = data.tankStats.reduce((a, t) => a + t.capacityMl, 0);
  const totalLevel = data.tankStats.reduce((a, t) => a + t.levelMl, 0);
  const lowRetail = data.retailItems.filter((i) => i.stockQty <= i.lowStockAt);

  const openDip = (tankId: string) => {
    setDipForm({ tankId, level: "" });
    setDipFor(tankId);
  };
  const openDeliv = (tankId: string) => {
    setDelivForm({ tankId, volume: "", rate: "", invoice: "", supplier: "HPCL" });
    setDelivFor(tankId);
  };

  const submitDip = async () => {
    const tank = data.tankStats.find((t) => t.tankId === dipForm.tankId);
    const l = parseFloat(dipForm.level || "0") || 0;
    if (!tank) return;
    setBusy(true);
    try {
      await recordDip({
        stationId: tank.stationId,
        tankId: tank.tankId,
        levelMl: Math.round(l * 1000),
        staffId: profileId!,
      });
      toast.success("Dip recorded", `${tank.name} — ${litres(l * 1000, { precise: true })}`);
      setDipFor(null);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not record the dip.");
    } finally {
      setBusy(false);
    }
  };

  const submitDelivery = async () => {
    const tank = data.tankStats.find((t) => t.tankId === delivForm.tankId);
    const v = parseFloat(delivForm.volume || "0") || 0;
    const r = parseFloat(delivForm.rate || "0") || 0;
    if (!tank) return;
    setBusy(true);
    try {
      await recordDelivery({
        stationId: tank.stationId,
        tankId: tank.tankId,
        invoiceNo: delivForm.invoice,
        supplier: delivForm.supplier,
        volumeMl: Math.round(v * 1000),
        ratePaise: Math.round(r * 100),
        staffId: profileId!,
      });
      toast.success("Delivery recorded", `${tank.name} — ${litres(v * 1000, { precise: true })}`);
      setDelivFor(null);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not record the delivery.");
    } finally {
      setBusy(false);
    }
  };

  const adjustStock = async (itemId: string, delta: number) => {
    try {
      await adjustRetailStock({ itemId, delta, staffId: profileId! });
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not adjust stock.");
    }
  };

  const deliveryColumns: Column<(typeof data.recentDeliveries)[number]>[] = [
    {
      key: "ts",
      header: "Date",
      sortValue: (r) => r.ts,
      render: (r) => <span className="text-[14px] text-ink">{dateTime(r.ts)}</span>,
    },
    {
      key: "tank",
      header: "Tank",
      sortValue: (r) => r.tankName,
      render: (r) => (
        <div>
          <p className="text-[14px] text-ink">{r.tankName}</p>
          <p className="mono-label text-muted">{r.invoiceNo}</p>
        </div>
      ),
    },
    { key: "supplier", header: "Supplier", sortValue: (r) => r.supplier, render: (r) => <span className="text-[14px] text-body-muted">{r.supplier}</span> },
    { key: "volume", header: "Volume", align: "right", sortValue: (r) => r.volumeMl, render: (r) => <span className="tabular-nums">{litres(r.volumeMl, { precise: true })}</span> },
    { key: "amount", header: "Amount", align: "right", sortValue: (r) => r.amountPaise, render: (r) => <span className="tabular-nums">{money(r.amountPaise)}</span> },
  ];

  const dipColumns: Column<(typeof data.recentDips)[number]>[] = [
    { key: "ts", header: "When", sortValue: (r) => r.ts, render: (r) => <span className="text-[14px] text-ink">{dateTime(r.ts)}</span> },
    { key: "tank", header: "Tank", sortValue: (r) => r.tankName, render: (r) => <span className="text-[14px] text-ink">{r.tankName}</span> },
    { key: "level", header: "Level", align: "right", sortValue: (r) => r.levelMl, render: (r) => <span className="tabular-nums">{litres(r.levelMl, { precise: true })}</span> },
    { key: "source", header: "Source", render: (r) => <Chip tone={r.source === "manual" ? "neutral" : "info"}>{r.source}</Chip> },
  ];

  return (
    <div>
      <PageHeader
        crumbs="Operations / Inventory"
        title="Inventory"
        sub="Tank dips, deliveries and shop stock — all dip-anchored."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => openDip(data.tankStats[0]?.tankId ?? "")} disabled={!data.tankStats.length}>
              <Droplet className="size-4" aria-hidden /> Record dip
            </Button>
            <Button variant="outline" size="sm" onClick={() => openDeliv(data.tankStats[0]?.tankId ?? "")} disabled={!data.tankStats.length}>
              <Truck className="size-4" aria-hidden /> Record delivery
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tanks tracked" value={String(data.tankStats.length)} sub={`${data.recentDips.length} dips in 30d`} />
        <StatCard label="Aggregate level" value={pct(totalCapacity ? (totalLevel / totalCapacity) * 100 : 0, 0)} sub={`${litres(totalLevel)} in stock`} />
        <StatCard
          label="Below safe level"
          value={String(low.length + critical.length)}
          tone={critical.length ? "negative" : low.length ? "neutral" : "positive"}
          sub={critical.length ? `${critical.length} critical` : "no critical tanks"}
        />
        <StatCard
          label="Shop items low"
          value={String(lowRetail.length)}
          tone={lowRetail.length ? "negative" : "positive"}
          sub={lowRetail.map((i) => i.name).slice(0, 2).join(", ") || "all stocked"}
        />
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[
            { value: "tanks", label: "Tanks", count: data.tankStats.length },
            { value: "dips", label: "Dip log", count: data.recentDips.length },
            { value: "deliveries", label: "Deliveries", count: data.recentDeliveries.length },
            { value: "shop", label: "Shop stock", count: data.retailItems.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "tanks" &&
        (data.tankStats.length === 0 ? (
          <EmptyState title="No tanks in scope" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.tankStats.map((t) => (
              <section key={t.tankId} className="rounded-md border border-card-border bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[17px] text-primary">{t.name}</h3>
                    <p className="mono-label mt-0.5 text-muted">
                      {t.stationName} · {t.productCode}
                    </p>
                  </div>
                  <Chip tone={t.stockStatus === "critical" ? "critical" : t.stockStatus === "low" ? "warning" : t.stockStatus === "unknown" ? "neutral" : "ok"}>
                    {t.stockStatus}
                  </Chip>
                </div>

                <div className="mt-4 mb-2 flex items-baseline justify-between">
                  <span className="display-tight text-[28px] leading-none tabular-nums text-primary">{litres(t.levelMl)}</span>
                  <span className="mono-label text-muted">of {litres(t.capacityMl)}</span>
                </div>
                <ProgressBar
                  pct={t.pct}
                  tone={t.stockStatus === "critical" ? "critical" : t.stockStatus === "low" ? "warning" : "ok"}
                />

                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-[13px]">
                  <dt className="text-body-muted">Fill</dt>
                  <dd className="text-right tabular-nums text-ink">{pct(t.pct, 1)}</dd>
                  <dt className="text-body-muted">Book vs dip</dt>
                  <dd className={`text-right font-mono tabular-nums ${t.variancePct !== undefined && Math.abs(t.variancePct) > 0.5 ? "text-coral" : "text-ink"}`}>
                    {t.variancePct !== undefined ? `${t.variancePct >= 0 ? "+" : ""}${t.variancePct.toFixed(2)}%` : "—"}
                  </dd>
                  <dt className="text-body-muted">Last dip</dt>
                  <dd className="text-right text-ink">{t.lastDipTs ? relative(t.lastDipTs) : "never"}</dd>
                  <dt className="text-body-muted">Safe / critical</dt>
                  <dd className="text-right text-ink">{t.safeLevelPct}% / {t.criticalLevelPct}%</dd>
                </dl>

                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openDip(t.tankId)}>
                    <Droplet className="size-3.5" aria-hidden /> Dip
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openDeliv(t.tankId)}>
                    <Truck className="size-3.5" aria-hidden /> Delivery
                  </Button>
                </div>
              </section>
            ))}
          </div>
        ))}

      {tab === "dips" && (
        <>
          <DataTable columns={dipColumns} rows={data.recentDips.slice(0, 50)} rowKey={(r) => r.id} initialSort={{ key: "ts", dir: "desc" }} empty="No dips in the last 30 days" />
          {data.recentDips.length > 50 && (
            <p className="mono-label mt-3 text-muted">Showing the 50 newest of {data.recentDips.length} dips in 30 days</p>
          )}
        </>
      )}

      {tab === "deliveries" && (
        <DataTable columns={deliveryColumns} rows={data.recentDeliveries} rowKey={(r) => r.id} initialSort={{ key: "ts", dir: "desc" }} empty="No deliveries in the last 30 days" />
      )}

      {tab === "shop" &&
        (data.retailItems.length === 0 ? (
          <EmptyState title="No shop stock rows" description="Retail items are seeded per station." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[15px]">
              <thead>
                <tr className="border-b border-hairline">
                  {["Item", "SKU", "Price", "Stock", "Low at", "Adjust"].map((h, i) => (
                    <th key={h} className={`mono-label bg-white py-3 pr-4 font-normal text-muted ${i > 1 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.retailItems.map((i) => (
                  <tr key={i.id} className="border-b border-card-border transition-colors hover:bg-pale-green/50">
                    <td className="py-3 pr-4 text-ink">
                      {i.name}
                      {i.stockQty <= i.lowStockAt && <Chip tone="warning" className="ml-2">low</Chip>}
                    </td>
                    <td className="py-3 pr-4 mono-label text-muted">{i.sku}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{money(i.pricePaise)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-ink">
                      {i.stockQty} {i.unit}
                    </td>
                    <td className="py-3 pr-4 text-right text-body-muted">{i.lowStockAt}</td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`Decrease ${i.name}`}
                          onClick={() => adjustStock(i.id, -1)}
                          className="size-8 cursor-pointer rounded-pill border border-hairline hover:border-error hover:text-error"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          aria-label={`Increase ${i.name}`}
                          onClick={() => adjustStock(i.id, 1)}
                          className="size-8 cursor-pointer rounded-pill border border-hairline hover:border-deep-green hover:text-deep-green"
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* dip dialog */}
      <Dialog
        open={Boolean(dipFor)}
        onClose={() => setDipFor(null)}
        title="Record a dip"
        description="Manual tank gauge reading — re-anchors the book stock."
        footer={
          <>
            <Button variant="outline" onClick={() => setDipFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitDip} disabled={busy || !dipForm.level}>
              {busy ? "Saving…" : "Save dip"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tank" htmlFor="tank-dip">
            <Select id="tank-dip" value={dipForm.tankId} onChange={(e) => setDipForm((f) => ({ ...f, tankId: e.target.value }))}>
              {data.tankStats.map((t) => (
                <option key={t.tankId} value={t.tankId}>
                  {t.stationName} · {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level (litres)" htmlFor="level">
            <Input id="level" inputMode="decimal" autoFocus placeholder="0" value={dipForm.level} onChange={(e) => setDipForm((f) => ({ ...f, level: e.target.value }))} />
          </Field>
        </div>
        {(() => {
          const t = data.tankStats.find((x) => x.tankId === dipForm.tankId);
          const l = parseFloat(dipForm.level || "0") || 0;
          if (!t) return null;
          return (
            <p className="mono-label mt-4 text-muted">
              Book currently {litres(t.levelMl, { precise: true })} · you are entering {litres(l * 1000, { precise: true })} ·{" "}
              {(() => {
                const delta = t.levelMl ? ((l * 1000 - t.levelMl) / t.levelMl) * 100 : 0;
                return `Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`;
              })()}
            </p>
          );
        })()}
      </Dialog>

      {/* delivery dialog */}
      <Dialog
        open={Boolean(delivFor)}
        onClose={() => setDelivFor(null)}
        title="Record a delivery"
        description="Tanker receipt — adds volume to the book."
        footer={
          <>
            <Button variant="outline" onClick={() => setDelivFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitDelivery} disabled={busy || !delivForm.volume}>
              {busy ? "Saving…" : "Save delivery"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tank" htmlFor="tank-del">
            <Select id="tank-del" value={delivForm.tankId} onChange={(e) => setDelivForm((f) => ({ ...f, tankId: e.target.value }))}>
              {data.tankStats.map((t) => (
                <option key={t.tankId} value={t.tankId}>
                  {t.stationName} · {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Invoice no" htmlFor="invoice">
            <Input id="invoice" placeholder="HP-2409…" value={delivForm.invoice} onChange={(e) => setDelivForm((f) => ({ ...f, invoice: e.target.value }))} />
          </Field>
          <Field label="Supplier" htmlFor="supplier">
            <Input id="supplier" value={delivForm.supplier} onChange={(e) => setDelivForm((f) => ({ ...f, supplier: e.target.value }))} />
          </Field>
          <Field label="Volume (litres)" htmlFor="volume">
            <Input id="volume" inputMode="decimal" placeholder="9000" value={delivForm.volume} onChange={(e) => setDelivForm((f) => ({ ...f, volume: e.target.value }))} />
          </Field>
          <Field label="Rate (₹ / litre)" htmlFor="rate" hint="Sets the invoice amount">
            <Input id="rate" inputMode="decimal" placeholder="94.10" value={delivForm.rate} onChange={(e) => setDelivForm((f) => ({ ...f, rate: e.target.value }))} />
          </Field>
        </div>
        {delivForm.volume && delivForm.rate && (
          <p className="mono-label mt-4 text-muted">
            Invoice amount {money(Math.round((parseFloat(delivForm.volume) * parseFloat(delivForm.rate)) * 100))}
          </p>
        )}
      </Dialog>
    </div>
  );
}
