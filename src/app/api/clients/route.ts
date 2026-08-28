import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — list clients
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const clients = await prisma.client.findMany({
    where: {
      ...(status && { status: status as never }),
      ...(search && { name: { contains: search, mode: "insensitive" as const } }),
    },
    include: {
      contracts: { select: { id: true, name: true, type: true, amount: true, status: true } },
      _count: { select: { contracts: true, deals: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ clients });
}

// POST — create client
export async function POST(request: Request) {
  const body = await request.json();
  const { name, industry, contactPerson, phone, email, status, description } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      name,
      industry: industry || null,
      contactPerson: contactPerson || null,
      phone: phone || null,
      email: email || null,
      status: status || "PROSPECT",
      description: description || null,
    },
    include: {
      _count: { select: { contracts: true, deals: true } },
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}
