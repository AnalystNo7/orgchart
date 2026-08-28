import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET — get diagram with all steps and links
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const diagram = await prisma.processDiagram.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { sortOrder: "asc" } },
      links: true,
    },
  });

  if (!diagram) {
    return NextResponse.json({ error: "Диаграмма не найдена" }, { status: 404 });
  }

  return NextResponse.json({ diagram });
}

// PUT — update diagram (save steps, links, layout in bulk)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { steps, links, layout, name } = body;

  // Update layout/name
  await prisma.processDiagram.update({
    where: { id },
    data: {
      ...(layout !== undefined && { layout }),
      ...(name !== undefined && { name }),
    },
  });

  // Replace steps if provided
  if (steps && Array.isArray(steps)) {
    await prisma.processStepLink.deleteMany({ where: { diagramId: id } });
    await prisma.processStep.deleteMany({ where: { diagramId: id } });

    const stepIdMap = new Map<string, string>();

    for (const step of steps) {
      const created = await prisma.processStep.create({
        data: {
          diagramId: id,
          type: step.type,
          label: step.label,
          description: step.description || null,
          positionX: step.positionX || 0,
          positionY: step.positionY || 0,
          width: step.width || 150,
          height: step.height || 50,
          metadata: step.metadata || null,
          sortOrder: step.sortOrder || 0,
        },
      });
      stepIdMap.set(step.id || step.tempId, created.id);
    }

    // Create links with mapped IDs
    if (links && Array.isArray(links)) {
      for (const link of links) {
        const sourceId = stepIdMap.get(link.sourceId) || link.sourceId;
        const targetId = stepIdMap.get(link.targetId) || link.targetId;
        await prisma.processStepLink.create({
          data: {
            diagramId: id,
            sourceId,
            targetId,
            label: link.label || null,
            condition: link.condition || null,
            metadata: link.metadata || null,
          },
        });
      }
    }
  }

  const updated = await prisma.processDiagram.findUnique({
    where: { id },
    include: { steps: { orderBy: { sortOrder: "asc" } }, links: true },
  });

  return NextResponse.json({ diagram: updated });
}

// DELETE — delete diagram
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.processDiagram.delete({ where: { id } });
  return NextResponse.json({ message: "Диаграмма удалена" });
}
