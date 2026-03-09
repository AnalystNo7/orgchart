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

  const workingHours = getWorkingHours(contract.periodStart, contract.periodEnd);
  let calculatedAmount = 0;

  for (const ec of contract.employees) {
    const tariffRate = ec.employee.tariff?.rate
      ? Number(ec.employee.tariff.rate)
      : null;
    if (tariffRate !== null) {
      calculatedAmount += tariffRate * Number(ec.fte) * workingHours;
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
