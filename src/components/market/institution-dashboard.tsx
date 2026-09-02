"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, ExternalLink, Scale, Sigma } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarketData } from "@/hooks/use-market-data";
import { formatDate, formatDateTime, formatNumber, shanghaiToday, toneClass } from "@/lib/market-format";
import type { InstitutionContract, InstitutionData, InstitutionRankRow } from "@/lib/market-types";
import { cn } from "@/lib/utils";
import { DataState, DateControl, MetricCard, PageHeading, SegmentedControl } from "./market-ui";

type Variety = "IF" | "IH" | "IC" | "IM" | "ALL";

function RankTable({ title, rows, positive }: { title: string; rows: InstitutionRankRow[]; positive: boolean }) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Icon className={cn("h-4 w-4", positive ? "text-rose-500" : "text-emerald-500")} />
      </CardHeader>
      <CardContent className="p-0">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">排名</TableHead>
              <TableHead className="min-w-[150px]">席位</TableHead>
              <TableHead className="text-right">当日多单</TableHead>
              <TableHead className="text-right">当日空单</TableHead>
              <TableHead className="text-right">当日结果</TableHead>
              <TableHead className="text-right">总多单</TableHead>
              <TableHead className="text-right">总空单</TableHead>
              <TableHead className="text-right">总净持仓</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 15).map((row) => {
              const longAction = row.longChange > 0 ? "加多" : row.longChange < 0 ? "减多" : "多单不变";
              const shortAction = row.shortChange > 0 ? "加空" : row.shortChange < 0 ? "减空" : "空单不变";
              const netAction = row.netChange > 0 ? "净加多" : "净加空";
              const totalNetAction = row.netPosition > 0 ? "总净多单" : row.netPosition < 0 ? "总净空单" : "总持平";
              return (
                <TableRow key={row.member}>
                  <TableCell className="text-muted-foreground">{row.rank}</TableCell>
                  <TableCell>
                    <strong className="block truncate font-medium">{row.member}</strong>
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right font-medium tabular-nums", toneClass(row.longChange))}>
                    {longAction} {formatNumber(Math.abs(row.longChange), 0)} 手
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right font-medium tabular-nums", toneClass(-row.shortChange))}>
                    {shortAction} {formatNumber(Math.abs(row.shortChange), 0)} 手
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right font-semibold tabular-nums", toneClass(row.netChange))}>
                    {netAction} {formatNumber(Math.abs(row.netChange), 0)} 手
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatNumber(row.longPosition, 0)} 手
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatNumber(row.shortPosition, 0)} 手
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right font-medium tabular-nums", toneClass(row.netPosition))}>
                    {totalNetAction} {formatNumber(Math.abs(row.netPosition), 0)} 手
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function InstitutionDashboard() {
  const [date, setDate] = useState(shanghaiToday);
  const [variety, setVariety] = useState<Variety>("IF");
  const [contractCode, setContractCode] = useState("all");
  const { data, error, loading, refreshing, reload } = useMarketData<InstitutionData>(`/api/fund-flow/institution-positions?date=${date}&variety=${variety}`);
  const current = useMemo<InstitutionContract | null>(() => {
    if (!data || contractCode === "all") return data?.aggregate ?? null;
    return data.contracts.find((contract) => contract.code === contractCode) ?? data.aggregate;
  }, [contractCode, data]);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <PageHeading
        eyebrow="INSTITUTION POSITIONS"
        title="机构多空"
        description="汇总中金所股指期货前 20 席位当日多空变化，并附当前总持仓。"
        meta={data ? `${data.varietyName} · 数据交易日 ${data.tradeDate} · 更新 ${formatDateTime(data.updatedAt)}${refreshing ? " · 同步中" : ""}` : undefined}
        actions={<DateControl value={date} onChange={setDate} />}
      />

      {data && !data.isRequestedDate && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {data.requestedDate === shanghaiToday() ? "今日机构多空数据尚未发布" : `${formatDate(data.requestedDate)} 暂无机构多空数据`}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
              当前显示最近已发布的 {formatDate(data.tradeDate)} 数据，不代表 {formatDate(data.requestedDate)} 的持仓变化。中金所通常在交易日 {data.publishedAfter} 后发布。
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <SegmentedControl
          value={variety}
          options={[
            { value: "IF", label: "沪深300" },
            { value: "IH", label: "上证50" },
            { value: "IC", label: "中证500" },
            { value: "IM", label: "中证1000" },
            { value: "ALL", label: "全部" },
          ]}
          onChange={(value) => { setVariety(value); setContractCode("all"); }}
          label="期货品种"
        />
        {data?.sourceUrl && (
          <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
            中金所原始排名 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <DataState loading={loading} error={error} onRetry={reload} />

      {data && current && (
        <>
          <div className="flex flex-wrap gap-2" aria-label="合约切换">
            <button type="button" onClick={() => setContractCode("all")} className={cn("h-8 rounded-md border px-3 text-xs font-medium", contractCode === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}> 全部合约 </button>
            {data.contracts.map((contract) => (
              <button key={contract.code} type="button" onClick={() => setContractCode(contract.code)} className={cn("h-8 rounded-md border px-3 text-xs font-medium", contractCode === contract.code ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>{contract.code}</button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={current.summary.longChange > 0 ? "当日加多" : current.summary.longChange < 0 ? "当日减多" : "当日多单不变"} value={`${formatNumber(Math.abs(current.summary.longChange), 0)} 手`} detail={`总多单 ${formatNumber(current.summary.longPosition, 0)} 手`} icon={<ArrowUpRight className="h-4 w-4" />} tone={current.summary.longChange >= 0 ? "positive" : "negative"} />
            <MetricCard label={current.summary.shortChange > 0 ? "当日加空" : current.summary.shortChange < 0 ? "当日减空" : "当日空单不变"} value={`${formatNumber(Math.abs(current.summary.shortChange), 0)} 手`} detail={`总空单 ${formatNumber(current.summary.shortPosition, 0)} 手`} icon={<ArrowDownRight className="h-4 w-4" />} tone={current.summary.shortChange > 0 ? "negative" : "positive"} />
            <MetricCard label={current.summary.netChange >= 0 ? "当日净加多" : "当日净加空"} value={`${formatNumber(Math.abs(current.summary.netChange), 0)} 手`} detail="多单变化 - 空单变化" icon={<Sigma className="h-4 w-4" />} tone={current.summary.netChange >= 0 ? "positive" : "negative"} />
            <MetricCard label={current.summary.netPosition >= 0 ? "总净多持仓" : "总净空持仓"} value={`${formatNumber(Math.abs(current.summary.netPosition), 0)} 手`} detail="总多单 - 总空单" icon={<Scale className="h-4 w-4" />} tone={current.summary.netPosition >= 0 ? "positive" : "negative"} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RankTable title="当日净加多席位" rows={current.netLongRows} positive />
            <RankTable title="当日净加空席位" rows={current.netShortRows} positive={false} />
          </div>

          <p className="text-xs leading-5 text-muted-foreground">{data.detail} 数据通常在交易日 {data.publishedAfter} 后发布。</p>
        </>
      )}
    </div>
  );
}
