"use client";

import { useActionState, useMemo, useState } from "react";
import {
  importLeadsCsvAction,
  runResearchAction,
  updateScoreAction,
  type AcquisitionActionState,
} from "@/server/actions/acquisition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ScoreFactorInput } from "@/acquisition/types";

const initial: AcquisitionActionState = { ok: false };

export function CsvImportForm() {
  const [state, action, pending] = useActionState(
    importLeadsCsvAction,
    initial,
  );
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="csv">CSV content</Label>
        <Textarea
          id="csv"
          name="csv"
          className="min-h-[140px] font-mono text-xs"
          placeholder={`name,email,company,domain,websiteUrl,market,niche,status,serviceFit,notes\nAda,,Acme Analytics,acme.example,https://acme.example,B2B,analytics,new,60,From trade list`}
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Importing…" : "Import CSV"}
      </Button>
      {state.message ? (
        <p
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"
          }
        >
          {state.message}
          {state.details ? ` ${state.details}` : ""}
        </p>
      ) : null}
    </form>
  );
}

export function ResearchForm({
  braveConfigured,
  openrouterConfigured,
  allowMock,
}: {
  braveConfigured: boolean;
  openrouterConfigured: boolean;
  allowMock: boolean;
}) {
  const [state, action, pending] = useActionState(runResearchAction, initial);
  const defaultProvider = openrouterConfigured
    ? "openrouter"
    : braveConfigured
      ? "brave"
      : allowMock
        ? "mock"
        : "openrouter";
  const canResearch = openrouterConfigured || braveConfigured || allowMock;

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="query">Search query</Label>
        <Input
          id="query"
          name="query"
          required
          placeholder="independent branding studios in Austin"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="market">Market</Label>
        <Input id="market" name="market" placeholder="US" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="niche">Niche</Label>
        <Input id="niche" name="niche" placeholder="branding" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider">Provider</Label>
        <select
          id="provider"
          name="provider"
          defaultValue={defaultProvider}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="openrouter" disabled={!openrouterConfigured}>
            AI web search (OpenRouter)
            {!openrouterConfigured ? " (not configured)" : ""}
          </option>
          <option value="brave" disabled={!braveConfigured}>
            Brave Search{!braveConfigured ? " (not configured)" : ""}
          </option>
          {allowMock ? <option value="mock">Mock (tests/dev)</option> : null}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="serviceFit">Default service fit</Label>
        <Input
          id="serviceFit"
          name="serviceFit"
          type="number"
          min={0}
          max={100}
          defaultValue={50}
        />
      </div>
      <div className="md:col-span-2 space-y-2">
        {!canResearch ? (
          <p className="text-sm text-muted-foreground">
            No search provider configured — set OPENROUTER_API_KEY or
            BRAVE_SEARCH_API_KEY, or use manual/CSV import.
          </p>
        ) : null}
        <Button type="submit" disabled={pending || !canResearch}>
          {pending ? "Researching…" : "Run research"}
        </Button>
        {state.message ? (
          <p
            className={
              state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function ScoreEditorForm({
  leadId,
  factors: initialFactors,
}: {
  leadId: string;
  factors: ScoreFactorInput[];
}) {
  const [state, action, pending] = useActionState(updateScoreAction, initial);
  const [factors, setFactors] = useState(() =>
    initialFactors.map((f) => ({ ...f })),
  );
  const factorsJson = useMemo(() => JSON.stringify(factors), [factors]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="factorsJson" value={factorsJson} />
      <div className="grid gap-3">
        {factors.map((factor, index) => (
          <div
            key={factor.key}
            className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-4"
          >
            <div className="md:col-span-2">
              <p className="text-sm font-medium">{factor.label}</p>
              <p className="text-xs text-muted-foreground">{factor.kind}</p>
            </div>
            <label className="text-xs">
              Points
              <Input
                type="number"
                min={0}
                max={100}
                value={factor.points}
                onChange={(e) => {
                  const points = Number(e.target.value);
                  setFactors((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, points } : item,
                    ),
                  );
                }}
              />
            </label>
            <label className="text-xs">
              Weight
              <Input
                type="number"
                min={0}
                max={10}
                value={factor.weight}
                onChange={(e) => {
                  const weight = Number(e.target.value);
                  setFactors((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, weight } : item,
                    ),
                  );
                }}
              />
            </label>
            <label className="text-xs md:col-span-4">
              Rationale
              <Input
                value={factor.rationale}
                onChange={(e) => {
                  const rationale = e.target.value;
                  setFactors((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, rationale } : item,
                    ),
                  );
                }}
              />
            </label>
          </div>
        ))}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save score factors"}
      </Button>
      {state.message ? (
        <p
          className={
            state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
