import { normalizeProspect } from "@/acquisition/normalize";
import type { NormalizedProspect } from "@/acquisition/types";

export type CsvLeadRow = NormalizedProspect & {
  status?: string;
  serviceFit?: number;
  score?: number;
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function escapeCsv(value: string | number | null | undefined) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const HEADER = [
  "name",
  "email",
  "phone",
  "company",
  "domain",
  "websiteUrl",
  "market",
  "niche",
  "status",
  "serviceFit",
  "score",
  "notes",
  "source",
] as const;

export function parseLeadsCsv(content: string): {
  rows: CsvLeadRow[];
  errors: string[];
} {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ["CSV is empty"] };

  const headerCells = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const index = (name: string) => headerCells.indexOf(name.toLowerCase());

  const errors: string[] = [];
  const rows: CsvLeadRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    if (cells.every((c) => !c)) continue;
    try {
      const get = (key: string) => {
        const idx = index(key);
        return idx >= 0 ? (cells[idx] ?? "") : "";
      };
      const rawName = get("name");
      const rawEmail = get("email");
      const rawDomain = get("domain");
      const rawWebsite = get("websiteUrl") || get("website");
      if (
        !rawName &&
        !rawEmail &&
        !rawDomain &&
        !rawWebsite &&
        !get("company")
      ) {
        errors.push(`Row ${i + 1}: missing name/domain/email`);
        continue;
      }
      const prospect = normalizeProspect({
        name: rawName,
        email: rawEmail,
        phone: get("phone"),
        company: get("company"),
        domain: rawDomain,
        websiteUrl: rawWebsite,
        market: get("market"),
        niche: get("niche"),
        notes: get("notes"),
        source: get("source") || "csv",
        acquisitionSource: "csv",
        emailProvenance: rawEmail ? "observed" : "unknown",
        phoneProvenance: get("phone") ? "observed" : "unknown",
        nameProvenance: rawName ? "observed" : "unknown",
      });
      rows.push({
        ...prospect,
        status: get("status") || "new",
        serviceFit: Number(get("serviceFit") || 0) || 0,
        score: Number(get("score") || 0) || 0,
      });
    } catch (error) {
      errors.push(
        `Row ${i + 1}: ${error instanceof Error ? error.message : "parse error"}`,
      );
    }
  }

  return { rows, errors };
}

export function exportLeadsCsv(
  leads: Array<{
    name: string;
    email: string;
    phone?: string | null;
    company?: string | null;
    domain?: string | null;
    websiteUrl?: string | null;
    market?: string | null;
    niche?: string | null;
    status: string;
    serviceFit?: number | null;
    score?: number | null;
    notes?: string | null;
    source?: string | null;
  }>,
): string {
  const lines = [HEADER.join(",")];
  for (const lead of leads) {
    lines.push(
      [
        lead.name,
        lead.email,
        lead.phone ?? "",
        lead.company ?? "",
        lead.domain ?? "",
        lead.websiteUrl ?? "",
        lead.market ?? "",
        lead.niche ?? "",
        lead.status,
        lead.serviceFit ?? 0,
        lead.score ?? 0,
        lead.notes ?? "",
        lead.source ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
