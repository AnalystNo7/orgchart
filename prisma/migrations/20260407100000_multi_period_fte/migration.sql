-- DropIndex
DROP INDEX IF EXISTS "EmployeeContract_employeeId_contractId_key";

-- CreateIndex: allow multiple periods per employee+contract
CREATE UNIQUE INDEX "EmployeeContract_employeeId_contractId_periodStart_key" ON "EmployeeContract"("employeeId", "contractId", "periodStart");
