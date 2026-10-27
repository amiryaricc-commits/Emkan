import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  Copy,
  ArrowDown,
  ClipboardPaste,
  Scissors,
  Undo2,
  Redo2,
  Eraser,
  CheckSquare,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { MasterOptionsRegistry, InventoryItemRecord } from '../data/erpSeedData';
import { formatCurrency, detectCategorySector } from '../utils/erpEngine';
import { CurrencyInput, parseCommaNumber } from './CurrencyInput';
import { GridSearchableSelect } from './GridSearchableSelect';
import { getPopulatedPurchaseInvoiceLines } from '../utils/purchaseInvoice';

export interface PurchaseInvoiceLineGridItem {
  id: string;
  itemName: string;
  parentTag: string;
  itemCondition: string;
  itemType?: string;
  sector?: 'vape' | 'pc';
  qty: number;
  unitCost: number;
  discountAmount?: number;
  notes?: string;
}

export const createEmptyPurchaseLine = (index: number): PurchaseInvoiceLineGridItem => ({
  id: `pline-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
  itemName: '',
  parentTag: '',
  itemCondition: 'آکبند',
  itemType: '',
  sector: 'vape',
  qty: 0,
  unitCost: 0,
  discountAmount: 0,
  notes: '',
});

export interface PurchaseGridColumnDef {
  col: string; // A, B, C...
  id: keyof PurchaseInvoiceLineGridItem | 'lineTotal' | 'netLineAmount';
  label: string;
  width: string;
  align: 'right' | 'center' | 'left';
  type: 'text' | 'number' | 'currency' | 'select' | 'readonly_currency' | 'readonly_badge';
  options?: string[];
}

interface PurchaseInvoiceSheetsGridProps {
  lines: PurchaseInvoiceLineGridItem[];
  onChangeLines: (newLines: PurchaseInvoiceLineGridItem[]) => void;
  masterOptions?: MasterOptionsRegistry;
  categorySectors?: Record<string, 'vape' | 'pc'>;
  catalogItems?: InventoryItemRecord[];
  onShowToast: (msg: string) => void;
  onAddMasterOption?: (category: keyof MasterOptionsRegistry, value: string) => void;
  onSetCategorySector?: (category: string, sector: 'vape' | 'pc') => void;
}

export const PurchaseInvoiceSheetsGrid: React.FC<PurchaseInvoiceSheetsGridProps> = ({
  lines,
  onChangeLines,
  masterOptions,
  categorySectors,
  catalogItems = [],
  onShowToast,
  onAddMasterOption,
  onSetCategorySector,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [isEditing, setIsEditing] = useState(false);

  // Dynamic columns definition
  const columns = useMemo<PurchaseGridColumnDef[]>(() => {
    return [
      {
        col: 'A',
        id: 'itemName',
        label: '۱. جست‌وجو / نام کالا در فاکتور *',
        width: 'min-w-[260px]',
        align: 'right',
        type: 'select',
        options: Array.from(
          new Set(catalogItems.flatMap((item) => [item.name, item.parentTag || '']))
        ),
      },
      {
        col: 'B',
        id: 'parentTag',
        label: '۲. دسته‌بندی کالا *',
        width: 'min-w-[200px]',
        align: 'right',
        type: 'select',
        options: Array.from(
          new Set([
            '',
            ...(masterOptions?.tags || []),
            ...(masterOptions?.itemTypes || []),
            'سالت نیکوتین',
            'جویس فری‌بیس',
            'سیستم پاد ماد',
            'دستگاه پاد و ماد',
            'کارتریج و کویل',
            'پاد یکبارمصرف',
            'قطعات کامپیوتر و سخت‌افزار',
            'کارت گرافیک',
            'پردازنده و مادربرد',
            'رم و حافظه SSD',
            'لوازم جانبی ویپ',
          ])
        ),
      },
      {
        col: 'C',
        id: 'itemCondition',
        label: '۳. وضعیت فیزیکی',
        width: 'min-w-[125px]',
        align: 'center',
        type: 'select',
        options: masterOptions?.conditions?.length
          ? masterOptions.conditions
          : ['آکبند', 'استوک', 'کارکرده / تستر'],
      },
      {
        col: 'D',
        id: 'qty',
        label: '۴. تعداد (Qty) *',
        width: 'min-w-[100px]',
        align: 'center',
        type: 'number',
      },
      {
        col: 'E',
        id: 'unitCost',
        label: '۵. فی خرید واحد (تومان) *',
        width: 'min-w-[160px]',
        align: 'left',
        type: 'currency',
      },
      {
        col: 'F',
        id: 'discountAmount',
        label: '۶. تخفیف مبلغی ردیف (تومان)',
        width: 'min-w-[110px]',
        align: 'center',
        type: 'currency',
      },
      {
        col: 'G',
        id: 'netLineAmount',
        label: '۷. جمع ردیف (تومان)',
        width: 'min-w-[160px]',
        align: 'left',
        type: 'readonly_currency',
      },
      {
        col: 'H',
        id: 'notes',
        label: '۸. توضیحات / بارکد کارتن',
        width: 'min-w-[200px]',
        align: 'right',
        type: 'text',
      },
    ];
  }, [masterOptions, catalogItems]);

  // Selection range state
  const [selectionRange, setSelectionRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }>({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

  const [isMouseSelecting, setIsMouseSelecting] = useState(false);
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragHoverRow, setDragHoverRow] = useState<number | null>(null);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<PurchaseInvoiceLineGridItem[][]>([lines]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistoryState = useCallback(
    (newLines: PurchaseInvoiceLineGridItem[]) => {
      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        next.push(newLines);
        if (next.length > 30) next.shift();
        return next;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 29));
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const targetState = history[targetIdx];
      if (targetState) {
        setHistoryIndex(targetIdx);
        onChangeLines(targetState);
        onShowToast('واگرد (Undo) انجام شد.');
      }
    }
  }, [historyIndex, history, onChangeLines, onShowToast]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetIdx = historyIndex + 1;
      const targetState = history[targetIdx];
      if (targetState) {
        setHistoryIndex(targetIdx);
        onChangeLines(targetState);
        onShowToast('بازگشت (Redo) انجام شد.');
      }
    }
  }, [historyIndex, history, onChangeLines, onShowToast]);

  // Clipboard Copied Range
  const [copiedRange, setCopiedRange] = useState<{
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
    data: string[][];
    isCut?: boolean;
  } | null>(null);

  // Bounding selection box calculation
  const selectionBox = useMemo(() => {
    const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
    const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
    const minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
    const maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);
    const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    const isMultiCell = cellCount > 1;
    return { minRow, maxRow, minCol, maxCol, isMultiCell, cellCount };
  }, [selectionRange]);

  // Refs for virtual cell elements
  const cellTdRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const inputRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const setCellTdRef = (key: string, el: HTMLTableCellElement | null) => {
    if (el) cellTdRefs.current.set(key, el);
    else cellTdRefs.current.delete(key);
  };

  const setInputRef = (
    key: string,
    el: HTMLInputElement | HTMLSelectElement | null
  ) => {
    if (el) inputRefs.current.set(key, el);
    else inputRefs.current.delete(key);
  };

  // Scroll active cell into view
  const scrollActiveCellIntoView = useCallback((row: number, col: number) => {
    const key = `${row}_${col}`;
    const td = cellTdRefs.current.get(key);
    if (td && tableContainerRef.current) {
      td.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, []);

  // Cell Selection Handler
  const selectCell = useCallback(
    (row: number, col: number, startEdit = false) => {
      const validR = Math.max(0, Math.min(row, lines.length - 1));
      const validC = Math.max(0, Math.min(col, columns.length - 1));
      setActiveCell({ row: validR, col: validC });
      setSelectionRange({
        startRow: validR,
        startCol: validC,
        endRow: validR,
        endCol: validC,
      });
      setIsEditing(startEdit);
      scrollActiveCellIntoView(validR, validC);

      if (startEdit) {
        setTimeout(() => {
          const inputEl = inputRefs.current.get(`${validR}_${validC}`);
          if (inputEl && document.activeElement !== inputEl) {
            inputEl.focus();
          }
        }, 0);
      } else {
        setTimeout(() => {
          const td = cellTdRefs.current.get(`${validR}_${validC}`);
          if (td) td.focus();
        }, 20);
      }
    },
    [lines.length, columns.length, scrollActiveCellIntoView]
  );

  const expandSelection = useCallback(
    (row: number, col: number) => {
      const validR = Math.max(0, Math.min(row, lines.length - 1));
      const validC = Math.max(0, Math.min(col, columns.length - 1));
      setSelectionRange((prev) => ({
        ...prev,
        endRow: validR,
        endCol: validC,
      }));
      scrollActiveCellIntoView(validR, validC);
    },
    [lines.length, columns.length, scrollActiveCellIntoView]
  );

  const selectRow = useCallback(
    (rowIdx: number) => {
      setActiveCell({ row: rowIdx, col: 0 });
      setSelectionRange({
        startRow: rowIdx,
        startCol: 0,
        endRow: rowIdx,
        endCol: columns.length - 1,
      });
      setIsEditing(false);
      scrollActiveCellIntoView(rowIdx, 0);
    },
    [columns.length, scrollActiveCellIntoView]
  );

  const selectColumn = useCallback(
    (colIdx: number) => {
      setActiveCell({ row: 0, col: colIdx });
      setSelectionRange({
        startRow: 0,
        startCol: colIdx,
        endRow: lines.length - 1,
        endCol: colIdx,
      });
      setIsEditing(false);
      scrollActiveCellIntoView(0, colIdx);
    },
    [lines.length, scrollActiveCellIntoView]
  );

  const selectAll = useCallback(() => {
    setActiveCell({ row: 0, col: 0 });
    setSelectionRange({
      startRow: 0,
      startCol: 0,
      endRow: lines.length - 1,
      endCol: columns.length - 1,
    });
    setIsEditing(false);
    onShowToast(`تمامی سلول‌های جدول فاکتور انتخاب شدند (${lines.length * columns.length} سلول).`);
  }, [lines.length, columns.length, onShowToast]);

  // Apply parsed string value to a row field (for paste / fill down)
  const applyParsedValueToRow = useCallback(
    (
      row: PurchaseInvoiceLineGridItem,
      colDef: PurchaseGridColumnDef,
      rawVal: string
    ): PurchaseInvoiceLineGridItem => {
      const next = { ...row };
      const field = colDef.id;
      const cleanStr = rawVal.trim();

      if (field === 'lineTotal' || field === 'netLineAmount' || field === 'sector') {
        return next; // Readonly fields
      }

      if (colDef.type === 'currency' || colDef.type === 'number') {
        const num = parseCommaNumber(cleanStr) || 0;
        (next as Record<string, unknown>)[field] = num;
      } else {
        (next as Record<string, unknown>)[field] = cleanStr;
      }

      // Auto-detect sector if parentTag or itemName changed
      if (field === 'parentTag' || field === 'itemName') {
        const checkTag = field === 'parentTag' ? cleanStr : next.parentTag || next.itemName;
        const detected = detectCategorySector(checkTag, categorySectors);
        next.sector = detected;
        if (field === 'parentTag') {
          next.itemType = cleanStr;
        }
      }

      return next;
    },
    [categorySectors]
  );

  // Copy (Ctrl+C)
  const handleCopy = useCallback(() => {
    const { minRow, maxRow, minCol, maxCol, cellCount } = selectionBox;
    const matrix: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowItem = lines[r];
      const rowVals: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const colDef = columns[c];
        if (!colDef) continue;
        let val = '';
        if (colDef.id === 'lineTotal') {
          val = String(rowItem ? rowItem.qty * rowItem.unitCost : 0);
        } else if (colDef.id === 'netLineAmount') {
          const rawTotal = rowItem ? rowItem.qty * rowItem.unitCost : 0;
          val = String(Math.max(0, rawTotal - (rowItem?.discountAmount || 0)));
        } else if (colDef.id === 'sector') {
          val = rowItem?.sector === 'pc' ? 'کامپیوتر' : 'ویپ‌شاپ';
        } else {
          val = rowItem ? String(rowItem[colDef.id as keyof PurchaseInvoiceLineGridItem] ?? '') : '';
        }
        rowVals.push(val);
      }
      matrix.push(rowVals);
    }

    const tsv = matrix.map((row) => row.join('\t')).join('\n');
    try {
      navigator.clipboard.writeText(tsv);
    } catch {}

    setCopiedRange({
      minRow,
      maxRow,
      minCol,
      maxCol,
      data: matrix,
      isCut: false,
    });

    onShowToast(`تعداد ${cellCount} سلول در حافظه کپی شد.`);
  }, [selectionBox, lines, columns, onShowToast]);

  // Cut (Ctrl+X)
  const handleCut = useCallback(() => {
    handleCopy();
    setCopiedRange((prev) => (prev ? { ...prev, isCut: true } : null));
    onShowToast('محدوده برش داده شد (آماده پیست).');
  }, [handleCopy, onShowToast]);

  // Paste (Ctrl+V)
  const handlePaste = useCallback(async () => {
    let clipText = '';
    try {
      clipText = await navigator.clipboard.readText();
    } catch {
      if (copiedRange) {
        clipText = copiedRange.data.map((r) => r.join('\t')).join('\n');
      }
    }

    if (!clipText && copiedRange) {
      clipText = copiedRange.data.map((r) => r.join('\t')).join('\n');
    }

    if (!clipText.trim()) {
      onShowToast('حافظه کپی خالی است.');
      return;
    }

    const rowsTsv = clipText
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map((l) => l.split('\t'));

    if (rowsTsv.length === 0) return;

    const startR = selectionBox.minRow;
    const startC = selectionBox.minCol;
    const isSinglePasteVal = rowsTsv.length === 1 && rowsTsv[0].length === 1;

    let workingLines = [...lines];
    const requiredRowsCount = Math.max(
      workingLines.length,
      isSinglePasteVal ? selectionBox.maxRow + 1 : startR + rowsTsv.length
    );

    while (workingLines.length < requiredRowsCount) {
      workingLines.push(createEmptyPurchaseLine(workingLines.length));
    }

    if (isSinglePasteVal && selectionBox.isMultiCell) {
      // Broadcast single value across entire selection range
      const fillVal = rowsTsv[0][0];
      for (let r = selectionBox.minRow; r <= selectionBox.maxRow; r++) {
        for (let c = selectionBox.minCol; c <= selectionBox.maxCol; c++) {
          const colDef = columns[c];
          if (colDef) {
            workingLines[r] = applyParsedValueToRow(workingLines[r], colDef, fillVal);
          }
        }
      }
    } else {
      // 2D Matrix paste starting at startR, startC
      for (let rOffset = 0; rOffset < rowsTsv.length; rOffset++) {
        const rIdx = startR + rOffset;
        const rowData = rowsTsv[rOffset];
        if (rIdx >= workingLines.length) break;

        for (let cOffset = 0; cOffset < rowData.length; cOffset++) {
          const cIdx = startC + cOffset;
          if (cIdx >= columns.length) break;
          const colDef = columns[cIdx];
          const val = rowData[cOffset];
          workingLines[rIdx] = applyParsedValueToRow(workingLines[rIdx], colDef, val);
        }
      }
    }

    // Clear cut source cells if applicable
    if (copiedRange?.isCut) {
      for (let r = copiedRange.minRow; r <= copiedRange.maxRow; r++) {
        for (let c = copiedRange.minCol; c <= copiedRange.maxCol; c++) {
          const inPasteTarget =
            r >= startR &&
            r < startR + rowsTsv.length &&
            c >= startC &&
            c < startC + (rowsTsv[0]?.length || 1);
          if (!inPasteTarget && workingLines[r]) {
            const colDef = columns[c];
            workingLines[r] = applyParsedValueToRow(workingLines[r], colDef, '');
          }
        }
      }
      setCopiedRange(null);
    }

    pushHistoryState(workingLines);
    onChangeLines(workingLines);
    onShowToast('پیست با موفقیت انجام شد.');
  }, [
    selectionBox,
    lines,
    columns,
    copiedRange,
    applyParsedValueToRow,
    pushHistoryState,
    onChangeLines,
    onShowToast,
  ]);

  // Duplicate / Fill Down (Ctrl+D)
  const handleDuplicateOrFillDown = useCallback(() => {
    const { minRow, maxRow, minCol, maxCol, isMultiCell } = selectionBox;
    const updated = [...lines];

    if (isMultiCell && maxRow > minRow) {
      // Fill down the top row of selection over the rest of selected rows
      for (let r = minRow + 1; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const colDef = columns[c];
          if (!colDef) continue;
          const field = colDef.id;
          if (field === 'lineTotal' || field === 'netLineAmount' || field === 'sector') continue;
          (updated[r] as unknown as Record<string, unknown>)[field] = (
            updated[minRow] as unknown as Record<string, unknown>
          )[field];
        }
      }
      pushHistoryState(updated);
      onChangeLines(updated);
      onShowToast(`تکثیر سطرهای انتخاب شده به پایین انجام شد.`);
    } else {
      const curIdx = activeCell.row;
      const source = lines[curIdx];
      if (!source) return;

      if (curIdx > 0 && minCol === maxCol) {
        // Copy cell above
        const aboveRow = lines[curIdx - 1];
        const colDef = columns[activeCell.col];
        if (aboveRow && colDef) {
          const field = colDef.id;
          if (field !== 'lineTotal' && field !== 'netLineAmount' && field !== 'sector') {
            updated[curIdx] = {
              ...source,
              [field]: (aboveRow as unknown as Record<string, unknown>)[field],
            };
            pushHistoryState(updated);
            onChangeLines(updated);
            onShowToast('مقدار از سطر بالا کپی شد.');
            return;
          }
        }
      }

      // Duplicate entire row
      const clone: PurchaseInvoiceLineGridItem = {
        ...source,
        id: `pline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
      updated.splice(curIdx + 1, 0, clone);
      pushHistoryState(updated);
      onChangeLines(updated);
      onShowToast(`سطر #${curIdx + 1} تکثیر شد.`);
      selectCell(curIdx + 1, activeCell.col, false);
    }
  }, [
    selectionBox,
    lines,
    columns,
    activeCell,
    pushHistoryState,
    onChangeLines,
    onShowToast,
    selectCell,
  ]);

  // Clear contents of selection (Delete / Backspace)
  const handleClearSelection = useCallback(() => {
    const { minRow, maxRow, minCol, maxCol, cellCount } = selectionBox;
    const updated = lines.map((r, rIdx) => {
      if (rIdx < minRow || rIdx > maxRow) return r;
      const next = { ...r };
      for (let c = minCol; c <= maxCol; c++) {
        const colDef = columns[c];
        if (!colDef) continue;
        const field = colDef.id;
        if (field === 'lineTotal' || field === 'netLineAmount' || field === 'sector') continue;
        if (colDef.type === 'currency' || colDef.type === 'number') {
          (next as Record<string, unknown>)[field] = 0;
        } else {
          (next as Record<string, unknown>)[field] = '';
        }
      }
      return next;
    });

    pushHistoryState(updated);
    onChangeLines(updated);
    onShowToast(`محتوای ${cellCount} سلول پاک شد.`);
  }, [selectionBox, lines, columns, pushHistoryState, onChangeLines, onShowToast]);

  // Delete row
  const handleDeleteRow = useCallback(
    (rowIdx: number) => {
      if (lines.length <= 1) return;
      const updated = lines.filter((_, idx) => idx !== rowIdx);
      pushHistoryState(updated);
      onChangeLines(updated);
      if (activeCell.row >= updated.length) {
        selectCell(updated.length - 1, activeCell.col, false);
      }
      onShowToast(`سطر #${rowIdx + 1} حذف شد.`);
    },
    [lines, activeCell, pushHistoryState, onChangeLines, selectCell, onShowToast]
  );

  // Add new row helper
  const handleAddNewRow = (afterIndex?: number) => {
    const lastRow = lines[lines.length - 1];
    if (
      lastRow &&
      !lastRow.itemName.trim() &&
      !lastRow.parentTag.trim() &&
      lastRow.qty <= 0 &&
      lastRow.unitCost <= 0 &&
      (lastRow.discountAmount || 0) <= 0 &&
      !lastRow.notes?.trim()
    ) {
      selectCell(lines.length - 1, activeCell.col, true);
      return lines.length - 1;
    }

    const prevRow = lines[afterIndex ?? lines.length - 1];
    const defaultCondition = prevRow?.itemCondition || 'آکبند';
    const defaultSector = prevRow?.sector || 'vape';

    const newRow: PurchaseInvoiceLineGridItem = {
      ...createEmptyPurchaseLine(lines.length),
      itemCondition: defaultCondition,
      sector: defaultSector,
    };

    let updated: PurchaseInvoiceLineGridItem[];
    if (afterIndex !== undefined && afterIndex < lines.length - 1) {
      updated = [...lines];
      updated.splice(afterIndex + 1, 0, newRow);
    } else {
      updated = [...lines, newRow];
    }
    pushHistoryState(updated);
    onChangeLines(updated);
    const targetIdx = afterIndex !== undefined ? afterIndex + 1 : lines.length;
    if (lines.length === 0) {
      window.setTimeout(() => selectCell(0, activeCell.col, true), 40);
    } else {
      selectCell(targetIdx, activeCell.col, false);
    }
    return targetIdx;
  };

  // Fill down over drag range
  const handleFillDownRange = (fromRow: number, toRow: number, colIdx: number) => {
    const source = lines[fromRow];
    if (!source || toRow <= fromRow) return;
    const colDef = columns[colIdx];
    if (!colDef) return;
    const field = colDef.id;
    if (field === 'lineTotal' || field === 'netLineAmount' || field === 'sector') return;

    const updated = lines.map((r, idx) => {
      if (idx <= fromRow || idx > toRow) return r;
      const next = { ...r };
      (next as unknown as Record<string, unknown>)[field] = (source as unknown as Record<string, unknown>)[field];
      if (field === 'parentTag' || field === 'itemName') {
        const checkTag = field === 'parentTag' ? next.parentTag : next.parentTag || next.itemName;
        next.sector = detectCategorySector(checkTag, categorySectors);
      }
      return next;
    });

    pushHistoryState(updated);
    onChangeLines(updated);
    onShowToast(`تکثیر سلول تا سطر #${toRow + 1} انجام شد.`);
  };

  // Window mouseup / click listeners for drag fill
  useEffect(() => {
    const handleWindowMouseUp = () => {
      setIsMouseSelecting(false);
      if (isDraggingFill && dragStart && dragHoverRow !== null) {
        if (dragHoverRow > dragStart.row) {
          handleFillDownRange(dragStart.row, dragHoverRow, dragStart.col);
        }
      }
      setIsDraggingFill(false);
      setDragStart(null);
      setDragHoverRow(null);
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [isDraggingFill, dragStart, dragHoverRow, columns, lines]);

  // Update a single cell value
  const updateRowField = <K extends keyof PurchaseInvoiceLineGridItem>(
    rowIdx: number,
    field: K,
    val: PurchaseInvoiceLineGridItem[K]
  ) => {
    const updated = lines.map((r, idx) => {
      if (idx !== rowIdx) return r;
      const next = { ...r, [field]: val };

      // Auto detect sector when parentTag or itemName changes
      if (field === 'parentTag' || field === 'itemName') {
        const checkTag = String(
          field === 'parentTag' ? val : next.parentTag || next.itemName || ''
        );
        const detected = detectCategorySector(checkTag, categorySectors);
        next.sector = detected;
        if (field === 'parentTag') {
          next.itemType = String(val || '');
          if (val && onAddMasterOption) {
            onAddMasterOption('tags', String(val));
          }
          if (val && onSetCategorySector) {
            onSetCategorySector(String(val), detected);
          }
        }
      }

      if (field === 'itemName' && val) {
        const match = catalogItems.find(
          (it) => it.name.trim().toLowerCase() === String(val).trim().toLowerCase()
        );
        if (match) {
          next.parentTag = match.parentTag || match.category;
          next.sector = match.sector || detectCategorySector(next.parentTag, categorySectors);
          if (match.condition) next.itemCondition = match.condition;
          if (match.valuationRate) next.unitCost = match.valuationRate;
          next.notes = match.sku;
        } else if (onAddMasterOption) {
          onAddMasterOption('tags', String(val).trim());
        }
      }

      return next;
    });

    onChangeLines(updated);
  };

  // Keyboard navigation on Cell TD
  const handleCellTdKeyDown = (
    e: React.KeyboardEvent<HTMLTableCellElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Copy / Cut / Paste / Duplicate / Select All
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      handleCopy();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      handleCut();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      void handlePaste();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      handleDuplicateOrFillDown();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAll();
      return;
    }

    // Delete / Backspace: Clear cell
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handleClearSelection();
      return;
    }

    // Shift + Arrows: Range expansion
    if (e.shiftKey) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        expandSelection(selectionRange.endRow + 1, selectionRange.endCol);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        expandSelection(selectionRange.endRow - 1, selectionRange.endCol);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        expandSelection(selectionRange.endRow, selectionRange.endCol + 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        expandSelection(selectionRange.endRow, selectionRange.endCol - 1);
        return;
      }
    }

    // ENTER: Always moves to the row below
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        if (rowIdx > 0) selectCell(rowIdx - 1, colIdx, false);
      } else {
        if (rowIdx + 1 < lines.length) {
          selectCell(rowIdx + 1, colIdx, false);
        } else {
          const nextIdx = handleAddNewRow(rowIdx);
          setTimeout(() => selectCell(nextIdx, colIdx, true), 40);
        }
      }
      return;
    }

    // ARROWS: 4-way navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx + 1 < lines.length) selectCell(rowIdx + 1, colIdx, false);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) selectCell(rowIdx - 1, colIdx, false);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (colIdx + 1 < columns.length) selectCell(rowIdx, colIdx + 1, false);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (colIdx > 0) selectCell(rowIdx, colIdx - 1, false);
      return;
    }

    // TAB / SHIFT+TAB
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) selectCell(rowIdx, colIdx - 1, false);
        else if (rowIdx > 0) selectCell(rowIdx - 1, columns.length - 1, false);
      } else {
        if (colIdx + 1 < columns.length) selectCell(rowIdx, colIdx + 1, false);
        else if (rowIdx + 1 < lines.length) selectCell(rowIdx + 1, 0, false);
      }
      return;
    }

    // F2 or Space: Enter edit mode
    if (e.key === 'F2' || e.key === ' ') {
      const colDef = columns[colIdx];
      if (
        colDef &&
        colDef.type !== 'readonly_currency' &&
        colDef.type !== 'readonly_badge'
      ) {
        e.preventDefault();
        selectCell(rowIdx, colIdx, true);
        return;
      }
    }

    // Direct character typing triggers edit
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const colDef = columns[colIdx];
      if (
        colDef &&
        colDef.type !== 'readonly_currency' &&
        colDef.type !== 'readonly_badge'
      ) {
        e.preventDefault();
        selectCell(rowIdx, colIdx, true);
        if (colDef.type !== 'select') {
          updateRowField(
            rowIdx,
            colDef.id as keyof PurchaseInvoiceLineGridItem,
            e.key as never
          );
        }
      }
    }
  };

  // Keyboard handling inside input
  const handleInputKeyDown = (
    e: React.KeyboardEvent,
    rowIdx: number,
    colIdx: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setIsEditing(false);
      if (rowIdx + 1 < lines.length) {
        selectCell(rowIdx + 1, colIdx, false);
      } else {
        const nextIdx = handleAddNewRow(rowIdx);
        setTimeout(() => selectCell(nextIdx, colIdx, true), 40);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      setIsEditing(false);
      if (e.shiftKey) {
        if (colIdx > 0) selectCell(rowIdx, colIdx - 1, false);
      } else {
        if (colIdx + 1 < columns.length) selectCell(rowIdx, colIdx + 1, false);
        else if (rowIdx + 1 < lines.length) selectCell(rowIdx + 1, 0, false);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      selectCell(rowIdx, colIdx, false);
      return;
    }
  };

  // Formula bar label & value
  const activeCellCoord = useMemo(() => {
    const colLetter = columns[activeCell.col]?.col || 'A';
    return `${colLetter}${activeCell.row + 1}`;
  }, [activeCell, columns]);

  const activeCellValue = useMemo(() => {
    const row = lines[activeCell.row];
    if (!row) return '';
    const colDef = columns[activeCell.col];
    if (!colDef) return '';
    if (colDef.id === 'lineTotal') {
      return `${formatCurrency(row.qty * row.unitCost)} تومان`;
    }
    if (colDef.id === 'netLineAmount') {
      const gross = row.qty * row.unitCost;
      const net = Math.max(0, gross - (row.discountAmount || 0));
      return `${formatCurrency(net)} تومان`;
    }
    if (colDef.id === 'sector') {
      return row.sector === 'pc' ? '💻 صنف قطعات کامپیوتر (FIFO)' : '💨 صنف ویپ‌شاپ (میانگین موزون)';
    }
    const val = row[colDef.id as keyof PurchaseInvoiceLineGridItem];
    if (val === undefined || val === null || val === '') return '';
    if (colDef.type === 'currency') return `${formatCurrency(Number(val) || 0)} تومان`;
    return String(val);
  }, [lines, activeCell, columns]);

  // Overall grid financial summary
  const summary = useMemo(() => {
    const validLines = getPopulatedPurchaseInvoiceLines(lines);
    const totalQty = validLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const subtotal = validLines.reduce((s, l) => s + l.qty * l.unitCost, 0);
    const totalDiscount = validLines.reduce((s, l) => {
      const gross = l.qty * l.unitCost;
      return s + Math.min(gross, Math.max(0, l.discountAmount || 0));
    }, 0);
    const grandTotal = Math.max(0, subtotal - totalDiscount);
    return {
      validCount: validLines.length,
      totalQty,
      subtotal,
      totalDiscount,
      grandTotal,
    };
  }, [lines]);

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 flex flex-col h-screen w-screen p-3 md:p-4 overflow-hidden'
    : 'space-y-2.5';

  return (
    <div className={containerClass}>
      {/* =====================================================================
          HEADER & GOOGLE SHEETS TOOLBAR
         ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl shadow-xs p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Title & Real-time Live Badge */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  کاربرگ ثبت اقلام فاکتور خرید (طرح شیت اکسل)
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  {summary.validCount} قلم معتبر
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                <span>
                  کلیدهای <strong>↑ ↓ ← →</strong> ناوبری ۴ جهته با اسکرول خودکار
                </span>
                <span>·</span>
                <span>
                  <strong>Enter</strong> = سطر بعدی
                </span>
                <span>·</span>
                <span>
                  <strong>Ctrl+C / Ctrl+V</strong> = کپی و پیست مستقیم ماتریس از اکسل
                </span>
                <span>·</span>
                <span>
                  <strong>Ctrl+D</strong> = تکثیر سطر یا سلول بالا به پایین
                </span>
              </p>
            </div>
          </div>

          {/* Quantity and Grand Total Pill & Fullscreen Toggle */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 font-bold text-xs flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
              <span>تعداد کل:</span>
              <span className="font-mono text-sm font-black text-indigo-700 dark:text-indigo-300">
                {summary.totalQty}
              </span>
              <span>عدد</span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span>جمع فاکتور:</span>
              <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-400">
                {formatCurrency(summary.grandTotal)}
              </span>
              <span>تومان</span>
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs ${
                isFullscreen
                  ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>خروج از تمام‌صفحه</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>⛶ تمام‌صفحه کردن</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Formula Bar (fx) & Quick Sheet Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          {/* Formula Bar */}
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <div className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-700 dark:text-slate-300 text-center w-14 shadow-xs">
              {activeCellCoord}
            </div>
            {selectionBox.isMultiCell && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[11px] border border-emerald-300 shrink-0">
                {selectionBox.cellCount} سلول ({columns[selectionBox.minCol]?.col}
                {selectionBox.minRow + 1}:{columns[selectionBox.maxCol]?.col}
                {selectionBox.maxRow + 1})
              </span>
            )}
            <div className="font-mono text-slate-400 font-bold select-none text-xs">fx</div>
            <div className="flex-1 px-3 py-1 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono text-xs truncate">
              {activeCellValue || (
                <span className="text-slate-400 font-sans italic">سلول خالی</span>
              )}
            </div>
          </div>

          {/* Sheet Actions Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Undo & Redo */}
            <div className="flex items-center rounded border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 shadow-xs">
              <button
                type="button"
                disabled={historyIndex <= 0}
                onClick={handleUndo}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="واگرد (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <button
                type="button"
                disabled={historyIndex >= history.length - 1}
                onClick={handleRedo}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="بازگشت (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Select All */}
            <button
              type="button"
              onClick={selectAll}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1 shadow-xs"
              title="انتخاب همه سلول‌ها (Ctrl+A)"
            >
              <CheckSquare className="w-3 h-3 text-indigo-600" />
              <span>انتخاب همه</span>
            </button>

            {/* Copy / Cut / Paste */}
            <div className="flex items-center rounded border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 shadow-xs">
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                title="کپی محدوده انتخاب شده (Ctrl+C)"
              >
                <Copy className="w-3.5 h-3.5 text-sky-600" />
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <button
                type="button"
                onClick={handleCut}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                title="برش محدوده (Ctrl+X)"
              >
                <Scissors className="w-3.5 h-3.5 text-amber-600" />
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <button
                type="button"
                onClick={() => void handlePaste()}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                title="جای‌گذاری از اکسل / کلیپ‌بورد (Ctrl+V)"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>

            {/* Duplicate / Fill Down (Ctrl+D) */}
            <button
              type="button"
              onClick={handleDuplicateOrFillDown}
              className="px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-medium flex items-center gap-1 shadow-xs"
              title="تکثیر سلول یا انتخاب به پایین (Ctrl+D)"
            >
              <ArrowDown className="w-3 h-3 text-emerald-600" />
              <span>تکثیر به پایین (Ctrl+D)</span>
            </button>

            {/* Clear Selection */}
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-slate-800 text-slate-600 hover:text-rose-600 transition-colors shadow-xs"
              title="پاک کردن محتوای انتخاب (Delete / Backspace)"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>

            {/* +1 Row */}
            <button
              type="button"
              onClick={() => handleAddNewRow()}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1"
            >
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>+۱ سطر</span>
            </button>

            {/* Clean empty rows */}
            <button
              type="button"
              onClick={() => {
                const filtered = getPopulatedPurchaseInvoiceLines(lines);
                onChangeLines(
                  filtered.length > 0
                    ? filtered
                    : []
                );
                onShowToast(
                  filtered.length > 0
                    ? `سطرهای اضافی خالی حذف شدند (${filtered.length} سطر فعال باقی ماند).`
                    : 'جدول خالی شد؛ سطر تازه را فقط در صورت نیاز اضافه کنید.'
                );
              }}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-600 cursor-pointer"
              title="پاکسازی سطرهای اضافی خالی"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SPREADSHEET TABLE (GOOGLE SHEETS LOOK & FEEL)
         ===================================================================== */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-xs flex flex-col min-h-[360px]">
        <div ref={tableContainerRef} className="flex-1 overflow-auto max-h-[560px] select-none">
          <table className="border-collapse text-xs text-right w-max min-w-full">
            {/* Table Header with Letters A, B, C... */}
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700 shadow-xs">
              <tr>
                {/* Sticky Row Corner */}
                <th
                  onClick={selectAll}
                  className="sticky right-0 z-30 w-12 py-1.5 px-1 border-l border-b border-slate-300 dark:border-slate-700 text-center font-mono text-slate-500 bg-slate-200 dark:bg-slate-800 font-bold text-[11px] cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors select-none"
                  title="انتخاب کل جدول (Ctrl+A)"
                >
                  #
                </th>
                {columns.map((ch, colIdx) => (
                  <th
                    key={ch.id}
                    onClick={() => selectColumn(colIdx)}
                    className={`py-1.5 px-2 border-l border-b border-slate-300 dark:border-slate-700 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/60 transition-colors select-none ${ch.width}`}
                    title={`انتخاب ستون (${ch.label})`}
                  >
                    <div className="flex items-center justify-start">
                      <span className="truncate">{ch.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="py-12 text-center text-slate-400"
                  >
                    برای شروع، «افزودن سطر جدید» را بزنید؛ سطرهای خالی در فاکتور ثبت نمی‌شوند.
                  </td>
                </tr>
              ) : lines.map((line, rowIdx) => {
                const isRowActive = activeCell.row === rowIdx;
                const isDragOver = dragHoverRow !== null && rowIdx <= dragHoverRow && rowIdx >= (dragStart?.row || 0);
                const rowHasData = getPopulatedPurchaseInvoiceLines([line]).length > 0;
                const isIncomplete =
                  rowHasData &&
                  (!line.itemName.trim() ||
                    !line.parentTag.trim() ||
                    line.qty <= 0 ||
                    line.unitCost <= 0);

                const lineSubtotal = line.qty * line.unitCost;
                const netAmount = Math.max(0, lineSubtotal - (line.discountAmount || 0));

                return (
                  <tr
                    key={line.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      isIncomplete
                        ? 'bg-rose-50/70 dark:bg-rose-950/20'
                        : isRowActive
                          ? 'bg-indigo-50/25 dark:bg-indigo-950/20'
                          : ''
                    }`}
                  >
                    {/* Row Number Header (#1, 2, 3...) Sticky on right */}
                    <td
                      onClick={() => selectRow(rowIdx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectRow(rowIdx);
                      }}
                      className="sticky right-0 z-10 w-12 py-1 px-1 border-l border-slate-300 dark:border-slate-700 text-center font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 font-bold select-none text-[11px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/60 transition-colors"
                      title={
                        isIncomplete
                          ? 'این ردیف ناقص است؛ نام، دسته‌بندی، تعداد و قیمت خرید را کامل کنید.'
                          : `انتخاب سطر #${rowIdx + 1}`
                      }
                    >
                      {isIncomplete ? '⚠' : rowIdx + 1}
                    </td>

                    {/* Columns A to I */}
                    {columns.map((colDef, colIdx) => {
                      const isCellActive = activeCell.row === rowIdx && activeCell.col === colIdx;
                      const isCellEditing = isCellActive && isEditing;
                      const isInSelection =
                        rowIdx >= selectionBox.minRow &&
                        rowIdx <= selectionBox.maxRow &&
                        colIdx >= selectionBox.minCol &&
                        colIdx <= selectionBox.maxCol;
                      const isCopied =
                        copiedRange &&
                        rowIdx >= copiedRange.minRow &&
                        rowIdx <= copiedRange.maxRow &&
                        colIdx >= copiedRange.minCol &&
                        colIdx <= copiedRange.maxCol;

                      const isCellDragTarget = isDragOver && dragStart?.col === colIdx;
                      const cellKey = `${rowIdx}_${colIdx}`;

                      // Multi-cell border edges
                      const isTopBorder =
                        isInSelection && selectionBox.isMultiCell && rowIdx === selectionBox.minRow;
                      const isBottomBorder =
                        isInSelection && selectionBox.isMultiCell && rowIdx === selectionBox.maxRow;
                      const isRightBorder =
                        isInSelection && selectionBox.isMultiCell && colIdx === selectionBox.minCol;
                      const isLeftBorder =
                        isInSelection && selectionBox.isMultiCell && colIdx === selectionBox.maxCol;

                      const isFillCorner =
                        (selectionBox.isMultiCell
                          ? rowIdx === selectionBox.maxRow && colIdx === selectionBox.maxCol
                          : isCellActive) && !isCellEditing;

                      let cellRawValue: unknown = (line as unknown as Record<string, unknown>)[colDef.id];
                      if (colDef.id === 'lineTotal') cellRawValue = lineSubtotal;
                      if (colDef.id === 'netLineAmount') cellRawValue = netAmount;

                      return (
                        <td
                          key={colDef.id}
                          ref={(el) => setCellTdRef(cellKey, el)}
                          tabIndex={isCellEditing ? -1 : 0}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            if (isCellEditing) return;
                            if (e.shiftKey) {
                              e.preventDefault();
                              expandSelection(rowIdx, colIdx);
                            } else {
                              setIsMouseSelecting(true);
                              if (colDef.type === 'select') {
                                selectCell(rowIdx, colIdx, true);
                              } else {
                                selectCell(rowIdx, colIdx, false);
                              }
                            }
                          }}
                          onMouseEnter={() => {
                            if (isMouseSelecting) {
                              expandSelection(rowIdx, colIdx);
                            }
                            if (isDraggingFill) {
                              setDragHoverRow(rowIdx);
                            }
                          }}
                          onDoubleClick={() => {
                            if (
                              colDef.type !== 'readonly_currency' &&
                              colDef.type !== 'readonly_badge'
                            ) {
                              selectCell(rowIdx, colIdx, true);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (!isCellEditing) {
                              handleCellTdKeyDown(e, rowIdx, colIdx);
                            }
                          }}
                          className={`p-0 border-l border-slate-300 dark:border-slate-700 relative text-xs outline-none select-none ${
                            colDef.width
                          } ${
                            isCellActive
                              ? 'ring-2 ring-indigo-600 ring-inset z-10 bg-white dark:bg-slate-900'
                              : isInSelection
                              ? 'bg-indigo-100/40 dark:bg-indigo-900/30'
                              : isCellDragTarget
                              ? 'bg-emerald-100/50 dark:bg-emerald-950/40'
                              : ''
                          } ${isCopied ? 'border-dashed border-2 border-amber-500' : ''} ${
                            isTopBorder ? 'border-t-2 border-t-indigo-600' : ''
                          } ${isBottomBorder ? 'border-b-2 border-b-indigo-600' : ''} ${
                            isRightBorder ? 'border-r-2 border-r-indigo-600' : ''
                          } ${isLeftBorder ? 'border-l-2 border-l-indigo-600' : ''}`}
                        >
                          {/* EDIT MODE INPUT VS READ MODE DISPLAY */}
                          {colDef.type === 'readonly_currency' ? (
                            <div className="w-full h-8 px-2 flex items-center justify-start font-mono font-bold text-indigo-700 dark:text-indigo-400">
                              <span className="tabular-nums">
                                {Number(cellRawValue) > 0 ? (
                                  `${formatCurrency(Number(cellRawValue))} ت`
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-700">۰</span>
                                )}
                              </span>
                            </div>
                          ) : colDef.type === 'currency' ? (
                            <CurrencyInput
                              ref={(el) => setInputRef(cellKey, el)}
                              value={typeof cellRawValue === 'number' && cellRawValue > 0 ? cellRawValue : ''}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!e.shiftKey) {
                                  setActiveCell({ row: rowIdx, col: colIdx });
                                  setSelectionRange({
                                    startRow: rowIdx,
                                    startCol: colIdx,
                                    endRow: rowIdx,
                                    endCol: colIdx,
                                  });
                                  setIsEditing(true);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(val) =>
                                updateRowField(
                                  rowIdx,
                                  colDef.id as keyof PurchaseInvoiceLineGridItem,
                                  val as never
                                )
                              }
                              onKeyDown={(e) => handleInputKeyDown(e, rowIdx, colIdx)}
                              onBlur={() => setIsEditing(false)}
                              placeholder="۰"
                              className="w-full h-8 px-2 font-mono font-bold text-left bg-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none tabular-nums text-xs select-text cursor-text"
                            />
                          ) : colDef.type === 'number' ? (
                            <input
                              ref={(el) => setInputRef(cellKey, el)}
                              type="text"
                              inputMode="numeric"
                              value={cellRawValue !== undefined && cellRawValue !== null && cellRawValue !== 0 ? String(cellRawValue) : ''}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!e.shiftKey) {
                                  setActiveCell({ row: rowIdx, col: colIdx });
                                  setSelectionRange({
                                    startRow: rowIdx,
                                    startCol: colIdx,
                                    endRow: rowIdx,
                                    endCol: colIdx,
                                  });
                                  setIsEditing(true);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^\d]/g, '');
                                updateRowField(
                                  rowIdx,
                                  colDef.id as keyof PurchaseInvoiceLineGridItem,
                                  (cleaned ? Math.max(0, Number(cleaned)) : 0) as never
                                );
                              }}
                              onKeyDown={(e) => handleInputKeyDown(e, rowIdx, colIdx)}
                              onBlur={() => setIsEditing(false)}
                              placeholder="۰"
                              className="w-full h-8 px-2 font-mono font-bold text-center bg-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none tabular-nums text-xs select-text cursor-text"
                            />
                          ) : colDef.type === 'text' ? (
                            <input
                              ref={(el) => setInputRef(cellKey, el)}
                              type="text"
                              value={String(cellRawValue || '')}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!e.shiftKey) {
                                  setActiveCell({ row: rowIdx, col: colIdx });
                                  setSelectionRange({
                                    startRow: rowIdx,
                                    startCol: colIdx,
                                    endRow: rowIdx,
                                    endCol: colIdx,
                                  });
                                  setIsEditing(true);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateRowField(
                                  rowIdx,
                                  colDef.id as keyof PurchaseInvoiceLineGridItem,
                                  e.target.value as never
                                )
                              }
                              onKeyDown={(e) => handleInputKeyDown(e, rowIdx, colIdx)}
                              onBlur={() => setIsEditing(false)}
                              placeholder="توضیحات / بارکد کارتن..."
                              className={`w-full h-8 px-2 bg-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-xs select-text cursor-text ${
                                colDef.align === 'left'
                                  ? 'font-mono text-left'
                                  : colDef.align === 'center'
                                  ? 'text-center'
                                  : 'text-right'
                              }`}
                            />
                          ) : isCellEditing && colDef.type === 'select' ? (
                            <GridSearchableSelect
                              value={String(cellRawValue || '')}
                              options={colDef.options || []}
                              placeholder="جستجو و انتخاب..."
                              onChange={(val) => {
                                updateRowField(
                                  rowIdx,
                                  colDef.id as keyof PurchaseInvoiceLineGridItem,
                                  val as never
                                );
                                selectCell(rowIdx, colIdx, false);
                              }}
                              onCommitAndMoveDown={() => {
                                if (rowIdx + 1 < lines.length) {
                                  selectCell(rowIdx + 1, colIdx, false);
                                } else {
                                  const nextIdx = handleAddNewRow(rowIdx);
                                  setTimeout(() => selectCell(nextIdx, colIdx, true), 40);
                                }
                              }}
                              onClose={() => setIsEditing(false)}
                            />
                          ) : (
                            // READ MODE DISPLAY FOR SELECT CELLS
                            <div
                              onClick={(e) => {
                                if (isCellActive) {
                                  e.stopPropagation();
                                  selectCell(rowIdx, colIdx, true);
                                }
                              }}
                              className={`w-full h-8 px-2 flex items-center truncate cursor-cell select-text ${
                                colDef.align === 'left'
                                  ? 'justify-start font-mono font-bold'
                                  : colDef.align === 'center'
                                  ? 'justify-center font-mono'
                                  : 'justify-start font-medium'
                              }`}
                            >
                              <span className="truncate">
                                {cellRawValue !== undefined && cellRawValue !== null && cellRawValue !== '' ? (
                                  String(cellRawValue)
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-700 text-[11px]">—</span>
                                )}
                              </span>
                            </div>
                          )}

                          {/* Excel Drag Corner Handle */}
                          {isFillCorner && (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setIsDraggingFill(true);
                                setDragStart({ row: rowIdx, col: colIdx });
                                setDragHoverRow(rowIdx);
                              }}
                              className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-indigo-600 border border-white cursor-crosshair z-20 hover:scale-125 transition-transform shadow-xs"
                              title="کشیدن برای تکثیر سلول به سطرهای پایین"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Quick Add Row / Delete Last Row Footer Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAddNewRow()}
              className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>افزودن سطر جدید (+1)</span>
            </button>
            <span className="text-[11px] text-slate-400">
              (یا در آخرین سلول کلید Enter را بزنید)
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span>
              اقلام ثبت‌شده: <strong>{summary.validCount}</strong> از <strong>{lines.length}</strong> سطر
            </span>
            <span>
              مجموع تعداد: <strong>{summary.totalQty}</strong> عدد
            </span>
            <span>
              جمع کل فاکتور: <strong className="text-indigo-600 dark:text-indigo-400">{formatCurrency(summary.grandTotal)}</strong> تومان
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
