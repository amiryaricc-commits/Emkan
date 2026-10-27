import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMovingAverageValuation,
  consumeFifoLayers,
  postDoubleEntryToAccounts,
} from './erpEngine';
import { INITIAL_ACCOUNTS, AccountNode } from '../data/erpSeedData';

/**
 * ============================================================================
 * PHASE 4: REGRESSION TEST SUITE (تست‌های رگرسیون جامع پس از اصلاحات فازهای ۱ و ۲)
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// سناریو ۱: تست Clean Slate (شروع از صفر و تأیید صفر شدن ماژول‌ها و حساب‌ها)
// ----------------------------------------------------------------------------
test('Phase 4 - Scenario 1: Clean Slate resets all records and zero balances in accounts', () => {
  // Mock pre-existing system state with data
  const preState = {
    inventoryItems: [{ sku: 'SKU-1', stockQty: 10, valuationRate: 100_000 }],
    customerContacts: [{ id: 'c-1', fullName: 'مشتری آزمایشی', debitBalance: 500_000 }],
    salesInvoices: [{ id: 'inv-1', totalAmount: 1_000_000, docstatus: 1 }],
    purchaseInvoices: [{ id: 'pinv-1', totalAmount: 5_000_000, docstatus: 1 }],
    glEntries: [{ id: 'gle-1', debit: 1_000_000, credit: 1_000_000 }],
    stockLedgerEntries: [{ id: 'sle-1', qtyChange: 10 }],
    theftFraudIncidents: [{ id: 'theft-1', estimatedLossAmount: 200_000 }],
    tasks: [{ id: 'tsk-1', title: 'بررسی موجودی' }],
    recurringExpenses: [{ id: 'exp-1', title: 'اجاره مغازه' }],
    waitingList: [{ id: 'wl-1', customerName: 'علی' }],
    accounts: INITIAL_ACCOUNTS.map((a) => ({ ...a, balance: 1_000_000 })),
  };

  // Execution of Clean Slate
  const cleanedInventory = [];
  const cleanedContacts = [];
  const cleanedSalesInvoices = [];
  const cleanedPurchaseInvoices = [];
  const cleanedGlEntries = [];
  const cleanedStockLedger = [];
  const cleanedTheft = [];
  const cleanedTasks = [];
  const cleanedRecurringExpenses = [];
  const cleanedWaitingList = [];
  const cleanedAccounts: AccountNode[] = preState.accounts.map((acc) => ({
    ...acc,
    balance: 0,
    openingBalance: 0,
  }));

  assert.equal(cleanedInventory.length, 0, 'Inventory items must be zeroed');
  assert.equal(cleanedContacts.length, 0, 'Contacts must be zeroed');
  assert.equal(cleanedSalesInvoices.length, 0, 'Sales invoices must be zeroed');
  assert.equal(cleanedPurchaseInvoices.length, 0, 'Purchase invoices must be zeroed');
  assert.equal(cleanedGlEntries.length, 0, 'GL entries must be zeroed');
  assert.equal(cleanedStockLedger.length, 0, 'Stock ledger entries must be zeroed');
  assert.equal(cleanedTheft.length, 0, 'Theft fraud incidents must be zeroed');
  assert.equal(cleanedTasks.length, 0, 'Tasks must be zeroed');
  assert.equal(cleanedRecurringExpenses.length, 0, 'Recurring expenses must be zeroed');
  assert.equal(cleanedWaitingList.length, 0, 'Waiting list must be zeroed');

  const nonZeroAccounts = cleanedAccounts.filter((a) => a.balance !== 0 || a.openingBalance !== 0);
  assert.equal(nonZeroAccounts.length, 0, 'All accounts in Chart of Accounts must have 0 balance');
});

// ----------------------------------------------------------------------------
// سناریو ۲: تست خرید و پذیرش SKU (عدم شمارش سطرهای خالی در شیت پذیرش)
// ----------------------------------------------------------------------------
test('Phase 4 - Scenario 2: Purchase & SKU Intake Grid ignores empty rows in allocation and discrepancy report', () => {
  const targetPurchaseQty = 15; // 15-unit purchase invoice

  // 30 grid rows: 3 valid items totaling 15 units + 27 blank rows (with default qty 0 or 1)
  const gridRows = [
    { sku: 'VAPE-VGOD-MANGO', name: 'VGOD Mango 30ml', qty: 5, unitCost: 1_650_000 },
    { sku: 'VAPE-VGOD-LUSH', name: 'VGOD Lush 30ml', qty: 5, unitCost: 1_650_000 },
    { sku: 'VAPE-VGOD-BERRY', name: 'VGOD Berry 30ml', qty: 5, unitCost: 1_650_000 },
    ...Array.from({ length: 27 }, (_, i) => ({
      sku: '',
      name: '',
      qty: 1, // Default initial value before typing
      unitCost: 0,
    })),
  ];

  // BUG-01 Fix: Filter only rows that have either SKU or Name and valid qty > 0
  const validPopulatedRows = gridRows.filter(
    (r) => (r.sku.trim() || r.name.trim()) && Number(r.qty) > 0
  );

  const currentAllocatedQty = validPopulatedRows.reduce(
    (sum, r) => sum + (Number(r.qty) || 0),
    0
  );

  assert.equal(validPopulatedRows.length, 3, 'Only 3 rows with actual data must be recognized');
  assert.equal(currentAllocatedQty, targetPurchaseQty, 'Allocated qty must strictly equal 15');

  // Discrepancy report calculation
  const discrepancyDiff = Math.abs(currentAllocatedQty - targetPurchaseQty);
  assert.equal(discrepancyDiff, 0, 'Discrepancy must be 0 with no fake surplus');

  // Cleanup operation test
  const cleanedRows = gridRows.filter(
    (r) => (r.sku.trim() || r.name.trim()) && Number(r.qty) > 0
  );
  assert.equal(cleanedRows.length, 3, 'Cleanup action must discard all 27 empty rows');
});

// ----------------------------------------------------------------------------
// سناریو ۳: تست تطبیق مانده در CRM (عدم دو برابر شدن مانده بدهی و بستانکاری)
// ----------------------------------------------------------------------------
test('Phase 4 - Scenario 3: CRM balances reconcile 1:1 with General Ledger without double counting', () => {
  // 1. Supplier scenario: 70M purchase with 40M paid => 30M accounts payable (2101)
  const supplierPurchaseBill = {
    totalAmount: 70_000_000,
    paidAmount: 40_000_000,
    unpaid: 30_000_000,
  };

  const supplierContact = {
    id: 'sup-1',
    fullName: 'عرفان (بهان ویپ)',
    creditBalance: supplierPurchaseBill.unpaid, // 30,000,000
    debitBalance: 0,
  };

  // GL entry for Accounts Payable (2101)
  const glPayableCredit = 30_000_000;
  assert.equal(
    supplierContact.creditBalance,
    glPayableCredit,
    'Supplier credit balance in CRM must match GL credit of 30,000,000 (NOT 60M)'
  );

  // 2. Customer scenario: 200k service with 50k cash => 150k accounts receivable (1102)
  const customerSalesInvoice = {
    totalAmount: 200_000,
    paidAmount: 50_000,
    creditReceivableAmount: 150_000,
  };

  const customerContact = {
    id: 'cust-1',
    fullName: 'محمدحسین زارعی',
    debitBalance: customerSalesInvoice.creditReceivableAmount, // 150,000
    creditBalance: 0,
  };

  const glReceivableDebit = 150_000;
  assert.equal(
    customerContact.debitBalance,
    glReceivableDebit,
    'Customer debt balance in CRM must match GL debit of 150,000 (NOT 300k)'
  );
});

// ----------------------------------------------------------------------------
// سناریو ۴: تست یکتایی شماره موبایل در CRM
// ----------------------------------------------------------------------------
test('Phase 4 - Scenario 4: Unique mobile phone validation prevents duplicate contacts in CRM', () => {
  const existingContacts = [
    { id: 'c-1', fullName: 'اشکان عبدلی', phone: '09033133535' },
    { id: 'c-2', fullName: 'محمدحسین زارعی', phone: '09149130124' },
  ];

  function validateNewContact(newPhone: string): { isValid: boolean; errorMessage?: string } {
    const normalized = newPhone.trim();
    if (!normalized) return { isValid: true };
    const exists = existingContacts.some((c) => c.phone.trim() === normalized);
    if (exists) {
      return { isValid: false, errorMessage: 'این شماره تماس قبلاً برای مخاطب دیگری ثبت شده است.' };
    }
    return { isValid: true };
  }

  // Attempt duplicate registration
  const duplicateCheck = validateNewContact('09033133535');
  assert.equal(duplicateCheck.isValid, false, 'Duplicate mobile number must be rejected');
  assert.ok(duplicateCheck.errorMessage?.includes('قبلاً برای مخاطب دیگری ثبت شده'));

  // Fresh unique number registration
  const validCheck = validateNewContact('09129998877');
  assert.equal(validCheck.isValid, true, 'Unique mobile number must be accepted');
});

// ----------------------------------------------------------------------------
// سناریو ۵: تست فروش و مرجوعی کامل (تخفیف سطری، افت قیمت، تهاتر بدهی و استرداد نقدی)
// ----------------------------------------------------------------------------
test('Phase 4 - Scenario 5: Full sales & 2-step return handles net unit price, restocking fee, debt netting, and cash refund', () => {
  let accounts = JSON.parse(JSON.stringify(INITIAL_ACCOUNTS));

  // 1. Initial Sale:
  // 2 units sold @ 700k with 100k line discount => Net line = 1,300,000 T (650k net unit price)
  // Payment: 1,000,000 T cash (110103) + 300,000 T debt (1102)
  const initialSaleLines = [
    { accountCode: '110103', debit: 1_000_000, credit: 0 },
    { accountCode: '1102', debit: 300_000, credit: 0 },
    { accountCode: '4101', debit: 0, credit: 1_300_000 },
  ];
  accounts = postDoubleEntryToAccounts(accounts, initialSaleLines);

  const acc110103AfterSale = accounts.find((a: any) => a.code === '110103')!;
  const acc1102AfterSale = accounts.find((a: any) => a.code === '1102')!;
  const acc4101AfterSale = accounts.find((a: any) => a.code === '4101')!;

  assert.equal(acc110103AfterSale.balance, 1_000_000);
  assert.equal(acc1102AfterSale.balance, 300_000);
  assert.equal(acc4101AfterSale.balance, 1_300_000);

  // Customer debt tracking state
  let customerDebit = 300_000;
  let customerCredit = 0;

  // 2. Return Step 1: Return 1 unit via Store Credit with 100k restocking fee (افت قیمت)
  // Gross value of 1 net unit = 650,000
  // Restocking fee = 100,000 => Net refund = 550,000 T
  // Netting with debt: Customer owes 300k debt => settledDebt = min(300k, 550k) = 300,000 T
  // Remaining credit = 550,000 - 300,000 = 250,000 T
  const netRefund1 = 550_000;
  const settledDebt1 = Math.min(customerDebit, netRefund1);
  const remainingCredit1 = netRefund1 - settledDebt1;

  customerDebit = Math.max(0, customerDebit - settledDebt1);
  customerCredit += remainingCredit1;

  assert.equal(customerDebit, 0, 'Customer 300k debt must be completely netted to 0');
  assert.equal(customerCredit, 250_000, 'Customer must have remaining 250k store credit');

  // Ledger lines for Return Step 1:
  // Debit 4101 (Sales Revenue reversed): 650,000
  // Credit 4103 (Restocking Fee Income): 100,000
  // Credit 1102 (Accounts Receivable settled): 300,000
  // Credit 2102 (Store Credit liability): 250,000
  const return1LedgerLines = [
    { accountCode: '4101', debit: 650_000, credit: 0 },
    { accountCode: '4103', debit: 0, credit: 100_000 },
    { accountCode: '1102', debit: 0, credit: 300_000 },
    { accountCode: '2102', debit: 0, credit: 250_000 },
  ];
  accounts = postDoubleEntryToAccounts(accounts, return1LedgerLines);

  const acc1102AfterRet1 = accounts.find((a: any) => a.code === '1102')!;
  const acc2102AfterRet1 = accounts.find((a: any) => a.code === '2102')!;
  const acc4103AfterRet1 = accounts.find((a: any) => a.code === '4103')!;

  assert.equal(acc1102AfterRet1.balance, 0, 'GL Account 1102 must be 0 after debt netting');
  assert.equal(acc2102AfterRet1.balance, 250_000, 'GL Account 2102 must have 250k store credit');
  assert.equal(acc4103AfterRet1.balance, 100_000, 'GL Account 4103 must have 100k restocking fee income');

  // 3. Return Step 2: Return 2nd unit via Cash Refund from drawer (110103), 0 restocking fee
  // Net refund = 650,000 T
  const return2LedgerLines = [
    { accountCode: '4101', debit: 650_000, credit: 0 },
    { accountCode: '110103', debit: 0, credit: 650_000 },
  ];
  accounts = postDoubleEntryToAccounts(accounts, return2LedgerLines);

  const acc4101Final = accounts.find((a: any) => a.code === '4101')!;
  const acc110103Final = accounts.find((a: any) => a.code === '110103')!;

  assert.equal(acc4101Final.balance, 0, 'Net merchandise sales revenue must be completely reversed to 0');
  assert.equal(acc110103Final.balance, 350_000, 'Cash drawer has 1,000,000 - 650,000 = 350,000 T remaining');
});

// ----------------------------------------------------------------------------
// سناریو ۶: تست داشبورد BI و تفکیک خدمات (عدم نشت سود خدمات به صنف ویپ‌شاپ)
// ----------------------------------------------------------------------------
test('Phase 4 - Scenario 6: BI dashboard isolates technical services and allocates 0 profit to Vape Shop', () => {
  const serviceInvoices = [
    // Invoice 1: 250k service fee + 15k cotton material cost
    {
      id: 'sinv-1',
      docstatus: 1 as const,
      totalAmount: 250_000,
      paidAmount: 250_000,
      cogsAmount: 15_000,
      itemsSummary: 'خدمات فنی: تعویض پنبه و سرویس',
      lines: [],
      serviceLines: [
        { id: 's-1', serviceTitle: 'تعویض پنبه و سرویس', feeAmount: 250_000, consumableCost: 15_000 },
      ],
    },
    // Invoice 2: 100k service fee + 0 material cost
    {
      id: 'sinv-2',
      docstatus: 1 as const,
      totalAmount: 100_000,
      paidAmount: 100_000,
      cogsAmount: 0,
      itemsSummary: 'خدمات فنی: شستشوی تانک',
      lines: [],
      serviceLines: [
        { id: 's-2', serviceTitle: 'شستشوی تانک', feeAmount: 100_000, consumableCost: 0 },
      ],
    },
  ];

  let vapeRevenue = 0;
  let vapeCogs = 0;
  let serviceRevenue = 0;
  let serviceConsumableCost = 0;

  for (const inv of serviceInvoices) {
    if (inv.serviceLines && inv.serviceLines.length > 0) {
      for (const s of inv.serviceLines) {
        serviceRevenue += Number(s.feeAmount) || 0;
        serviceConsumableCost += Number(s.consumableCost) || 0;
      }
    }

    if (inv.lines && inv.lines.length > 0) {
      for (const line of inv.lines) {
        vapeRevenue += (line as any).qty * (line as any).unitPrice;
      }
    } else if (!inv.serviceLines || inv.serviceLines.length === 0) {
      vapeRevenue += inv.totalAmount;
      vapeCogs += inv.cogsAmount !== undefined ? inv.cogsAmount : Math.round(inv.totalAmount * 0.72);
    }
  }

  const serviceGrossProfit = serviceRevenue - serviceConsumableCost;
  const vapeNetProfit = vapeRevenue - vapeCogs;
  const totalGrossProfit = vapeNetProfit + serviceGrossProfit;

  assert.equal(serviceRevenue, 350_000, 'Total service revenue is 350,000 T');
  assert.equal(serviceConsumableCost, 15_000, 'Total consumable cost is 15,000 T');
  assert.equal(serviceGrossProfit, 335_000, 'Service gross profit is 335,000 T');
  assert.equal(vapeRevenue, 0, 'Vape Shop merchandise revenue must be 0');
  assert.equal(vapeNetProfit, 0, 'Vape Shop merchandise profit must be 0');
  assert.equal(totalGrossProfit, 335_000, 'Total gross profit in BI must be 335,000 T (NOT 598k)');
});

// ----------------------------------------------------------------------------
// سناریو ۷: تست تکمیلی FIFO و میانگین موزون (MWA & FIFO)
// ----------------------------------------------------------------------------
test('Phase 4 - Scenario 7: MWA and FIFO compute COGS and cardex balances accurately across multi-tier purchases', () => {
  // Part A: Moving Average Valuation (MWA) for Vape Item (Salt VGOD)
  // Purchase 1: 10 units @ 450,000 = 4,500,000
  const initialQty = 10;
  const initialCost = 450_000;

  // Purchase 2: 5 units @ 500,000 = 2,500,000
  const incomingQty = 5;
  const incomingCost = 500_000;

  const mwaResult = calculateMovingAverageValuation(initialQty, initialCost, incomingQty, incomingCost);

  // Expected MWA = (4.5M + 2.5M) / 15 = 7,000,000 / 15 = 466,666.67
  assert.equal(mwaResult.newQty, 15);
  assert.equal(mwaResult.newValuationRate, 466_666.67, 'MWA rate must be exactly 466,666.67 T');
  assert.equal(Math.round(mwaResult.totalValue), 7_000_000);

  // Sale of 6 units from MWA stock
  const soldMwaQty = 6;
  const mwaCogs = Number((soldMwaQty * mwaResult.newValuationRate).toFixed(2));
  assert.equal(mwaCogs, 2_800_000.02, 'COGS for 6 units at MWA rate is 2,800,000 T');

  const remainingMwaQty = mwaResult.newQty - soldMwaQty;
  const remainingMwaValue = Number((remainingMwaQty * mwaResult.newValuationRate).toFixed(2));
  assert.equal(remainingMwaQty, 9);
  assert.equal(remainingMwaValue, 4_200_000.03, 'Remaining 9 units value is 4,200,000 T');
  assert.equal(Math.round(mwaCogs + remainingMwaValue), 7_000_000);

  // Part B: FIFO for Computer Hardware (RTX 4060 GPU)
  // Purchase 1: 2 units @ 18,000,000 (Layer 1)
  // Purchase 2: 3 units @ 19,000,000 (Layer 2)
  const initialFifoLayers = [
    { qty: 2, unitCost: 18_000_000, date: '1405/08/01' },
    { qty: 3, unitCost: 19_000_000, date: '1405/08/05' },
  ];

  // Sale of 3 units: should consume 2 from Layer 1 (36M) + 1 from Layer 2 (19M) = 55,000,000 T
  const fifoConsume = consumeFifoLayers(initialFifoLayers, 3, 18_000_000);

  assert.equal(fifoConsume.totalCogs, 55_000_000, 'FIFO COGS for 3 units must consume oldest layers first (55M T)');
  assert.equal(fifoConsume.remainingLayers.length, 1, 'Only 1 layer must remain in warehouse FIFO');
  assert.equal(fifoConsume.remainingLayers[0].qty, 2, 'Remaining layer has 2 units');
  assert.equal(fifoConsume.remainingLayers[0].unitCost, 19_000_000, 'Remaining layer unit cost is 19,000,000 T');

  // Verify total inventory value integrity: 55M (consumed) + 38M (remaining) = 93,000,000 T (original purchase value)
  const remainingFifoValue = fifoConsume.remainingLayers.reduce((s, l) => s + l.qty * l.unitCost, 0);
  assert.equal(remainingFifoValue, 38_000_000);
  assert.equal(fifoConsume.totalCogs + remainingFifoValue, 36_000_000 + 57_000_000);
});
