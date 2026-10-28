import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (barcode: string) => void;
  maxIntervalMs?: number;
  minLength?: number;
}

/**
 * Hardware barcode scanner listener that detects rapid keystroke bursts ending with Enter
 * without interfering with normal user typing inside standard form inputs.
 */
const PERSIAN_TO_ENGLISH_KEY_MAP: Record<string, string> = {
  ض: 'q', ص: 'w', ث: 'e', ق: 'r', ف: 't', غ: 'y', ع: 'u', ه: 'i', خ: 'o', ح: 'p', ج: '[', چ: ']',
  ش: 'a', س: 's', ی: 'd', ي: 'd', ب: 'f', ل: 'g', ا: 'h', ت: 'j', ن: 'k', م: 'l', ک: ';', گ: "'",
  ظ: 'z', ط: 'x', ز: 'c', ر: 'v', ذ: 'b', د: 'n', پ: 'm', و: ',',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

function normalizeScannedBarcode(raw: string): string {
  return Array.from(raw.trim())
    .map((ch) => PERSIAN_TO_ENGLISH_KEY_MAP[ch] ?? ch)
    .join('');
}

export function useBarcodeScanner({
  enabled = true,
  onScan,
  maxIntervalMs = 70,
  minLength = 3,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const lastScanRef = useRef<{ value: string; timestamp: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // If user is actively typing inside an editable field, allow normal typing and let
      // that input's own onKeyDown/Enter handler process it without double-adding.
      if (isEditableTarget) {
        bufferRef.current = '';
        return;
      }

      // Reset buffer if delay between keystrokes exceeds scanner threshold
      if (interval > maxIntervalMs) {
        bufferRef.current = '';
      }

      if (event.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          event.preventDefault();
          const scannedCode = normalizeScannedBarcode(bufferRef.current);
          bufferRef.current = '';
          const previousScan = lastScanRef.current;
          if (
            previousScan?.value === scannedCode &&
            now - previousScan.timestamp < 650
          ) {
            return;
          }
          lastScanRef.current = { value: scannedCode, timestamp: now };
          onScan(scannedCode);
        }
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        bufferRef.current += event.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, maxIntervalMs, minLength, onScan]);
}
