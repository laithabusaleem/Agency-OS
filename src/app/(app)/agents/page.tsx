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
import { AgentJobForm } from "@/components/forms/agent-job-form";
import { AgentCoordinator } from "@/agent/coordinator";
import { getDb } from "@/db/client";
import { formatDate } from "@/lib/utils";
import {
  cancelAgentJobAction,
  setAgentKillSwitchAction,
} from "@/server/actions/agents";
import { requireUser } from "@/server/authz";

export const instant = false;

export default async function AgentsPage() {
  const user = await requireUser();
  const coordinator = new AgentCoordinator(getDb());
  await coordinator.init();
  const [jobs, runtime] = await Promise.all([
    coordinator.list(user.organizationId, 30),
    coordinator.runtimeStatus(),
  ]);

  return (
    <>
      <Topbar user={user} title="Agents" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Runtime controls</CardTitle>
            <CardDescription>
              Kill switch and budgets are enforced server-side. Mock never
              silently replaces a configured provider in production.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge
              variant={runtime.killSwitchEnabled ? "destructive" : "success"}
            >
              Kill switch {runtime.killSwitchEnabled ? "ON" : "OFF"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Global spend {runtime.globalSpendCents}¢ /{" "}
              {runtime.globalBudgetCents}¢
            </span>
            {user.role === "admin" ? (
              <form action={setAgentKillSwitchAction}>
                <input
                  type="hidden"
                  name="enabled"
                  value={runtime.killSwitchEnabled ? "false" : "true"}
                />
                <Button type="submit" variant="outline" size="sm">
                  {runtime.killSwitchEnabled
                    ? "Disable kill switch"
                    : "Enable kill switch"}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enqueue agent job</CardTitle>
            <CardDescription>
              Jobs persist in SQLite and are processed by `npm run worker`.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentJobForm providers={runtime.providers} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {jobs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No agent jobs yet.
              </CardContent>
            </Card>
          ) : (
            jobs.map((job) => (
              <Card key={job.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{job.agentType}</CardTitle>
                    <CardDescription>
                      {job.provider}/{job.model} · attempts {job.attemptCount}/
                      {job.maxAttempts} · {formatDate(job.createdAt)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{job.status}</Badge>
                    {job.status === "dead_letter" ? (
                      <Badge variant="destructive">DLQ</Badge>
                    ) : null}
                    {![
                      "succeeded",
                      "cancelled",
                      "dead_letter",
                      "timed_out",
                      "failed",
                    ].includes(job.status) ? (
                      <form action={cancelAgentJobAction}>
                        <input type="hidden" name="id" value={job.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Cancel
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    Tokens: {job.totalTokens} · Latency: {job.latencyMs ?? "—"}
                    ms · Est. cost: {job.costCentsEstimate}¢
                  </p>
                  {job.lastError ? (
                    <p className="text-destructive">{job.lastError}</p>
                  ) : null}
                  {job.deadLetterReason ? (
                    <p className="text-muted-foreground">
                      Dead-letter reason: {job.deadLetterReason}
                    </p>
                  ) : null}
                  {job.outputJson ? (
                    <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs">
                      {job.outputJson}
                    </pre>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </>
  );
}
