"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clock3,
  Radar,
  ReceiptText,
  ShieldAlert,
  Target,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarketData } from "@/hooks/use-market-data";
import { formatDate, formatDateTime, formatNumber, formatPercent, toneClass } from "@/lib/market-format";
import type {
  AutoStrategyAction,
  AutoStrategyData,
  AutoStrategyEquityPoint,
  AutoStrategyPlan,
} from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { DataState, MetricCard, PageHeading, SegmentedControl } from "./market-ui";
import { StrategySignalChart } from "./strategy-signal-chart";

type DetailView = "candidates" | "trades";

function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (compact && Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyExact(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function metricTone(value: number): "positive" | "negative" | "default" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "default";
}

function PerformanceTooltip({ active, payload }: TooltipProps<number, string>) {
  const point = payload?.[0]?.payload as AutoStrategyEquityPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="min-w-44 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="font-medium">{formatDate(point.date)}</p>
      <dl className="mt-2 space-y-1.5">
        <div className="flex justify-between gap-5"><dt className="text-muted-foreground">策略收益</dt><dd className={toneClass(point.strategyReturn)}>{formatPercent(point.strategyReturn)}</dd></div>
        <div className="flex justify-between gap-5"><dt className="text-muted-foreground">沪深300</dt><dd className={toneClass(point.benchmarkReturn)}>{formatPercent(point.benchmarkReturn)}</dd></div>
        <div className="flex justify-between gap-5"><dt className="text-muted-foreground">账户权益</dt><dd>{formatCurrency(point.equity)}</dd></div>
        <div className="flex justify-between gap-5"><dt className="text-muted-foreground">当前回撤</dt><dd className="text-emerald-600 dark:text-emerald-400">{formatPercent(point.drawdown, false)}</dd></div>
      </dl>
    </div>
  );
}

function ActionRow({ action }: { action: AutoStrategyAction }) {
  const buying = action.side === "buy";
  return (
    <div className="flex items-start justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cn(
          "mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-md",
          buying ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
        )}>
          {buying ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{buying ? "买入" : "卖出"} {action.name}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{action.code} · {action.reason}</span>
        </span>
      </div>
      <span className="flex-shrink-0 text-right">
        <strong className="block text-sm tabular-nums">{formatNumber(action.price)} × {action.shares}</strong>
        <span className={cn("mt-0.5 block text-xs tabular-nums", action.pnl === undefined ? "text-muted-foreground" : toneClass(action.pnl))}>
          {action.pnl === undefined ? formatCurrency(action.amount, true) : `${action.pnl > 0 ? "+" : ""}${formatCurrency(action.pnl, true)}`}
        </span>
      </span>
    </div>
  );
}

function PlanRow({ plan }: { plan: AutoStrategyPlan }) {
  const buying = plan.side === "buy";
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium">{plan.name} <span className="font-normal text-muted-foreground">{plan.code}</span></span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{plan.reason}</span>
      </div>
      <span className="flex-shrink-0 text-right">
        <span className="block text-[11px] text-muted-foreground">参考价 / {buying ? "预计数量" : "卖出数量"}</span>
        <strong className="mt-0.5 block text-sm tabular-nums">¥{formatNumber(plan.referencePrice)}</strong>
        <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{plan.shares.toLocaleString("zh-CN")} 股</span>
        <span className={cn(
          "mt-1 inline-block rounded border px-2 py-0.5 text-xs font-medium",
          buying ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400" : "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
        )}>
          {buying ? "计划买入" : "计划卖出"}
        </span>
      </span>
    </div>
  );
}

export function StrategyDashboard() {
  const [detailView, setDetailView] = useState<DetailView>("candidates");
  const { data, error, loading, refreshing, reload } = useMarketData<AutoStrategyData>("/api/strategy/simulation", 20_000);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <PageHeading
        eyebrow="AUTOMATED PAPER STRATEGY"
        title="自动策略模拟"
        description="已接管同步持仓，周一起根据实时行情自动模拟调仓；新买入仅限沪深主板。"
        meta={data ? `${data.source} · ${data.tradeDate} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={(
          <>
            {data && data.account.pendingDeposit > 0 && <span className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs text-amber-700 shadow-sm dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"><CircleDollarSign className="h-4 w-4" />待到账 {formatCurrencyExact(data.account.pendingDeposit)} · 未计入</span>}
            <span className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground shadow-sm">
              <span className={cn(
                "h-2 w-2 rounded-full",
                data?.status === "scheduled" ? "bg-amber-500" : data?.session.isTradingTime ? "animate-pulse bg-rose-500" : "bg-emerald-500",
              )} />
              {data?.status === "scheduled"
                ? `等待 ${formatDate(data.startDate)} 启动`
                : data?.session.isTradingTime ? "盘中 · 20秒更新" : "已收盘 · 自动复核"}
            </span>
          </>
        )}
      />

      <DataState loading={loading} error={error} onRetry={reload} />

      {data && !loading && (
        <>
          <Card>
            <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(520px,auto)] lg:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Bot className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{data.strategy.name}</h2>
                    <span className={cn(
                      "rounded border px-2 py-0.5 text-xs",
                      data.sourceStatus.level === "live" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
                    )}>{data.sourceStatus.text}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{data.strategy.selection}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{data.strategy.execution}</p>
                  <p className="text-xs leading-5 text-muted-foreground">账户快照 {formatDate(data.account.snapshotDate)} · {data.account.positions.length} 只持仓 · 总市值 {formatCurrencyExact(data.account.marketValue)}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-5 border-t pt-4 text-right sm:grid-cols-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div><dt className="text-xs text-muted-foreground">可用现金</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{formatCurrencyExact(data.summary.cash)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">可取现金</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{formatCurrencyExact(data.account.withdrawableCash)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">待到账</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{formatCurrencyExact(data.account.pendingDeposit)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">扫描池</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{data.universe.available}/{data.universe.requested} 只</dd><span className="mt-0.5 block text-[11px] text-muted-foreground">覆盖 {data.universe.industryCount} 个行业</span></div>
              </dl>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <MetricCard
              label="账户总收益率"
              value={formatPercent(data.account.totalReturnPct)}
              detail={`${formatDate(data.account.snapshotDate)}同步 · 总盈亏 ${formatCurrencyExact(data.account.totalPnl)}`}
              icon={<ChartNoAxesCombined className="h-4 w-4" />}
              tone={metricTone(data.account.totalReturnPct)}
            />
            <MetricCard
              label="当前总资产"
              value={formatCurrencyExact(data.summary.currentEquity)}
              detail={`市值 ${formatCurrencyExact(data.summary.marketValue)}`}
              icon={<WalletCards className="h-4 w-4" />}
              tone="primary"
            />
            <MetricCard
              label="周一后策略收益"
              value={formatPercent(data.summary.totalReturnPct)}
              detail={`基准 ${formatCurrencyExact(data.settings.initialCapital)}`}
              icon={<Activity className="h-4 w-4" />}
              tone={metricTone(data.summary.totalReturnPct)}
            />
            <MetricCard
              label="交易胜率"
              value={data.summary.winRatePct === null ? "--" : formatPercent(data.summary.winRatePct, false)}
              detail={`${data.summary.wins}/${data.summary.completedTrades} 笔盈利`}
              icon={<Target className="h-4 w-4" />}
              tone="primary"
            />
            <MetricCard
              label="最大回撤"
              value={data.summary.maxDrawdownPct === 0 ? "0.00%" : `-${formatPercent(data.summary.maxDrawdownPct, false)}`}
              detail={data.status === "scheduled" ? `账户仓位 ${formatPercent(data.account.positionPct, false)}` : `策略持仓率 ${formatPercent(data.summary.exposurePct, false)}`}
              icon={<ShieldAlert className="h-4 w-4" />}
              tone="negative"
            />
            <MetricCard
              label="完成交易"
              value={`${data.summary.completedTrades} 笔`}
              detail={`费用 ${formatCurrency(data.summary.totalFees, true)}`}
              icon={<ReceiptText className="h-4 w-4" />}
            />
          </div>

          <StrategySignalChart strategy={data} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.65fr)]">
            <Card className="min-w-0">
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>模拟资金曲线</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{data.status === "scheduled" ? "已以当前总资产建立策略基准" : "策略收益与沪深300同期对照"}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {data.status === "scheduled" ? `计划 ${formatDate(data.startDate)} 启动` : `${formatDate(data.range.start)} 至 ${formatDate(data.range.end)} · ${data.range.tradingDays} 日`}
                </span>
              </CardHeader>
              <CardContent>
                {data.status === "scheduled" ? (
                  <div className="grid h-[330px] place-items-center text-center sm:h-[360px]">
                    <div>
                      <Clock3 className="mx-auto h-6 w-6 text-amber-500" />
                      <p className="mt-3 text-sm font-medium">等待 {formatDate(data.startDate)} 开始记录</p>
                      <p className="mt-1 text-xs text-muted-foreground">当前总资产 {formatCurrencyExact(data.summary.currentEquity)} · 策略收益 0.00%</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-[330px] w-full min-w-0 sm:h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.equityCurve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={34} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => String(value).slice(5)} />
                          <YAxis tick={{ fontSize: 10 }} width={42} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                          <Tooltip content={<PerformanceTooltip />} />
                          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                          <Area type="monotone" dataKey="strategyReturn" name="策略收益" stroke="#4f46b8" fill="#4f46b8" fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="benchmarkReturn" name="沪深300" stroke="#d97706" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#4f46b8]" />策略收益</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#d97706]" />沪深300</span>
                      <span className="ml-auto">现金 {formatCurrency(data.summary.cash, true)} · 持仓 {formatCurrency(data.summary.marketValue, true)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>自动执行</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{data.status === "scheduled" ? "同步持仓已接管，周一按实时行情开始观察" : "今日成交与下一交易日计划"}</p>
                </div>
                <Radar className={cn("h-5 w-5 text-primary", data.status === "running" && data.session.isTradingTime && "animate-pulse")} />
              </CardHeader>
              <CardContent>
                <section>
                  <div className="flex items-center justify-between"><h3 className="text-xs font-medium text-muted-foreground">今日成交</h3><span className="text-xs tabular-nums text-muted-foreground">{data.todayActions.length} 笔</span></div>
                  <div className="mt-1">
                    {data.todayActions.length ? data.todayActions.map((action) => <ActionRow key={`${action.date}-${action.side}-${action.code}`} action={action} />) : <p className="py-5 text-center text-sm text-muted-foreground">{data.status === "scheduled" ? "等待启动日成交" : "今日没有触发成交"}</p>}
                  </div>
                </section>
                <section className="mt-4 border-t pt-4">
                  <div className="flex items-center justify-between"><h3 className="text-xs font-medium text-muted-foreground">{data.status === "scheduled" ? "启动日计划" : data.session.isTradingTime ? "盘中预选" : "下一交易日计划"}</h3><span className="text-xs tabular-nums text-muted-foreground">{data.plans.length} 项</span></div>
                  <div className="mt-1">
                    {data.plans.length ? data.plans.map((plan) => <PlanRow key={`${plan.side}-${plan.code}`} plan={plan} />) : <p className="py-5 text-center text-sm text-muted-foreground">当前没有待执行计划</p>}
                  </div>
                </section>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div><CardTitle>当前持仓</CardTitle><p className="mt-1 text-xs text-muted-foreground">{data.status === "scheduled" ? "已与实际账户持仓和金额同步" : "按最新行情盯市，止盈止损自动执行"}</p></div>
              <span className="text-xs text-muted-foreground">{data.positions.length}/{data.settings.maxPositions} 只</span>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {data.positions.length ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="pl-5">股票</TableHead><TableHead>成本 / 最新</TableHead><TableHead className="text-right">持仓 / 可用</TableHead><TableHead className="text-right">浮动盈亏</TableHead><TableHead className="text-right">策略止损 / 止盈</TableHead><TableHead className="pr-5 text-right">状态</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{data.positions.map((position) => (
                    <TableRow key={position.code}>
                      <TableCell className="pl-5"><span className="font-medium">{position.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{position.code} · {position.origin === "synced" ? "同步持仓" : formatDate(position.entryDate)}</span></TableCell>
                      <TableCell className="tabular-nums">{formatNumber(position.entryPrice)} / <span className={toneClass(position.returnPct)}>{formatNumber(position.latest)}</span></TableCell>
                      <TableCell className="text-right"><span className="tabular-nums">{position.shares.toLocaleString("zh-CN")} 股</span><span className="mt-0.5 block text-xs text-muted-foreground">{position.availableShares.toLocaleString("zh-CN")} 股可用</span></TableCell>
                      <TableCell className={cn("text-right tabular-nums", toneClass(position.pnl))}><span className="font-medium">{position.pnl > 0 ? "+" : ""}{formatCurrencyExact(position.pnl)}</span><span className="mt-0.5 block text-xs">{formatPercent(position.returnPct)}</span></TableCell>
                      <TableCell className="text-right tabular-nums"><span className="text-emerald-600 dark:text-emerald-400">{formatNumber(position.stopPrice)}</span><span className="text-muted-foreground"> / </span><span className="text-rose-600 dark:text-rose-400">{formatNumber(position.targetPrice)}</span></TableCell>
                      <TableCell className="pr-5 text-right"><span className={cn("rounded border px-2 py-0.5 text-xs", position.pendingExit ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400" : "border-primary/20 bg-primary/5 text-primary")}>{position.pendingExit || "持有"}</span></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              ) : <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">当前空仓，等待下一次有效信号</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div><CardTitle>{detailView === "candidates" ? "系统候选" : "已完成交易"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{detailView === "candidates" ? "按收盘指标综合评分，计划标记将在下个交易日执行" : "胜率仅按已完成交易计算"}</p></div>
              <SegmentedControl value={detailView} onChange={setDetailView} label="策略明细视图" options={[{ value: "candidates", label: "系统候选" }, { value: "trades", label: "交易记录" }]} />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {detailView === "candidates" ? (
                data.candidates.length ? <Table className="min-w-[960px]">
                  <TableHeader><TableRow><TableHead className="w-14 pl-5">排名</TableHead><TableHead className="w-60">股票</TableHead><TableHead>评分</TableHead><TableHead className="text-right">最新 / 涨跌</TableHead><TableHead className="text-right">MA5 / MA20</TableHead><TableHead className="text-right">RSI14 / 量比</TableHead><TableHead className="pr-5 text-right">状态</TableHead></TableRow></TableHeader>
                  <TableBody>{data.candidates.map((candidate) => (
                    <TableRow key={candidate.code}>
                      <TableCell className="pl-5 font-medium tabular-nums">#{candidate.rank}</TableCell>
                      <TableCell><span className="font-medium">{candidate.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{candidate.code} · {candidate.industry} · 5日 {formatPercent(candidate.momentum5)}</span></TableCell>
                      <TableCell><div className="flex items-center gap-2"><strong className="w-7 tabular-nums">{candidate.score}</strong><span className="h-1.5 w-16 overflow-hidden rounded bg-muted"><span className="block h-full bg-primary" style={{ width: `${candidate.score}%` }} /></span></div></TableCell>
                      <TableCell className={cn("text-right tabular-nums", toneClass(candidate.changePct))}>{formatNumber(candidate.latest)}<span className="mt-0.5 block text-xs">{formatPercent(candidate.changePct)}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(candidate.ma5)} / {formatNumber(candidate.ma20)}<span className="mt-0.5 block text-xs text-muted-foreground">扩散 {formatPercent(candidate.trendSpread)}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(candidate.rsi14, 1)} / {formatNumber(candidate.volumeRatio, 2)}</TableCell>
                      <TableCell className="pr-5 text-right"><span className={cn("rounded border px-2 py-0.5 text-xs", candidate.planned ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400" : candidate.held ? "border-primary/20 bg-primary/5 text-primary" : "bg-muted text-muted-foreground")}>{candidate.planned ? "计划买入" : candidate.held ? "持仓中" : "候选"}</span></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table> : <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">当前没有满足全部条件的股票</div>
              ) : (
                data.trades.length ? <Table>
                  <TableHeader><TableRow><TableHead className="pl-5">股票</TableHead><TableHead>买入 / 卖出</TableHead><TableHead className="text-right">买入 / 卖出价</TableHead><TableHead className="text-right">持有</TableHead><TableHead>卖出原因</TableHead><TableHead className="pr-5 text-right">收益</TableHead></TableRow></TableHeader>
                  <TableBody>{data.trades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="pl-5"><span className="font-medium">{trade.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{trade.code} · {trade.shares.toLocaleString("zh-CN")} 股</span></TableCell>
                      <TableCell><span className="text-xs">{formatDate(trade.entryDate)}</span><span className="mx-1.5 text-muted-foreground">→</span><span className="text-xs">{formatDate(trade.exitDate)}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(trade.entryPrice)} / {formatNumber(trade.exitPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{trade.holdingDays} 日</TableCell>
                      <TableCell><span className="rounded border bg-muted px-2 py-0.5 text-xs text-muted-foreground">{trade.exitReason}</span></TableCell>
                      <TableCell className={cn("pr-5 text-right tabular-nums", toneClass(trade.pnl))}><span className="font-medium">{trade.pnl > 0 ? "+" : ""}{formatCurrency(trade.pnl)}</span><span className="mt-0.5 block text-xs">{formatPercent(trade.returnPct)}</span></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table> : <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">{data.status === "scheduled" ? "策略尚未启动，交易记录为空" : "尚无已完成交易"}</div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs leading-5 text-muted-foreground">{data.sourceStatus.detail} {data.disclaimer}</p>
        </>
      )}
    </div>
  );
}
