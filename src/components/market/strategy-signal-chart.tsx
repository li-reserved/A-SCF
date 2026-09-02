"use client";

import { CandlestickChart, LoaderCircle, Radio, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
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
import type { TooltipProps } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketData } from "@/hooks/use-market-data";
import { useStrategyLiveQuote } from "@/hooks/use-strategy-live-quote";
import { formatDate, formatNumber, formatPercent, toneClass } from "@/lib/market-format";
import type { AutoStrategyAction, AutoStrategyData, AutoStrategyPlan, SecurityData, StrategyLiveQuote } from "@/lib/market-types";
import { cn } from "@/lib/utils";

interface TrackedStock {
  code: string;
  name: string;
  state: string;
}

type IntradayPoint = SecurityData["intraday"][number];

interface SignalChartPoint extends IntradayPoint {
  planBuy: number | null;
  planSell: number | null;
  actualBuy: number | null;
  actualSell: number | null;
  livePrice: number | null;
  planBuyLabel: string;
  planSellLabel: string;
  actualBuyLabel: string;
  actualSellLabel: string;
}

function shanghaiTime(value: string, withSeconds = false): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function shanghaiDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function mergeLiveSnapshots(
  points: SecurityData["intraday"],
  snapshots: StrategyLiveQuote[],
  tradeDate: string,
): SecurityData["intraday"] {
  const rows = new Map(points.map(point => [`${point.date}-${point.time}`, point]));
  snapshots
    .filter(snapshot => snapshot.tradeDate === tradeDate)
    .filter(snapshot => ["auction", "trading"].includes(snapshot.session.session))
    .forEach(snapshot => {
    const time = shanghaiTime(snapshot.quote.updatedAt, true);
    const cumulativeAverage = snapshot.quote.amount !== null
      && snapshot.quote.volume !== null
      && snapshot.quote.volume > 0
      ? snapshot.quote.amount / (snapshot.quote.volume * 100)
      : null;
    rows.set(`${tradeDate}-${time}`, {
      date: tradeDate,
      time,
      price: snapshot.quote.latest,
      value: snapshot.quote.changePct,
      open: snapshot.quote.open,
      high: snapshot.quote.high,
      low: snapshot.quote.low,
      volume: null,
      amount: null,
      average: cumulativeAverage,
    });
  });
  return [...rows.values()].sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`));
}

function nearestPricePoint(rows: SignalChartPoint[], price: number): SignalChartPoint | undefined {
  return rows.reduce<SignalChartPoint | undefined>((nearest, point) => {
    if (!nearest) return point;
    return Math.abs(point.price - price) < Math.abs(nearest.price - price) ? point : nearest;
  }, undefined);
}

function buildChartRows(
  points: SecurityData["intraday"],
  actions: AutoStrategyAction[],
  plan: AutoStrategyPlan | undefined,
  tradeDate: string,
): SignalChartPoint[] {
  const rows: SignalChartPoint[] = points.map((point) => ({
    ...point,
    planBuy: null,
    planSell: null,
    actualBuy: null,
    actualSell: null,
    livePrice: null,
    planBuyLabel: "",
    planSellLabel: "",
    actualBuyLabel: "",
    actualSellLabel: "",
  }));
  if (!rows.length) return rows;

  actions.filter((action) => action.date === tradeDate).forEach((action) => {
    const point = action.side === "buy" ? rows[0] : nearestPricePoint(rows, action.price);
    if (!point) return;
    if (action.side === "buy") {
      point.actualBuy = action.price;
      point.actualBuyLabel = "B";
    } else {
      point.actualSell = action.price;
      point.actualSellLabel = "S";
    }
  });

  if (plan) {
    const point = rows.at(-1);
    if (point && plan.side === "buy") {
      point.planBuy = plan.referencePrice;
      point.planBuyLabel = "B";
    }
    if (point && plan.side === "sell") {
      point.planSell = plan.referencePrice;
      point.planSellLabel = "S";
    }
  }
  const latestPoint = rows.at(-1);
  if (latestPoint) latestPoint.livePrice = latestPoint.price;
  return rows;
}

function SignalTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = payload?.[0]?.payload as SignalChartPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="min-w-44 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="font-medium">{point.date} {point.time}</p>
      <dl className="mt-2 space-y-1.5">
        <div className="flex justify-between gap-5"><dt className="text-muted-foreground">价格</dt><dd>{formatNumber(point.price)}</dd></div>
        {point.average !== null && <div className="flex justify-between gap-5"><dt className="text-muted-foreground">均价</dt><dd>{formatNumber(point.average)}</dd></div>}
        {point.planBuy !== null && <div className="flex justify-between gap-5 text-rose-600 dark:text-rose-400"><dt>计划 B</dt><dd>{formatNumber(point.planBuy)}</dd></div>}
        {point.planSell !== null && <div className="flex justify-between gap-5 text-emerald-600 dark:text-emerald-400"><dt>计划 S</dt><dd>{formatNumber(point.planSell)}</dd></div>}
        {point.actualBuy !== null && <div className="flex justify-between gap-5 text-rose-600 dark:text-rose-400"><dt>成交 B</dt><dd>{formatNumber(point.actualBuy)}</dd></div>}
        {point.actualSell !== null && <div className="flex justify-between gap-5 text-emerald-600 dark:text-emerald-400"><dt>成交 S</dt><dd>{formatNumber(point.actualSell)}</dd></div>}
      </dl>
    </div>
  );
}

function LiveSignalContent({ stock, strategy }: { stock: TrackedStock; strategy: AutoStrategyData }) {
  const { data, error, loading, refreshing, reload } = useMarketData<SecurityData>(
    `/api/security/advice?code=${encodeURIComponent(stock.code)}`,
    20_000,
  );
  const live = useStrategyLiveQuote(stock.code);
  const plan = useMemo(
    () => strategy.plans.find((item) => item.code === stock.code),
    [stock.code, strategy.plans],
  );
  const actions = useMemo(
    () => strategy.todayActions.filter((item) => item.code === stock.code),
    [stock.code, strategy.todayActions],
  );
  const chartRows = useMemo(() => {
    if (!data) return [];
    const intraday = mergeLiveSnapshots(data.intraday, live.snapshots, data.tradeDate);
    return buildChartRows(intraday, actions, plan, data.tradeDate);
  }, [actions, data, live.snapshots, plan]);
  const latestTechnicalSignal = data?.tradeSignals.intraday.at(-1);

  if (loading && !data) {
    return (
      <div className="grid h-[390px] place-items-center text-center">
        <div><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">正在同步分时行情</p></div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="grid h-[390px] place-items-center text-center">
        <div><p className="text-sm font-medium">分时行情暂不可用</p><p className="mt-1 text-xs text-muted-foreground">{error}</p><Button className="mt-4" size="sm" variant="outline" onClick={reload}><RotateCw />重试</Button></div>
      </div>
    );
  }
  if (!data) return null;

  const effectiveQuote = live.latest?.tradeDate === data.tradeDate ? live.latest.quote : data.quote;
  const effectiveSession = live.latest?.tradeDate === data.tradeDate ? live.latest.session : data.session;
  const realtimeSession = ["auction", "trading"].includes(effectiveSession.session);
  const connectionText = live.connection === "open"
    ? realtimeSession ? "SSE 实时 · 约 2 秒" : "SSE 已连接 · 非交易时段"
    : live.connection === "reconnecting" ? "实时连接重试中" : "正在连接实时行情";

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 border-b p-4 sm:p-5 xl:border-b-0 xl:border-r">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{data.security.name}</h3>
              <span className="text-xs text-muted-foreground">{data.security.code}</span>
              <span className={cn("rounded border px-2 py-0.5 text-xs", plan?.side === "buy" ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400" : plan?.side === "sell" ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>{plan ? plan.side === "buy" ? "计划买入" : "计划卖出" : stock.state}</span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{data.tradeDate}</span><span>·</span>
              <span className="inline-flex items-center gap-1.5" title={live.error || undefined}>
                <span className={cn("h-1.5 w-1.5 rounded-full", live.connection === "open" ? "bg-emerald-500" : live.connection === "reconnecting" ? "bg-amber-500" : "bg-muted-foreground")} />
                {connectionText}
              </span>
              {refreshing && <span>· 技术信号同步中</span>}
            </p>
          </div>
          <div className="text-right">
            <strong className={cn("block text-xl font-semibold tabular-nums", toneClass(effectiveQuote.changePct))}>{formatNumber(effectiveQuote.latest)}</strong>
            <span className={cn("text-xs tabular-nums", toneClass(effectiveQuote.changePct))}>{formatPercent(effectiveQuote.changePct)}</span>
          </div>
        </div>

        {chartRows.length ? (
          <div className="mt-4 h-[360px] w-full min-w-0 sm:h-[400px]" role="img" aria-label={`${data.security.name}实时分时走势与策略买卖点`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="time" minTickGap={42} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis width={50} domain={["auto", "auto"]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<SignalTooltip />} />
                {plan && <ReferenceLine y={plan.referencePrice} stroke={plan.side === "buy" ? "#e11d48" : "#059669"} strokeDasharray="5 4" label={{ value: `计划${plan.side === "buy" ? "B" : "S"} ${formatNumber(plan.referencePrice)}`, position: "insideTopRight", fontSize: 10, fill: plan.side === "buy" ? "#e11d48" : "#059669" }} />}
                <Line type="monotone" dataKey="price" name="分时价" stroke="#4f46b8" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="average" name="均价" stroke="#d97706" strokeWidth={1.3} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
                <Scatter dataKey="livePrice" name="最新价" fill="#4f46b8" stroke="hsl(var(--background))" strokeWidth={2} isAnimationActive={false} />
                <Scatter dataKey="planBuy" name="计划买点" fill="hsl(var(--background))" stroke="#e11d48" strokeWidth={2} isAnimationActive={false}><LabelList dataKey="planBuyLabel" position="top" fill="#e11d48" fontSize={12} fontWeight={700} /></Scatter>
                <Scatter dataKey="planSell" name="计划卖点" fill="hsl(var(--background))" stroke="#059669" strokeWidth={2} isAnimationActive={false}><LabelList dataKey="planSellLabel" position="bottom" fill="#059669" fontSize={12} fontWeight={700} /></Scatter>
                <Scatter dataKey="actualBuy" name="成交买点" fill="#e11d48" isAnimationActive={false}><LabelList dataKey="actualBuyLabel" position="top" fill="#e11d48" fontSize={12} fontWeight={700} /></Scatter>
                <Scatter dataKey="actualSell" name="成交卖点" fill="#059669" isAnimationActive={false}><LabelList dataKey="actualSellLabel" position="bottom" fill="#059669" fontSize={12} fontWeight={700} /></Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="mt-4 grid h-[360px] place-items-center text-sm text-muted-foreground sm:h-[400px]">当前交易日暂无分时数据</div>}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#4f46b8]" />分时价</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-[#d97706]" />均价</span>
          <span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full border-2 border-rose-600 text-[9px] font-bold text-rose-600">B</span>空心为计划</span>
          <span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-rose-600 text-[9px] font-bold text-white">B</span>实心为成交</span>
        </div>
      </section>

      <aside className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">行情更新时间</span>
          <span className="text-xs tabular-nums">{shanghaiDateTime(effectiveQuote.updatedAt)}</span>
        </div>

        <section className="mt-4 border-t pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">策略计划</h3>
          {plan ? (
            <div className="mt-3">
              <span className={cn("text-xs font-medium", plan.side === "buy" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>{plan.side === "buy" ? "计划买入参考价" : "计划卖出参考价"}</span>
              <strong className="mt-1 block text-2xl font-semibold tabular-nums">¥{formatNumber(plan.referencePrice)}</strong>
              <p className="mt-1 text-sm font-medium tabular-nums">{plan.side === "buy" ? "预计买入" : "计划卖出"} {plan.shares.toLocaleString("zh-CN")} 股</p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">当前实时价 ¥{formatNumber(effectiveQuote.latest)}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{strategy.status === "scheduled" ? `${formatDate(strategy.startDate)} 开盘按实际价格模拟成交` : "下一交易日开盘按实际价格模拟成交"}</p>
              <p className="text-xs leading-5 text-muted-foreground">{plan.reason}</p>
            </div>
          ) : <p className="mt-3 text-sm text-muted-foreground">当前没有待执行计划</p>}
        </section>

        <section className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between"><h3 className="text-xs font-medium text-muted-foreground">今日策略成交</h3><span className="text-xs text-muted-foreground">{actions.length} 笔</span></div>
          {actions.length ? actions.map((action) => (
            <div key={`${action.date}-${action.side}-${action.code}`} className="mt-3 flex items-start justify-between gap-3">
              <span className={cn("grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-white", action.side === "buy" ? "bg-rose-600" : "bg-emerald-600")}>{action.side === "buy" ? "B" : "S"}</span>
              <span className="min-w-0 flex-1 text-xs"><span className="block font-medium">{action.side === "buy" ? "买入" : "卖出"} {formatNumber(action.price)}</span><span className="mt-0.5 block truncate text-muted-foreground">{action.reason}</span></span>
              <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">{action.shares} 股</span>
            </div>
          )) : <p className="mt-3 text-sm text-muted-foreground">今日尚无策略成交</p>}
        </section>

        <section className="mt-4 border-t pt-4">
          <div className="flex items-center gap-2"><h3 className="text-xs font-medium text-muted-foreground">辅助分时信号</h3><Radio className={cn("h-3.5 w-3.5 text-primary", realtimeSession && "animate-pulse")} /></div>
          {latestTechnicalSignal ? (
            <div className="mt-3">
              <div className="flex items-center gap-2"><span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white", latestTechnicalSignal.type === "B" ? "bg-rose-600" : "bg-emerald-600")}>{latestTechnicalSignal.type}</span><strong className="text-sm">{latestTechnicalSignal.label}</strong><span className="ml-auto text-xs tabular-nums text-muted-foreground">{latestTechnicalSignal.time} · {formatNumber(latestTechnicalSignal.price)}</span></div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{latestTechnicalSignal.reason}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">仅用于观察，不直接触发本策略成交</p>
            </div>
          ) : <p className="mt-3 text-sm text-muted-foreground">当前没有已确认的分时技术信号</p>}
        </section>
      </aside>
    </div>
  );
}

export function StrategySignalChart({ strategy }: { strategy: AutoStrategyData }) {
  const trackedStocks = useMemo(() => {
    const rows: TrackedStock[] = [];
    const seen = new Set<string>();
    const add = (code: string, name: string, state: string) => {
      if (seen.has(code)) return;
      seen.add(code);
      rows.push({ code, name, state });
    };
    strategy.plans.forEach((plan) => add(plan.code, plan.name, plan.side === "buy" ? "计划买入" : "计划卖出"));
    strategy.positions.forEach((position) => add(position.code, position.name, "持仓"));
    strategy.candidates.forEach((candidate) => add(candidate.code, candidate.name, "候选"));
    return rows.slice(0, 10);
  }, [strategy.candidates, strategy.plans, strategy.positions]);
  const [selectedCode, setSelectedCode] = useState("");

  useEffect(() => {
    if (!trackedStocks.some((stock) => stock.code === selectedCode)) {
      setSelectedCode(trackedStocks[0]?.code ?? "");
    }
  }, [selectedCode, trackedStocks]);

  const selectedStock = trackedStocks.find((stock) => stock.code === selectedCode);
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b">
        <div>
          <div className="flex items-center gap-2"><CandlestickChart className="h-4 w-4 text-primary" /><CardTitle>实时分时与 B/S 点</CardTitle></div>
          <p className="mt-1 text-xs text-muted-foreground">策略计划、实际模拟成交与最新分时价格</p>
        </div>
        {trackedStocks.length > 0 && (
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm shadow-sm">
            <span className="sr-only">选择查看股票</span>
            <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)} className="max-w-52 bg-transparent text-sm outline-none">
              {trackedStocks.map((stock) => <option key={stock.code} value={stock.code}>{stock.name} · {stock.state}</option>)}
            </select>
          </label>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {selectedStock ? <LiveSignalContent key={selectedStock.code} stock={selectedStock} strategy={strategy} /> : <div className="grid h-56 place-items-center text-sm text-muted-foreground">当前没有可跟踪的策略股票</div>}
      </CardContent>
    </Card>
  );
}
