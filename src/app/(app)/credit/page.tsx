"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip, type Tone } from "@/components/ui/chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { toast } from "@/components/ui/toast";
import type { CreditTxn } from "@/lib/db/types";
import { date, money, moneyShort, relative } from "@/lib/domain/format";
import { DomainError } from "@/lib/repo/common";
import { adjustCredit, recordPayment, updateCreditLimit } from "@/lib/repo/ops";
import { queryCredit, queryCustomerLedger, type CreditRow } from "@/lib/repo/queries";
import { useLive } from "@/lib/hooks/use-live";
import { useSession } from "@/lib/session/session-store";

const BUCKETS: { key: "current" | "d30" | "d60" | "d90" | "d90plus"; label: string; color: string }[] = [
  { key: "current", label: "Current", color: "bg-deep-green" },
  { key: "d30", label: "1–30 d", color: "bg-action-blue" },
  { key: "d60", label: "31–60 d", color: "bg-form-focus" },
  { key: "d90", label: "61–90 d", color: "bg-coral" },
  { key: "d90plus", label: "90+ d", color: "bg-error" },
];

export default function CreditPage() {
  const profileId = useSession((s) => s.profileId);
  const role = useSession((s) => s.role);
  const rows = useLive<CreditRow[] | null>(() => queryCredit(), [profileId], null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<CreditTxn[] | null>(null);
  const [payment, setPayment] = useState({ amount: "", method: "bank" as "bank" | "cash" });
  const [limitForm, setLimitForm] = useState({ limit: "", dueDays: "" });
  const [adjust, setAdjust] = useState({ amount: "", note: "" });
  const [busy, setBusy] = useState(false);

  const open = rows?.find((r) => r.customer.id === openId) ?? null;

  useEffect(() => {
    if (openId) queryCustomerLedger(openId).then(setLedger);
  }, [openId]);

  const openLedger = (row: CreditRow) => {
    setOpenId(row.customer.id);
    setLedger(null);
    setPayment({ amount: "", method: "bank" });
    setLimitForm({ limit: String((row.limitPaise / 100).toFixed(0)), dueDays: String(row.account?.dueDays ?? 15) });
    setAdjust({ amount: "", note: "" });
  };

  if (!rows) return <Skeleton className="h-96" />;

  const outstanding = rows.reduce((a, r) => a + r.balancePaise, 0);
  const overdue = rows.reduce((a, r) => a + r.aging.overdue, 0);
  const breaches = rows.filter((r) => r.limitPaise > 0 && r.balancePaise > r.limitPaise);
  const agg = rows.reduce(
    (a, r) => ({
      current: a.current + r.aging.current,
      d30: a.d30 + r.aging.d30,
      d60: a.d60 + r.aging.d60,
      d90: a.d90 + r.aging.d90,
      d90plus: a.d90plus + r.aging.d90plus,
      total: a.total + r.aging.total,
      overdue: a.overdue + r.aging.overdue,
    }),
    { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0, overdue: 0 },
  );

  const submitPayment = async () => {
    if (!open) return;
    const rupees = parseFloat(payment.amount || "0") || 0;
    setBusy(true);
    try {
      await recordPayment({
        customerId: open.customer.id,
        amountPaise: Math.round(rupees * 100),
        method: payment.method,
        staffId: profileId!,
      });
      toast.success("Payment recorded", `${open.customer.name} — ${money(Math.round(rupees * 100))}`);
      setPayment({ amount: "", method: "bank" });
      setLedger(await queryCustomerLedger(open.customer.id));
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  };

  const submitLimit = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await updateCreditLimit({
        customerId: open.customer.id,
        creditLimitPaise: Math.round((parseFloat(limitForm.limit || "0") || 0) * 100),
        dueDays: parseInt(limitForm.dueDays || "15", 10),
        staffId: profileId!,
      });
      toast.success("Credit limit updated", open.customer.name);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not update the limit.");
    } finally {
      setBusy(false);
    }
  };

  const submitAdjust = async () => {
    if (!open) return;
    const rupees = parseFloat(adjust.amount || "0") || 0;
    setBusy(true);
    try {
      await adjustCredit({
        customerId: open.customer.id,
        amountPaise: Math.round(rupees * 100),
        staffId: profileId!,
        note: adjust.note,
      });
      toast.success("Ledger adjusted", `${adjust.amount.startsWith("-") ? "" : "+"}₹${Math.abs(rupees)}`);
      setAdjust({ amount: "", note: "" });
      setLedger(await queryCustomerLedger(open.customer.id));
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not adjust the ledger.");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<CreditRow>[] = [
    {
      key: "customer",
      header: "Customer",
      sortValue: (r) => r.customer.name,
      render: (r) => (
        <div>
          <p className="text-[15px] text-ink">{r.customer.name}</p>
          <p className="mono-label text-muted">{r.customer.code} · {r.customer.kind}</p>
        </div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sortValue: (r) => r.balancePaise,
      render: (r) => (
        <div>
          <p className="font-mono tabular-nums text-ink">{money(r.balancePaise)}</p>
          <p className="mono-label text-muted">limit {moneyShort(r.limitPaise)}</p>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Limit use",
      width: "150px",
      sortValue: (r) => (r.limitPaise ? r.balancePaise / r.limitPaise : 0),
      render: (r) => {
        const use = r.limitPaise ? (r.balancePaise / r.limitPaise) * 100 : 0;
        const tone: Tone = use > 100 ? "critical" : use > 85 ? "warning" : "ok";
        return <Chip tone={tone}>{use.toFixed(0)}%</Chip>;
      },
    },
    {
      key: "aging",
      header: "Overdue",
      align: "right",
      sortValue: (r) => r.aging.overdue,
      render: (r) =>
        r.aging.overdue > 0 ? (
          <div>
            <p className="tabular-nums text-error">{moneyShort(r.aging.overdue)}</p>
            {r.oldestDueTs && <p className="mono-label text-muted">{relative(r.oldestDueTs)}</p>}
          </div>
        ) : (
          <span className="text-body-muted">—</span>
        ),
    },
    {
      key: "txns",
      header: "Entries",
      align: "right",
      sortValue: (r) => r.txnCount,
      render: (r) => <span className="tabular-nums text-body-muted">{r.txnCount}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => openLedger(r)}>
          Ledger
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader crumbs="Finance / Credit" title="Credit & accounts" sub="Fleet and credit customers, aging and limits." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding" value={moneyShort(outstanding)} sub={`${rows.length} customers`} />
        <StatCard label="Overdue" value={moneyShort(overdue)} tone={overdue > 0 ? "negative" : "positive"} sub="past due date" />
        <StatCard label="Limit breaches" value={String(breaches.length)} tone={breaches.length ? "negative" : "positive"} sub={breaches.map((b) => b.customer.code).join(", ") || "all within limits"} />
        <StatCard label="Accounts" value={String(rows.filter((r) => r.balancePaise > 0).length)} sub="with a balance" />
      </div>

      {/* aging bar */}
      <section className="mb-6 rounded-md border border-card-border bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[17px] text-primary">Aging</h2>
          <span className="mono-label text-muted">total {money(agg.total)}</span>
        </div>
        {agg.total === 0 ? (
          <p className="text-[14px] text-body-muted">Nothing outstanding.</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-soft-stone" aria-label="Aging distribution">
              {BUCKETS.map((b) => {
                const v = agg[b.key] / agg.total;
                return v > 0 ? <div key={b.key} className={b.color} style={{ width: `${v * 100}%` }} title={`${b.label} ${money(agg[b.key])}`} /> : null;
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {BUCKETS.map((b) => (
                <li key={b.key} className="flex items-center gap-2 text-[13px]">
                  <span className={`size-2.5 rounded-full ${b.color}`} />
                  <span className="text-body-muted">{b.label}</span>
                  <span className="tabular-nums text-ink">{moneyShort(agg[b.key])}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {rows.length === 0 ? (
        <EmptyState icon={<Users className="size-10" strokeWidth={1.25} aria-hidden />} title="No credit customers" />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.customer.id} initialSort={{ key: "balance", dir: "desc" }} />
      )}

      {/* ledger drawer */}
      <Dialog
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        title={open?.customer.name ?? "Ledger"}
        description={open ? `${open.customer.code} · balance ${money(open.balancePaise)} · limit ${money(open.limitPaise)}` : undefined}
        size="lg"
        footer={<Button onClick={() => setOpenId(null)}>Done</Button>}
      >
        {open && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mono-label mb-3 uppercase text-muted">Entries</h3>
              {!ledger ? (
                <Skeleton className="h-40" />
              ) : ledger.length === 0 ? (
                <EmptyState title="No ledger entries" />
              ) : (
                <ul className="max-h-80 divide-y divide-card-border overflow-y-auto pr-1">
                  {[...ledger].reverse().map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-3 py-2.5 text-[14px]">
                      <div className="min-w-0">
                        <p className="text-ink">
                          <span className="mono-label mr-2 text-muted">{date(t.ts)}</span>
                          {t.type === "payment" ? "Payment" : t.type === "adjustment" ? "Adjustment" : "Fuel charge"}
                          {t.dueTs && t.type === "charge" && <span className="mono-label ml-2 text-muted">due {date(t.dueTs)}</span>}
                        </p>
                        {t.note && <p className="text-[13px] text-body-muted">{t.note}</p>}
                      </div>
                      <span className={`shrink-0 font-mono tabular-nums ${t.type === "payment" ? "text-deep-green" : "text-ink"}`}>
                        {t.type === "payment" ? "−" : "+"}
                        {money(t.amountPaise)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-6">
              <section className="rounded-md border border-hairline p-4">
                <h3 className="mono-label mb-3 uppercase text-muted">Record payment</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (₹)" htmlFor="pay-amt">
                    <Input id="pay-amt" inputMode="decimal" value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} placeholder="0" />
                  </Field>
                  <Field label="Method" htmlFor="pay-method">
                    <Select id="pay-method" value={payment.method} onChange={(e) => setPayment((p) => ({ ...p, method: e.target.value as "bank" | "cash" }))}>
                      <option value="bank">Bank / UPI</option>
                      <option value="cash">Cash</option>
                    </Select>
                  </Field>
                </div>
                <Button className="mt-3 w-full" size="sm" onClick={submitPayment} disabled={busy || !payment.amount}>
                  Receive payment
                </Button>
              </section>

              <section className="rounded-md border border-hairline p-4">
                <h3 className="mono-label mb-3 uppercase text-muted">Credit limit</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Limit (₹)" htmlFor="limit">
                    <Input id="limit" inputMode="decimal" value={limitForm.limit} onChange={(e) => setLimitForm((f) => ({ ...f, limit: e.target.value }))} />
                  </Field>
                  <Field label="Due days" htmlFor="due">
                    <Input id="due" inputMode="numeric" value={limitForm.dueDays} onChange={(e) => setLimitForm((f) => ({ ...f, dueDays: e.target.value }))} />
                  </Field>
                </div>
                {(role === "owner" || role === "manager") && (
                  <Button className="mt-3 w-full" size="sm" variant="outline" onClick={submitLimit} disabled={busy}>
                    Update limit
                  </Button>
                )}
              </section>

              <section className="rounded-md border border-hairline p-4">
                <h3 className="mono-label mb-3 uppercase text-muted">Ledger adjustment</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (₹)" htmlFor="adj" hint="Negative credits the customer">
                    <Input id="adj" inputMode="decimal" value={adjust.amount} onChange={(e) => setAdjust((a) => ({ ...a, amount: e.target.value }))} placeholder="-500" />
                  </Field>
                  <Field label="Note (required)" htmlFor="adj-note">
                    <Input id="adj-note" value={adjust.note} onChange={(e) => setAdjust((a) => ({ ...a, note: e.target.value }))} placeholder="Rate dispute, write-off…" />
                  </Field>
                </div>
                <Button className="mt-3 w-full" size="sm" variant="outline" onClick={submitAdjust} disabled={busy || !adjust.amount || !adjust.note}>
                  Post adjustment
                </Button>
              </section>
            </div>
          </div>
        )}
      </Dialog>

      {breaches.length > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-error bg-[#fdf0f0] px-5 py-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
          <div>
            <p className="text-[14px] font-medium text-error">{breaches.length} account(s) over limit</p>
            <p className="text-[13px] text-body-muted">
              {breaches.map((b) => `${b.customer.name} (${money(b.balancePaise)} / ${money(b.limitPaise)})`).join(" · ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
