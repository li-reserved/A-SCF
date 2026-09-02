"use client";

import { Activity, ArrowRight, Cpu, Search, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketData } from "@/hooks/use-market-data";
import { formatAmount, formatDateTime, formatNumber, formatPercent, toneClass } from "@/lib/market-format";
import type { LeaderSegment, SegmentLeadersData } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { DataState, MetricCard, PageHeading, SegmentedControl } from "./market-ui";

type LeaderFilter = "all" | "up" | "down";
type LeaderSort = "change" | "average" | "flow";

export function LeadersDashboard() {
  const { data, error, loading, refreshing, reload } = useMarketData<SegmentLeadersData>("/api/fund-flow/segment-leaders");
  const [filter, setFilter] = useState<LeaderFilter>("all");
  const [sort, setSort] = useState<LeaderSort>("change");
  const [query, setQuery] = useState("");
  const segments = useMemo(() => (data?.segments ?? [])
    .filter((segment) => {
      const change = segment.leader?.changePct ?? 0;
      if (filter === "up" && change <= 0) return false;
      if (filter === "down" && change >= 0) return false;
      return !query || segment.name.includes(query)
        || segment.stocks.some((stock) => stock.name.includes(query) || stock.code.includes(query));
    })
    .sort((a, b) => {
      if (sort === "average") return (b.averageChangePct ?? 0) - (a.averageChangePct ?? 0);
      if (sort === "flow") return (b.netMainFlow ?? 0) - (a.netMainFlow ?? 0);
      return (b.leader?.changePct ?? 0) - (a.leader?.changePct ?? 0);
    }), [data, filter, query, sort]);
  const upSegments = data?.segments.filter((segment) => (segment.leader?.changePct ?? 0) > 0).length ?? 0;
  const downSegments = data?.segments.filter((segment) => (segment.leader?.changePct ?? 0) < 0).length ?? 0;
  const netFlow = data?.segments.reduce((sum, segment) => sum + (segment.netMainFlow ?? 0), 0) ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageHeading
        eyebrow="SEGMENT LEADERS"
        title="细分龙头"
        description="按细分赛道展示主龙头与备选股实时表现，点击个股可进入站内研判页。"
        meta={data ? `${data.tradeDate} · ${data.source} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
      />

      <DataState loading={loading} error={error} empty={Boolean(data && !data.segments.length)} onRetry={reload} />

      {data && data.segments.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="细分赛道" value={`${data.segmentCount} 个`} detail={`${data.quotedCount}/${data.stockCount} 只行情可用`} icon={<Cpu className="h-4 w-4" />} tone="primary" />
            <MetricCard label="龙头上涨" value={`${upSegments} 个`} detail="主龙头当日收红" icon={<TrendingUp className="h-4 w-4" />} tone="positive" />
            <MetricCard label="龙头下跌" value={`${downSegments} 个`} detail="主龙头当日下跌" icon={<TrendingDown className="h-4 w-4" />} tone="negative" />
            <MetricCard label="赛道主力净额" value={formatAmount(netFlow, true)} detail="已返回赛道合计" icon={<Activity className="h-4 w-4" />} tone={netFlow >= 0 ? "positive" : "negative"} />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索赛道、股票或代码" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl value={filter} options={[{ value: "all", label: "全部" }, { value: "up", label: "上涨" }, { value: "down", label: "下跌" }]} onChange={setFilter} label="龙头涨跌" />
              <select value={sort} onChange={(event) => setSort(event.target.value as LeaderSort)} className="h-9 rounded-md border bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring" aria-label="赛道排序">
                <option value="change">龙头涨幅</option>
                <option value="average">赛道均涨</option>
                <option value="flow">主力净额</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {segments.map((segment: LeaderSegment) => (
              <Card key={segment.key}>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{segment.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{segment.positiveCount} 涨 / {segment.negativeCount} 跌 · {segment.quotedCount}/{segment.stockCount} 只可用</p>
                  </div>
                  <div className="text-right">
                    <strong className={cn("text-sm", toneClass(segment.averageChangePct))}>{formatPercent(segment.averageChangePct)}</strong>
                    <p className={cn("mt-1 text-xs", toneClass(segment.netMainFlow))}>{formatAmount(segment.netMainFlow, true)}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {segment.stocks.slice(0, 5).map((stock, index) => (
                    <Link key={stock.code} href={`/security?code=${stock.code}`} className="group grid grid-cols-[22px_minmax(0,1fr)_auto_auto_14px] items-center gap-2 border-t py-2.5 text-xs first:border-t-0 hover:text-primary">
                      <span className={cn("text-muted-foreground", index === 0 && "font-semibold text-primary")}>{index + 1}</span>
                      <span className="truncate"><strong>{stock.name}</strong> <span className="text-muted-foreground">{stock.code}</span></span>
                      <span className="tabular-nums">{formatNumber(stock.latest)}</span>
                      <span className={cn("w-14 text-right tabular-nums", toneClass(stock.changePct))}>{formatPercent(stock.changePct)}</span>
                      <ArrowRight className="h-3.5 w-3.5 justify-self-end opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          {!segments.length && <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的细分赛道</p>}
        </>
      )}
    </div>
  );
}
