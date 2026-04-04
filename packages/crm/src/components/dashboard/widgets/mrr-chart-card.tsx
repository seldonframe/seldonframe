"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type MrrPoint = {
  month: string;
  value: number;
};

export function MrrChartCard({ data, total }: { data: MrrPoint[]; total: number }) {
  return (
    <article className="crm-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold">Monthly Recurring Revenue</h3>
        <span className="inline-flex rounded-md border border-border bg-[hsl(var(--primary)/0.1)] px-2 py-1 text-xs font-medium text-primary">
          ${total.toLocaleString()}
        </span>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="month" stroke="hsl(var(--color-text-muted))" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              stroke="hsl(var(--color-text-muted))"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.35 }}
              formatter={(value) => [`$${Number(value ?? 0).toLocaleString()}`, "MRR"]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                color: "hsl(var(--foreground))",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              fill="url(#mrrGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
