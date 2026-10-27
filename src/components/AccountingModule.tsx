import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  Lock,
  Scale,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Plus,
  Printer,
  Download,
  Trash2,
  ExternalLink,
  FileText,
  X,
  Undo2,
  Sparkles,
  Copy,
  Check,
  Receipt,
  Package,
} from 'lucide-react';
import { generatePlainTextReceipt, ReceiptExportData } from '../utils/posService';

function getPurchaseLineDiscountAmount(line: InvoiceLineItem): number {
  const gross = Math.max(0, line.qty * line.unitPrice);
  if (line.lineDiscountType === 'percent' || (!line.lineDiscountAmount && line.discountPercent > 0)) {
    const percent = Math.min(100, Math.max(0, line.discountPercent || 0));
    return Math.min(gross, Math.round((gross * percent) / 100));
  }
  return Math.min(gross, Math.max(0, line.lineDiscountAmount || 0));
}
import {
  AccountNode,
  GLEntryRecord,
  SalesInvoiceRecord,
  InvoiceLineItem,
  PurchaseInvoiceRecord,
  JournalEntryRecord,
  CostCenterRecord,
  FixedAssetRecord,
  ShareholderRecord,
  ShareholderRuleSnapshot,
  ShareholderDrawingRecord,
  RecurringExpenseTemplate,
  MonthlyExpenseLedgerRecord,
  InventoryItemRecord,
  CustomerContactRecord,
  MasterOptionsRegistry,
  WarehouseRecord,
} from '../data/erpSeedData';
import {
  formatCurrency,
  formatPersianDate,
  getPersianYear,
  calculateFinancialStatements,
  computeTrialBalance6Col,
  formatVoucherType,
  calculateThreeBucketShareholderState,
  resolveShareholderRatesAtDate,
  exactAdd,
  exactSub,
  SystemRole,
} from '../utils/erpEngine';
import {
  PolarisButton,
  PolarisButtonGroup,
  formatLiveComma,
  parseCommaNumber,
} from './CreatableCombobox';
import { CurrencyInput } from './CurrencyInput';
import { triggerBrowserDownload } from '../utils/posService';

export type AccountingSubTab =
  | 'coa'
  | 'gl_trial'
  | 'invoices_archive'
  | 'statements'
  | 'journal'
  | 'budget'
  | 'assets';

interface AccountingModuleProps {
  productionMode: boolean;
  activeRole: SystemRole;
  defaultBranch: string;
  activeFiscalYear: string;
  initialSubTab?: AccountingSubTab;
  accounts: AccountNode[];
  onAddAccount?: (acc: AccountNode) => void;
  glEntries: GLEntryRecord[];
  journalEntries: JournalEntryRecord[];
  onSaveJournalEntry?: (je: JournalEntryRecord) => void;
  onSubmitJournalEntry?: (id: string) => void;
  onCancelJournalEntry?: (id: string) => void;
  salesInvoices: SalesInvoiceRecord[];
  onCancelSalesInvoice?: (id: string) => void;
  purchaseInvoices: PurchaseInvoiceRecord[];
  onCreatePurchaseInvoice?: (pinv: PurchaseInvoiceRecord) => boolean;
  onCancelPurchaseInvoice?: (id: string) => void;
  onMarkPurchaseArrived?: (id: string) => void;
  costCenters: CostCenterRecord[];
  recurringTemplates: RecurringExpenseTemplate[];
  monthlyExpenseLedger: MonthlyExpenseLedgerRecord[];
  onAddRecurringTemplate?: (tmpl: Omit<RecurringExpenseTemplate, 'id'>) => void;
  onUpdateRecurringTemplateAmount?: (id: string, newAmount: number) => void;
  onRecordMonthlyFixedExpense?: (record: {
    templateId: string;
    monthYear: string;
    amount: number;
    paidFromAccountCode: string;
    note?: string;
  }) => void;
  fixedAssets: FixedAssetRecord[];
  onAddFixedAsset?: (asset: Omit<FixedAssetRecord, 'id'>) => void;
  onScrapOrSellAsset?: (id: string, newStatus: FixedAssetRecord['status']) => void;
  shareholders: ShareholderRecord[];
  shareholderSnapshots: ShareholderRuleSnapshot[];
  shareholderDrawings: ShareholderDrawingRecord[];
  initialInventoryCapitalBaseline: number;
  onRecordShareholderDrawing?: (drawing: {
    partnerId: string;
    amount: number;
    paidFromAccountCode: string;
    note: string;
  }) => void;
  onRecordShareholderCapitalInjection?: (injection: {
    partnerId: string;
    amount: number;
    toAccountCode: string;
    note: string;
  }) => void;
  onUpdateShareholderPercentagesWithSnapshot?: (params: {
    partner1CapitalPct: number;
    partner1ProfitPct: number;
    partner2CapitalPct: number;
    partner2ProfitPct: number;
    note: string;
  }) => void;
  inventoryItems: InventoryItemRecord[];
  customerContacts: CustomerContactRecord[];
  onQuickAddSupplier?: (supplierName: string, phone?: string) => void;
  masterOptions: MasterOptionsRegistry;
  onAddMasterOption?: (category: keyof MasterOptionsRegistry, value: string) => void;
  warehouses: WarehouseRecord[];
  onNavigateToPos: () => void;
  onNavigateToInventoryBreakdown: (billNo?: string) => void;
  privacyMask: boolean;
  onTogglePrivacy?: () => void;
  onShowToast: (msg: string) => void;
}

export const AccountingModule: React.FC<AccountingModuleProps> = ({
  defaultBranch,
  activeFiscalYear,
  initialSubTab = 'coa',
  accounts,
  onAddAccount,
  glEntries,
  journalEntries,
  onSaveJournalEntry,
  onSubmitJournalEntry,
  onCancelJournalEntry,
  salesInvoices,
  onCancelSalesInvoice,
  purchaseInvoices,
  onCreatePurchaseInvoice,
  onCancelPurchaseInvoice,
  onMarkPurchaseArrived,
  costCenters,
  recurringTemplates,
  monthlyExpenseLedger,
  onAddRecurringTemplate,
  onUpdateRecurringTemplateAmount,
  onRecordMonthlyFixedExpense,
  fixedAssets,
  onAddFixedAsset,
  onScrapOrSellAsset,
  shareholders,
  shareholderSnapshots,
  shareholderDrawings,
  onRecordShareholderDrawing,
  onRecordShareholderCapitalInjection,
  onUpdateShareholderPercentagesWithSnapshot,
  initialInventoryCapitalBaseline,
  inventoryItems,
  customerContacts,
  onQuickAddSupplier,
  masterOptions,
  onAddMasterOption,
  warehouses,
  onNavigateToPos,
  onNavigateToInventoryBreakdown,
  privacyMask,
  onTogglePrivacy,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AccountingSubTab>(initialSubTab);
  const isMasked = !!privacyMask;
  const maskCurrency = (amount: number) =>
    isMasked ? '****' : `${formatCurrency(amount)} تومان`;

  // 1. Chart of Accounts State & Add Account Modal
  const [selectedCategory, setSelectedCategory] = useState<string>('همه');
  const [collapsedCodes, setCollapsedCodes] = useState<string[]>([]);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccCategory, setNewAccCategory] = useState<'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه' | ''>('');
  const [newAccLevel, setNewAccLevel] = useState<'معین' | 'تفصیلی'>('معین');
  const [newAccParentCode, setNewAccParentCode] = useState('');

  // 2. Trial Balance & GL State (All 12 Months)
  const PERSIAN_MONTHS = [
    { id: 'همه ماه‌ها', label: 'همه ماه‌ها' },
    { id: '۰۱', label: 'فروردین' },
    { id: '۰۲', label: 'اردیبهشت' },
    { id: '۰۳', label: 'خرداد' },
    { id: '۰۴', label: 'تیر' },
    { id: '۰۵', label: 'مرداد' },
    { id: '۰۶', label: 'شهریور' },
    { id: '۰۷', label: 'مهر' },
    { id: '۰۸', label: 'آبان' },
    { id: '۰۹', label: 'آذر' },
    { id: '۱۰', label: 'دی' },
    { id: '۱۱', label: 'بهمن' },
    { id: '۱۲', label: 'اسفند' },
  ];
  const [trialBalanceLevel, setTrialBalanceLevel] = useState<'گروه' | 'کل' | 'معین'>('معین');
  const [hideZeroAccounts, setHideZeroAccounts] = useState(false);
  const [glFilterAccount, setGlFilterAccount] = useState<string>('همه حساب‌ها');
  const [glFilterMonth, setGlFilterMonth] = useState<string>('همه ماه‌ها');

  // 3. Manual Journal Entry State & Modal
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalDate, setJournalDate] = useState(() => formatPersianDate(new Date()));
  const [journalTitle, setJournalTitle] = useState('');
  const [journalLines, setJournalLines] = useState<{
    id: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    note?: string;
  }[]>([
    { id: 'line-1', accountCode: '', accountName: '', debit: 0, credit: 0, note: '' },
    { id: 'line-2', accountCode: '', accountName: '', debit: 0, credit: 0, note: '' },
  ]);

  // 4. Invoices Archive Filter State
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'sales' | 'returns' | 'purchases' | 'drawings'>('all');
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [confirmVoidInvoiceId, setConfirmVoidInvoiceId] = useState<string | null>(null);
  const [expandedInvoiceRecord, setExpandedInvoiceRecord] = useState<{
    type: 'فروش' | 'مرجوعی' | 'خرید بار' | 'برداشت سود' | 'هزینه ثابت';
    id: string;
    no: string;
    date: string;
    party: string;
    itemsSummary?: string;
    amount: number;
    status: string;
    isCancelled: boolean;
    raw: any;
  } | null>(null);
  const [receiptExportMode, setReceiptExportMode] = useState<'visual' | 'text'>('visual');
  const [copiedTextReceipt, setCopiedTextReceipt] = useState(false);

  // 5. Shareholder Drawings & Capital Injection Modals State
  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false);
  const [drawingPartnerId, setDrawingPartnerId] = useState('');
  const [drawingAmount, setDrawingAmount] = useState('');
  const [drawingAccountCode, setDrawingAccountCode] = useState('');
  const [drawingNote, setDrawingNote] = useState('');

  const [isInjectionModalOpen, setIsInjectionModalOpen] = useState(false);
  const [injectionPartnerId, setInjectionPartnerId] = useState('');
  const [injectionAmount, setInjectionAmount] = useState('');
  const [injectionAccountCode, setInjectionAccountCode] = useState('');
  const [injectionNote, setInjectionNote] = useState('');

  // 6. Fixed Expenses Modals State
  const [isAddTemplateModalOpen, setIsAddTemplateModalOpen] = useState(false);
  const [newTmplName, setNewTmplName] = useState('');
  const [newTmplAmount, setNewTmplAmount] = useState('');
  const [newTmplAccountCode, setNewTmplAccountCode] = useState('');
  const [newTmplDueDay, setNewTmplDueDay] = useState<number | ''>('');
  const [newTmplCostCenter, setNewTmplCostCenter] = useState('');

  const [isPayExpenseModalOpen, setIsPayExpenseModalOpen] = useState(false);
  const [payTmplId, setPayTmplId] = useState('');
  const [payMonthYear, setPayMonthYear] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payAccountCode, setPayAccountCode] = useState('');
  const [payNote, setPayNote] = useState('');

  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false);
  const [editTmplId, setEditTmplId] = useState('');
  const [editTmplAmount, setEditTmplAmount] = useState('');

  const handleDrillDownToLedger = (accCode: string) => {
    setGlFilterAccount(accCode);
    setActiveSubTab('gl_trial');
  };

  // Reconcile account balances with actual GL entries so the tree view is always 100% in sync with ledger
  const liveAccounts = useMemo(() => {
    if (!glEntries || glEntries.length === 0) {
      return accounts.map((a) => ({
        ...a,
        balance: a.openingBalance || 0,
      }));
    }

    const byCode = new Map<string, (typeof accounts)[0]>();
    accounts.forEach((a) => byCode.set(a.code, a));

    const deltas = new Map<string, number>();
    for (const entry of glEntries) {
      if (entry.isCancelled) continue;
      const target = byCode.get(entry.accountCode);
      if (!target) continue;
      const isDebitNature = target.category === 'دارایی' || target.category === 'هزینه';
      const netChange = isDebitNature
        ? exactSub(entry.debit || 0, entry.credit || 0)
        : exactSub(entry.credit || 0, entry.debit || 0);

      let curr: typeof target | undefined = target;
      const visited = new Set<string>();
      while (curr && !visited.has(curr.code)) {
        visited.add(curr.code);
        deltas.set(curr.code, exactAdd(deltas.get(curr.code) || 0, netChange));
        curr = curr.parentCode ? byCode.get(curr.parentCode) : undefined;
      }
    }

    return accounts.map((a) => {
      const d = deltas.get(a.code) || 0;
      return {
        ...a,
        balance: exactAdd(a.openingBalance || 0, d),
      };
    });
  }, [accounts, glEntries]);

  // Financial Statements & Trial Balance Calculations
  const financialStatements = useMemo(
    () => calculateFinancialStatements(liveAccounts),
    [liveAccounts]
  );

  const trialBalance = useMemo(
    () =>
      computeTrialBalance6Col(liveAccounts, trialBalanceLevel, glEntries, 'همه شعب', activeFiscalYear),
    [liveAccounts, trialBalanceLevel, glEntries, activeFiscalYear]
  );

  // Three-Bucket Shareholder State (50/50 Recovery + 50/50 Net Profit)
  const threeBucketState = useMemo(() => {
    const activeSales = salesInvoices.filter(
      (i) => i.docstatus === 1 && i.status !== 'ابطال‌شده'
    );
    const currentPartners = [shareholders[0], shareholders[1]];
    const currentRates = {
      partner1CapitalPct: currentPartners[0]?.ownershipPercent ?? 50,
      partner1ProfitPct: currentPartners[0]?.profitSharePercent ?? 50,
      partner2CapitalPct: currentPartners[1]?.ownershipPercent ?? 50,
      partner2ProfitPct: currentPartners[1]?.profitSharePercent ?? 50,
    };
    const ratesAt = (date: string) =>
      resolveShareholderRatesAtDate(date, shareholderSnapshots, currentRates);
    const totalSalesRevenue = activeSales.reduce(
      (sum, invoice) =>
        exactAdd(sum, invoice.returnAgainst ? -invoice.totalAmount : invoice.totalAmount),
      0
    );
    const totalCogs = activeSales.reduce(
      (sum, invoice) =>
        exactAdd(
          sum,
          (invoice.returnAgainst ? -1 : 1) *
            (invoice.cogsAmount ?? Math.round(invoice.totalAmount * 0.7))
        ),
      0
    );
    const totalPurchases = purchaseInvoices
      .filter((p) => p.docstatus === 1 && p.status !== 'ابطال‌شده')
      .reduce(
        (sum, invoice) =>
          exactAdd(sum, invoice.returnAgainst ? -invoice.totalAmount : invoice.totalAmount),
        0
      );
    const totalDailyExpenses = journalEntries
      .filter((j) => j.docstatus === 1)
      .reduce((s, j) => exactAdd(s, j.totalDebit), 0);
    const totalMonthlyFixed = monthlyExpenseLedger.reduce((s, m) => exactAdd(s, m.amount), 0);

    const p1 = shareholders[0];
    const p2 = shareholders[1];
    const profitAllocations = [0, 0];
    for (const invoice of activeSales) {
      const sign = invoice.returnAgainst ? -1 : 1;
      const profit =
        sign *
        (invoice.totalAmount -
          (invoice.cogsAmount ?? Math.round(invoice.totalAmount * 0.7)));
      const rates = ratesAt(invoice.date);
      profitAllocations[0] = exactAdd(
        profitAllocations[0],
        Math.round((profit * rates.partner1ProfitPct) / 100)
      );
      profitAllocations[1] = exactAdd(
        profitAllocations[1],
        Math.round((profit * rates.partner2ProfitPct) / 100)
      );
    }
    for (const expense of journalEntries.filter((entry) => entry.docstatus === 1)) {
      const rates = ratesAt(expense.postingDate);
      profitAllocations[0] = exactSub(
        profitAllocations[0],
        Math.round((expense.totalDebit * rates.partner1ProfitPct) / 100)
      );
      profitAllocations[1] = exactSub(
        profitAllocations[1],
        Math.round((expense.totalDebit * rates.partner2ProfitPct) / 100)
      );
    }
    for (const expense of monthlyExpenseLedger) {
      const rates = ratesAt(`${expense.monthYear}/01`);
      profitAllocations[0] = exactSub(
        profitAllocations[0],
        Math.round((expense.amount * rates.partner1ProfitPct) / 100)
      );
      profitAllocations[1] = exactSub(
        profitAllocations[1],
        Math.round((expense.amount * rates.partner2ProfitPct) / 100)
      );
    }

    const expansionNeeded = Math.max(0, totalPurchases - Math.max(0, totalCogs));
    const expansionCharges = [0, 0];
    let remainingExpansion = expansionNeeded;
    const purchasesNewestFirst = purchaseInvoices
      .filter((purchase) => purchase.docstatus === 1 && !purchase.returnAgainst)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const purchase of purchasesNewestFirst) {
      if (remainingExpansion <= 0) break;
      const expansionOnPurchase = Math.min(remainingExpansion, purchase.totalAmount);
      const rates = ratesAt(purchase.date);
      expansionCharges[0] = exactAdd(
        expansionCharges[0],
        Math.round((expansionOnPurchase * rates.partner1CapitalPct) / 100)
      );
      expansionCharges[1] = exactAdd(
        expansionCharges[1],
        Math.round((expansionOnPurchase * rates.partner2CapitalPct) / 100)
      );
      remainingExpansion -= expansionOnPurchase;
    }

    const p1DrawingsSum = shareholderDrawings
      .filter((d) => d.partnerId === p1?.id)
      .reduce((sum, d) => exactAdd(sum, d.amount || 0), 0);
    const p2DrawingsSum = shareholderDrawings
      .filter((d) => d.partnerId === p2?.id)
      .reduce((sum, d) => exactAdd(sum, d.amount || 0), 0);

    const result = calculateThreeBucketShareholderState({
      initialInventoryCapital: initialInventoryCapitalBaseline,
      totalRevenue: totalSalesRevenue,
      totalCogs,
      totalOperatingExpenses: totalDailyExpenses + totalMonthlyFixed,
      totalNewPurchasesAmount: totalPurchases,
      partners: [
        {
          id: p1?.id || 'sh-1',
          name: p1?.name || 'شریک اول (۵۰٪)',
          capitalSharePercent: p1?.ownershipPercent ?? 50,
          profitSharePercent: p1?.profitSharePercent ?? 50,
          personalCapitalInjected: p1?.personalCapitalInjected ?? 0,
          withdrawals: Math.max(p1?.dividendPaid ?? 0, p1DrawingsSum),
          profitAllocationOverride: profitAllocations[0],
          capitalExpansionChargeOverride: 0,
        },
        {
          id: p2?.id || 'sh-2',
          name: p2?.name || 'شریک دوم (۵۰٪)',
          capitalSharePercent: p2?.ownershipPercent ?? 50,
          profitSharePercent: p2?.profitSharePercent ?? 50,
          personalCapitalInjected: p2?.personalCapitalInjected ?? 0,
          withdrawals: Math.max(p2?.dividendPaid ?? 0, p2DrawingsSum),
          profitAllocationOverride: profitAllocations[1],
          capitalExpansionChargeOverride: 0,
        },
      ],
      chargeExpansionToWallet: false,
    });

    return {
      ...result,
      summaryMetrics: {
        totalSalesRevenue,
        totalCogs,
        totalDailyExpenses,
        totalMonthlyFixed,
        totalPurchases,
      },
    };
  }, [
    salesInvoices,
    purchaseInvoices,
    journalEntries,
    monthlyExpenseLedger,
    shareholders,
    shareholderDrawings,
    initialInventoryCapitalBaseline,
  ]);

  const hasChildren = (code: string) => liveAccounts.some((a) => a.parentCode === code);
  const balanceDifference = Math.round(
    financialStatements.totalAssets -
    financialStatements.totalLiabilities -
    financialStatements.totalEquity -
    financialStatements.netProfit
  );
  const isBalanceSheetBalanced = Math.abs(balanceDifference) < 1;
  const balanceIndicatorPercent = isBalanceSheetBalanced
    ? 100
    : Math.max(
        0,
        100 -
          Math.min(
            100,
            Math.round(
              (Math.abs(balanceDifference) / Math.max(1, financialStatements.totalAssets)) * 100
            )
          )
      );

  const toggleCollapseCode = (code: string) => {
    setCollapsedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const isAccountVisibleInTree = (acc: AccountNode): boolean => {
    if (selectedCategory !== 'همه' && acc.category !== selectedCategory) return false;
    let currParent = acc.parentCode;
    while (currParent) {
      if (collapsedCodes.includes(currParent)) return false;
      const parentObj = liveAccounts.find((a) => a.code === currParent);
      currParent = parentObj?.parentCode;
    }
    return true;
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Sub-Navigation */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              مدیریت مالی، دفاتر دوبل حسابداری و صورت‌ها — {defaultBranch} ({activeFiscalYear})
            </h2>
            <p className="text-[11px] text-slate-500">
              کدینگ جامع حساب‌ها، ثبت سند دستی، دفاتر کل و معین، تراز آزمایشی ۶ ستونی و گزارش قلک‌های سهامداری
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {[
              { id: 'coa' as const, label: 'درخت حساب‌ها' },
              { id: 'gl_trial' as const, label: 'تراز آزمایشی و دفتر کل' },
              {
                id: 'invoices_archive' as const,
                label: `آرشیو فاکتورها (${salesInvoices.length + purchaseInvoices.length})`,
              },
              { id: 'statements' as const, label: 'ترازنامه یکپارچه' },
              { id: 'journal' as const, label: `دفتر اسناد روزانه (${journalEntries.length})` },
              { id: 'budget' as const, label: 'دفتر هزینه‌های ثابت' },
              { id: 'assets' as const, label: '۳ قلک سود و حقوق صاحبان سهام' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeSubTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* =====================================================================
          VIEW 1: CHART OF ACCOUNTS (Tree View + Drill-Down to Ledger + Add Account)
         ===================================================================== */}
      {activeSubTab === 'coa' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                درخت حساب‌های استاندارد ({liveAccounts.length} سرفصل کل، معین و تفصیلی)
              </span>
              {onAddAccount && (
                <PolarisButton
                  size="slim"
                  primary
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setNewAccParentCode(accounts[0]?.code || '1100');
                    setNewAccCode('');
                    setNewAccName('');
                    setIsAddAccountModalOpen(true);
                  }}
                >
                  + افزودن سرفصل جدید
                </PolarisButton>
              )}
            </div>
            <PolarisButtonGroup segmented>
              {['همه', 'دارایی', 'بدهی', 'سرمایه', 'درآمد', 'هزینه'].map((cat) => (
                <PolarisButton
                  key={cat}
                  size="slim"
                  primary={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </PolarisButton>
              ))}
            </PolarisButtonGroup>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[520px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3">کد و نام سرفصل حساب</th>
                  <th className="py-2 px-3">طبقه</th>
                  <th className="py-2 px-3">سطح</th>
                  <th className="py-2 px-3 text-left">مانده لحظه‌ای (تومان)</th>
                  <th className="py-2 px-3 text-center">گردش معین</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {liveAccounts.filter(isAccountVisibleInTree).map((acc) => {
                  const indent =
                    acc.level === 'گروه'
                      ? 'pr-2 font-bold text-slate-900 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-800/40'
                      : acc.level === 'کل'
                        ? 'pr-6 font-semibold text-slate-800 dark:text-slate-200'
                        : acc.level === 'معین'
                          ? 'pr-10 text-slate-700 dark:text-slate-300'
                          : 'pr-14 text-slate-600 dark:text-slate-400';
                  const isParent = hasChildren(acc.code);
                  const isCollapsed = collapsedCodes.includes(acc.code);
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className={`py-2 px-3 ${indent}`}>
                        <div className="flex items-center gap-2">
                          {isParent ? (
                            <button
                              type="button"
                              onClick={() => toggleCollapseCode(acc.code)}
                              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              {isCollapsed ? (
                                <ChevronLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4 inline-block text-center text-slate-300">·</span>
                          )}
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {acc.code}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {acc.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3">{acc.category}</td>
                      <td className="py-2 px-3">{acc.level}</td>
                      <td className="py-2 px-3 text-left font-mono font-bold tabular-nums">
                        {maskCurrency(acc.balance)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDrillDownToLedger(acc.code)}
                          title="مشاهده گردش حساب در دفتر معین"
                          className="p-1 px-2.5 rounded-md bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-slate-700 font-semibold inline-flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>گردش حساب</span>
                        </button>
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
          VIEW 2: 6-COLUMN TRIAL BALANCE & GENERAL LEDGER (Print + CSV Export)
         ===================================================================== */}
      {activeSubTab === 'gl_trial' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  تراز آزمایشی ۶ ستونی ماهیانه ({trialBalance.rows.length} حساب)
                </span>
                <PolarisButton
                  size="slim"
                  icon={<Printer className="w-3.5 h-3.5" />}
                  onClick={() => window.print()}
                >
                  چاپ تراز
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => {
                    const headers = [
                      'کد حساب',
                      'نام حساب',
                      'ابتدای دوره بدهکار',
                      'ابتدای دوره بستانکار',
                      'گردش طی دوره بدهکار',
                      'گردش طی دوره بستانکار',
                      'مانده پایان دوره بدهکار',
                      'مانده پایان دوره بستانکار',
                    ];
                    const rows = trialBalance.rows.map((r) => [
                      r.code,
                      `"${r.name.replace(/"/g, '""')}"`,
                      r.openingDebit,
                      r.openingCredit,
                      r.periodDebit,
                      r.periodCredit,
                      r.closingDebit,
                      r.closingCredit,
                    ]);
                    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
                    triggerBrowserDownload(
                      csvContent,
                      `trial-balance-6col-${activeFiscalYear}-${trialBalanceLevel}.csv`,
                      'text/csv;charset=utf-8;'
                    );
                    onShowToast?.('فایل اکسل تراز آزمایشی ۶ ستونی با موفقیت دانلود شد.');
                  }}
                >
                  اکسپورت اکسل
                </PolarisButton>
              </div>
              <div className="flex items-center gap-2">
                <PolarisButtonGroup segmented>
                  {(['گروه', 'کل', 'معین'] as const).map((lvl) => (
                    <PolarisButton
                      key={lvl}
                      size="slim"
                      primary={trialBalanceLevel === lvl}
                      onClick={() => setTrialBalanceLevel(lvl)}
                    >
                      سطح {lvl}
                    </PolarisButton>
                  ))}
                </PolarisButtonGroup>
                <PolarisButton
                  size="slim"
                  primary={hideZeroAccounts}
                  onClick={() => setHideZeroAccounts(!hideZeroAccounts)}
                >
                  {hideZeroAccounts ? 'نمایش همه حساب‌ها' : 'فقط حساب‌های دارای گردش و مانده'}
                </PolarisButton>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th rowSpan={2} className="py-2 px-3 border-l border-slate-200 dark:border-slate-700 align-middle">کد حساب</th>
                    <th rowSpan={2} className="py-2 px-3 border-l border-slate-200 dark:border-slate-700 align-middle">نام سرفصل حساب</th>
                    <th colSpan={2} className="py-1 px-3 text-center border-l border-slate-200 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-700/50 font-bold">ابتدای دوره</th>
                    <th colSpan={2} className="py-1 px-3 text-center border-l border-slate-200 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-700/50 font-bold">گردش طی دوره</th>
                    <th colSpan={2} className="py-1 px-3 text-center bg-slate-200/50 dark:bg-slate-700/50 font-bold">مانده پایان دوره</th>
                  </tr>
                  <tr className="border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-1 px-2 text-center">بدهکار</th>
                    <th className="py-1 px-2 text-center border-l border-slate-200 dark:border-slate-700">بستانکار</th>
                    <th className="py-1 px-2 text-center">بدهکار</th>
                    <th className="py-1 px-2 text-center border-l border-slate-200 dark:border-slate-700">بستانکار</th>
                    <th className="py-1 px-2 text-center text-emerald-700 dark:text-emerald-400">بدهکار</th>
                    <th className="py-1 px-2 text-center text-indigo-700 dark:text-indigo-400">بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {trialBalance.rows
                    .filter(
                      (r) =>
                        !hideZeroAccounts ||
                        r.openingDebit !== 0 ||
                        r.openingCredit !== 0 ||
                        r.periodDebit !== 0 ||
                        r.periodCredit !== 0 ||
                        r.closingDebit !== 0 ||
                        r.closingCredit !== 0
                    )
                    .map((r) => (
                    <tr key={r.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-mono tabular-nums border-l border-slate-100 dark:border-slate-800">{r.code}</td>
                      <td className="py-2 px-3 font-semibold border-l border-slate-100 dark:border-slate-800">{r.name}</td>
                      {/* ۱ و ۲: ابتدای دوره */}
                      <td className="py-2 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {maskCurrency(r.openingDebit)}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums text-slate-600 dark:text-slate-400 border-l border-slate-100 dark:border-slate-800">
                        {maskCurrency(r.openingCredit)}
                      </td>
                      {/* ۳ و ۴: گردش طی دوره */}
                      <td className="py-2 px-2 font-mono tabular-nums">
                        {maskCurrency(r.periodDebit)}
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums border-l border-slate-100 dark:border-slate-800">
                        {maskCurrency(r.periodCredit)}
                      </td>
                      {/* ۵ و ۶: مانده پایان دوره */}
                      <td className="py-2 px-2 font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {maskCurrency(r.closingDebit)}
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-indigo-700 dark:text-indigo-400 tabular-nums">
                        {maskCurrency(r.closingCredit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* General Ledger IndexTable */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  دفتر کل و معین ({glEntries.filter((g) => !g.isCancelled).length} آرتیکل فعال)
                </span>
                <PolarisButton
                  size="slim"
                  icon={<Printer className="w-3.5 h-3.5" />}
                  onClick={() => window.print()}
                >
                  چاپ دفتر
                </PolarisButton>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={glFilterAccount}
                  onChange={(e) => setGlFilterAccount(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 max-w-[200px]"
                >
                  <option value="همه حساب‌ها">همه حساب‌ها (دفتر کل)</option>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
                <select
                  value={glFilterMonth}
                  onChange={(e) => setGlFilterMonth(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {PERSIAN_MONTHS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-96 overflow-y-auto overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-3">تاریخ</th>
                    <th className="py-2 px-3">شماره سند</th>
                    <th className="py-2 px-3">نوع سند</th>
                    <th className="py-2 px-3">سرفصل حساب</th>
                    <th className="py-2 px-3">بدهکار</th>
                    <th className="py-2 px-3">بستانکار</th>
                    <th className="py-2 px-3">شرح ردیف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {glEntries
                    .filter((g) => !g.isCancelled)
                    .filter((g) =>
                      glFilterAccount === 'همه حساب‌ها' ? true : g.accountCode === glFilterAccount
                    )
                    .filter((g) =>
                      glFilterMonth === 'همه ماه‌ها'
                        ? true
                        : g.postingDate.includes(`/${glFilterMonth}/`)
                    )
                    .map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-mono tabular-nums">{g.postingDate}</td>
                        <td className="py-2 px-3 font-mono font-bold">{g.voucherNo}</td>
                        <td className="py-2 px-3">{formatVoucherType(g.voucherType)}</td>
                        <td className="py-2 px-3 font-semibold">
                          {g.accountCode} — {g.accountName}
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-700 font-bold tabular-nums">
                          {g.debit > 0 ? maskCurrency(g.debit) : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-rose-700 font-bold tabular-nums">
                          {g.credit > 0 ? maskCurrency(g.credit) : '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{g.remarks || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 3: UNIFIED BALANCE SHEET & P&L REPORT (Print & Balance Engine)
         ===================================================================== */}
      
      {/* =====================================================================
          VIEW: INVOICES ARCHIVE & COMPREHENSIVE RECONCILIATION
         ===================================================================== */}
      {activeSubTab === 'invoices_archive' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>آرشیو جامع فاکتورها، خریدها و اسناد مالی</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  فیلتر، ردیابی وضعیت تسویه و ابطال امن فاکتورها با صدور خودکار سند معکوس
                </p>
              </div>

              {/* Quick Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {[
                  { id: 'all' as const, label: 'همه اسناد' },
                  { id: 'sales' as const, label: 'فقط فروش‌ها' },
                  { id: 'returns' as const, label: 'فقط مرجوعی‌ها' },
                  { id: 'purchases' as const, label: 'خریدها' },
                  { id: 'drawings' as const, label: 'پرداختی‌ها' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setArchiveFilter(f.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      archiveFilter === f.id
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="max-w-md">
              <input
                type="text"
                value={archiveSearchQuery}
                onChange={(e) => setArchiveSearchQuery(e.target.value)}
                placeholder="جستجوی شماره سند، نام مشتری یا تامین‌کننده..."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            {/* Invoices List Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[460px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">نوع سند</th>
                    <th className="py-2.5 px-3">شماره سند</th>
                    <th className="py-2.5 px-3">تاریخ</th>
                    <th className="py-2.5 px-3">طرف حساب</th>
                    <th className="py-2.5 px-3">اقلام و محصولات</th>
                    <th className="py-2.5 px-3">مبلغ کل</th>
                    <th className="py-2.5 px-3">وضعیت سند</th>
                    <th className="py-2.5 px-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(() => {
                    const q = archiveSearchQuery.trim().toLowerCase();
                    const records: Array<{
                      type: 'فروش' | 'مرجوعی' | 'خرید بار' | 'برداشت سود' | 'هزینه ثابت';
                      id: string;
                      no: string;
                      date: string;
                      party: string;
                      itemsSummary?: string;
                      amount: number;
                      status: string;
                      isCancelled: boolean;
                      raw: any;
                    }> = [];

                    if (archiveFilter === 'all' || archiveFilter === 'sales') {
                      salesInvoices
                        .filter((s) => !s.returnAgainst)
                        .forEach((s) =>
                          records.push({
                            type: 'فروش',
                            id: s.id,
                            no: s.invoiceNo,
                            date: s.date,
                            party: s.customerName,
                            itemsSummary: s.itemsSummary || (s.lines?.map((l) => `${l.qty} × ${l.itemName}`).join(' ، ')) || '—',
                            amount: s.totalAmount,
                            status: s.docstatus === 2 ? 'ابطال‌شده' : s.status,
                            isCancelled: s.docstatus === 2,
                            raw: s,
                          })
                        );
                    }

                    if (archiveFilter === 'all' || archiveFilter === 'returns') {
                      salesInvoices
                        .filter((s) => s.returnAgainst || s.status === 'مرجوعی (یادداشت بستانکاری)')
                        .forEach((s) =>
                          records.push({
                            type: 'مرجوعی',
                            id: s.id,
                            no: s.invoiceNo,
                            date: s.date,
                            party: s.customerName,
                            itemsSummary: s.itemsSummary || (s.lines?.map((l) => `${l.qty} × ${l.itemName}`).join(' ، ')) || '—',
                            amount: s.creditedAmount ?? s.paidAmount ?? s.totalAmount,
                            status: s.docstatus === 2 ? 'ابطال‌شده' : 'مرجوعی ثبت‌شده',
                            isCancelled: s.docstatus === 2,
                            raw: s,
                          })
                        );
                    }

                    if (archiveFilter === 'all' || archiveFilter === 'purchases') {
                      purchaseInvoices.forEach((p) =>
                        records.push({
                          type: 'خرید بار',
                          id: p.id,
                          no: p.billNo,
                          date: p.date,
                          party: p.supplierName,
                          itemsSummary: p.itemsSummary || (p.lines?.map((l) => `${l.qty} × ${l.itemName}`).join(' ، ')) || '—',
                          amount: p.totalAmount,
                          status:
                            p.docstatus === 2
                              ? 'ابطال‌شده'
                              : p.deliveryStatus === 'در انتظار رسیدن بار'
                                ? 'در انتظار رسیدن بار'
                                : 'رسیده به انبار',
                          isCancelled: p.docstatus === 2,
                          raw: p,
                        })
                      );
                    }

                    if (archiveFilter === 'all' || archiveFilter === 'drawings') {
                      shareholderDrawings.forEach((d) =>
                        records.push({
                          type: 'برداشت سود',
                          id: d.id,
                          no: `DRW-${d.id.slice(-4)}`,
                          date: d.date,
                          party: d.partnerName,
                          itemsSummary: d.note || 'برداشت سود سهامدار',
                          amount: d.amount,
                          status: 'تسویه‌شده',
                          isCancelled: false,
                          raw: d,
                        })
                      );
                      monthlyExpenseLedger.forEach((m) =>
                        records.push({
                          type: 'هزینه ثابت',
                          id: m.id,
                          no: m.voucherNo,
                          date: m.paymentDate || m.monthYear,
                          party: m.expenseName,
                          itemsSummary: m.note ? `یادداشت: ${m.note}` : 'هزینه ثابت ماهانه',
                          amount: m.amount,
                          status: 'قفل‌شده و پرداخت‌شده',
                          isCancelled: false,
                          raw: m,
                        })
                      );
                    }

                    const filtered = records
                      .filter((r) => {
                        if (!q) return true;
                        return (
                          r.no.toLowerCase().includes(q) ||
                          r.party.toLowerCase().includes(q) ||
                          (r.itemsSummary && r.itemsSummary.toLowerCase().includes(q)) ||
                          r.status.toLowerCase().includes(q)
                        );
                      })
                      .sort((a, b) => b.date.localeCompare(a.date));

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            موردی مطابق با فیلتر انتخاب‌شده یافت نشد.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((rec) => (
                      <tr
                        key={`${rec.type}-${rec.id}`}
                        className={
                          rec.isCancelled
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 text-slate-400'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              rec.type === 'فروش'
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                                : rec.type === 'مرجوعی'
                                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : rec.type === 'خرید بار'
                                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {rec.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold">{rec.no}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">{rec.date}</td>
                        <td className="py-2 px-3 font-semibold">{rec.party}</td>
                        <td className="py-2 px-3 text-[11px] max-w-[220px]">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block" title={rec.itemsSummary}>
                            {rec.itemsSummary || '—'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums">
                          {maskCurrency(rec.amount)}
                        </td>
                        <td className="py-2 px-3 font-semibold">{rec.status}</td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <PolarisButton
                              size="slim"
                              icon={<ExternalLink className="w-3.5 h-3.5" />}
                              onClick={() => setExpandedInvoiceRecord(rec)}
                            >
                              اقلام و رسید
                            </PolarisButton>
                            {!rec.isCancelled &&
                              (rec.type === 'فروش' || rec.type === 'مرجوعی' ? (
                                onCancelSalesInvoice ? (
                                  confirmVoidInvoiceId === rec.id ? (
                                    <PolarisButtonGroup>
                                      <PolarisButton
                                        size="slim"
                                        destructive
                                        onClick={() => {
                                          onCancelSalesInvoice(rec.id);
                                          setConfirmVoidInvoiceId(null);
                                        }}
                                      >
                                        تایید ابطال
                                      </PolarisButton>
                                      <PolarisButton
                                        size="slim"
                                        onClick={() => setConfirmVoidInvoiceId(null)}
                                      >
                                        انصراف
                                      </PolarisButton>
                                    </PolarisButtonGroup>
                                  ) : (
                                    <PolarisButton
                                      size="slim"
                                      destructive
                                      icon={<Trash2 className="w-3.5 h-3.5" />}
                                      onClick={() => setConfirmVoidInvoiceId(rec.id)}
                                    >
                                      ابطال
                                    </PolarisButton>
                                  )
                                ) : null
                              ) : rec.type === 'خرید بار' && onCancelPurchaseInvoice ? (
                                confirmVoidInvoiceId === rec.id ? (
                                  <PolarisButtonGroup>
                                    <PolarisButton
                                      size="slim"
                                      destructive
                                      onClick={() => {
                                        onCancelPurchaseInvoice(rec.id);
                                        setConfirmVoidInvoiceId(null);
                                      }}
                                    >
                                      تایید ابطال
                                    </PolarisButton>
                                    <PolarisButton
                                      size="slim"
                                      onClick={() => setConfirmVoidInvoiceId(null)}
                                    >
                                      انصراف
                                    </PolarisButton>
                                  </PolarisButtonGroup>
                                ) : (
                                  <PolarisButton
                                    size="slim"
                                    destructive
                                    icon={<Trash2 className="w-3.5 h-3.5" />}
                                    onClick={() => setConfirmVoidInvoiceId(rec.id)}
                                  >
                                    ابطال
                                  </PolarisButton>
                                )
                              ) : (
                                <span className="text-[11px] text-slate-400">سند قطعی</span>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expand Invoice Modal */}
          {expandedInvoiceRecord && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
            >
              <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-4xl rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[92vh] overflow-y-auto">
                {/* Modal Top Header */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold">
                          جزئیات سند: {expandedInvoiceRecord.no}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {expandedInvoiceRecord.type}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            expandedInvoiceRecord.isCancelled
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {expandedInvoiceRecord.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        طرف حساب: <strong className="text-slate-800 dark:text-slate-200">{expandedInvoiceRecord.party}</strong> · تاریخ ثبت: <span className="font-mono">{expandedInvoiceRecord.date}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Switcher: Item Details vs Receipt Export */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setReceiptExportMode('visual')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          receiptExportMode === 'visual'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        اقلام و ثبت‌ها
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptExportMode('text')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          receiptExportMode === 'text'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        چاپ و خروجی فیش
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedInvoiceRecord(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {receiptExportMode === 'visual' ? (
                  <div className="space-y-4">
                    {/* High-level Stat Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-500 block">مبلغ کل فاکتور</span>
                        <span className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">
                          {formatCurrency(expandedInvoiceRecord.amount)} تومان
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-500 block">مبلغ پرداخت‌شده</span>
                        <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(expandedInvoiceRecord.raw.paidAmount ?? expandedInvoiceRecord.amount)} تومان
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-500 block">تخفیف کل فاکتور</span>
                        <span className="text-sm font-black font-mono text-amber-600 dark:text-amber-400">
                          {formatCurrency(
                            expandedInvoiceRecord.type === 'خرید بار'
                              ? (expandedInvoiceRecord.raw.discountReceived ??
                                  (expandedInvoiceRecord.raw.lines || []).reduce(
                                    (sum: number, line: InvoiceLineItem) =>
                                      sum + (line.allocatedHeaderDiscount || 0),
                                    0
                                  )) +
                                  (expandedInvoiceRecord.raw.lines || []).reduce(
                                    (sum: number, line: InvoiceLineItem) =>
                                      sum + getPurchaseLineDiscountAmount(line),
                                    0
                                  )
                              : expandedInvoiceRecord.raw.discountReceived ??
                                  expandedInvoiceRecord.raw.lines?.reduce(
                                    (sum: number, line: InvoiceLineItem) =>
                                      sum + (line.allocatedHeaderDiscount ?? 0),
                                    0
                                  ) ??
                                  0
                          )} تومان
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-500 block">تعداد اقلام کالا / خدمت</span>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                          {expandedInvoiceRecord.raw.lines?.length || 0} قلم کالا {expandedInvoiceRecord.raw.serviceLines?.length ? `+ ${expandedInvoiceRecord.raw.serviceLines.length} خدمت` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    {expandedInvoiceRecord.raw.lines && expandedInvoiceRecord.raw.lines.length > 0 ? (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <div className="bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-indigo-600" />
                            <span>ردیف‌های اقلام ({expandedInvoiceRecord.raw.lines.length} ردیف)</span>
                          </span>
                        </div>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                          <table className="w-full text-right text-xs border-collapse">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                              <tr>
                                <th className="py-2 px-3">#</th>
                                <th className="py-2 px-3">نام محصول</th>
                                <th className="py-2 px-3 font-mono">کد SKU</th>
                                <th className="py-2 px-3">صنف</th>
                                <th className="py-2 px-3">تعداد / مقدار</th>
                                <th className="py-2 px-3">قیمت واحد (تومان)</th>
                                <th className="py-2 px-3">تخفیف سطر</th>
                                <th className="py-2 px-3">مبلغ خالص (تومان)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {expandedInvoiceRecord.raw.lines.map((line: any, idx: number) => (
                                <tr key={line.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                                  <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">{line.itemName}</td>
                                  <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{line.sku || '—'}</td>
                                  <td className="py-2 px-3">
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                      line.sector === 'pc' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                                    }`}>
                                      {line.sector === 'pc' ? 'کامپیوتر' : 'ویپ'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 font-bold font-mono">
                                    {line.qty} <span className="font-normal text-[11px] text-slate-400">{line.uom || 'عدد'}</span>
                                  </td>
                                  <td className="py-2 px-3 font-mono">{formatCurrency(line.unitPrice || 0)}</td>
                                  <td className="py-2 px-3 font-mono text-amber-600">
                                    {(() => {
                                      const discount =
                                        expandedInvoiceRecord.type === 'خرید بار'
                                          ? (line.allocatedHeaderDiscount || 0) +
                                            getPurchaseLineDiscountAmount(line)
                                          : line.allocatedHeaderDiscount || line.lineDiscount || 0;
                                      return discount > 0 ? `${formatCurrency(discount)} ت` : '—';
                                    })()}
                                  </td>
                                  <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                                    {formatCurrency(line.netLineAmount || (line.qty * line.unitPrice))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {/* Service Lines Table if any */}
                    {expandedInvoiceRecord.raw.serviceLines && expandedInvoiceRecord.raw.serviceLines.length > 0 ? (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <div className="bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2 border-b border-slate-200 dark:border-slate-700">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            خدمات فنی و دستمزد ({expandedInvoiceRecord.raw.serviceLines.length} خدمت)
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 p-2 text-xs">
                          {expandedInvoiceRecord.raw.serviceLines.map((s: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between py-1.5 px-2">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{s.serviceTitle}</span>
                              <span className="font-mono font-bold text-indigo-600">{formatCurrency(s.feeAmount)} تومان</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* GL Accounting Double-Entry Rows for this Document */}
                    {(() => {
                      const relatedGl = glEntries.filter(
                        (g) => g.voucherNo === expandedInvoiceRecord.no || g.voucherNo.includes(expandedInvoiceRecord.no)
                      );
                      if (relatedGl.length === 0) return null;
                      return (
                        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                          <div className="bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2 border-b border-slate-200 dark:border-slate-700">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              اسناد دفتر کل و ثبت‌های دوبل حسابداری مرتبط ({relatedGl.length} ردیف)
                            </span>
                          </div>
                          <table className="w-full text-right text-xs border-collapse">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                              <tr>
                                <th className="py-1.5 px-3">کد حساب</th>
                                <th className="py-1.5 px-3">نام سرفصل</th>
                                <th className="py-1.5 px-3">بدهکار (تومان)</th>
                                <th className="py-1.5 px-3">بستانکار (تومان)</th>
                                <th className="py-1.5 px-3">شرح سند</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {relatedGl.map((g) => (
                                <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="py-1.5 px-3 font-mono font-bold text-indigo-600">{g.accountCode}</td>
                                  <td className="py-1.5 px-3 font-semibold">{g.accountName}</td>
                                  <td className="py-1.5 px-3 font-mono text-emerald-600 font-bold">
                                    {g.debit > 0 ? formatCurrency(g.debit) : '—'}
                                  </td>
                                  <td className="py-1.5 px-3 font-mono text-rose-600 font-bold">
                                    {g.credit > 0 ? formatCurrency(g.credit) : '—'}
                                  </td>
                                  <td className="py-1.5 px-3 text-slate-500 text-[11px]">{g.remarks}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  /* Receipt Print / Text Export View */
                  (() => {
                    const receiptPayload: ReceiptExportData = {
                      invoiceNo: expandedInvoiceRecord.no,
                      customerName: expandedInvoiceRecord.party,
                      customerPhone: expandedInvoiceRecord.raw.customerPhone,
                      date: expandedInvoiceRecord.date,
                      cashierName: expandedInvoiceRecord.raw.cashierName || 'صندوق امکان',
                      cartLines: (expandedInvoiceRecord.raw.lines || []).map((l: any) => ({
                        name: l.itemName,
                        sku: l.sku,
                        qty: l.qty,
                        uom: l.uom || 'عدد',
                        finalManualUnitPrice: l.unitPrice,
                        lineDiscount:
                          expandedInvoiceRecord.type === 'خرید بار'
                            ? (l.allocatedHeaderDiscount || 0) + getPurchaseLineDiscountAmount(l)
                            : l.allocatedHeaderDiscount ?? l.lineDiscount ?? 0,
                        netLineAmount: l.netLineAmount ?? (l.qty * l.unitPrice),
                      })),
                      serviceLines: expandedInvoiceRecord.raw.serviceLines?.map((s: any) => ({
                        serviceTitle: s.serviceTitle,
                        feeAmount: s.feeAmount,
                      })),
                      goodsTotal:
                        expandedInvoiceRecord.raw.lines?.reduce((s: number, l: any) => s + l.qty * l.unitPrice, 0) ||
                        expandedInvoiceRecord.amount,
                      servicesTotal:
                        expandedInvoiceRecord.raw.serviceLines?.reduce((s: number, sv: any) => s + sv.feeAmount, 0) || 0,
                      totalDiscount:
                        expandedInvoiceRecord.type === 'خرید بار'
                          ? (expandedInvoiceRecord.raw.discountReceived ??
                              (expandedInvoiceRecord.raw.lines || []).reduce(
                                (sum: number, line: InvoiceLineItem) =>
                                  sum + (line.allocatedHeaderDiscount || 0),
                                0
                              )) +
                              (expandedInvoiceRecord.raw.lines || []).reduce(
                                (sum: number, line: InvoiceLineItem) =>
                                  sum + getPurchaseLineDiscountAmount(line),
                                0
                              )
                          : expandedInvoiceRecord.raw.discountReceived ??
                            expandedInvoiceRecord.raw.lines?.reduce(
                              (sum: number, line: InvoiceLineItem) =>
                                sum + (line.allocatedHeaderDiscount ?? 0),
                              0
                            ) ??
                            0,
                      grandTotal: expandedInvoiceRecord.amount,
                      paidAmount: expandedInvoiceRecord.raw.paidAmount ?? expandedInvoiceRecord.amount,
                      paymentMethodLabel: expandedInvoiceRecord.raw.paymentMethodLabel || 'تسویه حساب',
                    };

                    const plainText = generatePlainTextReceipt(receiptPayload);

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Left Column: Visual 80mm Thermal Receipt */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <Receipt className="w-4 h-4 text-emerald-600" />
                              <span>پیش‌نمایش فیش حرارتی ۸۰ میلی‌متری</span>
                            </span>
                            <PolarisButton
                              size="slim"
                              icon={<Printer className="w-3.5 h-3.5" />}
                              onClick={() => window.print()}
                            >
                              پرینت مستقیم
                            </PolarisButton>
                          </div>

                          <div
                            id="accounting-thermal-receipt"
                            className="bg-white text-slate-900 border border-slate-300 rounded-xl p-4 font-mono text-xs shadow-inner space-y-3 max-w-[340px] mx-auto select-all"
                          >
                            <div className="text-center border-b border-dashed border-slate-400 pb-2.5">
                              <div className="font-black text-sm">فروشگاه و خدمات امکان</div>
                              <div className="text-[10px] text-slate-600">فیش تحویل کالا به مشتری</div>
                              <div className="text-[10px] text-slate-500 mt-1">شماره: {expandedInvoiceRecord.no}</div>
                              <div className="text-[10px] text-slate-500">تاریخ: {expandedInvoiceRecord.date}</div>
                              <div className="text-[10px] text-slate-500">طرف حساب: {expandedInvoiceRecord.party}</div>
                            </div>

                            <div className="space-y-1.5 border-b border-dashed border-slate-400 pb-2.5 text-[11px]">
                              {(expandedInvoiceRecord.raw.lines || []).map((l: any, i: number) => (
                                <div key={i} className="flex justify-between items-start">
                                  <div className="leading-tight">
                                    <span className="font-bold">{l.itemName}</span>
                                    <span className="text-[10px] text-slate-500 block">
                                      {l.qty} عدد × {formatCurrency(l.unitPrice)}
                                    </span>
                                  </div>
                                  <span className="font-bold tabular-nums">
                                    {formatCurrency(l.netLineAmount || l.qty * l.unitPrice)} ت
                                  </span>
                                </div>
                              ))}
                              {(expandedInvoiceRecord.raw.serviceLines || []).map((s: any, i: number) => (
                                <div key={`sv-${i}`} className="flex justify-between items-start">
                                  <span className="font-bold">خدمت: {s.serviceTitle}</span>
                                  <span className="font-bold tabular-nums">{formatCurrency(s.feeAmount)} ت</span>
                                </div>
                              ))}
                            </div>

                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                                <span>مبلغ کل قابل پرداخت:</span>
                                <span>{formatCurrency(expandedInvoiceRecord.amount)} تومان</span>
                              </div>
                              <div className="flex justify-between text-slate-600 text-[10px]">
                                <span>وضعیت تسویه:</span>
                                <span>{expandedInvoiceRecord.status}</span>
                              </div>
                            </div>

                            <div className="text-center text-[9px] text-slate-400 border-t border-dashed border-slate-300 pt-2">
                              از اعتماد شما به امکان سپاسگزاریم
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Plain Text Export */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-indigo-600" />
                              <span>خروجی متن ساده (جهت واتساپ / پیامک)</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <PolarisButton
                                size="slim"
                                icon={copiedTextReceipt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                onClick={() => {
                                  navigator.clipboard.writeText(plainText);
                                  setCopiedTextReceipt(true);
                                  setTimeout(() => setCopiedTextReceipt(false), 2000);
                                  onShowToast('متن فیش با موفقیت کپی شد.');
                                }}
                              >
                                {copiedTextReceipt ? 'کپی شد!' : 'کپی متن'}
                              </PolarisButton>
                              <PolarisButton
                                size="slim"
                                icon={<Download className="w-3.5 h-3.5" />}
                                onClick={() => {
                                  triggerBrowserDownload(
                                    plainText,
                                    `receipt-${expandedInvoiceRecord.no}.txt`,
                                    'text/plain;charset=utf-8'
                                  );
                                  onShowToast('فایل فیش متنی دانلود شد.');
                                }}
                              >
                                دانلود .txt
                              </PolarisButton>
                            </div>
                          </div>

                          <textarea
                            readOnly
                            dir="rtl"
                            value={plainText}
                            rows={16}
                            className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 focus:outline-none select-all"
                          />
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Modal Bottom Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <PolarisButton size="slim" onClick={() => setExpandedInvoiceRecord(null)}>
                    بستن پنجره
                  </PolarisButton>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'statements' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  گزارش یکپارچه ترازنامه، معادله اساسی حسابداری و سود و زیان دوره
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ارزیابی انطباق دارایی‌ها = بدهی‌ها + سرمایه و سود خالص انباشته بر اساس استاندارد دوبل Odoo/ERPNext
                </p>
              </div>
            </div>
            <PolarisButton
              size="slim"
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={() => window.print()}
            >
              چاپ صورت‌های مالی
            </PolarisButton>
          </div>

          <div
            role="status"
            aria-label={
              isBalanceSheetBalanced
                ? 'معادله حسابداری متوازن است'
                : `اختلاف تراز ${formatCurrency(balanceDifference)} تومان`
            }
            className={`rounded-lg border p-3 ${
              isBalanceSheetBalanced
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5">
                {isBalanceSheetBalanced ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {isBalanceSheetBalanced
                  ? 'تراز کامل: دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام'
                  : `اختلاف تراز: ${maskCurrency(balanceDifference)}`}
              </span>
              <span>{isBalanceSheetBalanced ? '۱۰۰٪ متوازن' : 'نیازمند بررسی'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/80 dark:bg-slate-900/80">
              <div
                className={`h-full rounded-full transition-[width] ${
                  isBalanceSheetBalanced ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${balanceIndicatorPercent}%` }}
              />
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-3">سرفصل ترازنامه و صورت سود و زیان</th>
                  <th className="py-2 px-3">نقش در معادله حسابداری</th>
                  <th className="py-2 px-3 text-left">مبلغ (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-2.5 px-3 font-bold">کل دارایی‌ها (نقدینگی + ۵ انبار + مطالبات)</td>
                  <td className="py-2.5 px-3 text-slate-500">دارایی‌ها (سمت راست ترازنامه)</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 tabular-nums">
                    {maskCurrency(financialStatements.totalAssets)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold">کل بدهی‌های تجاری</td>
                  <td className="py-2.5 px-3 text-slate-500">بدهی‌ها (سمت چپ ترازنامه)</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-amber-700 tabular-nums">
                    {maskCurrency(financialStatements.totalLiabilities)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold">حقوق صاحبان سهام + سود خالص انباشته</td>
                  <td className="py-2.5 px-3 text-slate-500">سرمایه و سود خالص (سمت چپ)</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-indigo-700 tabular-nums">
                    {maskCurrency(financialStatements.totalEquity + financialStatements.netProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold">فروش کل دوره</td>
                  <td className="py-2.5 px-3 text-slate-500">صورت سود و زیان</td>
                  <td className="py-2.5 px-3 text-left font-mono tabular-nums">
                    {maskCurrency(financialStatements.totalRevenue)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold">بهای تمام‌شده فروش</td>
                  <td className="py-2.5 px-3 text-slate-500">کسر به قلک احیای انبار ۵۰/۵۰</td>
                  <td className="py-2.5 px-3 text-left font-mono text-rose-700 tabular-nums">
                    {maskCurrency(accounts.find((a) => a.code === '5101')?.balance || 0)}
                  </td>
                </tr>
                <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
                  <td className="py-2.5 px-3 font-bold text-emerald-900 dark:text-emerald-300">
                    سود خالص قابل تقسیم دوره
                  </td>
                  <td className="py-2.5 px-3 text-emerald-700">توزیع ۷۰٪ / ۳۰٪ در کیف پول شرکا</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
                    {maskCurrency(financialStatements.netProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 4: DAILY JOURNAL ENTRIES LEDGER (Manual Journal Form + Void Action)
         ===================================================================== */}
      {activeSubTab === 'journal' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                دفتر اسناد روزنامه و هزینه‌ها ({journalEntries.length} سند ثبت‌شده)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ثبت اسناد دستی دوبل، تعدیلات مالی پایان ماه، استهلاک اموال، ثبت کارمزد و هزینه‌های تنخواه‌گردان
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onSaveJournalEntry && (
                <PolarisButton
                  size="slim"
                  primary
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setJournalDate(formatPersianDate(new Date()));
                    setJournalTitle('');
                    setJournalLines([
                      { id: 'l1', accountCode: '6101', accountName: accounts.find((a) => a.code === '6101')?.name || 'هزینه‌های جاری و عمومی', debit: 0, credit: 0, note: '' },
                      { id: 'l2', accountCode: '110103', accountName: accounts.find((a) => a.code === '110103')?.name || 'حساب نقدی (صندوق مغازه)', debit: 0, credit: 0, note: '' },
                    ]);
                    setIsJournalModalOpen(true);
                  }}
                >
                  + ثبت سند روزنامه دستی (Double Entry)
                </PolarisButton>
              )}
              <PolarisButton
                size="slim"
                icon={<Printer className="w-3.5 h-3.5" />}
                onClick={() => window.print()}
              >
                چاپ دفتر روزنامه
              </PolarisButton>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[520px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3">شماره سند</th>
                  <th className="py-2 px-3">تاریخ</th>
                  <th className="py-2 px-3">شرح سند</th>
                  <th className="py-2 px-3">جمع بدهکار / بستانکار</th>
                  <th className="py-2 px-3">وضعیت</th>
                  <th className="py-2 px-3 text-center">اقدامات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {journalEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      هیچ سند روزنامه‌ای ثبت نشده است. روی «ثبت سند روزنامه دستی» کلیک کنید.
                    </td>
                  </tr>
                ) : (
                  journalEntries.map((je) => (
                    <tr key={je.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {je.voucherNo}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums">{je.postingDate}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{je.title}</div>
                        {je.lines && je.lines.length > 0 && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {je.lines.map((l) => `${l.accountName} (${formatCurrency(l.debit || l.credit)} ت)`).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold tabular-nums">
                        {maskCurrency(je.totalDebit)}
                      </td>
                      <td className="py-2 px-3">
                        {je.docstatus === 2 ? (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 font-bold">
                            باطل‌شده
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-bold">
                            ثبت قطعی در دفتر کل
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {je.docstatus !== 2 && onCancelJournalEntry && (
                          <button
                            type="button"
                            title="ابطال سند و برگشت مبالغ به حساب‌ها"
                            onClick={() => {
                              if (confirm(`آیا از ابطال سند «${je.voucherNo}» اطمینان دارید؟ مبالغ به حساب‌های مربوطه برگشت داده خواهند شد.`)) {
                                onCancelJournalEntry(je.id);
                              }
                            }}
                            className="p-1 px-2.5 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            ابطال سند
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 5: TWO-TABLE MONTHLY FIXED EXPENSES REPORT (Read-Only IndexTable)
         ===================================================================== */}
      {activeSubTab === 'budget' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                جدول ۱: قالب‌های هزینه ثابت ماهانه ({recurringTemplates.length} مورد)
              </h3>
              <PolarisButton
                size="slim"
                icon={<Plus className="w-3 h-3" />}
                onClick={() => {
                  setNewTmplName('');
                  setNewTmplAmount('');
                  setIsAddTemplateModalOpen(true);
                }}
              >
                + تعریف هزینه ثابت جدید
              </PolarisButton>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-2.5">عنوان هزینه ثابت</th>
                    <th className="py-2 px-2.5">موعد</th>
                    <th className="py-2 px-2.5 text-left">مبلغ پیش‌فرض</th>
                    <th className="py-2 px-2.5 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recurringTemplates.map((tmpl) => (
                    <tr key={tmpl.id}>
                      <td className="py-2 px-2.5 font-semibold">{tmpl.name}</td>
                      <td className="py-2 px-2.5 font-mono tabular-nums">
                        روز {tmpl.dueDayOfMonth}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                        {maskCurrency(tmpl.defaultMonthlyAmount)}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <PolarisButtonGroup>
                          <PolarisButton
                            size="slim"
                            primary
                            onClick={() => {
                              setPayTmplId(tmpl.id);
                              setPayAmount(String(tmpl.defaultMonthlyAmount));
                              setIsPayExpenseModalOpen(true);
                            }}
                          >
                            پرداخت این ماه
                          </PolarisButton>
                          <PolarisButton
                            size="slim"
                            onClick={() => {
                              setEditTmplId(tmpl.id);
                              setEditTmplAmount(String(tmpl.defaultMonthlyAmount));
                              setIsEditTemplateModalOpen(true);
                            }}
                          >
                            ویرایش
                          </PolarisButton>
                        </PolarisButtonGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              جدول ۲: دفتر هزینه‌های قطعی قفل‌شده در تاریخچه (Monthly Expense Ledger)
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-2.5">ماه/سال</th>
                    <th className="py-2 px-2.5">عنوان هزینه</th>
                    <th className="py-2 px-2.5">شماره سند</th>
                    <th className="py-2 px-2.5">وضعیت</th>
                    <th className="py-2 px-2.5 text-left">مبلغ قطعی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlyExpenseLedger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        رکوردی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    monthlyExpenseLedger.map((rec) => (
                      <tr key={rec.id}>
                        <td className="py-2 px-2.5 font-mono font-bold tabular-nums">
                          {rec.monthYear}
                        </td>
                        <td className="py-2 px-2.5 font-semibold">{rec.expenseName}</td>
                        <td className="py-2 px-2.5 font-mono">{rec.voucherNo}</td>
                        <td className="py-2 px-2.5 text-emerald-700 font-semibold">
                          <span className="inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>قفل‌شده</span>
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                          {maskCurrency(rec.amount)}
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
          VIEW 6: THREE-BUCKET SHAREHOLDERS & FIXED ASSETS REPORT (Read-Only IndexTable)
         ===================================================================== */}
      {activeSubTab === 'assets' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  گزارش موتور ۳ قلک سهامداران (صندوق احیای انبار و کیف پول سود ۵۰/۵۰ شرکا)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تسهیم دقیق ۵۰٪ سود عملیاتی به کیف پول هر شریک بدون کسر سرمایه‌گذاری انبار
                </p>
              </div>
              <PolarisButtonGroup>
                <PolarisButton
                  size="slim"
                  primary
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setDrawingAmount('');
                    setDrawingNote('');
                    setIsDrawingModalOpen(true);
                  }}
                >
                  + ثبت برداشت سود شریک
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setInjectionAmount('');
                    setInjectionNote('');
                    setIsInjectionModalOpen(true);
                  }}
                >
                  + ثبت آورده نقدی شریک
                </PolarisButton>
              </PolarisButtonGroup>
            </div>

            {/* Net Profit & Expenses Waterfall Transparency Banner */}
            <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 dark:from-slate-800 dark:to-slate-850 p-3.5 rounded-xl border border-indigo-100 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>گردش سود خالص و تعیین مبالغ قابل برداشت شرکا (کسر اولویت‌دار هزینه‌ها)</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  درآمد ناخالص - COGS - کل هزینه‌های جاری و ثابت = سود خالص
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500">۱. فروش ناخالص</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {maskCurrency(threeBucketState.summaryMetrics?.totalSalesRevenue ?? 0)} ت
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-rose-500">۲. بهای تمام‌شده (COGS)</div>
                  <div className="font-mono font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                    -{maskCurrency(threeBucketState.summaryMetrics?.totalCogs ?? 0)} ت
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-amber-600">۳. هزینه‌های جاری و ثابت</div>
                  <div className="font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    -{maskCurrency((threeBucketState.summaryMetrics?.totalDailyExpenses ?? 0) + (threeBucketState.summaryMetrics?.totalMonthlyFixed ?? 0))} ت
                  </div>
                </div>
                <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">۴. سود خالص قطعی</div>
                  <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {maskCurrency(threeBucketState.netProfit)} ت
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <div className="text-[10px] text-indigo-600 font-semibold">قابل برداشت {shareholders[0]?.name || 'شریک ۱'}</div>
                  <div className="font-mono font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {maskCurrency(threeBucketState.partners[0]?.withdrawableBalance ?? 0)} ت
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <div className="text-[10px] text-indigo-600 font-semibold">قابل برداشت {shareholders[1]?.name || 'شریک ۲'}</div>
                  <div className="font-mono font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {maskCurrency(threeBucketState.partners[1]?.withdrawableBalance ?? 0)} ت
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">ردیف قلک / کیف پول سهامدار</th>
                    <th className="py-2 px-3">نسبت مالکیت / سود</th>
                    <th className="py-2 px-3">سهم سود خالص دوره (پس از کسر هزینه‌ها)</th>
                    <th className="py-2 px-3">آورده (+) / برداشت (-)</th>
                    <th className="py-2 px-3 text-slate-500">کیف پول انباشته</th>
                    <th className="py-2 px-3 text-left font-bold text-emerald-700 dark:text-emerald-400">مبلغ قابل برداشت (تومان)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-bold">
                      قلک ۱: صندوق احیای انبار (Capital Recovery Pool — کسر مستقیم COGS)
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">۵۰٪ / ۵۰٪</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      حق انبار (COGS): {maskCurrency(threeBucketState.inventoryRecoveryShare)}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      توسعه: {maskCurrency(threeBucketState.totalNewCapitalNeeded)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 tabular-nums">—</td>
                    <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {maskCurrency(
                        threeBucketState.bucket1InitialInventoryCapital +
                          threeBucketState.bucket1CurrentBalance
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold">
                      قلک ۲: کیف پول {shareholders[0]?.name || 'شریک اول (۵۰٪)'}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      سرمایه {shareholders[0]?.ownershipPercent ?? 50}% · سود{' '}
                      {shareholders[0]?.profitSharePercent ?? 50}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-700 tabular-nums">
                      +{maskCurrency(threeBucketState.partners[0]?.profitAllocated ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                      +{maskCurrency(threeBucketState.partners[0]?.personalCapitalInjected ?? 0)} / -{maskCurrency(threeBucketState.partners[0]?.withdrawals ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                      {maskCurrency(threeBucketState.partners[0]?.walletBalance ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {maskCurrency(threeBucketState.partners[0]?.withdrawableBalance ?? 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold">
                      قلک ۳: کیف پول {shareholders[1]?.name || 'شریک دوم (۵۰٪)'}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      سرمایه {shareholders[1]?.ownershipPercent ?? 50}% · سود{' '}
                      {shareholders[1]?.profitSharePercent ?? 50}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-700 tabular-nums">
                      +{maskCurrency(threeBucketState.partners[1]?.profitAllocated ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                      +{maskCurrency(threeBucketState.partners[1]?.personalCapitalInjected ?? 0)} / -{maskCurrency(threeBucketState.partners[1]?.withdrawals ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                      {maskCurrency(threeBucketState.partners[1]?.walletBalance ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {maskCurrency(threeBucketState.partners[1]?.withdrawableBalance ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Fixed Assets & Drawings Read-Only IndexTables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                فهرست اموال و دارایی‌های ثابت مغازه ({fixedAssets.length} مورد)
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-right border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2 px-2.5">کد</th>
                      <th className="py-2 px-2.5">نام دارایی</th>
                      <th className="py-2 px-2.5">طبقه</th>
                      <th className="py-2 px-2.5 text-left">ارزش خرید</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fixedAssets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-5 text-center text-slate-400">
                          موردی ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      fixedAssets.map((ast) => (
                        <tr key={ast.id}>
                          <td className="py-2 px-2.5 font-mono">{ast.assetTag}</td>
                          <td className="py-2 px-2.5 font-semibold">{ast.name}</td>
                          <td className="py-2 px-2.5">{ast.category}</td>
                          <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                            {maskCurrency(ast.purchaseValue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                تاریخچه برداشت‌های سود و Snapshot توافقات ({shareholderDrawings.length + shareholderSnapshots.length})
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-right border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2 px-2.5">تاریخ</th>
                      <th className="py-2 px-2.5">شریک</th>
                      <th className="py-2 px-2.5">شرح</th>
                      <th className="py-2 px-2.5 text-left">مبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {shareholderDrawings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-5 text-center text-slate-400">
                          برداشتی ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      shareholderDrawings.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2 px-2.5 font-mono tabular-nums">{d.date}</td>
                          <td className="py-2 px-2.5 font-semibold">{d.partnerName}</td>
                          <td className="py-2 px-2.5 text-slate-500">{d.note}</td>
                          <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                            {maskCurrency(d.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: MANUAL JOURNAL ENTRY (DOUBLE-ENTRY JOURNAL VOUCHER)
         ===================================================================== */}
      {isJournalModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsJournalModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-3xl p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    ثبت سند دوبل حسابداری (Journal Entry Voucher)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ثبت آرتیکل‌های بدهکار و بستانکار متوازن برای هزینه‌ها، تعدیلات، استهلاک و افتتاحیه
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsJournalModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Top metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  شماره سند
                </label>
                <input
                  type="text"
                  disabled
                  value={`JV-${activeFiscalYear}-${String(1001 + journalEntries.length).padStart(4, '0')}`}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold text-indigo-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  تاریخ ثبت (شمسی) *
                </label>
                <input
                  type="text"
                  required
                  value={journalDate}
                  onChange={(e) => setJournalDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  شرح کلی سند حسابداری *
                </label>
                <input
                  type="text"
                  required
                  value={journalTitle}
                  onChange={(e) => setJournalTitle(e.target.value)}
                  placeholder="مثلاً: ثبت هزینه استهلاک / اصلاح حساب..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            {/* Journal Lines Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-800/80 px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  سطرهای سند (آرتیکل‌های حسابداری)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setJournalLines((prev) => [
                      ...prev,
                      {
                        id: `l-${Date.now()}`,
                        accountCode: '',
                        accountName: '',
                        debit: 0,
                        credit: 0,
                        note: '',
                      },
                    ])
                  }
                  className="px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ افزودن سطر</span>
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">سرفصل حساب</th>
                      <th className="py-2 px-3">شرح آرتیکل</th>
                      <th className="py-2 px-3 text-left">بدهکار (تومان)</th>
                      <th className="py-2 px-3 text-left">بستانکار (تومان)</th>
                      <th className="py-2 px-2 text-center w-10">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {journalLines.map((line, index) => (
                      <tr key={line.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-3">
                          <select
                            value={line.accountCode}
                            onChange={(e) => {
                              const found = accounts.find((a) => a.code === e.target.value);
                              setJournalLines((prev) =>
                                prev.map((l, i) =>
                                  i === index
                                    ? {
                                        ...l,
                                        accountCode: e.target.value,
                                        accountName: found?.name || '',
                                      }
                                    : l
                                )
                              );
                            }}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          >
                            <option value="">انتخاب سرفصل حساب...</option>
                            {accounts.map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.code} — {a.name} ({a.category})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={line.note || ''}
                            onChange={(e) =>
                              setJournalLines((prev) =>
                                prev.map((l, i) =>
                                  i === index ? { ...l, note: e.target.value } : l
                                )
                              )
                            }
                            placeholder="شرح این ردیف..."
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </td>
                        <td className="py-2 px-3 text-left">
                          <CurrencyInput
                            value={line.debit || ''}
                            onChange={(val) => {
                              setJournalLines((prev) =>
                                prev.map((l, i) =>
                                  i === index ? { ...l, debit: val, credit: val > 0 ? 0 : l.credit } : l
                                )
                              );
                            }}
                            placeholder=""
                            className="w-28 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-left text-emerald-700 tabular-nums"
                          />
                        </td>
                        <td className="py-2 px-3 text-left">
                          <CurrencyInput
                            value={line.credit || ''}
                            onChange={(val) => {
                              setJournalLines((prev) =>
                                prev.map((l, i) =>
                                  i === index ? { ...l, credit: val, debit: val > 0 ? 0 : l.debit } : l
                                )
                              );
                            }}
                            placeholder=""
                            className="w-28 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-left text-rose-700 tabular-nums"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          {journalLines.length > 2 && (
                            <button
                              type="button"
                              onClick={() =>
                                setJournalLines((prev) => prev.filter((_, i) => i !== index))
                              }
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Balance Verification Bar */}
            {(() => {
              const totalDeb = journalLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
              const totalCred = journalLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
              const diff = Math.abs(totalDeb - totalCred);
              const isBalanced = diff === 0 && totalDeb > 0;

              return (
                <div
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-2 font-bold ${
                    isBalanced
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isBalanced ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                    )}
                    <span>
                      {isBalanced
                        ? `سند کاملاً متوازن است (مبلغ کل: ${formatCurrency(totalDeb)} تومان)`
                        : `سند نامتوازن است! اختلاف: ${formatCurrency(diff)} تومان`}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums">
                    <span>جمع بدهکار: {formatCurrency(totalDeb)} ت</span>
                    <span>جمع بستانکار: {formatCurrency(totalCred)} ت</span>
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setIsJournalModalOpen(false)}>
                انصراف
              </PolarisButton>
              {(() => {
                const totalDeb = journalLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                const totalCred = journalLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                const isBalanced = Math.abs(totalDeb - totalCred) === 0 && totalDeb > 0;
                const canSubmit = isBalanced && journalTitle.trim().length > 0 && journalLines.length >= 2 && journalLines.every((l) => Boolean(l.accountCode));

                return (
                  <PolarisButton
                    primary
                    disabled={!canSubmit}
                    onClick={() => {
                      if (!canSubmit) return;
                      const newJe: JournalEntryRecord = {
                        id: `je-${Date.now()}`,
                        voucherNo: `JV-${activeFiscalYear}-${String(1001 + journalEntries.length).padStart(4, '0')}`,
                        postingDate: journalDate,
                        docstatus: 1,
                        title: journalTitle.trim(),
                        branchDimension: defaultBranch,
                        totalDebit: totalDeb,
                        totalCredit: totalCred,
                        lines: journalLines.map((l, idx) => ({
                          id: `jel-${Date.now()}-${idx}`,
                          accountCode: l.accountCode,
                          accountName: l.accountName || accounts.find((a) => a.code === l.accountCode)?.name || l.accountCode,
                          debit: Number(l.debit) || 0,
                          credit: Number(l.credit) || 0,
                          note: l.note || journalTitle.trim(),
                        })),
                      };
                      onSaveJournalEntry?.(newJe);
                      setIsJournalModalOpen(false);
                    }}
                  >
                    ثبت نهایی و انتقال به دفاتر کل و معین
                  </PolarisButton>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: ADD ACCOUNT TO CHART OF ACCOUNTS (COA)
         ===================================================================== */}
      {isAddAccountModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsAddAccountModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                افزودن سرفصل جدید در درخت حساب‌ها
              </h3>
              <button
                type="button"
                onClick={() => setIsAddAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  حساب سرگروه (والد)
                </label>
                <select
                  value={newAccParentCode}
                  onChange={(e) => {
                    const pCode = e.target.value;
                    setNewAccParentCode(pCode);
                    const parent = accounts.find((a) => a.code === pCode);
                    if (parent) {
                      setNewAccCategory(parent.category as any);
                      setNewAccLevel(parent.level === 'کل' ? 'معین' : 'تفصیلی');
                      const siblings = accounts.filter((a) => a.parentCode === pCode);
                      setNewAccCode(`${pCode}${String(siblings.length + 1).padStart(2, '0')}`);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {accounts
                    .filter((a) => a.level === 'گروه' || a.level === 'کل' || a.level === 'معین')
                    .map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name} ({a.level})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    کد سرفصل حساب *
                  </label>
                  <input
                    type="text"
                    required
                    value={newAccCode}
                    onChange={(e) => setNewAccCode(e.target.value)}
                    placeholder="مثلاً: 110104"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    سطح حساب
                  </label>
                  <select
                    value={newAccLevel}
                    onChange={(e) => setNewAccLevel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="معین">معین</option>
                    <option value="تفصیلی">تفصیلی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام سرفصل حساب *
                </label>
                <input
                  type="text"
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="مثلاً: حساب درگاه پرداخت زرین‌پال"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  طبقه حساب
                </label>
                <select
                  value={newAccCategory}
                  onChange={(e) => setNewAccCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">انتخاب طبقه حساب...</option>
                  <option value="دارایی">دارایی</option>
                  <option value="بدهی">بدهی</option>
                  <option value="سرمایه">سرمایه</option>
                  <option value="درآمد">درآمد</option>
                  <option value="هزینه">هزینه</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setIsAddAccountModalOpen(false)}>
                انصراف
              </PolarisButton>
              <PolarisButton
                primary
                disabled={!newAccCode.trim() || !newAccName.trim() || !newAccCategory}
                onClick={() => {
                  if (!newAccCode.trim() || !newAccName.trim() || !newAccCategory) return;
                  const newAcc: AccountNode = {
                    id: `acc-${newAccCode.trim()}`,
                    code: newAccCode.trim(),
                    name: newAccName.trim(),
                    category: newAccCategory,
                    level: newAccLevel,
                    currency: 'IRR',
                    parentCode: newAccParentCode || undefined,
                    balance: 0,
                  };
                  onAddAccount?.(newAcc);
                  setIsAddAccountModalOpen(false);
                }}
              >
                ذخیره سرفصل در کدینگ
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: RECORD SHAREHOLDER DRAWING (ثبت برداشت سود شریک)
         ===================================================================== */}
      {isDrawingModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsDrawingModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                ثبت برداشت سود شریک
              </h3>
              <button
                type="button"
                onClick={() => setIsDrawingModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">انتخاب شریک *</label>
                <select
                  value={drawingPartnerId}
                  onChange={(e) => setDrawingPartnerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">انتخاب شریک...</option>
                  {shareholders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (سهم سود: {s.profitSharePercent}٪)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">مبلغ برداشت (تومان) *</label>
                <input
                  type="text"
                  required
                  value={drawingAmount ? formatLiveComma(drawingAmount) : ''}
                  onChange={(e) => setDrawingAmount(String(parseCommaNumber(e.target.value) || ''))}
                  onFocus={(e) => e.target.select()}
                  placeholder=""
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-left tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">حساب مبدا پرداخت *</label>
                <select
                  value={drawingAccountCode}
                  onChange={(e) => setDrawingAccountCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">انتخاب حساب مبدا پرداخت...</option>
                  <option value="110102">بانک / کارت بانکی مغازه (110102)</option>
                  <option value="110103">صندوق نقد مغازه (110103)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">بابت / توضیحات</label>
                <input
                  type="text"
                  value={drawingNote}
                  onChange={(e) => setDrawingNote(e.target.value)}
                  placeholder="مثلاً: برداشت علی‌الحساب سود آبان ماه"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setIsDrawingModalOpen(false)}>
                انصراف
              </PolarisButton>
              <PolarisButton
                primary
                disabled={!drawingPartnerId || !drawingAccountCode || parseCommaNumber(drawingAmount) <= 0}
                onClick={() => {
                  const amt = parseCommaNumber(drawingAmount);
                  if (!drawingPartnerId || !drawingAccountCode || amt <= 0) return;
                  onRecordShareholderDrawing?.({
                    partnerId: drawingPartnerId,
                    amount: amt,
                    paidFromAccountCode: drawingAccountCode,
                    note: drawingNote.trim() || 'برداشت سود سهامدار',
                  });
                  setIsDrawingModalOpen(false);
                }}
              >
                ثبت سند برداشت
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: RECORD SHAREHOLDER CAPITAL INJECTION (ثبت آورده نقدی شریک)
         ===================================================================== */}
      {isInjectionModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsInjectionModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                ثبت آورده نقدی و تزریق سرمایه شریک
              </h3>
              <button
                type="button"
                onClick={() => setIsInjectionModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">انتخاب شریک *</label>
                <select
                  value={injectionPartnerId}
                  onChange={(e) => setInjectionPartnerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">انتخاب شریک...</option>
                  {shareholders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (سرمایه: {s.ownershipPercent}٪)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">مبلغ آورده (تومان) *</label>
                <input
                  type="text"
                  required
                  value={injectionAmount ? formatLiveComma(injectionAmount) : ''}
                  onChange={(e) => setInjectionAmount(String(parseCommaNumber(e.target.value) || ''))}
                  onFocus={(e) => e.target.select()}
                  placeholder=""
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-left tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">واریز به حساب *</label>
                <select
                  value={injectionAccountCode}
                  onChange={(e) => setInjectionAccountCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">انتخاب حساب واریز...</option>
                  <option value="110102">بانک / کارت بانکی مغازه (110102)</option>
                  <option value="110103">صندوق نقد مغازه (110103)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">توضیحات</label>
                <input
                  type="text"
                  value={injectionNote}
                  onChange={(e) => setInjectionNote(e.target.value)}
                  placeholder="مثلاً: واریز نقدی جهت افزایش نقدینگی و شارژ انبار"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setIsInjectionModalOpen(false)}>
                انصراف
              </PolarisButton>
              <PolarisButton
                primary
                disabled={!injectionPartnerId || !injectionAccountCode || parseCommaNumber(injectionAmount) <= 0}
                onClick={() => {
                  const amt = parseCommaNumber(injectionAmount);
                  if (!injectionPartnerId || !injectionAccountCode || amt <= 0) return;
                  onRecordShareholderCapitalInjection?.({
                    partnerId: injectionPartnerId,
                    amount: amt,
                    toAccountCode: injectionAccountCode,
                    note: injectionNote.trim() || 'آورده نقدی شریک',
                  });
                  setIsInjectionModalOpen(false);
                }}
              >
                ثبت سند آورده نقدی
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD RECURRING EXPENSE TEMPLATE (تعریف قالب هزینه ثابت جدید)
         ===================================================================== */}
      {isAddTemplateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsAddTemplateModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                تعریف قالب هزینه ثابت ماهانه
              </h3>
              <button
                type="button"
                onClick={() => setIsAddTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">عنوان هزینه ثابت *</label>
                <input
                  type="text"
                  required
                  value={newTmplName}
                  onChange={(e) => setNewTmplName(e.target.value)}
                  placeholder="مثلاً: حقوق پرسنل یا بسته اینترنت"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold mb-1">مبلغ پیش‌فرض (تومان) *</label>
                  <input
                    type="text"
                    required
                    value={newTmplAmount ? formatLiveComma(newTmplAmount) : ''}
                    onChange={(e) => setNewTmplAmount(String(parseCommaNumber(e.target.value) || ''))}
                    onFocus={(e) => e.target.select()}
                    placeholder=""
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-left tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">روز سررسید در ماه *</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={newTmplDueDay}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Math.max(1, Math.min(31, Number(e.target.value)));
                      setNewTmplDueDay(val);
                    }}
                    placeholder="مثلاً: 1"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">حساب معین هزینه *</label>
                <select
                  value={newTmplAccountCode}
                  onChange={(e) => setNewTmplAccountCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">انتخاب حساب معین هزینه...</option>
                  <option value="5201">5201 - هزینه اجاره ماهانه مغازه</option>
                  <option value="5202">5202 - هزینه قبوض (برق، آب، اینترنت و تلفن)</option>
                  <option value="5203">5203 - هزینه شارژ پاساژ و ساختمان</option>
                  <option value="5204">5204 - هزینه‌های جاری مغازه (ملزومات، پیک، پذیرایی)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setIsAddTemplateModalOpen(false)}>
                انصراف
              </PolarisButton>
              <PolarisButton
                primary
                disabled={!newTmplName.trim() || !newTmplAccountCode || !newTmplDueDay || parseCommaNumber(newTmplAmount) <= 0}
                onClick={() => {
                  const amt = parseCommaNumber(newTmplAmount);
                  if (!newTmplName.trim() || !newTmplAccountCode || !newTmplDueDay || amt <= 0) return;
                  onAddRecurringTemplate?.({
                    code: `FIX-${String(recurringTemplates.length + 1).padStart(2, '0')}`,
                    name: newTmplName.trim(),
                    defaultMonthlyAmount: amt,
                    accountCode: newTmplAccountCode,
                    dueDayOfMonth: Number(newTmplDueDay) || 1,
                    costCenterName: newTmplCostCenter,
                  });
                  setIsAddTemplateModalOpen(false);
                }}
              >
                ذخیره قالب هزینه
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: PAY MONTHLY FIXED EXPENSE (پرداخت و ثبت قطعی ماه جاری)
         ===================================================================== */}
      {isPayExpenseModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsPayExpenseModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                پرداخت و قفل ماهانه هزینه ثابت
              </h3>
              <button
                type="button"
                onClick={() => setIsPayExpenseModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1">ماه و سال سررسید *</label>
                <input
                  type="text"
                  required
                  value={payMonthYear}
                  onChange={(e) => setPayMonthYear(e.target.value)}
                  placeholder="۱۴۰۴/۰۸"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">مبلغ پرداختی قطعی (تومان) *</label>
                <input
                  type="text"
                  required
                  value={payAmount ? formatLiveComma(payAmount) : ''}
                  onChange={(e) => setPayAmount(String(parseCommaNumber(e.target.value) || ''))}
                  onFocus={(e) => e.target.select()}
                  placeholder=""
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-left tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">پرداخت از حساب *</label>
                <select
                  value={payAccountCode}
                  onChange={(e) => setPayAccountCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">انتخاب حساب پرداخت...</option>
                  <option value="110102">بانک / کارت بانکی مغازه (110102)</option>
                  <option value="110103">صندوق نقد مغازه (110103)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1">یادداشت / پیگیری</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="مثلاً: واریز فیش شارژ با شماره پیگیری..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setIsPayExpenseModalOpen(false)}>
                انصراف
              </PolarisButton>
              <PolarisButton
                primary
                disabled={!payTmplId || !payMonthYear.trim() || !payAccountCode || parseCommaNumber(payAmount) <= 0}
                onClick={() => {
                  const amt = parseCommaNumber(payAmount);
                  if (!payTmplId || !payMonthYear.trim() || !payAccountCode || amt <= 0) return;
                  onRecordMonthlyFixedExpense?.({
                    templateId: payTmplId,
                    monthYear: payMonthYear,
                    amount: amt,
                    paidFromAccountCode: payAccountCode,
                    note: payNote.trim() || undefined,
                  });
                  setIsPayExpenseModalOpen(false);
                }}
              >
                ثبت و قفل پرداخت ماه
              </PolarisButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: EDIT RECURRING TEMPLATE AMOUNT (ویرایش مبلغ پیش‌فرض قالب)
         ===================================================================== */}
      {isEditTemplateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsEditTemplateModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm p-5 space-y-4 text-xs text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                ویرایش مبلغ پیش‌فرض قالب هزینه
              </h3>
              <button
                type="button"
                onClick={() => setIsEditTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">مبلغ جدید پیش‌فرض (تومان) *</label>
              <input
                type="text"
                required
                value={editTmplAmount ? formatLiveComma(editTmplAmount) : ''}
                onChange={(e) => setEditTmplAmount(String(parseCommaNumber(e.target.value) || ''))}
                onFocus={(e) => e.target.select()}
                placeholder=""
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-left tabular-nums"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <PolarisButton size="slim" onClick={() => setIsEditTemplateModalOpen(false)}>
                انصراف
              </PolarisButton>
              <PolarisButton
                primary
                disabled={!editTmplId || parseCommaNumber(editTmplAmount) <= 0}
                onClick={() => {
                  const amt = parseCommaNumber(editTmplAmount);
                  if (!editTmplId || amt <= 0) return;
                  onUpdateRecurringTemplateAmount?.(editTmplId, amt);
                  setIsEditTemplateModalOpen(false);
                }}
              >
                بروزرسانی مبلغ
              </PolarisButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
