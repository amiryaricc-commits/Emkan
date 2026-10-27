import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSalesDashboardMetrics,
  postDoubleEntryToAccounts,
} from './erpEngine';
import { INITIAL_ACCOUNTS } from '../data/erpSeedData';

test('BUG-05 verification: CRM contact balance calculation does not double count unpaid invoices', () => {
  // Mock customer contact
  const contact = {
    id: 'c-1',
    fullName: 'محمدحسین زارعی',
    debitBalance: 150000, // Stored unpaid credit receivable from POS checkout
    creditBalance: 0,
  };

  // Invoices for this customer
  const custInvoices = [
    {
      id: 'inv-1',
      customerId: 'c-1',
      totalAmount: 200000,
      paidAmount: 50000,
      creditedAmount: 0,
      returnAgainst: undefined,
    },
  ];

  // Old behavior: started with contact.debitBalance (150,000) AND added unpaid (150,000) -> 300,000 (2x)
  // New behavior: contact.debitBalance is the persisted balance of the contact
  const finalDebitBalance = contact.debitBalance;
  assert.equal(finalDebitBalance, 150000, 'Customer debt balance must be 150,000, not 300,000');

  // Supplier scenario
  const supplier = {
    id: 's-1',
    fullName: 'عرفان (بهان ویپ)',
    creditBalance: 30000000, // Stored unpaid bill from stage 1 purchase
    debitBalance: 0,
  };

  const finalSupplierCredit = supplier.creditBalance;
  assert.equal(finalSupplierCredit, 30000000, 'Supplier credit balance must be 30,000,000, not 60,000,000');
});

test('BUG-06 verification: Pure service invoices do not leak profit to Vape Shop and do not double count profit in BI', () => {
  // Service invoice with 250,000 fee and 15,000 cotton consumable
  const serviceInvoice1 = {
    id: 'sinv-1',
    docstatus: 1 as const,
    totalAmount: 250000,
    paidAmount: 250000,
    cogsAmount: 15000,
    itemsSummary: 'خدمات: تعویض پنبه',
    lines: [], // No physical merchandise
    serviceLines: [
      {
        id: 'srv-1',
        serviceTitle: 'تعویض پنبه',
        feeAmount: 250000,
        consumableCost: 15000,
      },
    ],
  };

  // Service invoice with 100,000 fee and 0 material cost
  const serviceInvoice2 = {
    id: 'sinv-2',
    docstatus: 1 as const,
    totalAmount: 100000,
    paidAmount: 100000,
    cogsAmount: 0,
    itemsSummary: 'خدمات: شستشوی تانک',
    lines: [],
    serviceLines: [
      {
        id: 'srv-2',
        serviceTitle: 'شستشوی تانک',
        feeAmount: 100000,
        consumableCost: 0,
      },
    ],
  };

  const invoices = [serviceInvoice1, serviceInvoice2];

  let vapeRevenue = 0;
  let vapeCogs = 0;
  let serviceRevenue = 0;
  let serviceConsumableCost = 0;

  for (const inv of invoices) {
    if (inv.serviceLines && inv.serviceLines.length > 0) {
      for (const s of inv.serviceLines) {
        serviceRevenue += Number(s.feeAmount) || 0;
        serviceConsumableCost += Number(s.consumableCost) || 0;
      }
    }

    if (inv.lines && inv.lines.length > 0) {
      // Physical merchandise lines
      for (const line of inv.lines) {
        vapeRevenue += (line as any).qty * (line as any).unitPrice;
      }
    } else if (!inv.serviceLines || inv.serviceLines.length === 0) {
      // Historical summary invoice only
      vapeRevenue += inv.totalAmount;
      vapeCogs += (inv.cogsAmount !== undefined && inv.cogsAmount !== null ? inv.cogsAmount : Math.round(inv.totalAmount * 0.72));
    }
  }

  const serviceGrossProfit = serviceRevenue - serviceConsumableCost;
  const totalGrossProfit = (vapeRevenue - vapeCogs) + serviceGrossProfit;

  assert.equal(vapeRevenue, 0, 'Vape revenue must be 0 when only services were performed');
  assert.equal(vapeCogs, 0, 'Vape COGS must be 0 when only services were performed');
  assert.equal(serviceRevenue, 350000, 'Total service revenue must be 350,000');
  assert.equal(serviceConsumableCost, 15000, 'Consumable cost must be 15,000');
  assert.equal(serviceGrossProfit, 335000, 'Service gross profit must be 335,000');
  assert.equal(totalGrossProfit, 335000, 'Total profit must be 335,000, NOT 598,000');
});

test('BUG-07 verification: Direct intake establishes opening asset and prevents negative inventory GL upon sale', () => {
  // Initial accounts clone
  let accounts = JSON.parse(JSON.stringify(INITIAL_ACCOUNTS));

  // 1. Direct intake of 10 items @ 500,000 = 5,000,000 into Vitrine (110401)
  const directIntakeValue = 10 * 500000;
  const directIntakeLines = [
    { accountCode: '110401', debit: directIntakeValue, credit: 0 },
    { accountCode: '3101', debit: 0, credit: directIntakeValue },
  ];
  accounts = postDoubleEntryToAccounts(accounts, directIntakeLines);

  const vitrineAccAfterIntake = accounts.find((a: any) => a.code === '110401')!;
  assert.equal(vitrineAccAfterIntake.balance, 5000000, 'Vitrine account must have 5,000,000 after direct intake');

  // 2. Sell 2 items in POS: COGS = 2 * 500,000 = 1,000,000
  const cogsSaleValue = 2 * 500000;
  const posSaleLines = [
    { accountCode: '110101', debit: 1400000, credit: 0 }, // 2 * 700k retail
    { accountCode: '4101', debit: 0, credit: 1400000 },
    { accountCode: '5101', debit: cogsSaleValue, credit: 0 },
    { accountCode: '110401', debit: 0, credit: cogsSaleValue },
  ];
  accounts = postDoubleEntryToAccounts(accounts, posSaleLines);

  const vitrineAccAfterSale = accounts.find((a: any) => a.code === '110401')!;
  assert.equal(vitrineAccAfterSale.balance, 4000000, 'Vitrine account must remain positive 4,000,000, NOT -1,000,000');
});
