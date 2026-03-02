import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export async function logAction(
  scenarioId: string,
  actionType: string,
  payload: Json,
  undoPayload: Json
) {
  // Clear redo stack (delete undone actions)
  await prisma.actionLog.deleteMany({
    where: { scenarioId, undone: true },
  });

  return prisma.actionLog.create({
    data: { scenarioId, actionType, payload, undoPayload },
  });
}

export async function executeUndo(scenarioId: string) {
  // Find the most recent non-undone action
  const action = await prisma.actionLog.findFirst({
    where: { scenarioId, undone: false },
    orderBy: { createdAt: "desc" },
  });

  if (!action) return null;

  const undoPayload = action.undoPayload as Json;

  switch (action.actionType) {
    case "create_department": {
      // Undo: delete the created department
      const deptId = undoPayload.departmentId as string;
      await prisma.department
        .update({ where: { id: deptId }, data: { headId: null } })
        .catch(() => {});
      await prisma.department.delete({ where: { id: deptId } }).catch(() => {});
      break;
    }

    case "update_department": {
      // Undo: restore previous values
      const deptId = undoPayload.departmentId as string;
      const prev = undoPayload.previousValues as Prisma.DepartmentUpdateInput;
      await prisma.department.update({ where: { id: deptId }, data: prev });
      break;
    }

    case "delete_department":
    case "delete_department_cascade":
    case "delete_department_reparent": {
      // Undo: recreate departments and employees
      const departments = (undoPayload.departments ?? []) as Json[];
      const employees = (undoPayload.employees ?? []) as Json[];

      // Recreate departments in order (parents first)
      for (const dept of departments) {
        await prisma.department.create({
          data: {
            id: dept.id,
            scenarioId: dept.scenarioId,
            parentId: dept.parentId,
            name: dept.name,
            cfo: dept.cfo,
            shetilType: dept.shetilType,
            headId: null, // set after employees are created
            sortOrder: dept.sortOrder ?? 0,
            originId: dept.originId,
          },
        });
      }

      // Recreate employees
      for (const emp of employees) {
        await prisma.employee.create({
          data: {
            id: emp.id,
            scenarioId: emp.scenarioId,
            departmentId: emp.departmentId,
            fullName: emp.fullName,
            position: emp.position,
            category: emp.category,
            fte: emp.fte,
            originId: emp.originId,
          },
        });
      }

      // Restore headId references
      for (const dept of departments) {
        if (dept.headId) {
          await prisma.department
            .update({ where: { id: dept.id }, data: { headId: dept.headId } })
            .catch(() => {});
        }
      }

      // For reparent undo: restore children's parentId back to the recreated dept
      if (action.actionType === "delete_department_reparent") {
        const childIds = (undoPayload.childIds ?? []) as string[];
        const deptId = departments[0]?.id;
        if (deptId && childIds.length > 0) {
          await prisma.department.updateMany({
            where: { id: { in: childIds } },
            data: { parentId: deptId },
          });
        }
      }
      break;
    }

    case "create_employee": {
      // Undo: delete the created employee
      const empId = undoPayload.employeeId as string;
      // Clear headOf references
      await prisma.department.updateMany({
        where: { headId: empId },
        data: { headId: null },
      });
      await prisma.employee.delete({ where: { id: empId } }).catch(() => {});
      break;
    }

    case "update_employee": {
      // Undo: restore previous values
      const empId = undoPayload.employeeId as string;
      const prev = undoPayload.previousValues as Prisma.EmployeeUpdateInput;
      await prisma.employee.update({ where: { id: empId }, data: prev });
      break;
    }

    case "delete_employee": {
      // Undo: recreate the employee
      const emp = undoPayload.employee as Json;
      await prisma.employee.create({
        data: {
          id: emp.id,
          scenarioId: emp.scenarioId,
          departmentId: emp.departmentId,
          fullName: emp.fullName,
          position: emp.position,
          category: emp.category,
          fte: emp.fte,
          originId: emp.originId,
        },
      });
      // Restore headOf
      if (undoPayload.wasHeadOf) {
        for (const deptId of undoPayload.wasHeadOf as string[]) {
          await prisma.department
            .update({ where: { id: deptId }, data: { headId: emp.id } })
            .catch(() => {});
        }
      }
      break;
    }

    case "add_parent": {
      // Undo add_parent: delete the new parent, restore original parentId
      const newParentId = undoPayload.newParentId as string;
      const childId = undoPayload.childId as string;
      const originalParentId = undoPayload.originalParentId as string | null;
      // Restore original parentId
      await prisma.department.update({
        where: { id: childId },
        data: { parentId: originalParentId },
      });
      // Delete the new parent dept
      await prisma.department
        .update({ where: { id: newParentId }, data: { headId: null } })
        .catch(() => {});
      await prisma.department
        .delete({ where: { id: newParentId } })
        .catch(() => {});
      break;
    }

    case "reparent_department": {
      // Undo: restore original parentId
      const deptId = undoPayload.departmentId as string;
      const originalParentId = undoPayload.originalParentId as string | null;
      await prisma.department.update({
        where: { id: deptId },
        data: { parentId: originalParentId },
      });
      break;
    }
  }

  // Mark as undone
  await prisma.actionLog.update({
    where: { id: action.id },
    data: { undone: true },
  });

  return action;
}

export async function executeRedo(scenarioId: string) {
  // Find the oldest undone action (first one undone = most recent in time that was undone last)
  const action = await prisma.actionLog.findFirst({
    where: { scenarioId, undone: true },
    orderBy: { createdAt: "asc" },
  });

  if (!action) return null;

  const payload = action.payload as Json;
  const undoPayload = action.undoPayload as Json;

  switch (action.actionType) {
    case "create_department": {
      // Redo: recreate the department
      const dept = payload.department as Json;
      await prisma.department.create({
        data: {
          id: dept.id,
          scenarioId: dept.scenarioId,
          parentId: dept.parentId,
          name: dept.name,
          cfo: dept.cfo,
          shetilType: dept.shetilType,
          headId: null,
          sortOrder: dept.sortOrder ?? 0,
          originId: dept.originId,
        },
      });
      break;
    }

    case "update_department": {
      // Redo: apply the new values
      const deptId = payload.departmentId as string;
      const changes = payload.changes as Prisma.DepartmentUpdateInput;
      await prisma.department.update({ where: { id: deptId }, data: changes });
      break;
    }

    case "delete_department":
    case "delete_department_cascade":
    case "delete_department_reparent": {
      // Redo: re-delete
      const departments = (undoPayload.departments ?? []) as Json[];

      if (action.actionType === "delete_department_reparent") {
        // Reparent children first
        const mainDept = departments[0];
        if (mainDept) {
          await prisma.department.updateMany({
            where: { parentId: mainDept.id },
            data: { parentId: mainDept.parentId },
          });
        }
      } else if (action.actionType === "delete_department_cascade") {
        // Delete descendants depth-first (reverse order of departments array, which was parents-first)
        const reversed = [...departments].reverse();
        for (const dept of reversed.slice(0, -1)) {
          await prisma.department
            .update({ where: { id: dept.id }, data: { headId: null } })
            .catch(() => {});
          await prisma.department.delete({ where: { id: dept.id } }).catch(() => {});
        }
      }

      // Delete the main department
      const mainId = departments[0]?.id;
      if (mainId) {
        await prisma.department
          .update({ where: { id: mainId }, data: { headId: null } })
          .catch(() => {});
        await prisma.department.delete({ where: { id: mainId } }).catch(() => {});
      }
      break;
    }

    case "create_employee": {
      // Redo: recreate
      const emp = payload.employee as Json;
      await prisma.employee.create({
        data: {
          id: emp.id,
          scenarioId: emp.scenarioId,
          departmentId: emp.departmentId,
          fullName: emp.fullName,
          position: emp.position,
          category: emp.category,
          fte: emp.fte,
          originId: emp.originId,
        },
      });
      break;
    }

    case "update_employee": {
      // Redo: apply changes
      const empId = payload.employeeId as string;
      const changes = payload.changes as Prisma.EmployeeUpdateInput;
      await prisma.employee.update({ where: { id: empId }, data: changes });
      break;
    }

    case "delete_employee": {
      // Redo: delete again
      const emp = undoPayload.employee as Json;
      await prisma.department.updateMany({
        where: { headId: emp.id },
        data: { headId: null },
      });
      await prisma.employee.delete({ where: { id: emp.id } }).catch(() => {});
      break;
    }

    case "add_parent": {
      // Redo: recreate the parent and reparent
      const newParent = payload.newParent as Json;
      const childId = payload.childId as string;
      await prisma.department.create({
        data: {
          id: newParent.id,
          scenarioId: newParent.scenarioId,
          parentId: newParent.parentId,
          name: newParent.name,
          cfo: newParent.cfo,
          shetilType: newParent.shetilType,
          headId: null,
          sortOrder: newParent.sortOrder ?? 0,
        },
      });
      await prisma.department.update({
        where: { id: childId },
        data: { parentId: newParent.id },
      });
      break;
    }

    case "reparent_department": {
      // Redo: apply new parentId
      const deptId = payload.departmentId as string;
      const newParentId = payload.newParentId as string | null;
      await prisma.department.update({
        where: { id: deptId },
        data: { parentId: newParentId },
      });
      break;
    }
  }

  // Mark as not undone
  await prisma.actionLog.update({
    where: { id: action.id },
    data: { undone: false },
  });

  return action;
}
