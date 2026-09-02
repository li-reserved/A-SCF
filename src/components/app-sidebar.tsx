"use client";

import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CandlestickChart,
  ChartNoAxesCombined,
  Cpu,
  Flame,
  FlaskConical,
  Globe2,
  Landmark,
  LayoutDashboard,
  ListFilter,
  PanelsTopLeft,
  RefreshCw,
  Scale,
  SearchCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarBody, useSidebar } from "@/components/ui/animated-sidebar";
import { MARKET_REFRESH_EVENT } from "@/lib/events";
import { cn } from "@/lib/utils";

interface NavigationItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const marketLinks: NavigationItem[] = [
  { href: "/", label: "资金总览", description: "市场成交与主力资金概览", icon: LayoutDashboard },
  { href: "/intraday", label: "分时走势", description: "板块资金分时轨迹", icon: ChartNoAxesCombined },
  { href: "/limit-up", label: "涨停监控", description: "竞价涨停与行业聚合", icon: Flame },
  { href: "/multi-chart", label: "多图同屏", description: "重点板块并行观察", icon: PanelsTopLeft },
  { href: "/margin", label: "融资融券", description: "两融余额与净买入趋势", icon: Scale },
  { href: "/after-hours", label: "资金暗盘", description: "单股明暗盘与 GS 信号", icon: CandlestickChart },
  { href: "/us-overnight", label: "美股夜盘", description: "美股夜盘、盘前与重点主题", icon: Globe2 },
];

const researchLinks: NavigationItem[] = [
  { href: "/strategy", label: "策略模拟", description: "指标信号、胜率与收益回放", icon: FlaskConical },
  { href: "/sectors", label: "板块排行", description: "板块资金强弱排序", icon: ListFilter },
  { href: "/leaders", label: "细分龙头", description: "细分赛道龙头行情", icon: Cpu },
  { href: "/institutions", label: "机构多空", description: "股指期货席位变化", icon: BarChart3 },
  { href: "/liquidity", label: "央行流动性", description: "逆回购投放与到期日历", icon: Landmark },
  { href: "/security", label: "个股研判", description: "个股行情与交易观察", icon: SearchCheck },
];

const navigationLinks = [...marketLinks, ...researchLinks];

function WorkspaceLink({ item }: { item: NavigationItem }) {
  const pathname = usePathname();
  const { open, setOpen, animate } = useSidebar();
  const active = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={() => {
        if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
      }}
      className={cn(
        "group/sidebar flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-200 dark:text-neutral-200 dark:hover:bg-neutral-700",
        active && "bg-neutral-200 font-semibold text-neutral-950 dark:bg-neutral-700 dark:text-white",
      )}
      aria-current={active ? "page" : undefined}
      title={!open ? item.label : undefined}
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0", active && "text-primary")} />
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="whitespace-nowrap"
      >
        {item.label}
      </motion.span>
    </Link>
  );
}

function WorkspaceNavigation() {
  const { open } = useSidebar();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <Link href="/" className="flex h-9 items-center gap-3 px-2" title={!open ? "A股资金流向" : undefined}>
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
          <Activity className="h-5 w-5" />
        </span>
        <motion.span
          animate={{ display: open ? "inline-block" : "none", opacity: open ? 1 : 0 }}
          className="whitespace-nowrap text-sm font-semibold text-neutral-950 dark:text-white"
        >
          A股资金流向
        </motion.span>
      </Link>

      <nav className="mt-8 grid gap-1" aria-label="行情视图">
        {open && <span className="px-2 pb-2 text-xs text-neutral-500 dark:text-neutral-400">行情视图</span>}
        {marketLinks.map((item) => <WorkspaceLink key={item.href} item={item} />)}
      </nav>

      <nav className="mt-7 grid gap-1" aria-label="研究与事件">
        {open && <span className="px-2 pb-2 text-xs text-neutral-500 dark:text-neutral-400">研究与事件</span>}
        {researchLinks.map((item) => <WorkspaceLink key={item.href} item={item} />)}
      </nav>
    </div>
  );
}

export function AppSidebar({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const current = navigationLinks.find((item) => item.href === pathname) ?? marketLinks[0];

  const refresh = () => {
    setRefreshing(true);
    window.dispatchEvent(new Event(MARKET_REFRESH_EVENT));
    window.setTimeout(() => setRefreshing(false), 650);
  };

  return (
    <div className="mx-auto flex h-dvh w-full flex-col overflow-hidden border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 md:flex-row">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-8 border-neutral-200 dark:border-neutral-700">
          <WorkspaceNavigation />
          <div className="flex items-center gap-3 px-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Sparkles className="h-5 w-5 flex-shrink-0 text-primary" />
            {open && <span className="whitespace-nowrap">公开数据工作台</span>}
          </div>
        </SidebarBody>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:rounded-l-[24px]">
        <header className="flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b bg-background px-4 sm:px-6">
          <div className="min-w-0">
            <strong className="block truncate text-sm font-semibold">{current.label}</strong>
            <span className="block truncate text-xs text-muted-foreground">{current.description}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="刷新当前页" title="刷新当前页" onClick={refresh}>
              <RefreshCw className={cn(refreshing && "animate-spin")} />
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
