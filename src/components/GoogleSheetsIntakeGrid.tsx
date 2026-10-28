import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  Copy,
  ArrowDown,
  ArrowUp,
  Sparkles,
  CheckCircle2,
  Layers,
  Wand2,
  ClipboardPaste,
  Scissors,
  Undo2,
  Redo2,
  Eraser,
  CheckSquare,
  Settings2,
  ClipboardCopy,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  WarehouseKey,
  WarehouseRecord,
  PurchaseInvoiceRecord,
  InvoiceLineItem,
  InventoryItemRecord,
  MasterOptionsRegistry,
} from '../data/erpSeedData';
import { formatCurrency } from '../utils/erpEngine';
import { CurrencyInput, parseCommaNumber } from './CurrencyInput';
import { GridSearchableSelect } from './GridSearchableSelect';

export interface SkuBreakdownRow {
  rowId: string;
  sku: string;
  parentTag: string;
  flavor: string;
  name: string;
  brand: string;
  model: string;
  itemType: string;
  condition: string;
  sector: 'vape' | 'pc';
  batteryCapacityMah: number;
  qty: number;
  targetWarehouse: WarehouseKey;
  expiryDate: string;
  nicotine: string;
  puffCount: string;
  color: string;
  resistanceOhm: string;
  liquidVolumeMl: string;
  podTankCapacityMl: string;
  allowDecantSale: boolean;
  unitPurchasePrice: number;
  mwaPurchasePrice?: number;
  retailPrice: number;
  festivalPrice?: number;
  resellerPrice: number;
}

export const createEmptyBreakdownRow = (
  index: number,
  defaultCost = 0,
  parentName = '',
  targetWh: WarehouseKey = 'vitrine',
  defaultRetail = 0,
  defaultReseller = 0,
  defaultBrand = '',
  defaultType = '',
  defaultModel = '',
  defaultQty = 0,
  defaultFlavor = '',
  defaultFestival = 0,
  defaultMwa = 0
): SkuBreakdownRow => {
  const cleanParent = parentName.trim();
  const isJuice =
    defaultType.includes('جویس') ||
    defaultType.includes('سالت') ||
    cleanParent.includes('جویس') ||
    cleanParent.includes('سالت');
  const isPc =
    defaultType.includes('کامپیوتر') ||
    defaultType.includes('سخت‌افزار') ||
    cleanParent.includes('کامپیوتر');

  const initialName = cleanParent
    ? defaultFlavor
      ? `${cleanParent} — ${defaultFlavor}`
      : cleanParent
    : defaultFlavor;

  return {
    rowId: `sku-row-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    sku: '',
    parentTag: cleanParent,
    flavor: defaultFlavor,
    name: initialName,
    brand: defaultBrand || (cleanParent.split(' ')[0] || ''),
    model: defaultModel || '',
    itemType: defaultType || (isJuice ? 'جویس و سالت' : isPc ? 'قطعات کامپیوتر و سخت‌افزار' : ''),
    condition: 'آکبند',
    sector: isPc ? 'pc' : 'vape',
    batteryCapacityMah: 0,
    qty: defaultQty,
    targetWarehouse: targetWh,
    expiryDate: '',
    nicotine: '',
    puffCount: '',
    color: '',
    resistanceOhm: '',
    liquidVolumeMl: '',
    podTankCapacityMl: '',
    allowDecantSale: isJuice,
    unitPurchasePrice: defaultCost,
    mwaPurchasePrice: defaultMwa || defaultCost,
    retailPrice: defaultRetail,
    resellerPrice: defaultReseller,
    festivalPrice: defaultFestival,
  };
};

// Comprehensive Columns with strict pre-defined specs and separated pricing columns
export interface GridColumnDef {
  col: string; // A, B, C...
  id: keyof SkuBreakdownRow;
  label: string;
  width: string;
  align: 'right' | 'center' | 'left';
  type: 'text' | 'number' | 'currency' | 'readonly_currency' | 'select' | 'checkbox';
  options?: string[];
  optionColors?: Record<string, string>;
}

interface IntakeGridConfig {
  columnOrder?: string[];
  validationOptions?: Record<string, string[]>;
  optionColors?: Record<string, Record<string, string>>;
}

const INTAKE_GRID_CONFIG_KEY = 'emkan.intake-grid-config.v2';

// Preset Google Sheets Data Validation Chip Colors (for data values, NOT cell backgrounds)
const DATA_CHIP_COLOR_PALETTE = [
  { label: 'پیش‌فرض', value: '' },
  { label: 'نیلی', value: '#4f46e5' },
  { label: 'زمردی', value: '#059669' },
  { label: 'کهربایی', value: '#d97706' },
  { label: 'سرخ', value: '#e11d48' },
  { label: 'آسمانی', value: '#0284c7' },
  { label: 'بنفش', value: '#7c3aed' },
  { label: 'فیروزه‌ای', value: '#0d9488' },
  { label: 'خاکستری', value: '#475569' },
];

function loadIntakeGridConfig(): IntakeGridConfig {
  if (typeof window === 'undefined') return {};
  try {
    const saved = window.localStorage.getItem(INTAKE_GRID_CONFIG_KEY);
    if (!saved) return {};
    const parsed: unknown = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? (parsed as IntakeGridConfig) : {};
  } catch (error) {
    console.error('Could not load intake grid configuration.', error);
    return {};
  }
}

export const GRID_COLUMNS: GridColumnDef[] = [
  { col: 'A', id: 'parentTag', label: 'تگ کالا', width: 'min-w-[190px]', align: 'right', type: 'select' },
  { col: 'B', id: 'sku', label: 'SKU', width: 'min-w-[160px]', align: 'left', type: 'text' },
  { col: 'C', id: 'name', label: 'نام کامل', width: 'min-w-[220px]', align: 'right', type: 'select' },
  { col: 'D', id: 'brand', label: 'برند', width: 'min-w-[130px]', align: 'right', type: 'select' },
  { col: 'E', id: 'model', label: 'مدل', width: 'min-w-[130px]', align: 'right', type: 'select' },
  {
    col: 'F',
    id: 'itemType',
    label: 'دسته‌بندی',
    width: 'min-w-[175px]',
    align: 'right',
    type: 'select',
    options: [
      'جویس و سالت',
      'دستگاه پاد و ماد',
      'کویل و کارتریج',
      'پاد یکبارمصرف',
      'لوازم جانبی ویپ',
      'قطعات کامپیوتر و سخت‌افزار',
      'لوازم جانبی کامپیوتر',
      'سایر کالاها',
    ],
  },
  {
    col: 'G',
    id: 'nicotine',
    label: 'نیکوتین',
    width: 'min-w-[130px]',
    align: 'center',
    type: 'select',
    options: ['0mg', '3mg', '6mg', '20mg', '25mg', '30mg', '35mg', '50mg'],
  },
  {
    col: 'H',
    id: 'liquidVolumeMl',
    label: 'حجم مایع',
    width: 'min-w-[145px]',
    align: 'center',
    type: 'select',
    options: ['2 ml', '3 ml', '4.5 ml', '5 ml', '10 ml', '15 ml', '30 ml', '60 ml', '100 ml', '120 ml'],
  },
  { col: 'I', id: 'batteryCapacityMah', label: 'حجم باتری', width: 'min-w-[130px]', align: 'center', type: 'number' },
  {
    col: 'J',
    id: 'resistanceOhm',
    label: 'مقاومت (Ω)',
    width: 'min-w-[125px]',
    align: 'center',
    type: 'select',
    options: ['0.15 Ω', '0.2 Ω', '0.4 Ω', '0.6 Ω', '0.8 Ω', '1.0 Ω', '1.2 Ω'],
  },
  {
    col: 'K',
    id: 'puffCount',
    label: 'تعداد پاف',
    width: 'min-w-[125px]',
    align: 'center',
    type: 'select',
    options: ['۵۰۰۰ پاف', '۱۰۰۰۰ پاف', '۱۵۰۰۰ پاف', '۲۵۰۰۰ پاف', '۴۰۰۰۰ پاف', '۶۰۰۰۰ پاف'],
  },
  { col: 'L', id: 'color', label: 'رنگ', width: 'min-w-[120px]', align: 'right', type: 'select' },
  { col: 'M', id: 'expiryDate', label: 'تاریخ BB', width: 'min-w-[130px]', align: 'center', type: 'text' },
  {
    col: 'N',
    id: 'condition',
    label: 'وضعیت',
    width: 'min-w-[120px]',
    align: 'center',
    type: 'select',
    options: ['آکبند', 'استوک', 'کارکرده / تستر'],
  },
  { col: 'O', id: 'targetWarehouse', label: 'انبار', width: 'min-w-[140px]', align: 'right', type: 'select' },
  { col: 'P', id: 'qty', label: 'تعداد', width: 'min-w-[90px]', align: 'center', type: 'number' },
  { col: 'Q', id: 'unitPurchasePrice', label: 'قیمت خرید', width: 'min-w-[135px]', align: 'left', type: 'readonly_currency' },
  { col: 'R', id: 'mwaPurchasePrice', label: 'میانگین موزون', width: 'min-w-[150px]', align: 'left', type: 'readonly_currency' },
  { col: 'S', id: 'retailPrice', label: 'قیمت فروش عادی', width: 'min-w-[130px]', align: 'left', type: 'currency' },
  { col: 'T', id: 'festivalPrice', label: 'قیمت جشنواره', width: 'min-w-[135px]', align: 'left', type: 'currency' },
  { col: 'U', id: 'resellerPrice', label: 'قیمت فروش ری سلر', width: 'min-w-[145px]', align: 'left', type: 'currency' },
];

interface GoogleSheetsIntakeGridProps {
  rows: SkuBreakdownRow[];
  onChangeRows: (newRows: SkuBreakdownRow[]) => void;
  activePurchaseInvoice: PurchaseInvoiceRecord | null;
  activePurchaseLine: InvoiceLineItem | null;
  parentItemName: string;
  targetCost: number;
  targetQty: number;
  currentAllocatedQty: number;
  knownVariants: InventoryItemRecord[];
  warehouses: WarehouseRecord[];
  masterOptions: MasterOptionsRegistry;
  onLoadKnownVariants: () => void;
  onCommit: () => void;
  isSubmitting: boolean;
  onShowToast: (msg: string) => void;
  catalogItems?: InventoryItemRecord[];
}

export const GoogleSheetsIntakeGrid: React.FC<GoogleSheetsIntakeGridProps> = ({
  rows,
  onChangeRows,
  activePurchaseInvoice,
  activePurchaseLine,
  parentItemName,
  targetCost,
  targetQty,
  currentAllocatedQty,
  knownVariants,
  warehouses,
  masterOptions,
  onLoadKnownVariants,
  onCommit,
  isSubmitting,
  onShowToast,
  catalogItems = [],
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const activeCellRef = useRef<{ row: number; col: number }>({ row: 0, col: 0 });
  const rowsRef = useRef<SkuBreakdownRow[]>(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const [gridConfig, setGridConfig] = useState<IntakeGridConfig>(loadIntakeGridConfig);
  const [editingColumnId, setEditingColumnId] = useState<keyof SkuBreakdownRow | null>(null);
  const [isColumnEditorOpen, setIsColumnEditorOpen] = useState(false);
  const [newOptionInput, setNewOptionInput] = useState('');
  const [newOptionColor, setNewOptionColor] = useState('#4f46e5');
  const [draggedColumnId, setDraggedColumnId] = useState<keyof SkuBreakdownRow | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(INTAKE_GRID_CONFIG_KEY, JSON.stringify(gridConfig));
    } catch (error) {
      console.error('Could not save intake grid configuration.', error);
      onShowToast('ذخیره تنظیمات شیت ناموفق بود.');
    }
  }, [gridConfig, onShowToast]);

  // Match a row against activePurchaseInvoice.lines by product name (itemName) or parentTag
  const findMatchingInvoiceLine = useCallback(
    (tagOrName: string, fallbackName = ''): InvoiceLineItem | null => {
      if (activePurchaseLine) return activePurchaseLine;
      const lines = activePurchaseInvoice?.lines || [];
      if (lines.length === 0) return null;
      const q1 = tagOrName.trim().toLocaleLowerCase();
      const q2 = fallbackName.trim().toLocaleLowerCase();
      if (!q1 && !q2) {
        return lines.length === 1 ? lines[0] : null;
      }
      // Exact match on itemName first
      const exact = lines.find((l) => {
        const lName = (l.itemName || '').trim().toLocaleLowerCase();
        return (q1 && lName === q1) || (q2 && lName === q2);
      });
      if (exact) return exact;
      // Partial / substring match on itemName
      const partial = lines.find((l) => {
        const lName = (l.itemName || '').trim().toLocaleLowerCase();
        if (!lName) return false;
        return (
          (q1 && (lName.includes(q1) || q1.includes(lName))) ||
          (q2 && (lName.includes(q2) || q2.includes(lName)))
        );
      });
      if (partial) return partial;
      return lines.length === 1 ? lines[0] : null;
    },
    [activePurchaseInvoice, activePurchaseLine]
  );

  // Derive unit purchase cost (قیمت خرید ثبت شده در فاکتور) for a row
  const getRowPurchaseCost = useCallback(
    (row: SkuBreakdownRow): number => {
      if (row.unitPurchasePrice && row.unitPurchasePrice > 0) {
        return row.unitPurchasePrice;
      }
      const matchedLine = findMatchingInvoiceLine(row.parentTag, row.name);
      if (matchedLine) {
        const lineCost = matchedLine.valuationRate || matchedLine.unitPrice || 0;
        if (lineCost > 0) return lineCost;
      }
      if (targetCost > 0 && (row.parentTag.trim() || row.name.trim() || row.sku.trim())) {
        return targetCost;
      }
      const catalogMatch =
        (catalogItems || []).find(
          (it) =>
            (row.sku && it.sku.toLowerCase() === row.sku.toLowerCase()) ||
            (row.name && it.name.trim().toLowerCase() === row.name.trim().toLowerCase()) ||
            (row.parentTag && it.name.trim().toLowerCase() === row.parentTag.trim().toLowerCase())
        ) ||
        (knownVariants || []).find(
          (it) =>
            (row.sku && it.sku.toLowerCase() === row.sku.toLowerCase()) ||
            (row.name && it.name.trim().toLowerCase() === row.name.trim().toLowerCase())
        );
      if (catalogMatch && catalogMatch.valuationRate > 0) {
        return catalogMatch.valuationRate;
      }
      return 0;
    },
    [findMatchingInvoiceLine, targetCost, catalogItems, knownVariants]
  );

  // Moving Weighted Average (MWA - میانگین موزون) derivation
  const getRowMwaCost = useCallback(
    (row: SkuBreakdownRow): number => {
      const currentCost = getRowPurchaseCost(row);
      const match =
        (catalogItems || []).find(
          (it) =>
            (row.sku && it.sku.toLowerCase() === row.sku.toLowerCase()) ||
            (row.name && it.name.trim().toLowerCase() === row.name.trim().toLowerCase()) ||
            (row.parentTag && it.name.trim().toLowerCase() === row.parentTag.trim().toLowerCase())
        ) ||
        (knownVariants || []).find(
          (it) =>
            (row.sku && it.sku.toLowerCase() === row.sku.toLowerCase()) ||
            (row.name && it.name.trim().toLowerCase() === row.name.trim().toLowerCase())
        );

      if (match) {
        const existingValuation =
          match.valuationRate ||
          (match as unknown as { purchasePrice?: number }).purchasePrice ||
          0;
        const existingStock = match.stockQty || 0;
        const currentQty = row.qty > 0 ? row.qty : 1;

        if (existingValuation > 0) {
          if (existingStock > 0 && currentCost > 0) {
            const totalCost = existingStock * existingValuation + currentQty * currentCost;
            const totalQty = existingStock + currentQty;
            return Math.round(totalCost / totalQty);
          }
          return currentCost > 0 ? currentCost : existingValuation;
        }
      }

      if (currentCost > 0) return currentCost;
      if (row.mwaPurchasePrice && row.mwaPurchasePrice > 0) return row.mwaPurchasePrice;
      return 0;
    },
    [catalogItems, knownVariants, getRowPurchaseCost]
  );

  // Dynamic columns with Google Sheets Data Validation for all non-price fields that have historical/registered data
  const columns = useMemo<GridColumnDef[]>(() => {
    const invoiceProductNames = (activePurchaseInvoice?.lines || [])
      .map((l) => l.itemName?.trim())
      .filter(Boolean) as string[];
    const catalogParentTags = (catalogItems || [])
      .map((it) => it.parentTag?.trim() || it.name?.trim())
      .filter(Boolean) as string[];
    const catalogNames = (catalogItems || [])
      .map((it) => it.name?.trim())
      .filter(Boolean) as string[];
    const catalogBrands = (catalogItems || [])
      .map((it) => it.brand?.trim())
      .filter(Boolean) as string[];
    const catalogModels = (catalogItems || [])
      .map((it) => it.model?.trim())
      .filter(Boolean) as string[];
    const catalogCategories = (catalogItems || [])
      .map((it) => it.category?.trim())
      .filter(Boolean) as string[];
    const catalogNicotines = (catalogItems || [])
      .map((it) => it.nicotine?.trim())
      .filter(Boolean) as string[];
    const catalogVolumes = (catalogItems || [])
      .map((it) => (it.liquidVolumeMl ? `${it.liquidVolumeMl} ml` : ''))
      .filter(Boolean);
    const catalogResistances = (catalogItems || [])
      .map((it) => it.resistanceOhm?.trim())
      .filter(Boolean) as string[];
    const catalogPuffs = (catalogItems || [])
      .map((it) => it.puffCount?.trim())
      .filter(Boolean) as string[];
    const catalogColors = (catalogItems || [])
      .map((it) => it.color?.trim())
      .filter(Boolean) as string[];

    const baseColumns: GridColumnDef[] = [
      {
        col: 'A',
        id: 'parentTag',
        label: 'تگ کالا (نام در فاکتور)',
        width: 'min-w-[205px]',
        align: 'right',
        type: 'select',
        options: Array.from(
          new Set([
            ...invoiceProductNames,
            ...catalogParentTags,
            ...(masterOptions.tags || []),
          ])
        ),
      },
      { col: 'B', id: 'sku', label: 'SKU', width: 'min-w-[160px]', align: 'left', type: 'text' },
      {
        col: 'C',
        id: 'name',
        label: 'نام کامل',
        width: 'min-w-[220px]',
        align: 'right',
        type: 'select',
        options: Array.from(new Set([...invoiceProductNames, ...catalogNames])),
      },
      {
        col: 'D',
        id: 'brand',
        label: 'برند',
        width: 'min-w-[130px]',
        align: 'right',
        type: 'select',
        options: Array.from(
          new Set([
            ...catalogBrands,
            'Voopoo',
            'Vaporesso',
            'GeekVape',
            'Uwell',
            'Lost Vape',
            'Nasty',
            'VGOD',
            'Ripe Vapes',
            'Tokyo',
            'BLVK',
          ])
        ),
      },
      {
        col: 'E',
        id: 'model',
        label: 'مدل',
        width: 'min-w-[130px]',
        align: 'right',
        type: 'select',
        options: Array.from(new Set([...catalogModels])),
      },
      {
        col: 'F',
        id: 'itemType',
        label: 'دسته‌بندی',
        width: 'min-w-[175px]',
        align: 'right',
        type: 'select',
        options: Array.from(
          new Set([
            ...(masterOptions.tags || []),
            ...(masterOptions.itemTypes || []),
            ...catalogCategories,
            'جویس و سالت',
            'دستگاه پاد و ماد',
            'کویل و کارتریج',
            'پاد یکبارمصرف',
            'لوازم جانبی ویپ',
            'قطعات کامپیوتر و سخت‌افزار',
            'لوازم جانبی کامپیوتر',
          ])
        ),
      },
      {
        col: 'G',
        id: 'nicotine',
        label: 'نیکوتین',
        width: 'min-w-[130px]',
        align: 'center',
        type: 'select',
        options: Array.from(
          new Set([
            ...(masterOptions.nicotines || []),
            ...catalogNicotines,
            '0mg',
            '3mg',
            '6mg',
            '20mg',
            '25mg',
            '30mg',
            '35mg',
            '50mg',
          ])
        ),
      },
      {
        col: 'H',
        id: 'liquidVolumeMl',
        label: 'حجم مایع',
        width: 'min-w-[145px]',
        align: 'center',
        type: 'select',
        options: Array.from(
          new Set([
            ...(masterOptions.liquidVolumes || []),
            ...catalogVolumes,
            '2 ml',
            '3 ml',
            '4.5 ml',
            '5 ml',
            '10 ml',
            '15 ml',
            '30 ml',
            '60 ml',
            '100 ml',
            '120 ml',
          ])
        ),
      },
      { col: 'I', id: 'batteryCapacityMah', label: 'حجم باتری (mAh)', width: 'min-w-[130px]', align: 'center', type: 'number' },
      {
        col: 'J',
        id: 'resistanceOhm',
        label: 'مقاومت (Ω)',
        width: 'min-w-[125px]',
        align: 'center',
        type: 'select',
        options: Array.from(
          new Set([
            ...(masterOptions.resistances || []),
            ...catalogResistances,
            '0.15 Ω',
            '0.2 Ω',
            '0.4 Ω',
            '0.6 Ω',
            '0.8 Ω',
            '1.0 Ω',
            '1.2 Ω',
          ])
        ),
      },
      {
        col: 'K',
        id: 'puffCount',
        label: 'تعداد پاف',
        width: 'min-w-[125px]',
        align: 'center',
        type: 'select',
        options: Array.from(
          new Set([
            ...(masterOptions.puffs || []),
            ...catalogPuffs,
            '۵۰۰۰ پاف',
            '۱۰۰۰۰ پاف',
            '۱۵۰۰۰ پاف',
            '۲۵۰۰۰ پاف',
            '۴۰۰۰۰ پاف',
            '۶۰۰۰۰ پاف',
          ])
        ),
      },
      {
        col: 'L',
        id: 'color',
        label: 'رنگ',
        width: 'min-w-[120px]',
        align: 'right',
        type: 'select',
        options: Array.from(new Set([...(masterOptions.colors || []), ...catalogColors])),
      },
      { col: 'M', id: 'expiryDate', label: 'تاریخ BB', width: 'min-w-[130px]', align: 'center', type: 'text' },
      {
        col: 'N',
        id: 'condition',
        label: 'وضعیت',
        width: 'min-w-[120px]',
        align: 'center',
        type: 'select',
        options: masterOptions.conditions?.length
          ? masterOptions.conditions
          : ['آکبند', 'استوک', 'کارکرده / تستر'],
      },
      {
        col: 'O',
        id: 'targetWarehouse',
        label: 'انبار',
        width: 'min-w-[140px]',
        align: 'right',
        type: 'select',
        options: warehouses.map((w) => w.name),
      },
      { col: 'P', id: 'qty', label: 'تعداد', width: 'min-w-[90px]', align: 'center', type: 'number' },
      { col: 'Q', id: 'unitPurchasePrice', label: 'قیمت خرید', width: 'min-w-[135px]', align: 'left', type: 'readonly_currency' },
      { col: 'R', id: 'mwaPurchasePrice', label: 'میانگین موزون', width: 'min-w-[150px]', align: 'left', type: 'readonly_currency' },
      { col: 'S', id: 'retailPrice', label: 'قیمت فروش عادی', width: 'min-w-[130px]', align: 'left', type: 'currency' },
      { col: 'T', id: 'festivalPrice', label: 'قیمت جشنواره', width: 'min-w-[135px]', align: 'left', type: 'currency' },
      { col: 'U', id: 'resellerPrice', label: 'قیمت فروش ری سلر', width: 'min-w-[145px]', align: 'left', type: 'currency' },
    ];

    const columnOrder = gridConfig.columnOrder || [];
    return baseColumns
      .map((column, baseIndex) => {
        const customOrderedOpts = gridConfig.validationOptions?.[column.id];
        const mergedOptions =
          customOrderedOpts && customOrderedOpts.length > 0
            ? Array.from(new Set([...customOrderedOpts, ...(column.options || [])]))
            : column.options;
        return {
          ...column,
          baseIndex,
          type: customOrderedOpts?.length ? 'select' : column.type,
          options: mergedOptions,
          optionColors: gridConfig.optionColors?.[column.id] || {},
        };
      })
      .sort((left, right) => {
        const leftIndex = columnOrder.indexOf(left.id);
        const rightIndex = columnOrder.indexOf(right.id);
        if (leftIndex === -1 && rightIndex === -1) return left.baseIndex - right.baseIndex;
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      })
      .map(({ baseIndex: _baseIndex, ...column }, index) => ({
        ...column,
        col: String.fromCharCode(65 + index),
      }));
  }, [
    gridConfig.columnOrder,
    gridConfig.validationOptions,
    gridConfig.optionColors,
    masterOptions,
    catalogItems,
    activePurchaseInvoice,
    warehouses,
  ]);

  const activeEditorColumn = columns.find((column) => column.id === editingColumnId) || null;

  const activeEditorOptions = useMemo(() => {
    if (!activeEditorColumn) return [];
    const customList = gridConfig.validationOptions?.[activeEditorColumn.id];
    if (customList && customList.length > 0) {
      return customList;
    }
    return (activeEditorColumn.options || []).filter(Boolean);
  }, [activeEditorColumn, gridConfig.validationOptions]);

  const openColumnEditor = (columnId: keyof SkuBreakdownRow) => {
    setEditingColumnId(columnId);
    setNewOptionInput('');
    setIsColumnEditorOpen(true);
    setContextMenu(null);
  };

  const handleMoveValidationOption = (optIndex: number, direction: 'up' | 'down') => {
    if (!activeEditorColumn) return;
    const list = [...activeEditorOptions];
    const targetIndex = direction === 'up' ? optIndex - 1 : optIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const [moved] = list.splice(optIndex, 1);
    list.splice(targetIndex, 0, moved);
    setGridConfig((current) => ({
      ...current,
      validationOptions: {
        ...current.validationOptions,
        [activeEditorColumn.id]: list,
      },
    }));
  };

  const handleSetOptionColor = (optValue: string, colorHex: string) => {
    if (!activeEditorColumn) return;
    setGridConfig((current) => {
      const colMap = { ...(current.optionColors?.[activeEditorColumn.id] || {}) };
      if (!colorHex) {
        delete colMap[optValue];
      } else {
        colMap[optValue] = colorHex;
      }
      return {
        ...current,
        optionColors: {
          ...current.optionColors,
          [activeEditorColumn.id]: colMap,
        },
      };
    });
  };

  const handleAddValidationOption = () => {
    if (!activeEditorColumn) return;
    const trimmed = newOptionInput.trim();
    if (!trimmed) return;
    const nextList = Array.from(new Set([trimmed, ...activeEditorOptions]));
    setGridConfig((current) => {
      const colMap = { ...(current.optionColors?.[activeEditorColumn.id] || {}) };
      if (newOptionColor) {
        colMap[trimmed] = newOptionColor;
      }
      return {
        ...current,
        validationOptions: {
          ...current.validationOptions,
          [activeEditorColumn.id]: nextList,
        },
        optionColors: {
          ...current.optionColors,
          [activeEditorColumn.id]: colMap,
        },
      };
    });
    setNewOptionInput('');
    onShowToast(`گزینه «${trimmed}» به اعتبارسنجی داده ستون اضافه شد.`);
  };

  const handleDeleteValidationOption = (optValue: string) => {
    if (!activeEditorColumn) return;
    const nextList = activeEditorOptions.filter((item) => item !== optValue);
    setGridConfig((current) => {
      const colMap = { ...(current.optionColors?.[activeEditorColumn.id] || {}) };
      delete colMap[optValue];
      return {
        ...current,
        validationOptions: {
          ...current.validationOptions,
          [activeEditorColumn.id]: nextList,
        },
        optionColors: {
          ...current.optionColors,
          [activeEditorColumn.id]: colMap,
        },
      };
    });
  };

  const handleResetColumnValidation = () => {
    if (!activeEditorColumn) return;
    setGridConfig((current) => {
      const nextValidation = { ...(current.validationOptions || {}) };
      const nextColors = { ...(current.optionColors || {}) };
      delete nextValidation[activeEditorColumn.id];
      delete nextColors[activeEditorColumn.id];
      return {
        ...current,
        validationOptions: nextValidation,
        optionColors: nextColors,
      };
    });
    onShowToast('ترتیب و رنگ گزینه‌های این ستون به حالت پیش‌فرض بازنشانی شد.');
  };

  const moveColumn = (sourceId: keyof SkuBreakdownRow, targetId: keyof SkuBreakdownRow) => {
    if (sourceId === targetId) return;
    const order = columns.map((column) => column.id);
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    order.splice(sourceIndex, 1);
    order.splice(targetIndex, 0, sourceId);
    setGridConfig((current) => ({ ...current, columnOrder: order }));
  };

  const copyAuditValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onShowToast(`«${value}» کپی شد.`);
    } catch {
      onShowToast('کپی در کلیپ‌بورد در دسترس نیست.');
    }
  };

  // =========================================================================
  // GOOGLE SHEETS CORE SELECTION, CLIPBOARD & HISTORY ENGINE
  // =========================================================================
  const [selectionRange, setSelectionRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }>({
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 0,
  });
  const [isMouseSelecting, setIsMouseSelecting] = useState(false);

  // Copied Range (Marching Ants / Clipboard TSV)
  const [copiedRange, setCopiedRange] = useState<{
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
    data: string[][];
    isCut?: boolean;
  } | null>(null);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    rowIdx: number;
    colIdx: number;
  } | null>(null);

  // Undo / Redo History Stack
  const [historyStack, setHistoryStack] = useState<SkuBreakdownRow[][]>(() => [rows]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistoryState = useCallback(
    (newRows: SkuBreakdownRow[]) => {
      setHistoryStack((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        const next = [...trimmed, newRows];
        return next.length > 35 ? next.slice(next.length - 35) : next;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 34));
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const prevRows = historyStack[targetIdx];
      if (prevRows) {
        setHistoryIndex(targetIdx);
        onChangeRows(prevRows);
        onShowToast('واگرد (Undo) با موفقیت انجام شد.');
      }
    }
  }, [historyIndex, historyStack, onChangeRows, onShowToast]);

  const handleRedo = useCallback(() => {
    if (historyIndex < historyStack.length - 1) {
      const targetIdx = historyIndex + 1;
      const nextRows = historyStack[targetIdx];
      if (nextRows) {
        setHistoryIndex(targetIdx);
        onChangeRows(nextRows);
        onShowToast('ازنو (Redo) با موفقیت انجام شد.');
      }
    }
  }, [historyIndex, historyStack, onChangeRows, onShowToast]);

  // Normalized Selection Bounding Box
  const selectionBox = useMemo(() => {
    const minRow = Math.max(0, Math.min(selectionRange.startRow, selectionRange.endRow));
    const maxRow = Math.min(rows.length - 1, Math.max(selectionRange.startRow, selectionRange.endRow));
    const minCol = Math.max(0, Math.min(selectionRange.startCol, selectionRange.endCol));
    const maxCol = Math.min(columns.length - 1, Math.max(selectionRange.startCol, selectionRange.endCol));
    const isMultiCell = minRow !== maxRow || minCol !== maxCol;
    const rowCount = maxRow - minRow + 1;
    const colCount = maxCol - minCol + 1;
    const cellCount = rowCount * colCount;
    return { minRow, maxRow, minCol, maxCol, isMultiCell, rowCount, colCount, cellCount };
  }, [selectionRange, rows.length, columns.length]);

  // Mouse Drag-to-Fill (Google Sheets Fill Handle)
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragHoverRow, setDragHoverRow] = useState<number | null>(null);

  // References
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const cellTdRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const inputRefs = useRef<Map<string, HTMLElement>>(new Map());

  const setCellTdRef = useCallback((key: string, el: HTMLTableCellElement | null) => {
    if (el) cellTdRefs.current.set(key, el);
    else cellTdRefs.current.delete(key);
  }, []);

  const setInputRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) inputRefs.current.set(key, el);
    else inputRefs.current.delete(key);
  }, []);

  // Ensure active cell is scrolled into view both horizontally and vertically
  const scrollActiveCellIntoView = useCallback((rowIdx: number, colIdx: number) => {
    const key = `${rowIdx}_${colIdx}`;
    const td = cellTdRefs.current.get(key);
    if (td) {
      td.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }
  }, []);

  // Set cell selection
  const selectCell = useCallback(
    (rowIdx: number, colIdx: number, startEditing = false, totalRowsOverride?: number) => {
      const rowCount = totalRowsOverride ?? rowsRef.current.length;
      const validR = Math.max(0, Math.min(Math.max(0, rowCount - 1), rowIdx));
      const validC = Math.max(0, Math.min(columns.length - 1, colIdx));
      activeCellRef.current = { row: validR, col: validC };
      setActiveCell({ row: validR, col: validC });
      setSelectionRange({
        startRow: validR,
        startCol: validC,
        endRow: validR,
        endCol: validC,
      });
      setIsEditing(startEditing);
      scrollActiveCellIntoView(validR, validC);

      const key = `${validR}_${validC}`;
      if (startEditing) {
        window.setTimeout(() => {
          const inp = inputRefs.current.get(key);
          if (inp && document.activeElement !== inp) {
            inp.focus({ preventScroll: true });
          }
        }, 0);
      } else {
        window.setTimeout(() => {
          const td = cellTdRefs.current.get(key);
          if (td && document.activeElement !== td) {
            td.focus({ preventScroll: true });
          }
        }, 10);
      }
    },
    [columns.length, scrollActiveCellIntoView]
  );

  // Expand / shrink current selection range
  const expandSelection = useCallback(
    (targetRow: number, targetCol: number) => {
      const validR = Math.max(0, Math.min(rows.length - 1, targetRow));
      const validC = Math.max(0, Math.min(columns.length - 1, targetCol));
      setSelectionRange((prev) => ({
        ...prev,
        endRow: validR,
        endCol: validC,
      }));
      scrollActiveCellIntoView(validR, validC);
    },
    [rows.length, columns.length, scrollActiveCellIntoView]
  );

  // Select entire row
  const selectRow = useCallback(
    (rowIdx: number) => {
      const validR = Math.max(0, Math.min(rows.length - 1, rowIdx));
      setActiveCell({ row: validR, col: 0 });
      setSelectionRange({
        startRow: validR,
        startCol: 0,
        endRow: validR,
        endCol: columns.length - 1,
      });
      setIsEditing(false);
      scrollActiveCellIntoView(validR, 0);
    },
    [rows.length, columns.length, scrollActiveCellIntoView]
  );

  // Select entire column
  const selectColumn = useCallback(
    (colIdx: number) => {
      const validC = Math.max(0, Math.min(columns.length - 1, colIdx));
      setActiveCell({ row: 0, col: validC });
      setSelectionRange({
        startRow: 0,
        startCol: validC,
        endRow: rows.length - 1,
        endCol: validC,
      });
      setIsEditing(false);
      scrollActiveCellIntoView(0, validC);
    },
    [rows.length, columns.length, scrollActiveCellIntoView]
  );

  // Select all cells in grid (Ctrl+A)
  const selectAll = useCallback(() => {
    setActiveCell({ row: 0, col: 0 });
    setSelectionRange({
      startRow: 0,
      startCol: 0,
      endRow: rows.length - 1,
      endCol: columns.length - 1,
    });
    setIsEditing(false);
    onShowToast(`تمامی سلول‌های جدول انتخاب شدند (${rows.length * columns.length} سلول).`);
  }, [rows.length, columns.length, onShowToast]);

  // Helper to parse and apply arbitrary string value to a row field
  const applyParsedValueToRow = useCallback(
    (row: SkuBreakdownRow, colDef: GridColumnDef, rawVal: string): SkuBreakdownRow => {
      const next = { ...row };
      const field = colDef.id;
      const cleanStr = rawVal.trim();

      if (colDef.type === 'currency' || colDef.type === 'number') {
        const num = parseCommaNumber(cleanStr) || 0;
        (next as Record<string, unknown>)[field] = num;
      } else if (colDef.type === 'checkbox') {
        (next as Record<string, unknown>)[field] =
          cleanStr === 'true' || cleanStr === '1' || cleanStr === 'بلی' || cleanStr === 'بله';
      } else {
        (next as Record<string, unknown>)[field] = cleanStr;
      }

      // Auto assemble name when pasting parentTag or flavor
      if (field === 'parentTag' || field === 'flavor') {
        const pTag = String(field === 'parentTag' ? cleanStr : next.parentTag || parentItemName || '').trim();
        const flv = String(field === 'flavor' ? cleanStr : next.flavor || '').trim();
        if (pTag && flv) {
          next.name = `${pTag} — ${flv}`;
        } else if (pTag) {
          next.name = pTag;
        } else if (flv) {
          next.name = flv;
        }
      }

      if (field === 'parentTag' || field === 'name') {
        // 1. Match against active purchase invoice line first so purchase price & category populate!
        const matchedInvLine = findMatchingInvoiceLine(
          field === 'parentTag' ? cleanStr : next.parentTag,
          field === 'name' ? cleanStr : next.name
        );
        if (matchedInvLine) {
          const invCost = matchedInvLine.valuationRate || matchedInvLine.unitPrice || 0;
          if (invCost > 0) {
            next.unitPurchasePrice = invCost;
          }
          if (matchedInvLine.itemType && !next.itemType) {
            next.itemType = matchedInvLine.itemType;
          }
          if (matchedInvLine.itemCondition) {
            next.condition = matchedInvLine.itemCondition;
          }
        }

        // 2. Match against existing catalog items for specs and MWA calculation
        const query = cleanStr.toLocaleLowerCase();
        const match = (catalogItems || []).find(
          (item) =>
            item.parentTag?.trim().toLocaleLowerCase() === query ||
            item.name.trim().toLocaleLowerCase() === query
        );
        if (match) {
          next.sku = match.sku || next.sku;
          next.name = match.name || next.name;
          next.parentTag = match.parentTag || next.parentTag || cleanStr;
          next.brand = match.brand || next.brand;
          next.model = match.model || next.model;
          next.itemType = match.category || next.itemType;
          next.nicotine = match.nicotine || next.nicotine;
          next.liquidVolumeMl = match.liquidVolumeMl ? String(match.liquidVolumeMl) : next.liquidVolumeMl;
          next.resistanceOhm = match.resistanceOhm || next.resistanceOhm;
          next.puffCount = match.puffCount || next.puffCount;
          next.color = match.color || next.color;
          if (!next.unitPurchasePrice) {
            next.unitPurchasePrice = match.valuationRate || 0;
          }
          const existingStock = match.stockQty || 0;
          const existingVal = match.valuationRate || 0;
          const curCost = next.unitPurchasePrice || existingVal;
          const curQty = next.qty > 0 ? next.qty : 1;
          next.mwaPurchasePrice =
            existingStock > 0 && existingVal > 0 && curCost > 0
              ? Math.round((existingStock * existingVal + curQty * curCost) / (existingStock + curQty))
              : curCost;
          next.retailPrice = match.retailPrice || next.retailPrice;
          next.resellerPrice = match.resellerPrice || next.resellerPrice;
        } else if (next.unitPurchasePrice > 0) {
          next.mwaPurchasePrice = next.unitPurchasePrice;
        }
      }

      // Auto detect juice/salt and sector
      if (field === 'itemType' || field === 'name' || field === 'parentTag') {
        const typeStr = String(field === 'itemType' ? cleanStr : next.itemType || '');
        const nameStr = String(field === 'name' ? cleanStr : next.name || '');
        const tagStr = String(field === 'parentTag' ? cleanStr : next.parentTag || '');
        const isJuice =
          typeStr.includes('جویس') ||
          typeStr.includes('سالت') ||
          tagStr.includes('جویس') ||
          tagStr.includes('سالت') ||
          nameStr.includes('جویس') ||
          nameStr.includes('سالت');
        const isPc =
          typeStr.includes('کامپیوتر') ||
          typeStr.includes('سخت‌افزار') ||
          tagStr.includes('کامپیوتر') ||
          nameStr.includes('کامپیوتر') ||
          nameStr.includes('گرافیک') ||
          nameStr.includes('پردازنده');

        next.allowDecantSale = isJuice;
        if (isPc) next.sector = 'pc';
        else if (isJuice) next.sector = 'vape';
      }

      return next;
    },
    [catalogItems, findMatchingInvoiceLine, parentItemName]
  );

  // Copy (Ctrl+C)
  const handleCopy = useCallback(() => {
    const { minRow, maxRow, minCol, maxCol, cellCount } = selectionBox;
    const matrix: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowItem = rows[r];
      const rowVals: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const colDef = columns[c];
        const val = rowItem ? String(rowItem[colDef.id] ?? '') : '';
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
  }, [selectionBox, rows, columns, onShowToast]);

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

    const lines = clipText
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map((l) => l.split('\t'));

    if (lines.length === 0) return;

    const startR = selectionBox.minRow;
    const startC = selectionBox.minCol;
    const isSinglePasteVal = lines.length === 1 && lines[0].length === 1;

    let workingRows = [...rows];
    const requiredRowsCount = Math.max(
      workingRows.length,
      isSinglePasteVal ? selectionBox.maxRow + 1 : startR + lines.length
    );

    while (workingRows.length < requiredRowsCount) {
      workingRows.push(createEmptyBreakdownRow(workingRows.length, targetCost, parentItemName));
    }

    if (isSinglePasteVal && selectionBox.isMultiCell) {
      const fillVal = lines[0][0];
      for (let r = selectionBox.minRow; r <= selectionBox.maxRow; r++) {
        for (let c = selectionBox.minCol; c <= selectionBox.maxCol; c++) {
          const colDef = columns[c];
          if (colDef) {
            workingRows[r] = applyParsedValueToRow(workingRows[r], colDef, fillVal);
          }
        }
      }
    } else {
      for (let rOffset = 0; rOffset < lines.length; rOffset++) {
        const rIdx = startR + rOffset;
        const rowData = lines[rOffset];
        if (rIdx >= workingRows.length) break;

        for (let cOffset = 0; cOffset < rowData.length; cOffset++) {
          const cIdx = startC + cOffset;
          if (cIdx >= columns.length) break;
          const colDef = columns[cIdx];
          const val = rowData[cOffset];
          workingRows[rIdx] = applyParsedValueToRow(workingRows[rIdx], colDef, val);
        }
      }
    }

    if (copiedRange?.isCut) {
      for (let r = copiedRange.minRow; r <= copiedRange.maxRow; r++) {
        for (let c = copiedRange.minCol; c <= copiedRange.maxCol; c++) {
          const inPasteTarget =
            r >= startR &&
            r < startR + lines.length &&
            c >= startC &&
            c < startC + (lines[0]?.length || 1);
          if (!inPasteTarget && workingRows[r]) {
            const colDef = columns[c];
            workingRows[r] = applyParsedValueToRow(workingRows[r], colDef, '');
          }
        }
      }
      setCopiedRange(null);
    }

    pushHistoryState(workingRows);
    onChangeRows(workingRows);
    onShowToast('پیست با موفقیت انجام شد.');
  }, [
    selectionBox,
    rows,
    columns,
    copiedRange,
    targetCost,
    parentItemName,
    applyParsedValueToRow,
    pushHistoryState,
    onChangeRows,
    onShowToast,
  ]);

  // Duplicate or Google Sheets Fill Down (Ctrl+D)
  const handleDuplicateOrFillDown = useCallback(() => {
    const { minRow, maxRow, minCol, maxCol, isMultiCell } = selectionBox;
    let updated = [...rows];

    if (isMultiCell && minRow !== maxRow) {
      const topRow = updated[minRow];
      if (!topRow) return;

      for (let r = minRow + 1; r <= maxRow; r++) {
        const target = { ...updated[r] };
        for (let c = minCol; c <= maxCol; c++) {
          const colDef = columns[c];
          const field = colDef.id;
          if (field === 'sku') {
            if (topRow.sku) {
              const numMatch = topRow.sku.match(/(\d+)$/);
              if (numMatch) {
                const prefix = topRow.sku.slice(0, numMatch.index);
                const baseNum = parseInt(numMatch[0], 10);
                const offset = r - minRow;
                target.sku = `${prefix}${String(baseNum + offset).padStart(numMatch[0].length, '0')}`;
              } else {
                target.sku = topRow.sku;
              }
            }
          } else {
            (target as Record<string, unknown>)[field] = topRow[field];
          }
        }
        updated[r] = target;
      }

      pushHistoryState(updated);
      onChangeRows(updated);
      onShowToast(`تکثیر به پایین از سطر #${minRow + 1} تا #${maxRow + 1} انجام شد.`);
    } else {
      const curIdx = activeCell.row;
      const source = rows[curIdx];
      if (!source) return;

      if (curIdx > 0 && minCol === maxCol) {
        const aboveRow = rows[curIdx - 1];
        const colDef = columns[activeCell.col];
        if (aboveRow && colDef) {
          updated[curIdx] = { ...source, [colDef.id]: aboveRow[colDef.id] };
          pushHistoryState(updated);
          onChangeRows(updated);
          onShowToast(`مقدار از سطر بالا کپی شد.`);
          return;
        }
      }

      const clone: SkuBreakdownRow = {
        ...source,
        rowId: `sku-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sku: source.sku ? `${source.sku}-COPY` : '',
      };
      updated.splice(curIdx + 1, 0, clone);
      pushHistoryState(updated);
      onChangeRows(updated);
      onShowToast(`سطر #${curIdx + 1} با موفقیت تکثیر شد.`);
      selectCell(curIdx + 1, activeCell.col, false);
    }
  }, [
    selectionBox,
    rows,
    columns,
    activeCell,
    pushHistoryState,
    onChangeRows,
    onShowToast,
    selectCell,
  ]);

  // Clear Contents of Selected Range (Delete / Backspace)
  const handleClearSelection = useCallback(() => {
    const { minRow, maxRow, minCol, maxCol, cellCount } = selectionBox;
    const updated = rows.map((r, rIdx) => {
      if (rIdx < minRow || rIdx > maxRow) return r;
      const next = { ...r };
      for (let c = minCol; c <= maxCol; c++) {
        const colDef = columns[c];
        if (colDef.type === 'currency' || colDef.type === 'number') {
          (next as Record<string, unknown>)[colDef.id] = 0;
        } else if (colDef.type === 'checkbox') {
          (next as Record<string, unknown>)[colDef.id] = false;
        } else {
          (next as Record<string, unknown>)[colDef.id] = '';
        }
      }
      return next;
    });

    pushHistoryState(updated);
    onChangeRows(updated);
    onShowToast(`محتوای ${cellCount} سلول پاک شد.`);
  }, [selectionBox, rows, columns, pushHistoryState, onChangeRows, onShowToast]);

  // Delete row
  const handleDeleteRow = useCallback(
    (rowIdx: number) => {
      if (rows.length <= 1) return;
      const updated = rows.filter((_, idx) => idx !== rowIdx);
      pushHistoryState(updated);
      onChangeRows(updated);
      if (activeCell.row >= updated.length) {
        selectCell(updated.length - 1, activeCell.col, false);
      }
      onShowToast(`سطر #${rowIdx + 1} حذف شد.`);
    },
    [rows, activeCell, pushHistoryState, onChangeRows, selectCell, onShowToast]
  );

  // Default target warehouse
  const defaultWarehouseKey = (
    activePurchaseLine?.warehouseKey ||
    activePurchaseInvoice?.warehouseKey ||
    'vitrine'
  ) as WarehouseKey;

  // Add new row helper
  const handleAddNewRow = (afterIndex?: number) => {
    const currentRows = rowsRef.current;
    const prevRow = currentRows[afterIndex ?? currentRows.length - 1];
    const defaultRetail = prevRow?.retailPrice || 0;
    const defaultReseller = prevRow?.resellerPrice || 0;
    const defaultWh = prevRow?.targetWarehouse || defaultWarehouseKey;
    const defaultBrand = prevRow?.brand || '';
    const defaultModel = prevRow?.model || '';
    const defaultType = prevRow?.itemType || '';

    const newRow = createEmptyBreakdownRow(
      currentRows.length,
      targetCost,
      parentItemName,
      defaultWh,
      defaultRetail,
      defaultReseller,
      defaultBrand,
      defaultType,
      defaultModel
    );

    let updated: SkuBreakdownRow[];
    if (afterIndex !== undefined && afterIndex < currentRows.length - 1) {
      updated = [...currentRows];
      updated.splice(afterIndex + 1, 0, newRow);
    } else {
      updated = [...currentRows, newRow];
    }
    rowsRef.current = updated;
    pushHistoryState(updated);
    onChangeRows(updated);
    const targetIdx = afterIndex !== undefined ? afterIndex + 1 : currentRows.length;
    window.setTimeout(() => {
      selectCell(targetIdx, activeCellRef.current.col, true, updated.length);
    }, 20);
    return targetIdx;
  };

  // Duplicate a specific row
  const handleDuplicateRow = (rowIdx: number) => {
    const source = rows[rowIdx];
    if (!source) return;
    const clone: SkuBreakdownRow = {
      ...source,
      rowId: `sku-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sku: source.sku ? `${source.sku}-COPY` : '',
    };
    const updated = [...rows];
    updated.splice(rowIdx + 1, 0, clone);
    pushHistoryState(updated);
    onChangeRows(updated);
    onShowToast(`سطر #${rowIdx + 1} با موفقیت تکثیر شد.`);
    selectCell(rowIdx + 1, activeCell.col, false);
  };

  // Fill Down over a specific range [fromRow, toRow] in column `colIdx`
  const handleFillDownRange = (fromRow: number, toRow: number, colIdx: number) => {
    const source = rows[fromRow];
    if (!source || toRow <= fromRow) return;
    const colDef = columns[colIdx];
    if (!colDef) return;
    const field = colDef.id;

    const updated = rows.map((r, idx) => {
      if (idx <= fromRow || idx > toRow) return r;
      const next = { ...r };

      if (field === 'sku') {
        if (source.sku) {
          const numMatch = source.sku.match(/(\d+)$/);
          if (numMatch) {
            const prefix = source.sku.slice(0, numMatch.index);
            const baseNum = parseInt(numMatch[0], 10);
            const offset = idx - fromRow;
            next.sku = `${prefix}${String(baseNum + offset).padStart(numMatch[0].length, '0')}`;
          } else {
            next.sku = source.sku;
          }
        }
      } else {
        (next as Record<string, unknown>)[field] = source[field];
      }
      return next;
    });

    pushHistoryState(updated);
    onChangeRows(updated);
    onShowToast(`تکثیر سلول تا سطر #${toRow + 1} انجام شد.`);
  };

  // Window MouseUp and Click listeners
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

    const handleWindowClick = () => {
      setContextMenu(null);
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('click', handleWindowClick);

    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('click', handleWindowClick);
    };
  }, [isDraggingFill, dragStart, dragHoverRow, columns, rows]);

  // Auto-generate SKUs for all rows that lack SKU
  const handleAutoGenerateSkus = () => {
    let count = 0;
    const updated = rows.map((r, idx) => {
      if (!r.sku.trim() && (r.name.trim() || r.flavor.trim() || r.parentTag.trim())) {
        count++;
        const base = (r.brand || r.parentTag || parentItemName || 'SKU')
          .replace(/[^\w\s\u0600-\u06FF]/gi, '')
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .join('-')
          .toUpperCase();
        const flavorPart = (r.flavor || '')
          .replace(/[^\w\s\u0600-\u06FF]/gi, '')
          .split(' ')
          .filter(Boolean)
          .slice(0, 1)
          .join('')
          .slice(0, 4)
          .toUpperCase();
        const suffix = flavorPart ? `-${flavorPart}` : '';
        return {
          ...r,
          sku: `${base || 'SKU'}${suffix}-${(idx + 1).toString().padStart(3, '0')}`,
        };
      }
      return r;
    });
    onChangeRows(updated);
    onShowToast(`تعداد ${count} بارکد/SKU خودکار تولید شد.`);
  };

  // KEYBOARD NAVIGATION IN SELECTION MODE (Cell focused, not typing inside input)
  const handleCellTdKeyDown = (
    e: React.KeyboardEvent<HTMLTableCellElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      handleRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      handleCopy();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      handleCut();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      handlePaste();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      selectAll();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      handleDuplicateOrFillDown();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handleClearSelection();
      return;
    }

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

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        if (rowIdx > 0) selectCell(rowIdx - 1, colIdx, false);
      } else {
        if (rowIdx + 1 < rows.length) {
          selectCell(rowIdx + 1, colIdx, false);
        } else {
          handleAddNewRow(rowIdx);
          setTimeout(() => selectCell(rowIdx + 1, colIdx, true), 40);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx + 1 < rows.length) selectCell(rowIdx + 1, colIdx, false);
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

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) selectCell(rowIdx, colIdx - 1, false);
        else if (rowIdx > 0) selectCell(rowIdx - 1, columns.length - 1, false);
      } else {
        if (colIdx + 1 < columns.length) selectCell(rowIdx, colIdx + 1, false);
        else if (rowIdx + 1 < rows.length) selectCell(rowIdx + 1, 0, false);
      }
      return;
    }

    if (e.key === 'F2' || e.key === ' ') {
      e.preventDefault();
      const colDef = columns[colIdx];
      if (colDef && colDef.type === 'readonly_currency') {
        onShowToast('🔒 این ستون محاسباتی و بر اساس فاکتور خرید قفل است.');
        return;
      }
      selectCell(rowIdx, colIdx, true);
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const colDef = columns[colIdx];
      if (colDef && colDef.type !== 'checkbox' && colDef.type !== 'readonly_currency') {
        e.preventDefault();
        selectCell(rowIdx, colIdx, true);
        if (colDef.type !== 'select') {
          const normalizedKey = e.key
            .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
            .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
          const initialVal =
            colDef.type === 'number' || colDef.type === 'currency'
              ? Number(normalizedKey.replace(/[^\d]/g, '')) || 0
              : e.key;
          updateRowField(rowIdx, colDef.id, initialVal as never);
          const inp = inputRefs.current.get(`${rowIdx}_${colIdx}`);
          if (inp instanceof HTMLInputElement) {
            requestAnimationFrame(() => {
              const len = inp.value.length;
              try {
                inp.setSelectionRange(len, len);
              } catch {}
            });
          }
        }
      }
    }
  };

  // KEYBOARD HANDLING WHILE ACTIVELY EDITING INSIDE INPUT
  const handleInputKeyDown = (
    e: React.KeyboardEvent,
    rowIdx: number,
    colIdx: number
  ) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      e.stopPropagation();
      handleRedo();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(false);
      const td = cellTdRefs.current.get(`${rowIdx}_${colIdx}`);
      if (td) td.focus({ preventScroll: true });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      setIsEditing(false);
      if (e.shiftKey) {
        if (rowIdx > 0) selectCell(rowIdx - 1, colIdx, false);
      } else {
        if (rowIdx + 1 < rows.length) {
          selectCell(rowIdx + 1, colIdx, false);
        } else {
          handleAddNewRow(rowIdx);
          setTimeout(() => selectCell(rowIdx + 1, colIdx, true), 40);
        }
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
      }
      return;
    }
  };

  // Update a single cell field value
  const updateRowField = <K extends keyof SkuBreakdownRow>(
    rowIdx: number,
    field: K,
    val: SkuBreakdownRow[K]
  ) => {
    const currentRows = rowsRef.current;
    const updated = currentRows.map((r, idx) => {
      if (idx !== rowIdx) return r;
      const next = { ...r, [field]: val };

      // Auto assemble name when parentTag or flavor changes
      if (field === 'parentTag' || field === 'flavor') {
        const pTag = String(field === 'parentTag' ? val : next.parentTag || parentItemName || '').trim();
        const flv = String(field === 'flavor' ? val : next.flavor || '').trim();
        if (pTag && flv) {
          next.name = `${pTag} — ${flv}`;
        } else if (pTag) {
          next.name = pTag;
        } else if (flv) {
          next.name = flv;
        }
      }

      // Check parentTag against active invoice lines & pull invoice line purchase price!
      if (field === 'parentTag' || field === 'name') {
        const matchedInvLine = findMatchingInvoiceLine(
          String(field === 'parentTag' ? val : next.parentTag || ''),
          String(field === 'name' ? val : next.name || '')
        );
        if (matchedInvLine) {
          const invCost = matchedInvLine.valuationRate || matchedInvLine.unitPrice || 0;
          if (invCost > 0) {
            next.unitPurchasePrice = invCost;
          }
          if (matchedInvLine.itemType && !next.itemType) {
            next.itemType = matchedInvLine.itemType;
          }
          if (matchedInvLine.itemCondition) {
            next.condition = matchedInvLine.itemCondition;
          }
        }
      }

      // Auto sync decant sale and sector when itemType, parentTag, or name changes
      if (field === 'itemType' || field === 'name' || field === 'parentTag') {
        const typeStr = String(field === 'itemType' ? val : next.itemType || '');
        const nameStr = String(field === 'name' ? val : next.name || '');
        const tagStr = String(field === 'parentTag' ? val : next.parentTag || '');
        const isJuice =
          typeStr.includes('جویس') ||
          typeStr.includes('سالت') ||
          tagStr.includes('جویس') ||
          tagStr.includes('سالت') ||
          nameStr.includes('جویس') ||
          nameStr.includes('سالت');
        const isPc =
          typeStr.includes('کامپیوتر') ||
          typeStr.includes('سخت‌افزار') ||
          tagStr.includes('کامپیوتر') ||
          nameStr.includes('کامپیوتر') ||
          nameStr.includes('گرافیک') ||
          nameStr.includes('پردازنده');

        next.allowDecantSale = isJuice;
        if (isPc) next.sector = 'pc';
        else if (isJuice) next.sector = 'vape';
      }

      // Scanned barcode auto-lookup
      if (field === 'sku') {
        const query = String(val).trim().toLowerCase();
        if (query) {
          const match = catalogItems.find((it) => it.sku.toLowerCase() === query);
          if (match) {
            next.name = match.name;
            next.parentTag = match.parentTag || next.parentTag || parentItemName;
            next.flavor =
              match.flavor ||
              (match.parentTag
                ? match.name.replace(match.parentTag, '').replace(/^[—\s-]+/, '').trim()
                : next.flavor);
            next.brand = match.brand || next.brand;
            next.model = match.model || next.model;
            next.retailPrice = match.retailPrice || next.retailPrice;
            next.resellerPrice = match.resellerPrice || next.resellerPrice;
            next.itemType = match.category || next.itemType;
            next.nicotine = match.nicotine || next.nicotine;
            next.puffCount = match.puffCount || next.puffCount;
            next.color = match.color || next.color;
            next.resistanceOhm = match.resistanceOhm || next.resistanceOhm;
            if (match.liquidVolumeMl) next.liquidVolumeMl = String(match.liquidVolumeMl);
            if (match.podTankCapacityMl) next.podTankCapacityMl = String(match.podTankCapacityMl);
            const isJuice =
              (match.category && (match.category.includes('جویس') || match.category.includes('سالت'))) ||
              match.name.includes('جویس') ||
              match.name.includes('سالت');
            next.allowDecantSale = isJuice ? true : (match.allowDecantSale ?? false);
            next.sector = match.sector || (isJuice ? 'vape' : next.sector);
          }
        }
      }

      if (field === 'parentTag' || field === 'name') {
        const query = String(val).trim().toLocaleLowerCase();
        const match = (catalogItems || []).find(
          (item) =>
            item.parentTag?.trim().toLocaleLowerCase() === query ||
            item.name.trim().toLocaleLowerCase() === query
        );
        if (match) {
          next.sku = match.sku || next.sku;
          next.name = match.name || next.name;
          next.parentTag = match.parentTag || next.parentTag;
          next.brand = match.brand || next.brand;
          next.model = match.model || next.model;
          next.itemType = match.category || next.itemType;
          next.nicotine = match.nicotine || next.nicotine;
          next.liquidVolumeMl = match.liquidVolumeMl ? String(match.liquidVolumeMl) : next.liquidVolumeMl;
          next.resistanceOhm = match.resistanceOhm || next.resistanceOhm;
          next.puffCount = match.puffCount || next.puffCount;
          next.color = match.color || next.color;
          if (!next.unitPurchasePrice) {
            next.unitPurchasePrice = match.valuationRate || 0;
          }
          const existingStock = match.stockQty || 0;
          const existingVal = match.valuationRate || 0;
          const curCost = next.unitPurchasePrice || existingVal;
          const curQty = next.qty > 0 ? next.qty : 1;
          next.mwaPurchasePrice =
            existingStock > 0 && existingVal > 0 && curCost > 0
              ? Math.round((existingStock * existingVal + curQty * curCost) / (existingStock + curQty))
              : curCost;
          next.retailPrice = match.retailPrice || next.retailPrice;
          next.resellerPrice = match.resellerPrice || next.resellerPrice;
        } else if (next.unitPurchasePrice > 0) {
          next.mwaPurchasePrice = next.unitPurchasePrice;
        }
      }
      return next;
    });
    rowsRef.current = updated;
    pushHistoryState(updated);
    onChangeRows(updated);
  };

  // Active cell formula bar label & value
  const activeCellCoord = useMemo(() => {
    const colLetter = columns[activeCell.col]?.col || 'A';
    return `${colLetter}${activeCell.row + 1}`;
  }, [activeCell, columns]);

  const activeCellValue = useMemo(() => {
    const row = rows[activeCell.row];
    if (!row) return '';
    const colDef = columns[activeCell.col];
    if (!colDef) return '';
    if (colDef.id === 'unitPurchasePrice') {
      const pCost = getRowPurchaseCost(row);
      return pCost > 0 ? `${formatCurrency(pCost)} تومان` : '';
    }
    if (colDef.id === 'mwaPurchasePrice') {
      const mCost = getRowMwaCost(row);
      return mCost > 0 ? `${formatCurrency(mCost)} تومان` : '';
    }
    const val = row[colDef.id];
    if (val === undefined || val === null || val === '') return '';
    if (colDef.type === 'currency') return `${formatCurrency(Number(val) || 0)} تومان`;
    if (colDef.type === 'checkbox') return val ? 'فعال (بلی)' : 'غیرفعال (خیر)';
    return String(val);
  }, [rows, activeCell, columns, getRowPurchaseCost, getRowMwaCost]);

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 flex flex-col h-screen w-screen p-3 md:p-4 overflow-hidden'
    : 'space-y-3';

  return (
    <div className={containerClass}>
      {/* =====================================================================
          GOOGLE SHEETS HEADER & ACTION TOOLBAR
         ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl shadow-xs p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-600 text-white shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  کاربرگ پذیرش کالا و تفکیک طعم‌ها (طرح کامل گوگل شیت با Data Validation)
                </h3>
                {activePurchaseInvoice && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                    فاکتور: {activePurchaseInvoice.billNo}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                <span>کلیدهای جهت‌نما: <strong>↑ ↓ ← →</strong> ناوبری ۴ جهته با اسکرول خودکار</span>
                <span>·</span>
                <span><strong>Enter</strong> = سطر بعدی</span>
                <span>·</span>
                <span><strong>Escape</strong> = خروج از تایپ و انتخاب سلول</span>
                <span>·</span>
                <span><strong>تنظیم ستون</strong> = ترتیب و رنگ دیتاهای Data Validation</span>
              </p>
            </div>
          </div>

          {/* Allocation Quantity Pill & Fullscreen Toggle */}
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 ${
                currentAllocatedQty === targetQty && targetQty > 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-300'
              }`}
            >
              <span>تفکیک‌شده:</span>
              <span className="font-mono text-sm font-black">{currentAllocatedQty}</span>
              <span>از</span>
              <span className="font-mono text-sm font-black">{targetQty || '—'}</span>
              <span>عدد</span>
              {currentAllocatedQty === targetQty && targetQty > 0 && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mr-1" />
              )}
            </div>

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

        {/* Google Sheets Formula Bar & Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          {/* Formula Bar (fx) */}
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <div className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-700 dark:text-slate-300 text-center w-14 shadow-xs">
              {activeCellCoord}
            </div>
            {selectionBox.isMultiCell && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[11px] border border-emerald-300 shrink-0">
                {selectionBox.cellCount} سلول ({columns[selectionBox.minCol]?.col}{selectionBox.minRow + 1}:{columns[selectionBox.maxCol]?.col}{selectionBox.maxRow + 1})
              </span>
            )}
            <div className="font-mono text-slate-400 font-bold select-none text-xs">fx</div>
            <div className="flex-1 px-3 py-1 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono text-xs truncate">
              {activeCellValue || <span className="text-slate-400 font-sans italic">سلول خالی</span>}
            </div>
          </div>

          {/* Quick Sheet Actions */}
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
                disabled={historyIndex >= historyStack.length - 1}
                onClick={handleRedo}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="ازنو (Ctrl+Y)"
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
                onClick={handlePaste}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                title="جای‌گذاری از کلیپ‌بورد (Ctrl+V)"
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

            <button
              type="button"
              onClick={() => handleAddNewRow()}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1"
            >
              <Plus className="w-3 h-3 text-emerald-600" />
              <span>+۱ سطر</span>
            </button>

            <button
              type="button"
              onClick={handleAutoGenerateSkus}
              className="px-2.5 py-1 rounded border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-medium flex items-center gap-1"
            >
              <Wand2 className="w-3 h-3 text-purple-600" />
              <span>تولید SKU خودکار</span>
            </button>

            <button
              type="button"
              onClick={() => openColumnEditor(columns[activeCell.col]?.id || 'parentTag')}
              className="px-2.5 py-1 rounded border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-bold flex items-center gap-1"
              title="تنظیم اعتبارسنجی داده (Data Validation)، ترتیب و رنگ دیتاها"
            >
              <Settings2 className="w-3 h-3" />
              <span>اعتبارسنجی داده (Data Validation)</span>
            </button>

            {knownVariants.length > 0 && (
              <button
                type="button"
                onClick={onLoadKnownVariants}
                className="px-2.5 py-1 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-medium flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>درج {knownVariants.length} طعم شناخته‌شده</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const filtered = rows.filter((r) => (r.sku.trim() || r.name.trim()) && r.qty > 0);
                onChangeRows(filtered);
                onShowToast(`سطرهای خالی یا ناقص حذف شدند؛ ${filtered.length} سطر کامل باقی ماند.`);
              }}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-600 cursor-pointer"
              title="پاکسازی سطرهای اضافی خالی"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {isFullscreen && activePurchaseInvoice && (
        <section className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-sm text-amber-900 dark:text-amber-100">مغایرت پذیرش با فاکتور</h4>
            <button
              type="button"
              onClick={() => void copyAuditValue(activePurchaseInvoice.billNo)}
              className="px-2.5 py-1 rounded border border-amber-300 dark:border-amber-700 flex items-center gap-1.5 text-xs font-semibold"
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
              کپی نام/شماره فاکتور: {activePurchaseInvoice.billNo}
            </button>
          </div>
          <div className="flex gap-2 overflow-auto">
            {(activePurchaseInvoice.lines || []).map((line) => {
              // Product tag in Goods Intake is strictly the product name in the purchase invoice (line.itemName)
              const tag = line.itemName.trim();
              const normalizedTag = tag.toLocaleLowerCase();
              const lineCost = line.valuationRate || line.unitPrice || 0;
              const receivedQty = rows
                .filter(
                  (row) =>
                    row.parentTag.trim().toLocaleLowerCase() === normalizedTag ||
                    row.name.trim().toLocaleLowerCase().includes(normalizedTag)
                )
                .reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
              const variance = receivedQty - line.qty;
              return (
                <div
                  key={line.id}
                  className={`min-w-[240px] rounded-lg border p-2 text-xs ${
                    variance === 0
                      ? 'border-emerald-300 bg-white dark:bg-slate-900'
                      : 'border-rose-300 bg-white dark:bg-slate-900'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void copyAuditValue(tag)}
                    className="w-full flex items-center justify-between gap-2 font-semibold text-right hover:text-indigo-700"
                    title="کپی تگ کالا (نام محصول در فاکتور)"
                  >
                    <span className="truncate">{tag}</span>
                    <ClipboardCopy className="w-3.5 h-3.5 shrink-0" />
                  </button>
                  <div className="mt-1 text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                    فی خرید فاکتور: {formatCurrency(lineCost)} تومان
                  </div>
                  <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                    <span>فاکتور: {line.qty}</span>
                    <span>پذیرش: {receivedQty}</span>
                    <strong className={variance === 0 ? 'text-emerald-700' : 'text-rose-700'}>
                      {variance > 0 ? `مازاد ${variance}` : variance < 0 ? `کسری ${Math.abs(variance)}` : 'مطابق'}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =====================================================================
          SPREADSHEET GRID (GOOGLE SHEETS TABLE WITH DATA VALIDATION)
         ===================================================================== */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-xs flex flex-col min-h-[460px]">
        <div
          ref={tableContainerRef}
          className="flex-1 overflow-auto max-h-[640px] select-none"
        >
          <table className="border-collapse text-xs text-right w-max min-w-full">
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700 shadow-xs">
              <tr>
                <th
                  onClick={selectAll}
                  className="sticky right-0 z-30 w-12 py-1 px-1 border-l border-b border-slate-300 dark:border-slate-700 text-center font-mono text-slate-500 bg-slate-200 dark:bg-slate-800 font-bold text-[11px] cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors select-none"
                  title="انتخاب کل جدول (Ctrl+A)"
                >
                  #
                </th>
                {columns.map((ch, colIdx) => (
                  <th
                    key={ch.id}
                    onClick={() => selectColumn(colIdx)}
                    draggable
                    onDragStart={() => setDraggedColumnId(ch.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedColumnId) moveColumn(draggedColumnId, ch.id);
                      setDraggedColumnId(null);
                    }}
                    onDragEnd={() => setDraggedColumnId(null)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, rowIdx: -1, colIdx });
                    }}
                    className={`py-1.5 px-2 border-l border-b border-slate-300 dark:border-slate-700 font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/60 transition-colors select-none ${ch.width}`}
                    title={`انتخاب ستون (${ch.label}) — راست‌کلیک برای تنظیم اعتبارسنجی داده`}
                  >
                    <div className="flex items-center justify-between text-[11px] gap-1">
                      <span className="truncate">{ch.label}</span>
                      <span className="text-[9px] text-slate-400 font-mono">{ch.col}</span>
                    </div>
                  </th>
                ))}
                <th className="w-16 py-1.5 px-2 text-center border-b border-slate-300 dark:border-slate-700 font-semibold text-[11px]">
                  عملیات
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((row, rowIdx) => {
                const isRowActive = activeCell.row === rowIdx;
                const isDragOver =
                  isDraggingFill &&
                  dragStart &&
                  dragHoverRow !== null &&
                  rowIdx > dragStart.row &&
                  rowIdx <= dragHoverRow;

                const resolvedPurchasePrice = getRowPurchaseCost(row);
                const resolvedMwaPrice = getRowMwaCost(row);

                return (
                  <tr
                    key={row.rowId}
                    onMouseEnter={() => {
                      if (isDraggingFill) {
                        setDragHoverRow(rowIdx);
                      }
                    }}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      isRowActive ? 'bg-indigo-50/25 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    <td
                      onClick={() => selectRow(rowIdx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectRow(rowIdx);
                      }}
                      className="sticky right-0 z-10 w-12 py-1 px-1 border-l border-slate-300 dark:border-slate-700 text-center font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 font-bold select-none text-[11px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/60 transition-colors"
                      title={`انتخاب سطر #${rowIdx + 1}`}
                    >
                      {rowIdx + 1}
                    </td>

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
                      const rawValue = row[colDef.id];

                      const isTopBorder = isInSelection && selectionBox.isMultiCell && rowIdx === selectionBox.minRow;
                      const isBottomBorder = isInSelection && selectionBox.isMultiCell && rowIdx === selectionBox.maxRow;
                      const isRightBorder = isInSelection && selectionBox.isMultiCell && colIdx === selectionBox.minCol;
                      const isLeftBorder = isInSelection && selectionBox.isMultiCell && colIdx === selectionBox.maxCol;

                      const isFillCorner =
                        (selectionBox.isMultiCell
                          ? rowIdx === selectionBox.maxRow && colIdx === selectionBox.maxCol
                          : isCellActive) && !isCellEditing;

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
                              if (colDef.type === 'readonly_currency') {
                                selectCell(rowIdx, colIdx, false);
                              } else if (colDef.type === 'select') {
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
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!isInSelection) {
                              selectCell(rowIdx, colIdx, false);
                            }
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              rowIdx,
                              colIdx,
                            });
                          }}
                          onDoubleClick={() => {
                            if (colDef.type === 'readonly_currency') {
                              onShowToast('🔒 این ستون محاسباتی و بر اساس فاکتور خرید قفل است.');
                              return;
                            }
                            selectCell(rowIdx, colIdx, true);
                          }}
                          onKeyDown={(e) => {
                            if (!isCellEditing) {
                              handleCellTdKeyDown(e, rowIdx, colIdx);
                            }
                          }}
                          className={`p-0 border-l border-slate-300 dark:border-slate-700 relative text-xs outline-none select-text ${
                            colDef.width
                          } ${
                            isCellActive
                              ? 'ring-2 ring-emerald-600 dark:ring-emerald-400 z-20 bg-white dark:bg-slate-900'
                              : isInSelection
                              ? 'bg-emerald-500/15 dark:bg-emerald-500/25'
                              : ''
                          } ${
                            isTopBorder ? 'border-t-2 border-t-emerald-600 dark:border-t-emerald-400' : ''
                          } ${
                            isBottomBorder ? 'border-b-2 border-b-emerald-600 dark:border-b-emerald-400' : ''
                          } ${
                            isRightBorder ? 'border-r-2 border-r-emerald-600 dark:border-r-emerald-400' : ''
                          } ${
                            isLeftBorder ? 'border-l-2 border-l-emerald-600 dark:border-l-emerald-400' : ''
                          } ${
                            isCopied ? 'outline-2 outline-dashed outline-emerald-500 z-10 animate-pulse' : ''
                          } ${
                            isCellDragTarget
                              ? 'bg-emerald-100/70 dark:bg-emerald-950/60 border-2 border-dashed border-emerald-500'
                              : ''
                          }`}
                        >
                          {colDef.type === 'readonly_currency' ? (
                            <div
                              onClick={() => {
                                if (isCellActive) {
                                  onShowToast('🔒 این ستون محاسباتی و بر اساس فاکتور خرید قفل است.');
                                }
                              }}
                              className="w-full h-8 px-2 flex items-center justify-between font-mono bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 text-xs font-bold"
                            >
                              <span className="tabular-nums">
                                {colDef.id === 'mwaPurchasePrice' ? (
                                  resolvedMwaPrice > 0 ? (
                                    `${formatCurrency(resolvedMwaPrice)} ت`
                                  ) : (
                                    <span className="text-slate-300 font-normal">۰</span>
                                  )
                                ) : resolvedPurchasePrice > 0 ? (
                                  `${formatCurrency(resolvedPurchasePrice)} ت`
                                ) : (
                                  <span className="text-slate-300 font-normal">۰</span>
                                )}
                              </span>
                              <span className="text-[10px] text-slate-400 opacity-60 ml-1" title="فیلد محاسباتی از فاکتور خرید">
                                🔒
                              </span>
                            </div>
                          ) : colDef.type === 'currency' ? (
                            <CurrencyInput
                              ref={(el) => setInputRef(cellKey, el)}
                              value={typeof rawValue === 'number' && rawValue > 0 ? rawValue : ''}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!e.shiftKey) {
                                  activeCellRef.current = { row: rowIdx, col: colIdx };
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
                              onChange={(val) => updateRowField(rowIdx, colDef.id, val as never)}
                              onKeyDown={(e) => handleInputKeyDown(e, rowIdx, colIdx)}
                              onBlur={() => {
                                if (
                                  activeCellRef.current.row === rowIdx &&
                                  activeCellRef.current.col === colIdx
                                ) {
                                  setIsEditing(false);
                                }
                              }}
                              placeholder="۰"
                              className="w-full h-8 px-2 font-mono font-bold text-left bg-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none tabular-nums text-xs select-text cursor-text"
                            />
                          ) : colDef.type === 'number' ? (
                            <input
                              ref={(el) => setInputRef(cellKey, el)}
                              type="text"
                              inputMode="numeric"
                              value={rawValue !== undefined && rawValue !== null && rawValue !== 0 ? String(rawValue) : ''}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!e.shiftKey) {
                                  activeCellRef.current = { row: rowIdx, col: colIdx };
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
                                updateRowField(rowIdx, colDef.id, (cleaned ? Math.max(0, Number(cleaned)) : 0) as never);
                              }}
                              onKeyDown={(e) => handleInputKeyDown(e, rowIdx, colIdx)}
                              onBlur={() => {
                                if (
                                  activeCellRef.current.row === rowIdx &&
                                  activeCellRef.current.col === colIdx
                                ) {
                                  setIsEditing(false);
                                }
                              }}
                              placeholder="۰"
                              className="w-full h-8 px-1 font-mono font-bold text-center bg-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none tabular-nums text-xs select-text cursor-text"
                            />
                          ) : colDef.type === 'text' ? (
                            <input
                              ref={(el) => setInputRef(cellKey, el)}
                              type="text"
                              value={String(rawValue || '')}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!e.shiftKey) {
                                  activeCellRef.current = { row: rowIdx, col: colIdx };
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
                              onChange={(e) => updateRowField(rowIdx, colDef.id, e.target.value as never)}
                              onKeyDown={(e) => handleInputKeyDown(e, rowIdx, colIdx)}
                              onBlur={() => {
                                if (
                                  activeCellRef.current.row === rowIdx &&
                                  activeCellRef.current.col === colIdx
                                ) {
                                  setIsEditing(false);
                                }
                              }}
                              placeholder={
                                colDef.id === 'sku'
                                  ? 'اسکن یا تایپ SKU...'
                                  : colDef.id === 'expiryDate'
                                  ? '1406/05'
                                  : '...'
                              }
                              className={`w-full h-8 px-2 bg-transparent text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-xs select-text cursor-text ${
                                colDef.align === 'left'
                                  ? 'font-mono text-left'
                                  : colDef.align === 'center'
                                  ? 'text-center font-mono'
                                  : 'text-right font-medium'
                              }`}
                            />
                          ) : colDef.type === 'select' ? (
                            <GridSearchableSelect
                              ref={(el) => setInputRef(cellKey, el)}
                              value={
                                colDef.id === 'targetWarehouse'
                                  ? warehouses.find((w) => w.key === rawValue)?.name || String(rawValue || '')
                                  : String(rawValue || '')
                              }
                              options={
                                colDef.id === 'targetWarehouse'
                                  ? warehouses.map((w) => w.name)
                                  : (colDef.options || []).filter(Boolean)
                              }
                              optionColors={colDef.optionColors}
                              isOpen={isCellEditing}
                              align={colDef.align}
                              allowCreate={colDef.id !== 'targetWarehouse' && colDef.id !== 'condition'}
                              allowLiveChange={colDef.id !== 'targetWarehouse'}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!e.shiftKey) {
                                  activeCellRef.current = { row: rowIdx, col: colIdx };
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
                              onOpen={() => {
                                activeCellRef.current = { row: rowIdx, col: colIdx };
                                setActiveCell({ row: rowIdx, col: colIdx });
                                setSelectionRange({
                                  startRow: rowIdx,
                                  startCol: colIdx,
                                  endRow: rowIdx,
                                  endCol: colIdx,
                                });
                                setIsEditing(true);
                              }}
                              onCreateOption={(newOpt) => {
                                const trimmed = newOpt.trim();
                                if (!trimmed) return;
                                setGridConfig((current) => {
                                  const existing =
                                    current.validationOptions?.[colDef.id] ||
                                    (colDef.options || []).filter(Boolean);
                                  return {
                                    ...current,
                                    validationOptions: {
                                      ...current.validationOptions,
                                      [colDef.id]: Array.from(new Set([trimmed, ...existing])),
                                    },
                                  };
                                });
                              }}
                              onChange={(val, meta) => {
                                if (colDef.id === 'targetWarehouse') {
                                  const found = warehouses.find((w) => w.name === val || w.key === val);
                                  if (found) {
                                    updateRowField(rowIdx, colDef.id, found.key as never);
                                  }
                                } else {
                                  updateRowField(rowIdx, colDef.id, val as never);
                                }
                                if (!meta?.keepEditing) {
                                  setIsEditing(false);
                                }
                              }}
                              onCommitAndMoveDown={() => {
                                setIsEditing(false);
                                if (rowIdx + 1 < rowsRef.current.length) {
                                  selectCell(rowIdx + 1, colIdx, false);
                                } else {
                                  handleAddNewRow(rowIdx);
                                }
                              }}
                              onCommitAndMoveTab={(shift) => {
                                setIsEditing(false);
                                if (shift) {
                                  if (colIdx > 0) selectCell(rowIdx, colIdx - 1, false);
                                } else {
                                  if (colIdx + 1 < columns.length) selectCell(rowIdx, colIdx + 1, false);
                                }
                              }}
                              onClose={() => {
                                if (
                                  activeCellRef.current.row === rowIdx &&
                                  activeCellRef.current.col === colIdx
                                ) {
                                  setIsEditing(false);
                                }
                              }}
                              placeholder={`انتخاب ${colDef.label.split('(')[0]?.trim() || colDef.label}...`}
                            />
                          ) : colDef.type === 'checkbox' ? (
                            <div className="w-full h-8 flex items-center justify-center">
                              <input
                                ref={(el) => setInputRef(cellKey, el)}
                                type="checkbox"
                                checked={Boolean(rawValue)}
                                onChange={(e) => {
                                  updateRowField(rowIdx, colDef.id, e.target.checked as never);
                                  setIsEditing(false);
                                }}
                                onKeyDown={(e) => handleInputKeyDown(e, rowIdx, colIdx)}
                                onBlur={() => {
                                  if (
                                    activeCellRef.current.row === rowIdx &&
                                    activeCellRef.current.col === colIdx
                                  ) {
                                    setIsEditing(false);
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              />
                            </div>
                          ) : null}

                          {isFillCorner && (
                            <div
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDraggingFill(true);
                                setDragStart({ row: selectionBox.maxRow, col: activeCell.col });
                                setDragHoverRow(selectionBox.maxRow);
                              }}
                              className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-emerald-600 border border-white cursor-crosshair z-30 shadow-xs rounded-xs"
                              title="برای تکثیر به ردیف‌های پایین بکشید (Drag to fill)"
                            />
                          )}
                        </td>
                      );
                    })}

                    <td className="w-16 p-1 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(rowIdx)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                          title="تکثیر این سطر (Duplicate)"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              onChangeRows(rows.filter((_, idx) => idx !== rowIdx));
                              if (activeCell.row >= rows.length - 1) {
                                selectCell(Math.max(0, rows.length - 2), activeCell.col, false);
                              }
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
                            title="حذف سطر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* =====================================================================
            FOOTER STATUS & FINAL COMMIT BUTTON
           ===================================================================== */}
        <div className="bg-slate-100 dark:bg-slate-800/90 border-t border-slate-300 dark:border-slate-700 p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300 flex-wrap">
            <div>
              کل سطرهای کاربرگ: <strong className="font-mono text-slate-900 dark:text-slate-100">{rows.length}</strong> ردیف
            </div>
            <div>
              مجموع تعداد اقلام: <strong className="font-mono text-indigo-700 dark:text-indigo-400 font-bold">{currentAllocatedQty}</strong> عدد
            </div>
            <div>
              مجموع ارزش پذیرش: <strong className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                {formatCurrency(
                  rows
                    .filter((r) => (r.sku.trim() || r.name.trim()) && r.qty > 0)
                    .reduce((sum, r) => sum + r.qty * getRowPurchaseCost(r), 0)
                )} تومان
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleAddNewRow()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>افزودن سطر جدید</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCommit}
              className={`px-5 py-1.5 rounded-lg font-bold text-white shadow-md flex items-center gap-2 transition-all ${
                isSubmitting
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال ثبت در انبار...' : 'ثبت نهایی پذیرش و انتقال به موجودی'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          RIGHT-CLICK CONTEXT MENU
         ===================================================================== */}
      {contextMenu?.rowIdx === -1 ? (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 min-w-[230px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl py-1 text-xs"
        >
          <button
            type="button"
            onClick={() => openColumnEditor(columns[contextMenu.colIdx]?.id || 'parentTag')}
            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-indigo-50 dark:hover:bg-slate-700 text-right font-semibold"
          >
            <Settings2 className="w-4 h-4 text-indigo-600" />
            تنظیم اعتبارسنجی داده (Data Validation)
          </button>
        </div>
      ) : contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 min-w-[230px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl py-1 text-xs text-slate-800 dark:text-slate-100 divide-y divide-slate-100 dark:divide-slate-700 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            <button
              type="button"
              onClick={() => openColumnEditor(columns[contextMenu.colIdx]?.id || 'parentTag')}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-50 dark:hover:bg-slate-700 text-right text-indigo-700 dark:text-indigo-300 font-semibold"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>تنظیم اعتبارسنجی داده (Data Validation)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleCopy();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 text-right"
            >
              <span className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>کپی</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Ctrl+C</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleCut();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 text-right"
            >
              <span className="flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5 text-slate-500" />
                <span>برش</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Ctrl+X</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handlePaste();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 text-right"
            >
              <span className="flex items-center gap-2">
                <ClipboardPaste className="w-3.5 h-3.5 text-slate-500" />
                <span>جای‌گذاری</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Ctrl+V</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleDuplicateOrFillDown();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 text-right"
            >
              <span className="flex items-center gap-2">
                <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                <span>تکثیر / پر کردن به پایین</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Ctrl+D</span>
            </button>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                handleAddNewRow(contextMenu.rowIdx - 1);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-right"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>درج ۱ سطر در بالا</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleAddNewRow(contextMenu.rowIdx);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-right"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>درج ۱ سطر در پایین</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleDuplicateRow(contextMenu.rowIdx);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-right"
            >
              <Copy className="w-3.5 h-3.5 text-sky-600" />
              <span>تکثیر کل این سطر</span>
            </button>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                handleClearSelection();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 text-right text-rose-600 dark:text-rose-400"
            >
              <span className="flex items-center gap-2">
                <Eraser className="w-3.5 h-3.5" />
                <span>پاک کردن محتوای انتخاب</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Del</span>
            </button>

            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  handleDeleteRow(contextMenu.rowIdx);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-right text-rose-600 dark:text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف این سطر</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          GOOGLE SHEETS DATA VALIDATION SIDEBAR (Option Ordering & Data Colors)
         ===================================================================== */}
      {isColumnEditorOpen && activeEditorColumn && (
        <>
          <button
            type="button"
            aria-label="بستن پنل اعتبارسنجی داده"
            onClick={() => setIsColumnEditorOpen(false)}
            className="fixed inset-0 z-[60] bg-slate-950/30 cursor-default"
          />
          <aside
            dir="rtl"
            className="fixed right-0 top-0 z-[61] flex h-screen w-full max-w-[420px] flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm">
                  <Settings2 className="w-4 h-4 text-indigo-600" />
                  <span>قوانین اعتبارسنجی داده (Data Validation)</span>
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  تنظیم ترتیب نمایش و رنگ اختصاصی هر داده (مشابه چیپ‌های گوگل شیت)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsColumnEditorOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="بستن"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-auto p-4 text-xs">
              {/* Column Selector inside Sidebar */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ستون مورد نظر برای اعتبارسنجی داده:
                </label>
                <select
                  value={activeEditorColumn.id}
                  onChange={(e) => setEditingColumnId(e.target.value as keyof SkuBreakdownRow)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-slate-50 dark:bg-slate-800 font-semibold text-xs"
                >
                  {columns
                    .filter((c) => c.type === 'select' || c.type === 'text')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        ستون {c.col} — {c.label}
                      </option>
                    ))}
                </select>
              </div>

              {activeEditorColumn.type === 'select' || activeEditorColumn.type === 'text' ? (
                <>
                  {/* Add New Option to Data Validation */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                    <label className="block font-bold text-slate-700 dark:text-slate-300">
                      + افزودن گزینه جدید به فهرست این ستون:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newOptionInput}
                        onChange={(e) => setNewOptionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddValidationOption();
                          }
                        }}
                        placeholder="نام گزینه (مثلاً 0.6 Ω یا سالت ویگاد)..."
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                      />
                      <input
                        type="color"
                        value={newOptionColor}
                        onChange={(e) => setNewOptionColor(e.target.value)}
                        title="رنگ این گزینه داده"
                        className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={handleAddValidationOption}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shrink-0"
                      >
                        افزودن
                      </button>
                    </div>
                  </div>

                  {/* Ordered Options List with Individual Data Colors */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200">
                        گزینه‌ها، ترتیب نمایش و رنگ دیتاها ({activeEditorOptions.length})
                      </h4>
                      <button
                        type="button"
                        onClick={handleResetColumnValidation}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600"
                        title="بازنشانی ترتیب و رنگ دیتاهای این ستون"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>بازنشانی پیش‌فرض</span>
                      </button>
                    </div>

                    {activeEditorOptions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-slate-400">
                        هنوز گزینه‌ای برای این ستون ثبت نشده است. از کادر بالا گزینه جدید اضافه کنید.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                        {activeEditorOptions.map((opt, idx) => {
                          const currentColor =
                            gridConfig.optionColors?.[activeEditorColumn.id]?.[opt] || '';
                          return (
                            <div
                              key={opt}
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-1.5 shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                {/* Option Preview Chip */}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-mono text-[10px] text-slate-400 w-5 text-center">
                                    {idx + 1}
                                  </span>
                                  {currentColor && (
                                    <span
                                      className="w-3 h-3 rounded-full shrink-0 border border-black/15"
                                      style={{ backgroundColor: currentColor }}
                                    />
                                  )}
                                  <span
                                    className="truncate font-semibold"
                                    style={currentColor ? { color: currentColor } : undefined}
                                  >
                                    {opt}
                                  </span>
                                </div>

                                {/* Order Up / Down & Delete Controls */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveValidationOption(idx, 'up')}
                                    className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                                    title="انتقال به بالا"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === activeEditorOptions.length - 1}
                                    onClick={() => handleMoveValidationOption(idx, 'down')}
                                    className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                                    title="انتقال به پایین"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="color"
                                    value={currentColor || '#4f46e5'}
                                    onChange={(e) => handleSetOptionColor(opt, e.target.value)}
                                    title="انتخاب رنگ دلخواه برای این داده"
                                    className="h-6 w-7 cursor-pointer rounded border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteValidationOption(opt)}
                                    className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                    title="حذف این گزینه از فهرست"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Quick Preset Chip Colors Row */}
                              <div className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                                <span className="text-[10px] text-slate-400 ml-1">رنگ دیتا:</span>
                                {DATA_CHIP_COLOR_PALETTE.map((preset) => {
                                  const isSelected = currentColor === preset.value;
                                  return (
                                    <button
                                      key={preset.label}
                                      type="button"
                                      onClick={() => handleSetOptionColor(opt, preset.value)}
                                      title={preset.label}
                                      className={`w-4 h-4 rounded-full border transition-transform ${
                                        isSelected
                                          ? 'scale-125 ring-2 ring-indigo-500 border-white'
                                          : 'border-slate-300 dark:border-slate-600 hover:scale-110'
                                      }`}
                                      style={{
                                        backgroundColor: preset.value || '#e2e8f0',
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-slate-100 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  این ستون مربوط به قیمت یا اعداد محاسباتی است و بر اساس منطق سیستم، نیازی به اعتبارسنجی داده (Data Validation) ندارد.
                </p>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};
