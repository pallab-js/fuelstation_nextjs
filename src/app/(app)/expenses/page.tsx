"use client";

import { useMemo, useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip, type Tone } from "@/components/ui/chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { PillGroup } from "@/components/ui/pill-group";
import { StatCard } from "@/components/ui/stat-card";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/dexie";
import type { BankDeposit, Expense, ExpenseCategory } from "@/lib/db/types";
import { date, dateTime, money, moneyShort } from "@/lib/domain/format";
import { DomainError } from "@/lib/repo/common";
import { addDeposit, addExpense } from "@/lib/repo/ops";
import { RequireRole } from "@/components/auth/require-role";
import { useLive } from "@/lib/hooks/use-live";
import { scopeMatches, useSession } from "@/lib/session/session-store";

const CATEGORIES: ExpenseCategory[] = ["petty", "maintenance", "utilities", "salary", "supplies", "other"];
const CAT_TONE: Record<ExpenseCategory, Tone> = {
  petty: "neutral",
  maintenance: "info",
  utilities: "info",
  salary: "ok",
  supplies: "warning",
  other: "neutral",
};

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ExpensesPage() {
  const scope = useSession((s) => s.scope);
  const profileId = useSession((s) => s.profileId);
  const homeStationId = useSession((s) => s.homeStationId);

  const expenses = useLive<Expense[] | null>(() => db.expenses.orderBy("ts").reverse().toArray(), [profileId], null);
  const deposits = useLive<BankDeposit[] | null>(() => db.deposits.orderBy("ts").reverse().toArray(), [profileId], null);
  const stations = useLive(() => db.stations.toArray(), [], null);

  const [month, setMonth] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [vForm, setVForm] = useState({
    stationId: "",
    category: "petty" as ExpenseCategory,
    amount: "",
    paidBy: "cash" as "cash" | "bank",
    note: "",
  });
  const [dForm, setDForm] = useState({ stationId: "", amount: "", refNo: "" });

  const scoped = useMemo(
    () => (expenses ?? []).filter((e) => scopeMatches(e.stationId, scope)),
    [expenses, scope],
  );
  const scopedDeposits = useMemo(
    () => (deposits ?? []).filter((d) => scopeMatches(d.stationId, scope)),
    [deposits, scope],
  );

  const months = useMemo(() => {
    const set = new Set(scoped.map((e) => monthKey(e.ts)));
    return [...set].sort().reverse();
  }, [scoped]);

  const filtered = scoped.filter(
    (e) => (month === "all" || monthKey(e.ts) === month) && (cat === "all" || e.category === cat),
  );
  const filteredDeposits = scopedDeposits.filter((d) => month === "all" || monthKey(d.ts) === month);

  const monthTotal = filtered.reduce((a, e) => a + e.amountPaise, 0);
  const depositTotal = filteredDeposits.reduce((a, d) => a + d.amountPaise, 0);
  const cashPaid = filtered.filter((e) => e.paidBy === "cash").reduce((a, e) => a + e.amountPaise, 0);

  const openVoucher = () => {
    setVForm({
      stationId: scope !== "all" ? scope : (homeStationId ?? stations?.[0]?.id ?? ""),
      category: "petty",
      amount: "",
      paidBy: "cash",
      note: "",
    });
    setVoucherOpen(true);
  };
  const openDeposit = () => {
    setDForm({
      stationId: scope !== "all" ? scope : (homeStationId ?? stations?.[0]?.id ?? ""),
      amount: "",
      refNo: "",
    });
    setDepositOpen(true);
  };

  const submitVoucher = async () => {
    setBusy(true);
    try {
      const paise = Math.round((parseFloat(vForm.amount || "0") || 0) * 100);
      const row = await addExpense({
        stationId: vForm.stationId,
        category: vForm.category,
        amountPaise: paise,
        paidBy: vForm.paidBy,
        note: vForm.note,
        staffId: profileId!,
      });
      toast.success(`Voucher ${row.voucherNo} created`, `${money(paise)} · ${vForm.category}`);
      setVoucherOpen(false);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not save the voucher.");
    } finally {
      setBusy(false);
    }
  };

  const submitDeposit = async () => {
    setBusy(true);
    try {
      const paise = Math.round((parseFloat(dForm.amount || "0") || 0) * 100);
      const row = await addDeposit({
        stationId: dForm.stationId,
        amountPaise: paise,
        refNo: dForm.refNo,
        staffId: profileId!,
      });
      toast.success("Bank deposit recorded", `${row.refNo} — ${money(paise)}`);
      setDepositOpen(false);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not record the deposit.");
    } finally {
      setBusy(false);
    }
  };

  const expenseColumns: Column<Expense>[] = [
    { key: "ts", header: "Date", sortValue: (r) => r.ts, render: (r) => <span className="text-[14px] text-ink">{date(r.ts)}</span> },
    {
      key: "voucher",
      header: "Voucher",
      sortValue: (r) => r.voucherNo,
      render: (r) => (
        <div>
          <p className="mono-label text-action-blue">{r.voucherNo}</p>
          <p className="text-[13px] text-body-muted">{r.note || "—"}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", sortValue: (r) => r.category, render: (r) => <Chip tone={CAT_TONE[r.category]}>{r.category}</Chip> },
    { key: "paidBy", header: "Paid by", sortValue: (r) => r.paidBy, render: (r) => <span className="text-[14px] text-body-muted">{r.paidBy}</span> },
    { key: "amount", header: "Amount", align: "right", sortValue: (r) => r.amountPaise, render: (r) => <span className="font-mono tabular-nums">{money(r.amountPaise, { exact: true })}</span> },
  ];

  const depositColumns: Column<BankDeposit>[] = [
    { key: "ts", header: "Date", sortValue: (r) => r.ts, render: (r) => <span className="text-[14px] text-ink">{date(r.ts)}</span> },
    { key: "ref", header: "Reference", sortValue: (r) => r.refNo, render: (r) => <span className="mono-label text-action-blue">{r.refNo}</span> },
    { key: "amount", header: "Amount", align: "right", sortValue: (r) => r.amountPaise, render: (r) => <span className="font-mono tabular-nums text-deep-green">{money(r.amountPaise, { exact: true })}</span> },
  ];

  if (!expenses || !deposits) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader
        crumbs="Finance / Expenses"
        title="Expenses & deposits"
        sub="Vouchers reduce the expected cash drawer when paid in cash."
        actions={
          <>
            <Button variant="outline" onClick={openDeposit}>
              Bank deposit
            </Button>
            <Button onClick={openVoucher}>
              <Plus className="size-4" aria-hidden /> New voucher
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44">
          <option value="all">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <PillGroup
          ariaLabel="Category"
          options={[{ value: "all", label: "All" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          value={cat}
          onChange={setCat}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Expenses" value={moneyShort(monthTotal)} sub={`${filtered.length} vouchers`} />
        <StatCard label="Paid in cash" value={moneyShort(cashPaid)} sub="reduces expected drawer" />
        <StatCard label="Bank deposits" value={moneyShort(depositTotal)} sub={`${filteredDeposits.length} deposits`} tone="positive" />
        <StatCard label="Net cash out" value={moneyShort(cashPaid - depositTotal)} tone={cashPaid - depositTotal > 0 ? "negative" : "positive"} sub="cash expenses − deposits" />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-[20px] text-primary">Vouchers</h2>
        {filtered.length === 0 ? (
          <EmptyState icon={<Receipt className="size-10" strokeWidth={1.25} aria-hidden />} title="No vouchers" description="Create the first voucher to track petty cash." action={<Button onClick={openVoucher}>New voucher</Button>} />
        ) : (
          <DataTable columns={expenseColumns} rows={filtered} rowKey={(r) => r.id} initialSort={{ key: "ts", dir: "desc" }} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[20px] text-primary">Bank deposits</h2>
        {filteredDeposits.length === 0 ? (
          <EmptyState title="No deposits" description="Deposits made from the cash drawer appear here." action={<Button variant="outline" onClick={openDeposit}>Record deposit</Button>} />
        ) : (
          <DataTable columns={depositColumns} rows={filteredDeposits} rowKey={(r) => r.id} initialSort={{ key: "ts", dir: "desc" }} />
        )}
      </section>

      {/* voucher dialog */}
      <Dialog
        open={voucherOpen}
        onClose={() => setVoucherOpen(false)}
        title="New expense voucher"
        description="Cash vouchers are deducted when closing a shift."
        footer={
          <>
            <Button variant="outline" onClick={() => setVoucherOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitVoucher} disabled={busy || !vForm.amount || !vForm.note}>
              {busy ? "Saving…" : "Create voucher"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Station" htmlFor="v-station">
            <Select id="v-station" value={vForm.stationId} disabled={scope !== "all"} onChange={(e) => setVForm((f) => ({ ...f, stationId: e.target.value }))}>
              {(stations ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="v-cat">
            <Select id="v-cat" value={vForm.category} onChange={(e) => setVForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)" htmlFor="v-amount">
            <Input id="v-amount" inputMode="decimal" autoFocus value={vForm.amount} onChange={(e) => setVForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </Field>
          <Field label="Paid by" htmlFor="v-paid">
            <Select id="v-paid" value={vForm.paidBy} onChange={(e) => setVForm((f) => ({ ...f, paidBy: e.target.value as "cash" | "bank" }))}>
              <option value="cash">Cash (from drawer)</option>
              <option value="bank">Bank</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note" htmlFor="v-note" hint="What was it for?">
              <Textarea id="v-note" value={vForm.note} onChange={(e) => setVForm((f) => ({ ...f, note: e.target.value }))} placeholder="Nozzle repair, cleaning supplies…" />
            </Field>
          </div>
        </div>
      </Dialog>

      {/* deposit dialog */}
      <Dialog
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        title="Record bank deposit"
        description="Transfers cash out of the drawer into the bank."
        footer={
          <>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDeposit} disabled={busy || !dForm.amount}>
              {busy ? "Saving…" : "Record deposit"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Station" htmlFor="d-station">
            <Select id="d-station" value={dForm.stationId} disabled={scope !== "all"} onChange={(e) => setDForm((f) => ({ ...f, stationId: e.target.value }))}>
              {(stations ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)" htmlFor="d-amount">
            <Input id="d-amount" inputMode="decimal" autoFocus value={dForm.amount} onChange={(e) => setDForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </Field>
          <Field label="Reference / UTR" htmlFor="d-ref">
            <Input id="d-ref" value={dForm.refNo} onChange={(e) => setDForm((f) => ({ ...f, refNo: e.target.value }))} placeholder="NEFT-…" />
          </Field>
        </div>
        <p className="mono-label mt-4 text-muted">Last deposit {filteredDeposits[0] ? dateTime(filteredDeposits[0].ts) : "never"}</p>
      </Dialog>
    </div>
  );
}

export default function ExpensesPageGuarded() {
  return (
    <RequireRole
      roles={["owner", "manager"]}
      description="Expenses and bank deposits are limited to owners and managers."
    >
      <ExpensesPage />
    </RequireRole>
  );
}
