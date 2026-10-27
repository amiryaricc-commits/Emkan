import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ChevronDown, Check, Loader2, X } from 'lucide-react';

// ============================================================================
// SHOPIFY POLARIS CORE PRIMITIVES (Button, ButtonGroup, Collapsible, Sheet)
// ============================================================================

export interface PolarisButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  submit?: boolean;
  primary?: boolean;
  destructive?: boolean;
  outline?: boolean;
  plain?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'slim' | 'medium' | 'large';
  icon?: React.ReactNode;
  title?: string;
  className?: string;
}

export interface PolarisBadgeProps {
  children: React.ReactNode;
  status?: 'success' | 'info' | 'warning' | 'critical' | 'default';
}

export const PolarisBadge: React.FC<PolarisBadgeProps> = ({
  children,
  status = 'default',
}) => {
  const toneClass =
    status === 'success'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'info'
        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
        : status === 'warning'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : status === 'critical'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${toneClass}`}
    >
      {children}
    </span>
  );
};

export const PolarisButton: React.FC<PolarisButtonProps> = ({
  children,
  onClick,
  onMouseDown,
  onMouseUp,
  type = 'button',
  submit = false,
  primary = false,
  destructive = false,
  outline = false,
  plain = false,
  loading = false,
  disabled = false,
  fullWidth = false,
  size = 'medium',
  icon,
  title,
  className = '',
}) => {
  const isDisabled = disabled || loading;

  const sizeClasses =
    size === 'slim'
      ? 'px-2.5 py-1 text-xs'
      : size === 'large'
        ? 'px-5 py-2.5 text-xs'
        : 'px-3.5 py-2 text-xs';

  let variantClasses =
    'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs';

  if (destructive) {
    variantClasses = outline
      ? 'bg-white dark:bg-slate-900 text-rose-600 border border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'
      : 'bg-rose-600 text-white border border-rose-700 hover:bg-rose-700 shadow-2xs';
  } else if (primary) {
    variantClasses =
      'bg-slate-900 dark:bg-indigo-600 text-white border border-slate-950 dark:border-indigo-500 hover:bg-slate-800 dark:hover:bg-indigo-700 shadow-2xs';
  } else if (plain) {
    variantClasses =
      'bg-transparent text-indigo-600 dark:text-indigo-400 border-transparent hover:underline shadow-none px-1.5 py-1';
  }

  return (
    <button
      type={submit ? 'submit' : type}
      title={title}
      disabled={isDisabled}
      aria-busy={loading}
      onMouseDown={(e) => {
        if (!isDisabled) onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        if (!isDisabled) onMouseUp?.(e);
      }}
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};

export interface PolarisButtonGroupProps {
  children: React.ReactNode;
  segmented?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export const PolarisButtonGroup: React.FC<PolarisButtonGroupProps> = ({
  children,
  segmented = false,
  fullWidth = false,
  className = '',
}) => {
  return (
    <div
      role="group"
      className={`inline-flex flex-wrap items-center ${
        segmented
          ? 'bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 gap-1'
          : 'gap-2'
      } ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

export interface PolarisCollapsibleProps {
  id: string;
  open: boolean;
  children: React.ReactNode;
  className?: string;
}

export const PolarisCollapsible: React.FC<PolarisCollapsibleProps> = ({
  id,
  open,
  children,
  className = '',
}) => {
  if (!open) {
    return <div id={id} aria-hidden="true" className="hidden" />;
  }
  return (
    <div
      id={id}
      aria-hidden="false"
      className={`transition-opacity duration-150 opacity-100 ${className}`}
    >
      {children}
    </div>
  );
};

export interface PolarisSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  accessibilityLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const PolarisSheet: React.FC<PolarisSheetProps> = ({
  open,
  onClose,
  title,
  accessibilityLabel,
  children,
  footer,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={accessibilityLabel || title}
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between text-right">
        {/* Sheet Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنل"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sheet Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">{children}</div>

        {/* Sheet Footer */}
        {footer && (
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SHOPIFY POLARIS AUTOCOMPLETE + POPOVER (CREATABLE COMBOBOX)
// ============================================================================

export function toEnglishDigits(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function formatLiveComma(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const cleanStr = toEnglishDigits(value).replace(/[,،٬\s]/g, '').replace(/[^\d.-]/g, '');
  if (!cleanStr || isNaN(Number(cleanStr))) return '';
  const parts = cleanStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export function parseCommaNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  const cleanStr = toEnglishDigits(value).replace(/[,،٬\s]/g, '').replace(/[^\d.-]/g, '');
  const parsed = Number(cleanStr);
  return isNaN(parsed) ? 0 : parsed;
}

interface CreatableComboboxProps {
  label?: string;
  value: string;
  onChange: (newValue: string) => void;
  options: string[];
  onAddNewOption?: (newOption: string) => void;
  onPlusButtonClick?: () => void;
  plusButtonTitle?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowCreate?: boolean;
}

export const CreatableCombobox: React.FC<CreatableComboboxProps> = ({
  label,
  value,
  onChange,
  options,
  onAddNewOption,
  onPlusButtonClick,
  plusButtonTitle,
  placeholder = 'جستجو یا انتخاب...',
  disabled = false,
  className = '',
  allowCreate = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<(HTMLButtonElement | null)[]>([]);

  const [coords, setCoords] = useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
    placeAbove: boolean;
    maxHeight: number;
  }>({
    top: 0,
    bottom: 0,
    left: 0,
    width: 0,
    placeAbove: false,
    maxHeight: 220,
  });

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const updateCoords = useCallback(() => {
    const el = inputWrapperRef.current || containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;

    const desiredHeight = 220;
    const placeAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableHeight = placeAbove
      ? Math.min(desiredHeight, Math.max(120, spaceAbove - 16))
      : Math.min(desiredHeight, Math.max(120, spaceBelow - 16));

    setCoords({
      top: rect.bottom + 4,
      bottom: vh - rect.top + 4,
      left: rect.left,
      width: Math.max(rect.width, 180),
      placeAbove,
      maxHeight: availableHeight,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updateCoords();

    const handleScrollOrResize = () => {
      updateCoords();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updateCoords]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Scroll active option into view when navigating via arrow keys
  useEffect(() => {
    if (activeIndex >= 0 && optionsListRef.current[activeIndex]) {
      optionsListRef.current[activeIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [activeIndex]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(normalizedQuery)
  );
  const exactExists = options.some(
    (opt) => opt.trim().toLowerCase() === normalizedQuery
  );

  const handleCreateAndSelect = (rawText?: string) => {
    if (!allowCreate) return;
    const candidate = (rawText ?? query).trim();
    if (!candidate) return;
    if (!options.some((o) => o.trim().toLowerCase() === candidate.toLowerCase())) {
      onAddNewOption?.(candidate);
    }
    onChange(candidate);
    setQuery(candidate);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1">
        <div ref={inputWrapperRef} className="relative flex-1">
          <input
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            disabled={disabled}
            value={query}
            placeholder={placeholder}
            onFocus={() => {
              if (!disabled) {
                updateCoords();
                setIsOpen(true);
              }
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange(e.target.value);
              updateCoords();
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                updateCoords();
                setIsOpen(true);
                setActiveIndex((prev) =>
                  prev + 1 < filteredOptions.length ? prev + 1 : 0
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                updateCoords();
                setIsOpen(true);
                setActiveIndex((prev) =>
                  prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredOptions.length - 1)
                );
              } else if (e.key === 'Enter' && e.shiftKey && allowCreate) {
                e.preventDefault();
                handleCreateAndSelect();
              } else if (e.key === 'Enter' && isOpen) {
                if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
                  e.preventDefault();
                  const chosen = filteredOptions[activeIndex];
                  onChange(chosen);
                  setQuery(chosen);
                  setIsOpen(false);
                  setActiveIndex(-1);
                } else if (filteredOptions.length > 0 && !allowCreate) {
                  e.preventDefault();
                  const chosen = filteredOptions[0];
                  onChange(chosen);
                  setQuery(chosen);
                  setIsOpen(false);
                  setActiveIndex(-1);
                } else if (allowCreate && query.trim() && !exactExists) {
                  e.preventDefault();
                  handleCreateAndSelect();
                }
              } else if (e.key === 'Escape') {
                setIsOpen(false);
                setActiveIndex(-1);
              }
            }}
            className="w-full px-3 py-1.5 pl-7 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={disabled}
            tabIndex={-1}
            onClick={() => {
              updateCoords();
              setIsOpen((prev) => !prev);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        {allowCreate && (
          <button
            type="button"
            disabled={disabled}
            title={plusButtonTitle || 'افزودن فوری مورد جدید (+)'}
            onClick={() => {
              if (onPlusButtonClick) {
                onPlusButtonClick();
                return;
              }
              if (query.trim() && !exactExists) {
                handleCreateAndSelect();
              } else {
                updateCoords();
                setIsOpen((prev) => !prev);
              }
            }}
            className="px-2 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-900 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors shrink-0 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* React Portal: Floating Popover outside all sections & overflow containers */}
      {isOpen && !disabled && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: 'fixed',
            top: coords.placeAbove ? 'auto' : `${coords.top}px`,
            bottom: coords.placeAbove ? `${coords.bottom}px` : 'auto',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            zIndex: 99999,
          }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl overflow-y-auto text-xs divide-y divide-slate-100 dark:divide-slate-800"
        >
          {/* Polaris Autocomplete actionBefore: Creatable Immediate Action */}
          {allowCreate && query.trim() && !exactExists && (
            <button
              type="button"
              onClick={() => handleCreateAndSelect()}
              className="w-full px-3 py-2 text-right bg-indigo-50/90 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>افزودن فوری «{query.trim()}»</span>
              </span>
              <span className="text-[10px] font-mono opacity-75">Enter</span>
            </button>
          )}
          {filteredOptions.map((opt, idx) => (
            <button
              key={opt}
              ref={(el) => {
                optionsListRef.current[idx] = el;
              }}
              type="button"
              role="option"
              aria-selected={value === opt}
              onClick={() => {
                onChange(opt);
                setQuery(opt);
                setIsOpen(false);
                setActiveIndex(-1);
              }}
              className={`w-full px-3 py-2 text-right flex items-center justify-between text-slate-800 dark:text-slate-200 cursor-pointer ${
                idx === activeIndex
                  ? 'bg-indigo-50 dark:bg-slate-800 font-semibold text-indigo-600 dark:text-indigo-400'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{opt}</span>
              {value === opt && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
            </button>
          ))}
          {filteredOptions.length === 0 && !query.trim() && (
            <div className="px-3 py-2 text-slate-400 text-center">موردی یافت نشد</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
