import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHesabfaImportPayload,
  summarizeHesabfaImport,
  type HesabfaImportPayload,
} from './hesabfaImport';

const payload: HesabfaImportPayload = {
  schemaVersion: 1,
  inventoryBasis: 'current_snapshot',
  salesInvoiceMode: 'archive_only',
  contacts: [
    {
      id: 'contact-1',
      sourceCode: '1001',
      fullName: 'مشتری نمونه',
      personType: 'حقیقی',
      role: 'مشتری',
      phone: '',
      notes: '',
    },
  ],
  products: [
    {
      id: 'item-1',
      sku: 'SKU-1',
      name: 'کالای نمونه',
      category: 'سایر کالاها',
      brand: '',
      uomPrimary: 'عدد',
      stockQty: 4,
      reservedQty: 0,
      reorderLevel: 0,
      valuationRate: 100,
      retailPrice: 150,
      wholesalePrice: 0,
      partnerPrice: 0,
      serialNumbers: [],
      batchNo: '',
      expiryDate: '',
      sourceCategory: 'نمونه',
      sourceStatus: 'آکبند',
    },
  ],
  salesInvoices: [
    {
      id: 'invoice-1',
      invoiceNo: '101',
      docstatus: 1,
      isHistoricalArchive: true,
      archiveNote: 'بایگانی',
      sourceStatus: 'تسویه‌شده',
      customerName: 'مشتری نمونه',
      date: '1405/03/26',
      dueDate: '',
      branchDimension: 'تعیین‌نشده',
      channelDimension: 'آرشیو',
      paymentTermsTemplate: 'تاریخی',
      updateStock: false,
      isSubscription: false,
      status: 'پرداخت‌شده',
      totalAmount: 300,
      paidAmount: 300,
      cogsAmount: 0,
      itemsSummary: 'کالای نمونه',
      lines: [
        {
          id: 'line-1',
          sku: 'SKU-1',
          itemName: 'کالای نمونه',
          uom: 'عدد',
          qty: 2,
          unitPrice: 150,
          discountPercent: 0,
          netLineAmount: 300,
          valuationRate: 0,
        },
      ],
    },
  ],
  heldInvoiceNumbers: ['129'],
  corrections: [],
};

test('validates archive-only Hesabfa import and summarizes source records', () => {
  const parsed = parseHesabfaImportPayload(payload);
  assert.equal(parsed.salesInvoiceMode, 'archive_only');
  assert.deepEqual(summarizeHesabfaImport(parsed), {
    contactCount: 1,
    productCount: 1,
    invoiceCount: 1,
    draftCount: 0,
    heldInvoiceNumbers: ['129'],
    salesTotal: 300,
    paidTotal: 300,
    receivableTotal: 0,
    stockUnitTotal: 4,
  });
});

test('rejects an archived invoice that could update stock', () => {
  const unsafe = structuredClone(payload);
  unsafe.salesInvoices[0].updateStock = true;
  assert.throws(() => parseHesabfaImportPayload(unsafe), /رکوردهای فایل ورود/);
});

test('rejects unknown invoice SKUs and invoices that are also held', () => {
  const unknownSku = structuredClone(payload);
  unknownSku.salesInvoices[0].lines![0].sku = 'MISSING';
  assert.throws(() => parseHesabfaImportPayload(unknownSku), /ارجاع کالای/);

  const alsoHeld = structuredClone(payload);
  alsoHeld.salesInvoices[0].invoiceNo = '129';
  assert.throws(() => parseHesabfaImportPayload(alsoHeld), /فاکتور معلق/);
});
