"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayPoint } from "@/lib/domain/analytics";
import { moneyShort } from "@/lib/domain/format";

const AXIS = { stroke: "#d9d9dd", fontSize: 10, fontFamily: "var(--font-mono)" };

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-hairline bg-white px-3 py-2 text-[12px] shadow-none">
      <p className="mono-label text-muted">{label}</p>
      <p className="text-[14px] text-primary tabular-nums">{moneyShort(payload[0].value)}</p>
    </div>
  );
}

export function RevenueTrendChart({ points }: { points: DayPoint[] }) {
  const data = points.map((p) => ({ day: p.day.slice(5), revenue: p.revenuePaise / 100 }));
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <figure className="flex h-full flex-col">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="mono-label text-muted">Revenue trend</span>
        <span className="mono-label text-muted">₹ / day</span>
      </figcaption>
      <div className="min-h-52 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1863dc" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#1863dc" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#d9d9dd" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="day" tick={{ ...AXIS, fill: "#68687a" }} tickLine={false} axisLine={{ stroke: "#d9d9dd" }} minTickGap={22} />
            <YAxis
              tick={{ ...AXIS, fill: "#68687a" }}
              tickLine={false}
              axisLine={false}
              width={58}
              tickFormatter={(v: number) => moneyShort(v)}
              domain={[0, max * 1.1]}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#d9d9dd" }} />
            <Area type="monotone" dataKey="revenue" stroke="#1863dc" strokeWidth={1.75} fill="url(#revFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        Revenue trend over {points.length} days, peak {moneyShort(max * 100)}.
      </p>
    </figure>
  );
}

const MIX_COLORS: Record<string, string> = { cash: "#003c33", upi: "#1863dc", card: "#9b60aa", credit: "#ff7759" };

export function MixDonut({ shares }: { shares: Record<string, number> }) {
  const data = Object.entries(shares)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: Math.round(v * 1000) / 10 }));
  return (
    <figure className="flex h-full flex-col">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="mono-label text-muted">Collections mix</span>
        <span className="mono-label text-muted">% share</span>
      </figcaption>
      <div className="flex min-h-0 flex-1 items-center gap-4">
        <div className="h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={44} outerRadius={64} paddingAngle={2} stroke="none" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.name} fill={MIX_COLORS[d.name] ?? "#93939f"} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2 text-[13px]">
              <span className="size-2.5 rounded-full" style={{ background: MIX_COLORS[d.name] ?? "#93939f" }} />
              <span className="uppercase text-body-muted">{d.name}</span>
              <span className="ml-auto tabular-nums text-ink">{d.value.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">Collections mix by payment method.</p>
    </figure>
  );
}

export function HourlyBars({ buckets }: { buckets: number[] }) {
  const max = Math.max(...buckets, 1);
  return (
    <figure>
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="mono-label text-muted">Hourly pattern</span>
        <span className="mono-label text-muted">avg ₹ by hour</span>
      </figcaption>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Average revenue by hour of day">
        {buckets.map((v, i) => (
          <div
            key={i}
            title={`${i}:00 — ${moneyShort(v)}`}
            className="flex-1 rounded-t-[4px] bg-deep-green/85 transition-colors hover:bg-deep-green"
            style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between mono-label text-muted">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </figure>
  );
}
