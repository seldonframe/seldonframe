"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/revenue-flow-chart.tsx
    - shell: "flex-1 flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 rounded-xl border bg-card min-w-0"
    - header row: "flex flex-wrap items-center gap-2 sm:gap-4"
    - title: "text-sm sm:text-base font-medium"
    - chart wrap: "flex-1 h-[180px] sm:h-[200px] lg:h-[240px] min-w-0"
  - templates/dashboard-2/components/dashboard/revenue-flow-chart.tsx (tooltip)
    - "bg-popover border border-border rounded-lg p-2 sm:p-3 shadow-lg"
*/

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
    <div className="bg-popover border border-border rounded-lg p-2 sm:p-3 shadow-lg">
      <p className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">{current.payload.label}</p>
      <p className="text-[10px] sm:text-sm text-muted-foreground">${Math.round(Number(current.value)).toLocaleString()}</p>
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
    <article className="flex-1 flex flex-col gap-4 sm:gap-6 p-4 sm:p-6 rounded-xl border bg-card min-w-0">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <h3 className="text-sm sm:text-base font-medium">{title}</h3>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
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

      <div className="flex-1 h-[180px] sm:h-[200px] lg:h-[240px] min-w-0">
        <ResponsiveContainer>
          <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} horizontal={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              dy={10}
            />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={<RevenueTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--primary)", strokeWidth: 2, fill: "var(--background)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
