import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const tariffs = await prisma.tariff.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(tariffs);
}
