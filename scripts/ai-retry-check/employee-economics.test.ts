/* Проверка инструмента get_employee_economics и единиц get_unit_economics
 * на фикстуре в БД (создаёт временный сценарий и удаляет его).
 * Запуск: set -a; . ./.env; set +a; npx tsx scripts/ai-retry-check/employee-economics.test.ts */
import { prisma } from "@/lib/db";
import { executeTool } from "@/lib/ai/tool-executor";
import { getWorkingHours } from "@/lib/work-calendar";

let failed = 0;
const check = (n: string, c: boolean, i = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${i ? "  (" + i + ")" : ""}`); if (!c) failed++; };

async function main() {
  const year = new Date().getUTCFullYear();
  const H = getWorkingHours(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 11, 31)));
  const sc = await prisma.scenario.create({ data: { name: "__econ-test", status: "DRAFT" } });
  const contractIds: string[] = [];
  try {
    const dept = await prisma.department.create({ data: { scenarioId: sc.id, name: "Отдел X", shetilType: "REVENUE" } });
    const a = await prisma.employee.create({ data: { scenarioId: sc.id, departmentId: dept.id, fullName: "сотрудник12", position: "Инженер", category: "PP", fte: 1, costRate: 1000 } });
    const b = await prisma.employee.create({ data: { scenarioId: sc.id, departmentId: dept.id, fullName: "сотрудник 7", position: "Аналитик", category: "PP", fte: 0.5, costRate: 3000 } });
    const c = await prisma.employee.create({ data: { scenarioId: sc.id, departmentId: dept.id, fullName: "Иванов И.И.", position: "Руководитель", category: "AUP", fte: 1, costRate: null } });
    const rev = await prisma.contract.create({ data: { name: "__econ-rev", type: "REVENUE", status: "CONCLUDED", amount: 1_000_000, periodStart: new Date(Date.UTC(year, 0, 1)), periodEnd: new Date(Date.UTC(year, 11, 31)) } });
    const exp = await prisma.contract.create({ data: { name: "__econ-exp", type: "EXPENSE", status: "CONCLUDED", amount: 10, periodStart: new Date(Date.UTC(year, 0, 1)), periodEnd: new Date(Date.UTC(year, 11, 31)) } });
    contractIds.push(rev.id, exp.id);
    await prisma.employeeContract.create({ data: { employeeId: a.id, contractId: rev.id, revenueStatus: "PROVIDED", fte: 1, periodStart: new Date(Date.UTC(year, 0, 1)), periodEnd: new Date(Date.UTC(year, 11, 31)) } });
    await prisma.employeeContract.create({ data: { employeeId: a.id, contractId: exp.id, revenueStatus: "PROVIDED", fte: 1, periodStart: new Date(Date.UTC(year, 0, 1)), periodEnd: new Date(Date.UTC(year, 11, 31)) } });
    await prisma.employeeContract.create({ data: { employeeId: b.id, contractId: rev.id, revenueStatus: "PLANNED", fte: 0.5, periodStart: new Date(Date.UTC(year, 0, 1)), periodEnd: new Date(Date.UTC(year, 5, 30)) } });

    console.log(`### get_employee_economics (год ${year}, часов ${H})`);
    const r1 = JSON.parse(await executeTool("get_employee_economics", {}, sc.id));
    check("hoursYear совпадает с календарём", r1.hoursYear === H, String(r1.hoursYear));
    check("_units присутствует с расшифровкой ₽/год", typeof r1._units?.annualCostRub === "string" && r1._units.annualCostRub.includes("год"));
    const byName = Object.fromEntries(r1.employees.map((e: { name: string }) => [e.name, e]));
    check("имена ровно как в базе", !!byName["сотрудник12"] && !!byName["сотрудник 7"] && !!byName["Иванов И.И."]);
    check("A: стоимость = 1000×1×H", byName["сотрудник12"].annualCostRub === Math.round(1000 * H), String(byName["сотрудник12"].annualCostRub));
    check("A: покрытие 100%, 1 доходный договор (EXPENSE не считается)", byName["сотрудник12"].coveragePct === 100 && byName["сотрудник12"].contractsCount === 1);
    check("B: стоимость = 3000×0.5×H", byName["сотрудник 7"].annualCostRub === Math.round(1500 * H));
    check("B: покрытие ≈50% (0.5 FTE на полгода)", Math.abs(byName["сотрудник 7"].coveragePct - 50) <= 1, String(byName["сотрудник 7"].coveragePct));
    check("C: id совпадает с созданным", byName["Иванов И.И."].id === c.id);
    check("C: без ставки → null и флаг", byName["Иванов И.И."].annualCostRub === null && byName["Иванов И.И."].flags.includes("noCostRate") && byName["Иванов И.И."].flags.includes("noRevenueContracts"));
    check("сортировка cost: B, A, C", r1.employees.map((e: { name: string }) => e.name).join("|") === "сотрудник 7|сотрудник12|Иванов И.И.");
    check("summary: 1 без ставки, 1 без договоров", r1.summary.withoutCostRate === 1 && r1.summary.withoutRevenueContracts === 1);

    const r2 = JSON.parse(await executeTool("get_employee_economics", { sortBy: "coverage" }, sc.id));
    check("сортировка coverage: C(0), B(50), A(100)", r2.employees.map((e: { name: string }) => e.name).join("|") === "Иванов И.И.|сотрудник 7|сотрудник12");
    const r3 = JSON.parse(await executeTool("get_employee_economics", { sortBy: "costUncovered" }, sc.id));
    check("costUncovered: B первый (750×H), A = 0", r3.employees[0].name === "сотрудник 7" && r3.employees[0].uncoveredCostRub === Math.round(1500 * H * 0.5) && byName["сотрудник12"].uncoveredCostRub === 0);
    const r4 = JSON.parse(await executeTool("get_employee_economics", { limit: 2 }, sc.id));
    check("пагинация limit=2 → shown 2, nextOffset 2, _hint", r4.shown === 2 && r4.nextOffset === 2 && typeof r4._hint === "string");
    const r5 = JSON.parse(await executeTool("get_employee_economics", { limit: 2, offset: 2 }, sc.id));
    check("вторая страница без nextOffset", r5.shown === 1 && r5.nextOffset === undefined);
    const r6 = JSON.parse(await executeTool("get_employee_economics", { departmentId: dept.id, sortBy: "bogus" }, sc.id));
    check("фильтр по подразделению и дефолт сортировки", r6.total === 3 && r6.sortBy === "cost");

    console.log("### get_unit_economics");
    const u = JSON.parse(await executeTool("get_unit_economics", {}, sc.id));
    check("часы года и _units", u.hoursYear === H && typeof u._units?.annualCostPerFteRub === "string");
    const expectedCostPerFte = Math.round((1000 * 1 * H + 3000 * 0.5 * H) / 2.5);
    check("annualCostPerFteRub с часами года", u.summary.annualCostPerFteRub === expectedCostPerFte, `${u.summary.annualCostPerFteRub} vs ${expectedCostPerFte}`);
    check("contractCoveragePct вместо utilization", u.summary.contractCoveragePct === 100 && u.summary.utilization === undefined);
    check("по подразделению ppContractCoveragePct", u.departments[0].ppContractCoveragePct === 100 && u.departments[0].annualCostPerFteRub === expectedCostPerFte);
  } finally {
    await prisma.employeeContract.deleteMany({ where: { contractId: { in: contractIds } } });
    await prisma.contract.deleteMany({ where: { id: { in: contractIds } } });
    await prisma.scenario.delete({ where: { id: sc.id } });
    await prisma.$disconnect();
  }
  console.log(`=== employee-economics: ${failed === 0 ? "все проверки пройдены" : failed + " провалено"} ===`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
