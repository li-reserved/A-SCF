"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CalendarClock, ExternalLink, Landmark } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarketData } from "@/hooks/use-market-data";
import { formatDate, formatDateTime, formatNumber, toneClass } from "@/lib/market-format";
import type { ReverseRepoData, ReverseRepoOperation, ReverseRepoRow } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { chartTooltipStyle, DataState, MetricCard, PageHeading } from "./market-ui";

function formatLiquidityAmount(value: number, signed = false) {
  return `${signed && value > 0 ? "+" : ""}${formatNumber(value)}亿`;
}

function OperationList({ operations, emptyText }: { operations: ReverseRepoOperation[]; emptyText: string }) {
  if (!operations.length) return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  return (
    <div className="space-y-1.5">
      {operations.map((operation) => (
        <a
          key={`${operation.sourceUrl}-${operation.termDays}-${operation.amount}`}
          href={operation.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="flex flex-wrap items-baseline justify-end gap-x-1 text-xs text-foreground hover:text-primary"
          title={operation.title}
        >
          <span className="text-[10px] text-muted-foreground">{operation.instrumentLabel}</span>
          <span className="text-muted-foreground">·</span>
          <span>{operation.termLabel}</span>
          <strong>{formatLiquidityAmount(operation.amount)}</strong>
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

export function LiquidityDashboard() {
  const { data, error, loading, refreshing, reload } = useMarketData<ReverseRepoData>("/api/fund-flow/reverse-repo");
  const [chartWidth, setChartWidth] = useState(0);
  const today = data?.rows.find((row) => row.date === data.asOfDate);
  const todayIndex = data?.rows.findIndex((row) => row.date === data.asOfDate) ?? -1;
  const nextMaturity = data?.rows.find((row) => row.date > data.asOfDate && row.maturity > 0);
  const totalNet = data?.rows.reduce((sum, row) => sum + row.netInjection, 0) ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <PageHeading
        eyebrow="OPEN MARKET OPERATIONS"
        title="央行流动性"
        description="完整汇总普通逆回购、买断式逆回购与 MLF 的投放、到期和净投放。"
        meta={data ? `${data.source} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={data ? (
          <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent">
            <Landmark className="h-4 w-4" />
            央行公告
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : undefined}
      />

      <DataState loading={loading} error={error} empty={Boolean(data && !data.rows.length)} onRetry={reload} />

      {data && data.rows.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="今日投放" value={formatLiquidityAmount(today?.injection ?? 0)} detail={today?.injections.some((item) => item.amount > 0) ? today.injections.filter((item) => item.amount > 0).map((item) => `${item.instrumentLabel} ${formatLiquidityAmount(item.amount)}`).join(" / ") : "尚无新投放"} icon={<ArrowDownToLine className="h-4 w-4" />} tone="positive" />
            <MetricCard label="今日到期" value={formatLiquidityAmount(today?.maturity ?? 0)} detail={today?.maturities.length ? today.maturities.map((item) => `${item.instrumentLabel} ${formatLiquidityAmount(item.amount)}`).join(" / ") : "今日无到期"} icon={<ArrowUpFromLine className="h-4 w-4" />} tone="negative" />
            <MetricCard label={today && today.netInjection >= 0 ? "今日净投放" : "今日净回笼"} value={formatLiquidityAmount(Math.abs(today?.netInjection ?? 0))} detail={`${data.asOfDate} 央行流动性操作`} icon={<Landmark className="h-4 w-4" />} tone={(today?.netInjection ?? 0) >= 0 ? "positive" : "negative"} />
            <MetricCard label="下一到期" value={nextMaturity ? formatLiquidityAmount(nextMaturity.maturity) : "--"} detail={nextMaturity ? `${formatDate(nextMaturity.date)} · ${nextMaturity.maturities.map((item) => item.instrumentLabel).join(" / ")}` : "窗口内无到期"} icon={<CalendarClock className="h-4 w-4" />} tone="primary" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>流动性投放与到期</CardTitle>
                <p className="text-xs text-muted-foreground">窗口累计净额 {formatLiquidityAmount(totalNet, true)}</p>
              </CardHeader>
              <CardContent>
                <div className="h-[390px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" onResize={(width) => setChartWidth(Math.round(width))}>
                    <BarChart key={`${data.asOfDate}-${chartWidth}`} data={data.rows} margin={{ top: 8, right: 8, left: 2, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={18} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => String(value).slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} width={52} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip defaultIndex={todayIndex >= 0 ? todayIndex : undefined} contentStyle={chartTooltipStyle} formatter={(value, name) => [formatLiquidityAmount(Number(value)), name]} labelFormatter={(value) => formatDate(String(value))} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                      <Bar dataKey="injection" name="投放" fill="#e11d48" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="maturity" name="到期" fill="#059669" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>流动性日历</CardTitle>
                <p className="text-xs text-muted-foreground">{data.range.startDate} 至 {data.range.endDate} · 单位：{data.amountUnit}</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y md:hidden">
                  {data.rows.map((row: ReverseRepoRow) => (
                    <div key={row.date} className={cn("space-y-3 px-5 py-4", row.date === data.asOfDate && "bg-primary/5")}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <strong className="block text-sm font-medium">{formatDate(row.date)}</strong>
                          <span className="text-xs text-muted-foreground">{row.date}</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] text-muted-foreground">净投放</span>
                          <strong className={cn("text-sm tabular-nums", toneClass(row.netInjection))}>{formatLiquidityAmount(row.netInjection, true)}</strong>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="text-right">
                          <span className="mb-1 block text-[10px] text-muted-foreground">投放</span>
                          <OperationList operations={row.injections} emptyText="--" />
                        </div>
                        <div className="text-right">
                          <span className="mb-1 block text-[10px] text-muted-foreground">到期</span>
                          <OperationList operations={row.maturities} emptyText="--" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead className="text-right">投放</TableHead>
                        <TableHead className="text-right">到期</TableHead>
                        <TableHead className="text-right">净投放</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row: ReverseRepoRow) => (
                        <TableRow key={row.date} className={cn(row.date === data.asOfDate && "bg-primary/5")}>
                          <TableCell>
                            <strong className="block font-medium">{formatDate(row.date)}</strong>
                            <span className="text-xs text-muted-foreground">{row.date}</span>
                          </TableCell>
                          <TableCell className="text-right"><OperationList operations={row.injections} emptyText="--" /></TableCell>
                          <TableCell className="text-right"><OperationList operations={row.maturities} emptyText="--" /></TableCell>
                          <TableCell className={cn("text-right font-semibold tabular-nums", toneClass(row.netInjection))}>{formatLiquidityAmount(row.netInjection, true)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
