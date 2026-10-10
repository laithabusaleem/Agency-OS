import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/authz";
import { exportOrgLeadsCsv } from "@/server/services/acquisition";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!host) return false;
  if (!origin) {
    // Same-site navigations may omit Origin; require Fetch metadata for GET
    const site = request.headers.get("sec-fetch-site");
    return (
      !site || site === "same-origin" || site === "same-site" || site === "none"
    );
  }
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

async function exportCsv(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let body: Record<string, string> = {};
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = ((await request.json().catch(() => ({}))) ?? {}) as Record<
        string,
        string
      >;
    }
  }

  const pick = (key: string) => body[key] ?? searchParams.get(key) ?? undefined;

  const csv = await exportOrgLeadsCsv(user, {
    market: pick("market") || undefined,
    niche: pick("niche") || undefined,
    status: pick("status") || undefined,
    minScore: pick("minScore") ? Number(pick("minScore")) : undefined,
    minServiceFit: pick("minServiceFit")
      ? Number(pick("minServiceFit"))
      : undefined,
    q: pick("q") || undefined,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads-export.csv"',
      "Cache-Control": "no-store",
    },
  });
}

/** Prefer POST from the app; GET kept with same-origin checks. */
export async function GET(request: Request) {
  return exportCsv(request);
}

export async function POST(request: Request) {
  return exportCsv(request);
}
