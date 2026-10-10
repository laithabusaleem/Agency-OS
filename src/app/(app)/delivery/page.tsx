import Link from "next/link";
import { CreateWorkflowForm } from "@/components/forms/delivery-forms";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/server/authz";
import * as delivery from "@/server/services/delivery";

export const instant = false;

export default async function DeliveryPage() {
  const user = await requireUser();
  const [settings, templates, workflows, projects] = await Promise.all([
    delivery.getDeliveryStatus(user),
    Promise.resolve(delivery.getTemplates()),
    delivery.listWorkflows(user),
    delivery.listProjectsForDelivery(user),
  ]);

  return (
    <>
      <Topbar user={user} title="Service delivery" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Delivery controls</CardTitle>
            <CardDescription>
              Isolated workspaces, checksummed artifacts, independent QA.
              Model-generated code is never executed on the host. See
              docs/SERVICE_DELIVERY.md.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant={settings.runsEnabled ? "success" : "muted"}>
              Runs {settings.runsEnabled ? "on" : "off"}
            </Badge>
            <Badge variant={settings.deployEnabled ? "outline" : "muted"}>
              Deploy {settings.deployEnabled ? "capable" : "locked"}
            </Badge>
            <Badge variant="muted">Model code exec permanently blocked</Badge>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>New workflow</CardTitle>
              <CardDescription>
                Templates: website, marketing, research, AI automation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length ? (
                <CreateWorkflowForm projects={projects} templates={templates} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Create a project first, then start a delivery workflow.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="border-b border-border pb-3 last:border-0"
                >
                  <p className="font-medium">{t.name}</p>
                  <p className="text-muted-foreground">{t.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tools: {t.allowedTools.join(", ")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Workflows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workflows yet.</p>
            ) : (
              workflows.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">{w.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.templateId} · {w.mode} · v{w.currentVersion}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{w.status}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/delivery/${w.id}`}>Open</Link>
                    </Button>
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
