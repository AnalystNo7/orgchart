/**
 * Russian production calendar — working hours per month (8h/day).
 * Source: consultant.ru production calendar.
 * Key: "YYYY-MM", Value: working hours in that month.
 */

const WORKING_HOURS: Record<string, number> = {
  // 2025
  "2025-01": 136, "2025-02": 160, "2025-03": 168,
  "2025-04": 176, "2025-05": 144, "2025-06": 160,
  "2025-07": 184, "2025-08": 168, "2025-09": 176,
  "2025-10": 184, "2025-11": 160, "2025-12": 183,
  // 2026
  "2026-01": 136, "2026-02": 160, "2026-03": 176,
  "2026-04": 176, "2026-05": 144, "2026-06": 168,
  "2026-07": 184, "2026-08": 168, "2026-09": 176,
  "2026-10": 176, "2026-11": 160, "2026-12": 183,
  // 2027
  "2027-01": 136, "2027-02": 160, "2027-03": 176,
  "2027-04": 176, "2027-05": 144, "2027-06": 168,
  "2027-07": 176, "2027-08": 176, "2027-09": 176,
  "2027-10": 168, "2027-11": 160, "2027-12": 183,
};

/** Default monthly hours when month is not in calendar */
const DEFAULT_MONTHLY_HOURS = 168;

/**
 * Get total working hours for a date range.
 * Prorates partial months proportionally.
 * Uses UTC consistently to avoid timezone issues on server.
 */
export function getWorkingHours(startDate: Date, endDate: Date): number {
  if (endDate <= startDate) return 0;

  let totalHours = 0;
  // Use UTC year/month to stay consistent with Date objects from new Date("YYYY-MM-DD")
  let curYear = startDate.getUTCFullYear();
  let curMonth = startDate.getUTCMonth();
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();

  while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
    const key = `${curYear}-${String(curMonth + 1).padStart(2, "0")}`;
    const monthHours = WORKING_HOURS[key] ?? DEFAULT_MONTHLY_HOURS;

    const daysInMonth = new Date(Date.UTC(curYear, curMonth + 1, 0)).getUTCDate();
    const monthStartMs = Date.UTC(curYear, curMonth, 1);
    const monthEndMs = Date.UTC(curYear, curMonth + 1, 0); // last day of month

    // Calculate overlap with requested range
    const overlapStartMs = Math.max(startDate.getTime(), monthStartMs);
    const overlapEndMs = Math.min(endDate.getTime(), monthEndMs);

    if (overlapStartMs <= overlapEndMs) {
      const overlapDays = Math.floor(
        (overlapEndMs - overlapStartMs) / (1000 * 60 * 60 * 24)
      ) + 1;
      const fraction = overlapDays / daysInMonth;
      totalHours += monthHours * fraction;
    }

    curMonth++;
    if (curMonth > 11) {
      curMonth = 0;
      curYear++;
    }
  }

  return Math.round(totalHours * 100) / 100;
}

/**
 * Get working hours for a specific month.
 */
export function getMonthlyWorkingHours(year: number, month: number): number {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return WORKING_HOURS[key] ?? DEFAULT_MONTHLY_HOURS;
}
