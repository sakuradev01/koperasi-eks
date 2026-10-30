/**
 * Build the table-facing projection values for the periods currently shown.
 * Keeping these totals derived from the visible cells makes the row and footer
 * totals agree for both a single-year and a multi-year view.
 */
export const buildProjectionTableData = (rows = [], periods = []) => {
  const totalsByPeriod = Object.fromEntries(periods.map(({ key }) => [key, 0]));
  const projectedRows = rows.map((row) => {
    const visibleTotalOutstanding = periods.reduce((total, period) => {
      const amount = Number(row.months?.[period.key]) || 0;
      totalsByPeriod[period.key] += amount;
      return total + amount;
    }, 0);

    return { ...row, visibleTotalOutstanding };
  });

  const visibleRows = projectedRows.filter(({ visibleTotalOutstanding }) => visibleTotalOutstanding > 0);
  const totalOutstanding = Object.values(totalsByPeriod).reduce((total, amount) => total + amount, 0);

  return { rows: visibleRows, totalsByPeriod, totalOutstanding };
};
