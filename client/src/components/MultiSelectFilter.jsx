/* eslint-disable react/prop-types -- this project does not ship prop-types. */
const summaryLabel = (selectedValues, emptyLabel) => {
  if (selectedValues.length === 0) return emptyLabel;
  return `${selectedValues.length} dipilih`;
};

export default function MultiSelectFilter({
  label,
  options,
  selectedValues,
  onChange,
  emptyLabel = "Semua",
  tone = "pink",
}) {
  const selected = Array.isArray(selectedValues) ? selectedValues : [];
  const focusRingClass = tone === "navy" ? "focus:ring-[#04214A]" : "focus:ring-pink-500";
  const checkboxClass = tone === "navy"
    ? "text-[#04214A] focus:ring-[#04214A]"
    : "text-pink-600 focus:ring-pink-500";
  const clearButtonClass = tone === "navy"
    ? "text-[#04214A] hover:bg-slate-50"
    : "text-pink-700 hover:bg-pink-50";

  const toggleOption = (value) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600 whitespace-nowrap">{label}:</span>
      <details className="relative">
        <summary
          aria-label={`${label}: ${summaryLabel(selected, emptyLabel)}`}
          className={`flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${focusRingClass}`}
        >
          <span>{summaryLabel(selected, emptyLabel)}</span>
          <span aria-hidden="true" className="text-gray-400">▾</span>
        </summary>
        <div
          role="group"
          aria-label={`Pilihan ${label.toLowerCase()}`}
          className="absolute left-0 z-30 mt-1 max-h-64 min-w-52 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
        >
          <div className="space-y-1">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggleOption(option.value)}
                  className={`mt-0.5 rounded border-gray-300 ${checkboxClass}`}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-medium ${clearButtonClass}`}
              >
                Hapus pilihan
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
