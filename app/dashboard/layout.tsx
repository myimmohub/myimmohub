import DashboardNav from "@/components/DashboardNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 dark:bg-zinc-950">
      <DashboardNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
