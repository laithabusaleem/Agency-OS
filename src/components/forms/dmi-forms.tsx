"use client";

import { useActionState, useId } from "react";
import {
  createStrategyAction,
  runDmiResearchAction,
  type DmiActionState,
} from "@/server/actions/dmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: DmiActionState = { ok: false };

export function RunDmiResearchForm({
  leads,
}: {
  leads: Array<{ id: string; name: string; company: string | null }>;
}) {
  const [state, action, pending] = useActionState(runDmiResearchAction, initial);
  const id = useId();
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${id}-lead`}>Lead</Label>
        <select
          id={`${id}-lead`}
          name="leadId"
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.company || l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-service`}>Target service</Label>
        <Input
          id={`${id}-service`}
          name="targetService"
          defaultValue="website redesign"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-mode`}>Mode</Label>
        <select
          id={`${id}-mode`}
          name="mode"
          defaultValue="mock"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="mock">Mock fixtures</option>
          <option value="live">Live (Brave)</option>
        </select>
      </div>
      <Button type="submit" disabled={pending || !leads.length}>
        {pending ? "Researching…" : "Run decision-maker research"}
      </Button>
      {state.message ? (
        <p
          className={`text-sm ${state.ok ? "text-emerald-700" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function CreateStrategyForm({
  leadId,
  candidateId,
}: {
  leadId: string;
  candidateId?: string;
}) {
  const [state, action, pending] = useActionState(createStrategyAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      {candidateId ? (
        <input type="hidden" name="candidateId" value={candidateId} />
      ) : null}
      <Input
        name="serviceName"
        defaultValue="Website redesign"
        className="max-w-xs"
      />
      <Button type="submit" size="sm" disabled={pending}>
        Draft personalized strategy
      </Button>
      {state.message ? (
        <p
          className={`w-full text-sm ${state.ok ? "text-emerald-700" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
