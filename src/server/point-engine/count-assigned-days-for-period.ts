type AssignmentWindow = {
  effectiveStartDate: string | Date;
  effectiveEndDate: string | Date | null;
};

type CountAssignedDaysForPeriodInput = {
  periodStartDate: string | Date;
  periodEndDate: string | Date;
  assignments: AssignmentWindow[];
};

function toDate(value: string | Date) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));

  const parsed = new Date(value);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function countAssignedDaysForPeriod({
  periodStartDate,
  periodEndDate,
  assignments,
}: CountAssignedDaysForPeriodInput) {
  const start = toDate(periodStartDate);
  const end = toDate(periodEndDate);
  let count = 0;

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const hasAssignment = assignments.some((assignment) => {
      const assignmentStart = toDate(assignment.effectiveStartDate);
      const assignmentEnd = assignment.effectiveEndDate ? toDate(assignment.effectiveEndDate) : null;
      return cursor >= assignmentStart && (!assignmentEnd || cursor <= assignmentEnd);
    });

    if (hasAssignment) count += 1;
  }

  return count;
}
