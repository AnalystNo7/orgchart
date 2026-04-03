import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — client details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      contracts: {
        include: {
          employees: { include: { employee: { select: { id: true, fullName: true } } } },
        },
      },
      deals: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }

  return NextResponse.json({ client });
}

// PUT — update client
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, industry, contactPerson, phone, email, status, description } = body;

  const client = await prisma.client.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(industry !== undefined && { industry: industry || null }),
      ...(contactPerson !== undefined && { contactPerson: contactPerson || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(email !== undefined && { email: email || null }),
      ...(status !== undefined && { status }),
      ...(description !== undefined && { description: description || null }),
    },
    include: {
      _count: { select: { contracts: true, deals: true } },
    },
  });

  return NextResponse.json({ client });
}

// DELETE — delete client
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ message: "Клиент удалён" });
}
