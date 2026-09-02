"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn("h-9 w-16 rounded-full border bg-muted", className)} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className={cn(
        "relative flex h-9 w-16 items-center rounded-full border bg-background p-1 text-foreground transition-colors",
        className,
      )}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      title={isDark ? "浅色模式" : "深色模式"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span
        className={cn(
          "grid h-7 w-7 place-items-center rounded-full bg-muted transition-transform",
          isDark ? "translate-x-0" : "translate-x-7",
        )}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
    </button>
  );
}
