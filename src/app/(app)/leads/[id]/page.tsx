import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreEditorForm } from "@/components/forms/acquisition-forms";
import { LeadForm } from "@/components/forms/entity-forms";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { updateLeadAction } from "@/server/actions/entities";
import { requireUser } from "@/server/authz";
import { getLeadDetail } from "@/server/services/acquisition";

export const instant = false;

type Params = Promise<{ id: string }>;

export default async function LeadDetailPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getLeadDetail(user, id);
  if (!detail) notFound();

  const { lead, evidence, factors } = detail;
  const scoreInputs = factors.map((f) => ({
    key: f.key,
    label: f.label,
    points: f.points,
    weight: f.weight,
    kind: f.kind,
    rationale: f.rationale,
    evidenceIds: JSON.parse(f.evidenceIdsJson || "[]") as string[],
  }));

  return (
    <>
      <Topbar user={user} title={lead.name} />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <p className="text-sm">
          <Link href="/leads" className="text-muted-foreground hover:underline">
            ← Back to leads
          </Link>
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Lead profile</CardTitle>
            <CardDescription>
              Provenance: name={lead.nameProvenance}, email=
              {lead.emailProvenance}, phone={lead.phoneProvenance}. Last
              retrieved {formatDate(lead.lastRetrievedAt)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{lead.status}</Badge>
              <Badge variant="outline">score {lead.score}</Badge>
              <Badge variant="muted">fit {lead.serviceFit}</Badge>
              <Badge variant="outline">{lead.acquisitionSource}</Badge>
            </div>
            <LeadForm
              action={updateLeadAction}
              defaults={{
                id: lead.id,
                name: lead.name,
                email: lead.email,
                company: lead.company ?? "",
                status: lead.status,
                source: lead.source ?? "",
                notes: lead.notes ?? "",
                domain: lead.domain ?? "",
                websiteUrl: lead.websiteUrl ?? "",
                market: lead.market ?? "",
                niche: lead.niche ?? "",
                serviceFit: lead.serviceFit,
                phone: lead.phone ?? "",
                emailProvenance: lead.emailProvenance,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editable scoring</CardTitle>
            <CardDescription>
              Each factor stores kind (fact / inference / unknown) and links to
              evidence IDs behind the score.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreEditorForm leadId={lead.id} factors={scoreInputs} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
            <CardDescription>
              Observed facts, model inferences, and unknown values with
              retrieval timestamps. Stale rows are flagged after TTL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">No evidence yet.</p>
            ) : (
              evidence.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        item.kind === "fact"
                          ? "success"
                          : item.kind === "inference"
                            ? "secondary"
                            : "muted"
                      }
                    >
                      {item.kind}
                    </Badge>
                    <Badge variant="outline">{item.field}</Badge>
                    <Badge variant="outline">{item.sourceType}</Badge>
                    {item.isStale ? (
                      <Badge variant="destructive">stale</Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      retrieved {formatDate(item.retrievedAt)}
                    </span>
                  </div>
                  <p className="mt-2 font-medium">{item.claim}</p>
                  {item.value ? (
                    <p className="text-muted-foreground">Value: {item.value}</p>
                  ) : null}
                  {item.sourceUrl ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.sourceUrl}
                    </p>
                  ) : null}
                  {item.rawExcerpt ? (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                      {item.rawExcerpt}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
