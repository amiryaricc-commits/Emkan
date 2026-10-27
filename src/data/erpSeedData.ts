export type DocStatus = 0 | 1 | 2; // 0 = پیش‌نویس، 1 = ثبت قطعی، 2 = ابطال‌شده

export type WarehouseKey = 'vitrine' | 'shop_storage' | 'central_external' | 'consignment' | 'in_transit' | string;

export interface WarehouseRecord {
  id: string;
  key: WarehouseKey;
  name: string;
  accountCode: string;
  location: string;
  manager?: string;
  description: string;
  isDefault?: boolean;
}

export interface AccountNode {
  id: string;
  code: string;
  name: string;
  category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
  level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
  parentCode?: string;
  openingBalance?: number;
  balance: number;
  currency: 'IRR' | 'USD' | 'AED';
}

export interface GLEntryRecord {
  id: string;
  postingDate: string;
  accountCode: string;
  accountName: string;
  partyId?: string;
  partyType?: 'مشتری' | 'تامین‌کننده' | 'سهامدار' | '—';
  partyName?: string;
  debit: number;
  credit: number;
  voucherType:
    | 'Sales Invoice'
    | 'Sales Return'
    | 'Purchase Invoice'
    | 'Journal Entry'
    | 'Payment Entry'
    | 'POS Invoice'
    | 'Cheque Clearance'
    | 'Stock Reconciliation';
  voucherNo: string;
  costCenter: string;
  branchDimension: string;
  remarks?: string;
  isCancelled?: boolean;
  isReversal?: boolean;
  timestamp?: number;
  serial?: number;
}

export interface InvoiceLineItem {
  id: string;
  sku: string;
  itemName: string;
  uom: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  netLineAmount: number;
  valuationRate: number;
  parentTag?: string;
  isDecantMl?: boolean;
  sector?: 'vape' | 'pc';
  warehouseKey?: WarehouseKey;
  lineDiscountType?: 'percent' | 'fixed';
  lineDiscountAmount?: number;
  allocatedHeaderDiscount?: number;
  skuBreakdownCompleted?: boolean;
}

export interface PosServiceLineItem {
  id: string;
  serviceTitle: string;
  feeAmount: number;
  linkedConsumableSku?: string;
  linkedConsumableName?: string;
  linkedConsumableQty?: number;
  consumableCost?: number;
  isEstimatedConsumption?: boolean;
  estimatedMaterialCost?: number;
}

export interface SalesInvoiceRecord {
  id: string;
  invoiceNo: string;
  docstatus: DocStatus;
  isHistoricalArchive?: boolean;
  archiveNote?: string;
  sourceStatus?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  referralName?: string;
  pricingMode?: 'normal' | 'festival' | 'reseller';
  paymentAccountCode?: string;
  paymentMethodLabel?: 'کارتخوان (پوز)' | 'کارت بانکی (کارت به کارت)' | 'نقد (صندوق مغازه)';
  date: string;
  dueDate: string;
  branchDimension: string;
  costCenter?: string;
  channelDimension: string;
  paymentTermsTemplate: string;
  updateStock: boolean;
  isSubscription: boolean;
  subscriptionInterval?: string;
  status:
    | 'پیش‌نویس'
    | 'پرداخت‌شده'
    | 'نسیه (بدهکار)'
    | 'اقساطی فعال'
    | 'معوق'
    | 'مرجوعی (یادداشت بستانکاری)'
    | 'ابطال‌شده';
  returnResolutionMode?: 'credit_balance' | 'exchange' | 'cash_refund';
  totalAmount: number;
  netAmount?: number;
  paidAmount: number;
  discountAmount?: number;
  creditedAmount?: number;
  returnAgainst?: string;
  cogsAmount?: number;
  vapeCogsAmount?: number;
  pcCogsAmount?: number;
  vapeRevenueAmount?: number;
  pcRevenueAmount?: number;
  itemsSummary: string;
  lines?: InvoiceLineItem[];
  serviceLines?: PosServiceLineItem[];
  payments?: Array<{ accountCode: string; amount: number; methodLabel?: string }>;
}

export interface PurchaseInvoiceRecord {
  id: string;
  billNo: string;
  docstatus: DocStatus;
  supplierId?: string;
  supplierName: string;
  date: string;
  warehouse: string;
  branchDimension?: string;
  costCenter?: string;
  status:
    | 'پیش‌نویس'
    | 'تسویه‌شده'
    | 'بدهکار باز'
    | 'برگشت از خرید (یادداشت بدهکاری)'
    | 'ابطال‌شده';
  totalAmount: number;
  discountReceived?: number;
  freightAmount?: number;
  paidAmount?: number;
  creditedAmount?: number;
  returnAgainst?: string;
  landedCostAdded: number;
  itemsSummary: string;
  parentTag?: string;
  itemCondition?: string;
  itemType?: string;
  sector?: 'vape' | 'pc';
  deliveryStatus?: 'رسیده' | 'در راه (هنوز نرسیده)' | 'در انتظار رسیدن بار';
  cancelledStatus?: 'Cancelled';
  paymentAccountCode?: string;
  paymentMode?: 'کارتخوان (پوز)' | 'کارت به کارت' | 'نقد (صندوق مغازه)' | 'نسیه تعهدی';
  paymentNotes?: string;
  settlementDueDate?: string;
  skuBreakdownCompleted?: boolean;
  lines?: InvoiceLineItem[];
}

export interface JournalEntryRecord {
  id: string;
  voucherNo: string;
  postingDate: string;
  docstatus: DocStatus;
  title: string;
  branchDimension: string;
  totalDebit: number;
  totalCredit: number;
  expenseCategory?: string;
  paidFromAccountCode?: string;
  lines: {
    id: string;
    accountCode: string;
    accountName: string;
    partyType?: 'مشتری' | 'تامین‌کننده' | 'سهامدار' | '—';
    partyName?: string;
    costCenter?: string;
    dimensionBranch?: string;
    debit: number;
    credit: number;
    note?: string;
  }[];
}

export interface PaymentEntryRecord {
  id: string;
  paymentNo: string;
  postingDate: string;
  docstatus: DocStatus;
  paymentType:
    | 'دریافت از مشتری'
    | 'پرداخت به تأمین‌کننده'
    | 'استرداد وجه به مشتری';
  partyName: string;
  partyId?: string;
  modeOfPayment:
    | 'حواله بانکی پایا/ساتنا'
    | 'کارتخوان (پوز)'
    | 'کارت به کارت'
    | 'نقد (صندوق)'
    | 'چک صیادی';
  bankAccountCode: string;
  referenceVoucherNo: string;
  amount: number;
  branchDimension: string;
  costCenter: string;
}

export interface ChequeRecord {
  id: string;
  sayadiNo: string;
  type: 'دریافتنی از مشتری' | 'پرداختنی به تامین‌کننده';
  partyName: string;
  bankName: string;
  amount: number;
  dueDate: string;
  clearanceDate?: string;
  status: 'در جریان وصول' | 'وصول‌شده (پاس‌شده)' | 'خرج‌شده' | 'برگشتی';
}

export interface CostCenterRecord {
  id: string;
  code: string;
  name: string;
  parentName: string;
  allocatedBudget: number;
  spentAmount: number;
  revenueGenerated: number;
  controlPolicy: 'WARN' | 'STOP';
  autoAllocationPercent: number;
}

export interface RecurringExpenseTemplate {
  id: string;
  code: string;
  name: string;
  defaultMonthlyAmount: number;
  accountCode: string;
  dueDayOfMonth: number;
  costCenterName: string;
}

export interface MonthlyExpenseLedgerRecord {
  id: string;
  templateId: string;
  expenseName: string;
  monthYear: string; // e.g. '۱۴۰۴/۰۸'
  amount: number;
  paidFromAccountCode: string;
  paymentDate: string;
  voucherNo: string;
  isLocked: boolean;
  note?: string;
}

export interface FixedAssetRecord {
  id: string;
  assetTag: string;
  name: string;
  category: 'تجهیزات فناوری' | 'دکوراسیون و فروشگاهی' | 'وسایل نقلیه';
  location: string;
  purchaseDate: string;
  purchaseValue: number;
  currentBookValue: number;
  paidFromAccountCode?: string;
  status: 'فعال در بهره‌برداری' | 'فروخته‌شده' | 'اسقاط‌شده' | 'تجدید ارزیابی‌شده';
}

export interface ShareholderRecord {
  id: string;
  name: string;
  folioNo: string;
  sharesCount: number;
  ownershipPercent: number; // Capital share C_i (default 50%)
  profitSharePercent?: number; // Profit share P_i (default 70% / 30%)
  capitalBalance: number;
  personalCapitalInjected?: number;
  dividendPaid: number; // Total withdrawals (Drawings)
}

export interface ShareholderRuleSnapshot {
  id: string;
  effectiveDate: string;
  partner1Name: string;
  partner1CapitalPct: number;
  partner1ProfitPct: number;
  previousPartner1CapitalPct?: number;
  previousPartner1ProfitPct?: number;
  partner2Name: string;
  partner2CapitalPct: number;
  partner2ProfitPct: number;
  previousPartner2CapitalPct?: number;
  previousPartner2ProfitPct?: number;
  frozenPartner1Wallet: number;
  frozenPartner2Wallet: number;
  frozenRecoveryPool: number;
  note: string;
}

export interface ShareholderDrawingRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  date: string;
  amount: number;
  paidFromAccountCode: string;
  note: string;
}

export interface BundleComponentSpec {
  sku: string;
  name: string;
  qty: number;
}

export interface FifoLayerSpec {
  qty: number;
  unitCost: number;
  date: string;
  sourceVoucherId?: string;
}

export interface InventoryItemRecord {
  id: string;
  sku: string;
  name: string;
  category:
    | 'دستگاه پاد و ماد'
    | 'جویس و سالت'
    | 'کویل و کارتریج'
    | 'پکیج باندل'
    | 'قطعات کامپیوتر و سخت‌افزار'
    | 'کارت هدیه و خدمات'
    | 'سایر کالاها';
  sector?: 'vape' | 'pc';
  brand: string;
  model?: string;
  parentTag?: string;
  itemType?: string;
  isActive?: boolean;
  flavor?: string;
  nicotine?: string;
  batteryCapacityMah?: number;
  puffCount?: string;
  color?: string;
  resistanceOhm?: string;
  liquidVolumeMl?: number;
  podTankCapacityMl?: number;
  allowDecantSale?: boolean;
  bottleVolumeMl?: number;
  openBottleRemainingMl?: number;
  costPerMl?: number;
  condition?: 'آکبند شرکتی' | 'کارکرده / تستر' | 'آکبند' | 'استوک';
  isBundle?: boolean;
  bundleComponents?: string[];
  bundleComponentItems?: BundleComponentSpec[];
  uomPrimary: string;
  stockQty: number;
  warehouseStock?: Record<string, number>;
  warehouseValuationRates?: Record<string, number>;
  warehouseFifoLayers?: Record<string, FifoLayerSpec[]>;
  isVirtualDecantBottle?: boolean;
  parentBottleSku?: string;
  totalInQty?: number;
  totalOutQty?: number;
  reservedQty: number;
  reorderLevel: number;
  valuationRate: number;
  fifoLayers?: FifoLayerSpec[];
  retailPrice: number;
  wholesalePrice: number;
  partnerPrice: number;
  resellerPrice?: number;
  festivalPrice?: number;
  serialNumbers: string[];
  batchNo: string;
  expiryDate: string;
  sourceCategory?: string;
  sourceStatus?: string;
  daysInStock?: number;
  lastSoldDate?: string;
}

export interface PromotionRuleRecord {
  id: string;
  name: string;
  festivalType: 'تخفیف خرید اول' | 'خرید بالای X قلم' | 'تخفیف مناسبتی' | 'حراج رسوب انبار';
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minQty: number;
  targetGroup: 'همه مشتریان' | 'مشتریان عادی' | 'ریسلرها (همکاران)';
  startDate: string;
  endDate: string;
  applicableSkus: string[]; // empty = all items
  paymentModel: 'نقد' | 'نسیه' | 'همه';
  isActive: boolean;
}

export interface CustomerContactRecord {
  id: string;
  sourceCode: string;
  fullName: string;
  personType: string;
  role: string;
  contactCategory?: 'customer' | 'reseller' | 'supplier';
  phone: string;
  vapingStyle?: string;
  instagramId?: string;
  telegramId?: string;
  profession?: string;
  creditBalance?: number; // بستانکاری
  debitBalance?: number; // بدهکاری
  manualTotalPurchases?: number;
  manualNetProfit?: number;
  notes: string;
}

export interface BulkSmsContactRecord {
  id: string;
  phone: string;
  fullName: string;
  groupTag: string;
  importedAt: string;
}

export interface CrmLeadRecord {
  id: string;
  fullName: string;
  phone: string;
  source: 'اینستاگرام' | 'تلگرام' | 'تماس تلفنی' | 'مراجعه حضوری' | 'کمپین اینفلوئنسر';
  campaignName: string;
  interestStyle: 'سبک MTL (سیگاری)' | 'سبک DTL (قلیانی)' | 'همکار عمده‌فروش';
  stage: 'لید جدید' | 'در حال مذاکره' | 'ارسال پیش‌فاکتور' | 'مشتری وفادار';
  probability: number;
  estimatedValue: number;
  loyaltyTier: 'طلایی' | 'نقره‌ای' | 'برنزی';
  loyaltyPoints: number;
  clvAmount: number;
  lastPurchaseDaysAgo: number;
}

export interface OperationalCalendarEvent {
  id: string;
  title: string;
  date: string; // Persian date YYYY/MM/DD
  time: string; // HH:mm
  category:
    | 'supplier_due'
    | 'customer_receivable'
    | 'fixed_expense'
    | 'in_transit'
    | 'task'
    | 'customer_promise';
  amount?: number;
  referenceNo?: string;
  partyName?: string;
  isCompleted: boolean;
  notes?: string;
}

export interface CustomerWishlistRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  requestedItemName: string;
  category: 'جویس و سالت' | 'دستگاه پاد و ماد' | 'کویل و کارتریج' | 'قطعات کامپیوتر';
  flavorOrSpec: string;
  requestedDate: string;
  promiseDate: string;
  status: 'در انتظار تامین' | 'موجود شد' | 'تحویل مشتری شد';
  notes?: string;
}

export interface MasterOptionsRegistry {
  tags: string[];
  conditions: string[];
  itemTypes: string[];
  nicotines: string[];
  puffs: string[];
  colors: string[];
  resistances: string[];
  liquidVolumes: string[];
  podCapacities: string[];
  categorySectors?: Record<string, 'vape' | 'pc'>;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  docType: string;
  docId: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
}

export interface StockLedgerEntryRecord {
  id: string;
  postingDate: string;
  sku: string;
  itemName: string;
  warehouseKey: WarehouseKey;
  qtyChange: number;
  balanceAfter: number;
  valuationRate: number;
  voucherType: 'POS Invoice' | 'Purchase Receipt' | 'Sales Return' | 'Stock Transfer' | 'برگشت بابت ابطال سند' | 'Service Consumable' | 'خسارت سرقت و فیش جعلی' | string;
  voucherNo: string;
  sector?: 'vape' | 'pc';
  timestamp?: number;
  serial?: number;
}

export interface TimeMachineSnapshotRecord {
  id: string;
  versionCode: string;
  timestamp: string;
  backupType: 'بک‌آپ دستی' | 'ایمپورت فایل' | 'بک‌آپ خودکار';
  label: string;
  checksum: string;
  invoiceCount: number;
  skuCount: number;
  totalAssets: number;
  accounts: AccountNode[];
  glEntries: GLEntryRecord[];
  journalEntries: JournalEntryRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices: PurchaseInvoiceRecord[];
  inventoryItems: InventoryItemRecord[];
  customerContacts: CustomerContactRecord[];
  shareholders: ShareholderRecord[];
  masterOptions?: MasterOptionsRegistry;
  categorySectors?: Record<string, 'vape' | 'pc'>;
  shareholderSnapshots?: ShareholderRuleSnapshot[];
  monthlyExpenseLedger?: MonthlyExpenseLedgerRecord[];
  stockLedgerEntries?: StockLedgerEntryRecord[];
  theftFraudIncidents?: TheftFraudIncidentRecord[];
  calendarEvents?: OperationalCalendarEvent[];
  customerWishlist?: CustomerWishlistRecord[];
  recurringTemplates?: RecurringExpenseTemplate[];
}

export interface IncidentItemLine {
  sku: string;
  itemName: string;
  qty: number;
  unitCost: number;
  unitRetailPrice: number;
  totalCost: number;
  totalRetailValue: number;
}

export type TheftFraudIncidentType = 'fake_payment_slip' | 'physical_theft' | 'fraud_scam' | 'untraceable_deficit';

export interface TheftFraudIncidentRecord {
  id: string;
  incidentNo: string;
  incidentDate: string; // Persian date YYYY/MM/DD
  incidentTime?: string; // HH:mm
  incidentType: TheftFraudIncidentType;
  incidentTypeLabel: string;
  warehouseKey: WarehouseKey;
  warehouseName: string;
  title: string;
  items: IncidentItemLine[];
  totalQuantity: number;
  totalLossCost: number; // بر مبنای نرخ ارزش‌گذاری انبار (بهای تمام‌شده کالای از دست‌رفته)
  totalLossRetail: number; // ارزش بالقوه فروش
  suspectInfo?: string; // اطلاعات فرد کلاهبردار، سارق یا خریدار متواری
  policeReportNo?: string; // شماره پرونده یا گزارش کلانتری
  fakePaymentSlipRef?: string; // شماره پیگیری یا رسید جعلی ارائه شده
  cctvRecordRef?: string; // شماره فایل یا تایم‌کد دوربین مداربسته
  notes?: string;
  glVoucherNo?: string; // شماره سند دفتر کل (سند دوبل زیان سرقت)
  recordedBy?: string;
  status: 'ثبت قطعی' | 'تحت پیگیری قضایی' | 'خسارت جبران‌شده' | 'بایگانی‌شده';
  createdAt: string;
}

export const DEFAULT_BRANCH_NAME = 'فروشگاه مرکزی امکان';

export const INITIAL_WAREHOUSES: WarehouseRecord[] = [
  {
    id: 'wh-1',
    key: 'vitrine',
    name: 'ویترین / مرکزی',
    accountCode: '110401',
    location: 'ویترین و انبار مرکزی فروشگاه امکان',
    description: 'موجودی چیدمان‌شده در ویترین / انبار مرکزی برای فروش مستقیم روزانه',
    isDefault: true,
  },
  {
    id: 'wh-2',
    key: 'shop_storage',
    name: 'انبار مغازه (دپوی داخل مغازه)',
    accountCode: '110402',
    location: 'قفسه‌های پشتی داخل مغازه',
    description: 'موجودی دپوی داخل مغازه برای شارژ سریع ویترین',
  },
  {
    id: 'wh-3',
    key: 'central_external',
    name: 'انبار خارجی (ورود اولیه بار)',
    accountCode: '110403',
    location: 'انبار خارجی امکان',
    description: 'محل ورود اولیه بارهای خریداری‌شده و موجودی کلان پیش از تفکیک ویترین',
  },
  {
    id: 'wh-4',
    key: 'consignment',
    name: 'انبار کالای امانی (امانت)',
    accountCode: '110404',
    location: 'نزد همکاران / ریسلرها',
    description: 'کالاهایی که به صورت امانت نزد افراد یا همکاران قرار دارد',
  },
  {
    id: 'wh-5',
    key: 'in_transit',
    name: 'انبار کالای در راه (سفارش‌های در مسیر)',
    accountCode: '110405',
    location: 'در مسیر انتقال / گمرک / باربری',
    description: 'کالاهای خریداری‌شده که هنوز به صورت فیزیکی به انبار مغازه یا مرکزی نرسیده‌اند',
  },
];

export const INITIAL_MASTER_OPTIONS: MasterOptionsRegistry = {
  tags: ['پاد یکبارمصرف', 'سالت نیکوتین', 'جویس فری‌بیس', 'سیستم پاد ماد', 'کارتریج و کویل', 'قطعات کامپیوتر', 'کارت گرافیک', 'پردازنده و مادربرد', 'رم و حافظه SSD'],
  conditions: ['آکبند', 'استوک'],
  itemTypes: ['جویس و سالت', 'دستگاه پاد و ماد', 'کویل و کارتریج', 'قطعات کامپیوتر و سخت‌افزار'],
  nicotines: ['بدون نیکوتین (0mg)', '۳ میلی‌گرم (3mg)', '۶ میلی‌گرم (6mg)', '۲۰ میلی‌گرم (20mg)', '۲۵ میلی‌گرم (25mg)', '۳۰ میلی‌گرم (30mg)', '۳۵ میلی‌گرم (35mg)', '۵۰ میلی‌گرم (50mg)'],
  puffs: ['۵۰۰۰ پاف', '۱۰۰۰۰ پاف', '۱۵۰۰۰ پاف', '۲۵۰۰۰ پاف', '۴۰۰۰۰ پاف', '۶۰۰۰۰ پاف'],
  colors: ['مشکی مات', 'نقره‌ای متالیک', 'آبی اقیانوسی', 'قرمز یاقوتی', 'بنفش نئونی', 'سفید صدفی'],
  resistances: ['0.15 Ω', '0.2 Ω', '0.4 Ω', '0.6 Ω', '0.8 Ω', '1.0 Ω', '1.2 Ω'],
  liquidVolumes: ['2 ml', '3 ml', '4.5 ml', '5 ml', '8 ml', '10 ml', '15 ml', '30 ml', '60 ml', '100 ml', '120 ml'],
  podCapacities: ['2 ml', '3 ml', '4.5 ml', '5 ml', '8 ml'],
  categorySectors: {
    'پاد یکبارمصرف': 'vape',
    'سالت نیکوتین': 'vape',
    'جویس فری‌بیس': 'vape',
    'سیستم پاد ماد': 'vape',
    'کارتریج و کویل': 'vape',
    'قطعات کامپیوتر': 'pc',
    'کارت گرافیک': 'pc',
    'پردازنده و مادربرد': 'pc',
    'رم و حافظه SSD': 'pc',
  },
};

export const INITIAL_ACCOUNTS: AccountNode[] = [
  // ۱۰۰۰ - دارایی‌ها
  { id: 'acc-1', code: '1000', name: 'دارایی‌ها', category: 'دارایی', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-2', code: '1100', name: 'دارایی‌های جاری و نقدینگی', category: 'دارایی', level: 'کل', parentCode: '1000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-3', code: '1101', name: 'حساب‌های تسویه و نقدینگی مغازه', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-4', code: '110101', name: 'حساب دستگاه کارتخوان (پوز)', category: 'دارایی', level: 'تفصیلی', parentCode: '1101', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-5', code: '110102', name: 'حساب کارت بانکی (کارت به کارت)', category: 'دارایی', level: 'تفصیلی', parentCode: '1101', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-5b', code: '110103', name: 'حساب نقدی (صندوق نقد مغازه)', category: 'دارایی', level: 'تفصیلی', parentCode: '1101', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-6', code: '1102', name: 'حساب‌های دریافتنی تجاری (نسیه مشتریان)', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-7', code: '1103', name: 'اسناد دریافتنی (چک‌های دریافتی از مشتریان)', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-8', code: '1104', name: 'موجودی کالاهای انبار (پنج‌گانه)', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-8w1', code: '110401', name: 'موجودی انبار ۱: ویترین / مرکزی', category: 'دارایی', level: 'تفصیلی', parentCode: '1104', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-8w2', code: '110402', name: 'موجودی انبار ۲: انبار مغازه (دپوی داخل مغازه)', category: 'دارایی', level: 'تفصیلی', parentCode: '1104', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-8w3', code: '110403', name: 'موجودی انبار ۳: انبار خارجی (ورود اولیه بار)', category: 'دارایی', level: 'تفصیلی', parentCode: '1104', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-8w4', code: '110404', name: 'موجودی انبار ۴: انبار کالای امانی (امانت)', category: 'دارایی', level: 'تفصیلی', parentCode: '1104', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-8w5', code: '110405', name: 'موجودی انبار ۵: انبار کالای در راه (سفارش‌های در مسیر)', category: 'دارایی', level: 'تفصیلی', parentCode: '1104', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-9', code: '1200', name: 'دارایی‌های ثابت مشهود', category: 'دارایی', level: 'کل', parentCode: '1000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-9b', code: '1201', name: 'اموال، ماشین‌آلات و تجهیزات مغازه', category: 'دارایی', level: 'معین', parentCode: '1200', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-9c', code: '1202', name: 'استهلاک انباشته دارایی‌های ثابت مشهود', category: 'دارایی', level: 'معین', parentCode: '1200', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۲۰۰۰ - بدهی‌ها
  { id: 'acc-10', code: '2000', name: 'بدهی‌ها و تعهدات', category: 'بدهی', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-10b', code: '2100', name: 'بدهی‌های جاری تجاری', category: 'بدهی', level: 'کل', parentCode: '2000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-11', code: '2101', name: 'بدهی‌های تجاری (حساب‌های پرداختنی به تأمین‌کنندگان)', category: 'بدهی', level: 'معین', parentCode: '2100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-12', code: '2102', name: 'پیش‌دریافت و بستانکاری مشتریان (مرجوعی)', category: 'بدهی', level: 'معین', parentCode: '2100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-13', code: '2103', name: 'مالیات و عوارض پرداختنی', category: 'بدهی', level: 'معین', parentCode: '2100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-13b', code: '2104', name: 'هزینه حمل و کرایه پرداختنی', category: 'بدهی', level: 'معین', parentCode: '2100', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۳۰۰۰ - حقوق صاحبان سهام و سهامداران
  { id: 'acc-14', code: '3000', name: 'حقوق صاحبان سهام و سرمایه', category: 'سرمایه', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-14b', code: '3100', name: 'سرمایه و سهم‌الشرکه سهامداران', category: 'سرمایه', level: 'کل', parentCode: '3000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-15', code: '3101', name: 'سرمایه ثبت‌شده و صندوق احیای انبار (۵۰/۵۰)', category: 'سرمایه', level: 'معین', parentCode: '3100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-15a', code: '3102', name: 'سود و زیان انباشته سنواتی', category: 'سرمایه', level: 'معین', parentCode: '3100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-15b', code: '3103', name: 'برداشت سود سهامداران (۵۰/۵۰)', category: 'سرمایه', level: 'معین', parentCode: '3100', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۴۰۰۰ - درآمدها
  { id: 'acc-17', code: '4000', name: 'درآمدهای عملیاتی و فروش ماهیانه', category: 'درآمد', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-17b', code: '4100', name: 'درآمد فروش کالا و خدمات', category: 'درآمد', level: 'کل', parentCode: '4000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-18', code: '4101', name: 'درآمد فروش خالص کالا', category: 'درآمد', level: 'معین', parentCode: '4100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-18c', code: '4103', name: 'درآمد کسر مرجوعی و افت قیمت کالا', category: 'درآمد', level: 'معین', parentCode: '4100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-18s', code: '4105', name: 'درآمد خدمات فنی (کویل‌بندی، تعویض پنبه و سرویس)', category: 'درآمد', level: 'معین', parentCode: '4100', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۵۰۰۰ - هزینه‌ها و بهای تمام‌شده
  { id: 'acc-20', code: '5000', name: 'بهای تمام‌شده و هزینه‌های جاری مغازه', category: 'هزینه', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-20b', code: '5100', name: 'بهای تمام‌شده و هزینه‌های عملیاتی مغازه', category: 'هزینه', level: 'کل', parentCode: '5000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-21', code: '5101', name: 'بهای تمام‌شده فروش', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-21b', code: '5102', name: 'بهای تمام‌شده خدمات فنی و مصرفی', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-22', code: '5201', name: 'هزینه اجاره ماهانه مغازه', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-23', code: '5202', name: 'هزینه قبوض (برق، آب، اینترنت و تلفن)', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-24', code: '5203', name: 'هزینه شارژ پاساژ و ساختمان', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-25', code: '5204', name: 'هزینه‌های جاری مغازه (ملزومات، پیک، پذیرایی)', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-26', code: '5205', name: 'زیان و خسارت ناشی از سرقت، فیش جعلی و کلاهبرداری', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
];

export const INITIAL_COST_CENTERS: CostCenterRecord[] = [
  {
    id: 'cc-shop-rent',
    code: 'CC-101',
    name: 'اجاره مغازه',
    parentName: DEFAULT_BRANCH_NAME,
    allocatedBudget: 35000000,
    spentAmount: 0,
    revenueGenerated: 0,
    controlPolicy: 'WARN',
    autoAllocationPercent: 50,
  },
  {
    id: 'cc-shop-bills',
    code: 'CC-102',
    name: 'قبوض برق، آب و اینترنت',
    parentName: DEFAULT_BRANCH_NAME,
    allocatedBudget: 5000000,
    spentAmount: 0,
    revenueGenerated: 0,
    controlPolicy: 'WARN',
    autoAllocationPercent: 15,
  },
  {
    id: 'cc-mall-charge',
    code: 'CC-103',
    name: 'شارژ پاساژ / ساختمان',
    parentName: DEFAULT_BRANCH_NAME,
    allocatedBudget: 4500000,
    spentAmount: 0,
    revenueGenerated: 0,
    controlPolicy: 'WARN',
    autoAllocationPercent: 15,
  },
  {
    id: 'cc-daily-ops',
    code: 'CC-104',
    name: 'خرج‌کرد روزمره (ملزومات، پیک و پذیرایی)',
    parentName: DEFAULT_BRANCH_NAME,
    allocatedBudget: 8000000,
    spentAmount: 0,
    revenueGenerated: 0,
    controlPolicy: 'WARN',
    autoAllocationPercent: 20,
  },
];

export const INITIAL_RECURRING_EXPENSE_TEMPLATES: RecurringExpenseTemplate[] = [
  {
    id: 'tmpl-rent',
    code: 'FIX-01',
    name: 'اجاره ماهانه مغازه',
    defaultMonthlyAmount: 35000000,
    accountCode: '5201',
    dueDayOfMonth: 1,
    costCenterName: 'اجاره مغازه',
  },
  {
    id: 'tmpl-charge',
    code: 'FIX-02',
    name: 'شارژ ماهانه پاساژ / مجتمع',
    defaultMonthlyAmount: 4500000,
    accountCode: '5203',
    dueDayOfMonth: 5,
    costCenterName: 'شارژ پاساژ / ساختمان',
  },
  {
    id: 'tmpl-utilities',
    code: 'FIX-03',
    name: 'قبوض برق، آب و اینترنت فیبر نوری',
    defaultMonthlyAmount: 2800000,
    accountCode: '5202',
    dueDayOfMonth: 15,
    costCenterName: 'قبوض برق، آب و اینترنت',
  },
];

export const INITIAL_SHAREHOLDERS: ShareholderRecord[] = [
  {
    id: 'sh-1',
    name: 'شریک اول (۵۰٪)',
    folioNo: 'SH-001',
    sharesCount: 50,
    ownershipPercent: 50, // C_1 = 50%
    profitSharePercent: 50, // P_1 = 50%
    capitalBalance: 0,
    personalCapitalInjected: 0,
    dividendPaid: 0,
  },
  {
    id: 'sh-2',
    name: 'شریک دوم (۵۰٪)',
    folioNo: 'SH-002',
    sharesCount: 50,
    ownershipPercent: 50, // C_2 = 50%
    profitSharePercent: 50, // P_2 = 50%
    capitalBalance: 0,
    personalCapitalInjected: 0,
    dividendPaid: 0,
  },
];

export const INITIAL_PROMOTION_RULES: PromotionRuleRecord[] = [
  {
    id: 'promo-1',
    name: 'جشنواره خرید بالای ۳ قلم (ویپ و جویس)',
    festivalType: 'خرید بالای X قلم',
    discountType: 'percent',
    discountValue: 8,
    minQty: 3,
    targetGroup: 'همه مشتریان',
    startDate: '۱۴۰۴/۰۸/۰۱',
    endDate: '۱۴۰۴/۰۹/۳۰',
    applicableSkus: [],
    paymentModel: 'نقد',
    isActive: true,
  },
  {
    id: 'promo-2',
    name: 'تخفیف خوش‌آمدگویی خرید اول',
    festivalType: 'تخفیف خرید اول',
    discountType: 'fixed',
    discountValue: 150000,
    minQty: 1,
    targetGroup: 'مشتریان عادی',
    startDate: '۱۴۰۴/۰۸/۰۱',
    endDate: '۱۴۰۴/۱۲/۲۹',
    applicableSkus: [],
    paymentModel: 'همه',
    isActive: true,
  },
];

export const INITIAL_GL_ENTRIES: GLEntryRecord[] = [];
export const INITIAL_SALES_INVOICES: SalesInvoiceRecord[] = [];
export const INITIAL_PURCHASE_INVOICES: PurchaseInvoiceRecord[] = [];
export const INITIAL_JOURNAL_ENTRIES: JournalEntryRecord[] = [];
export const INITIAL_PAYMENT_ENTRIES: PaymentEntryRecord[] = [];
export const INITIAL_CHEQUES: ChequeRecord[] = [];
export const INITIAL_FIXED_ASSETS: FixedAssetRecord[] = []; // Empty by default per spec
export const INITIAL_INVENTORY_ITEMS: InventoryItemRecord[] = [];
export const INITIAL_CRM_LEADS: CrmLeadRecord[] = [];
export const INITIAL_AUDIT_LOGS: AuditLogRecord[] = [];
export const INITIAL_STOCK_LEDGER_ENTRIES: StockLedgerEntryRecord[] = [];
export const INITIAL_THEFT_FRAUD_INCIDENTS: TheftFraudIncidentRecord[] = [];
