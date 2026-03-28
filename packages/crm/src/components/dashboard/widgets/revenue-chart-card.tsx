"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

type RevenuePoint = {
  label: string;
  value: number;
};

type RevenueChartCardProps = {
  title: string;
  data: RevenuePoint[];
  ranges: string[];
};

type TooltipPayload = {
  payload: RevenuePoint;
  value: number;
};

function RevenueTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) {
    return null;
  }

  const current = payload[0];

  return (
    <div className="glass-card rounded-xl p-3">
      <p className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.8)]">{current.payload.label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">${Math.round(Number(current.value)).toLocaleString()}</p>
    </div>
  );
}

export function RevenueChartCard({ title, data, ranges }: RevenueChartCardProps) {
  const [activeRange, setActiveRange] = useState(ranges[0] ?? "30 days");

  const filteredData = useMemo(() => {
    if (activeRange === "12 months") {
      return data.slice(-52);
    }

    if (activeRange === "6 months") {
      return data.slice(-26);
    }

    return data.slice(-12);
  }, [activeRange, data]);

  if (!filteredData.length) {
    return null;
  }

  return (
    <article className="glass-card rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          {ranges.map((range) => {
            const active = activeRange === range;
            return (
              <button
                key={range}
                type="button"
                onClick={() => setActiveRange(range)}
                className={`relative pb-1 transition ${active ? "text-primary" : "hover:text-foreground"}`}
              >
                {range}
                <span
                  className={`absolute bottom-0 left-0 h-px w-full origin-left bg-primary transition-transform duration-200 ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer>
          <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} horizontal={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              dy={10}
            />
            <Tooltip cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} content={<RevenueTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              dot={false}
              activeDot={{ r: 4, stroke: "hsl(var(--primary))", strokeWidth: 2, fill: "hsl(var(--background))" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 h-px w-full bg-white/10" />
    </article>
  );
}
