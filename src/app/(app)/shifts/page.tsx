"use client";

import { useMemo, useState } from "react";
import { Clock, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip, type Tone } from "@/components/ui/chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, Skeleton, Tabs } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/dexie";
import type { ShiftName } from "@/lib/db/types";
import { dateTime, money, moneyShort, relative, signedMoney, time } from "@/lib/domain/format";
import { DomainError } from "@/lib/repo/common";
import { closeShift, openShift } from "@/lib/repo/ops";
import {
  queryShiftSales,
  queryShifts,
  shiftExpectedCash,
  type ShiftRow,
  type ShiftSaleRow,
} from "@/lib/repo/queries";
import { useLive } from "@/lib/hooks/use-live";
import { useSession } from "@/lib/session/session-store";

function suggestedShift(): ShiftName {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return "Morning";
  if (h >= 14 && h < 22) return "Evening";
  return "Night";
}

function varianceTone(v: number, tolerance = 1): Tone {
  if (Math.abs(v) <= tolerance) return "ok";
  return v < 0 ? "short" : "over";
}

export default function ShiftsPage() {
  const scope = useSession((s) => s.scope);
  const profileId = useSession((s) => s.profileId);
  const homeStationId = useSession((s) => s.homeStationId);
  const rows = useLive<ShiftRow[] | null>(() => queryShifts(scope), [scope, profileId], null);
  const stations = useLive(() => db.stations.toArray(), [], null);

  const [tab, setTab] = useState("open");
  const [openOpen, setOpenOpen] = useState(false);
  const [closeRow, setCloseRow] = useState<ShiftRow | null>(null);
  const [ledgerRow, setLedgerRow] = useState<ShiftRow | null>(null);
  const [ledger, setLedger] = useState<ShiftSaleRow[] | null>(null);
  const [expected, setExpected] = useState<number | null>(null);

  const [form, setForm] = useState({ stationId: "", name: suggestedShift(), openingCash: "0" });
  const [closeForm, setCloseForm] = useState({ counted: "", note: "" });
  const [busy, setBusy] = useState(false);

  const openRows = useMemo(() => (rows ?? []).filter((r) => r.shift.status === "open"), [rows]);
  const closedRows = useMemo(() => (rows ?? []).filter((r) => r.shift.status === "closed"), [rows]);
  const visible = tab === "open" ? openRows : closedRows;

  const openDialog = () => {
    setForm({
      stationId: scope !== "all" ? scope : (homeStationId ?? stations?.[0]?.id ?? ""),
      name: suggestedShift(),
      openingCash: "0",
    });
    setOpenOpen(true);
  };

  const openClose = (row: ShiftRow) => {
    setCloseRow(row);
    setCloseForm({ counted: "", note: "" });
    setExpected(null);
    shiftExpectedCash(row.shift).then(setExpected);
  };

  const openLedger = (row: ShiftRow) => {
    setLedgerRow(row);
    setLedger(null);
    queryShiftSales(row.shift.id).then(setLedger);
  };

  const doOpen = async () => {
    setBusy(true);
    try {
      const rupees = parseFloat(form.openingCash || "0") || 0;
      await openShift({
        stationId: form.stationId,
        staffId: profileId!,
        name: form.name,
        openingCashPaise: Math.round(rupees * 100),
      });
      toast.success(`${form.name} shift opened`, stations?.find((s) => s.id === form.stationId)?.name);
      setOpenOpen(false);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not open the shift.");
    } finally {
      setBusy(false);
    }
  };

  const doClose = async () => {
    if (!closeRow) return;
    setBusy(true);
    try {
      const counted = Math.round((parseFloat(closeForm.counted || "0") || 0) * 100);
      const { recon } = await closeShift({
        shiftId: closeRow.shift.id,
        countedPaise: counted,
        staffId: profileId!,
        note: closeForm.note || undefined,
      });
      const v = recon.variancePaise;
      const msg =
        recon.status === "ok"
          ? "Shift closed — drawer matches"
          : `Shift closed — ${recon.status} ${signedMoney(v)}`;
      if (recon.status === "ok") toast.success(msg);
      else toast.warning(msg, recon.note);
      setCloseRow(null);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not close the shift.");
    } finally {
      setBusy(false);
    }
  };

  const countedNum = parseFloat(closeForm.counted || "0") || 0;
  const liveVariance = expected !== null ? Math.round(countedNum * 100) - expected : null;

  const columns: Column<ShiftRow>[] = [
    {
      key: "station",
      header: "Station",
      sortValue: (r) => r.station?.name ?? "",
      render: (r) => (
        <div>
          <p className="text-[15px] text-ink">{r.station?.name ?? r.shift.stationId}</p>
          <p className="mono-label text-muted">{r.station?.code}</p>
        </div>
      ),
    },
    {
      key: "shift",
      header: "Shift",
      sortValue: (r) => r.shift.openTs,
      render: (r) => (
        <div>
          <p className="text-[15px] text-ink">{r.shift.name}</p>
          <p className="mono-label text-muted">{r.staffName}</p>
        </div>
      ),
    },
    {
      key: "time",
      header: "Time",
      sortValue: (r) => r.shift.openTs,
      render: (r) => (
        <div>
          <p className="text-[14px] text-ink">{r.shift.status === "open" ? relative(r.shift.openTs) : dateTime(r.shift.openTs)}</p>
          {r.shift.closeTs && <p className="mono-label text-muted">closed {time(r.shift.closeTs)}</p>}
        </div>
      ),
    },
    {
      key: "sales",
      header: "Sales",
      align: "right",
      sortValue: (r) => r.salesPaise,
      render: (r) => (
        <div>
          <p className="tabular-nums text-ink">{moneyShort(r.salesPaise)}</p>
          <p className="mono-label text-muted">{r.salesCount} txns</p>
        </div>
      ),
    },
    {
      key: "cash",
      header: "Cash / variance",
      align: "right",
      sortValue: (r) => (r.shift.status === "open" ? r.runningCashPaise : r.recon?.variancePaise ?? 0),
      render: (r) =>
        r.shift.status === "open" ? (
          <div>
            <p className="font-mono tabular-nums text-ink">{money(r.runningCashPaise)}</p>
            <p className="mono-label text-muted">opening {moneyShort(r.shift.openingCashPaise)}</p>
          </div>
        ) : (
          <Chip tone={varianceTone(r.recon?.variancePaise ?? 0, 1)}>
            {signedMoney(r.recon?.variancePaise ?? 0)}
          </Chip>
        ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      sortValue: (r) => r.shift.status,
      render: (r) =>
        r.shift.status === "open" ? (
          <Chip tone="ok">Open</Chip>
        ) : (
          <Chip tone={r.recon?.status === "ok" ? "neutral" : r.recon?.status === "short" ? "short" : "over"}>
            {r.recon?.status ?? "closed"}
          </Chip>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => openLedger(r)}>
            Ledger
          </Button>
          {r.shift.status === "open" ? (
            <Button size="sm" onClick={() => openClose(r)}>
              Close
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        crumbs="Operations / Shifts"
        title="Shifts"
        sub="One open shift per station. Closing reconciles the cash drawer."
        actions={
          <Button onClick={openDialog} disabled={!stations?.length}>
            <Plus className="size-4" aria-hidden /> Open shift
          </Button>
        }
      />

      <div className="mb-4">
        <Tabs
          tabs={[
            { value: "open", label: "Open now", count: openRows.length },
            { value: "closed", label: "Recently closed", count: closedRows.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {!rows ? (
        <Skeleton className="h-80" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-10" strokeWidth={1.25} aria-hidden />}
          title={tab === "open" ? "No open shifts" : "No closed shifts yet"}
          description={tab === "open" ? "POS refuses sales until a shift is open at the station." : undefined}
          action={
            tab === "open" ? (
              <Button onClick={openDialog}>Open a shift</Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable columns={columns} rows={visible} rowKey={(r) => r.shift.id} initialSort={{ key: "time", dir: "desc" }} />
      )}

      {/* open dialog */}
      <Dialog
        open={openOpen}
        onClose={() => setOpenOpen(false)}
        title="Open a shift"
        description="Snapshots nozzle totalizers as the opening reading."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpenOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doOpen} disabled={busy || !form.stationId}>
              {busy ? "Opening…" : "Open shift"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Station" htmlFor="station">
            <Select
              id="station"
              value={form.stationId}
              disabled={scope !== "all"}
              onChange={(e) => setForm((f) => ({ ...f, stationId: e.target.value }))}
            >
              {(stations ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shift" htmlFor="name">
            <Select id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value as ShiftName }))}>
              <option>Morning</option>
              <option>Evening</option>
              <option>Night</option>
            </Select>
          </Field>
          <Field label="Opening cash (₹)" htmlFor="cash" hint="Counted float in the drawer">
            <Input
              id="cash"
              inputMode="decimal"
              value={form.openingCash}
              onChange={(e) => setForm((f) => ({ ...f, openingCash: e.target.value }))}
            />
          </Field>
        </div>
      </Dialog>

      {/* close dialog */}
      <Dialog
        open={Boolean(closeRow)}
        onClose={() => setCloseRow(null)}
        title={`Close ${closeRow?.shift.name ?? ""} shift`}
        description={closeRow?.station?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseRow(null)}>
              Cancel
            </Button>
            <Button onClick={doClose} disabled={busy || expected === null}>
              {busy ? "Closing…" : "Confirm & close"}
            </Button>
          </>
        }
      >
        <div className="rounded-md border border-hairline bg-soft-stone p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="mono-label text-muted">Expected in drawer</p>
              <p className="font-mono text-[34px] leading-none tabular-nums text-primary">
                {expected === null ? "…" : money(expected, { exact: true })}
              </p>
            </div>
            <div className="text-right">
              <p className="mono-label text-muted">Opening</p>
              <p className="text-[14px] text-ink">{money(closeRow?.shift.openingCashPaise ?? 0)}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Counted cash (₹)" htmlFor="counted">
            <Input
              id="counted"
              inputMode="decimal"
              autoFocus
              value={closeForm.counted}
              onChange={(e) => setCloseForm((f) => ({ ...f, counted: e.target.value }))}
              placeholder="0"
            />
          </Field>
          <div className="self-end">
            <p className="mono-label mb-1.5 text-muted">Variance</p>
            <Chip tone={liveVariance === null ? "neutral" : varianceTone(liveVariance)}>
              {liveVariance === null ? "—" : signedMoney(liveVariance)}
            </Chip>
          </div>
        </div>

        <div className="mt-4">
          <Field label="Note (optional)" htmlFor="note">
            <Textarea
              id="note"
              value={closeForm.note}
              onChange={(e) => setCloseForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Short/over reason, handover details…"
            />
          </Field>
        </div>
      </Dialog>

      {/* ledger dialog */}
      <Dialog
        open={Boolean(ledgerRow)}
        onClose={() => setLedgerRow(null)}
        title={`${ledgerRow?.shift.name ?? ""} shift ledger`}
        description={`${ledgerRow?.station?.name ?? ""} · ${ledgerRow?.staffName ?? ""}`}
        size="lg"
        footer={<Button onClick={() => setLedgerRow(null)}>Close</Button>}
      >
        {!ledger ? (
          <Skeleton className="h-40" />
        ) : ledger.length === 0 ? (
          <EmptyState title="No sales in this shift" />
        ) : (
          <ul className="divide-y divide-card-border">
            {ledger.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                <div className="min-w-0">
                  <span className="mono-label mr-2 text-muted">{time(s.ts)}</span>
                  <span className="mono-label mr-2 text-action-blue">{s.receiptNo}</span>
                  <span className="text-ink">{s.detail}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Chip tone={s.payment === "cash" ? "ok" : s.payment === "credit" ? "warning" : "info"}>{s.payment}</Chip>
                  <span className="w-24 text-right font-mono tabular-nums">{money(s.amountPaise, { exact: true })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-between border-t border-card-border pt-4">
          <span className="mono-label uppercase text-muted">Shift sales</span>
          <span className="font-mono text-[18px] tabular-nums text-primary">
            {money((ledger ?? []).reduce((a, s) => a + s.amountPaise, 0), { exact: true })}
          </span>
        </div>
      </Dialog>
    </div>
  );
}
