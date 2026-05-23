import { db } from "@/lib/db";
import { employeeScheduleAssignments } from "@/lib/db/schema/employee";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";

type ScheduleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function startOfScheduleDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addScheduleDays(date: Date, days: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isDateWithinRange(date: Date, start: Date, end: Date): boolean {
  const normalized = startOfScheduleDay(date);
  return normalized >= startOfScheduleDay(start) && normalized <= startOfScheduleDay(end);
}

export async function replaceEmployeeScheduleRange(
  tx: ScheduleTransaction,
  employeeId: string,
  scheduleId: string | null,
  effectiveStartDate: Date,
  effectiveEndDate: Date,
  notes: string | null
) {
  const overlappingAssignments = await tx
    .select({
      id: employeeScheduleAssignments.id,
      employeeId: employeeScheduleAssignments.employeeId,
      scheduleId: employeeScheduleAssignments.scheduleId,
      effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
      effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
      notes: employeeScheduleAssignments.notes,
      createdAt: employeeScheduleAssignments.createdAt,
    })
    .from(employeeScheduleAssignments)
    .where(
      and(
        eq(employeeScheduleAssignments.employeeId, employeeId),
        lte(employeeScheduleAssignments.effectiveStartDate, effectiveEndDate),
        or(
          isNull(employeeScheduleAssignments.effectiveEndDate),
          gte(employeeScheduleAssignments.effectiveEndDate, effectiveStartDate)
        )
      )
    )
    .orderBy(asc(employeeScheduleAssignments.effectiveStartDate), asc(employeeScheduleAssignments.createdAt));

  const nextStart = addScheduleDays(effectiveEndDate, 1);
  const previousEnd = addScheduleDays(effectiveStartDate, -1);

  for (const assignment of overlappingAssignments) {
    const assignmentStart = startOfScheduleDay(assignment.effectiveStartDate);
    const assignmentEnd = assignment.effectiveEndDate ? startOfScheduleDay(assignment.effectiveEndDate) : null;

    const startsBeforeRange = assignmentStart < effectiveStartDate;
    const startsWithinRange = isDateWithinRange(assignmentStart, effectiveStartDate, effectiveEndDate);
    const endsAfterRange = assignmentEnd ? assignmentEnd > effectiveEndDate : true;

    if (startsBeforeRange) {
      await tx
        .update(employeeScheduleAssignments)
        .set({ effectiveEndDate: previousEnd })
        .where(eq(employeeScheduleAssignments.id, assignment.id));

      if (endsAfterRange) {
        await tx.insert(employeeScheduleAssignments).values({
          employeeId,
          scheduleId: assignment.scheduleId,
          effectiveStartDate: nextStart,
          effectiveEndDate: assignment.effectiveEndDate,
          notes: assignment.notes,
        });
      }
      continue;
    }

    if (startsWithinRange) {
      if (endsAfterRange) {
        await tx
          .update(employeeScheduleAssignments)
          .set({ effectiveStartDate: nextStart })
          .where(eq(employeeScheduleAssignments.id, assignment.id));
      } else {
        await tx.delete(employeeScheduleAssignments).where(eq(employeeScheduleAssignments.id, assignment.id));
      }
    }
  }

  if (scheduleId !== null) {
    await tx.insert(employeeScheduleAssignments).values({
      employeeId,
      scheduleId,
      effectiveStartDate,
      effectiveEndDate,
      notes,
    });
  }
}
