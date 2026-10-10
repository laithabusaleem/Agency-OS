"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/server/actions/entities";

const initial: ActionState = { ok: false };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

function ActionMessage({ state }: { state: ActionState }) {
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

type Option = { value: string; label: string };

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Option[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LeadForm({
  action,
  defaults,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: Partial<{
    id: string;
    name: string;
    email: string;
    company: string;
    status: string;
    source: string;
    notes: string;
    domain: string;
    websiteUrl: string;
    market: string;
    niche: string;
    serviceFit: number;
    phone: string;
    emailProvenance: string;
  }>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      {defaults?.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaults?.name} required />
        <FieldError errors={state.fieldErrors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email (leave blank if unknown)</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaults?.email ?? ""}
        />
        <FieldError errors={state.fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company">Company</Label>
        <Input
          id="company"
          name="company"
          defaultValue={defaults?.company ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="domain">Domain</Label>
        <Input
          id="domain"
          name="domain"
          defaultValue={defaults?.domain ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="websiteUrl">Website</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          defaultValue={defaults?.websiteUrl ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={defaults?.phone ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="market">Market</Label>
        <Input
          id="market"
          name="market"
          defaultValue={defaults?.market ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="niche">Niche</Label>
        <Input id="niche" name="niche" defaultValue={defaults?.niche ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="serviceFit">Service fit (0-100)</Label>
        <Input
          id="serviceFit"
          name="serviceFit"
          type="number"
          min={0}
          max={100}
          defaultValue={defaults?.serviceFit ?? 0}
        />
      </div>
      <SelectField
        name="status"
        label="Status"
        defaultValue={defaults?.status ?? "new"}
        options={[
          { value: "new", label: "New" },
          { value: "contacted", label: "Contacted" },
          { value: "qualified", label: "Qualified" },
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
        ]}
      />
      <SelectField
        name="emailProvenance"
        label="Email provenance"
        defaultValue={
          defaults?.emailProvenance ??
          (defaults?.email ? "observed" : "unknown")
        }
        options={[
          { value: "observed", label: "Observed fact" },
          { value: "inferred", label: "Model inference" },
          { value: "unknown", label: "Unknown" },
        ]}
      />
      <div className="space-y-2">
        <Label htmlFor="source">Source</Label>
        <Input
          id="source"
          name="source"
          defaultValue={defaults?.source ?? ""}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={defaults?.notes ?? ""}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : defaults?.id ? "Update lead" : "Create lead"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function ClientForm({
  action,
  defaults,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: Partial<{
    id: string;
    name: string;
    email: string;
    company: string;
    phone: string;
    status: string;
    notes: string;
  }>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      {defaults?.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaults?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaults?.email}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company">Company</Label>
        <Input
          id="company"
          name="company"
          defaultValue={defaults?.company ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={defaults?.phone ?? ""} />
      </div>
      <SelectField
        name="status"
        label="Status"
        defaultValue={defaults?.status ?? "active"}
        options={[
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "churned", label: "Churned" },
        ]}
      />
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={defaults?.notes ?? ""}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : defaults?.id
              ? "Update client"
              : "Create client"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function ServiceForm({
  action,
  defaults,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: Partial<{
    id: string;
    name: string;
    description: string;
    billingType: string;
    unitPriceCents: number;
    isActive: boolean;
  }>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      {defaults?.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaults?.name} required />
      </div>
      <SelectField
        name="billingType"
        label="Billing type"
        defaultValue={defaults?.billingType ?? "fixed"}
        options={[
          { value: "fixed", label: "Fixed" },
          { value: "hourly", label: "Hourly" },
          { value: "retainer", label: "Retainer" },
        ]}
      />
      <div className="space-y-2">
        <Label htmlFor="unitPriceCents">Price (cents)</Label>
        <Input
          id="unitPriceCents"
          name="unitPriceCents"
          type="number"
          min={0}
          defaultValue={defaults?.unitPriceCents ?? 0}
          required
        />
      </div>
      <SelectField
        name="isActive"
        label="Active"
        defaultValue={defaults?.isActive === false ? "false" : "true"}
        options={[
          { value: "true", label: "Active" },
          { value: "false", label: "Inactive" },
        ]}
      />
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaults?.description ?? ""}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : defaults?.id
              ? "Update service"
              : "Create service"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function ProjectForm({
  action,
  defaults,
  clients,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  clients: Option[];
  defaults?: Partial<{
    id: string;
    name: string;
    description: string;
    clientId: string;
    status: string;
    startDate: string;
    dueDate: string;
  }>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      {defaults?.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaults?.name} required />
      </div>
      <SelectField
        name="clientId"
        label="Client"
        defaultValue={defaults?.clientId ?? ""}
        options={[{ value: "", label: "None" }, ...clients]}
      />
      <SelectField
        name="status"
        label="Status"
        defaultValue={defaults?.status ?? "planned"}
        options={[
          { value: "planned", label: "Planned" },
          { value: "active", label: "Active" },
          { value: "on_hold", label: "On hold" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />
      <div className="space-y-2">
        <Label htmlFor="startDate">Start date</Label>
        <Input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={defaults?.startDate ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dueDate">Due date</Label>
        <Input
          id="dueDate"
          name="dueDate"
          type="date"
          defaultValue={defaults?.dueDate ?? ""}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaults?.description ?? ""}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : defaults?.id
              ? "Update project"
              : "Create project"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function TaskForm({
  action,
  defaults,
  projects,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  projects: Option[];
  defaults?: Partial<{
    id: string;
    title: string;
    description: string;
    projectId: string;
    status: string;
    priority: string;
    dueDate: string;
  }>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      {defaults?.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={defaults?.title}
          required
        />
      </div>
      <SelectField
        name="projectId"
        label="Project"
        defaultValue={defaults?.projectId ?? ""}
        options={[{ value: "", label: "None" }, ...projects]}
      />
      <SelectField
        name="status"
        label="Status"
        defaultValue={defaults?.status ?? "todo"}
        options={[
          { value: "todo", label: "To do" },
          { value: "in_progress", label: "In progress" },
          { value: "blocked", label: "Blocked" },
          { value: "done", label: "Done" },
        ]}
      />
      <SelectField
        name="priority"
        label="Priority"
        defaultValue={defaults?.priority ?? "medium"}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]}
      />
      <div className="space-y-2">
        <Label htmlFor="dueDate">Due date</Label>
        <Input
          id="dueDate"
          name="dueDate"
          type="date"
          defaultValue={defaults?.dueDate ?? ""}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaults?.description ?? ""}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : defaults?.id ? "Update task" : "Create task"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
