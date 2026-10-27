export interface PurchaseInvoiceLineInput {
  itemName: string;
  parentTag?: string;
  qty: number;
  unitCost: number;
  discountAmount?: number;
  notes?: string;
}

export interface PurchaseInvoiceDiscountAllocation {
  lineDiscountAmount: number;
  allocatedHeaderDiscount: number;
  netLineAmount: number;
  valuationRate: number;
}

export function allocatePurchaseInvoiceDiscounts(
  lines: Pick<PurchaseInvoiceLineInput, 'qty' | 'unitCost' | 'discountAmount'>[],
  supplierDiscount: number
): PurchaseInvoiceDiscountAllocation[] {
  const netLineAmounts = lines.map((line) => {
    const gross = Math.max(0, line.qty * line.unitCost);
    const lineDiscountAmount = Math.min(gross, Math.max(0, line.discountAmount || 0));
    return { lineDiscountAmount, netAmount: gross - lineDiscountAmount };
  });
  const totalBeforeSupplierDiscount = netLineAmounts.reduce((sum, line) => sum + line.netAmount, 0);
  const discountToAllocate = Math.min(
    Math.max(0, supplierDiscount),
    totalBeforeSupplierDiscount
  );
  const lastDiscountableLineIndex = netLineAmounts.reduce(
    (lastIndex, line, index) => (line.netAmount > 0 ? index : lastIndex),
    -1
  );
  let remainingDiscount = discountToAllocate;

  return netLineAmounts.map((line, index) => {
    const allocatedHeaderDiscount =
      index === lastDiscountableLineIndex
        ? remainingDiscount
        : totalBeforeSupplierDiscount > 0
          ? Math.min(
              remainingDiscount,
              Math.floor((discountToAllocate * line.netAmount) / totalBeforeSupplierDiscount)
            )
          : 0;
    remainingDiscount -= allocatedHeaderDiscount;
    const netLineAmount = Math.max(0, line.netAmount - allocatedHeaderDiscount);

    return {
      lineDiscountAmount: line.lineDiscountAmount,
      allocatedHeaderDiscount,
      netLineAmount,
      valuationRate: lines[index]?.qty > 0 ? netLineAmount / (lines[index]?.qty || 1) : 0,
    };
  });
}

export function getPopulatedPurchaseInvoiceLines<T extends PurchaseInvoiceLineInput>(
  lines: T[]
): T[] {
  return lines.filter(
    (line) =>
      line.itemName.trim() !== '' ||
      Boolean(line.parentTag?.trim()) ||
      Number(line.qty) > 0 ||
      Number(line.unitCost) > 0 ||
      Number(line.discountAmount) > 0 ||
      Boolean(line.notes?.trim())
  );
}

export function arePurchaseInvoiceLinesValid(lines: PurchaseInvoiceLineInput[]): boolean {
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.itemName.trim() !== '' &&
        Boolean(line.parentTag?.trim()) &&
        Number(line.qty) > 0 &&
        Number(line.unitCost) > 0
    )
  );
}
