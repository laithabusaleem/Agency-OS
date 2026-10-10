"use client";

import { useActionState, useId, useState } from "react";
import {
  enqueueAgentJobAction,
  type AgentActionState,
} from "@/server/actions/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: AgentActionState = { ok: false };

type ProviderStatus = {
  id: string;
  name: string;
  configured: boolean;
  available: boolean;
};

export function AgentJobForm({ providers }: { providers: ProviderStatus[] }) {
  const [state, action, pending] = useActionState(
    enqueueAgentJobAction,
    initial,
  );
  const reactId = useId();
  const [idempotencyKey] = useState(() => `ui_${reactId.replace(/:/g, "")}`);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="agentType">Agent</Label>
        <select
          id="agentType"
          name="agentType"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue="summarize_text"
        >
          <option value="summarize_text">Summarize text</option>
          <option value="draft_outreach">Draft outreach</option>
          <option value="extract_entities">Extract entities</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider">Provider</Label>
        <select
          id="provider"
          name="provider"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue="mock"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.available}>
              {p.name}
              {!p.configured ? " (not configured)" : ""}
              {p.id === "mock" ? " — tests/dev" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="budgetCents">Job budget (cents)</Label>
        <Input
          id="budgetCents"
          name="budgetCents"
          type="number"
          min={0}
          defaultValue={100}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="idempotencyKey">Idempotency key</Label>
        <Input
          id="idempotencyKey"
          name="idempotencyKey"
          defaultValue={idempotencyKey}
          required
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="text">Input text</Label>
        <Textarea
          id="text"
          name="text"
          required
          defaultValue="Ada from Acme asked about a website redesign. Contact ada@acme.demo."
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enqueueing…" : "Enqueue job"}
        </Button>
        {state.message ? (
          <p
            className={
              state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"
            }
          >
            {state.message}
            {state.jobId ? ` (${state.jobId})` : ""}
          </p>
        ) : null}
      </div>
    </form>
  );
}
