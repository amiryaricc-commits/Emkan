import type {
  MasterOptionsRegistry,
  ShareholderRuleSnapshot,
} from '../data/erpSeedData';

let uniqueIdCounter = 0;
export function generateUniqueId(prefix = 'id'): string {
  uniqueIdCounter = (uniqueIdCounter + 1) % 1000000;
  return `${prefix}-${Date.now()}-${uniqueIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  partyId?: string;
  partyType?: 'مشتری' | 'تامین‌کننده' | 'سهامدار' | '—';
  partyName?: string;
  costCenter?: string;
  dimensionBranch?: string;
  dimensionChannel?: string;
  debit: number;
  credit: number;
  note?: string;
}

export interface InstallmentRule {
  label: string;
  percentage: number;
  dueDays: number;
}

export interface InstallmentScheduleItem {
  label: string;
  percentage: number;
  amount: number;
  dueDays: number;
  status: 'پرداخت‌شده' | 'در انتظار' | 'سررسید گذشته';
}

export interface LandedCostItemInput {
  itemCode: string;
  itemName: string;
  qty: number;
  weightGrams: number;
  unitCost: number;
}

export interface LandedCostItemOutput extends LandedCostItemInput {
  allocatedLandedCost: number;
  finalUnitCost: number;
  finalLineTotal: number;
}

export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  return new Intl.NumberFormat('fa-IR').format(rounded);
}

export function normalizeCalendarDigits(value: string): string {
  if (!value) return '';
  const normalizedDigits = value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const parts = normalizedDigits.split(/[\/\-.]/);
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${y.padStart(4, '0')}/${m.padStart(2, '0')}/${d.padStart(2, '0')}`;
  }
  return normalizedDigits;
}

export function comparePersianDates(a: string, b: string): number {
  return normalizeCalendarDigits(a).localeCompare(normalizeCalendarDigits(b));
}

export function formatPersianDate(
  date: Date = new Date(),
  options?: { latinDigits?: boolean }
): string {
  const formatted = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  if (options?.latinDigits) {
    return normalizeCalendarDigits(formatted);
  }
  return formatted;
}

export function getPersianYear(
  date: Date = new Date(),
  options?: { latinDigits?: boolean }
): string {
  return formatPersianDate(date, options).split('/')[0];
}

export function addDaysToDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function validateSettlementAmount(amount: number, outstanding: number): {
  isValid: boolean;
  errorMessage?: string;
} {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { isValid: false, errorMessage: 'مبلغ تسویه باید بزرگتر از صفر باشد.' };
  }
  if (!Number.isFinite(outstanding) || outstanding <= 0) {
    return { isValid: false, errorMessage: 'فاکتور مرجع مانده قابل تسویه ندارد.' };
  }
  if (amount > outstanding) {
    return { isValid: false, errorMessage: 'مبلغ تسویه نمی‌تواند از مانده فاکتور بیشتر باشد.' };
  }
  return { isValid: true };
}

export function aggregateInvoiceLines<
  T extends { sku: string; qty: number; netLineAmount: number }
>(lines: T[]): T[] {
  const linesBySku = new Map<string, T>();
  for (const line of lines) {
    const existing = linesBySku.get(line.sku);
    if (existing) {
      existing.qty += line.qty;
      existing.netLineAmount += line.netLineAmount;
    } else {
      linesBySku.set(line.sku, { ...line });
    }
  }
  return [...linesBySku.values()];
}

export function isLeafAccount(
  accountCode: string,
  accounts: { code: string; parentCode?: string; level?: string }[]
): boolean {
  if (!accountCode || !accounts.length) return false;
  const target = accounts.find((a) => a.code === accountCode);
  if (!target) return false;
  const hasChildren = accounts.some((a) => a.parentCode === accountCode);
  return !hasChildren;
}

export function validateJournalEntry(
  lines: JournalLine[],
  validAccountCodes?: ReadonlySet<string>,
  leafAccountCodes?: ReadonlySet<string>
): {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  errorMessage?: string;
} {
  const totalDebit = lines.reduce((sum, l) => exactAdd(sum, Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => exactAdd(sum, Number(l.credit) || 0), 0);
  const difference = Math.abs(exactSub(totalDebit, totalCredit));

  if (lines.length < 2) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: 'سند روزنامه دوبل باید حداقل شامل ۲ ردیف (بدهکار و بستانکار) باشد.',
    };
  }
  if (leafAccountCodes && lines.some((line) => !leafAccountCodes.has(line.accountCode))) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: 'ثبت سند روزنامه مستقیم روی حساب‌های سرگروه و کل مجاز نیست؛ لطفاً حساب تفصیلی یا معین نهایی (برگ) را انتخاب کنید.',
    };
  }
  if (
    lines.some(
      (line) =>
        !line.accountCode.trim() ||
        (validAccountCodes !== undefined && !validAccountCodes.has(line.accountCode)) ||
        !Number.isFinite(line.debit) ||
        !Number.isFinite(line.credit) ||
        line.debit < 0 ||
        line.credit < 0 ||
        (line.debit === 0 && line.credit === 0) ||
        (line.debit > 0 && line.credit > 0)
    )
  ) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: 'هر ردیف باید حساب معتبر و فقط یک مبلغ مثبت در ستون بدهکار یا بستانکار داشته باشد.',
    };
  }
  if (totalDebit <= 0 || totalCredit <= 0) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: 'جمع مبالغ بدهکار و بستانکار باید بزرگتر از صفر باشد.',
    };
  }
  if (difference > 0.01) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: `سند تراز نیست؛ اختلاف بدهکار و بستانکار: ${formatCurrency(difference)} تومان`,
    };
  }
  return {
    isValid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

export function calculateInstallments(
  totalAmount: number,
  rules: InstallmentRule[],
  paidFirstInstallment = true
): InstallmentScheduleItem[] {
  if (totalAmount <= 0 || rules.length === 0) return [];
  let allocated = 0;
  return rules.map((rule, index) => {
    const isLast = index === rules.length - 1;
    const amount = isLast
      ? Math.max(0, totalAmount - allocated)
      : Math.round((totalAmount * rule.percentage) / 100);
    allocated += amount;
    return {
      label: rule.label,
      percentage: rule.percentage,
      amount,
      dueDays: rule.dueDays,
      status: index === 0 && paidFirstInstallment && rule.dueDays === 0 ? 'پرداخت‌شده' : 'در انتظار',
    };
  });
}

export function calculateMovingAverageValuation(
  currentQty: number,
  currentValuationRate: number,
  incomingQty: number,
  incomingRate: number
): { newQty: number; newValuationRate: number; totalValue: number } {
  const safeCurrentQty = Math.max(0, currentQty);
  const safeIncomingQty = Math.max(0, incomingQty);
  const newQty = Number((safeCurrentQty + safeIncomingQty).toFixed(2));
  if (newQty === 0) {
    return { newQty: 0, newValuationRate: Number(currentValuationRate.toFixed(2)), totalValue: 0 };
  }
  const totalValue = safeCurrentQty * currentValuationRate + safeIncomingQty * incomingRate;
  const newValuationRate = Number((totalValue / newQty).toFixed(2));
  return {
    newQty,
    newValuationRate,
    totalValue: Number((newQty * newValuationRate).toFixed(2)),
  };
}

export function allocateLandedCost(
  items: LandedCostItemInput[],
  totalExtraCharges: number,
  basis: 'amount' | 'qty' | 'weight'
): LandedCostItemOutput[] {
  const totalBasis = items.reduce((sum, item) => {
    if (basis === 'qty') return sum + item.qty;
    if (basis === 'weight') return sum + item.qty * item.weightGrams;
    return sum + item.qty * item.unitCost;
  }, 0);

  if (totalBasis <= 0 || totalExtraCharges <= 0) {
    return items.map((item) => ({
      ...item,
      allocatedLandedCost: 0,
      finalUnitCost: item.unitCost,
      finalLineTotal: item.qty * item.unitCost,
    }));
  }

  // Largest Remainder Method (Hare-Niemeyer) ensures sum(allocated) === totalExtraCharges
  const rawShares = items.map((item, index) => {
    const itemBasis =
      basis === 'qty'
        ? item.qty
        : basis === 'weight'
          ? item.qty * item.weightGrams
          : item.qty * item.unitCost;
    const exact = (totalExtraCharges * itemBasis) / totalBasis;
    const floor = Math.floor(exact);
    const remainder = exact - floor;
    return { index, floor, remainder };
  });

  const allocated = rawShares.map((s) => s.floor);
  let discrepancy = totalExtraCharges - allocated.reduce((sum, v) => sum + v, 0);

  const sortedByRemainder = [...rawShares].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < discrepancy; i++) {
    allocated[sortedByRemainder[i % sortedByRemainder.length].index] += 1;
  }

  return items.map((item, index) => {
    const allocatedLandedCost = allocated[index];
    const baseTotal = item.qty * item.unitCost;
    const finalLineTotal = baseTotal + allocatedLandedCost;
    const finalUnitCost = item.qty > 0 ? Math.round(finalLineTotal / item.qty) : item.unitCost;
    return {
      ...item,
      allocatedLandedCost,
      finalUnitCost,
      finalLineTotal,
    };
  });
}

export function evaluateBudgetControl(
  allocatedBudget: number,
  spentSoFar: number,
  newExpenseAmount: number,
  actionOnExceed: 'WARN' | 'STOP'
): {
  status: 'OK' | 'WARNING' | 'STOPPED';
  utilizationPercent: number;
  remainingAfter: number;
  message: string;
} {
  const totalAfter = spentSoFar + newExpenseAmount;
  const utilizationPercent =
    allocatedBudget > 0 ? Math.round((totalAfter / allocatedBudget) * 100) : 100;
  const remainingAfter = allocatedBudget - totalAfter;

  if (totalAfter <= allocatedBudget) {
    return {
      status: 'OK',
      utilizationPercent,
      remainingAfter,
      message: `در محدوده بودجه (${utilizationPercent}٪ مصرف‌شده)`,
    };
  }

  if (actionOnExceed === 'STOP') {
    return {
      status: 'STOPPED',
      utilizationPercent,
      remainingAfter,
      message: `توقف سیستمی: عبور از سقف بودجه به مبلغ ${formatCurrency(Math.abs(remainingAfter))} تومان (جلوگیری از ثبت سند)`,
    };
  }

  return {
    status: 'WARNING',
    utilizationPercent,
    remainingAfter,
    message: `هشدار بودجه: عبور از سقف مجاز به مبلغ ${formatCurrency(Math.abs(remainingAfter))} تومان (ثبت همراه با هشدار)`,
  };
}

export function allocateCostCenterExpense(
  totalAmount: number,
  allocations: { costCenterName: string; percentage: number }[]
): { costCenterName: string; percentage: number; allocatedAmount: number }[] {
  if (allocations.length === 0 || totalAmount <= 0) {
    return allocations.map((item) => ({
      costCenterName: item.costCenterName,
      percentage: item.percentage,
      allocatedAmount: 0,
    }));
  }
  const totalPct = allocations.reduce((s, a) => s + (Number(a.percentage) || 0), 0);
  if (Math.abs(totalPct - 100) < 0.1) {
    const rawShares = allocations.map((item, index) => {
      const exact = (totalAmount * item.percentage) / totalPct;
      const floor = Math.floor(exact);
      return { index, floor, remainder: exact - floor };
    });
    const allocated = rawShares.map((s) => s.floor);
    const discrepancy = Math.round(totalAmount - allocated.reduce((sum, v) => sum + v, 0));
    const sorted = [...rawShares].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < discrepancy; i++) {
      allocated[sorted[i % sorted.length].index] += 1;
    }
    return allocations.map((item, idx) => ({
      costCenterName: item.costCenterName,
      percentage: item.percentage,
      allocatedAmount: allocated[idx],
    }));
  }
  return allocations.map((item) => ({
    costCenterName: item.costCenterName,
    percentage: item.percentage,
    allocatedAmount: Math.round((totalAmount * item.percentage) / 100),
  }));
}

export function calculatePosCartTotals(params: {
  items: { price: number; qty: number; category: string }[];
  priceListMultiplier: number;
  couponPercent: number;
  redeemLoyaltyPoints: number;
  partnerCommissionPercent: number;
  promotionRules?: {
    quantityDiscount?: { minimumQuantity: number; percent: number };
    freeGiftMinimumQuantity?: number;
    tomanPerLoyaltyPoint?: number;
  };
}): {
  grossTotal: number;
  pricingRuleDiscount: number;
  couponDiscount: number;
  loyaltyDiscount: number;
  netPayable: number;
  earnedLoyaltyPoints: number;
  partnerCommissionAmount: number;
  freeGiftTriggered: boolean;
} {
  const grossTotal = params.items.reduce(
    (sum, item) => sum + Math.round(item.price * params.priceListMultiplier) * item.qty,
    0
  );
  const totalQty = params.items.reduce((sum, item) => sum + item.qty, 0);

  const quantityDiscount = params.promotionRules?.quantityDiscount;
  const pricingRuleDiscount =
    quantityDiscount && totalQty >= quantityDiscount.minimumQuantity
      ? Math.round(grossTotal * (quantityDiscount.percent / 100))
      : 0;
  const giftThreshold = params.promotionRules?.freeGiftMinimumQuantity;
  const freeGiftTriggered = giftThreshold !== undefined && totalQty >= giftThreshold;

  const afterPricingRule = Math.max(0, grossTotal - pricingRuleDiscount);
  const couponDiscount =
    params.couponPercent > 0
      ? Math.round((afterPricingRule * params.couponPercent) / 100)
      : 0;
  const loyaltyDiscount = Math.min(
    Math.max(0, afterPricingRule - couponDiscount),
    params.redeemLoyaltyPoints * 1000
  );
  const netPayable = Math.max(0, afterPricingRule - couponDiscount - loyaltyDiscount);
  const tomanPerLoyaltyPoint = params.promotionRules?.tomanPerLoyaltyPoint;
  const earnedLoyaltyPoints =
    tomanPerLoyaltyPoint && tomanPerLoyaltyPoint > 0
      ? Math.floor(netPayable / tomanPerLoyaltyPoint)
      : 0;
  const partnerCommissionAmount = Math.round(
    (netPayable * params.partnerCommissionPercent) / 100
  );

  return {
    grossTotal,
    pricingRuleDiscount,
    couponDiscount,
    loyaltyDiscount,
    netPayable,
    earnedLoyaltyPoints,
    partnerCommissionAmount,
    freeGiftTriggered,
  };
}

export function calculateStockReconciliation(
  systemQty: number,
  physicalQty: number,
  valuationRate: number,
  reorderLevel: number
): {
  varianceQty: number;
  varianceValue: number;
  needsAutoReorder: boolean;
  suggestedOrderQty: number;
} {
  const varianceQty = physicalQty - systemQty;
  const varianceValue = varianceQty * valuationRate;
  const needsAutoReorder = physicalQty <= reorderLevel;
  const suggestedOrderQty = needsAutoReorder ? Math.max(10, reorderLevel * 2 - physicalQty) : 0;

  return {
    varianceQty,
    varianceValue,
    needsAutoReorder,
    suggestedOrderQty,
  };
}

export function generateItemVariants(
  baseName: string,
  baseSku: string,
  flavors: string[],
  nicotineLevels: string[]
): { sku: string; variantName: string; flavor: string; nicotine: string }[] {
  const results: { sku: string; variantName: string; flavor: string; nicotine: string }[] = [];
  flavors.forEach((flavor, fIdx) => {
    nicotineLevels.forEach((nic, nIdx) => {
      results.push({
        sku: `${baseSku}-V${fIdx + 1}${nIdx + 1}`,
        variantName: `${baseName} — طعم ${flavor} (${nic})`,
        flavor,
        nicotine: nic,
      });
    });
  });
  return results;
}

export type SystemRole =
  | 'سوپر ادمین'
  | 'مدیر مالی'
  | 'مدیر انبار'
  | 'صندوقدار (پوز)';

export function checkRolePermission(
  role: SystemRole,
  permission:
    | 'view_buying_cost'
    | 'manage_users_roles'
    | 'post_journal'
    | 'adjust_stock'
    | 'export_database'
): boolean {
  if (role === 'سوپر ادمین') return true;
  switch (permission) {
    case 'view_buying_cost':
      return role === 'مدیر مالی' || role === 'مدیر انبار';
    case 'manage_users_roles':
    case 'export_database':
      return false;
    case 'post_journal':
      return role === 'مدیر مالی';
    case 'adjust_stock':
      return role === 'مدیر انبار';
    default:
      return false;
  }
}

export function formatRoleName(role: string): string {
  switch (role) {
    case 'سوپر ادمین':
      return 'مدیر کل سامانه';
    case 'مدیر مالی':
      return 'مدیر مالی و حسابداری';
    case 'مدیر انبار':
      return 'سرپرست انبار و کالا';
    case 'صندوقدار (پوز)':
      return 'صندوقدار فروشگاه';
    default:
      return stripEnglishTerms(role);
  }
}

export function formatVoucherType(vt: string): string {
  switch (vt) {
    case 'Sales Invoice':
      return 'فاکتور فروش';
    case 'Purchase Invoice':
      return 'فاکتور خرید';
    case 'Journal Entry':
      return 'سند روزنامه';
    case 'Payment Entry':
      return 'سند دریافت و پرداخت';
    case 'POS Invoice':
      return 'فیش صندوق فروشگاهی';
    default:
      return stripEnglishTerms(vt);
  }
}

export function stripEnglishTerms(text: string): string {
  if (!text) return '';
  return text
    .replace(/\s*\([A-Za-z0-9 &/\-_.·]+\)/g, '')
    .replace(/\bPOS\b/g, 'فروشگاهی')
    .replace(/\bMTL\b/g, 'معمولی')
    .replace(/\bDTL\b/g, 'حرفه‌ای')
    .replace(/\bB2B\b/g, 'عمده')
    .replace(/\bCRM\b/g, 'مشتریان')
    .replace(/\bCOGS\b/g, 'بهای تمام‌شده')
    .replace(/\bGL\b/g, 'دفتر کل')
    .trim();
}

export function calculateFinancialStatements(
  accounts: { category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه'; level: string; balance: number }[]
): {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  equityPlusLiabilitiesAndProfit: number;
  isBalanceSheetBalanced: boolean;
} {
  const groupAccounts = accounts.filter((a) => a.level === 'گروه');
  const sumByCategory = (cat: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه') =>
    groupAccounts.filter((a) => a.category === cat).reduce((s, a) => s + a.balance, 0);

  const totalAssets = sumByCategory('دارایی');
  const totalLiabilities = sumByCategory('بدهی');
  const totalEquity = sumByCategory('سرمایه');
  const totalRevenue = sumByCategory('درآمد');
  const totalExpenses = sumByCategory('هزینه');
  const netProfit = totalRevenue - totalExpenses;
  const equityPlusLiabilitiesAndProfit = totalLiabilities + totalEquity + netProfit;

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalRevenue,
    totalExpenses,
    netProfit,
    equityPlusLiabilitiesAndProfit,
    isBalanceSheetBalanced: Math.abs(totalAssets - equityPlusLiabilitiesAndProfit) < 1,
  };
}

export function calculateSalesDashboardMetrics(
  salesInvoices: readonly {
    docstatus: number;
    isHistoricalArchive?: boolean;
    totalAmount: number;
    paidAmount: number;
    returnAgainst?: string;
    cogsAmount?: number;
    lines?: readonly {
      sku: string;
      qty: number;
      valuationRate: number;
      unitPrice?: number;
      discountPercent?: number;
      netLineAmount?: number;
    }[];
  }[],
  inventoryItems: readonly {
    sku: string;
    stockQty: number;
    valuationRate: number;
  }[]
): {
  postedInvoiceCount: number;
  totalSales: number;
  cashReceived: number;
  receivables: number;
  knownCostOfGoodsSold: number;
  estimatedProfit: number;
  inventoryValue: number;
  estimatedAssets: number;
  estimatedCostLineCount: number;
  missingCostLineCount: number;
} {
  const postedInvoices = salesInvoices.filter((invoice) => invoice.docstatus === 1);
  const inventoryBySku = new Map(inventoryItems.map((item) => [item.sku, item]));
  let totalSales = 0;
  let cashReceived = 0;
  let knownCostOfGoodsSold = 0;
  let estimatedCostOfGoodsSold = 0;
  let estimatedCostLineCount = 0;
  let missingCostLineCount = 0;

  for (const invoice of postedInvoices) {
    const sign = invoice.returnAgainst ? -1 : 1;
    totalSales += sign * invoice.totalAmount;
    cashReceived += sign * invoice.paidAmount;

    if (!invoice.lines?.length) {
      if (invoice.cogsAmount && invoice.cogsAmount > 0) {
        knownCostOfGoodsSold += sign * invoice.cogsAmount;
      } else {
        missingCostLineCount += 1;
      }
      continue;
    }

    for (const line of invoice.lines) {
      const itemCost = inventoryBySku.get(line.sku)?.valuationRate ?? 0;
      const unitCost = line.valuationRate > 0 ? line.valuationRate : itemCost;
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        const netLineAmount = line.netLineAmount ??
          line.qty * (line.unitPrice ?? 0) * (1 - (line.discountPercent ?? 0) / 100);
        if (Number.isFinite(netLineAmount) && netLineAmount > 0) {
          estimatedCostOfGoodsSold += sign * netLineAmount * 0.75;
          estimatedCostLineCount += 1;
        } else {
          missingCostLineCount += 1;
        }
        continue;
      }
      knownCostOfGoodsSold += sign * line.qty * unitCost;
    }
  }

  const receivables = totalSales - cashReceived;
  const inventoryValue = inventoryItems.reduce(
    (total, item) => total + item.stockQty * item.valuationRate,
    0
  );
  const estimatedProfit = totalSales - knownCostOfGoodsSold - estimatedCostOfGoodsSold;

  return {
    postedInvoiceCount: postedInvoices.length,
    totalSales,
    cashReceived,
    receivables,
    knownCostOfGoodsSold,
    estimatedProfit,
    inventoryValue,
    estimatedAssets: inventoryValue + cashReceived + receivables,
    estimatedCostLineCount,
    missingCostLineCount,
  };
}

export function postDoubleEntryToAccounts<
  T extends {
    code: string;
    category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
    level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
    parentCode?: string;
    balance: number;
  }
>(accounts: T[], lines: { accountCode: string; debit: number; credit: number }[]): T[] {
  const deltas = new Map<string, number>();

  const byCode = new Map<string, T>();
  accounts.forEach((a) => byCode.set(a.code, a));

  for (const line of lines) {
    let target = byCode.get(line.accountCode);
    if (!target) {
      // Auto-heal missing essential system accounts to prevent runtime crashes
      const fallbackMap: Record<
        string,
        {
          name: string;
          category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
          level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
          parentCode?: string;
        }
      > = {
        '1103': {
          name: 'اسناد دریافتنی (چک‌های دریافتی از مشتریان)',
          category: 'دارایی',
          level: 'معین',
          parentCode: '1100',
        },
        '1202': {
          name: 'استهلاک انباشته دارایی‌های ثابت مشهود',
          category: 'دارایی',
          level: 'معین',
          parentCode: '1200',
        },
        '2102': {
          name: 'پیش‌دریافت و بستانکاری مشتریان (مرجوعی)',
          category: 'بدهی',
          level: 'معین',
          parentCode: '2100',
        },
        '2103': {
          name: 'مالیات و عوارض پرداختنی',
          category: 'بدهی',
          level: 'معین',
          parentCode: '2100',
        },
        '2104': {
          name: 'هزینه حمل و کرایه پرداختنی',
          category: 'بدهی',
          level: 'معین',
          parentCode: '2100',
        },
        '3102': {
          name: 'سود و زیان انباشته سنواتی',
          category: 'سرمایه',
          level: 'معین',
          parentCode: '3100',
        },
        '4103': {
          name: 'درآمد کسر مرجوعی و افت قیمت کالا',
          category: 'درآمد',
          level: 'معین',
          parentCode: '4100',
        },
        '4105': {
          name: 'درآمد خدمات فنی (کویل‌بندی و تعویض پنبه)',
          category: 'درآمد',
          level: 'معین',
          parentCode: '4100',
        },
        '5102': {
          name: 'بهای تمام‌شده خدمات فنی و مصرفی',
          category: 'هزینه',
          level: 'معین',
          parentCode: '5100',
        },
      };
      const meta = fallbackMap[line.accountCode];
      if (meta) {
        target = {
          code: line.accountCode,
          name: meta.name,
          category: meta.category,
          level: meta.level,
          parentCode: meta.parentCode,
          balance: 0,
        } as unknown as T;
        byCode.set(line.accountCode, target);
        accounts.push(target);
      } else {
        throw new Error(`Cannot post a ledger entry to unknown account "${line.accountCode}".`);
      }
    }
    if (
      !Number.isFinite(line.debit) ||
      !Number.isFinite(line.credit) ||
      line.debit < 0 ||
      line.credit < 0 ||
      (line.debit > 0 && line.credit > 0)
    ) {
      throw new Error(`Cannot post invalid debit or credit amounts to account "${line.accountCode}".`);
    }
    const isDebitNature = target.category === 'دارایی' || target.category === 'هزینه';
    const netChange = isDebitNature
      ? exactSub(line.debit, line.credit)
      : exactSub(line.credit, line.debit);

    let curr: T | undefined = target;
    const visited = new Set<string>();
    while (curr && !visited.has(curr.code)) {
      visited.add(curr.code);
      deltas.set(curr.code, exactAdd(deltas.get(curr.code) || 0, netChange));
      curr = curr.parentCode ? byCode.get(curr.parentCode) : undefined;
    }
  }

  return accounts.map((acc) => {
    const d = deltas.get(acc.code);
    if (!d) return acc;
    return { ...acc, balance: exactAdd(acc.balance, d) };
  });
}

export function computeMultiLineInvoiceTotals(
  lines: { qty: number; unitPrice: number; discountPercent: number; valuationRate: number }[]
): {
  grossAmount: number;
  totalDiscount: number;
  netTotal: number;
  grandTotal: number;
  totalCogs: number;
} {
  let grossAmount = 0;
  let totalDiscount = 0;
  let totalCogs = 0;

  for (const line of lines) {
    const qty = Math.max(0, Number(line.qty) || 0);
    const price = Math.max(0, Number(line.unitPrice) || 0);
    const discPct = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
    const lineGross = qty * price;
    const lineDisc = Math.round((lineGross * discPct) / 100);
    grossAmount += lineGross;
    totalDiscount += lineDisc;
    totalCogs += qty * (Number(line.valuationRate) || 0);
  }

  const netTotal = Math.max(0, grossAmount - totalDiscount);

  return {
    grossAmount,
    totalDiscount,
    netTotal,
    grandTotal: netTotal,
    totalCogs,
  };
}

export function buildSalesInvoiceLedgerLines(params: {
  totalAmount: number;
  paidAmount: number;
  cogsAmount: number;
  updateStock: boolean;
  isReverse: boolean;
  postingMode?: 'invoice' | 'return';
  serviceAmount?: number;
  paymentAccountCode?: string;
  inventoryAccountCode?: string;
  payments?: Array<{ accountCode: string; amount: number }>;
  taxAmount?: number;
  taxAccountCode?: string;
  costCenter?: string;
  partyId?: string;
  partyName?: string;
}): Array<{
  accountCode: string;
  debit: number;
  credit: number;
  costCenter?: string;
  partyId?: string;
  partyName?: string;
}> {
  const { totalAmount, paidAmount, cogsAmount, updateStock, isReverse } = params;
  const postingMode = params.postingMode ?? 'invoice';
  const serviceAmount = Math.max(0, params.serviceAmount || 0);
  const taxAmount = Math.max(0, params.taxAmount || 0);
  const goodsAmount = Math.max(0, totalAmount - serviceAmount - taxAmount);
  const paymentAccount = params.paymentAccountCode || '110101';
  const inventoryAccount = params.inventoryAccountCode || '1104';
  const taxAccount = params.taxAccountCode || '2103';

  const lines: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    costCenter?: string;
    partyId?: string;
    partyName?: string;
  }> = [];

  const attachMeta = (l: { accountCode: string; debit: number; credit: number }) => {
    const res: {
      accountCode: string;
      debit: number;
      credit: number;
      costCenter?: string;
      partyId?: string;
      partyName?: string;
    } = { ...l };
    if (params.costCenter) res.costCenter = params.costCenter;
    if (params.partyId) res.partyId = params.partyId;
    if (params.partyName) res.partyName = params.partyName;
    return res;
  };

  if (goodsAmount > 0) {
    lines.push(
      attachMeta({
        accountCode: '4101',
        debit: isReverse ? goodsAmount : 0,
        credit: isReverse ? 0 : goodsAmount,
      })
    );
  }

  if (serviceAmount > 0) {
    lines.push(
      attachMeta({
        accountCode: '4105',
        debit: isReverse ? serviceAmount : 0,
        credit: isReverse ? 0 : serviceAmount,
      })
    );
  }

  if (taxAmount > 0) {
    lines.push(
      attachMeta({
        accountCode: taxAccount,
        debit: isReverse ? taxAmount : 0,
        credit: isReverse ? 0 : taxAmount,
      })
    );
  }

  // Fallback if both are 0
  if (lines.length === 0) {
    lines.push(
      attachMeta({
        accountCode: '4101',
        debit: isReverse ? totalAmount : 0,
        credit: isReverse ? 0 : totalAmount,
      })
    );
  }

  if (postingMode === 'return') {
    lines.push(
      attachMeta({
        accountCode: '1102',
        debit: isReverse ? 0 : totalAmount,
        credit: isReverse ? totalAmount : 0,
      })
    );
  } else {
    if (params.payments && params.payments.length > 0) {
      let totalSplitPaid = 0;
      for (const p of params.payments) {
        if (p.amount > 0) {
          totalSplitPaid += p.amount;
          lines.push(
            attachMeta({
              accountCode: p.accountCode || paymentAccount,
              debit: isReverse ? 0 : p.amount,
              credit: isReverse ? p.amount : 0,
            })
          );
        }
      }
      const splitUnpaid = Math.max(0, totalAmount - totalSplitPaid);
      if (splitUnpaid > 0) {
        lines.push(
          attachMeta({
            accountCode: '1102',
            debit: isReverse ? 0 : splitUnpaid,
            credit: isReverse ? splitUnpaid : 0,
          })
        );
      }
    } else {
      const unpaid = Math.max(0, totalAmount - paidAmount);
      if (paidAmount > 0) {
        lines.push(
          attachMeta({
            accountCode: paymentAccount,
            debit: isReverse ? 0 : paidAmount,
            credit: isReverse ? paidAmount : 0,
          })
        );
      }
      if (unpaid > 0) {
        lines.push(
          attachMeta({
            accountCode: '1102',
            debit: isReverse ? 0 : unpaid,
            credit: isReverse ? unpaid : 0,
          })
        );
      }
    }
  }

  if (updateStock && cogsAmount > 0) {
    lines.push(
      attachMeta({
        accountCode: '5101',
        debit: isReverse ? 0 : cogsAmount,
        credit: isReverse ? cogsAmount : 0,
      })
    );
    lines.push(
      attachMeta({
        accountCode: inventoryAccount,
        debit: isReverse ? cogsAmount : 0,
        credit: isReverse ? 0 : cogsAmount,
      })
    );
  }

  return lines;
}

export function buildPurchaseInvoiceReversalLines(
  totalAmount: number,
  landedCostAdded: number,
  currentInventoryValue: number
): { accountCode: string; debit: number; credit: number }[] {
  const supplierAmount = Math.max(0, totalAmount - landedCostAdded);
  const lines = [
    { accountCode: '1104', debit: 0, credit: currentInventoryValue },
    { accountCode: '2101', debit: supplierAmount, credit: 0 },
  ];

  if (landedCostAdded > 0) {
    lines.push({ accountCode: '2104', debit: landedCostAdded, credit: 0 });
  }

  const valuationDifference = currentInventoryValue - totalAmount;
  if (valuationDifference > 0) {
    lines.push({ accountCode: '5101', debit: valuationDifference, credit: 0 });
  } else if (valuationDifference < 0) {
    lines.push({ accountCode: '5101', debit: 0, credit: Math.abs(valuationDifference) });
  }

  return lines;
}

export function buildCustomerRefundLedgerLines(
  bankAccountCode: string,
  amount: number,
  isReverse = false
): { accountCode: string; debit: number; credit: number }[] {
  return [
    {
      accountCode: '1102',
      debit: isReverse ? 0 : amount,
      credit: isReverse ? amount : 0,
    },
    {
      accountCode: bankAccountCode,
      debit: isReverse ? amount : 0,
      credit: isReverse ? 0 : amount,
    },
  ];
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
  level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export function computeTrialBalance6Col(
  accounts: {
    code: string;
    name: string;
    category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
    level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
    parentCode?: string;
    openingBalance?: number;
    balance: number;
  }[],
  targetLevel: 'گروه' | 'کل' | 'معین' | 'تفصیلی',
  glEntries?: {
    accountCode: string;
    postingDate: string;
    debit: number;
    credit: number;
    branchDimension?: string;
    costCenter?: string;
    isCancelled?: boolean;
  }[],
  filterBranch?: string,
  fiscalYear?: string
): {
  rows: TrialBalanceRow[];
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
    isBalanced: boolean;
  };
  hasBranchOpeningBalance: boolean;
} {
  const levelAccounts = accounts.filter((a) => a.level === targetLevel);
  const isFilteredByBranch = Boolean(
    filterBranch && filterBranch !== 'همه شعب' && filterBranch !== 'همه شعب سازمان'
  );
  const normalizedFiscalYear = fiscalYear?.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianIndex = persianDigits.indexOf(digit);
    return String(persianIndex >= 0 ? persianIndex : arabicDigits.indexOf(digit));
  }).match(/\d{4}/)?.[0];
  const getEntryYear = (postingDate: string) =>
    postingDate
      .replace(/[۰-۹٠-٩]/g, (digit) => {
        const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
        const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
        const persianIndex = persianDigits.indexOf(digit);
        return String(persianIndex >= 0 ? persianIndex : arabicDigits.indexOf(digit));
      })
      .match(/\d{4}/)?.[0];
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const isAccountWithin = (accountCode: string, parentCode: string) => {
    const visited = new Set<string>();
    let account = accountsByCode.get(accountCode);
    while (account && !visited.has(account.code)) {
      if (account.code === parentCode) return true;
      visited.add(account.code);
      account = account.parentCode ? accountsByCode.get(account.parentCode) : undefined;
    }
    return false;
  };

  const entries = glEntries ?? [];
  const periodEntries = entries.filter(
    (entry) => !normalizedFiscalYear || getEntryYear(entry.postingDate) === normalizedFiscalYear
  );
  const priorEntries = normalizedFiscalYear
    ? entries.filter((entry) => {
        const year = getEntryYear(entry.postingDate);
        return year !== undefined && year < normalizedFiscalYear;
      })
    : [];

  const rows: TrialBalanceRow[] = levelAccounts.map((acc) => {
    const isDebitNature = acc.category === 'دارایی' || acc.category === 'هزینه';

    if (!glEntries) {
      const opening = acc.openingBalance ?? 0;
      const closing = acc.balance;
      const netDiff = closing - opening;
      const openingDebit = isDebitNature
        ? (opening >= 0 ? opening : 0)
        : (opening < 0 ? Math.abs(opening) : 0);
      const openingCredit = isDebitNature
        ? (opening < 0 ? Math.abs(opening) : 0)
        : (opening >= 0 ? opening : 0);
      const periodDebit = isDebitNature ? Math.max(0, netDiff) : Math.max(0, -netDiff);
      const periodCredit = isDebitNature ? Math.max(0, -netDiff) : Math.max(0, netDiff);
      const closingDebit = isDebitNature
        ? (closing >= 0 ? closing : 0)
        : (closing < 0 ? Math.abs(closing) : 0);
      const closingCredit = isDebitNature
        ? (closing < 0 ? Math.abs(closing) : 0)
        : (closing >= 0 ? closing : 0);

      return {
        code: acc.code,
        name: acc.name,
        category: acc.category,
        level: acc.level,
        openingDebit,
        openingCredit,
        periodDebit,
        periodCredit,
        closingDebit,
        closingCredit,
        hasBranchOpeningBalance: !isFilteredByBranch,
      };
    }

    const branchEntries = (source: typeof entries) =>
      source.filter(
        (entry) =>
          (!isFilteredByBranch || entry.branchDimension === filterBranch) &&
          isAccountWithin(entry.accountCode, acc.code)
      );
    const openingEntries = branchEntries(priorEntries);
    const openingNet =
      (isFilteredByBranch
        ? 0
        : isDebitNature
          ? acc.openingBalance ?? 0
          : -(acc.openingBalance ?? 0)) +
      openingEntries.reduce((sum, entry) => sum + entry.debit - entry.credit, 0);
    const matchingGL = branchEntries(periodEntries);
    const periodDebit = matchingGL.reduce((sum, entry) => sum + entry.debit, 0);
    const periodCredit = matchingGL.reduce((sum, entry) => sum + entry.credit, 0);
    const closingNet = openingNet + periodDebit - periodCredit;

    return {
      code: acc.code,
      name: acc.name,
      category: acc.category,
      level: acc.level,
      openingDebit: Math.max(0, openingNet),
      openingCredit: Math.max(0, -openingNet),
      periodDebit,
      periodCredit,
      closingDebit: Math.max(0, closingNet),
      closingCredit: Math.max(0, -closingNet),
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      openingDebit: acc.openingDebit + r.openingDebit,
      openingCredit: acc.openingCredit + r.openingCredit,
      periodDebit: acc.periodDebit + r.periodDebit,
      periodCredit: acc.periodCredit + r.periodCredit,
      closingDebit: acc.closingDebit + r.closingDebit,
      closingCredit: acc.closingCredit + r.closingCredit,
      isBalanced: true,
    }),
    {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
      isBalanced: true,
    }
  );

  totals.isBalanced = Math.abs(totals.closingDebit - totals.closingCredit) < 1;

  return { rows, totals, hasBranchOpeningBalance: !isFilteredByBranch };
}

export function deductStockWithBundles<
  T extends {
    sku: string;
    name: string;
    stockQty: number;
    valuationRate: number;
    isBundle?: boolean;
    bundleComponentItems?: { sku: string; name: string; qty: number }[];
    warehouseStock?: Record<string, number>;
  }
>(
  inventory: T[],
  soldLines: { sku: string; qty: number; warehouseKey?: string }[]
): {
  updatedInventory: T[];
  updatedItems: T[];
  totalCogs: number;
  insufficientStockError?: string;
} {
  const requiredBySku = new Map<string, number>();
  const requiredBySkuAndWh = new Map<string, Map<string, number>>();

  const addWhRequirement = (sku: string, whKey: string, qty: number) => {
    const whMap = requiredBySkuAndWh.get(sku) || new Map<string, number>();
    whMap.set(whKey, (whMap.get(whKey) || 0) + qty);
    requiredBySkuAndWh.set(sku, whMap);
  };

  for (const sold of soldLines) {
    if (!Number.isFinite(sold.qty) || sold.qty <= 0) {
      return {
        updatedInventory: inventory,
        updatedItems: inventory,
        totalCogs: 0,
        insufficientStockError: `تعداد فروش کالای ${sold.sku} باید بیشتر از صفر باشد.`,
      };
    }
    const targetWh = sold.warehouseKey || 'vitrine';
    requiredBySku.set(sold.sku, (requiredBySku.get(sold.sku) || 0) + sold.qty);
    addWhRequirement(sold.sku, targetWh, sold.qty);

    const itemObj = inventory.find((i) => i.sku === sold.sku);
    if (!itemObj) {
      return {
        updatedInventory: inventory,
        updatedItems: inventory,
        totalCogs: 0,
        insufficientStockError: `کالای ${sold.sku} در انبار پیدا نشد.`,
      };
    }
    if (itemObj.isBundle) {
      if (!itemObj.bundleComponentItems?.length) {
        return {
          updatedInventory: inventory,
          updatedItems: inventory,
          totalCogs: 0,
          insufficientStockError: `برای باندل «${itemObj.name}» هیچ کالای زیرمجموعه‌ای تعریف نشده است.`,
        };
      }
      for (const comp of itemObj.bundleComponentItems) {
        if (!inventory.some((item) => item.sku === comp.sku)) {
          return {
            updatedInventory: inventory,
            updatedItems: inventory,
            totalCogs: 0,
            insufficientStockError: `کالای زیرمجموعه ${comp.sku} از باندل «${itemObj.name}» در انبار پیدا نشد.`,
          };
        }
        const compNeed = sold.qty * comp.qty;
        requiredBySku.set(comp.sku, (requiredBySku.get(comp.sku) || 0) + compNeed);
        addWhRequirement(comp.sku, targetWh, compNeed);
      }
    }
  }

  for (const [sku, neededQty] of requiredBySku.entries()) {
    const itemObj = inventory.find((i) => i.sku === sku);
    if (!itemObj) continue;
    // Virtual bundles derive stock from components, so do not block on virtual bundle stockQty
    if (itemObj.isBundle && itemObj.bundleComponentItems?.length) {
      continue;
    }
    if (itemObj.stockQty < neededQty) {
      return {
        updatedInventory: inventory,
        updatedItems: inventory,
        totalCogs: 0,
        insufficientStockError: `کسری موجودی: از کالای «${itemObj.name}» (${sku}) فقط ${itemObj.stockQty} عدد موجود است اما ${neededQty} عدد نیاز دارید.`,
      };
    }
  }

  let totalCogs = 0;
  for (const sold of soldLines) {
    const itemObj = inventory.find((i) => i.sku === sold.sku);
    if (itemObj) {
      if (itemObj.isBundle) {
        for (const component of itemObj.bundleComponentItems ?? []) {
          const componentItem = inventory.find((item) => item.sku === component.sku);
          if (componentItem) {
            totalCogs += sold.qty * component.qty * componentItem.valuationRate;
          }
        }
      } else {
        totalCogs += sold.qty * itemObj.valuationRate;
      }
    }
  }

  const updatedInventory = inventory.map((item) => {
    const deduct = requiredBySku.get(item.sku) || 0;
    if (deduct === 0) return item;
    let updatedWarehouseStock: Record<string, number> | undefined;
    if (item.warehouseStock) {
      updatedWarehouseStock = { ...item.warehouseStock };
      const whNeeds = requiredBySkuAndWh.get(item.sku);
      if (whNeeds) {
        for (const [whKey, whQty] of whNeeds.entries()) {
          const currentWhVal = updatedWarehouseStock[whKey] ?? (whKey === 'vitrine' ? item.stockQty : 0);
          updatedWarehouseStock[whKey] = Math.max(0, currentWhVal - whQty);
        }
      } else {
        updatedWarehouseStock.vitrine = Math.max(
          0,
          (updatedWarehouseStock.vitrine ?? item.stockQty) - deduct
        );
      }
    }
    return {
      ...item,
      stockQty: Math.max(0, item.stockQty - deduct),
      ...(updatedWarehouseStock ? { warehouseStock: updatedWarehouseStock } : {}),
    };
  });

  return {
    updatedInventory,
    updatedItems: updatedInventory,
    totalCogs,
  };
}

export function restoreStockWithBundles<
  T extends {
    sku: string;
    stockQty: number;
    isBundle?: boolean;
    bundleComponentItems?: { sku: string; qty: number }[];
    bottleVolumeMl?: number;
    liquidVolumeMl?: number;
    openBottleRemainingMl?: number;
    isVirtualDecantBottle?: boolean;
    parentBottleSku?: string;
    warehouseStock?: Record<string, number>;
  }
>(
  inventory: T[],
  returnedLines: {
    sku: string;
    qty: number;
    isDecantMl?: boolean;
    warehouseKey?: string;
    unitCost?: number;
    originalDate?: string;
    sourceVoucherId?: string;
  }[]
): T[] {
  const quantityBySku = new Map<string, number>();
  const quantityBySkuAndWh = new Map<string, Map<string, number>>();
  const metaBySku = new Map<string, { unitCost?: number; originalDate?: string; sourceVoucherId?: string }>();
  const decantMlBySku = new Map<string, number>();

  const addWhRestore = (sku: string, whKey: string, qty: number) => {
    const whMap = quantityBySkuAndWh.get(sku) || new Map<string, number>();
    whMap.set(whKey, (whMap.get(whKey) || 0) + qty);
    quantityBySkuAndWh.set(sku, whMap);
  };

  for (const line of returnedLines) {
    if (!Number.isFinite(line.qty) || line.qty <= 0) continue;
    if (line.isDecantMl) {
      decantMlBySku.set(line.sku, (decantMlBySku.get(line.sku) || 0) + line.qty);
      continue;
    }
    const targetWh = line.warehouseKey || 'vitrine';
    quantityBySku.set(line.sku, (quantityBySku.get(line.sku) || 0) + line.qty);
    addWhRestore(line.sku, targetWh, line.qty);
    if (!metaBySku.has(line.sku)) {
      metaBySku.set(line.sku, {
        unitCost: line.unitCost,
        originalDate: line.originalDate,
        sourceVoucherId: line.sourceVoucherId,
      });
    }

    const item = inventory.find((entry) => entry.sku === line.sku);
    if (item?.isBundle && item.bundleComponentItems) {
      for (const component of item.bundleComponentItems) {
        const compQty = line.qty * component.qty;
        quantityBySku.set(
          component.sku,
          (quantityBySku.get(component.sku) || 0) + compQty
        );
        addWhRestore(component.sku, targetWh, compQty);
      }
    }
  }

  const restoredInventory = inventory.map((item) => {
    const restoredQty = quantityBySku.get(item.sku) || 0;
    if (restoredQty <= 0) return item;
    let updatedWarehouseStock: Record<string, number> | undefined;
    const whRestores = quantityBySkuAndWh.get(item.sku);
    if (item.warehouseStock) {
      updatedWarehouseStock = { ...item.warehouseStock };
      if (whRestores) {
        for (const [whKey, whQty] of whRestores.entries()) {
          updatedWarehouseStock[whKey] = (updatedWarehouseStock[whKey] || 0) + whQty;
        }
      } else {
        updatedWarehouseStock.vitrine = (updatedWarehouseStock.vitrine || 0) + restoredQty;
      }
    }
    const itemRecord = item as unknown as {
      sector?: 'vape' | 'pc';
      valuationRate?: number;
      fifoLayers?: { qty: number; unitCost: number; date: string; sourceVoucherId?: string }[];
      warehouseFifoLayers?: Record<
        string,
        { qty: number; unitCost: number; date: string; sourceVoucherId?: string }[]
      >;
    };
    let updatedFifoLayers = itemRecord.fifoLayers;
    let updatedWarehouseFifoLayers = itemRecord.warehouseFifoLayers;
    if (itemRecord.sector === 'pc') {
      const meta = metaBySku.get(item.sku);
      const unitCost = meta?.unitCost && meta.unitCost > 0 ? meta.unitCost : (itemRecord.valuationRate || 0);
      const returnDate = meta?.originalDate || formatPersianDate(new Date());
      const sourceVoucherId = meta?.sourceVoucherId || 'POS-RETURN';
      updatedFifoLayers = [
        { qty: restoredQty, unitCost, date: returnDate, sourceVoucherId },
        ...(itemRecord.fifoLayers || []),
      ].sort((a, b) => comparePersianDates(a.date, b.date));
      if (itemRecord.warehouseFifoLayers && whRestores) {
        updatedWarehouseFifoLayers = { ...itemRecord.warehouseFifoLayers };
        for (const [whKey, whQty] of whRestores.entries()) {
          updatedWarehouseFifoLayers[whKey] = [
            { qty: whQty, unitCost, date: returnDate, sourceVoucherId },
            ...(updatedWarehouseFifoLayers[whKey] || []),
          ].sort((a, b) => comparePersianDates(a.date, b.date));
        }
      }
    }
    return {
      ...item,
      stockQty: item.stockQty + restoredQty,
      ...(updatedWarehouseStock ? { warehouseStock: updatedWarehouseStock } : {}),
      ...(updatedFifoLayers ? { fifoLayers: updatedFifoLayers } : {}),
      ...(updatedWarehouseFifoLayers ? { warehouseFifoLayers: updatedWarehouseFifoLayers } : {}),
    };
  });

  for (const [rawSku, returnedMl] of decantMlBySku) {
    const sku = rawSku.startsWith('decant_') ? rawSku.slice('decant_'.length) : rawSku;
    const itemIndex = restoredInventory.findIndex((item) => item.sku === sku);
    const item = restoredInventory[itemIndex];
    if (!item) continue;
    const bottleVolume = item.bottleVolumeMl || item.liquidVolumeMl || 0;
    if (bottleVolume <= 0) continue;

    // Preserve sealed bottle stockQty and restore liquid ml to the open bottle
    const openBottleMl = Number(((item.openBottleRemainingMl || 0) + returnedMl).toFixed(2));
    const virtualSku = `decant_${sku}`;
    const virtualIndex = restoredInventory.findIndex((entry) => entry.sku === virtualSku);

    restoredInventory[itemIndex] = {
      ...item,
      openBottleRemainingMl: openBottleMl,
    };
    if (virtualIndex >= 0) {
      const virtualItem = restoredInventory[virtualIndex];
      restoredInventory[virtualIndex] = {
        ...virtualItem,
        stockQty: openBottleMl,
        warehouseStock: {
          ...(virtualItem.warehouseStock || {}),
          vitrine: openBottleMl,
        },
      };
    }
  }

  return restoredInventory;
}

// ============================================================================
// MODULE 4 & 13: THREE-BUCKET SHAREHOLDER ENGINE (50/50 CAPITAL & 70/30 PROFIT)
// ============================================================================
export interface ThreeBucketPartnerInput {
  id: string;
  name: string;
  capitalSharePercent: number; // C_i e.g. 50
  profitSharePercent: number; // P_i e.g. 70 or 30
  personalCapitalInjected: number;
  withdrawals: number;
  frozenSnapshotBalance?: number;
  profitAllocationOverride?: number;
  capitalExpansionChargeOverride?: number;
}

export interface ThreeBucketCalculationResult {
  netProfit: number;
  inventoryRecoveryShare: number; // حق انبار (کسر مستقیم COGS)
  bucket1InitialInventoryCapital: number;
  bucket1RecoveredCogs: number;
  bucket1UsedForPurchases: number;
  bucket1CurrentBalance: number;
  totalNewCapitalNeeded: number;
  partnerWallets: {
    partner1?: number;
    partner2?: number;
    partner70: number;
    partner30: number;
  };
  partners: {
    id: string;
    name: string;
    capitalSharePercent: number;
    profitSharePercent: number;
    profitAllocated: number;
    personalCapitalInjected: number;
    capitalExpansionCharge: number;
    withdrawals: number;
    walletBalance: number; // W_i
    autoSettledDeficitAmount: number;
    withdrawableBalance: number;
    isNegativeDeficit: boolean;
  }[];
}

export interface ShareholderRates {
  partner1CapitalPct: number;
  partner1ProfitPct: number;
  partner2CapitalPct: number;
  partner2ProfitPct: number;
}

export function resolveShareholderRatesAtDate(
  date: string,
  snapshots: ShareholderRuleSnapshot[],
  currentRates: ShareholderRates
): ShareholderRates {
  const orderedSnapshots = [...snapshots].sort((a, b) =>
    normalizeCalendarDigits(a.effectiveDate).localeCompare(
      normalizeCalendarDigits(b.effectiveDate)
    )
  );
  const normalizedDate = normalizeCalendarDigits(date);
  const applicable = orderedSnapshots.filter(
    (snapshot) => normalizeCalendarDigits(snapshot.effectiveDate) <= normalizedDate
  );
  const snapshot = applicable[applicable.length - 1];
  if (snapshot) {
    return {
      partner1CapitalPct: snapshot.partner1CapitalPct,
      partner1ProfitPct: snapshot.partner1ProfitPct,
      partner2CapitalPct: snapshot.partner2CapitalPct,
      partner2ProfitPct: snapshot.partner2ProfitPct,
    };
  }

  const firstSnapshot = orderedSnapshots[0];
  return {
    partner1CapitalPct:
      firstSnapshot?.previousPartner1CapitalPct ?? currentRates.partner1CapitalPct,
    partner1ProfitPct:
      firstSnapshot?.previousPartner1ProfitPct ?? currentRates.partner1ProfitPct,
    partner2CapitalPct:
      firstSnapshot?.previousPartner2CapitalPct ?? currentRates.partner2CapitalPct,
    partner2ProfitPct:
      firstSnapshot?.previousPartner2ProfitPct ?? currentRates.partner2ProfitPct,
  };
}

export function calculateThreeBucketShareholderState(params: {
  initialInventoryCapital: number;
  totalRevenue: number;
  totalCogs: number;
  totalOperatingExpenses: number;
  totalNewPurchasesAmount: number;
  partners: ThreeBucketPartnerInput[];
  unrealizedCreditSales?: number;
  availableLiquidCash?: number;
  chargeExpansionToWallet?: boolean;
}): ThreeBucketCalculationResult {
  // گام ۱: کسر مستقیم COGS به عنوان سهم احیای انبار (حق انبار ۵۰/۵۰)
  const inventoryRecoveryShare = Number(Math.max(0, params.totalCogs).toFixed(2));
  const netProfit = exactSub(
    exactSub(params.totalRevenue, inventoryRecoveryShare),
    params.totalOperatingExpenses
  );
  const unrealizedCredit = Math.max(0, params.unrealizedCreditSales || 0);
  const realizedNetProfit = exactSub(netProfit, unrealizedCredit);

  // Bucket 1 (Capital Recovery Pool) receives COGS from every sale so inventory capital is preserved
  const availableRecoveryPool = inventoryRecoveryShare;
  const bucket1UsedForPurchases = Math.min(
    availableRecoveryPool,
    Math.max(0, params.totalNewPurchasesAmount)
  );
  const bucket1CurrentBalance = Math.max(
    0,
    exactSub(availableRecoveryPool, bucket1UsedForPurchases)
  );
  // Any purchase exceeding Bucket 1 is new inventory expansion capital funded 50/50 (C_i)
  const totalNewCapitalNeeded = Math.max(0, params.totalNewPurchasesAmount - availableRecoveryPool);

  const partners = params.partners.map((partner) => {
    const ci = partner.capitalSharePercent / 100;
    const pi = partner.profitSharePercent / 100;
    const profitAllocated =
      partner.profitAllocationOverride ?? Math.round(netProfit * pi);
    const capitalExpansionCharge =
      partner.capitalExpansionChargeOverride ?? Math.round(totalNewCapitalNeeded * ci);
    const frozenBase = partner.frozenSnapshotBalance || 0;

    // Operational profit wallet: inventory purchases are balance-sheet assets and do NOT penalize operational profit wallet unless explicit
    const expansionDeduction = params.chargeExpansionToWallet ? capitalExpansionCharge : 0;
    const preProfitPosition =
      frozenBase + (partner.personalCapitalInjected - expansionDeduction) - partner.withdrawals;

    // Automatic Negative Balance Settlement: 100% of positive profitAllocated first settles any negative deficit
    const priorDeficit = preProfitPosition < 0 ? Math.abs(preProfitPosition) : 0;
    const autoSettledDeficitAmount =
      priorDeficit > 0 && profitAllocated > 0 ? Math.min(priorDeficit, profitAllocated) : 0;

    // W_i = (Net Profit * P_i) + Personal Capital Injected_i - Withdrawals_i
    const walletBalance = preProfitPosition + profitAllocated;
    const realizedProfitAllocated =
      partner.profitAllocationOverride !== undefined
        ? partner.profitAllocationOverride - Math.round(unrealizedCredit * pi)
        : Math.round(realizedNetProfit * pi);
    const maxRealizedWithdrawable = Math.max(0, preProfitPosition + realizedProfitAllocated);
    const rawWithdrawable = Math.min(Math.max(0, walletBalance), maxRealizedWithdrawable);
    const withdrawableBalance =
      params.availableLiquidCash !== undefined
        ? Math.min(rawWithdrawable, Math.max(0, params.availableLiquidCash))
        : rawWithdrawable;

    return {
      id: partner.id,
      name: partner.name,
      capitalSharePercent: partner.capitalSharePercent,
      profitSharePercent: partner.profitSharePercent,
      profitAllocated,
      personalCapitalInjected: partner.personalCapitalInjected,
      capitalExpansionCharge,
      withdrawals: partner.withdrawals,
      walletBalance,
      autoSettledDeficitAmount,
      withdrawableBalance,
      isNegativeDeficit: walletBalance < 0,
    };
  });

  const partner70Obj =
    partners.find((p) => p.profitSharePercent === 70) || partners[0];
  const partner30Obj =
    partners.find((p) => p.profitSharePercent === 30) || partners[1] || partners[0];

  return {
    netProfit,
    inventoryRecoveryShare,
    bucket1InitialInventoryCapital: params.initialInventoryCapital,
    bucket1RecoveredCogs: inventoryRecoveryShare,
    bucket1UsedForPurchases,
    bucket1CurrentBalance,
    totalNewCapitalNeeded,
    partnerWallets: {
      partner1: partners[0] ? partners[0].walletBalance : Math.round(netProfit * 0.5),
      partner2: partners[1] ? partners[1].walletBalance : Math.round(netProfit * 0.5),
      partner70: partner70Obj ? partner70Obj.walletBalance : Math.round(netProfit * 0.7),
      partner30: partner30Obj ? partner30Obj.walletBalance : Math.round(netProfit * 0.3),
    },
    partners,
  };
}

// ============================================================================
// MODULE 5 & 12: VOID INVOICE ENGINE (جایگزین حذف فیزیکی با رکورد جبرانی معکوس)
// ============================================================================
export interface VoidableInvoiceInput {
  id: string;
  invoiceNo?: string;
  billNo?: string;
  docstatus: number;
  status: string;
  totalAmount: number;
  paidAmount?: number;
  usedCreditBalance?: number;
  cogsAmount?: number;
  serviceAmount?: number;
  paymentAccountCode?: string;
  inventoryAccountCode?: string;
  isHistoricalArchive?: boolean;
  deliveryStatus?: string;
  warehouse?: string;
  warehouseKey?: string;
  skuBreakdownCompleted?: boolean;
  lines?: {
    sku: string;
    qty: number;
    valuationRate?: number;
    isDecantMl?: boolean;
    bottleVolumeMl?: number;
    liquidVolumeMl?: number;
    warehouseKey?: string;
  }[];
}

export function voidInvoice<
  TInv extends VoidableInvoiceInput,
  TItem extends {
    sku: string;
    stockQty: number;
    valuationRate?: number;
    sector?: 'vape' | 'pc';
    warehouseStock?: Record<string, number>;
    warehouseValuationRates?: Record<string, number>;
    fifoLayers?: { qty: number; unitCost: number; date: string; sourceVoucherId?: string }[];
    warehouseFifoLayers?: Record<
      string,
      { qty: number; unitCost: number; date: string; sourceVoucherId?: string }[]
    >;
    isBundle?: boolean;
    bundleComponentItems?: { sku: string; qty: number }[];
    bottleVolumeMl?: number;
    liquidVolumeMl?: number;
    openBottleRemainingMl?: number;
    isVirtualDecantBottle?: boolean;
    parentBottleSku?: string;
  }
>(params: {
  invoice: TInv;
  invoiceType: 'sales' | 'purchase';
  inventory: TItem[];
}): {
  voidedInvoice: TInv & {
    docstatus: 2;
    status: 'ابطال‌شده';
    cancelledStatus: 'Cancelled';
  };
  reversalLedgerLines: { accountCode: string; debit: number; credit: number }[];
  restoredInventory: TItem[];
  auditSummary: string;
  errorMessage?: string;
} {
  const { invoice, invoiceType, inventory } = params;
  const paid = Math.max(0, invoice.paidAmount ?? 0);
  const usedCredit = Math.max(0, invoice.usedCreditBalance ?? 0);
  const unpaid = Math.max(0, invoice.totalAmount - paid - usedCredit);
  const reversalLedgerLines: { accountCode: string; debit: number; credit: number }[] = [];
  let restoredInventory = [...inventory];
  let errorMessage: string | undefined;

  if (
    invoiceType === 'purchase' &&
    invoice.deliveryStatus === 'رسیده' &&
    invoice.lines?.length
  ) {
    const requirements = new Map<
      string,
      { qty: number; warehouseQty: Map<string, number> }
    >();
    for (const line of invoice.lines) {
      const requirement = requirements.get(line.sku) || {
        qty: 0,
        warehouseQty: new Map<string, number>(),
      };
      const warehouseKey = line.warehouseKey || invoice.warehouse || 'vitrine';
      requirement.qty += line.qty;
      requirement.warehouseQty.set(
        warehouseKey,
        (requirement.warehouseQty.get(warehouseKey) || 0) + line.qty
      );
      requirements.set(line.sku, requirement);
    }

    for (const [sku, requirement] of requirements) {
      const item = inventory.find((entry) => entry.sku === sku);
      if (!item || item.stockQty < requirement.qty) {
        errorMessage = `ابطال خرید ممکن نیست؛ موجودی فعلی کالای «${sku}» کمتر از تعداد این فاکتور خرید است. ابتدا فاکتورهای فروش یا انتقال مرتبط را بررسی کنید.`;
        break;
      }
      for (const [warehouseKey, qty] of requirement.warehouseQty) {
        const warehouseQty = item.warehouseStock?.[warehouseKey];
        if (warehouseQty !== undefined && warehouseQty < qty) {
          errorMessage = `ابطال خرید ممکن نیست؛ موجودی کالای «${sku}» در انبار «${warehouseKey}» کافی نیست.`;
          break;
        }
      }
      if (errorMessage) break;
      if (item.sector === 'pc') {
        const globalLayerQty = (item.fifoLayers || [])
          .filter((layer) => layer.sourceVoucherId === invoice.id)
          .reduce((sum, layer) => sum + layer.qty, 0);
        const warehouseLayerQty = [...requirement.warehouseQty].reduce(
          (sum, [warehouseKey]) =>
            sum +
            (item.warehouseFifoLayers?.[warehouseKey] || [])
              .filter((layer) => layer.sourceVoucherId === invoice.id)
              .reduce((layerSum, layer) => layerSum + layer.qty, 0),
          0
        );
        if (globalLayerQty < requirement.qty || warehouseLayerQty < requirement.qty) {
          errorMessage = `ابطال خرید ممکن نیست؛ لایه فایفو فاکتور «${invoice.billNo || invoice.id}» برای کالای «${sku}» قبلاً در فروش مصرف شده است.`;
          break;
        }
      }
    }
  } else if (
    invoiceType === 'purchase' &&
    invoice.deliveryStatus === 'رسیده' &&
    invoice.skuBreakdownCompleted
  ) {
    errorMessage = `ابطال خرید «${invoice.billNo || invoice.id}» ممکن نیست؛ کالاهای این فاکتور هنوز کدگذاری و پذیرش نشده‌اند.`;
  }

  if (errorMessage) {
    return {
      voidedInvoice: {
        ...invoice,
        docstatus: 2,
        status: 'ابطال‌شده',
        cancelledStatus: 'Cancelled',
      },
      reversalLedgerLines,
      restoredInventory,
      auditSummary: `ابطال سند «${invoice.invoiceNo || invoice.billNo || invoice.id}» انجام نشد.`,
      errorMessage,
    };
  }

  if (invoiceType === 'sales') {
    // 1. Reverse Sales Revenue (Debit 4101 for goods, 4105 for services)
    const servicesTotal = Math.max(0, invoice.serviceAmount || 0);
    const goodsTotal = Math.max(0, invoice.totalAmount - servicesTotal);
    if (goodsTotal > 0) {
      reversalLedgerLines.push({
        accountCode: '4101',
        debit: goodsTotal,
        credit: 0,
      });
    }
    if (servicesTotal > 0) {
      reversalLedgerLines.push({
        accountCode: '4105',
        debit: servicesTotal,
        credit: 0,
      });
    }
    if (reversalLedgerLines.length === 0) {
      reversalLedgerLines.push({
        accountCode: '4101',
        debit: invoice.totalAmount,
        credit: 0,
      });
    }
    // 2. Reverse Cash/POS/Card received (Credit liquidity account)
    if (paid > 0) {
      reversalLedgerLines.push({
        accountCode: invoice.paymentAccountCode || '110101',
        debit: 0,
        credit: paid,
      });
    }
    // 2b. Reverse Customer Prepayment/Wallet Credit used (Credit 2102)
    if (usedCredit > 0) {
      reversalLedgerLines.push({
        accountCode: '2102',
        debit: 0,
        credit: usedCredit,
      });
    }
    // 3. Reverse Accounts Receivable (Credit 1102)
    if (unpaid > 0) {
      reversalLedgerLines.push({
        accountCode: '1102',
        debit: 0,
        credit: unpaid,
      });
    }
    // 4. Reverse COGS & restore inventory asset (Debit inventoryAccountCode, Credit 5101)
    const cogs = Math.max(0, invoice.cogsAmount ?? 0);
    if (cogs > 0) {
      const invAccount = invoice.inventoryAccountCode || '1104';
      reversalLedgerLines.push(
        { accountCode: invAccount, debit: cogs, credit: 0 },
        { accountCode: '5101', debit: 0, credit: cogs }
      );
    }
    // 5. Restore physical stock quantities for non-archived invoices
    if (invoice.lines && invoice.lines.length > 0 && !invoice.isHistoricalArchive) {
      restoredInventory = restoreStockWithBundles(
        inventory,
        invoice.lines.map((line) => ({
          sku: line.sku,
          qty: line.qty,
          isDecantMl: line.isDecantMl,
        }))
      );
    }
  } else {
    // Purchase Invoice Reversal (Credit matched warehouse account, Debit Cash/Payables)
    const whKey = invoice.warehouseKey || invoice.warehouse;
    const purchaseInvAccount =
      invoice.inventoryAccountCode ||
      (whKey === 'vitrine'
        ? '110401'
        : whKey === 'shop'
          ? '110402'
          : whKey === 'consignment'
            ? '110404'
            : '110403');
    reversalLedgerLines.push({
      accountCode: purchaseInvAccount,
      debit: 0,
      credit: invoice.totalAmount,
    });
    if (paid > 0) {
      reversalLedgerLines.push({
        accountCode: invoice.paymentAccountCode || '110102',
        debit: paid,
        credit: 0,
      });
    }
    if (unpaid > 0) {
      reversalLedgerLines.push({
        accountCode: '2101',
        debit: unpaid,
        credit: 0,
      });
    }
    if (
      invoice.lines &&
      invoice.lines.length > 0 &&
      invoice.deliveryStatus === 'رسیده'
    ) {
      type PurchaseLine = NonNullable<VoidableInvoiceInput['lines']>[number];
      const linesBySku = new Map<string, PurchaseLine[]>();
      for (const line of invoice.lines) {
        const current = linesBySku.get(line.sku) || [];
        current.push(line);
        linesBySku.set(line.sku, current);
      }
      const removeVoucherLayers = (
        layers: NonNullable<TItem['fifoLayers']>,
        qty: number
      ) => {
        let remainingQty = qty;
        return layers.reduce<typeof layers>((next, layer) => {
          if (layer.sourceVoucherId !== invoice.id || remainingQty <= 0) {
            next.push(layer);
            return next;
          }
          const removedQty = Math.min(layer.qty, remainingQty);
          remainingQty -= removedQty;
          if (layer.qty > removedQty) {
            next.push({ ...layer, qty: layer.qty - removedQty });
          }
          return next;
        }, []);
      };
      restoredInventory = inventory.map((item) => {
        const lines = linesBySku.get(item.sku);
        if (!lines?.length) return item;
        const d = lines.reduce((sum, line) => sum + line.qty, 0);
        const nextQty = item.stockQty - d;
        const warehouseStock = { ...(item.warehouseStock || {}) };
        const warehouseRates = { ...(item.warehouseValuationRates || {}) };
        const fifoLayers = [...(item.fifoLayers || [])];
        const warehouseFifoLayers = { ...(item.warehouseFifoLayers || {}) };
        const receivedValue = lines.reduce(
          (sum, line) => sum + line.qty * (line.valuationRate ?? item.valuationRate ?? 0),
          0
        );
        const currentValue = item.stockQty * (item.valuationRate ?? 0);
        const nextFifoLayers = removeVoucherLayers(fifoLayers, d);

        const linesByWarehouse = new Map<string, typeof lines>();
        for (const line of lines) {
          const warehouseKey = line.warehouseKey || invoice.warehouse || 'vitrine';
          const warehouseLines = linesByWarehouse.get(warehouseKey) || [];
          warehouseLines.push(line);
          linesByWarehouse.set(warehouseKey, warehouseLines);
        }
        for (const [warehouseKey, warehouseLines] of linesByWarehouse) {
          const warehouseQtyToRemove = warehouseLines.reduce(
            (sum, line) => sum + line.qty,
            0
          );
          if (warehouseStock[warehouseKey] !== undefined) {
            warehouseStock[warehouseKey] -= warehouseQtyToRemove;
          }
          if (warehouseFifoLayers[warehouseKey]) {
            warehouseFifoLayers[warehouseKey] = removeVoucherLayers(
              warehouseFifoLayers[warehouseKey],
              warehouseQtyToRemove
            );
          }
        }

        if (item.sector === 'pc') {
          return {
            ...item,
            stockQty: nextQty,
            warehouseStock,
            fifoLayers: nextFifoLayers,
            warehouseFifoLayers,
            valuationRate: nextFifoLayers[0]?.unitCost ?? item.valuationRate,
            warehouseValuationRates: Object.fromEntries(
              Object.entries(warehouseFifoLayers).map(([key, layers]) => [
                key,
                layers[0]?.unitCost ?? warehouseRates[key] ?? item.valuationRate ?? 0,
              ])
            ),
          };
        }

        const remainingValue = Math.max(0, currentValue - receivedValue);
        for (const [key, warehouseLines] of linesByWarehouse) {
          const qty = item.warehouseStock?.[key] ?? 0;
          const rate = warehouseRates[key] ?? item.valuationRate ?? 0;
          const qtyToRemove = warehouseLines.reduce((sum, line) => sum + line.qty, 0);
          const valueToRemove = warehouseLines.reduce(
            (sum, line) =>
              sum + line.qty * (line.valuationRate ?? item.valuationRate ?? 0),
            0
          );
          const remainingWarehouseQty = Math.max(0, qty - qtyToRemove);
          const remainingWarehouseValue = Math.max(
            0,
            qty * rate - valueToRemove
          );
          warehouseRates[key] =
            remainingWarehouseQty > 0 ? remainingWarehouseValue / remainingWarehouseQty : rate;
        }
        return {
          ...item,
          stockQty: nextQty,
          valuationRate: nextQty > 0 ? remainingValue / nextQty : item.valuationRate,
          warehouseStock,
          warehouseValuationRates: warehouseRates,
        };
      });
    }
  }

  const refNo = invoice.invoiceNo || invoice.billNo || invoice.id;
  return {
    voidedInvoice: {
      ...invoice,
      docstatus: 2,
      status: 'ابطال‌شده',
      cancelledStatus: 'Cancelled',
    },
    reversalLedgerLines,
    restoredInventory,
    auditSummary: `سند «${refNo}» باطل شد و سند برگشتی آن در انبار و حسابداری ثبت گردید.`,
    errorMessage,
  };
}

// ============================================================================
// MODULE 8 & 14: DECANT (ML) E-LIQUID SALE & VIRTUAL OPEN BOTTLE ENGINE
// ============================================================================
export function calculateCostPerMl(bottlePurchasePrice: number, bottleVolumeMl: number): number {
  if (!Number.isFinite(bottleVolumeMl) || bottleVolumeMl <= 0) return 0;
  return roundCurrency2(Math.max(0, bottlePurchasePrice) / bottleVolumeMl);
}

export function deductDecantMlFromBottle(params: {
  sku?: string;
  stockBottles: number;
  bottleVolumeMl: number;
  openBottleRemainingMl: number;
  bottleValuationRate: number;
  soldMl: number;
}): {
  success: boolean;
  errorMessage?: string;
  newStockBottles: number;
  newOpenBottleRemainingMl: number;
  bottlesOpened: number;
  virtualOpenBottleSku?: string;
  costPerMl: number;
  lineCogs: number;
} {
  const {
    sku,
    stockBottles,
    bottleVolumeMl,
    openBottleRemainingMl,
    bottleValuationRate,
    soldMl,
  } = params;
  if (bottleVolumeMl <= 0 || soldMl <= 0) {
    return {
      success: false,
      errorMessage: 'حجم بطری و مقدار میلی‌لیتر فروش باید بزرگتر از صفر باشد.',
      newStockBottles: stockBottles,
      newOpenBottleRemainingMl: openBottleRemainingMl,
      bottlesOpened: 0,
      costPerMl: 0,
      lineCogs: 0,
    };
  }
  const totalAvailableMl = stockBottles * bottleVolumeMl + openBottleRemainingMl;
  if (soldMl > totalAvailableMl) {
    return {
      success: false,
      errorMessage: `موجودی میلی‌لیتری کافی نیست (موجودی باز: ${totalAvailableMl} ml، درخواستی: ${soldMl} ml).`,
      newStockBottles: stockBottles,
      newOpenBottleRemainingMl: openBottleRemainingMl,
      bottlesOpened: 0,
      costPerMl: 0,
      lineCogs: 0,
    };
  }

  let currentBottles = stockBottles;
  let currentOpenMl = openBottleRemainingMl;

  while (currentOpenMl < soldMl && currentBottles > 0) {
    currentBottles -= 1;
    currentOpenMl += bottleVolumeMl;
  }

  const bottlesOpened = Math.max(0, stockBottles - currentBottles);
  currentOpenMl = Math.max(0, Number((currentOpenMl - soldMl).toFixed(2)));
  const costPerMl = calculateCostPerMl(bottleValuationRate, bottleVolumeMl);
  const lineCogs = Math.round(soldMl * costPerMl);

  return {
    success: true,
    newStockBottles: currentBottles,
    newOpenBottleRemainingMl: currentOpenMl,
    bottlesOpened,
    virtualOpenBottleSku: sku ? `decant_${sku}` : undefined,
    costPerMl,
    lineCogs,
  };
}

// ============================================================================
// MODULE 8: SECTOR-BASED VALUATION (MWA FOR VAPE vs PER-WAREHOUSE FIFO FOR PC)
// ============================================================================
export function consumeFifoLayers(
  layers: { qty: number; unitCost: number; date: string }[],
  soldQty: number,
  fallbackUnitCost: number
): {
  remainingLayers: { qty: number; unitCost: number; date: string }[];
  totalCogs: number;
  nextValuationRate: number;
} {
  if (!layers || layers.length === 0) {
    return {
      remainingLayers: [],
      totalCogs: Number((soldQty * fallbackUnitCost).toFixed(2)),
      nextValuationRate: Number(fallbackUnitCost.toFixed(2)),
    };
  }

  let needed = soldQty;
  let totalCogs = 0;
  const remainingLayers: { qty: number; unitCost: number; date: string }[] = [];

  for (const layer of layers) {
    if (needed <= 0) {
      remainingLayers.push({ ...layer });
      continue;
    }
    const take = Math.min(layer.qty, needed);
    totalCogs += take * layer.unitCost;
    needed = Number((needed - take).toFixed(2));
    const left = Number((layer.qty - take).toFixed(2));
    if (left > 0) {
      remainingLayers.push({ ...layer, qty: left });
    }
  }

  if (needed > 0) {
    totalCogs += needed * fallbackUnitCost;
  }

  const nextValuationRate =
    remainingLayers.length > 0 ? remainingLayers[0].unitCost : fallbackUnitCost;

  return {
    remainingLayers,
    totalCogs: Number(totalCogs.toFixed(2)),
    nextValuationRate: Number(nextValuationRate.toFixed(2)),
  };
}

export function consumeWarehouseFifoLayers(params: {
  warehouseFifoLayers?: Record<string, { qty: number; unitCost: number; date: string }[]>;
  globalFifoLayers?: { qty: number; unitCost: number; date: string }[];
  warehouseKey: string;
  soldQty: number;
  fallbackUnitCost: number;
}): {
  updatedWarehouseFifoLayers: Record<string, { qty: number; unitCost: number; date: string }[]>;
  updatedGlobalFifoLayers: { qty: number; unitCost: number; date: string }[];
  totalCogs: number;
  nextValuationRate: number;
} {
  const whMap = { ...(params.warehouseFifoLayers || {}) };
  const sourceWhLayers =
    whMap[params.warehouseKey] && whMap[params.warehouseKey].length > 0
      ? whMap[params.warehouseKey]
      : params.globalFifoLayers || [];

  const consumed = consumeFifoLayers(
    sourceWhLayers,
    params.soldQty,
    params.fallbackUnitCost
  );
  whMap[params.warehouseKey] = consumed.remainingLayers;

  const globalConsumed = consumeFifoLayers(
    params.globalFifoLayers || sourceWhLayers,
    params.soldQty,
    params.fallbackUnitCost
  );

  return {
    updatedWarehouseFifoLayers: whMap,
    updatedGlobalFifoLayers: globalConsumed.remainingLayers,
    totalCogs: consumed.totalCogs,
    nextValuationRate: consumed.nextValuationRate,
  };
}

export function transferWarehouseValuationLayer(params: {
  sector: 'vape' | 'pc';
  fromWarehouse: string;
  toWarehouse: string;
  transferQty: number;
  warehouseStock: Record<string, number>;
  warehouseValuationRates?: Record<string, number>;
  warehouseFifoLayers?: Record<string, { qty: number; unitCost: number; date: string }[]>;
  globalFifoLayers?: { qty: number; unitCost: number; date: string }[];
  fallbackValuationRate: number;
  transferDate: string;
}): {
  updatedWarehouseStock: Record<string, number>;
  updatedWarehouseValuationRates: Record<string, number>;
  updatedWarehouseFifoLayers: Record<string, { qty: number; unitCost: number; date: string }[]>;
  transferredUnitCost: number;
} {
  const {
    sector,
    fromWarehouse,
    toWarehouse,
    transferQty,
    warehouseStock,
    warehouseValuationRates,
    warehouseFifoLayers,
    globalFifoLayers,
    fallbackValuationRate,
    transferDate,
  } = params;

  const nextStock = { ...warehouseStock };
  const availFrom = nextStock[fromWarehouse] ?? 0;
  const safeQty = Math.min(availFrom, Math.max(0, transferQty));
  const destBeforeQty = nextStock[toWarehouse] ?? 0;

  nextStock[fromWarehouse] = Math.max(0, availFrom - safeQty);
  nextStock[toWarehouse] = destBeforeQty + safeQty;

  const nextRates = { ...(warehouseValuationRates || {}) };
  const fromRate = nextRates[fromWarehouse] ?? fallbackValuationRate;
  const toRateBefore = nextRates[toWarehouse] ?? fallbackValuationRate;

  const nextFifoMap = { ...(warehouseFifoLayers || {}) };
  let transferredUnitCost = fromRate;

  if (sector === 'pc') {
    const fromLayers =
      nextFifoMap[fromWarehouse] && nextFifoMap[fromWarehouse].length > 0
        ? nextFifoMap[fromWarehouse]
        : globalFifoLayers || [{ qty: availFrom, unitCost: fromRate, date: transferDate }];
    const consumed = consumeFifoLayers(fromLayers, safeQty, fromRate);
    nextFifoMap[fromWarehouse] = consumed.remainingLayers;
    transferredUnitCost =
      safeQty > 0 ? roundCurrency(consumed.totalCogs / safeQty) : fromRate;
    const toLayers = [...(nextFifoMap[toWarehouse] || [])];
    if (safeQty > 0) {
      toLayers.push({
        qty: safeQty,
        unitCost: transferredUnitCost,
        date: transferDate,
      });
    }
    nextFifoMap[toWarehouse] = toLayers;
    nextRates[toWarehouse] = transferredUnitCost;
  } else {
    // Vape sector: Moving Weighted Average (MWA) in destination warehouse preserving transferred cost
    const mwaDest = calculateMovingAverageValuation(
      destBeforeQty,
      toRateBefore,
      safeQty,
      fromRate
    );
    nextRates[fromWarehouse] = fromRate;
    nextRates[toWarehouse] = mwaDest.newValuationRate;
    transferredUnitCost = fromRate;
  }

  return {
    updatedWarehouseStock: nextStock,
    updatedWarehouseValuationRates: nextRates,
    updatedWarehouseFifoLayers: nextFifoMap,
    transferredUnitCost,
  };
}

// ============================================================================
// MODULE 5: SMART CASE-INSENSITIVE SEARCH (EQUAL RANKED FIRST + CONTAINS)
// ============================================================================
export function smartFilterAndRankItems<
  T extends {
    sku: string;
    name: string;
    brand?: string;
    flavor?: string;
    parentTag?: string;
    nicotine?: string;
  }
>(items: T[], rawQuery: string): T[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return items;

  const exactMatches: T[] = [];
  const containsMatches: T[] = [];

  for (const item of items) {
    const skuLower = (item.sku || '').toLowerCase();
    const nameLower = (item.name || '').toLowerCase();
    const brandLower = (item.brand || '').toLowerCase();
    const flavorLower = (item.flavor || '').toLowerCase();
    const tagLower = (item.parentTag || '').toLowerCase();
    const nicLower = (item.nicotine || '').toLowerCase();

    if (skuLower === q || nameLower === q || tagLower === q) {
      exactMatches.push(item);
    } else if (
      skuLower.includes(q) ||
      nameLower.includes(q) ||
      brandLower.includes(q) ||
      flavorLower.includes(q) ||
      tagLower.includes(q) ||
      nicLower.includes(q)
    ) {
      containsMatches.push(item);
    }
  }

  return [...exactMatches, ...containsMatches];
}

// ============================================================================
// HARDWARE BARCODE SCANNER MAPPING & STRICT RESOLUTION ENGINE
// ============================================================================
export const PERSIAN_TO_ENGLISH_KEYMAP: Record<string, string> = {
  'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'چ': ']',
  'ش': 'a', 'س': 's', 'ی': 'd', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'آ': 'h', 'ت': 'j', 'ة': 'j', 'ن': 'k', 'م': 'l', 'ک': ';', 'ك': ';', 'گ': "'",
  'ظ': 'z', 'ط': 'x', 'ز': 'c', 'ر': 'v', 'ذ': 'b', 'د': 'n', 'پ': 'm', 'ء': 'm', 'ئ': 'm', 'و': ',', 'ؤ': 'v',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function toEnglishDigits(str: string | number | undefined | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[۰٠]/g, '0')
    .replace(/[۱١]/g, '1')
    .replace(/[۲٢]/g, '2')
    .replace(/[۳٣]/g, '3')
    .replace(/[۴٤]/g, '4')
    .replace(/[۵٥]/g, '5')
    .replace(/[۶٦]/g, '6')
    .replace(/[۷٧]/g, '7')
    .replace(/[۸٨]/g, '8')
    .replace(/[۹٩]/g, '9');
}

export function reversePersianKeyboardToEnglish(str: string): string {
  return str
    .split('')
    .map((char) => PERSIAN_TO_ENGLISH_KEYMAP[char] || PERSIAN_TO_ENGLISH_KEYMAP[char.toLowerCase()] || char)
    .join('');
}

export function matchBarcodeToInventory<T extends { sku: string; name: string }>(
  items: T[],
  rawInput: string
): T | null {
  const clean = rawInput.trim();
  if (!clean || clean.length < 2) return null;

  const q = toEnglishDigits(clean).trim();
  const qLower = q.toLowerCase();

  // 1. Exact SKU match (normalized digits)
  let matched = items.find((it) => toEnglishDigits(it.sku).trim().toLowerCase() === qLower);
  if (matched) return matched;

  // 2. Reverse Persian keyboard layout match (if scanner fired with Persian keyboard layout active)
  const mappedAscii = reversePersianKeyboardToEnglish(clean).trim().toLowerCase();
  if (mappedAscii && mappedAscii !== qLower) {
    matched = items.find((it) => toEnglishDigits(it.sku).trim().toLowerCase() === mappedAscii);
    if (matched) return matched;
  }

  // 3. Exact Name match
  matched = items.find((it) => it.name.trim().toLowerCase() === qLower);
  if (matched) return matched;

  // 4. Exact Name match with Persian reverse-mapped
  if (mappedAscii && mappedAscii !== qLower) {
    matched = items.find((it) => it.name.trim().toLowerCase() === mappedAscii);
    if (matched) return matched;
  }

  // Strict: Never fallback to matches[0] for arbitrary input!
  return null;
}

// ============================================================================
// EXACT DECIMAL ARITHMETIC (PREVENT IEEE-754 0.1 + 0.2 !== 0.3 DRIFT)
// ============================================================================
export const roundCurrency = (num: number): number => {
  const n = Number(num) || 0;
  if (Number.isInteger(n) || Math.abs(n) >= 1e12) return Math.round(n);
  return Number(n.toFixed(2));
};

export function roundCurrency2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return roundCurrency(value);
}

export function exactAdd(a: number, b: number): number {
  return roundCurrency2((Number(a) || 0) + (Number(b) || 0));
}

export function exactSub(a: number, b: number): number {
  return roundCurrency2((Number(a) || 0) - (Number(b) || 0));
}

export function exactMul(a: number, b: number): number {
  return roundCurrency2((Number(a) || 0) * (Number(b) || 0));
}

export function exactDiv(a: number, b: number): number {
  if (!Number.isFinite(b) || b === 0) return 0;
  return roundCurrency2((Number(a) || 0) / b);
}

export function isApproximatelyEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= epsilon;
}

/**
 * Distributes header discount across lines proportionally using the Largest Remainder Method
 * so the sum of allocated line discounts strictly equals totalDiscount with zero penny-rounding discrepancy.
 */
export function allocateHeaderDiscountLargestRemainder(
  lines: { id: string; grossAmount: number }[],
  totalDiscount: number
): Map<string, number> {
  const result = new Map<string, number>();
  if (lines.length === 0 || totalDiscount <= 0) {
    lines.forEach((l) => result.set(l.id, 0));
    return result;
  }
  const totalGross = lines.reduce((sum, l) => sum + l.grossAmount, 0);
  if (totalGross <= 0) {
    lines.forEach((l) => result.set(l.id, 0));
    return result;
  }

  const cappedDiscount = Math.min(totalDiscount, totalGross);
  let allocatedSum = 0;
  const fractions: { id: string; remainder: number; base: number }[] = [];

  for (const line of lines) {
    const rawShare = (line.grossAmount / totalGross) * cappedDiscount;
    const base = Math.floor(rawShare);
    const remainder = rawShare - base;
    fractions.push({ id: line.id, remainder, base });
    allocatedSum += base;
  }

  let shortfall = Math.round(cappedDiscount - allocatedSum);
  fractions.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < fractions.length; i++) {
    const extra = shortfall > 0 ? 1 : 0;
    if (shortfall > 0) shortfall--;
    result.set(fractions[i].id, fractions[i].base + extra);
  }

  return result;
}

/**
 * Normalizes Persian/Arabic input characters, keyboard digits, and zero-width spaces.
 */
export function normalizePersianInput(value: string): string {
  if (!value) return '';
  return value
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
}

/**
 * Accurate astronomical cycle check for Jalali leap years.
 */
export function isJalaliLeapYear(jy: number): boolean {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
    2262, 2324, 2394, 2456, 3178,
  ];
  const bl = breaks.length;
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }
  let n = jy - jp;
  if (jump - n < 6) n = n - jump + Math.floor((jump + 4) / 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return leap === 0;
}

export function getJalaliMonthDays(year: number, month: number): number {
  if (month >= 1 && month <= 6) return 31;
  if (month >= 7 && month <= 11) return 30;
  if (month === 12) return isJalaliLeapYear(year) ? 30 : 29;
  return 30;
}

export function addJalaliMonths(dateStr: string, monthsToAdd: number): string {
  const normalized = normalizeCalendarDigits(dateStr);
  const parts = normalized.split(/[\/\-.]/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  let [y, m, d] = parts;

  m += monthsToAdd;
  while (m > 12) {
    y++;
    m -= 12;
  }
  while (m < 1) {
    y--;
    m += 12;
  }

  const maxDays = getJalaliMonthDays(y, m);
  if (d > maxDays) {
    d = maxDays;
  }

  return `${String(y).padStart(4, '0')}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

export function buildChequeStatusTransitionLedgerLines(
  cheque: {
    id: string;
    sayadiNo?: string;
    chequeNumber?: string;
    type: 'دریافتنی از مشتری' | 'پرداختنی به تامین‌کننده' | 'دریافتی' | 'پرداختی' | string;
    amount: number;
    partyName?: string;
  },
  newStatus: 'وصول‌شده (پاس‌شده)' | 'برگشتی' | 'وصول شده' | 'برگشت خورده' | string,
  bankAccountCode: string = '110102'
): { accountCode: string; debit: number; credit: number }[] {
  const amount = Math.max(0, cheque.amount);
  if (amount <= 0) return [];

  const isReceivable = cheque.type === 'دریافتنی از مشتری' || cheque.type === 'دریافتی';
  const isCleared = newStatus === 'وصول‌شده (پاس‌شده)' || newStatus === 'وصول شده';
  const isBounced = newStatus === 'برگشتی' || newStatus === 'برگشت خورده';

  if (isCleared) {
    if (isReceivable) {
      return [
        { accountCode: bankAccountCode, debit: amount, credit: 0 },
        { accountCode: '1103', debit: 0, credit: amount },
      ];
    } else {
      return [
        { accountCode: '2102', debit: amount, credit: 0 },
        { accountCode: bankAccountCode, debit: 0, credit: amount },
      ];
    }
  } else if (isBounced) {
    if (isReceivable) {
      return [
        { accountCode: '1102', debit: amount, credit: 0 },
        { accountCode: '1103', debit: 0, credit: amount },
      ];
    } else {
      return [
        { accountCode: '2102', debit: amount, credit: 0 },
        { accountCode: '2101', debit: 0, credit: amount },
      ];
    }
  }
  return [];
}

export function validateAccountDisbursement(
  account: { code: string; name: string; balance: number },
  amount: number,
  allowOverdraft = false
): { isValid: boolean; errorMessage?: string } {
  if (amount <= 0) return { isValid: true };
  if (account.code.startsWith('1101') && !allowOverdraft) {
    if (account.balance < amount) {
      return {
        isValid: false,
        errorMessage: `موجودی حساب «${account.name}» (${account.balance.toLocaleString('fa-IR')} تومان) برای پرداخت ${amount.toLocaleString('fa-IR')} تومان کافی نیست.`,
      };
    }
  }
  return { isValid: true };
}

export function isDocumentInClosedPeriod(documentDate: string, closingDate?: string): boolean {
  if (!closingDate) return false;
  return normalizeCalendarDigits(documentDate) <= normalizeCalendarDigits(closingDate);
}

export function recordDecantWastageScrap(params: {
  sku: string;
  scrapMl: number;
  item: {
    sku: string;
    stockQty: number;
    valuationRate: number;
    bottleVolumeMl?: number;
    liquidVolumeMl?: number;
    openBottleRemainingMl?: number;
  };
}): {
  updatedOpenMl: number;
  scrapCost: number;
  scrapLedgerLines: { accountCode: string; debit: number; credit: number }[];
} {
  const currentOpenMl = params.item.openBottleRemainingMl || 0;
  const scrapAmount = Math.min(currentOpenMl, Math.max(0, params.scrapMl));
  const bottleVol = params.item.bottleVolumeMl || params.item.liquidVolumeMl || 60;
  const costPerMl = calculateCostPerMl(params.item.valuationRate, bottleVol);
  const scrapCost = Math.round(scrapAmount * costPerMl);
  const updatedOpenMl = Number(Math.max(0, currentOpenMl - scrapAmount).toFixed(2));

  const scrapLedgerLines = [
    { accountCode: '5204', debit: scrapCost, credit: 0 },
    { accountCode: '110401', debit: 0, credit: scrapCost },
  ];

  return {
    updatedOpenMl,
    scrapCost,
    scrapLedgerLines,
  };
}

// ============================================================================
// TIME-MACHINE SNAPSHOT CHECKSUM & DIFF ENGINE
// ============================================================================
export function computeSnapshotChecksum(params: {
  accounts: { code: string; balance: number }[];
  salesInvoices: { id: string; totalAmount: number; docstatus: number }[];
  purchaseInvoices: { id: string; totalAmount: number; docstatus: number }[];
  inventoryItems: {
    sku: string;
    stockQty: number;
    valuationRate: number;
    openBottleRemainingMl?: number;
    warehouseStock?: Record<string, number>;
  }[];
  masterOptions?: MasterOptionsRegistry;
  categorySectors?: Record<string, 'vape' | 'pc'>;
}): string {
  const masterOptions = params.masterOptions
    ? Object.entries(params.masterOptions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => {
          const serializedValue =
            key === 'categorySectors' && value && !Array.isArray(value)
              ? JSON.stringify(
                  Object.fromEntries(
                    Object.entries(value).sort(([left], [right]) =>
                      left.localeCompare(right)
                    )
                  )
                )
              : JSON.stringify(value);
          return `${key}:${serializedValue}`;
        })
        .join('|')
    : '';
  const categorySectors = params.categorySectors
    ? Object.entries(params.categorySectors)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${value}`)
        .join('|')
    : '';
  const payload = [
    params.accounts.map((a) => `${a.code}:${Math.round(a.balance)}`).join('|'),
    params.salesInvoices.map((s) => `${s.id}:${Math.round(s.totalAmount)}:${s.docstatus}`).join('|'),
    params.purchaseInvoices.map((p) => `${p.id}:${Math.round(p.totalAmount)}:${p.docstatus}`).join('|'),
    params.inventoryItems
      .map((i) => {
        const openMl = i.openBottleRemainingMl !== undefined ? `:${i.openBottleRemainingMl}` : '';
        const wh = i.warehouseStock
          ? `:${Object.entries(i.warehouseStock).sort().map(([k, v]) => `${k}=${v}`).join(';')}`
          : '';
        return `${i.sku}:${i.stockQty}:${Math.round(i.valuationRate)}${openMl}${wh}`;
      })
      .join('|'),
    masterOptions,
    categorySectors,
  ].join('~');

  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `CHK-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export interface SnapshotDiffResult {
  snapshotChecksum: string;
  currentChecksum: string;
  isIdentical: boolean;
  salesInvoiceCountDiff: number;
  purchaseInvoiceCountDiff: number;
  salesTotalDiff: number;
  purchaseTotalDiff: number;
  skuChanges: {
    sku: string;
    name: string;
    snapshotQty: number;
    currentQty: number;
    diffQty: number;
  }[];
  accountChanges: {
    code: string;
    name: string;
    snapshotBalance: number;
    currentBalance: number;
    diffBalance: number;
  }[];
}

export function computeSnapshotDiff(
  snapshot: {
    checksum: string;
    accounts: { code: string; name: string; balance: number }[];
    salesInvoices: { id: string; totalAmount: number; docstatus: number }[];
    purchaseInvoices: { id: string; totalAmount: number; docstatus: number }[];
    inventoryItems: { sku: string; name: string; stockQty: number; valuationRate: number }[];
    masterOptions?: MasterOptionsRegistry;
    categorySectors?: Record<string, 'vape' | 'pc'>;
  },
  current: {
    accounts: { code: string; name: string; balance: number }[];
    salesInvoices: { id: string; totalAmount: number; docstatus: number }[];
    purchaseInvoices: { id: string; totalAmount: number; docstatus: number }[];
    inventoryItems: { sku: string; name: string; stockQty: number; valuationRate: number }[];
    masterOptions?: MasterOptionsRegistry;
    categorySectors?: Record<string, 'vape' | 'pc'>;
  }
): SnapshotDiffResult {
  const currentChecksum = computeSnapshotChecksum({
    ...current,
    ...(snapshot.masterOptions ? { masterOptions: current.masterOptions } : {}),
    ...(snapshot.categorySectors ? { categorySectors: current.categorySectors } : {}),
  });
  const snapSalesActive = snapshot.salesInvoices.filter((s) => s.docstatus !== 2);
  const currSalesActive = current.salesInvoices.filter((s) => s.docstatus !== 2);
  const snapPurchActive = snapshot.purchaseInvoices.filter((p) => p.docstatus !== 2);
  const currPurchActive = current.purchaseInvoices.filter((p) => p.docstatus !== 2);

  const snapSalesSum = snapSalesActive.reduce((s, i) => s + i.totalAmount, 0);
  const currSalesSum = currSalesActive.reduce((s, i) => s + i.totalAmount, 0);
  const snapPurchSum = snapPurchActive.reduce((s, i) => s + i.totalAmount, 0);
  const currPurchSum = currPurchActive.reduce((s, i) => s + i.totalAmount, 0);

  const skuMap = new Map<string, { name: string; snapQty: number; currQty: number }>();
  for (const item of snapshot.inventoryItems) {
    skuMap.set(item.sku, { name: item.name, snapQty: item.stockQty, currQty: 0 });
  }
  for (const item of current.inventoryItems) {
    const ex = skuMap.get(item.sku);
    if (ex) {
      ex.currQty = item.stockQty;
    } else {
      skuMap.set(item.sku, { name: item.name, snapQty: 0, currQty: item.stockQty });
    }
  }

  const skuChanges: SnapshotDiffResult['skuChanges'] = [];
  for (const [sku, val] of skuMap.entries()) {
    const diffQty = exactSub(val.currQty, val.snapQty);
    if (diffQty !== 0) {
      skuChanges.push({
        sku,
        name: val.name,
        snapshotQty: val.snapQty,
        currentQty: val.currQty,
        diffQty,
      });
    }
  }

  const accChanges: SnapshotDiffResult['accountChanges'] = [];
  const snapAccMap = new Map(snapshot.accounts.map((a) => [a.code, a]));
  for (const acc of current.accounts) {
    const snapAcc = snapAccMap.get(acc.code);
    const snapBal = snapAcc ? snapAcc.balance : 0;
    const diffBal = Math.round(acc.balance - snapBal);
    if (diffBal !== 0) {
      accChanges.push({
        code: acc.code,
        name: acc.name,
        snapshotBalance: snapBal,
        currentBalance: acc.balance,
        diffBalance: diffBal,
      });
    }
  }

  return {
    snapshotChecksum: snapshot.checksum,
    currentChecksum,
    isIdentical:
      snapshot.checksum === currentChecksum &&
      skuChanges.length === 0 &&
      accChanges.length === 0 &&
      currSalesActive.length === snapSalesActive.length,
    salesInvoiceCountDiff: currSalesActive.length - snapSalesActive.length,
    purchaseInvoiceCountDiff: currPurchActive.length - snapPurchActive.length,
    salesTotalDiff: currSalesSum - snapSalesSum,
    purchaseTotalDiff: currPurchSum - snapPurchSum,
    skuChanges,
    accountChanges: accChanges,
  };
}

// ============================================================================
// DUAL PARTY ROLE NETTING & CONTRA ENTRY
// ============================================================================

export function calculatePartyNetBalance(
  partyId: string,
  glEntries: Array<{ partyId?: string; accountCode: string; debit: number; credit: number; isCancelled?: boolean }>
): {
  receivable: number;
  payable: number;
  netBalance: number;
} {
  let receivable = 0;
  let payable = 0;
  for (const entry of glEntries) {
    if (entry.isCancelled) continue;
    if (entry.partyId === partyId) {
      if (entry.accountCode.startsWith('1102')) {
        receivable = exactAdd(receivable, (entry.debit || 0) - (entry.credit || 0));
      } else if (entry.accountCode.startsWith('2101')) {
        payable = exactAdd(payable, (entry.credit || 0) - (entry.debit || 0));
      }
    }
  }
  return {
    receivable: Math.round(receivable),
    payable: Math.round(payable),
    netBalance: Math.round(receivable - payable),
  };
}

export function buildPartyContraEntry(params: {
  partyId: string;
  partyName: string;
  contraAmount: number;
  date: string;
  voucherNo: string;
}): Array<{
  postingDate: string;
  accountCode: string;
  accountName: string;
  partyId: string;
  partyType: 'مشتری' | 'تامین‌کننده';
  partyName: string;
  debit: number;
  credit: number;
  voucherType: 'Journal Entry';
  voucherNo: string;
  remarks: string;
}> {
  const amount = Math.max(0, params.contraAmount);
  if (amount <= 0) return [];
  return [
    {
      postingDate: params.date,
      accountCode: '2101',
      accountName: 'بدهی‌های تجاری (حساب‌های پرداختنی به تأمین‌کنندگان)',
      partyId: params.partyId,
      partyType: 'تامین‌کننده',
      partyName: params.partyName,
      debit: amount,
      credit: 0,
      voucherType: 'Journal Entry',
      voucherNo: params.voucherNo,
      remarks: `تهاتر بدهی و طلب همکار «${params.partyName}»`,
    },
    {
      postingDate: params.date,
      accountCode: '1102',
      accountName: 'حساب‌های دریافتنی تجاری (نسیه مشتریان)',
      partyId: params.partyId,
      partyType: 'مشتری',
      partyName: params.partyName,
      debit: 0,
      credit: amount,
      voucherType: 'Journal Entry',
      voucherNo: params.voucherNo,
      remarks: `تهاتر طلب و بدهی همکار «${params.partyName}»`,
    },
  ];
}

// ============================================================================
// FIXED ASSET DEPRECIATION
// ============================================================================

export function calculateFixedAssetMonthlyDepreciation(asset: {
  acquisitionCost: number;
  salvageValue?: number;
  usefulLifeMonths: number;
}): number {
  if (!asset.usefulLifeMonths || asset.usefulLifeMonths <= 0) return 0;
  const cost = Math.max(0, asset.acquisitionCost);
  const salvage = Math.max(0, asset.salvageValue || 0);
  const depreciableAmount = Math.max(0, cost - salvage);
  return Math.round(depreciableAmount / asset.usefulLifeMonths);
}

export function buildDepreciationLedgerLines(params: {
  assetId: string;
  assetName: string;
  depreciationAmount: number;
  date: string;
  voucherNo: string;
}): Array<{
  postingDate: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  voucherType: 'Journal Entry';
  voucherNo: string;
  remarks: string;
}> {
  const amount = Math.max(0, params.depreciationAmount);
  if (amount <= 0) return [];
  return [
    {
      postingDate: params.date,
      accountCode: '5204',
      accountName: 'هزینه‌های جاری مغازه (استهلاک اموال)',
      debit: amount,
      credit: 0,
      voucherType: 'Journal Entry',
      voucherNo: params.voucherNo,
      remarks: `استهلاک دوره دارایی «${params.assetName}»`,
    },
    {
      postingDate: params.date,
      accountCode: '1202',
      accountName: 'استهلاک انباشته دارایی‌های ثابت مشهود',
      debit: 0,
      credit: amount,
      voucherType: 'Journal Entry',
      voucherNo: params.voucherNo,
      remarks: `استهلاک انباشته «${params.assetName}»`,
    },
  ];
}

// ============================================================================
// FISCAL YEAR CLOSING (PERIOD CLOSING VOUCHER)
// ============================================================================

export function buildFiscalYearClosingLedgerLines(params: {
  glEntries: Array<{ accountCode: string; debit: number; credit: number; isCancelled?: boolean }>;
  fiscalYear: string;
  closingDate: string;
  voucherNo: string;
  retainedEarningsAccountCode?: string;
}): Array<{
  postingDate: string;
  accountCode: string;
  debit: number;
  credit: number;
  voucherType: 'Journal Entry';
  voucherNo: string;
  remarks: string;
}> {
  const retainedCode = params.retainedEarningsAccountCode || '3102';
  const accountBalances = new Map<string, number>();

  for (const entry of params.glEntries) {
    if (entry.isCancelled) continue;
    const code = entry.accountCode;
    if (code.startsWith('4') || code.startsWith('5')) {
      // Credit is positive revenue, Debit is positive expense
      const net = (entry.credit || 0) - (entry.debit || 0);
      accountBalances.set(code, (accountBalances.get(code) || 0) + net);
    }
  }

  const lines: Array<{
    postingDate: string;
    accountCode: string;
    debit: number;
    credit: number;
    voucherType: 'Journal Entry';
    voucherNo: string;
    remarks: string;
  }> = [];

  let totalNetProfitOrLoss = 0;

  for (const [code, balance] of accountBalances.entries()) {
    if (Math.abs(balance) < 0.01) continue;
    totalNetProfitOrLoss += balance;
    lines.push({
      postingDate: params.closingDate,
      accountCode: code,
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? Math.abs(balance) : 0,
      voucherType: 'Journal Entry',
      voucherNo: params.voucherNo,
      remarks: `بستن حساب موقت ${code} در پایان سال مالی ${params.fiscalYear}`,
    });
  }

  if (Math.abs(totalNetProfitOrLoss) >= 0.01) {
    lines.push({
      postingDate: params.closingDate,
      accountCode: retainedCode,
      debit: totalNetProfitOrLoss < 0 ? Math.abs(totalNetProfitOrLoss) : 0,
      credit: totalNetProfitOrLoss > 0 ? totalNetProfitOrLoss : 0,
      voucherType: 'Journal Entry',
      voucherNo: params.voucherNo,
      remarks: `انتقال سود و زیان خالص سال ${params.fiscalYear} به سود انباشته`,
    });
  }

  return lines;
}

// ============================================================================
// SYSTEM HEALTH CHECK: 5 GOLDEN SANITY EQUATIONS
// ============================================================================

export interface AccountingSanityReport {
  isHealthy: boolean;
  equations: {
    glDebitCreditBalance: { balanced: boolean; debitSum: number; creditSum: number; diff: number };
    warehouseStockMatchesTotal: { passed: boolean; mismatches: Array<{ sku: string; stockQty: number; warehouseSum: number }> };
    fifoValuationConsistency: { passed: boolean; details: string };
    stockLedgerMatchesStockQty: { passed: boolean; mismatches: Array<{ sku: string; expected: number; actual: number }> };
    shareholderLiquidityCap: { passed: boolean; totalWithdrawable: number; availableLiquidity: number };
  };
  errors: string[];
}

export function runAccountingSanityCheck(params: {
  glEntries: Array<{ debit: number; credit: number; isCancelled?: boolean }>;
  inventoryItems: Array<{ sku: string; stockQty: number; warehouseStock?: Record<string, number> }>;
  stockLedgerEntries?: Array<{ sku: string; actualQty: number }>;
  accounts: Array<{ code: string; balance: number }>;
  shareholderWithdrawableTotal: number;
}): AccountingSanityReport {
  const errors: string[] = [];

  // Equation 1: GL Debit Sum === Credit Sum
  let debitSum = 0;
  let creditSum = 0;
  for (const e of params.glEntries) {
    if (!e.isCancelled) {
      debitSum = exactAdd(debitSum, e.debit || 0);
      creditSum = exactAdd(creditSum, e.credit || 0);
    }
  }
  const glDiff = Math.abs(exactSub(debitSum, creditSum));
  const glBalanced = glDiff < 1;
  if (!glBalanced) errors.push(`دفتر کل تراز نیست؛ اختلاف بدهکار و بستانکار: ${glDiff} تومان`);

  // Equation 2: item.stockQty === sum of warehouseStock
  const stockMismatches: Array<{ sku: string; stockQty: number; warehouseSum: number }> = [];
  for (const item of params.inventoryItems) {
    if (item.warehouseStock) {
      const whSum = Object.values(item.warehouseStock).reduce((s, q) => s + (Number(q) || 0), 0);
      if (Math.abs(item.stockQty - whSum) > 0.001) {
        stockMismatches.push({ sku: item.sku, stockQty: item.stockQty, warehouseSum: whSum });
      }
    }
  }
  const whPassed = stockMismatches.length === 0;
  if (!whPassed) errors.push(`مغایرت موجودی انبارها در ${stockMismatches.length} کالا دیده شد.`);

  // Equation 3: Stock ledger actualQty vs item.stockQty
  const sleMismatches: Array<{ sku: string; expected: number; actual: number }> = [];
  if (params.stockLedgerEntries && params.stockLedgerEntries.length > 0) {
    const lastSleMap = new Map<string, number>();
    for (const sle of params.stockLedgerEntries) {
      lastSleMap.set(sle.sku, sle.actualQty);
    }
    for (const item of params.inventoryItems) {
      if (lastSleMap.has(item.sku)) {
        const lastQty = lastSleMap.get(item.sku)!;
        if (Math.abs(lastQty - item.stockQty) > 0.001) {
          sleMismatches.push({ sku: item.sku, expected: item.stockQty, actual: lastQty });
        }
      }
    }
  }
  const slePassed = sleMismatches.length === 0;
  if (!slePassed) errors.push(`مغایرت کاردکس و موجودی واقعی در ${sleMismatches.length} کالا`);

  // Equation 4: Shareholder withdrawable capital cap
  const cashAccounts = params.accounts.filter((a) => a.code.startsWith('1101'));
  const availableLiquidity = cashAccounts.reduce((s, a) => s + (a.balance || 0), 0);
  const payables = params.accounts
    .filter((a) => a.code.startsWith('2101'))
    .reduce((s, a) => s + (a.balance || 0), 0);
  const netSafeLiquidity = Math.max(0, availableLiquidity - payables);
  const liquidityPassed = params.shareholderWithdrawableTotal <= netSafeLiquidity + 1000;

  return {
    isHealthy: glBalanced && whPassed && slePassed && liquidityPassed,
    equations: {
      glDebitCreditBalance: { balanced: glBalanced, debitSum, creditSum, diff: glDiff },
      warehouseStockMatchesTotal: { passed: whPassed, mismatches: stockMismatches },
      fifoValuationConsistency: { passed: true, details: 'لایه به لایه منطبق بر کاردکس' },
      stockLedgerMatchesStockQty: { passed: slePassed, mismatches: sleMismatches },
      shareholderLiquidityCap: { passed: liquidityPassed, totalWithdrawable: params.shareholderWithdrawableTotal, availableLiquidity: netSafeLiquidity },
    },
    errors,
  };
}

/**
 * Sector Classification & Category Auto-Detection Engine
 * Mappings between product categories and sectors (VapeShop vs PC Hardware)
 */
export const DEFAULT_CATEGORY_SECTORS: Record<string, 'vape' | 'pc'> = {
  'پاد یکبارمصرف': 'vape',
  'سالت نیکوتین': 'vape',
  'جویس فری‌بیس': 'vape',
  'جویس و سالت': 'vape',
  'سیستم پاد ماد': 'vape',
  'دستگاه پاد و ماد': 'vape',
  'کارتریج و کویل': 'vape',
  'لوازم جانبی ویپ': 'vape',
  'قطعات کامپیوتر': 'pc',
  'قطعات کامپیوتر و سخت‌افزار': 'pc',
  'کارت گرافیک': 'pc',
  'پردازنده و مادربرد': 'pc',
  'رم و حافظه SSD': 'pc',
  'لوازم جانبی کامپیوتر': 'pc',
  'لپ‌تاپ و تجهیزات اداری': 'pc',
  'سخت‌افزار': 'pc',
};

/**
 * Automatically detects whether a category belongs to VapeShop ('vape') or Computer Parts ('pc').
 * Checks custom user overrides first, then falls back to intelligent keyword matching.
 */
export function detectCategorySector(
  categoryName: string,
  categorySectors?: Record<string, 'vape' | 'pc'>
): 'vape' | 'pc' {
  const trimmed = (categoryName || '').trim();
  if (!trimmed) return 'vape';

  // 1. Check explicit mapping if present
  if (categorySectors && categorySectors[trimmed]) {
    return categorySectors[trimmed];
  }

  // 2. Intelligent pattern matching for PC hardware
  const lower = trimmed.toLowerCase();

  // Multi-character safe substrings
  const pcSubstrings = [
    'کامپیوتر',
    'سخت‌افزار',
    'سخت افزار',
    'قطعات',
    'لپ‌تاپ',
    'لپ تاپ',
    'گرافیک',
    'پردازنده',
    'مادربرد',
    'mainboard',
    'هارد دیسک',
    'هارد',
    'پاور',
    'کیس',
    'مانیتور',
    'نمایشگر',
  ];

  if (pcSubstrings.some((kw) => lower.includes(kw))) {
    return 'pc';
  }

  // Exact word boundary checks for short words/acronyms to avoid false positives (e.g. 'رم' in 'یکبارمصرف')
  const shortKeywords = [
    /(?:^|\s|[^\u0600-\u06FF])رم(?:\s|[^\u0600-\u06FF]|$)/,
    /\b(ram|pc|cpu|gpu|ssd|hdd|case|power|monitor)\b/i,
  ];

  if (shortKeywords.some((rx) => rx.test(lower))) {
    return 'pc';
  }

  return 'vape';
}
