import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveWorkspaceRoot } from "@/delivery/config";
import { DeliveryError } from "@/delivery/errors";

/**
 * Isolated per-workflow workspace under data/workspaces/{org}/{project}/{workflow}.
 * Path traversal outside the workspace root is rejected.
 */
export function workspaceDir(input: {
  organizationId: string;
  projectId: string;
  workflowId: string;
  root?: string;
}) {
  const root = input.root ?? resolveWorkspaceRoot();
  const dir = path.resolve(
    root,
    sanitizeSegment(input.organizationId),
    sanitizeSegment(input.projectId),
    sanitizeSegment(input.workflowId),
  );
  assertInsideRoot(root, dir);
  return dir;
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function assertInsideRoot(root: string, target: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    throw new DeliveryError(
      "workspace_error",
      "Path escapes isolated workspace root",
    );
  }
}

export async function ensureWorkspace(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function resolveInWorkspace(workspace: string, relativePath: string) {
  const normalized = relativePath.replace(/^[/\\]+/, "");
  if (normalized.includes("..")) {
    throw new DeliveryError(
      "workspace_error",
      "Relative path must not contain '..'",
    );
  }
  const full = path.resolve(workspace, normalized);
  assertInsideRoot(workspace, full);
  return full;
}

export async function writeWorkspaceFile(
  workspace: string,
  relativePath: string,
  content: string | Buffer,
) {
  const full = resolveInWorkspace(workspace, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return {
    absolutePath: full,
    relativePath: normalizedRel(workspace, full),
    byteSize: buf.byteLength,
    checksumSha256: sha256(buf),
  };
}

export async function readWorkspaceFile(
  workspace: string,
  relativePath: string,
) {
  const full = resolveInWorkspace(workspace, relativePath);
  return fs.readFile(full);
}

export async function workspaceFileExists(
  workspace: string,
  relativePath: string,
) {
  try {
    await fs.access(resolveInWorkspace(workspace, relativePath));
    return true;
  } catch {
    return false;
  }
}

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

function normalizedRel(workspace: string, full: string) {
  return path.relative(workspace, full).split(path.sep).join("/");
}
