import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Check } from 'lucide-react';
import {
  formatPersianDate,
  addDaysToDate,
  getJalaliMonthDays,
  normalizeCalendarDigits,
} from '../utils/erpEngine';

interface JalaliDatePickerPopupProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

export const JalaliDatePickerPopup: React.FC<JalaliDatePickerPopupProps> = ({
  value,
  onChange,
  placeholder = 'انتخاب سررسید...',
  className = '',
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rawValue, setRawValue] = useState(value);
  const [parts, setParts] = useState(() => getInitialParts(value));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRawValue(value);
    setParts(getInitialParts(value));
  }, [value]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const setOffsetDate = (days: number) => {
    const target = addDaysToDate(new Date(), days);
    const formatted = formatPersianDate(target, { latinDigits: true });
    onChange(formatted);
    setRawValue(formatted);
    setParts(getInitialParts(formatted));
    setIsOpen(false);
  };

  const commitParts = () => {
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    if (
      !Number.isInteger(year) ||
      year < 1 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > getJalaliMonthDays(year, month)
    ) {
      return;
    }
    const formatted = `${year.toString().padStart(4, '0')}/${month
      .toString()
      .padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
    onChange(formatted);
    setRawValue(formatted);
    setIsOpen(false);
  };

  const commitTypedValue = () => {
    const normalized = normalizeCalendarDigits(rawValue.trim());
    const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) return;
    const nextParts = { year: match[1], month: match[2], day: match[3] };
    const year = Number(nextParts.year);
    const month = Number(nextParts.month);
    const day = Number(nextParts.day);
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > getJalaliMonthDays(year, month)
    ) {
      return;
    }
    const formatted = `${year}/${month.toString().padStart(2, '0')}/${day
      .toString()
      .padStart(2, '0')}`;
    onChange(formatted);
    setRawValue(formatted);
    setParts(nextParts);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1 text-xs">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          dir="ltr"
          inputMode="numeric"
          value={rawValue}
          onChange={(e) => {
            const next = e.target.value.replace(/[۰-۹٠-٩]/g, (digit) => {
              const faDigits = '۰۱۲۳۴۵۶۷۸۹';
              const arDigits = '٠١٢٣٤٥٦٧٨٩';
              const index = faDigits.indexOf(digit);
              return String(index >= 0 ? index : arDigits.indexOf(digit));
            });
            setRawValue(next);
            onChange(next);
          }}
          onBlur={commitTypedValue}
          onClick={() => setIsOpen(true)}
          placeholder={placeholder || 'سال/ماه/روز'}
          className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 pl-8 bg-white dark:bg-slate-900 tabular-nums text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none ${className}`}
        />
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors p-0.5"
          title="باز کردن تقویم سررسید"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 right-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>انتخاب تاریخ سررسید</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2" dir="ltr">
            <label className="space-y-1">
              <span className="block text-right text-[10px] text-slate-500">سال</span>
              <input
                type="number"
                min={1}
                value={parts.year}
                onChange={(event) =>
                  setParts((current) => ({ ...current, year: event.target.value }))
                }
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-center"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-right text-[10px] text-slate-500">ماه</span>
              <input
                type="number"
                min={1}
                max={12}
                value={parts.month}
                onChange={(event) =>
                  setParts((current) => ({ ...current, month: event.target.value }))
                }
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-center"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-right text-[10px] text-slate-500">روز</span>
              <input
                type="number"
                min={1}
                max={getJalaliMonthDays(Number(parts.year) || 1405, Number(parts.month) || 1)}
                value={parts.day}
                onChange={(event) =>
                  setParts((current) => ({ ...current, day: event.target.value }))
                }
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-center"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={commitParts}
            className="w-full rounded-md bg-indigo-600 px-2 py-1.5 font-bold text-white hover:bg-indigo-700"
          >
            <Check className="ml-1 inline h-3.5 w-3.5" />
            ثبت تاریخ
          </button>

          {/* Quick presets */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 mb-1.5">میانبرهای متداول:</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setOffsetDate(0)}
                className="px-2 py-1 text-right rounded-md bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[11px] font-medium transition-colors border border-slate-200 dark:border-slate-700/60"
              >
                ⚡ امروز (نقدی)
              </button>
              <button
                type="button"
                onClick={() => setOffsetDate(7)}
                className="px-2 py-1 text-right rounded-md bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[11px] font-medium transition-colors border border-slate-200 dark:border-slate-700/60"
              >
                📅 ۱ هفته بعد (+۷ روز)
              </button>
              <button
                type="button"
                onClick={() => setOffsetDate(15)}
                className="px-2 py-1 text-right rounded-md bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[11px] font-medium transition-colors border border-slate-200 dark:border-slate-700/60"
              >
                📅 ۱۵ روز بعد
              </button>
              <button
                type="button"
                onClick={() => setOffsetDate(30)}
                className="px-2 py-1 text-right rounded-md bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[11px] font-medium transition-colors border border-slate-200 dark:border-slate-700/60"
              >
                📅 ۱ ماه بعد (+۳۰ روز)
              </button>
              <button
                type="button"
                onClick={() => setOffsetDate(45)}
                className="px-2 py-1 text-right rounded-md bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[11px] font-medium transition-colors border border-slate-200 dark:border-slate-700/60"
              >
                📅 ۴۵ روز بعد
              </button>
              <button
                type="button"
                onClick={() => setOffsetDate(60)}
                className="px-2 py-1 text-right rounded-md bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-[11px] font-medium transition-colors border border-slate-200 dark:border-slate-700/60"
              >
                📅 ۲ ماه بعد (+۶۰ روز)
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">تاریخ انتخاب‌شده:</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {rawValue || 'تنظیم نشده'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

function getInitialParts(value: string): { year: string; month: string; day: string } {
  const normalized = normalizeCalendarDigits(value || formatPersianDate(new Date(), { latinDigits: true }));
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) return { year: match[1], month: match[2], day: match[3] };
  const today = formatPersianDate(new Date(), { latinDigits: true }).split('/');
  return { year: today[0] || '', month: today[1] || '', day: today[2] || '' };
}
