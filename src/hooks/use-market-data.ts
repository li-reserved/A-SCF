"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MARKET_REFRESH_EVENT } from "@/lib/events";

interface MarketDataState<T> {
  data: T | null;
  error: string;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
}

function withForce(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("force", "1");
  return `${url.pathname}${url.search}`;
}

export function useMarketData<T>(path: string, refreshIntervalMs?: number): MarketDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef(0);
  const dataRef = useRef<T | null>(null);

  const load = useCallback(async (force: boolean) => {
    const requestId = ++requestRef.current;
    if (dataRef.current) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch(force ? withForce(path) : path, { cache: "no-store" });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const detail = (await response.text()).trim();
        throw new Error(`数据请求失败（${response.status}）${detail ? `：${detail}` : ""}`);
      }
      const payload = (await response.json()) as T & { error?: string };
      if (!response.ok) throw new Error(payload.error || `数据请求失败（${response.status}）`);
      if (requestId === requestRef.current) {
        dataRef.current = payload;
        setData(payload);
      }
    } catch (reason) {
      if (requestId === requestRef.current) {
        setError(reason instanceof Error ? reason.message : "数据请求失败");
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [path]);

  useEffect(() => {
    dataRef.current = null;
    setData(null);
    void load(false);
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => void load(true);
    window.addEventListener(MARKET_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(MARKET_REFRESH_EVENT, refresh);
  }, [load]);

  useEffect(() => {
    if (!refreshIntervalMs) return;
    const timer = window.setInterval(() => void load(false), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [load, refreshIntervalMs]);

  return { data, error, loading, refreshing, reload: () => void load(true) };
}
