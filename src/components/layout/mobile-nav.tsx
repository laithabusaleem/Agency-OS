"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Home" },
  { href: "/leads", label: "Leads" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/outreach", label: "Outreach" },
  { href: "/delivery", label: "Delivery" },
  { href: "/agents", label: "Agents" },
  { href: "/settings", label: "Settings" },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2 md:hidden">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
            pathname.startsWith(link.href)
              ? "bg-foreground text-background"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
