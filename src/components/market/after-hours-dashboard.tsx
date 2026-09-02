"use client";

import { CandlestickChart, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useMarketData } from "@/hooks/use-market-data";
import { formatAmount, formatDateTime, formatNumber, formatPercent } from "@/lib/market-format";
import type { SecurityData } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { DataState, PageHeading } from "./market-ui";

type GsSignalCode = "G" | "S" | "观察";

interface GsSignal {
  code: GsSignalCode;
  label: string;
}

interface ConfirmedGsEvent {
  code: Exclude<GsSignalCode, "观察">;
  date: string;
  confirmedFlow: number;
}

interface TrendPoint {
  date: string;
  close: number;
  ma5: number | null;
  darkFlow: number | null;
  gValue: number | null;
  sValue: number | null;
  gLabel: string;
  sLabel: string;
}

const terminalTooltipStyle = {
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#09090b",
  color: "#fafafa",
  boxShadow: "none",
  fontSize: 12,
};

function movingAverage(values: number[], size: number, index: number): number | null {
  if (index < size - 1) return null;
  const window = values.slice(index - size + 1, index + 1);
  return window.reduce((sum, value) => sum + value, 0) / size;
}

function terminalToneClass(value: number | null): string {
  if (value === null || value === 0) return "text-neutral-100";
  return value > 0 ? "text-rose-400" : "text-emerald-400";
}

function resolveGsSignal(event: ConfirmedGsEvent | null): GsSignal {
  if (!event) return { code: "观察", label: "等待资金确认" };
  if (event.code === "G") return { code: "G", label: "趋势有望启动" };
  return { code: "S", label: "趋势暂缓或结束" };
}

function buildConfirmedGsState(points: Array<{ date: string; superLarge: number }>) {
  const rows = [...new Map(points
    .filter((point) => point.date && Number.isFinite(point.superLarge))
    .map((point) => [point.date, point] as const)).values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-60);
  const events: ConfirmedGsEvent[] = [];
  let regime = 0;

  for (let index = 2; index < rows.length; index += 1) {
    const window = rows.slice(index - 2, index + 1);
    const direction = window.every((point) => point.superLarge > 0)
      ? 1
      : window.every((point) => point.superLarge < 0)
        ? -1
        : 0;
    if (direction === 0 || direction === regime) continue;
    regime = direction;
    events.push({
      code: direction > 0 ? "G" : "S",
      date: rows[index].date,
      confirmedFlow: Number(window.reduce((sum, point) => sum + point.superLarge, 0).toFixed(2)),
    });
  }

  const latestG = events.filter((event) => event.code === "G").at(-1);
  const latestS = events.filter((event) => event.code === "S").at(-1);
  return {
    current: events.at(-1) ?? null,
    markers: [latestG, latestS].filter((event): event is ConfirmedGsEvent => Boolean(event))
      .sort((left, right) => left.date.localeCompare(right.date)),
    rows,
  };
}

export function AfterHoursDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCode = searchParams.get("code") ?? "";
  const initialCode = /^\d{6}$/.test(requestedCode) ? requestedCode : "000001";
  const [input, setInput] = useState(initialCode);
  const [code, setCode] = useState(initialCode);
  const [formError, setFormError] = useState("");
  const { data, error, loading, refreshing, reload } = useMarketData<SecurityData>(
    `/api/security/advice?code=${encodeURIComponent(code)}`,
    30_000,
  );

  useEffect(() => {
    setInput(initialCode);
    setCode(initialCode);
    setFormError("");
  }, [initialCode]);

  const gsState = useMemo(() => {
    if (!data) return buildConfirmedGsState([]);
    const points = (data.fundFlow.dailyPoints ?? []).map((point) => ({
      date: point.date,
      superLarge: point.superLarge,
    }));
    if (data.fundFlow.superLarge !== null) {
      points.push({ date: data.tradeDate, superLarge: data.fundFlow.superLarge });
    }
    return buildConfirmedGsState(points);
  }, [data]);

  const fundBreakdown = useMemo(() => {
    if (!data) return null;
    const snapshot = data.fundFlow.darkTrade;
    const signal = resolveGsSignal(gsState.current);
    const mainBars = snapshot ? [
      { name: "明盘", amount: snapshot.visible },
      { name: "暗盘", amount: snapshot.dark },
    ] : [];
    const retailBars = snapshot ? [{ name: "散户", amount: snapshot.retail }] : [];
    const extent = Math.max(
      ...[...mainBars, ...retailBars].map((item) => Math.abs(item.amount)),
      0.01,
    ) * 1.15;

    return {
      available: Boolean(snapshot),
      main: snapshot?.main ?? null,
      visible: snapshot?.visible ?? null,
      dark: snapshot?.dark ?? null,
      retail: snapshot?.retail ?? null,
      source: snapshot?.source ?? "明暗盘数据暂不可用",
      tradeDate: snapshot?.tradeDate ?? null,
      quoteTime: snapshot?.quoteTime ?? null,
      signal,
      signalDate: gsState.current?.date ?? null,
      mainBars,
      retailBars,
      chartDomain: [-extent, extent] as [number, number],
    };
  }, [data, gsState.current]);

  const trendData = useMemo<TrendPoint[]>(() => {
    if (!data) return [];
    const bars = data.dailyBars.slice(-60);
    const closes = bars.map((bar) => bar.close);
    const darkFlowByDate = new Map(gsState.rows.map((point) => [point.date, point.superLarge]));
    const signalByDate = new Map(gsState.markers.map((event) => [event.date, event]));

    return bars.map((bar, index) => {
      const darkFlow = darkFlowByDate.get(bar.date) ?? null;
      const event = signalByDate.get(bar.date);

      return {
        date: bar.date,
        close: bar.close,
        ma5: movingAverage(closes, 5, index),
        darkFlow,
        gValue: event?.code === "G" ? bar.close : null,
        sValue: event?.code === "S" ? bar.close : null,
        gLabel: event?.code === "G" ? "G" : "",
        sLabel: event?.code === "S" ? "S" : "",
      };
    });
  }, [data, gsState.markers, gsState.rows]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCode = input.trim();
    if (!/^\d{6}$/.test(nextCode)) {
      setFormError("请输入 6 位 A 股代码");
      return;
    }
    setFormError("");
    setCode(nextCode);
    router.replace(`/after-hours?code=${nextCode}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <PageHeading
        eyebrow="STOCK DARK FLOW"
        title="资金明暗盘"
        description="输入股票代码，查看该股当日明暗盘资金、历史暗盘方向与 GS 信号。"
        meta={data ? `${data.source} · ${data.tradeDate} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={(
          <form onSubmit={submit} className="flex w-full items-center gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <span className="sr-only">股票代码</span>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="输入 6 位股票代码"
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-52"
                aria-invalid={Boolean(formError)}
              />
            </label>
            <Button type="submit" size="sm"><Search />查询</Button>
          </form>
        )}
      />
      {formError && <p className="-mt-3 text-right text-xs text-rose-600 dark:text-rose-400">{formError}</p>}

      <DataState loading={loading} error={error} onRetry={reload} />

      {data && !loading && fundBreakdown && (
        <>
          <Card
            data-testid="single-stock-dark-flow"
            className="min-w-0 overflow-hidden border-neutral-800 bg-neutral-950 text-neutral-100 shadow-none"
          >
            <CardHeader className="grid gap-5 border-b border-neutral-800 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="rounded border border-neutral-700 px-2 py-0.5">{data.security.typeLabel}</span>
                  <span>{data.security.code}</span>
                </div>
                <h2 className="mt-2 truncate text-2xl font-semibold text-neutral-50">{data.security.name}</h2>
              </div>

              <div className="text-left sm:text-right">
                <strong className={cn("text-3xl font-semibold tabular-nums", terminalToneClass(data.quote.changePct))}>
                  {formatNumber(data.quote.latest)}
                </strong>
                <p className={cn("mt-1 text-sm font-medium", terminalToneClass(data.quote.changePct))}>
                  {data.quote.change > 0 ? "+" : ""}{formatNumber(data.quote.change)} · {formatPercent(data.quote.changePct)}
                </p>
              </div>

              <div
                className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-4 sm:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"
                data-testid="stock-gs-signal"
              >
                <div>
                  <span className="text-[11px] text-neutral-500">
                    最近 GS 信号 · {fundBreakdown.signalDate ?? "等待确认"} · 30 秒更新
                  </span>
                  <p className={cn("mt-1 text-sm font-semibold", fundBreakdown.signal.code === "G" ? "text-rose-400" : fundBreakdown.signal.code === "S" ? "text-emerald-400" : "text-neutral-300")}>
                    {fundBreakdown.signal.code === "观察" ? "观察" : `${fundBreakdown.signal.code} 信号`}
                    <span className="ml-2 font-normal text-neutral-400">{fundBreakdown.signal.label}</span>
                  </p>
                </div>
                <span
                  className={cn(
                    "grid h-12 w-12 flex-shrink-0 place-items-center rounded-full border text-lg font-bold",
                    fundBreakdown.signal.code === "G" && "border-rose-500/50 bg-rose-500/15 text-rose-400",
                    fundBreakdown.signal.code === "S" && "border-emerald-500/50 bg-emerald-500/15 text-emerald-400",
                    fundBreakdown.signal.code === "观察" && "border-neutral-700 bg-neutral-900 text-neutral-300",
                  )}
                  aria-label={`${fundBreakdown.signal.code}信号：${fundBreakdown.signal.label}`}
                >
                  {fundBreakdown.signal.code === "观察" ? "--" : fundBreakdown.signal.code}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="grid border-b border-neutral-800 sm:grid-cols-2">
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-rose-500/50 bg-rose-500/15 text-[11px] font-bold text-rose-400">G</span>
                  <span className="text-xs text-neutral-400">暗盘代理连续净流入 · 趋势有望启动</span>
                </div>
                <div className="flex items-center gap-3 border-t border-neutral-800 px-5 py-3 sm:border-l sm:border-t-0">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-emerald-500/50 bg-emerald-500/15 text-[11px] font-bold text-emerald-400">S</span>
                  <span className="text-xs text-neutral-400">暗盘代理连续净流出 · 趋势暂缓或结束</span>
                </div>
              </div>

              <div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
                <section className="min-w-0 border-b border-neutral-800 p-5 xl:border-b-0 xl:border-r">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-100">趋势与 GS 节点</h3>
                      <p className="mt-1 text-xs text-neutral-500">连续 3 个交易日同向确认 · G/S 各保留最近一次</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500">
                      <span className="text-rose-400">收盘价</span>
                      <span className="text-amber-400">MA5</span>
                      <span className="text-emerald-400">历史暗盘代理</span>
                    </div>
                  </div>
                  <div className="mt-4 h-[380px] w-full min-w-0" role="img" aria-label={`${data.security.name}最近 60 日趋势与 GS 信号`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trendData} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                        <XAxis
                          dataKey="date"
                          minTickGap={32}
                          tick={{ fill: "#71717a", fontSize: 10 }}
                          tickFormatter={(value) => String(value).slice(5)}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="price"
                          width={44}
                          domain={["auto", "auto"]}
                          tick={{ fill: "#71717a", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis yAxisId="flow" hide orientation="right" domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={terminalTooltipStyle}
                          labelStyle={{ color: "#a3a3a3" }}
                          formatter={(value, name) => [
                            name === "历史暗盘代理" ? formatAmount(Number(value), true) : formatNumber(Number(value)),
                            name,
                          ]}
                        />
                        <ReferenceLine yAxisId="flow" y={0} stroke="#52525b" strokeDasharray="4 4" />
                        <Line yAxisId="price" type="monotone" dataKey="close" name="收盘价" stroke="#fb7185" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line yAxisId="price" type="monotone" dataKey="ma5" name="MA5" stroke="#fbbf24" strokeWidth={1.3} dot={false} connectNulls isAnimationActive={false} />
                        <Line yAxisId="flow" type="monotone" dataKey="darkFlow" name="历史暗盘代理" stroke="#34d399" strokeWidth={1.2} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
                        <Scatter yAxisId="price" dataKey="gValue" name="G信号" fill="#fb7185" isAnimationActive={false}>
                          <LabelList dataKey="gLabel" position="top" fill="#fb7185" fontSize={11} fontWeight={700} />
                        </Scatter>
                        <Scatter yAxisId="price" dataKey="sValue" name="S信号" fill="#34d399" isAnimationActive={false}>
                          <LabelList dataKey="sLabel" position="bottom" fill="#34d399" fontSize={11} fontWeight={700} />
                        </Scatter>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="min-w-0 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-100">当日资金结构</h3>
                      <p className="mt-1 text-xs text-neutral-500">
                        {fundBreakdown.available
                          ? `${fundBreakdown.source} · ${fundBreakdown.tradeDate} ${fundBreakdown.quoteTime} · 单位：亿元`
                          : fundBreakdown.source}
                      </p>
                    </div>
                    <CandlestickChart className="h-4 w-4 text-neutral-500" />
                  </div>

                  <div className="mt-5 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] border-y border-neutral-800">
                    <div className="min-w-0 border-r border-neutral-800">
                      <div className="border-b border-neutral-800 px-3 py-3 text-center">
                        <span className="text-xs text-neutral-400">主力资金</span>
                        <strong className={cn("mt-1 block text-lg font-semibold tabular-nums", terminalToneClass(fundBreakdown.main))}>
                          {formatAmount(fundBreakdown.main, true)}
                        </strong>
                      </div>
                      <div className="h-60 w-full" role="img" aria-label={`${data.security.name}主力资金，由明盘和暗盘组成`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={fundBreakdown.mainBars} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                            <YAxis hide domain={fundBreakdown.chartDomain} />
                            <ReferenceLine y={0} stroke="#71717a" />
                            <Tooltip
                              contentStyle={terminalTooltipStyle}
                              formatter={(value) => [formatAmount(Number(value), true), "净额"]}
                            />
                            <Bar dataKey="amount" maxBarSize={52} isAnimationActive={false}>
                              {fundBreakdown.mainBars.map((item) => (
                                <Cell key={item.name} fill={item.amount >= 0 ? "#f43f5e" : "#22c55e"} />
                              ))}
                              <LabelList
                                dataKey="amount"
                                position="top"
                                fill="#a3a3a3"
                                fontSize={10}
                                formatter={(value: number) => formatAmount(value, true)}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="border-b border-neutral-800 px-2 py-3 text-center">
                        <span className="text-xs text-neutral-400">散户资金</span>
                        <strong className={cn("mt-1 block text-lg font-semibold tabular-nums", terminalToneClass(fundBreakdown.retail))}>
                          {formatAmount(fundBreakdown.retail, true)}
                        </strong>
                      </div>
                      <div className="h-60 w-full" role="img" aria-label={`${data.security.name}散户资金`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={fundBreakdown.retailBars} margin={{ top: 18, right: 2, bottom: 0, left: 2 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                            <YAxis hide domain={fundBreakdown.chartDomain} />
                            <ReferenceLine y={0} stroke="#71717a" />
                            <Tooltip
                              contentStyle={terminalTooltipStyle}
                              formatter={(value) => [formatAmount(Number(value), true), "净额"]}
                            />
                            <Bar dataKey="amount" maxBarSize={52} isAnimationActive={false}>
                              {fundBreakdown.retailBars.map((item) => (
                                <Cell key={item.name} fill={item.amount >= 0 ? "#f43f5e" : "#22c55e"} />
                              ))}
                              <LabelList
                                dataKey="amount"
                                position="top"
                                fill="#a3a3a3"
                                fontSize={10}
                                formatter={(value: number) => formatAmount(value, true)}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs leading-5 text-muted-foreground">
            当日明暗盘使用东方财富 darktrade 模型字段，主力资金等于明盘与暗盘之和，散户按主力净额反向口径展示；历史曲线与 G/S 暂沿用公开资金代理，并非同花顺专有 L2 模型，不构成投资建议。
          </p>
        </>
      )}
    </div>
  );
}
