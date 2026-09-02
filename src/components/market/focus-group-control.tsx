"use client";

import { CheckCheck, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatPercent, toneClass } from "@/lib/market-format";
import type { FocusCandidate } from "@/lib/market-types";
import { cn } from "@/lib/utils";

interface FocusGroupControlProps {
  candidates: FocusCandidate[];
  selectedNames: string[];
  limit: number;
  unlimited: boolean;
  loading: boolean;
  error: string;
  onSelectionChange: (names: string[]) => void;
  onUnlimitedChange: (value: boolean) => void;
  onReset: () => void;
}

function fuzzyIncludes(value: string, query: string): boolean {
  const source = value.toLocaleLowerCase("zh-CN");
  const target = query.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
  if (!target || source.includes(target)) return true;
  let cursor = 0;
  for (const character of target) {
    cursor = source.indexOf(character, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

export function FocusGroupControl({
  candidates,
  selectedNames,
  limit,
  unlimited,
  loading,
  error,
  onSelectionChange,
  onUnlimitedChange,
  onReset,
}: FocusGroupControlProps) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedNames), [selectedNames]);
  const visibleCandidates = useMemo(() => candidates
    .filter((item) => fuzzyIncludes(`${item.name}${item.sourceName}`, query))
    .sort((a, b) => Number(selected.has(b.name)) - Number(selected.has(a.name))), [candidates, query, selected]);

  const toggle = (name: string) => {
    if (selected.has(name)) {
      if (selectedNames.length > 1) onSelectionChange(selectedNames.filter((item) => item !== name));
      return;
    }
    onSelectionChange([...selectedNames, name]);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>重点大类</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            已选 {selectedNames.length}/{unlimited ? "不限" : limit} · 全部 {candidates.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(event) => onUnlimitedChange(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            解除数量限制
          </label>
          {unlimited && (
            <Button type="button" size="sm" variant="outline" onClick={() => onSelectionChange(candidates.map((item) => item.name))}>
              <CheckCheck />
              全选
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw />
            恢复默认
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索大类"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {loading && <p className="py-8 text-center text-sm text-muted-foreground">正在加载大类</p>}
        {error && <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {!loading && !error && (
          <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto border-t pt-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleCandidates.map((item) => {
              const checked = selected.has(item.name);
              const disabled = checked ? selectedNames.length <= 1 : !unlimited && selectedNames.length >= limit;
              return (
                <label
                  key={item.name}
                  className={cn(
                    "grid min-h-[54px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                    checked ? "border-primary/50 bg-primary/5" : "bg-background hover:bg-muted/60",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(item.name)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <strong className="block truncate font-medium">{item.name}</strong>
                    <span className="mt-0.5 block truncate text-muted-foreground">{item.sourceName || "等待匹配数据源"}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <strong className={cn("block font-medium", toneClass(item.latest))}>{formatAmount(item.latest, true)}</strong>
                    <span className={cn("mt-0.5 block", toneClass(item.changePct))}>{formatPercent(item.changePct)}</span>
                  </span>
                </label>
              );
            })}
            {!visibleCandidates.length && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">没有匹配的大类</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
