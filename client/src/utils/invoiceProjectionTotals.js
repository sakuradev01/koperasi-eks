export const buildYearlyInvoiceMonthlyTotals = (rows = [], periods = []) => {
  const totalsByCurrency = new Map();

  rows.forEach((row) => {
    const currency = row.currency || "IDR";
    if (!totalsByCurrency.has(currency)) {
      totalsByCurrency.set(currency, {
        currency,
        totalsByPeriod: Object.fromEntries(periods.map(({ key }) => [key, 0])),
      });
    }

    const currencyTotals = totalsByCurrency.get(currency);
    periods.forEach(({ key }) => {
      currencyTotals.totalsByPeriod[key] += Number(row.months?.[key]) || 0;
    });
  });

  return [...totalsByCurrency.values()]
    .map((summary) => ({
      ...summary,
      totalOutstanding: Object.values(summary.totalsByPeriod)
        .reduce((total, amount) => total + amount, 0),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
};
