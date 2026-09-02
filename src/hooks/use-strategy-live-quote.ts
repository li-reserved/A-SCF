"use client";

import { useEffect, useState } from "react";

import type { StrategyLiveQuote } from "@/lib/market-types";

type LiveQuoteConnection = "connecting" | "open" | "reconnecting";

interface StrategyLiveQuoteState {
  latest: StrategyLiveQuote | null;
  snapshots: StrategyLiveQuote[];
  connection: LiveQuoteConnection;
  error: string;
}

export function useStrategyLiveQuote(code: string): StrategyLiveQuoteState {
  const [latest, setLatest] = useState<StrategyLiveQuote | null>(null);
  const [snapshots, setSnapshots] = useState<StrategyLiveQuote[]>([]);
  const [connection, setConnection] = useState<LiveQuoteConnection>("connecting");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code) return;

    setLatest(null);
    setSnapshots([]);
    setConnection("connecting");
    setError("");

    const source = new EventSource(`/api/strategy/live-quote?code=${encodeURIComponent(code)}&stream=1`);
    source.onopen = () => {
      setConnection("open");
      setError("");
    };
    source.addEventListener("quote", (event) => {
      try {
        const payload = JSON.parse(event.data) as StrategyLiveQuote;
        setLatest(payload);
        setSnapshots(current => {
          const previous = current.at(-1);
          if (previous
            && previous.quote.updatedAt === payload.quote.updatedAt
            && previous.quote.latest === payload.quote.latest
            && previous.quote.volume === payload.quote.volume) {
            return current;
          }
          return [...current, payload].slice(-300);
        });
        setConnection("open");
        setError("");
      } catch {
        setError("实时行情数据格式错误");
      }
    });
    source.addEventListener("quote-error", (event) => {
      const payload = JSON.parse(event.data) as { error: string };
      setError(payload.error);
    });
    source.onerror = () => {
      setConnection("reconnecting");
      setError("实时行情连接中断，正在重连");
    };

    return () => source.close();
  }, [code]);

  return { latest, snapshots, connection, error };
}
