import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Searchable select with optional group headers and disabled hierarchy rows
 * (master / submenu separators). Same UX as accounting Transactions.
 *
 * Flat options: { value, label, sublabel?, disabled?, indent?, type?: "header" }
 * Grouped: { label, items: [{ value, label, sublabel? }] } + grouped={true}
 */
export default function SearchableDropdown({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  grouped = false,
  disabled = false,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const flatOptions = useMemo(() => {
    if (!grouped) return options;
    const flat = [];
    options.forEach((group) => {
      flat.push({ type: "header", label: group.label });
      (group.items || []).forEach((item) => flat.push(item));
    });
    return flat;
  }, [options, grouped]);

  const filteredOptions = useMemo(() => {
    if (!search) return flatOptions;
    const q = search.toLowerCase();
    return flatOptions.filter((opt) => {
      if (opt.type === "header") return true;
      if (opt.disabled) {
        // keep master/submenu separators when searching (visual grouping)
        return true;
      }
      return (
        (opt.label || "").toLowerCase().includes(q) ||
        (opt.sublabel || "").toLowerCase().includes(q)
      );
    });
  }, [flatOptions, search]);

  const selectableOptions = filteredOptions.filter(
    (o) => o.type !== "header" && !o.disabled
  );

  const selectedLabel = useMemo(() => {
    const found = flatOptions.find(
      (o) => o.type !== "header" && !o.disabled && o.value === value
    );
    return found ? found.label : "";
  }, [flatOptions, value]);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, selectableOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && selectableOptions[highlightIdx]) {
        onChange(selectableOptions[highlightIdx].value);
        setIsOpen(false);
        setSearch("");
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSearch("");
    }
  };

  useEffect(() => {
    if (isOpen && listRef.current && highlightIdx >= 0) {
      const items = listRef.current.querySelectorAll("[data-selectable]");
      if (items[highlightIdx]) {
        items[highlightIdx].scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIdx, isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setHighlightIdx(-1);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        disabled={disabled}
        className={`w-full flex items-center justify-between border border-gray-300 rounded-md px-3 py-2.5 text-sm text-left transition
          ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white hover:border-blue-400 cursor-pointer"}
          ${isOpen ? "ring-2 ring-blue-500 border-blue-500" : ""}`}
      >
        <span className={selectedLabel ? "text-gray-900 truncate" : "text-gray-400"}>
          {selectedLabel || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-[10050] mt-1 flex max-h-72 w-full flex-col rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightIdx(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Cari..."
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div ref={listRef} className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                Tidak ada hasil
              </div>
            )}
            {filteredOptions.map((opt, idx) => {
              if (opt.type === "header") {
                return (
                  <div
                    key={`h-${idx}`}
                    className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-t border-gray-100"
                  >
                    {opt.label}
                  </div>
                );
              }
              if (opt.disabled) {
                return (
                  <div
                    key={`d-${idx}`}
                    className={`px-3 py-1.5 text-sm cursor-default select-none ${
                      opt.indent === 1
                        ? "pl-5 text-blue-700 font-semibold bg-blue-50/60 border-t border-blue-100/50"
                        : "font-bold text-gray-800 bg-gray-100"
                    }`}
                  >
                    {opt.label}
                  </div>
                );
              }
              const selectIdx = selectableOptions.indexOf(opt);
              const isHighlighted = selectIdx === highlightIdx;
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value || `o-${idx}`}
                  data-selectable
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`px-3 py-2 text-sm cursor-pointer transition
                    ${opt.indent === 2 ? "pl-9" : opt.indent === 1 ? "pl-5" : ""}
                    ${isHighlighted ? "bg-blue-50" : ""}
                    ${isSelected ? "text-blue-700 font-semibold bg-blue-50/50" : "text-gray-700"}
                    hover:bg-blue-50`}
                >
                  {opt.label}
                  {opt.sublabel && (
                    <span className="ml-1 text-xs text-gray-400">{opt.sublabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
