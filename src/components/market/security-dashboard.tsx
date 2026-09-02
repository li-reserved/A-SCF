"use client";

import { AlertTriangle, BarChart3, Gauge, Search, ShieldAlert, Target, TrendingUp } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketData } from "@/hooks/use-market-data";
import { formatAmount, formatDateTime, formatNumber, formatPercent, toneClass } from "@/lib/market-format";
import type { SecurityData } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { chartTooltipStyle, DataState, MetricCard, PageHeading } from "./market-ui";

function movingAverage(values: number[], size: number, index: number): number | null {
  if (index < size - 1) return null;
  const window = values.slice(index - size + 1, index + 1);
  return window.reduce((sum, value) => sum + value, 0) / size;
}

export function SecurityDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCode = searchParams.get("code") ?? "";
  const initialCode = /^\d{6}$/.test(requestedCode) ? requestedCode : "000001";
  const [input, setInput] = useState(initialCode);
  const [code, setCode] = useState(initialCode);
  const [formError, setFormError] = useState("");
  const { data, error, loading, refreshing, reload } = useMarketData<SecurityData>(`/api/security/advice?code=${encodeURIComponent(code)}`);
  const chartData = useMemo(() => {
    const bars = data?.dailyBars.slice(-70) ?? [];
    const closes = bars.map((bar) => bar.close);
    return bars.map((bar, index) => ({
      ...bar,
      ma5: movingAverage(closes, 5, index),
      ma20: movingAverage(closes, 20, index),
      volumeYi: bar.amount / 100000000,
    }));
  }, [data]);

  useEffect(() => {
    setInput(initialCode);
    setCode(initialCode);
    setFormError("");
  }, [initialCode]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCode = input.trim();
    if (!/^\d{6}$/.test(nextCode)) {
      setFormError("请输入 6 位 A 股或 ETF 代码");
      return;
    }
    setFormError("");
    setCode(nextCode);
    router.replace(`/security?code=${nextCode}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <PageHeading
        eyebrow="SECURITY RESEARCH"
        title="个股研判"
        description="将实时行情、日线趋势、技术位与风险约束放在同一个研判页中。"
        meta={data ? `${data.source} · ${data.tradeDate} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={(
          <form onSubmit={submit} className="flex items-center gap-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <span className="sr-only">股票代码</span>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="输入 6 位代码"
                className="h-9 w-44 rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                aria-invalid={Boolean(formError)}
              />
            </label>
            <Button type="submit" size="sm"><Search />查询</Button>
          </form>
        )}
      />
      {formError && <p className="-mt-3 text-right text-xs text-rose-600 dark:text-rose-400">{formError}</p>}

      <DataState loading={loading} error={error} onRetry={reload} />

      {data && !loading && (
        <>
          <Card>
            <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded border bg-muted px-2 py-0.5 text-xs text-muted-foreground">{data.security.typeLabel}</span>
                  <span className="text-xs text-muted-foreground">{data.security.code}</span>
                </div>
                <h2 className="mt-2 text-2xl font-semibold">{data.security.name}</h2>
              </div>
              <div className="text-left sm:text-right">
                <strong className={cn("text-3xl font-semibold tabular-nums", toneClass(data.quote.changePct))}>{formatNumber(data.quote.latest)}</strong>
                <p className={cn("mt-1 text-sm font-medium", toneClass(data.quote.changePct))}>{data.quote.change > 0 ? "+" : ""}{formatNumber(data.quote.change)} · {formatPercent(data.quote.changePct)}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="今日区间" value={`${formatNumber(data.quote.low)} - ${formatNumber(data.quote.high)}`} detail={`开盘 ${formatNumber(data.quote.open)} · 昨收 ${formatNumber(data.quote.preClose)}`} icon={<BarChart3 className="h-4 w-4" />} />
            <MetricCard label="成交额" value={formatAmount(data.quote.amount / 100000000)} detail={`换手 ${formatPercent(data.quote.turnoverRate, false)} · 量比 ${formatNumber(data.quote.volumeRatio)}`} icon={<TrendingUp className="h-4 w-4" />} tone="primary" />
            <MetricCard label="RSI / ATR" value={`${formatNumber(data.indicators.rsi14, 1)} / ${formatNumber(data.indicators.atr14, 2)}`} detail={`区间位置 ${formatPercent(data.indicators.rangePosition, false)}`} icon={<Gauge className="h-4 w-4" />} />
            <MetricCard label="预期区间" value={`${formatNumber(data.outlook.expectedRange[0])} - ${formatNumber(data.outlook.expectedRange[1])}`} detail={`${data.outlook.direction} · 置信 ${data.outlook.confidence}%`} icon={<Target className="h-4 w-4" />} tone="primary" />
          </div>

          <Card className="min-w-0">
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>日线与成交额</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">MA5 / MA20 前复权走势</p>
              </div>
              <span className="text-xs text-muted-foreground">{chartData.length} 个交易日</span>
            </CardHeader>
            <CardContent>
              <div className="h-[440px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => String(value).slice(5)} />
                    <YAxis yAxisId="price" tick={{ fontSize: 10 }} width={48} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                    <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10 }} width={44} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [String(name).includes("成交") ? formatAmount(Number(value)) : formatNumber(Number(value)), name]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    <ReferenceLine yAxisId="price" y={data.levels.support} stroke="#059669" strokeDasharray="4 4" label={{ value: "支撑", fontSize: 10, fill: "#059669" }} />
                    <ReferenceLine yAxisId="price" y={data.levels.resistance} stroke="#e11d48" strokeDasharray="4 4" label={{ value: "压力", fontSize: 10, fill: "#e11d48" }} />
                    <Bar yAxisId="volume" dataKey="volumeYi" name="成交额（亿）" fill="#94a3b8" opacity={0.28} />
                    <Area yAxisId="price" type="monotone" dataKey="close" name="收盘价" stroke="#4f46b8" fill="#4f46b8" fillOpacity={0.08} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line yAxisId="price" type="monotone" dataKey="ma5" name="MA5" stroke="#d97706" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                    <Line yAxisId="price" type="monotone" dataKey="ma20" name="MA20" stroke="#0891b2" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>关键价位</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["观察区", `${formatNumber(data.levels.observeBuyZone[0])}-${formatNumber(data.levels.observeBuyZone[1])}`],
                  ["突破确认", formatNumber(data.levels.breakoutTrigger)],
                  ["支撑位", formatNumber(data.levels.support)],
                  ["压力位", formatNumber(data.levels.resistance)],
                  ["失效位", formatNumber(data.levels.stopLoss)],
                  ["第二目标", formatNumber(data.levels.secondTarget)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border bg-muted/25 p-3">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <strong className="mt-1 block text-sm">{value}</strong>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>交易观察</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{data.advice.summary}</span>
                  <span className="text-xs text-muted-foreground">{data.outlook.horizon}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><span className="text-xs text-muted-foreground">已持有</span><p className="mt-1 text-sm leading-6">{data.advice.holder}</p></div>
                  <div><span className="text-xs text-muted-foreground">未持有</span><p className="mt-1 text-sm leading-6">{data.advice.watcher}</p></div>
                  <div><span className="text-xs text-muted-foreground">触发条件</span><p className="mt-1 text-sm leading-6">{data.advice.trigger}</p></div>
                  <div><span className="text-xs text-muted-foreground">风险约束</span><p className="mt-1 text-sm leading-6">{data.advice.discipline}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /><CardTitle>当前信号</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.signals.map((signal, index) => <p key={`${signal.tone}-${index}`} className="rounded-md bg-muted/40 px-3 py-2 text-sm leading-5">{signal.text}</p>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><CardTitle>风险提示</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.risks.map((risk) => <p key={risk} className="text-sm leading-6 text-muted-foreground">{risk}</p>)}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}
