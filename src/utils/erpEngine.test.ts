import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePosCartTotals as calculateCartRowTotals } from './posService';
import {
  validateJournalEntry,
  calculateInstallments,
  calculateMovingAverageValuation,
  allocateLandedCost,
  evaluateBudgetControl,
  calculatePosCartTotals,
  calculateStockReconciliation,
  generateItemVariants,
  checkRolePermission,
  calculateFinancialStatements,
  calculateSalesDashboardMetrics,
  postDoubleEntryToAccounts,
  computeMultiLineInvoiceTotals,
  computeTrialBalance6Col,
  deductStockWithBundles,
  restoreStockWithBundles,
  validateSettlementAmount,
  aggregateInvoiceLines,
  getPersianYear,
  buildSalesInvoiceLedgerLines,
  buildPurchaseInvoiceReversalLines,
  buildCustomerRefundLedgerLines,
  calculateThreeBucketShareholderState,
  resolveShareholderRatesAtDate,
  calculateCostPerMl,
  deductDecantMlFromBottle,
  consumeFifoLayers,
  smartFilterAndRankItems,
  voidInvoice,
  exactAdd,
  exactSub,
  computeSnapshotChecksum,
  computeSnapshotDiff,
  consumeWarehouseFifoLayers,
  transferWarehouseValuationLayer,
  isApproximatelyEqual,
  detectCategorySector,
  DEFAULT_CATEGORY_SECTORS,
  allocateHeaderDiscountLargestRemainder,
  normalizePersianInput,
  isJalaliLeapYear,
  getJalaliMonthDays,
  addJalaliMonths,
  buildChequeStatusTransitionLedgerLines,
  validateAccountDisbursement,
  isDocumentInClosedPeriod,
  recordDecantWastageScrap,
  isLeafAccount,
  calculatePartyNetBalance,
  buildPartyContraEntry,
  calculateFixedAssetMonthlyDepreciation,
  buildDepreciationLedgerLines,
  buildFiscalYearClosingLedgerLines,
  runAccountingSanityCheck,
  normalizeCalendarDigits,
  comparePersianDates,
  matchBarcodeToInventory,
  reversePersianKeyboardToEnglish,
  allocateCostCenterExpense,
  roundCurrency,
} from './erpEngine';
import { INITIAL_ACCOUNTS, INITIAL_GL_ENTRIES } from '../data/erpSeedData';

test('getPersianYear follows the supplied date instead of a fixed fiscal year', () => {
  assert.equal(getPersianYear(new Date('2025-03-22T12:00:00.000Z')), '۱۴۰۴');
});

test('validateJournalEntry enforces double-entry debit === credit rule', () => {
  const balanced = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 15000000, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد فروش کالا', debit: 0, credit: 15000000 },
  ]);
  assert.equal(balanced.isValid, true);
  assert.equal(balanced.difference, 0);

  const unbalanced = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 15000000, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد فروش کالا', debit: 0, credit: 12000000 },
  ]);
  assert.equal(unbalanced.isValid, false);
  assert.equal(unbalanced.difference, 3000000);

  const invalidLine = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: -1, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد فروش کالا', debit: 1, credit: 1 },
  ]);
  assert.equal(invalidLine.isValid, false);

  const unknownAccount = validateJournalEntry(
    [
      { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 100, credit: 0 },
      { id: '2', accountCode: 'MISSING', accountName: 'حساب نامعتبر', debit: 0, credit: 100 },
    ],
    new Set(['1101', '4101'])
  );
  assert.equal(unknownAccount.isValid, false);

  const zeroValueLine = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 100, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد', debit: 0, credit: 100 },
    { id: '3', accountCode: '4101', accountName: 'درآمد', debit: 0, credit: 0 },
  ]);
  assert.equal(zeroValueLine.isValid, false);
});

test('calculateInstallments splits invoice accurately into 30/35/35 schedule', () => {
  const schedule = calculateInstallments(10000000, [
    { label: 'پیش‌پرداخت نقد (۳۰٪)', percentage: 30, dueDays: 0 },
    { label: 'قسط اول - یک ماهه (۳۵٪)', percentage: 35, dueDays: 30 },
    { label: 'قسط دوم - دو ماهه (۳۵٪)', percentage: 35, dueDays: 60 },
  ]);
  assert.equal(schedule.length, 3);
  assert.equal(schedule[0].amount, 3000000);
  assert.equal(schedule[0].status, 'پرداخت‌شده');
  assert.equal(schedule[1].amount, 3500000);
  assert.equal(schedule[2].amount, 3500000);
});

test('validateSettlementAmount rejects overpayments and invalid references', () => {
  assert.equal(validateSettlementAmount(25, 100).isValid, true);
  assert.equal(validateSettlementAmount(101, 100).isValid, false);
  assert.equal(validateSettlementAmount(1, 0).isValid, false);
  assert.equal(validateSettlementAmount(Number.NaN, 100).isValid, false);
});

test('sales credit notes credit receivables and cancellation reverses that posting', () => {
  const creditNote = buildSalesInvoiceLedgerLines({
    totalAmount: 1000,
    paidAmount: 400,
    cogsAmount: 250,
    updateStock: true,
    isReverse: true,
    postingMode: 'return',
  });
  assert.deepEqual(creditNote, [
    { accountCode: '4101', debit: 1000, credit: 0 },
    { accountCode: '1102', debit: 0, credit: 1000 },
    { accountCode: '5101', debit: 0, credit: 250 },
    { accountCode: '1104', debit: 250, credit: 0 },
  ]);

  const cancellation = buildSalesInvoiceLedgerLines({
    totalAmount: 1000,
    paidAmount: 400,
    cogsAmount: 250,
    updateStock: true,
    isReverse: false,
    postingMode: 'return',
  });
  assert.deepEqual(
    cancellation,
    creditNote.map((line) => ({
      ...line,
      debit: line.credit,
      credit: line.debit,
    }))
  );
});

test('purchase reversal values inventory at current moving-average cost and books the variance', () => {
  const reversal = buildPurchaseInvoiceReversalLines(1000, 0, 1500);
  assert.deepEqual(reversal, [
    { accountCode: '1104', debit: 0, credit: 1500 },
    { accountCode: '2101', debit: 1000, credit: 0 },
    { accountCode: '5101', debit: 500, credit: 0 },
  ]);
  assert.equal(
    reversal.reduce((total, line) => total + line.debit, 0),
    reversal.reduce((total, line) => total + line.credit, 0)
  );

  const lowerCurrentValue = buildPurchaseInvoiceReversalLines(1000, 0, 800);
  assert.deepEqual(lowerCurrentValue.at(-1), {
    accountCode: '5101',
    debit: 0,
    credit: 200,
  });
  assert.equal(
    lowerCurrentValue.reduce((total, line) => total + line.debit, 0),
    lowerCurrentValue.reduce((total, line) => total + line.credit, 0)
  );
});

test('customer refund posts against receivables and cancellation reverses it', () => {
  const refund = buildCustomerRefundLedgerLines('110101', 500);
  assert.deepEqual(refund, [
    { accountCode: '1102', debit: 500, credit: 0 },
    { accountCode: '110101', debit: 0, credit: 500 },
  ]);
  assert.deepEqual(
    buildCustomerRefundLedgerLines('110101', 500, true),
    refund.map((line) => ({ ...line, debit: line.credit, credit: line.debit }))
  );
});

test('aggregateInvoiceLines sums repeated item quantities and net amounts', () => {
  const lines = aggregateInvoiceLines([
    { id: '1', sku: 'SKU-1', qty: 2, netLineAmount: 200 },
    { id: '2', sku: 'SKU-1', qty: 3, netLineAmount: 270 },
    { id: '3', sku: 'SKU-2', qty: 1, netLineAmount: 50 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].qty, 5);
  assert.equal(lines[0].netLineAmount, 470);
  assert.equal(lines[1].qty, 1);
});

test('calculateMovingAverageValuation computes weighted moving average cost', () => {
  const res = calculateMovingAverageValuation(100, 500000, 50, 650000);
  assert.equal(res.newQty, 150);
  assert.equal(res.newValuationRate, 550000);
});

test('allocateLandedCost distributes customs and freight proportionally', () => {
  const allocated = allocateLandedCost(
    [
      { itemCode: 'ITM-01', itemName: 'پاد Peak Bar 60000', qty: 10, weightGrams: 100, unitCost: 800000 },
      { itemCode: 'ITM-02', itemName: 'جویس ۶۰ میل', qty: 20, weightGrams: 80, unitCost: 400000 },
    ],
    1600000,
    'amount'
  );
  assert.equal(allocated[0].allocatedLandedCost, 800000);
  assert.equal(allocated[0].finalUnitCost, 880000);
  assert.equal(allocated[1].allocatedLandedCost, 800000);
  assert.equal(allocated[1].finalUnitCost, 440000);
});

test('evaluateBudgetControl enforces STOP and WARN policies accurately', () => {
  const stopped = evaluateBudgetControl(50000000, 45000000, 10000000, 'STOP');
  assert.equal(stopped.status, 'STOPPED');
  assert.equal(stopped.remainingAfter, -5000000);

  const warned = evaluateBudgetControl(50000000, 45000000, 10000000, 'WARN');
  assert.equal(warned.status, 'WARNING');
});

test('calculatePosCartTotals handles stepped discount, loyalty and commission', () => {
  const totals = calculatePosCartTotals({
    items: [{ price: 1000000, qty: 5, category: 'دستگاه' }],
    priceListMultiplier: 1,
    couponPercent: 10,
    redeemLoyaltyPoints: 100,
    partnerCommissionPercent: 5,
    promotionRules: {
      quantityDiscount: { minimumQuantity: 5, percent: 5 },
      freeGiftMinimumQuantity: 3,
      tomanPerLoyaltyPoint: 50000,
    },
  });
  assert.equal(totals.grossTotal, 5000000);
  assert.equal(totals.pricingRuleDiscount, 250000);
  assert.equal(totals.couponDiscount, 475000);
  assert.equal(totals.loyaltyDiscount, 100000);
  assert.equal(totals.netPayable, 4175000);
  assert.equal(totals.earnedLoyaltyPoints, 83);
  assert.equal(totals.partnerCommissionAmount, 208750);
  assert.equal(totals.freeGiftTriggered, true);
});

test('calculatePosCartTotals does not apply unconfigured promotions or loyalty points', () => {
  const totals = calculatePosCartTotals({
    items: [{ price: 1000000, qty: 5, category: 'دستگاه' }],
    priceListMultiplier: 1,
    couponPercent: 0,
    redeemLoyaltyPoints: 0,
    partnerCommissionPercent: 0,
  });

  assert.equal(totals.grossTotal, 5000000);
  assert.equal(totals.pricingRuleDiscount, 0);
  assert.equal(totals.earnedLoyaltyPoints, 0);
  assert.equal(totals.partnerCommissionAmount, 0);
  assert.equal(totals.freeGiftTriggered, false);
  assert.equal(totals.netPayable, 5000000);
});

test('calculateStockReconciliation detects deficit and triggers auto reorder', () => {
  const rec = calculateStockReconciliation(25, 8, 500000, 10);
  assert.equal(rec.varianceQty, -17);
  assert.equal(rec.varianceValue, -8500000);
  assert.equal(rec.needsAutoReorder, true);
  assert.ok(rec.suggestedOrderQty > 0);
});

test('generateItemVariants creates SKU combinations from attributes', () => {
  const variants = generateItemVariants('پاد Peak Bar 60000', 'PK60', ['انبه یخ', 'بلوبری'], ['۲۰ میلی‌گرم', '۵۰ میلی‌گرم']);
  assert.equal(variants.length, 4);
  assert.equal(variants[0].sku, 'PK60-V11');
});

test('checkRolePermission grants full access to Super Admin and restricts Cashier', () => {
  assert.equal(checkRolePermission('سوپر ادمین', 'post_journal'), true);
  assert.equal(checkRolePermission('سوپر ادمین', 'view_buying_cost'), true);
  assert.equal(checkRolePermission('صندوقدار (پوز)', 'view_buying_cost'), false);
  assert.equal(checkRolePermission('صندوقدار (پوز)', 'export_database'), false);
});

test('calculateFinancialStatements computes P&L and Balance Sheet equation accurately', () => {
  const st = calculateFinancialStatements([
    { category: 'دارایی', level: 'گروه', balance: 4850000000 },
    { category: 'بدهی', level: 'گروه', balance: 960000000 },
    { category: 'سرمایه', level: 'گروه', balance: 3000000000 },
    { category: 'درآمد', level: 'گروه', balance: 2150000000 },
    { category: 'هزینه', level: 'گروه', balance: 1260000000 },
  ]);
  assert.equal(st.netProfit, 890000000);
  assert.equal(st.equityPlusLiabilitiesAndProfit, 4850000000);
  assert.equal(st.isBalanceSheetBalanced, true);
});

test('calculateSalesDashboardMetrics includes posted archive invoices and computes dashboard totals', () => {
  const metrics = calculateSalesDashboardMetrics(
    [
      {
        docstatus: 1,
        totalAmount: 1000,
        paidAmount: 400,
        isHistoricalArchive: true,
        lines: [{ sku: 'A', qty: 2, valuationRate: 0 }],
      },
      { docstatus: 0, totalAmount: 500, paidAmount: 500 },
      { docstatus: 2, totalAmount: 300, paidAmount: 0 },
    ],
    [{ sku: 'A', stockQty: 3, valuationRate: 100 }]
  );

  assert.deepEqual(metrics, {
    postedInvoiceCount: 1,
    totalSales: 1000,
    cashReceived: 400,
    receivables: 600,
    knownCostOfGoodsSold: 200,
    estimatedProfit: 800,
    inventoryValue: 300,
    estimatedAssets: 1300,
    estimatedCostLineCount: 0,
    missingCostLineCount: 0,
  });
});

test('calculateSalesDashboardMetrics flags unknown item costs and offsets posted credit notes', () => {
  const metrics = calculateSalesDashboardMetrics(
    [
      {
        docstatus: 1,
        totalAmount: 1000,
        paidAmount: 800,
        lines: [
          { sku: 'KNOWN', qty: 1, valuationRate: 0 },
          { sku: 'UNKNOWN', qty: 1, valuationRate: 0, unitPrice: 200, netLineAmount: 200 },
        ],
      },
      {
        docstatus: 1,
        totalAmount: 100,
        paidAmount: 100,
        returnAgainst: 'INV-1',
        lines: [{ sku: 'KNOWN', qty: 1, valuationRate: 0 }],
      },
    ],
    [{ sku: 'KNOWN', stockQty: 0, valuationRate: 250 }]
  );

  assert.equal(metrics.totalSales, 900);
  assert.equal(metrics.cashReceived, 700);
  assert.equal(metrics.receivables, 200);
  assert.equal(metrics.knownCostOfGoodsSold, 0);
  assert.equal(metrics.estimatedProfit, 750);
  assert.equal(metrics.estimatedCostLineCount, 1);
  assert.equal(metrics.missingCostLineCount, 0);
});

test('postDoubleEntryToAccounts rolls up leaf debit/credit changes to parent group accounts and preserves Balance Sheet equality', () => {
  const sampleAccounts = [
    { code: '1000', category: 'دارایی' as const, level: 'گروه' as const, balance: 1000 },
    { code: '1101', category: 'دارایی' as const, level: 'معین' as const, parentCode: '1000', balance: 1000 },
    { code: '2000', category: 'بدهی' as const, level: 'گروه' as const, balance: 200 },
    { code: '3000', category: 'سرمایه' as const, level: 'گروه' as const, balance: 800 },
    { code: '4000', category: 'درآمد' as const, level: 'گروه' as const, balance: 0 },
    { code: '4101', category: 'درآمد' as const, level: 'معین' as const, parentCode: '4000', balance: 0 },
    { code: '5000', category: 'هزینه' as const, level: 'گروه' as const, balance: 0 },
  ];

  const updated = postDoubleEntryToAccounts(sampleAccounts, [
    { accountCode: '1101', debit: 500, credit: 0 },
    { accountCode: '4101', debit: 0, credit: 500 },
  ]);

  assert.equal(updated.find((a) => a.code === '1101')?.balance, 1500);
  assert.equal(updated.find((a) => a.code === '1000')?.balance, 1500);
  assert.equal(updated.find((a) => a.code === '4101')?.balance, 500);
  assert.equal(updated.find((a) => a.code === '4000')?.balance, 500);

  const st = calculateFinancialStatements(updated);
  assert.equal(st.isBalanceSheetBalanced, true);

  assert.throws(
    () => postDoubleEntryToAccounts(sampleAccounts, [{ accountCode: 'MISSING', debit: 1, credit: 0 }]),
    /unknown account/
  );
});

test('computeMultiLineInvoiceTotals computes discounted totals and cost of goods sold', () => {
  const res = computeMultiLineInvoiceTotals([
    { qty: 2, unitPrice: 1000000, discountPercent: 10, valuationRate: 800000 },
    { qty: 1, unitPrice: 500000, discountPercent: 0, valuationRate: 350000 },
  ]);
  assert.equal(res.grossAmount, 2500000);
  assert.equal(res.totalDiscount, 200000);
  assert.equal(res.netTotal, 2300000);
  assert.equal(res.grandTotal, 2300000);
  assert.equal(res.totalCogs, 1950000);
});

test('computeTrialBalance6Col produces balanced 6-column trial balance for گروه/کل/معین', () => {
  for (const level of ['گروه', 'کل', 'معین'] as const) {
    const tb = computeTrialBalance6Col(INITIAL_ACCOUNTS, level, INITIAL_GL_ENTRIES, 'همه شعب');
    assert.equal(tb.totals.isBalanced, true, `Trial balance must be balanced at level ${level}`);
    assert.equal(tb.totals.closingDebit, tb.totals.closingCredit);
  }
});

test('computeTrialBalance6Col includes reversal entries, uses parent links, and carries prior branch activity into opening balances', () => {
  const accounts = [
    { code: '1000', name: 'دارایی', category: 'دارایی' as const, level: 'گروه' as const, balance: 0 },
    { code: '1100', name: 'نقد', category: 'دارایی' as const, level: 'کل' as const, parentCode: '1000', balance: 0 },
    { code: '1101', name: 'بانک', category: 'دارایی' as const, level: 'معین' as const, parentCode: '1100', balance: 0 },
    { code: '2000', name: 'بدهی', category: 'بدهی' as const, level: 'گروه' as const, balance: 0 },
    { code: '2100', name: 'پرداختنی', category: 'بدهی' as const, level: 'کل' as const, parentCode: '2000', balance: 0 },
    { code: '2101', name: 'تامین‌کننده', category: 'بدهی' as const, level: 'معین' as const, parentCode: '2100', balance: 0 },
    { code: '4000', name: 'درآمد', category: 'درآمد' as const, level: 'گروه' as const, balance: 0 },
    { code: '4100', name: 'فروش', category: 'درآمد' as const, level: 'کل' as const, parentCode: '4000', balance: 0 },
    { code: '4101', name: 'فروش کالا', category: 'درآمد' as const, level: 'معین' as const, parentCode: '4100', balance: 0 },
  ];
  const entries = [
    { accountCode: '1101', debit: 100, credit: 0, branchDimension: 'شعبه A', postingDate: '۱۴۰۳/۱۲/۲۹' },
    { accountCode: '2101', debit: 0, credit: 100, branchDimension: 'شعبه A', postingDate: '۱۴۰۳/۱۲/۲۹' },
    { accountCode: '1101', debit: 200, credit: 0, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۱/۰۱' },
    { accountCode: '4101', debit: 0, credit: 200, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۱/۰۱' },
    { accountCode: '4101', debit: 50, credit: 0, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۲/۰۱', isCancelled: true },
    { accountCode: '1101', debit: 0, credit: 50, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۲/۰۱', isCancelled: true },
    { accountCode: '1101', debit: 999, credit: 0, branchDimension: 'شعبه B', postingDate: '۱۴۰۴/۰۲/۰۱' },
    { accountCode: '4101', debit: 0, credit: 999, branchDimension: 'شعبه B', postingDate: '۱۴۰۴/۰۲/۰۱' },
  ];

  const result = computeTrialBalance6Col(accounts, 'معین', entries, 'شعبه A', 'سال مالی ۱۴۰۴');
  const bank = result.rows.find((row) => row.code === '1101')!;
  const supplier = result.rows.find((row) => row.code === '2101')!;
  const revenue = result.rows.find((row) => row.code === '4101')!;

  assert.equal(bank.openingDebit, 100);
  assert.equal(bank.periodDebit, 200);
  assert.equal(bank.periodCredit, 50);
  assert.equal(bank.closingDebit, 250);
  assert.equal(supplier.openingCredit, 100);
  assert.equal(revenue.periodDebit, 50);
  assert.equal(revenue.periodCredit, 200);
  assert.equal(revenue.closingCredit, 150);
  assert.equal(result.totals.isBalanced, true);
  assert.equal(result.hasBranchOpeningBalance, false);

  const nextYear = computeTrialBalance6Col(
    accounts,
    'معین',
    entries,
    'همه شعب سازمان',
    'سال مالی ۱۴۰۵'
  );
  assert.equal(nextYear.totals.periodDebit, 0);
  assert.equal(nextYear.totals.periodCredit, 0);
  assert.equal(nextYear.rows.find((row) => row.code === '1101')?.openingDebit, 1249);
  assert.equal(nextYear.totals.isBalanced, true);
});

test('deductStockWithBundles values COGS from actual component stock, not virtual bundle valuation', () => {
  const inventory = [
    {
      sku: 'BUNDLE-1',
      name: 'پکیج تست',
      stockQty: 5,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [
        { sku: 'ITEM-1', name: 'کالای اول', qty: 2 },
        { sku: 'ITEM-2', name: 'کالای دوم', qty: 1 },
      ],
    },
    { sku: 'ITEM-1', name: 'کالای اول', stockQty: 10, valuationRate: 100 },
    { sku: 'ITEM-2', name: 'کالای دوم', stockQty: 10, valuationRate: 50 },
  ];

  const result = deductStockWithBundles(inventory, [{ sku: 'BUNDLE-1', qty: 2 }]);

  assert.equal(result.totalCogs, 500);
  assert.equal(result.updatedInventory.find((item) => item.sku === 'ITEM-1')?.stockQty, 6);
  assert.equal(result.updatedInventory.find((item) => item.sku === 'ITEM-2')?.stockQty, 8);
});

test('deductStockWithBundles dynamically deducts bundle component items and computes COGS', () => {
  const inventory = [
    {
      sku: 'BND-STARTER-PRO',
      name: 'پکیج تست',
      stockQty: 5,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [
        { sku: 'PK60-MANGO-50', name: 'کالای اول', qty: 1 },
        { sku: 'SALT-NASTY-30', name: 'کالای دوم', qty: 1 },
        { sku: 'COIL-XROS-06', name: 'کالای سوم', qty: 1 },
      ],
    },
    { sku: 'PK60-MANGO-50', name: 'کالای اول', stockQty: 10, valuationRate: 100 },
    { sku: 'SALT-NASTY-30', name: 'کالای دوم', stockQty: 10, valuationRate: 50 },
    { sku: 'COIL-XROS-06', name: 'کالای سوم', stockQty: 10, valuationRate: 25 },
  ];
  const bundleBefore = inventory.find((i) => i.sku === 'BND-STARTER-PRO')!;
  const mangoBefore = inventory.find((i) => i.sku === 'PK60-MANGO-50')!;
  const saltBefore = inventory.find((i) => i.sku === 'SALT-NASTY-30')!;
  const coilBefore = inventory.find((i) => i.sku === 'COIL-XROS-06')!;

  const res = deductStockWithBundles(inventory, [
    { sku: 'BND-STARTER-PRO', qty: 2 },
  ]);
  const bundleAfter = res.updatedItems.find((i) => i.sku === 'BND-STARTER-PRO')!;
  const mangoAfter = res.updatedItems.find((i) => i.sku === 'PK60-MANGO-50')!;
  const saltAfter = res.updatedItems.find((i) => i.sku === 'SALT-NASTY-30')!;
  const coilAfter = res.updatedItems.find((i) => i.sku === 'COIL-XROS-06')!;

  assert.equal(bundleAfter.stockQty, bundleBefore.stockQty - 2);
  assert.equal(mangoAfter.stockQty, mangoBefore.stockQty - 2);
  assert.equal(saltAfter.stockQty, saltBefore.stockQty - 2);
  assert.equal(coilAfter.stockQty, coilBefore.stockQty - 2);
  assert.ok(res.totalCogs > 0);
});

test('deductStockWithBundles rejects insufficient stock without changing inventory', () => {
  const inventory = [
    {
      sku: 'BUNDLE-1',
      name: 'پکیج تست',
      stockQty: 2,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [{ sku: 'ITEM-1', name: 'کالای تست', qty: 2 }],
    },
    { sku: 'ITEM-1', name: 'کالای تست', stockQty: 3, valuationRate: 100 },
  ];

  const result = deductStockWithBundles(inventory, [{ sku: 'BUNDLE-1', qty: 2 }]);

  assert.ok(result.insufficientStockError);
  assert.deepEqual(result.updatedInventory, inventory);
  assert.equal(result.totalCogs, 0);
});

test('restoreStockWithBundles restores bundle and all component quantities', () => {
  const inventory = [
    {
      sku: 'BND-STARTER-PRO',
      name: 'پکیج تست',
      stockQty: 5,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [
        { sku: 'PK60-MANGO-50', name: 'کالای اول', qty: 1 },
        { sku: 'SALT-NASTY-30', name: 'کالای دوم', qty: 1 },
        { sku: 'COIL-XROS-06', name: 'کالای سوم', qty: 1 },
      ],
    },
    { sku: 'PK60-MANGO-50', name: 'کالای اول', stockQty: 10, valuationRate: 100 },
    { sku: 'SALT-NASTY-30', name: 'کالای دوم', stockQty: 10, valuationRate: 50 },
    { sku: 'COIL-XROS-06', name: 'کالای سوم', stockQty: 10, valuationRate: 25 },
  ];
  const deducted = deductStockWithBundles(inventory, [
    { sku: 'BND-STARTER-PRO', qty: 2 },
  ]);
  const restored = restoreStockWithBundles(deducted.updatedInventory, [
    { sku: 'BND-STARTER-PRO', qty: 2 },
  ]);

  for (const item of inventory) {
    assert.equal(
      restored.find((restoredItem) => restoredItem.sku === item.sku)?.stockQty,
      item.stockQty
    );
  }
});

test('shareholder rule snapshots apply only from their effective date and preserve the prior rates', () => {
  const snapshot = {
    id: 'snapshot-1',
    effectiveDate: '۱۴۰۴/۰۸/۱۰',
    partner1Name: 'شریک اول',
    partner1CapitalPct: 60,
    partner1ProfitPct: 80,
    previousPartner1CapitalPct: 50,
    previousPartner1ProfitPct: 70,
    partner2Name: 'شریک دوم',
    partner2CapitalPct: 40,
    partner2ProfitPct: 20,
    previousPartner2CapitalPct: 50,
    previousPartner2ProfitPct: 30,
    frozenPartner1Wallet: 0,
    frozenPartner2Wallet: 0,
    frozenRecoveryPool: 0,
    note: '',
  };
  const currentRates = {
    partner1CapitalPct: 60,
    partner1ProfitPct: 80,
    partner2CapitalPct: 40,
    partner2ProfitPct: 20,
  };

  assert.deepEqual(
    resolveShareholderRatesAtDate('۱۴۰۴/۰۸/۰۹', [snapshot], currentRates),
    {
      partner1CapitalPct: 50,
      partner1ProfitPct: 70,
      partner2CapitalPct: 50,
      partner2ProfitPct: 30,
    }
  );
  assert.deepEqual(
    resolveShareholderRatesAtDate('۱۴۰۴/۰۸/۱۰', [snapshot], currentRates),
    currentRates
  );
});

test('calculateThreeBucketShareholderState separates 50/50 capital recovery from 70/30 net profit and flags 30% partner negative deficit on expansion', () => {
  const res = calculateThreeBucketShareholderState({
    initialInventoryCapital: 100000000,
    totalRevenue: 15000000,
    totalCogs: 10000000,
    totalOperatingExpenses: 1000000,
    totalNewPurchasesAmount: 18000000, // 8,000,000 above recovered COGS -> 4,000,000 per partner (50/50)
    partners: [
      {
        id: 'sh-1',
        name: 'شریک اول',
        capitalSharePercent: 50,
        profitSharePercent: 70,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
      {
        id: 'sh-2',
        name: 'شریک دوم',
        capitalSharePercent: 50,
        profitSharePercent: 30,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
    ],
    chargeExpansionToWallet: true,
  });

  // Net Profit = 15,000,000 - 10,000,000 - 1,000,000 = 4,000,000
  assert.equal(res.netProfit, 4000000);
  // Bucket 1 recovered 10M COGS and used all 10M toward the 18M purchase; 8M new capital needed
  assert.equal(res.bucket1RecoveredCogs, 10000000);
  assert.equal(res.bucket1UsedForPurchases, 10000000);
  assert.equal(res.totalNewCapitalNeeded, 8000000);

  // Partner 1 (70% profit = 2,800,000; 50% expansion charge = 4,000,000 -> -1,200,000)
  assert.equal(res.partners[0].profitAllocated, 2800000);
  assert.equal(res.partners[0].capitalExpansionCharge, 4000000);
  assert.equal(res.partners[0].walletBalance, -1200000);

  // Partner 2 (30% profit = 1,200,000; 50% expansion charge = 4,000,000 -> -2,800,000 negative deficit)
  assert.equal(res.partners[1].profitAllocated, 1200000);
  assert.equal(res.partners[1].capitalExpansionCharge, 4000000);
  assert.equal(res.partners[1].walletBalance, -2800000);
  assert.equal(res.partners[1].isNegativeDeficit, true);
});

test('calculateThreeBucketShareholderState splits 50/50 profit directly into partner wallets without capital purchase penalties', () => {
  // Test case: 2,000,000 purchase, 2,200,000 sale, COGS = 2,000,000 -> 200,000 net profit
  const res = calculateThreeBucketShareholderState({
    initialInventoryCapital: 2000000,
    totalRevenue: 2200000,
    totalCogs: 2000000,
    totalOperatingExpenses: 0,
    totalNewPurchasesAmount: 2000000,
    partners: [
      {
        id: 'sh-1',
        name: 'شریک اول (۵۰٪)',
        capitalSharePercent: 50,
        profitSharePercent: 50,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
      {
        id: 'sh-2',
        name: 'شریک دوم (۵۰٪)',
        capitalSharePercent: 50,
        profitSharePercent: 50,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
    ],
  });

  assert.equal(res.netProfit, 200000);
  assert.equal(res.partners[0].profitAllocated, 100000);
  assert.equal(res.partners[1].profitAllocated, 100000);
  assert.equal(res.partners[0].walletBalance, 100000);
  assert.equal(res.partners[1].walletBalance, 100000);
  assert.equal(res.partners[0].withdrawableBalance, 100000);
  assert.equal(res.partners[1].withdrawableBalance, 100000);
  assert.equal(res.partners[0].isNegativeDeficit, false);
  assert.equal(res.partners[1].isNegativeDeficit, false);
  assert.equal(res.partnerWallets.partner1, 100000);
  assert.equal(res.partnerWallets.partner2, 100000);
});

test('deductDecantMlFromBottle opens a sealed bottle when needed and computes exact per-ml COGS', () => {
  assert.equal(calculateCostPerMl(600000, 60), 10000);

  const res = deductDecantMlFromBottle({
    stockBottles: 3,
    bottleVolumeMl: 60,
    openBottleRemainingMl: 5,
    bottleValuationRate: 600000,
    soldMl: 15,
  });

  assert.equal(res.success, true);
  assert.equal(res.newStockBottles, 2); // 1 bottle opened (5 + 60 - 15 = 50 ml left)
  assert.equal(res.newOpenBottleRemainingMl, 50);
  assert.equal(res.costPerMl, 10000);
  assert.equal(res.lineCogs, 150000);
});

test('consumeFifoLayers consumes oldest purchase layers first for computer parts', () => {
  const fifo = consumeFifoLayers(
    [
      { qty: 2, unitCost: 10000000, date: '۱۴۰۴/۰۷/۰۱' },
      { qty: 3, unitCost: 12000000, date: '۱۴۰۴/۰۸/۰۱' },
    ],
    3,
    12000000
  );

  // 2 * 10M + 1 * 12M = 32M
  assert.equal(fifo.totalCogs, 32000000);
  assert.equal(fifo.remainingLayers.length, 1);
  assert.equal(fifo.remainingLayers[0].qty, 2);
  assert.equal(fifo.nextValuationRate, 12000000);
});

test('smartFilterAndRankItems ranks case-insensitive exact matches first followed by partial matches', () => {
  const items = [
    { sku: 'VGOD-MANGO-25', name: 'سالت ویگاد انبه', brand: 'VGOD' },
    { sku: 'vgod', name: 'پاد ویگاد', brand: 'VGOD' },
  ];
  const ranked = smartFilterAndRankItems(items, 'VGOD');
  assert.equal(ranked[0].sku, 'vgod');
  assert.equal(ranked[1].sku, 'VGOD-MANGO-25');
});

test('voidInvoice marks invoice as Cancelled and generates compensating reversal entries for inventory and GL', () => {
  const initialInventory = [
    { sku: 'SALT-NASTY-30', stockQty: 8 },
    { sku: 'COIL-XROS-06', stockQty: 15 },
  ];
  const salesInvoice = {
    id: 'sinv-101',
    invoiceNo: 'POS-1404-1001',
    docstatus: 1,
    status: 'پرداخت‌شده',
    totalAmount: 1200000,
    paidAmount: 1000000,
    cogsAmount: 820000,
    paymentAccountCode: '110101',
    lines: [{ sku: 'SALT-NASTY-30', qty: 2, valuationRate: 410000 }],
  };

  const res = voidInvoice({
    invoice: salesInvoice,
    invoiceType: 'sales',
    inventory: initialInventory,
  });

  assert.equal(res.voidedInvoice.docstatus, 2);
  assert.equal(res.voidedInvoice.status, 'ابطال‌شده');
  assert.equal(res.voidedInvoice.cancelledStatus, 'Cancelled');
  // Stock restored from 8 to 10
  assert.equal(
    res.restoredInventory.find((i) => i.sku === 'SALT-NASTY-30')?.stockQty,
    10
  );
  // Double-entry reversal is balanced
  const totalDebit = res.reversalLedgerLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = res.reversalLedgerLines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
});

test('voidInvoice restores decant millilitres to the original bottle and virtual open-bottle balance', () => {
  const initialInventory = [
    {
      sku: 'JUICE-60',
      stockQty: 2,
      bottleVolumeMl: 60,
      openBottleRemainingMl: 15,
    },
    {
      sku: 'decant_JUICE-60',
      stockQty: 15,
      isVirtualDecantBottle: true,
      parentBottleSku: 'JUICE-60',
      warehouseStock: { vitrine: 15 },
    },
  ];
  const result = voidInvoice({
    invoice: {
      id: 'decant-sale',
      docstatus: 1,
      status: 'پرداخت‌شده',
      totalAmount: 50000,
      paidAmount: 50000,
      cogsAmount: 25000,
      lines: [{ sku: 'JUICE-60', qty: 5, isDecantMl: true }],
    },
    invoiceType: 'sales',
    inventory: initialInventory,
  });

  assert.equal(
    result.restoredInventory.find((item) => item.sku === 'JUICE-60')?.openBottleRemainingMl,
    20
  );
  assert.equal(
    result.restoredInventory.find((item) => item.sku === 'decant_JUICE-60')?.stockQty,
    20
  );
});

test('voidInvoice removes an unconsumed purchase receipt from warehouse and FIFO layers', () => {
  const result = voidInvoice({
    invoice: {
      id: 'purchase-source-1',
      billNo: 'BILL-1',
      docstatus: 1,
      status: 'تسویه‌شده',
      totalAmount: 160,
      paidAmount: 160,
      deliveryStatus: 'رسیده',
      skuBreakdownCompleted: true,
      warehouse: 'central_external',
      lines: [
        {
          sku: 'PC-RAM',
          qty: 2,
          valuationRate: 80,
          warehouseKey: 'central_external',
        },
      ],
    },
    invoiceType: 'purchase',
    inventory: [
      {
        sku: 'PC-RAM',
        stockQty: 5,
        sector: 'pc' as const,
        valuationRate: 80,
        warehouseStock: { central_external: 5 },
        warehouseValuationRates: { central_external: 80 },
        fifoLayers: [
          { qty: 2, unitCost: 80, date: '۱۴۰۴/۰۸/۰۱', sourceVoucherId: 'purchase-source-1' },
          { qty: 3, unitCost: 110, date: '۱۴۰۴/۰۸/۰۲', sourceVoucherId: 'purchase-source-2' },
        ],
        warehouseFifoLayers: {
          central_external: [
            { qty: 2, unitCost: 80, date: '۱۴۰۴/۰۸/۰۱', sourceVoucherId: 'purchase-source-1' },
            { qty: 3, unitCost: 110, date: '۱۴۰۴/۰۸/۰۲', sourceVoucherId: 'purchase-source-2' },
          ],
        },
      },
    ],
  });

  const item = result.restoredInventory[0];
  assert.equal(result.errorMessage, undefined);
  assert.equal(item.stockQty, 3);
  assert.equal(item.warehouseStock?.central_external, 3);
  assert.equal(item.fifoLayers?.length, 1);
  assert.equal(item.fifoLayers?.[0].sourceVoucherId, 'purchase-source-2');
  assert.equal(item.warehouseFifoLayers?.central_external?.length, 1);
  assert.equal(item.valuationRate, 110);

  const partlyConsumed = voidInvoice({
    invoice: {
      id: 'purchase-source-1',
      billNo: 'BILL-1',
      docstatus: 1,
      status: 'تسویه‌شده',
      totalAmount: 160,
      paidAmount: 160,
      deliveryStatus: 'رسیده',
      skuBreakdownCompleted: true,
      warehouse: 'central_external',
      lines: [
        {
          sku: 'PC-RAM',
          qty: 2,
          valuationRate: 80,
          warehouseKey: 'central_external',
        },
      ],
    },
    invoiceType: 'purchase',
    inventory: [
      {
        sku: 'PC-RAM',
        stockQty: 4,
        sector: 'pc' as const,
        valuationRate: 80,
        warehouseStock: { central_external: 4 },
        fifoLayers: [
          { qty: 1, unitCost: 80, date: '۱۴۰۴/۰۸/۰۱', sourceVoucherId: 'purchase-source-1' },
          { qty: 3, unitCost: 110, date: '۱۴۰۴/۰۸/۰۲', sourceVoucherId: 'purchase-source-2' },
        ],
        warehouseFifoLayers: {
          central_external: [
            { qty: 1, unitCost: 80, date: '۱۴۰۴/۰۸/۰۱', sourceVoucherId: 'purchase-source-1' },
            { qty: 3, unitCost: 110, date: '۱۴۰۴/۰۸/۰۲', sourceVoucherId: 'purchase-source-2' },
          ],
        },
      },
    ],
  });
  assert.match(partlyConsumed.errorMessage || '', /فایفو|FIFO/);
  assert.equal(partlyConsumed.restoredInventory[0].stockQty, 4);
});

test('MWA and FIFO support standard 2-decimal precision and Three-Bucket exposes inventoryRecoveryShare and partnerWallets', () => {
  const mwa = calculateMovingAverageValuation(2, 100.25, 1, 100.75);
  assert.equal(mwa.newQty, 3);
  assert.equal(mwa.newValuationRate, 100.42);

  const tb = calculateThreeBucketShareholderState({
    initialInventoryCapital: 50000000,
    totalRevenue: 20000000,
    totalCogs: 12000000,
    totalOperatingExpenses: 2000000,
    totalNewPurchasesAmount: 10000000,
    partners: [
      {
        id: 'sh-1',
        name: 'شریک اول',
        capitalSharePercent: 50,
        profitSharePercent: 70,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
      {
        id: 'sh-2',
        name: 'شریک دوم',
        capitalSharePercent: 50,
        profitSharePercent: 30,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
    ],
  });
  assert.equal(tb.inventoryRecoveryShare, 12000000);
  assert.equal(tb.netProfit, 6000000);
  assert.equal(tb.partnerWallets.partner70, 4200000);
  assert.equal(tb.partnerWallets.partner30, 1800000);
});

test('exactAdd and exactSub eliminate IEEE-754 floating-point drift and Time-Machine computeSnapshotDiff detects stock and balance deltas', () => {
  assert.equal(exactAdd(0.1, 0.2), 0.3);
  assert.equal(exactSub(0.3, 0.1), 0.2);

  const snapState = {
    accounts: [{ code: '110101', name: 'کارتخوان', balance: 1000000 }],
    salesInvoices: [{ id: 's1', totalAmount: 1000000, docstatus: 1 }],
    purchaseInvoices: [],
    inventoryItems: [{ sku: 'SKU-1', name: 'سالت انبه', stockQty: 10, valuationRate: 400000 }],
  };
  const snapChecksum = computeSnapshotChecksum(snapState);

  const liveState = {
    accounts: [{ code: '110101', name: 'کارتخوان', balance: 1500000 }],
    salesInvoices: [
      { id: 's1', totalAmount: 1000000, docstatus: 1 },
      { id: 's2', totalAmount: 500000, docstatus: 1 },
    ],
    purchaseInvoices: [],
    inventoryItems: [{ sku: 'SKU-1', name: 'سالت انبه', stockQty: 8, valuationRate: 400000 }],
  };

  const diff = computeSnapshotDiff({ ...snapState, checksum: snapChecksum }, liveState);
  assert.equal(diff.isIdentical, false);
  assert.equal(diff.salesInvoiceCountDiff, 1);
  assert.equal(diff.salesTotalDiff, 500000);
  assert.equal(diff.skuChanges.length, 1);
  assert.equal(diff.skuChanges[0].diffQty, -2);
  assert.equal(diff.accountChanges.length, 1);
  assert.equal(diff.accountChanges[0].diffBalance, 500000);
});

test('Time-Machine snapshots include master option and category sector changes in their checksum', () => {
  const state = {
    accounts: [],
    salesInvoices: [],
    purchaseInvoices: [],
    inventoryItems: [],
    masterOptions: {
      tags: ['سیستم پاد ماد'],
      conditions: ['آکبند'],
      itemTypes: [],
      nicotines: [],
      puffs: [],
      colors: [],
      resistances: [],
      liquidVolumes: [],
      podCapacities: [],
    },
    categorySectors: { 'سیستم پاد ماد': 'vape' as const },
  };
  const checksum = computeSnapshotChecksum(state);

  assert.notEqual(
    computeSnapshotChecksum({
      ...state,
      masterOptions: { ...state.masterOptions, tags: ['سیستم پاد ماد', 'دسته آزمایشی'] },
    }),
    checksum
  );
  assert.notEqual(
    computeSnapshotChecksum({
      ...state,
      categorySectors: { 'سیستم پاد ماد': 'pc' },
    }),
    checksum
  );
});

test('transferWarehouseValuationLayer preserves FIFO layers across warehouses and calculateThreeBucketShareholderState auto-settles negative partner deficit', () => {
  const transferred = transferWarehouseValuationLayer({
    sector: 'pc',
    fromWarehouse: 'shop_storage',
    toWarehouse: 'vitrine',
    transferQty: 3,
    fallbackValuationRate: 400000,
    transferDate: '۱۴۰۴/۰۱/۲۵',
    warehouseStock: {
      vitrine: 0,
      shop_storage: 5,
      central_external: 0,
      consignment: 0,
    },
    warehouseValuationRates: {
      shop_storage: 400000,
    },
    warehouseFifoLayers: {
      shop_storage: [
        { qty: 2, unitCost: 350000, date: '۱۴۰۴/۰۱/۱۰' },
        { qty: 3, unitCost: 433333.33, date: '۱۴۰۴/۰۱/۲۰' },
      ],
    },
  });

  assert.equal(transferred.transferredUnitCost, 377777.78);
  assert.equal(transferred.updatedWarehouseFifoLayers.vitrine?.length, 1);

  const consumed = consumeWarehouseFifoLayers({
    warehouseKey: 'vitrine',
    soldQty: 2,
    fallbackUnitCost: 400000,
    warehouseFifoLayers: transferred.updatedWarehouseFifoLayers,
  });
  assert.equal(consumed.totalCogs, 755555.56);

  const deficitSettlement = calculateThreeBucketShareholderState({
    initialInventoryCapital: 20000000,
    totalRevenue: 15000000,
    totalCogs: 8000000,
    totalOperatingExpenses: 1000000,
    totalNewPurchasesAmount: 4000000,
    partners: [
      {
        id: 'sh-1',
        name: 'شریک اول (سرمایه‌گذار بیشتر)',
        capitalSharePercent: 50,
        profitSharePercent: 70,
        personalCapitalInjected: 2000000,
        withdrawals: 0,
      },
      {
        id: 'sh-2',
        name: 'شریک دوم (بدهکار از برداشت قبلی)',
        capitalSharePercent: 50,
        profitSharePercent: 30,
        personalCapitalInjected: 0,
        withdrawals: 2500000,
      },
    ],
  });

  const debtorPartner = deficitSettlement.partners.find((p) => p.id === 'sh-2');
  assert.ok(debtorPartner);
  assert.equal(debtorPartner.profitAllocated, 1800000);
  assert.equal(debtorPartner.autoSettledDeficitAmount, 1800000);
  assert.equal(debtorPartner.withdrawableBalance, 0);
  assert.equal(debtorPartner.walletBalance, -700000);
});

test('isApproximatelyEqual handles IEEE-754 floating point inaccuracies', () => {
  assert.ok(isApproximatelyEqual(0.1 + 0.2, 0.3));
  assert.ok(isApproximatelyEqual(1000.005, 1000.009, 0.01));
  assert.ok(!isApproximatelyEqual(1000, 1001, 0.01));
});

test('allocateHeaderDiscountLargestRemainder distributes total discount exactly without rounding drift', () => {
  const lines = [
    { id: 'item-1', grossAmount: 100000 },
    { id: 'item-2', grossAmount: 100000 },
    { id: 'item-3', grossAmount: 100000 },
  ];
  const allocated = allocateHeaderDiscountLargestRemainder(lines, 10000);
  assert.equal(allocated.size, 3);
  let sum = 0;
  for (const v of allocated.values()) sum += v;
  assert.equal(sum, 10000);
  // Two get 3333, one gets 3334 (sum = 10000)
  assert.deepEqual(
    Array.from(allocated.values()).sort(),
    [3333, 3333, 3334]
  );
});

test('normalizePersianInput standardizes Arabic Yeh/Kaf and Persian numbers', () => {
  const raw = 'يک كالا با قیمت ۱۲۵۰۰ و ٤٥٦';
  const normalized = normalizePersianInput(raw);
  assert.equal(normalized, 'یک کالا با قیمت 12500 و 456');
});

test('addJalaliMonths handles leap years and clamps end-of-month dates properly', () => {
  // 1404/06/31 + 1 month -> Month 7 has 30 days -> 1404/07/30
  const clamped = addJalaliMonths('1404/06/31', 1);
  assert.equal(clamped, '1404/07/30');

  // Month addition crossing year boundary: 1404/11/15 + 3 months -> 1405/02/15
  const nextYear = addJalaliMonths('1404/11/15', 3);
  assert.equal(nextYear, '1405/02/15');

  // Esfand day clamping in non-leap year (month 12 has 29 days)
  assert.equal(getJalaliMonthDays(1403, 12), 30); // 1403 was leap
  assert.equal(getJalaliMonthDays(1404, 12), 29); // 1404 is not leap
  assert.equal(isJalaliLeapYear(1403), true);
  assert.equal(isJalaliLeapYear(1404), false);
});

test('buildChequeStatusTransitionLedgerLines generates compliant double-entry records', () => {
  const cheque = {
    id: 'ch-1',
    chequeNumber: '123456789',
    amount: 5000000,
    dueDate: '1404/08/15',
    issuer: 'خریدار محترم',
    status: 'در جریان وصول' as const,
    type: 'دریافتی' as const,
  };

  // Transition to وصول شده
  const clearedLines = buildChequeStatusTransitionLedgerLines(
    cheque,
    'وصول شده',
    '1101' // Bank
  );
  assert.equal(clearedLines.length, 2);
  const totalDebit = clearedLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = clearedLines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
  assert.equal(totalDebit, 5000000);
  assert.equal(clearedLines[0].accountCode, '1101'); // Bank debit
  assert.equal(clearedLines[1].accountCode, '1103'); // Cheque in transit credit

  // Transition to برگشت خورده
  const bouncedLines = buildChequeStatusTransitionLedgerLines(
    cheque,
    'برگشت خورده'
  );
  assert.equal(bouncedLines.length, 2);
  assert.equal(bouncedLines[0].accountCode, '1102'); // Accounts receivable debit
  assert.equal(bouncedLines[1].accountCode, '1103'); // Cheque in transit credit
});

test('validateAccountDisbursement protects cash accounts from negative balances unless overdraft permitted', () => {
  const cashAccount = {
    code: '1101',
    name: 'صندوق فروشگاه',
    balance: 200000,
  };

  const valid = validateAccountDisbursement(cashAccount, 150000);
  assert.equal(valid.isValid, true);

  const invalid = validateAccountDisbursement(cashAccount, 500000);
  assert.equal(invalid.isValid, false);
  assert.ok(invalid.errorMessage?.includes('کافی نیست'));

  const overdraftAllowed = validateAccountDisbursement(cashAccount, 500000, true);
  assert.equal(overdraftAllowed.isValid, true);
});

test('isDocumentInClosedPeriod prevents modification in frozen fiscal periods', () => {
  assert.equal(isDocumentInClosedPeriod('1403/12/29', '1404/01/01'), true);
  assert.equal(isDocumentInClosedPeriod('1404/05/10', '1404/01/01'), false);
  assert.equal(isDocumentInClosedPeriod('1404/05/10', undefined), false);
});

test('recordDecantWastageScrap accurately calculates cost of wasted ml and builds double entries', () => {
  const bottle = {
    sku: 'TF-50',
    stockQty: 0,
    openBottleRemainingMl: 30,
    valuationRate: 5000000,
    bottleVolumeMl: 50,
  };

  const result = recordDecantWastageScrap({
    sku: 'TF-50',
    scrapMl: 5,
    item: bottle,
  });

  assert.equal(result.scrapCost, 500000); // 5000000 / 50 * 5 = 500,000
  assert.equal(result.updatedOpenMl, 25);
  assert.equal(result.scrapLedgerLines.length, 2);
  assert.equal(result.scrapLedgerLines[0].accountCode, '5204'); // هزینه ضایعات انبار و استهلاک
  assert.equal(result.scrapLedgerLines[0].debit, 500000);
  assert.equal(result.scrapLedgerLines[1].accountCode, '110401'); // موجودی کالا
  assert.equal(result.scrapLedgerLines[1].credit, 500000);
});

test('buildSalesInvoiceLedgerLines supports split/composite payments across cash, POS and credit', () => {
  const lines = buildSalesInvoiceLedgerLines({
    totalAmount: 1000000,
    paidAmount: 800000,
    cogsAmount: 600000,
    updateStock: true,
    isReverse: false,
    payments: [
      { accountCode: '1101', amount: 300000 }, // صندوق نقد
      { accountCode: '110101', amount: 500000 }, // پوز بانکی
      { accountCode: '1102', amount: 200000 }, // نسیه / حساب دریافتنی
    ],
  });

  const revenueLine = lines.find((l) => l.accountCode === '4101');
  assert.equal(revenueLine?.credit, 1000000);

  const cashLine = lines.find((l) => l.accountCode === '1101');
  assert.equal(cashLine?.debit, 300000);

  const posLine = lines.find((l) => l.accountCode === '110101');
  assert.equal(posLine?.debit, 500000);

  const receivableLine = lines.find((l) => l.accountCode === '1102');
  assert.equal(receivableLine?.debit, 200000);
});

test('isLeafAccount correctly identifies terminal detail accounts vs parent groups', () => {
  const accounts = [
    { code: '1000', name: 'دارایی‌ها' },
    { code: '1100', name: 'دارایی جاری', parentCode: '1000' },
    { code: '1101', name: 'موجودی نقد', parentCode: '1100' },
    { code: '110101', name: 'صندوق مغازه', parentCode: '1101' },
  ];

  assert.equal(isLeafAccount('1000', accounts), false);
  assert.equal(isLeafAccount('1100', accounts), false);
  assert.equal(isLeafAccount('1101', accounts), false);
  assert.equal(isLeafAccount('110101', accounts), true);
  assert.equal(isLeafAccount('9999', accounts), false);
});

test('validateJournalEntry blocks posting directly to parent/group accounts when leaf codes enforced', () => {
  const lines = [
    { id: '1', accountCode: '1100', accountName: 'دارایی جاری', debit: 500000, credit: 0 },
    { id: '2', accountCode: '110101', accountName: 'صندوق', debit: 0, credit: 500000 },
  ];
  const validCodes = new Set(['1100', '110101']);
  const leafCodes = new Set(['110101']);

  const result = validateJournalEntry(lines, validCodes, leafCodes);
  assert.equal(result.isValid, false);
  assert.ok(result.errorMessage?.includes('سرگروه و کل'));
});

test('calculatePartyNetBalance and buildPartyContraEntry handle dual-role customer/supplier netting', () => {
  const partyId = 'cust-101';
  const glEntries = [
    // Customer bought goods on credit (debit 1102: 8,000,000)
    { id: '1', partyId, accountCode: '1102', debit: 8000000, credit: 0 },
    // Later supplied goods to us on credit (credit 2101: 5,000,000)
    { id: '2', partyId, accountCode: '2101', debit: 0, credit: 5000000 },
  ];

  const net = calculatePartyNetBalance(partyId, glEntries);
  assert.equal(net.receivable, 8000000);
  assert.equal(net.payable, 5000000);
  assert.equal(net.netBalance, 3000000); // Customer net owes us 3M

  // Build contra entry to offset the 5,000,000 payable against receivable
  const contraLines = buildPartyContraEntry({
    partyId,
    partyName: 'همکار / مشتری نمونه',
    contraAmount: 5000000,
    date: '1404/08/15',
    voucherNo: 'CNTR-01',
  });

  assert.equal(contraLines.length, 2);
  assert.equal(contraLines[0].accountCode, '2101');
  assert.equal(contraLines[0].debit, 5000000); // Debit accounts payable
  assert.equal(contraLines[1].accountCode, '1102');
  assert.equal(contraLines[1].credit, 5000000); // Credit accounts receivable
});

test('calculateFixedAssetMonthlyDepreciation and buildDepreciationLedgerLines compute monthly straight-line depreciation', () => {
  const asset = {
    id: 'ast-1',
    name: 'دستگاه اسپرسوساز مغازه',
    acquisitionCost: 36000000,
    salvageValue: 0,
    usefulLifeMonths: 36, // 3 years -> 1,000,000 per month
  };

  const monthlyDep = calculateFixedAssetMonthlyDepreciation(asset);
  assert.equal(monthlyDep, 1000000);

  const lines = buildDepreciationLedgerLines({
    assetId: asset.id,
    assetName: asset.name,
    depreciationAmount: monthlyDep,
    date: '1404/08/30',
    voucherNo: 'DEP-01',
  });

  assert.equal(lines.length, 2);
  assert.equal(lines[0].accountCode, '5204'); // Expense debit
  assert.equal(lines[0].debit, 1000000);
  assert.equal(lines[1].accountCode, '1202'); // Accumulated depreciation credit
  assert.equal(lines[1].credit, 1000000);
});

test('buildFiscalYearClosingLedgerLines zeroes temporary revenue & expense accounts into retained earnings', () => {
  const glEntries = [
    // Revenue: 10,000,000
    { accountCode: '4101', debit: 0, credit: 10000000 },
    // Expense: 6,000,000
    { accountCode: '5101', debit: 6000000, credit: 0 },
    // Expense: 1,000,000
    { accountCode: '5201', debit: 1000000, credit: 0 },
  ];

  const closingLines = buildFiscalYearClosingLedgerLines({
    glEntries,
    fiscalYear: '۱۴۰۳',
    closingDate: '۱۴۰۳/۱۲/۲۹',
    voucherNo: 'CLS-1403',
    retainedEarningsAccountCode: '3102',
  });

  // Net Profit = 10M - 7M = 3,000,000
  assert.equal(closingLines.length, 4);
  const revLine = closingLines.find((l) => l.accountCode === '4101');
  assert.equal(revLine?.debit, 10000000); // Revenue debited to 0

  const cogsLine = closingLines.find((l) => l.accountCode === '5101');
  assert.equal(cogsLine?.credit, 6000000); // COGS credited to 0

  const rentLine = closingLines.find((l) => l.accountCode === '5201');
  assert.equal(rentLine?.credit, 1000000); // Rent credited to 0

  const retainedLine = closingLines.find((l) => l.accountCode === '3102');
  assert.equal(retainedLine?.credit, 3000000); // Net profit credited to Retained Earnings
});

test('runAccountingSanityCheck passes when accounts and inventories satisfy the 5 golden equations', () => {
  const report = runAccountingSanityCheck({
    glEntries: [
      { debit: 1000000, credit: 0 },
      { debit: 0, credit: 1000000 },
    ],
    inventoryItems: [
      {
        sku: 'VAPE-1',
        stockQty: 10,
        warehouseStock: { vitrine: 6, store: 4 },
      },
    ],
    accounts: [
      { code: '1101', balance: 5000000 },
      { code: '2101', balance: 1000000 },
    ],
    shareholderWithdrawableTotal: 3000000,
  });

  assert.equal(report.isHealthy, true);
  assert.equal(report.errors.length, 0);
  assert.equal(report.equations.glDebitCreditBalance.balanced, true);
  assert.equal(report.equations.warehouseStockMatchesTotal.passed, true);
});

test('buildSalesInvoiceLedgerLines correctly separates VAT tax into account 2103 and tags costCenter', () => {
  const lines = buildSalesInvoiceLedgerLines({
    totalAmount: 1100000,
    paidAmount: 1100000,
    cogsAmount: 600000,
    updateStock: true,
    isReverse: false,
    taxAmount: 100000,
    taxAccountCode: '2103',
    costCenter: 'CC-VAPE',
    partyId: 'cust-50',
    partyName: 'مشتری شرکتی',
  });

  const taxLine = lines.find((l) => l.accountCode === '2103');
  assert.ok(taxLine);
  assert.equal(taxLine.credit, 100000);
  assert.equal(taxLine.costCenter, 'CC-VAPE');
  assert.equal(taxLine.partyId, 'cust-50');

  const revLine = lines.find((l) => l.accountCode === '4101');
  assert.ok(revLine);
  assert.equal(revLine.credit, 1000000); // 1.1M - 100K tax
  assert.equal(revLine.costCenter, 'CC-VAPE');
});

test('comparePersianDates and normalizeCalendarDigits handle mixed Persian and Latin date sorting accurately', () => {
  const dates = ['۱۴۰۴/۰۲/۱۵', '1404/01/10', '۱۴۰۴/۰۸/۰۱', '1403/12/29'];
  const sorted = [...dates].sort(comparePersianDates);

  assert.deepEqual(sorted, [
    '1403/12/29',
    '1404/01/10',
    '۱۴۰۴/۰۲/۱۵',
    '۱۴۰۴/۰۸/۰۱',
  ]);

  assert.equal(normalizeCalendarDigits('۱۴۰۴/۲/۵'), '1404/02/05');
  assert.equal(normalizeCalendarDigits('1404-05-09'), '1404/05/09');
});

test('calculatePosCartTotals from posService proportionally allocates manual and loyalty discounts to lines', () => {
  const dummyItem = {
    id: 'item-1',
    sku: 'SKU-1',
    name: 'تست ۱',
    category: 'جویس و سالت',
    condition: 'آکبند',
    uomPrimary: 'عدد',
    stockQty: 10,
    valuationRate: 100000,
    retailPrice: 200000,
    wholesalePrice: 180000,
    partnerPrice: 170000,
    serialNumbers: [],
    batchNo: 'B1',
    expiryDate: '1405/01/01',
  } as any;

  const res = calculateCartRowTotals({
    cart: [
      { rowId: 'r1', item: dummyItem, qty: 1, isDecantMl: false, manualUnitPrice: 200000 },
      { rowId: 'r2', item: dummyItem, qty: 1, isDecantMl: false, manualUnitPrice: 300000 },
    ],
    serviceLines: [],
    pricingMode: 'normal',
    promotionRules: [],
    paidAmountInput: null,
    manualCartDiscount: 50000,
    loyaltyRedeemAmount: 50000,
  });

  assert.equal(res.goodsTotal, 500000);
  assert.equal(res.totalHeaderDiscount, 100000);
  assert.equal(res.grandTotal, 400000);
  assert.equal(res.cartLinesWithDiscount.length, 2);

  const r1 = res.cartLinesWithDiscount.find((l) => l.rowId === 'r1')!;
  const r2 = res.cartLinesWithDiscount.find((l) => l.rowId === 'r2')!;
  assert.equal(r1.allocatedHeaderDiscount, 40000);
  assert.equal(r1.netLineAmount, 160000);
  assert.equal(r2.allocatedHeaderDiscount, 60000);
  assert.equal(r2.netLineAmount, 240000);
  assert.equal(r1.netLineAmount + r2.netLineAmount, 400000);
});

test('detectCategorySector intelligently maps categories to vape (MWA) or pc (FIFO)', () => {
  // 1. PC hardware patterns
  assert.equal(detectCategorySector('قطعات کامپیوتر'), 'pc');
  assert.equal(detectCategorySector('قطعات کامپیوتر و سخت‌افزار'), 'pc');
  assert.equal(detectCategorySector('رم و حافظه SSD'), 'pc');
  assert.equal(detectCategorySector('کارت گرافیک RTX'), 'pc');
  assert.equal(detectCategorySector('پردازنده Intel Core i7'), 'pc');
  assert.equal(detectCategorySector('مادربرد ASUS ROG'), 'pc');
  assert.equal(detectCategorySector('لوازم جانبی کامپیوتر'), 'pc');
  assert.equal(detectCategorySector('لپ‌تاپ و تجهیزات'), 'pc');
  assert.equal(detectCategorySector('پاور 750 وات'), 'pc');
  assert.equal(detectCategorySector('کیس گیمینگ'), 'pc');
  assert.equal(detectCategorySector('مانیتور سامسونگ'), 'pc');

  // 2. Vape shop patterns
  assert.equal(detectCategorySector('سالت نیکوتین'), 'vape');
  assert.equal(detectCategorySector('جویس ویگاد'), 'vape');
  assert.equal(detectCategorySector('پاد یکبارمصرف'), 'vape');
  assert.equal(detectCategorySector('سیستم پاد ماد'), 'vape');
  assert.equal(detectCategorySector('کارتریج و کویل'), 'vape');
  assert.equal(detectCategorySector('لوازم جانبی ویپ'), 'vape');

  // 3. Explicit dictionary override precedence
  const customOverrides: Record<string, 'vape' | 'pc'> = {
    'اکسسوری خاص': 'pc',
    'کابل کامپیوتر': 'vape', // Forced override
  };
  assert.equal(detectCategorySector('اکسسوری خاص', customOverrides), 'pc');
  assert.equal(detectCategorySector('کابل کامپیوتر', customOverrides), 'vape');
});

test('calculatePosCartTotals computes per-item line discounts and sums them into totalLineDiscounts', () => {
  const dummyItem1: any = {
    sku: 'SKU-POD-1',
    name: 'پاد ماد لاست ویپ',
    retailPrice: 500000,
    valuationRate: 350000,
  };
  const dummyItem2: any = {
    sku: 'SKU-JUICE-1',
    name: 'سالت نیکوتین نستی',
    retailPrice: 300000,
    valuationRate: 200000,
  };

  const res = calculateCartRowTotals({
    cart: [
      {
        rowId: 'row-1',
        item: dummyItem1,
        qty: 2,
        isDecantMl: false,
        manualUnitPrice: 500000,
        lineDiscount: 50000, // 50,000 T discount on line 1
      },
      {
        rowId: 'row-2',
        item: dummyItem2,
        qty: 1,
        isDecantMl: false,
        manualUnitPrice: 300000,
        lineDiscount: 20000, // 20,000 T discount on line 2
      },
    ],
    serviceLines: [
      {
        id: 'srv-1',
        serviceTitle: 'تعویض پنبه و کویل',
        feeAmount: 80000,
        isEstimatedConsumption: true,
        estimatedMaterialCost: 15000,
      },
    ],
    pricingMode: 'normal',
    promotionRules: [],
    paidAmountInput: null,
  });

  // Goods gross = 2*500,000 + 1*300,000 = 1,300,000
  assert.equal(res.goodsTotal, 1300000);
  assert.equal(res.servicesTotal, 80000);

  // Line discounts = 50,000 + 20,000 = 70,000
  assert.equal(res.totalLineDiscounts, 70000);
  assert.equal(res.totalHeaderDiscount, 70000);

  // Grand Total = 1,300,000 + 80,000 - 70,000 = 1,310,000
  assert.equal(res.grandTotal, 1310000);

  // Verify per-line net amounts:
  // Line 1: 1,000,000 - 50,000 = 950,000
  // Line 2: 300,000 - 20,000 = 280,000
  const line1 = res.cartLinesWithDiscount.find((l) => l.rowId === 'row-1');
  const line2 = res.cartLinesWithDiscount.find((l) => l.rowId === 'row-2');
  assert.equal(line1?.netLineAmount, 950000);
  assert.equal(line2?.netLineAmount, 280000);
});

test('matchBarcodeToInventory performs strict exact matching and Persian keyboard reverse mapping without wrong fallback', () => {
  const inventory = [
    { sku: 'SKU-POD-CALIBURN', name: 'پاد کالیبرن جی ۳' },
    { sku: '697001234567', name: 'سالت تنباکو ویگاد' },
    { sku: 'PC-RAM-16GB', name: 'رم ۱۶ گیگابایت کورسیر' },
  ];

  // 1. Exact match with English digits
  const match1 = matchBarcodeToInventory(inventory, 'SKU-POD-CALIBURN');
  assert.equal(match1?.sku, 'SKU-POD-CALIBURN');

  // 2. Case-insensitive match
  const match2 = matchBarcodeToInventory(inventory, 'sku-pod-caliburn');
  assert.equal(match2?.sku, 'SKU-POD-CALIBURN');

  // 3. Persian digits conversion (hardware scanner sending Persian digits)
  const match3 = matchBarcodeToInventory(inventory, '۶۹۷۰۰۱۲۳۴۵۶۷');
  assert.equal(match3?.sku, '697001234567');

  // 4. Persian keyboard reverse mapping (scanner typed letters on Persian layout)
  // 'س' -> 's', 'ن' -> 'k', 'ع' -> 'u' => 'sku'
  const reverseAscii = reversePersianKeyboardToEnglish('سنع');
  assert.equal(reverseAscii, 'sku');

  // 5. Exact product name match
  const matchName = matchBarcodeToInventory(inventory, 'سالت تنباکو ویگاد');
  assert.equal(matchName?.sku, '697001234567');

  // 6. Strict protection: Unknown or partial barcode must return NULL, never a random item!
  const unknownMatch = matchBarcodeToInventory(inventory, 'UNKNOWN-BARCODE-999');
  assert.equal(unknownMatch, null);

  const partialMatch = matchBarcodeToInventory(inventory, '697');
  assert.equal(partialMatch, null); // Strict: not exact, so must NOT auto-add!
});

test('allocateCostCenterExpense preserves exact total sum using Largest Remainder Method (Bug #6)', () => {
  const allocations = allocateCostCenterExpense(1000000, [
    { costCenterName: 'مرکز الف', percentage: 33.33 },
    { costCenterName: 'مرکز ب', percentage: 33.33 },
    { costCenterName: 'مرکز ج', percentage: 33.34 },
  ]);
  const sum = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
  assert.equal(sum, 1000000);
});

test('getPersianYear supports latinDigits option for standardized invoice numbering (Bug #20)', () => {
  const date = new Date('2025-03-22T12:00:00.000Z');
  assert.equal(getPersianYear(date), '۱۴۰۴');
  assert.equal(getPersianYear(date, { latinDigits: true }), '1404');
});

test('deductStockWithBundles and restoreStockWithBundles respect per-line warehouseKey (Bug #15)', () => {
  const items = [
    {
      sku: 'ITEM-STORE-1',
      name: 'کالای انبار پشت',
      valuationRate: 100000,
      stockQty: 10,
      warehouseStock: { vitrine: 2, store: 8 },
    },
  ];
  const deducted = deductStockWithBundles(items, [
    { sku: 'ITEM-STORE-1', qty: 3, warehouseKey: 'store' },
  ]);
  assert.equal(deducted.updatedItems[0].stockQty, 7);
  assert.equal(deducted.updatedItems[0].warehouseStock?.vitrine, 2);
  assert.equal(deducted.updatedItems[0].warehouseStock?.store, 5);

  const restored = restoreStockWithBundles(deducted.updatedItems, [
    { sku: 'ITEM-STORE-1', qty: 3, warehouseKey: 'store' },
  ]);
  assert.equal(restored[0].stockQty, 10);
  assert.equal(restored[0].warehouseStock?.vitrine, 2);
  assert.equal(restored[0].warehouseStock?.store, 8);
});

test('roundCurrency handles large Rial/Toman integers without precision overflow (Bug #12)', () => {
  const largeAmount = 150000000000000; // 150 Trillion
  assert.equal(roundCurrency(largeAmount), largeAmount);
  assert.equal(roundCurrency(1250.756), 1250.76);
});

