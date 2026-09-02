"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useMarketData } from "@/hooks/use-market-data";
import type { FocusCandidate, FocusGroupsData } from "@/lib/market-types";

const FOCUS_STORAGE_KEY = "a-share-fund-flow:focus-names:v1";
const FOCUS_UNLIMITED_STORAGE_KEY = "a-share-fund-flow:focus-unlimited:v1";
const DEFAULT_FOCUS_LIMIT = 32;

interface FocusGroupsController {
  candidates: FocusCandidate[];
  defaultNames: string[];
  selectedNames: string[];
  limit: number;
  unlimited: boolean;
  loading: boolean;
  error: string;
  requestQuery: string;
  setSelectedNames: (names: string[]) => void;
  setUnlimited: (value: boolean) => void;
  reset: () => void;
}

function normalizeNames(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const name = value.replace(/[<>\s]/g, "").trim().slice(0, 24);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

function readStoredNames(unlimited: boolean): string[] {
  const stored = localStorage.getItem(FOCUS_STORAGE_KEY);
  if (!stored) return [];
  try {
    return normalizeNames(JSON.parse(stored), unlimited ? Number.POSITIVE_INFINITY : DEFAULT_FOCUS_LIMIT);
  } catch (error) {
    console.error("重点大类偏好解析失败", error);
    localStorage.removeItem(FOCUS_STORAGE_KEY);
    return [];
  }
}

export function useFocusGroups(): FocusGroupsController {
  const { data, error, loading } = useMarketData<FocusGroupsData>("/api/fund-flow/focus-groups");
  const [selectedNames, setSelectedNamesState] = useState<string[]>([]);
  const [unlimited, setUnlimitedState] = useState(false);
  const limit = data?.limit ?? DEFAULT_FOCUS_LIMIT;

  useEffect(() => {
    const storedUnlimited = localStorage.getItem(FOCUS_UNLIMITED_STORAGE_KEY) === "1";
    setUnlimitedState(storedUnlimited);
    setSelectedNamesState(readStoredNames(storedUnlimited));
  }, []);

  const setSelectedNames = useCallback((names: string[]) => {
    const normalized = normalizeNames(names, unlimited ? Number.POSITIVE_INFINITY : limit);
    setSelectedNamesState(normalized);
    localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(normalized));
  }, [limit, unlimited]);

  const setUnlimited = useCallback((value: boolean) => {
    setUnlimitedState(value);
    localStorage.setItem(FOCUS_UNLIMITED_STORAGE_KEY, value ? "1" : "0");
    if (!value) {
      setSelectedNamesState((current) => {
        const normalized = normalizeNames(current, limit);
        localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      });
    }
  }, [limit]);

  const reset = useCallback(() => {
    setSelectedNamesState([]);
    setUnlimitedState(false);
    localStorage.removeItem(FOCUS_STORAGE_KEY);
    localStorage.removeItem(FOCUS_UNLIMITED_STORAGE_KEY);
  }, []);

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams({ scope: "all", limit: "60" });
    if (selectedNames.length) params.set("focus", selectedNames.join(","));
    if (unlimited) params.set("focusLimit", "all");
    return params.toString();
  }, [selectedNames, unlimited]);

  return {
    candidates: data?.focusCandidates ?? [],
    defaultNames: data?.defaultFocusNames ?? [],
    selectedNames,
    limit,
    unlimited,
    loading,
    error,
    requestQuery,
    setSelectedNames,
    setUnlimited,
    reset,
  };
}
