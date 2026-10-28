import React, { useState, useMemo, useEffect } from 'react';
import {
  Truck,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  Save,
  FolderOpen,
  Trash2,
  Clock,
} from 'lucide-react';
import {
  PurchaseInvoiceRecord,
  CustomerContactRecord,
  WarehouseKey,
  WarehouseRecord,
  InventoryItemRecord,
  MasterOptionsRegistry,
} from '../data/erpSeedData';
import {
  formatPersianDate,
  formatCurrency,
  detectCategorySector,
} from '../utils/erpEngine';
import {
  PurchaseInvoiceSheetsGrid,
  PurchaseInvoiceLineGridItem,
  createEmptyPurchaseRow,
} from './PurchaseInvoiceSheetsGrid';
import { CreatableCombobox } from './CreatableCombobox';
import { CurrencyInput, parseCommaNumber, formatLiveComma } from './CurrencyInput';
import { JalaliDatePickerPopup } from './JalaliDatePickerPopup';
import {
  allocatePurchaseInvoiceDiscounts,
  arePurchaseInvoiceLinesValid,
  getPopulatedPurchaseInvoiceLines,
} from '../utils/purchaseInvoice';

export interface PurchaseInvoiceDraftRecord {
  id: string;
  title: string;
  savedAt: string;
  supplier: string;
  freightCost: number;
  lines: PurchaseInvoiceLineGridItem[];
  discountReceived: string;
  deliveryStatus: 'در انتظار رسیدن بار' | 'رسیده' | '';
  warehouseKey: string;
  paymentAccountCode: string;
  paidAmount: string;
  settlementDueDate: string;
  paymentNotes: string;
}

const PURCHASE_DRAFTS_STORAGE_KEY = 'emkan.purchase_invoice.drafts.v1';

function loadPurchaseInvoiceDrafts(): PurchaseInvoiceDraftRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PURCHASE_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Primary Polaris Styled Button
function PolarisButton({
  children,
  primary,
  destructive,
  plain,
  loading,
  disabled,
  size = 'regular',
  icon,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode;
  primary?: boolean;
  destructive?: boolean;
  plain?: boolean;
  loading?: boolean;
  disabled?: boolean;
  size?: 'regular' | 'slim' | 'micro';
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  const base =
    'inline-flex items-center justify-center font-bold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 select-none';
  const sizeClasses =
    size === 'micro'
      ? 'px-2 py-0.5 text-[10px] gap-1'
      : size === 'slim'
      ? 'px-2.5 py-1 text-xs gap-1.5'
      : 'px-4 py-2 text-xs gap-2';

  let tone =
    'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 shadow-2xs';
  if (primary)
    tone =
      'bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white shadow-xs focus:ring-indigo-500 border border-transparent';
  if (destructive)
    tone =
      'bg-rose-600 hover:bg-rose-700 active:scale-98 text-white shadow-xs focus:ring-rose-500 border border-transparent';
  if (plain)
    tone =
      'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-none shadow-none';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizeClasses} ${tone} ${
        disabled || loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
      }`}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
      ) : (
        icon
      )}
      <span>{children}</span>
    </button>
  );
}

// Polaris Side Sheet Modal for New Supplier Registration with Mandatory Phone
function PolarisModalSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-indigo-600" />
            <span>{title}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const LIQUIDITY_ACCOUNTS = [
  { code: '110101', label: 'صندوق نقدی فروشگاه (۱۰۱۰۱)' },
  { code: '110102', label: 'بانک سامان - کارتخوان اصلی (۱۰۱۰۲)' },
  { code: '110103', label: 'بانک ملت - فروش آنلاین (۱۰۱۰۳)' },
  { code: '110104', label: 'تنخواه‌گردان مدیریت (۱۰۱۰۴)' },
];

export interface PurchaseInvoiceManagerProps {
  productionMode?: boolean;
  privacyMasked?: boolean;
  contacts: CustomerContactRecord[];
  inventoryItems: InventoryItemRecord[];
  warehouses: WarehouseRecord[];
  masterOptions: MasterOptionsRegistry;
  categorySectors: Record<string, 'vape' | 'pc'>;
  purchaseInvoices: PurchaseInvoiceRecord[];
  onSetCategorySector: (category: string, sector: 'vape' | 'pc') => void;
  onAddMasterOption: (category: keyof MasterOptionsRegistry, value: string) => void;
  onQuickAddSupplier?: (supplierName: string, phone?: string) => void;
  onCreatePurchaseInvoice?: (pinv: PurchaseInvoiceRecord) => boolean;
  onShowToast: (msg: string) => void;
  onTransitionToIntake?: (pinv: PurchaseInvoiceRecord) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  saveDraftRef?: React.MutableRefObject<(() => boolean) | null>;
}

export const PurchaseInvoiceManager: React.FC<PurchaseInvoiceManagerProps> = ({
  contacts,
  inventoryItems,
  warehouses,
  masterOptions,
  categorySectors,
  purchaseInvoices,
  onSetCategorySector,
  onAddMasterOption,
  onQuickAddSupplier,
  onCreatePurchaseInvoice,
  onShowToast,
  onTransitionToIntake,
  onDirtyChange,
  saveDraftRef,
}) => {
  // Form states
  const [pinvSupplier, setPinvSupplier] = useState('');
  const [pinvFreightCost, setPinvFreightCost] = useState<number>(0);
  const [pinvLines, setPinvLines] = useState<PurchaseInvoiceLineGridItem[]>(() =>
    Array.from({ length: 10 }, (_, idx) => createEmptyPurchaseRow(idx))
  );
  const [pinvDiscountReceived, setPinvDiscountReceived] = useState('');
  const [pinvDeliveryStatus, setPinvDeliveryStatus] = useState<'در انتظار رسیدن بار' | 'رسیده' | ''>(
    'رسیده'
  );
  const [pinvWarehouseKey, setPinvWarehouseKey] = useState<string>('vitrine');
  const [pinvPaymentAccountCode, setPinvPaymentAccountCode] = useState<string>('110102');
  const [pinvPaidAmount, setPinvPaidAmount] = useState<string>('');
  const [pinvSettlementDueDate, setPinvSettlementDueDate] = useState<string>('');
  const [pinvPaymentNotes, setPinvPaymentNotes] = useState<string>('');

  // Drafts Management State
  const [drafts, setDrafts] = useState<PurchaseInvoiceDraftRecord[]>(loadPurchaseInvoiceDrafts);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const [justSavedCleanSnapshot, setJustSavedCleanSnapshot] = useState<string>('');

  // Modals & Inline Fast Supplier Completion
  const [showConfirmPurchaseModal, setShowConfirmPurchaseModal] = useState(false);
  const [isSupplierSheetOpen, setIsSupplierSheetOpen] = useState(false);
  const [inlineNewSupplierMode, setInlineNewSupplierMode] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

  // Persist drafts to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(PURCHASE_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // ignore storage quota errors
    }
  }, [drafts]);

  // Compute current form fingerprint & dirty state
  const currentSnapshotKey = useMemo(() => {
    const populatedLines = pinvLines.filter(
      (l) =>
        l.itemName.trim() !== '' ||
        l.parentTag.trim() !== '' ||
        (Number(l.unitCost) || 0) > 0 ||
        (Number(l.discountAmount) || 0) > 0
    );
    if (
      !pinvSupplier.trim() &&
      !pinvFreightCost &&
      !pinvDiscountReceived &&
      !pinvPaidAmount &&
      !pinvSettlementDueDate &&
      !pinvPaymentNotes.trim() &&
      populatedLines.length === 0
    ) {
      return '';
    }
    return JSON.stringify({
      s: pinvSupplier.trim(),
      f: pinvFreightCost,
      d: pinvDiscountReceived,
      p: pinvPaidAmount,
      due: pinvSettlementDueDate,
      n: pinvPaymentNotes.trim(),
      w: pinvWarehouseKey,
      st: pinvDeliveryStatus,
      lines: populatedLines.map((l) => ({
        n: l.itemName.trim(),
        t: l.parentTag.trim(),
        c: l.itemCondition,
        q: l.qty,
        u: l.unitCost,
        da: l.discountAmount,
      })),
    });
  }, [
    pinvSupplier,
    pinvFreightCost,
    pinvDiscountReceived,
    pinvPaidAmount,
    pinvSettlementDueDate,
    pinvPaymentNotes,
    pinvWarehouseKey,
    pinvDeliveryStatus,
    pinvLines,
  ]);

  const isDirty = useMemo(() => {
    return currentSnapshotKey !== '' && currentSnapshotKey !== justSavedCleanSnapshot;
  }, [currentSnapshotKey, justSavedCleanSnapshot]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSaveDraft = (): boolean => {
    const populatedLines = getPopulatedPurchaseInvoiceLines(pinvLines);
    if (!pinvSupplier.trim() && populatedLines.length === 0) {
      onShowToast('برای ذخیره پیش‌نویس، حداقل نام تأمین‌کننده یا یک ردیف کالا را وارد کنید.');
      return false;
    }

    const nowStr = `${formatPersianDate(new Date())} - ${new Date().toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    const summaryLabel =
      populatedLines.length > 0
        ? populatedLines.map((l) => l.itemName || 'کالا').slice(0, 2).join('، ')
        : 'بدون قلم کالا';
    const draftTitle = `${pinvSupplier.trim() || 'تأمین‌کننده نامشخص'} (${summaryLabel})`;

    const draftRecord: PurchaseInvoiceDraftRecord = {
      id: activeDraftId || `pinv-draft-${Date.now()}`,
      title: draftTitle,
      savedAt: nowStr,
      supplier: pinvSupplier,
      freightCost: pinvFreightCost,
      lines: pinvLines,
      discountReceived: pinvDiscountReceived,
      deliveryStatus: pinvDeliveryStatus,
      warehouseKey: pinvWarehouseKey,
      paymentAccountCode: pinvPaymentAccountCode,
      paidAmount: pinvPaidAmount,
      settlementDueDate: pinvSettlementDueDate,
      paymentNotes: pinvPaymentNotes,
    };

    setDrafts((prev) => {
      const exists = prev.some((d) => d.id === draftRecord.id);
      if (exists) {
        return prev.map((d) => (d.id === draftRecord.id ? draftRecord : d));
      }
      return [draftRecord, ...prev];
    });
    setActiveDraftId(draftRecord.id);
    setJustSavedCleanSnapshot(currentSnapshotKey);
    onShowToast(`پیش‌نویس فاکتور خرید «${draftTitle}» ذخیره شد.`);
    return true;
  };

  useEffect(() => {
    if (saveDraftRef) {
      saveDraftRef.current = handleSaveDraft;
    }
  });

  const handleLoadDraft = (draft: PurchaseInvoiceDraftRecord) => {
    setPinvSupplier(draft.supplier || '');
    setPinvFreightCost(draft.freightCost || 0);
    setPinvLines(
      draft.lines && draft.lines.length > 0
        ? draft.lines
        : Array.from({ length: 10 }, (_, idx) => createEmptyPurchaseRow(idx))
    );
    setPinvDiscountReceived(draft.discountReceived || '');
    setPinvDeliveryStatus(draft.deliveryStatus || 'رسیده');
    setPinvWarehouseKey(draft.warehouseKey || 'vitrine');
    setPinvPaymentAccountCode(draft.paymentAccountCode || '110102');
    setPinvPaidAmount(draft.paidAmount || '');
    setPinvSettlementDueDate(draft.settlementDueDate || '');
    setPinvPaymentNotes(draft.paymentNotes || '');
    setActiveDraftId(draft.id);
    setIsDraftsModalOpen(false);
    onShowToast(`پیش‌نویس «${draft.title}» در فرم بارگذاری شد.`);
  };

  const handleDeleteDraft = (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
    }
    onShowToast('پیش‌نویس حذف شد.');
  };

  // CRM SUPPLIERS ONLY: Exclude customers, include only suppliers and past vendors
  const supplierOptions = useMemo(() => {
    const fromContacts = contacts
      .filter((c) => {
        if (c.contactCategory === 'supplier') return true;
        const roleLower = (c.role || '').toLowerCase();
        const notesLower = (c.notes || '').toLowerCase();
        return (
          roleLower.includes('تامین') ||
          roleLower.includes('تأمین') ||
          roleLower.includes('فروشنده') ||
          roleLower.includes('پخش') ||
          notesLower.includes('تامین') ||
          notesLower.includes('تأمین')
        );
      })
      .map((c) => c.fullName.trim());

    const fromBills = purchaseInvoices
      .map((p) => p.supplierName?.trim())
      .filter(Boolean);

    return Array.from(new Set([...fromContacts, ...fromBills]));
  }, [contacts, purchaseInvoices]);

  // Financial Computations
  const computedPurchaseSubtotal = useMemo(() => {
    return pinvLines.reduce((acc, l) => {
      const q = Math.max(0, Number(l.qty) || 0);
      const c = Math.max(0, Number(l.unitCost) || 0);
      return acc + q * c;
    }, 0);
  }, [pinvLines]);

  const computedPurchaseGrandTotal = useMemo(() => {
    const disc = Math.max(0, Number(pinvDiscountReceived) || 0);
    const lineDiscounts = pinvLines.reduce(
      (sum, line) =>
        sum +
        Math.min(
          Math.max(0, line.qty * line.unitCost),
          Math.max(0, line.discountAmount || 0)
        ),
      0
    );
    return Math.max(0, computedPurchaseSubtotal - lineDiscounts - disc);
  }, [computedPurchaseSubtotal, pinvDiscountReceived, pinvLines]);

  const computedPurchaseUnpaidDebt = useMemo(() => {
    const paid = Math.max(0, Number(pinvPaidAmount) || 0);
    const freightOnCredit = paid === 0 ? Math.max(0, Number(pinvFreightCost) || 0) : 0;
    return Math.max(0, computedPurchaseGrandTotal - paid + freightOnCredit);
  }, [computedPurchaseGrandTotal, pinvPaidAmount, pinvFreightCost]);

  // Open Add Supplier Modal
  const handleOpenAddSupplier = (nameHint = '') => {
    setNewSupplierName(nameHint);
    setNewSupplierPhone('');
    setIsSupplierSheetOpen(true);
  };

  const handleCreateQuickSupplier = () => {
    if (!newSupplierName.trim()) {
      onShowToast('نام تجاری تأمین‌کننده الزامی است.');
      return;
    }
    if (!newSupplierPhone.trim()) {
      onShowToast('شماره تماس تأمین‌کننده الزامی است.');
      return;
    }
    setIsSavingSupplier(true);
    onQuickAddSupplier?.(newSupplierName.trim(), newSupplierPhone.trim());
    setPinvSupplier(newSupplierName.trim());
    setIsSavingSupplier(false);
    setIsSupplierSheetOpen(false);
    setNewSupplierName('');
    setNewSupplierPhone('');
    onShowToast(`تأمین‌کننده «${newSupplierName.trim()}» با موفقیت ثبت و انتخاب شد.`);
  };

  // Submit Stage 1 Purchase
  const handleStage1PurchaseSubmit = () => {
    if (isSubmittingPurchase || !onCreatePurchaseInvoice) return;
    if (!pinvSupplier.trim()) {
      onShowToast('نام تأمین‌کننده الزامی است.');
      return;
    }
    if (!pinvDeliveryStatus) {
      onShowToast('وضعیت تحویل بار الزامی است.');
      return;
    }
    const activeLines = getPopulatedPurchaseInvoiceLines(pinvLines);
    if (activeLines.length === 0) {
      onShowToast('حداقل یک قلم معتبر به فاکتور خرید اضافه کنید.');
      return;
    }
    if (!arePurchaseInvoiceLinesValid(activeLines)) {
      onShowToast(
        'هر سطر دارای اطلاعات باید نام کالا، دسته‌بندی، تعداد و قیمت خرید معتبر داشته باشد؛ سطرهای خالی نادیده گرفته می‌شوند.'
      );
      return;
    }
    setShowConfirmPurchaseModal(true);
  };

  const executeStage1PurchaseSubmit = () => {
    if (isSubmittingPurchase || !onCreatePurchaseInvoice) return;
    setIsSubmittingPurchase(true);

    const discNum = Math.max(0, Number(pinvDiscountReceived) || 0);
    const totalNum = computedPurchaseGrandTotal;
    const paidNum = Math.min(totalNum, Math.max(0, Number(pinvPaidAmount) || 0));

    const activeLines = getPopulatedPurchaseInvoiceLines(pinvLines);
    const discountAllocations = allocatePurchaseInvoiceDiscounts(activeLines, discNum);
    const itemsSummary = activeLines
      .map((l) => `${l.itemName} (${l.qty} عدد - ${l.itemCondition})`)
      .join(' + ');
    const firstLine = activeLines[0];
    const detectedFirstSector =
      firstLine?.sector || detectCategorySector(firstLine?.parentTag || '', categorySectors);

    const selectedWarehouseObj = warehouses.find((w) => w.key === pinvWarehouseKey);
    const resolvedWarehouseKey = (pinvWarehouseKey || 'vitrine') as WarehouseKey;
    const newPinv: PurchaseInvoiceRecord = {
      id: `pinv-${Date.now()}`,
      billNo: `PINV-${140400 + purchaseInvoices.length + 1}`,
      supplierName: pinvSupplier.trim(),
      date: formatPersianDate(new Date()),
      warehouse: selectedWarehouseObj?.name || 'انبار ویترین',
      warehouseKey: resolvedWarehouseKey,
      inventoryAccountCode: selectedWarehouseObj?.accountCode || '110401',
      totalAmount: totalNum,
      paidAmount: paidNum,
      landedCostAdded: 0,
      status: paidNum >= totalNum ? 'تسویه‌شده' : 'بدهکار باز',
      itemsSummary,
      paymentNotes: pinvPaymentNotes.trim() || undefined,
      settlementDueDate: pinvSettlementDueDate || undefined,
      freightAmount: pinvFreightCost > 0 ? pinvFreightCost : undefined,
      discountReceived: discNum > 0 ? discNum : undefined,
      deliveryStatus: (pinvDeliveryStatus || 'رسیده') as 'در انتظار رسیدن بار' | 'رسیده',
      costCenter: detectedFirstSector === 'pc' ? 'CC-102' : 'CC-101',
      docstatus: 1,
      skuBreakdownCompleted: false,
      paymentAccountCode: paidNum > 0 ? pinvPaymentAccountCode : undefined,
      parentTag: firstLine?.itemName.trim(),
      itemType: firstLine?.parentTag.trim(),
      lines: activeLines.map((l, idx) => {
        const allocation = discountAllocations[idx];
        const lineDiscountAmount = allocation?.lineDiscountAmount || 0;
        const cleanItemName = l.itemName.trim();
        const cleanCategory = l.parentTag.trim();
        return {
          id: `piline-${Date.now()}-${idx}`,
          sku: `PINV-LINE-${idx + 1}`,
          itemName: cleanItemName,
          uom: 'عدد',
          qty: l.qty,
          unitPrice: l.unitCost,
          valuationRate: allocation?.valuationRate ?? l.unitCost,
          discountPercent: 0,
          lineDiscountType: 'fixed' as const,
          lineDiscountAmount,
          allocatedHeaderDiscount: allocation?.allocatedHeaderDiscount || 0,
          netLineAmount: allocation?.netLineAmount ?? l.qty * l.unitCost,
          itemCondition: l.itemCondition,
          // CRITICAL: parentTag in Goods Intake must be the product name from the invoice (cleanItemName), while cleanCategory is stored in itemType
          parentTag: cleanItemName,
          itemType: cleanCategory || undefined,
          sector: l.sector || detectedFirstSector,
          warehouseKey: resolvedWarehouseKey,
        };
      }),
    };

    const success = onCreatePurchaseInvoice(newPinv);
    setIsSubmittingPurchase(false);
    setShowConfirmPurchaseModal(false);

    if (success) {
      if (activeDraftId) {
        setDrafts((prev) => prev.filter((d) => d.id !== activeDraftId));
        setActiveDraftId(null);
      }
      // Reset form and clear dirty state before transitioning
      setPinvSupplier('');
      setPinvPaidAmount('');
      setPinvDiscountReceived('');
      setPinvFreightCost(0);
      setPinvPaymentNotes('');
      setPinvSettlementDueDate('');
      setPinvDeliveryStatus('رسیده');
      setPinvWarehouseKey('vitrine');
      setPinvLines(Array.from({ length: 10 }, (_, idx) => createEmptyPurchaseRow(idx)));
      setJustSavedCleanSnapshot('');
      onDirtyChange?.(false);

      // Transition immediately to SKU Intake Queue with the newly created invoice
      onTransitionToIntake?.(newPinv);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
      {/* Header with Drafts Controls */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              ثبت فاکتور خرید بار
              <span className="text-[11px] font-normal text-slate-400">
                (مرحله اول: ثبت مالی کلان و انتقال خودکار به پذیرش کالا)
              </span>
              {activeDraftId && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300">
                  پیش‌نویس فعال
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              پس از ثبت، فاکتور خرید مستقیماً به صفحه «پذیرش و کدگذاری کالا» منتقل شده و نام و قیمت خرید هر محصول در شیت درج می‌شود.
            </p>
          </div>
        </div>

        {/* Draft Actions Bar in Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <PolarisButton
            size="slim"
            icon={<Save className="w-3.5 h-3.5 text-amber-600" />}
            onClick={handleSaveDraft}
          >
            ذخیره پیش‌نویس
          </PolarisButton>
          <PolarisButton
            size="slim"
            icon={<FolderOpen className="w-3.5 h-3.5 text-indigo-600" />}
            onClick={() => setIsDraftsModalOpen(true)}
          >
            پیش‌نویس‌های فاکتور ({drafts.length})
          </PolarisButton>
        </div>
      </div>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="space-y-4 text-xs"
      >
        {/* Top Row: Supplier & Warehouse Routing */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
          {/* 1. Supplier Name with Search from Suppliers only + Fast Enter Creation */}
          <div className="space-y-1.5">
            <CreatableCombobox
              label="۱. نام فروشنده / تأمین‌کننده *"
              value={pinvSupplier}
              onChange={setPinvSupplier}
              options={supplierOptions}
              onAddNewOption={(newSup) => {
                setPinvSupplier(newSup);
                setNewSupplierName(newSup);
                setNewSupplierPhone('');
                setInlineNewSupplierMode(true);
              }}
              onPlusButtonClick={() => handleOpenAddSupplier()}
              plusButtonTitle="ثبت تأمین‌کننده جدید با شماره تماس (+)"
              placeholder="جستجو در تأمین‌کنندگان یا تایپ نام جدید + Enter..."
            />
            {inlineNewSupplierMode && (
              <div className="p-2 rounded-lg bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 animate-in fade-in duration-150">
                <input
                  type="text"
                  autoFocus
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onQuickAddSupplier?.(newSupplierName.trim() || pinvSupplier.trim(), newSupplierPhone.trim());
                      setInlineNewSupplierMode(false);
                    }
                  }}
                  placeholder="تلفن تأمین‌کننده جدید (اختیاری) + Enter..."
                  className="flex-1 px-2 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded"
                />
                <PolarisButton
                  size="micro"
                  primary
                  onClick={() => {
                    onQuickAddSupplier?.(newSupplierName.trim() || pinvSupplier.trim(), newSupplierPhone.trim());
                    setInlineNewSupplierMode(false);
                  }}
                >
                  ثبت سریع
                </PolarisButton>
              </div>
            )}
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              ۲. وضعیت تحویل بار *
            </label>
            <select
              value={pinvDeliveryStatus}
              onChange={(e) => {
                const status = e.target.value as 'در انتظار رسیدن بار' | 'رسیده' | '';
                setPinvDeliveryStatus(status);
                if (status === 'در انتظار رسیدن بار') {
                  setPinvWarehouseKey('in_transit');
                } else if (pinvWarehouseKey === 'in_transit') {
                  setPinvWarehouseKey('vitrine');
                }
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900 font-semibold"
            >
              <option value="">انتخاب وضعیت تحویل بار...</option>
              <option value="در انتظار رسیدن بار">در انتظار رسیدن بار (انبار کالای در راه)</option>
              <option value="رسیده">رسیده به انبار (آماده کدگذاری و انتقال)</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              ۳. انبار مقصد ورود بار *
            </label>
            <select
              value={pinvWarehouseKey}
              onChange={(e) => {
                const nextKey = e.target.value;
                setPinvWarehouseKey(nextKey);
                if (nextKey === 'in_transit') {
                  setPinvDeliveryStatus('در انتظار رسیدن بار');
                } else if (pinvDeliveryStatus === 'در انتظار رسیدن بار' || !pinvDeliveryStatus) {
                  setPinvDeliveryStatus('رسیده');
                }
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900"
            >
              <option value="">انتخاب انبار مقصد...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.key}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Spreadsheet Grid for Purchase Invoice */}
        <PurchaseInvoiceSheetsGrid
          lines={pinvLines}
          onChangeLines={setPinvLines}
          masterOptions={masterOptions}
          categorySectors={categorySectors}
          catalogItems={inventoryItems}
          onShowToast={onShowToast}
          onAddMasterOption={onAddMasterOption}
          onSetCategorySector={onSetCategorySector}
        />

        {/* Financial Summary & Settlement Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              جمع ناخالص اقلام فاکتور
            </label>
            <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-bold tabular-nums">
              {`${formatCurrency(computedPurchaseSubtotal)} تومان`}
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              تخفیف تامین‌کننده (تومان)
            </label>
            <input
              type="text"
              value={pinvDiscountReceived ? formatLiveComma(pinvDiscountReceived) : ''}
              onChange={(e) => setPinvDiscountReceived(String(parseCommaNumber(e.target.value) || ''))}
              placeholder="۰"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900 tabular-nums font-mono text-left"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              کرایه حمل بار (تومان)
            </label>
            <input
              type="text"
              value={pinvFreightCost ? formatLiveComma(pinvFreightCost) : ''}
              onChange={(e) => setPinvFreightCost(parseCommaNumber(e.target.value))}
              placeholder="۰"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900 tabular-nums font-mono text-left"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              ثبت در هزینه جاری (۵۲۰۴) بدون افزایش بهای کالا
            </span>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              مبلغ خالص فاکتور خرید
            </label>
            <div className="w-full rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-1.5 font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
              {`${formatCurrency(computedPurchaseGrandTotal)} تومان`}
            </div>
          </div>
        </div>

        {/* Settlement and Payment Details */}
        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              حساب پرداخت‌کننده
            </label>
            <select
              value={pinvPaymentAccountCode}
              onChange={(e) => setPinvPaymentAccountCode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900"
            >
              <option value="">انتخاب حساب پرداخت...</option>
              {LIQUIDITY_ACCOUNTS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              مبلغ پرداختی نقد/کارت (تومان)
            </label>
            <CurrencyInput
              value={pinvPaidAmount ? parseCommaNumber(pinvPaidAmount) : ''}
              onChange={(val) => setPinvPaidAmount(val > 0 ? String(val) : '')}
              placeholder="۰"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900 tabular-nums text-left font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              مانده بدهی تجاری (۲۱۰۱)
            </label>
            <div className="w-full rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 font-bold text-rose-800 dark:text-rose-300 tabular-nums">
              {`${formatCurrency(computedPurchaseUnpaidDebt)} تومان`}
            </div>
          </div>

          {/* Interactive Jalali Datepicker Popup */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              سررسید تسویه
            </label>
            <JalaliDatePickerPopup
              value={pinvSettlementDueDate}
              onChange={setPinvSettlementDueDate}
              placeholder="انتخاب تاریخ سررسید..."
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              توضیحات پرداخت
            </label>
            <input
              type="text"
              value={pinvPaymentNotes}
              onChange={(e) => setPinvPaymentNotes(e.target.value)}
              placeholder="شماره پیگیری..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <PolarisButton
            type="button"
            icon={<Save className="w-4 h-4 text-amber-600" />}
            onClick={handleSaveDraft}
          >
            ذخیره به عنوان پیش‌نویس
          </PolarisButton>

          <PolarisButton
            type="button"
            primary
            loading={isSubmittingPurchase}
            disabled={isSubmittingPurchase}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => handleStage1PurchaseSubmit()}
          >
            ثبت فاکتور خرید بار و انتقال به صف پذیرش کالا
          </PolarisButton>
        </div>
      </form>

      {/* DRAFTS SELECTION MODAL */}
      <PolarisModalSheet
        open={isDraftsModalOpen}
        onClose={() => setIsDraftsModalOpen(false)}
        title={`پیش‌نویس‌های ثبت فاکتور خرید (${drafts.length})`}
        footer={
          <PolarisButton onClick={() => setIsDraftsModalOpen(false)}>بستن</PolarisButton>
        }
      >
        {drafts.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-2">
            <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" />
            <p>هیچ پیش‌نویسی برای فاکتور خرید ذخیره نشده است.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {drafts.map((d) => {
              const lineCount = getPopulatedPurchaseInvoiceLines(d.lines || []).length;
              return (
                <div
                  key={d.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                    activeDraftId === d.id
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {d.title}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {d.savedAt}
                      </span>
                      <span>{lineCount} ردیف کالا</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <PolarisButton
                      size="slim"
                      primary
                      onClick={() => handleLoadDraft(d)}
                    >
                      انتخاب و بارگذاری
                    </PolarisButton>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(d.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title="حذف پیش‌نویس"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PolarisModalSheet>

      {/* CONFIRMATION MODAL */}
      {showConfirmPurchaseModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400">
              <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/50">
                <CheckCircle2 className="w-6 h-6 shrink-0" />
              </div>
              <div>
                <h4 className="text-base font-bold">تأیید نهایی ثبت فاکتور خرید بار</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  آیا از ثبت این فاکتور و ارسال اقلام به صف کدگذاری انبار اطمینان دارید؟
                </p>
              </div>
            </div>

            {/* General Info Summary - Full Visible Financial Totals */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 space-y-2 text-xs border border-slate-200 dark:border-slate-700/60">
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">تأمین‌کننده / فروشنده:</span>
                <span className="font-semibold">{pinvSupplier}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">انبار مقصد:</span>
                <span className="font-semibold">
                  {warehouses.find((w) => w.key === pinvWarehouseKey)?.name || 'انبار ویترین'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">وضعیت تحویل:</span>
                <span className="font-semibold">{pinvDeliveryStatus}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">تعداد اقلام معتبر:</span>
                <span className="font-semibold font-mono">
                  {getPopulatedPurchaseInvoiceLines(pinvLines).length} ردیف ({getPopulatedPurchaseInvoiceLines(pinvLines).reduce((s, l) => s + (Number(l.qty) || 0), 0)} عدد)
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">مبلغ خالص فاکتور خرید:</span>
                <span className="font-bold font-mono text-indigo-700 dark:text-indigo-300">
                  {formatCurrency(computedPurchaseGrandTotal)} تومان
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 dark:text-slate-400">مانده بدهی تجاری (۲۱۰۱):</span>
                <span className="font-bold font-mono text-rose-700 dark:text-rose-400">
                  {formatCurrency(computedPurchaseUnpaidDebt)} تومان
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton
                size="slim"
                onClick={() => setShowConfirmPurchaseModal(false)}
              >
                انصراف و ویرایش
              </PolarisButton>
              <PolarisButton
                size="slim"
                primary
                loading={isSubmittingPurchase}
                disabled={isSubmittingPurchase}
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={() => executeStage1PurchaseSubmit()}
              >
                تأیید و ارسال به پذیرش
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* NEW SUPPLIER MODAL WITH MANDATORY PHONE */}
      <PolarisModalSheet
        open={isSupplierSheetOpen}
        onClose={() => setIsSupplierSheetOpen(false)}
        title="ثبت تأمین‌کننده جدید"
        footer={
          <>
            <PolarisButton onClick={() => setIsSupplierSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingSupplier}
              disabled={isSavingSupplier}
              onClick={handleCreateQuickSupplier}
            >
              ذخیره و انتخاب در فاکتور خرید
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              نام تجاری تأمین‌کننده / شرکت پخش *
            </label>
            <input
              type="text"
              autoFocus
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="مثلاً بازرگانی پارس، پخش خلیج..."
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              شماره تماس تأمین‌کننده *
            </label>
            <input
              type="text"
              value={newSupplierPhone}
              onChange={(e) => setNewSupplierPhone(e.target.value)}
              placeholder="021... یا 0912..."
              className="w-full px-3 py-2 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              شماره تماس در دفترچه مخاطبان CRM با دسته‌بندی تأمین‌کننده ثبت خواهد شد.
            </span>
          </div>
        </div>
      </PolarisModalSheet>
    </div>
  );
};
