import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { normalizePersianInput } from '../utils/erpEngine';

export interface GridSearchableSelectProps {
  value: string;
  options: string[];
  optionColors?: Record<string, string>;
  isOpen?: boolean;
  onChange: (val: string, meta?: { keepEditing?: boolean }) => void;
  onCreateOption?: (val: string) => void;
  onCommitAndMoveDown?: () => void;
  onCommitAndMoveTab?: (shiftKey: boolean) => void;
  onOpen?: () => void;
  onClose: () => void;
  onMouseDown?: (e: React.MouseEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  align?: 'right' | 'center' | 'left';
  allowCreate?: boolean;
  allowLiveChange?: boolean;
}

export const GridSearchableSelect = forwardRef<HTMLInputElement, GridSearchableSelectProps>(
  (
    {
      value,
      options,
      optionColors,
      isOpen = true,
      onChange,
      onCreateOption,
      onCommitAndMoveDown,
      onCommitAndMoveTab,
      onOpen,
      onClose,
      onMouseDown,
      placeholder = 'جستجو یا تایپ مورد جدید...',
      autoFocus = false,
      align = 'right',
      allowCreate = true,
      allowLiveChange = true,
    },
    ref
  ) => {
    const [query, setQuery] = useState(value);
    const [hasTyped, setHasTyped] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState<number>(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    useEffect(() => {
      setQuery(value);
    }, [value]);

    useEffect(() => {
      if (!isOpen) {
        setHasTyped(false);
        setHighlightIndex(-1);
      } else if (autoFocus && inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
      }
    }, [isOpen, autoFocus]);

    const uniqueOptions = useMemo(() => {
      return Array.from(new Set(options.map((o) => o.trim()).filter(Boolean)));
    }, [options]);

    const filteredOptions = useMemo(() => {
      if (!hasTyped) return uniqueOptions;
      const normQ = normalizePersianInput(query.trim()).toLowerCase();
      if (!normQ) return uniqueOptions;
      return uniqueOptions.filter((opt) =>
        normalizePersianInput(opt).toLowerCase().includes(normQ)
      );
    }, [uniqueOptions, query, hasTyped]);

    const trimmedQuery = query.trim();
    const exactMatchExists = useMemo(() => {
      if (!trimmedQuery) return true;
      const normQ = normalizePersianInput(trimmedQuery).toLowerCase();
      return uniqueOptions.some(
        (opt) => normalizePersianInput(opt).toLowerCase() === normQ
      );
    }, [uniqueOptions, trimmedQuery]);

    const canCreateNew = allowCreate && trimmedQuery.length > 0 && !exactMatchExists;

    const activeDataColor = useMemo(() => {
      if (!optionColors || !trimmedQuery) return undefined;
      if (optionColors[trimmedQuery]) return optionColors[trimmedQuery];
      const normQ = normalizePersianInput(trimmedQuery).toLowerCase();
      const matchedKey = Object.keys(optionColors).find(
        (k) => normalizePersianInput(k).toLowerCase() === normQ
      );
      return matchedKey ? optionColors[matchedKey] : undefined;
    }, [optionColors, trimmedQuery]);

    const selectOption = (opt: string, isNew = false) => {
      setQuery(opt);
      setHasTyped(false);
      setHighlightIndex(-1);
      onChange(opt, { keepEditing: false });
      if (isNew && opt.trim()) {
        onCreateOption?.(opt.trim());
      }
      onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen) {
          onOpen?.();
        }
        if (filteredOptions.length > 0) {
          setHighlightIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen) {
          onOpen?.();
        }
        if (filteredOptions.length > 0) {
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : Math.max(0, filteredOptions.length - 1)
          );
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
          const chosen = filteredOptions[highlightIndex];
          setQuery(chosen);
          setHasTyped(false);
          setHighlightIndex(-1);
          onChange(chosen, { keepEditing: false });
        } else if (trimmedQuery) {
          setHasTyped(false);
          setHighlightIndex(-1);
          onChange(trimmedQuery, { keepEditing: false });
          if (canCreateNew) {
            onCreateOption?.(trimmedQuery);
          }
        }
        onClose();
        onCommitAndMoveDown?.();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
          const chosen = filteredOptions[highlightIndex];
          setQuery(chosen);
          setHasTyped(false);
          setHighlightIndex(-1);
          onChange(chosen, { keepEditing: false });
        } else if (trimmedQuery) {
          setHasTyped(false);
          setHighlightIndex(-1);
          onChange(trimmedQuery, { keepEditing: false });
          if (canCreateNew) {
            onCreateOption?.(trimmedQuery);
          }
        }
        onClose();
        onCommitAndMoveTab?.(e.shiftKey);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setHasTyped(false);
        setHighlightIndex(-1);
        onClose();
        return;
      }
    };

    return (
      <div className="relative w-full h-full flex items-center">
        {activeDataColor && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 mr-1.5 ml-0.5 pointer-events-none shadow-2xs border border-black/10"
            style={{ backgroundColor: activeDataColor }}
            title="رنگ اعتبارسنجی داده (Data Validation)"
          />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onMouseDown={(e) => {
            onMouseDown?.(e);
          }}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const nextVal = e.target.value;
            setQuery(nextVal);
            setHasTyped(true);
            setHighlightIndex(-1);
            if (!isOpen) {
              onOpen?.();
            }
            if (allowLiveChange) {
              onChange(nextVal, { keepEditing: true });
            }
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (trimmedQuery && trimmedQuery !== value) {
              onChange(trimmedQuery, { keepEditing: true });
            }
            if (canCreateNew && trimmedQuery) {
              onCreateOption?.(trimmedQuery);
            }
            setHasTyped(false);
            setHighlightIndex(-1);
            onClose();
          }}
          placeholder={placeholder}
          style={activeDataColor ? { color: activeDataColor } : undefined}
          className={`w-full h-8 pl-5 ${activeDataColor ? 'pr-1 font-bold' : 'pr-2'} bg-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-xs select-text cursor-text ${
            isOpen ? 'border-b-2 border-indigo-500 bg-white dark:bg-slate-900' : ''
          } ${
            align === 'left'
              ? 'font-mono font-bold text-left'
              : align === 'center'
              ? 'font-mono text-center'
              : 'font-medium text-right'
          }`}
        />

        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inputRef.current && document.activeElement !== inputRef.current) {
              inputRef.current.focus({ preventScroll: true });
            }
            if (isOpen) {
              onClose();
            } else {
              onOpen?.();
            }
          }}
          className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 px-1 select-none cursor-pointer"
          title="باز کردن فهرست اعتبارسنجی داده (Data Validation)"
        >
          ▾
        </button>

        {isOpen && (canCreateNew || filteredOptions.length > 0) && (
          <div
            ref={dropdownRef}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="absolute z-50 right-0 top-full mt-0.5 w-max min-w-full max-w-xs max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xl py-1 text-xs"
          >
            {canCreateNew && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  selectOption(trimmedQuery, true);
                }}
                className="px-2.5 py-1.5 cursor-pointer text-right font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2"
              >
                <span className="truncate">+ ثبت «{trimmedQuery}» (داده جدید)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono shrink-0">
                  جدید
                </span>
              </div>
            )}

            {filteredOptions.map((opt, idx) => {
              const optColor = optionColors?.[opt];
              return (
                <div
                  key={opt}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectOption(opt, false);
                  }}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={`px-2.5 py-1.5 cursor-pointer truncate text-right transition-colors flex items-center justify-between gap-2 ${
                    idx === highlightIndex
                      ? 'bg-indigo-600 text-white font-bold'
                      : opt === value
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {optColor && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
                        style={{ backgroundColor: optColor }}
                      />
                    )}
                    <span
                      className="truncate"
                      style={
                        optColor && idx !== highlightIndex
                          ? { color: optColor, fontWeight: 700 }
                          : undefined
                      }
                    >
                      {opt}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

GridSearchableSelect.displayName = 'GridSearchableSelect';
