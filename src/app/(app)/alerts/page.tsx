"use client";

import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Chip, type Tone } from "@/components/ui/chip";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { PillGroup } from "@/components/ui/pill-group";
import { db } from "@/lib/db/dexie";
import type { Alert, AlertSeverity } from "@/lib/db/types";
import { relative } from "@/lib/domain/format";
import { ackAlert, ackAll } from "@/lib/repo/alerts";
import { useLive } from "@/lib/hooks/use-live";
import { scopeMatches, useSession } from "@/lib/session/session-store";

const SEV_TONE: Record<AlertSeverity, Tone> = { critical: "critical", warning: "warning", info: "info" };
const SEV_MARK: Record<AlertSeverity, string> = {
  critical: "bg-error",
  warning: "bg-coral",
  info: "bg-action-blue",
};

export default function AlertsPage() {
  const scope = useSession((s) => s.scope);
  const profileId = useSession((s) => s.profileId);
  const all = useLive<Alert[] | null>(() => db.alerts.orderBy("ts").reverse().toArray(), [profileId], null);
  const stations = useLive(() => db.stations.toArray(), [], null);
  const [sev, setSev] = useState<string>("unacked");

  if (!all) return <Skeleton className="h-96" />;

  const stationName = new Map((stations ?? []).map((s) => [s.id, s.name]));
  const scoped = all.filter((a) => a.stationId === null || scopeMatches(a.stationId, scope));
  const rows = scoped.filter((a) => {
    if (sev === "unacked") return !a.acked;
    if (sev === "all") return true;
    return a.severity === sev;
  });
  const counts = {
    critical: scoped.filter((a) => a.severity === "critical" && !a.acked).length,
    warning: scoped.filter((a) => a.severity === "warning" && !a.acked).length,
    info: scoped.filter((a) => a.severity === "info" && !a.acked).length,
  };
  const unacked = scoped.filter((a) => !a.acked).length;

  return (
    <div>
      <PageHeader
        crumbs="Operations / Alerts"
        title="Alerts"
        sub={`${unacked} unacknowledged in this scope`}
        actions={
          unacked > 0 ? (
            <Button variant="outline" onClick={() => ackAll()}>
              <CheckCheck className="size-4" aria-hidden /> Acknowledge all
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <PillGroup
          ariaLabel="Filter alerts"
          options={[
            { value: "unacked", label: `Unacked (${unacked})` },
            { value: "critical", label: `Critical (${counts.critical})` },
            { value: "warning", label: `Warnings (${counts.warning})` },
            { value: "info", label: `Info (${counts.info})` },
            { value: "all", label: "All" },
          ]}
          value={sev}
          onChange={setSev}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-10" strokeWidth={1.25} aria-hidden />}
          title="All clear"
          description={sev === "unacked" ? "Everything has been acknowledged." : "No alerts match this filter."}
        />
      ) : (
        <ul className="divide-y divide-card-border rounded-md border border-card-border bg-white">
          {rows.map((a) => (
            <li key={a.id} className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-pale-green/40 ${a.acked ? "opacity-55" : ""}`}>
              <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${SEV_MARK[a.severity]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={SEV_TONE[a.severity]}>{a.severity}</Chip>
                  <span className="mono-label uppercase text-muted">{a.type.replace(/-/g, " ")}</span>
                  {a.stationId && <span className="mono-label text-muted">{stationName.get(a.stationId) ?? a.stationId}</span>}
                </div>
                <p className="mt-1.5 text-[15px] text-ink">{a.title}</p>
                <p className="mt-0.5 text-[14px] leading-snug text-body-muted">{a.message}</p>
                <p className="mono-label mt-1.5 text-muted">{relative(a.ts)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {a.acked ? (
                  <Chip tone="neutral">acked</Chip>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => ackAlert(a.id)}>
                    Acknowledge
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
