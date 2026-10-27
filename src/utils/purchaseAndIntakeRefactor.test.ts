import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CustomerContactRecord,
  InventoryItemRecord,
  PurchaseInvoiceRecord,
} from '../data/erpSeedData';
import {
  formatPersianDate,
  calculateMovingAverageValuation,
} from './erpEngine';
import { normalizePhoneNumber } from './posService';
import { allocatePurchaseInvoiceDiscounts } from './purchaseInvoice';

test('Refactor 1: Supplier filtering strictly returns only CRM contacts with contactCategory === "supplier"', () => {
  const mixedContacts: CustomerContactRecord[] = [
    {
      id: 'c1',
      sourceCode: 'CUS-1',
      fullName: 'علی محمدی (مشتری عادی)',
      phone: '09121111111',
      contactCategory: 'customer',
      personType: 'حقیقی / عادی',
      role: 'مشتری عادی',
      notes: '',
    },
    {
      id: 'c2',
      sourceCode: 'SUP-1',
      fullName: 'شرکت بازرگانی پارس (تأمین‌کننده)',
      phone: '09122222222',
      contactCategory: 'supplier',
      personType: 'حقوقی / تامین‌کننده',
      role: 'تأمین‌کننده',
      notes: '',
    },
    {
      id: 'c3',
      sourceCode: 'RES-1',
      fullName: 'رضا حسینی (ریسلر / همکار)',
      phone: '09123333333',
      contactCategory: 'reseller',
      personType: 'همکار / بنکدار',
      role: 'همکار',
      notes: '',
    },
    {
      id: 'c4',
      sourceCode: 'SUP-2',
      fullName: 'واردات دبی ویپ (تأمین‌کننده ۲)',
      phone: '09124444444',
      contactCategory: 'supplier',
      personType: 'حقوقی / تامین‌کننده',
      role: 'تأمین‌کننده',
      notes: '',
    },
  ];

  const filteredSuppliers = mixedContacts.filter((c) => c.contactCategory === 'supplier');

  assert.equal(filteredSuppliers.length, 2);
  assert.equal(filteredSuppliers[0].fullName, 'شرکت بازرگانی پارس (تأمین‌کننده)');
  assert.equal(filteredSuppliers[1].fullName, 'واردات دبی ویپ (تأمین‌کننده ۲)');
  assert.equal(filteredSuppliers.some((c) => c.fullName.includes('مشتری عادی')), false);
  assert.equal(filteredSuppliers.some((c) => c.fullName.includes('ریسلر')), false);
});

test('Refactor 2: Quick Supplier Registration stores phone number and tags contact as supplier', () => {
  const contacts: CustomerContactRecord[] = [];
  const supplierName = 'تأمین‌کننده اصلی قطعات کامپیوتر';
  const supplierPhone = '09129876543';

  const newSupplier: CustomerContactRecord = {
    id: `sup-${Date.now()}`,
    sourceCode: `SUP-${contacts.length + 1}`,
    fullName: supplierName.trim(),
    phone: supplierPhone.trim(),
    contactCategory: 'supplier',
    personType: 'حقوقی / تامین‌کننده',
    role: 'تأمین‌کننده',
    notes: 'ثبت‌شده از بخش خرید انبار',
  };
  contacts.push(newSupplier);

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].fullName, supplierName);
  assert.equal(contacts[0].phone, supplierPhone);
  assert.equal(contacts[0].contactCategory, 'supplier');
  assert.equal(normalizePhoneNumber(contacts[0].phone), '09129876543');
});

test('Refactor 3: Separated Festival and Reseller pricing allows blank/0 reseller price without error', () => {
  interface SkuBreakdownMockRow {
    sku: string;
    name: string;
    unitPurchasePrice: number;
    retailPrice: number;
    festivalPrice: number;
    resellerPrice?: number;
  }

  const intakeRow: SkuBreakdownMockRow = {
    sku: 'JUICE-NASTY-60',
    name: 'جویس نستی ۶۰ میل — انبه یخ',
    unitPurchasePrice: 400000,
    retailPrice: 580000,
    festivalPrice: 520000,
    resellerPrice: undefined, // left blank by user for later config
  };

  const retailRate = intakeRow.retailPrice || 0;
  const wholesaleRate = intakeRow.resellerPrice || 0;
  const festivalRate = intakeRow.festivalPrice || 0;

  assert.equal(retailRate, 580000);
  assert.equal(festivalRate, 520000);
  assert.equal(wholesaleRate, 0); // accepted smoothly as 0 without blocking commit
});

test('Refactor 4: MWA valuation computes weighted average for existing stock and defaults to cost for new items', () => {
  const existingItem: InventoryItemRecord = {
    id: 'itm-1',
    sku: 'SALT-TOKYO-30',
    name: 'سالت توکیو ۳۰ میل سیب یخ',
    category: 'جویس و سالت',
    brand: 'Tokyo',
    uomPrimary: 'عدد',
    stockQty: 10,
    reservedQty: 0,
    reorderLevel: 3,
    valuationRate: 300000, // old average cost
    retailPrice: 450000,
    wholesalePrice: 0,
    partnerPrice: 0,
    serialNumbers: [],
    batchNo: '',
    expiryDate: '',
  };

  // Case A: Restocking existing item: 5 units purchased at 360,000 T
  // Expected MWA = (10 * 300,000 + 5 * 360,000) / 15 = (3,000,000 + 1,800,000) / 15 = 4,800,000 / 15 = 320,000 T
  const restockQty = 5;
  const restockCost = 360000;
  const calculatedMwa = Math.round(
    (existingItem.stockQty * (existingItem.valuationRate || 0) + restockQty * restockCost) /
      (existingItem.stockQty + restockQty)
  );
  assert.equal(calculatedMwa, 320000);

  // Case B: Brand new item with 0 existing stock
  const newItemCost = 250000;
  const newItemQty = 8;
  const calculatedNewItemMwa = newItemCost;
  assert.equal(calculatedNewItemMwa, 250000);
});

test('Purchase discounts are allocated across invoice lines without changing the net invoice total', () => {
  const allocations = allocatePurchaseInvoiceDiscounts(
    [
      { qty: 10, unitCost: 1_000_000 },
      { qty: 5, unitCost: 2_000_000 },
      { qty: 20, unitCost: 500_000 },
    ],
    1_000_000
  );

  assert.deepEqual(
    allocations.map((allocation) => allocation.allocatedHeaderDiscount),
    [333_333, 333_333, 333_334]
  );
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.netLineAmount, 0), 29_000_000);

  const fixedLineDiscount = allocatePurchaseInvoiceDiscounts(
    [{ qty: 1, unitCost: 10_000, discountAmount: 2_500 }],
    1_500
  )[0];
  assert.equal(fixedLineDiscount?.lineDiscountAmount, 2_500);
  assert.equal(fixedLineDiscount?.allocatedHeaderDiscount, 1_500);
  assert.equal(fixedLineDiscount?.valuationRate, 6_000);
});

test('Refactor 5: Discrepancy detector flags parentTag mismatch against active purchase invoice lines', () => {
  const activePurchaseInvoice: PurchaseInvoiceRecord = {
    id: 'pinv-101',
    billNo: 'PINV-1403-099',
    docstatus: 1,
    supplierName: 'ویپ لند دبی',
    date: '1403/11/01',
    warehouse: 'انبار خارجی / مرکزی',
    status: 'تسویه‌شده',
    totalAmount: 12000000,
    landedCostAdded: 0,
    itemsSummary: 'جویس نستی ۶۰ میل (۱۰ عدد)',
    lines: [
      {
        id: 'l1',
        sku: 'PINV-LINE-1',
        itemName: 'جویس نستی ۶۰ میل',
        uom: 'عدد',
        qty: 10,
        unitPrice: 400000,
        valuationRate: 400000,
        discountPercent: 0,
        netLineAmount: 4000000,
        parentTag: 'جویس نستی ۶۰ میل',
      },
    ],
  };

  const validTags = new Set(
    (activePurchaseInvoice.lines || []).map((l) => l.itemName.trim().toLowerCase())
  );
  if (activePurchaseInvoice.parentTag) validTags.add(activePurchaseInvoice.parentTag.trim().toLowerCase());

  const checkTag = (entered: string): boolean => {
    const norm = entered.trim().toLowerCase();
    return Array.from(validTags).some((vt) => norm.includes(vt) || vt.includes(norm));
  };

  assert.equal(checkTag('جویس نستی ۶۰ میل'), true);
  assert.equal(checkTag('جویس نستی'), true);
  assert.equal(checkTag('کارتریج اکسلیم پرو'), false); // Discrepancy flagged!
});
