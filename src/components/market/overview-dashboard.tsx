"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChartNoAxesCombined,
  Gauge,
  ListFilter,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Customized,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

import { FocusGroupControl } from "@/components/market/focus-group-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFocusGroups } from "@/hooks/use-focus-groups";
import { useMarketData } from "@/hooks/use-market-data";
import { formatAmount, formatDate, formatDateTime, formatNumber, formatPercent, shanghaiToday, toneClass } from "@/lib/market-format";
import type { AllAMedianSnapshot, FlowSeries, OverviewData } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { chartTooltipStyle, DataState, DateControl, MetricCard, PageHeading, SegmentedControl } from "./market-ui";

type OverviewMode = "overview" | "intraday" | "multi" | "sectors";
type IntradayMetric = "fund" | "change";
type SectorFilter = "all" | "inflow" | "outflow";
type ChartRow = Record<string, string | number>;
type ChartScale = (value: string | number) => number;

interface SeriesEndLabelsProps {
  series: FlowSeries[];
  chartData: ChartRow[];
  metric: IntradayMetric;
  hoveredSeriesId: string | null;
  onHover: (seriesId: string | null) => void;
  xAxisMap?: Record<string, { scale?: ChartScale }>;
  yAxisMap?: Record<string, { scale?: ChartScale }>;
  offset?: { top?: number; height?: number };
}

const chartColors = [
  "#4f46b8", "#059669", "#e11d48", "#d97706", "#0891b2", "#7c3aed", "#475569", "#ea580c",
  "#2563eb", "#16a34a", "#db2777", "#ca8a04", "#0d9488", "#9333ea", "#64748b", "#dc2626",
  "#0284c7", "#65a30d", "#f43f5e", "#c2410c", "#0f766e", "#a855f7", "#334155", "#f59e0b",
  "#1d4ed8", "#15803d", "#be123c", "#a16207", "#0369a1", "#6d28d9", "#52525b", "#b91c1c",
];

function chartColor(index: number): string {
  return chartColors[index % chartColors.length];
}

const tradingTimes = Array.from({ length: 241 }, (_, minute) => {
  const totalMinutes = minute <= 120 ? 9 * 60 + 30 + minute : 13 * 60 + minute - 120;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

const tradingTicks = ["09:30", "10:30", "11:30", "14:00", "15:00"];

const intradayViewCopy: Record<IntradayMetric, { label: string; title: string; detail: string }> = {
  fund: { label: "资金", title: "板块资金净流入", detail: "公开资金流净额口径" },
  change: { label: "涨跌", title: "板块分时涨跌", detail: "板块涨跌幅" },
};

const pageCopy: Record<OverviewMode, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "MARKET OVERVIEW",
    title: "资金总览",
    description: "市场成交、宽基指数与重点板块资金在同一交易日口径下展示。",
  },
  intraday: {
    eyebrow: "INTRADAY FLOW",
    title: "分时走势",
    description: "观察重点板块的日内资金流向与涨跌变化。",
  },
  multi: {
    eyebrow: "MULTI CHART",
    title: "多图同屏",
    description: "将资金变化最明显的板块拆分展示，避免多曲线重叠影响判读。",
  },
  sectors: {
    eyebrow: "SECTOR RANKING",
    title: "板块排行",
    description: "按主力净额排序重点行业与概念，同时对照板块涨跌。",
  },
};

function mergeSeries(series: FlowSeries[], metric: IntradayMetric, endTime: string): ChartRow[] {
  const rows = tradingTimes.map<ChartRow>((time) => ({ time }));
  const rowsByTime = new Map(rows.map((row) => [String(row.time), row]));
  series.forEach((item) => {
    const points = metric === "fund" ? item.points : item.pricePoints;
    points.forEach((point) => {
      const row = rowsByTime.get(point.time);
      if (row) row[item.id] = point.value;
    });
    const endRow = rowsByTime.get(endTime);
    if (endRow) endRow[item.id] = metric === "fund" ? item.latest : item.changePct;
  });
  return rows;
}

function SeriesEndLabels({
  series,
  chartData,
  metric,
  hoveredSeriesId,
  onHover,
  xAxisMap,
  yAxisMap,
  offset,
}: SeriesEndLabelsProps) {
  const xScale = Object.values(xAxisMap ?? {})[0]?.scale;
  const yScale = Object.values(yAxisMap ?? {})[0]?.scale;
  const top = (offset?.top ?? 0) + 5;
  const bottom = top + (offset?.height ?? 0) - 10;
  if (!xScale || !yScale || bottom <= top) return null;

  const labels = series.flatMap((item, seriesIndex) => {
    for (let index = chartData.length - 1; index >= 0; index -= 1) {
      const row = chartData[index];
      const value = row[item.id];
      if (typeof value !== "number") continue;
      const valueText = metric === "fund" ? formatAmount(value, true) : formatPercent(value);
      const shortName = item.name.length > 4 ? `${item.name.slice(0, 4)}...` : item.name;
      const text = `${shortName} ${valueText}`;
      return [{
        id: item.id,
        fullName: item.name,
        text,
        valueText,
        hitWidth: Array.from(text).reduce((width, character) => width + (character.charCodeAt(0) > 255 ? 9 : 5.2), 0),
        color: chartColor(seriesIndex),
        x: xScale(row.time),
        targetY: yScale(value),
        y: yScale(value),
      }];
    }
    return [];
  }).filter((label) => Number.isFinite(label.x) && Number.isFinite(label.targetY));

  labels.sort((a, b) => a.targetY - b.targetY);
  const spacing = 11;
  labels.forEach((label, index) => {
    const previousY = index ? labels[index - 1].y : top - spacing;
    label.y = Math.max(top, label.targetY, previousY + spacing);
  });
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const nextY = index === labels.length - 1 ? bottom + spacing : labels[index + 1].y;
    labels[index].y = Math.min(labels[index].y, bottom, nextY - spacing);
  }

  return (
    <g>
      {labels.map((label) => (
        <g
          key={label.id}
          role="graphics-symbol"
          tabIndex={0}
          aria-label={`${label.fullName} ${label.valueText}`}
          opacity={hoveredSeriesId && hoveredSeriesId !== label.id ? 0.24 : 1}
          cursor="help"
          onMouseEnter={() => onHover(label.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(label.id)}
          onBlur={() => onHover(null)}
        >
          <title>{`${label.fullName} ${label.valueText}`}</title>
          <rect x={label.x + 4} y={label.y - 5.5} width={label.hitWidth + 6} height={11} fill="transparent" />
          <circle cx={label.x} cy={label.targetY} r={1.8} fill={label.color} />
          <text
            x={label.x + 7}
            y={label.y}
            dominantBaseline="central"
            fill={label.color}
            fontSize={9}
            fontWeight={600}
            stroke="hsl(var(--background))"
            strokeWidth={2.5}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {label.text}
          </text>
        </g>
      ))}
    </g>
  );
}

function orderedSeries(data: OverviewData): FlowSeries[] {
  return [...data.series].sort((a, b) => Math.abs(b.latest) - Math.abs(a.latest));
}

type AllAYearPoint = NonNullable<AllAMedianSnapshot["yearPoints"]>[number];

function AllAYearTooltip({
  active,
  payload,
  yearStartPoint,
}: TooltipProps<number, string> & { yearStartPoint: number }) {
  const point = payload?.[0]?.payload as AllAYearPoint | undefined;
  if (!active || !point) return null;
  const yearToDatePct = (point.latest / yearStartPoint - 1) * 100;

  return (
    <div className="min-w-44 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="font-medium">{formatDate(point.date)}</p>
      <dl className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-5">
          <dt className="text-muted-foreground">指数点位</dt>
          <dd className="font-medium tabular-nums">{formatNumber(point.latest)} 点</dd>
        </div>
        <div className="flex items-center justify-between gap-5">
          <dt className="text-muted-foreground">当日涨跌</dt>
          <dd className={cn("font-medium tabular-nums", toneClass(point.changePct))}>{formatPercent(point.changePct)}</dd>
        </div>
        <div className="flex items-center justify-between gap-5">
          <dt className="text-muted-foreground">年内涨跌</dt>
          <dd className={cn("font-medium tabular-nums", toneClass(yearToDatePct))}>{formatPercent(yearToDatePct)}</dd>
        </div>
      </dl>
    </div>
  );
}

function AllAYearChart({
  median,
  yearPoints,
  onClose,
}: {
  median: AllAMedianSnapshot;
  yearPoints: NonNullable<AllAMedianSnapshot["yearPoints"]>;
  onClose: () => void;
}) {
  const chartColor = median.yearToDatePct >= 0 ? "#e11d48" : "#059669";

  return (
    <Card id="all-a-year-chart" className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>全A中位指数 · 年内走势</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(median.yearStartDate)} 至 {formatDate(median.tradeDate)} · {yearPoints.length} 个交易日
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-xs text-muted-foreground">最新点位</span>
            <strong className="mt-1 block text-sm tabular-nums">{formatNumber(median.latest)}</strong>
          </div>
          <div className="text-right">
            <span className="block text-xs text-muted-foreground">年内涨跌</span>
            <strong className={cn("mt-1 block text-sm tabular-nums", toneClass(median.yearToDatePct))}>{formatPercent(median.yearToDatePct)}</strong>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="收起全A年内走势" title="收起年内走势">
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full min-w-0 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={yearPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={36} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => String(value).slice(5)} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={50} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<AllAYearTooltip yearStartPoint={median.yearStartPoint} />} />
              <ReferenceLine y={median.yearStartPoint} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "年初", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Area type="monotone" dataKey="latest" name="指数点位" stroke={chartColor} fill={chartColor} fillOpacity={0.1} strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewContent({ data }: { data: OverviewData }) {
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);
  const [allAYearOpen, setAllAYearOpen] = useState(false);
  const series = useMemo(() => orderedSeries(data), [data]);
  const chartData = useMemo(() => mergeSeries(series, "fund", data.timeline.endLabel), [data.timeline.endLabel, series]);
  const marketSummary = data.marketSummary;
  const policyFlow = marketSummary?.policyFlow;
  const median = marketSummary?.allAMedian;
  const allAYearPoints = median?.yearPoints ?? [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          className="order-1"
          label="全A中位涨跌"
          value={formatPercent(median?.changePct)}
          detail={median ? `880009 · ${formatNumber(median.latest)} 点 · 年内 ${formatPercent(median.yearToDatePct)}` : "等待全 A 体感数据"}
          icon={<Gauge className="h-4 w-4" />}
          tone={median ? (median.changePct >= 0 ? "positive" : "negative") : "default"}
          onClick={allAYearPoints.length ? () => setAllAYearOpen((open) => !open) : undefined}
          expanded={allAYearOpen}
          controls="all-a-year-chart"
        />
        {allAYearOpen && median && allAYearPoints.length ? (
          <div className="order-2 col-span-full sm:order-5">
            <AllAYearChart median={median} yearPoints={allAYearPoints} onClose={() => setAllAYearOpen(false)} />
          </div>
        ) : null}
        <MetricCard
          className="order-3 sm:order-2"
          label="A股成交额"
          value={formatAmount(marketSummary?.turnoverAmount)}
          detail={marketSummary ? `${formatNumber(marketSummary.turnoverVolume)} 亿股` : "等待市场汇总"}
          icon={<Banknote className="h-4 w-4" />}
          tone="primary"
        />
        <MetricCard
          className="order-4 sm:order-3"
          label="护盘资金观察"
          value={formatAmount(policyFlow?.net, true)}
          detail={policyFlow ? `${policyFlow.positiveCount} 只净流入 · ${policyFlow.negativeCount} 只净流出` : "等待宽基 ETF 资金"}
          icon={<ShieldCheck className="h-4 w-4" />}
          tone={policyFlow ? (policyFlow.net >= 0 ? "positive" : "negative") : "default"}
        />
        <MetricCard
          className="order-5 sm:order-4"
          label="个股涨跌家数"
          value={median ? `${formatNumber(median.upCount, 0)} / ${formatNumber(median.downCount, 0)}` : "-- / --"}
          detail={median ? `上涨 / 下跌 · 样本 ${formatNumber(median.sampleCount, 0)} 只` : "等待全 A 样本"}
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>重点板块资金轨迹</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">展示全部 {series.length} 个已选板块 · 按当日净额绝对值排序</p>
            </div>
            <span className="text-xs text-muted-foreground">截至 {data.timeline.endLabel}</span>
          </CardHeader>
          <CardContent>
            <div className="h-[430px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 104, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="time" ticks={tradingTicks} interval={0} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} width={54} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${value}亿`} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                  {series.map((item, index) => (
                    <Line
                      key={item.id}
                      type="monotone"
                      dataKey={item.id}
                      name={item.name}
                      stroke={chartColor(index)}
                      strokeWidth={hoveredSeriesId === item.id ? 2.8 : 1.8}
                      strokeOpacity={hoveredSeriesId && hoveredSeriesId !== item.id ? 0.16 : 1}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      cursor="help"
                      onMouseEnter={() => setHoveredSeriesId(item.id)}
                      onMouseLeave={() => setHoveredSeriesId(null)}
                    />
                  ))}
                  <Customized component={(
                    <SeriesEndLabels
                      series={series}
                      chartData={chartData}
                      metric="fund"
                      hoveredSeriesId={hoveredSeriesId}
                      onHover={setHoveredSeriesId}
                    />
                  )} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>资金雷达</CardTitle>
            <p className="text-xs text-muted-foreground">净流入与净流出前 8 名</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <RankingList title="净流入" items={data.leaders.inflowTop.slice(0, 8)} positive />
            <div className="border-t" />
            <RankingList title="净流出" items={data.leaders.outflowTop.slice(0, 8)} />
          </CardContent>
        </Card>
      </div>

      <div className={cn("grid gap-4", marketSummary?.indexes.length ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.65fr)]" : "grid-cols-1")}>
        {marketSummary?.indexes.length ? <Card>
          <CardHeader>
            <CardTitle>指数位置</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {marketSummary.indexes.map((item) => (
              <div key={item.key} className="rounded-md border bg-muted/25 p-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{item.name}</span>
                  <span className={toneClass(item.changePct)}>{formatPercent(item.changePct)}</span>
                </div>
                <strong className="mt-2 block text-lg">{formatNumber(item.latest)}</strong>
                <p className="mt-1 text-xs text-muted-foreground">撑 {formatNumber(item.support)} · 压 {formatNumber(item.pressure)}</p>
              </div>
            ))}
          </CardContent>
        </Card> : null}

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>大单结构</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.breakdown.slice(0, 6)} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} width={45} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => formatAmount(Number(value), true)} />
                  <Bar dataKey="superLarge" name="超大单" stackId="orders" fill="#4f46b8" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="large" name="大单" stackId="orders" fill="#0891b2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function RankingList({ title, items, positive = false }: { title: string; items: FlowSeries[]; positive?: boolean }) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between text-xs font-medium">
        <span>{title}</span>
        <Icon className={cn("h-4 w-4", positive ? "text-rose-500" : "text-emerald-500")} />
      </div>
      <div className="space-y-2.5">
        {items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{index + 1}</span>
            <span className="truncate font-medium">{item.name}</span>
            <span className={toneClass(item.latest)}>{formatAmount(item.latest, true)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function IntradayContent({ data }: { data: OverviewData }) {
  const [view, setView] = useState<IntradayMetric>("fund");
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);
  const series = useMemo(() => orderedSeries(data), [data]);
  const chartData = useMemo(
    () => mergeSeries(series, view, data.timeline.endLabel),
    [data.timeline.endLabel, series, view],
  );
  const viewCopy = intradayViewCopy[view];

  return (
    <>
      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{viewCopy.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{data.tradeDate} · 截至 {data.timeline.endLabel} · {viewCopy.detail}</p>
          </div>
          <SegmentedControl
            value={view}
            options={(Object.entries(intradayViewCopy) as Array<[IntradayMetric, (typeof intradayViewCopy)[IntradayMetric]]>).map(([value, item]) => ({ value, label: item.label }))}
            onChange={setView}
            label="观察维度"
          />
        </CardHeader>
        <CardContent>
          <div className="h-[520px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 104, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" ticks={tradingTicks} interval={0} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={58}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => view === "fund" ? `${value}亿` : `${value}%`}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                {series.map((item, index) => (
                  <Line
                    key={item.id}
                    dataKey={item.id}
                    name={item.name}
                    type="monotone"
                    stroke={chartColor(index)}
                    strokeWidth={hoveredSeriesId === item.id ? 2.8 : 1.8}
                    strokeOpacity={hoveredSeriesId && hoveredSeriesId !== item.id ? 0.16 : 1}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                    cursor="help"
                    onMouseEnter={() => setHoveredSeriesId(item.id)}
                    onMouseLeave={() => setHoveredSeriesId(null)}
                  />
                ))}
                <Customized component={(
                  <SeriesEndLabels
                    series={series}
                    chartData={chartData}
                    metric={view}
                    hoveredSeriesId={hoveredSeriesId}
                    onHover={setHoveredSeriesId}
                  />
                )} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>板块</TableHead>
                <TableHead className="text-right">资金净额</TableHead>
                <TableHead className="text-right">板块涨跌</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", toneClass(item.latest))}>{formatAmount(item.latest, true)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", toneClass(item.changePct))}>{formatPercent(item.changePct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function MultiChartContent({ data }: { data: OverviewData }) {
  const series = orderedSeries(data);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {series.map((item, index) => (
        <Card key={item.id} className="min-w-0">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{item.name}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{item.sourceCategory === "industry" ? "行业" : "概念"} · {item.sourceCode}</p>
            </div>
            <div className="text-right">
              <strong className={cn("text-sm", toneClass(item.latest))}>{formatAmount(item.latest, true)}</strong>
              <p className={cn("mt-1 text-xs", toneClass(item.changePct))}>{formatPercent(item.changePct)}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={item.points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={56} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} width={48} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => formatAmount(Number(value), true)} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                  <Area type="monotone" dataKey="value" name="主力净额" stroke={chartColor(index)} fill={chartColor(index)} fillOpacity={0.1} strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SectorContent({ data }: { data: OverviewData }) {
  const [filter, setFilter] = useState<SectorFilter>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => orderedSeries(data).filter((item) => {
    if (filter === "inflow" && item.latest <= 0) return false;
    if (filter === "outflow" && item.latest >= 0) return false;
    return !query || item.name.toLocaleLowerCase("zh-CN").includes(query.toLocaleLowerCase("zh-CN"));
  }), [data, filter, query]);
  const maxAbs = Math.max(1, ...rows.map((item) => Math.abs(item.latest)));

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索板块"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <SegmentedControl
          value={filter}
          options={[{ value: "all", label: "全部" }, { value: "inflow", label: "净流入" }, { value: "outflow", label: "净流出" }]}
          onChange={setFilter}
          label="资金方向"
        />
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">排名</TableHead>
              <TableHead>板块</TableHead>
              <TableHead className="hidden md:table-cell">资金强度</TableHead>
              <TableHead className="text-right">主力净额</TableHead>
              <TableHead className="text-right">涨跌</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <strong className="block font-medium">{item.name}</strong>
                  <span className="text-xs text-muted-foreground">{item.sourceCategory === "industry" ? "行业" : "概念"}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", item.latest >= 0 ? "bg-rose-500" : "bg-emerald-500")}
                      style={{ width: `${Math.max(3, Math.abs(item.latest) / maxAbs * 100)}%` }}
                    />
                  </div>
                </TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", toneClass(item.latest))}>{formatAmount(item.latest, true)}</TableCell>
                <TableCell className={cn("text-right tabular-nums", toneClass(item.changePct))}>{formatPercent(item.changePct)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的板块</p>}
      </CardContent>
    </Card>
  );
}

export function OverviewDashboard({ mode }: { mode: OverviewMode }) {
  const [date, setDate] = useState(shanghaiToday);
  const [focusControlOpen, setFocusControlOpen] = useState(false);
  const focusGroups = useFocusGroups();
  const overviewPath = useMemo(() => {
    const params = new URLSearchParams(focusGroups.requestQuery);
    params.set("date", date);
    return `/api/fund-flow/overview?${params.toString()}`;
  }, [date, focusGroups.requestQuery]);
  const { data, error, loading, refreshing, reload } = useMarketData<OverviewData>(overviewPath, 8000);
  const selectedFocusNames = focusGroups.selectedNames.length
    ? focusGroups.selectedNames
    : focusGroups.defaultNames.length
      ? focusGroups.defaultNames
      : data?.series.map((item) => item.name) ?? [];
  const focusCandidates = data?.focusCandidates.length ? data.focusCandidates : focusGroups.candidates;
  const copy = pageCopy[mode];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageHeading
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        meta={data ? `${data.sourceStatus.text} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={(
          <>
            <Button
              type="button"
              size="sm"
              variant={focusControlOpen ? "default" : "outline"}
              onClick={() => setFocusControlOpen((open) => !open)}
              aria-expanded={focusControlOpen}
            >
              <ListFilter />
              大类 {selectedFocusNames.length || "--"}/{focusGroups.unlimited ? "不限" : focusGroups.limit}
            </Button>
            <DateControl value={date} onChange={setDate} />
          </>
        )}
      />

      {focusControlOpen && (
        <FocusGroupControl
          candidates={focusCandidates}
          selectedNames={selectedFocusNames}
          limit={focusGroups.limit}
          unlimited={focusGroups.unlimited}
          loading={focusGroups.loading}
          error={focusGroups.error}
          onSelectionChange={focusGroups.setSelectedNames}
          onUnlimitedChange={focusGroups.setUnlimited}
          onReset={focusGroups.reset}
        />
      )}

      <DataState loading={loading} error={error} onRetry={reload} />

      {data && !loading && (
        <>
          {mode === "overview" && <OverviewContent data={data} />}
          {mode === "intraday" && <IntradayContent data={data} />}
          {mode === "multi" && <MultiChartContent data={data} />}
          {mode === "sectors" && <SectorContent data={data} />}
        </>
      )}
    </div>
  );
}
