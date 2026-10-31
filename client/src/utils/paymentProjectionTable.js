/**
 * Build the table-facing projection values for the periods currently shown.
 * Keeping these totals derived from the visible cells makes the row and footer
 * totals agree for both a single-year and a multi-year view.
 */
export const buildProjectionTableData = (rows = [], periods = []) => {
  const totalsByPeriod = Object.fromEntries(periods.map(({ key }) => [key, 0]));
  const projectedRows = rows.map((row) => {
    const isProjectionEligible = row.isProjectionEligible !== false;
    const months = isProjectionEligible
      ? row.months
      : Object.fromEntries(periods.map(({ key }) => [key, 0]));
    const visibleTotalOutstanding = periods.reduce((total, period) => {
      const amount = Number(months?.[period.key]) || 0;
      if (isProjectionEligible) totalsByPeriod[period.key] += amount;
      return total + amount;
    }, 0);

    return { ...row, months, visibleTotalOutstanding };
  });

  const visibleRows = projectedRows.filter(
    ({ visibleTotalOutstanding, isProjectionEligible }) =>
      visibleTotalOutstanding > 0 || isProjectionEligible === false,
  );
  const totalOutstanding = Object.values(totalsByPeriod).reduce((total, amount) => total + amount, 0);

  return { rows: visibleRows, totalsByPeriod, totalOutstanding };
};
