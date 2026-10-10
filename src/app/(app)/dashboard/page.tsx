import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/server/authz";
import { getDashboardStats, listTasks } from "@/server/services/crud";
import { DemoBadge } from "@/components/demo-badge";
import { formatDate } from "@/lib/utils";

export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, tasks] = await Promise.all([
    getDashboardStats(user),
    listTasks(user),
  ]);
  const recentTasks = tasks.slice(0, 5);

  return (
    <>
      <Topbar user={user} title="Dashboard" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Leads", value: stats.leads, href: "/leads" },
            { label: "Clients", value: stats.clients, href: "/clients" },
            { label: "Projects", value: stats.projects, href: "/projects" },
            { label: "Tasks", value: stats.tasks, href: "/tasks" },
            { label: "Open tasks", value: stats.openTasks, href: "/tasks" },
          ].map((item) => (
            <Link key={item.label} href={item.href}>
              <Card className="transition-transform hover:-translate-y-0.5">
                <CardHeader className="pb-2">
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="font-display text-3xl">
                    {item.value}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Recent tasks</CardTitle>
            <CardDescription>
              Live counts from SQLite — no placeholder success states.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tasks yet. Create one from the Tasks page.
              </p>
            ) : (
              recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{task.title}</p>
                    <DemoBadge isDemo={task.isDemo} />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="muted">{task.status}</Badge>
                    <span>{formatDate(task.dueDate)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
