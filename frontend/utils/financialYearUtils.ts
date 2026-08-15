export function getDefaultDate(financialYear?: { start_date: string; end_date: string }): string {
  if (financialYear?.start_date && financialYear?.end_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (today >= financialYear.start_date && today <= financialYear.end_date) return today;
    return financialYear.start_date;
  }
  return new Date().toISOString().slice(0, 10);
}

export function isDateInFY(date: string, financialYear?: { start_date: string; end_date: string }): boolean {
  if (financialYear?.start_date && financialYear?.end_date) {
    return date >= financialYear.start_date && date <= financialYear.end_date;
  }
  return true;
}

export function validateDateInFY(
  date: string,
  financialYear?: { start_date: string; end_date: string; name: string; is_closed: number },
): string | null {
  if (!financialYear?.start_date || !financialYear?.end_date) return null;
  if (date < financialYear.start_date || date > financialYear.end_date) {
    return `Selected date does not belong to the active Financial Year (${financialYear.name || 'Unknown'}). Please switch Financial Year or choose a valid date within ${financialYear.start_date} to ${financialYear.end_date}.`;
  }
  if (financialYear.is_closed) {
    return `Financial Year "${financialYear.name || 'Unknown'}" is closed. No new transactions can be created.`;
  }
  return null;
}