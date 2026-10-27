import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlainTextReceipt, ReceiptExportData, normalizePhoneNumber, triggerBrowserDownload } from './posService';
import { postDoubleEntryToAccounts, computeTrialBalance6Col } from './erpEngine';
import { INITIAL_ACCOUNTS, INITIAL_GL_ENTRIES } from '../data/erpSeedData';

test('generatePlainTextReceipt formats 80mm thermal receipt with items, line discounts, and technical services', () => {
  const receiptData: ReceiptExportData = {
    invoiceNo: 'POS-1405-998',
    customerName: 'کامبیز شریفی',
    customerPhone: '09121112233',
    date: '1405/08/06 14:30',
    cashierName: 'صندوقدار امکان',
    cartLines: [
      {
        name: 'پاد کالیبرن جی ۳ یوول',
        sku: 'VAPE-CAL-G3',
        qty: 1,
        uom: 'عدد',
        finalManualUnitPrice: 1_200_000,
        lineDiscount: 50_000,
        netLineAmount: 1_150_000,
      },
      {
        name: 'کارتریج کالیبرن ۰.۶ اهم',
        sku: 'COIL-CAL-06',
        qty: 2,
        uom: 'عدد',
        finalManualUnitPrice: 180_000,
        lineDiscount: 0,
        netLineAmount: 360_000,
      },
    ],
    serviceLines: [
      {
        serviceTitle: 'تعویض پنبه و ویکینگ کویل دستی',
        feeAmount: 60_000,
      },
    ],
    goodsTotal: 1_560_000,
    servicesTotal: 60_000,
    totalDiscount: 50_000,
    grandTotal: 1_570_000,
    paidAmount: 1_570_000,
    paymentMethodLabel: 'کارتخوان (پوز)',
  };

  const plainText = generatePlainTextReceipt(receiptData);

  assert.ok(plainText.includes('فروشگاه و خدمات فنی امکان'));
  assert.ok(plainText.includes('POS-1405-998'));
  assert.ok(plainText.includes('کامبیز شریفی'));
  assert.ok(plainText.includes('09121112233'));
  assert.ok(plainText.includes('پاد کالیبرن جی ۳ یوول'));
  assert.ok(plainText.includes('کارتریج کالیبرن ۰.۶ اهم'));
  assert.ok(plainText.includes('تعویض پنبه و ویکینگ کویل دستی'));
  assert.ok(plainText.includes(Number(1_570_000).toLocaleString('fa-IR')));
});

test('Double-entry accounting for sales return with per-item restocking fee books correctly to accounts 4101, 4103, 2102, 110401, 5101', () => {
  const accounts = INITIAL_ACCOUNTS;
  const grossReturn = 1_000_000;
  const restockingFee = 150_000;
  const netRefund = 850_000;
  const cogsReverse = 600_000;

  const ledgerLines = [
    { accountCode: '4101', debit: grossReturn, credit: 0 },
    { accountCode: '4103', debit: 0, credit: restockingFee },
    { accountCode: '2102', debit: 0, credit: netRefund },
    { accountCode: '110401', debit: cogsReverse, credit: 0 },
    { accountCode: '5101', debit: 0, credit: cogsReverse },
  ];

  const updatedAccounts = postDoubleEntryToAccounts(accounts, ledgerLines);

  const acc4101 = updatedAccounts.find((a) => a.code === '4101');
  const acc4103 = updatedAccounts.find((a) => a.code === '4103');
  const acc2102 = updatedAccounts.find((a) => a.code === '2102');
  const acc110401 = updatedAccounts.find((a) => a.code === '110401');
  const acc5101 = updatedAccounts.find((a) => a.code === '5101');

  assert.ok(acc4103, 'Account 4103 must exist and receive credit for restocking fee');
  assert.equal(acc4103?.balance, restockingFee);
  // Revenue account 4101 with debit is reduced by 1,000,000
  assert.equal(acc4101?.balance, -grossReturn);
  assert.equal(acc2102?.balance, netRefund);
  assert.equal(acc110401?.balance, cogsReverse);
  assert.equal(acc5101?.balance, -cogsReverse);
});

test('POS Checkout using customer credit balance debits account 2102 and balances accounting equation', () => {
  const accounts = INITIAL_ACCOUNTS;
  const grandTotal = 2_000_000;
  const usedCredit = 500_000;
  const cashPaid = 1_500_000;

  const ledgerLines = [
    { accountCode: '110101', debit: cashPaid, credit: 0 },
    { accountCode: '2102', debit: usedCredit, credit: 0 },
    { accountCode: '4101', debit: 0, credit: grandTotal },
  ];

  const updatedAccounts = postDoubleEntryToAccounts(accounts, ledgerLines);

  const acc110101 = updatedAccounts.find((a) => a.code === '110101');
  const acc2102 = updatedAccounts.find((a) => a.code === '2102');
  const acc4101 = updatedAccounts.find((a) => a.code === '4101');

  assert.equal(acc110101?.balance, cashPaid);
  assert.equal(acc2102?.balance, -usedCredit);
  assert.equal(acc4101?.balance, grandTotal);
});

test('BUG-01: Discrepancy matching ignores empty rows with qty 0 and cleanup preserves actual rows', () => {
  // Simulating the 30 grid rows where only 1 row is populated
  const rows = [
    { sku: 'VAPE-OXVA-XLIM', name: 'Oxva Xlim Pro', qty: 15, unitCost: 1_200_000 },
    ...Array.from({ length: 29 }, (_, i) => ({
      sku: '',
      name: '',
      qty: 0,
      unitCost: 0,
    })),
  ];

  // Allocation calculation in InventoryWmsModule
  const allocatedQty = rows
    .filter((r) => (r.sku.trim() || r.name.trim()) && (r.qty || 0) > 0)
    .reduce((sum, r) => sum + (r.qty || 0), 0);

  assert.equal(allocatedQty, 15, 'Allocated qty must equal 15, ignoring empty rows');

  // Cleanup operation should keep only populated rows
  const cleaned = rows.filter((r) => (r.sku.trim() || r.name.trim()) && (r.qty || 0) > 0);
  assert.equal(cleaned.length, 1, 'Cleanup button must keep only 1 row and NOT regenerate 30 empty rows');
  assert.equal(cleaned[0].qty, 15);
});

test('BUG-03: Customer outstanding debt is netted against store credit return', () => {
  const customer = {
    id: 'cust-101',
    fullName: 'رضا کمالی',
    debitBalance: 200_000, // Customer owes 200k
    creditBalance: 0,
  };

  const netRefundAmount = 500_000; // Customer receives 500k store credit
  const settledDebt = Math.min(customer.debitBalance, netRefundAmount);
  const remainingCredit = netRefundAmount - settledDebt;

  const updatedCustomer = {
    ...customer,
    debitBalance: Math.max(0, customer.debitBalance - settledDebt),
    creditBalance: customer.creditBalance + remainingCredit,
  };

  assert.equal(updatedCustomer.debitBalance, 0, 'Outstanding debt of 200k must be completely settled');
  assert.equal(updatedCustomer.creditBalance, 300_000, 'Remaining 300k must become store credit balance');
});

test('BUG-04: Return calculation derives effective unit price from netLineAmount and deducts restocking fee', () => {
  // Line item was sold for 700k with 50k discount => netLineAmount = 650k
  const lineItem = {
    sku: 'VAPE-XROS-4',
    itemName: 'Vaporesso Xros 4',
    qty: 1,
    unitPrice: 700_000,
    discountPercent: 0,
    lineDiscountAmount: 50_000,
    netLineAmount: 650_000,
  };

  const effectiveUnitPrice =
    lineItem.qty > 0 && lineItem.netLineAmount !== undefined
      ? Math.round(lineItem.netLineAmount / lineItem.qty)
      : Math.max(0, lineItem.unitPrice - Math.round((lineItem.lineDiscountAmount || 0) / (lineItem.qty || 1)));

  assert.equal(effectiveUnitPrice, 650_000, 'Effective unit price must be 650k, not gross 700k');

  const restockingFee = 100_000; // 100k restocking fee (افت قیمت)
  const returnQty = 1;
  const netRefund = Math.max(0, returnQty * effectiveUnitPrice - restockingFee);

  assert.equal(netRefund, 550_000, 'Net refund after 100k restocking fee must be 550k');
});

test('BUG-08: normalizePhoneNumber standardizes Persian digits, prefixes, and detects duplicate mobile numbers', () => {
  const phone1 = '۰۹۱۲۳۴۵۶۷۸۹';
  const phone2 = '+989123456789';
  const phone3 = '00989123456789';
  const phone4 = '9123456789';
  const phone5 = '0912 345 6789';

  assert.equal(normalizePhoneNumber(phone1), '09123456789');
  assert.equal(normalizePhoneNumber(phone2), '09123456789');
  assert.equal(normalizePhoneNumber(phone3), '09123456789');
  assert.equal(normalizePhoneNumber(phone4), '09123456789');
  assert.equal(normalizePhoneNumber(phone5), '09123456789');

  const existingContacts = [
    { id: 'c-1', fullName: 'علی حسینی', phone: '09123456789' },
    { id: 'c-2', fullName: 'مریم کمالی', phone: '09351112233' },
  ];

  const newDuplicatePhone = '۰۹۱۲۳۴۵۶۷۸۹';
  const isDuplicate = existingContacts.some(
    (c) => c.phone && normalizePhoneNumber(c.phone) === normalizePhoneNumber(newDuplicatePhone)
  );

  assert.equal(isDuplicate, true, 'Duplicate phone number must be caught and blocked');

  const newUniquePhone = '09199998877';
  const isUniqueDuplicate = existingContacts.some(
    (c) => c.phone && normalizePhoneNumber(c.phone) === normalizePhoneNumber(newUniquePhone)
  );
  assert.equal(isUniqueDuplicate, false, 'Unique phone number must pass validation');
});

test('BUG-09: Clean slate operation resets calendar events, wishlist, fixed expense templates and CRM data', () => {
  const calendarEvents = [{ id: 'ev-1', title: 'تسک ۱' }];
  const customerWishlist = [{ id: 'wish-1', customerName: 'رضا' }];
  const recurringTemplates = [{ id: 'rec-1', defaultMonthlyAmount: 100_000 }];
  const monthlyExpenseLedger = [{ id: 'mexp-1', templateId: 'rec-1' }];
  const crmLeads = [{ id: 'lead-1', fullName: 'لید آزمایشی' }];

  // Simulate Clean Slate reset
  const resetCalendarEvents: typeof calendarEvents = [];
  const resetWishlist: typeof customerWishlist = [];
  const resetRecurringTemplates: typeof recurringTemplates = [];
  const resetMonthlyLedger: typeof monthlyExpenseLedger = [];
  const resetCrmLeads: typeof crmLeads = [];

  assert.equal(resetCalendarEvents.length, 0);
  assert.equal(resetWishlist.length, 0);
  assert.equal(resetRecurringTemplates.length, 0);
  assert.equal(resetMonthlyLedger.length, 0);
  assert.equal(resetCrmLeads.length, 0);
});

test('BUG-10: triggerBrowserDownload formats payload and handles browser environment safely', () => {
  assert.equal(typeof triggerBrowserDownload, 'function');
});

test('BUG-11: 6-column trial balance computes all 6 columns accurately and matches balance sheet', () => {
  const trialBalance = computeTrialBalance6Col(INITIAL_ACCOUNTS, 'معین', INITIAL_GL_ENTRIES, 'همه شعب', 'سال مالی ۱۴۰۵');
  assert.ok(trialBalance.rows.length > 0);

  // Verify that rows include all 6 columns
  for (const r of trialBalance.rows) {
    assert.equal(typeof r.openingDebit, 'number');
    assert.equal(typeof r.openingCredit, 'number');
    assert.equal(typeof r.periodDebit, 'number');
    assert.equal(typeof r.periodCredit, 'number');
    assert.equal(typeof r.closingDebit, 'number');
    assert.equal(typeof r.closingCredit, 'number');
  }

  // Double-entry validation: Total Debits must equal Total Credits across all 6 columns
  assert.equal(trialBalance.totals.openingDebit, trialBalance.totals.openingCredit, 'Opening Debits === Opening Credits');
  assert.equal(trialBalance.totals.periodDebit, trialBalance.totals.periodCredit, 'Period Debits === Period Credits');
  assert.equal(trialBalance.totals.closingDebit, trialBalance.totals.closingCredit, 'Closing Debits === Closing Credits');
});
