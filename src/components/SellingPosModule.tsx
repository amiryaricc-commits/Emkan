import React, { useState, useMemo, useRef } from 'react';
import {
  ShoppingBag,
  Barcode,
  Printer,
  Plus,
  Minus,
  Eye,
  EyeOff,
  RotateCcw,
  Wrench,
  Sparkles,
  Users,
  Tag,
  Trash2,
  Droplets,
  PackageCheck,
  FileText,
  XCircle,
  Truck,
  Copy,
  Check,
  Download,
  Search,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import {
  CustomerContactRecord,
  InventoryItemRecord,
  PromotionRuleRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  PosServiceLineItem,
  WarehouseKey,
  WarehouseRecord,
  MasterOptionsRegistry,
} from '../data/erpSeedData';
import {
  formatCurrency,
  formatPersianDate,
  smartFilterAndRankItems,
  calculateCostPerMl,
  detectCategorySector,
  matchBarcodeToInventory,
} from '../utils/erpEngine';
import {
  CreatableCombobox,
  PolarisButton,
  PolarisButtonGroup,
  PolarisCollapsible,
  PolarisSheet,
  formatLiveComma,
  parseCommaNumber,
} from './CreatableCombobox';
import { CurrencyInput, toEnglishDigits } from './CurrencyInput';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { calculatePosCartTotals, generatePlainTextReceipt, ReceiptExportData, triggerBrowserDownload } from '../utils/posService';
import {
  PurchaseInvoiceSheetsGrid,
  PurchaseInvoiceLineGridItem,
  createEmptyPurchaseLine,
} from './PurchaseInvoiceSheetsGrid';

export interface PosCheckoutPayload {
  cartLines: {
    sku: string;
    name: string;
    qty: number;
    uom: 'عدد' | 'میلی‌لیتر';
    isDecantMl: boolean;
    systemUnitPrice: number;
    finalManualUnitPrice: number;
    lineDiscount?: number;
    unitValuationCost: number;
    sector: 'vape' | 'pc';
    warehouseKey: WarehouseKey;
    allocatedHeaderDiscount?: number;
    netLineAmount?: number;
  }[];
  serviceLines: PosServiceLineItem[];
  pricingMode: 'normal' | 'festival' | 'reseller';
  grossTotal: number;
  festivalDiscountAmount: number;
  totalLineDiscounts?: number;
  netTotal: number;
  paidAmount: number;
  creditReceivableAmount: number;
  usedCreditBalance?: number;
  paymentAccountCode: '110101' | '110102' | '110103';
  paymentMethodLabel: 'کارتخوان (پوز)' | 'کارت بانکی (کارت به کارت)' | 'نقد (صندوق مغازه)';
  customerName: string;
  customerPhone?: string;
  referralName?: string;
}

export interface PosReturnItemLine {
  lineId?: string;
  sku: string;
  itemName: string;
  qty: number;
  unitPrice: number;
  restockingFee: number;
  isDecantMl?: boolean;
  warehouseKey?: WarehouseKey;
}

export interface PosReturnPayload {
  sourceInvoiceId: string;
  resolutionMode: 'credit_balance' | 'cash_refund';
  refundAccountCode?: '110102' | '110103';
  returnItems: PosReturnItemLine[];
  totalRestockingFee: number;
  grossReturnAmount: number;
  netRefundAmount: number;
  notes?: string;
  exchangeReplacementSku?: string;
  exchangeReplacementQty?: number;
  restockingFee?: number;
}

interface SellingPosModuleProps {
  productionMode: boolean;
  privacyMasked?: boolean;
  initialView?:
    | 'pos'
    | 'returns'
    | 'reseller_pricelist'
    | 'festival_pricelist';
  contacts: CustomerContactRecord[];
  inventoryItems: InventoryItemRecord[];
  promotionRules: PromotionRuleRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices?: PurchaseInvoiceRecord[];
  warehouses?: WarehouseRecord[];
  masterOptions?: MasterOptionsRegistry;
  categorySectors?: Record<string, 'vape' | 'pc'>;
  onSetCategorySector?: (category: string, sector: 'vape' | 'pc') => void;
  onAddMasterOption?: (category: keyof MasterOptionsRegistry, val: string) => void;
  onAddQuickCustomer: (contact: CustomerContactRecord) => void;
  onQuickAddSupplier?: (supplierName: string, phone?: string) => void;
  onCreateQuickInventoryItem?: (item: InventoryItemRecord) => void;
  onUpdateResellerPrice: (sku: string, newResellerPrice: number) => void;
  onUpdateFestivalPrice?: (sku: string, newFestivalPrice: number) => void;
  onCompletePosCheckout: (payload: PosCheckoutPayload) => boolean;
  onProcessPosReturn: (payload: PosReturnPayload) => boolean;
  onVoidSalesInvoice?: (id: string) => void;
  onCreatePurchaseInvoice?: (pinv: PurchaseInvoiceRecord) => boolean;
  onVoidPurchaseInvoice?: (id: string) => void;
  onMarkPurchaseArrived?: (id: string) => void;
  onNavigateToInventoryBreakdown?: (billNo?: string) => void;
  onShowToast: (msg: string) => void;
}

interface ActiveCartRow {
  rowId: string;
  item: InventoryItemRecord;
  qty: number;
  isDecantMl: boolean;
  manualUnitPrice: number;
  lineDiscount?: number;
  revealCost: boolean;
  warehouseKey: WarehouseKey;
}

const LIQUIDITY_ACCOUNTS = [
  { code: '110101', label: '۱۱۰۱۰۱ — کارتخوان (پوز)' },
  { code: '110102', label: '۱۱۰۱۰۲ — کارت بانکی (کارت به کارت)' },
  { code: '110103', label: '۱۱۰۱۰۳ — نقد (صندوق مغازه)' },
] as const;

export const SellingPosModule: React.FC<SellingPosModuleProps> = ({
  privacyMasked = false,
  initialView = 'pos',
  contacts,
  inventoryItems,
  promotionRules,
  salesInvoices,
  purchaseInvoices = [],
  warehouses = [],
  masterOptions,
  categorySectors,
  onSetCategorySector,
  onAddMasterOption,
  onAddQuickCustomer,
  onQuickAddSupplier,
  onCreateQuickInventoryItem,
  onUpdateResellerPrice,
  onUpdateFestivalPrice,
  onCompletePosCheckout,
  onProcessPosReturn,
  onVoidSalesInvoice,
  onCreatePurchaseInvoice,
  onVoidPurchaseInvoice,
  onMarkPurchaseArrived,
  onNavigateToInventoryBreakdown,
  onShowToast,
}) => {
  const [activeView, setActiveView] = useState<
    'pos' | 'returns' | 'reseller_pricelist' | 'festival_pricelist'
  >(initialView === ('invoices_archive' as any) || initialView === ('purchase_invoice' as any) ? 'pos' : (initialView || 'pos'));

  React.useEffect(() => {
    if (initialView && initialView !== ('invoices_archive' as any) && initialView !== ('purchase_invoice' as any)) {
      setActiveView(initialView as any);
    }
  }, [initialView]);

  // Reseller and Festival Price List Search
  const [resellerSearch, setResellerSearch] = useState('');
  const [festivalSearch, setFestivalSearch] = useState('');

  // Category Quick Filter for Catalog
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('همه');

  // Polaris Autocomplete + Popover Search & Pricing Mode
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<'normal' | 'festival' | 'reseller'>('normal');
  const [showCartBuyPrice, setShowCartBuyPrice] = useState(false);
  const [showConfirmSaleModal, setShowConfirmSaleModal] = useState(false);
  const [showConfirmPurchaseModal, setShowConfirmPurchaseModal] = useState(false);

  // Arrow Key Navigation states
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const searchItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeCustomerIndex, setActiveCustomerIndex] = useState(-1);
  const customerItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Polaris Button Loading Locks (anti-duplicate submission) & Two-Step Destructive Modal
  const isSubmittingSaleRef = useRef(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<{
    type: 'remove_cart_row' | 'remove_service_row' | 'void_sales_invoice' | 'void_purchase_invoice';
    targetId: string;
    label: string;
  } | null>(null);

  // Cart & Collapsible Service Lines (with auto-draft recovery in sessionStorage)
  const [cart, setCart] = useState<ActiveCartRow[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = window.sessionStorage.getItem('emkan_pos_draft_cart') || window.sessionStorage.getItem('farapay_pos_draft_cart');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch {}
    return [];
  });

  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (cart.length > 0) {
          window.sessionStorage.setItem('emkan_pos_draft_cart', JSON.stringify(cart));
        } else {
          window.sessionStorage.removeItem('emkan_pos_draft_cart');
          window.sessionStorage.removeItem('farapay_pos_draft_cart');
        }
      }
    } catch {}
  }, [cart]);

  // Standard POS Keyboard shortcuts: F2 (search barcode), F4 (payment)
  React.useEffect(() => {
    const handlePosKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        const paidInput = document.querySelector<HTMLInputElement>('input[placeholder*="مبلغ پرداختی"]');
        paidInput?.focus();
      }
    };
    window.addEventListener('keydown', handlePosKey);
    return () => window.removeEventListener('keydown', handlePosKey);
  }, []);
  const [isServiceCollapsibleOpen, setIsServiceCollapsibleOpen] = useState(false);
  const [serviceLines, setServiceLines] = useState<PosServiceLineItem[]>([]);
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceFee, setServiceFee] = useState<number>(0);
  const [linkedConsumableSku, setLinkedConsumableSku] = useState('');
  const [linkedConsumableQty, setLinkedConsumableQty] = useState<number>(0);
  const [isEstimatedConsumable, setIsEstimatedConsumable] = useState(false);
  const [estimatedMaterialCost, setEstimatedMaterialCost] = useState<number>(0);

  // Customer Search & Expand History Modal & Polaris Sheet (+ New Customer)
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerContactRecord | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustStyle, setNewCustStyle] = useState('');
  const [isCustomerHistoryModalOpen, setIsCustomerHistoryModalOpen] = useState(false);

  // Customer Store Credit Application in POS Cart
  const [applyCustomerCredit, setApplyCustomerCredit] = useState(true);

  // Referral Search (Collapsible — Closed by default)
  const [isReferralCollapsibleOpen, setIsReferralCollapsibleOpen] = useState(false);
  const [referralSearch, setReferralSearch] = useState('');
  const [selectedReferral, setSelectedReferral] = useState('');

  // Settlement Controls
  const [paymentAccountCode, setPaymentAccountCode] = useState<'110101' | '110102' | '110103' | ''>(
    ''
  );
  const [paidAmountInput, setPaidAmountInput] = useState<number | null>(null);

  // Thermal Receipt Modal & Plain Text Export
  const [lastReceiptSnapshot, setLastReceiptSnapshot] = useState<PosCheckoutPayload | null>(null);
  const [showThermalReceipt, setShowThermalReceipt] = useState(false);
  const [receiptModalTab, setReceiptModalTab] = useState<'visual' | 'text'>('visual');
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  // Sales Returns State (Overhauled: Search bar, Strict no new items, per-item restocking fee, anti-fraud duplicate tracking)
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [selectedReturnInvoiceId, setSelectedReturnInvoiceId] = useState('');
  const [returnSelectedItems, setReturnSelectedItems] = useState<
    Record<string, { selected: boolean; qty: number; restockingFee: number }>
  >({});
  const [returnResolutionMode, setReturnResolutionMode] = useState<'credit_balance' | 'cash_refund'>(
    'credit_balance'
  );
  const [refundAccountCode, setRefundAccountCode] = useState<'110102' | '110103'>('110102');
  const [returnNotes, setReturnNotes] = useState('');



  // Available unique categories for quick filter pills
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    inventoryItems.forEach((i) => {
      if (i.category && !i.isVirtualDecantBottle) cats.add(i.category);
    });
    return ['همه', ...Array.from(cats)];
  }, [inventoryItems]);

  // Filtered items with category filtering and case-insensitive exact-first ranking
  const filteredCatalogItems = useMemo(() => {
    let items = smartFilterAndRankItems(inventoryItems, barcodeQuery);
    if (selectedCategoryFilter !== 'همه') {
      items = items.filter((i) => i.category === selectedCategoryFilter);
    }
    return items;
  }, [inventoryItems, barcodeQuery, selectedCategoryFilter]);

  // Helper: compute system unit price based on pricingMode & decant ml
  const getSystemUnitPrice = (
    item: InventoryItemRecord,
    isDecantMl: boolean,
    mode: 'normal' | 'festival' | 'reseller'
  ): number => {
    const baseSelling = item.retailPrice;
    const resellerRate =
      item.resellerPrice || item.partnerPrice || item.wholesalePrice || 0;

    let unitRate = mode === 'reseller' ? resellerRate : baseSelling;

    if (mode === 'festival') {
      if (item.festivalPrice && item.festivalPrice > 0) {
        unitRate = item.festivalPrice;
      } else if (item.partnerPrice && item.partnerPrice > 0) {
        unitRate = item.partnerPrice;
      } else {
        const activePromo = promotionRules.find(
          (r) =>
            r.isActive &&
            (!r.applicableSkus ||
              r.applicableSkus.length === 0 ||
              r.applicableSkus.includes(item.sku)) &&
            !(r.festivalType === 'خرید بالای X قلم' && r.discountType === 'fixed')
        );
        if (activePromo) {
          if (activePromo.discountType === 'percent') {
            unitRate = Math.round(unitRate * (1 - activePromo.discountValue / 100));
          } else {
            unitRate = Math.max(0, unitRate - activePromo.discountValue);
          }
        } else {
          unitRate = Math.round(unitRate * 0.9);
        }
      }
    }

    if (isDecantMl) {
      const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
      const perMlBase = Math.round(unitRate / Math.max(1, bottleVol));
      return Math.round(perMlBase * 1.15);
    }

    return unitRate;
  };

  // Add item to cart
  const handleAddItemToCart = (item: InventoryItemRecord, asDecantMl = false) => {
    const canDecant =
      asDecantMl &&
      (item.allowDecantSale || item.category === 'جویس و سالت');

    const sysPrice = getSystemUnitPrice(item, Boolean(canDecant), pricingMode);
    const defaultWh: WarehouseKey =
      (item.warehouseStock?.vitrine || 0) > 0 ? 'vitrine' : 'central_external';

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (r) => r.item.sku === item.sku && r.isDecantMl === Boolean(canDecant)
      );
      if (existingIndex >= 0) {
        return prev.map((r, idx) =>
          idx === existingIndex
            ? { ...r, qty: r.qty + (canDecant ? 10 : 1) }
            : r
        );
      }
      return [
        ...prev,
        {
          rowId: `${item.sku}-${canDecant ? 'ml' : 'unit'}-${Date.now()}`,
          item,
          qty: canDecant ? 10 : 1,
          isDecantMl: Boolean(canDecant),
          manualUnitPrice: sysPrice,
          lineDiscount: 0,
          revealCost: false,
          warehouseKey: defaultWh,
        },
      ];
    });
  };

  // Polaris ساخت سریع action for barcode/item search when SKU does not exist yet
  const handleCreatableQuickItem = () => {
    const q = barcodeQuery.trim();
    if (!q) return;
    const newItem: InventoryItemRecord = {
      id: `item-quick-${Date.now()}`,
      sku: q.toUpperCase().startsWith('SKU') ? q.toUpperCase() : `SKU-${Date.now().toString().slice(-4)}`,
      name: q,
      category: 'جویس و سالت',
      brand: 'امکان',
      sector: 'vape',
      condition: 'آکبند',
      uomPrimary: 'عدد',
      stockQty: 10,
      reservedQty: 0,
      reorderLevel: 2,
      warehouseStock: {
        vitrine: 10,
        shop_storage: 0,
        central_external: 0,
        consignment: 0,
      },
      valuationRate: 350000,
      retailPrice: 480000,
      wholesalePrice: 430000,
      partnerPrice: 420000,
      resellerPrice: 420000,
      serialNumbers: [],
      batchNo: 'B-1404',
      expiryDate: '۱۴۰۵/۰۶/۳۰',
    };
    onCreateQuickInventoryItem?.(newItem);
    handleAddItemToCart(newItem, false);
    if (barcodeInputRef.current) {
      barcodeInputRef.current.value = '';
    }
    setBarcodeQuery('');
    setIsSearchPopoverOpen(false);
    barcodeInputRef.current?.focus({ preventScroll: true });
    onShowToast(`کالای «${newItem.name}» ساخته و به سبد اضافه شد.`);
  };

  // Persian & Arabic keyboard layout reverse mapping to standard English QWERTY
  const PERSIAN_TO_ENGLISH_KEYMAP: Record<string, string> = {
    'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'چ': ']',
    'ش': 'a', 'س': 's', 'ی': 'd', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'آ': 'h', 'ت': 'j', 'ة': 'j', 'ن': 'k', 'م': 'l', 'ک': ';', 'ك': ';', 'گ': "'",
    'ظ': 'z', 'ط': 'x', 'ز': 'c', 'ر': 'v', 'ذ': 'b', 'د': 'n', 'پ': 'm', 'ء': 'm', 'ئ': 'm', 'و': ',', 'ؤ': 'v',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };

  const reversePersianKeyboardToEnglish = (str: string): string => {
    return str
      .split('')
      .map((char) => PERSIAN_TO_ENGLISH_KEYMAP[char] || PERSIAN_TO_ENGLISH_KEYMAP[char.toLowerCase()] || char)
      .join('');
  };

  const lastProcessedScanRef = useRef<{ value: string; timestamp: number } | null>(null);

  // Authoritative single barcode scanner processor:
  // Strictly matches exact SKU or exact Name. Never falls back to matches[0] on scan!
  // Debounced by 450ms across both hardware hook and input Enter to eliminate duplicate/wrong items.
  const processBarcodeScan = (rawInput: string) => {
    const cleanInput = rawInput.trim();
    if (!cleanInput || cleanInput.length < 2) {
      barcodeInputRef.current?.focus({ preventScroll: true });
      return;
    }

    const now = Date.now();
    const normalizedInput = cleanInput.toLocaleLowerCase();
    const lastScan = lastProcessedScanRef.current;
    if (
      lastScan?.value === normalizedInput &&
      now - lastScan.timestamp < 650
    ) {
      return;
    }
    lastProcessedScanRef.current = { value: normalizedInput, timestamp: now };

    // Strict matching (exact SKU, reverse-mapped Persian keyboard, or exact Name)
    const matchedItem = matchBarcodeToInventory(inventoryItems, cleanInput);

    if (matchedItem) {
      // Exactly ONE item added
      handleAddItemToCart(matchedItem, false);

      // Synchronously clear DOM input and React state immediately
      if (barcodeInputRef.current) {
        barcodeInputRef.current.value = '';
      }
      setBarcodeQuery('');
      setIsSearchPopoverOpen(false);
      barcodeInputRef.current?.focus({ preventScroll: true });
    } else {
      // Do NOT blindly add matches[0]! Instead keep query in input & notify cashier
      setBarcodeQuery(cleanInput);
      setIsSearchPopoverOpen(true);
      onShowToast(`کالایی با بارکد یا کد «${cleanInput}» یافت نشد؛ با دکمه (+) سریع بسازید.`);
      barcodeInputRef.current?.focus({ preventScroll: true });
    }
  };

  // Hardware Barcode Scanner Hook (catches background scans when not focusing input)
  useBarcodeScanner({
    enabled: activeView === 'pos',
    onScan: (scannedCode) => {
      processBarcodeScan(scannedCode);
    },
  });

  // Barcode scanner & Catalog autocomplete keyboard navigation (ArrowDown, ArrowUp, Enter)
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const popoverItems = filteredCatalogItems.slice(0, 6);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isSearchPopoverOpen) setIsSearchPopoverOpen(true);
      setActiveSearchIndex((prev) => {
        const next = prev + 1 < popoverItems.length ? prev + 1 : 0;
        searchItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isSearchPopoverOpen) setIsSearchPopoverOpen(true);
      setActiveSearchIndex((prev) => {
        const next = prev - 1 >= 0 ? prev - 1 : Math.max(0, popoverItems.length - 1);
        searchItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isSearchPopoverOpen && activeSearchIndex >= 0 && activeSearchIndex < popoverItems.length) {
        const chosen = popoverItems[activeSearchIndex];
        handleAddItemToCart(chosen, false);
        if (barcodeInputRef.current) barcodeInputRef.current.value = '';
        setBarcodeQuery('');
        setIsSearchPopoverOpen(false);
        setActiveSearchIndex(-1);
        barcodeInputRef.current?.focus({ preventScroll: true });
        return;
      }
      const domVal = barcodeInputRef.current?.value ?? '';
      const rawQ = (domVal || barcodeQuery || '').trim();
      if (!rawQ) {
        barcodeInputRef.current?.focus({ preventScroll: true });
        return;
      }
      processBarcodeScan(rawQ);
      setActiveSearchIndex(-1);
    } else if (e.key === 'Escape') {
      setIsSearchPopoverOpen(false);
      setActiveSearchIndex(-1);
      barcodeInputRef.current?.focus({ preventScroll: true });
    }
  };

  // Customer Autocomplete Keyboard Navigation (ArrowDown, ArrowUp, Enter)
  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowCustomerDropdown(true);
      setActiveCustomerIndex((prev) => {
        const next = prev + 1 < matchingCustomers.length ? prev + 1 : 0;
        customerItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowCustomerDropdown(true);
      setActiveCustomerIndex((prev) => {
        const next = prev - 1 >= 0 ? prev - 1 : Math.max(0, matchingCustomers.length - 1);
        customerItemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeCustomerIndex >= 0 && activeCustomerIndex < matchingCustomers.length) {
        const chosen = matchingCustomers[activeCustomerIndex];
        setSelectedCustomer(chosen);
        setCustomerSearch(`${chosen.fullName} (${chosen.phone || 'بدون شماره'})`);
        setShowCustomerDropdown(false);
        setActiveCustomerIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowCustomerDropdown(false);
      setActiveCustomerIndex(-1);
    }
  };

  // Switch pricing mode and recalculate default prices
  const handleSwitchPricingMode = (newMode: 'normal' | 'festival' | 'reseller') => {
    setPricingMode(newMode);
    setCart((prev) =>
      prev.map((row) => ({
        ...row,
        manualUnitPrice: getSystemUnitPrice(row.item, row.isDecantMl, newMode),
      }))
    );
  };

  const handleAddServiceLine = () => {
    if (!serviceTitle.trim() || serviceFee <= 0) {
      onShowToast('عنوان خدمت و مبلغ دستمزد را وارد کنید.');
      return;
    }
    const consumable = inventoryItems.find((i) => i.sku === linkedConsumableSku);
    const neededConsumableQty = consumable ? Math.max(1, Number(linkedConsumableQty) || 1) : 0;
    if (!isEstimatedConsumable && consumable && (consumable.warehouseStock?.vitrine ?? consumable.stockQty) < neededConsumableQty) {
      onShowToast(`موجودی کالای مصرفی «${consumable.name}» (${consumable.sku}) کافی نیست.`);
      return;
    }
    const matCost = isEstimatedConsumable
      ? Math.max(0, Number(estimatedMaterialCost) || 0)
      : (consumable ? neededConsumableQty * consumable.valuationRate : 0);

    const newService: PosServiceLineItem = {
      id: `srv-${Date.now()}`,
      serviceTitle: serviceTitle.trim(),
      feeAmount: Math.max(0, Number(serviceFee) || 0),
      linkedConsumableSku: consumable?.sku,
      linkedConsumableName: consumable?.name,
      linkedConsumableQty: isEstimatedConsumable ? undefined : (consumable ? neededConsumableQty : undefined),
      isEstimatedConsumption: isEstimatedConsumable,
      estimatedMaterialCost: isEstimatedConsumable ? matCost : undefined,
      consumableCost: matCost,
    };
    setServiceLines((prev) => [...prev, newService]);
    setServiceTitle('');
    setServiceFee(0);
    setLinkedConsumableSku('');
    setLinkedConsumableQty(1);
    setIsEstimatedConsumable(false);
    setEstimatedMaterialCost(0);
    onShowToast(`خدمت «${newService.serviceTitle}» به فاکتور اضافه شد.`);
  };

  // Calculate Totals via posService (Exact decimal arithmetic with Largest Remainder line allocation)
  const {
    goodsTotal,
    servicesTotal,
    totalLineDiscounts,
    festivalExtraDiscount,
    grandTotal,
    effectivePaidAmount,
    creditReceivableAmount,
    cartLinesWithDiscount,
  } = useMemo(
    () =>
      calculatePosCartTotals({
        cart,
        serviceLines,
        pricingMode,
        promotionRules,
        paidAmountInput,
      }),
    [cart, serviceLines, pricingMode, promotionRules, paidAmountInput]
  );

  // Live-synced customer record from contacts prop (BUG-APP-04 / BUG-POS-02)
  const liveSelectedCustomer = useMemo(() => {
    if (!selectedCustomer) return null;
    return (
      contacts.find(
        (c) =>
          c.id === selectedCustomer.id ||
          c.fullName.trim() === selectedCustomer.fullName.trim()
      ) || selectedCustomer
    );
  }, [contacts, selectedCustomer]);

  // Customer Store Credit available and applied
  const customerCreditAvailable = liveSelectedCustomer?.creditBalance ?? 0;
  const usedCreditBalance = (applyCustomerCredit && customerCreditAvailable > 0)
    ? Math.min(grandTotal, customerCreditAvailable)
    : 0;
  const payableAfterCredit = Math.max(0, grandTotal - usedCreditBalance);

  // Effective Paid Amount and Credit Receivable based on payableAfterCredit
  const finalEffectivePaidAmount = paidAmountInput !== null
    ? Math.max(0, paidAmountInput)
    : payableAfterCredit;
  const finalCreditReceivableAmount = Math.max(0, payableAfterCredit - finalEffectivePaidAmount);

  // Customer filter (Name or Phone)
  const matchingCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return contacts.slice(0, 12);
    return contacts.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.sourceCode && c.sourceCode.toLowerCase().includes(q))
    );
  }, [contacts, customerSearch]);

  const matchingReferrals = useMemo(() => {
    const q = referralSearch.trim().toLowerCase();
    if (!q) return contacts.slice(0, 8);
    return contacts.filter(
      (c) => c.fullName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [contacts, referralSearch]);

  // Polaris Sheet Save Handler: New Customer
  const handleCreateQuickCustomer = () => {
    if (isSavingCustomer) return;
    if (!newCustName.trim()) {
      onShowToast('نام مشتری جدید الزامی است.');
      return;
    }
    setIsSavingCustomer(true);
    const created: CustomerContactRecord = {
      id: `cust-${Date.now()}`,
      sourceCode: `C-${contacts.length + 101}`,
      fullName: newCustName.trim(),
      personType: 'حقیقی',
      role: 'مشتری عادی',
      contactCategory: 'customer',
      phone: newCustPhone.trim(),
      vapingStyle: newCustStyle,
      notes: 'ثبت سریع از شیت صندوق',
    };
    onAddQuickCustomer(created);
    setSelectedCustomer(created);
    setCustomerSearch(`${created.fullName} (${created.phone || 'بدون شماره'})`);
    setNewCustName('');
    setNewCustPhone('');
    setIsSavingCustomer(false);
    setIsCustomerSheetOpen(false);
  };



  // Validate and initiate POS checkout: Opens explicit Confirmation Modal
  const handleSubmitPosInvoice = () => {
    if (isSubmittingSaleRef.current || isSubmittingSale) return;
    if (cart.length === 0 && serviceLines.length === 0) {
      onShowToast('سبد صندوق خالی است؛ حداقل یک کالا یا خدمت وارد کنید.');
      return;
    }
    if (!paymentAccountCode) {
      onShowToast('لطفاً روش پرداخت (کارتخوان، کارت به کارت یا نقد) را انتخاب کنید.');
      return;
    }
    if (finalCreditReceivableAmount > 0 && !selectedCustomer && !customerSearch.trim()) {
      onShowToast('برای ثبت فاکتور نسیه (مانده طلب)، انتخاب مشتری الزامی است.');
      return;
    }
    setShowConfirmSaleModal(true);
  };

  // Execution after explicit confirmation in modal
  const executePosCheckout = () => {
    if (isSubmittingSaleRef.current || isSubmittingSale) return;
    isSubmittingSaleRef.current = true;
    setIsSubmittingSale(true);

    const paymentMethodLabel: 'کارتخوان (پوز)' | 'کارت بانکی (کارت به کارت)' | 'نقد (صندوق مغازه)' =
      paymentAccountCode === '110101'
        ? 'کارتخوان (پوز)'
        : paymentAccountCode === '110102'
          ? 'کارت بانکی (کارت به کارت)'
          : 'نقد (صندوق مغازه)';

    const effectiveCart = (cartLinesWithDiscount && cartLinesWithDiscount.length === cart.length)
      ? cartLinesWithDiscount
      : cart;

    const payload: PosCheckoutPayload = {
      cartLines: effectiveCart.map((r: any) => {
        const bottleVol = r.item.bottleVolumeMl || r.item.liquidVolumeMl || 60;
        let unitCost = r.isDecantMl
          ? calculateCostPerMl(r.item.valuationRate, bottleVol)
          : r.item.valuationRate;
        if (r.item.isBundle && r.item.bundleComponentItems && r.item.bundleComponentItems.length > 0) {
          const dynamicBundleCost = r.item.bundleComponentItems.reduce((sum: number, comp: any) => {
            const found = inventoryItems.find((i) => i.sku === comp.sku);
            return sum + (found ? (found.valuationRate || 0) * comp.qty : 0);
          }, 0);
          if (dynamicBundleCost > 0) unitCost = dynamicBundleCost;
        }
        const gross = Math.round(r.qty * r.manualUnitPrice);
        const lDisc = Math.max(0, Number(r.lineDiscount) || 0);
        return {
          sku: r.item.sku,
          name: r.item.name,
          qty: r.qty,
          uom: r.isDecantMl ? 'میلی‌لیتر' : 'عدد',
          isDecantMl: r.isDecantMl,
          systemUnitPrice: getSystemUnitPrice(r.item, r.isDecantMl, pricingMode),
          finalManualUnitPrice: r.manualUnitPrice,
          lineDiscount: lDisc,
          unitValuationCost: unitCost,
          sector:
            r.item.sector ||
            (r.item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape'),
          warehouseKey: r.warehouseKey,
          allocatedHeaderDiscount: r.allocatedHeaderDiscount || lDisc,
          netLineAmount: r.netLineAmount ?? Math.max(0, gross - lDisc),
        };
      }),
      serviceLines,
      pricingMode,
      grossTotal: goodsTotal + servicesTotal,
      festivalDiscountAmount: festivalExtraDiscount,
      totalLineDiscounts,
      netTotal: grandTotal,
      paidAmount: finalEffectivePaidAmount,
      creditReceivableAmount: finalCreditReceivableAmount,
      usedCreditBalance: usedCreditBalance > 0 ? usedCreditBalance : undefined,
      paymentAccountCode: (paymentAccountCode || '110101') as '110101' | '110102' | '110103',
      paymentMethodLabel,
      customerName: selectedCustomer?.fullName || customerSearch.trim() || 'مشتری حضوری',
      customerPhone: selectedCustomer?.phone,
      referralName: selectedReferral || undefined,
    };

    window.setTimeout(() => {
      try {
        const ok = onCompletePosCheckout(payload);
        if (!ok) return;

        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('emkan_pos_draft_cart');
            window.sessionStorage.removeItem('farapay_pos_draft_cart');
          }
        } catch {}

        setLastReceiptSnapshot(payload);
        setShowThermalReceipt(true);
        setCart([]);
        setServiceLines([]);
        setPaidAmountInput(null);
        barcodeInputRef.current?.focus();
      } finally {
        isSubmittingSaleRef.current = false;
        setIsSubmittingSale(false);
      }
    }, 150);
  };



  const activePostedInvoices = salesInvoices.filter((inv) => {
    if (inv.docstatus !== 1 || inv.returnAgainst || inv.status === 'ابطال‌شده') return false;
    const pastRets = salesInvoices.filter((r) => r.returnAgainst === inv.id && r.docstatus === 1);
    if (pastRets.length === 0) return true;
    return (inv.lines || []).some((l) => {
      const returnedForLine = pastRets.reduce((sum, r) => {
        const match = r.lines?.find((rl) => (l.id && rl.id === l.id) || rl.sku === l.sku);
        return sum + (match ? match.qty : 0);
      }, 0);
      return returnedForLine < l.qty;
    });
  });

  const pricingModeBadgeLabel =
    pricingMode === 'festival'
      ? 'فروش جشنواره'
      : pricingMode === 'reseller'
        ? 'نرخ همکاری (ریسلر)'
        : 'فروش عادی';

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Tabs & Pricing Mode */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3 shadow-xs">
        <div className="inline-flex flex-wrap items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 gap-1">
          <button
            type="button"
            onClick={() => setActiveView('pos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'pos'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>ترمینال فروش (POS)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('returns')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'returns'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>برگشت از فروش</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('reseller_pricelist')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'reseller_pricelist'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-500" />
            <span>لیست قیمت همکاران (ریسلر)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('festival_pricelist')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'festival_pricelist'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>لیست قیمت جشنواره</span>
          </button>
        </div>

        {/* Secondary Segmented ButtonGroup: Pricing Mode Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">نرخ‌گذاری صندوق:</span>
          <PolarisButtonGroup segmented>
            <PolarisButton
              size="slim"
              outline={pricingMode !== 'normal'}
              onClick={() => handleSwitchPricingMode('normal')}
              className={pricingMode === 'normal' ? 'ring-2 ring-indigo-600 font-bold' : ''}
            >
              فروش عادی
            </PolarisButton>
            <PolarisButton
              size="slim"
              outline={pricingMode !== 'festival'}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={() => handleSwitchPricingMode('festival')}
              className={pricingMode === 'festival' ? 'ring-2 ring-indigo-600 font-bold' : ''}
            >
              فروش جشنواره
            </PolarisButton>
            <PolarisButton
              size="slim"
              outline={pricingMode !== 'reseller'}
              icon={<Users className="w-3.5 h-3.5" />}
              onClick={() => handleSwitchPricingMode('reseller')}
              className={pricingMode === 'reseller' ? 'ring-2 ring-indigo-600 font-bold' : ''}
            >
              ریسلر (همکار)
            </PolarisButton>
          </PolarisButtonGroup>
        </div>
      </div>

      {/* =====================================================================
          VIEW 1: POS TERMINAL (Polaris IndexTable Catalog + Compact Cart Table)
         ===================================================================== */}
      {activeView === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT 7 COLS: ساخت سریع Autocomplete Barcode Search + Polaris IndexTable Catalog */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            {/* Search & Barcode Scanner Input with Polaris Popover + ساخت سریع Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  autoFocus
                  value={barcodeQuery}
                  onFocus={() => setIsSearchPopoverOpen(true)}
                  onChange={(e) => {
                    setBarcodeQuery(e.target.value);
                    setActiveSearchIndex(-1);
                    setIsSearchPopoverOpen(true);
                  }}
                  onKeyDown={handleBarcodeKeyDown}
                  placeholder="اسکن بارکد یا جستجوی نام و کد کالا (Enter = افزودن سریع)..."
                  className="w-full pr-9 pl-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                />
                {barcodeQuery.trim() && (
                  <button
                    type="button"
                    title="ساخت سریع کالای جدید"
                    onClick={handleCreatableQuickItem}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Polaris Autocomplete Popover with Arrow Key Navigation */}
                {isSearchPopoverOpen && barcodeQuery.trim().length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredCatalogItems.slice(0, 6).map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        ref={(el) => { searchItemRefs.current[index] = el; }}
                        onClick={() => {
                          handleAddItemToCart(item, false);
                          if (barcodeInputRef.current) {
                            barcodeInputRef.current.value = '';
                          }
                          setBarcodeQuery('');
                          setIsSearchPopoverOpen(false);
                          setActiveSearchIndex(-1);
                          barcodeInputRef.current?.focus({ preventScroll: true });
                        }}
                        className={`w-full px-3 py-2 text-right transition-colors flex items-center justify-between cursor-pointer ${
                          activeSearchIndex === index
                            ? 'bg-indigo-50 dark:bg-indigo-950/80 ring-1 ring-indigo-500 font-bold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <span className="font-mono font-bold text-indigo-600 ml-2">
                            {item.sku}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {formatCurrency(getSystemUnitPrice(item, false, pricingMode))} ت
                        </span>
                      </button>
                    ))}
                    {onCreateQuickInventoryItem && (
                      <button
                        type="button"
                        onClick={handleCreatableQuickItem}
                        className="w-full px-3 py-2 text-right bg-indigo-50/90 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-between"
                      >
                        <span className="flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          <span>افزودن فوری «{barcodeQuery.trim()}» به کالاها و سبد</span>
                        </span>
                        <span className="text-[10px] font-mono">ساخت سریع</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Category Filter Pills (Horizontal Zero-Scroll Filter) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryFilter === cat
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Compact Product Catalog (Zero Horizontal Scroll, High Density) */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-hidden bg-white dark:bg-slate-900">
              <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCatalogItems.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    کالایی با این مشخصات یافت نشد.
                  </div>
                ) : (
                  filteredCatalogItems.map((item) => {
                    const canDecant =
                      item.allowDecantSale || item.category === 'جویس و سالت';
                    const activePrice = getSystemUnitPrice(item, false, pricingMode);
                    const openMl = item.openBottleRemainingMl || 0;

                    return (
                      <div
                        key={item.id}
                        className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-800/40">
                              {item.sku}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {item.name}
                            </span>
                            {item.isBundle && (
                              <span className="text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 px-1.5 py-0.5 rounded font-semibold">
                                باندل
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                            <span>{item.category}</span>
                            {item.flavor && <span>· {item.flavor}</span>}
                            {item.nicotine && <span>· {item.nicotine}</span>}
                            <span
                              className={
                                item.stockQty > 0
                                  ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                                  : 'text-rose-600 font-bold'
                              }
                            >
                              {item.stockQty > 0
                                ? `موجودی: ${item.stockQty} ${item.uomPrimary}`
                                : 'ناموجود'}
                              {openMl > 0 && ` (+${openMl}ml دکانت)`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-left tabular-nums text-xs sm:text-sm">
                            {formatCurrency(activePrice)} ت
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <PolarisButton
                              size="slim"
                              icon={<Plus className="w-3 h-3" />}
                              onClick={() => handleAddItemToCart(item, false)}
                            >
                              عدد
                            </PolarisButton>
                            {canDecant && (
                              <PolarisButton
                                size="slim"
                                outline
                                icon={<Droplets className="w-3 h-3 text-sky-600" />}
                                title="فروش میلی‌لیتری (دکانت باز)"
                                onClick={() => handleAddItemToCart(item, true)}
                              >
                                ml
                              </PolarisButton>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Polaris Collapsible: Technical Repair / Service Lines (Closed by default, opens with +) */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                  <span>خدمات فنی و تعمیرات ({serviceLines.length} مورد در فاکتور)</span>
                </span>
                <PolarisButton
                  size="slim"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setIsServiceCollapsibleOpen((prev) => !prev)}
                >
                  {isServiceCollapsibleOpen ? 'بستن فرم خدمات' : 'افزودن خدمت فنی'}
                </PolarisButton>
              </div>

              <PolarisCollapsible
                id="pos-service-collapsible"
                open={isServiceCollapsibleOpen}
                className="mt-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs">
                  <div className="sm:col-span-4">
                    <CreatableCombobox
                      label="عنوان خدمت فنی"
                      value={serviceTitle}
                      onChange={(val) => {
                        setServiceTitle(val);
                        if (val.includes('پنبه') || val.includes('کویل‌بندی') || val.includes('سیم')) {
                          setIsEstimatedConsumable(true);
                          if (!estimatedMaterialCost) setEstimatedMaterialCost(15000);
                        }
                      }}
                      options={[
                        'تعویض پنبه و کویل',
                        'سرویس کامل دستگاه پاد',
                        'شستشو و جرم‌گیری کارتریج و اتومایزر',
                        'تعویض شیشه تانک و اورینگ',
                        'تنظیم و کویل‌بندی دستی RDA/RTA',
                      ]}
                      placeholder="جستجو یا عنوان جدید..."
                      allowCreate={true}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-500 mb-1">دستمزد خدمت (تومان)</label>
                    <CurrencyInput
                      value={serviceFee || ''}
                      onChange={(val) => setServiceFee(val)}
                      placeholder="دستمزد"
                      className="w-full px-2.5 py-1.5 font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums text-left"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <CreatableCombobox
                      label="کالای مصرفی از انبار (مثلاً پنبه ورقه‌ای یا کویل)"
                      value={
                        linkedConsumableSku
                          ? (() => {
                              const itm = inventoryItems.find((i) => i.sku === linkedConsumableSku);
                              return itm ? `${itm.sku} — ${itm.name}` : linkedConsumableSku;
                            })()
                          : ''
                      }
                      onChange={(val) => {
                        if (!val) {
                          setLinkedConsumableSku('');
                          return;
                        }
                        const sku = val.split(' — ')[0].trim();
                        const found = inventoryItems.find((i) => i.sku === sku || i.name === val);
                        setLinkedConsumableSku(found ? found.sku : '');
                        if (found && (found.name.includes('پنبه') || found.category.includes('پنبه'))) {
                          setIsEstimatedConsumable(true);
                          if (!estimatedMaterialCost) setEstimatedMaterialCost(15000);
                        }
                      }}
                      options={inventoryItems
                        .filter((item) => !item.isVirtualDecantBottle)
                        .map(
                          (i) =>
                            `${i.sku} — ${i.name} (موجودی: ${i.stockQty})`
                        )}
                      placeholder="انتخاب ملزومات مصرفی..."
                      allowCreate={false}
                    />
                  </div>
                </div>

                {/* Variable Consumption / Cotton Mode Toggle & Material Cost */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={isEstimatedConsumable}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsEstimatedConsumable(checked);
                        if (checked && !estimatedMaterialCost) setEstimatedMaterialCost(15000);
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>مصرف متغیر/تخمینی بر حسب بهای تمام‌شده (مانند پنبه ورقه‌ای یا سیم)</span>
                  </label>

                  {isEstimatedConsumable ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">بهای پنبه مصرفی:</span>
                      <CurrencyInput
                        value={estimatedMaterialCost || ''}
                        onChange={(val) => setEstimatedMaterialCost(val)}
                        placeholder="۱۵,۰۰۰"
                        className="w-24 px-2 py-1 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded tabular-nums text-left text-xs"
                      />
                      <span className="text-[10px] text-slate-400">تومان</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">تعداد مصرفی کامل:</span>
                      <input
                        type="number"
                        min={1}
                        disabled={!linkedConsumableSku}
                        value={linkedConsumableQty || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setLinkedConsumableQty(Math.max(1, Number(e.target.value) || 1))
                        }
                        placeholder="۱"
                        className="w-16 px-2 py-1 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded tabular-nums disabled:opacity-50 text-xs text-center"
                      />
                    </div>
                  )}
                </div>

                {/* Service Margin Live Preview & Add Button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                    {serviceFee > 0 && (
                      <span>
                        سود ناخالص خدمت: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatCurrency(Math.max(0, serviceFee - (isEstimatedConsumable ? estimatedMaterialCost : 0)))} تومان</strong>
                        {isEstimatedConsumable && estimatedMaterialCost > 0 && (
                          <span className="text-[10px] text-slate-400 mr-1.5">({formatCurrency(serviceFee)} دستمزد - {formatCurrency(estimatedMaterialCost)} بهای پنبه)</span>
                        )}
                      </span>
                    )}
                  </div>

                  <PolarisButton
                    size="slim"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    onClick={handleAddServiceLine}
                  >
                    ثبت خدمت به فاکتور
                  </PolarisButton>
                </div>
              </PolarisCollapsible>
            </div>
          </div>

          {/* RIGHT 5 COLS: Sticky Customer Selector, Compact Zero-Scroll Cart & Settlement */}
          <div className="lg:col-span-5 sticky top-3 max-h-[calc(100vh-1.5rem)] flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
            {/* Customer Search + History Expand + (+) Button to open Polaris Sheet */}
            <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  مشتری فاکتور (نام یا موبایل)
                </label>
                <div className="flex items-center gap-1.5">
                  <PolarisButton
                    size="slim"
                    icon={<FileText className="w-3.5 h-3.5 text-indigo-600" />}
                    title="مشاهده سوابق و فاکتورهای قبلی مشتری (Expand)"
                    onClick={() => setIsCustomerHistoryModalOpen(true)}
                  >
                    سوابق (Expand)
                  </PolarisButton>
                  <PolarisButton
                    size="slim"
                    plain
                    onClick={() => setIsReferralCollapsibleOpen((prev) => !prev)}
                  >
                    {selectedReferral ? `معرف: ${selectedReferral}` : '+ معرف'}
                  </PolarisButton>
                  <PolarisButton
                    size="slim"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    title="ثبت مشتری جدید در شیت کشویی (+)"
                    onClick={() => setIsCustomerSheetOpen(true)}
                  >
                    مشتری جدید
                  </PolarisButton>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={customerSearch}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomer(null);
                    setShowCustomerDropdown(true);
                  }}
                  onKeyDown={handleCustomerKeyDown}
                  placeholder="تایپ نام یا موبایل مشتری (خالی = مشتری حضوری)..."
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />

                {/* Customer Store Credit Banner */}
                {liveSelectedCustomer && (liveSelectedCustomer.creditBalance ?? 0) > 0 && (
                  <div className="mt-1.5 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        id="applyCustomerCreditCheckbox"
                        checked={applyCustomerCredit}
                        onChange={(e) => setApplyCustomerCredit(e.target.checked)}
                        className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="applyCustomerCreditCheckbox" className="font-bold cursor-pointer">
                        کسر از بستانکاری قبلی مشتری (حاصل از مرجوعی):
                      </label>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {formatCurrency(liveSelectedCustomer.creditBalance ?? 0)} تومان
                    </span>
                  </div>
                )}

                {/* Customer Debt Alert */}
                {liveSelectedCustomer && (liveSelectedCustomer.debitBalance ?? 0) > 0 && (
                  <div className="mt-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-center justify-between">
                    <span className="font-bold">⚠️ مانده بدهی معوق قبلی این مشتری:</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                      {formatCurrency(liveSelectedCustomer.debitBalance ?? 0)} تومان
                    </span>
                  </div>
                )}

                {/* Autocomplete Dropdown with Arrow Navigation */}
                {showCustomerDropdown && customerSearch.trim().length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {matchingCustomers.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        ref={(el) => { customerItemRefs.current[idx] = el; }}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch(`${c.fullName} (${c.phone || 'بدون شماره'})`);
                          setShowCustomerDropdown(false);
                          setActiveCustomerIndex(-1);
                        }}
                        className={`w-full px-3 py-2 text-right flex items-center justify-between cursor-pointer transition-colors ${
                          activeCustomerIndex === idx
                            ? 'bg-indigo-50 dark:bg-indigo-950/80 ring-1 ring-indigo-500 font-bold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.fullName}
                        </span>
                        <div className="flex items-center gap-2">
                          {(c.creditBalance ?? 0) > 0 && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                              طلبکار: {formatCurrency(c.creditBalance ?? 0)} ت
                            </span>
                          )}
                          {(c.debitBalance ?? 0) > 0 && (
                            <span className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-1.5 py-0.5 rounded font-bold">
                              بدهکار: {formatCurrency(c.debitBalance ?? 0)} ت
                            </span>
                          )}
                          <span className="font-mono text-slate-500">{c.phone || '—'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <PolarisCollapsible
                id="pos-referral-collapsible"
                open={isReferralCollapsibleOpen}
                className="pt-1"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={referralSearch}
                    onChange={(e) => setReferralSearch(e.target.value)}
                    placeholder="نام یا شماره معرف..."
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  {referralSearch.trim().length > 0 && !selectedReferral && (
                    <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-36 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {matchingReferrals.map((refCust) => (
                        <button
                          key={refCust.id}
                          type="button"
                          onClick={() => {
                            setSelectedReferral(refCust.fullName);
                            setReferralSearch(refCust.fullName);
                            setIsReferralCollapsibleOpen(false);
                          }}
                          className="w-full px-2.5 py-1.5 text-right hover:bg-slate-50 flex justify-between"
                        >
                          <span>{refCust.fullName}</span>
                          <span className="font-mono text-slate-400">{refCust.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </PolarisCollapsible>
            </div>

            {/* Compact Header for Cart Items + Discreet Eye Toggle */}
            <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  اقلام سبد خرید ({cart.length + serviceLines.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowCartBuyPrice((prev) => !prev)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  aria-label="مشاهده کد مخفی سبد"
                >
                  {showCartBuyPrice ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                {pricingModeBadgeLabel}
              </span>
            </div>

            {/* Compact Zero-Horizontal-Scroll Cart Items List */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-0.5 max-h-[300px]">
              {cart.length === 0 && serviceLines.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  سبد خرید خالی است؛ کالایی را از کاتالوگ انتخاب یا بارکد آن را اسکن کنید.
                </div>
              ) : (
                <>
                  {cart.map((row) => {
                    const bottleVol = row.item.bottleVolumeMl || row.item.liquidVolumeMl || 60;
                    let rowBuyCost = row.isDecantMl
                      ? calculateCostPerMl(row.item.valuationRate, bottleVol)
                      : row.item.valuationRate;
                    if (row.item.isBundle && row.item.bundleComponentItems && row.item.bundleComponentItems.length > 0) {
                      const dynamicBundleCost = row.item.bundleComponentItems.reduce((sum, comp) => {
                        const found = inventoryItems.find((i) => i.sku === comp.sku);
                        return sum + (found ? (found.valuationRate || 0) * comp.qty : 0);
                      }, 0);
                      if (dynamicBundleCost > 0) rowBuyCost = dynamicBundleCost;
                    }
                    const canItemDecant =
                      row.item.allowDecantSale || row.item.category === 'جویس و سالت';
                    const lineGross = Math.round(row.qty * row.manualUnitPrice);
                    const lineDisc = Math.max(0, Number(row.lineDiscount) || 0);
                    const lineNet = Math.max(0, lineGross - lineDisc);

                    return (
                      <div
                        key={row.rowId}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 space-y-2 text-xs"
                      >
                        {/* Tier 1: Item Name, Warehouse Select, Decant toggle, Secret Cost, Trash */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate" title={row.item.name}>
                              {row.item.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[10px] text-slate-500">
                              <select
                                value={row.warehouseKey}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId
                                        ? { ...r, warehouseKey: e.target.value as WarehouseKey }
                                        : r
                                    )
                                  )
                                }
                                className="px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px]"
                              >
                                {warehouses && warehouses.length > 0 ? (
                                  warehouses.map((w) => (
                                    <option key={w.id} value={w.key}>
                                      {w.name}
                                    </option>
                                  ))
                                ) : (
                                  <>
                                    <option value="vitrine">ویترین</option>
                                    <option value="shop_storage">انبار مغازه</option>
                                    <option value="central_external">انبار مرکزی</option>
                                    <option value="consignment">امانی</option>
                                  </>
                                )}
                              </select>
                              {canItemDecant && (
                                <label className="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-300 font-semibold cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={row.isDecantMl}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setCart((prev) =>
                                        prev.map((r) =>
                                          r.rowId === row.rowId
                                            ? {
                                                ...r,
                                                isDecantMl: checked,
                                                qty: checked ? 10 : 1,
                                                manualUnitPrice: getSystemUnitPrice(r.item, checked, pricingMode),
                                              }
                                            : r
                                        )
                                      );
                                    }}
                                    className="rounded border-slate-300"
                                  />
                                  <span>فروش ml</span>
                                </label>
                              )}
                              {!privacyMasked && showCartBuyPrice && (
                                <span className="font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded tabular-nums">
                                  {formatCurrency(rowBuyCost)} ت
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            title="حذف از سبد"
                            onClick={() => {
                              setCart((prev) => prev.filter((r) => r.rowId !== row.rowId));
                              barcodeInputRef.current?.focus({ preventScroll: true });
                            }}
                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Tier 2: Qty Stepper, Unit Price, Line Discount Input, Net Total */}
                        <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
                          {/* Qty Controls */}
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setCart((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? { ...r, qty: Math.max(1, r.qty - 1) }
                                      : r
                                  )
                                )
                              }
                              className="w-5 h-6 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={row.qty || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setCart((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? { ...r, qty: val ? Math.max(1, val) : (0 as any) }
                                      : r
                                  )
                                );
                              }}
                              onBlur={() => {
                                setCart((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? { ...r, qty: Math.max(1, r.qty || 1) }
                                      : r
                                  )
                                );
                              }}
                              className="w-10 text-center font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded py-0.5 tabular-nums text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setCart((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? { ...r, qty: r.qty + 1 }
                                      : r
                                  )
                                )
                              }
                              className="w-5 h-6 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 font-bold"
                            >
                              +
                            </button>
                          </div>

                          {/* Unit price */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">فی:</span>
                            <CurrencyInput
                              value={row.manualUnitPrice || ''}
                              placeholder="فی"
                              onChange={(nextPrice) => {
                                setCart((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? { ...r, manualUnitPrice: Math.max(0, nextPrice) }
                                      : r
                                  )
                                );
                              }}
                              className="w-20 px-1 py-0.5 font-mono font-bold text-left bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded tabular-nums text-xs"
                            />
                          </div>

                          {/* Line Discount Input (Individual per product) */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-rose-500 font-bold">تخفیف:</span>
                            <CurrencyInput
                              value={row.lineDiscount || ''}
                              placeholder="۰"
                              onChange={(nextDiscount) => {
                                setCart((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId
                                      ? { ...r, lineDiscount: Math.max(0, nextDiscount) }
                                      : r
                                  )
                                );
                              }}
                              className="w-16 px-1 py-0.5 font-mono text-rose-600 font-bold text-left bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900/60 rounded tabular-nums text-xs"
                            />
                          </div>

                          {/* Line Net Total */}
                          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-left tabular-nums min-w-[65px]">
                            {formatCurrency(lineNet)} ت
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Service Lines Cards */}
                  {serviceLines.map((srv) => (
                    <div
                      key={srv.id}
                      className="p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-indigo-950 dark:text-indigo-200">
                          خدمت: {srv.serviceTitle}
                        </div>
                        <div className="text-[10px] text-indigo-700 dark:text-indigo-400 mt-0.5">
                          {srv.isEstimatedConsumption
                            ? `هزینه ملزومات تخمینی (پنبه): ${formatCurrency(srv.estimatedMaterialCost || 0)} ت`
                            : srv.linkedConsumableName
                            ? `مصرفی: ${srv.linkedConsumableName} × ${srv.linkedConsumableQty || 1}`
                            : 'بدون متریال'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-800 dark:text-indigo-200 tabular-nums">
                          {formatCurrency(srv.feeAmount)} ت
                        </span>
                        <button
                          type="button"
                          title="حذف خدمت"
                          onClick={() => {
                            setServiceLines((prev) => prev.filter((s) => s.id !== srv.id));
                            barcodeInputRef.current?.focus({ preventScroll: true });
                          }}
                          className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Totals Summary & 3 Liquidity Settlement Accounts */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>جمع ناخالص کالاها:</span>
                <span className="font-mono tabular-nums">{formatCurrency(goodsTotal)} تومان</span>
              </div>
              {servicesTotal > 0 && (
                <div className="flex justify-between text-indigo-600 dark:text-indigo-400">
                  <span>جمع خدمات فنی:</span>
                  <span className="font-mono tabular-nums">+{formatCurrency(servicesTotal)} تومان</span>
                </div>
              )}
              {totalLineDiscounts > 0 && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold">
                  <span>جمع کل تخفیف‌های اقلام:</span>
                  <span className="font-mono tabular-nums">-{formatCurrency(totalLineDiscounts)} تومان</span>
                </div>
              )}
              {festivalExtraDiscount > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                  <span>تخفیف جشنواره حجمی:</span>
                  <span className="font-mono tabular-nums">
                    -{formatCurrency(festivalExtraDiscount)} تومان
                  </span>
                </div>
              )}
              {usedCreditBalance > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 p-1.5 rounded">
                  <span>کسر از بستانکاری قبلی مشتری:</span>
                  <span className="font-mono tabular-nums">-{formatCurrency(usedCreditBalance)} تومان</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-200 dark:border-slate-700">
                <span>مبلغ قابل پرداخت نهایی:</span>
                <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(payableAfterCredit)} تومان
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    مبلغ دریافتی (تومان)
                  </label>
                  <CurrencyInput
                    value={paidAmountInput === null || paidAmountInput === 0 ? '' : paidAmountInput}
                    placeholder={formatCurrency(payableAfterCredit)}
                    onChange={(val) => setPaidAmountInput(val)}
                    className="w-full px-2.5 py-1.5 font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums text-left"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    مانده نسیه (حساب دریافتنی)
                  </label>
                  <div
                    className={`px-2.5 py-1.5 font-mono font-bold rounded-lg border tabular-nums ${
                      finalCreditReceivableAmount > 0
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {formatCurrency(finalCreditReceivableAmount)} تومان
                  </div>
                </div>
              </div>

              {/* 3 Liquidity Settlement Accounts */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  حساب تسویه (۳ حساب نقدینگی مجاز):
                </label>
                <PolarisButtonGroup segmented fullWidth>
                  {[
                    { code: '110101' as const, label: 'کارتخوان (پوز)' },
                    { code: '110102' as const, label: 'کارت به کارت' },
                    { code: '110103' as const, label: 'نقد صندوق' },
                  ].map((m) => (
                    <PolarisButton
                      key={m.code}
                      size="slim"
                      outline={paymentAccountCode !== m.code}
                      onClick={() => setPaymentAccountCode(m.code)}
                      className={`flex-1 ${
                        paymentAccountCode === m.code ? 'ring-2 ring-indigo-600 font-bold' : ''
                      }`}
                    >
                      {m.label}
                    </PolarisButton>
                  ))}
                </PolarisButtonGroup>
              </div>
            </div>

            {/* PRIMARY CHECKOUT & DIRECT TEXT RECEIPT EXPORT */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              <div className="flex-1">
                <PolarisButton
                  primary
                  fullWidth
                  size="large"
                  loading={isSubmittingSale}
                  disabled={isSubmittingSale || (cart.length === 0 && serviceLines.length === 0) || !paymentAccountCode}
                  icon={<Printer className="w-4 h-4" />}
                  onClick={handleSubmitPosInvoice}
                >
                  ثبت فاکتور ({pricingModeBadgeLabel}) و چاپ فیش
                </PolarisButton>
              </div>
              <PolarisButton
                size="large"
                outline
                disabled={(cart.length === 0 && serviceLines.length === 0) && !lastReceiptSnapshot}
                icon={<FileText className="w-4 h-4 text-indigo-600" />}
                onClick={() => {
                  const activeSnapshot: PosCheckoutPayload | null =
                    cart.length > 0 || serviceLines.length > 0
                      ? {
                          cartLines: cart.map((r) => {
                            const gross = Math.round(r.qty * r.manualUnitPrice);
                            const lDisc = Math.max(0, Number(r.lineDiscount) || 0);
                            return {
                              sku: r.item.sku,
                              name: r.item.name,
                              qty: r.qty,
                              uom: r.isDecantMl ? 'میلی‌لیتر' : 'عدد',
                              isDecantMl: r.isDecantMl,
                              systemUnitPrice: getSystemUnitPrice(r.item, r.isDecantMl, pricingMode),
                              finalManualUnitPrice: r.manualUnitPrice,
                              lineDiscount: lDisc,
                              unitValuationCost: r.item.valuationRate,
                              sector: r.item.sector || 'vape',
                              warehouseKey: r.warehouseKey,
                              netLineAmount: Math.max(0, gross - lDisc),
                            };
                          }),
                          serviceLines,
                          pricingMode,
                          grossTotal: goodsTotal + servicesTotal,
                          festivalDiscountAmount: festivalExtraDiscount,
                          totalLineDiscounts,
                          netTotal: grandTotal,
                          paidAmount: finalEffectivePaidAmount,
                          creditReceivableAmount: finalCreditReceivableAmount,
                          paymentAccountCode: (paymentAccountCode || '110101') as '110101' | '110102' | '110103',
                          paymentMethodLabel:
                            paymentAccountCode === '110101'
                              ? 'کارتخوان (پوز)'
                              : paymentAccountCode === '110102'
                                ? 'کارت بانکی (کارت به کارت)'
                                : 'نقد (صندوق مغازه)',
                          customerName: selectedCustomer?.fullName || customerSearch.trim() || 'مشتری حضوری',
                          customerPhone: selectedCustomer?.phone,
                        }
                      : lastReceiptSnapshot;

                  if (!activeSnapshot) return;
                  setLastReceiptSnapshot(activeSnapshot);
                  setReceiptModalTab('text');
                  setShowThermalReceipt(true);
                  const invNo = `POS-${salesInvoices.length + 1}`;
                  const txt = generatePlainTextReceipt({
                    invoiceNo: invNo,
                    customerName: activeSnapshot.customerName,
                    customerPhone: activeSnapshot.customerPhone,
                    date: formatPersianDate(new Date()),
                    cashierName: 'صندوق فروشگاه امکان',
                    cartLines: activeSnapshot.cartLines.map((l) => ({
                      name: l.name,
                      sku: l.sku,
                      qty: l.qty,
                      uom: l.uom,
                      finalManualUnitPrice: l.finalManualUnitPrice,
                      lineDiscount: l.lineDiscount,
                      netLineAmount: l.netLineAmount,
                    })),
                    serviceLines: activeSnapshot.serviceLines.map((s) => ({
                      serviceTitle: s.serviceTitle,
                      feeAmount: s.feeAmount,
                    })),
                    goodsTotal: activeSnapshot.grossTotal,
                    servicesTotal: activeSnapshot.serviceLines.reduce((s, x) => s + x.feeAmount, 0),
                    totalDiscount:
                      (activeSnapshot.totalLineDiscounts || 0) +
                      (activeSnapshot.festivalDiscountAmount || 0),
                    grandTotal: activeSnapshot.netTotal,
                    paidAmount: activeSnapshot.paidAmount,
                    paymentMethodLabel: activeSnapshot.paymentMethodLabel,
                  });
                  triggerBrowserDownload(txt, `${invNo}.txt`, 'text/plain;charset=utf-8');
                  onShowToast('فایل متنی فیش (.txt) دانلود شد و پیش‌نمایش متنی باز گردید.');
                }}
              >
                خروجی متن فیش (Text)
              </PolarisButton>
            </div>
          </div>
        </div>
      )}



      {/* =====================================================================
          VIEW 3: SALES RETURNS (Search customer/invoice, anti-fraud duplicate warning, per-item restocking fee, 2 resolution modes only)
         ===================================================================== */}
      {activeView === 'returns' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-indigo-600" />
                <span>ثبت قطعی مرجوعی کالا و صدور سند معکوس مالی و انبار</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                بدون امکان ثبت کالای جدید؛ جستجوی فاکتور و انتخاب اقلام خریداری‌شده همراه با کسر مجزای افت قیمت/تست برای هر سطر و هشدار مرجوعی تکراری
              </p>
            </div>
          </div>

          {/* Dynamic Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={returnSearchQuery}
              onChange={(e) => setReturnSearchQuery(e.target.value)}
              placeholder="جستجوی نام مشتری، شماره موبایل، شماره فاکتور یا نام کالا برای مرجوعی..."
              className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Invoices List / Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              ۱. انتخاب فاکتور فروش مرجع مشتری:
            </label>
            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-xs">
              {(() => {
                const q = returnSearchQuery.trim().toLowerCase();
                const matchedInvoices = salesInvoices.filter((inv) => {
                  if (inv.docstatus !== 1 || inv.returnAgainst || inv.status === 'ابطال‌شده') return false;
                  if (!q) return true;
                  return (
                    inv.invoiceNo.toLowerCase().includes(q) ||
                    inv.customerName.toLowerCase().includes(q) ||
                    (inv.customerPhone && inv.customerPhone.includes(q)) ||
                    (inv.itemsSummary && inv.itemsSummary.toLowerCase().includes(q)) ||
                    (inv.lines && inv.lines.some((l) => l.itemName.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q)))
                  );
                });

                if (matchedInvoices.length === 0) {
                  return (
                    <div className="p-4 text-center text-slate-400">
                      فاکتور فروش معتبری مطابق با جستجوی شما یافت نشد.
                    </div>
                  );
                }

                return matchedInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      setSelectedReturnInvoiceId(inv.id);
                      const initialItems: Record<string, { selected: boolean; qty: number; restockingFee: number }> = {};
                      inv.lines?.forEach((l) => {
                        const lineKey = l.id ? `${l.id}::${l.sku}` : l.sku;
                        const alreadyReturned = salesInvoices
                          .filter((s) => s.returnAgainst === inv.id && s.docstatus === 1)
                          .reduce((sum, retInv) => {
                            const matchLine = retInv.lines?.find(
                              (rl) => (l.id && rl.id === l.id) || rl.sku === l.sku
                            );
                            return sum + (matchLine ? matchLine.qty : 0);
                          }, 0);
                        const avail = Math.max(0, l.qty - alreadyReturned);
                        initialItems[lineKey] = {
                          selected: false,
                          qty: avail > 0 ? 1 : 0,
                          restockingFee: 0,
                        };
                      });
                      setReturnSelectedItems(initialItems);
                    }}
                    className={`w-full p-2.5 text-right flex items-center justify-between transition-colors cursor-pointer ${
                      selectedReturnInvoiceId === inv.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border-r-4 border-indigo-600 font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <span className="font-mono font-bold text-indigo-600 ml-2">{inv.invoiceNo}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{inv.customerName}</span>
                      {inv.customerPhone && <span className="font-mono text-slate-500 mr-2 text-[11px]">({inv.customerPhone})</span>}
                      <span className="text-slate-400 mr-2 text-[11px] font-mono">[{inv.date}]</span>
                      <div className="text-[11px] text-slate-500 truncate max-w-md mt-0.5">{inv.itemsSummary}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const foundCust = contacts.find(
                            (c) =>
                              (inv.customerId && c.id === inv.customerId) ||
                              c.fullName.trim() === inv.customerName.trim()
                          );
                          setSelectedCustomer(
                            foundCust || {
                              id: inv.customerId || `temp-${inv.id}`,
                              sourceCode: 'CUST',
                              fullName: inv.customerName,
                              personType: 'حقیقی',
                              role: 'مشتری عادی',
                              phone: inv.customerPhone || '',
                              notes: '',
                            }
                          );
                          setIsCustomerHistoryModalOpen(true);
                        }}
                        className="px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 text-[11px] font-bold flex items-center gap-1"
                        title="مشاهده پرونده و تاریخچه خرید مشتری (Expand)"
                      >
                        <FileText className="w-3 h-3" />
                        <span>سوابق خرید</span>
                      </button>
                      <div className="text-left font-mono tabular-nums">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(inv.totalAmount)} ت</div>
                        <div className="text-[10px] text-slate-500">{inv.status}</div>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Selected Invoice Items for Return */}
          {(() => {
            const currentSelectedInv = salesInvoices.find((s) => s.id === selectedReturnInvoiceId);
            if (!currentSelectedInv) return null;

            return (
              <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 dark:border-indigo-900/40 pb-2">
                  <div className="font-bold text-xs text-indigo-950 dark:text-indigo-200">
                    ۲. اقلام خریداری‌شده توسط مشتری در فاکتور {currentSelectedInv.invoiceNo}:
                  </div>
                  <div className="text-[11px] text-slate-500">
                    تیک کالاهای موردنظر برای مرجوعی را فعال کنید و مبلغ کسر بابت تست/افت را برای هر قلم وارد نمایید.
                  </div>
                </div>

                <div className="space-y-2">
                  {(currentSelectedInv.lines || []).map((line) => {
                    const lineKey = line.id ? `${line.id}::${line.sku}` : line.sku;
                    const alreadyReturned = salesInvoices
                      .filter((s) => s.returnAgainst === currentSelectedInv.id && s.docstatus === 1)
                      .reduce((sum, retInv) => {
                        const matchLine = retInv.lines?.find(
                          (rl) => (line.id && rl.id === line.id) || rl.sku === line.sku
                        );
                        return sum + (matchLine ? matchLine.qty : 0);
                      }, 0);
                    const availQty = Math.max(0, line.qty - alreadyReturned);
                    const isFullyReturned = availQty <= 0;
                    const itemState = returnSelectedItems[lineKey] || returnSelectedItems[line.sku] || { selected: false, qty: 0, restockingFee: 0 };
                    const effectiveUnitPrice = line.qty > 0 && line.netLineAmount !== undefined
                      ? Math.round(line.netLineAmount / line.qty)
                      : Math.max(0, line.unitPrice - Math.round((line.allocatedHeaderDiscount ?? line.lineDiscountAmount ?? 0) / (line.qty || 1)));
                    const lineNetRefund = Math.max(0, (itemState.qty * effectiveUnitPrice) - (itemState.restockingFee || 0));

                    return (
                      <div
                        key={lineKey}
                        onClick={() => {
                          if (isFullyReturned) {
                            onShowToast('این مرجوعی تکراریه');
                          }
                        }}
                        className={`p-3 rounded-lg border text-xs transition-colors ${
                          isFullyReturned
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 opacity-90 cursor-not-allowed'
                            : itemState.selected
                              ? 'bg-white dark:bg-slate-900 border-indigo-400 dark:border-indigo-600 shadow-xs'
                              : 'bg-white/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={isFullyReturned}
                              checked={itemState.selected && !isFullyReturned}
                              onChange={(e) => {
                                if (isFullyReturned) {
                                  onShowToast('این مرجوعی تکراریه');
                                  return;
                                }
                                const checked = e.target.checked;
                                setReturnSelectedItems((prev) => ({
                                  ...prev,
                                  [lineKey]: {
                                    ...itemState,
                                    selected: checked,
                                    qty: checked ? Math.max(1, itemState.qty || 1) : itemState.qty,
                                  },
                                }));
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="font-mono text-[10px] font-bold text-indigo-600 ml-1.5">{line.sku}</span>
                              <span className="font-bold text-slate-900 dark:text-slate-100">{line.itemName}</span>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                <span>خرید اصلی: {line.qty} {line.uom}</span>
                                <span className="mx-1">·</span>
                                <span>قبلاً مرجوع‌شده: {alreadyReturned} {line.uom}</span>
                                <span className="mx-1">·</span>
                                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                  فی خالص: {formatCurrency(effectiveUnitPrice)} ت
                                  {effectiveUnitPrice < line.unitPrice && (
                                    <span className="text-[10px] text-slate-400 mr-1 font-normal line-through">({formatCurrency(line.unitPrice)})</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {isFullyReturned ? (
                            <div className="flex items-center gap-1.5 bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 px-2.5 py-1 rounded-md text-[11px] font-bold">
                              <span>این مرجوعی تکراریه</span>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3">
                              {/* Quantity Stepper */}
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-slate-500">تعداد مرجوعی:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={availQty}
                                  disabled={!itemState.selected}
                                  value={itemState.qty || ''}
                                  onChange={(e) => {
                                    const val = Math.max(1, Math.min(availQty, Number(e.target.value) || 1));
                                    setReturnSelectedItems((prev) => ({
                                      ...prev,
                                      [lineKey]: {
                                        ...itemState,
                                        qty: val,
                                      },
                                    }));
                                  }}
                                  className="w-14 px-1.5 py-1 text-center font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                                />
                                <span className="text-[10px] text-slate-400">از {availQty}</span>
                              </div>

                              {/* Individual Restocking Fee Input */}
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-rose-600 font-semibold">کسر افت/تست:</span>
                                <CurrencyInput
                                  value={itemState.restockingFee || ''}
                                  allowZero
                                  placeholder="۰"
                                  onChange={(val) => {
                                    setReturnSelectedItems((prev) => ({
                                      ...prev,
                                      [lineKey]: {
                                        ...itemState,
                                        restockingFee: Math.max(0, val),
                                      },
                                    }));
                                  }}
                                  className="w-24 px-1.5 py-1 font-mono text-left bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900 rounded text-xs font-bold text-rose-600 tabular-nums"
                                />
                                <span className="text-[10px] text-slate-400">ت</span>
                              </div>

                              {/* Net Line Refund */}
                              <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs min-w-[70px] text-left tabular-nums">
                                خالص: {formatCurrency(lineNetRefund)} ت
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Resolution Mode: STRICTLY ONLY 2 OPTIONS (NO EXCHANGE) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="block font-bold text-slate-800 dark:text-slate-200">
                ۳. شیوه تسویه مرجوعی با مشتری:
              </label>
              <PolarisButtonGroup segmented fullWidth>
                <PolarisButton
                  size="slim"
                  primary={returnResolutionMode === 'credit_balance'}
                  onClick={() => setReturnResolutionMode('credit_balance')}
                  className="flex-1"
                >
                  ۱. بستانکار کردن مشتری (Store Credit)
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  primary={returnResolutionMode === 'cash_refund'}
                  onClick={() => setReturnResolutionMode('cash_refund')}
                  className="flex-1"
                >
                  ۲. عودت وجه نقد یا کارت‌به‌کارت
                </PolarisButton>
              </PolarisButtonGroup>
              <span className="text-[10px] text-slate-500 block pt-0.5">
                {returnResolutionMode === 'credit_balance'
                  ? 'مبلغ مرجوعی به حساب مشتری در CRM افزوده می‌شود (در صورت داشتن بدهی، ابتدا بدهی تسویه شده و مازاد شارژ می‌شود) و در خرید جدید در صندوق با ۱ کلیک قابل کسر است.'
                  : 'مبلغ وجه نقد یا کارت‌به‌کارت مستقیماً از حساب‌های نقدینگی فروشگاه به مشتری عودت داده می‌شود.'}
              </span>
            </div>

            {returnResolutionMode === 'cash_refund' && (
              <div className="space-y-1">
                <label className="block font-bold text-slate-800 dark:text-slate-200">
                  حساب پرداخت‌کننده وجه مرجوعی:
                </label>
                <PolarisButtonGroup segmented fullWidth>
                  <PolarisButton
                    size="slim"
                    primary={refundAccountCode === '110102'}
                    onClick={() => setRefundAccountCode('110102')}
                    className="flex-1"
                  >
                    کارت به کارت (۱۱۰۱۰۲)
                  </PolarisButton>
                  <PolarisButton
                    size="slim"
                    primary={refundAccountCode === '110103'}
                    onClick={() => setRefundAccountCode('110103')}
                    className="flex-1"
                  >
                    صندوق نقد مغازه (۱۱۰۱۰۳)
                  </PolarisButton>
                </PolarisButtonGroup>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              علت مرجوعی یا یادداشت سند:
            </label>
            <input
              type="text"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="مثلاً: انصراف مشتری، پلمپ سالم، کارمزد تست کسر گردید..."
              className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Financial Totals Summary & Submit Button */}
          {(() => {
            const currentSelectedInv = salesInvoices.find((s) => s.id === selectedReturnInvoiceId);
            const itemsToProcess: PosReturnItemLine[] = (currentSelectedInv?.lines || [])
              .filter((l) => {
                const lineKey = l.id ? `${l.id}::${l.sku}` : l.sku;
                const st = returnSelectedItems[lineKey] || returnSelectedItems[l.sku];
                return st?.selected && (st?.qty || 0) > 0;
              })
              .map((l) => {
                const lineKey = l.id ? `${l.id}::${l.sku}` : l.sku;
                const st = returnSelectedItems[lineKey] || returnSelectedItems[l.sku];
                const effectiveUnitPrice = l.qty > 0 && l.netLineAmount !== undefined
                  ? Math.round(l.netLineAmount / l.qty)
                  : Math.max(0, l.unitPrice - Math.round((l.allocatedHeaderDiscount ?? l.lineDiscountAmount ?? 0) / (l.qty || 1)));
                return {
                  lineId: l.id,
                  sku: l.sku,
                  itemName: l.itemName,
                  qty: st.qty,
                  unitPrice: effectiveUnitPrice,
                  restockingFee: st.restockingFee || 0,
                  isDecantMl: l.isDecantMl,
                  warehouseKey: l.warehouseKey,
                };
              });

            const totalGross = itemsToProcess.reduce((sum, i) => sum + (i.qty * i.unitPrice), 0);
            const totalFee = itemsToProcess.reduce((sum, i) => sum + (i.restockingFee || 0), 0);
            const totalNet = Math.max(0, totalGross - totalFee);

            return (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <span className="text-slate-500">جمع ناخالص کالاها:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 mr-1 tabular-nums">
                      {formatCurrency(totalGross)} ت
                    </span>
                  </div>
                  {totalFee > 0 && (
                    <div>
                      <span className="text-rose-600 font-semibold">کسر افت/تست (حساب ۴۱۰۳):</span>
                      <span className="font-mono font-bold text-rose-600 mr-1 tabular-nums">
                        -{formatCurrency(totalFee)} ت
                      </span>
                    </div>
                  )}
                  <div className="font-bold text-sm text-indigo-700 dark:text-indigo-400">
                    <span>مبلغ خالص عودت / بستانکاری:</span>
                    <span className="font-mono mr-1 tabular-nums">
                      {formatCurrency(totalNet)} تومان
                    </span>
                  </div>
                </div>

                <PolarisButton
                  primary
                  loading={isSubmittingReturn}
                  disabled={isSubmittingReturn || itemsToProcess.length === 0}
                  icon={<PackageCheck className="w-4 h-4" />}
                  onClick={() => {
                    if (!selectedReturnInvoiceId || itemsToProcess.length === 0 || isSubmittingReturn) {
                      onShowToast('حداقل یک قلم کالا برای مرجوعی انتخاب کنید.');
                      return;
                    }
                    setIsSubmittingReturn(true);
                    window.setTimeout(() => {
                      const ok = onProcessPosReturn({
                        sourceInvoiceId: selectedReturnInvoiceId,
                        resolutionMode: returnResolutionMode,
                        refundAccountCode: returnResolutionMode === 'cash_refund' ? refundAccountCode : undefined,
                        returnItems: itemsToProcess,
                        totalRestockingFee: totalFee,
                        grossReturnAmount: totalGross,
                        netRefundAmount: totalNet,
                        notes: returnNotes,
                      });
                      setIsSubmittingReturn(false);
                      if (ok) {
                        setSelectedReturnInvoiceId('');
                        setReturnSelectedItems({});
                        setReturnNotes('');
                      }
                    }, 150);
                  }}
                >
                  ثبت قطعی مرجوعی ({itemsToProcess.length} قلم کالا)
                </PolarisButton>
              </div>
            );
          })()}
        </div>
      )}

      {/* =====================================================================
          UNIFIED VIEW: RESELLER & FESTIVAL PRICE LIST (جدول یکپارچه قیمت همکار و جشنواره)
         ===================================================================== */}
      {(activeView === 'reseller_pricelist' || activeView === 'festival_pricelist') && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-600" />
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>جدول یکپارچه لیست قیمت همکار (ریسلر) و قیمت جشنواره</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تغییر هر قیمت بلافاصله در سیستم، صندوق فروش و پذیرش کالا همگام‌سازی می‌شود.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={resellerSearch}
                onChange={(e) => setResellerSearch(e.target.value)}
                placeholder="جستجوی نام، طعم یا کد کالا..."
                className="px-3.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg w-full sm:w-72"
              />
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">کد کالا</th>
                  <th className="py-2.5 px-3">نام و مشخصات کالا</th>
                  <th className="py-2.5 px-3">موجودی</th>
                  <th className="py-2.5 px-3">قیمت مصرف‌کننده (عادی)</th>
                  <th className="py-2.5 px-3 text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/20">
                    قیمت همکاری / ریسلر (تومان)
                  </th>
                  <th className="py-2.5 px-3 text-amber-700 dark:text-amber-400 font-bold bg-amber-50/50 dark:bg-amber-950/20">
                    قیمت جشنواره (تومان)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {smartFilterAndRankItems(inventoryItems, resellerSearch).map((item) => {
                  const resPrice =
                    item.resellerPrice ||
                    item.partnerPrice ||
                    item.wholesalePrice ||
                    0;
                  const festPrice =
                    item.festivalPrice ||
                    item.partnerPrice ||
                    item.resellerPrice ||
                    0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-600 dark:text-slate-400">
                        {item.sku}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.category}
                          {item.flavor ? ` · ${item.flavor}` : ''}
                          {item.nicotine ? ` · ${item.nicotine}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        <span className={item.stockQty > 0 ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-rose-600 font-bold'}>
                          {item.stockQty} {item.uomPrimary}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(item.retailPrice)} ت
                      </td>
                      <td className="py-2.5 px-3 bg-indigo-50/20 dark:bg-indigo-950/10">
                        <CurrencyInput
                          value={resPrice}
                          allowZero
                          placeholder="قیمت همکاری"
                          onChange={(val) =>
                            onUpdateResellerPrice(item.sku, Math.max(0, val))
                          }
                          className="w-32 px-2.5 py-1 font-mono font-bold bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-lg tabular-nums text-left text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 bg-amber-50/20 dark:bg-amber-950/10">
                        <CurrencyInput
                          value={festPrice}
                          allowZero
                          placeholder="قیمت جشنواره"
                          onChange={(val) =>
                            onUpdateFestivalPrice?.(item.sku, Math.max(0, val))
                          }
                          className="w-32 px-2.5 py-1 font-mono font-bold bg-amber-50/60 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg tabular-nums text-left text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          POLARIS SHEET 1: NEW CUSTOMER REGISTRATION (Closed by default, opens via +)
         ===================================================================== */}
      <PolarisSheet
        open={isCustomerSheetOpen}
        onClose={() => setIsCustomerSheetOpen(false)}
        title="ثبت مشتری جدید در CRM"
        footer={
          <>
            <PolarisButton onClick={() => setIsCustomerSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingCustomer}
              disabled={isSavingCustomer}
              onClick={handleCreateQuickCustomer}
            >
              ذخیره و انتخاب در فاکتور
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              نام و نام خانوادگی مشتری *
            </label>
            <input
              type="text"
              autoFocus
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="مثلاً امیرحسین رضایی"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              شماره موبایل
            </label>
            <input
              type="text"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="0912..."
              className="w-full px-3 py-2 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              سلیقه مصرف ویپ / قطعات
            </label>
            <select
              value={newCustStyle}
              onChange={(e) => setNewCustStyle(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="">انتخاب سلیقه مصرف...</option>
              <option value="سالت نیکوتین (MTL)">سالت نیکوتین (MTL)</option>
              <option value="جویس فری‌بیس (DL)">جویس فری‌بیس (DL)</option>
              <option value="پاد یکبارمصرف">پاد یکبارمصرف</option>
              <option value="قطعات کامپیوتر و گیمینگ">قطعات کامپیوتر و گیمینگ</option>
            </select>
          </div>
        </div>
      </PolarisSheet>

      {/* =====================================================================
          POLARIS SHEET 2: NEW SUPPLIER REGISTRATION (Closed by default, opens via +)
         ===================================================================== */}


      {/* =====================================================================
          THERMAL RECEIPT PRINT PREVIEW (80mm standard) & PLAIN TEXT EXPORT MODAL
         ===================================================================== */}
      {showThermalReceipt && lastReceiptSnapshot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-[440px] rounded-2xl p-5 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 font-sans">
            {/* Modal Header & Tab Switcher */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-sm">رسید و فیش الکترونیک</h4>
              </div>
              <PolarisButtonGroup segmented>
                <PolarisButton
                  size="slim"
                  outline={receiptModalTab !== 'visual'}
                  onClick={() => setReceiptModalTab('visual')}
                >
                  فیش ۸۰ میلی‌متری
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  outline={receiptModalTab !== 'text'}
                  onClick={() => setReceiptModalTab('text')}
                >
                  خروجی متنی (Text)
                </PolarisButton>
              </PolarisButtonGroup>
            </div>

            {/* TAB 1: VISUAL 80MM THERMAL RECEIPT */}
            {receiptModalTab === 'visual' && (
              <div
                id="pos-thermal-receipt-container"
                className="space-y-3 p-3.5 bg-white text-slate-950 font-mono text-xs border border-dashed border-slate-400 rounded-lg shadow-inner"
              >
                <div className="text-center border-b border-dashed border-slate-400 pb-2.5 space-y-1">
                  <div className="text-base font-black tracking-wide font-sans">فروشگاه امکان</div>
                  <div className="text-[10px] text-slate-600 font-sans">رسید الکترونیک صندوق فروشگاه</div>
                  <div className="text-[11px] text-slate-700 flex justify-between pt-1 font-sans">
                    <span>مشتری: {lastReceiptSnapshot.customerName}</span>
                    <span className="font-mono">{formatPersianDate(new Date())}</span>
                  </div>
                </div>

                <table className="w-full text-right text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300 text-slate-600 font-sans">
                      <th className="py-1">شرح کالا / خدمات</th>
                      <th className="py-1 text-center w-12">تعداد</th>
                      <th className="py-1 text-left w-20">مبلغ (ت)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lastReceiptSnapshot.cartLines.map((line, i) => (
                      <tr key={i}>
                        <td className="py-1 font-sans leading-tight">
                          <div>{line.name}</div>
                          {line.lineDiscount && line.lineDiscount > 0 ? (
                            <div className="text-[9px] text-rose-600 font-sans">
                              تخفیف سطر: -{formatCurrency(line.lineDiscount)} ت
                            </div>
                          ) : null}
                        </td>
                        <td className="py-1 text-center font-bold tabular-nums">
                          {line.qty} {line.uom}
                        </td>
                        <td className="py-1 text-left font-bold tabular-nums">
                          {formatCurrency(line.netLineAmount ?? Math.round(line.qty * line.finalManualUnitPrice))}
                        </td>
                      </tr>
                    ))}
                    {lastReceiptSnapshot.serviceLines.map((srv, i) => (
                      <tr key={i} className="text-indigo-900">
                        <td className="py-1 font-sans leading-tight">خدمت: {srv.serviceTitle}</td>
                        <td className="py-1 text-center font-bold">۱</td>
                        <td className="py-1 text-left font-bold tabular-nums">{formatCurrency(srv.feeAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-xs">
                  <div className="flex justify-between font-sans text-slate-600">
                    <span>جمع ناخالص:</span>
                    <span className="tabular-nums">{formatCurrency(lastReceiptSnapshot.grossTotal)} تومان</span>
                  </div>
                  {(lastReceiptSnapshot.totalLineDiscounts || 0) + (lastReceiptSnapshot.festivalDiscountAmount || 0) > 0 && (
                    <div className="flex justify-between font-sans text-rose-700">
                      <span>تخفیفات:</span>
                      <span className="tabular-nums">
                        -{formatCurrency((lastReceiptSnapshot.totalLineDiscounts || 0) + (lastReceiptSnapshot.festivalDiscountAmount || 0))} تومان
                      </span>
                    </div>
                  )}
                  {lastReceiptSnapshot.usedCreditBalance && lastReceiptSnapshot.usedCreditBalance > 0 ? (
                    <div className="flex justify-between font-sans text-emerald-800 font-bold">
                      <span>کسر از بستانکاری قبلی:</span>
                      <span className="tabular-nums">-{formatCurrency(lastReceiptSnapshot.usedCreditBalance)} تومان</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                    <span className="font-sans">مبلغ کل فاکتور:</span>
                    <span className="tabular-nums">{formatCurrency(lastReceiptSnapshot.netTotal)} تومان</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-600 font-sans">
                    <span>شیوه پرداخت:</span>
                    <span>{lastReceiptSnapshot.paymentMethodLabel}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-emerald-800 font-bold font-sans">
                    <span>مبلغ پرداختی:</span>
                    <span className="font-mono tabular-nums">{formatCurrency(lastReceiptSnapshot.paidAmount)} تومان</span>
                  </div>
                  {lastReceiptSnapshot.creditReceivableAmount > 0 && (
                    <div className="flex justify-between text-[11px] text-amber-800 font-bold font-sans">
                      <span>مانده نسیه:</span>
                      <span className="font-mono tabular-nums">{formatCurrency(lastReceiptSnapshot.creditReceivableAmount)} تومان</span>
                    </div>
                  )}
                </div>

                <div className="text-center border-t border-dashed border-slate-300 pt-2 text-[10px] text-slate-500 font-sans">
                  از خرید شما متشکریم · امکان
                </div>
              </div>
            )}

            {/* TAB 2: PLAIN TEXT RECEIPT (One-Click Copy & Download) */}
            {receiptModalTab === 'text' && (() => {
              const textReceiptContent = generatePlainTextReceipt({
                invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
                customerName: lastReceiptSnapshot.customerName,
                customerPhone: lastReceiptSnapshot.customerPhone,
                date: formatPersianDate(new Date()),
                cashierName: 'صندوق فروشگاه امکان',
                cartLines: lastReceiptSnapshot.cartLines.map((l) => ({
                  name: l.name,
                  sku: l.sku,
                  qty: l.qty,
                  uom: l.uom,
                  finalManualUnitPrice: l.finalManualUnitPrice,
                  lineDiscount: l.lineDiscount,
                  netLineAmount: l.netLineAmount,
                })),
                serviceLines: lastReceiptSnapshot.serviceLines.map((s) => ({
                  serviceTitle: s.serviceTitle,
                  feeAmount: s.feeAmount,
                })),
                goodsTotal: lastReceiptSnapshot.grossTotal,
                servicesTotal: lastReceiptSnapshot.serviceLines.reduce((s, x) => s + x.feeAmount, 0),
                totalDiscount: (lastReceiptSnapshot.totalLineDiscounts || 0) + (lastReceiptSnapshot.festivalDiscountAmount || 0),
                grandTotal: lastReceiptSnapshot.netTotal,
                paidAmount: lastReceiptSnapshot.paidAmount,
                paymentMethodLabel: lastReceiptSnapshot.paymentMethodLabel,
              });

              return (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-[340px] whitespace-pre leading-relaxed select-all border border-slate-800">
                    {textReceiptContent}
                  </div>
                  <div className="flex items-center gap-2">
                    <PolarisButton
                      size="slim"
                      fullWidth
                      icon={copiedReceipt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      onClick={() => {
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(textReceiptContent);
                        } else {
                          const ta = document.createElement('textarea');
                          ta.value = textReceiptContent;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                        setCopiedReceipt(true);
                        setTimeout(() => setCopiedReceipt(false), 2000);
                        onShowToast('متن فیش با موفقیت در کلیپ‌بورد کپی شد.');
                      }}
                    >
                      {copiedReceipt ? 'کپی شد!' : 'کپی متن فیش (SMS / واتساپ)'}
                    </PolarisButton>
                    <PolarisButton
                      size="slim"
                      icon={<Download className="w-3.5 h-3.5" />}
                      onClick={() => {
                        triggerBrowserDownload(
                          textReceiptContent,
                          `receipt-${Date.now()}.txt`,
                          'text/plain;charset=utf-8'
                        );
                        onShowToast('فایل فیش متنی دانلود شد.');
                      }}
                    >
                      دانلود (.txt)
                    </PolarisButton>
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <PolarisButton
                primary
                fullWidth
                icon={<Printer className="w-4 h-4" />}
                onClick={() => {
                  window.print();
                  setShowThermalReceipt(false);
                }}
              >
                چاپ فیش حرارتی (80mm)
              </PolarisButton>
              <PolarisButton onClick={() => setShowThermalReceipt(false)}>بستن</PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CUSTOMER HISTORY & PAST PURCHASES EXPAND MODAL
         ===================================================================== */}
      {isCustomerHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-sm">
                  سوابق و پرونده مشتری: {selectedCustomer ? selectedCustomer.fullName : 'انتخاب مشتری'}
                </h3>
              </div>
              <PolarisButton size="slim" onClick={() => setIsCustomerHistoryModalOpen(false)}>
                بستن
              </PolarisButton>
            </div>

            {selectedCustomer ? (
              <div className="space-y-3 flex-1 overflow-y-auto">
                {/* Profile Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-[11px] text-slate-500 block">شماره تماس</span>
                    <span className="font-mono font-bold">{selectedCustomer.phone || 'ثبت‌نشده'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-[11px] text-slate-500 block">سلیقه مصرف</span>
                    <span className="font-bold">{selectedCustomer.vapingStyle || 'عمومی'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <span className="text-[11px] text-emerald-800 dark:text-emerald-300 block">مانده بستانکاری (طلب)</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(selectedCustomer.creditBalance ?? 0)} تومان
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                    <span className="text-[11px] text-rose-800 dark:text-rose-300 block">مانده بدهی معوق</span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-300">
                      {formatCurrency(selectedCustomer.debitBalance ?? 0)} تومان
                    </span>
                  </div>
                </div>

                {/* Past Sales Invoices Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 dark:bg-slate-800 p-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>فاکتورها و خریدهای قبلی این مشتری</span>
                    <span>
                      {salesInvoices.filter((s) => s.customerId === selectedCustomer.id || s.customerName.trim() === selectedCustomer.fullName.trim()).length} سند ثبت‌شده
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {(() => {
                      const custInvoices = salesInvoices.filter(
                        (s) => s.customerId === selectedCustomer.id || s.customerName.trim() === selectedCustomer.fullName.trim()
                      );

                      if (custInvoices.length === 0) {
                        return (
                          <div className="p-6 text-center text-slate-400">
                            تاکنون فاکتوری برای این مشتری ثبت نشده است.
                          </div>
                        );
                      }

                      return custInvoices.map((inv) => (
                        <div key={inv.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-indigo-600">{inv.invoiceNo}</span>
                              <span className="font-mono text-slate-400">[{inv.date}]</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                inv.returnAgainst
                                  ? 'bg-amber-100 text-amber-800'
                                  : inv.docstatus === 2
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {inv.returnAgainst ? 'مرجوعی' : inv.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 max-w-md truncate">
                              {inv.itemsSummary}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                            <div className="font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                              {formatCurrency(inv.totalAmount)} ت
                            </div>
                            <div className="flex items-center gap-1">
                              <PolarisButton
                                size="slim"
                                icon={<Copy className="w-3 h-3" />}
                                title="کپی متن فیش"
                                onClick={() => {
                                  const text = generatePlainTextReceipt({
                                    invoiceNo: inv.invoiceNo,
                                    customerName: inv.customerName,
                                    customerPhone: inv.customerPhone,
                                    date: inv.date,
                                    cashierName: 'صندوق امکان',
                                    cartLines: (inv.lines || []).map((l) => ({
                                      name: l.itemName,
                                      sku: l.sku,
                                      qty: l.qty,
                                      uom: l.uom,
                                      finalManualUnitPrice: l.unitPrice,
                                      netLineAmount: l.netLineAmount,
                                    })),
                                    serviceLines: (inv.serviceLines || []).map((s) => ({
                                      serviceTitle: s.serviceTitle,
                                      feeAmount: s.feeAmount,
                                    })),
                                    goodsTotal: inv.totalAmount,
                                    grandTotal: inv.totalAmount,
                                    paidAmount: inv.paidAmount,
                                  });
                                  if (navigator.clipboard) navigator.clipboard.writeText(text);
                                  onShowToast(`متن فاکتور ${inv.invoiceNo} کپی شد.`);
                                }}
                              >
                                متن
                              </PolarisButton>
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">
                ابتدا یک مشتری را در صندوق انتخاب کنید تا پرونده و سوابق خرید وی نمایش داده شود.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Explicit Two-Step Confirmation Modal for Sales Checkout */}
      {showConfirmSaleModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/50">
                <Printer className="w-6 h-6 shrink-0" />
              </div>
              <div>
                <h4 className="text-base font-bold">تأیید نهایی ثبت فاکتور فروش</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">لطفاً پیش از ثبت قطعی مشخصات فاکتور را مرور فرمایید.</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 space-y-2 text-xs border border-slate-200 dark:border-slate-700/60">
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">مشتری:</span>
                <span className="font-semibold">{selectedCustomer?.fullName || customerSearch.trim() || 'مشتری گذری'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">تعداد اقلام کالا / خدمت:</span>
                <span className="font-semibold">{cart.length} قلم کالا ({cart.reduce((s, r) => s + r.qty, 0)} عدد) {serviceLines.length > 0 ? `+ ${serviceLines.length} خدمت فنی` : ''}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">روش تسویه:</span>
                <span className="font-semibold">
                  {paymentAccountCode === '110101' ? 'کارتخوان (پوز)' : paymentAccountCode === '110102' ? 'کارت به کارت' : 'نقد (صندوق)'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                <span>مبلغ کل فاکتور:</span>
                <span>{privacyMasked ? '••••••' : `${formatCurrency(payableAfterCredit)} تومان`}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton
                size="slim"
                onClick={() => setShowConfirmSaleModal(false)}
              >
                انصراف و ویرایش
              </PolarisButton>
              <PolarisButton
                primary
                size="slim"
                loading={isSubmittingSale}
                onClick={() => {
                  setShowConfirmSaleModal(false);
                  executePosCheckout();
                }}
              >
                تأیید و ثبت قطعی
              </PolarisButton>
            </div>
          </div>
        </div>
      )}



      {/* Two-Step Polaris Destructive Confirmation Modal */}
      {pendingDestructiveAction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-400">
              <XCircle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">تأیید نهایی ابطال سند</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              آیا از انجام عملیات <span className="font-bold text-slate-900 dark:text-white">«{pendingDestructiveAction.label}»</span> اطمینان دارید؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton
                size="slim"
                onClick={() => setPendingDestructiveAction(null)}
              >
                انصراف
              </PolarisButton>
              <PolarisButton
                size="slim"
                destructive
                onClick={() => {
                  const act = pendingDestructiveAction;
                  setPendingDestructiveAction(null);
                  if (act.type === 'remove_cart_row') {
                    setCart((prev) => prev.filter((r) => r.rowId !== act.targetId));
                  } else if (act.type === 'remove_service_row') {
                    setServiceLines((prev) => prev.filter((s) => s.id !== act.targetId));
                  } else if (act.type === 'void_sales_invoice' && onVoidSalesInvoice) {
                    onVoidSalesInvoice(act.targetId);
                  } else if (act.type === 'void_purchase_invoice' && onVoidPurchaseInvoice) {
                    onVoidPurchaseInvoice(act.targetId);
                  }
                  barcodeInputRef.current?.focus({ preventScroll: true });
                }}
              >
                تأیید و اجرای قطعی
              </PolarisButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
