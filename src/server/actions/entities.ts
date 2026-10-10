"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  clientSchema,
  leadSchema,
  projectSchema,
  serviceSchema,
  taskSchema,
} from "@/lib/validations/entities";
import { AuthorizationError, requireUser } from "@/server/authz";
import * as crud from "@/server/services/crud";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function fail(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionState {
  return { ok: false, message, fieldErrors };
}

function handleError(error: unknown, context: string): ActionState {
  if (error instanceof AuthorizationError) {
    return fail(error.message);
  }
  logger.error({ err: error, context }, "action failed");
  return fail("Something went wrong. Please try again.");
}

function parseForm<T>(schema: z.ZodType<T>, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.safeParse(raw);
}

// Leads
export async function createLeadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = parseForm(leadSchema, formData);
    if (!parsed.success) {
      return fail("Validation failed.", parsed.error.flatten().fieldErrors);
    }
    await crud.createLead(user, parsed.data);
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    return { ok: true, message: "Lead created." };
  } catch (error) {
    return handleError(error, "createLead");
  }
}

export async function updateLeadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const parsed = parseForm(leadSchema, formData);
    if (!id || !parsed.success) {
      return fail(
        "Validation failed.",
        parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      );
    }
    const updated = await crud.updateLead(user, id, parsed.data);
    if (!updated) return fail("Lead not found.");
    revalidatePath("/leads");
    revalidatePath("/dashboard");
    return { ok: true, message: "Lead updated." };
  } catch (error) {
    return handleError(error, "updateLead");
  }
}

export async function deleteLeadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await crud.deleteLead(user, id);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

// Clients
export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = parseForm(clientSchema, formData);
    if (!parsed.success) {
      return fail("Validation failed.", parsed.error.flatten().fieldErrors);
    }
    await crud.createClient(user, parsed.data);
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { ok: true, message: "Client created." };
  } catch (error) {
    return handleError(error, "createClient");
  }
}

export async function updateClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const parsed = parseForm(clientSchema, formData);
    if (!id || !parsed.success) {
      return fail(
        "Validation failed.",
        parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      );
    }
    const updated = await crud.updateClient(user, id, parsed.data);
    if (!updated) return fail("Client not found.");
    revalidatePath("/clients");
    return { ok: true, message: "Client updated." };
  } catch (error) {
    return handleError(error, "updateClient");
  }
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await crud.deleteClient(user, id);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
}

// Services
export async function createServiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = parseForm(serviceSchema, formData);
    if (!parsed.success) {
      return fail("Validation failed.", parsed.error.flatten().fieldErrors);
    }
    await crud.createService(user, parsed.data);
    revalidatePath("/services");
    return { ok: true, message: "Service created." };
  } catch (error) {
    return handleError(error, "createService");
  }
}

export async function updateServiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const parsed = parseForm(serviceSchema, formData);
    if (!id || !parsed.success) {
      return fail(
        "Validation failed.",
        parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      );
    }
    const updated = await crud.updateService(user, id, parsed.data);
    if (!updated) return fail("Service not found.");
    revalidatePath("/services");
    return { ok: true, message: "Service updated." };
  } catch (error) {
    return handleError(error, "updateService");
  }
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await crud.deleteService(user, id);
  revalidatePath("/services");
}

// Projects
export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = parseForm(projectSchema, formData);
    if (!parsed.success) {
      return fail("Validation failed.", parsed.error.flatten().fieldErrors);
    }
    await crud.createProject(user, parsed.data);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { ok: true, message: "Project created." };
  } catch (error) {
    return handleError(error, "createProject");
  }
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const parsed = parseForm(projectSchema, formData);
    if (!id || !parsed.success) {
      return fail(
        "Validation failed.",
        parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      );
    }
    const updated = await crud.updateProject(user, id, parsed.data);
    if (!updated) return fail("Project not found.");
    revalidatePath("/projects");
    return { ok: true, message: "Project updated." };
  } catch (error) {
    return handleError(error, "updateProject");
  }
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await crud.deleteProject(user, id);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

// Tasks
export async function createTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const parsed = parseForm(taskSchema, formData);
    if (!parsed.success) {
      return fail("Validation failed.", parsed.error.flatten().fieldErrors);
    }
    await crud.createTask(user, parsed.data);
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { ok: true, message: "Task created." };
  } catch (error) {
    return handleError(error, "createTask");
  }
}

export async function updateTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const parsed = parseForm(taskSchema, formData);
    if (!id || !parsed.success) {
      return fail(
        "Validation failed.",
        parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      );
    }
    const updated = await crud.updateTask(user, id, parsed.data);
    if (!updated) return fail("Task not found.");
    revalidatePath("/tasks");
    return { ok: true, message: "Task updated." };
  } catch (error) {
    return handleError(error, "updateTask");
  }
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  await crud.deleteTask(user, id);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
