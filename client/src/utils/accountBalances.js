export function applyReportBalancesToAccountGroups(accountGroups = {}) {
  return Object.fromEntries(
    Object.entries(accountGroups).map(([groupName, accounts]) => [
      groupName,
      (Array.isArray(accounts) ? accounts : []).map((account) => {
        const hasReportBalance = account?.reportBalance !== null
          && account?.reportBalance !== undefined
          && Number.isFinite(Number(account.reportBalance));
        const reportBalance = Number(account?.reportBalance);
        const storedBalance = Number(account?.balance);
        let balance = Number.isFinite(storedBalance) ? storedBalance : 0;
        if (hasReportBalance) balance = reportBalance;

        return {
          ...account,
          balance,
        };
      }),
    ]),
  );
}
