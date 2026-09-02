import { AlertCircle, CalendarDays, ChevronDown, Database, LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeading({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DateControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm shadow-sm">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <span className="sr-only">交易日期</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 border-0 bg-transparent text-sm outline-none"
      />
    </label>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
  onClick,
  expanded = false,
  controls,
  className,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "default" | "positive" | "negative" | "primary";
  onClick?: () => void;
  expanded?: boolean;
  controls?: string;
  className?: string;
}) {
  const toneStyles = {
    default: "bg-muted text-muted-foreground",
    positive: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
    negative: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    primary: "bg-primary/10 text-primary",
  };

  const content = (
    <span className="flex items-start justify-between gap-3">
      <span className="min-w-0 text-left">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="mt-2 block truncate text-xl font-semibold">{value}</strong>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-1">
        <span className={cn("grid h-9 w-9 place-items-center rounded-md", toneStyles[tone])}>{icon}</span>
        {onClick && <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />}
      </span>
    </span>
  );

  return (
    <Card className={cn(className, onClick && "transition-colors hover:border-primary/40 hover:bg-muted/20", expanded && "border-primary/50 ring-1 ring-primary/15")}>
      {onClick ? (
        <button
          type="button"
          className="block w-full rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={onClick}
          aria-expanded={expanded}
          aria-controls={controls}
        >
          {content}
        </button>
      ) : <CardContent className="p-4">{content}</CardContent>}
    </Card>
  );
}

export function DataState({
  loading,
  error,
  empty,
  onRetry,
  emptyTitle = "当前时段暂无数据",
  emptyDescription = "数据源返回后这里会自动更新。",
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
  onRetry: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!loading && !error && !empty) return null;

  return (
    <Card className="min-h-72">
      <CardContent className="grid min-h-72 place-items-center p-6 text-center">
        {loading ? (
          <div>
            <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">正在同步市场数据</p>
            <p className="mt-1 text-xs text-muted-foreground">公开数据源响应时间可能有所波动</p>
          </div>
        ) : error ? (
          <div>
            <AlertCircle className="mx-auto h-6 w-6 text-rose-500" />
            <p className="mt-3 text-sm font-medium">数据暂时不可用</p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{error}</p>
            <Button className="mt-4" size="sm" variant="outline" onClick={onRetry}>
              <RotateCw />
              重新加载
            </Button>
          </div>
        ) : (
          <div>
            <Database className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{emptyTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-md border bg-muted p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded px-3 text-xs font-medium text-muted-foreground transition-colors",
            value === option.value && "bg-background text-foreground shadow-sm",
          )}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const chartTooltipStyle = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
  fontSize: 12,
};
