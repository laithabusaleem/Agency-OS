import Link from "next/link";
import {
  CreateStrategyForm,
  RunDmiResearchForm,
} from "@/components/forms/dmi-forms";
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
  approveStrategyAction,
  markEvidenceOutdatedAction,
  rejectCandidateAction,
} from "@/server/actions/dmi";
import { requireUser } from "@/server/authz";
import { listLeadsFiltered } from "@/server/services/acquisition";
import * as dmi from "@/server/services/dmi";

export const instant = false;

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ candidateId?: string }>;
}) {
  const user = await requireUser();
  const { candidateId } = await searchParams;
  const [candidates, leads] = await Promise.all([
    dmi.listCandidates(user),
    listLeadsFiltered(user, {}),
  ]);
  const selectedId = candidateId || candidates[0]?.id;
  const detail = selectedId
    ? await dmi.getCandidateDetail(user, selectedId)
    : null;

  return (
    <>
      <Topbar user={user} title="Decision-maker intelligence" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Research decision-makers</CardTitle>
            <CardDescription>
              Evidence-backed identification between lead discovery and outreach.
              Contacts are never invented; confidence reflects sources, not model
              certainty.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RunDmiResearchForm
              leads={leads.map((l) => ({
                id: l.id,
                name: l.name,
                company: l.company,
              }))}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {candidates.length === 0 ? (
                <p className="text-muted-foreground">No candidates yet.</p>
              ) : (
                candidates.map((c) => (
                  <Link
                    key={c.id}
                    href={`/intelligence?candidateId=${c.id}`}
                    className={`block rounded-md border px-3 py-2 ${
                      c.id === selectedId
                        ? "border-primary bg-muted/40"
                        : "border-border"
                    }`}
                  >
                    <p className="font-medium">{c.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.currentRole || "Role unknown"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline">{c.researchStatus}</Badge>
                      <Badge variant="muted">conf {c.roleConfidence}</Badge>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {!detail ? (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  Select a candidate or run research on a qualified lead.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{detail.candidate.fullName}</CardTitle>
                    <CardDescription>
                      {detail.candidate.currentRole} ·{" "}
                      {detail.candidate.decisionMakerType}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>
                      <span className="text-muted-foreground">Company: </span>
                      {detail.lead?.company || "—"}
                      {detail.lead?.domain ? (
                        <>
                          {" · "}
                          <a
                            href={`https://${detail.lead.domain}`}
                            className="text-primary underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {detail.lead.domain}
                          </a>
                        </>
                      ) : null}
                    </p>
                    <p>{detail.candidate.professionalSummary}</p>
                    <p className="text-muted-foreground">
                      Why relevant: service score{" "}
                      {detail.candidate.serviceRelevanceScore}; target{" "}
                      {detail.candidate.targetService || "—"}
                      {detail.strategies[0]?.opportunity
                        ? `; opportunity: ${detail.strategies[0].opportunity}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last verified:{" "}
                      {detail.candidate.lastVerifiedAt || "not verified"}
                      {" · "}
                      Decision confidence: {detail.candidate.roleConfidence}
                    </p>
                    {detail.strategies[0]?.nextStep ? (
                      <p className="text-xs">
                        Next permitted action: {detail.strategies[0].nextStep}
                      </p>
                    ) : null}
                    {detail.candidate.uncertaintyNotes ? (
                      <p className="text-destructive">
                        {detail.candidate.uncertaintyNotes}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <form action={rejectCandidateAction}>
                        <input
                          type="hidden"
                          name="candidateId"
                          value={detail.candidate.id}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Reject match
                        </Button>
                      </form>
                      <CreateStrategyForm
                        leadId={detail.candidate.leadId}
                        candidateId={detail.candidate.id}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Evidence</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {detail.evidence.map((e) => (
                      <div
                        key={e.id}
                        className="border-b border-border pb-3 last:border-0"
                      >
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={
                              e.verificationStatus === "verified"
                                ? "success"
                                : "muted"
                            }
                          >
                            {e.kind} / {e.verificationStatus}
                          </Badge>
                          <Badge variant="outline">{e.sourceType}</Badge>
                        </div>
                        <p className="mt-1">{e.claim}</p>
                        {e.supportingExcerpt ? (
                          <p className="text-xs text-muted-foreground">
                            “{e.supportingExcerpt}”
                          </p>
                        ) : null}
                        <a
                          href={e.sourceUrl}
                          className="text-xs text-primary underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.sourceUrl}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          Retrieved {e.retrievedAt}
                        </p>
                        <form action={markEvidenceOutdatedAction}>
                          <input type="hidden" name="evidenceId" value={e.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            Mark outdated
                          </Button>
                        </form>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Contact channels</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {detail.channels.length === 0 ? (
                      <p className="text-muted-foreground">
                        No channel discovered — use company-level alternatives.
                      </p>
                    ) : (
                      detail.channels.map((ch) => (
                        <div key={ch.id} className="flex flex-wrap gap-2">
                          <Badge variant="outline">{ch.channelType}</Badge>
                          <Badge
                            variant={
                              ch.provenance === "verified"
                                ? "success"
                                : ch.provenance === "inferred"
                                  ? "destructive"
                                  : "muted"
                            }
                          >
                            {ch.provenance}
                          </Badge>
                          <span>{ch.value || "(empty)"}</span>
                          <span className="text-xs text-muted-foreground">
                            via {ch.discoveryMethod}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Personalized strategies</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    {detail.strategies.length === 0 ? (
                      <p className="text-muted-foreground">None yet.</p>
                    ) : (
                      detail.strategies.map((s) => (
                        <div
                          key={s.id}
                          className="space-y-2 border-b border-border pb-4 last:border-0"
                        >
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{s.status}</Badge>
                            <Badge variant="muted">
                              confidence {s.confidence}
                            </Badge>
                          </div>
                          <p className="font-medium">{s.subjectLine}</p>
                          <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
                            {s.primaryMessage}
                          </pre>
                          <p className="text-muted-foreground">
                            Evidence: {s.evidenceExplanation}
                          </p>
                          <p className="text-xs">Next: {s.nextStep}</p>
                          {s.status !== "approved" && user.role === "admin" ? (
                            <form action={approveStrategyAction}>
                              <input
                                type="hidden"
                                name="strategyId"
                                value={s.id}
                              />
                              <Button type="submit" size="sm">
                                Approve strategy
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Relationship memory</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {detail.interactions.map((i) => (
                      <div key={i.id} className="flex gap-2">
                        <Badge variant="secondary">{i.type}</Badge>
                        <span>{i.summary}</span>
                        <span className="text-xs text-muted-foreground">
                          {i.createdAt}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
