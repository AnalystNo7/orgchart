import { NextRequest, NextResponse } from "next/server";
import { executeRedo } from "@/lib/action-logger";

export async function POST(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  try {
    const action = await executeRedo(scenarioId);
    if (!action) {
      return NextResponse.json({ error: "Нечего повторить" }, { status: 404 });
    }
    return NextResponse.json({ success: true, actionType: action.actionType });
  } catch (e) {
    console.error("Redo failed:", e);
    return NextResponse.json(
      { error: "Не удалось повторить действие" },
      { status: 500 }
    );
  }
}
