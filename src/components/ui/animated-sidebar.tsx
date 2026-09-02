"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link, { type LinkProps } from "next/link";
import React, { createContext, useContext, useState } from "react";

interface Links {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
}

export function SidebarProvider({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = setOpenProp ?? setOpenState;

  return <SidebarContext.Provider value={{ open, setOpen, animate }}>{children}</SidebarContext.Provider>;
}

export function Sidebar({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
}

export function SidebarBody(props: React.ComponentProps<typeof motion.div>) {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
}

function DesktopSidebar({ className, children, ...props }: React.ComponentProps<typeof motion.div>) {
  const { open, setOpen, animate } = useSidebar();

  return (
    <motion.aside
      className={cn(
        "hidden h-full flex-shrink-0 flex-col bg-neutral-100 px-4 py-4 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 md:flex",
        className,
      )}
      animate={{ width: animate ? (open ? "250px" : "70px") : "250px" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.aside>
  );
}

function MobileSidebar({ className, children, ...props }: React.ComponentProps<"div">) {
  const { open, setOpen } = useSidebar();

  return (
    <>
      <div
        className="flex h-11 w-full items-center justify-between bg-neutral-100 px-4 dark:bg-neutral-800 md:hidden"
        {...props}
      >
        <strong className="text-sm font-semibold">A股资金流向</strong>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700"
          aria-label="打开工作台导航"
          title="导航"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className={cn(
              "fixed inset-0 z-[200] flex h-full w-full flex-col bg-white p-8 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 md:hidden",
              className,
            )}
          >
            <button
              type="button"
              className="absolute right-8 top-8 grid h-9 w-9 place-items-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="关闭工作台导航"
              title="关闭"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            {children}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

export function SidebarLink({ link, className, ...props }: { link: Links; className?: string } & LinkProps) {
  const { open, animate } = useSidebar();

  return (
    <Link
      className={cn("group/sidebar flex items-center justify-start gap-2 py-2", className)}
      {...props}
    >
      {link.icon}
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="m-0 inline-block whitespace-nowrap p-0 text-sm text-neutral-700 transition duration-150 group-hover/sidebar:translate-x-1 dark:text-neutral-200"
      >
        {link.label}
      </motion.span>
    </Link>
  );
}
