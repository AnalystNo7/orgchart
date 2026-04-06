import { PrismaClient, ShetilType, EmployeeCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create default user
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@orgchart.local" },
    update: { isAdmin: true },
    create: {
      email: "admin@orgchart.local",
      passwordHash,
      name: "Администратор",
      isAdmin: true,
    },
  });

  // Seed tariffs (K-1 through K-6) - global, idempotent - always run
  const tariffData = [
    { name: "K-1", rate: 1500, description: "Начальный уровень" },
    { name: "K-2", rate: 2000, description: "Базовый уровень" },
    { name: "K-3", rate: 2800, description: "Средний уровень" },
    { name: "K-4", rate: 3500, description: "Продвинутый уровень" },
    { name: "K-5", rate: 4500, description: "Экспертный уровень" },
    { name: "K-6", rate: 6000, description: "Высший уровень" },
  ];
  for (const t of tariffData) {
    await prisma.tariff.upsert({
      where: { name: t.name },
      update: {},
      create: t,
    });
  }
  console.log(`Tariffs seeded: ${tariffData.length}`);

  // Check if baseline exists
  const existing = await prisma.scenario.findFirst({ where: { isBaseline: true } });
  if (existing) {
    console.log("Baseline already exists, skipping org structure");
    return;
  }

  // Create baseline scenario
  const scenario = await prisma.scenario.create({
    data: {
      name: "Текущее состояние",
      description: "Базовая оргструктура компании",
      isBaseline: true,
      status: "ACTIVE",
    },
  });

  const sId = scenario.id;

  // Helper to create department + employees
  async function createDept(
    name: string,
    shetilType: ShetilType,
    parentId: string | null,
    sortOrder: number,
    employees: Array<{ fullName: string; position: string; category: EmployeeCategory; fte?: number }>
  ) {
    const dept = await prisma.department.create({
      data: { scenarioId: sId, name, shetilType, parentId, sortOrder },
    });

    for (const emp of employees) {
      await prisma.employee.create({
        data: {
          scenarioId: sId,
          departmentId: dept.id,
          fullName: emp.fullName,
          position: emp.position,
          category: emp.category,
          fte: emp.fte ?? 1.0,
        },
      });
    }

    // Set head as first employee if exists
    if (employees.length > 0) {
      const head = await prisma.employee.findFirst({
        where: { departmentId: dept.id },
        orderBy: { createdAt: "asc" },
      });
      if (head) {
        await prisma.department.update({
          where: { id: dept.id },
          data: { headId: head.id },
        });
      }
    }

    return dept;
  }

  // Root
  const root = await createDept("Генеральная дирекция", "BACKOFFICE", null, 0, [
    { fullName: "Иванов И.И.", position: "Генеральный директор", category: "AUP" },
    { fullName: "Петрова Е.А.", position: "Помощник ГД", category: "AUP" },
  ]);

  // Level 1 departments
  const production = await createDept("Производственный блок", "REVENUE", root.id, 1, [
    { fullName: "Сидоров А.В.", position: "Директор по производству", category: "AUP" },
  ]);

  const technical = await createDept("Технический блок", "RESOURCE", root.id, 2, [
    { fullName: "Козлов Д.М.", position: "Технический директор", category: "AUP" },
  ]);

  const finance = await createDept("Финансовый блок", "BACKOFFICE", root.id, 3, [
    { fullName: "Новикова О.С.", position: "Финансовый директор", category: "AUP" },
  ]);

  const hr = await createDept("Управление персоналом", "BACKOFFICE", root.id, 4, [
    { fullName: "Морозова Л.Н.", position: "Директор по персоналу", category: "AUP" },
  ]);

  const service = await createDept("Сервисная служба", "SERVICE", root.id, 5, [
    { fullName: "Волков С.П.", position: "Начальник сервисной службы", category: "OPP" },
  ]);

  // Level 2 - Production
  const shop1 = await createDept("Цех №1", "REVENUE", production.id, 1, [
    { fullName: "Кузнецов В.А.", position: "Начальник цеха", category: "PP" },
    { fullName: "Смирнов П.И.", position: "Мастер участка", category: "PP" },
    { fullName: "Попов Г.Е.", position: "Оператор", category: "PP" },
    { fullName: "Васильев Н.К.", position: "Оператор", category: "PP" },
    { fullName: "Федоров А.Л.", position: "Оператор", category: "PP" },
    { fullName: "Михайлов Д.С.", position: "Наладчик", category: "PP" },
    { fullName: "Григорьев И.М.", position: "Слесарь", category: "OPP" },
  ]);

  const shop2 = await createDept("Цех №2", "REVENUE", production.id, 2, [
    { fullName: "Алексеев Б.В.", position: "Начальник цеха", category: "PP" },
    { fullName: "Егоров К.Н.", position: "Мастер", category: "PP" },
    { fullName: "Лебедев Р.О.", position: "Оператор", category: "PP" },
    { fullName: "Соколов Т.Ф.", position: "Оператор", category: "PP" },
    { fullName: "Антонов С.Д.", position: "Оператор", category: "PP" },
  ]);

  await createDept("Склад готовой продукции", "REVENUE", production.id, 3, [
    { fullName: "Белов М.Г.", position: "Начальник склада", category: "OPP" },
    { fullName: "Комарова Е.В.", position: "Кладовщик", category: "OPP" },
    { fullName: "Орлов П.А.", position: "Кладовщик", category: "OPP" },
  ]);

  // Level 2 - Technical
  await createDept("Отдел КИП", "RESOURCE", technical.id, 1, [
    { fullName: "Тарасов В.И.", position: "Начальник отдела", category: "OPP" },
    { fullName: "Гусев А.Н.", position: "Инженер КИП", category: "OPP" },
    { fullName: "Зайцев Д.К.", position: "Инженер КИП", category: "OPP" },
  ]);

  await createDept("Отдел главного механика", "RESOURCE", technical.id, 2, [
    { fullName: "Николаев С.В.", position: "Главный механик", category: "OPP" },
    { fullName: "Степанов И.А.", position: "Механик", category: "OPP" },
    { fullName: "Павлов О.Д.", position: "Механик", category: "OPP" },
    { fullName: "Крылов Ф.С.", position: "Слесарь", category: "OPP" },
  ]);

  await createDept("Энергослужба", "RESOURCE", technical.id, 3, [
    { fullName: "Максимов Л.Б.", position: "Главный энергетик", category: "OPP" },
    { fullName: "Андреев К.Н.", position: "Электрик", category: "OPP" },
  ]);

  // Level 2 - Finance
  await createDept("Бухгалтерия", "BACKOFFICE", finance.id, 1, [
    { fullName: "Захарова И.П.", position: "Главный бухгалтер", category: "AUP" },
    { fullName: "Борисова Т.М.", position: "Бухгалтер", category: "AUP" },
    { fullName: "Кудрявцева Н.В.", position: "Бухгалтер", category: "AUP" },
  ]);

  await createDept("Планово-экономический отдел", "BACKOFFICE", finance.id, 2, [
    { fullName: "Жукова А.С.", position: "Начальник отдела", category: "AUP" },
    { fullName: "Романова Д.Л.", position: "Экономист", category: "AUP" },
  ]);

  // Level 2 - HR
  await createDept("Отдел кадров", "BACKOFFICE", hr.id, 1, [
    { fullName: "Соловьёва М.К.", position: "Начальник ОК", category: "AUP" },
    { fullName: "Виноградова Е.Н.", position: "Специалист ОК", category: "AUP" },
  ]);

  await createDept("Отдел охраны труда", "BACKOFFICE", hr.id, 2, [
    { fullName: "Воробьёв А.Д.", position: "Инженер по ОТ", category: "AUP" },
  ]);

  // Level 2 - Service
  await createDept("ИТ-отдел", "SERVICE", service.id, 1, [
    { fullName: "Медведев О.В.", position: "Начальник ИТ", category: "OPP" },
    { fullName: "Щербаков Д.А.", position: "Системный администратор", category: "OPP" },
  ]);

  await createDept("АХО", "SERVICE", service.id, 2, [
    { fullName: "Фёдорова Г.И.", position: "Начальник АХО", category: "OPP" },
    { fullName: "Киселёва Н.П.", position: "Специалист АХО", category: "OPP" },
    { fullName: "Макарова С.Т.", position: "Уборщик", category: "OPP", fte: 0.5 },
  ]);

  // Level 3 - Under Shop 1
  await createDept("Участок №1-А", "REVENUE", shop1.id, 1, [
    { fullName: "Беляев В.Ю.", position: "Мастер участка", category: "PP" },
    { fullName: "Ковалёв М.С.", position: "Рабочий", category: "PP" },
    { fullName: "Ильин А.В.", position: "Рабочий", category: "PP" },
  ]);

  await createDept("Участок №1-Б", "REVENUE", shop1.id, 2, [
    { fullName: "Герасимов Н.А.", position: "Мастер участка", category: "PP" },
    { fullName: "Лазарев Д.О.", position: "Рабочий", category: "PP" },
  ]);

  // Level 3 - Under Shop 2
  await createDept("Участок №2-А", "REVENUE", shop2.id, 1, [
    { fullName: "Семёнов Ю.Б.", position: "Мастер участка", category: "PP" },
    { fullName: "Фролов К.И.", position: "Рабочий", category: "PP" },
    { fullName: "Сергеев А.А.", position: "Рабочий", category: "PP" },
  ]);

  // --- P&L seed data: costRate for employees + contracts ---

  // Set costRate on all employees based on category
  const costRateByCategory: Record<string, number> = {
    PP: 2000,
    OPP: 1800,
    AUP: 2500,
  };
  const allEmps = await prisma.employee.findMany({ where: { scenarioId: sId } });
  for (const emp of allEmps) {
    await prisma.employee.update({
      where: { id: emp.id },
      data: { costRate: costRateByCategory[emp.category] ?? 2000 },
    });
  }
  console.log(`CostRate set for ${allEmps.length} employees`);

  // Find departments for contract linking
  const allDepts = await prisma.department.findMany({
    where: { scenarioId: sId },
    include: { employees: true },
  });
  const deptByName = new Map(allDepts.map((d) => [d.name, d]));

  // Create contracts and link employees
  async function createContract(
    name: string,
    type: "REVENUE" | "EXPENSE",
    status: "CONCLUDED" | "PLANNED",
    amount: number,
    expectedAmount: number | null,
    periodStart: Date,
    periodEnd: Date,
    deptNames: string[], // link all employees from these departments
    fte: number = 0.5
  ) {
    const contract = await prisma.contract.create({
      data: {
        name,
        type,
        status,
        amount: status === "CONCLUDED" ? amount : null,
        expectedAmount: expectedAmount,
        periodStart,
        periodEnd,
      },
    });

    for (const deptName of deptNames) {
      const dept = deptByName.get(deptName);
      if (!dept) continue;
      for (const emp of dept.employees) {
        await prisma.employeeContract.create({
          data: {
            employeeId: emp.id,
            contractId: contract.id,
            revenueStatus: status === "CONCLUDED" ? "PROVIDED" : "PLANNED",
            fte,
            periodStart,
            periodEnd,
          },
        });
      }
    }
    return contract;
  }

  // Concluded contracts (for "forecast" mode)
  await createContract(
    "Контракт Альфа-2025",
    "REVENUE",
    "CONCLUDED",
    8000000,
    null,
    new Date("2025-01-01"),
    new Date("2025-12-31"),
    ["Цех №1", "Участок №1-А"],
    0.5
  );

  await createContract(
    "Контракт Бета-2025",
    "REVENUE",
    "CONCLUDED",
    5000000,
    null,
    new Date("2025-03-01"),
    new Date("2025-09-30"),
    ["Цех №2", "Участок №2-А"],
    0.4
  );

  await createContract(
    "Контракт Гамма-2025",
    "REVENUE",
    "CONCLUDED",
    3000000,
    null,
    new Date("2025-06-01"),
    new Date("2026-05-31"),
    ["Цех №1", "Участок №1-Б"],
    0.3
  );

  // Planned contracts (for "plan" mode)
  await createContract(
    "Контракт Дельта-2026 (план)",
    "REVENUE",
    "PLANNED",
    0,
    12000000,
    new Date("2026-01-01"),
    new Date("2026-12-31"),
    ["Цех №1", "Участок №1-А", "Участок №1-Б"],
    0.6
  );

  await createContract(
    "Контракт Эпсилон-2026 (план)",
    "REVENUE",
    "PLANNED",
    0,
    7000000,
    new Date("2026-04-01"),
    new Date("2026-12-31"),
    ["Цех №2", "Участок №2-А"],
    0.5
  );

  await createContract(
    "Контракт Зета-2026 (план)",
    "REVENUE",
    "PLANNED",
    0,
    4000000,
    new Date("2026-01-01"),
    new Date("2026-06-30"),
    ["Склад готовой продукции"],
    0.3
  );

  const totalContracts = await prisma.contract.count();
  const totalLinks = await prisma.employeeContract.count();
  console.log(`Contracts seeded: ${totalContracts} contracts, ${totalLinks} employee links`);

  const totalDepts = await prisma.department.count({ where: { scenarioId: sId } });
  const totalEmps = await prisma.employee.count({ where: { scenarioId: sId } });
  const totalTariffs = await prisma.tariff.count();
  console.log(`Seed completed: ${totalDepts} departments, ${totalEmps} employees, ${totalTariffs} tariffs`);

  // Seed processes for the baseline scenario
  const existingProcesses = await prisma.process.count({ where: { scenarioId: scenario.id } });
  if (existingProcesses === 0) {
    const processData = [
      // Macro processes
      { name: "Управление проектами", level: "MACRO" as const, description: "Полный цикл управления ИТ-проектами", sortOrder: 1 },
      { name: "Разработка и внедрение", level: "MACRO" as const, description: "Разработка, тестирование и внедрение ИТ-решений", sortOrder: 2 },
      { name: "Управление персоналом", level: "MACRO" as const, description: "HR-процессы: найм, адаптация, обучение, развитие", sortOrder: 3 },
      { name: "Финансы и бюджетирование", level: "MACRO" as const, description: "Финансовое планирование, учёт, отчётность", sortOrder: 4 },
      { name: "Продажи и работа с клиентами", level: "MACRO" as const, description: "Привлечение клиентов, ведение тендеров, account management", sortOrder: 5 },
    ];

    const macroIds: Record<string, string> = {};
    for (const p of processData) {
      const created = await prisma.process.create({
        data: { scenarioId: scenario.id, ...p },
      });
      macroIds[p.name] = created.id;
    }

    // Child processes
    const childProcesses = [
      { name: "Инициация проекта", level: "PROCESS" as const, parentId: macroIds["Управление проектами"], sortOrder: 1 },
      { name: "Планирование и оценка", level: "PROCESS" as const, parentId: macroIds["Управление проектами"], sortOrder: 2 },
      { name: "Мониторинг и контроль", level: "PROCESS" as const, parentId: macroIds["Управление проектами"], sortOrder: 3 },
      { name: "Анализ требований", level: "PROCESS" as const, parentId: macroIds["Разработка и внедрение"], sortOrder: 1 },
      { name: "Разработка", level: "PROCESS" as const, parentId: macroIds["Разработка и внедрение"], sortOrder: 2 },
      { name: "Тестирование", level: "PROCESS" as const, parentId: macroIds["Разработка и внедрение"], sortOrder: 3 },
      { name: "Подбор персонала", level: "PROCESS" as const, parentId: macroIds["Управление персоналом"], sortOrder: 1 },
      { name: "Адаптация и обучение", level: "PROCESS" as const, parentId: macroIds["Управление персоналом"], sortOrder: 2 },
    ];

    for (const cp of childProcesses) {
      await prisma.process.create({
        data: { scenarioId: scenario.id, ...cp },
      });
    }

    console.log(`Seed: ${processData.length} macro + ${childProcesses.length} child processes created`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
