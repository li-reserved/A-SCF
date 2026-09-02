export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-100 text-sm font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
      <span className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        正在载入资金工作台
      </span>
    </main>
  );
}
