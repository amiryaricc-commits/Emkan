import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseHesabfaExcelFiles } from './hesabfaExcelImport';

async function excelFile(name: string, rows: Record<string, string | number>[]): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');
  worksheet.addRow(Object.keys(rows[0]));
  rows.forEach((row) => worksheet.addRow(Object.values(row)));
  const bytes = await workbook.xlsx.writeBuffer();
  return new File([bytes as ArrayBuffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

test('parses the three Hesabfa Excel workbooks into a validated preview payload', async () => {
  const payload = await parseHesabfaExcelFiles({
    contacts: await excelFile('contacts.xlsx', [
      {
        'کد شخص': 1001,
        'نام شخص': 'مشتری نمونه',
        نوع: 'حقیقی',
        نقش: 'مشتری',
        'شماره موبایل': '09120000000',
        توضیحات: '',
      },
    ]),
    products: await excelFile('products.xlsx', [
      {
        'کد کالا': 'SKU-1',
        'عنوان کالا': 'سالت نمونه',
        'دسته‌بندی': 'سالت',
        'وضعیت کالا': 'آکبند',
        'موجودی اول دوره': 4,
        'واحد سنجش': 'عدد',
        'قیمت خرید پیش‌فرض': '۱۰۰٬۰۰۰',
        'قیمت فروش': 150000,
      },
    ]),
    invoices: await excelFile('invoices.xlsx', [
      {
        'شماره فاکتور': 'INV-1',
        'کد کالا': 'SKU-1',
        'نام مشتری': 'مشتری نمونه',
        'تاریخ فاکتور': '۱۴۰۵/۰۳/۲۶',
        'مبلغ کل (تومان)': 300000,
        'مبلغ پرداختی': 200000,
        'وضعیت فاکتور': 'تسویه‌ناقص',
        'عنوان کالا': 'سالت نمونه',
        تعداد: 2,
        'قیمت واحد (تومان)': 150000,
      },
    ]),
  });

  assert.equal(payload.contacts[0].fullName, 'مشتری نمونه');
  assert.equal(payload.products[0].valuationRate, 100000);
  assert.equal(payload.products[0].category, 'جویس و سالت');
  assert.equal(payload.salesInvoices[0].totalAmount, 300000);
  assert.equal(payload.salesInvoices[0].status, 'اقساطی فعال');
  assert.equal(payload.salesInvoices[0].isHistoricalArchive, true);
  assert.equal(payload.salesInvoices[0].updateStock, false);
});

test('rejects an Excel invoice that references an unknown product', async () => {
  await assert.rejects(
    parseHesabfaExcelFiles({
      contacts: await excelFile('contacts.xlsx', [
        {
          'کد شخص': 'C-1',
          'نام شخص': 'مشتری نمونه',
          نوع: 'حقیقی',
          نقش: 'مشتری',
          'شماره موبایل': '',
          توضیحات: '',
        },
      ]),
      products: await excelFile('products.xlsx', [
        {
          'کد کالا': 'SKU-1',
          'عنوان کالا': 'کالا',
          دسته‌بندی: 'قطعات کامپیوتر',
          'وضعیت کالا': 'آکبند',
          'موجودی اول دوره': 1,
          'واحد سنجش': 'عدد',
          'قیمت خرید پیش‌فرض': 100,
          'قیمت فروش': 200,
        },
      ]),
      invoices: await excelFile('invoices.xlsx', [
        {
          'شماره فاکتور': 'INV-1',
          'کد کالا': 'SKU-MISSING',
          'نام مشتری': 'مشتری نمونه',
          'تاریخ فاکتور': '۱۴۰۵/۰۳/۲۶',
          'مبلغ کل (تومان)': 200,
          'مبلغ پرداختی': 0,
          'وضعیت فاکتور': 'معوق',
          'عنوان کالا': 'کالا',
          تعداد: 1,
          'قیمت واحد (تومان)': 200,
        },
      ]),
    }),
    /کد کالای ناشناخته|تعریف نشده است/
  );
});

test('handles negative stock in Excel by setting it to zero with an audit correction', async () => {
  const payload = await parseHesabfaExcelFiles({
    contacts: await excelFile('contacts.xlsx', [
      {
        'کد شخص': 'C-1',
        'نام شخص': 'مشتری نمونه',
        نوع: 'حقیقی',
        نقش: 'مشتری',
        'شماره موبایل': '',
        توضیحات: '',
      },
    ]),
    products: await excelFile('products.xlsx', [
      {
        'کد کالا': 'SKU-NEG',
        'عنوان کالا': 'کالای کسری',
        دسته‌بندی: 'دیسپوزبل',
        'وضعیت کالا': 'آکبند',
        'موجودی اول دوره': -1,
        'واحد سنجش': 'عدد',
        'قیمت خرید پیش‌فرض': 500000,
        'قیمت فروش': 750000,
      },
    ]),
    invoices: await excelFile('invoices.xlsx', [
      {
        'شماره فاکتور': 'INV-1',
        'کد کالا': 'SKU-NEG',
        'نام مشتری': 'مشتری نمونه',
        'تاریخ فاکتور': '۱۴۰۵/۰۳/۲۶',
        'مبلغ کل (تومان)': 750000,
        'مبلغ پرداختی': 750000,
        'وضعیت فاکتور': 'تسویه‌شده',
        'عنوان کالا': 'کالای کسری',
        تعداد: 1,
        'قیمت واحد (تومان)': 750000,
      },
    ]),
  });

  assert.equal(payload.products[0].stockQty, 0);
  assert.equal(payload.products[0].category, 'دستگاه پاد و ماد');
  assert.ok(payload.corrections.some((c) => c.includes('موجودی منفی کالای «کالای کسری (SKU-NEG)»')));
});

test('parses Hesabfa CSV files seamlessly', async () => {
  const contactsCsv = new File(
    ['کد شخص,نام شخص,نوع,نقش,شماره موبایل,توضیحات\nC-001,مشتری CSV,حقیقی,مشتری,09121111111,توضیح'],
    'contacts.csv',
    { type: 'text/csv' }
  );
  const productsCsv = new File(
    ['کد کالا,عنوان کالا,دسته‌بندی,وضعیت کالا,موجودی اول دوره,واحد سنجش,قیمت خرید پیش‌فرض,قیمت فروش\nSKU-CSV,سالت نیکوتین,سالت,آکبند,5,عدد,200000,300000'],
    'products.csv',
    { type: 'text/csv' }
  );
  const invoicesCsv = new File(
    ['شماره فاکتور,کد کالا,نام مشتری,تاریخ فاکتور,مبلغ کل (تومان),مبلغ پرداختی,وضعیت فاکتور,عنوان کالا,تعداد,قیمت واحد (تومان)\nINV-CSV-1,SKU-CSV,مشتری CSV,1405/01/01,300000,300000,تسویه‌شده,سالت نیکوتین,1,300000'],
    'invoices.csv',
    { type: 'text/csv' }
  );

  const payload = await parseHesabfaExcelFiles({
    contacts: contactsCsv,
    products: productsCsv,
    invoices: invoicesCsv,
  });

  assert.equal(payload.contacts.length, 1);
  assert.equal(payload.products.length, 1);
  assert.equal(payload.products[0].category, 'جویس و سالت');
  assert.equal(payload.salesInvoices.length, 1);
  assert.equal(payload.salesInvoices[0].totalAmount, 300000);
});
