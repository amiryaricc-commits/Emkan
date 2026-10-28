import React, { useState, useRef, useMemo } from 'react';
import {
  Package,
  Barcode,
  Sparkles,
  Boxes,
  Plus,
  Eye,
  EyeOff,
  Warehouse,
  CheckCircle2,
  Droplets,
  Trash2,
  ArrowLeftRight,
  FileSpreadsheet,
  ShieldAlert,
  ShieldX,
  History,
  Search,
  Filter,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Hash,
  FileText,
  Clock,
  Printer,
  ChevronDown,
  ChevronUp,
  Tag,
  Truck,
  Layers,
  Cpu,
  RefreshCw,
  Zap,
  Wind,
  X,
  Sliders,
  Save,
  FolderOpen,
} from 'lucide-react';
import { PurchaseInvoiceManager } from './PurchaseInvoiceManager';
import {
  CustomerContactRecord,
  InventoryItemRecord,
  WarehouseRecord,
  MasterOptionsRegistry,
  PromotionRuleRecord,
  PurchaseInvoiceRecord,
  SalesInvoiceRecord,
  WarehouseKey,
  StockLedgerEntryRecord,
  TheftFraudIncidentRecord,
  TheftFraudIncidentType,
  IncidentItemLine,
} from '../data/erpSeedData';
import {
  formatCurrency,
  formatPersianDate,
  smartFilterAndRankItems,
  calculateCostPerMl,
  detectCategorySector,
  SystemRole,
} from '../utils/erpEngine';
import {
  CreatableCombobox,
  PolarisButton,
  PolarisButtonGroup,
  PolarisCollapsible,
  PolarisSheet,
} from './CreatableCombobox';
import { CurrencyInput } from './CurrencyInput';
import {
  GoogleSheetsIntakeGrid,
  SkuBreakdownRow,
  createEmptyBreakdownRow,
} from './GoogleSheetsIntakeGrid';

export type InventoryWmsTab =
  | 'purchase_invoice'
  | 'sku_allocation'
  | 'stocktaking'
  | 'stock_ledger'
  | 'theft_fraud'
  | 'categories_sectors'
  | 'festivals_bundles';

export interface SkuIntakeDraftRecord {
  id: string;
  title: string;
  savedAt: string;
  selectedPurchaseLineKey: string;
  purchaseBillNo?: string;
  supplierName?: string;
  rows: SkuBreakdownRow[];
}

const SKU_INTAKE_DRAFTS_KEY = 'emkan.sku_intake.drafts.v1';

function loadSkuIntakeDrafts(): SkuIntakeDraftRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SKU_INTAKE_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface InventoryWmsModuleProps {
  productionMode: boolean;
  privacyMasked?: boolean;
  activeRole: SystemRole;
  initialTab?: InventoryWmsTab;
  items: InventoryItemRecord[];
  warehouses: WarehouseRecord[];
  onAddWarehouse: (wh: WarehouseRecord) => void;
  onUpdateWarehouse?: (wh: WarehouseRecord) => void;
  masterOptions: MasterOptionsRegistry;
  onAddMasterOption: (category: keyof MasterOptionsRegistry, newValue: string) => void;
  onDeleteMasterOption?: (category: keyof MasterOptionsRegistry, value: string) => void;
  categorySectors?: Record<string, 'vape' | 'pc'>;
  onSetCategorySector?: (category: string, sector: 'vape' | 'pc') => void;
  onDeleteCategory?: (category: string) => void;
  onSyncInventorySectors?: () => void;
  pendingBreakdownPurchases: PurchaseInvoiceRecord[];
  purchaseInvoices?: PurchaseInvoiceRecord[];
  onCreatePurchaseInvoice?: (pinv: PurchaseInvoiceRecord) => boolean;
  contacts?: CustomerContactRecord[];
  onQuickAddSupplier?: (supplierName: string, phone?: string) => void;
  onCompleteSkuBreakdown: (
    purchaseId: string | null,
    newOrUpdatedItems: InventoryItemRecord[],
    lineId?: string | null
  ) => void;
  promotionRules: PromotionRuleRecord[];
  onAddPromotionRule: (rule: PromotionRuleRecord) => void;
  onTogglePromotionRule: (id: string) => void;
  onCreateBundleItem: (bundle: InventoryItemRecord) => void;
  onTransferWarehouseStock?: (
    sku: string,
    fromWh: WarehouseKey,
    toWh: WarehouseKey,
    qty: number
  ) => void;
  stockLedgerEntries?: StockLedgerEntryRecord[];
  theftFraudIncidents?: TheftFraudIncidentRecord[];
  salesInvoices?: SalesInvoiceRecord[];
  onRecordTheftFraudIncident?: (
    incident: Omit<TheftFraudIncidentRecord, 'id' | 'incidentNo' | 'createdAt'>
  ) => void;
  onCalibrateConsumable?: (
    sku: string,
    recommendedRate: number,
    actualPhysicalStock: number
  ) => void;
  onShowToast: (msg: string) => void;
}

export const InventoryWmsModule: React.FC<InventoryWmsModuleProps> = ({
  productionMode = false,
  privacyMasked = false,
  initialTab = 'stocktaking',
  items,
  warehouses,
  salesInvoices = [],
  onAddWarehouse,
  onUpdateWarehouse,
  masterOptions,
  onAddMasterOption,
  onDeleteMasterOption,
  categorySectors,
  onSetCategorySector,
  onDeleteCategory,
  onSyncInventorySectors,
  pendingBreakdownPurchases,
  purchaseInvoices = [],
  onCreatePurchaseInvoice,
  contacts = [],
  onQuickAddSupplier,
  onCompleteSkuBreakdown,
  promotionRules,
  onAddPromotionRule,
  onTogglePromotionRule,
  onCreateBundleItem,
  onTransferWarehouseStock,
  stockLedgerEntries = [],
  theftFraudIncidents = [],
  onRecordTheftFraudIncident,
  onCalibrateConsumable,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<InventoryWmsTab>(initialTab);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Tab 1: Stocktaking & 5 Warehouses IndexTable State
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<'all' | 'vape' | 'pc'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductForPopup, setSelectedProductForPopup] = useState<InventoryItemRecord | null>(null);
  const [isDiscrepancyReportOpen, setIsDiscrepancyReportOpen] = useState(false);

  // Polaris Sheet: + Add Warehouse (Closed by default)
  const [isWarehouseSheetOpen, setIsWarehouseSheetOpen] = useState(false);
  const [isSavingWarehouse, setIsSavingWarehouse] = useState(false);
  const [newWhName, setNewWhName] = useState('');
  const [newWhLocation, setNewWhLocation] = useState('');
  const [newWhDesc, setNewWhDesc] = useState('');

  // Polaris Collapsible: Stock Transfer between 4 warehouses (Closed by default)
  const [isTransferCollapsibleOpen, setIsTransferCollapsibleOpen] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferSku, setTransferSku] = useState('');
  const [transferFromWh, setTransferFromWh] = useState<WarehouseKey | ''>('');
  const [transferToWh, setTransferToWh] = useState<WarehouseKey | ''>('');
  const [transferQty, setTransferQty] = useState(0);

  // Adaptive Cotton & Variable Consumable Calibration Engine
  const [isCottonCalibrationOpen, setIsCottonCalibrationOpen] = useState(false);
  const [calibConsumableSku, setCalibConsumableSku] = useState('');
  const [calibPhysicalCount, setCalibPhysicalCount] = useState<number | ''>('');
  const [isSubmittingCalibration, setIsSubmittingCalibration] = useState(false);

  const selectedCalibItem = useMemo(() => {
    if (calibConsumableSku) {
      return items.find((i) => i.sku === calibConsumableSku) || null;
    }
    return (
      items.find((i) => i.name.includes('پنبه') || i.category.includes('پنبه')) ||
      items[0] ||
      null
    );
  }, [items, calibConsumableSku]);

  const calibServiceStats = useMemo(() => {
    if (!selectedCalibItem) return { totalServices: 0, totalEstCost: 0 };
    let count = 0;
    let cost = 0;
    for (const inv of salesInvoices) {
      if (!inv.serviceLines) continue;
      for (const s of inv.serviceLines) {
        if (
          s.linkedConsumableSku === selectedCalibItem.sku ||
          (s.serviceTitle && s.serviceTitle.includes('پنبه'))
        ) {
          count++;
          cost += s.estimatedMaterialCost || s.consumableCost || 0;
        }
      }
    }
    return { totalServices: count, totalEstCost: cost };
  }, [salesInvoices, selectedCalibItem]);

  // Tab 2: Stage-2 SKU Allocation IndexTable & Line-by-Line Breakdown (30 empty rows by default)
  const [selectedPurchaseLineKey, setSelectedPurchaseLineKey] = useState<string>('');
  const [breakdownRows, setBreakdownRows] = useState<SkuBreakdownRow[]>(() =>
    Array.from({ length: 30 }, (_, idx) => createEmptyBreakdownRow(idx))
  );
  // Row-level Collapsible state for the 11 technical specs — null = ALL CLOSED by default, single row isolated
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [skuDiscrepancyModalData, setSkuDiscrepancyModalData] = useState<{
    parentTotalQty: number;
    skuTotalQty: number;
    diff: number;
    purchaseBillNo: string;
    parentItemName?: string;
  } | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseRecord | null>(null);
  const [isSubmittingBreakdown, setIsSubmittingBreakdown] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatSector, setNewCatSector] = useState<'vape' | 'pc'>('vape');
  const [newNicotine, setNewNicotine] = useState('');
  const [newLiquidVolume, setNewLiquidVolume] = useState('');
  const [newResistance, setNewResistance] = useState('');
  const [newPuff, setNewPuff] = useState('');
  const skuInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [recentlyCreatedPurchases, setRecentlyCreatedPurchases] = useState<PurchaseInvoiceRecord[]>([]);
  const [intakeDrafts, setIntakeDrafts] = useState<SkuIntakeDraftRecord[]>(loadSkuIntakeDrafts);
  const [activeIntakeDraftId, setActiveIntakeDraftId] = useState<string | null>(null);
  const [isIntakeDraftsModalOpen, setIsIntakeDraftsModalOpen] = useState(false);
  const [cleanIntakeSnapshot, setCleanIntakeSnapshot] = useState<string>('');
  const [isPurchaseInvoiceDirty, setIsPurchaseInvoiceDirty] = useState(false);
  const savePurchaseDraftRef = useRef<(() => boolean) | null>(null);
  const [pendingExitTargetTab, setPendingExitTargetTab] = useState<InventoryWmsTab | null>(null);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(SKU_INTAKE_DRAFTS_KEY, JSON.stringify(intakeDrafts));
    } catch {
      // ignore storage errors
    }
  }, [intakeDrafts]);

  const effectivePendingPurchases = useMemo(() => {
    const map = new Map<string, PurchaseInvoiceRecord>();
    for (const p of recentlyCreatedPurchases) {
      if (p.docstatus !== 2 && !p.skuBreakdownCompleted) map.set(p.id, p);
    }
    for (const p of pendingBreakdownPurchases) {
      if (p.docstatus !== 2 && !p.skuBreakdownCompleted) map.set(p.id, p);
    }
    for (const p of purchaseInvoices) {
      if (p.docstatus === 1 && !p.skuBreakdownCompleted) map.set(p.id, p);
    }
    return Array.from(map.values());
  }, [recentlyCreatedPurchases, pendingBreakdownPurchases, purchaseInvoices]);

  const [selectedPurchaseId, selectedLineId] = useMemo(() => {
    if (!selectedPurchaseLineKey) return ['', ''];
    const parts = selectedPurchaseLineKey.split(':::');
    return [parts[0] || '', parts[1] || ''];
  }, [selectedPurchaseLineKey]);

  const activePurchaseInvoice = useMemo(() => {
    return (
      effectivePendingPurchases.find((p) => p.id === selectedPurchaseId) ||
      purchaseInvoices.find((p) => p.id === selectedPurchaseId) ||
      null
    );
  }, [effectivePendingPurchases, purchaseInvoices, selectedPurchaseId]);

  const activePurchaseLine = useMemo(() => {
    if (!activePurchaseInvoice || !selectedLineId) return null;
    return activePurchaseInvoice.lines?.find((l) => l.id === selectedLineId) || null;
  }, [activePurchaseInvoice, selectedLineId]);

  const targetQty = useMemo(() => {
    if (activePurchaseLine) return activePurchaseLine.qty;
    if (activePurchaseInvoice?.lines && activePurchaseInvoice.lines.length > 0) {
      return activePurchaseInvoice.lines.reduce((s, l) => s + l.qty, 0);
    }
    return 0;
  }, [activePurchaseLine, activePurchaseInvoice]);

  const targetCost = useMemo(() => {
    if (activePurchaseLine) {
      return activePurchaseLine.valuationRate || activePurchaseLine.unitPrice || 0;
    }
    if (activePurchaseInvoice?.lines && activePurchaseInvoice.lines.length === 1) {
      return (
        activePurchaseInvoice.lines[0].valuationRate ||
        activePurchaseInvoice.lines[0].unitPrice ||
        0
      );
    }
    return 0;
  }, [activePurchaseLine, activePurchaseInvoice]);

  const parentItemName = useMemo(() => {
    if (activePurchaseLine) return activePurchaseLine.itemName;
    if (activePurchaseInvoice?.lines && activePurchaseInvoice.lines.length === 1) {
      return activePurchaseInvoice.lines[0].itemName;
    }
    return activePurchaseInvoice?.itemsSummary || '';
  }, [activePurchaseLine, activePurchaseInvoice]);

  const currentAllocatedQty = useMemo(() => {
    return breakdownRows
      .filter((r) => (r.sku.trim() || r.name.trim()) && r.qty > 0)
      .reduce((sum, r) => sum + r.qty, 0);
  }, [breakdownRows]);

  const knownVariants = useMemo(() => {
    if (!parentItemName) return [];
    const query = parentItemName.trim().toLowerCase();
    return items.filter((it) => {
      const itName = it.name.trim().toLowerCase();
      const itTag = (it.parentTag || '').trim().toLowerCase();
      return (
        (itName.includes(query) || itTag.includes(query) || query.includes(itName)) &&
        itName !== query
      );
    });
  }, [items, parentItemName]);

  const buildBreakdownRowFromInvoiceLine = (
    line: NonNullable<PurchaseInvoiceRecord['lines']>[number],
    idx: number,
    fallbackWh: WarehouseKey
  ): SkuBreakdownRow => {
    const cleanProductName = line.itemName.trim();
    const lineCost = line.valuationRate || line.unitPrice || 0;
    const lineCategory = line.itemType || '';
    const lineWh = (line.warehouseKey || fallbackWh || 'vitrine') as WarehouseKey;
    const catalogMatch = items.find(
      (it) =>
        it.name.trim().toLocaleLowerCase() === cleanProductName.toLocaleLowerCase() ||
        it.parentTag?.trim().toLocaleLowerCase() === cleanProductName.toLocaleLowerCase()
    );
    const existingStock = catalogMatch?.stockQty || 0;
    const existingVal = catalogMatch?.valuationRate || 0;
    const mwaCost =
      existingStock > 0 && existingVal > 0 && lineCost > 0
        ? Math.round((existingStock * existingVal + (line.qty || 1) * lineCost) / (existingStock + (line.qty || 1)))
        : lineCost || existingVal;

    const baseRow = createEmptyBreakdownRow(
      idx,
      lineCost,
      cleanProductName,
      lineWh,
      catalogMatch?.retailPrice || 0,
      catalogMatch?.resellerPrice || 0,
      catalogMatch?.brand || cleanProductName.split(' ')[0] || '',
      lineCategory || catalogMatch?.category || '',
      catalogMatch?.model || '',
      line.qty || 0,
      catalogMatch?.flavor || '',
      catalogMatch?.festivalPrice || 0,
      mwaCost
    );

    return {
      ...baseRow,
      sku: catalogMatch?.sku || '',
      condition: line.itemCondition || catalogMatch?.condition || 'آکبند',
      nicotine: catalogMatch?.nicotine || '',
      liquidVolumeMl: catalogMatch?.liquidVolumeMl ? String(catalogMatch.liquidVolumeMl) : '',
      resistanceOhm: catalogMatch?.resistanceOhm || '',
      puffCount: catalogMatch?.puffCount || '',
      color: catalogMatch?.color || '',
      batteryCapacityMah: catalogMatch?.batteryCapacityMah || 0,
    };
  };

  const handleSelectPurchaseLine = (key: string, directPinv?: PurchaseInvoiceRecord) => {
    setSelectedPurchaseLineKey(key);
    if (!key) {
      const emptyRows = Array.from({ length: 30 }, (_, idx) => createEmptyBreakdownRow(idx));
      setBreakdownRows(emptyRows);
      setCleanIntakeSnapshot('');
      return;
    }
    const parts = key.split(':::');
    const pId = parts[0];
    const lId = parts[1];
    const pInv =
      directPinv ||
      effectivePendingPurchases.find((p) => p.id === pId) ||
      purchaseInvoices.find((p) => p.id === pId);
    const pLine = pInv?.lines?.find((l) => l.id === lId);
    const targetWh = (pLine?.warehouseKey || pInv?.warehouseKey || 'vitrine') as WarehouseKey;
    if (pInv) {
      let nextRows: SkuBreakdownRow[];
      if (pLine) {
        const firstRow = buildBreakdownRowFromInvoiceLine(pLine, 0, targetWh);
        const lineCost = pLine.valuationRate || pLine.unitPrice || 0;
        nextRows = [
          firstRow,
          ...Array.from({ length: 29 }, (_, idx) =>
            createEmptyBreakdownRow(
              idx + 1,
              lineCost,
              pLine.itemName.trim(),
              targetWh,
              0,
              0,
              '',
              pLine.itemType || '',
              '',
              0,
              '',
              0,
              lineCost
            )
          ),
        ];
      } else {
        const invLines = (pInv.lines || []).filter((l) => !l.skuBreakdownCompleted);
        const populatedRows = invLines.map((line, idx) =>
          buildBreakdownRowFromInvoiceLine(line, idx, targetWh)
        );
        const singleLineCost =
          invLines.length === 1 ? invLines[0].valuationRate || invLines[0].unitPrice || 0 : 0;
        const singleLineName = invLines.length === 1 ? invLines[0].itemName.trim() : '';
        const remainingCount = Math.max(5, 30 - populatedRows.length);
        nextRows = [
          ...populatedRows,
          ...Array.from({ length: remainingCount }, (_, idx) =>
            createEmptyBreakdownRow(
              populatedRows.length + idx,
              singleLineCost,
              singleLineName,
              targetWh,
              0,
              0,
              '',
              invLines.length === 1 ? invLines[0].itemType || '' : '',
              '',
              0,
              '',
              0,
              singleLineCost
            )
          ),
        ];
      }
      setBreakdownRows(nextRows);
      setCleanIntakeSnapshot('');
      onShowToast(
        `فاکتور ${pInv.billNo} در کاربرگ پذیرش کالا بارگذاری شد (تگ کالا و قیمت خرید درج گردید).`
      );
    }
  };

  // Compute current intake dirty state
  const currentIntakeSnapshot = useMemo(() => {
    const activeRows = breakdownRows.filter(
      (r) =>
        r.sku.trim() !== '' ||
        r.name.trim() !== '' ||
        r.parentTag.trim() !== '' ||
        (Number(r.qty) || 0) > 0 ||
        (Number(r.retailPrice) || 0) > 0
    );
    if (!selectedPurchaseLineKey && activeRows.length === 0) return '';
    return JSON.stringify({
      k: selectedPurchaseLineKey,
      rows: activeRows.map((r) => ({
        s: r.sku.trim(),
        t: r.parentTag.trim(),
        n: r.name.trim(),
        q: r.qty,
        rp: r.retailPrice,
        up: r.unitPurchasePrice,
      })),
    });
  }, [breakdownRows, selectedPurchaseLineKey]);

  const isIntakeDirty = useMemo(() => {
    return currentIntakeSnapshot !== '' && currentIntakeSnapshot !== cleanIntakeSnapshot;
  }, [currentIntakeSnapshot, cleanIntakeSnapshot]);

  const handleSaveIntakeDraft = (): boolean => {
    const populatedRows = breakdownRows.filter(
      (r) =>
        r.sku.trim() !== '' ||
        r.name.trim() !== '' ||
        r.parentTag.trim() !== '' ||
        (Number(r.qty) || 0) > 0
    );
    if (!selectedPurchaseLineKey && populatedRows.length === 0) {
      onShowToast('کاربرگ پذیرش خالی است؛ حداقل یک فاکتور یا ردیف کالا وارد کنید.');
      return false;
    }

    const nowStr = `${formatPersianDate(new Date())} - ${new Date().toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    const billLabel = activePurchaseInvoice
      ? `${activePurchaseInvoice.billNo} (${activePurchaseInvoice.supplierName})`
      : 'پذیرش مستقیم بدون فاکتور';
    const title = `${billLabel} — ${populatedRows.length} ردیف`;

    const draftRecord: SkuIntakeDraftRecord = {
      id: activeIntakeDraftId || `intake-draft-${Date.now()}`,
      title,
      savedAt: nowStr,
      selectedPurchaseLineKey,
      purchaseBillNo: activePurchaseInvoice?.billNo,
      supplierName: activePurchaseInvoice?.supplierName,
      rows: breakdownRows,
    };

    setIntakeDrafts((prev) => {
      const exists = prev.some((d) => d.id === draftRecord.id);
      if (exists) return prev.map((d) => (d.id === draftRecord.id ? draftRecord : d));
      return [draftRecord, ...prev];
    });
    setActiveIntakeDraftId(draftRecord.id);
    setCleanIntakeSnapshot(currentIntakeSnapshot);
    onShowToast(`پیش‌نویس پذیرش کالا «${title}» ذخیره شد.`);
    return true;
  };

  const handleLoadIntakeDraft = (draft: SkuIntakeDraftRecord) => {
    setSelectedPurchaseLineKey(draft.selectedPurchaseLineKey || '');
    setBreakdownRows(
      draft.rows && draft.rows.length > 0
        ? draft.rows
        : Array.from({ length: 30 }, (_, idx) => createEmptyBreakdownRow(idx))
    );
    setActiveIntakeDraftId(draft.id);
    setIsIntakeDraftsModalOpen(false);
    onShowToast(`پیش‌نویس پذیرش «${draft.title}» بارگذاری شد.`);
  };

  const handleDeleteIntakeDraft = (draftId: string) => {
    setIntakeDrafts((prev) => prev.filter((d) => d.id !== draftId));
    if (activeIntakeDraftId === draftId) {
      setActiveIntakeDraftId(null);
    }
    onShowToast('پیش‌نویس پذیرش کالا حذف شد.');
  };

  const handleRequestTabChange = (nextTab: InventoryWmsTab) => {
    if (nextTab === activeTab) return;
    if (activeTab === 'purchase_invoice' && isPurchaseInvoiceDirty) {
      setPendingExitTargetTab(nextTab);
      return;
    }
    if (activeTab === 'sku_allocation' && isIntakeDirty) {
      setPendingExitTargetTab(nextTab);
      return;
    }
    setActiveTab(nextTab);
  };

  const handleLoadKnownVariants = () => {
    if (knownVariants.length === 0) return;
    const targetWh = (activePurchaseLine?.warehouseKey || 'vitrine') as WarehouseKey;
    const newRows: SkuBreakdownRow[] = knownVariants.map((v, idx) => ({
      rowId: `sku-row-${Date.now()}-${idx}`,
      sku: v.sku,
      name: v.name,
      brand: v.brand || (parentItemName.split(' ')[0] || ''),
      model: v.model || '',
      flavor: v.flavor || (v.parentTag ? v.name.replace(v.parentTag, '').replace(/^[—\s-]+/, '').trim() : ''),
      parentTag: v.parentTag || parentItemName,
      condition: v.condition || 'آکبند',
      itemType: v.category,
      sector: v.sector || 'vape',
      batteryCapacityMah: v.batteryCapacityMah || 0,
      qty: 0,
      targetWarehouse: (Object.keys(v.warehouseStock || {})[0] as WarehouseKey) || targetWh,
      expiryDate: '',
      nicotine: v.nicotine || '',
      puffCount: v.puffCount || '',
      color: v.color || '',
      resistanceOhm: v.resistanceOhm || '',
      liquidVolumeMl: v.liquidVolumeMl ? String(v.liquidVolumeMl) : '',
      podTankCapacityMl: v.podTankCapacityMl ? String(v.podTankCapacityMl) : '',
      allowDecantSale: v.allowDecantSale ?? false,
      unitPurchasePrice: targetCost || v.valuationRate,
      retailPrice: v.retailPrice,
      resellerPrice: v.resellerPrice ?? 0,
    }));
    setBreakdownRows(newRows);
    onShowToast(`${knownVariants.length} کالای شناخته‌شده در جدول درج شد.`);
  };

  // Tab 3: Festivals & Bundles (with Collapsible forms & loading lock)
  const [isPromoSheetOpen, setIsPromoSheetOpen] = useState(false);
  const [isBundleCollapsibleOpen, setIsBundleCollapsibleOpen] = useState(false);
  const [isSubmittingPromo, setIsSubmittingPromo] = useState(false);
  const [isSubmittingBundle, setIsSubmittingBundle] = useState(false);
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState<PromotionRuleRecord['festivalType'] | ''>('');
  const [promoDiscType, setPromoDiscType] = useState<'percent' | 'fixed'>('percent');
  const [promoDiscVal, setPromoDiscVal] = useState<number>(0);
  const [promoMinQty, setPromoMinQty] = useState<number>(0);
  const [promoTarget, setPromoTarget] = useState<PromotionRuleRecord['targetGroup'] | ''>('');
  const [promoStart, setPromoStart] = useState('');
  const [promoEnd, setPromoEnd] = useState('');
  const [promoPayModel, setPromoPayModel] = useState<'نقد' | 'نسیه' | 'همه' | ''>('');

  // Product Bundle Builder State
  const [bundleSku, setBundleSku] = useState('');
  const [bundleName, setBundleName] = useState('');
  const [bundlePrice, setBundlePrice] = useState<number>(0);
  const [bundleComp1Sku, setBundleComp1Sku] = useState('');
  const [bundleComp1Qty, setBundleComp1Qty] = useState(0);
  const [bundleComp2Sku, setBundleComp2Sku] = useState('');
  const [bundleComp2Qty, setBundleComp2Qty] = useState(0);

  // Tab: Stock Ledger / Cardex State
  const [cardexSkuFilter, setCardexSkuFilter] = useState<string>('all');
  const [cardexWhFilter, setCardexWhFilter] = useState<string>('all');
  const [cardexTypeFilter, setCardexTypeFilter] = useState<string>('all');
  const [cardexSearch, setCardexSearch] = useState<string>('');

  // Tab: Theft & Fraud Incidents State
  const [incidentType, setIncidentType] = useState<TheftFraudIncidentType | ''>('');
  const [incidentWarehouse, setIncidentWarehouse] = useState<WarehouseKey | ''>('');
  const [incidentDate, setIncidentDate] = useState<string>(() => formatPersianDate(new Date()));
  const [incidentTime, setIncidentTime] = useState<string>('');
  const [incidentTitle, setIncidentTitle] = useState<string>('');
  const [suspectInfo, setSuspectInfo] = useState<string>('');
  const [fakeSlipRef, setFakeSlipRef] = useState<string>('');
  const [policeReportNo, setPoliceReportNo] = useState<string>('');
  const [cctvRecordRef, setCctvRecordRef] = useState<string>('');
  const [incidentNotes, setIncidentNotes] = useState<string>('');
  const [incidentStatus, setIncidentStatus] = useState<TheftFraudIncidentRecord['status']>('ثبت قطعی');
  const [incidentItemPickerSku, setIncidentItemPickerSku] = useState<string>('');
  const [incidentItemPickerQty, setIncidentItemPickerQty] = useState<number>(0);
  const [selectedIncidentLines, setSelectedIncidentLines] = useState<
    Array<{
      sku: string;
      qty: number;
    }>
  >([]);
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);
  const [incidentFilterType, setIncidentFilterType] = useState<string>('all');
  const [incidentFilterStatus, setIncidentFilterStatus] = useState<string>('all');

  // Synthesized & Processed Cardex Ledger Rows
  const cardexRows = useMemo(() => {
    const allEntries: StockLedgerEntryRecord[] = [...stockLedgerEntries];

    // Seed baseline balance for items lacking ledger entries
    const loggedSkus = new Set(allEntries.map((e) => e.sku));
    for (const item of items) {
      if (!loggedSkus.has(item.sku) && item.stockQty > 0) {
        const whMap = item.warehouseStock || { central_external: item.stockQty };
        for (const [whKey, qty] of Object.entries(whMap)) {
          if (qty > 0) {
            allEntries.push({
              id: `sle-init-${item.sku}-${whKey}`,
              postingDate: '۱۴۰۴/۰۸/۰۱',
              sku: item.sku,
              itemName: item.name,
              warehouseKey: whKey as WarehouseKey,
              qtyChange: qty,
              balanceAfter: qty,
              valuationRate: item.valuationRate,
              voucherType: 'موجودی اولیه',
              voucherNo: 'OB-INIT',
              sector: item.sector,
            });
          }
        }
      }
    }

    allEntries.sort((a, b) => {
      const cmp = (a.postingDate || '').localeCompare(b.postingDate || '');
      if (cmp !== 0) return cmp;
      return (a.id || '').localeCompare(b.id || '');
    });

    const skuRunningMap = new Map<string, number>();
    const calculated = allEntries.map((entry) => {
      const cur = skuRunningMap.get(entry.sku) || 0;
      const nextBal = cur + entry.qtyChange;
      skuRunningMap.set(entry.sku, nextBal);

      const isInbound = entry.qtyChange > 0;
      const isOutbound = entry.qtyChange < 0;
      const qtyIn = isInbound ? entry.qtyChange : 0;
      const qtyOut = isOutbound ? Math.abs(entry.qtyChange) : 0;
      const rate = entry.valuationRate || 0;
      const totalIn = qtyIn * rate;
      const totalOut = qtyOut * rate;
      const closingVal = nextBal * rate;

      return {
        ...entry,
        runningBalance: nextBal,
        closingValue: closingVal,
        qtyIn,
        rateIn: isInbound ? rate : 0,
        totalIn,
        qtyOut,
        rateOut: isOutbound ? rate : 0,
        totalOut,
      };
    });

    return calculated.filter((r) => {
      if (cardexSkuFilter !== 'all' && r.sku !== cardexSkuFilter) return false;
      if (cardexWhFilter !== 'all' && r.warehouseKey !== cardexWhFilter) return false;
      if (cardexTypeFilter !== 'all' && r.voucherType !== cardexTypeFilter) return false;
      if (cardexSearch.trim()) {
        const q = cardexSearch.trim().toLowerCase();
        const matchSku = (r.sku || '').toLowerCase().includes(q);
        const matchName = (r.itemName || '').toLowerCase().includes(q);
        const matchVoucher = (r.voucherNo || '').toLowerCase().includes(q);
        if (!matchSku && !matchName && !matchVoucher) return false;
      }
      return true;
    });
  }, [stockLedgerEntries, items, cardexSkuFilter, cardexWhFilter, cardexTypeFilter, cardexSearch]);

  const cardexSummary = useMemo(() => {
    let totalInQty = 0;
    let totalInValue = 0;
    let totalOutQty = 0;
    let totalOutValue = 0;

    for (const r of cardexRows) {
      totalInQty += r.qtyIn;
      totalInValue += r.totalIn;
      totalOutQty += r.qtyOut;
      totalOutValue += r.totalOut;
    }

    const netQty = totalInQty - totalOutQty;
    const netValue = totalInValue - totalOutValue;
    const avgRate = totalInQty > 0 ? Math.round(totalInValue / totalInQty) : 0;

    return {
      totalInQty,
      totalInValue,
      totalOutQty,
      totalOutValue,
      netQty,
      netValue,
      avgRate,
      recordsCount: cardexRows.length,
    };
  }, [cardexRows]);

  const computedIncidentLines: IncidentItemLine[] = useMemo(() => {
    const itemMap = new Map(items.map((i) => [i.sku, i]));
    return selectedIncidentLines.map((line) => {
      const item = itemMap.get(line.sku);
      const unitCost = item?.valuationRate || 0;
      const unitRetailPrice = item?.retailPrice || 0;
      return {
        sku: line.sku,
        itemName: item?.name || line.sku,
        qty: line.qty,
        unitCost,
        unitRetailPrice,
        totalCost: line.qty * unitCost,
        totalRetailValue: line.qty * unitRetailPrice,
      };
    });
  }, [selectedIncidentLines, items]);

  const incidentTotals = useMemo(() => {
    const totalQty = computedIncidentLines.reduce((s, l) => s + l.qty, 0);
    const totalCost = computedIncidentLines.reduce((s, l) => s + l.totalCost, 0);
    const totalRetail = computedIncidentLines.reduce((s, l) => s + l.totalRetailValue, 0);
    return { totalQty, totalCost, totalRetail };
  }, [computedIncidentLines]);

  const filteredIncidents = useMemo(() => {
    return theftFraudIncidents.filter((inc) => {
      if (incidentFilterType !== 'all' && inc.incidentType !== incidentFilterType) return false;
      if (incidentFilterStatus !== 'all' && inc.status !== incidentFilterStatus) return false;
      return true;
    });
  }, [theftFraudIncidents, incidentFilterType, incidentFilterStatus]);

  const incidentSummaryKpis = useMemo(() => {
    const totalCost = theftFraudIncidents.reduce((s, i) => s + i.totalLossCost, 0);
    const totalRetail = theftFraudIncidents.reduce((s, i) => s + i.totalLossRetail, 0);
    const underPolice = theftFraudIncidents.filter((i) => i.status === 'تحت پیگیری قضایی').length;
    return {
      count: theftFraudIncidents.length,
      totalCost,
      totalRetail,
      underPolice,
    };
  }, [theftFraudIncidents]);

  const filteredStockItems = useMemo(() => {
    const bySearch = smartFilterAndRankItems(items, searchQuery);
    return bySearch.filter((item) => {
      const itemSector =
        item.sector || (item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
      if (selectedSectorFilter !== 'all' && itemSector !== selectedSectorFilter) {
        return false;
      }
      if (selectedWarehouseFilter !== 'all') {
        const whMap = item.warehouseStock || { central_external: item.stockQty };
        return (whMap[selectedWarehouseFilter] || 0) > 0;
      }
      return true;
    });
  }, [items, searchQuery, selectedSectorFilter, selectedWarehouseFilter]);

  const handleAddWarehouseSubmit = () => {
    if (!newWhName.trim() || isSavingWarehouse) return;
    setIsSavingWarehouse(true);
    const key = `wh_custom_${Date.now()}`;
    onAddWarehouse({
      id: `wh-${Date.now()}`,
      key,
      name: newWhName.trim(),
      accountCode: '1104',
      location: newWhLocation.trim() || 'فروشگاه مرکزی امکان',
      description: newWhDesc.trim() || 'انبار اختصاصی اضافه‌شده',
    });
    setNewWhName('');
    setNewWhLocation('');
    setNewWhDesc('');
    setIsSavingWarehouse(false);
    setIsWarehouseSheetOpen(false);
  };

  // Dedicated Enter key handler on SKU fields: jumps directly to the Qty field of the same row
  const handleSkuInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      qtyInputRefs.current[rowIndex]?.focus({ preventScroll: true });
    }
  };

  // Dedicated Enter key handler on QTY fields: jumps to next row's SKU field
  const handleQtyInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIndex + 1 < breakdownRows.length) {
        skuInputRefs.current[rowIndex + 1]?.focus({ preventScroll: true });
      } else {
        const nextIndex = breakdownRows.length;
        setBreakdownRows((prev) => [...prev, createEmptyBreakdownRow(nextIndex)]);
        window.setTimeout(() => {
          skuInputRefs.current[nextIndex]?.focus({ preventScroll: true });
        }, 30);
      }
    }
  };

  const updateBreakdownRow = <K extends keyof SkuBreakdownRow>(
    rowIndex: number,
    field: K,
    val: SkuBreakdownRow[K]
  ) => {
    setBreakdownRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== rowIndex) return r;
        const next = { ...r, [field]: val };

        // Auto-lookup when SKU / Barcode is scanned or entered
        if (field === 'sku') {
          const scanned = String(val).trim().toLowerCase();
          if (scanned) {
            const found = items.find((it) => it.sku.trim().toLowerCase() === scanned);
            if (found) {
              next.name = found.name;
              next.retailPrice = found.retailPrice || next.retailPrice;
              next.resellerPrice = found.resellerPrice || next.resellerPrice;
              next.parentTag = found.parentTag || next.parentTag || parentItemName;
              next.itemType = found.parentTag || found.category || next.itemType;
              next.sector = found.sector || detectCategorySector(next.parentTag, categorySectors);
              next.nicotine = found.nicotine || next.nicotine;
              next.puffCount = found.puffCount || next.puffCount;
              next.color = found.color || next.color;
              if (found.batteryCapacityMah) {
                next.batteryCapacityMah = found.batteryCapacityMah;
              }
              next.resistanceOhm = found.resistanceOhm || next.resistanceOhm;
              if (found.liquidVolumeMl) next.liquidVolumeMl = String(found.liquidVolumeMl);
              if (found.podTankCapacityMl) next.podTankCapacityMl = String(found.podTankCapacityMl);
              if (found.allowDecantSale !== undefined) next.allowDecantSale = found.allowDecantSale;
              if (targetCost > 0) next.unitPurchasePrice = targetCost;
            }
          }
        }

        if (field === 'parentTag') {
          const tagStr = String(val);
          const detSector = detectCategorySector(tagStr, categorySectors);
          next.parentTag = tagStr;
          next.itemType = tagStr;
          next.sector = detSector;
          if (tagStr.includes('جویس') || tagStr.includes('سالت')) {
            next.allowDecantSale = true;
          }
        }

        if (field === 'itemType') {
          const typeStr = String(val);
          if (typeStr.includes('کامپیوتر') || typeStr.includes('سخت‌افزار')) {
            next.sector = 'pc';
          } else {
            next.sector = 'vape';
          }
          if (typeStr.includes('جویس') || typeStr.includes('سالت')) {
            next.allowDecantSale = true;
          }
        }
        return next;
      })
    );
  };

  const toggleSpecRow = (rowId: string) => {
    setExpandedRowId((prev) => (prev === rowId ? null : rowId));
  };

  const executeCommitSkuBreakdown = (validRows: typeof breakdownRows) => {
    setIsSubmittingBreakdown(true);
    const parsedItems: InventoryItemRecord[] = validRows.map((r) => {
      const liquidVolNum = parseFloat(r.liquidVolumeMl.replace(/[^\d.]/g, '')) || 0;
      const podCapNum = parseFloat(r.podTankCapacityMl.replace(/[^\d.]/g, '')) || 0;
      const batteryCapacityMah = Number(r.batteryCapacityMah) || 0;
      const matchedInvoiceLine = (activePurchaseInvoice?.lines || []).find((l) => {
        const lName = (l.itemName || '').trim().toLocaleLowerCase();
        const rTag = (r.parentTag || '').trim().toLocaleLowerCase();
        const rName = (r.name || '').trim().toLocaleLowerCase();
        return (
          (rTag && (lName === rTag || lName.includes(rTag) || rTag.includes(lName))) ||
          (rName && (lName === rName || lName.includes(rName) || rName.includes(lName)))
        );
      });
      const invoiceLineCost =
        matchedInvoiceLine?.valuationRate || matchedInvoiceLine?.unitPrice || 0;
      const effectiveCost =
        r.unitPurchasePrice > 0
          ? r.unitPurchasePrice
          : invoiceLineCost > 0
          ? invoiceLineCost
          : targetCost;
      const costPerMl =
        liquidVolNum > 0 ? calculateCostPerMl(effectiveCost, liquidVolNum) : undefined;
      const retailRate = r.retailPrice || 0;
      const wholesaleRate = r.resellerPrice || 0;
      const festivalRate = r.festivalPrice || 0;

      const isPc =
        r.sector === 'pc' ||
        detectCategorySector(r.itemType || r.parentTag || parentItemName || '', categorySectors) === 'pc';
      const isJuiceOrSalt =
        (r.itemType || '').includes('جویس') ||
        (r.itemType || '').includes('سالت') ||
        (r.parentTag || '').includes('جویس') ||
        (r.parentTag || '').includes('سالت') ||
        (r.name || '').includes('جویس') ||
        (r.name || '').includes('سالت');
      const effectiveCategory = isPc
        ? 'قطعات کامپیوتر و سخت‌افزار'
        : (r.parentTag || r.itemType || '').includes('پاد')
          ? 'دستگاه پاد و ماد'
          : (r.parentTag || r.itemType || '').includes('کویل') || (r.parentTag || r.itemType || '').includes('کارتریج')
            ? 'کویل و کارتریج'
            : isJuiceOrSalt
              ? 'جویس و سالت'
              : (r.itemType?.trim() || 'سایر کالاها');

      const isCartridgeOrPod =
        (r.itemType || '').includes('کارتریج') ||
        (r.itemType || '').includes('کویل') ||
        (r.itemType || '').includes('پاد') ||
        (r.name || '').includes('کارتریج') ||
        (r.name || '').includes('پاد');

      const resolvedPodCap =
        podCapNum > 0
          ? podCapNum
          : isCartridgeOrPod && liquidVolNum > 0
            ? liquidVolNum
            : (!isJuiceOrSalt && liquidVolNum > 0 ? liquidVolNum : undefined);

      return {
        id: `itm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sku: r.sku.trim().toUpperCase(),
        name: r.name.trim() || (r.parentTag ? (r.flavor ? `${r.parentTag} — ${r.flavor}` : r.parentTag) : 'کالای بدون نام'),
        category: (r.itemType?.trim() || effectiveCategory) as InventoryItemRecord['category'],
        brand: r.brand?.trim() || r.parentTag || parentItemName || 'امکان',
        model: r.model?.trim() || undefined,
        sector: isPc ? 'pc' : 'vape',
        parentTag: r.parentTag || parentItemName,
        condition: (r.condition === 'استوک' ? 'استوک' : 'آکبند') as 'آکبند' | 'استوک',
        itemType: r.parentTag || parentItemName,
        flavor: r.flavor?.trim() || r.name.replace(r.parentTag || '', '').replace(/^[—\s-]+/, '').trim() || undefined,
        uomPrimary: 'عدد',
        stockQty: r.qty,
        reservedQty: 0,
        reorderLevel: 3,
        warehouseStock: {
          vitrine: r.targetWarehouse === 'vitrine' ? r.qty : 0,
          shop_storage: r.targetWarehouse === 'shop_storage' ? r.qty : 0,
          central_external: r.targetWarehouse === 'central_external' ? r.qty : 0,
          consignment: r.targetWarehouse === 'consignment' ? r.qty : 0,
          in_transit: r.targetWarehouse === 'in_transit' ? r.qty : 0,
          [r.targetWarehouse]: r.qty,
        },
        valuationRate: effectiveCost,
        retailPrice: retailRate,
        wholesalePrice: wholesaleRate,
        partnerPrice: wholesaleRate,
        resellerPrice: wholesaleRate,
        festivalPrice: festivalRate,
        serialNumbers: [],
        batchNo: 'B-1404',
        expiryDate: r.expiryDate,
        nicotine: r.nicotine || undefined,
        batteryCapacityMah: batteryCapacityMah > 0 ? batteryCapacityMah : undefined,
        puffCount: r.puffCount || undefined,
        color: r.color || undefined,
        resistanceOhm: r.resistanceOhm || undefined,
        liquidVolumeMl: liquidVolNum > 0 ? liquidVolNum : undefined,
        bottleVolumeMl: isJuiceOrSalt && liquidVolNum > 0 ? liquidVolNum : undefined,
        podTankCapacityMl: resolvedPodCap,
        allowDecantSale: isJuiceOrSalt ? true : Boolean(r.allowDecantSale),
        openBottleRemainingMl: 0,
        costPerMl,
        totalInQty: r.qty,
        totalOutQty: 0,
      };
    });

    window.setTimeout(() => {
      onCompleteSkuBreakdown(
        selectedPurchaseId || null,
        parsedItems,
        selectedLineId || null
      );
      if (selectedPurchaseId && !selectedLineId) {
        setRecentlyCreatedPurchases((prev) => prev.filter((p) => p.id !== selectedPurchaseId));
      }
      if (activeIntakeDraftId) {
        setIntakeDrafts((prev) => prev.filter((d) => d.id !== activeIntakeDraftId));
        setActiveIntakeDraftId(null);
      }
      setBreakdownRows(Array.from({ length: 30 }, (_, idx) => createEmptyBreakdownRow(idx)));
      setCleanIntakeSnapshot('');
      setIsSubmittingBreakdown(false);
      setSkuDiscrepancyModalData(null);
      setSelectedPurchaseLineKey('');
      onShowToast(
        `${validRows.length} ردیف کالا با موفقیت به انبار منتقل شد.`
      );
    }, 200);
  };

  const handleCommitSkuBreakdown = () => {
    if (isSubmittingBreakdown) return;
    const validRows = breakdownRows.filter((r) => r.sku.trim() && r.name.trim() && r.qty > 0);
    if (validRows.length === 0) {
      onShowToast('حداقل یک ردیف شامل کد کالا، نام و تعداد وارد کنید.');
      return;
    }

    if (activePurchaseInvoice) {
      const parentTotalQty = targetQty;
      const skuTotalQty = validRows.reduce((s, r) => s + r.qty, 0);

      if (parentTotalQty > 0 && skuTotalQty !== parentTotalQty) {
        setSkuDiscrepancyModalData({
          parentTotalQty,
          skuTotalQty,
          diff: Math.abs(skuTotalQty - parentTotalQty),
          purchaseBillNo: activePurchaseInvoice.billNo,
          parentItemName,
        });
        return;
      }
    }

    executeCommitSkuBreakdown(validRows);
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Tabs and Secondary Actions */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Navigation Tabs */}
        <div className="inline-flex flex-wrap items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 gap-1">
          <button
            type="button"
            onClick={() => handleRequestTabChange('purchase_invoice')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'purchase_invoice'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>ثبت فاکتور خرید بار</span>
          </button>
          <button
            type="button"
            onClick={() => handleRequestTabChange('stocktaking')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'stocktaking'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>موجودی و ۵ انبار ({items.length} قلم)</span>
          </button>
          <button
            type="button"
            onClick={() => handleRequestTabChange('stock_ledger')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'stock_ledger'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>کاردکس کالا (ورود و خروج)</span>
          </button>
          <button
            type="button"
            onClick={() => handleRequestTabChange('theft_fraud')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'theft_fraud'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            <span>خسارت سرقت و فیش جعلی ({theftFraudIncidents.length})</span>
          </button>
          <button
            type="button"
            onClick={() => handleRequestTabChange('sku_allocation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sku_allocation'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Barcode className="w-3.5 h-3.5" />
            <span>پذیرش و برچسب‌گذاری SKU ({effectivePendingPurchases.length})</span>
          </button>
          <button
            type="button"
            onClick={() => handleRequestTabChange('categories_sectors')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'categories_sectors'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-amber-500" />
            <span>دسته‌بندی‌ها و اصناف ({masterOptions.tags?.length || 0})</span>
          </button>
          <button
            type="button"
            onClick={() => handleRequestTabChange('festivals_bundles')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'festivals_bundles'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>کمپین تخفیف و باندل کالا</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <PolarisButton
            size="slim"
            icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
            onClick={() => setIsTransferCollapsibleOpen((prev) => !prev)}
          >
            {isTransferCollapsibleOpen ? 'بستن انتقال انبار' : '+ انتقال بین انبارها'}
          </PolarisButton>
          <PolarisButton
            size="slim"
            icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
            onClick={() => setIsCottonCalibrationOpen((prev) => !prev)}
          >
            {isCottonCalibrationOpen ? 'بستن کالیبراسیون نام مادر' : 'کالیبراسیون نام مادر'}
          </PolarisButton>
          <PolarisButton
            size="slim"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setIsWarehouseSheetOpen(true)}
          >
            انبار جدید
          </PolarisButton>
        </div>
      </div>

      {/* =====================================================================
          TAB 0: PURCHASE INVOICE (TRANSFERRED FROM POS)
         ===================================================================== */}
      {activeTab === 'purchase_invoice' && (
        <PurchaseInvoiceManager
          productionMode={productionMode}
          privacyMasked={false}
          contacts={contacts}
          inventoryItems={items}
          warehouses={warehouses}
          masterOptions={masterOptions}
          categorySectors={categorySectors || {}}
          purchaseInvoices={purchaseInvoices.length > 0 ? purchaseInvoices : effectivePendingPurchases}
          onSetCategorySector={onSetCategorySector || (() => {})}
          onAddMasterOption={onAddMasterOption}
          onQuickAddSupplier={onQuickAddSupplier}
          onCreatePurchaseInvoice={onCreatePurchaseInvoice}
          onShowToast={onShowToast}
          onDirtyChange={setIsPurchaseInvoiceDirty}
          saveDraftRef={savePurchaseDraftRef}
          onTransitionToIntake={(pinv) => {
            setIsPurchaseInvoiceDirty(false);
            setRecentlyCreatedPurchases((prev) => [pinv, ...prev.filter((p) => p.id !== pinv.id)]);
            setActiveTab('sku_allocation');
            handleSelectPurchaseLine(pinv.id, pinv);
          }}
        />
      )}

      {/* =====================================================================
          TAB 1: 4 WAREHOUSES INDEXTABLE & STOCKTAKING INDEXTABLE
         ===================================================================== */}
      {activeTab === 'stocktaking' && (
        <div className="space-y-4">
          {/* Polaris Collapsible: Adaptive Cotton & Variable Consumable Calibration Engine */}
          <PolarisCollapsible
            id="wms-cotton-calibration-collapsible"
            open={isCottonCalibrationOpen}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>موتور هوشمند کالیبراسیون ملزومات و کالای نام مادر (Adaptive Standard Costing)</span>
              </span>
              <span className="text-[11px] text-slate-500">
                انطباق شمارش فیزیکی با بهای تمام‌شده کالای مادر و اصلاح نرخ پیش‌فرض خدمات بعدی
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end text-xs">
              <div className="sm:col-span-4">
                <CreatableCombobox
                  label="انتخاب کالای ملزومات / نام مادر (مانند پنبه، سیم یا قطعه مادر):"
                  value={
                    selectedCalibItem
                      ? `${selectedCalibItem.sku} — ${selectedCalibItem.name}`
                      : calibConsumableSku
                  }
                  onChange={(val) => {
                    const sku = val.split(' — ')[0].trim();
                    setCalibConsumableSku(sku);
                  }}
                  options={items.map((i) => `${i.sku} — ${i.name} (موجودی: ${i.stockQty})`)}
                  placeholder="انتخاب کالای ملزومات..."
                  allowCreate={false}
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">
                  شمارش فیزیکی واقعی قفسه (تعداد ورق مانده)
                </label>
                <input
                  type="number"
                  min={0}
                  value={calibPhysicalCount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setCalibPhysicalCount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))
                  }
                  placeholder={selectedCalibItem ? String(selectedCalibItem.stockQty) : '۰'}
                  className="w-full px-2.5 py-1.5 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums text-center text-xs"
                />
              </div>

              <div className="sm:col-span-5">
                <PolarisButton
                  primary
                  fullWidth
                  size="slim"
                  loading={isSubmittingCalibration}
                  disabled={
                    isSubmittingCalibration ||
                    !selectedCalibItem ||
                    calibPhysicalCount === '' ||
                    Number(calibPhysicalCount) > selectedCalibItem.stockQty
                  }
                  onClick={() => {
                    if (!selectedCalibItem || calibPhysicalCount === '') return;
                    setIsSubmittingCalibration(true);
                    const currentStock = selectedCalibItem.stockQty;
                    const physCount = Number(calibPhysicalCount);
                    const consumedSheets = Math.max(0, currentStock - physCount);
                    const realConsumedCost = consumedSheets * (selectedCalibItem.valuationRate || 50000);
                    const svcCount = calibServiceStats.totalServices;
                    const newRecommendedRate =
                      svcCount > 0 ? Math.round(realConsumedCost / svcCount) : 15000;

                    window.setTimeout(() => {
                      onCalibrateConsumable?.(selectedCalibItem.sku, newRecommendedRate, physCount);
                      setIsSubmittingCalibration(false);
                      setIsCottonCalibrationOpen(false);
                      setCalibPhysicalCount('');
                      onShowToast(
                        `کالیبراسیون انجام شد؛ موجودی «${selectedCalibItem.name}» به ${physCount} ورق اصلاح شد و ضریب مصرف آینده به ${formatCurrency(newRecommendedRate)} تومان کالیبره شد.`
                      );
                    }, 150);
                  }}
                >
                  ثبت انطباق موجودی و کالیبراسیون نرخ
                </PolarisButton>
              </div>
            </div>

            {/* Live Variance & Calibration Analytics */}
            {selectedCalibItem && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 block">موجودی سیستمی انبار</span>
                  <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {selectedCalibItem.stockQty} {selectedCalibItem.uomPrimary} ({formatCurrency(selectedCalibItem.valuationRate)} ت/ورق)
                  </strong>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 block">خدمات انجام‌شده ثبت‌شده</span>
                  <strong className="font-mono tabular-nums text-indigo-700 dark:text-indigo-300">
                    {calibServiceStats.totalServices} خدمت فنی
                  </strong>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 block">هزینه تخمینی ثبت‌شده قبلی</span>
                  <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {formatCurrency(calibServiceStats.totalEstCost)} تومان
                  </strong>
                </div>

                {calibPhysicalCount !== '' && (
                  <>
                    <div className="bg-amber-50/70 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800/50">
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 block">مصرف واقعی شمارش‌شده</span>
                      <strong className="font-mono tabular-nums text-amber-800 dark:text-amber-300">
                        {Math.max(0, selectedCalibItem.stockQty - Number(calibPhysicalCount))} ورق (ارزش: {formatCurrency(Math.max(0, selectedCalibItem.stockQty - Number(calibPhysicalCount)) * selectedCalibItem.valuationRate)} ت)
                      </strong>
                    </div>

                    <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block">نرخ کالیبره‌شده هر خدمت</span>
                      <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300 font-bold">
                        {formatCurrency(
                          calibServiceStats.totalServices > 0
                            ? Math.round(
                                (Math.max(0, selectedCalibItem.stockQty - Number(calibPhysicalCount)) * selectedCalibItem.valuationRate) /
                                  calibServiceStats.totalServices
                              )
                            : 15000
                        )} تومان
                      </strong>
                    </div>
                  </>
                )}
              </div>
            )}
          </PolarisCollapsible>
          {/* Polaris Collapsible: Stock Transfer Between 4 Warehouses (Closed by default) */}
          <PolarisCollapsible
            id="wms-transfer-collapsible"
            open={isTransferCollapsibleOpen}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
              <div className="sm:col-span-4">
                <CreatableCombobox
                  label="کالای مورد انتقال (فقط موجودی انبار):"
                  value={
                    transferSku
                      ? (() => {
                          const itm = items.find((i) => i.sku === transferSku);
                          return itm ? `${itm.sku} — ${itm.name}` : transferSku;
                        })()
                      : ''
                  }
                  onChange={(val) => {
                    if (!val) {
                      setTransferSku('');
                      return;
                    }
                    const sku = val.split(' — ')[0].trim();
                    const found = items.find((i) => i.sku === sku || i.name === val);
                    setTransferSku(found ? found.sku : '');
                  }}
                  options={items.map((i) => `${i.sku} — ${i.name} (کل: ${i.stockQty})`)}
                  placeholder="انتخاب کالا برای انتقال..."
                  allowCreate={false}
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  از انبار مبدا:
                </label>
                <select
                  value={transferFromWh}
                  onChange={(e) => setTransferFromWh(e.target.value as WarehouseKey)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="">انتخاب انبار مبدأ...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  به انبار مقصد:
                </label>
                <select
                  value={transferToWh}
                  onChange={(e) => setTransferToWh(e.target.value as WarehouseKey)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="">انتخاب انبار مقصد...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  تعداد:
                </label>
                <input
                  type="number"
                  min={1}
                  value={transferQty}
                  onChange={(e) => setTransferQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-2 py-1.5 font-mono text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="sm:col-span-1">
                <PolarisButton
                  primary
                  fullWidth
                  size="slim"
                  loading={isSubmittingTransfer}
                  disabled={isSubmittingTransfer}
                  onClick={() => {
                    if (!transferSku) {
                      onShowToast('ابتدا کالا را انتخاب کنید.');
                      return;
                    }
                    if (transferFromWh === transferToWh) {
                      onShowToast('انبار مبدا و مقصد نمی‌توانند یکسان باشند.');
                      return;
                    }
                    setIsSubmittingTransfer(true);
                    window.setTimeout(() => {
                      onTransferWarehouseStock?.(
                        transferSku,
                        transferFromWh,
                        transferToWh,
                        transferQty
                      );
                      setIsSubmittingTransfer(false);
                      setIsTransferCollapsibleOpen(false);
                    }, 120);
                  }}
                >
                  انتقال
                </PolarisButton>
              </div>
            </div>
          </PolarisCollapsible>

          {/* Compact Polaris IndexTable: 4 Warehouses Summary */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-indigo-600" />
                <span>جدول فشرده ۵ انبار سیستم شامل انبار کالای در راه (کلیک روی ردیف = فیلتر موجودی همان انبار)</span>
              </span>
              {selectedWarehouseFilter !== 'all' && (
                <PolarisButton
                  size="slim"
                  plain
                  onClick={() => setSelectedWarehouseFilter('all')}
                >
                  نمایش همه انبارها
                </PolarisButton>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">کد حساب</th>
                    <th className="py-2 px-3">نام انبار</th>
                    <th className="py-2 px-3">موقعیت / کاربری</th>
                    <th className="py-2 px-3">تعداد موجودی (عدد)</th>
                    <th className="py-2 px-3 text-left">ارزش موجودی (تومان)</th>
                    <th className="py-2 px-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {warehouses.map((wh) => {
                    const whQty = items.reduce((sum, item) => {
                      const whMap = item.warehouseStock || { central_external: item.stockQty };
                      return sum + (whMap[wh.key] || 0);
                    }, 0);
                    const whValue = items.reduce((sum, item) => {
                      const whMap = item.warehouseStock || { central_external: item.stockQty };
                      return sum + (whMap[wh.key] || 0) * item.valuationRate;
                    }, 0);
                    const isSelected = selectedWarehouseFilter === wh.key;

                    return (
                      <tr
                        key={wh.id}
                        className={
                          isSelected
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/30 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="py-2 px-3 font-mono tabular-nums">{wh.accountCode}</td>
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                          {wh.name}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{wh.description}</td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums">
                          {whQty} عدد
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-left tabular-nums">
                          {!privacyMasked
                            ? `${formatCurrency(whValue)} تومان`
                            : '****'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <PolarisButtonGroup>
                            <PolarisButton
                              size="slim"
                              primary={isSelected}
                              onClick={() =>
                                setSelectedWarehouseFilter(isSelected ? 'all' : wh.key)
                              }
                            >
                              {isSelected ? 'فیلتر فعال' : 'فیلتر'}
                            </PolarisButton>
                            <PolarisButton
                              size="slim"
                              onClick={() => setEditingWarehouse({ ...wh })}
                            >
                              ویرایش
                            </PolarisButton>
                          </PolarisButtonGroup>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Main Stocktaking Polaris IndexTable */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجوی نام کالا، طعم، کد کالا یا نیکوتین..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <PolarisButtonGroup segmented>
                {[
                  { id: 'all' as const, label: 'همه اصناف' },
                  { id: 'vape' as const, label: 'ویپ‌شاپ (میانگین موزون)' },
                  { id: 'pc' as const, label: 'سیستم و قطعات (فایفو)' },
                ].map((sec) => (
                  <PolarisButton
                    key={sec.id}
                    size="slim"
                    primary={selectedSectorFilter === sec.id}
                    onClick={() => setSelectedSectorFilter(sec.id)}
                  >
                    {sec.label}
                  </PolarisButton>
                ))}
              </PolarisButtonGroup>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[480px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 z-10">
                  <tr>
                    <th className="py-2 px-3">کد کالا</th>
                    <th className="py-2 px-3">نام کالا و مشخصات فنی</th>
                    <th className="py-2 px-3">وضعیت</th>
                    <th className="py-2 px-3">موجودی به تفکیک ۵ انبار</th>
                    <th className="py-2 px-3">تاریخ BB</th>
                    <th className="py-2 px-3 text-left">بهای تمام‌شده</th>
                    <th className="py-2 px-3 text-center">ورود</th>
                    <th className="py-2 px-3 text-center">خروج</th>
                    <th className="py-2 px-3 text-center">مشاهده</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredStockItems.map((item) => {
                    const whMap = item.warehouseStock || { central_external: item.stockQty };
                    const inQty = item.totalInQty ?? item.stockQty;
                    const outQty = item.totalOutQty ?? 0;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedProductForPopup(item)}
                        className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                        title="جهت مشاهده پاپ‌آپ کامل مشخصات کالا کلیک کنید"
                      >
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 transition-colors flex items-center gap-1.5 flex-wrap">
                            <span>{item.name}</span>
                            {stockLedgerEntries.some(
                              (e) =>
                                e.sku === item.sku &&
                                (e.voucherType === 'Sales Return' ||
                                  (e.voucherType as string) === 'مرجوعی فروش')
                            ) && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                مرجوعی
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {item.brand ? `${item.brand} · ` : ''}
                            {item.model ? `مدل: ${item.model} · ` : ''}
                            {item.category}
                            {item.nicotine ? ` · ${item.nicotine}` : ''}
                            {item.liquidVolumeMl ? ` · ${item.liquidVolumeMl}ml` : ''}
                            {item.resistanceOhm ? ` · ${item.resistanceOhm}` : ''}
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {item.condition || 'آکبند'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          <span className="font-bold text-slate-900 dark:text-slate-100 ml-2">
                            کل: {item.stockQty}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            ({warehouses.map((w) => `${w.name}: ${whMap[w.key] || 0}`).join(' · ')})
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                          {item.expiryDate || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-left font-bold whitespace-nowrap">
                          {!privacyMasked
                            ? `${formatCurrency(item.valuationRate)} ت`
                            : '****'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-center text-emerald-700 font-semibold">
                          {inQty}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-center text-rose-600 font-semibold">
                          {outQty}
                        </td>
                        <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedProductForPopup(item)}
                            className="p-1 px-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] inline-flex items-center gap-1 transition-colors border border-indigo-200 dark:border-indigo-800"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            <span>مشاهده</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB: STOCK LEDGER / CARDEX (کاردکس جامع گردش و مانده کالا)
         ===================================================================== */}
      {activeTab === 'stock_ledger' && (
        <div className="space-y-4">
          {/* Cardex Header & KPI Summary */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  <span>کاردکس حسابداری انبار و گردش اقلام کالا (Stock Ledger)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ردیابی دقیق و خط‌به‌خط تاریخ، تعداد و نرخ ورود / تاریخ، تعداد و نرخ خروج / و مانده لحظه‌ای موجودی
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-slate-500">
                  {cardexSummary.recordsCount} ردیف گردش ثبت‌شده
                </span>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ کاردکس</span>
                </button>
              </div>
            </div>

            {/* 4 Cardex Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  کل گردش ورودی به انبار
                </div>
                <div className="font-mono text-lg font-bold text-emerald-900 dark:text-emerald-200">
                  {privacyMasked ? '****' : `${formatCurrency(cardexSummary.totalInValue)} ت`}
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                  {cardexSummary.totalInQty} عدد ورود ثبت‌شده
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-1">
                <div className="text-xs font-bold text-rose-700 dark:text-rose-400">
                  کل گردش خروجی از انبار
                </div>
                <div className="font-mono text-lg font-bold text-rose-900 dark:text-rose-200">
                  {privacyMasked ? '****' : `${formatCurrency(cardexSummary.totalOutValue)} ت`}
                </div>
                <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                  {cardexSummary.totalOutQty} عدد خروج ثبت‌شده
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 space-y-1">
                <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
                  مانده خالص موجودی (تعداد و ارزش)
                </div>
                <div className="font-mono text-lg font-bold text-indigo-900 dark:text-indigo-200">
                  {privacyMasked ? '****' : `${formatCurrency(cardexSummary.netValue)} ت`}
                </div>
                <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono">
                  مانده فیزیکی: {cardexSummary.netQty} عدد
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  میانگین موزون نرخ ورود
                </div>
                <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-200">
                  {privacyMasked ? '****' : `${formatCurrency(cardexSummary.avgRate)} ت`}
                </div>
                <div className="text-[11px] text-slate-500">
                  مبنای قیمت تمام‌شده میانگین
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  فیلتر بر اساس کالا:
                </label>
                <select
                  value={cardexSkuFilter}
                  onChange={(e) => setCardexSkuFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="all">همه کالاها ({items.length} قلم)</option>
                  {items.map((i) => (
                    <option key={i.sku} value={i.sku}>
                      {i.name} ({i.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  فیلتر بر اساس انبار:
                </label>
                <select
                  value={cardexWhFilter}
                  onChange={(e) => setCardexWhFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="all">همه انبارها ({warehouses.length} انبار)</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  نوع سند تراکنش:
                </label>
                <select
                  value={cardexTypeFilter}
                  onChange={(e) => setCardexTypeFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="all">همه اسناد و رویدادها</option>
                  <option value="POS Invoice">فاکتور فروش (POS)</option>
                  <option value="Purchase Receipt">رسید و خرید انبار</option>
                  <option value="Stock Transfer">حواله انتقال بین انبار</option>
                  <option value="Sales Return">مرجوعی فروش</option>
                  <option value="خسارت سرقت و فیش جعلی">خسارت سرقت و فیش جعلی</option>
                  <option value="موجودی اولیه">موجودی اولیه</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  جستجو در شماره سند یا نام کالا:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={cardexSearch}
                    onChange={(e) => setCardexSearch(e.target.value)}
                    placeholder="جستجو..."
                    className="w-full pr-8 pl-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Cardex Comprehensive Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700 font-bold">
                  <tr>
                    <th rowSpan={2} className="py-2.5 px-3 border-l border-slate-200 dark:border-slate-700 text-center">
                      #
                    </th>
                    <th rowSpan={2} className="py-2.5 px-3 border-l border-slate-200 dark:border-slate-700">
                      تاریخ
                    </th>
                    <th rowSpan={2} className="py-2.5 px-3 border-l border-slate-200 dark:border-slate-700">
                      نوع و شماره سند
                    </th>
                    <th rowSpan={2} className="py-2.5 px-3 border-l border-slate-200 dark:border-slate-700">
                      نام کالا و SKU
                    </th>
                    <th rowSpan={2} className="py-2.5 px-3 border-l border-slate-200 dark:border-slate-700">
                      انبار
                    </th>
                    <th colSpan={3} className="py-1.5 px-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-center border-l border-b border-emerald-200 dark:border-emerald-800">
                      وارده (ورود به انبار)
                    </th>
                    <th colSpan={3} className="py-1.5 px-3 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-center border-l border-b border-rose-200 dark:border-rose-800">
                      صادره (خروج از انبار)
                    </th>
                    <th colSpan={2} className="py-1.5 px-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 text-center border-b border-indigo-200 dark:border-indigo-800">
                      مانده انتهای عملیات
                    </th>
                  </tr>
                  <tr>
                    {/* Inbound sub-headers */}
                    <th className="py-1.5 px-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-center border-l border-slate-200 dark:border-slate-700 font-semibold">
                      تعداد
                    </th>
                    <th className="py-1.5 px-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-left border-l border-slate-200 dark:border-slate-700 font-semibold">
                      نرخ ورود (ت)
                    </th>
                    <th className="py-1.5 px-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-left border-l border-slate-200 dark:border-slate-700 font-semibold">
                      مبلغ کل ورود (ت)
                    </th>
                    {/* Outbound sub-headers */}
                    <th className="py-1.5 px-2.5 bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-center border-l border-slate-200 dark:border-slate-700 font-semibold">
                      تعداد
                    </th>
                    <th className="py-1.5 px-2.5 bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-left border-l border-slate-200 dark:border-slate-700 font-semibold">
                      نرخ خروج (ت)
                    </th>
                    <th className="py-1.5 px-2.5 bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-left border-l border-slate-200 dark:border-slate-700 font-semibold">
                      مبلغ کل خروج (ت)
                    </th>
                    {/* Balance sub-headers */}
                    <th className="py-1.5 px-2.5 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 text-center border-l border-slate-200 dark:border-slate-700 font-semibold">
                      تعداد مانده
                    </th>
                    <th className="py-1.5 px-2.5 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 text-left font-semibold">
                      ارزش مانده (ت)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {cardexRows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400 font-sans">
                        گردش کاردکسی با فیلترهای جاری یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    cardexRows.map((row, idx) => {
                      const whRecord = warehouses.find((w) => w.key === row.warehouseKey);
                      const isLoss = row.voucherType === 'خسارت سرقت و فیش جعلی';
                      return (
                        <tr
                          key={row.id || `sle-${idx}`}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                            isLoss ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center text-slate-400 text-[11px] border-l border-slate-100 dark:border-slate-800">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300 text-[11px] border-l border-slate-100 dark:border-slate-800 whitespace-nowrap">
                            {row.postingDate}
                          </td>
                          <td className="py-2 px-3 border-l border-slate-100 dark:border-slate-800 font-sans">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-[11px]">
                                {row.voucherNo}
                              </span>
                              <span
                                className={`text-[10px] inline-block px-1.5 py-0.2 rounded w-fit ${
                                  row.voucherType === 'POS Invoice'
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    : row.voucherType === 'Purchase Receipt'
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                    : row.voucherType === 'Stock Transfer'
                                    ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                                    : row.voucherType === 'Sales Return'
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                    : isLoss
                                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                                }`}
                              >
                                {row.voucherType === 'Sales Return' ? 'مرجوعی' : row.voucherType}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 border-l border-slate-100 dark:border-slate-800 font-sans">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {row.itemName}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {row.sku}
                            </div>
                          </td>
                          <td className="py-2 px-3 border-l border-slate-100 dark:border-slate-800 font-sans text-[11px]">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {whRecord?.name || row.warehouseKey}
                            </span>
                          </td>

                          {/* INBOUND (ورود) */}
                          <td className="py-2 px-2.5 text-center text-emerald-700 dark:text-emerald-400 font-bold border-l border-slate-100 dark:border-slate-800">
                            {row.qtyIn > 0 ? row.qtyIn : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-left text-slate-600 dark:text-slate-400 border-l border-slate-100 dark:border-slate-800">
                            {row.qtyIn > 0 ? (privacyMasked ? '****' : formatCurrency(row.rateIn)) : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-left text-emerald-800 dark:text-emerald-300 font-bold border-l border-slate-100 dark:border-slate-800">
                            {row.qtyIn > 0 ? (privacyMasked ? '****' : formatCurrency(row.totalIn)) : '—'}
                          </td>

                          {/* OUTBOUND (خروج) */}
                          <td className="py-2 px-2.5 text-center text-rose-600 dark:text-rose-400 font-bold border-l border-slate-100 dark:border-slate-800">
                            {row.qtyOut > 0 ? row.qtyOut : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-left text-slate-600 dark:text-slate-400 border-l border-slate-100 dark:border-slate-800">
                            {row.qtyOut > 0 ? (privacyMasked ? '****' : formatCurrency(row.rateOut)) : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-left text-rose-800 dark:text-rose-300 font-bold border-l border-slate-100 dark:border-slate-800">
                            {row.qtyOut > 0 ? (privacyMasked ? '****' : formatCurrency(row.totalOut)) : '—'}
                          </td>

                          {/* BALANCE (مانده) */}
                          <td className="py-2 px-2.5 text-center text-indigo-700 dark:text-indigo-400 font-bold border-l border-slate-100 dark:border-slate-800">
                            {row.runningBalance}
                          </td>
                          <td className="py-2 px-2.5 text-left text-indigo-900 dark:text-indigo-200 font-bold">
                            {privacyMasked ? '****' : formatCurrency(row.closingValue)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB: THEFT, FAKE RECEIPT FRAUD & LOSS INCIDENTS
         ===================================================================== */}
      {activeTab === 'theft_fraud' && (
        <div className="space-y-4">
          {/* Header & KPI Summary */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>ثبت با مهندسی اصولی خسارت سرقت، فیش جعلی و کلاهبرداری</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  صدور خودکار سند حسابداری دوبل زیان دفتر کل (بدهکار ۵۲۰۵ / بستانکار ۱۱۰۴xx)، کسر سیستمی از انبار و ثبت شواهد قضایی
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 text-xs font-semibold">
                  استاندارد دوبل حسابداری: بدهکار زیان عملیاتی / بستانکار موجودی انبار
                </span>
              </div>
            </div>

            {/* 4 Loss KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-1">
                <div className="text-xs font-bold text-rose-700 dark:text-rose-400">
                  زیان دفتری انبار (بهای تمام‌شده)
                </div>
                <div className="font-mono text-lg font-bold text-rose-900 dark:text-rose-200">
                  {privacyMasked ? '****' : `${formatCurrency(incidentSummaryKpis.totalCost)} ت`}
                </div>
                <div className="text-[11px] text-rose-600 dark:text-rose-400">
                  ثبت‌شده در حساب ۵۲۰۵ زیان
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-1">
                <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  ارزش بالقوه فروش از دست‌رفته
                </div>
                <div className="font-mono text-lg font-bold text-amber-900 dark:text-amber-200">
                  {privacyMasked ? '****' : `${formatCurrency(incidentSummaryKpis.totalRetail)} ت`}
                </div>
                <div className="text-[11px] text-amber-600 dark:text-amber-400">
                  مبنای دادخواست و مطالبه قضایی
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  تعداد کل پرونده‌ها
                </div>
                <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-200">
                  {incidentSummaryKpis.count} مورد
                </div>
                <div className="text-[11px] text-slate-500">
                  ثبت‌شده در دیتابیس پایدار
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 space-y-1">
                <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
                  تحت پیگیری قضایی / انتظامی
                </div>
                <div className="font-mono text-lg font-bold text-indigo-900 dark:text-indigo-200">
                  {incidentSummaryKpis.underPolice} پرونده
                </div>
                <div className="text-[11px] text-indigo-600 dark:text-indigo-400">
                  دارای شماره پرونده پلیس
                </div>
              </div>
            </div>
          </div>

          {/* New Incident Registration Form */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span>فرم ثبت پرونده جدید خسارت / سرقت / رسید فیک</span>
              </h4>
              <span className="text-[11px] text-slate-500">
                با ثبت این فرم، سند روزنامه دوبل صادر شده و کاردکس کالا کسر می‌گردد
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۱. نوع واقعه / نحوه از دست رفتن جنس:
                </label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value as TheftFraudIncidentType)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold"
                >
                  <option value="">انتخاب نوع واقعه...</option>
                  <option value="fake_payment_slip">فیش واریزی جعلی / رسید فیک بانکی</option>
                  <option value="physical_theft">سرقت فیزیکی از مغازه یا ویترین (کش‌روی)</option>
                  <option value="fraud_scam">کلاهبرداری و متواری شدن خریدار</option>
                  <option value="untraceable_deficit">کسری غیرقابل توجیه در انبارگردانی</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۲. انبار مبدا آسیب‌دیده (محل کسر موجودی):
                </label>
                <select
                  value={incidentWarehouse}
                  onChange={(e) => setIncidentWarehouse(e.target.value as WarehouseKey)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="">انتخاب انبار مبدأ...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name} ({w.accountCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۳. تاریخ و ساعت وقوع واقعه:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    placeholder="۱۴۰۴/۰۸/۱۵"
                    className="w-full px-2.5 py-1.5 font-mono text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="text"
                    value={incidentTime}
                    onChange={(e) => setIncidentTime(e.target.value)}
                    placeholder="16:30"
                    className="w-full px-2.5 py-1.5 font-mono text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                ۴. عنوان و شرح خلاصه واقعه:
              </label>
              <input
                type="text"
                value={incidentTitle}
                onChange={(e) => setIncidentTitle(e.target.value)}
                placeholder="مثال: ارائه اسکرین‌شات ساختگی پایا برای دریافت ۲ عدد دستگاه پاد ماد و ۳ سالت نیکوتین"
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            {/* Item Selector Section */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>۵. اقلام و اجناس از دست‌رفته:</span>
                <span className="text-[11px] text-slate-500">
                  انتخاب کالا و تعداد برده‌شده از انبار
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-8">
                  <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                    انتخاب کالا:
                  </label>
                  <select
                    value={incidentItemPickerSku}
                    onChange={(e) => setIncidentItemPickerSku(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">انتخاب کالای آسیب‌دیده...</option>
                    {items.map((i) => (
                      <option key={i.sku} value={i.sku}>
                        {i.name} — موجودی کل: {i.stockQty} عدد — بهای تمام‌شده: {formatCurrency(i.valuationRate)} ت
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                    تعداد:
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={incidentItemPickerQty}
                    onChange={(e) => setIncidentItemPickerQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-2 py-1.5 font-mono text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <PolarisButton
                    primary
                    size="slim"
                    fullWidth
                    icon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => {
                      if (!incidentItemPickerSku) {
                        onShowToast('ابتدا کالا را انتخاب کنید.');
                        return;
                      }
                      setSelectedIncidentLines((prev) => {
                        const existing = prev.find((l) => l.sku === incidentItemPickerSku);
                        if (existing) {
                          return prev.map((l) =>
                            l.sku === incidentItemPickerSku
                              ? { ...l, qty: l.qty + incidentItemPickerQty }
                              : l
                          );
                        }
                        return [...prev, { sku: incidentItemPickerSku, qty: incidentItemPickerQty }];
                      });
                      setIncidentItemPickerSku('');
                      setIncidentItemPickerQty(1);
                    }}
                  >
                    افزودن قلم
                  </PolarisButton>
                </div>
              </div>

              {/* Stolen Items Table */}
              {computedIncidentLines.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mt-2">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="py-2 px-3">ردیف</th>
                        <th className="py-2 px-3">نام کالا</th>
                        <th className="py-2 px-3">کد SKU</th>
                        <th className="py-2 px-3 text-center">تعداد</th>
                        <th className="py-2 px-3 text-left">بهای تمام‌شده واحد</th>
                        <th className="py-2 px-3 text-left">زیان تمام‌شده کل (ت)</th>
                        <th className="py-2 px-3 text-left">قیمت فروش کل (ت)</th>
                        <th className="py-2 px-3 text-center">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {computedIncidentLines.map((line, idx) => (
                        <tr key={line.sku} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-1.5 px-3 text-center text-slate-400">{idx + 1}</td>
                          <td className="py-1.5 px-3 font-sans font-semibold text-slate-800 dark:text-slate-200">
                            {line.itemName}
                          </td>
                          <td className="py-1.5 px-3 text-slate-500">{line.sku}</td>
                          <td className="py-1.5 px-3 text-center font-bold text-rose-600">
                            {line.qty} عدد
                          </td>
                          <td className="py-1.5 px-3 text-left text-slate-600 dark:text-slate-400">
                            {formatCurrency(line.unitCost)}
                          </td>
                          <td className="py-1.5 px-3 text-left font-bold text-rose-700 dark:text-rose-400">
                            {formatCurrency(line.totalCost)}
                          </td>
                          <td className="py-1.5 px-3 text-left text-amber-700 dark:text-amber-400">
                            {formatCurrency(line.totalRetailValue)}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedIncidentLines((prev) =>
                                  prev.filter((l) => l.sku !== line.sku)
                                )
                              }
                              className="text-rose-500 hover:text-rose-700 p-1"
                              title="حذف ردیف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100/70 dark:bg-slate-800 font-bold font-mono">
                        <td colSpan={3} className="py-2 px-3 font-sans text-left">
                          جمع کل اقلام پرونده:
                        </td>
                        <td className="py-2 px-3 text-center text-rose-700 dark:text-rose-300">
                          {incidentTotals.totalQty} عدد
                        </td>
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 text-left text-rose-700 dark:text-rose-300">
                          {formatCurrency(incidentTotals.totalCost)} ت
                        </td>
                        <td className="py-2 px-3 text-left text-amber-700 dark:text-amber-300">
                          {formatCurrency(incidentTotals.totalRetail)} ت
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Legal / Evidence Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۶. مشخصات کلاهبردار / سارق / شماره تماس:
                </label>
                <input
                  type="text"
                  value={suspectInfo}
                  onChange={(e) => setSuspectInfo(e.target.value)}
                  placeholder="نام، شماره تماس، آیدی..."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۷. شماره پیگیری یا رسید جعلی ارائه‌شده:
                </label>
                <input
                  type="text"
                  value={fakeSlipRef}
                  onChange={(e) => setFakeSlipRef(e.target.value)}
                  placeholder="شماره ارجاع، رسید فیک ساتنا/پایا..."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۸. شماره پرونده کلانتری / دادسرا:
                </label>
                <input
                  type="text"
                  value={policeReportNo}
                  onChange={(e) => setPoliceReportNo(e.target.value)}
                  placeholder="شماره پرونده انتظامی..."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۹. وضعیت حقوقی پرونده:
                </label>
                <select
                  value={incidentStatus}
                  onChange={(e) =>
                    setIncidentStatus(e.target.value as TheftFraudIncidentRecord['status'])
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold"
                >
                  <option value="ثبت قطعی">ثبت قطعی و کسر از انبار</option>
                  <option value="تحت پیگیری قضایی">تحت پیگیری قضایی و پلیس</option>
                  <option value="خسارت جبران‌شده">خسارت جبران‌شده / وصول‌شده</option>
                  <option value="بایگانی‌شده">بایگانی‌شده</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۱۰. ارجاع به دوربین مداربسته (تایم‌استمپ / فایل دوربین):
                </label>
                <input
                  type="text"
                  value={cctvRecordRef}
                  onChange={(e) => setCctvRecordRef(e.target.value)}
                  placeholder="مثال: CAM-02-1404-08-15-1632.mp4"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۱۱. توضیحات تکمیلی پرونده:
                </label>
                <input
                  type="text"
                  value={incidentNotes}
                  onChange={(e) => setIncidentNotes(e.target.value)}
                  placeholder="توضیحات بیشتر برای بازرسی و ممیزی..."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">
                با تایید نهایی، سند زیان به مبلغ{' '}
                <span className="font-bold text-rose-600 font-mono">
                  {formatCurrency(incidentTotals.totalCost)} تومان
                </span>{' '}
                صادر و از انبار کسر خواهد شد.
              </div>

              <div className="flex items-center gap-2">
                <PolarisButton
                  size="slim"
                  disabled={isSubmittingIncident}
                  onClick={() => {
                    setSelectedIncidentLines([]);
                    setIncidentTitle('');
                    setSuspectInfo('');
                    setFakeSlipRef('');
                    setPoliceReportNo('');
                    setCctvRecordRef('');
                    setIncidentNotes('');
                  }}
                >
                  انصراف و پاکسازی فرم
                </PolarisButton>

                <PolarisButton
                  primary
                  size="slim"
                  loading={isSubmittingIncident}
                  disabled={isSubmittingIncident || computedIncidentLines.length === 0}
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  onClick={() => {
                    if (computedIncidentLines.length === 0) {
                      onShowToast('حداقل یک قلم کالا به فهرست اضافه کنید.');
                      return;
                    }

                    setIsSubmittingIncident(true);

                    const typeLabels: Record<TheftFraudIncidentType, string> = {
                      fake_payment_slip: 'فیش جعلی بانکی',
                      physical_theft: 'سرقت فیزیکی از انبار',
                      fraud_scam: 'کلاهبرداری متواری',
                      untraceable_deficit: 'کسری انبارگردانی',
                    };

                    const whRecord = warehouses.find((w) => w.key === incidentWarehouse);

                    if (!incidentType) {
                      onShowToast?.('لطفاً نوع حادثه / سرقت را مشخص کنید.');
                      return;
                    }
                    const validIncidentType = incidentType as TheftFraudIncidentType;

                    window.setTimeout(() => {
                      onRecordTheftFraudIncident?.({
                        incidentDate: incidentDate.trim() || formatPersianDate(new Date()),
                        incidentTime: incidentTime.trim() || '12:00',
                        incidentType: validIncidentType,
                        incidentTypeLabel: typeLabels[validIncidentType] || 'سرقت و کلاهبرداری',
                        warehouseKey: incidentWarehouse,
                        warehouseName: whRecord?.name || 'انبار مغازه',
                        title: incidentTitle.trim() || `${typeLabels[validIncidentType]} (${computedIncidentLines.length} قلم)`,
                        items: computedIncidentLines,
                        totalQuantity: incidentTotals.totalQty,
                        totalLossCost: incidentTotals.totalCost,
                        totalLossRetail: incidentTotals.totalRetail,
                        suspectInfo: suspectInfo.trim() || undefined,
                        policeReportNo: policeReportNo.trim() || undefined,
                        fakePaymentSlipRef: fakeSlipRef.trim() || undefined,
                        cctvRecordRef: cctvRecordRef.trim() || undefined,
                        notes: incidentNotes.trim() || undefined,
                        status: incidentStatus,
                      });

                      setSelectedIncidentLines([]);
                      setIncidentTitle('');
                      setSuspectInfo('');
                      setFakeSlipRef('');
                      setPoliceReportNo('');
                      setCctvRecordRef('');
                      setIncidentNotes('');
                      setIsSubmittingIncident(false);
                    }, 120);
                  }}
                >
                  ثبت قطعی خسارت، صدور سند دوبل و کسر از انبار
                </PolarisButton>
              </div>
            </div>
          </div>

          {/* Historical Log Table of Registered Incidents */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-600" />
                <span>سوابق پرونده‌های خسارت، سرقت و فیش‌های جعلی ({theftFraudIncidents.length} پرونده)</span>
              </h4>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={incidentFilterType}
                  onChange={(e) => setIncidentFilterType(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="all">همه انواع واقعه</option>
                  <option value="fake_payment_slip">فیش جعلی بانکی</option>
                  <option value="physical_theft">سرقت فیزیکی</option>
                  <option value="fraud_scam">کلاهبرداری متواری</option>
                  <option value="untraceable_deficit">کسری انبارگردانی</option>
                </select>

                <select
                  value={incidentFilterStatus}
                  onChange={(e) => setIncidentFilterStatus(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="all">همه وضعیت‌ها</option>
                  <option value="ثبت قطعی">ثبت قطعی</option>
                  <option value="تحت پیگیری قضایی">تحت پیگیری قضایی</option>
                  <option value="خسارت جبران‌شده">خسارت جبران‌شده</option>
                  <option value="بایگانی‌شده">بایگانی‌شده</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-bold">
                  <tr>
                    <th className="py-2 px-3">شماره پرونده</th>
                    <th className="py-2 px-3">تاریخ و ساعت</th>
                    <th className="py-2 px-3">نوع واقعه</th>
                    <th className="py-2 px-3">انبار مبدا</th>
                    <th className="py-2 px-3">شرح و اقلام سرقت‌شده</th>
                    <th className="py-2 px-3 text-center">تعداد اقلام</th>
                    <th className="py-2 px-3 text-left">زیان تمام‌شده (سند ۵۲۰۵)</th>
                    <th className="py-2 px-3 text-left">ارزش فروش (ت)</th>
                    <th className="py-2 px-3">مستندات (پلیس / فیش فیک)</th>
                    <th className="py-2 px-3 text-center">وضعیت پرونده</th>
                    <th className="py-2 px-3 text-center">سند دوبل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {filteredIncidents.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400 font-sans">
                        هیچ پرونده خسارت یا سرقتی با فیلترهای انتخابی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    filteredIncidents.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {inc.incidentNo}
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {inc.incidentDate} {inc.incidentTime ? `· ${inc.incidentTime}` : ''}
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              inc.incidentType === 'fake_payment_slip'
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                : inc.incidentType === 'physical_theft'
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                : 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300'
                            }`}
                          >
                            {inc.incidentTypeLabel}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-700 dark:text-slate-300">
                          {inc.warehouseName}
                        </td>
                        <td className="py-2 px-3 font-sans max-w-xs">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {inc.title}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {inc.items.map((i) => `${i.itemName} (${i.qty})`).join('، ')}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-rose-600">
                          {inc.totalQuantity} عدد
                        </td>
                        <td className="py-2 px-3 text-left font-bold text-rose-700 dark:text-rose-400">
                          {privacyMasked ? '****' : formatCurrency(inc.totalLossCost)} ت
                        </td>
                        <td className="py-2 px-3 text-left text-amber-700 dark:text-amber-400">
                          {privacyMasked ? '****' : formatCurrency(inc.totalLossRetail)} ت
                        </td>
                        <td className="py-2 px-3 font-sans text-[11px] text-slate-600 dark:text-slate-400">
                          {inc.fakePaymentSlipRef && (
                            <div>فیش: <span className="font-mono">{inc.fakePaymentSlipRef}</span></div>
                          )}
                          {inc.policeReportNo && (
                            <div>پلیس: <span className="font-mono">{inc.policeReportNo}</span></div>
                          )}
                          {inc.suspectInfo && <div>فرد: {inc.suspectInfo}</div>}
                          {!inc.fakePaymentSlipRef && !inc.policeReportNo && !inc.suspectInfo && '—'}
                        </td>
                        <td className="py-2 px-3 text-center font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              inc.status === 'ثبت قطعی'
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                : inc.status === 'تحت پیگیری قضایی'
                                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300'
                                : inc.status === 'خسارت جبران‌شده'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
                            }`}
                          >
                            {inc.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {inc.glVoucherNo || '—'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: STAGE-2 SKU ACCEPTANCE & LABELING (Google Sheets Intake Grid)
         ===================================================================== */}
      {activeTab === 'sku_allocation' && (
        <div className="space-y-4">
          {/* Purchase Invoice / Line Selector Bar & Drafts Controls */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>انتخاب فاکتور یا سطر خرید برای پذیرش کالا</span>
                {effectivePendingPurchases.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                    {effectivePendingPurchases.length} فاکتور در انتظار پذیرش
                  </span>
                )}
                {activeIntakeDraftId && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300">
                    پیش‌نویس پذیرش فعال
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                فاکتور یا سطر مورد نظر را انتخاب کرده و یا از پیش‌نویس‌های ذخیره‌شده پذیرش کالا استفاده نمایید.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs flex-wrap">
              <PolarisButton
                size="slim"
                icon={<Save className="w-3.5 h-3.5 text-amber-600" />}
                onClick={handleSaveIntakeDraft}
              >
                ذخیره پیش‌نویس پذیرش
              </PolarisButton>
              <PolarisButton
                size="slim"
                icon={<FolderOpen className="w-3.5 h-3.5 text-indigo-600" />}
                onClick={() => setIsIntakeDraftsModalOpen(true)}
              >
                پیش‌نویس‌های پذیرش ({intakeDrafts.length})
              </PolarisButton>
              <select
                value={selectedPurchaseLineKey}
                onChange={(e) => handleSelectPurchaseLine(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-medium text-xs focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">ثبت مستقیم کالا (بدون فاکتور خرید)</option>
                {effectivePendingPurchases.map((p) => {
                  const uncompletedLines = (p.lines || []).filter((l) => !l.skuBreakdownCompleted);
                  if (uncompletedLines.length === 0) {
                    return (
                      <option key={p.id} value={p.id}>
                        فاکتور {p.billNo} — {p.itemsSummary} ({formatCurrency(p.totalAmount)} ت)
                      </option>
                    );
                  }
                  return (
                    <optgroup key={p.id} label={`فاکتور خرید ${p.billNo} (${p.supplierName})`}>
                      <option key={p.id} value={p.id}>
                        📋 تطبیق یکپارچه کل فاکتور ({uncompletedLines.reduce((s, l) => s + l.qty, 0)} عدد)
                      </option>
                      {uncompletedLines.map((line, idx) => (
                        <option key={`${p.id}:::${line.id}`} value={`${p.id}:::${line.id}`}>
                          سطر {idx + 1}: {line.itemName} ({line.qty} عدد) — فی: {formatCurrency(line.valuationRate || line.unitPrice)} ت
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Purchase Invoice Multi-Line Target Bar & Discrepancy Reconciliation */}
          {activePurchaseInvoice && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-indigo-700 dark:text-indigo-400">
                    🎯 اقلام فاکتور خرید مرجع: {activePurchaseInvoice.billNo} ({activePurchaseInvoice.supplierName})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    (مجموع هدف فاکتور: {targetQty} عدد | ثبت‌شده در جدول: {currentAllocatedQty} عدد)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PolarisButton
                    size="slim"
                    icon={<FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />}
                    onClick={() => setIsDiscrepancyReportOpen(true)}
                  >
                    📊 گزارش دقیق مغایرت پذیرش
                  </PolarisButton>
                  <PolarisButton
                    size="slim"
                    icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                    onClick={() => handleSelectPurchaseLine(activePurchaseInvoice.id)}
                  >
                    ⚡ درج خودکار تمام اقلام فاکتور در جدول
                  </PolarisButton>
                </div>
              </div>

              {/* Real-time Checklist of Invoice Lines with Discrepancy Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
                {(activePurchaseInvoice.lines || []).map((line, lIdx) => {
                  const matchedRows = breakdownRows.filter((r) => {
                    if ((!r.sku.trim() && !r.name.trim()) || (r.qty || 0) <= 0) return false;
                    const rName = (r.name || '').toLowerCase();
                    const rTag = (r.parentTag || '').toLowerCase();
                    const lName = (line.itemName || '').toLowerCase();
                    return rName.includes(lName) || rTag.includes(lName) || lName.includes(rTag) || lName.includes(rName);
                  });
                  const sumQty = matchedRows.reduce((acc, r) => acc + (r.qty || 0), 0);
                  const diff = sumQty - line.qty;
                  const isPerfect = diff === 0 && sumQty > 0;
                  const isShortage = diff < 0 && sumQty > 0;
                  const isSurplus = diff > 0;

                  return (
                    <div
                      key={line.id || lIdx}
                      className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all ${
                        isPerfect
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                          : isShortage
                            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                            : isSurplus
                              ? 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={line.itemName}>
                          {line.itemName}
                        </span>
                        <span className="font-mono font-bold text-[11px] shrink-0">
                          هدف: {line.qty}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 mb-1.5">
                        فی خرید: {formatCurrency(line.valuationRate || line.unitPrice)} تومان
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                        <span className="font-mono">
                          وارد شده: <strong className="text-slate-900 dark:text-slate-100">{sumQty}</strong>
                        </span>
                        {isPerfect && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-bold text-[10px]">
                            ✅ منطبق
                          </span>
                        )}
                        {isShortage && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-bold text-[10px]">
                            ⚠️ {Math.abs(diff)} کسری
                          </span>
                        )}
                        {isSurplus && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-bold text-[10px]">
                            ⚠️ +{diff} مازاد
                          </span>
                        )}
                        {sumQty === 0 && (
                          <span className="text-slate-400 text-[10px]">هنوز در جدول نیست</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Google Sheets Intake Grid */}
          <GoogleSheetsIntakeGrid
            rows={breakdownRows}
            onChangeRows={setBreakdownRows}
            activePurchaseInvoice={activePurchaseInvoice}
            activePurchaseLine={activePurchaseLine}
            parentItemName={parentItemName}
            targetCost={targetCost}
            targetQty={targetQty}
            currentAllocatedQty={currentAllocatedQty}
            knownVariants={knownVariants}
            warehouses={warehouses}
            masterOptions={masterOptions}
            onLoadKnownVariants={handleLoadKnownVariants}
            onCommit={handleCommitSkuBreakdown}
            isSubmitting={isSubmittingBreakdown}
            onShowToast={onShowToast}
            catalogItems={items}
          />
        </div>
      )}

      {/* =====================================================================
          TAB: CATEGORIES & SECTORS MANAGEMENT
         ===================================================================== */}
      {activeTab === 'categories_sectors' && (
        <div className="space-y-4">
          {/* Header & Guidance Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <Tag className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    مدیریت دسته‌بندی‌ها و تعیین صنف (ویپ‌شاپ / قطعات کامپیوتر)
                    <span className="text-[11px] font-normal text-slate-400">
                      ({masterOptions.tags?.length || 0} دسته‌بندی فعال)
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    با انتخاب هر دسته‌بندی، صنف کالا و الگوریتم ارزیابی بهای تمام‌شده (میانگین موزون برای ویپ‌شاپ / FIFO برای قطعات کامپیوتر) به طور کاملاً اتوماتیک تنظیم می‌شود.
                  </p>
                </div>
              </div>

              {onSyncInventorySectors && (
                <PolarisButton
                  size="slim"
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={onSyncInventorySectors}
                >
                  🔄 همگام‌سازی صنف کلیه کالاهای انبار
                </PolarisButton>
              )}
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 font-medium">کل دسته‌بندی‌ها</div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {masterOptions.tags?.length || 0}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <span>💨 صنف ویپ‌شاپ (MWA)</span>
                </div>
                <div className="text-lg font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {(masterOptions.tags || []).filter((t) => detectCategorySector(t, categorySectors) === 'vape').length}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-sky-200 dark:border-sky-800/60 bg-sky-50/40 dark:bg-sky-950/20">
                <div className="text-[11px] text-sky-700 dark:text-sky-400 font-medium flex items-center gap-1">
                  <span>💻 قطعات کامپیوتر (FIFO)</span>
                </div>
                <div className="text-lg font-bold text-sky-800 dark:text-sky-300 mt-0.5">
                  {(masterOptions.tags || []).filter((t) => detectCategorySector(t, categorySectors) === 'pc').length}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20">
                <div className="text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">تفکیک اقلام انبار</div>
                <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200 mt-1">
                  {items.filter((i) => (i.sector || detectCategorySector(i.parentTag || i.category, categorySectors)) === 'vape').length} ویپ · {items.filter((i) => (i.sector || detectCategorySector(i.parentTag || i.category, categorySectors)) === 'pc').length} PC
                </div>
              </div>
            </div>
          </div>

          {/* Quick Add New Category Card */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              تعریف دسته‌بندی جدید
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  نام دسته‌بندی *
                </label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCatName(val);
                    // Smart auto-detect sector while typing
                    setNewCatSector(detectCategorySector(val, categorySectors));
                  }}
                  placeholder="مثلاً: قطعات کامپیوتر، سالت نیکوتین، لوازم جانبی..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  صنف و روش محاسبه بهای تمام‌شده *
                </label>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setNewCatSector('vape')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      newCatSector === 'vape'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    💨 ویپ‌شاپ (MWA)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatSector('pc')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      newCatSector === 'pc'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    💻 کامپیوتر (FIFO)
                  </button>
                </div>
              </div>

              <div className="md:col-span-3">
                <PolarisButton
                  primary
                  size="slim"
                  disabled={!newCatName.trim()}
                  onClick={() => {
                    const trimmed = newCatName.trim();
                    if (!trimmed) return;
                    onAddMasterOption('tags', trimmed);
                    onSetCategorySector?.(trimmed, newCatSector);
                    setNewCatName('');
                    onShowToast(`دسته‌بندی «${trimmed}» با صنف ${newCatSector === 'pc' ? 'قطعات کامپیوتر' : 'ویپ‌شاپ'} افزوده شد.`);
                  }}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  + ذخیره دسته‌بندی
                </PolarisButton>
              </div>
            </div>
          </div>

          {/* Categories Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                فهرست دسته‌بندی‌های تعریف‌شده و تغییر صنف
              </h4>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  placeholder="جستجوی دسته‌بندی..."
                  className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr className="h-[36px]">
                    <th className="py-2 px-3 font-semibold whitespace-nowrap">ردیف</th>
                    <th className="py-2 px-3 font-semibold whitespace-nowrap min-w-[160px]">نام دسته‌بندی</th>
                    <th className="py-2 px-3 font-semibold whitespace-nowrap min-w-[200px]">صنف فعال (کلیک برای تغییر)</th>
                    <th className="py-2 px-3 font-semibold whitespace-nowrap min-w-[150px]">روش ارزیابی بهای تمام‌شده</th>
                    <th className="py-2 px-3 font-semibold whitespace-nowrap text-center">اقلام مرتبط در انبار</th>
                    <th className="py-2 px-3 font-semibold whitespace-nowrap text-center w-16">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(masterOptions.tags || [])
                    .filter((cat) => !categorySearchQuery.trim() || cat.toLowerCase().includes(categorySearchQuery.trim().toLowerCase()))
                    .map((cat, idx) => {
                      const currentSector = detectCategorySector(cat, categorySectors);
                      const relatedItemsCount = items.filter(
                        (i) => (i.parentTag || i.category || '').toLowerCase() === cat.toLowerCase()
                      ).length;

                      return (
                        <tr key={cat} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                            {cat}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={() => {
                                  onSetCategorySector?.(cat, 'vape');
                                  onShowToast(`صنف دسته‌بندی «${cat}» به ویپ‌شاپ تغییر یافت.`);
                                }}
                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                  currentSector === 'vape'
                                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                              >
                                💨 ویپ‌شاپ
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onSetCategorySector?.(cat, 'pc');
                                  onShowToast(`صنف دسته‌بندی «${cat}» به قطعات کامپیوتر تغییر یافت.`);
                                }}
                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                  currentSector === 'pc'
                                    ? 'bg-sky-600 text-white shadow-xs font-bold'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                              >
                                💻 قطعات کامپیوتر
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {currentSector === 'pc' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                لایه به لایه (FIFO اختصاصی)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                میانگین متحرک موزون (MWA)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {relatedItemsCount} قلم
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`آیا از حذف دسته‌بندی «${cat}» اطمینان دارید؟`)) {
                                  onDeleteCategory?.(cat);
                                }
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="حذف دسته‌بندی"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* =====================================================================
              MASTER SPECIFICATIONS MANAGEMENT (NICOTINE, VOLUME, RESISTANCE, PUFFS)
             ===================================================================== */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    تنظیم مقادیر پیش‌فرض مشخصات فنی کالاها (سینک مستقیم با پذیرش کالا)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    این مقادیر در دراپ‌داون‌های انتخابی کاربرگ پذیرش کالا و مشخصات فنی قرار می‌گیرند و ورود کالا را استاندارد و عاری از خطای املایی می‌کنند.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Nicotine Levels */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">میزان نیکوتین</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                    {masterOptions.nicotines?.length || 0} گزینه
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-[44px] max-h-36 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  {(masterOptions.nicotines || []).map((nic) => (
                    <span
                      key={nic}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 shadow-xs"
                    >
                      <span>{nic}</span>
                      {onDeleteMasterOption && (
                        <button
                          type="button"
                          onClick={() => onDeleteMasterOption('nicotines', nic)}
                          className="text-emerald-600 hover:text-rose-600 transition-colors cursor-pointer"
                          title="حذف این گزینه"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {(!masterOptions.nicotines || masterOptions.nicotines.length === 0) && (
                    <span className="text-xs text-slate-400 italic">موردی تعریف نشده است.</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newNicotine}
                    onChange={(e) => setNewNicotine(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newNicotine.trim();
                        if (val) {
                          onAddMasterOption('nicotines', val);
                          setNewNicotine('');
                          onShowToast(`میزان نیکوتین «${val}» افزوده شد.`);
                        }
                      }
                    }}
                    placeholder="مثلاً: 12mg یا ۴۵ میلی‌گرم"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!newNicotine.trim()}
                    onClick={() => {
                      const val = newNicotine.trim();
                      if (val) {
                        onAddMasterOption('nicotines', val);
                        setNewNicotine('');
                        onShowToast(`میزان نیکوتین «${val}» افزوده شد.`);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن</span>
                  </button>
                </div>
              </div>

              {/* 2. Liquid Volume */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-sky-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">حجم مایع</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-sky-700 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/60 px-2 py-0.5 rounded">
                    {masterOptions.liquidVolumes?.length || 0} گزینه
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-[44px] max-h-36 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  {(masterOptions.liquidVolumes || []).map((vol) => (
                    <span
                      key={vol}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 shadow-xs"
                    >
                      <span>{vol}</span>
                      {onDeleteMasterOption && (
                        <button
                          type="button"
                          onClick={() => onDeleteMasterOption('liquidVolumes', vol)}
                          className="text-sky-600 hover:text-rose-600 transition-colors cursor-pointer"
                          title="حذف این گزینه"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {(!masterOptions.liquidVolumes || masterOptions.liquidVolumes.length === 0) && (
                    <span className="text-xs text-slate-400 italic">موردی تعریف نشده است.</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newLiquidVolume}
                    onChange={(e) => setNewLiquidVolume(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newLiquidVolume.trim();
                        if (val) {
                          onAddMasterOption('liquidVolumes', val);
                          setNewLiquidVolume('');
                          onShowToast(`حجم مایع «${val}» افزوده شد.`);
                        }
                      }
                    }}
                    placeholder="مثلاً: 50 ml یا ۲۰۰ میل"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!newLiquidVolume.trim()}
                    onClick={() => {
                      const val = newLiquidVolume.trim();
                      if (val) {
                        onAddMasterOption('liquidVolumes', val);
                        setNewLiquidVolume('');
                        onShowToast(`حجم مایع «${val}» افزوده شد.`);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن</span>
                  </button>
                </div>
              </div>

              {/* 3. Resistances (Ohm) */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">مقاومت کویل (Ω)</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded">
                    {masterOptions.resistances?.length || 0} گزینه
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-[44px] max-h-36 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  {(masterOptions.resistances || []).map((res) => (
                    <span
                      key={res}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 shadow-xs"
                    >
                      <span>{res}</span>
                      {onDeleteMasterOption && (
                        <button
                          type="button"
                          onClick={() => onDeleteMasterOption('resistances', res)}
                          className="text-amber-600 hover:text-rose-600 transition-colors cursor-pointer"
                          title="حذف این گزینه"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {(!masterOptions.resistances || masterOptions.resistances.length === 0) && (
                    <span className="text-xs text-slate-400 italic">موردی تعریف نشده است.</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newResistance}
                    onChange={(e) => setNewResistance(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newResistance.trim();
                        if (val) {
                          onAddMasterOption('resistances', val);
                          setNewResistance('');
                          onShowToast(`مقاومت کویل «${val}» افزوده شد.`);
                        }
                      }
                    }}
                    placeholder="مثلاً: 0.3 Ω یا 0.7 ohm"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!newResistance.trim()}
                    onClick={() => {
                      const val = newResistance.trim();
                      if (val) {
                        onAddMasterOption('resistances', val);
                        setNewResistance('');
                        onShowToast(`مقاومت کویل «${val}» افزوده شد.`);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن</span>
                  </button>
                </div>
              </div>

              {/* 4. Puff Counts */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">تعداد پاف</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded">
                    {masterOptions.puffs?.length || 0} گزینه
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-[44px] max-h-36 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  {(masterOptions.puffs || []).map((puf) => (
                    <span
                      key={puf}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800 shadow-xs"
                    >
                      <span>{puf}</span>
                      {onDeleteMasterOption && (
                        <button
                          type="button"
                          onClick={() => onDeleteMasterOption('puffs', puf)}
                          className="text-purple-600 hover:text-rose-600 transition-colors cursor-pointer"
                          title="حذف این گزینه"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {(!masterOptions.puffs || masterOptions.puffs.length === 0) && (
                    <span className="text-xs text-slate-400 italic">موردی تعریف نشده است.</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPuff}
                    onChange={(e) => setNewPuff(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newPuff.trim();
                        if (val) {
                          onAddMasterOption('puffs', val);
                          setNewPuff('');
                          onShowToast(`تعداد پاف «${val}» افزوده شد.`);
                        }
                      }
                    }}
                    placeholder="مثلاً: ۷۰۰۰ پاف یا ۳۰۰۰۰"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!newPuff.trim()}
                    onClick={() => {
                      const val = newPuff.trim();
                      if (val) {
                        onAddMasterOption('puffs', val);
                        setNewPuff('');
                        onShowToast(`تعداد پاف «${val}» افزوده شد.`);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* =====================================================================
          TAB 3: FESTIVALS & BUNDLES (Polaris IndexTable + Sheet/Collapsible)
         ===================================================================== */}
      {activeTab === 'festivals_bundles' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  جدول قوانین کمپین تخفیف و باندل‌های هوشمند ({promotionRules.length} قانون)
                </h3>
                <p className="text-xs text-slate-500">
                  برای تعریف کمپین تخفیف یا ساخت باندل جدید از دکمه‌های (+) استفاده کنید.
                </p>
              </div>
              <PolarisButtonGroup>
                <PolarisButton
                  size="slim"
                  icon={<Boxes className="w-3.5 h-3.5" />}
                  onClick={() => setIsBundleCollapsibleOpen((prev) => !prev)}
                >
                  {isBundleCollapsibleOpen ? 'بستن باندل‌ساز' : '+ ساخت باندل کالا'}
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  primary
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setIsPromoSheetOpen(true)}
                >
                  کمپین تخفیف جدید
                </PolarisButton>
              </PolarisButtonGroup>
            </div>

            {/* Polaris Collapsible: Bundle Builder (Closed by default) */}
            <PolarisCollapsible
              id="wms-bundle-collapsible"
              open={isBundleCollapsibleOpen}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!bundleSku.trim() || !bundleName.trim() || bundlePrice <= 0) {
                    onShowToast('کد کالا، نام باندل و قیمت فروش الزامی است.');
                    return;
                  }
                  if (!bundleComp1Sku || !bundleComp2Sku) {
                    onShowToast('حداقل دو کالای تشکیل‌دهنده باندل را انتخاب کنید.');
                    return;
                  }
                  setIsSubmittingBundle(true);
                  const comp1 = items.find((i) => i.sku === bundleComp1Sku);
                  const comp2 = items.find((i) => i.sku === bundleComp2Sku);
                  const totalCost =
                    (comp1?.valuationRate || 0) * bundleComp1Qty +
                    (comp2?.valuationRate || 0) * bundleComp2Qty;

                  const newBundle: InventoryItemRecord = {
                    id: `bnd-${Date.now()}`,
                    sku: bundleSku.trim().toUpperCase(),
                    name: bundleName.trim(),
                    category: 'پکیج باندل',
                    brand: 'امکان',
                    sector: 'vape',
                    condition: 'آکبند',
                    uomPrimary: 'عدد',
                    stockQty: Math.min(comp1?.stockQty || 5, comp2?.stockQty || 5),
                    reservedQty: 0,
                    reorderLevel: 2,
                    warehouseStock: {
                      vitrine: Math.min(comp1?.stockQty || 5, comp2?.stockQty || 5),
                    },
                    valuationRate: totalCost,
                    retailPrice: bundlePrice,
                    wholesalePrice: Math.round(bundlePrice * 0.9),
                    partnerPrice: Math.round(bundlePrice * 0.9),
                    serialNumbers: [],
                    batchNo: 'BND-1404',
                    expiryDate: '—',
                    isBundle: true,
                    bundleComponents: [bundleComp1Sku, bundleComp2Sku],
                    bundleComponentItems: [
                      {
                        sku: bundleComp1Sku,
                        name: comp1?.name || bundleComp1Sku,
                        qty: bundleComp1Qty,
                      },
                      {
                        sku: bundleComp2Sku,
                        name: comp2?.name || bundleComp2Sku,
                        qty: bundleComp2Qty,
                      },
                    ],
                  };
                  window.setTimeout(() => {
                    onCreateBundleItem(newBundle);
                    setIsSubmittingBundle(false);
                    setIsBundleCollapsibleOpen(false);
                    setBundleSku('');
                    setBundleName('');
                    setBundlePrice(0);
                  }, 120);
                }}
                className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end text-xs"
              >
                <div>
                  <label className="block font-medium mb-1">کد باندل *</label>
                  <input
                    type="text"
                    value={bundleSku}
                    onChange={(e) => setBundleSku(e.target.value)}
                    placeholder="BUNDLE-STARTER-01"
                    className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">نام پکیج باندل *</label>
                  <input
                    type="text"
                    value={bundleName}
                    onChange={(e) => setBundleName(e.target.value)}
                    placeholder="پکیج پاد + سالت"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">قیمت فروش باندل *</label>
                  <CurrencyInput
                    value={bundlePrice || ''}
                    onChange={(val) => setBundlePrice(val)}
                    placeholder=""
                    className="w-full px-2.5 py-1.5 font-mono text-left bg-white dark:bg-slate-900 border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">کالای اول باندل</label>
                  <select
                    value={bundleComp1Sku}
                    onChange={(e) => setBundleComp1Sku(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  >
                    <option value="">انتخاب کالای ۱...</option>
                    {items.map((i) => (
                      <option key={i.sku} value={i.sku}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">کالای دوم باندل</label>
                  <select
                    value={bundleComp2Sku}
                    onChange={(e) => setBundleComp2Sku(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  >
                    <option value="">انتخاب کالای ۲...</option>
                    {items.map((i) => (
                      <option key={i.sku} value={i.sku}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <PolarisButton
                    type="submit"
                    primary
                    fullWidth
                    size="slim"
                    loading={isSubmittingBundle}
                    disabled={isSubmittingBundle}
                  >
                    ثبت پکیج باندل
                  </PolarisButton>
                </div>
              </form>
            </PolarisCollapsible>

            {/* Promotion Rules Polaris IndexTable */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">نام جشنواره</th>
                    <th className="py-2 px-3">نوع جشنواره</th>
                    <th className="py-2 px-3">مقدار تخفیف</th>
                    <th className="py-2 px-3">جامعه هدف</th>
                    <th className="py-2 px-3">بازه زمانی</th>
                    <th className="py-2 px-3 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {promotionRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                        {rule.name}
                      </td>
                      <td className="py-2 px-3">{rule.festivalType}</td>
                      <td className="py-2 px-3 font-mono font-bold tabular-nums">
                        {rule.discountType === 'percent'
                          ? `${rule.discountValue}%`
                          : `${formatCurrency(rule.discountValue)} ت`}
                      </td>
                      <td className="py-2 px-3">{rule.targetGroup}</td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                        {rule.startDate} تا {rule.endDate}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <PolarisButton
                          size="slim"
                          primary={rule.isActive}
                          onClick={() => onTogglePromotionRule(rule.id)}
                        >
                          {rule.isActive ? 'فعال در صندوق' : 'غیرفعال'}
                        </PolarisButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* =====================================================================
          POLARIS SHEET: ADD NEW WAREHOUSE (Closed by default, opens via +)
         ===================================================================== */}
      <PolarisSheet
        open={isWarehouseSheetOpen}
        onClose={() => setIsWarehouseSheetOpen(false)}
        title="افزودن انبار جدید به سیستم"
        footer={
          <>
            <PolarisButton onClick={() => setIsWarehouseSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingWarehouse}
              disabled={isSavingWarehouse}
              onClick={handleAddWarehouseSubmit}
            >
              ذخیره انبار جدید
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block font-semibold mb-1">نام انبار جدید *</label>
            <input
              type="text"
              autoFocus
              value={newWhName}
              onChange={(e) => setNewWhName(e.target.value)}
              placeholder="مثلاً انبار قرنطینه و مرجوعی..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">موقعیت فیزیکی</label>
            <input
              type="text"
              value={newWhLocation}
              onChange={(e) => setNewWhLocation(e.target.value)}
              placeholder="فروشگاه مرکزی امکان"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">توضیح و کاربری انبار</label>
            <input
              type="text"
              value={newWhDesc}
              onChange={(e) => setNewWhDesc(e.target.value)}
              placeholder="توضیحات..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
        </div>
      </PolarisSheet>

      {/* =====================================================================
          POLARIS SHEET: ADD NEW PROMOTION RULE (Closed by default, opens via +)
         ===================================================================== */}
      <PolarisSheet
        open={isPromoSheetOpen}
        onClose={() => setIsPromoSheetOpen(false)}
        title="تعریف قانون کمپین تخفیف جدید"
        footer={
          <>
            <PolarisButton onClick={() => setIsPromoSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSubmittingPromo}
              disabled={isSubmittingPromo}
              onClick={() => {
                if (!promoName.trim() || isSubmittingPromo) return;
                setIsSubmittingPromo(true);
                window.setTimeout(() => {
                  onAddPromotionRule({
                    id: `promo-${Date.now()}`,
                    name: promoName.trim(),
                    festivalType: promoType || 'تخفیف خرید اول',
                    discountType: promoDiscType,
                    discountValue: Math.max(0, Number(promoDiscVal) || 0),
                    minQty: Math.max(1, Number(promoMinQty) || 1),
                    targetGroup: promoTarget || 'همه مشتریان',
                    startDate: promoStart,
                    endDate: promoEnd,
                    paymentModel: promoPayModel || 'همه',
                    applicableSkus: [],
                    isActive: true,
                  });
                  setPromoName('');
                  setIsSubmittingPromo(false);
                  setIsPromoSheetOpen(false);
                }, 120);
              }}
            >
              ذخیره و فعال‌سازی جشنواره
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block font-semibold mb-1">عنوان جشنواره *</label>
            <input
              type="text"
              value={promoName}
              onChange={(e) => setPromoName(e.target.value)}
              placeholder="مثلاً جشنواره یلدا امکان"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">نوع جشنواره</label>
            <select
              value={promoType}
              onChange={(e) =>
                setPromoType(e.target.value as PromotionRuleRecord['festivalType'])
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            >
              <option value="">انتخاب نوع جشنواره...</option>
              <option value="خرید بالای X قلم">خرید بالای X قلم</option>
              <option value="تخفیف خرید اول">تخفیف خرید اول</option>
              <option value="تخفیف مناسبتی">تخفیف مناسبتی</option>
              <option value="حراج رسوب انبار">حراج رسوب انبار</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold mb-1">مدل تخفیف</label>
              <select
                value={promoDiscType}
                onChange={(e) => setPromoDiscType(e.target.value as 'percent' | 'fixed')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="percent">درصدی (%)</option>
                <option value="fixed">مبلغ ثابت (تومان)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">
                {promoDiscType === 'fixed' ? 'مبلغ تخفیف (تومان)' : 'درصد تخفیف (٪)'}
              </label>
              {promoDiscType === 'fixed' ? (
                <CurrencyInput
                  value={promoDiscVal || ''}
                  onChange={(val) => setPromoDiscVal(val)}
                  placeholder=""
                  className="w-full px-3 py-2 font-mono text-left border border-slate-300 rounded-lg bg-white dark:bg-slate-900 tabular-nums"
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={promoDiscVal || ''}
                  onChange={(e) => setPromoDiscVal(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  placeholder=""
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white dark:bg-slate-900 tabular-nums"
                />
              )}
            </div>
          </div>
        </div>
      </PolarisSheet>

      {/* =====================================================================
          CENTER MODAL: SKU ALLOCATION DISCREPANCY WARNING
         ===================================================================== */}
      {skuDiscrepancyModalData && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-300 dark:border-amber-700 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  هشدار مغایرت تعداد تفکیک طعم با سطر فاکتور مادر
                </h3>
                <p className="text-[11px] text-slate-500">
                  فاکتور خرید: {skuDiscrepancyModalData.purchaseBillNo} {skuDiscrepancyModalData.parentItemName ? `(${skuDiscrepancyModalData.parentItemName})` : ''}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2 text-slate-800 dark:text-slate-200">
              <div className="flex justify-between">
                <span>تعداد در سطر فاکتور مادر:</span>
                <span className="font-mono font-bold">{skuDiscrepancyModalData.parentTotalQty} عدد</span>
              </div>
              <div className="flex justify-between">
                <span>مجموع تعداد SKUهای تفکیک‌شده:</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {skuDiscrepancyModalData.skuTotalQty} عدد
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-200 dark:border-amber-800 pt-2 font-bold text-rose-600 dark:text-rose-400">
                <span>اختلاف / مغایرت:</span>
                <span className="font-mono">{skuDiscrepancyModalData.diff} عدد مغایرت</span>
              </div>
            </div>

            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
              تعداد اقلام تفکیک‌شده با تعداد فاکتور مادر همخوانی ندارد. آیا مایلید ردیف‌ها را اصلاح کنید یا با همین مغایرت کالاها را به انبار منتقل نمایید؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton
                size="slim"
                onClick={() => setSkuDiscrepancyModalData(null)}
              >
                انصراف و اصلاح ردیف‌ها
              </PolarisButton>
              <PolarisButton
                size="slim"
                destructive
                onClick={() => {
                  const validRows = breakdownRows.filter((r) => r.sku.trim() && r.name.trim() && r.qty > 0);
                  executeCommitSkuBreakdown(validRows);
                }}
              >
                تایید و ثبت با مغایرت
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: EDIT WAREHOUSE
         ===================================================================== */}
      {editingWarehouse && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setEditingWarehouse(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                ویرایش مشخصات انبار
              </h3>
              <button
                type="button"
                onClick={() => setEditingWarehouse(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">نام انبار *</label>
                <input
                  type="text"
                  required
                  value={editingWarehouse.name}
                  onChange={(e) =>
                    setEditingWarehouse((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">کد حساب معین *</label>
                <input
                  type="text"
                  required
                  value={editingWarehouse.accountCode}
                  onChange={(e) =>
                    setEditingWarehouse((prev) => (prev ? { ...prev, accountCode: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">موقعیت و کاربری</label>
                <input
                  type="text"
                  value={editingWarehouse.description || ''}
                  onChange={(e) =>
                    setEditingWarehouse((prev) => (prev ? { ...prev, description: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setEditingWarehouse(null)}>
                انصراف
              </PolarisButton>
              <PolarisButton
                primary
                disabled={!editingWarehouse.name.trim() || !editingWarehouse.accountCode.trim()}
                onClick={() => {
                  if (!editingWarehouse.name.trim() || !editingWarehouse.accountCode.trim()) return;
                  onUpdateWarehouse?.(editingWarehouse);
                  setEditingWarehouse(null);
                }}
              >
                ذخیره تغییرات انبار
              </PolarisButton>
            </div>
          </div>
        </div>
      )}
      {/* =====================================================================
          PRODUCT DETAILS POP-UP MODAL IN INVENTORY
         ===================================================================== */}
      {selectedProductForPopup && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedProductForPopup(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedProductForPopup.name}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      selectedProductForPopup.sector === 'pc'
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    {selectedProductForPopup.sector === 'pc' ? '💻 صنف کامپیوتر' : '💨 صنف ویپ‌شاپ'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                    {selectedProductForPopup.condition || 'آکبند'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-2">
                  <span>کد کالا: <strong className="text-slate-700 dark:text-slate-300">{selectedProductForPopup.sku}</strong></span>
                  {selectedProductForPopup.brand && (
                    <span>· برند: <strong className="text-slate-700 dark:text-slate-300">{selectedProductForPopup.brand}</strong></span>
                  )}
                  {selectedProductForPopup.model && (
                    <span>· مدل: <strong className="text-slate-700 dark:text-slate-300">{selectedProductForPopup.model}</strong></span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProductForPopup(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Warehouse Stocks Grid (5 Warehouses) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-indigo-600" />
                <span>موجودی به تفکیک ۵ انبار (مجموع: {selectedProductForPopup.stockQty} عدد)</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {warehouses.map((w) => {
                  const whStock = selectedProductForPopup.warehouseStock || {};
                  const q = whStock[w.key] || (w.key === 'central_external' ? selectedProductForPopup.stockQty : 0);
                  const isCentral = w.key === 'vitrine';
                  return (
                    <div
                      key={w.id}
                      className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                        isCentral
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{w.name}</span>
                        {isCentral && (
                          <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold">مرکزی</span>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between font-mono">
                        <span className="text-[10px] text-slate-400">موجودی:</span>
                        <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                          {q} <span className="text-xs font-normal text-slate-500 font-sans">{selectedProductForPopup.uomPrimary || 'عدد'}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Details & Pricing */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">میانگین موزون خرید</span>
                <span className="font-mono font-bold text-xs tabular-nums text-slate-800 dark:text-slate-200">
                  {!privacyMasked
                    ? `${formatCurrency(selectedProductForPopup.valuationRate)} ت`
                    : '****'}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">قیمت فروش عادی</span>
                <span className="font-mono font-bold text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                  {selectedProductForPopup.retailPrice
                    ? `${formatCurrency(selectedProductForPopup.retailPrice)} ت`
                    : '—'}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">قیمت جشنواره</span>
                <span className="font-mono font-bold text-xs tabular-nums text-amber-600 dark:text-amber-400">
                  {selectedProductForPopup.festivalPrice || selectedProductForPopup.partnerPrice
                    ? `${formatCurrency(selectedProductForPopup.festivalPrice || selectedProductForPopup.partnerPrice || 0)} ت`
                    : '—'}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">قیمت فروش ری‌سلر</span>
                <span className="font-mono font-bold text-xs tabular-nums text-indigo-600 dark:text-indigo-400">
                  {selectedProductForPopup.resellerPrice
                    ? `${formatCurrency(selectedProductForPopup.resellerPrice)} ت`
                    : '—'}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">ارزش کل موجودی</span>
                <span className="font-mono font-bold text-xs tabular-nums text-indigo-600 dark:text-indigo-400">
                  {!privacyMasked
                    ? `${formatCurrency(selectedProductForPopup.stockQty * selectedProductForPopup.valuationRate)} ت`
                    : '****'}
                </span>
              </div>
            </div>

            {/* Technical Specifications */}
            <div className="bg-slate-50/60 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <span className="text-slate-400 block">تگ کالا:</span>
                <span className="font-semibold">{selectedProductForPopup.parentTag || selectedProductForPopup.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">برند / مدل:</span>
                <span className="font-semibold">
                  {[selectedProductForPopup.brand, selectedProductForPopup.model].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">دسته‌بندی:</span>
                <span className="font-semibold">{selectedProductForPopup.category || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">میزان نیکوتین:</span>
                <span className="font-semibold">{selectedProductForPopup.nicotine || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">حجم مایع:</span>
                <span className="font-semibold">{selectedProductForPopup.liquidVolumeMl ? `${selectedProductForPopup.liquidVolumeMl} ml` : '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">حجم باتری:</span>
                <span className="font-semibold">{selectedProductForPopup.batteryCapacityMah ? `${selectedProductForPopup.batteryCapacityMah} mAh` : '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">مقاومت کویل:</span>
                <span className="font-semibold">{selectedProductForPopup.resistanceOhm || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">تعداد پاف:</span>
                <span className="font-semibold">{selectedProductForPopup.puffCount || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">رنگ / طرح:</span>
                <span className="font-semibold">{selectedProductForPopup.color || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">وضعیت کالا:</span>
                <span className="font-semibold">{selectedProductForPopup.condition || 'آکبند'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">فروش میلی‌لیتری:</span>
                <span className="font-semibold">{selectedProductForPopup.allowDecantSale ? 'فعال ✓' : 'غیرفعال'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">تاریخ BB:</span>
                <span className="font-semibold font-mono">{selectedProductForPopup.expiryDate || '—'}</span>
              </div>
            </div>

            {/* Cardex In/Out Movement & Mini History Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-800/70 p-2.5 rounded-xl font-mono">
                <span className="text-slate-500 font-sans font-bold">خلاصه تاریخچه کاردکس این محصول:</span>
                <div className="flex items-center gap-4">
                  <span className="text-emerald-600 font-bold">ورود: {selectedProductForPopup.totalInQty ?? selectedProductForPopup.stockQty}</span>
                  <span className="text-rose-600 font-bold">خروج: {selectedProductForPopup.totalOutQty ?? 0}</span>
                  <span className="text-slate-900 dark:text-white font-bold">مانده: {selectedProductForPopup.stockQty}</span>
                </div>
              </div>
              {(() => {
                const itemCardexRows = stockLedgerEntries
                  .filter((e) => e.sku === selectedProductForPopup.sku)
                  .slice(0, 6);
                if (itemCardexRows.length === 0) return null;
                return (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-36 overflow-y-auto text-[11px]">
                    <table className="w-full text-right border-collapse">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2">تاریخ</th>
                          <th className="py-1.5 px-2">نوع سند</th>
                          <th className="py-1.5 px-2">انبار</th>
                          <th className="py-1.5 px-2 text-center">تغییر</th>
                          <th className="py-1.5 px-2 text-center">مانده</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {itemCardexRows.map((cRow) => (
                          <tr key={cRow.id}>
                            <td className="py-1 px-2 text-slate-500">{cRow.postingDate}</td>
                            <td className="py-1 px-2 font-sans">
                              {cRow.voucherType === 'Sales Return' ? (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">مرجوعی</span>
                              ) : (
                                cRow.voucherType
                              )}
                            </td>
                            <td className="py-1 px-2 font-sans text-slate-600 dark:text-slate-400">
                              {warehouses.find((w) => w.key === cRow.warehouseKey)?.name || cRow.warehouseKey}
                            </td>
                            <td className={`py-1 px-2 text-center font-bold ${cRow.qtyChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {cRow.qtyChange > 0 ? `+${cRow.qtyChange}` : cRow.qtyChange}
                            </td>
                            <td className="py-1 px-2 text-center font-bold">{cRow.balanceAfter}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <PolarisButton
                size="slim"
                icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
                onClick={() => {
                  setTransferSku(selectedProductForPopup.sku);
                  setIsTransferCollapsibleOpen(true);
                  setSelectedProductForPopup(null);
                }}
              >
                انتقال موجودی این کالا بین انبارها
              </PolarisButton>
              <PolarisButton
                size="slim"
                onClick={() => setSelectedProductForPopup(null)}
              >
                بستن پنجره
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DETAILED GOODS INTAKE DISCREPANCY REPORT MODAL
         ===================================================================== */}
      {isDiscrepancyReportOpen && activePurchaseInvoice && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsDiscrepancyReportOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900 shadow-2xl w-full max-w-4xl p-6 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  <span>گزارش جامع و دقیق مغایرت پذیرش کالا (فاکتور خرید #{activePurchaseInvoice.billNo})</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تأمین‌کننده: {activePurchaseInvoice.supplierName} · تاریخ: {activePurchaseInvoice.date} · مجموع هدف: {targetQty} عدد | ثبت‌شده: {currentAllocatedQty} عدد
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDiscrepancyReportOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Discrepancy Breakdown Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden overflow-x-auto max-h-[400px]">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-semibold z-10">
                  <tr>
                    <th className="py-2.5 px-3">ردیف</th>
                    <th className="py-2.5 px-3">قلم فاکتور مرجع</th>
                    <th className="py-2.5 px-3 text-center">هدف فاکتور</th>
                    <th className="py-2.5 px-3 text-center">تعداد ثبت در شیت</th>
                    <th className="py-2.5 px-3 text-center">اختلاف مغایرت</th>
                    <th className="py-2.5 px-3 text-left">فی خرید واحد</th>
                    <th className="py-2.5 px-3 text-left">مغایرت ریالی</th>
                    <th className="py-2.5 px-3 text-center">وضعیت انطباق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(activePurchaseInvoice.lines || []).map((line, lIdx) => {
                    const matchedRows = breakdownRows.filter((r) => {
                      if ((!r.sku.trim() && !r.name.trim()) || (r.qty || 0) <= 0) return false;
                      const rName = (r.name || '').toLowerCase();
                      const rTag = (r.parentTag || '').toLowerCase();
                      const lName = (line.itemName || '').toLowerCase();
                      return rName.includes(lName) || rTag.includes(lName) || lName.includes(rTag) || lName.includes(rName);
                    });
                    const sumQty = matchedRows.reduce((acc, r) => acc + (r.qty || 0), 0);
                    const diff = sumQty - line.qty;
                    const unitPrice = line.valuationRate || line.unitPrice || 0;
                    const diffValue = diff * unitPrice;
                    const isPerfect = diff === 0 && sumQty > 0;
                    const isShortage = diff < 0;
                    const isSurplus = diff > 0;

                    return (
                      <React.Fragment key={line.id || lIdx}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 font-medium">
                          <td className="py-2.5 px-3 font-mono text-slate-400">{lIdx + 1}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 dark:text-white">{line.itemName}</span>
                            <span className="text-[10px] text-slate-500 block">انبار: {warehouses.find(w => w.key === line.warehouseKey)?.name || line.warehouseKey}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums">{line.qty}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{sumQty}</td>
                          <td className={`py-2.5 px-3 text-center font-mono font-bold tabular-nums ${
                            isPerfect ? 'text-emerald-600' : isShortage ? 'text-rose-600' : 'text-purple-600'
                          }`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-left">
                            {!privacyMasked ? `${formatCurrency(unitPrice)} ت` : '****'}
                          </td>
                          <td className={`py-2.5 px-3 font-mono tabular-nums text-left font-bold ${
                            diffValue === 0 ? 'text-slate-400' : diffValue < 0 ? 'text-rose-600' : 'text-purple-600'
                          }`}>
                            {!privacyMasked ? `${diffValue > 0 ? '+' : ''}${formatCurrency(diffValue)} ت` : '****'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isPerfect ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                ✅ کاملاً منطبق
                              </span>
                            ) : isShortage && sumQty > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                ⚠️ کسری بار ({Math.abs(diff)} عدد)
                              </span>
                            ) : isSurplus ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                                🔵 مازاد بار (+{diff} عدد)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                ⚪ وارد نشده (۰ از {line.qty})
                              </span>
                            )}
                          </td>
                        </tr>
                        {/* Sub-rows for matched items */}
                        {matchedRows.length > 0 && (
                          <tr className="bg-slate-50/70 dark:bg-slate-800/30 text-[11px]">
                            <td colSpan={8} className="py-1.5 px-6">
                              <span className="text-slate-400 font-bold ml-2">اقلام تفکیک‌شده این سطر در شیت:</span>
                              <span className="text-slate-600 dark:text-slate-300">
                                {matchedRows.map(mr => `${mr.name} (${mr.qty} عدد)`).join(' · ')}
                              </span>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Reconciliation Summary */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
              <div className="flex items-center gap-4">
                <span>مجموع هدف فاکتور: <strong className="text-slate-900 dark:text-white font-bold">{targetQty} عدد</strong></span>
                <span>مجموع ثبت‌شده: <strong className="text-indigo-600 font-bold">{currentAllocatedQty} عدد</strong></span>
                <span>
                  مغایرت کل: <strong className={currentAllocatedQty === targetQty ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    {currentAllocatedQty - targetQty > 0 ? `+${currentAllocatedQty - targetQty}` : currentAllocatedQty - targetQty} عدد
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PolarisButton size="slim" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
                  چاپ گزارش مغایرت
                </PolarisButton>
                <PolarisButton size="slim" primary onClick={() => setIsDiscrepancyReportOpen(false)}>
                  بستن گزارش
                </PolarisButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INTAKE DRAFTS MODAL */}
      {isIntakeDraftsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsIntakeDraftsModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-600" />
                <span>پیش‌نویس‌های پذیرش کالا ({intakeDrafts.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsIntakeDraftsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {intakeDrafts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" />
                <p>هیچ پیش‌نویسی برای پذیرش کالا ذخیره نشده است.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {intakeDrafts.map((d) => (
                  <div
                    key={d.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                      activeIntakeDraftId === d.id
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {d.title}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>{d.savedAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <PolarisButton size="slim" primary onClick={() => handleLoadIntakeDraft(d)}>
                        انتخاب و بارگذاری
                      </PolarisButton>
                      <button
                        type="button"
                        onClick={() => handleDeleteIntakeDraft(d.id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="حذف پیش‌نویس"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton onClick={() => setIsIntakeDraftsModalOpen(false)}>بستن</PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* EXIT CONFIRMATION MODAL FOR PURCHASE INVOICE & GOODS INTAKE */}
      {pendingExitTargetTab && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/50">
                <AlertTriangle className="w-6 h-6 shrink-0" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تأیید خروج از {activeTab === 'purchase_invoice' ? 'صفحه ثبت فاکتور خرید' : 'صفحه پذیرش کالا'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  اطلاعات واردشده در این صفحه هنوز ثبت نهایی نشده است. آیا می‌خواهید قبل از خروج، آن را به عنوان پیش‌نویس ذخیره کنید؟
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton
                size="slim"
                onClick={() => setPendingExitTargetTab(null)}
              >
                انصراف و ادامه ویرایش
              </PolarisButton>
              <PolarisButton
                size="slim"
                destructive
                onClick={() => {
                  const target = pendingExitTargetTab;
                  setPendingExitTargetTab(null);
                  setIsPurchaseInvoiceDirty(false);
                  setCleanIntakeSnapshot(currentIntakeSnapshot);
                  setActiveTab(target);
                }}
              >
                خروج بدون ذخیره
              </PolarisButton>
              <PolarisButton
                size="slim"
                primary
                icon={<Save className="w-3.5 h-3.5" />}
                onClick={() => {
                  const target = pendingExitTargetTab;
                  if (activeTab === 'purchase_invoice') {
                    savePurchaseDraftRef.current?.();
                    setIsPurchaseInvoiceDirty(false);
                  } else if (activeTab === 'sku_allocation') {
                    handleSaveIntakeDraft();
                  }
                  setPendingExitTargetTab(null);
                  setActiveTab(target);
                }}
              >
                ذخیره پیش‌نویس و خروج
              </PolarisButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
