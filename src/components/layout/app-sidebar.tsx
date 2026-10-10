"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Briefcase,
  Building2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Package,
  Plug,
  ScanSearch,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/intelligence", label: "Intelligence", icon: ScanSearch },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/services", label: "Services", icon: Briefcase },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/delivery", label: "Delivery", icon: Package },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ appName }: { appName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-[linear-gradient(180deg,#f7f4ef_0%,#eef2f6_100%)]">
      <div className="px-5 py-6">
        <p className="font-display text-2xl tracking-tight text-foreground">
          {appName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Operations workspace
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 pb-6">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-foreground/80 hover:bg-black/5",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
