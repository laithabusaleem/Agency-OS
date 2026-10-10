import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clients, leads, projects, services, tasks } from "@/db/schema";
import { createId } from "@/lib/id";
import type {
  ClientInput,
  LeadInput,
  ProjectInput,
  ServiceInput,
  TaskInput,
} from "@/lib/validations/entities";
import { assertOrgAccess, type AuthUser } from "@/server/authz-rules";

function emptyToNull(value?: string | null) {
  if (!value || value.trim() === "") return null;
  return value;
}

function now() {
  return new Date().toISOString();
}

export async function getDashboardStats(user: AuthUser) {
  const db = getDb();
  const org = user.organizationId;
  const [leadCount] = await db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.organizationId, org));
  const [clientCount] = await db
    .select({ value: count() })
    .from(clients)
    .where(eq(clients.organizationId, org));
  const [projectCount] = await db
    .select({ value: count() })
    .from(projects)
    .where(eq(projects.organizationId, org));
  const [taskCount] = await db
    .select({ value: count() })
    .from(tasks)
    .where(eq(tasks.organizationId, org));
  const [openTasks] = await db
    .select({ value: count() })
    .from(tasks)
    .where(and(eq(tasks.organizationId, org), eq(tasks.status, "todo")));

  return {
    leads: leadCount?.value ?? 0,
    clients: clientCount?.value ?? 0,
    projects: projectCount?.value ?? 0,
    tasks: taskCount?.value ?? 0,
    openTasks: openTasks?.value ?? 0,
  };
}

// ---- Leads ----
export async function listLeads(user: AuthUser) {
  return getDb().query.leads.findMany({
    where: eq(leads.organizationId, user.organizationId),
    orderBy: [desc(leads.createdAt)],
  });
}

export async function createLead(user: AuthUser, input: LeadInput) {
  const { normalizeProspect } = await import("@/acquisition/normalize");
  const normalized = normalizeProspect({
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    domain: input.domain,
    websiteUrl: input.websiteUrl,
    market: input.market,
    niche: input.niche,
    notes: input.notes,
    source: input.source || "manual",
    acquisitionSource: "manual",
    emailProvenance: input.email
      ? (input.emailProvenance ?? "observed")
      : "unknown",
    phoneProvenance: input.phone
      ? (input.phoneProvenance ?? "observed")
      : "unknown",
    nameProvenance: input.nameProvenance ?? "observed",
  });

  const id = createId("lead");
  const row = {
    id,
    organizationId: user.organizationId,
    name: normalized.name,
    email: normalized.email,
    company: emptyToNull(normalized.company),
    status: input.status,
    source: emptyToNull(normalized.source),
    notes: emptyToNull(normalized.notes),
    domain: normalized.domain,
    websiteUrl: normalized.websiteUrl,
    market: emptyToNull(normalized.market),
    niche: emptyToNull(normalized.niche),
    serviceFit: input.serviceFit ?? 0,
    score: 0,
    phone: emptyToNull(normalized.phone),
    emailProvenance: normalized.emailProvenance,
    phoneProvenance: normalized.phoneProvenance,
    nameProvenance: normalized.nameProvenance,
    acquisitionSource: "manual" as const,
    lastRetrievedAt: now(),
    isDemo: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await getDb().insert(leads).values(row);
  return row;
}

export async function updateLead(user: AuthUser, id: string, input: LeadInput) {
  const existing = await getDb().query.leads.findFirst({
    where: eq(leads.id, id),
  });
  if (!existing) return null;
  assertOrgAccess(user, existing.organizationId);
  const { normalizeProspect } = await import("@/acquisition/normalize");
  const normalized = normalizeProspect({
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    domain: input.domain,
    websiteUrl: input.websiteUrl,
    market: input.market,
    niche: input.niche,
    notes: input.notes,
    source: input.source || existing.source || "manual",
    emailProvenance: input.email
      ? (input.emailProvenance ?? "observed")
      : "unknown",
    phoneProvenance: input.phone
      ? (input.phoneProvenance ?? "observed")
      : "unknown",
    nameProvenance: input.nameProvenance ?? "observed",
  });
  const updated = {
    name: normalized.name,
    email: normalized.email,
    company: emptyToNull(normalized.company),
    status: input.status,
    source: emptyToNull(normalized.source),
    notes: emptyToNull(normalized.notes),
    domain: normalized.domain,
    websiteUrl: normalized.websiteUrl,
    market: emptyToNull(normalized.market),
    niche: emptyToNull(normalized.niche),
    serviceFit: input.serviceFit ?? existing.serviceFit,
    phone: emptyToNull(normalized.phone),
    emailProvenance: normalized.emailProvenance,
    phoneProvenance: normalized.phoneProvenance,
    nameProvenance: normalized.nameProvenance,
    updatedAt: now(),
  };
  await getDb().update(leads).set(updated).where(eq(leads.id, id));
  return { ...existing, ...updated };
}

export async function deleteLead(user: AuthUser, id: string) {
  const existing = await getDb().query.leads.findFirst({
    where: eq(leads.id, id),
  });
  if (!existing) return false;
  assertOrgAccess(user, existing.organizationId);
  await getDb().delete(leads).where(eq(leads.id, id));
  return true;
}

// ---- Clients ----
export async function listClients(user: AuthUser) {
  return getDb().query.clients.findMany({
    where: eq(clients.organizationId, user.organizationId),
    orderBy: [desc(clients.createdAt)],
  });
}

export async function createClient(user: AuthUser, input: ClientInput) {
  const id = createId("client");
  const row = {
    id,
    organizationId: user.organizationId,
    name: input.name,
    email: input.email,
    company: emptyToNull(input.company),
    phone: emptyToNull(input.phone),
    status: input.status,
    notes: emptyToNull(input.notes),
    isDemo: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await getDb().insert(clients).values(row);
  return row;
}

export async function updateClient(
  user: AuthUser,
  id: string,
  input: ClientInput,
) {
  const existing = await getDb().query.clients.findFirst({
    where: eq(clients.id, id),
  });
  if (!existing) return null;
  assertOrgAccess(user, existing.organizationId);
  const updated = {
    ...input,
    company: emptyToNull(input.company),
    phone: emptyToNull(input.phone),
    notes: emptyToNull(input.notes),
    updatedAt: now(),
  };
  await getDb().update(clients).set(updated).where(eq(clients.id, id));
  return { ...existing, ...updated };
}

export async function deleteClient(user: AuthUser, id: string) {
  const existing = await getDb().query.clients.findFirst({
    where: eq(clients.id, id),
  });
  if (!existing) return false;
  assertOrgAccess(user, existing.organizationId);
  await getDb().delete(clients).where(eq(clients.id, id));
  return true;
}

// ---- Services ----
export async function listServices(user: AuthUser) {
  return getDb().query.services.findMany({
    where: eq(services.organizationId, user.organizationId),
    orderBy: [desc(services.createdAt)],
  });
}

export async function createService(user: AuthUser, input: ServiceInput) {
  const id = createId("svc");
  const row = {
    id,
    organizationId: user.organizationId,
    name: input.name,
    description: emptyToNull(input.description),
    billingType: input.billingType,
    unitPriceCents: input.unitPriceCents,
    isActive: input.isActive,
    isDemo: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await getDb().insert(services).values(row);
  return row;
}

export async function updateService(
  user: AuthUser,
  id: string,
  input: ServiceInput,
) {
  const existing = await getDb().query.services.findFirst({
    where: eq(services.id, id),
  });
  if (!existing) return null;
  assertOrgAccess(user, existing.organizationId);
  const updated = {
    name: input.name,
    description: emptyToNull(input.description),
    billingType: input.billingType,
    unitPriceCents: input.unitPriceCents,
    isActive: input.isActive,
    updatedAt: now(),
  };
  await getDb().update(services).set(updated).where(eq(services.id, id));
  return { ...existing, ...updated };
}

export async function deleteService(user: AuthUser, id: string) {
  const existing = await getDb().query.services.findFirst({
    where: eq(services.id, id),
  });
  if (!existing) return false;
  assertOrgAccess(user, existing.organizationId);
  await getDb().delete(services).where(eq(services.id, id));
  return true;
}

// ---- Projects ----
export async function listProjects(user: AuthUser) {
  return getDb().query.projects.findMany({
    where: eq(projects.organizationId, user.organizationId),
    orderBy: [desc(projects.createdAt)],
  });
}

export async function createProject(user: AuthUser, input: ProjectInput) {
  if (input.clientId) {
    const client = await getDb().query.clients.findFirst({
      where: eq(clients.id, input.clientId),
    });
    if (!client) throw new Error("Client not found");
    assertOrgAccess(user, client.organizationId);
  }
  const id = createId("proj");
  const row = {
    id,
    organizationId: user.organizationId,
    clientId: emptyToNull(input.clientId),
    name: input.name,
    description: emptyToNull(input.description),
    status: input.status,
    startDate: emptyToNull(input.startDate),
    dueDate: emptyToNull(input.dueDate),
    isDemo: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await getDb().insert(projects).values(row);
  return row;
}

export async function updateProject(
  user: AuthUser,
  id: string,
  input: ProjectInput,
) {
  const existing = await getDb().query.projects.findFirst({
    where: eq(projects.id, id),
  });
  if (!existing) return null;
  assertOrgAccess(user, existing.organizationId);
  if (input.clientId) {
    const client = await getDb().query.clients.findFirst({
      where: eq(clients.id, input.clientId),
    });
    if (!client) throw new Error("Client not found");
    assertOrgAccess(user, client.organizationId);
  }
  const updated = {
    clientId: emptyToNull(input.clientId),
    name: input.name,
    description: emptyToNull(input.description),
    status: input.status,
    startDate: emptyToNull(input.startDate),
    dueDate: emptyToNull(input.dueDate),
    updatedAt: now(),
  };
  await getDb().update(projects).set(updated).where(eq(projects.id, id));
  return { ...existing, ...updated };
}

export async function deleteProject(user: AuthUser, id: string) {
  const existing = await getDb().query.projects.findFirst({
    where: eq(projects.id, id),
  });
  if (!existing) return false;
  assertOrgAccess(user, existing.organizationId);
  await getDb().delete(projects).where(eq(projects.id, id));
  return true;
}

// ---- Tasks ----
export async function listTasks(user: AuthUser) {
  return getDb().query.tasks.findMany({
    where: eq(tasks.organizationId, user.organizationId),
    orderBy: [desc(tasks.createdAt)],
  });
}

export async function createTask(user: AuthUser, input: TaskInput) {
  if (input.projectId) {
    const project = await getDb().query.projects.findFirst({
      where: eq(projects.id, input.projectId),
    });
    if (!project) throw new Error("Project not found");
    assertOrgAccess(user, project.organizationId);
  }
  const id = createId("task");
  const row = {
    id,
    organizationId: user.organizationId,
    projectId: emptyToNull(input.projectId),
    title: input.title,
    description: emptyToNull(input.description),
    status: input.status,
    priority: input.priority,
    assigneeId: emptyToNull(input.assigneeId),
    dueDate: emptyToNull(input.dueDate),
    isDemo: false,
    createdAt: now(),
    updatedAt: now(),
  };
  await getDb().insert(tasks).values(row);
  return row;
}

export async function updateTask(user: AuthUser, id: string, input: TaskInput) {
  const existing = await getDb().query.tasks.findFirst({
    where: eq(tasks.id, id),
  });
  if (!existing) return null;
  assertOrgAccess(user, existing.organizationId);
  if (input.projectId) {
    const project = await getDb().query.projects.findFirst({
      where: eq(projects.id, input.projectId),
    });
    if (!project) throw new Error("Project not found");
    assertOrgAccess(user, project.organizationId);
  }
  const updated = {
    projectId: emptyToNull(input.projectId),
    title: input.title,
    description: emptyToNull(input.description),
    status: input.status,
    priority: input.priority,
    assigneeId: emptyToNull(input.assigneeId),
    dueDate: emptyToNull(input.dueDate),
    updatedAt: now(),
  };
  await getDb().update(tasks).set(updated).where(eq(tasks.id, id));
  return { ...existing, ...updated };
}

export async function deleteTask(user: AuthUser, id: string) {
  const existing = await getDb().query.tasks.findFirst({
    where: eq(tasks.id, id),
  });
  if (!existing) return false;
  assertOrgAccess(user, existing.organizationId);
  await getDb().delete(tasks).where(eq(tasks.id, id));
  return true;
}
