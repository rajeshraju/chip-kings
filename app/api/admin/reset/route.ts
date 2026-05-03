import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { purgeAllReports } from "@/lib/storage";
import { purgeAllReconciliations } from "@/lib/reconciliations";
import { purgeAllPotEntries } from "@/lib/pot";

export const runtime = "nodejs";

type ResetTarget = "reports" | "reconciliations" | "pot";

const VALID_TARGETS: ResetTarget[] = ["reports", "reconciliations", "pot"];

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      target?: unknown;
    };
    const target = String(body.target ?? "");
    if (!VALID_TARGETS.includes(target as ResetTarget)) {
      return NextResponse.json(
        { error: `Invalid target. Use one of: ${VALID_TARGETS.join(", ")}` },
        { status: 400 }
      );
    }

    switch (target as ResetTarget) {
      case "reports":
        await purgeAllReports();
        break;
      case "reconciliations":
        await purgeAllReconciliations();
        break;
      case "pot":
        await purgeAllPotEntries();
        break;
    }

    return NextResponse.json({ ok: true, target });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
