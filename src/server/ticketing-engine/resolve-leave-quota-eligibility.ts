type ResolveLeaveQuotaEligibilityInput = {
  startDate: Date;
  requestedYear: number;
  today?: Date;
};

function addTwelveMonths(startDate: Date) {
  const year = startDate.getUTCFullYear() + 1;
  const month = startDate.getUTCMonth();
  const day = startDate.getUTCDate();
  return new Date(Date.UTC(year, month, day));
}

export function resolveLeaveQuotaEligibility({
  startDate,
  requestedYear,
  today = new Date(),
}: ResolveLeaveQuotaEligibilityInput) {
  const anniversaryDate = addTwelveMonths(startDate);
  const effectiveDate = anniversaryDate;
  const effectiveYear = effectiveDate.getUTCFullYear();
  const eligible =
    today.getTime() >= effectiveDate.getTime() &&
    requestedYear >= effectiveYear;

  return {
    anniversaryDate,
    effectiveDate,
    eligible,
  };
}
