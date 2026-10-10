"use client";

import { useActionState, useId } from "react";
import {
  createAuditAction,
  createCampaignAction,
  createDraftAction,
  sendMessageAction,
  type OutreachActionState,
} from "@/server/actions/outreach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: OutreachActionState = { ok: false };

function Message({ state }: { state: OutreachActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={
        state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"
      }
    >
      {state.message}
    </p>
  );
}

export function CreateAuditForm({
  leads,
}: {
  leads: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createAuditAction, initial);
  return (
    <form action={action} className="grid gap-3">
      <div className="space-y-2">
        <Label htmlFor="leadId">Lead</Label>
        <select
          id="leadId"
          name="leadId"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue="Evidence-backed teardown"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="summary">Summary</Label>
        <Textarea id="summary" name="summary" required />
      </div>
      <Button type="submit" disabled={pending || leads.length === 0}>
        {pending ? "Creating…" : "Create audit"}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function CreateCampaignForm() {
  const [state, action, pending] = useActionState(
    createCampaignAction,
    initial,
  );
  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="name">Campaign name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sendLimit">Send limit</Label>
        <Input
          id="sendLimit"
          name="sendLimit"
          type="number"
          min={1}
          defaultValue={25}
        />
      </div>
      <div className="md:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create campaign"}
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function CreateDraftForm({
  leads,
  campaigns,
  audits,
}: {
  leads: Array<{ id: string; name: string; email: string }>;
  campaigns: Array<{ id: string; name: string }>;
  audits: Array<{ id: string; title: string }>;
}) {
  const [state, action, pending] = useActionState(createDraftAction, initial);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="leadId">Lead (observed email required)</Label>
        <select
          id="leadId"
          name="leadId"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} {l.email ? `<${l.email}>` : "(no email)"}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Draft type</Label>
        <select
          id="type"
          name="type"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue="personalized_outreach"
        >
          <option value="personalized_outreach">Personalized outreach</option>
          <option value="audit_summary">Audit summary</option>
          <option value="proposal">Proposal</option>
          <option value="follow_up">Follow-up</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaignId">Campaign</Label>
        <select
          id="campaignId"
          name="campaignId"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue=""
        >
          <option value="">None</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="auditId">Audit</Label>
        <select
          id="auditId"
          name="auditId"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue=""
        >
          <option value="">None</option>
          {audits.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scheduledFor">Follow-up schedule (optional)</Label>
        <Input id="scheduledFor" name="scheduledFor" type="datetime-local" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="serviceName">Proposal service name</Label>
        <Input id="serviceName" name="serviceName" placeholder="Brand sprint" />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending || leads.length === 0}>
          {pending ? "Drafting…" : "Create draft"}
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function SendMessageForm({ messageId }: { messageId: string }) {
  const [state, action, pending] = useActionState(sendMessageAction, initial);
  const reactId = useId();
  const idempotencyKey = `ui_${messageId}_${reactId.replace(/:/g, "")}`;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Send (server gates)"}
      </Button>
      <Message state={state} />
    </form>
  );
}
