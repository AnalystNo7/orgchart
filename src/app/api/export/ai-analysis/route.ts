import { NextRequest, NextResponse } from "next/server";
import { buildAiExportMarkdown } from "@/lib/ai-export";

/**
 * GET /api/export/ai-analysis?scenarioId=...
 *
 * Returns a single Markdown file with a full analytical snapshot of the
 * scenario (metadata, metrics, shetil aggregates, full org hierarchy, P&L
 * in both "fte" and "transfer" allocation modes, TP flows, anonymized
 * employees, contracts, employee-contract links and tariffs).
 *
 * The file is intended to be uploaded into an external LLM (Claude Opus)
 * for free-form analysis. See src/lib/ai-export.ts for the builder.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scenarioId = searchParams.get("scenarioId");

  if (!scenarioId) {
    return NextResponse.json(
      { error: "scenarioId is required" },
      { status: 400 }
    );
  }

  try {
    const md = await buildAiExportMarkdown(scenarioId);

    const safeName = scenarioId.slice(0, 8);
    const filename = `orgchart-ai-export-${safeName}-${
      new Date().toISOString().split("T")[0]
    }.md`;

    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/export/ai-analysis] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
