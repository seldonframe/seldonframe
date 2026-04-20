"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = {
  label: string;
  value: number;
};

type TrendChartCardProps = {
  title: string;
  data: TrendPoint[];
  mode?: "line" | "area";
  valuePrefix?: string;
  valueSuffix?: string;
  compactYAxis?: boolean;
};

export function TrendChartCard({
  title,
  data,
  mode = "line",
  valuePrefix = "",
  valueSuffix = "",
  compactYAxis = false,
}: TrendChartCardProps) {
  const formatter = (value: number) => `${valuePrefix}${Number(value).toLocaleString()}${valueSuffix}`;

  return (
    <article className="crm-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">{title}</h3>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "area" ? (
            <AreaChart data={data} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id={`trend-${title.replace(/\s+/g, "-")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.35} vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--color-text-muted))" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                stroke="hsl(var(--color-text-muted))"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tickFormatter={(value) =>
                  compactYAxis ? `${valuePrefix}${Math.round(Number(value) / 1000)}k${valueSuffix}` : formatter(Number(value))
                }
              />
              <Tooltip
                cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.35 }}
                formatter={(value) => [formatter(Number(value ?? 0)), title]}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill={`url(#trend-${title.replace(/\s+/g, "-")})`}
                dot={false}
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.35} vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--color-text-muted))" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                stroke="hsl(var(--color-text-muted))"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tickFormatter={(value) =>
                  compactYAxis ? `${valuePrefix}${Math.round(Number(value) / 1000)}k${valueSuffix}` : formatter(Number(value))
                }
              />
              <Tooltip
                cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.35 }}
                formatter={(value) => [formatter(Number(value ?? 0)), title]}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </article>
  );
}
