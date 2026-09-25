export function getVisiblePageNumbers(currentPage, totalPages, maxVisible = 5) {
  const total = Math.max(0, Number.parseInt(totalPages, 10) || 0);
  if (total === 0) return [];

  const page = Math.min(Math.max(Number.parseInt(currentPage, 10) || 1, 1), total);
  const requestedWindow = Math.max(Number.parseInt(maxVisible, 10) || 5, 1);
  const visibleCount = Math.min(requestedWindow, total);
  const centeredStart = page - Math.floor(visibleCount / 2);
  const start = Math.max(1, Math.min(centeredStart, total - visibleCount + 1));

  return Array.from({ length: visibleCount }, (_, index) => start + index);
}
