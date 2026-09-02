"use client";

import { ArrowLeftRight, Banknote, Scale, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarketData } from "@/hooks/use-market-data";
import { formatAmount, formatDateTime, shanghaiToday, toneClass } from "@/lib/market-format";
import type { MarginData } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { chartTooltipStyle, DataState, DateControl, MetricCard, PageHeading } from "./market-ui";

export function MarginDashboard() {
  const [date, setDate] = useState(shanghaiToday);
  const { data, error, loading, refreshing, reload } = useMarketData<MarginData>(`/api/fund-flow/margin?date=${date}`);
  const latest = data?.points.at(-1);
  const previous = data?.points.at(-2);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <PageHeading
        eyebrow="MARGIN FINANCING"
        title="融资融券"
        description="跟踪两融余额、融资余额与当日融资净买入，观察杠杆资金边际变化。"
        meta={data ? `${data.source} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={<DateControl value={date} onChange={setDate} />}
      />

      <DataState loading={loading} error={error} empty={Boolean(data && !data.points.length)} onRetry={reload} />

      {data && latest && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="两融余额" value={formatAmount(latest.marginBalance)} detail={`${latest.date} 口径`} icon={<Scale className="h-4 w-4" />} tone="primary" />
            <MetricCard label="融资余额" value={formatAmount(latest.financingBalance)} detail={`较前日 ${formatAmount(previous ? latest.financingBalance - previous.financingBalance : null, true)}`} icon={<Banknote className="h-4 w-4" />} />
            <MetricCard label="融券余额" value={formatAmount(latest.securitiesLendingBalance)} detail={`占两融 ${(latest.securitiesLendingBalance / latest.marginBalance * 100).toFixed(2)}%`} icon={<ArrowLeftRight className="h-4 w-4" />} />
            <MetricCard label="融资净买入" value={formatAmount(latest.financingNetBuy, true)} detail="当日边际杠杆资金" icon={<TrendingUp className="h-4 w-4" />} tone={latest.financingNetBuy >= 0 ? "positive" : "negative"} />
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>两融余额与净买入趋势</CardTitle>
              <p className="text-xs text-muted-foreground">左轴为余额，右轴为当日融资净买入</p>
            </CardHeader>
            <CardContent>
              <div className="h-[430px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.points} margin={{ top: 8, right: 6, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => String(value).slice(5)} />
                    <YAxis yAxisId="balance" tick={{ fontSize: 10 }} width={58} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${(Number(value) / 10000).toFixed(1)}万`} />
                    <YAxis yAxisId="flow" orientation="right" tick={{ fontSize: 10 }} width={50} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [formatAmount(Number(value), String(name).includes("净买入")), name]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    <Area yAxisId="balance" type="monotone" dataKey="marginBalance" name="两融余额" stroke="#4f46b8" fill="#4f46b8" fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Area yAxisId="balance" type="monotone" dataKey="financingBalance" name="融资余额" stroke="#0891b2" fill="#0891b2" fillOpacity={0.06} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Bar yAxisId="flow" dataKey="financingNetBuy" name="融资净买入" fill="#e11d48" opacity={0.55} radius={[2, 2, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>近期明细</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>交易日</TableHead>
                    <TableHead className="text-right">两融余额</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">融资余额</TableHead>
                    <TableHead className="hidden text-right md:table-cell">融券余额</TableHead>
                    <TableHead className="text-right">融资净买入</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.points.slice(-12).reverse().map((point) => (
                    <TableRow key={point.date}>
                      <TableCell className="font-medium">{point.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(point.marginBalance)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatAmount(point.financingBalance)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatAmount(point.securitiesLendingBalance)}</TableCell>
                      <TableCell className={cn("text-right font-medium tabular-nums", toneClass(point.financingNetBuy))}>{formatAmount(point.financingNetBuy, true)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
