const normalizeMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(Math.max(0, amount)) : 0;
};

export function normalizeLegacyWithdrawalLines({ mode, categoryId, netAmount, lines = [] }) {
  const expectedAmount = normalizeMoney(netAmount);

  if (mode !== "split") {
    const normalizedCategoryId = String(categoryId || "").trim();
    return normalizedCategoryId && expectedAmount > 0
      ? [{ categoryId: normalizedCategoryId, description: "", amount: expectedAmount }]
      : [];
  }

  return lines
    .map((line) => ({
      categoryId: String(line.categoryId || "").trim(),
      description: String(line.description || "").trim(),
      amount: normalizeMoney(line.amount),
    }))
    .filter((line) => line.categoryId && line.amount > 0);
}

export function isLegacyWithdrawalLinesBalanced(lines, netAmount) {
  const expectedAmount = normalizeMoney(netAmount);
  if (expectedAmount <= 0 || !Array.isArray(lines) || lines.length === 0) return false;

  const total = lines.reduce((sum, line) => sum + normalizeMoney(line.amount), 0);
  return total === expectedAmount;
}
