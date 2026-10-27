import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Home,
  Calculator,
  Package,
  Store,
  Users,
  Globe,
  Settings,
  Search,
  CheckCircle2,
  Calendar as CalendarIcon,
  BarChart3,
  Sparkles,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Save,
  AlertTriangle,
  ArrowUpLeft,
  ShieldCheck,
  Truck,
} from 'lucide-react';

import {
  INITIAL_ACCOUNTS,
  INITIAL_GL_ENTRIES,
  INITIAL_SALES_INVOICES,
  INITIAL_PURCHASE_INVOICES,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_PAYMENT_ENTRIES,
  INITIAL_COST_CENTERS,
  INITIAL_FIXED_ASSETS,
  INITIAL_SHAREHOLDERS,
  INITIAL_CRM_LEADS,
  INITIAL_AUDIT_LOGS,
  INITIAL_WAREHOUSES,
  INITIAL_MASTER_OPTIONS,
  INITIAL_RECURRING_EXPENSE_TEMPLATES,
  INITIAL_PROMOTION_RULES,
  INITIAL_STOCK_LEDGER_ENTRIES,
  INITIAL_THEFT_FRAUD_INCIDENTS,
  DEFAULT_BRANCH_NAME,
  AccountNode,
  GLEntryRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  JournalEntryRecord,
  PaymentEntryRecord,
  CostCenterRecord,
  FixedAssetRecord,
  ShareholderRecord,
  ShareholderRuleSnapshot,
  ShareholderDrawingRecord,
  RecurringExpenseTemplate,
  MonthlyExpenseLedgerRecord,
  InventoryItemRecord,
  CustomerContactRecord,
  BulkSmsContactRecord,
  CrmLeadRecord,
  AuditLogRecord,
  WarehouseRecord,
  MasterOptionsRegistry,
  PromotionRuleRecord,
  OperationalCalendarEvent,
  CustomerWishlistRecord,
  WarehouseKey,
  StockLedgerEntryRecord,
  TheftFraudIncidentRecord,
  TimeMachineSnapshotRecord,
} from './data/erpSeedData';
import { CLOUDY_SHOP_CONTACTS, CLOUDY_SHOP_INVENTORY } from './data/cloudyShopData';

import {
  SystemRole,
  formatCurrency,
  formatPersianDate,
  getPersianYear,
  postDoubleEntryToAccounts,
  restoreStockWithBundles,
  deductStockWithBundles,
  calculateMovingAverageValuation,
  deductDecantMlFromBottle,
  consumeWarehouseFifoLayers,
  transferWarehouseValuationLayer,
  voidInvoice,
  computeSnapshotChecksum,
  exactAdd,
  exactMul,
  JournalLine,
  detectCategorySector,
  DEFAULT_CATEGORY_SECTORS,
} from './utils/erpEngine';

import { AccountingModule, AccountingSubTab } from './components/AccountingModule';
import {
  SellingPosModule,
  PosCheckoutPayload,
  PosReturnPayload,
  PosReturnItemLine,
} from './components/SellingPosModule';
import { normalizePhoneNumber, triggerBrowserDownload } from './utils/posService';
import { CrmMarketingModule } from './components/CrmMarketingModule';
import { InventoryWmsModule } from './components/InventoryWmsModule';
import { AnalyticsBiModule } from './components/AnalyticsBiModule';
import { OperationalCalendarModule } from './components/OperationalCalendarModule';
import { SupportWebshopModule } from './components/SupportWebshopModule';
import { FrappeCoreModule, FrappeCoreSubTab } from './components/FrappeCoreModule';
import { ModuleErrorBoundary } from './components/ModuleErrorBoundary';
import {
  usePersistentArrayState,
  broadcastSnapshotRehydrate,
  atomicCommitMultiStores,
} from './hooks/usePersistentArrayState';
import {
  parseHesabfaImportPayload,
  summarizeHesabfaImport,
} from './utils/hesabfaImport';

type WorkspaceId =
  | 'home'
  | 'pos'
  | 'stock'
  | 'festivals'
  | 'accounting'
  | 'analytics'
  | 'crm'
  | 'calendar'
  | 'webshop'
  | 'settings';

const WORKSPACE_TO_PATH: Record<WorkspaceId, string> = {
  home: '/',
  pos: '/pos',
  stock: '/stock',
  festivals: '/festivals',
  accounting: '/accounting',
  analytics: '/analytics',
  crm: '/crm',
  calendar: '/calendar',
  webshop: '/webshop',
  settings: '/settings',
};

const getWorkspaceFromPath = (pathname: string): WorkspaceId => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const entry = (Object.entries(WORKSPACE_TO_PATH) as [WorkspaceId, string][]).find(
    ([, p]) => p === clean
  );
  return entry ? entry[0] : 'home';
};

const PRODUCTION_MODE_KEY = 'emkan.v1.production-mode';
const CLOUDY_SHOP_V4_KEY = 'emkan.v4.cloudy-shop-4wh-init';
const THEME_MODE_KEY = 'emkan.v1.theme-mode';

// Normalize Cloudy Shop inventory into Central External warehouse by default
const normalizeCloudyShopInventory = (
  items: InventoryItemRecord[]
): InventoryItemRecord[] =>
  items.map((item) => {
    const isPc =
      item.category === 'قطعات کامپیوتر و سخت‌افزار' ||
      item.sector === 'pc';
    const existingWh = item.warehouseStock;
    const hasWhSum =
      existingWh &&
      Object.values(existingWh).reduce((acc, v) => acc + (Number(v) || 0), 0) > 0;
    return {
      ...item,
      sector: item.sector || (isPc ? 'pc' : 'vape'),
      condition: item.condition || 'آکبند',
      warehouseStock: hasWhSum
        ? existingWh
        : {
            central_external: item.stockQty,
            vitrine: 0,
            shop_storage: 0,
            consignment: 0,
          },
      totalInQty: item.totalInQty ?? item.stockQty,
      totalOutQty: item.totalOutQty ?? 0,
      resellerPrice: item.resellerPrice ?? item.partnerPrice ?? item.wholesalePrice,
    };
  });

// Precompute once at module level to prevent 325-item heavy array mapping on every App render
const INITIAL_CLOUDY_SHOP_INVENTORY = normalizeCloudyShopInventory(CLOUDY_SHOP_INVENTORY);

export function App() {
  const [activeWorkspace, setActiveWorkspaceState] = useState<WorkspaceId>(() =>
    getWorkspaceFromPath(window.location.pathname)
  );
  const [accountingInitialTab, setAccountingInitialTab] =
    useState<AccountingSubTab>('coa');
  const [posInitialView, setPosInitialView] = useState<
    'pos' | 'returns' | 'reseller_pricelist' | 'festival_pricelist'
  >('pos');
  const [inventoryInitialTab, setInventoryInitialTab] = useState<
    'stocktaking' | 'stock_ledger' | 'theft_fraud' | 'sku_allocation' | 'festivals_bundles' | 'purchase_invoice'
  >('stocktaking');
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<FrappeCoreSubTab>('time_machine');

  const setActiveWorkspace = useCallback((ws: WorkspaceId) => {
    setActiveWorkspaceState(ws);
    const targetPath = WORKSPACE_TO_PATH[ws] || '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ workspace: ws }, '', targetPath);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveWorkspaceState(getWorkspaceFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [activeRole] = useState<SystemRole>('سوپر ادمین');
  const [activeFiscalYear] = useState(() => `سال مالی ${getPersianYear()}`);
  const [branches, setBranches] = usePersistentArrayState<string>(
    'emkan.v4.branches',
    [DEFAULT_BRANCH_NAME]
  );
  const [defaultBranch, setDefaultBranch] = useState<string>(DEFAULT_BRANCH_NAME);
  const [productionMode, setProductionMode] = useState(
    () => window.localStorage.getItem(PRODUCTION_MODE_KEY) === 'true'
  );

  // Theme & Auto-Hide Privacy Mode (60s inactivity timer with touch support & throttling)
  const [darkMode, setDarkMode] = useState(() => {
    const stored = window.localStorage.getItem(THEME_MODE_KEY);
    if (stored !== null) return stored === 'dark';
    return false;
  });
  const [privacyMask, setPrivacyMask] = useState(true); // Masked (****) by default

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    window.localStorage.setItem(THEME_MODE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (privacyMask) return;
    let timeoutId: number;
    let lastResetTime = 0;
    const resetTimerThrottled = () => {
      const now = Date.now();
      if (now - lastResetTime < 1000) return; // 1s throttle
      lastResetTime = now;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setPrivacyMask(true);
      }, 60000); // 60 seconds auto-hide
    };
    resetTimerThrottled();
    window.addEventListener('mousemove', resetTimerThrottled, { passive: true });
    window.addEventListener('keydown', resetTimerThrottled, { passive: true });
    window.addEventListener('click', resetTimerThrottled, { passive: true });
    window.addEventListener('touchstart', resetTimerThrottled, { passive: true });
    window.addEventListener('touchmove', resetTimerThrottled, { passive: true });
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimerThrottled);
      window.removeEventListener('keydown', resetTimerThrottled);
      window.removeEventListener('click', resetTimerThrottled);
      window.removeEventListener('touchstart', resetTimerThrottled);
      window.removeEventListener('touchmove', resetTimerThrottled);
    };
  }, [privacyMask]);

  // Global Command Bar (Ctrl+K / Cmd+K supporting Persian and Latin layouts)
  const [showAwesomebar, setShowAwesomebar] = useState(false);
  const [awesomeQuery, setAwesomeQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === 'KeyK' || e.key === 'k' || e.key === 'K' || e.key === 'ن')
      ) {
        e.preventDefault();
        setShowAwesomebar((prev) => !prev);
      } else if (e.key === 'Escape') {
        setShowAwesomebar((prev) => (prev ? false : prev));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Central Persistent States
  const [accounts, setAccounts] = usePersistentArrayState<AccountNode>(
    'emkan.v4.accounts',
    INITIAL_ACCOUNTS
  );
  const [glEntries, setGlEntries] = usePersistentArrayState<GLEntryRecord>(
    'emkan.v1.gl-entries',
    INITIAL_GL_ENTRIES
  );
  const [journalEntries, setJournalEntries] =
    usePersistentArrayState<JournalEntryRecord>(
      'emkan.v1.journal-entries',
      INITIAL_JOURNAL_ENTRIES
    );
  const [salesInvoices, setSalesInvoices] =
    usePersistentArrayState<SalesInvoiceRecord>(
      'emkan.v1.sales-invoices',
      INITIAL_SALES_INVOICES
    );
  const [purchaseInvoices, setPurchaseInvoices] =
    usePersistentArrayState<PurchaseInvoiceRecord>(
      'emkan.v1.purchase-invoices',
      INITIAL_PURCHASE_INVOICES
    );
  const [paymentEntries, setPaymentEntries] =
    usePersistentArrayState<PaymentEntryRecord>(
      'emkan.v1.payment-entries',
      INITIAL_PAYMENT_ENTRIES
    );
  const [costCenters, setCostCenters] = usePersistentArrayState<CostCenterRecord>(
    'emkan.v4.cost-centers',
    INITIAL_COST_CENTERS
  );
  const [fixedAssets, setFixedAssets] = usePersistentArrayState<FixedAssetRecord>(
    'emkan.v4.fixed-assets',
    INITIAL_FIXED_ASSETS
  );
  const [shareholders, setShareholders] =
    usePersistentArrayState<ShareholderRecord>(
      'emkan.v4.shareholders',
      INITIAL_SHAREHOLDERS
    );
  const [shareholderSnapshots, setShareholderSnapshots] =
    usePersistentArrayState<ShareholderRuleSnapshot>(
      'emkan.v4.shareholder-snapshots',
      []
    );
  const [shareholderDrawings, setShareholderDrawings] =
    usePersistentArrayState<ShareholderDrawingRecord>(
      'emkan.v4.shareholder-drawings',
      []
    );
  const [recurringTemplates, setRecurringTemplates] =
    usePersistentArrayState<RecurringExpenseTemplate>(
      'emkan.v4.recurring-templates',
      INITIAL_RECURRING_EXPENSE_TEMPLATES
    );
  const [monthlyExpenseLedger, setMonthlyExpenseLedger] =
    usePersistentArrayState<MonthlyExpenseLedgerRecord>(
      'emkan.v4.monthly-expense-ledger',
      []
    );
  const [warehouses, setWarehouses] = usePersistentArrayState<WarehouseRecord>(
    'emkan.v4.warehouses',
    INITIAL_WAREHOUSES
  );
  const [promotionRules, setPromotionRules] =
    usePersistentArrayState<PromotionRuleRecord>(
      'emkan.v4.promotion-rules',
      INITIAL_PROMOTION_RULES
    );
  const [inventoryItems, setInventoryItems] =
    usePersistentArrayState<InventoryItemRecord>(
      'emkan.v1.inventory-items',
      INITIAL_CLOUDY_SHOP_INVENTORY
    );
  const [customerContacts, setCustomerContacts] =
    usePersistentArrayState<CustomerContactRecord>(
      'emkan.v1.customer-contacts',
      CLOUDY_SHOP_CONTACTS
    );
  const [bulkSmsPool, setBulkSmsPool] =
    usePersistentArrayState<BulkSmsContactRecord>(
      'emkan.v4.bulk-sms-pool',
      []
    );
  const [crmLeads, setCrmLeads] = usePersistentArrayState<CrmLeadRecord>(
    'emkan.v1.crm-leads',
    INITIAL_CRM_LEADS
  );
  const [calendarEvents, setCalendarEvents] =
    usePersistentArrayState<OperationalCalendarEvent>(
      'emkan.v4.calendar-events',
      [
        {
          id: 'ev-init-1',
          title: 'انبارگردانی هفتگی ویترین و شارژ سالت‌های پرفروش',
          date: '۱۴۰۴/۰۸/۱۵',
          time: '11:00',
          category: 'task',
          isCompleted: false,
          notes: 'انتقال از انبار مرکزی به ویترین مغازه',
        },
      ]
    );
  const [customerWishlist, setCustomerWishlist] =
    usePersistentArrayState<CustomerWishlistRecord>(
      'emkan.v4.customer-wishlist',
      [
        {
          id: 'wish-init-1',
          customerName: 'کیوان رضایی',
          customerPhone: '09123456789',
          requestedItemName: 'سالت ویگاد بمب انبه یخ 25mg',
          category: 'جویس و سالت',
          flavorOrSpec: 'نیکوتین ۲۵ میلی‌گرم',
          requestedDate: '۱۴۰۴/۰۸/۱۰',
          promiseDate: '۱۴۰۴/۰۸/۱۸',
          status: 'در انتظار تامین',
          notes: 'مشتری ثابت مغازه — به محض رسیدن بار تماس گرفته شود',
        },
      ]
    );
  const [auditLogs, setAuditLogs] = usePersistentArrayState<AuditLogRecord>(
    'emkan.v1.audit-logs',
    INITIAL_AUDIT_LOGS
  );

  const recordAuditLog = useCallback(
    (
      action: string,
      details: string,
      category: 'فروش' | 'خرید' | 'انبار' | 'مالی' | 'سیستم' = 'سیستم'
    ) => {
      const newLog: AuditLogRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: `${formatPersianDate(new Date())} ${new Date().toLocaleTimeString('fa-IR')}`,
        user: activeRole,
        role: activeRole,
        docType: category,
        docId: action,
        fieldChanged: 'عملیات سیستم',
        oldValue: '—',
        newValue: details,
      };
      setAuditLogs((prev) => [newLog, ...prev.slice(0, 299)]);
    },
    [activeRole, setAuditLogs]
  );

  const [stockLedgerEntries, setStockLedgerEntries] =
    usePersistentArrayState<StockLedgerEntryRecord>(
      'emkan.v4.stock-ledger-entries',
      INITIAL_STOCK_LEDGER_ENTRIES
    );
  const [theftFraudIncidents, setTheftFraudIncidents] =
    usePersistentArrayState<TheftFraudIncidentRecord>(
      'emkan.v4.theft-fraud-incidents',
      INITIAL_THEFT_FRAUD_INCIDENTS
    );

  // Auto-sync Warehouses to user specification (names & strict ordering):
  // 1. ویترین / مرکزی (vitrine)
  // 2. انبار مغازه (دپوی داخل مغازه) (shop_storage)
  // 3. انبار خارجی (ورود اولیه بار) (central_external)
  // 4. انبار کالای امانی (امانت) (consignment)
  // 5. انبار کالای در راه (سفارش‌های در مسیر) (in_transit)
  useEffect(() => {
    const keysOrder: WarehouseKey[] = [
      'vitrine',
      'shop_storage',
      'central_external',
      'consignment',
      'in_transit',
    ];
    const isOutOfSync =
      warehouses.length !== INITIAL_WAREHOUSES.length ||
      INITIAL_WAREHOUSES.some((iw, idx) => {
        const cur = warehouses[idx];
        return !cur || cur.key !== iw.key || cur.name !== iw.name;
      });

    if (isOutOfSync) {
      const reordered = keysOrder.map((key) => {
        const targetInit = INITIAL_WAREHOUSES.find((w) => w.key === key)!;
        const existing = warehouses.find((w) => w.key === key);
        return existing
          ? {
              ...existing,
              name: targetInit.name,
              location: targetInit.location,
              description: targetInit.description,
            }
          : targetInit;
      });
      setWarehouses(reordered);
    }
  }, [warehouses, setWarehouses]);

  useEffect(() => {
    const requiredCodes = ['110405', '5205', '1103', '1202', '2103', '2104', '3102', '5102'];
    const missingAccounts: AccountNode[] = [];
    for (const code of requiredCodes) {
      if (!accounts.some((a) => a.code === code)) {
        const acc = INITIAL_ACCOUNTS.find((a) => a.code === code);
        if (acc) missingAccounts.push(acc);
      }
    }
    if (missingAccounts.length > 0) {
      setAccounts((prev) => [...prev, ...missingAccounts]);
    }
  }, [accounts, setAccounts]);

  const selfHealedEmptyGlRef = useRef(false);
  // Self-healing: If there are no GL transactions in the system, reconcile accounts to opening balances (zero out stale residual deltas)
  useEffect(() => {
    if (glEntries.length > 0) {
      selfHealedEmptyGlRef.current = false;
      return;
    }
    if (!selfHealedEmptyGlRef.current && accounts.some((a) => a.balance !== (a.openingBalance || 0))) {
      selfHealedEmptyGlRef.current = true;
      const reset = accounts.map((a) => ({ ...a, balance: a.openingBalance || 0 }));
      setAccounts(reset);
    }
  }, [glEntries.length, accounts, setAccounts]);
  const [masterOptions, setMasterOptions] = useState<MasterOptionsRegistry>(() => {
    try {
      const raw = window.localStorage.getItem('emkan.v4.master-options');
      return raw ? JSON.parse(raw) : INITIAL_MASTER_OPTIONS;
    } catch {
      return INITIAL_MASTER_OPTIONS;
    }
  });

  const [categorySectors, setCategorySectors] = useState<Record<string, 'vape' | 'pc'>>(() => {
    try {
      const raw = window.localStorage.getItem('emkan.v4.category-sectors');
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_CATEGORY_SECTORS;
  });

  const [
    backupSnapshots,
    setBackupSnapshots,
    ,
    ,
    backupSnapshotsHydrated,
  ] = usePersistentArrayState<TimeMachineSnapshotRecord>(
    'emkan.v4.time-machine-snapshots',
    []
  );
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState<number>(-1);
  const effectiveSnapshotIndex =
    currentSnapshotIndex >= 0 && currentSnapshotIndex < backupSnapshots.length
      ? currentSnapshotIndex
      : backupSnapshots.length - 1;
  const [rehydrationVersion, setRehydrationVersion] = useState<number>(0);

  useEffect(() => {
    setCurrentSnapshotIndex((current) => {
      if (backupSnapshots.length === 0) return -1;
      if (current < 0 || current >= backupSnapshots.length) {
        return backupSnapshots.length - 1;
      }
      return current;
    });
  }, [backupSnapshots.length]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastFadeTimerRef = useRef<number | null>(null);

  const dismissToast = useCallback(() => {
    setToastVisible(false);
    if (toastFadeTimerRef.current) window.clearTimeout(toastFadeTimerRef.current);
    toastFadeTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 400);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (toastFadeTimerRef.current) window.clearTimeout(toastFadeTimerRef.current);
    setToastMessage(msg);
    setToastVisible(true);

    toastTimerRef.current = window.setTimeout(() => {
      dismissToast();
    }, 3500);
  }, [dismissToast]);

  const cloudyShopSyncedRef = useRef(false);
  // Ensure Cloudy Shop Inventory is placed in Central External warehouse & COA is synced
  useEffect(() => {
    if (cloudyShopSyncedRef.current) return;
    try {
      if (window.localStorage.getItem(CLOUDY_SHOP_V4_KEY) === '1') {
        cloudyShopSyncedRef.current = true;
        return;
      }
    } catch {}
    cloudyShopSyncedRef.current = true;
    const normalized = normalizeCloudyShopInventory(
      inventoryItems.length > 0 ? inventoryItems : CLOUDY_SHOP_INVENTORY
    );
    const totalCentralValuation = normalized.reduce(
      (sum, item) => sum + item.stockQty * (item.valuationRate || 0),
      0
    );

    const syncedAccounts = INITIAL_ACCOUNTS.map((acc) => {
      if (acc.code === '1000' || acc.code === '1100' || acc.code === '1104' || acc.code === '110403') {
        return { ...acc, balance: totalCentralValuation };
      }
      if (acc.code === '3000' || acc.code === '3100' || acc.code === '3101') {
        return { ...acc, balance: totalCentralValuation };
      }
      return acc;
    });

    setInventoryItems(normalized);
    setAccounts(syncedAccounts);
    setShareholders(INITIAL_SHAREHOLDERS);
    setWarehouses(INITIAL_WAREHOUSES);
    try {
      window.localStorage.setItem(CLOUDY_SHOP_V4_KEY, '1');
    } catch {}
  }, [inventoryItems, setAccounts, setInventoryItems, setShareholders, setWarehouses]);

  // Calculate Initial 50/50 Capital Baseline from Cloudy Shop Inventory
  const initialInventoryCapitalBaseline = useMemo(() => {
    return CLOUDY_SHOP_INVENTORY.reduce(
      (sum, item) => sum + item.stockQty * (item.valuationRate || 0),
      0
    );
  }, []);

  const buildSnapshotRecord = (
    customLabel?: string,
    backupType: TimeMachineSnapshotRecord['backupType'] = 'بک‌آپ دستی',
    nextIdxNumber?: number
  ): TimeMachineSnapshotRecord => {
    const verNum = nextIdxNumber ?? backupSnapshots.length + 1;
    const checksum = computeSnapshotChecksum({
      accounts,
      salesInvoices,
      purchaseInvoices,
      inventoryItems,
      masterOptions,
      categorySectors,
    });
    const totalAssets =
      accounts.find((a) => a.code === '1000')?.balance ??
      inventoryItems.reduce((s, i) => s + i.stockQty * (i.valuationRate || 0), 0);

    return {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      versionCode: `V${String(verNum).padStart(3, '0')}`,
      timestamp: `${formatPersianDate(new Date())} - ${new Date().toLocaleTimeString('fa-IR')}`,
      backupType,
      label: customLabel || `بک‌آپ دستی نسخه ${verNum}`,
      checksum,
      invoiceCount: salesInvoices.length + purchaseInvoices.length,
      skuCount: inventoryItems.length,
      totalAssets,
      accounts: structuredClone(accounts),
      glEntries: structuredClone(glEntries),
      journalEntries: structuredClone(journalEntries),
      salesInvoices: structuredClone(salesInvoices),
      purchaseInvoices: structuredClone(purchaseInvoices),
      inventoryItems: structuredClone(inventoryItems),
      customerContacts: structuredClone(customerContacts),
      shareholders: structuredClone(shareholders),
      masterOptions: structuredClone(masterOptions),
      categorySectors: structuredClone(categorySectors),
      shareholderSnapshots: structuredClone(shareholderSnapshots),
      monthlyExpenseLedger: structuredClone(monthlyExpenseLedger),
      stockLedgerEntries: structuredClone(stockLedgerEntries),
      theftFraudIncidents: structuredClone(theftFraudIncidents),
      calendarEvents: structuredClone(calendarEvents),
      customerWishlist: structuredClone(customerWishlist),
      recurringTemplates: structuredClone(recurringTemplates),
    };
  };

  // Save a Manual Backup Snapshot
  const handleCreateSnapshot = (customLabel?: string): TimeMachineSnapshotRecord => {
    const snap = buildSnapshotRecord(
      customLabel,
      'بک‌آپ دستی',
      backupSnapshots.length + 1
    );
    setBackupSnapshots((prev) => {
      const next = [...prev, snap];
      setCurrentSnapshotIndex(next.length - 1);
      return next;
    });
    showToast(
      `نسخه بک‌آپ «${snap.versionCode} (${snap.label})» با کد سلامت ${snap.checksum} ثبت شد.`
    );
    recordAuditLog(
      'تهیه نسخه پشتیبان دستی',
      `ثبت بک‌آپ ${snap.versionCode} (${snap.label})`,
      'سیستم'
    );
    return snap;
  };

  const applySnapshotState = (snap: TimeMachineSnapshotRecord, idx: number) => {
    setAccounts(snap.accounts);
    setGlEntries(snap.glEntries);
    setJournalEntries(snap.journalEntries);
    setSalesInvoices(snap.salesInvoices);
    setPurchaseInvoices(snap.purchaseInvoices);
    setInventoryItems(snap.inventoryItems);
    setCustomerContacts(snap.customerContacts);
    setShareholders(snap.shareholders);
    if (snap.masterOptions) {
      setMasterOptions(snap.masterOptions);
      window.localStorage.setItem('emkan.v4.master-options', JSON.stringify(snap.masterOptions));
    }
    const restoredCategorySectors =
      snap.categorySectors || snap.masterOptions?.categorySectors;
    if (restoredCategorySectors) {
      setCategorySectors(restoredCategorySectors);
      window.localStorage.setItem(
        'emkan.v4.category-sectors',
        JSON.stringify(restoredCategorySectors)
      );
    }
    if (snap.shareholderSnapshots) {
      setShareholderSnapshots(snap.shareholderSnapshots);
    }
    if (snap.monthlyExpenseLedger) {
      setMonthlyExpenseLedger(snap.monthlyExpenseLedger);
    }
    if (snap.stockLedgerEntries) {
      setStockLedgerEntries(snap.stockLedgerEntries);
    }
    if (snap.theftFraudIncidents) {
      setTheftFraudIncidents(snap.theftFraudIncidents);
    }
    if (snap.calendarEvents) {
      setCalendarEvents(snap.calendarEvents);
    }
    if (snap.customerWishlist) {
      setCustomerWishlist(snap.customerWishlist);
    }
    if (snap.recurringTemplates) {
      setRecurringTemplates(snap.recurringTemplates);
    }
    setCurrentSnapshotIndex(idx);
    // Trigger full state rehydration across all mounted components and open tabs
    setRehydrationVersion((v) => v + 1);
    broadcastSnapshotRehydrate(snap.id);
    recordAuditLog(
      'بازیابی نسخه پشتیبان',
      `بازگشت سامانه به وضعیت بک‌آپ ${snap.versionCode} (${snap.label})`,
      'سیستم'
    );
  };

  const handleRestoreSnapshotAtIndex = (targetIdx: number) => {
    const targetSnap = backupSnapshots[targetIdx];
    if (!targetSnap) return;

    // Non-destructive protection: if user is at the tip and live state changed, save a protective snapshot first so Roll-forward never loses the latest work
    const liveChecksum = computeSnapshotChecksum({
      accounts,
      salesInvoices,
      purchaseInvoices,
      inventoryItems,
      ...(backupSnapshots[backupSnapshots.length - 1]?.masterOptions
        ? { masterOptions }
        : {}),
      ...(backupSnapshots[backupSnapshots.length - 1]?.categorySectors
        ? { categorySectors }
        : {}),
    });
    const lastSnap = backupSnapshots[backupSnapshots.length - 1];
    if (
      targetIdx < backupSnapshots.length - 1 &&
      lastSnap &&
      lastSnap.checksum !== liveChecksum
    ) {
      const protective = buildSnapshotRecord(
        'وضعیت آخرین تغییرات پیش از بازگشت به عقب',
        'بک‌آپ خودکار',
        backupSnapshots.length + 1
      );
      setBackupSnapshots((prev) => [...prev, protective]);
    }

    applySnapshotState(targetSnap, targetIdx);
    showToast(
      `بازگردانی کامل به نسخه «${targetSnap.versionCode} (${targetSnap.label})» انجام شد؛ نسخه‌های بعدی حفظ شدند.`
    );
  };

  const handleUndoSnapshot = () => {
    if (backupSnapshots.length === 0) {
      showToast('ابتدا یک بک‌آپ در تایم‌ماشین ثبت کنید.');
      return;
    }
    const effectiveCurrent =
      currentSnapshotIndex >= 0 ? currentSnapshotIndex : backupSnapshots.length - 1;
    const targetIdx = Math.max(0, effectiveCurrent - 1);
    handleRestoreSnapshotAtIndex(targetIdx);
  };

  const handleRedoSnapshot = () => {
    if (
      backupSnapshots.length === 0 ||
      currentSnapshotIndex >= backupSnapshots.length - 1
    ) {
      showToast('شما در آخرین نسخه تاریخچه قرار دارید.');
      return;
    }
    const targetIdx = currentSnapshotIndex + 1;
    const snap = backupSnapshots[targetIdx];
    if (!snap) return;
    applySnapshotState(snap, targetIdx);
    showToast(`انتقال به نسخه جدیدتر «${snap.versionCode} (${snap.label})» انجام شد.`);
  };

  const handleImportBackupSnapshotFile = (rawJson: string, fileName: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.inventoryItems)) {
        showToast('فرمت فایل بک‌آپ معتبر نیست.');
        return;
      }
      const verNum = backupSnapshots.length + 1;
      const checksum = computeSnapshotChecksum({
        accounts: parsed.accounts,
        salesInvoices: parsed.salesInvoices || [],
        purchaseInvoices: parsed.purchaseInvoices || [],
        inventoryItems: parsed.inventoryItems,
        masterOptions: parsed.masterOptions || masterOptions,
        categorySectors: parsed.categorySectors || categorySectors,
      });
      const totalAssets =
        parsed.accounts.find((a: AccountNode) => a.code === '1000')?.balance ?? 0;

      const importedSnap: TimeMachineSnapshotRecord = {
        id: `snap-imp-${Date.now()}`,
        versionCode: `V${String(verNum).padStart(3, '0')}`,
        timestamp: `${formatPersianDate(new Date())} - ${new Date().toLocaleTimeString('fa-IR')}`,
        backupType: 'ایمپورت فایل',
        label: parsed.label || `ایمپورت فایل: ${fileName}`,
        checksum,
        invoiceCount:
          (parsed.salesInvoices?.length || 0) + (parsed.purchaseInvoices?.length || 0),
        skuCount: parsed.inventoryItems.length,
        totalAssets,
        accounts: parsed.accounts,
        glEntries: parsed.glEntries || [],
        journalEntries: parsed.journalEntries || [],
        salesInvoices: parsed.salesInvoices || [],
        purchaseInvoices: parsed.purchaseInvoices || [],
        inventoryItems: parsed.inventoryItems,
        customerContacts: parsed.customerContacts || customerContacts,
        shareholders: parsed.shareholders || shareholders,
        masterOptions: parsed.masterOptions || masterOptions,
        categorySectors: parsed.categorySectors || categorySectors,
        shareholderSnapshots: parsed.shareholderSnapshots || shareholderSnapshots,
        monthlyExpenseLedger: parsed.monthlyExpenseLedger || monthlyExpenseLedger,
        stockLedgerEntries: parsed.stockLedgerEntries || stockLedgerEntries,
        theftFraudIncidents: parsed.theftFraudIncidents || theftFraudIncidents,
        calendarEvents: parsed.calendarEvents || calendarEvents,
        customerWishlist: parsed.customerWishlist || customerWishlist,
        recurringTemplates: parsed.recurringTemplates || recurringTemplates,
      };

      setBackupSnapshots((prev) => {
        const next = [...prev, importedSnap];
        setCurrentSnapshotIndex(next.length - 1);
        return next;
      });
      applySnapshotState(importedSnap, backupSnapshots.length);
      showToast(
        `فایل بک‌آپ «${fileName}» (نسخه ${importedSnap.versionCode}) ایمپورت و بازیابی شد.`
      );
    } catch {
      showToast('خطا در خواندن فایل JSON بک‌آپ.');
    }
  };

  const handleAddMasterOption = (
    category: keyof MasterOptionsRegistry,
    newValue: string
  ) => {
    if (category === 'categorySectors') return;
    const trimmed = newValue.trim();
    if (!trimmed) return;
    setMasterOptions((prev) => {
      const list = (prev[category] as string[]) || [];
      if (list.includes(trimmed)) return prev;
      const updated = {
        ...prev,
        [category]: [...list, trimmed],
      };
      window.localStorage.setItem('emkan.v4.master-options', JSON.stringify(updated));
      return updated;
    });
    // Auto-map sector if new tag
    if (category === 'tags') {
      const det = detectCategorySector(trimmed, categorySectors);
      setCategorySectors((prev) => {
        if (prev[trimmed]) return prev;
        const updated = { ...prev, [trimmed]: det };
        window.localStorage.setItem('emkan.v4.category-sectors', JSON.stringify(updated));
        return updated;
      });
    }
    showToast(`«${trimmed}» به لیست اضافه شد.`);
  };

  const handleSetCategorySector = (category: string, sector: 'vape' | 'pc') => {
    const trimmed = category.trim();
    if (!trimmed) return;
    setCategorySectors((prev) => {
      const updated = { ...prev, [trimmed]: sector };
      window.localStorage.setItem('emkan.v4.category-sectors', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteCategory = (category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    setMasterOptions((prev) => {
      const updatedTags = (prev.tags || []).filter((t) => t !== trimmed);
      const updated = { ...prev, tags: updatedTags };
      window.localStorage.setItem('emkan.v4.master-options', JSON.stringify(updated));
      return updated;
    });
    setCategorySectors((prev) => {
      const copy = { ...prev };
      delete copy[trimmed];
      window.localStorage.setItem('emkan.v4.category-sectors', JSON.stringify(copy));
      return copy;
    });
    showToast(`دسته‌بندی «${trimmed}» با موفقیت حذف شد.`);
  };

  const handleDeleteMasterOption = (
    category: keyof MasterOptionsRegistry,
    value: string
  ) => {
    if (category === 'categorySectors') return;
    setMasterOptions((prev) => {
      const list = (prev[category] as string[]) || [];
      const updatedList = list.filter((v) => v !== value);
      const updated = {
        ...prev,
        [category]: updatedList,
      };
      try {
        window.localStorage.setItem('emkan.v4.master-options', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast(`«${value}» از فهرست گزینه‌ها حذف شد.`);
  };

  const handleSyncInventorySectors = () => {
    let updatedCount = 0;
    setInventoryItems((prev) =>
      prev.map((item) => {
        const cat = item.parentTag || item.category;
        const properSector = detectCategorySector(cat, categorySectors);
        if (item.sector !== properSector) {
          updatedCount++;
          return { ...item, sector: properSector };
        }
        return item;
      })
    );
    showToast(`صنف ${updatedCount} قلم کالا در انبار با دسته‌بندی‌ها همگام‌سازی شد.`);
  };

  // POS Checkout Handler (handles Normal/Festival/Reseller, Bottle/Decant ml + Virtual Open Bottle item, Services, 3 Liquidity Accounts, Credit Receivables)
  const handleCompletePosCheckout = (payload: PosCheckoutPayload): boolean => {
    const updatedInventory = [...inventoryItems];
    let vapeCogs = 0;
    let pcCogs = 0;
    let vapeRev = 0;
    let pcRev = 0;
    const newStockLedgerRows: StockLedgerEntryRecord[] = [];
    const maxPosSeq = salesInvoices.reduce((max, s) => {
      const m = s.invoiceNo.match(/(\d+)$/);
      const num = m ? parseInt(m[1], 10) : 0;
      return num > max ? num : max;
    }, 1000);
    const invNo = `POS-${getPersianYear(new Date(), { latinDigits: true })}-${String(maxPosSeq + 1).padStart(4, '0')}`;
    const todayStr = formatPersianDate(new Date());

    for (const line of payload.cartLines) {
      const idx = updatedInventory.findIndex((i) => i.sku === line.sku);
      if (idx === -1) continue;
      const item = updatedInventory[idx];

      if (line.isDecantMl) {
        const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
        const decantRes = deductDecantMlFromBottle({
          sku: item.sku,
          stockBottles: item.stockQty,
          openBottleRemainingMl: item.openBottleRemainingMl ?? 0,
          bottleVolumeMl: bottleVol,
          soldMl: line.qty,
          bottleValuationRate: item.valuationRate,
        });
        if (!decantRes.success) {
          showToast(decantRes.errorMessage || 'موجودی میلی‌لیتری بطری کافی نیست.');
          return false;
        }
        const currentWh = item.warehouseStock || {
          vitrine: item.stockQty,
          central_external: 0,
          shop_storage: 0,
          consignment: 0,
        };
        const nextVitrine = Math.max(
          0,
          (currentWh.vitrine ?? item.stockQty) - decantRes.bottlesOpened
        );
        updatedInventory[idx] = {
          ...item,
          stockQty: decantRes.newStockBottles,
          openBottleRemainingMl: decantRes.newOpenBottleRemainingMl,
          totalOutQty: (item.totalOutQty ?? 0) + decantRes.bottlesOpened,
          warehouseStock: {
            ...currentWh,
            vitrine: nextVitrine,
          },
        };

        // Create or update virtual open-bottle item (decant_${sku}) in Vitrine warehouse
        const virtualSku = `decant_${item.sku}`;
        const virtualIdx = updatedInventory.findIndex((i) => i.sku === virtualSku);
        if (decantRes.newOpenBottleRemainingMl > 0) {
          const virtualItem: InventoryItemRecord = {
            id: virtualIdx >= 0 ? updatedInventory[virtualIdx].id : `decant-id-${item.sku}`,
            sku: virtualSku,
            name: `${item.name} (فروش باز / دکانت)`,
            category: 'جویس و سالت',
            sector: 'vape',
            brand: item.brand,
            parentTag: 'بطری باز / دکانت',
            condition: 'کارکرده / تستر',
            uomPrimary: 'میلی‌لیتر',
            stockQty: decantRes.newOpenBottleRemainingMl,
            warehouseStock: {
              vitrine: decantRes.newOpenBottleRemainingMl,
              shop_storage: 0,
              central_external: 0,
              consignment: 0,
            },
            isVirtualDecantBottle: true,
            parentBottleSku: item.sku,
            reservedQty: 0,
            reorderLevel: 0,
            valuationRate: decantRes.costPerMl,
            retailPrice: line.finalManualUnitPrice,
            wholesalePrice: line.finalManualUnitPrice,
            partnerPrice: line.finalManualUnitPrice,
            serialNumbers: [],
            batchNo: item.batchNo || 'DECANT',
            expiryDate: item.expiryDate || '—',
          };
          if (virtualIdx >= 0) {
            updatedInventory[virtualIdx] = virtualItem;
          } else {
            updatedInventory.push(virtualItem);
          }
        } else if (virtualIdx >= 0) {
          updatedInventory[virtualIdx] = {
            ...updatedInventory[virtualIdx],
            stockQty: 0,
            warehouseStock: { vitrine: 0 },
          };
        }

        vapeCogs = exactAdd(vapeCogs, decantRes.lineCogs);
        vapeRev = exactAdd(vapeRev, exactMul(line.qty, line.finalManualUnitPrice));

        newStockLedgerRows.push({
          id: `sle-pos-decant-${Date.now()}-${item.sku}-${newStockLedgerRows.length}`,
          postingDate: todayStr,
          sku: item.sku,
          itemName: `${item.name} (دکانت ${line.qty} ml)`,
          warehouseKey: 'vitrine',
          qtyChange: -decantRes.bottlesOpened,
          balanceAfter: decantRes.newStockBottles,
          valuationRate: item.valuationRate,
          voucherType: 'فروش دکانت (POS)',
          voucherNo: invNo,
          sector: item.sector || 'vape',
          timestamp: Date.now(),
          serial: stockLedgerEntries.length + newStockLedgerRows.length + 1,
        });
      } else {
        if (item.stockQty < line.qty) {
          showToast(`موجودی «${item.name}» کافی نیست (موجودی فعلی: ${item.stockQty}).`);
          return false;
        }
        const whKey = line.warehouseKey || 'vitrine';
        const currWhStock = { ...(item.warehouseStock || {}) };
        currWhStock[whKey] = Math.max(0, (currWhStock[whKey] ?? item.stockQty) - line.qty);

        if (item.sector === 'pc') {
          const fifo = consumeWarehouseFifoLayers({
            warehouseFifoLayers: item.warehouseFifoLayers,
            globalFifoLayers: item.fifoLayers,
            warehouseKey: whKey,
            soldQty: line.qty,
            fallbackUnitCost:
              item.warehouseValuationRates?.[whKey] ?? item.valuationRate ?? 0,
          });
          pcCogs = exactAdd(pcCogs, fifo.totalCogs);
          pcRev = exactAdd(pcRev, exactMul(line.qty, line.finalManualUnitPrice));
          const nextStock = item.stockQty - line.qty;
          updatedInventory[idx] = {
            ...item,
            stockQty: nextStock,
            warehouseStock: currWhStock,
            warehouseFifoLayers: fifo.updatedWarehouseFifoLayers,
            fifoLayers: fifo.updatedGlobalFifoLayers,
            totalOutQty: (item.totalOutQty ?? 0) + line.qty,
            lastSoldDate: todayStr,
            daysInStock: 0,
          };
          newStockLedgerRows.push({
            id: `sle-pos-${Date.now()}-${item.sku}-${newStockLedgerRows.length}`,
            postingDate: todayStr,
            sku: item.sku,
            itemName: item.name,
            warehouseKey: whKey,
            qtyChange: -line.qty,
            balanceAfter: nextStock,
            valuationRate: line.qty > 0 ? Math.round(fifo.totalCogs / line.qty) : item.valuationRate,
            voucherType: 'فروش کالا (POS)',
            voucherNo: invNo,
            sector: 'pc',
            timestamp: Date.now(),
            serial: stockLedgerEntries.length + newStockLedgerRows.length + 1,
          });
        } else {
          const whUnitRate =
            item.warehouseValuationRates?.[whKey] ?? item.valuationRate ?? 0;
          const lineCogs = exactMul(line.qty, whUnitRate);
          vapeCogs = exactAdd(vapeCogs, lineCogs);
          vapeRev = exactAdd(vapeRev, exactMul(line.qty, line.finalManualUnitPrice));
          const nextStock = item.stockQty - line.qty;
          updatedInventory[idx] = {
            ...item,
            stockQty: nextStock,
            warehouseStock: currWhStock,
            totalOutQty: (item.totalOutQty ?? 0) + line.qty,
            lastSoldDate: todayStr,
            daysInStock: 0,
          };
          newStockLedgerRows.push({
            id: `sle-pos-${Date.now()}-${item.sku}-${newStockLedgerRows.length}`,
            postingDate: todayStr,
            sku: item.sku,
            itemName: item.name,
            warehouseKey: whKey,
            qtyChange: -line.qty,
            balanceAfter: nextStock,
            valuationRate: whUnitRate,
            voucherType: 'فروش کالا (POS)',
            voucherNo: invNo,
            sector: item.sector || 'vape',
            timestamp: Date.now(),
            serial: stockLedgerEntries.length + newStockLedgerRows.length + 1,
          });
        }
      }
    }

    // Deduct service consumables from Vitrine warehouse if physically linked & available
    let serviceConsumableCogs = 0;
    let actualConsumableInventoryCogs = 0;

    for (const sLine of payload.serviceLines) {
      if (sLine.isEstimatedConsumption && (sLine.estimatedMaterialCost || 0) > 0) {
        // Variable/uncounted consumable (e.g. Cotton sheets):
        const matCost = Math.max(0, sLine.estimatedMaterialCost || 0);
        serviceConsumableCogs = exactAdd(serviceConsumableCogs, matCost);

        if (sLine.linkedConsumableSku) {
          const cIdx = updatedInventory.findIndex((i) => i.sku === sLine.linkedConsumableSku);
          if (cIdx !== -1) {
            const cItem = updatedInventory[cIdx];
            newStockLedgerRows.push({
              id: `sle-srv-est-${Date.now()}-${cItem.sku}`,
              postingDate: todayStr,
              sku: cItem.sku,
              itemName: cItem.name,
              warehouseKey: 'vitrine',
              qtyChange: 0,
              balanceAfter: cItem.stockQty,
              valuationRate: cItem.valuationRate || 0,
              voucherType: 'Consumable Estimated Cost',
              voucherNo: invNo,
              sector: cItem.sector || 'vape',
              timestamp: Date.now(),
              serial: stockLedgerEntries.length + newStockLedgerRows.length + 1,
            });
          }
        }
      } else if (sLine.linkedConsumableSku && (sLine.linkedConsumableQty || 0) > 0) {
        const cIdx = updatedInventory.findIndex((i) => i.sku === sLine.linkedConsumableSku);
        if (cIdx !== -1) {
          const cItem = updatedInventory[cIdx];
          const reqQty = sLine.linkedConsumableQty || 1;
          const whStock = { ...(cItem.warehouseStock || {}) };
          const availableVitrine = whStock.vitrine ?? cItem.stockQty;

          // Only deduct what is physically available in inventory to prevent negative stock & negative GL
          const deductQty = Math.max(0, Math.min(availableVitrine, reqQty));
          const nextStock = Math.max(0, cItem.stockQty - deductQty);
          whStock.vitrine = Math.max(0, availableVitrine - deductQty);

          if (deductQty > 0) {
            updatedInventory[cIdx] = {
              ...cItem,
              stockQty: nextStock,
              warehouseStock: whStock,
              totalOutQty: (cItem.totalOutQty ?? 0) + deductQty,
            };
            const itemCost = exactMul(deductQty, cItem.valuationRate || 0);
            serviceConsumableCogs = exactAdd(serviceConsumableCogs, itemCost);
            actualConsumableInventoryCogs = exactAdd(actualConsumableInventoryCogs, itemCost);

            newStockLedgerRows.push({
              id: `sle-srv-${Date.now()}-${cItem.sku}`,
              postingDate: todayStr,
              sku: cItem.sku,
              itemName: cItem.name,
              warehouseKey: 'vitrine',
              qtyChange: -deductQty,
              balanceAfter: nextStock,
              valuationRate: cItem.valuationRate || 0,
              voucherType: 'Service Consumable',
              voucherNo: invNo,
              sector: cItem.sector || 'vape',
              timestamp: Date.now(),
              serial: stockLedgerEntries.length + 1,
            });
          } else {
            // Physical stock is 0: do not force inventory negative, but record cost in serviceConsumableCogs for invoice stats
            const nominalCost = exactMul(reqQty, cItem.valuationRate || sLine.consumableCost || 0);
            serviceConsumableCogs = exactAdd(serviceConsumableCogs, nominalCost);
          }
        }
      }
    }

    const totalCogs = exactAdd(exactAdd(vapeCogs, pcCogs), serviceConsumableCogs);
    const serviceRev = payload.serviceLines.reduce(
      (sum, line) => exactAdd(sum, line.feeAmount),
      0
    );
    const productRev = Math.max(0, payload.netTotal - serviceRev);

    const newInvoice: SalesInvoiceRecord = {
      id: `sinv-${Date.now()}`,
      invoiceNo: invNo,
      docstatus: 1,
      customerId: customerContacts.find(
        (contact) =>
          contact.fullName.trim() === (payload.customerName || 'مشتری حضوری').trim()
      )?.id,
      customerName: payload.customerName || 'مشتری حضوری',
      customerPhone: payload.customerPhone,
      referralName: payload.referralName,
      pricingMode: payload.pricingMode,
      paymentAccountCode: payload.paymentAccountCode,
      paymentMethodLabel: payload.paymentMethodLabel,
      date: todayStr,
      dueDate: todayStr,
      branchDimension: defaultBranch,
      channelDimension: 'فروش حضوری (پوز)',
      paymentTermsTemplate:
        payload.creditReceivableAmount > 0 ? 'نسیه (بدهکار)' : 'تسویه نقد/کارت در لحظه',
      updateStock: true,
      isSubscription: false,
      status: payload.creditReceivableAmount > 0 ? 'نسیه (بدهکار)' : 'پرداخت‌شده',
      totalAmount: payload.netTotal,
      paidAmount: payload.paidAmount,
      cogsAmount: totalCogs,
      vapeCogsAmount: vapeCogs + serviceConsumableCogs,
      pcCogsAmount: pcCogs,
      vapeRevenueAmount: vapeRev + serviceRev,
      pcRevenueAmount: pcRev,
      itemsSummary: [
        ...payload.cartLines.map((l) => `${l.qty} ${l.uom} ${l.name}`),
        ...payload.serviceLines.map((s) => `خدمات: ${s.serviceTitle}`),
      ].join(' + '),
      lines: payload.cartLines.map((l, idx) => ({
        id: `line-${Date.now()}-${idx}`,
        sku: l.sku,
        itemName: l.name,
        uom: l.uom,
        qty: l.qty,
        unitPrice: l.finalManualUnitPrice,
        discountPercent: (l.lineDiscount && l.qty * l.finalManualUnitPrice > 0)
          ? Math.round((l.lineDiscount / (l.qty * l.finalManualUnitPrice)) * 100)
          : 0,
        netLineAmount: l.netLineAmount ?? Math.max(0, (l.qty * l.finalManualUnitPrice) - (l.lineDiscount || 0)),
        allocatedHeaderDiscount: l.allocatedHeaderDiscount ?? (l.lineDiscount || 0),
        valuationRate: l.unitValuationCost,
        isDecantMl: l.isDecantMl,
        sector: l.sector,
        warehouseKey: l.warehouseKey,
      })),
      serviceLines: payload.serviceLines,
    };

    // Double-entry lines
    const ledgerLines: { accountCode: string; debit: number; credit: number }[] = [];
    if (payload.paidAmount > 0) {
      ledgerLines.push({
        accountCode: payload.paymentAccountCode,
        debit: payload.paidAmount,
        credit: 0,
      });
    }
    if (payload.creditReceivableAmount > 0) {
      ledgerLines.push({
        accountCode: '1102',
        debit: payload.creditReceivableAmount,
        credit: 0,
      });
    }
    if (payload.usedCreditBalance && payload.usedCreditBalance > 0) {
      ledgerLines.push({
        accountCode: '2102',
        debit: payload.usedCreditBalance,
        credit: 0,
      });
    }
    if (productRev > 0) {
      ledgerLines.push({
        accountCode: '4101',
        debit: 0,
        credit: productRev,
      });
    }
    if (serviceRev > 0) {
      ledgerLines.push({
        accountCode: '4105',
        debit: 0,
        credit: serviceRev,
      });
    }
    const totalPhysicalCogs = exactAdd(exactAdd(vapeCogs, pcCogs), actualConsumableInventoryCogs);
    if (totalPhysicalCogs > 0) {
      ledgerLines.push(
        { accountCode: '5101', debit: totalPhysicalCogs, credit: 0 },
        { accountCode: '110401', debit: 0, credit: totalPhysicalCogs }
      );
    }

    const newGlEntries: GLEntryRecord[] = ledgerLines.map((line, idx) => ({
      id: `gle-pos-${Date.now()}-${idx}`,
      postingDate: todayStr,
      accountCode: line.accountCode,
      accountName: accounts.find((a) => a.code === line.accountCode)?.name || line.accountCode,
      partyId: newInvoice.customerId,
      partyType: 'مشتری',
      partyName: newInvoice.customerName,
      debit: line.debit,
      credit: line.credit,
      voucherType: 'POS Invoice',
      voucherNo: invNo,
      remarks: `ثبت فاکتور فروش ${invNo} در صندوق (${newInvoice.itemsSummary})`,
      branchDimension: defaultBranch,
      costCenter: 'مرکز هزینه پیش‌فرض',
      timestamp: Date.now() + idx,
    }));

    const nextAccounts = postDoubleEntryToAccounts(accounts, ledgerLines);
    const nextInventory = updatedInventory;
    const nextInvoices = [newInvoice, ...salesInvoices];
    const nextGl = [...newGlEntries, ...glEntries];
    const nextStockLedger = newStockLedgerRows.length > 0 ? [...newStockLedgerRows, ...stockLedgerEntries] : stockLedgerEntries;
    let nextCustomerContacts = customerContacts;
    const hasCreditChange =
      payload.creditReceivableAmount > 0 || (payload.usedCreditBalance && payload.usedCreditBalance > 0);
    if (hasCreditChange && payload.customerName) {
      nextCustomerContacts = customerContacts.map((c) => {
        const isTarget = newInvoice.customerId
          ? c.id === newInvoice.customerId
          : c.fullName.trim() === payload.customerName.trim();
        if (!isTarget) return c;
        let updatedDebit = c.debitBalance ?? 0;
        let updatedCredit = c.creditBalance ?? 0;
        if (payload.creditReceivableAmount > 0) {
          updatedDebit += payload.creditReceivableAmount;
        }
        if (payload.usedCreditBalance && payload.usedCreditBalance > 0) {
          updatedCredit = Math.max(0, updatedCredit - payload.usedCreditBalance);
        }
        return {
          ...c,
          debitBalance: updatedDebit,
          creditBalance: updatedCredit,
        };
      });
    }

    void atomicCommitMultiStores([
      { storageKey: 'emkan.v4.accounts', value: nextAccounts },
      { storageKey: 'emkan.v1.inventory-items', value: nextInventory },
      { storageKey: 'emkan.v1.sales-invoices', value: nextInvoices },
      { storageKey: 'emkan.v1.gl-entries', value: nextGl },
      { storageKey: 'emkan.v4.stock-ledger-entries', value: nextStockLedger },
      { storageKey: 'emkan.v1.customer-contacts', value: nextCustomerContacts },
    ]);

    setAccounts(nextAccounts);
    setInventoryItems(nextInventory);
    setSalesInvoices(nextInvoices);
    setGlEntries(nextGl);
    if (newStockLedgerRows.length > 0) {
      setStockLedgerEntries(nextStockLedger);
    }
    if (hasCreditChange && payload.customerName) {
      setCustomerContacts(nextCustomerContacts);
    }

    showToast(`فاکتور «${invNo}» در صندوق و دفتر کل ثبت شد.`);
    recordAuditLog(
      'ثبت فاکتور فروش',
      `فاکتور ${invNo} · مشتری: ${payload.customerName || 'مشتری عمومی'} · مبلغ: ${newInvoice.totalAmount.toLocaleString('fa-IR')} تومان (${newInvoice.itemsSummary})`,
      'فروش'
    );
    return true;
  };

  // POS Return Handler (Credit Balance or Cash Refund)
  const handleProcessPosReturn = (payload: PosReturnPayload): boolean => {
    const inv = salesInvoices.find((s) => s.id === payload.sourceInvoiceId);
    if (
      !inv ||
      inv.docstatus !== 1 ||
      inv.returnAgainst
    ) {
      showToast('فاکتور مبدا برای مرجوعی معتبر نیست.');
      return false;
    }

    // Determine items to return (either custom line selections or original invoice lines)
    const itemsToReturn: PosReturnItemLine[] =
      payload.returnItems && payload.returnItems.length > 0
        ? payload.returnItems
        : (inv.lines || []).map((l) => ({
            sku: l.sku,
            itemName: l.itemName,
            qty: l.qty,
            unitPrice: l.unitPrice,
            restockingFee: 0,
            isDecantMl: l.isDecantMl,
            warehouseKey: l.warehouseKey,
          }));

    if (itemsToReturn.length === 0) {
      showToast('هیچ کالایی برای مرجوعی انتخاب نشده است.');
      return false;
    }

    // Anti-fraud check: Prevent duplicate returns across past return invoices (strictly by Invoice ID + Line Item / SKU)
    const pastReturns = salesInvoices.filter((s) => s.returnAgainst === inv.id && s.docstatus === 1);
    for (const item of itemsToReturn) {
      const origLine = inv.lines?.find(
        (l) => (item.lineId && l.id === item.lineId) || l.sku === item.sku
      );
      const origQty = origLine ? origLine.qty : 0;
      const alreadyReturnedQty = pastReturns.reduce((sum, pastRet) => {
        const pastLine = pastRet.lines?.find(
          (l) => (item.lineId && l.id === item.lineId) || l.sku === item.sku
        );
        return sum + (pastLine ? pastLine.qty : 0);
      }, 0);

      if (alreadyReturnedQty + item.qty > origQty) {
        showToast('این مرجوعی تکراریه');
        return false;
      }
    }

    // Restore returned items in inventory
    const itemsToRestore = itemsToReturn.map((l) => ({
      sku: l.sku,
      qty: l.qty,
      isDecantMl: l.isDecantMl,
      warehouseKey: l.warehouseKey,
    }));
    const nextInventory = restoreStockWithBundles(inventoryItems, itemsToRestore);

    // Financial calculations
    const grossReturnAmount =
      payload.grossReturnAmount > 0
        ? payload.grossReturnAmount
        : itemsToReturn.reduce((s, it) => s + it.qty * it.unitPrice, 0);

    const totalRestockingFee = Math.max(
      0,
      payload.totalRestockingFee ?? payload.restockingFee ?? itemsToReturn.reduce((s, it) => s + (it.restockingFee || 0), 0)
    );

    const netRefundAmount = Math.max(0, grossReturnAmount - totalRestockingFee);

    // Calculate COGS to reverse
    const cogsReverse = itemsToReturn.reduce((sum, item) => {
      const origLine = inv.lines?.find((l) => l.sku === item.sku);
      const rate =
        origLine?.valuationRate ||
        inventoryItems.find((i) => i.sku === item.sku)?.valuationRate ||
        0;
      return sum + Math.round(item.qty * rate);
    }, 0);

    // Double-entry ledger lines
    const ledgerLines: { accountCode: string; debit: number; credit: number }[] = [
      { accountCode: '4101', debit: grossReturnAmount, credit: 0 },
    ];

    if (totalRestockingFee > 0) {
      // 4103: درآمد کسر مرجوعی و افت قیمت کالا
      ledgerLines.push({ accountCode: '4103', debit: 0, credit: totalRestockingFee });
    }

    let settledDebt = 0;
    let remainingCredit = netRefundAmount;

    if (payload.resolutionMode === 'cash_refund') {
      if (netRefundAmount > 0) {
        ledgerLines.push({
          accountCode: payload.refundAccountCode || '110102',
          debit: 0,
          credit: netRefundAmount,
        });
      }
    } else {
      // Store credit mode: first settle outstanding receivables (1102) if customer owes debt, then credit 2102
      const customerContact = customerContacts.find(
        (c) => c.fullName.trim() === inv.customerName.trim() || c.id === inv.customerId
      );
      if (customerContact && (customerContact.debitBalance ?? 0) > 0) {
        settledDebt = Math.min(customerContact.debitBalance ?? 0, netRefundAmount);
        remainingCredit = Math.max(0, netRefundAmount - settledDebt);
      }

      if (settledDebt > 0) {
        ledgerLines.push({ accountCode: '1102', debit: 0, credit: settledDebt });
      }
      if (remainingCredit > 0) {
        ledgerLines.push({ accountCode: '2102', debit: 0, credit: remainingCredit });
      }
    }

    if (cogsReverse > 0) {
      ledgerLines.push(
        { accountCode: '110401', debit: cogsReverse, credit: 0 },
        { accountCode: '5101', debit: 0, credit: cogsReverse }
      );
    }

    // Post double entries to accounts
    const nextAccounts = postDoubleEntryToAccounts(accounts, ledgerLines);

    const todayStr = formatPersianDate(new Date());
    const retInvNo = `RET-${inv.invoiceNo}-${Date.now().toString().slice(-4)}`;
    const itemsSummary = itemsToReturn.map((it) => `${it.itemName} × ${it.qty}`).join('، ');

    // GL Entries for the Return Transaction
    const newGlEntries: GLEntryRecord[] = ledgerLines.map((line, idx) => ({
      id: `gle-ret-${Date.now()}-${idx}`,
      postingDate: todayStr,
      accountCode: line.accountCode,
      accountName: accounts.find((a) => a.code === line.accountCode)?.name || line.accountCode,
      partyId: inv.customerId,
      partyType: 'مشتری',
      partyName: inv.customerName,
      debit: line.debit,
      credit: line.credit,
      voucherType: 'Sales Invoice',
      voucherNo: retInvNo,
      remarks: `ثبت مرجوعی فاکتور ${inv.invoiceNo} (${itemsSummary})`,
      branchDimension: defaultBranch,
      costCenter: 'مرکز هزینه پیش‌فرض',
      timestamp: Date.now() + idx,
    }));

    const nextGl = [...newGlEntries, ...glEntries];

    // Update customer contacts
    let nextCustomerContacts = customerContacts;
    if (payload.resolutionMode === 'credit_balance') {
      nextCustomerContacts = customerContacts.map((contact) => {
        const isTarget =
          (inv.customerId && contact.id === inv.customerId) ||
          contact.fullName.trim() === inv.customerName.trim();
        if (!isTarget) return contact;
        const currentDebit = contact.debitBalance ?? 0;
        const currentCredit = contact.creditBalance ?? 0;
        const newDebit = Math.max(0, currentDebit - settledDebt);
        const newCredit = currentCredit + remainingCredit;
        return {
          ...contact,
          debitBalance: newDebit,
          creditBalance: newCredit,
          notes: `${contact.notes ? contact.notes + '\n' : ''}[مرجوعی ${todayStr}] کسر افت قیمت: ${totalRestockingFee.toLocaleString('fa-IR')} ت · بستانکاری خالص: ${remainingCredit.toLocaleString('fa-IR')} ت`,
        };
      });
    }

    const returnInvoice: SalesInvoiceRecord = {
      ...inv,
      id: `sret-${Date.now()}`,
      invoiceNo: retInvNo,
      date: todayStr,
      returnAgainst: inv.id,
      returnResolutionMode: payload.resolutionMode,
      status: 'مرجوعی (یادداشت بستانکاری)',
      totalAmount: netRefundAmount,
      paidAmount: payload.resolutionMode === 'cash_refund' ? netRefundAmount : 0,
      creditedAmount: payload.resolutionMode === 'credit_balance' ? netRefundAmount : 0,
      discountAmount: totalRestockingFee,
      cogsAmount: cogsReverse,
      itemsSummary: `مرجوعی اقلام: ${itemsSummary}`,
      lines: itemsToReturn.map((it, idx) => ({
        id: it.lineId || `ret-line-${Date.now()}-${idx}`,
        sku: it.sku,
        itemName: it.itemName,
        uom: 'عدد',
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: 0,
        netLineAmount: it.qty * it.unitPrice - (it.restockingFee || 0),
        valuationRate: inventoryItems.find((i) => i.sku === it.sku)?.valuationRate || 0,
        sector: inventoryItems.find((i) => i.sku === it.sku)?.sector,
        warehouseKey: it.warehouseKey,
      })),
    };

    const nextInvoices = [returnInvoice, ...salesInvoices];

    // Stock ledger entries with explicit "مرجوعی از مشتری (سند معکوس)" label
    const returnSleRows: StockLedgerEntryRecord[] = itemsToReturn.map((it) => {
      const updatedItem = nextInventory.find((i) => i.sku === it.sku);
      const invItem = inventoryItems.find((i) => i.sku === it.sku);
      return {
        id: `sle-ret-${Date.now()}-${it.sku}`,
        postingDate: todayStr,
        sku: it.sku,
        itemName: it.itemName,
        warehouseKey: (it.warehouseKey || 'vitrine') as WarehouseKey,
        qtyChange: it.qty,
        balanceAfter: updatedItem ? updatedItem.stockQty : (invItem?.stockQty || 0) + it.qty,
        valuationRate: updatedItem?.valuationRate || invItem?.valuationRate || 0,
        voucherType: 'Sales Return',
        voucherNo: retInvNo,
        remarks: 'مرجوعی از مشتری (سند معکوس)',
        sector: updatedItem?.sector || invItem?.sector,
      };
    });

    const nextStockLedger = [...returnSleRows, ...stockLedgerEntries];

    void atomicCommitMultiStores([
      { storageKey: 'emkan.v4.accounts', value: nextAccounts },
      { storageKey: 'emkan.v1.inventory-items', value: nextInventory },
      { storageKey: 'emkan.v1.sales-invoices', value: nextInvoices },
      { storageKey: 'emkan.v1.gl-entries', value: nextGl },
      { storageKey: 'emkan.v4.stock-ledger-entries', value: nextStockLedger },
      { storageKey: 'emkan.v1.customer-contacts', value: nextCustomerContacts },
    ]);

    setAccounts(nextAccounts);
    setInventoryItems(nextInventory);
    setSalesInvoices(nextInvoices);
    setGlEntries(nextGl);
    setStockLedgerEntries(nextStockLedger);
    if (payload.resolutionMode === 'credit_balance') {
      setCustomerContacts(nextCustomerContacts);
    }

    showToast(`مرجوعی «${retInvNo}» ثبت شد و کالاها به انبار بازگشتند.`);
    recordAuditLog(
      'ثبت مرجوعی کالا',
      `مرجوعی فاکتور ${inv.invoiceNo} · روش: ${payload.resolutionMode === 'cash_refund' ? 'استرداد نقدی' : 'شارژ بستانکاری'} · اقلام: ${itemsSummary}`,
      'فروش'
    );
    return true;
  };

  // Void Sales Invoice using voidInvoice engine (تغییر وضعیت به Cancelled و رکورد جبرانی معکوس)
  const handleVoidSalesInvoice = (id: string) => {
    const inv = salesInvoices.find((s) => s.id === id);
    if (!inv || inv.docstatus === 2) return;
    if (
      inv.returnAgainst ||
      salesInvoices.some((sale) => sale.returnAgainst === inv.id)
    ) {
      showToast('برای جلوگیری از برگشت دوباره آثار مالی، ابطال فاکتور مرجوع‌شده مجاز نیست.');
      return;
    }

    const voidRes = voidInvoice({
      invoice: inv,
      invoiceType: 'sales',
      inventory: inventoryItems,
    });

    const nextInventory = voidRes.restoredInventory;
    const nextAccounts = postDoubleEntryToAccounts(accounts, voidRes.reversalLedgerLines);
    const nextInvoices = salesInvoices.map((s) => (s.id === id ? voidRes.voidedInvoice : s));
    const reversalGl: GLEntryRecord[] = voidRes.reversalLedgerLines.map((l, idx) => ({
      id: `gle-void-${inv.id}-${idx}-${Date.now()}`,
      postingDate: formatPersianDate(new Date()),
      accountCode: l.accountCode,
      accountName: accounts.find((a) => a.code === l.accountCode)?.name || l.accountCode,
      partyId: inv.customerId,
      partyType: 'مشتری',
      partyName: inv.customerName,
      debit: l.debit,
      credit: l.credit,
      voucherType: 'POS Invoice',
      voucherNo: inv.invoiceNo,
      remarks: `ابطال فاکتور فروش ${inv.invoiceNo}`,
      branchDimension: inv.branchDimension || defaultBranch,
      costCenter: 'مرکز هزینه پیش‌فرض',
      timestamp: Date.now() + idx,
    }));
    const nextGl = [...reversalGl, ...glEntries];

    void atomicCommitMultiStores([
      { storageKey: 'emkan.v4.accounts', value: nextAccounts },
      { storageKey: 'emkan.v1.inventory-items', value: nextInventory },
      { storageKey: 'emkan.v1.sales-invoices', value: nextInvoices },
      { storageKey: 'emkan.v1.gl-entries', value: nextGl },
    ]);

    setInventoryItems(nextInventory);
    setAccounts(nextAccounts);
    setSalesInvoices(nextInvoices);
    setGlEntries(nextGl);
    showToast(voidRes.auditSummary);
    recordAuditLog(
      'ابطال فاکتور فروش',
      `ابطال فاکتور فروش ${inv.invoiceNo} (${inv.itemsSummary}) و معکوس‌سازی دفاتر و انبار`,
      'فروش'
    );
  };

  // Stage-1 Purchase Creation
  const handleCreatePurchaseInvoice = (pinv: PurchaseInvoiceRecord): boolean => {
    const isDuplicate = purchaseInvoices.some(
      (existing) =>
        existing.docstatus !== 2 &&
        existing.billNo.trim().toLowerCase() === pinv.billNo.trim().toLowerCase() &&
        existing.supplierName.trim().toLowerCase() === pinv.supplierName.trim().toLowerCase()
    );
    if (isDuplicate) {
      showToast(
        `فاکتور خرید «${pinv.billNo}» برای «${pinv.supplierName}» قبلاً ثبت شده است.`
      );
      return false;
    }

    const supplier = customerContacts.find(
      (contact) =>
        (pinv.supplierId && contact.id === pinv.supplierId) ||
        contact.fullName.trim() === pinv.supplierName.trim()
    );
    const invoiceWithSupplierId = supplier ? { ...pinv, supplierId: supplier.id } : pinv;
    const paid = pinv.paidAmount ?? 0;
    const unpaid = Math.max(0, pinv.totalAmount - paid);
    const freight = Math.max(0, pinv.freightAmount ?? 0);
    const ledgerLines: { accountCode: string; debit: number; credit: number }[] = [
      { accountCode: '110403', debit: pinv.totalAmount, credit: 0 },
    ];
    if (freight > 0) {
      ledgerLines.push({ accountCode: '5204', debit: freight, credit: 0 });
    }
    if (paid > 0) {
      ledgerLines.push({
        accountCode: pinv.paymentAccountCode || '110102',
        debit: 0,
        credit: paid,
      });
    }
    if (unpaid > 0) {
      ledgerLines.push({ accountCode: '2101', debit: 0, credit: unpaid });
    }
    if (freight > 0) {
      // Freight is paid out from cash/bank
      ledgerLines.push({
        accountCode: pinv.paymentAccountCode || '110102',
        debit: 0,
        credit: freight,
      });
    }

    const nextAccounts = postDoubleEntryToAccounts(accounts, ledgerLines);
    const nextPurchaseInvoices = [invoiceWithSupplierId, ...purchaseInvoices];
    const newGlEntries: GLEntryRecord[] = ledgerLines.map((l, index) => ({
      id: `gle-pinv-${pinv.id}-${index}-${Date.now()}`,
      postingDate: pinv.date,
      voucherType: 'فاکتور خرید بار' as any,
      voucherNo: pinv.billNo,
      accountCode: l.accountCode,
      accountName: accounts.find((a) => a.code === l.accountCode)?.name || l.accountCode,
      debit: l.debit,
      credit: l.credit,
      fiscalYear: getPersianYear(),
      costCenter: pinv.costCenter || 'CC-101',
      branchDimension: pinv.branchDimension || defaultBranch,
      remarks: `خرید بار از ${pinv.supplierName} (${pinv.itemsSummary})`,
      timestamp: Date.now() + index,
    }));
    const nextGlEntries = [...newGlEntries, ...glEntries];
    let nextCustomerContacts = customerContacts;
    if (unpaid > 0) {
      nextCustomerContacts = customerContacts.map((c) =>
        (invoiceWithSupplierId.supplierId
          ? c.id === invoiceWithSupplierId.supplierId
          : c.fullName.trim() === pinv.supplierName.trim())
          ? { ...c, creditBalance: (c.creditBalance ?? 0) + unpaid }
          : c
      );
    }

    void atomicCommitMultiStores([
      { storageKey: 'emkan.v4.accounts', value: nextAccounts },
      { storageKey: 'emkan.v1.purchase-invoices', value: nextPurchaseInvoices },
      { storageKey: 'emkan.v1.gl-entries', value: nextGlEntries },
      { storageKey: 'emkan.v1.customer-contacts', value: nextCustomerContacts },
    ]);

    setAccounts(nextAccounts);
    setPurchaseInvoices(nextPurchaseInvoices);
    setGlEntries(nextGlEntries);
    if (unpaid > 0) {
      setCustomerContacts(nextCustomerContacts);
    }
    recordAuditLog('ثبت فاکتور خرید بار', `${pinv.billNo}: ${pinv.supplierName}`, 'خرید');

    showToast(
      `فاکتور خرید «${pinv.billNo}» ثبت شد. اکنون در بخش «پذیرش و کدگذاری کالا» مشخصات فنی را وارد کنید.`
    );
    return true;
  };

  // Void Purchase Invoice using voidInvoice engine
  const handleVoidPurchaseInvoice = (id: string) => {
    const pinv = purchaseInvoices.find((p) => p.id === id);
    if (!pinv || pinv.docstatus === 2) return;
    if (pinv.returnAgainst || purchaseInvoices.some((bill) => bill.returnAgainst === pinv.id)) {
      showToast('فاکتور خرید دارای برگشت ثبت‌شده است و برای جلوگیری از دوباره‌کاری قابل ابطال نیست.');
      return;
    }

    const voidRes = voidInvoice({
      invoice: pinv,
      invoiceType: 'purchase',
      inventory: inventoryItems,
    });
    if (voidRes.errorMessage) {
      showToast(voidRes.errorMessage);
      return;
    }

    const unpaid = Math.max(0, pinv.totalAmount - (pinv.paidAmount ?? 0));
    const nextAccounts = postDoubleEntryToAccounts(accounts, voidRes.reversalLedgerLines);
    const nextPurchaseInvoices = purchaseInvoices.map((p) =>
      p.id === id ? voidRes.voidedInvoice : p
    );
    const nextInventory = voidRes.restoredInventory;
    const reversalGl: GLEntryRecord[] = voidRes.reversalLedgerLines.map((l, idx) => ({
      id: `gle-void-pinv-${pinv.id}-${idx}-${Date.now()}`,
      postingDate: formatPersianDate(new Date()),
      voucherType: 'فاکتور خرید بار' as any,
      voucherNo: pinv.billNo,
      accountCode: l.accountCode,
      accountName: accounts.find((a) => a.code === l.accountCode)?.name || l.accountCode,
      debit: l.debit,
      credit: l.credit,
      fiscalYear: getPersianYear(),
      costCenter: pinv.costCenter || 'CC-101',
      branchDimension: pinv.branchDimension || defaultBranch,
      remarks: `ابطال فاکتور خرید ${pinv.billNo}`,
      timestamp: Date.now() + idx,
    }));
    const nextGl = [...reversalGl, ...glEntries];
    let nextCustomerContacts = customerContacts;
    if (unpaid > 0) {
      nextCustomerContacts = customerContacts.map((c) =>
        (pinv.supplierId
          ? c.id === pinv.supplierId
          : c.fullName.trim() === pinv.supplierName.trim())
          ? { ...c, creditBalance: Math.max(0, (c.creditBalance ?? 0) - unpaid) }
          : c
      );
    }

    void atomicCommitMultiStores([
      { storageKey: 'emkan.v4.accounts', value: nextAccounts },
      { storageKey: 'emkan.v1.inventory-items', value: nextInventory },
      { storageKey: 'emkan.v1.purchase-invoices', value: nextPurchaseInvoices },
      { storageKey: 'emkan.v1.gl-entries', value: nextGl },
      { storageKey: 'emkan.v1.customer-contacts', value: nextCustomerContacts },
    ]);

    setInventoryItems(nextInventory);
    setAccounts(nextAccounts);
    setPurchaseInvoices(nextPurchaseInvoices);
    setGlEntries(nextGl);
    if (unpaid > 0) {
      setCustomerContacts(nextCustomerContacts);
    }
    showToast(voidRes.auditSummary);
    recordAuditLog(
      'ابطال فاکتور خرید',
      `ابطال فاکتور خرید ${pinv.billNo} از تأمین‌کننده ${pinv.supplierName}`,
      'خرید'
    );
  };

  // Mark Purchase Cargo Arrived & Check Wishlist Matches
  const handleMarkPurchaseArrived = (id: string) => {
    const pinv = purchaseInvoices.find((p) => p.id === id);
    if (!pinv) return;

    setPurchaseInvoices((prev) =>
      prev.map((p) => (p.id === id ? { ...p, deliveryStatus: 'رسیده' } : p))
    );

    const arrivedSummary = (pinv.itemsSummary || '').toLowerCase();
    const matchedCustomerNames: string[] = [];

    setCustomerWishlist((prevWish) =>
      prevWish.map((w) => {
        if (
          w.status === 'در انتظار تامین' &&
          (arrivedSummary.includes(w.requestedItemName.toLowerCase()) ||
            (w.flavorOrSpec && arrivedSummary.includes(w.flavorOrSpec.toLowerCase())))
        ) {
          matchedCustomerNames.push(`${w.customerName} (${w.requestedItemName})`);
          return { ...w, status: 'موجود شد' };
        }
        return w;
      })
    );

    if (matchedCustomerNames.length > 0) {
      showToast(
        `بار جدید رسید! سفارش ${matchedCustomerNames.length} مشتری در لیست انتظار موجود شد: ${matchedCustomerNames.slice(0, 2).join('، ')}`
      );
    } else {
      showToast('وضعیت محموله به «رسیده به انبار» تغییر یافت.');
    }
    recordAuditLog(
      'اعلام وصول محموله خرید',
      `رسیدن بار فاکتور خرید ${pinv.billNo} از تأمین‌کننده ${pinv.supplierName} به انبار`,
      'خرید'
    );
  };

  // Stage-2 SKU Breakdown Completion (Line-by-line or whole invoice)
  const handleCompleteSkuBreakdown = (
    purchaseId: string | null,
    allocatedItems: InventoryItemRecord[],
    lineId?: string | null
  ) => {
    setInventoryItems((curr) => {
      const updated = [...curr];
      for (const newItem of allocatedItems) {
        const existingIdx = updated.findIndex((i) => i.sku === newItem.sku);
        if (existingIdx !== -1) {
          const ex = updated[existingIdx];
          const newAvgRes = calculateMovingAverageValuation(
            ex.stockQty,
            ex.valuationRate,
            newItem.stockQty,
            newItem.valuationRate
          );
          const whStock = { ...(ex.warehouseStock || {}) };
          const targetWh = Object.keys(newItem.warehouseStock || {})[0] || 'vitrine';
          const prevWhQty = whStock[targetWh] || 0;
          whStock[targetWh] = prevWhQty + newItem.stockQty;

          const whRates = { ...(ex.warehouseValuationRates || {}) };
          const whMwa = calculateMovingAverageValuation(
            prevWhQty,
            whRates[targetWh] ?? ex.valuationRate,
            newItem.stockQty,
            newItem.valuationRate
          );
          whRates[targetWh] = whMwa.newValuationRate;

          const whFifo = { ...(ex.warehouseFifoLayers || {}) };
          if (ex.sector === 'pc') {
            whFifo[targetWh] = [
              ...(whFifo[targetWh] || []),
              {
                qty: newItem.stockQty,
                unitCost: newItem.valuationRate,
                date: formatPersianDate(new Date()),
                sourceVoucherId: purchaseId || undefined,
              },
            ];
          }

          updated[existingIdx] = {
            ...ex,
            brand: newItem.brand || ex.brand,
            model: newItem.model || ex.model,
            stockQty: ex.stockQty + newItem.stockQty,
            totalInQty: (ex.totalInQty ?? ex.stockQty) + newItem.stockQty,
            valuationRate: newAvgRes.newValuationRate,
            retailPrice: newItem.retailPrice || ex.retailPrice,
            resellerPrice: newItem.resellerPrice || ex.resellerPrice,
            festivalPrice: newItem.festivalPrice || ex.festivalPrice || newItem.resellerPrice || ex.resellerPrice || 0,
            partnerPrice: newItem.partnerPrice || ex.partnerPrice || newItem.resellerPrice || ex.resellerPrice || 0,
            warehouseStock: whStock,
            warehouseValuationRates: whRates,
            warehouseFifoLayers: whFifo,
            fifoLayers:
              ex.sector === 'pc'
                ? [
                    ...(ex.fifoLayers || []),
                    {
                      qty: newItem.stockQty,
                      unitCost: newItem.valuationRate,
                      date: formatPersianDate(new Date()),
                      sourceVoucherId: purchaseId || undefined,
                    },
                  ]
                : ex.fifoLayers,
          };
        } else {
          updated.unshift(newItem);
        }
      }
      return updated;
    });

    let isInvoiceFullyDone = false;
    let billNoRef = '';

    if (purchaseId) {
      setPurchaseInvoices((prev) =>
        prev.map((p) => {
          if (p.id !== purchaseId) return p;
          billNoRef = p.billNo;

          let nextLines = p.lines || [];
          if (lineId && nextLines.length > 0) {
            nextLines = nextLines.map((l) =>
              l.id === lineId ? { ...l, skuBreakdownCompleted: true } : l
            );
            isInvoiceFullyDone = nextLines.every((l) => l.skuBreakdownCompleted);
          } else {
            isInvoiceFullyDone = true;
            nextLines = nextLines.map((l) => ({ ...l, skuBreakdownCompleted: true }));
          }

          return {
            ...p,
            skuBreakdownCompleted: isInvoiceFullyDone,
            deliveryStatus: isInvoiceFullyDone ? 'رسیده' : p.deliveryStatus,
            lines: nextLines,
          };
        })
      );
    }

    const todayStr = formatPersianDate(new Date());

    // For Direct Intake without purchase invoice (ثبت مستقیم کالا بدون فاکتور خرید):
    // Post initial opening entry to accounts: Debit 11040x (موجودی انبار), Credit 3101 (سرمایه و موجودی اول دوره)
    if (!purchaseId && allocatedItems.length > 0) {
      const WH_MAP: Record<string, string> = {
        vitrine: '110401',
        shop_storage: '110402',
        central_external: '110403',
        consignment: '110404',
        in_transit: '110405',
      };
      const directLines: { accountCode: string; debit: number; credit: number }[] = [];
      let totalDirectVal = 0;

      for (const item of allocatedItems) {
        const val = Math.round((item.stockQty || 0) * (item.valuationRate || 0));
        if (val > 0) {
          const whKey = (Object.keys(item.warehouseStock || {})[0] || 'central_external') as string;
          const accCode = WH_MAP[whKey] || '110401';
          directLines.push({ accountCode: accCode, debit: val, credit: 0 });
          totalDirectVal += val;
        }
      }

      if (totalDirectVal > 0) {
        directLines.push({ accountCode: '3101', debit: 0, credit: totalDirectVal });
        const nextAccounts = postDoubleEntryToAccounts(accounts, directLines);
        const vNo = `DIR-IN-${Date.now().toString().slice(-6)}`;
        const newGles: GLEntryRecord[] = directLines.map((l, index) => ({
          id: `gle-dir-${Date.now()}-${index}`,
          postingDate: todayStr,
          voucherType: 'Stock Reconciliation' as any,
          voucherNo: vNo,
          accountCode: l.accountCode,
          accountName: accounts.find((a) => a.code === l.accountCode)?.name || l.accountCode,
          debit: l.debit,
          credit: l.credit,
          costCenter: 'CC-101',
          branchDimension: defaultBranch,
          remarks: `پذیرش مستقیم کالا بدون فاکتور خرید (سند موجودی اول دوره/سرمایه)`,
          timestamp: Date.now() + index,
        }));

        setAccounts(nextAccounts);
        setGlEntries((prev) => [...newGles, ...prev]);
        void atomicCommitMultiStores([
          { storageKey: 'emkan.v4.accounts', value: nextAccounts },
          { storageKey: 'emkan.v1.gl-entries', value: [...newGles, ...glEntries] },
        ]);
      }
    }

    const breakdownSleRows: StockLedgerEntryRecord[] = allocatedItems.map((item) => {
      const whKey = (Object.keys(item.warehouseStock || {})[0] || 'central_external') as WarehouseKey;
      return {
        id: `sle-pinv-${Date.now()}-${item.sku}`,
        postingDate: todayStr,
        sku: item.sku,
        itemName: item.name,
        warehouseKey: whKey,
        qtyChange: item.stockQty,
        balanceAfter: item.stockQty,
        valuationRate: item.valuationRate,
        voucherType: 'Purchase Receipt',
        voucherNo: purchaseId ? `PINV-${purchaseId.slice(-4)}` : 'PINV-NEW',
        sector: item.sector,
      };
    });
    setStockLedgerEntries((prev) => [...breakdownSleRows, ...prev]);

    const totalAllocatedQty = allocatedItems.reduce((acc, itm) => acc + itm.stockQty, 0);
    if (purchaseId && lineId && !isInvoiceFullyDone) {
      showToast(
        `پذیرش این سطر (${totalAllocatedQty} عدد) انجام شد. سایر اقلام فاکتور خرید همچنان در صف پذیرش هستند.`
      );
    } else {
      showToast(
        `پذیرش و کدگذاری ${allocatedItems.length} قلم کالا (مجموعاً ${totalAllocatedQty} عدد) در انبار ثبت شد.`
      );
    }
    recordAuditLog(
      'تفکیک کالا و ورود به انبار',
      `ثبت و انتقال ${allocatedItems.length} قلم کالا (مجموعاً ${totalAllocatedQty} عدد) مربوط به ${billNoRef || 'ثبت مستقیم'} به انبارها`,
      'انبار'
    );
  };

  // Inter-warehouse Stock Transfer preserving FIFO/MWA cost layer
  const handleTransferWarehouseStock = (
    sku: string,
    fromWh: WarehouseKey,
    toWh: WarehouseKey,
    qty: number
  ) => {
    if (fromWh === toWh || qty <= 0) return;
    const todayStr = formatPersianDate(new Date());
    const vNo = `STE-${Date.now().toString().slice(-5)}`;
    let transferredCost = 0;
    let itemName = sku;
    let itemSector: 'vape' | 'pc' = 'vape';
    let destBalAfter = 0;
    let srcBalAfter = 0;

    setInventoryItems((prev) =>
      prev.map((item) => {
        if (item.sku !== sku) return item;
        itemName = item.name;
        itemSector =
          item.sector ||
          (item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
        const wh = { ...(item.warehouseStock || {}) };
        const avail = wh[fromWh] ?? 0;
        if (avail < qty) return item;

        const transferred = transferWarehouseValuationLayer({
          sector: itemSector,
          fromWarehouse: fromWh,
          toWarehouse: toWh,
          transferQty: qty,
          warehouseStock: wh,
          warehouseValuationRates: item.warehouseValuationRates,
          warehouseFifoLayers: item.warehouseFifoLayers,
          globalFifoLayers: item.fifoLayers,
          fallbackValuationRate: item.valuationRate || 0,
          transferDate: todayStr,
        });

        transferredCost = transferred.transferredUnitCost;
        srcBalAfter = transferred.updatedWarehouseStock[fromWh] ?? 0;
        destBalAfter = transferred.updatedWarehouseStock[toWh] ?? 0;

        return {
          ...item,
          warehouseStock: transferred.updatedWarehouseStock,
          warehouseValuationRates: transferred.updatedWarehouseValuationRates,
          warehouseFifoLayers: transferred.updatedWarehouseFifoLayers,
        };
      })
    );

    setStockLedgerEntries((prev) => [
      {
        id: `sle-tr-in-${Date.now()}`,
        postingDate: todayStr,
        sku,
        itemName,
        warehouseKey: toWh,
        qtyChange: qty,
        balanceAfter: destBalAfter,
        valuationRate: transferredCost,
        voucherType: 'Stock Transfer',
        voucherNo: vNo,
        sector: itemSector,
      },
      {
        id: `sle-tr-out-${Date.now() + 1}`,
        postingDate: todayStr,
        sku,
        itemName,
        warehouseKey: fromWh,
        qtyChange: -qty,
        balanceAfter: srcBalAfter,
        valuationRate: transferredCost,
        voucherType: 'Stock Transfer',
        voucherNo: vNo,
        sector: itemSector,
      },
      ...prev,
    ]);

    showToast(
      `انتقال ${qty} عدد کالای ${sku} با بهای تمام‌شده (${formatCurrency(transferredCost)} ت) انجام شد.`
    );
    recordAuditLog(
      'انتقال بین‌انباری کالا',
      `انتقال ${qty} عدد کالای ${sku} از انبار «${fromWh}» به انبار «${toWh}»`,
      'انبار'
    );
  };

  // Record Theft / Fake Payment Slip / Fraud Loss Incident
  const handleRecordTheftFraudIncident = useCallback(
    (payload: Omit<TheftFraudIncidentRecord, 'id' | 'incidentNo' | 'createdAt'>) => {
      const todayStr = formatPersianDate(new Date());
      const incNo = `INC-${Date.now().toString().slice(-6)}`;
      const glVoucherNo = `JV-LOSS-${Date.now().toString().slice(-5)}`;

      const targetWarehouse = warehouses.find((w) => w.key === payload.warehouseKey);
      const whAccountCode = targetWarehouse?.accountCode || '110401';
      const whName = targetWarehouse?.name || 'موجودی کالاهای انبار';

      // Financial Double Entry: Debit 5205 (Operating Loss), Credit 1104xx (Warehouse Inventory)
      const totalLoss = payload.totalLossCost;
      const ledgerLines: JournalLine[] = [
        {
          id: `line-loss-deb-${Date.now()}`,
          accountCode: '5205',
          accountName: 'زیان و خسارت ناشی از سرقت، فیش جعلی و کلاهبرداری',
          debit: totalLoss,
          credit: 0,
          note: `${payload.incidentTypeLabel}: ${payload.title} (${incNo})`,
        },
        {
          id: `line-loss-crd-${Date.now() + 1}`,
          accountCode: whAccountCode,
          accountName: whName,
          debit: 0,
          credit: totalLoss,
          note: `کسر موجودی بابت ${payload.incidentTypeLabel} (${incNo})`,
        },
      ];

      setAccounts((curr) => postDoubleEntryToAccounts(curr, ledgerLines));

      const newJournal: JournalEntryRecord = {
        id: `je-loss-${Date.now()}`,
        voucherNo: glVoucherNo,
        postingDate: payload.incidentDate || todayStr,
        docstatus: 1,
        title: `ثبت سند خسارت ${payload.incidentTypeLabel} (${incNo})`,
        branchDimension: defaultBranch || DEFAULT_BRANCH_NAME,
        totalDebit: totalLoss,
        totalCredit: totalLoss,
        expenseCategory: 'زیان سرقت و فیش جعلی',
        lines: ledgerLines,
      };
      setJournalEntries((prev) => [newJournal, ...prev]);

      const deductedSkus = new Map(payload.items.map((i) => [i.sku, i.qty]));
      const newStockLedgerRows: StockLedgerEntryRecord[] = [];

      setInventoryItems((prev) =>
        prev.map((item) => {
          const qtyToDeduct = deductedSkus.get(item.sku);
          if (!qtyToDeduct || qtyToDeduct <= 0) return item;

          const currentWhStock = { ...(item.warehouseStock || {}) };
          const curWhQty = currentWhStock[payload.warehouseKey] ?? item.stockQty;
          const nextWhQty = Math.max(0, curWhQty - qtyToDeduct);
          currentWhStock[payload.warehouseKey] = nextWhQty;

          const nextStockQty = Math.max(0, item.stockQty - qtyToDeduct);

          newStockLedgerRows.push({
            id: `sle-theft-${Date.now()}-${item.sku}`,
            postingDate: payload.incidentDate || todayStr,
            sku: item.sku,
            itemName: item.name,
            warehouseKey: payload.warehouseKey,
            qtyChange: -qtyToDeduct,
            balanceAfter: nextStockQty,
            valuationRate: item.valuationRate,
            voucherType: 'خسارت سرقت و فیش جعلی',
            voucherNo: incNo,
            sector: item.sector,
          });

          return {
            ...item,
            stockQty: nextStockQty,
            warehouseStock: currentWhStock,
          };
        })
      );

      if (newStockLedgerRows.length > 0) {
        setStockLedgerEntries((prev) => [...newStockLedgerRows, ...prev]);
      }

      const fullIncident: TheftFraudIncidentRecord = {
        ...payload,
        id: `inc-${Date.now()}`,
        incidentNo: incNo,
        glVoucherNo,
        createdAt: new Date().toISOString(),
      };
      setTheftFraudIncidents((prev) => [fullIncident, ...prev]);

      recordAuditLog(
        'ثبت خسارت و سرقت',
        `ثبت پرونده ${incNo} (${payload.incidentTypeLabel}) - کسر ${payload.totalQuantity} قلم کالا به ارزش ${formatCurrency(totalLoss)} تومان`,
        'انبار'
      );
      showToast(`پرونده خسارت «${incNo}» ثبت و سند دوبل دفتر کل صادر شد.`);
    },
    [
      warehouses,
      defaultBranch,
      showToast,
      recordAuditLog,
      setAccounts,
      setJournalEntries,
      setInventoryItems,
      setStockLedgerEntries,
      setTheftFraudIncidents,
    ]
  );

  // Urgent Alerts for Home Launcher
  const pendingBreakdownCount = purchaseInvoices.filter(
    (p) => p.docstatus === 1 && !p.skuBreakdownCompleted
  ).length;
  const inTransitCount = purchaseInvoices.filter(
    (p) =>
      p.docstatus === 1 &&
      (p.deliveryStatus === 'در انتظار رسیدن بار' ||
        p.deliveryStatus === 'در راه (هنوز نرسیده)')
  ).length;
  const unpaidSupplierBillsCount = purchaseInvoices.filter(
    (p) => p.docstatus === 1 && p.totalAmount - (p.paidAmount ?? 0) > 0
  ).length;

  return (
    <div
      dir="rtl"
      className={`min-h-screen font-sans transition-colors ${
        darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Clean Top Bar (Module 11 Specification) */}
      <header
        className={`sticky top-0 z-30 border-b px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3 ${
          darkMode
            ? 'bg-slate-900/95 border-slate-800 text-white'
            : 'bg-white/95 border-slate-200 text-slate-900'
        } backdrop-blur-md`}
      >
        {/* Brand & Active Single-Branch Indicator */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveWorkspace('home')}
            className="flex items-center gap-2.5 text-right"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
              E
            </div>
            <div>
              <div className="text-sm font-black tracking-tight text-slate-900 dark:text-slate-100">
                سیستم هوشمند مالی امکان
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">
                فروشگاه مرکزی
              </div>
            </div>
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md mx-2">
          <button
            type="button"
            onClick={() => setShowAwesomebar(true)}
            className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
            title="جستجوی سریع در ماژول‌ها (Ctrl+K)"
          >
            <span className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              <span>جستجوی سریع کالا، مخاطب یا ماژول...</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Clean Top Right Action Controls: Theme Switch, Auto-Hide Privacy Eye, Bidirectional Snapshot Undo/Redo, User Profile */}
        <div className="flex items-center gap-2">
          {/* 1. Light / Dark Mode Switch */}
          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className={`p-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title={darkMode ? 'تغییر به حالت روشن (Light Mode)' : 'تغییر به حالت تیره (Dark Mode)'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* 2. Compact Centralized Privacy Mode Button */}
          <button
            type="button"
            onClick={() => setPrivacyMask((prev) => !prev)}
            className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              privacyMask
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title={
              privacyMask
                ? 'حریم خصوصی فعال است (اعداد و سود با **** پوشانده شده‌اند) — کلیک برای نمایش'
                : 'فعال‌سازی حریم خصوصی (پوشاندن سود و ارقام حساس با ****)'
            }
          >
            {privacyMask ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* 3. Header Last-Backup Status Indicator (Time-Machine Quick Link) */}
          <button
            type="button"
            onClick={() => {
              setSettingsInitialTab('time_machine');
              setActiveWorkspace('settings');
            }}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold transition-colors"
            title="مشاهده بک‌آپ‌ها و تایم‌ماشین"
          >
            <Save className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {!backupSnapshotsHydrated
                ? 'در حال بارگذاری بک‌آپ‌ها...'
                : backupSnapshots.length > 0
                ? `آخرین بک‌آپ: ${
                    backupSnapshots[effectiveSnapshotIndex]?.versionCode || '—'
                  } (${backupSnapshots.length} نسخه)`
                : 'تایم‌ماشین (۰ بک‌آپ)'}
            </span>
          </button>

          {/* 4. User Profile Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>مدیر فروشگاه</span>
          </div>
        </div>
      </header>

      {/* Awesomebar Quick Search Modal */}
      {showAwesomebar && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center pt-20 p-4"
          onClick={() => setShowAwesomebar(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-5 space-y-4 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-600" />
                <span>جستجوی سریع در ماژول‌ها و بخش‌های امکان</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAwesomebar(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                ✕ بستن (Esc)
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={awesomeQuery}
              onChange={(e) => setAwesomeQuery(e.target.value)}
              placeholder="جستجوی نام بخش، ماژول، کالا..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'launcher', label: 'میز کار (داشبورد عملیاتی)' },
                { id: 'pos', label: 'صندوق فروش (پوز)' },
                { id: 'stock', label: 'انبار و پذیرش کالا' },
                { id: 'festivals', label: 'جشنواره، تخفیف‌ها و باندل' },
                { id: 'accounting', label: 'حسابداری و دفاتر مالی' },
                { id: 'analytics', label: 'آمار، آنالیز و هوش تجاری (BI)' },
                { id: 'crm', label: 'باشگاه مشتریان و مخاطبین' },
                { id: 'calendar', label: 'تقویم عملیاتی و لیست انتظار' },
                { id: 'settings', label: 'تنظیمات، بک‌آپ و هسته فرپ' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspace(m.id as WorkspaceId);
                    setShowAwesomebar(false);
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 text-right font-bold hover:bg-indigo-50 dark:hover:bg-slate-800 hover:border-indigo-300 text-slate-800 dark:text-slate-200 transition-colors"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timed Toast Notification with Smooth Fade-out & Progress Bar */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-5 z-50 max-w-md bg-slate-900/95 dark:bg-slate-800/95 text-white p-3.5 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md flex flex-col gap-2 text-xs transition-all duration-400 ease-out transform ${
            toastVisible
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-3 scale-95 pointer-events-none'
          }`}
          onMouseEnter={() => {
            if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
          }}
          onMouseLeave={() => {
            if (toastVisible) {
              toastTimerRef.current = window.setTimeout(() => {
                dismissToast();
              }, 2000);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold flex-1 leading-snug">{toastMessage}</span>
            <button
              type="button"
              onClick={dismissToast}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              title="بستن پیام"
            >
              ✕
            </button>
          </div>
          {/* Animated shrinking progress timer bar */}
          <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all ease-linear ${
                toastVisible ? 'w-0 duration-[3500ms]' : 'w-full duration-0'
              }`}
            />
          </div>
        </div>
      )}

      {/* Main Layout: Sidebar + Content Area */}
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Right Sidebar Navigation (Sales isolated to /pos, Analytics isolated to /analytics) */}
        <aside className="lg:col-span-2 space-y-1.5">
          {[
            { id: 'home', label: 'میز کار', path: '/', icon: Home },
            { id: 'pos', label: 'صندوق فروش (پوز)', path: '/pos', icon: Store },
            { id: 'stock', label: 'انبار و پذیرش کالا', path: '/stock', icon: Package },
            { id: 'accounting', label: 'حسابداری و دفاتر (گزارش)', path: '/accounting', icon: Calculator },
            { id: 'analytics', label: 'آمار و آنالیز', path: '/analytics', icon: BarChart3 },
            { id: 'crm', label: 'باشگاه مشتریان', path: '/crm', icon: Users },
            { id: 'calendar', label: 'تقویم و لیست انتظار', path: '/calendar', icon: CalendarIcon },
            { id: 'webshop', label: 'فروشگاه آنلاین', path: '/webshop', icon: Globe },
            { id: 'settings', label: 'تنظیمات', path: '/settings', icon: Settings },
          ].map((nav) => {
            const Icon = nav.icon;
            const isActive = activeWorkspace === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  if (nav.id === 'festivals') {
                    setInventoryInitialTab('festivals_bundles');
                    setActiveWorkspace('festivals');
                  } else if (nav.id === 'stock') {
                    setInventoryInitialTab('stocktaking');
                    setActiveWorkspace('stock');
                  } else {
                    setActiveWorkspace(nav.id as WorkspaceId);
                  }
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : darkMode
                    ? 'text-slate-300 hover:bg-slate-900'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{nav.label}</span>
                </span>
                {nav.id === 'stock' && pendingBreakdownCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black tabular-nums">
                    {pendingBreakdownCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Workspace Content */}
        <main key={rehydrationVersion} className="lg:col-span-10 space-y-6">
          {/* =================================================================
              MODULE 10: ODOO-STYLE MINIMAL HOME LAUNCHER (میز کار خلوت و محرمانه)
             ================================================================= */}
          {activeWorkspace === 'home' && (
            <div className="space-y-6">
              {/* Welcome Banner without exposing sensitive financial numbers */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs text-slate-900">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
                    <span>شعبه فعال: {defaultBranch}</span>
                    <span>•</span>
                    <span>حالت محرمانه فعال (تایمر ۶۰ ثانیه)</span>
                  </div>
                  <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">
                    میز کار عملیاتی امکان (Quick Actions Launcher)
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    برای حفظ محرمانگی در حضور مشتری، تمام کارت‌های تحلیلی، نمودارهای رشد سرمایه و حاشیه‌های سود به روت مستقل «/analytics» منتقل شده‌اند.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace('pos')}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 shadow-xs"
                  >
                    <Store className="w-4 h-4" />
                    <span>ورود به صندوق فروش (پوز)</span>
                  </button>
                </div>
              </div>

              {/* Urgent Operational Alerts (بدون افشای سود و سرمایه) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-950">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-black">صف پذیرش و کدگذاری کالا</div>
                      <div className="text-amber-800 mt-0.5">
                        {pendingBreakdownCount} پارت خرید نیازمند تفکیک طعم و مشخصات فنی
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInventoryInitialTab('sku_allocation');
                      setActiveWorkspace('stock');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-900 text-white font-bold shrink-0"
                  >
                    پذیرش SKU
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-between text-xs text-sky-950">
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-sky-600 shrink-0" />
                    <div>
                      <div className="font-black">برچسب «در انتظار رسیدن بار»</div>
                      <div className="text-sky-800 mt-0.5">
                        {inTransitCount} محموله خرید در انتظار رسیدن فیزیکی به انبار
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountingInitialTab('invoices_archive');
                      setActiveWorkspace('accounting');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-sky-900 text-white font-bold shrink-0 cursor-pointer"
                  >
                    بررسی بار
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs text-rose-950">
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <div className="font-black">یادآور سررسیدها و لیست انتظار</div>
                      <div className="text-rose-800 mt-0.5">
                        {unpaidSupplierBillsCount} فاکتور تعهدی و {customerWishlist.length} درخواست شارژ کالا
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace('calendar')}
                    className="px-3 py-1.5 rounded-lg bg-rose-900 text-white font-bold shrink-0"
                  >
                    تقویم
                  </button>
                </div>
              </div>

              {/* Odoo-Style App Launcher Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  {
                    id: 'pos',
                    title: 'صندوق فروش (پوز)',
                    desc: 'فروش عادی، فروش جشنواره، ریسلر، چک‌باکس میلی‌لیتری جویس و خدمات فنی',
                    icon: Store,
                    color: 'bg-indigo-600',
                  },
                  {
                    id: 'stock',
                    title: 'انبار و پذیرش کالا',
                    desc: '۵ انبار (ویترین، مغازه، خارجی، امانی، در راه) + کدگذاری کالا',
                    icon: Package,
                    color: 'bg-emerald-600',
                  },
                  {
                    id: 'festivals',
                    title: 'جشنواره، تخفیف‌ها و باندل',
                    desc: 'تعریف قوانین جشنواره، باندل‌سازی کیت ویپ و لیست قیمت همکاران',
                    icon: Sparkles,
                    color: 'bg-amber-600',
                  },
                  {
                    id: 'accounting',
                    title: 'حسابداری و دفاتر مالی',
                    desc: 'درخت حساب‌ها، تراز آزمایشی ۶ ستونی، ترازنامه یکپارچه و گزارش ۳ قلک سهامداران',
                    icon: Calculator,
                    color: 'bg-slate-900',
                  },
                  {
                    id: 'analytics',
                    title: 'آمار و آنالیز',
                    desc: 'نمودار رشد سرمایه، حاشیه سود ویپ و کامپیوتر، رادار رسوب کالا و تاریخ BB',
                    icon: BarChart3,
                    color: 'bg-purple-600',
                  },
                  {
                    id: 'crm',
                    title: 'باشگاه مشتریان و مخاطبین',
                    desc: '۶ تب تخصصی مشتریان، ریسلرها، تأمین‌کنندگان و استخر پیامک انبوه',
                    icon: Users,
                    color: 'bg-rose-600',
                  },
                  {
                    id: 'calendar',
                    title: 'تقویم و لیست انتظار',
                    desc: 'تقویم روزانه/هفتگی/ماهانه، پیگیری «در انتظار رسیدن بار» و شارژ کالا',
                    icon: CalendarIcon,
                    color: 'bg-sky-600',
                  },
                  {
                    id: 'settings',
                    title: 'تنظیمات و مدیریت شعبه',
                    desc: 'مدیریت تک‌شعبه‌ای، + افزودن شعبه جدید، خروجی اکسل و لاگ امنیتی',
                    icon: Settings,
                    color: 'bg-teal-600',
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        if (card.id === 'festivals') {
                          setInventoryInitialTab('festivals_bundles');
                          setActiveWorkspace('festivals');
                        } else if (card.id === 'stock') {
                          setInventoryInitialTab('stocktaking');
                          setActiveWorkspace('stock');
                        } else {
                          setActiveWorkspace(card.id as WorkspaceId);
                        }
                      }}
                      className="group text-right bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all flex flex-col justify-between text-slate-900"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div
                            className={`w-11 h-11 rounded-2xl ${card.color} text-white flex items-center justify-center shadow-xs`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <ArrowUpLeft className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                        </div>
                        <div className="text-sm font-black text-slate-900">
                          {card.title}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {card.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* POS WORKSPACE (All Sales & Stage-1 Purchase Invoices Centralized Here) */}
          {activeWorkspace === 'pos' && (
            <ModuleErrorBoundary moduleName="صندوق فروشگاهی">
            <SellingPosModule
              productionMode={productionMode}
              privacyMasked={privacyMask}
              initialView={posInitialView}
              contacts={customerContacts}
              inventoryItems={inventoryItems}
              promotionRules={promotionRules}
              salesInvoices={salesInvoices}
              purchaseInvoices={purchaseInvoices}
              warehouses={warehouses}
              masterOptions={masterOptions}
              categorySectors={categorySectors}
              onSetCategorySector={handleSetCategorySector}
              onAddMasterOption={handleAddMasterOption}
              onAddQuickCustomer={(newCust) => {
                if (newCust.phone) {
                  const cleanPhone = normalizePhoneNumber(newCust.phone);
                  if (cleanPhone) {
                    const duplicate = customerContacts.find(
                      (c) => c.phone && normalizePhoneNumber(c.phone) === cleanPhone
                    );
                    if (duplicate) {
                      showToast(`مخاطب با شماره ${newCust.phone} قبلاً با نام «${duplicate.fullName}» ثبت شده است.`);
                      return;
                    }
                  }
                }
                setCustomerContacts((prev) => [newCust, ...prev]);
                recordAuditLog('ثبت مشتری در صندوق', `مشتری جدید: ${newCust.fullName} (${newCust.phone || 'بدون شماره'})`, 'سیستم');
                showToast(`مشتری «${newCust.fullName}» در باشگاه مشتریان ثبت شد.`);
              }}
              onQuickAddSupplier={(supplierName, phone) => {
                const newContact: CustomerContactRecord = {
                  id: `sup-${Date.now()}`,
                  sourceCode: `SUP-${customerContacts.length + 1}`,
                  fullName: supplierName,
                  personType: 'حقوقی / تامین‌کننده',
                  role: 'تأمین‌کننده',
                  contactCategory: 'supplier',
                  phone: phone || '—',
                  notes: 'ثبت‌شده از شیت صندوق',
                };
                setCustomerContacts((prev) => [newContact, ...prev]);
                recordAuditLog('ثبت تأمین‌کننده در صندوق', `تأمین‌کننده جدید: ${supplierName}`, 'خرید');
                showToast(`تأمین‌کننده «${supplierName}» ثبت شد.`);
              }}
              onCreateQuickInventoryItem={(newItem) => {
                setInventoryItems((prev) => [newItem, ...prev]);
                recordAuditLog('تعریف سریع کالا در صندوق', `کالای ${newItem.name} (${newItem.sku})`, 'انبار');
              }}
              onUpdateResellerPrice={(sku, newPrice) => {
                setInventoryItems((prev) =>
                  prev.map((i) =>
                    i.sku === sku
                      ? { ...i, resellerPrice: newPrice, partnerPrice: newPrice }
                      : i
                  )
                );
                recordAuditLog('تغییر نرخ همکاری کالا', `کالای ${sku} به مبلغ ${newPrice.toLocaleString('fa-IR')} تومان`, 'فروش');
                showToast(`قیمت همکاری کالای ${sku} آپدیت شد.`);
              }}
              onUpdateFestivalPrice={(sku, newPrice) => {
                setInventoryItems((prev) =>
                  prev.map((i) =>
                    i.sku === sku
                      ? {
                          ...i,
                          festivalPrice: newPrice,
                          partnerPrice: newPrice,
                          resellerPrice: i.resellerPrice || newPrice,
                        }
                      : i
                  )
                );
                recordAuditLog(
                  'تغییر نرخ جشنواره کالا',
                  `کالای ${sku} به نرخ جشنواره ${newPrice.toLocaleString('fa-IR')} تومان`,
                  'فروش'
                );
                showToast(`قیمت جشنواره کالای ${sku} آپدیت شد.`);
              }}
              onCompletePosCheckout={handleCompletePosCheckout}
              onProcessPosReturn={handleProcessPosReturn}
              onVoidSalesInvoice={handleVoidSalesInvoice}
              onCreatePurchaseInvoice={handleCreatePurchaseInvoice}
              onVoidPurchaseInvoice={handleVoidPurchaseInvoice}
              onMarkPurchaseArrived={handleMarkPurchaseArrived}
              onNavigateToInventoryBreakdown={() => {
                setInventoryInitialTab('sku_allocation');
                setActiveWorkspace('stock');
              }}
              onShowToast={showToast}
            />
            </ModuleErrorBoundary>
          )}

          {/* INVENTORY & FESTIVALS WORKSPACE */}
          {(activeWorkspace === 'stock' || activeWorkspace === 'festivals') && (
            <ModuleErrorBoundary moduleName="انبار و جشنواره‌ها">
            <InventoryWmsModule
              productionMode={productionMode}
              privacyMasked={privacyMask}
              activeRole={activeRole}
              initialTab={
                activeWorkspace === 'festivals'
                  ? 'festivals_bundles'
                  : inventoryInitialTab
              }
              items={inventoryItems}
              warehouses={warehouses}
              onAddWarehouse={(newWh) => {
                setWarehouses((prev) => [...prev, newWh]);
                recordAuditLog('تعریف انبار جدید', `انبار ${newWh.name} (کد ${newWh.accountCode})`, 'انبار');
                showToast(`انبار «${newWh.name}» اضافه شد.`);
              }}
              onUpdateWarehouse={(wh) => {
                setWarehouses((prev) => prev.map((w) => (w.id === wh.id ? wh : w)));
                recordAuditLog('ویرایش مشخصات انبار', `انبار ${wh.name} (کد ${wh.accountCode})`, 'انبار');
                showToast(`مشخصات انبار «${wh.name}» بروز شد.`);
              }}
              masterOptions={masterOptions}
              onAddMasterOption={handleAddMasterOption}
              onDeleteMasterOption={handleDeleteMasterOption}
              categorySectors={categorySectors}
              onSetCategorySector={handleSetCategorySector}
              onDeleteCategory={handleDeleteCategory}
              onSyncInventorySectors={handleSyncInventorySectors}
              pendingBreakdownPurchases={purchaseInvoices.filter(
                (p) => p.docstatus === 1 && !p.skuBreakdownCompleted
              )}
              purchaseInvoices={purchaseInvoices}
              onCreatePurchaseInvoice={handleCreatePurchaseInvoice}
              contacts={customerContacts}
              onQuickAddSupplier={(supplierName, phone) => {
                const newContact: CustomerContactRecord = {
                  id: `sup-${Date.now()}`,
                  sourceCode: `SUP-${customerContacts.length + 1}`,
                  fullName: supplierName,
                  personType: 'حقوقی / تامین‌کننده',
                  role: 'تأمین‌کننده',
                  contactCategory: 'supplier',
                  phone: phone || '—',
                  notes: 'ثبت‌شده از بخش خرید انبار',
                };
                setCustomerContacts((prev) => [newContact, ...prev]);
                recordAuditLog('ثبت تأمین‌کننده در انبار', `تأمین‌کننده جدید: ${supplierName}`, 'خرید');
                showToast(`تأمین‌کننده «${supplierName}» در سیستم ثبت شد.`);
              }}
              onCompleteSkuBreakdown={handleCompleteSkuBreakdown}
              promotionRules={promotionRules}
              onAddPromotionRule={(rule) => {
                setPromotionRules((prev) => [rule, ...prev]);
                recordAuditLog('ثبت جشنواره و تخفیف', `کمپین «${rule.name}»`, 'فروش');
                showToast(`کمپین «${rule.name}» فعال شد.`);
              }}
              onTogglePromotionRule={(id) => {
                setPromotionRules((prev) =>
                  prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
                );
              }}
              onCreateBundleItem={(bundleItem) => {
                setInventoryItems((prev) => [bundleItem, ...prev]);
                recordAuditLog('ساخت باندل کالا', `باندل «${bundleItem.name}» (${bundleItem.sku})`, 'انبار');
                showToast(`باندل «${bundleItem.name}» ساخته شد.`);
              }}
              onTransferWarehouseStock={handleTransferWarehouseStock}
              stockLedgerEntries={stockLedgerEntries}
              theftFraudIncidents={theftFraudIncidents}
              salesInvoices={salesInvoices}
              onRecordTheftFraudIncident={handleRecordTheftFraudIncident}
              onCalibrateConsumable={(sku, recommendedRate, actualPhysicalStock) => {
                setInventoryItems((prev) =>
                  prev.map((i) =>
                    i.sku === sku
                      ? {
                          ...i,
                          stockQty: actualPhysicalStock,
                          warehouseStock: {
                            ...(i.warehouseStock || {}),
                            vitrine: actualPhysicalStock,
                          },
                        }
                      : i
                  )
                );
                recordAuditLog(
                  'کالیبراسیون انطباق مصرف ملزومات',
                  `کالای ${sku} به تعداد ${actualPhysicalStock} ورق اصلاح و نرخ خدمات به ${formatCurrency(recommendedRate)} ت کالیبره شد.`,
                  'انبار'
                );
              }}
              onShowToast={showToast}
            />
            </ModuleErrorBoundary>
          )}

          {/* ACCOUNTING, SHAREHOLDERS & STAGE-1 PURCHASES WORKSPACE */}
          {activeWorkspace === 'accounting' && (
            <ModuleErrorBoundary moduleName="حسابداری و مالی">
            <AccountingModule
              productionMode={productionMode}
              activeRole={activeRole}
              defaultBranch={defaultBranch}
              activeFiscalYear={activeFiscalYear}
              initialSubTab={accountingInitialTab}
              accounts={accounts}
              onAddAccount={(acc) => {
                setAccounts((prev) => [...prev, acc]);
                recordAuditLog('افزودن حساب در کدینگ', `${acc.code} - ${acc.name}`, 'مالی');
                showToast(`سرفصل حساب «${acc.name}» با کد ${acc.code} ایجاد شد.`);
              }}
              glEntries={glEntries}
              journalEntries={journalEntries}
              onSaveJournalEntry={(je) => {
                const lines = je.lines.map((l) => ({
                  accountCode: l.accountCode,
                  debit: l.debit,
                  credit: l.credit,
                }));
                const nextAccounts = postDoubleEntryToAccounts(accounts, lines);
                const nextJournals = [je, ...journalEntries];
                const newGlEntries: GLEntryRecord[] = je.lines.map((l, index) => ({
                  id: `gle-je-${je.id}-${index}-${Date.now()}`,
                  postingDate: je.postingDate,
                  voucherType: 'سند روزنامه دستی' as any,
                  voucherNo: je.voucherNo,
                  accountCode: l.accountCode,
                  accountName: l.accountName || accounts.find((a) => a.code === l.accountCode)?.name || l.accountCode,
                  debit: l.debit || 0,
                  credit: l.credit || 0,
                  fiscalYear: getPersianYear(),
                  costCenter: l.costCenter || 'CC-101',
                  branchDimension: je.branchDimension || defaultBranch,
                  remarks: l.note || je.title,
                  timestamp: Date.now() + index,
                }));
                const nextGl = [...newGlEntries, ...glEntries];

                void atomicCommitMultiStores([
                  { storageKey: 'emkan.v4.accounts', value: nextAccounts },
                  { storageKey: 'emkan.v1.journal-entries', value: nextJournals },
                  { storageKey: 'emkan.v1.gl-entries', value: nextGl },
                ]);

                setAccounts(nextAccounts);
                setJournalEntries(nextJournals);
                setGlEntries(nextGl);
                recordAuditLog('ثبت سند روزنامه دستی', `سند ${je.voucherNo}: ${je.title}`, 'مالی');
                showToast(`سند روزنامه «${je.voucherNo}» با موفقیت ثبت و به دفاتر منتقل شد.`);
              }}
              onSubmitJournalEntry={() => {}}
              onCancelJournalEntry={(id) => {
                const je = journalEntries.find((j) => j.id === id);
                if (!je || je.docstatus === 2) return;
                const revLines = je.lines.map((l) => ({
                  accountCode: l.accountCode,
                  debit: l.credit,
                  credit: l.debit,
                }));
                const nextAccounts = postDoubleEntryToAccounts(accounts, revLines);
                const nextJournals: JournalEntryRecord[] = journalEntries.map((j) => (j.id === id ? { ...j, docstatus: 2 as const } : j));
                const nextGl = glEntries.map((g) => (g.voucherNo === je.voucherNo ? { ...g, isCancelled: true } : g));

                void atomicCommitMultiStores([
                  { storageKey: 'emkan.v4.accounts', value: nextAccounts },
                  { storageKey: 'emkan.v1.journal-entries', value: nextJournals },
                  { storageKey: 'emkan.v1.gl-entries', value: nextGl },
                ]);

                setAccounts(nextAccounts);
                setJournalEntries(nextJournals);
                setGlEntries(nextGl);
                recordAuditLog('ابطال سند روزنامه', `ابطال سند ${je.voucherNo}`, 'مالی');
                showToast(`سند «${je.voucherNo}» باطل شد و مبالغ به حساب‌ها برگشت.`);
              }}
              salesInvoices={salesInvoices}
              onCancelSalesInvoice={handleVoidSalesInvoice}
              purchaseInvoices={purchaseInvoices}
              onCreatePurchaseInvoice={handleCreatePurchaseInvoice}
              onCancelPurchaseInvoice={handleVoidPurchaseInvoice}
              onMarkPurchaseArrived={handleMarkPurchaseArrived}
              costCenters={costCenters}
              recurringTemplates={recurringTemplates}
              monthlyExpenseLedger={monthlyExpenseLedger}
              onAddRecurringTemplate={(tmpl) => {
                setRecurringTemplates((prev) => [
                  ...prev,
                  { ...tmpl, id: `tmpl-${Date.now()}` },
                ]);
                showToast(`هزینه ثابت «${tmpl.name}» اضافه شد.`);
              }}
              onUpdateRecurringTemplateAmount={(id, newAmount) => {
                setRecurringTemplates((prev) =>
                  prev.map((t) =>
                    t.id === id ? { ...t, defaultMonthlyAmount: newAmount } : t
                  )
                );
                showToast(
                  'مبلغ پیش‌فرض قالب برای ماه‌های آینده بروز شد (رکوردهای قفل‌شده ماه‌های قبل تغییر نکردند).'
                );
              }}
              onRecordMonthlyFixedExpense={({
                templateId,
                monthYear,
                amount,
                paidFromAccountCode,
                note,
              }) => {
                const tmpl = recurringTemplates.find((t) => t.id === templateId);
                if (!tmpl) return;
                const vNo = `MFIX-${monthYear.replace('/', '')}-${
                  monthlyExpenseLedger.length + 1
                }`;
                const newRec: MonthlyExpenseLedgerRecord = {
                  id: `mexp-${Date.now()}`,
                  templateId,
                  expenseName: tmpl.name,
                  monthYear,
                  amount,
                  paidFromAccountCode,
                  paymentDate: formatPersianDate(new Date()),
                  voucherNo: vNo,
                  isLocked: true,
                  note,
                };
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: tmpl.accountCode || '5201', debit: amount, credit: 0 },
                    { accountCode: paidFromAccountCode, debit: 0, credit: amount },
                  ])
                );
                const glDate = formatPersianDate(new Date());
                const glDebit: GLEntryRecord = {
                  id: `gle-${Date.now()}-1`,
                  postingDate: glDate,
                  accountCode: tmpl.accountCode || '5201',
                  accountName: tmpl.name,
                  debit: amount,
                  credit: 0,
                  voucherType: 'Journal Entry',
                  voucherNo: vNo,
                  costCenter: 'CC-101',
                  branchDimension: defaultBranch,
                  remarks: `هزینه ثابت «${tmpl.name}» بابت ${monthYear}${note ? ` - ${note}` : ''}`,
                  timestamp: Date.now(),
                };
                const glCredit: GLEntryRecord = {
                  id: `gle-${Date.now()}-2`,
                  postingDate: glDate,
                  accountCode: paidFromAccountCode,
                  accountName: accounts.find((a) => a.code === paidFromAccountCode)?.name || 'بانک/صندوق',
                  debit: 0,
                  credit: amount,
                  voucherType: 'Journal Entry',
                  voucherNo: vNo,
                  costCenter: 'CC-101',
                  branchDimension: defaultBranch,
                  remarks: `پرداخت هزینه ثابت «${tmpl.name}» بابت ${monthYear}`,
                  timestamp: Date.now(),
                };
                setGlEntries((prev) => [glDebit, glCredit, ...prev]);
                setMonthlyExpenseLedger((prev) => [newRec, ...prev]);
                recordAuditLog('ثبت هزینه ثابت ماهانه', `${tmpl.name} (${amount.toLocaleString('fa-IR')} ت)`, 'مالی');
                showToast(
                  `هزینه «${tmpl.name}» برای ${monthYear} ثبت و قفل شد.`
                );
              }}
              fixedAssets={fixedAssets}
              onAddFixedAsset={(ast) => {
                const newAsset: FixedAssetRecord = {
                  ...ast,
                  id: `ast-${Date.now()}`,
                };
                setFixedAssets((prev) => [newAsset, ...prev]);
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: '1201', debit: ast.purchaseValue, credit: 0 },
                    {
                      accountCode: ast.paidFromAccountCode || '110102',
                      debit: 0,
                      credit: ast.purchaseValue,
                    },
                  ])
                );
                const glDate = formatPersianDate(new Date());
                const vNo = `AST-${Date.now().toString().slice(-4)}`;
                const glDebit: GLEntryRecord = {
                  id: `gle-${Date.now()}-ast1`,
                  postingDate: glDate,
                  accountCode: '1201',
                  accountName: 'اموال، ماشین‌آلات و تجهیزات مغازه',
                  debit: ast.purchaseValue,
                  credit: 0,
                  voucherType: 'Journal Entry',
                  voucherNo: vNo,
                  costCenter: 'CC-101',
                  branchDimension: defaultBranch,
                  remarks: `خرید دارایی ثابت «${ast.name}»`,
                  timestamp: Date.now(),
                };
                const glCredit: GLEntryRecord = {
                  id: `gle-${Date.now()}-ast2`,
                  postingDate: glDate,
                  accountCode: ast.paidFromAccountCode || '110102',
                  accountName: accounts.find((a) => a.code === (ast.paidFromAccountCode || '110102'))?.name || 'بانک',
                  debit: 0,
                  credit: ast.purchaseValue,
                  voucherType: 'Journal Entry',
                  voucherNo: vNo,
                  costCenter: 'CC-101',
                  branchDimension: defaultBranch,
                  remarks: `پرداخت خرید دارایی «${ast.name}»`,
                  timestamp: Date.now(),
                };
                setGlEntries((prev) => [glDebit, glCredit, ...prev]);
                recordAuditLog('ثبت دارایی ثابت', `خرید دارایی ${ast.name}`, 'مالی');
                showToast(`دارایی «${ast.name}» در اموال ثبت شد.`);
              }}
              onScrapOrSellAsset={() => {}}
              shareholders={shareholders}
              shareholderSnapshots={shareholderSnapshots}
              shareholderDrawings={shareholderDrawings}
              initialInventoryCapitalBaseline={initialInventoryCapitalBaseline}
              onRecordShareholderDrawing={({
                partnerId,
                amount,
                paidFromAccountCode,
                note,
              }) => {
                const partner = shareholders.find((s) => s.id === partnerId);
                if (!partner) return;
                setShareholders((prev) =>
                  prev.map((s) =>
                    s.id === partnerId
                      ? { ...s, dividendPaid: (s.dividendPaid || 0) + amount }
                      : s
                  )
                );
                setShareholderDrawings((prev) => [
                  {
                    id: `drw-${Date.now()}`,
                    partnerId,
                    partnerName: partner.name,
                    date: formatPersianDate(new Date()),
                    amount,
                    paidFromAccountCode,
                    note,
                  },
                  ...prev,
                ]);
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: '3103', debit: amount, credit: 0 },
                    { accountCode: paidFromAccountCode, debit: 0, credit: amount },
                  ])
                );
                showToast(
                  `برداشت سود (${formatCurrency(amount)} تومان) برای «${partner.name}» ثبت شد.`
                );
                recordAuditLog(
                  'ثبت برداشت سود شریک',
                  `برداشت مبلغ ${formatCurrency(amount)} ت توسط «${partner.name}» از حساب ${paidFromAccountCode}`,
                  'مالی'
                );
              }}
              onRecordShareholderCapitalInjection={({
                partnerId,
                amount,
                toAccountCode,
              }) => {
                const partner = shareholders.find((s) => s.id === partnerId);
                if (!partner) return;
                setShareholders((prev) =>
                  prev.map((s) =>
                    s.id === partnerId
                      ? {
                          ...s,
                          personalCapitalInjected:
                            (s.personalCapitalInjected || 0) + amount,
                        }
                      : s
                  )
                );
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: toAccountCode, debit: amount, credit: 0 },
                    { accountCode: '3101', debit: 0, credit: amount },
                  ])
                );
                showToast(
                  `آورده نقدی (${formatCurrency(amount)} تومان) برای «${partner.name}» ثبت شد.`
                );
                recordAuditLog(
                  'ثبت آورده نقدی شریک',
                  `واریز آورده نقدی ${formatCurrency(amount)} ت توسط «${partner.name}» به حساب ${toAccountCode}`,
                  'مالی'
                );
              }}
              onUpdateShareholderPercentagesWithSnapshot={({
                partner1CapitalPct,
                partner1ProfitPct,
                partner2CapitalPct,
                partner2ProfitPct,
                note,
              }) => {
                const snap: ShareholderRuleSnapshot = {
                  id: `sh-snap-${Date.now()}`,
                  effectiveDate: formatPersianDate(new Date()),
                  partner1Name: shareholders[0]?.name || 'شریک اول',
                  partner1CapitalPct,
                  partner1ProfitPct,
                  previousPartner1CapitalPct: shareholders[0]?.ownershipPercent ?? 50,
                  previousPartner1ProfitPct: shareholders[0]?.profitSharePercent ?? 70,
                  partner2Name: shareholders[1]?.name || 'شریک دوم',
                  partner2CapitalPct,
                  partner2ProfitPct,
                  previousPartner2CapitalPct: shareholders[1]?.ownershipPercent ?? 50,
                  previousPartner2ProfitPct: shareholders[1]?.profitSharePercent ?? 30,
                  frozenPartner1Wallet: 0,
                  frozenPartner2Wallet: 0,
                  frozenRecoveryPool: initialInventoryCapitalBaseline,
                  note,
                };
                setShareholderSnapshots((prev) => [snap, ...prev]);
                setShareholders((prev) =>
                  prev.map((s, idx) =>
                    idx === 0
                      ? {
                          ...s,
                          ownershipPercent: partner1CapitalPct,
                          profitSharePercent: partner1ProfitPct,
                        }
                      : {
                          ...s,
                          ownershipPercent: partner2CapitalPct,
                          profitSharePercent: partner2ProfitPct,
                        }
                  )
                );
                showToast(
                  'درصد جدید شرکا ثبت شد و اسنپ‌شات دوره قبل فریز گردید.'
                );
                recordAuditLog(
                  'تغییر نسبت سهامداران',
                  `تغییر درصد سود شرکا: ${partner1ProfitPct}٪ / ${partner2ProfitPct}٪`,
                  'مالی'
                );
              }}
              inventoryItems={inventoryItems}
              customerContacts={customerContacts}
              onQuickAddSupplier={(supplierName, phone) => {
                const newContact: CustomerContactRecord = {
                  id: `sup-${Date.now()}`,
                  sourceCode: `SUP-${customerContacts.length + 1}`,
                  fullName: supplierName,
                  personType: 'حقوقی / تامین‌کننده',
                  role: 'تأمین‌کننده',
                  contactCategory: 'supplier',
                  phone: phone || '—',
                  notes: 'افزوده‌شده مستقیم از فرم فاکتور خرید',
                };
                setCustomerContacts((prev) => [newContact, ...prev]);
                showToast(`تأمین‌کننده «${supplierName}» اضافه شد.`);
              }}
              masterOptions={masterOptions}
              onAddMasterOption={handleAddMasterOption}
              warehouses={warehouses}
              onNavigateToPos={() => setActiveWorkspace('pos')}
              onNavigateToInventoryBreakdown={() => {
                setInventoryInitialTab('sku_allocation');
                setActiveWorkspace('stock');
              }}
              privacyMask={privacyMask}
              onTogglePrivacy={() => setPrivacyMask((prev) => !prev)}
              onShowToast={showToast}
            />
            </ModuleErrorBoundary>
          )}

          {/* ANALYTICS & BI WORKSPACE */}
          {activeWorkspace === 'analytics' && (
            <ModuleErrorBoundary moduleName="گزارشات و هوش تجاری">
            <AnalyticsBiModule
              privacyMasked={privacyMask}
              onTogglePrivacy={() => setPrivacyMask((prev) => !prev)}
              accounts={accounts}
              inventoryItems={inventoryItems}
              salesInvoices={salesInvoices}
              purchaseInvoices={purchaseInvoices}
              journalEntries={journalEntries}
              monthlyExpenses={monthlyExpenseLedger}
              contacts={customerContacts}
              onCreateDeadStockFestivalRule={(sku, itemName) => {
                const rule: PromotionRuleRecord = {
                  id: `promo-dead-${Date.now()}`,
                  name: `حراج کالای رسوبی: ${itemName}`,
                  festivalType: 'حراج رسوب انبار',
                  discountType: 'percent',
                  discountValue: 15,
                  minQty: 1,
                  targetGroup: 'همه مشتریان',
                  startDate: '۱۴۰۴/۰۸/۱۵',
                  endDate: '۱۴۰۴/۰۹/۱۵',
                  applicableSkus: [sku],
                  paymentModel: 'نقد',
                  isActive: true,
                };
                setPromotionRules((prev) => [rule, ...prev]);
                showToast(
                  `کمپین ۱۵٪ تخفیف برای کالای رسوبی «${itemName}» فعال شد.`
                );
              }}
              onShowToast={showToast}
            />
            </ModuleErrorBoundary>
          )}

          {/* CRM & MARKETING WORKSPACE (6 TABS) */}
          {activeWorkspace === 'crm' && (
            <ModuleErrorBoundary moduleName="باشگاه مشتریان (CRM)">
            <CrmMarketingModule
              leads={crmLeads}
              contacts={customerContacts}
              salesInvoices={salesInvoices}
              purchaseInvoices={purchaseInvoices}
              paymentEntries={paymentEntries}
              bulkSmsPool={bulkSmsPool}
              privacyMasked={privacyMask}
              productionMode={productionMode}
              onAddContact={(newContact) => {
                if (newContact.phone) {
                  const cleanPhone = normalizePhoneNumber(newContact.phone);
                  if (cleanPhone) {
                    const duplicate = customerContacts.find(
                      (c) => c.phone && normalizePhoneNumber(c.phone) === cleanPhone
                    );
                    if (duplicate) {
                      showToast(`خطای اعتبارسنجی: شماره تلفن «${newContact.phone}» تکراری است (مربوط به ${duplicate.fullName}).`);
                      return;
                    }
                  }
                }
                setCustomerContacts((prev) => [newContact, ...prev]);
                recordAuditLog('ثبت مخاطب در باشگاه مشتریان', `مخاطب: ${newContact.fullName} (${newContact.phone || 'بدون شماره'})`, 'سیستم');
                showToast(`مخاطب «${newContact.fullName}» ثبت شد.`);
              }}
              onAddLead={(lead) => {
                setCrmLeads((prev) => [lead, ...prev]);
                recordAuditLog('ثبت لید تبلیغاتی', `لید: ${lead.fullName} (${lead.source || 'تبلیغات'})`, 'سیستم');
                showToast(`لید تبلیغاتی «${lead.fullName}» ثبت شد.`);
              }}
              onAdvanceLeadStage={(id) => {
                setCrmLeads((prev) =>
                  prev.map((l) =>
                    l.id === id ? { ...l, stage: 'مشتری وفادار', probability: 100 } : l
                  )
                );
              }}
              onImportBulkSmsNumbers={(items) => {
                setBulkSmsPool((prev) => [...items, ...prev]);
                recordAuditLog('ایمپورت شماره پیامک', `افزودن ${items.length} شماره به بانک پیامک انبوه`, 'سیستم');
                showToast(
                  `${items.length} شماره به لیست پیامک انبوه اضافه شد.`
                );
              }}
              onShowToast={showToast}
            />
            </ModuleErrorBoundary>
          )}

          {/* OPERATIONAL CALENDAR & CUSTOMER WISHLIST WORKSPACE */}
          {activeWorkspace === 'calendar' && (
            <ModuleErrorBoundary moduleName="تقویم عملیاتی و یادآورها">
            <OperationalCalendarModule
              events={calendarEvents}
              wishlist={customerWishlist}
              purchaseInvoices={purchaseInvoices}
              salesInvoices={salesInvoices}
              recurringTemplates={recurringTemplates}
              monthlyExpenseLedger={monthlyExpenseLedger}
              onUpdateRecurringTemplateAmount={(id, newAmount) => {
                setRecurringTemplates((prev) =>
                  prev.map((t) =>
                    t.id === id ? { ...t, defaultMonthlyAmount: newAmount } : t
                  )
                );
                showToast(
                  'مبلغ پیش‌فرض قالب برای ماه‌های آینده بروز شد (رکوردهای قفل‌شده ماه‌های قبل تغییر نکردند).'
                );
              }}
              onRecordMonthlyFixedExpense={({
                templateId,
                monthYear,
                amount,
                paidFromAccountCode,
                note,
              }) => {
                const tmpl = recurringTemplates.find((t) => t.id === templateId);
                if (!tmpl) return;
                const vNo = `MFIX-${monthYear.replace('/', '')}-${
                  monthlyExpenseLedger.length + 1
                }`;
                const newRec: MonthlyExpenseLedgerRecord = {
                  id: `mexp-${Date.now()}`,
                  templateId,
                  expenseName: tmpl.name,
                  monthYear,
                  amount,
                  paidFromAccountCode,
                  paymentDate: formatPersianDate(new Date()),
                  voucherNo: vNo,
                  isLocked: true,
                  note,
                };
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: tmpl.accountCode || '5201', debit: amount, credit: 0 },
                    { accountCode: paidFromAccountCode, debit: 0, credit: amount },
                  ])
                );
                setMonthlyExpenseLedger((prev) => [newRec, ...prev]);
                showToast(
                  `هزینه «${tmpl.name}» برای ${monthYear} ثبت و قفل شد.`
                );
              }}
              onAddEvent={(ev) => {
                setCalendarEvents((prev) => [
                  { ...ev, id: `ev-${Date.now()}` },
                  ...prev,
                ]);
                recordAuditLog('ثبت رویداد تقویم', `رویداد «${ev.title}» در تاریخ ${ev.date}`, 'سیستم');
                showToast(`یادآور «${ev.title}» در تقویم ثبت شد.`);
              }}
              onToggleEventComplete={(id) => {
                setCalendarEvents((prev) =>
                  prev.map((e) =>
                    e.id === id ? { ...e, isCompleted: !e.isCompleted } : e
                  )
                );
              }}
              onDeleteEvent={(id) => {
                setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
              }}
              onAddWishlist={(w) => {
                setCustomerWishlist((prev) => [
                  { ...w, id: `wish-${Date.now()}` },
                  ...prev,
                ]);
                recordAuditLog('ثبت سفارش کالا در لیست انتظار', `کالای «${w.requestedItemName}» برای مشتری ${w.customerName}`, 'فروش');
                showToast(
                  `درخواست «${w.requestedItemName}» برای ${w.customerName} در لیست انتظار ثبت شد.`
                );
              }}
              onUpdateWishlistStatus={(id, status) => {
                setCustomerWishlist((prev) =>
                  prev.map((w) => (w.id === id ? { ...w, status } : w))
                );
                showToast(`وضعیت درخواست به «${status}» تغییر کرد.`);
              }}
              onDeleteWishlist={(id) => {
                setCustomerWishlist((prev) => prev.filter((w) => w.id !== id));
              }}
              privacyMask={privacyMask}
            />
            </ModuleErrorBoundary>
          )}

          {/* WEBSHOP & SUPPORT WORKSPACE */}
          {activeWorkspace === 'webshop' && (
            <ModuleErrorBoundary moduleName="فروشگاه اینترنتی و پورتال">
            <SupportWebshopModule
              productionMode={productionMode}
              inventoryItems={inventoryItems}
              salesInvoices={salesInvoices}
              onWebshopOrderCheckout={(item) => {
                const draftInv: SalesInvoiceRecord = {
                  id: `sinv-web-${Date.now()}`,
                  invoiceNo: `WEB-${Date.now().toString().slice(-4)}`,
                  date: formatPersianDate(new Date()),
                  dueDate: formatPersianDate(new Date()),
                  customerName: 'سفارش آنلاین وب‌شاپ',
                  status: 'پیش‌نویس',
                  totalAmount: item.retailPrice || 0,
                  paidAmount: 0,
                  docstatus: 0,
                  branchDimension: defaultBranch,
                  channelDimension: 'آنلاین',
                  paymentTermsTemplate: 'تسویه فوری',
                  updateStock: true,
                  isSubscription: false,
                  itemsSummary: item.name,
                  lines: [
                    {
                      id: `line-${Date.now()}`,
                      sku: item.sku,
                      itemName: item.name,
                      uom: item.uomPrimary || 'عدد',
                      qty: 1,
                      unitPrice: item.retailPrice || 0,
                      discountPercent: 0,
                      netLineAmount: item.retailPrice || 0,
                      valuationRate: item.valuationRate || 0,
                      warehouseKey: 'vitrine',
                    },
                  ],
                };
                setSalesInvoices((prev) => [draftInv, ...prev]);
                showToast(`سفارش آنلاین «${item.name}» به صورت پیش‌فاکتور ثبت شد.`);
                recordAuditLog('ثبت سفارش وب‌شاپ', `پیش‌فاکتور ${draftInv.invoiceNo} برای ${item.name}`, 'فروش');
              }}
              onShowToast={showToast}
            />
            </ModuleErrorBoundary>
          )}

          {/* SETTINGS, TIME-MACHINE BACKUP & SINGLE-BRANCH MANAGEMENT WORKSPACE */}
          {activeWorkspace === 'settings' && (
            <ModuleErrorBoundary moduleName="تنظیمات هسته، بکاپ و پایگاه داده">
            <FrappeCoreModule
              initialTab={settingsInitialTab}
              auditLogs={auditLogs}
              branches={branches}
              activeBranch={defaultBranch}
              onAddBranch={(newBranch) => {
                if (!branches.includes(newBranch)) {
                  setBranches((prev) => [...prev, newBranch]);
                }
                setDefaultBranch(newBranch);
                showToast(`شعبه «${newBranch}» ساخته و فعال شد.`);
              }}
              onSelectBranch={(b) => {
                setDefaultBranch(b);
                showToast(`شعبه «${b}» فعال شد.`);
              }}
              snapshots={backupSnapshots}
              snapshotsLoaded={backupSnapshotsHydrated}
              activeSnapshotIndex={effectiveSnapshotIndex}
              currentLiveState={{
                accounts,
                salesInvoices,
                purchaseInvoices,
                inventoryItems,
                masterOptions,
                categorySectors,
              }}
              onCreateManualSnapshot={handleCreateSnapshot}
              onRestoreSnapshotAtIndex={handleRestoreSnapshotAtIndex}
              onRollbackSnapshot={handleUndoSnapshot}
              onRollForwardSnapshot={handleRedoSnapshot}
              onImportBackupSnapshotFile={handleImportBackupSnapshotFile}
              shareholders={shareholders}
              shareholderSnapshots={shareholderSnapshots}
              onUpdateShareholderPercentagesWithSnapshot={({
                partner1CapitalPct,
                partner1ProfitPct,
                partner2CapitalPct,
                partner2ProfitPct,
                note,
              }) => {
                const snap: ShareholderRuleSnapshot = {
                  id: `sh-snap-${Date.now()}`,
                  effectiveDate: formatPersianDate(new Date()),
                  partner1Name: shareholders[0]?.name || 'شریک اول',
                  partner1CapitalPct,
                  partner1ProfitPct,
                  previousPartner1CapitalPct: shareholders[0]?.ownershipPercent ?? 50,
                  previousPartner1ProfitPct: shareholders[0]?.profitSharePercent ?? 70,
                  partner2Name: shareholders[1]?.name || 'شریک دوم',
                  partner2CapitalPct,
                  partner2ProfitPct,
                  previousPartner2CapitalPct: shareholders[1]?.ownershipPercent ?? 50,
                  previousPartner2ProfitPct: shareholders[1]?.profitSharePercent ?? 30,
                  frozenPartner1Wallet: 0,
                  frozenPartner2Wallet: 0,
                  frozenRecoveryPool: initialInventoryCapitalBaseline,
                  note,
                };
                setShareholderSnapshots((prev) => [snap, ...prev]);
                setShareholders((prev) =>
                  prev.map((s, idx) =>
                    idx === 0
                      ? {
                          ...s,
                          ownershipPercent: partner1CapitalPct,
                          profitSharePercent: partner1ProfitPct,
                        }
                      : {
                          ...s,
                          ownershipPercent: partner2CapitalPct,
                          profitSharePercent: partner2ProfitPct,
                        }
                  )
                );
                showToast(
                  'درصد شرکا آپدیت شد و اسنپ‌شات دوره قبل در سیستم ثبت گردید.'
                );
              }}
              onExportFullData={() => {
                const dump = {
                  schemaVersion: 2,
                  exportedAt: formatPersianDate(new Date()),
                  branch: defaultBranch,
                  accounts,
                  inventoryItems,
                  customerContacts,
                  salesInvoices,
                  purchaseInvoices,
                  shareholders,
                  stockLedgerEntries,
                  glEntries,
                  journalEntries,
                  paymentEntries,
                  costCenters,
                  fixedAssets,
                  crmLeads,
                  calendarEvents,
                  customerWishlist,
                  recurringTemplates,
                  monthlyExpenseLedger,
                  promotionRules,
                  warehouses,
                  theftFraudIncidents,
                };
                triggerBrowserDownload(
                  JSON.stringify(dump, null, 2),
                  `emkan-complete-backup-${Date.now()}.json`,
                  'application/json'
                );
                showToast('فایل پشتیبان کامل سیستم صادر و دانلود شد.');
              }}
              onRestoreFullData={(dump) => {
                if (Array.isArray(dump.accounts)) setAccounts(dump.accounts);
                if (Array.isArray(dump.inventoryItems)) setInventoryItems(dump.inventoryItems);
                if (Array.isArray(dump.customerContacts)) setCustomerContacts(dump.customerContacts);
                if (Array.isArray(dump.salesInvoices)) setSalesInvoices(dump.salesInvoices);
                if (Array.isArray(dump.purchaseInvoices)) setPurchaseInvoices(dump.purchaseInvoices);
                if (Array.isArray(dump.shareholders)) setShareholders(dump.shareholders);
                if (Array.isArray(dump.stockLedgerEntries)) setStockLedgerEntries(dump.stockLedgerEntries);
                if (Array.isArray(dump.theftFraudIncidents)) setTheftFraudIncidents(dump.theftFraudIncidents);
                if (Array.isArray(dump.glEntries)) setGlEntries(dump.glEntries);
                if (Array.isArray(dump.journalEntries)) setJournalEntries(dump.journalEntries);
                if (Array.isArray(dump.paymentEntries)) setPaymentEntries(dump.paymentEntries);
                if (Array.isArray(dump.costCenters)) setCostCenters(dump.costCenters);
                if (Array.isArray(dump.fixedAssets)) setFixedAssets(dump.fixedAssets);
                if (Array.isArray(dump.crmLeads)) setCrmLeads(dump.crmLeads);
                if (Array.isArray(dump.calendarEvents)) setCalendarEvents(dump.calendarEvents);
                if (Array.isArray(dump.customerWishlist)) setCustomerWishlist(dump.customerWishlist);
                if (Array.isArray(dump.recurringTemplates)) setRecurringTemplates(dump.recurringTemplates);
                if (Array.isArray(dump.monthlyExpenseLedger)) setMonthlyExpenseLedger(dump.monthlyExpenseLedger);
                if (Array.isArray(dump.promotionRules)) setPromotionRules(dump.promotionRules);
                if (Array.isArray(dump.warehouses)) setWarehouses(dump.warehouses);
                showToast('بازیابی کامل اطلاعات سامانه با موفقیت انجام شد.');
                recordAuditLog('بازیابی کامل اطلاعات', 'بازیابی اطلاعات از فایل پشتیبان JSON', 'سیستم');
              }}
              onShowToast={showToast}
              onClearAllData={() => {
                setInventoryItems([]);
                setCustomerContacts([]);
                setSalesInvoices([]);
                setPurchaseInvoices([]);
                setGlEntries([]);
                setStockLedgerEntries([]);
                setTheftFraudIncidents([]);
                setJournalEntries([]);
                setPaymentEntries([]);
                setCalendarEvents([]);
                setCustomerWishlist([]);
                setRecurringTemplates([]);
                setMonthlyExpenseLedger([]);
                setCrmLeads([]);
                setBulkSmsPool([]);
                setCostCenters(INITIAL_COST_CENTERS);
                setFixedAssets([]);
                setShareholderSnapshots([]);
                setShareholderDrawings([]);
                const zeroedAccounts = accounts.map((acc) => ({ ...acc, balance: 0, openingBalance: 0 }));
                setAccounts(zeroedAccounts);
                void atomicCommitMultiStores([
                  { storageKey: 'emkan.v1.inventory-items', value: [] },
                  { storageKey: 'emkan.v1.customer-contacts', value: [] },
                  { storageKey: 'emkan.v1.sales-invoices', value: [] },
                  { storageKey: 'emkan.v1.purchase-invoices', value: [] },
                  { storageKey: 'emkan.v1.gl-entries', value: [] },
                  { storageKey: 'emkan.v4.stock-ledger-entries', value: [] },
                  { storageKey: 'emkan.v4.accounts', value: zeroedAccounts },
                  { storageKey: 'emkan.v4.calendar-events', value: [] },
                  { storageKey: 'emkan.v4.customer-wishlist', value: [] },
                  { storageKey: 'emkan.v4.recurring-templates', value: [] },
                  { storageKey: 'emkan.v4.monthly-expense-ledger', value: [] },
                  { storageKey: 'emkan.v1.crm-leads', value: [] },
                  { storageKey: 'emkan.v4.bulk-sms-pool', value: [] },
                  { storageKey: 'emkan.v1.journal-entries', value: [] },
                  { storageKey: 'emkan.v1.payment-entries', value: [] },
                  { storageKey: 'emkan.v4.theft-fraud-incidents', value: [] },
                  { storageKey: 'emkan.v4.cost-centers', value: INITIAL_COST_CENTERS },
                  { storageKey: 'emkan.v4.fixed-assets', value: [] },
                  { storageKey: 'emkan.v4.shareholder-snapshots', value: [] },
                  { storageKey: 'emkan.v4.shareholder-drawings', value: [] },
                ]);
                showToast('تمام داده‌های فعلی، مانده حساب‌ها، تقویم عملیاتی و لیست انتظار پاکسازی شدند؛ سیستم اکنون کاملاً خالی است.');
                recordAuditLog('پاک‌سازی کل اطلاعات سامانه', 'صفر کردن تمامی جداول، تقویم و حساب‌ها برای دیتای جدید (Clean Slate)', 'سیستم');
              }}
              onImportHesabfaData={(raw) => {
                try {
                  const payload = parseHesabfaImportPayload(raw);
                  const summary = summarizeHesabfaImport(payload);
                  setProductionMode(true);
                  setInventoryItems(normalizeCloudyShopInventory(payload.products));
                  setCustomerContacts(payload.contacts);
                  setSalesInvoices(payload.salesInvoices);
                  showToast(
                    `ایمپورت موفق: ${summary.productCount} کالا و ${summary.contactCount} مخاطب اضافه شد.`
                  );
                  recordAuditLog('ایمپورت فایل حسابفا', `ایمپورت ${summary.productCount} کالا و ${summary.contactCount} مخاطب`, 'سیستم');
                } catch {
                  showToast('خطا در خواندن فایل ورودی.');
                }
              }}
            />
            </ModuleErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
