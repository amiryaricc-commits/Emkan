import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arePurchaseInvoiceLinesValid,
  getPopulatedPurchaseInvoiceLines,
} from './purchaseInvoice';

test('Purchase invoice submission ignores blank grid rows and preserves valid items', () => {
  const rows = [
    { itemName: 'VGOD', parentTag: 'پاد یکبارمصرف', qty: 10, unitCost: 1_000_000 },
    { itemName: 'Pod System', parentTag: 'سیستم پاد ماد', qty: 5, unitCost: 2_000_000 },
    { itemName: 'Coil Pack', parentTag: 'کویل و کارتریج', qty: 20, unitCost: 500_000 },
    ...Array.from({ length: 5 }, () => ({
      itemName: '',
      parentTag: '',
      qty: 0,
      unitCost: 0,
    })),
  ];

  const populated = getPopulatedPurchaseInvoiceLines(rows);
  assert.equal(populated.length, 3);
  assert.equal(arePurchaseInvoiceLinesValid(populated), true);
  assert.equal(populated.reduce((sum, line) => sum + line.qty, 0), 35);
  assert.equal(
    populated.reduce((sum, line) => sum + line.qty * line.unitCost, 0),
    30_000_000
  );
});

test('Purchase invoice submission still rejects partially completed non-empty rows', () => {
  const rows = getPopulatedPurchaseInvoiceLines([
    { itemName: 'VGOD', parentTag: 'پاد یکبارمصرف', qty: 10, unitCost: 1_000_000 },
    { itemName: 'Incomplete', parentTag: 'سیستم پاد ماد', qty: 0, unitCost: 0 },
    { itemName: '', parentTag: 'کویل و کارتریج', qty: 0, unitCost: 0 },
  ]);

  assert.equal(rows.length, 3);
  assert.equal(arePurchaseInvoiceLinesValid(rows), false);
});
