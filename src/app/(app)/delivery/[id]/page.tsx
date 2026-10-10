import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PrivilegedActionForm,
  RunDeliveryForm,
  UpdateBriefForm,
} from "@/components/forms/delivery-forms";
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
import {
  approveAuthAction,
  requestAuthAction,
  reviseWorkflowAction,
} from "@/server/actions/delivery";
import { requireUser } from "@/server/authz";
import * as delivery from "@/server/services/delivery";

export const instant = false;

export default async function DeliveryWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await delivery.getWorkflowDetail(user, id);
  if (!detail) notFound();

  const { workflow, template, artifacts, runs, qaChecks, authorizations } =
    detail;
  const brief = JSON.parse(workflow.briefJson || "{}") as Record<
    string,
    string
  >;

  return (
    <>
      <Topbar user={user} title={workflow.name} />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/delivery">Back</Link>
          </Button>
          <Badge variant="outline">{workflow.status}</Badge>
          <Badge variant="secondary">{workflow.mode}</Badge>
          <Badge variant="muted">v{workflow.currentVersion}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription>{template.scope.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="font-medium">In scope</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {template.scope.inScope.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Out of scope</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {template.scope.outOfScope.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Acceptance criteria</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {template.acceptanceCriteria.map((c) => (
                  <li key={c.id}>{c.description}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Failure conditions</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {template.failureConditions.map((f) => (
                  <li key={f.id}>{f.description}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Intake brief</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateBriefForm
                workflowId={workflow.id}
                questions={template.intakeQuestions}
                initialBrief={brief}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Run</CardTitle>
              <CardDescription>
                Delivery agent writes artifacts; QA agent verifies
                independently.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RunDeliveryForm workflowId={workflow.id} />
              <form action={reviseWorkflowAction}>
                <input type="hidden" name="workflowId" value={workflow.id} />
                <input
                  type="hidden"
                  name="reason"
                  value="Operator opened revision"
                />
                <Button type="submit" size="sm" variant="outline">
                  Open revision
                </Button>
              </form>
              {workflow.workspacePath ? (
                <p className="text-xs text-muted-foreground break-all">
                  Workspace: {workflow.workspacePath}
                </p>
              ) : null}
              {workflow.failureReason ? (
                <p className="text-sm text-destructive">
                  {workflow.failureReason}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Artifacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {artifacts.length === 0 ? (
              <p className="text-muted-foreground">None yet.</p>
            ) : (
              artifacts.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap gap-2 border-b border-border pb-2"
                >
                  <Badge variant="outline">{a.key}</Badge>
                  <span>{a.relativePath}</span>
                  <span className="text-xs text-muted-foreground">
                    v{a.version} · sha256:{a.checksumSha256.slice(0, 12)}…
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {runs.map((r) => (
                <div key={r.id} className="flex gap-2">
                  <Badge variant="secondary">{r.agentKind}</Badge>
                  <Badge variant="outline">{r.status}</Badge>
                  <span className="text-muted-foreground">v{r.version}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>QA checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {qaChecks.length === 0 ? (
                <p className="text-muted-foreground">No QA yet.</p>
              ) : (
                qaChecks.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <Badge
                      variant={
                        c.status === "passed"
                          ? "success"
                          : c.status === "failed"
                            ? "destructive"
                            : "muted"
                      }
                    >
                      {c.status}
                    </Badge>
                    <span>
                      {c.checkId}: {c.message}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Privileged actions</CardTitle>
            <CardDescription>
              Deploy, publication, spending, and destructive actions require
              explicit admin authorization. Agents cannot approve themselves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={requestAuthAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="workflowId" value={workflow.id} />
              <select
                name="action"
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                defaultValue="deploy"
              >
                <option value="deploy">Deploy</option>
                <option value="external_publication">Publication</option>
                <option value="spending">Spending</option>
                <option value="destructive">Destructive</option>
              </select>
              <Button type="submit" size="sm" variant="outline">
                Request authorization
              </Button>
            </form>
            <div className="space-y-2 text-sm">
              {authorizations
                .filter((a) => !a.workflowId || a.workflowId === workflow.id)
                .map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{a.action}</Badge>
                    <Badge variant="secondary">{a.status}</Badge>
                    {a.status === "pending" && user.role === "admin" ? (
                      <form action={approveAuthAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <Button type="submit" size="sm">
                          Approve
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ))}
            </div>
            <PrivilegedActionForm workflowId={workflow.id} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
