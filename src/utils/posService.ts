import { InventoryItemRecord, PosServiceLineItem, PromotionRuleRecord } from '../data/erpSeedData';
import {
  calculateCostPerMl,
  exactAdd,
  exactMul,
  exactSub,
  allocateHeaderDiscountLargestRemainder,
} from './erpEngine';

export interface PosCartCalculationRow {
  rowId: string;
  item: InventoryItemRecord;
  qty: number;
  isDecantMl: boolean;
  manualUnitPrice: number;
  lineDiscount?: number;
}

export function computeSystemPosUnitPrice(
  item: InventoryItemRecord,
  isDecantMl: boolean,
  mode: 'normal' | 'festival' | 'reseller',
  promotionRules: PromotionRuleRecord[],
  cartQty: number = 1,
  currentDate?: string,
  targetGroup?: string
): number {
  const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
  let basePrice = item.retailPrice;

  if (mode === 'reseller') {
    basePrice = item.resellerPrice || item.partnerPrice || item.wholesalePrice || item.retailPrice;
  } else if (mode === 'festival') {
    const today = currentDate || new Date().toISOString().slice(0, 10);
    const activeRule = promotionRules.find((r) => {
      if (!r.isActive) return false;
      if (r.applicableSkus.length > 0 && !r.applicableSkus.includes(item.sku)) return false;
      if (r.startDate && today < r.startDate) return false;
      if (r.endDate && today > r.endDate) return false;
      if (
        r.targetGroup &&
        targetGroup &&
        r.targetGroup !== 'همه مشتریان' &&
        r.targetGroup !== targetGroup
      ) {
        return false;
      }
      // Order-level fixed bundle/quantity discount is applied to cart totals, not individual item unit price
      if (r.festivalType === 'خرید بالای X قلم' && r.discountType === 'fixed') return false;
      if (r.festivalType === 'خرید بالای X قلم' && r.minQty && cartQty < r.minQty) return false;
      return true;
    });

    if (activeRule) {
      if (activeRule.discountType === 'percent') {
        basePrice = Math.round(item.retailPrice * (1 - activeRule.discountValue / 100));
      } else {
        basePrice = Math.max(0, item.retailPrice - activeRule.discountValue);
      }
    } else {
      basePrice = Math.round(item.retailPrice * 0.92);
    }
  }

  if (isDecantMl) {
    return Math.round(basePrice / bottleVol);
  }
  return basePrice;
}

export function calculatePosCartTotals(params: {
  cart: PosCartCalculationRow[];
  serviceLines: PosServiceLineItem[];
  pricingMode: 'normal' | 'festival' | 'reseller';
  promotionRules: PromotionRuleRecord[];
  paidAmountInput: number | null;
  manualCartDiscount?: number;
  loyaltyRedeemAmount?: number;
}) {
  const goodsTotal = params.cart.reduce(
    (sum, r) => exactAdd(sum, Math.round(exactMul(r.qty, r.manualUnitPrice))),
    0
  );
  const servicesTotal = params.serviceLines.reduce(
    (sum, s) => exactAdd(sum, s.feeAmount),
    0
  );
  const totalQtyInCart = params.cart.reduce(
    (sum, r) => sum + (r.isDecantMl ? 1 : r.qty),
    0
  );

  const activeQuantityRule =
    params.pricingMode === 'festival'
      ? params.promotionRules.find(
          (r) =>
            r.isActive &&
            r.festivalType === 'خرید بالای X قلم' &&
            totalQtyInCart >= (r.minQty || 3)
        ) || null
      : null;

  const totalLineDiscounts = params.cart.reduce(
    (sum, r) => exactAdd(sum, Math.max(0, Number(r.lineDiscount) || 0)),
    0
  );

  const festivalExtraDiscount = activeQuantityRule
    ? activeQuantityRule.discountType === 'fixed'
      ? activeQuantityRule.discountValue
      : 0
    : 0;

  const totalOtherDiscounts = exactAdd(
    festivalExtraDiscount,
    exactAdd(Math.max(0, params.manualCartDiscount || 0), Math.max(0, params.loyaltyRedeemAmount || 0))
  );

  const totalHeaderDiscount = exactAdd(totalLineDiscounts, totalOtherDiscounts);

  const grandTotal = Math.max(
    0,
    exactSub(exactAdd(goodsTotal, servicesTotal), totalHeaderDiscount)
  );

  const otherAllocations = allocateHeaderDiscountLargestRemainder(
    params.cart.map((r) => ({
      id: r.rowId,
      grossAmount: Math.max(0, Math.round(exactMul(r.qty, r.manualUnitPrice)) - Math.max(0, Number(r.lineDiscount) || 0)),
    })),
    totalOtherDiscounts
  );

  const cartLinesWithDiscount = params.cart.map((r) => {
    const gross = Math.round(exactMul(r.qty, r.manualUnitPrice));
    const lineDisc = Math.max(0, Number(r.lineDiscount) || 0);
    const otherDisc = otherAllocations.get(r.rowId) || 0;
    const totalLineDisc = exactAdd(lineDisc, otherDisc);
    const net = Math.max(0, gross - totalLineDisc);
    return {
      ...r,
      grossAmount: gross,
      lineDiscount: lineDisc,
      allocatedHeaderDiscount: totalLineDisc,
      netLineAmount: net,
    };
  });

  const effectivePaidAmount =
    params.paidAmountInput === null
      ? grandTotal
      : Math.max(0, params.paidAmountInput);
  const creditReceivableAmount = Math.max(
    0,
    exactSub(grandTotal, effectivePaidAmount)
  );

  return {
    goodsTotal,
    servicesTotal,
    totalQtyInCart,
    totalLineDiscounts,
    activeQuantityRule,
    festivalExtraDiscount,
    totalHeaderDiscount,
    grandTotal,
    effectivePaidAmount,
    creditReceivableAmount,
    cartLinesWithDiscount,
  };
}

export function resolveItemRowValuationCost(
  item: InventoryItemRecord,
  isDecantMl: boolean,
  inventoryItems?: InventoryItemRecord[]
): number {
  if (
    item.isBundle &&
    item.bundleComponentItems &&
    item.bundleComponentItems.length > 0 &&
    inventoryItems
  ) {
    const compCost = item.bundleComponentItems.reduce((sum, comp) => {
      const found = inventoryItems.find((i) => i.sku === comp.sku);
      return sum + (found ? (found.valuationRate || 0) * comp.qty : 0);
    }, 0);
    if (compCost > 0) return compCost;
  }
  const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
  return isDecantMl
    ? calculateCostPerMl(item.valuationRate, bottleVol)
    : item.valuationRate;
}

export interface ReceiptExportData {
  invoiceNo?: string;
  customerName?: string;
  customerPhone?: string;
  date?: string;
  cashierName?: string;
  cartLines: Array<{
    name: string;
    sku?: string;
    qty: number;
    uom?: string;
    finalManualUnitPrice?: number;
    lineDiscount?: number;
    netLineAmount?: number;
  }>;
  serviceLines?: Array<{
    serviceTitle: string;
    feeAmount: number;
  }>;
  goodsTotal: number;
  servicesTotal?: number;
  totalDiscount?: number;
  grandTotal: number;
  paidAmount?: number;
  paymentMethodLabel?: string;
}

/**
 * Generates an impeccably styled Persian plain-text receipt with Unicode borders
 * for instant one-click copying to WhatsApp, SMS, or plain text file export.
 */
export function generatePlainTextReceipt(receipt: ReceiptExportData): string {
  const border = '═'.repeat(42);
  const divider = '─'.repeat(42);
  const invNo = receipt.invoiceNo || 'INV-DRAFT';
  const custName = receipt.customerName || 'مشتری حضوری';
  const custPhone = receipt.customerPhone ? ` (${receipt.customerPhone})` : '';
  const dateStr = receipt.date || new Date().toLocaleDateString('fa-IR');
  const cashier = receipt.cashierName || 'صندوق امکان';

  const lines: string[] = [
    border,
    '          فروشگاه و خدمات فنی امکان         ',
    '       رسید الکترونیک صندوق فروشگاه        ',
    border,
    `شماره فاکتور: ${invNo}`,
    `تاریخ و زمان: ${dateStr}`,
    `صندوقدار:     ${cashier}`,
    `مشتری:        ${custName}${custPhone}`,
    divider,
    'اقلام فاکتور:',
  ];

  if (receipt.cartLines.length === 0) {
    lines.push('  (بدون کالا)');
  } else {
    receipt.cartLines.forEach((l, idx) => {
      const uom = l.uom || 'عدد';
      const unitP = l.finalManualUnitPrice ? `${Number(l.finalManualUnitPrice).toLocaleString('fa-IR')} ت` : '—';
      const disc = l.lineDiscount && l.lineDiscount > 0 ? ` | تخفیف: ${Number(l.lineDiscount).toLocaleString('fa-IR')} ت` : '';
      const gross = (l.qty || 1) * (l.finalManualUnitPrice || 0);
      const net = l.netLineAmount !== undefined ? l.netLineAmount : Math.max(0, gross - (l.lineDiscount || 0));
      lines.push(`${idx + 1}. ${l.name}`);
      lines.push(`   تعداد: ${l.qty} ${uom} | فی: ${unitP}${disc}`);
      lines.push(`   مبلغ ردیف: ${Number(net).toLocaleString('fa-IR')} تومان`);
    });
  }

  if (receipt.serviceLines && receipt.serviceLines.length > 0) {
    lines.push(divider);
    lines.push('خدمات فنی و تعمیرات:');
    receipt.serviceLines.forEach((srv) => {
      lines.push(`• ${srv.serviceTitle}: ${Number(srv.feeAmount).toLocaleString('fa-IR')} تومان`);
    });
  }

  lines.push(divider);
  lines.push(`جمع ناخالص کالاها:  ${Number(receipt.goodsTotal).toLocaleString('fa-IR')} تومان`);
  if (receipt.servicesTotal && receipt.servicesTotal > 0) {
    lines.push(`جمع خدمات فنی:        ${Number(receipt.servicesTotal).toLocaleString('fa-IR')} تومان`);
  }
  if (receipt.totalDiscount && receipt.totalDiscount > 0) {
    lines.push(`مجموع تخفیفات:       -${Number(receipt.totalDiscount).toLocaleString('fa-IR')} تومان`);
  }
  lines.push(divider);
  lines.push(`مبلغ نهایی پرداخت:    ${Number(receipt.grandTotal).toLocaleString('fa-IR')} تومان`);
  if (receipt.paymentMethodLabel) {
    lines.push(`شیوه پرداخت:          ${receipt.paymentMethodLabel}`);
  }
  if (receipt.paidAmount !== undefined) {
    lines.push(`مبلغ دریافتی:         ${Number(receipt.paidAmount).toLocaleString('fa-IR')} تومان`);
  }
  lines.push(divider);
  lines.push('از حسن انتخاب و اعتماد شما سپاسگزاریم');
  lines.push('امکان | سامانه‌ی جامع مدیریت فروشگاه و انبار');
  lines.push(border);

  return lines.join('\n');
}

export function normalizePhoneNumber(raw?: string): string {
  if (!raw) return '';
  let p = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^0-9+]/g, '')
    .trim();
  if (p.startsWith('+98')) p = '0' + p.slice(3);
  if (p.startsWith('0098')) p = '0' + p.slice(4);
  if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
  if (p.length === 10 && p.startsWith('9')) p = '0' + p;
  return p;
}

export function triggerBrowserDownload(
  contentOrBlob: Blob | string,
  fileName: string,
  mimeType: string = 'application/json'
): void {
  try {
    const blob = typeof contentOrBlob === 'string'
      ? new Blob([contentOrBlob], { type: mimeType })
      : contentOrBlob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      } catch {
        // cleanup ignore
      }
    }, 1500);
  } catch (err) {
    console.error('triggerBrowserDownload failed:', err);
  }
}
