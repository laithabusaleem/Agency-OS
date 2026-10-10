import Link from "next/link";
import {
  CreateAuditForm,
  CreateCampaignForm,
  CreateDraftForm,
  SendMessageForm,
} from "@/components/forms/outreach-forms";
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
import { Input } from "@/components/ui/input";
import {
  addSuppressionAction,
  approveCampaignAction,
  setEmergencyStopAction,
  setSendingEnabledAction,
  stopCampaignAction,
  submitCampaignReviewAction,
} from "@/server/actions/outreach";
import { requireUser } from "@/server/authz";
import { listLeadsFiltered } from "@/server/services/acquisition";
import * as outreach from "@/server/services/outreach";

export const instant = false;

export default async function OutreachPage() {
  const user = await requireUser();
  const [status, leads, campaigns, audits, messages, suppressions] =
    await Promise.all([
      outreach.getOutreachStatus(user),
      listLeadsFiltered(user, {}),
      outreach.listCampaigns(user),
      outreach.listAudits(user),
      outreach.listMessages(user),
      outreach.listSuppressions(user),
    ]);

  const observedLeads = leads.filter(
    (l) => l.email && l.emailProvenance === "observed",
  );

  return (
    <>
      <Topbar user={user} title="Outreach" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Send controls</CardTitle>
            <CardDescription>
              Sending is disabled by default. Agents cannot override these
              gates. See docs/OUTREACH.md for Resend limitations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge
              variant={status.settings.sendingEnabled ? "success" : "muted"}
            >
              Sending {status.settings.sendingEnabled ? "ENABLED" : "DISABLED"}
            </Badge>
            <Badge
              variant={
                status.settings.emergencyStop ? "destructive" : "outline"
              }
            >
              Emergency stop {status.settings.emergencyStop ? "ON" : "OFF"}
            </Badge>
            <Badge variant="secondary">
              Daily quota {status.settings.dailyQuota}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link href="/outreach/review">Review queue</Link>
            </Button>
            {user.role === "admin" ? (
              <>
                <form action={setSendingEnabledAction}>
                  <input
                    type="hidden"
                    name="enabled"
                    value={status.settings.sendingEnabled ? "false" : "true"}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    {status.settings.sendingEnabled
                      ? "Disable sending"
                      : "Enable sending"}
                  </Button>
                </form>
                <form action={setEmergencyStopAction}>
                  <input
                    type="hidden"
                    name="enabled"
                    value={status.settings.emergencyStop ? "false" : "true"}
                  />
                  <Button type="submit" size="sm" variant="destructive">
                    {status.settings.emergencyStop
                      ? "Clear emergency stop"
                      : "Emergency stop"}
                  </Button>
                </form>
              </>
            ) : null}
            <div className="w-full text-xs text-muted-foreground">
              Senders:{" "}
              {status.senders
                .map((s) => `${s.name}${s.active ? " (active)" : ""}`)
                .join(" · ")}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Evidence-backed audit</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateAuditForm
                leads={leads.map((l) => ({ id: l.id, name: l.name }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Campaign</CardTitle>
              <CardDescription>
                Requires explicit admin approval before sends.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CreateCampaignForm />
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-muted-foreground">
                        {c.status} · sent {c.sentCount}/{c.sendLimit}
                        {c.approvedAt ? ` · approved ${c.approvedAt}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.status === "draft" || c.status === "rejected" ? (
                        <form action={submitCampaignReviewAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Submit review
                          </Button>
                        </form>
                      ) : null}
                      {user.role === "admin" &&
                      (c.status === "pending_review" ||
                        c.status === "draft") ? (
                        <form action={approveCampaignAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="hidden"
                            name="note"
                            value="Explicit approval"
                          />
                          <Button size="sm" type="submit">
                            Approve
                          </Button>
                        </form>
                      ) : null}
                      {c.status === "approved" || c.status === "active" ? (
                        <form action={stopCampaignAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="hidden"
                            name="reason"
                            value="Operator stop"
                          />
                          <Button size="sm" variant="destructive" type="submit">
                            Stop
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Message drafts</CardTitle>
            <CardDescription>
              Personalized outreach, proposals, audit summaries, follow-ups.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateDraftForm
              leads={observedLeads.map((l) => ({
                id: l.id,
                name: l.name,
                email: l.email,
              }))}
              campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
              audits={audits.map((a) => ({ id: a.id, title: a.title }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{m.subject}</p>
                    <Badge variant="secondary">{m.status}</Badge>
                    <Badge variant="outline">{m.type}</Badge>
                  </div>
                  <p className="text-muted-foreground">To {m.toEmail}</p>
                  {(m.status === "approved" || m.status === "scheduled") && (
                    <div className="mt-2">
                      <SendMessageForm messageId={m.id} />
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suppression list</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              action={addSuppressionAction}
              className="flex flex-wrap gap-2"
            >
              <Input
                name="email"
                type="email"
                placeholder="email@domain.com"
                required
              />
              <Input name="notes" placeholder="notes" />
              <Button type="submit" size="sm" variant="outline">
                Suppress
              </Button>
            </form>
            <div className="space-y-2 text-sm">
              {suppressions.map((s) => (
                <div key={s.id} className="flex gap-2">
                  <Badge variant="destructive">{s.reason}</Badge>
                  <span>{s.email}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
