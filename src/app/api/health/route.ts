import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Проба готовности для healthcheck контейнера и проверки после деплоя.
 * Открыта без авторизации (исключена в middleware) и не раскрывает данных:
 * только факт доступности приложения и БД.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "unavailable" }, { status: 503 });
  }
}
