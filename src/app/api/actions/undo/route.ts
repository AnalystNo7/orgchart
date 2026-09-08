import { NextRequest, NextResponse } from "next/server";
import { executeUndo, UndoRefusedError } from "@/lib/action-logger";

export async function POST(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenarioId");
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  try {
    const action = await executeUndo(scenarioId);
    if (!action) {
      return NextResponse.json({ error: "Нечего отменять" }, { status: 404 });
    }
    return NextResponse.json({ success: true, actionType: action.actionType });
  } catch (e) {
    if (e instanceof UndoRefusedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("Undo failed:", e);
    return NextResponse.json(
      { error: "Не удалось отменить действие" },
      { status: 500 }
    );
  }
}
