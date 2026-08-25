import { prisma } from "@/lib/db";
import { getWorkingHours } from "@/lib/work-calendar";

/**
 * Recalculates and updates the amount/expectedAmount for a contract
 * if amountAutoCalc is enabled.
 */
export async function recalcContractAmount(contractId: string): Promise<void> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      employees: {
        include: {
          employee: {
            include: { tariff: true },
          },
        },
      },
    },
  });

  if (!contract || !contract.amountAutoCalc) return;

  let calculatedAmount = 0;

  // Часы — по периоду КАЖДОЙ привязки (обеспечения), не всего договора:
  // при помесячных привязках прежняя формула умножала часы всего срока
  // на каждую строку и завышала сумму в число месяцев.
  for (const ec of contract.employees) {
    const tariffRate = ec.employee.tariff?.rate
      ? Number(ec.employee.tariff.rate)
      : null;
    if (tariffRate !== null) {
      calculatedAmount +=
        tariffRate * Number(ec.fte) * getWorkingHours(ec.periodStart, ec.periodEnd);
    }
  }

  calculatedAmount = Math.round(calculatedAmount * 100) / 100;

  await prisma.contract.update({
    where: { id: contractId },
    data:
      contract.status === "CONCLUDED"
        ? { amount: calculatedAmount }
        : { expectedAmount: calculatedAmount },
  });
}
