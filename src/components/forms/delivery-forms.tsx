"use client";

import { useActionState, useId, useMemo, useState } from "react";
import {
  createWorkflowAction,
  privilegedActionAction,
  runDeliveryAction,
  updateBriefAction,
  type DeliveryActionState,
} from "@/server/actions/delivery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: DeliveryActionState = { ok: false };

type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  intakeQuestions: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
    description?: string;
  }>;
};

export function CreateWorkflowForm({
  projects,
  templates,
}: {
  projects: Array<{ id: string; name: string }>;
  templates: TemplateSummary[];
}) {
  const [state, action, pending] = useActionState(
    createWorkflowAction,
    initial,
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? templates[0],
    [templateId, templates],
  );
  const formKey = useId();

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${formKey}-name`}>Name</Label>
          <Input
            id={`${formKey}-name`}
            name="name"
            required
            placeholder="Website delivery"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${formKey}-project`}>Project</Label>
          <select
            id={`${formKey}-project`}
            name="projectId"
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${formKey}-template`}>Template</Label>
          <select
            id={`${formKey}-template`}
            name="templateId"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${formKey}-mode`}>Mode</Label>
          <select
            id={`${formKey}-mode`}
            name="mode"
            defaultValue="mock"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="mock">Mock fixtures</option>
            <option value="live">Live credentials</option>
          </select>
        </div>
      </div>
      {template ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">
            {template.description}
          </p>
          {template.intakeQuestions.map((q) => (
            <div key={q.id} className="space-y-1">
              <Label htmlFor={`${formKey}-${q.id}`}>
                {q.label}
                {q.required ? " *" : ""}
              </Label>
              {q.type === "enum" && q.options ? (
                <select
                  id={`${formKey}-${q.id}`}
                  name={`brief.${q.id}`}
                  required={q.required}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {q.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`${formKey}-${q.id}`}
                  name={`brief.${q.id}`}
                  required={q.required}
                  placeholder={q.description}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}
      <Button type="submit" disabled={pending || !projects.length}>
        {pending ? "Creating…" : "Create workflow"}
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

export function UpdateBriefForm({
  workflowId,
  questions,
  initialBrief,
}: {
  workflowId: string;
  questions: TemplateSummary["intakeQuestions"];
  initialBrief: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(updateBriefAction, initial);
  const formKey = useId();
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workflowId" value={workflowId} />
      {questions.map((q) => (
        <div key={q.id} className="space-y-1">
          <Label htmlFor={`${formKey}-${q.id}`}>{q.label}</Label>
          <Input
            id={`${formKey}-${q.id}`}
            name={`brief.${q.id}`}
            defaultValue={initialBrief[q.id] ?? ""}
            required={q.required}
          />
        </div>
      ))}
      <Button type="submit" size="sm" disabled={pending}>
        Save brief
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

export function RunDeliveryForm({ workflowId }: { workflowId: string }) {
  const [state, action, pending] = useActionState(runDeliveryAction, initial);
  const idem = useId();
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="workflowId" value={workflowId} />
      <input
        type="hidden"
        name="idempotencyKey"
        value={`run_${workflowId}_${idem}`}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Running…" : "Run delivery + QA"}
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

export function PrivilegedActionForm({ workflowId }: { workflowId: string }) {
  const [state, action, pending] = useActionState(
    privilegedActionAction,
    initial,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="workflowId" value={workflowId} />
      <select
        name="action"
        className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        defaultValue="deploy"
      >
        <option value="deploy">Deploy</option>
        <option value="external_publication">External publication</option>
        <option value="spending">Spending</option>
        <option value="destructive">Destructive</option>
      </select>
      <Input name="note" placeholder="Note" className="max-w-xs" />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Attempt privileged action
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
