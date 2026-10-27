import type {
  CustomerContactRecord,
  InventoryItemRecord,
  SalesInvoiceRecord,
} from '../data/erpSeedData';

export interface HesabfaValidationErrorItem {
  file: 'contacts' | 'products' | 'invoices' | 'general';
  fileLabel: string;
  rowNumber?: number;
  identifier?: string;
  columnName?: string;
  value?: string;
  message: string;
}

export class HesabfaValidationReportError extends Error {
  errors: HesabfaValidationErrorItem[];
  constructor(errors: HesabfaValidationErrorItem[]) {
    const summary = errors
      .map((e) => {
        const parts = [
          e.fileLabel,
          e.rowNumber ? `ردیف ${e.rowNumber}` : null,
          e.columnName ? `ستون «${e.columnName}»` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const val = e.value !== undefined ? ` (مقدار: «${e.value}»)` : '';
        return `${parts ? `[${parts}] ` : ''}${e.message}${val}`;
      })
      .join('\n');
    super(summary);
    this.name = 'HesabfaValidationReportError';
    this.errors = errors;
  }
}

export interface HesabfaImportPayload {
  schemaVersion: 1;
  inventoryBasis: 'current_snapshot';
  salesInvoiceMode: 'archive_only';
  contacts: CustomerContactRecord[];
  products: InventoryItemRecord[];
  salesInvoices: SalesInvoiceRecord[];
  heldInvoiceNumbers: string[];
  corrections: string[];
}

export interface HesabfaImportSummary {
  contactCount: number;
  productCount: number;
  invoiceCount: number;
  draftCount: number;
  heldInvoiceNumbers: string[];
  salesTotal: number;
  paidTotal: number;
  receivableTotal: number;
  stockUnitTotal: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  return isRecord(value) && fields.every((field) => typeof value[field] === 'string');
}

function hasFiniteNumberFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    fields.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCustomerContact(value: unknown): value is CustomerContactRecord {
  return hasStringFields(value, [
    'id',
    'sourceCode',
    'fullName',
    'personType',
    'role',
    'phone',
    'notes',
  ]);
}

function isInventoryItem(value: unknown): value is InventoryItemRecord {
  return (
    hasStringFields(value, [
      'id',
      'sku',
      'name',
      'category',
      'brand',
      'uomPrimary',
      'batchNo',
      'expiryDate',
      'sourceCategory',
      'sourceStatus',
    ]) &&
    [
      'دستگاه پاد و ماد',
      'جویس و سالت',
      'کویل و کارتریج',
      'پکیج باندل',
      'کارت هدیه و خدمات',
      'قطعات کامپیوتر و سخت‌افزار',
      'سایر کالاها',
    ].includes(value.category as InventoryItemRecord['category']) &&
    hasFiniteNumberFields(value, [
      'stockQty',
      'reservedQty',
      'reorderLevel',
      'valuationRate',
      'retailPrice',
      'wholesalePrice',
      'partnerPrice',
    ]) &&
    isStringArray(value.serialNumbers) &&
    (value.flavor === undefined || typeof value.flavor === 'string') &&
    (value.nicotine === undefined || typeof value.nicotine === 'string') &&
    (value.condition === undefined ||
      value.condition === 'آکبند شرکتی' ||
      value.condition === 'کارکرده / تستر' ||
      value.condition === 'آکبند' ||
      value.condition === 'استوک') &&
    (value.isBundle === undefined || typeof value.isBundle === 'boolean') &&
    (value.bundleComponents === undefined || isStringArray(value.bundleComponents)) &&
    (value.bundleComponentItems === undefined || Array.isArray(value.bundleComponentItems)) &&
    (value.daysInStock === undefined ||
      (typeof value.daysInStock === 'number' && Number.isFinite(value.daysInStock)))
  );
}

function isSalesInvoice(value: unknown): value is SalesInvoiceRecord {
  const validStatus =
    isRecord(value) &&
    [
      'پیش‌نویس',
      'پرداخت‌شده',
      'اقساطی فعال',
      'معوق',
      'مرجوعی (یادداشت بستانکاری)',
      'ابطال‌شده',
      'نسیه (بدهکار)',
    ].includes(value.status as SalesInvoiceRecord['status']);
  return (
    hasStringFields(value, [
      'id',
      'invoiceNo',
      'sourceStatus',
      'customerName',
      'date',
      'dueDate',
      'branchDimension',
      'channelDimension',
      'paymentTermsTemplate',
      'status',
      'itemsSummary',
      'archiveNote',
    ]) &&
    validStatus &&
    hasFiniteNumberFields(value, ['docstatus', 'totalAmount', 'paidAmount']) &&
    Number.isInteger(value.docstatus) &&
    (value.docstatus === 0 || value.docstatus === 1) &&
    value.isHistoricalArchive === true &&
    value.updateStock === false &&
    typeof value.isSubscription === 'boolean' &&
    (value.costCenter === undefined || typeof value.costCenter === 'string') &&
    (value.creditedAmount === undefined ||
      (typeof value.creditedAmount === 'number' && Number.isFinite(value.creditedAmount))) &&
    (value.returnAgainst === undefined || typeof value.returnAgainst === 'string') &&
    (value.cogsAmount === undefined ||
      (typeof value.cogsAmount === 'number' && Number.isFinite(value.cogsAmount))) &&
    (value.subscriptionInterval === undefined || typeof value.subscriptionInterval === 'string') &&
    (value.lines === undefined ||
      (Array.isArray(value.lines) &&
        value.lines.every(
          (line) =>
            hasStringFields(line, ['id', 'sku', 'itemName', 'uom']) &&
            hasFiniteNumberFields(line, [
              'qty',
              'unitPrice',
              'discountPercent',
              'netLineAmount',
              'valuationRate',
            ])
        )))
  );
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`لیست ${label} دارای کد تکراری است.`);
  }
}

export function parseHesabfaImportPayload(value: unknown): HesabfaImportPayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.inventoryBasis !== 'current_snapshot' ||
    value.salesInvoiceMode !== 'archive_only'
  ) {
    throw new Error('نسخه‌ی فایل ورود حسابفا معتبر نیست.');
  }
  const { contacts, products, salesInvoices, heldInvoiceNumbers, corrections } = value;
  if (
    !Array.isArray(contacts) ||
    !Array.isArray(products) ||
    !Array.isArray(salesInvoices) ||
    !Array.isArray(heldInvoiceNumbers) ||
    !Array.isArray(corrections)
  ) {
    throw new Error('ساختار فایل ورود حسابفا ناقص است.');
  }
  if (
    contacts.length === 0 ||
    products.length === 0 ||
    salesInvoices.length === 0 ||
    !contacts.every(isCustomerContact) ||
    !products.every(isInventoryItem) ||
    !salesInvoices.every(isSalesInvoice) ||
    !isStringArray(heldInvoiceNumbers) ||
    !isStringArray(corrections)
  ) {
    throw new Error('یکی از رکوردهای فایل ورود حسابفا معتبر نیست.');
  }

  const importErrors: HesabfaValidationErrorItem[] = [];

  const seenContactIds = new Set<string>();
  contacts.forEach((c) => {
    if (seenContactIds.has(c.id)) {
      importErrors.push({
        file: 'contacts',
        fileLabel: 'فایل مخاطبین',
        identifier: `شناسه: ${c.id}`,
        message: `شناسه مخاطب «${c.id}» تکراری است.`,
      });
    }
    seenContactIds.add(c.id);
  });

  const seenProductSkus = new Set<string>();
  products.forEach((p) => {
    if (seenProductSkus.has(p.sku)) {
      importErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        identifier: `کد کالا: ${p.sku}`,
        message: `کد کالای «${p.sku}» تکراری است.`,
      });
    }
    seenProductSkus.add(p.sku);

    if (p.stockQty < 0) {
      importErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        identifier: `کد کالا: ${p.sku}`,
        columnName: 'موجودی',
        value: String(p.stockQty),
        message: `موجودی کالای «${p.sku}» منفی است: ${p.stockQty}`,
      });
    }
    if (p.valuationRate < 0 || p.retailPrice < 0 || !Number.isFinite(p.stockQty)) {
      importErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        identifier: `کد کالا: ${p.sku}`,
        message: `قیمت یا موجودی کالای «${p.sku}» نامعتبر است.`,
      });
    }
  });

  const seenInvoices = new Set<string>();
  salesInvoices.forEach((inv) => {
    if (seenInvoices.has(inv.invoiceNo)) {
      importErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        identifier: `فاکتور: ${inv.invoiceNo}`,
        message: `شماره فاکتور «${inv.invoiceNo}» تکراری است.`,
      });
    }
    seenInvoices.add(inv.invoiceNo);

    if (heldInvoiceNumbers.includes(inv.invoiceNo)) {
      importErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        identifier: `فاکتور: ${inv.invoiceNo}`,
        message: 'فاکتور معلق نباید در فهرست فاکتورهای قابل ورود باشد.',
      });
    }
    if (inv.totalAmount < 0 || inv.paidAmount < 0) {
      importErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        identifier: `فاکتور: ${inv.invoiceNo}`,
        message: `مبالغ فاکتور «${inv.invoiceNo}» منفی است.`,
      });
    }
    if (inv.paidAmount > inv.totalAmount) {
      importErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        identifier: `فاکتور: ${inv.invoiceNo}`,
        message: `مبلغ پرداختی فاکتور «${inv.invoiceNo}» (${inv.paidAmount}) بیشتر از مبلغ کل (${inv.totalAmount}) است.`,
      });
    }
    if (inv.docstatus < 0 || inv.docstatus > 1) {
      importErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        identifier: `فاکتور: ${inv.invoiceNo}`,
        message: `وضعیت سند فاکتور «${inv.invoiceNo}» نامعتبر است.`,
      });
    }
    if (inv.lines) {
      for (const line of inv.lines) {
        if (line.qty <= 0) {
          importErrors.push({
            file: 'invoices',
            fileLabel: 'فایل فاکتورها',
            identifier: `فاکتور: ${inv.invoiceNo}`,
            columnName: 'تعداد',
            message: `تعداد ردیف کالای «${line.sku}» در فاکتور «${inv.invoiceNo}» نامعتبر است.`,
          });
        }
        if (line.netLineAmount < 0) {
          importErrors.push({
            file: 'invoices',
            fileLabel: 'فایل فاکتورها',
            identifier: `فاکتور: ${inv.invoiceNo}`,
            columnName: 'مبلغ کل',
            message: `مبلغ ردیف کالای «${line.sku}» در فاکتور «${inv.invoiceNo}» منفی است.`,
          });
        }
        if (line.sku && !seenProductSkus.has(line.sku)) {
          importErrors.push({
            file: 'invoices',
            fileLabel: 'فایل فاکتورها',
            identifier: `فاکتور: ${inv.invoiceNo}`,
            columnName: 'کد کالا',
            value: line.sku,
            message: `ارجاع کالای «${line.sku}» در فاکتور «${inv.invoiceNo}» نامعتبر است و در لیست کالاها یافت نشد.`,
          });
        }
      }
      const linesSum = inv.lines.reduce((sum, line) => sum + line.netLineAmount, 0);
      if (linesSum !== inv.totalAmount) {
        importErrors.push({
          file: 'invoices',
          fileLabel: 'فایل فاکتورها',
          identifier: `فاکتور: ${inv.invoiceNo}`,
          message: `جمع ردیف‌های فاکتور «${inv.invoiceNo}» (${linesSum}) با مبلغ کل (${inv.totalAmount}) همخوانی ندارد.`,
        });
      }
    }
  });

  if (importErrors.length > 0) {
    throw new HesabfaValidationReportError(importErrors);
  }
  if (salesInvoices.some((invoice) => invoice.isHistoricalArchive && invoice.updateStock)) {
    throw new Error('فاکتور آرشیوی نباید موجودی کالا را تغییر دهد.');
  }

  return {
    schemaVersion: 1,
    inventoryBasis: 'current_snapshot',
    salesInvoiceMode: 'archive_only',
    contacts,
    products,
    salesInvoices,
    heldInvoiceNumbers,
    corrections,
  };
}

export function summarizeHesabfaImport(payload: HesabfaImportPayload): HesabfaImportSummary {
  const salesTotal = payload.salesInvoices.reduce((total, invoice) => total + invoice.totalAmount, 0);
  const paidTotal = payload.salesInvoices.reduce((total, invoice) => total + invoice.paidAmount, 0);
  return {
    contactCount: payload.contacts.length,
    productCount: payload.products.length,
    invoiceCount: payload.salesInvoices.length,
    draftCount: payload.salesInvoices.filter((invoice) => invoice.docstatus === 0).length,
    heldInvoiceNumbers: payload.heldInvoiceNumbers,
    salesTotal,
    paidTotal,
    receivableTotal: salesTotal - paidTotal,
    stockUnitTotal: payload.products.reduce((total, product) => total + product.stockQty, 0),
  };
}
