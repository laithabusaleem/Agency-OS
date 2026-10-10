import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getPublicEnv } from "@/lib/env-public";
import { requireUser } from "@/server/authz";

export const instant = false;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const appName = getPublicEnv().NEXT_PUBLIC_APP_NAME;

  return (
    <div className="flex min-h-screen">
      <div className="hidden md:flex">
        <AppSidebar appName={appName} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-3 md:hidden">
          <p className="font-display text-xl">{appName}</p>
        </div>
        <MobileNav />
        {children}
      </div>
    </div>
  );
}
