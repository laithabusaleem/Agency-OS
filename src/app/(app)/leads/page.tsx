import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import {
  CsvImportForm,
  ResearchForm,
} from "@/components/forms/acquisition-forms";
import { LeadForm } from "@/components/forms/entity-forms";
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
import { getAcquisitionEnv } from "@/acquisition/config";
import { listResearchProviderStatus } from "@/acquisition/providers/registry";
import { createLeadAction, deleteLeadAction } from "@/server/actions/entities";
import { requireUser } from "@/server/authz";
import { listLeadsFiltered } from "@/server/services/acquisition";

export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filters = {
    market: first(params.market) || undefined,
    niche: first(params.niche) || undefined,
    status: first(params.status) || undefined,
    minScore: first(params.minScore)
      ? Number(first(params.minScore))
      : undefined,
    minServiceFit: first(params.minServiceFit)
      ? Number(first(params.minServiceFit))
      : undefined,
    q: first(params.q) || undefined,
  };

  const leads = await listLeadsFiltered(user, filters);
  const providers = listResearchProviderStatus();
  const openrouterConfigured = Boolean(
    providers.find((p) => p.id === "openrouter")?.configured,
  );
  const braveConfigured = Boolean(
    providers.find((p) => p.id === "brave")?.configured,
  );
  const allowMock = getAcquisitionEnv().ACQUISITION_ALLOW_MOCK;

  const exportQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== "") exportQuery.set(key, String(value));
  }

  return (
    <>
      <Topbar user={user} title="Leads" />
      <main className="space-y-6 px-4 py-6 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Filter by market, niche, service fit, score, and status. Contacts
              are never invented.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <input
                name="q"
                placeholder="Search"
                defaultValue={filters.q ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm md:col-span-2"
              />
              <input
                name="market"
                placeholder="Market"
                defaultValue={filters.market ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                name="niche"
                placeholder="Niche"
                defaultValue={filters.niche ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                name="minScore"
                type="number"
                min={0}
                max={100}
                placeholder="Min score"
                defaultValue={filters.minScore ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                name="minServiceFit"
                type="number"
                min={0}
                max={100}
                placeholder="Min fit"
                defaultValue={filters.minServiceFit ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <select
                name="status"
                defaultValue={filters.status ?? ""}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Any status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
              <div className="flex flex-wrap gap-2 md:col-span-6">
                <Button type="submit" size="sm">
                  Apply filters
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/leads/export?${exportQuery.toString()}`}>
                    Export CSV
                  </a>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Manual entry</CardTitle>
              <CardDescription>
                Always available when no research API is configured.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeadForm action={createLeadAction} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>CSV import</CardTitle>
              <CardDescription>
                Domain-based deduplication. Blank email means unknown — not
                invented.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CsvImportForm />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Research acquisition</CardTitle>
            <CardDescription>
              AI web search (OpenRouter) or Brave + permitted public fetches.
              Respects robots.txt, rate limits, and access blocks. No
              CAPTCHA/login bypass. Contacts are never invented.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResearchForm
              openrouterConfigured={openrouterConfigured}
              braveConfigured={braveConfigured}
              allowMock={allowMock}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {leads.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No leads match these filters.
              </CardContent>
            </Card>
          ) : (
            leads.map((lead) => (
              <Card key={lead.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="hover:underline"
                        >
                          {lead.name}
                        </Link>
                      </CardTitle>
                      <DemoBadge isDemo={lead.isDemo} />
                      <Badge variant="secondary">{lead.status}</Badge>
                      <Badge variant="outline">score {lead.score}</Badge>
                      <Badge variant="muted">fit {lead.serviceFit}</Badge>
                    </div>
                    <CardDescription>
                      {lead.email || "(email unknown)"} ·{" "}
                      {lead.domain || "no domain"} · {lead.market || "—"} /{" "}
                      {lead.niche || "—"} · email:{lead.emailProvenance}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/leads/${lead.id}`}>Evidence & score</Link>
                    </Button>
                    <form action={deleteLeadAction}>
                      <input type="hidden" name="id" value={lead.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        Delete
                      </Button>
                    </form>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </main>
    </>
  );
}
