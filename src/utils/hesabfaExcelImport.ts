import type {
  CustomerContactRecord,
  InventoryItemRecord,
  SalesInvoiceRecord,
} from '../data/erpSeedData';
import {
  parseHesabfaImportPayload,
  HesabfaValidationReportError,
  type HesabfaImportPayload,
  type HesabfaValidationErrorItem,
} from './hesabfaImport';

type ExcelRow = Record<string, unknown>;

export interface HesabfaExcelFiles {
  contacts: File;
  products: File;
  invoices: File;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function parseAmount(value: unknown, fieldName: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = text(value)
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[,\u066C\s]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`مقدار «${fieldName}» عدد معتبری نیست: ${text(value)}`);
  }
  return parsed;
}

function categoryFor(sourceCategory: string): InventoryItemRecord['category'] {
  const category = sourceCategory.toLocaleLowerCase();
  if (category.includes('جویس') || category.includes('سالت') || category.includes('جوس')) {
    return 'جویس و سالت';
  }
  if (
    category.includes('کویل') ||
    category.includes('کارتریج') ||
    category.includes('المنت') ||
    category.includes('اتومایزر') ||
    category.includes('پنبه')
  ) {
    return 'کویل و کارتریج';
  }
  if (
    category.includes('پاد') ||
    category.includes('دیسپوزبل') ||
    category.includes('دستگاه') ||
    category.includes('ماد') ||
    category.includes('کیت') ||
    category.includes('hnb') ||
    category.includes('سیگار') ||
    category.includes('باتری')
  ) {
    return 'دستگاه پاد و ماد';
  }
  if (
    category.includes('باندل') ||
    category.includes('پکیج') ||
    category.includes('جعبه ابزار')
  ) {
    return 'پکیج باندل';
  }
  if (
    category.includes('کامپیوتر') ||
    category.includes('سخت‌افزار') ||
    category.includes('آداپتور')
  ) {
    return 'قطعات کامپیوتر و سخت‌افزار';
  }
  if (category.includes('کارت هدیه') || category.includes('خدمات')) {
    return 'کارت هدیه و خدمات';
  }
  return 'سایر کالاها';
}

export function parseCsvRows(csvContent: string, fileName: string): ExcelRow[] {
  const content = csvContent.replace(/^\uFEFF/, '').trim();
  if (!content) throw new Error(`فایل «${fileName}» خالی است.`);

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    throw new Error(`فایل «${fileName}» عنوان ستون یا ردیف داده ندارد.`);
  }

  const headers = rows[0].map(text);
  const result: ExcelRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const rowData = rows[r];
    const record: ExcelRow = {};
    headers.forEach((header, index) => {
      if (header) record[header] = rowData[index] ?? '';
    });
    if (Object.values(record).some((v) => text(v) !== '')) {
      result.push(record);
    }
  }
  return result;
}

function workbookRows(file: File): Promise<ExcelRow[]> {
  if (/\.csv$/i.test(file.name)) {
    return file.text().then((text) => parseCsvRows(text, file.name));
  }
  return import('exceljs').then(async ({ default: ExcelJS }) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error(`در فایل «${file.name}» هیچ شیتی پیدا نشد.`);

    let headers: string[] = [];
    const rows: ExcelRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values as unknown[];
      const cells = values.slice(1).map((value, index) => {
        const cell = row.getCell(index + 1);
        if (cell.text) return cell.text;
        if (value && typeof value === 'object' && 'result' in value) {
          return (value as { result?: unknown }).result ?? '';
        }
        return value ?? '';
      });
      if (rowNumber === 1) {
        headers = cells.map(text);
        return;
      }
      const record: ExcelRow = {};
      headers.forEach((header, index) => {
        if (header) record[header] = cells[index] ?? '';
      });
      if (Object.values(record).some((value) => text(value) !== '')) rows.push(record);
    });
    if (headers.length === 0 || rows.length === 0) {
      throw new Error(`فایل «${file.name}» ستون یا ردیف اطلاعاتی ندارد.`);
    }
    return rows;
  });
}

export function buildHesabfaPayloadFromExcelRows(
  contactRows: ExcelRow[],
  productRows: ExcelRow[],
  invoiceRows: ExcelRow[]
): HesabfaImportPayload {
  const dynamicCorrections: string[] = [
    'قیمت فروش، مانده و موجودی مطابق فایل‌های منبع حفظ شده‌اند؛ فاکتورهای تاریخی سند حسابداری یا گردش انبار ایجاد نمی‌کنند.',
  ];
  const validationErrors: HesabfaValidationErrorItem[] = [];

  const seenContactCodes = new Map<string, number>();
  const contacts: CustomerContactRecord[] = [];
  contactRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const sourceCode = text(row['کد شخص']);
    const fullName = text(row['نام شخص']);

    if (!sourceCode) {
      validationErrors.push({
        file: 'contacts',
        fileLabel: 'فایل مخاطبین',
        rowNumber,
        columnName: 'کد شخص',
        message: 'هر مخاطب باید «کد شخص» و «نام شخص» داشته باشد. ستون «کد شخص» خالی است.',
      });
    } else if (seenContactCodes.has(sourceCode)) {
      validationErrors.push({
        file: 'contacts',
        fileLabel: 'فایل مخاطبین',
        rowNumber,
        identifier: `کد شخص: ${sourceCode}`,
        columnName: 'کد شخص',
        value: sourceCode,
        message: `در فایل مخاطبین «کد شخص» تکراری وجود دارد (کد «${sourceCode}» قبلاً در ردیف ${seenContactCodes.get(sourceCode)} ثبت شده است).`,
      });
    } else {
      seenContactCodes.set(sourceCode, rowNumber);
    }

    if (!fullName) {
      validationErrors.push({
        file: 'contacts',
        fileLabel: 'فایل مخاطبین',
        rowNumber,
        identifier: sourceCode ? `کد شخص: ${sourceCode}` : undefined,
        columnName: 'نام شخص',
        message: 'هر مخاطب باید «کد شخص» و «نام شخص» داشته باشد. ستون «نام شخص» خالی است.',
      });
    }

    contacts.push({
      id: `hesabfa-contact-${sourceCode}`,
      sourceCode,
      fullName,
      personType: text(row['نوع']),
      role: text(row['نقش']),
      phone: text(row['شماره موبایل']),
      notes: text(row['توضیحات']),
    });
  });

  const seenProductCodes = new Map<string, number>();
  const products: InventoryItemRecord[] = [];
  productRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const sku = text(row['کد کالا']);
    const name = text(row['عنوان کالا']);

    if (!sku) {
      validationErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        rowNumber,
        columnName: 'کد کالا',
        message: 'کد کالای خالی یا تکراری است: (خالی). لطفاً برای کالا کد یکتا وارد کنید.',
      });
    } else if (seenProductCodes.has(sku)) {
      validationErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        rowNumber,
        identifier: `کد کالا: ${sku}`,
        columnName: 'کد کالا',
        value: sku,
        message: `کد کالای خالی یا تکراری است: ${sku} (قبلاً در ردیف ${seenProductCodes.get(sku)} استفاده شده است).`,
      });
    } else {
      seenProductCodes.set(sku, rowNumber);
    }

    if (!name) {
      validationErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        rowNumber,
        identifier: sku ? `کد کالا: ${sku}` : undefined,
        columnName: 'عنوان کالا',
        message: `کالای با کد «${sku || 'نامشخص'}» فاقد عنوان است. هر کالا باید عنوان داشته باشد.`,
      });
    }

    let rawStock = 0;
    try {
      rawStock = parseAmount(row['موجودی اول دوره'], 'موجودی اول دوره');
    } catch {
      validationErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        rowNumber,
        identifier: sku ? `کد: ${sku}` : undefined,
        columnName: 'موجودی اول دوره',
        value: String(row['موجودی اول دوره'] ?? ''),
        message: `موجودی کالای «${sku}» باید عدد معتبر باشد.`,
      });
    }
    if (!Number.isFinite(rawStock)) {
      validationErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        rowNumber,
        identifier: sku ? `کد: ${sku}` : undefined,
        columnName: 'موجودی اول دوره',
        value: String(row['موجودی اول دوره'] ?? ''),
        message: `موجودی کالای «${sku}» باید عدد معتبر باشد.`,
      });
    }

    const stockQty = Math.max(0, rawStock);
    if (rawStock < 0) {
      dynamicCorrections.push(
        `[ردیف ${rowNumber} فایل کالاها] موجودی منفی کالای «${name} (${sku})» (${rawStock}) به دلیل مغایرت انبار مبدا، اصلاح و به صفر تنظیم گردید.`
      );
    }

    let buyPrice = 0;
    try {
      buyPrice = parseAmount(row['قیمت خرید پیش‌فرض'], 'قیمت خرید پیش‌فرض');
    } catch {
      validationErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        rowNumber,
        identifier: sku ? `کد: ${sku}` : undefined,
        columnName: 'قیمت خرید پیش‌فرض',
        value: String(row['قیمت خرید پیش‌فرض'] ?? ''),
        message: `قیمت خرید کالای «${sku}» عدد معتبر نیست.`,
      });
    }

    let sellPrice = 0;
    try {
      sellPrice = parseAmount(row['قیمت فروش'], 'قیمت فروش');
    } catch {
      validationErrors.push({
        file: 'products',
        fileLabel: 'فایل کالاها',
        rowNumber,
        identifier: sku ? `کد: ${sku}` : undefined,
        columnName: 'قیمت فروش',
        value: String(row['قیمت فروش'] ?? ''),
        message: `قیمت فروش کالای «${sku}» عدد معتبر نیست.`,
      });
    }

    const sourceCategory = text(row['دسته‌بندی']);
    const parentTag = text(
      row['نام در فاکتور (تگ والد)'] ||
      row['نام در فاکتور'] ||
      row['تگ والد'] ||
      row['نام فاکتور'] ||
      row['parentTag']
    );
    const flavor = text(
      row['طعم / مشخصه جزئیات'] ||
      row['طعم'] ||
      row['طعم کالا'] ||
      row['مشخصه'] ||
      row['flavor']
    );
    let resolvedName = name;
    if (parentTag && flavor && (!resolvedName || resolvedName === parentTag)) {
      resolvedName = `${parentTag} — ${flavor}`;
    }

    products.push({
      id: `hesabfa-item-${sku}`,
      sku,
      name: resolvedName,
      parentTag: parentTag || undefined,
      flavor: flavor || undefined,
      category: categoryFor(sourceCategory),
      brand: '',
      uomPrimary: text(row['واحد سنجش']) || 'عدد',
      stockQty,
      reservedQty: 0,
      reorderLevel: 0,
      valuationRate: buyPrice,
      retailPrice: sellPrice,
      wholesalePrice: 0,
      partnerPrice: 0,
      serialNumbers: [],
      batchNo: '',
      expiryDate: '',
      sourceCategory,
      sourceStatus: text(row['وضعیت کالا']),
    });
  });

  const invoicesByNumber = new Map<string, SalesInvoiceRecord>();
  invoiceRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const invoiceNo = text(row['شماره فاکتور']);
    if (!invoiceNo) {
      validationErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        rowNumber,
        columnName: 'شماره فاکتور',
        message: 'یک فاکتور فاقد «شماره فاکتور» است. لطفاً شماره فاکتور را وارد کنید.',
      });
    }
    const sku = text(row['کد کالا']);
    if (!sku) {
      validationErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        rowNumber,
        identifier: invoiceNo ? `شماره فاکتور: ${invoiceNo}` : undefined,
        columnName: 'کد کالا',
        message: `ردیف فاکتور «${invoiceNo || 'نامشخص'}» فاقد کد کالا است.`,
      });
    } else if (!seenProductCodes.has(sku)) {
      validationErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        rowNumber,
        identifier: `شماره فاکتور: ${invoiceNo}`,
        columnName: 'کد کالا',
        value: sku,
        message: `فاکتور «${invoiceNo}» به کد کالای ناشناخته «${sku}» ارجاع می‌دهد. این کد کالا در فایل کالاها یافت نشد.`,
      });
    }

    let lineAmount = 0;
    try {
      lineAmount = parseAmount(row['مبلغ کل (تومان)'], 'مبلغ کل (تومان)');
    } catch {
      validationErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        rowNumber,
        identifier: invoiceNo ? `فاکتور: ${invoiceNo}` : undefined,
        columnName: 'مبلغ کل (تومان)',
        value: String(row['مبلغ کل (تومان)'] ?? ''),
        message: `مبلغ کل در فاکتور «${invoiceNo}» عدد معتبر نیست.`,
      });
    }

    let paidAmount = 0;
    try {
      paidAmount = parseAmount(row['مبلغ پرداختی'], 'مبلغ پرداختی');
    } catch {
      validationErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        rowNumber,
        identifier: invoiceNo ? `فاکتور: ${invoiceNo}` : undefined,
        columnName: 'مبلغ پرداختی',
        value: String(row['مبلغ پرداختی'] ?? ''),
        message: `مبلغ پرداختی در فاکتور «${invoiceNo}» عدد معتبر نیست.`,
      });
    }

    let qty = 1;
    try {
      qty = parseAmount(row['تعداد'], 'تعداد');
      if (qty <= 0) {
        validationErrors.push({
          file: 'invoices',
          fileLabel: 'فایل فاکتورها',
          rowNumber,
          identifier: invoiceNo ? `فاکتور: ${invoiceNo}` : undefined,
          columnName: 'تعداد',
          value: String(row['تعداد'] ?? ''),
          message: `تعداد کالا در فاکتور «${invoiceNo}» باید عدد مثبت و بزرگتر از صفر باشد.`,
        });
      }
    } catch {
      validationErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        rowNumber,
        identifier: invoiceNo ? `فاکتور: ${invoiceNo}` : undefined,
        columnName: 'تعداد',
        value: String(row['تعداد'] ?? ''),
        message: `تعداد کالا در فاکتور «${invoiceNo}» عدد معتبر نیست.`,
      });
    }

    let unitPrice = 0;
    try {
      unitPrice = parseAmount(row['قیمت واحد (تومان)'], 'قیمت واحد (تومان)');
    } catch {
      validationErrors.push({
        file: 'invoices',
        fileLabel: 'فایل فاکتورها',
        rowNumber,
        identifier: invoiceNo ? `فاکتور: ${invoiceNo}` : undefined,
        columnName: 'قیمت واحد (تومان)',
        value: String(row['قیمت واحد (تومان)'] ?? ''),
        message: `قیمت واحد در فاکتور «${invoiceNo}» عدد معتبر نیست.`,
      });
    }

    const sourceStatus = text(row['وضعیت فاکتور']);
    const isDraft = sourceStatus === 'پیش‌نویس';
    const productName = text(row['عنوان کالا']);

    const existingInvoice = invoicesByNumber.get(invoiceNo);
    if (existingInvoice) {
      if (!existingInvoice.lines) existingInvoice.lines = [];
      const lineIndex = existingInvoice.lines.length + 1;
      existingInvoice.lines.push({
        id: `hesabfa-line-${invoiceNo}-${lineIndex}`,
        sku,
        itemName: productName,
        uom: 'عدد',
        qty,
        unitPrice,
        discountPercent: 0,
        netLineAmount: lineAmount,
        valuationRate: 0,
      });
      existingInvoice.totalAmount += lineAmount;
      existingInvoice.paidAmount = Math.max(existingInvoice.paidAmount, paidAmount);
      if (productName && !existingInvoice.itemsSummary.includes(productName)) {
        existingInvoice.itemsSummary = `${existingInvoice.itemsSummary}، ${productName}`;
      }
      if (!isDraft) {
        existingInvoice.status =
          existingInvoice.paidAmount >= existingInvoice.totalAmount
            ? 'پرداخت‌شده'
            : existingInvoice.paidAmount === 0
              ? 'معوق'
              : 'اقساطی فعال';
      }
    } else {
      invoicesByNumber.set(invoiceNo, {
        id: `hesabfa-invoice-${invoiceNo}`,
        invoiceNo,
        docstatus: isDraft ? 0 : 1,
        isHistoricalArchive: true,
        archiveNote: 'بایگانی تاریخی حسابفا؛ بدون اثر بر دفتر کل، دریافت، برگشت یا موجودی.',
        sourceStatus,
        customerName: text(row['نام مشتری']),
        date: text(row['تاریخ فاکتور']),
        dueDate: '',
        branchDimension: 'تعیین‌نشده',
        channelDimension: 'بایگانی تاریخی حسابفا',
        paymentTermsTemplate: 'داده‌ی تاریخی',
        updateStock: false,
        isSubscription: false,
        status: isDraft
          ? 'پیش‌نویس'
          : paidAmount >= lineAmount
            ? 'پرداخت‌شده'
            : paidAmount === 0
              ? 'معوق'
              : 'اقساطی فعال',
        totalAmount: lineAmount,
        paidAmount,
        cogsAmount: 0,
        itemsSummary: productName,
        lines: [
          {
            id: `hesabfa-line-${invoiceNo}-1`,
            sku,
            itemName: productName,
            uom: 'عدد',
            qty,
            unitPrice,
            discountPercent: 0,
            netLineAmount: lineAmount,
            valuationRate: 0,
          },
        ],
      });
    }
  });

  if (validationErrors.length > 0) {
    throw new HesabfaValidationReportError(validationErrors);
  }

  return parseHesabfaImportPayload({
    schemaVersion: 1,
    inventoryBasis: 'current_snapshot',
    salesInvoiceMode: 'archive_only',
    contacts,
    products,
    salesInvoices: [...invoicesByNumber.values()],
    heldInvoiceNumbers: [],
    corrections: dynamicCorrections,
  });
}

export async function parseHesabfaExcelFiles(
  files: HesabfaExcelFiles
): Promise<HesabfaImportPayload> {
  const fileEntries: [keyof HesabfaExcelFiles, File][] = [
    ['contacts', files.contacts],
    ['products', files.products],
    ['invoices', files.invoices],
  ];
  for (const [kind, file] of fileEntries) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      throw new Error(`فرمت فایل ${kind} باید .xlsx یا .xls باشد.`);
    }
  }
  const totalSize = fileEntries.reduce((sum, [, file]) => sum + file.size, 0);
  if (totalSize > 60 * 1024 * 1024) {
    throw new Error('حجم مجموع سه فایل باید کمتر از ۶۰ مگابایت باشد.');
  }
  const [contactRows, productRows, invoiceRows] = await Promise.all([
    workbookRows(files.contacts),
    workbookRows(files.products),
    workbookRows(files.invoices),
  ]);
  return buildHesabfaPayloadFromExcelRows(contactRows, productRows, invoiceRows);
}
