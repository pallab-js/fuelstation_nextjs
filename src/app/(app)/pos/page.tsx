"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Delete, Printer, Receipt as ReceiptIcon, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { PillGroup } from "@/components/ui/pill-group";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/dexie";
import type { PaymentMethod, Sale } from "@/lib/db/types";
import { balanceOf } from "@/lib/domain/aging";
import { dateTime, litres, money } from "@/lib/domain/format";
import { queryPos, type PosContext } from "@/lib/repo/queries";
import { DomainError } from "@/lib/repo/common";
import { postFuelSale, postRetailSale } from "@/lib/repo/ops";
import { useLive } from "@/lib/hooks/use-live";
import { useSession } from "@/lib/session/session-store";

type Tab = "fuel" | "retail";
type Mode = "amount" | "litres";

const PAYMENTS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
];

function PosInner() {
  const params = useSearchParams();
  const router = useRouter();
  const scope = useSession((s) => s.scope);
  const homeStationId = useSession((s) => s.homeStationId);
  const profileId = useSession((s) => s.profileId);
  const profileName = useSession((s) => s.profileName);
  const role = useSession((s) => s.role);

  const stations = useLive(() => db.stations.toArray(), [], null);
  const openShifts = useLive(() => db.shifts.where("status").equals("open").toArray(), [profileId], null);
  const paramStation = params.get("station");

  const stationId =
    paramStation ??
    (scope !== "all" ? scope : homeStationId) ??
    openShifts?.[0]?.stationId ??
    stations?.[0]?.id ??
    "";

  const ctx = useLive<PosContext | null>(
    () => (stationId ? queryPos(stationId) : null),
    [stationId, profileId],
    null,
  );

  const [tab, setTab] = useState<Tab>("fuel");
  const [mode, setMode] = useState<Mode>("amount");
  const [raw, setRaw] = useState("");
  const [productCode, setProductCode] = useState("PETROL");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState("");
  const [nozzleId, setNozzleId] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [skuQuery, setSkuQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);

  const product = ctx?.products.find((p) => p.code === productCode);
  const price = product?.unitPricePaise ?? 0;
  const numeric = parseFloat(raw || "0") || 0;
  const entryMl =
    mode === "litres"
      ? Math.round(numeric * 1000)
      : price > 0
        ? Math.round((numeric * 100_000) / price)
        : 0;
  const entryPaise = mode === "amount" ? Math.round(numeric * 100) : Math.round((entryMl * price) / 1000);

  const customer = ctx?.customers.find((c) => c.id === customerId);
  const customerBalance = customerId ? balanceOf((ctx?.txns ?? []).filter((t) => t.customerId === customerId)) : 0;
  const account = ctx?.accounts.find((a) => a.customerId === customerId);
  const willBreach = Boolean(
    account && payment === "credit" && customerBalance + entryPaise > account.creditLimitPaise,
  );

  const cartLines = useMemo(
    () =>
      (ctx?.items ?? [])
        .filter((i) => cart[i.id])
        .map((i) => ({ item: i, qty: cart[i.id], total: i.pricePaise * cart[i.id] })),
    [cart, ctx?.items],
  );
  const cartTotal = cartLines.reduce((a, l) => a + l.total, 0);
  const cartCount = cartLines.reduce((a, l) => a + l.qty, 0);

  const filteredItems = (ctx?.items ?? []).filter((i) =>
    `${i.sku} ${i.name} ${i.category}`.toLowerCase().includes(skuQuery.toLowerCase()),
  );
  const matchingNozzles = (ctx?.nozzles ?? []).filter((n) => n.productCode === productCode);

  const push = (k: string) => {
    setRaw((r) => {
      if (k === "back") return r.slice(0, -1);
      if (k === "." && r.includes(".")) return r;
      if (r === "0" && k !== ".") return k;
      const next = r + k;
      return next.length > 9 ? r : next;
    });
  };

  const reset = () => {
    setRaw("");
    setCart({});
    setPayment("cash");
    setCustomerId("");
    setNozzleId("");
  };

  const submitFuel = async () => {
    if (!ctx) return;
    setBusy(true);
    try {
      const sale = await postFuelSale({
        stationId,
        staffId: profileId!,
        role,
        productCode,
        payment,
        customerId: payment === "credit" ? customerId : undefined,
        nozzleId: nozzleId || undefined,
        litresMl: entryMl,
        amountPaise: entryPaise,
      });
      toast.success(`Sale posted — ${litres(entryMl, { precise: true })} for ${money(entryPaise)}`);
      setReceipt(sale);
      reset();
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not post the sale.");
    } finally {
      setBusy(false);
    }
  };

  const submitRetail = async () => {
    if (!ctx) return;
    setBusy(true);
    try {
      const sale = await postRetailSale({
        stationId,
        staffId: profileId!,
        role,
        payment,
        customerId: payment === "credit" ? customerId : undefined,
        lines: cartLines.map((l) => ({ itemId: l.item.id, qty: l.qty })),
      });
      toast.success(`Retail sale posted — ${money(sale.amountPaise)}`);
      setReceipt(sale);
      reset();
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not post the sale.");
    } finally {
      setBusy(false);
    }
  };

  if (!stations) return <Skeleton className="h-96" />;
  if (!ctx) return <Skeleton className="h-96" />;

  const noShift = !ctx.openShift;
  const saleDisabled = busy || noShift || (tab === "fuel" ? !entryPaise : !cartTotal);

  return (
    <div>
      <PageHeader
        crumbs="Point of sale"
        title="Record a sale"
        sub={
          <span className="flex flex-wrap items-center gap-3">
            <span>{ctx.station?.name ?? "Pick a station"}</span>
            {ctx.openShift ? (
              <Chip tone="ok">{ctx.openShift.name} shift open</Chip>
            ) : (
              <Chip tone="critical">No open shift</Chip>
            )}
          </span>
        }
        actions={
          stations.length > 1 ? (
            <Select
              aria-label="Station"
              value={stationId}
              onChange={(e) => router.push(`/pos?station=${e.target.value}`)}
              className="w-56"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {noShift && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-coral-soft bg-[#fff4f0] px-5 py-4">
          <p className="text-[14px] text-[#c14a2a]">
            POS refuses sales until this station has an open shift.
          </p>
          <Link href="/shifts">
            <Button size="sm" variant="outline">
              Open a shift
            </Button>
          </Link>
        </div>
      )}

      <div className="mb-5">
        <PillGroup
          ariaLabel="Sale type"
          options={[
            { value: "fuel", label: "Fuel" },
            { value: "retail", label: "Shop / retail" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* entry pane */}
        <div className="lg:col-span-3">
          {tab === "fuel" ? (
            <div className="rounded-md border border-card-border bg-white p-5">
              <p className="mono-label mb-3 text-muted">Product</p>
              <div className="grid grid-cols-3 gap-3">
                {ctx.products.map((p) => {
                  const active = p.code === productCode;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => setProductCode(p.code)}
                      className={`cursor-pointer rounded-md border px-3 py-4 text-left transition-colors ${
                        active ? "border-primary bg-primary text-on-primary" : "border-hairline bg-white hover:border-primary/50"
                      }`}
                    >
                      <span className="block text-[15px] font-medium">{p.shortName}</span>
                      <span className={`mt-1 block font-mono text-[17px] tabular-nums ${active ? "text-white/80" : "text-ink"}`}>
                        {money(p.unitPricePaise, { exact: true })}
                      </span>
                      <span className={`mono-label block ${active ? "text-white/50" : "text-muted"}`}>per litre</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <p className="mono-label text-muted">Entry</p>
                <PillGroup
                  ariaLabel="Entry mode"
                  options={[
                    { value: "amount", label: "₹" },
                    { value: "litres", label: "L" },
                  ]}
                  value={mode}
                  onChange={(v) => {
                    setMode(v as Mode);
                    setRaw("");
                  }}
                />
              </div>

              <div className="mt-3 rounded-md border border-hairline bg-soft-stone px-5 py-6 text-right">
                <p className="font-mono text-[44px] leading-none tabular-nums text-primary">
                  {mode === "amount" ? "₹" : ""}
                  {raw || "0"}
                  {mode === "litres" ? " L" : ""}
                </p>
                <p className="mono-label mt-3 text-muted">
                  {mode === "amount"
                    ? `${litres(entryMl, { precise: true })}`
                    : `${money(entryPaise, { exact: true })}`}
                  {" · "}
                  {product?.name}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(mode === "amount" ? ["100", "500", "1000"] : ["5", "10", "20"]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setRaw(q)}
                    className="cursor-pointer rounded-pill border border-hairline bg-white py-2.5 text-[14px] text-ink transition-colors hover:border-primary"
                  >
                    {mode === "amount" ? `₹${q}` : `${q} L`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => push("back")}
                  aria-label="Backspace"
                  className="cursor-pointer rounded-pill border border-hairline bg-white py-2.5 text-ink transition-colors hover:border-error hover:text-error"
                >
                  <Delete className="mx-auto size-4" aria-hidden />
                </button>
                {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => push(k)}
                    className={`cursor-pointer rounded-md border border-hairline bg-white py-3 font-mono text-[18px] text-ink transition-colors hover:border-primary ${k === "." || k === "0" ? "col-span-1" : ""}`}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Nozzle (optional)" htmlFor="nozzle">
                  <Select id="nozzle" value={nozzleId} onChange={(e) => setNozzleId(e.target.value)}>
                    <option value="">Auto — no pump totalizer</option>
                    {matchingNozzles.map((n) => (
                      <option key={n.id} value={n.id}>
                        Nozzle {n.nozzleNo} ({(n.totalizerMl / 1000).toFixed(0)} L)
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Payment" htmlFor="payment">
                  <PillGroup
                    ariaLabel="Payment method"
                    options={PAYMENTS}
                    value={payment}
                    onChange={(v) => setPayment(v as PaymentMethod)}
                  />
                </Field>
              </div>

              {payment === "credit" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Customer" htmlFor="customer">
                    <Select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">Select customer…</option>
                      {ctx.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="self-end rounded-md border border-hairline px-4 py-2.5">
                    <p className="mono-label text-muted">Outstanding / limit</p>
                    <p className="font-mono text-[15px] tabular-nums text-ink">
                      {money(customerBalance)} / {money(account?.creditLimitPaise ?? 0)}
                    </p>
                    {willBreach && (
                      <p className="mt-1 text-micro text-error">
                        {role === "attendant" ? "Over limit — manager must approve" : "Over limit (you can override)"}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-card-border bg-white p-5">
              <Field label="Find item" htmlFor="sku">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <Input
                    id="sku"
                    value={skuQuery}
                    onChange={(e) => setSkuQuery(e.target.value)}
                    placeholder="SKU, name or category…"
                    className="pl-9"
                  />
                </div>
              </Field>

              {filteredItems.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No items match" description="Try a different search." />
                </div>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {filteredItems.map((i) => {
                    const qty = cart[i.id] ?? 0;
                    return (
                      <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] text-ink">{i.name}</p>
                          <p className="mono-label text-muted">
                            {i.sku} · {money(i.pricePaise)} · stock {i.stockQty}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Remove one ${i.name}`}
                            onClick={() => setCart((c) => ({ ...c, [i.id]: Math.max(0, (c[i.id] ?? 0) - 1) }))}
                            className="size-8 cursor-pointer rounded-pill border border-hairline hover:border-primary"
                          >
                            −
                          </button>
                          <span className="w-7 text-center font-mono text-[15px] tabular-nums">{qty}</span>
                          <button
                            type="button"
                            aria-label={`Add one ${i.name}`}
                            disabled={qty >= i.stockQty}
                            onClick={() => setCart((c) => ({ ...c, [i.id]: (c[i.id] ?? 0) + 1 }))}
                            className="size-8 cursor-pointer rounded-pill border border-hairline hover:border-primary disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Payment" htmlFor="payment-r">
                  <PillGroup
                    ariaLabel="Payment method"
                    options={PAYMENTS}
                    value={payment}
                    onChange={(v) => setPayment(v as PaymentMethod)}
                  />
                </Field>
                {payment === "credit" && (
                  <Field label="Customer" htmlFor="customer-r">
                    <Select id="customer-r" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">Select customer…</option>
                      {ctx.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            </div>
          )}
        </div>

        {/* receipt pane */}
        <aside className="lg:col-span-2">
          <div className="sticky top-24 rounded-md border border-card-border bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="mono-label uppercase text-muted">Receipt preview</h2>
              <ReceiptIcon className="size-4 text-muted" aria-hidden />
            </div>

            <p className="text-[14px] text-body-muted">
              {ctx.station?.name ?? "—"} · {profileName ?? "Attendant"}
            </p>
            <p className="mono-label mb-4 text-muted">
              {ctx.openShift ? `${ctx.openShift.name} shift` : "no shift"} · {payment.toUpperCase()}
            </p>

            {tab === "fuel" ? (
              <div className="flex items-start justify-between border-t border-card-border py-3 text-[15px]">
                <div>
                  <p className="text-ink">{product?.name}</p>
                  <p className="mono-label text-muted">
                    {litres(entryMl, { precise: true })} × {money(price, { exact: true })}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-ink">{money(entryPaise, { exact: true })}</span>
              </div>
            ) : cartLines.length === 0 ? (
              <p className="border-t border-card-border py-6 text-center text-[14px] text-body-muted">
                Cart is empty — add items from the shop list.
              </p>
            ) : (
              <ul className="border-t border-card-border">
                {cartLines.map((l) => (
                  <li key={l.item.id} className="flex items-start justify-between gap-3 py-2.5 text-[14px]">
                    <div className="min-w-0">
                      <p className="truncate text-ink">{l.item.name}</p>
                      <p className="mono-label text-muted">
                        {l.qty} × {money(l.item.pricePaise)}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-ink">{money(l.total)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-card-border pt-4">
              <span className="mono-label uppercase text-muted">Total</span>
              <span className="display-tight text-[30px] tabular-nums text-primary">
                {money(tab === "fuel" ? entryPaise : cartTotal)}
              </span>
            </div>

            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={saleDisabled}
              onClick={() => (tab === "fuel" ? submitFuel() : submitRetail())}
            >
              {busy ? "Posting…" : tab === "fuel" ? "Complete fuel sale" : `Complete sale · ${cartCount} items`}
            </Button>
            <p className="mono-label mt-3 text-center text-muted">Stores locally · works offline</p>
          </div>
        </aside>
      </div>

      {/* receipt dialog */}
      <Dialog
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title="Sale complete"
        description="Saved to this device — it will sync when you're back online."
        footer={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print
            </Button>
            <Button onClick={() => setReceipt(null)}>Done</Button>
          </>
        }
      >
        {receipt && (
          <div className="rounded-md border border-hairline p-5">
            <div className="flex items-center justify-between">
              <span className="mono-label text-muted">Receipt</span>
              <span className="font-mono text-[15px] text-ink">{receipt.receiptNo}</span>
            </div>
            <p className="mt-1 text-[14px] text-body-muted">{ctx.station?.name}</p>
            <p className="mono-label text-muted">{dateTime(receipt.ts)}</p>

            <div className="mt-4 border-t border-card-border pt-4">
              {receipt.kind === "fuel" ? (
                <div className="flex justify-between text-[15px]">
                  <span>{receipt.productCode} · {litres(receipt.quantityMl ?? 0, { precise: true })}</span>
                  <span className="font-mono tabular-nums">{money(receipt.amountPaise, { exact: true })}</span>
                </div>
              ) : (
                <ul>
                  {receipt.lines?.map((l) => (
                    <li key={l.itemId} className="flex justify-between py-1 text-[14px]">
                      <span>{l.qty} × {l.name}</span>
                      <span className="font-mono tabular-nums">{money(l.qty * l.pricePaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-card-border pt-4">
              <span className="mono-label uppercase text-muted">Paid · {receipt.payment}</span>
              <span className="display-tight text-[28px] tabular-nums text-primary">
                {money(receipt.amountPaise)}
              </span>
            </div>
            {receipt.customerId && (
              <p className="mono-label mt-2 text-muted">charged to {customer?.name ?? receipt.customerId}</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function PosPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <PosInner />
    </Suspense>
  );
}
