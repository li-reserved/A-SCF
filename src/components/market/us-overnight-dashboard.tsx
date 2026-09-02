"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleMinus,
  Clock3,
  LoaderCircle,
  MoonStar,
  Radio,
  RotateCw,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketData } from "@/hooks/use-market-data";
import { formatDateTime, formatNumber, formatPercent, toneClass } from "@/lib/market-format";
import type { UsMarketData, UsMarketIndex, UsMarketQuote, UsMarketTheme, UsMarketTrendData } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { chartTooltipStyle, DataState, PageHeading, SegmentedControl } from "./market-ui";

type ChartView = "all" | "spy" | "qqq" | "dia" | "iwm";
type ThemeGroup = "all" | UsMarketTheme["group"];
type ChartRow = { time: number; phase: string } & Record<string, number | string>;

const chartOptions: Array<{ value: ChartView; label: string }> = [
  { value: "all", label: "全市场" },
  { value: "spy", label: "标普" },
  { value: "qqq", label: "纳指" },
  { value: "dia", label: "道指" },
  { value: "iwm", label: "小盘" },
];

const groupOptions: Array<{ value: ThemeGroup; label: string }> = [
  { value: "all", label: "全部" },
  { value: "technology", label: "科技" },
  { value: "industry", label: "制造" },
  { value: "resources", label: "资源" },
  { value: "defensive", label: "稳健" },
];

const groupOrder: UsMarketTheme["group"][] = ["technology", "industry", "resources", "defensive"];
const chartColors: Record<UsMarketIndex["key"], string> = {
  spy: "#4f46b8",
  qqq: "#e11d48",
  dia: "#0891b2",
  iwm: "#d97706",
};

function formatBeijingTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function buildChartRows(indexes: UsMarketIndex[]): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  indexes.forEach((index) => {
    index.points.forEach((point) => {
      const row = rows.get(point.time) ?? { time: point.time, phase: point.phase };
      if (point.changePct !== null) row[index.key] = point.changePct;
      rows.set(point.time, row);
    });
  });
  return [...rows.values()].sort((left, right) => left.time - right.time);
}

function directionIcon(value: number | null, className = "h-4 w-4") {
  if (value === null || value === 0) return <CircleMinus className={className} />;
  return value > 0 ? <ArrowUpRight className={className} /> : <ArrowDownRight className={className} />;
}

function changeSurface(value: number | null, selected: boolean): string {
  if (selected) return "border-primary/50 bg-primary/5 ring-1 ring-inset ring-primary/15";
  if (value === null || Math.abs(value) < 0.15) return "hover:bg-muted/45";
  if (value > 1) return "bg-rose-50/70 hover:bg-rose-50 dark:bg-rose-950/20 dark:hover:bg-rose-950/30";
  if (value > 0) return "bg-rose-50/35 hover:bg-rose-50/70 dark:bg-rose-950/10 dark:hover:bg-rose-950/20";
  if (value < -1) return "bg-emerald-50/70 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30";
  return "bg-emerald-50/35 hover:bg-emerald-50/70 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20";
}

function quoteActiveChange(changePct: number | null, extendedChangePct: number | null, phase: UsMarketData["session"]["phase"]): number | null {
  return phase === "regular" ? changePct : extendedChangePct;
}

function alignTrendWithActiveQuote(
  data: UsMarketTrendData,
  stock: UsMarketQuote,
  phase: UsMarketData["session"]["phase"],
) {
  const usesRegularQuote = phase === "regular";
  const currentPrice = usesRegularQuote ? stock.latest : stock.extendedLatest;
  const currentChange = usesRegularQuote ? stock.change : stock.extendedChange;
  const currentChangePct = quoteActiveChange(stock.changePct, stock.extendedChangePct, phase);

  if (currentPrice === null || currentChangePct === null) {
    return { previousClose: data.previousClose, points: data.points };
  }

  const previousClose = currentChange !== null
    ? currentPrice - currentChange
    : currentChangePct !== -100
      ? currentPrice / (1 + currentChangePct / 100)
      : data.previousClose;
  if (!Number.isFinite(previousClose) || previousClose === 0) {
    return { previousClose: data.previousClose, points: data.points };
  }

  const points = data.points.map(point => ({
    ...point,
    changePct: (point.value / previousClose - 1) * 100,
  }));
  const lastPoint = points.at(-1);
  if (lastPoint) {
    points[points.length - 1] = {
      ...lastPoint,
      value: currentPrice,
      changePct: currentChangePct,
    };
  }

  return { previousClose, points };
}

function activeTrendLabels(phase: UsMarketData["session"]["phase"], fallback: string) {
  if (phase === "overnight") return { session: "夜盘走势", baseline: "最近常规盘收盘" };
  if (phase === "pre-market") return { session: "盘前走势", baseline: "最近常规盘收盘" };
  if (phase === "regular") return { session: "常规盘走势", baseline: "上一常规盘收盘" };
  if (phase === "after-hours") return { session: "盘后走势", baseline: "最近常规盘收盘" };
  return { session: fallback, baseline: "最近常规盘收盘" };
}

function IndexStrip({ indexes }: { indexes: UsMarketIndex[] }) {
  return (
    <section className="grid overflow-hidden rounded-lg border bg-card shadow-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="美股主要指数">
      {indexes.map((index, itemIndex) => (
        <article
          key={index.key}
          className={cn(
            "min-w-0 p-4",
            itemIndex > 0 && "border-t sm:border-t-0",
            itemIndex % 2 === 1 && "sm:border-l",
            itemIndex > 1 && "sm:border-t xl:border-t-0",
            itemIndex > 0 && "xl:border-l",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{index.name}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <strong className="truncate text-xl font-semibold tabular-nums">{formatNumber(index.latest)}</strong>
                <span className="text-[11px] font-medium text-muted-foreground">{index.symbol}</span>
              </div>
            </div>
            <span className={cn("flex items-center gap-1 text-sm font-semibold tabular-nums", toneClass(index.changePct))}>
              {directionIcon(index.changePct)}
              {formatPercent(index.changePct)}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
            <span className="text-muted-foreground">{index.extendedLabel}</span>
            <span className={cn("font-medium tabular-nums", toneClass(index.extendedChangePct))}>
              {formatPercent(index.extendedChangePct)}
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}

function ImportantStocks({ data }: { data: UsMarketData }) {
  return (
    <Card className="min-w-0 overflow-hidden shadow-sm" aria-label="重点美股行情">
      <CardHeader className="border-b">
        <CardTitle>重点个股</CardTitle>
        <p className="text-xs text-muted-foreground">英伟达、微软、苹果等高关注公司</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-px bg-border p-0 sm:grid-cols-3 lg:grid-cols-5">
        {data.importantStocks.map(stock => {
          const activeChangePct = quoteActiveChange(stock.changePct, stock.extendedChangePct, data.session.phase);
          return (
            <article
              key={stock.symbol}
              className={cn("flex h-[136px] min-w-0 flex-col justify-between bg-card p-3.5 transition-colors", changeSurface(activeChangePct, false))}
              title={stock.name}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-baseline gap-2">
                  <strong className="truncate text-sm font-semibold">{stock.nameZh}</strong>
                  <span className="flex-shrink-0 text-[10px] font-medium text-muted-foreground">{stock.symbol}</span>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums">${formatNumber(stock.latest)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t pt-2.5 text-xs">
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">正股</p>
                  <p className={cn("mt-0.5 truncate font-semibold tabular-nums", toneClass(stock.changePct))}>
                    {formatPercent(stock.changePct)}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="truncate text-[10px] text-muted-foreground">{stock.extendedLabel}</p>
                  <p className={cn("mt-0.5 truncate font-semibold tabular-nums", toneClass(stock.extendedChangePct))}>
                    {formatPercent(stock.extendedChangePct)}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SessionBand({ data }: { data: UsMarketData }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm" aria-label="美股交易时段">
      <div className="flex flex-col gap-4 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn(
            "grid h-9 w-9 flex-shrink-0 place-items-center rounded-md",
            data.session.phase === "regular" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "bg-primary/10 text-primary",
          )}>
            {data.session.phase === "closed" || data.session.phase === "overnight" ? <MoonStar className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <strong className="text-sm font-semibold">{data.session.label}</strong>
              {data.session.phase !== "closed" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{data.session.detail}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          纽约 {data.session.newYorkTime}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {data.session.schedule.map((stage, index) => (
          <div
            key={stage.key}
            className={cn(
              "relative min-w-0 px-4 py-3",
              index % 2 === 1 && "border-l",
              index > 1 && "border-t md:border-t-0",
              index > 0 && "md:border-l",
              stage.active && "bg-primary/5",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-xs font-medium", stage.active ? "text-primary" : "text-foreground")}>{stage.label}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", stage.active ? "bg-primary" : stage.passed ? "bg-foreground/40" : "bg-border")} />
            </div>
            <p className="mt-1.5 truncate text-xs tabular-nums text-muted-foreground">北京时间 {stage.beijingTime}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/75">纽约 {stage.etTime}</p>
            {stage.active && data.session.progress > 0 && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/15">
                <span className="block h-full bg-primary" style={{ width: `${data.session.progress * 100}%` }} />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function MarketDirectionChart({ data }: { data: UsMarketData }) {
  const [view, setView] = useState<ChartView>("all");
  const chartRows = useMemo(() => buildChartRows(data.indexes), [data.indexes]);
  const visibleIndexes = view === "all" ? data.indexes : data.indexes.filter(index => index.key === view);
  const regularOpen = chartRows.find(row => row.phase === "regular")?.time;
  const afterHoursOpen = chartRows.find(row => row.phase === "after-hours")?.time;
  const firstTime = chartRows[0]?.time;
  const lastTime = chartRows.at(-1)?.time;

  return (
    <Card className="min-w-0 overflow-hidden shadow-sm">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b">
        <div>
          <CardTitle>美股全时段方向</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">相对上一常规盘收盘价 · 北京时间</p>
        </div>
        <SegmentedControl value={view} options={chartOptions} onChange={setView} label="指数范围" />
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        {chartRows.length ? (
          <div className="h-[330px] w-full min-w-0" role="img" aria-label="美股主要指数盘前、常规盘与盘后涨跌走势">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                {firstTime && regularOpen && (
                  <ReferenceArea x1={firstTime} x2={regularOpen} fill="#d97706" fillOpacity={0.045} />
                )}
                {afterHoursOpen && lastTime && (
                  <ReferenceArea x1={afterHoursOpen} x2={lastTime} fill="#0891b2" fillOpacity={0.045} />
                )}
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  minTickGap={44}
                  tickFormatter={(value) => formatBeijingTime(Number(value)).slice(6)}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <YAxis
                  width={46}
                  tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                {regularOpen && (
                  <ReferenceLine x={regularOpen} stroke="hsl(var(--border))" label={{ value: "开盘", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                )}
                {afterHoursOpen && (
                  <ReferenceLine x={afterHoursOpen} stroke="hsl(var(--border))" label={{ value: "盘后", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                )}
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelFormatter={(value) => `北京时间 ${formatBeijingTime(Number(value))}`}
                  formatter={(value, name) => [formatPercent(Number(value)), name]}
                />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                {visibleIndexes.map(index => (
                  <Line
                    key={index.key}
                    type="monotone"
                    dataKey={index.key}
                    name={index.name}
                    stroke={chartColors[index.key]}
                    strokeWidth={view === "all" ? 1.7 : 2.3}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid h-[330px] place-items-center text-center">
            <div>
              <ChartNoAxesCombined className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">指数分时暂不可用</p>
              <p className="mt-1 text-xs text-muted-foreground">{data.chartStatus.detail}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StockTrendPanel({
  stock,
  phase,
  onClose,
}: {
  stock: UsMarketQuote;
  phase: UsMarketData["session"]["phase"];
  onClose: () => void;
}) {
  const { data, error, loading, refreshing, reload } = useMarketData<UsMarketTrendData>(
    `/api/us-market/trend?symbol=${encodeURIComponent(stock.symbol)}`,
    30_000,
  );
  const alignedTrend = useMemo(
    () => data ? alignTrendWithActiveQuote(data, stock, phase) : null,
    [data, phase, stock],
  );
  const trendLabels = activeTrendLabels(phase, data?.sessionLabel ?? "当前交易时段走势");
  const points = alignedTrend?.points ?? [];
  const regularOpen = points.find(point => point.phase === "regular")?.time;
  const afterHoursOpen = points.find(point => point.phase === "after-hours")?.time;
  const firstTime = points[0]?.time;
  const lastTime = points.at(-1)?.time;
  const lastChangePct = points.at(-1)?.changePct ?? null;
  const lineColor = lastChangePct === null || lastChangePct === 0 ? "#4f46b8" : lastChangePct > 0 ? "#e11d48" : "#059669";

  return (
    <div id="theme-member-trend" className="border-x border-b bg-muted/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <strong className="text-xs font-semibold">{stock.symbol} · {stock.nameZh}</strong>
            {refreshing && <LoaderCircle className="h-3 w-3 animate-spin text-muted-foreground" aria-label="正在更新走势" />}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {data && alignedTrend ? `${trendLabels.session} · 相对${trendLabels.baseline} $${formatNumber(alignedTrend.previousClose)} · ${data.marketDate}` : "当前交易时段 · 北京时间"}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="-mr-1 -mt-1 h-7 w-7"
          onClick={onClose}
          aria-label={`关闭 ${stock.symbol} 走势`}
          title="关闭走势"
        >
          <X />
        </Button>
      </div>

      {loading ? (
        <div className="grid h-[176px] place-items-center" aria-label={`正在加载 ${stock.symbol} 走势`}>
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="grid h-[176px] place-items-center px-3 text-center">
          <div>
            <p className="text-xs font-medium">走势暂不可用</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{error}</p>
            <Button type="button" size="sm" variant="outline" className="mt-3 h-8 text-xs" onClick={reload}>
              <RotateCw />
              重试
            </Button>
          </div>
        </div>
      ) : data && points.length ? (
        <div className="mt-2 h-[176px] w-full min-w-0" role="img" aria-label={`${stock.symbol} ${trendLabels.session}，最新 ${formatPercent(lastChangePct)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              {firstTime && regularOpen && <ReferenceArea x1={firstTime} x2={regularOpen} fill="#d97706" fillOpacity={0.045} />}
              {afterHoursOpen && lastTime && <ReferenceArea x1={afterHoursOpen} x2={lastTime} fill="#0891b2" fillOpacity={0.045} />}
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                minTickGap={42}
                tickFormatter={(value) => formatBeijingTime(Number(value)).slice(6)}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
              />
              <YAxis
                width={42}
                domain={["auto", "auto"]}
                tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
              />
              <ReferenceLine y={0} ifOverflow="extendDomain" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelFormatter={(value) => `北京时间 ${formatBeijingTime(Number(value))}`}
                formatter={(value) => [formatPercent(Number(value)), `${stock.symbol} 涨跌`]}
              />
              <Line
                type="monotone"
                dataKey="changePct"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : data ? (
        <div className="grid h-[176px] place-items-center text-center">
          <div>
            <ChartNoAxesCombined className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-xs font-medium">当前夜盘暂无成交</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThemeBoard({ data }: { data: UsMarketData }) {
  const [group, setGroup] = useState<ThemeGroup>("all");
  const [selectedKey, setSelectedKey] = useState("ai-compute");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const selectedTheme = data.themes.find(theme => theme.key === selectedKey) ?? data.themes[0];
  const selectedStock = selectedSymbol
    ? selectedTheme.members.find(member => member.symbol === selectedSymbol) ?? null
    : null;
  const visibleGroups = groupOrder
    .map(groupKey => ({
      key: groupKey,
      label: data.themes.find(theme => theme.group === groupKey)?.groupLabel ?? "",
      themes: data.themes.filter(theme => theme.group === groupKey && (group === "all" || theme.group === group)),
    }))
    .filter(item => item.themes.length > 0);
  const themeByKey = new Map(data.themes.map(theme => [theme.key, theme]));
  const extendedColumnLabel = data.indexes[0].extendedLabel;
  const breadthCount = data.breadth.advancing + data.breadth.declining + data.breadth.flat;

  return (
    <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-w-0 overflow-hidden shadow-sm">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b">
          <div>
            <CardTitle>重点主题</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">正股与{extendedColumnLabel}分列 · 主题按代理标的等权</p>
          </div>
          <SegmentedControl value={group} options={groupOptions} onChange={setGroup} label="主题分类" />
        </CardHeader>
        <CardContent className="p-0">
          {visibleGroups.map((item, groupIndex) => (
            <div key={item.key} className={cn(groupIndex > 0 && "border-t")}>
              <div className="grid grid-cols-[minmax(0,1fr)_62px_62px] items-center gap-2 bg-muted/35 px-4 py-2 text-[11px] font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_76px_76px]">
                <span>{item.label}</span>
                <span className="text-right">正股</span>
                <span className="text-right">{extendedColumnLabel}</span>
              </div>
              <div className="grid sm:grid-cols-2">
                {item.themes.map((theme, index) => (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={() => {
                      setSelectedKey(theme.key);
                      setSelectedSymbol(null);
                    }}
                    className={cn(
                      "group grid h-[76px] min-w-0 grid-cols-[minmax(0,1fr)_62px_62px] items-center gap-2 border-t px-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_76px_76px]",
                      index % 2 === 1 && "sm:border-l",
                      changeSurface(theme.activeChangePct, selectedTheme.key === theme.key),
                    )}
                    aria-pressed={selectedTheme.key === theme.key}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {theme.name}
                        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">{theme.proxyLabel}</span>
                    </span>
                    <span className={cn("text-right text-xs font-semibold tabular-nums", toneClass(theme.changePct))}>
                      {formatPercent(theme.changePct)}
                    </span>
                    <span className={cn("text-right text-xs font-semibold tabular-nums", toneClass(theme.extendedChangePct))}>
                      {formatPercent(theme.extendedChangePct)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="h-fit overflow-hidden shadow-sm">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>主题温度</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{data.session.phase === "regular" ? "常规盘" : extendedColumnLabel}口径</p>
            </div>
            <strong className={cn("text-xl font-semibold tabular-nums", toneClass(data.breadth.averageChangePct))}>
              {formatPercent(data.breadth.averageChangePct)}
            </strong>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`上涨 ${data.breadth.advancing}，下跌 ${data.breadth.declining}`}>
            <span className="bg-rose-500" style={{ width: breadthCount ? `${(data.breadth.advancing / breadthCount) * 100}%` : "0%" }} />
            <span className="bg-emerald-500" style={{ width: breadthCount ? `${(data.breadth.declining / breadthCount) * 100}%` : "0%" }} />
          </div>
          <div className="mt-3 grid grid-cols-3 text-center">
            <div>
              <strong className="block text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{data.breadth.advancing}</strong>
              <span className="text-[11px] text-muted-foreground">上涨</span>
            </div>
            <div className="border-x">
              <strong className="block text-lg font-semibold tabular-nums">{data.breadth.flat}</strong>
              <span className="text-[11px] text-muted-foreground">持平</span>
            </div>
            <div>
              <strong className="block text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{data.breadth.declining}</strong>
              <span className="text-[11px] text-muted-foreground">下跌</span>
            </div>
          </div>

          <div className="mt-5 border-t pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedTheme.name}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">等权代理 · {selectedTheme.proxyLabel}</p>
              </div>
              <span className={cn("flex flex-shrink-0 items-center gap-1 text-sm font-semibold tabular-nums", toneClass(selectedTheme.activeChangePct))}>
                {directionIcon(selectedTheme.activeChangePct)}
                {formatPercent(selectedTheme.activeChangePct)}
              </span>
            </div>
            <div className="mt-4 divide-y border-y">
              {selectedTheme.members.map(member => {
                const active = selectedSymbol === member.symbol;
                return (
                  <button
                    key={member.symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(member.symbol)}
                    className={cn(
                      "group grid w-full grid-cols-[52px_minmax(0,1fr)_64px] items-center gap-2 py-2.5 text-left text-xs transition-colors hover:bg-muted/45 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      active && "bg-primary/5",
                    )}
                    aria-expanded={active}
                    aria-controls={active ? "theme-member-trend" : undefined}
                  >
                    <strong>{member.symbol}</strong>
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground" title={member.name}>
                      <span className="truncate">{member.nameZh}</span>
                      <ChartNoAxesCombined className={cn("h-3.5 w-3.5 flex-shrink-0 transition-opacity", active ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-70")} />
                    </span>
                    <span className={cn("text-right font-medium tabular-nums", toneClass(quoteActiveChange(member.changePct, member.extendedChangePct, data.session.phase)))}>
                      {formatPercent(quoteActiveChange(member.changePct, member.extendedChangePct, data.session.phase))}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedStock && <StockTrendPanel stock={selectedStock} phase={data.session.phase} onClose={() => setSelectedSymbol(null)} />}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t pt-5">
            <div>
              <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">领涨</p>
              <div className="mt-2 space-y-2">
                {data.breadth.strongest.map(key => {
                  const theme = themeByKey.get(key);
                  return theme ? (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{theme.name}</span>
                      <span className="flex-shrink-0 tabular-nums text-rose-600 dark:text-rose-400">{formatPercent(theme.activeChangePct)}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">领跌</p>
              <div className="mt-2 space-y-2">
                {data.breadth.weakest.map(key => {
                  const theme = themeByKey.get(key);
                  return theme ? (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{theme.name}</span>
                      <span className="flex-shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">{formatPercent(theme.activeChangePct)}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function UsOvernightDashboard() {
  const { data, error, loading, refreshing, reload } = useMarketData<UsMarketData>("/api/us-market/overview", 30_000);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <PageHeading
        eyebrow="US OVERNIGHT"
        title="美股夜盘"
        description="夜盘、盘前、常规盘与盘后同一时间轴 · 四大指数、重点个股与热门主题"
        meta={data ? `${data.source} · ${data.marketDate} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={data ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium shadow-sm">
            <span className={cn("h-1.5 w-1.5 rounded-full", data.session.phase === "closed" ? "bg-muted-foreground" : "animate-pulse bg-rose-500")} />
            {data.session.label}
          </span>
        ) : undefined}
      />

      <DataState loading={loading} error={error} onRetry={reload} />

      {data && !loading && (
        <>
          <SessionBand data={data} />
          <IndexStrip indexes={data.indexes} />
          <ImportantStocks data={data} />
          <MarketDirectionChart data={data} />
          <ThemeBoard data={data} />
          <p className="text-xs leading-5 text-muted-foreground">{data.note}</p>
        </>
      )}
    </div>
  );
}
