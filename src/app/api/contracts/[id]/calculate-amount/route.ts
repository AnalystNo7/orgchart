import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkingHours } from "@/lib/work-calendar";

/**
 * Calculates contract amount based on assigned employees:
 * SUM(tariff.rate × employeeContract.fte × workingHours(contract.periodStart, contract.periodEnd))
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      employees: {
        include: {
          employee: {
            include: {
              tariff: true,
            },
          },
        },
      },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const workingHours = getWorkingHours(contract.periodStart, contract.periodEnd);

  let totalAmount = 0;
  const details: Array<{
    employeeId: string;
    fullName: string;
    tariffRate: number | null;
    fte: number;
    workingHours: number;
    subtotal: number;
    warning?: string;
  }> = [];

  for (const ec of contract.employees) {
    const tariffRate = ec.employee.tariff?.rate
      ? Number(ec.employee.tariff.rate)
      : null;

    const fte = Number(ec.fte);

    if (tariffRate === null) {
      details.push({
        employeeId: ec.employee.id,
        fullName: ec.employee.fullName,
        tariffRate: null,
        fte,
        workingHours,
        subtotal: 0,
        warning: "Не задана тарифная ставка. Исключён из расчёта.",
      });
      continue;
    }

    const subtotal = Math.round(tariffRate * fte * workingHours * 100) / 100;
    totalAmount += subtotal;

    details.push({
      employeeId: ec.employee.id,
      fullName: ec.employee.fullName,
      tariffRate,
      fte,
      workingHours,
      subtotal,
    });
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  return NextResponse.json({
    calculatedAmount: totalAmount,
    workingHours,
    details,
  });
}
