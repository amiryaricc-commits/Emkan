import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreStockWithBundles,
  voidInvoice,
  calculateThreeBucketShareholderState,
} from './erpEngine';
import { buildHesabfaPayloadFromExcelRows } from './hesabfaExcelImport';

test('FIN-05: restoreStockWithBundles restores FIFO layers for PC sector items and openBottleRemainingMl + virtual decant item for decant returns', () => {
  const inventory = [
    {
      sku: 'GPU-4070',
      stockQty: 1,
      valuationRate: 42000000,
      sector: 'pc' as const,
      warehouseStock: { vitrine: 1 },
      fifoLayers: [{ qty: 1, unitCost: 42000000, date: '۱۴۰۴/۰۸/۰۱', sourceVoucherId: 'PINV-1' }],
      warehouseFifoLayers: {
        vitrine: [{ qty: 1, unitCost: 42000000, date: '۱۴۰۴/۰۸/۰۱', sourceVoucherId: 'PINV-1' }],
      },
    },
    {
      sku: 'JUICE-60ML',
      stockQty: 2,
      valuationRate: 600000,
      sector: 'vape' as const,
      bottleVolumeMl: 60,
      openBottleRemainingMl: 40,
      warehouseStock: { vitrine: 2 },
    },
    {
      sku: 'decant_JUICE-60ML',
      stockQty: 40,
      valuationRate: 10000,
      sector: 'vape' as const,
      isVirtualDecantBottle: true,
      parentBottleSku: 'JUICE-60ML',
      warehouseStock: { vitrine: 40 },
    },
  ];

  const restored = restoreStockWithBundles(inventory, [
    { sku: 'GPU-4070', qty: 1, warehouseKey: 'vitrine' },
    { sku: 'JUICE-60ML', qty: 10, isDecantMl: true, warehouseKey: 'vitrine' },
  ]);

  const gpu = restored.find((i) => i.sku === 'GPU-4070')!;
  assert.equal(gpu.stockQty, 2);
  assert.equal(gpu.warehouseStock?.vitrine, 2);
  assert.equal(gpu.fifoLayers?.length, 2);
  assert.equal(gpu.fifoLayers?.[1]?.qty, 1);
  assert.equal(gpu.warehouseFifoLayers?.vitrine?.length, 2);

  const juice = restored.find((i) => i.sku === 'JUICE-60ML')!;
  assert.equal(juice.stockQty, 2);
  assert.equal(juice.openBottleRemainingMl, 50);

  const virtualDecant = restored.find((i) => i.sku === 'decant_JUICE-60ML')!;
  assert.equal(virtualDecant.stockQty, 50);
  assert.equal(virtualDecant.warehouseStock?.vitrine, 50);
});

test('FIN-06: voidInvoice reverses usedCreditBalance to account 2102 and remaining unpaid to 1102', () => {
  const res = voidInvoice({
    invoiceType: 'sales',
    invoice: {
      id: 'sinv-1',
      invoiceNo: 'POS-9001',
      docstatus: 1,
      status: 'تسویه‌شده',
      totalAmount: 1000000,
      paidAmount: 400000,
      usedCreditBalance: 350000,
      cogsAmount: 600000,
      paymentAccountCode: '110102',
      inventoryAccountCode: '110401',
      lines: [],
    },
    inventory: [],
  });

  assert.equal(res.errorMessage, undefined);
  const credit2102 = res.reversalLedgerLines.find((l) => l.accountCode === '2102');
  const credit1102 = res.reversalLedgerLines.find((l) => l.accountCode === '1102');
  const creditBank = res.reversalLedgerLines.find((l) => l.accountCode === '110102');

  assert.equal(creditBank?.credit, 400000);
  assert.equal(credit2102?.credit, 350000);
  assert.equal(credit1102?.credit, 250000);

  const totalDebit = res.reversalLedgerLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = res.reversalLedgerLines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
});

test('FIN-08: calculateThreeBucketShareholderState caps withdrawableBalance by unrealizedCreditSales even with profitAllocationOverride', () => {
  const res = calculateThreeBucketShareholderState({
    initialInventoryCapital: 10000000,
    totalRevenue: 5000000,
    totalCogs: 2000000,
    totalOperatingExpenses: 0,
    totalNewPurchasesAmount: 0,
    unrealizedCreditSales: 3000000,
    partners: [
      {
        id: 'sh-1',
        name: 'شریک اول',
        capitalSharePercent: 50,
        profitSharePercent: 70,
        personalCapitalInjected: 0,
        withdrawals: 0,
        profitAllocationOverride: 2100000,
      },
      {
        id: 'sh-2',
        name: 'شریک دوم',
        capitalSharePercent: 50,
        profitSharePercent: 30,
        personalCapitalInjected: 0,
        withdrawals: 0,
        profitAllocationOverride: 900000,
      },
    ],
  });

  assert.equal(res.partners[0]?.walletBalance, 2100000);
  assert.equal(res.partners[0]?.withdrawableBalance, 0);
});

test('PERSIST-03: buildHesabfaPayloadFromExcelRows sums line-level paidAmount across multi-row invoices', () => {
  const payload = buildHesabfaPayloadFromExcelRows(
    [
      {
        'کد شخص': 'C-1',
        'نام شخص': 'علی حسینی',
        'تلفن همراه': '09121112233',
      },
    ],
    [
      {
        'کد کالا': 'SKU-1',
        'عنوان کالا': 'کالای اول',
        'موجودی اول دوره': '10',
        'قیمت خرید پیش‌فرض': '100000',
        'قیمت فروش': '300000',
      },
      {
        'کد کالا': 'SKU-2',
        'عنوان کالا': 'کالای دوم',
        'موجودی اول دوره': '10',
        'قیمت خرید پیش‌فرض': '100000',
        'قیمت فروش': '200000',
      },
    ],
    [
      {
        'شماره فاکتور': 'INV-100',
        'تاریخ فاکتور': '1404/08/01',
        'نام مشتری': 'علی حسینی',
        'کد کالا': 'SKU-1',
        'عنوان کالا': 'کالای اول',
        'تعداد': '1',
        'قیمت واحد (تومان)': '300000',
        'مبلغ کل (تومان)': '300000',
        'مبلغ پرداختی': '300000',
        'وضعیت فاکتور': 'تایید شده',
      },
      {
        'شماره فاکتور': 'INV-100',
        'تاریخ فاکتور': '1404/08/01',
        'نام مشتری': 'علی حسینی',
        'کد کالا': 'SKU-2',
        'عنوان کالا': 'کالای دوم',
        'تعداد': '1',
        'قیمت واحد (تومان)': '200000',
        'مبلغ کل (تومان)': '200000',
        'مبلغ پرداختی': '200000',
        'وضعیت فاکتور': 'تایید شده',
      },
    ]
  );

  assert.equal(payload.salesInvoices.length, 1);
  assert.equal(payload.salesInvoices[0]?.totalAmount, 500000);
  assert.equal(payload.salesInvoices[0]?.paidAmount, 500000);
  assert.equal(payload.salesInvoices[0]?.status, 'پرداخت‌شده');
});

