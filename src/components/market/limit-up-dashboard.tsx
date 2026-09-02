"use client";

import {
  AlertCircle,
  ArrowUpRight,
  ChartNoAxesCombined,
  Clock3,
  Flame,
  Layers3,
  LoaderCircle,
  RotateCw,
  Search,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarketData } from "@/hooks/use-market-data";
import { formatAmount, formatDateTime, formatNumber, formatPercent, toneClass } from "@/lib/market-format";
import type { LimitUpData, LimitUpStock, LimitUpTrendData, LimitUpTrendPoint } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { chartTooltipStyle, DataState, MetricCard, PageHeading, SegmentedControl } from "./market-ui";

type StockFilter = "all" | "auction";
type TrendMode = "auction" | "intraday";

function stockKey(stock: LimitUpStock): string {
  return `${stock.market}.${stock.code}`;
}

function shortTime(value: string): string {
  return value.slice(0, 5);
}

function TrendTooltip({ active, payload, mode }: TooltipProps<number, string> & { mode: TrendMode }) {
  const point = payload?.[0]?.payload as LimitUpTrendPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="font-medium">{point.time}</p>
      <div className="mt-2 flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{mode === "auction" ? "竞价涨跌" : "盘中涨跌"}</span>
        <strong className={toneClass(point.value)}>{formatPercent(point.value)}</strong>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{mode === "auction" ? "匹配价格" : "成交价格"}</span>
        <strong>{formatNumber(point.price, 3)} 元</strong>
      </div>
    </div>
  );
}

function StockTrendPanel({ stock }: { stock: LimitUpStock }) {
  const [mode, setMode] = useState<TrendMode>("auction");
  const endpoint = mode === "auction" ? "limit-up-auction" : "limit-up-intraday";
  const path = `/api/fund-flow/${endpoint}?code=${encodeURIComponent(stock.code)}&market=${stock.market}`;
  const { data, error, loading, reload } = useMarketData<LimitUpTrendData>(path, 8000);
  const latest = data?.points.at(-1);
  const high = data?.points.length ? Math.max(...data.points.map((point) => point.value)) : null;
  const low = data?.points.length ? Math.min(...data.points.map((point) => point.value)) : null;
  const chartColor = (latest?.value ?? 0) >= 0 ? "#e11d48" : "#059669";
  const showLimitLine = mode === "intraday" || (high !== null && high >= stock.changePct - 0.25);
  const modeLabel = mode === "auction" ? "集合竞价" : "盘中";

  return (
    <Card className="min-h-[390px] overflow-hidden">
      <CardHeader className="gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{mode === "auction" ? "集合竞价过程" : "盘中走势"}</CardTitle>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {stock.name} {stock.code} · {stock.category}
          </p>
        </div>
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <SegmentedControl
            value={mode}
            options={[{ value: "auction", label: "集合竞价" }, { value: "intraday", label: "盘中走势" }]}
            onChange={setMode}
            label="股票走势阶段"
          />
          <div className="min-w-16 flex-shrink-0 text-right">
            <strong className={cn("block text-lg tabular-nums", toneClass(latest?.value))}>
              {formatPercent(latest?.value)}
            </strong>
            <span className="text-xs text-muted-foreground">{formatNumber(latest?.price, 3)} 元</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="grid h-[286px] place-items-center text-center">
            <div>
              <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">正在同步{modeLabel}轨迹</p>
            </div>
          </div>
        ) : error ? (
          <div className="grid h-[286px] place-items-center text-center">
            <div>
              <AlertCircle className="mx-auto h-5 w-5 text-rose-500" />
              <p className="mt-2 max-w-sm text-xs text-muted-foreground">{error}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={reload}>
                <RotateCw />
                重新加载
              </Button>
            </div>
          </div>
        ) : data?.points.length ? (
          <>
            <dl className="mb-3 grid grid-cols-3 divide-x border-y py-2 text-center text-xs">
              <div>
                <dt className="text-muted-foreground">{mode === "auction" ? "竞价收盘" : "盘中最新"}</dt>
                <dd className={cn("mt-1 font-semibold tabular-nums", toneClass(latest?.value))}>{formatPercent(latest?.value)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">区间最高</dt>
                <dd className={cn("mt-1 font-semibold tabular-nums", toneClass(high))}>{formatPercent(high)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">区间最低</dt>
                <dd className={cn("mt-1 font-semibold tabular-nums", toneClass(low))}>{formatPercent(low)}</dd>
              </div>
            </dl>
            <div className="h-[235px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.points} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                    domain={[(value: number) => Math.floor(value - 0.5), (value: number) => Math.ceil(value + 0.5)]}
                  />
                  <Tooltip content={<TrendTooltip mode={mode} />} contentStyle={chartTooltipStyle} />
                  {showLimitLine && (
                    <ReferenceLine
                      y={stock.changePct}
                      stroke="#e11d48"
                      strokeDasharray="4 4"
                      label={{ value: "涨停线", position: "insideTopRight", fill: "#e11d48", fontSize: 10 }}
                    />
                  )}
                  <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} fill={chartColor} fillOpacity={0.08} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="grid h-[286px] place-items-center text-center">
            <div>
              <Clock3 className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">{modeLabel}轨迹暂未返回</p>
              <p className="mt-1 text-xs text-muted-foreground">数据覆盖当日 {mode === "auction" ? "09:15–09:25" : "09:30–15:00"}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LimitUpDashboard() {
  const { data, error, loading, refreshing, reload } = useMarketData<LimitUpData>("/api/fund-flow/limit-up", 8000);
  const [filter, setFilter] = useState<StockFilter>("all");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    if (!data?.stocks.length) return;
    if (data.stocks.some((stock) => stockKey(stock) === selectedKey)) return;
    const defaultStock = data.stocks.find((stock) => stock.isAuctionLimitUp) ?? data.stocks[0];
    setSelectedKey(stockKey(defaultStock));
  }, [data, selectedKey]);

  const visibleStocks = useMemo(() => {
    const target = query.trim().toLocaleLowerCase("zh-CN");
    return (data?.stocks ?? []).filter((stock) => {
      if (filter === "auction" && !stock.isAuctionLimitUp) return false;
      if (category && stock.category !== category) return false;
      if (!target) return true;
      return stock.name.toLocaleLowerCase("zh-CN").includes(target)
        || stock.code.includes(target)
        || stock.category.toLocaleLowerCase("zh-CN").includes(target);
    });
  }, [category, data, filter, query]);

  const selectedStock = data?.stocks.find((stock) => stockKey(stock) === selectedKey) ?? null;
  const maxCategoryCount = data?.categories[0]?.count ?? 1;
  const winnerText = !data?.summary.leadingCategories.length
    ? "--"
    : data.summary.leadingCategories.length === 1
      ? data.summary.leadingCategories[0]
      : `${data.summary.leadingCategories[0]}等${data.summary.leadingCategories.length}个`;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageHeading
        eyebrow="LIMIT-UP MONITOR"
        title="涨停监控"
        description="实时汇总当日涨停股票、行业归属与集合竞价轨迹，行业排名按当前涨停数量统计。"
        meta={data ? `${data.tradeDate} · ${data.source} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
      />

      <DataState
        loading={loading}
        error={error}
        empty={Boolean(data && !data.stocks.length)}
        onRetry={reload}
        emptyTitle="当前还没有涨停股票"
        emptyDescription="集合竞价与盘中涨停会随数据源更新显示。"
      />

      {data && data.stocks.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="当前涨停" value={`${data.summary.limitUpCount} 只`} detail={`${data.summary.openedCount} 只盘中曾开板`} icon={<Flame className="h-4 w-4" />} tone="positive" />
            <MetricCard label="竞价封板" value={`${data.summary.auctionCount} 只`} detail="09:25 前首次封板" icon={<Clock3 className="h-4 w-4" />} tone="primary" />
            <MetricCard label="行业覆盖" value={`${data.summary.categoryCount} 个`} detail="东方财富行业口径" icon={<Layers3 className="h-4 w-4" />} />
            <MetricCard label="涨停最多" value={winnerText} detail={`${data.summary.topCategoryCount} 只${data.summary.leadingCategories.length > 1 ? " · 并列最多" : ""}`} icon={<Trophy className="h-4 w-4" />} tone="primary" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)]">
            <Card className="min-h-[390px] overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle>行业涨停排行</CardTitle>
                <p className="text-xs text-muted-foreground">当前涨停数 · 竞价封板数 · 最高连板</p>
              </CardHeader>
              <CardContent className="max-h-[323px] overflow-y-auto px-2 py-2">
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !category && "bg-muted text-foreground",
                  )}
                  onClick={() => setCategory("")}
                  aria-pressed={!category}
                >
                  <span>全部行业</span>
                  <span className="tabular-nums text-muted-foreground">{data.summary.limitUpCount} 只</span>
                </button>
                <div className="mt-1 space-y-0.5">
                  {data.categories.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={cn(
                        "group relative grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        category === item.name && "bg-primary/10",
                      )}
                      onClick={() => setCategory(category === item.name ? "" : item.name)}
                      aria-pressed={category === item.name}
                    >
                      <span className="absolute inset-y-1 left-0 bg-rose-500/10" style={{ width: `${Math.max(4, item.count / maxCategoryCount * 100)}%` }} />
                      <span className="relative min-w-0">
                        <span className="flex items-center gap-1.5">
                          <strong className="truncate text-xs">{item.name}</strong>
                          {item.isLeader && <span className="rounded-sm bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">最多</span>}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">竞价 {item.auctionCount} · 最高 {item.maxStreak} 板</span>
                      </span>
                      <span className="relative text-right">
                        <strong className="block text-sm tabular-nums text-rose-600 dark:text-rose-400">{item.count}</strong>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{formatPercent(item.sharePct, false)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {selectedStock && <StockTrendPanel stock={selectedStock} />}
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="gap-3 border-b lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>涨停股票明细</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{category || "全部行业"} · {visibleStocks.length} 只</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索股票、代码或行业"
                    className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <SegmentedControl
                  value={filter}
                  options={[{ value: "all", label: "全部" }, { value: "auction", label: "竞价封板" }]}
                  onChange={setFilter}
                  label="涨停阶段"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 [&>div]:max-h-[70dvh]">
              <Table className="min-w-[1040px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[190px]">股票</TableHead>
                    <TableHead>行业分类</TableHead>
                    <TableHead className="text-right">现价 / 涨幅</TableHead>
                    <TableHead className="text-right">首次封板</TableHead>
                    <TableHead className="text-right">最后封板</TableHead>
                    <TableHead className="text-right">连板</TableHead>
                    <TableHead className="text-right">开板</TableHead>
                    <TableHead className="text-right">封单额</TableHead>
                    <TableHead className="w-12"><span className="sr-only">个股研判</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStocks.map((stock) => {
                    const key = stockKey(stock);
                    return (
                      <TableRow key={key} className={cn(selectedKey === key && "bg-primary/[0.045] hover:bg-primary/[0.07]")}>
                        <TableCell>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setSelectedKey(key)}
                            aria-pressed={selectedKey === key}
                          >
                            <span className={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-muted text-muted-foreground", selectedKey === key && "bg-primary/10 text-primary")}>
                              <ChartNoAxesCombined className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <strong className="block truncate text-sm">{stock.name}</strong>
                              <span className="block text-[11px] tabular-nums text-muted-foreground">{stock.code}</span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <button type="button" className="text-xs font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setCategory(stock.category)}>
                            {stock.category}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <strong className="block text-sm tabular-nums">{formatNumber(stock.price, 3)}</strong>
                          <span className={cn("text-xs tabular-nums", toneClass(stock.changePct))}>{formatPercent(stock.changePct)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="block text-xs tabular-nums">{shortTime(stock.firstSealTime)}</span>
                          {stock.isAuctionLimitUp && <span className="mt-1 inline-block rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">竞价</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{shortTime(stock.lastSealTime)}</TableCell>
                        <TableCell className="text-right">
                          <strong className={cn("block text-xs", stock.streak > 1 && "text-rose-600 dark:text-rose-400")}>{stock.streak > 1 ? `${stock.streak} 连板` : "首板"}</strong>
                          <span className="text-[10px] text-muted-foreground">{stock.statisticCount}/{stock.statisticDays} 日</span>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{stock.breakCount} 次</TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">{formatAmount(stock.sealAmount)}</TableCell>
                        <TableCell>
                          <Link href={`/security?code=${stock.code}`} title={`${stock.name}个股研判`} aria-label={`打开${stock.name}个股研判`} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <ArrowUpRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!visibleStocks.length && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={9} className="h-28 text-center text-sm text-muted-foreground">没有匹配的涨停股票</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
