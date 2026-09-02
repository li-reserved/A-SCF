import { AppSidebar } from "@/components/app-sidebar";

export default function ApplicationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppSidebar>{children}</AppSidebar>;
}
