-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "ShetilType" AS ENUM ('REVENUE', 'RESOURCE', 'SERVICE', 'BACKOFFICE');
CREATE TYPE "EmployeeCategory" AS ENUM ('PP', 'OPP', 'AUP');
CREATE TYPE "ContractType" AS ENUM ('REVENUE', 'EXPENSE');
CREATE TYPE "ContractStatus" AS ENUM ('CONCLUDED', 'PLANNED');
CREATE TYPE "RevenueProvisionStatus" AS ENUM ('PROVIDED', 'PLANNED', 'NOT_PROVIDED');
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PROSPECT', 'INACTIVE');
CREATE TYPE "PipelineStage" AS ENUM ('LEAD', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');
CREATE TYPE "BudgetType" AS ENUM ('CAPEX', 'OPEX');
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'CLOSED');
CREATE TYPE "InsightSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO', 'POSITIVE');
CREATE TYPE "InsightCategory" AS ENUM ('STRUCTURE', 'FINANCIAL', 'PROCESS', 'COMPETENCY', 'STRATEGY', 'OPERATIONS', 'CUSTOMER');
CREATE TYPE "GoalType" AS ENUM ('BSC_FINANCIAL', 'BSC_CLIENT', 'BSC_PROCESS', 'BSC_LEARNING', 'OKR');
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'AT_RISK', 'FAILED');
CREATE TYPE "GapCategory" AS ENUM ('STRUCTURE', 'PROCESS', 'RESOURCE', 'COMPETENCY', 'TECHNOLOGY');
CREATE TYPE "GapPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "GapStatus" AS ENUM ('IDENTIFIED', 'IN_PROGRESS', 'RESOLVED', 'DEFERRED');
CREATE TYPE "KnowledgeCategory" AS ENUM ('FRAMEWORK', 'BENCHMARK', 'CLIENT_DOC');
CREATE TYPE "KnowledgeOrigin" AS ENUM ('BUILTIN', 'MANUAL', 'IMPORTED', 'AI_EXTRACTED');
CREATE TYPE "CompetencyCategory" AS ENUM ('HARD', 'SOFT', 'LEADERSHIP');
CREATE TYPE "ProcessLevel" AS ENUM ('MACRO', 'PROCESS', 'SUBPROCESS');
CREATE TYPE "ProcessStatus" AS ENUM ('ACTIVE', 'PLANNED', 'DEPRECATED');
CREATE TYPE "RaciRole" AS ENUM ('RESPONSIBLE', 'ACCOUNTABLE', 'CONSULTED', 'INFORMED');
CREATE TYPE "DiagramType" AS ENUM ('FLOWCHART', 'VAD', 'BPMN', 'EPC');
CREATE TYPE "StepType" AS ENUM ('START', 'END', 'TASK', 'DECISION', 'EVENT', 'SUBPROCESS', 'GATEWAY');

-- CreateTable User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable Scenario
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'DRAFT',
    "columnNames" JSONB,
    "createdFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_createdFromId_fkey" FOREIGN KEY ("createdFromId") REFERENCES "Scenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Department
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "cfo" TEXT,
    "shetilType" "ShetilType" NOT NULL,
    "headId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "originId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Department_scenarioId_idx" ON "Department"("scenarioId");
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");
ALTER TABLE "Department" ADD CONSTRAINT "Department_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Employee
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "category" "EmployeeCategory" NOT NULL,
    "fte" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "costRate" DECIMAL(65,30),
    "tariffId" TEXT,
    "originId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Employee_scenarioId_idx" ON "Employee"("scenarioId");
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Department.headId FK (after Employee exists)
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Tariff
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tariff_name_key" ON "Tariff"("name");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable ActionLog
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "undoPayload" JSONB NOT NULL,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActionLog_scenarioId_idx" ON "ActionLog"("scenarioId");
CREATE INDEX "ActionLog_scenarioId_createdAt_idx" ON "ActionLog"("scenarioId", "createdAt");
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Client
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable Contract
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL,
    "amount" DECIMAL(65,30),
    "expectedAmount" DECIMAL(65,30),
    "amountAutoCalc" BOOLEAN NOT NULL DEFAULT false,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Contract_clientId_idx" ON "Contract"("clientId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable EmployeeContract
CREATE TABLE "EmployeeContract" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "revenueStatus" "RevenueProvisionStatus" NOT NULL,
    "fte" DECIMAL(65,30) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeContract_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeContract_employeeId_contractId_key" ON "EmployeeContract"("employeeId", "contractId");
CREATE INDEX "EmployeeContract_employeeId_idx" ON "EmployeeContract"("employeeId");
CREATE INDEX "EmployeeContract_contractId_idx" ON "EmployeeContract"("contractId");
ALTER TABLE "EmployeeContract" ADD CONSTRAINT "EmployeeContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeContract" ADD CONSTRAINT "EmployeeContract_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable GapPassport
CREATE TABLE "GapPassport" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "asIsScenarioId" TEXT NOT NULL,
    "toBeScenarioId" TEXT NOT NULL,
    "category" "GapCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "GapPriority" NOT NULL,
    "impact" TEXT,
    "affectedDepartmentIds" TEXT[],
    "responsibleDeptId" TEXT,
    "estimatedEffort" TEXT,
    "status" "GapStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiRationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GapPassport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GapPassport_scenarioId_idx" ON "GapPassport"("scenarioId");
ALTER TABLE "GapPassport" ADD CONSTRAINT "GapPassport_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable AiConversation
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiConversation_scenarioId_idx" ON "AiConversation"("scenarioId");
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable KnowledgeDocument
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "origin" "KnowledgeOrigin" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "sourceFile" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable KnowledgeChunk
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "chunkIndex" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable PnlCache
CREATE TABLE "PnlCache" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "revenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL,
    "warnings" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PnlCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PnlCache_scenarioId_departmentId_mode_periodStart_periodEnd_key" ON "PnlCache"("scenarioId", "departmentId", "mode", "periodStart", "periodEnd");
CREATE INDEX "PnlCache_scenarioId_idx" ON "PnlCache"("scenarioId");
CREATE INDEX "PnlCache_scenarioId_mode_idx" ON "PnlCache"("scenarioId", "mode");

-- CreateTable Competency
CREATE TABLE "Competency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CompetencyCategory" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Competency_name_key" ON "Competency"("name");

-- CreateTable RoleCompetency
CREATE TABLE "RoleCompetency" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleCompetency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoleCompetency_competencyId_position_key" ON "RoleCompetency"("competencyId", "position");
CREATE INDEX "RoleCompetency_position_idx" ON "RoleCompetency"("position");
ALTER TABLE "RoleCompetency" ADD CONSTRAINT "RoleCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable EmployeeCompetency
CREATE TABLE "EmployeeCompetency" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeCompetency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeCompetency_employeeId_competencyId_key" ON "EmployeeCompetency"("employeeId", "competencyId");
CREATE INDEX "EmployeeCompetency_employeeId_idx" ON "EmployeeCompetency"("employeeId");
CREATE INDEX "EmployeeCompetency_competencyId_idx" ON "EmployeeCompetency"("competencyId");
ALTER TABLE "EmployeeCompetency" ADD CONSTRAINT "EmployeeCompetency_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompetency" ADD CONSTRAINT "EmployeeCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Process
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" "ProcessLevel" NOT NULL,
    "status" "ProcessStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerDeptId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Process_scenarioId_idx" ON "Process"("scenarioId");
CREATE INDEX "Process_parentId_idx" ON "Process"("parentId");
ALTER TABLE "Process" ADD CONSTRAINT "Process_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Process" ADD CONSTRAINT "Process_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable ProcessKpi
CREATE TABLE "ProcessKpi" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetValue" TEXT,
    "currentValue" TEXT,
    "unit" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessKpi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProcessKpi_processId_idx" ON "ProcessKpi"("processId");
ALTER TABLE "ProcessKpi" ADD CONSTRAINT "ProcessKpi_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ProcessParticipant
CREATE TABLE "ProcessParticipant" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "role" "RaciRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProcessParticipant_processId_departmentId_role_key" ON "ProcessParticipant"("processId", "departmentId", "role");
CREATE INDEX "ProcessParticipant_processId_idx" ON "ProcessParticipant"("processId");
CREATE INDEX "ProcessParticipant_departmentId_idx" ON "ProcessParticipant"("departmentId");
ALTER TABLE "ProcessParticipant" ADD CONSTRAINT "ProcessParticipant_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ProcessDiagram
CREATE TABLE "ProcessDiagram" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "type" "DiagramType" NOT NULL,
    "name" TEXT,
    "layout" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessDiagram_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProcessDiagram_processId_idx" ON "ProcessDiagram"("processId");
ALTER TABLE "ProcessDiagram" ADD CONSTRAINT "ProcessDiagram_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ProcessStep
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "type" "StepType" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProcessStep_diagramId_idx" ON "ProcessStep"("diagramId");
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "ProcessDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ProcessStepLink
CREATE TABLE "ProcessStepLink" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT,
    "condition" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessStepLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProcessStepLink_diagramId_idx" ON "ProcessStepLink"("diagramId");
CREATE INDEX "ProcessStepLink_sourceId_idx" ON "ProcessStepLink"("sourceId");
CREATE INDEX "ProcessStepLink_targetId_idx" ON "ProcessStepLink"("targetId");
ALTER TABLE "ProcessStepLink" ADD CONSTRAINT "ProcessStepLink_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "ProcessDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessStepLink" ADD CONSTRAINT "ProcessStepLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessStepLink" ADD CONSTRAINT "ProcessStepLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Goal
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "GoalType" NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "deadline" TIMESTAMP(3),
    "period" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Goal_scenarioId_idx" ON "Goal"("scenarioId");
CREATE INDEX "Goal_parentId_idx" ON "Goal"("parentId");
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable GoalKpi
CREATE TABLE "GoalKpi" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoalKpi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GoalKpi_goalId_idx" ON "GoalKpi"("goalId");
ALTER TABLE "GoalKpi" ADD CONSTRAINT "GoalKpi_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable GoalDepartmentLink
CREATE TABLE "GoalDepartmentLink" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalDepartmentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoalDepartmentLink_goalId_departmentId_key" ON "GoalDepartmentLink"("goalId", "departmentId");
CREATE INDEX "GoalDepartmentLink_goalId_idx" ON "GoalDepartmentLink"("goalId");
CREATE INDEX "GoalDepartmentLink_departmentId_idx" ON "GoalDepartmentLink"("departmentId");
ALTER TABLE "GoalDepartmentLink" ADD CONSTRAINT "GoalDepartmentLink_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalDepartmentLink" ADD CONSTRAINT "GoalDepartmentLink_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable PipelineDeal
CREATE TABLE "PipelineDeal" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "stage" "PipelineStage" NOT NULL DEFAULT 'LEAD',
    "expectedCloseDate" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipelineDeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PipelineDeal_scenarioId_idx" ON "PipelineDeal"("scenarioId");
CREATE INDEX "PipelineDeal_clientId_idx" ON "PipelineDeal"("clientId");
ALTER TABLE "PipelineDeal" ADD CONSTRAINT "PipelineDeal_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineDeal" ADD CONSTRAINT "PipelineDeal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Budget
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BudgetType" NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Budget_scenarioId_idx" ON "Budget"("scenarioId");
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable BudgetLine
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "plannedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");
CREATE INDEX "BudgetLine_departmentId_idx" ON "BudgetLine"("departmentId");
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable AIInsight
CREATE TABLE "AIInsight" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "category" "InsightCategory" NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metricKey" TEXT,
    "currentValue" DOUBLE PRECISION,
    "benchmarkValue" DOUBLE PRECISION,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIInsight_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AIInsight_scenarioId_idx" ON "AIInsight"("scenarioId");
CREATE INDEX "AIInsight_scenarioId_resolved_idx" ON "AIInsight"("scenarioId", "resolved");
ALTER TABLE "AIInsight" ADD CONSTRAINT "AIInsight_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable AIRecommendation
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AIRecommendation_insightId_idx" ON "AIRecommendation"("insightId");
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "AIInsight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
