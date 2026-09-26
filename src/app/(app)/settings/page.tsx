"use client";

import { useRef, useState } from "react";
import { DatabaseBackup, KeyRound, RotateCcw, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/dexie";
import { resetAndSeed, wipeDatabase } from "@/lib/db/seed-runner";
import type { FuelProduct, Staff, Station } from "@/lib/db/types";
import { money } from "@/lib/domain/format";
import { DomainError } from "@/lib/repo/common";
import { setFuelPrice } from "@/lib/repo/ops";
import {
  downloadBackup,
  exportBackup,
  importBackup,
  setStaffActive,
  setStaffPin,
  setStationStatus,
  setStationTolerance,
} from "@/lib/repo/master";
import { useLive } from "@/lib/hooks/use-live";
import { useSession } from "@/lib/session/session-store";

export default function SettingsPage() {
  const role = useSession((s) => s.role);
  const profileId = useSession((s) => s.profileId);

  const stations = useLive<Station[] | null>(() => db.stations.toArray(), [profileId], null);
  const staff = useLive<Staff[] | null>(() => db.staff.toArray(), [profileId], null);
  const products = useLive<FuelProduct[] | null>(() => db.products.toArray(), [profileId], null);

  const [pinFor, setPinFor] = useState<Staff | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [tolEdits, setTolEdits] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (role !== "owner") {
    return (
      <EmptyState
        title="Owner access only"
        description="Settings are limited to the owner profile. Switch profiles from the top bar."
      />
    );
  }

  if (!stations || !staff || !products) return <Skeleton className="h-96" />;

  const doPrice = async (code: string) => {
    const rupees = parseFloat(priceEdits[code] || "");
    if (!Number.isFinite(rupees)) return;
    try {
      await setFuelPrice({ productCode: code, unitPricePaise: Math.round(rupees * 100), staffId: profileId! });
      toast.success("Price updated", `${code} → ${money(Math.round(rupees * 100), { exact: true })} / L`);
      setPriceEdits((p) => ({ ...p, [code]: "" }));
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not update the price.");
    }
  };

  const doTolerance = async (stationId: string) => {
    const rupees = parseFloat(tolEdits[stationId] || "");
    if (!Number.isFinite(rupees)) return;
    try {
      await setStationTolerance({ stationId, tolerancePaise: Math.round(rupees * 100), staffId: profileId! });
      toast.success("Tolerance updated");
      setTolEdits((t) => ({ ...t, [stationId]: "" }));
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not update tolerance.");
    }
  };

  const doPin = async () => {
    if (!pinFor) return;
    try {
      await setStaffPin({ staffId: pinFor.id, pin: pinValue, staffIdActor: profileId! });
      toast.success("PIN reset", pinFor.name);
      setPinFor(null);
      setPinValue("");
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "Could not reset the PIN.");
    }
  };

  const doExport = async () => {
    const backup = await exportBackup();
    downloadBackup(backup);
    toast.success("Backup downloaded", `${backup.exportedAt ? new Date(backup.exportedAt).toLocaleString("en-IN") : ""}`);
  };

  const doImport = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      await importBackup(parsed, profileId!);
      toast.success("Backup restored", file.name);
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : "That file is not a valid backup.");
    }
  };

  const doReseed = async () => {
    setBusy(true);
    try {
      await resetAndSeed();
      toast.success("Demo data reseeded", "Deterministic 90-day dataset regenerated.");
      setConfirmReset(false);
    } finally {
      setBusy(false);
    }
  };

  const doWipe = async () => {
    setBusy(true);
    try {
      await wipeDatabase();
      toast.warning("Database wiped", "Reload to seed a fresh dataset.");
      setConfirmReset(false);
    } finally {
      setBusy(false);
    }
  };

  const stationColumns: Column<Station>[] = [
    {
      key: "name",
      header: "Station",
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <p className="text-[15px] text-ink">{r.name}</p>
          <p className="mono-label text-muted">{r.code} · {r.city}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      render: (r) => <Chip tone={r.status === "active" ? "ok" : "neutral"}>{r.status}</Chip>,
    },
    {
      key: "tolerance",
      header: "Drawer tolerance (₹)",
      width: "240px",
      render: (r) => (
        <div className="flex items-center gap-2">
          <Input
            aria-label={`Tolerance for ${r.name}`}
            inputMode="decimal"
            className="w-24 py-1.5"
            placeholder={(r.tolerancePaise / 100).toFixed(0)}
            value={tolEdits[r.id] ?? ""}
            onChange={(e) => setTolEdits((t) => ({ ...t, [r.id]: e.target.value }))}
          />
          <Button size="sm" variant="outline" disabled={!tolEdits[r.id]} onClick={() => doTolerance(r.id)}>
            Save
          </Button>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await setStationStatus({
              stationId: r.id,
              status: r.status === "active" ? "inactive" : "active",
              staffId: profileId!,
            });
          }}
        >
          {r.status === "active" ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  const staffColumns: Column<Staff>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <p className="text-[15px] text-ink">{r.name}</p>
          <p className="mono-label text-muted">{r.phone}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", sortValue: (r) => r.role, render: (r) => <Chip tone={r.role === "owner" ? "info" : r.role === "manager" ? "ok" : "neutral"}>{r.role}</Chip> },
    {
      key: "station",
      header: "Station",
      sortValue: (r) => r.stationId ?? "all",
      render: (r) => <span className="text-[14px] text-body-muted">{stations.find((s) => s.id === r.stationId)?.code ?? "network"}</span>,
    },
    { key: "active", header: "Active", align: "center", render: (r) => <Chip tone={r.active ? "ok" : "neutral"}>{r.active ? "on" : "off"}</Chip> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStaffActive({ staffId: r.id, active: !r.active, staffIdActor: profileId! })}
          >
            {r.active ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setPinFor(r); setPinValue(""); }}>
            <KeyRound className="size-3.5" aria-hidden /> PIN
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader crumbs="Admin / Settings" title="Settings" sub="Price book, staff PINs, demo data and backups." />

      <section className="mb-8">
        <h2 className="mb-3 text-[20px] text-primary">Stations</h2>
        <DataTable columns={stationColumns} rows={stations} rowKey={(r) => r.id} />
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-[20px] text-primary">Price book</h2>
        <p className="mb-3 text-[14px] text-body-muted">Price changes snapshot onto each sale and re-run stock alerts.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {products.map((p) => (
            <div key={p.code} className="rounded-md border border-card-border bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[17px] text-primary">{p.shortName}</h3>
                  <p className="mono-label text-muted">{p.code}</p>
                </div>
                <span className="h-4 w-4 rounded-full" style={{ background: p.color }} aria-hidden />
              </div>
              <p className="mt-3 font-mono text-[24px] tabular-nums text-ink">{money(p.unitPricePaise, { exact: true })}</p>
              <p className="mono-label text-muted">cost {money(p.costPaise, { exact: true })} / L</p>
              <div className="mt-4 flex gap-2">
                <Input
                  aria-label={`New price for ${p.code}`}
                  inputMode="decimal"
                  placeholder={(p.unitPricePaise / 100).toFixed(2)}
                  value={priceEdits[p.code] ?? ""}
                  onChange={(e) => setPriceEdits((s) => ({ ...s, [p.code]: e.target.value }))}
                />
                <Button size="sm" disabled={!priceEdits[p.code]} onClick={() => doPrice(p.code)}>
                  Set
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[20px] text-primary">Staff &amp; PINs</h2>
        <DataTable columns={staffColumns} rows={staff} rowKey={(r) => r.id} />
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-card-border bg-white p-5">
          <div className="flex items-center gap-2">
            <DatabaseBackup className="size-4 text-deep-green" aria-hidden />
            <h2 className="text-[17px] text-primary">Backup</h2>
          </div>
          <p className="mt-2 text-[14px] text-body-muted">
            Everything lives in this browser. Export a JSON snapshot before clearing site data.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={doExport}>
              Export JSON
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" aria-hidden /> Import JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="rounded-md border border-error/40 bg-[#fdf0f0] p-5">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 text-error" aria-hidden />
            <h2 className="text-[17px] text-primary">Demo data</h2>
          </div>
          <p className="mt-2 text-[14px] text-body-muted">
            Reseed regenerates the deterministic 90-day dataset (seed 20260926). Wipe clears everything.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              Reset demo data
            </Button>
          </div>
        </div>
      </section>

      {/* PIN dialog */}
      <Dialog
        open={Boolean(pinFor)}
        onClose={() => setPinFor(null)}
        title={`Reset PIN — ${pinFor?.name ?? ""}`}
        description="4–6 digits. Demo hint: keep it simple (e.g. 1234)."
        footer={
          <>
            <Button variant="outline" onClick={() => setPinFor(null)}>
              Cancel
            </Button>
            <Button onClick={doPin} disabled={pinValue.length < 4}>
              Save PIN
            </Button>
          </>
        }
      >
        <Field label="New PIN" htmlFor="new-pin">
          <Input
            id="new-pin"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            className="font-mono text-[24px] tracking-[0.4em]"
            value={pinValue}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
        </Field>
      </Dialog>

      {/* confirm reset */}
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description="Replaces current data with the seeded dataset. Export a backup first if you need it."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doReseed} disabled={busy}>
              {busy ? "Working…" : "Reseed"}
            </Button>
            <Button variant="ghost" onClick={doWipe} disabled={busy}>
              Wipe instead
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-body-muted">This cannot be undone from the UI.</p>
      </Dialog>
    </div>
  );
}
