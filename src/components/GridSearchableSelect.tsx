import React, { useState, useRef, useEffect, useMemo } from 'react';
import { normalizePersianInput } from '../utils/erpEngine';

interface GridSearchableSelectProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  onCommitAndMoveDown?: () => void;
  onCommitAndMoveTab?: (shiftKey: boolean) => void;
  onClose: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const GridSearchableSelect: React.FC<GridSearchableSelectProps> = ({
  value,
  options,
  onChange,
  onCommitAndMoveDown,
  onCommitAndMoveTab,
  onClose,
  placeholder = 'جستجو...',
  autoFocus = true,
}) => {
  const [query, setQuery] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const filteredOptions = useMemo(() => {
    const normQ = normalizePersianInput(query.trim()).toLowerCase();
    const unique = Array.from(new Set(options.filter(Boolean)));
    if (!normQ) return unique;
    return unique.filter((opt) =>
      normalizePersianInput(opt).toLowerCase().includes(normQ)
    );
  }, [options, query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredOptions]);

  const selectOption = (opt: string) => {
    onChange(opt);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setHighlightIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : Math.max(0, filteredOptions.length - 1)
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredOptions.length > 0 && highlightIndex >= 0) {
        onChange(filteredOptions[highlightIndex]);
      } else if (query.trim()) {
        onChange(query.trim());
      }
      onClose();
      if (onCommitAndMoveDown) {
        onCommitAndMoveDown();
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredOptions.length > 0 && highlightIndex >= 0) {
        onChange(filteredOptions[highlightIndex]);
      } else if (query.trim()) {
        onChange(query.trim());
      }
      onClose();
      if (onCommitAndMoveTab) {
        onCommitAndMoveTab(e.shiftKey);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
  };

  return (
    <div className="relative w-full h-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          // Delay to let click on dropdown register
          setTimeout(() => {
            if (query.trim() && query !== value) {
              onChange(query.trim());
            }
            onClose();
          }, 150);
        }}
        placeholder={placeholder}
        className="w-full h-8 px-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:outline-none border-b-2 border-indigo-500 font-medium"
      />

      {filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          onMouseDown={(e) => e.preventDefault()} // prevent blur
          className="absolute z-50 right-0 top-full mt-0.5 w-max min-w-full max-w-xs max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xl py-1 text-xs"
        >
          {filteredOptions.map((opt, idx) => (
            <div
              key={opt}
              onClick={() => selectOption(opt)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`px-2.5 py-1.5 cursor-pointer truncate text-right transition-colors ${
                idx === highlightIndex
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
