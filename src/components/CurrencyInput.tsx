import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { formatLiveComma, parseCommaNumber, toEnglishDigits } from './CreatableCombobox';

export { formatLiveComma, parseCommaNumber, toEnglishDigits };

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string | null | undefined;
  onChange: (val: number, raw: string) => void;
  allowZero?: boolean;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      allowZero = false,
      placeholder = '',
      className = '',
      onFocus,
      ...rest
    },
    ref
  ) => {
    const internalRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => internalRef.current as HTMLInputElement);

    const displayValue =
      (value === 0 || value === '0') && !allowZero
        ? ''
        : value !== undefined && value !== null && value !== ''
        ? formatLiveComma(value)
        : '';

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      onFocus?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const normalized = toEnglishDigits(raw);
      const cursor = e.target.selectionStart ?? raw.length;
      const digitsBefore = (normalized.slice(0, cursor).match(/\d/g) || []).length;

      const parsedNum = parseCommaNumber(normalized);
      onChange(parsedNum, normalized);

      requestAnimationFrame(() => {
        if (!internalRef.current) return;
        const formatted = internalRef.current.value;
        let count = 0;
        let newCursor = formatted.length;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            count++;
            if (count === digitsBefore) {
              newCursor = i + 1;
              break;
            }
          }
        }
        internalRef.current.setSelectionRange(newCursor, newCursor);
      });
    };

    return (
      <input
        ref={internalRef}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={className}
        {...rest}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
