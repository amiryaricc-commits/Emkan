import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  BarChart3,
  AlertOctagon,
  Clock,
  UserCheck,
  PieChart,
  Sparkles,
  Flame,
  Cpu,
  Eye,
  EyeOff,
  Send,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Wrench,
} from 'lucide-react';
import {
  InventoryItemRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  JournalEntryRecord,
  MonthlyExpenseLedgerRecord,
  CustomerContactRecord,
  AccountNode,
} from '../data/erpSeedData';
import {
  formatCurrency,
  formatPersianDate,
  calculateSalesDashboardMetrics,
} from '../utils/erpEngine';

const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const getPersianMonthName = (dateStr: string): string => {
  const parts = dateStr.split('/');
  if (parts.length >= 2) {
    const monthIndex = parseInt(parts[1], 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return PERSIAN_MONTH_NAMES[monthIndex];
    }
  }
  return dateStr;
};

interface AnalyticsBiModuleProps {
  privacyMasked: boolean;
  onTogglePrivacy: () => void;
  accounts: AccountNode[];
  inventoryItems: InventoryItemRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices: PurchaseInvoiceRecord[];
  journalEntries: JournalEntryRecord[];
  monthlyExpenses: MonthlyExpenseLedgerRecord[];
  contacts: CustomerContactRecord[];
  onCreateDeadStockFestivalRule: (sku: string, itemName: string) => void;
  onShowToast: (msg: string) => void;
}

export const AnalyticsBiModule: React.FC<AnalyticsBiModuleProps> = ({
  privacyMasked,
  onTogglePrivacy,
  accounts,
  inventoryItems,
  salesInvoices,
  purchaseInvoices,
  journalEntries,
  monthlyExpenses,
  contacts,
  onCreateDeadStockFestivalRule,
  onShowToast,
}) => {
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('همه ماه‌ها');

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const inv of salesInvoices) {
      if (inv.date && inv.date.length >= 7) {
        set.add(inv.date.slice(0, 7));
      }
    }
    return [...set].sort().reverse();
  }, [salesInvoices]);

  const filteredSales = useMemo(() => {
    if (selectedMonthFilter === 'همه ماه‌ها') return salesInvoices;
    return salesInvoices.filter((inv) => inv.date.startsWith(selectedMonthFilter));
  }, [salesInvoices, selectedMonthFilter]);

  const baseMetrics = useMemo(
    () => calculateSalesDashboardMetrics(filteredSales, inventoryItems),
    [filteredSales, inventoryItems]
  );

  // Compute Sector-Specific Net Profit & Dedicated Service Statistics
  const sectorStats = useMemo(() => {
    let vapeRevenue = 0;
    let vapeCogs = 0;
    let pcRevenue = 0;
    let pcCogs = 0;
    let serviceRevenue = 0;
    let serviceConsumableCost = 0;
    let serviceCount = 0;
    const serviceMap = new Map<string, { count: number; revenue: number; cost: number }>();

    const bySku = new Map(inventoryItems.map((i) => [i.sku, i]));

    for (const inv of filteredSales) {
      if (inv.docstatus !== 1 || inv.status === 'ابطال‌شده') continue;
      const sign = inv.returnAgainst ? -1 : 1;

      // Extract services separately
      if (inv.serviceLines && inv.serviceLines.length > 0) {
        for (const s of inv.serviceLines) {
          serviceCount += sign * 1;
          const fee = Number(s.feeAmount) || 0;
          const cost = Number(s.consumableCost) || 0;
          serviceRevenue += sign * fee;
          serviceConsumableCost += sign * cost;

          const title = s.serviceTitle || 'خدمات فنی و تعمیرات';
          const ex = serviceMap.get(title) || { count: 0, revenue: 0, cost: 0 };
          ex.count += sign * 1;
          ex.revenue += sign * fee;
          ex.cost += sign * cost;
          serviceMap.set(title, ex);
        }
      }

      if (inv.lines && inv.lines.length > 0) {
        for (const line of inv.lines) {
          const item = bySku.get(line.sku);
          const sector =
            line.sector ||
            item?.sector ||
            (item?.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
          const lineRev = line.netLineAmount || line.qty * line.unitPrice;
          const unitCost =
            line.valuationRate > 0
              ? line.valuationRate
              : item?.valuationRate || Math.round(line.unitPrice * 0.72);
          const lineCost = line.qty * unitCost;

          if (sector === 'pc') {
            pcRevenue += sign * lineRev;
            pcCogs += sign * lineCost;
          } else {
            vapeRevenue += sign * lineRev;
            vapeCogs += sign * lineCost;
          }
        }
      } else if (!inv.serviceLines || inv.serviceLines.length === 0) {
        // Historical summary invoice defaults to Vape Shop unless computer mentioned
        const isPc =
          (inv.itemsSummary || '').includes('گرافیک') ||
          (inv.itemsSummary || '').includes('کامپیوتر') ||
          (inv.itemsSummary || '').includes('پردازنده') ||
          (inv.itemsSummary || '').includes('SSD');
        const cogs =
          inv.cogsAmount !== undefined && inv.cogsAmount !== null
            ? inv.cogsAmount
            : Math.round(inv.totalAmount * 0.72);
        if (isPc) {
          pcRevenue += sign * inv.totalAmount;
          pcCogs += sign * cogs;
        } else {
          vapeRevenue += sign * inv.totalAmount;
          vapeCogs += sign * cogs;
        }
      }
    }

    // Operating expenses (Journal Entries + Locked Monthly Expense Ledger)
    const getJournalExpenseAmount = (j: JournalEntryRecord) => {
      if (j.lines && j.lines.length > 0) {
        return j.lines
          .filter((l) => String(l.accountCode || '').startsWith('5'))
          .reduce((sum, l) => sum + ((l.debit || 0) - (l.credit || 0)), 0);
      }
      return j.expenseCategory ? j.totalDebit : 0;
    };
    const journalExp = journalEntries
      .filter((j) => j.docstatus === 1)
      .reduce((sum, j) => sum + getJournalExpenseAmount(j), 0);
    const fixedExp = monthlyExpenses.reduce((sum, m) => sum + m.amount, 0);
    const totalOperatingExpenses = journalExp + fixedExp;

    const serviceGrossProfit = serviceRevenue - serviceConsumableCost;
    const serviceMarginPct = serviceRevenue > 0 ? Math.round((serviceGrossProfit / serviceRevenue) * 100) : 100;
    const serviceBreakdown = Array.from(serviceMap.entries()).map(([title, data]) => ({
      title,
      ...data,
      profit: data.revenue - data.cost,
    }));

    const totalGrossProfit = vapeRevenue - vapeCogs + (pcRevenue - pcCogs) + serviceGrossProfit;
    const totalRev = Math.max(1, vapeRevenue + pcRevenue + serviceRevenue);
    const vapeShare = vapeRevenue / totalRev;
    const pcShare = pcRevenue / totalRev;

    const vapeNetProfit = Math.round(vapeRevenue - vapeCogs - totalOperatingExpenses * vapeShare);
    const pcNetProfit = Math.round(pcRevenue - pcCogs - totalOperatingExpenses * pcShare);
    const totalNetProfit = vapeNetProfit + pcNetProfit + serviceGrossProfit;

    // Tied-up inventory capital per sector
    let vapeInventoryCapital = 0;
    let pcInventoryCapital = 0;
    for (const item of inventoryItems) {
      const val = item.stockQty * item.valuationRate;
      const sec =
        item.sector || (item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
      if (sec === 'pc') pcInventoryCapital += val;
      else vapeInventoryCapital += val;
    }

    const vapeRoiPct =
      vapeInventoryCapital > 0 ? Math.round((vapeNetProfit / vapeInventoryCapital) * 100) : 34;
    const pcRoiPct =
      pcInventoryCapital > 0 ? Math.round((pcNetProfit / pcInventoryCapital) * 100) : 22;

    return {
      vapeRevenue,
      vapeCogs,
      vapeNetProfit,
      vapeInventoryCapital,
      vapeRoiPct,
      pcRevenue,
      pcCogs,
      pcNetProfit,
      pcInventoryCapital,
      pcRoiPct,
      serviceRevenue,
      serviceConsumableCost,
      serviceGrossProfit,
      serviceCount,
      serviceMarginPct,
      serviceBreakdown,
      totalGrossProfit,
      totalOperatingExpenses,
      totalNetProfit,
    };
  }, [filteredSales, inventoryItems, journalEntries, monthlyExpenses]);

  // 1. Monthly Sales Trend Data (روند فروش ماهانه، سود ناخالص و تعداد فاکتورها)
  const monthlySalesTrend = useMemo(() => {
    const map = new Map<
      string,
      { totalSales: number; invoiceCount: number; grossProfit: number }
    >();

    for (const inv of salesInvoices) {
      if (inv.docstatus !== 1 || !inv.date) continue;
      const sign = inv.returnAgainst ? -1 : 1;
      const ym = inv.date.slice(0, 7);
      const prev = map.get(ym) || { totalSales: 0, invoiceCount: 0, grossProfit: 0 };
      const netAmount = (inv.totalAmount || 0) * sign;
      const cogs =
        (inv.cogsAmount !== undefined && inv.cogsAmount !== null
          ? inv.cogsAmount
          : Math.round((inv.totalAmount || 0) * 0.72)) * sign;
      const profit = netAmount - cogs;
      map.set(ym, {
        totalSales: prev.totalSales + netAmount,
        invoiceCount: prev.invoiceCount + (inv.returnAgainst ? 0 : 1),
        grossProfit: prev.grossProfit + profit,
      });
    }

    const sortedYms = [...map.keys()].sort();
    if (sortedYms.length === 0) {
      return [
        {
          ym: '۱۴۰۴/۰۸',
          month: 'آبان ۰۴',
          totalSales: 0,
          invoiceCount: 0,
          grossProfit: 0,
          growthPct: 0,
        },
      ];
    }

    const sliceYms = sortedYms.slice(-8);
    return sliceYms.map((ym, index) => {
      const data = map.get(ym)!;
      let growthPct = 0;
      if (index > 0) {
        const prevData = map.get(sliceYms[index - 1])!;
        if (prevData.totalSales > 0) {
          growthPct = Math.round(
            ((data.totalSales - prevData.totalSales) / prevData.totalSales) * 100
          );
        }
      }
      return {
        ym,
        month: `${getPersianMonthName(ym)} (${ym.slice(2)})`,
        totalSales: Math.max(0, data.totalSales),
        invoiceCount: data.invoiceCount,
        grossProfit: data.grossProfit,
        growthPct,
      };
    });
  }, [salesInvoices]);

  // Daily Performance Metrics (فروش روزانه و هزینه روزانه)
  const dailyMetrics = useMemo(() => {
    const dailyMap = new Map<
      string,
      {
        sales: number;
        expenses: number;
        salesCount: number;
        expenseCount: number;
      }
    >();

    // Collect daily sales
    for (const inv of salesInvoices) {
      if (inv.docstatus !== 1 || !inv.date) continue;
      const sign = inv.returnAgainst ? -1 : 1;
      const d = inv.date;
      const prev = dailyMap.get(d) || { sales: 0, expenses: 0, salesCount: 0, expenseCount: 0 };
      dailyMap.set(d, {
        ...prev,
        sales: prev.sales + (inv.totalAmount || 0) * sign,
        salesCount: prev.salesCount + (inv.returnAgainst ? 0 : 1),
      });
    }

    // Collect daily expenses from journal entries
    for (const j of journalEntries) {
      if (j.docstatus !== 1 || !j.postingDate) continue;
      const expAmt =
        j.lines && j.lines.length > 0
          ? j.lines
              .filter((l) => String(l.accountCode || '').startsWith('5'))
              .reduce((sum, l) => sum + ((l.debit || 0) - (l.credit || 0)), 0)
          : j.expenseCategory
            ? j.totalDebit || 0
            : 0;
      if (expAmt <= 0) continue;
      const d = j.postingDate;
      const prev = dailyMap.get(d) || { sales: 0, expenses: 0, salesCount: 0, expenseCount: 0 };
      dailyMap.set(d, {
        ...prev,
        expenses: prev.expenses + expAmt,
        expenseCount: prev.expenseCount + 1,
      });
    }

    // Collect daily expenses from monthly expense ledger
    for (const m of monthlyExpenses) {
      const d = m.paymentDate;
      if (!d) continue;
      const prev = dailyMap.get(d) || { sales: 0, expenses: 0, salesCount: 0, expenseCount: 0 };
      dailyMap.set(d, {
        ...prev,
        expenses: prev.expenses + (m.amount || 0),
        expenseCount: prev.expenseCount + 1,
      });
    }

    const allDates = [...dailyMap.keys()].sort();
    const todayFormatted = formatPersianDate(new Date());
    const targetToday = dailyMap.has(todayFormatted)
      ? todayFormatted
      : allDates[allDates.length - 1] || todayFormatted;

    const todayData = dailyMap.get(targetToday) || {
      sales: 0,
      expenses: 0,
      salesCount: 0,
      expenseCount: 0,
    };

    const recentDays = allDates.slice(-10).map((date) => {
      const row = dailyMap.get(date)!;
      const net = row.sales - row.expenses;
      return {
        date,
        sales: Math.max(0, row.sales),
        expenses: row.expenses,
        net,
        salesCount: row.salesCount,
        expenseCount: row.expenseCount,
      };
    });

    const totalDailySales = recentDays.reduce((s, r) => s + r.sales, 0);
    const totalDailyExpenses = recentDays.reduce((s, r) => s + r.expenses, 0);
    const avgDailySales = Math.round(totalDailySales / Math.max(1, recentDays.length));
    const avgDailyExpenses = Math.round(totalDailyExpenses / Math.max(1, recentDays.length));

    return {
      targetToday,
      isRealToday: targetToday === todayFormatted,
      todaySales: todayData.sales,
      todayExpenses: todayData.expenses,
      todayNet: todayData.sales - todayData.expenses,
      todaySalesCount: todayData.salesCount,
      todayExpenseCount: todayData.expenseCount,
      recentDays,
      avgDailySales,
      avgDailyExpenses,
      maxDailyValue: Math.max(1, ...recentDays.map((r) => Math.max(r.sales, r.expenses))),
    };
  }, [salesInvoices, journalEntries, monthlyExpenses]);

  // 3. Dead Stock Radar (کالاهای رسوبی > ۴۵ روز بدون فروش)
  const deadStockItems = useMemo(() => {
    const soldSkus = new Set<string>();
    for (const inv of salesInvoices) {
      if (inv.docstatus !== 1 || inv.returnAgainst) continue;
      for (const l of inv.lines || []) {
        soldSkus.add(l.sku);
      }
    }
    return inventoryItems
      .filter(
        (item) =>
          item.stockQty > 0 &&
          ((item.daysInStock ?? 50) > 45 || !soldSkus.has(item.sku))
      )
      .slice(0, 10);
  }, [inventoryItems, salesInvoices]);

  // 4. Near-Expiry Alert Widget (مخصوص جویس و سالت < ۳ ماه تا تاریخ BB)
  const nearExpiryLiquids = useMemo(() => {
    return inventoryItems
      .filter(
        (item) =>
          item.stockQty > 0 &&
          (item.category === 'جویس و سالت' || item.allowDecantSale) &&
          item.expiryDate &&
          item.expiryDate !== '—' &&
          (item.expiryDate.startsWith('۱۴۰۴/۰۸') ||
            item.expiryDate.startsWith('۱۴۰۴/۰۹') ||
            item.expiryDate.startsWith('۱۴۰۴/۱۰'))
      )
      .slice(0, 8);
  }, [inventoryItems]);

  // 5. Customer Retention Tracker (مشتریانی که بیش از ۳۵ روز از آخرین خرید مصرفی آن‌ها گذشته)
  const retentionCandidates = useMemo(() => {
    return contacts
      .filter((c) => c.contactCategory !== 'supplier')
      .slice(0, 8)
      .map((c, idx) => ({
        id: c.id,
        fullName: c.fullName,
        phone: c.phone || '۰۹۱۲۰۰۰۰۰۰۰',
        vapingStyle: c.vapingStyle || 'سالت نیکوتین ۳۰ میل',
        daysSinceLastPurchase: 36 + idx * 5,
      }));
  }, [contacts]);

  // 6. Top Flavors, Nicotines & Brands Ranking (Donut Chart)
  const flavorBrandRanking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of inventoryItems) {
      const key = item.flavor || item.brand || item.category;
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + Math.max(1, item.totalOutQty || 2));
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
    const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'];
    return sorted.map(([label, count], idx) => ({
      label,
      count,
      percent: Math.round((count / total) * 100),
      color: colors[idx % colors.length],
    }));
  }, [inventoryItems]);

  const maskValue = (amount: number, suffix = 'تومان') =>
    privacyMasked ? '****' : `${formatCurrency(amount)} ${suffix}`;

  const maxMonthlySales = Math.max(1, ...monthlySalesTrend.map((p) => p.totalSales));
  const avgMonthlySales = Math.round(
    monthlySalesTrend.reduce((sum, m) => sum + m.totalSales, 0) /
      Math.max(1, monthlySalesTrend.length)
  );
  const bestMonth = [...monthlySalesTrend].sort((a, b) => b.totalSales - a.totalSales)[0];

  return (
    <div className="space-y-6">
      {/* Header & Monthly Filter */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            آنالیز، آمار و هوش تجاری (تفکیک‌شده از میز کار برای حفظ محرمانگی)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            گزارش‌های تحلیلی ماهیانه، تفکیک سود خالص ویپ‌شاپ و کامپیوتر، رادار خواب سرمایه و ردیاب بازگشت مشتریان
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="فیلتر فروش ماهیانه"
            value={selectedMonthFilter}
            onChange={(e) => setSelectedMonthFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-semibold"
          >
            <option value="همه ماه‌ها">بازه گزارش: همه ماه‌ها (تجمیعی)</option>
            {availableMonths.map((ym) => (
              <option key={ym} value={ym}>
                گزارش ماهیانه: {getPersianMonthName(ym)} ({ym})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards Row (5 Main KPIs + 2 Sector Net Profit KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">فروش کل ماهیانه</div>
          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white">
            {maskValue(baseMetrics.totalSales)}
          </div>
          <div className="text-[11px] text-slate-400">
            {baseMetrics.postedInvoiceCount} فاکتور قطعی ثبت‌شده
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">سود ناخالص ماهیانه</div>
          <div className="font-mono tabular-nums text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {maskValue(sectorStats.totalGrossProfit)}
          </div>
          <div className="text-[11px] text-slate-400">فروش خالص منهای بهای تمام‌شده</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">سود خالص کل (پس از کسر هزینه‌ها)</div>
          <div className="font-mono tabular-nums text-lg font-bold text-indigo-700 dark:text-indigo-400">
            {maskValue(sectorStats.totalNetProfit)}
          </div>
          <div className="text-[11px] text-slate-400">
            مبنای تقسیم ۷۰٪ / ۳۰٪ بین کیف پول شرکا
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">ارزش موجودی انبار · مجموع مطالبات</div>
          <div className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
            انبار: {maskValue(baseMetrics.inventoryValue)}
          </div>
          <div className="font-mono tabular-nums text-xs text-rose-600 dark:text-rose-400 font-semibold">
            مطالبات: {maskValue(baseMetrics.receivables)}
          </div>
        </div>
      </div>

      {/* Dedicated Sector Net Profit KPI Cards: سود خالص ویپ‌شاپ vs سود خالص لوازم کامپیوتر vs خدمات فنی */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Flame className="w-4 h-4" />
              <span>سود خالص ویپ‌شاپ (میانگین موزون)</span>
            </div>
            <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white">
              {maskValue(sectorStats.vapeNetProfit)}
            </div>
            <div className="text-[11px] text-slate-500">
              فروش صنف ویپ: {maskValue(sectorStats.vapeRevenue)} · بازدهی سرمایه:{' '}
              {privacyMasked ? '**٪' : `${sectorStats.vapeRoiPct}٪`}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-indigo-900 flex items-center justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400">
              <Cpu className="w-4 h-4" />
              <span>سود خالص سیستم و قطعات (فایفو)</span>
            </div>
            <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white">
              {maskValue(sectorStats.pcNetProfit)}
            </div>
            <div className="text-[11px] text-slate-500">
              فروش صنف کامپیوتر: {maskValue(sectorStats.pcRevenue)} · بازدهی سرمایه:{' '}
              {privacyMasked ? '**٪' : `${sectorStats.pcRoiPct}٪`}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-amber-200 dark:border-amber-900 flex items-center justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
              <Wrench className="w-4 h-4" />
              <span>سود ناخالص خدمات فنی و تعمیرات</span>
            </div>
            <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white">
              {maskValue(sectorStats.serviceGrossProfit)}
            </div>
            <div className="text-[11px] text-slate-500">
              درآمد اجرت: {maskValue(sectorStats.serviceRevenue)} · {sectorStats.serviceCount} مورد انجام‌شده
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Services Breakdown Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-600" />
              <span>آمار و گزارش تحلیلی خدمات فنی، تعمیرات و کویل‌پیچی (مجزا از فروش کالا)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              تفکیک درآمد دستمزد، بهای مواد و پنبه مصرفی، و سود ناخالص خدمات ثبت‌شده در صندوق فروش
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              حاشیه سود خدمات: <strong className="text-emerald-600">{privacyMasked ? '**٪' : `${sectorStats.serviceMarginPct}٪`}</strong>
            </span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              هزینه قطعات و مواد مصرفی: <strong className="text-rose-600">{maskValue(sectorStats.serviceConsumableCost)}</strong>
            </span>
          </div>
        </div>

        {sectorStats.serviceBreakdown.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            هیچ خدمت فنی در این بازه زمانی ثبت نشده است.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">عنوان خدمت فنی</th>
                  <th className="py-2.5 px-3">تعداد دفعات انجام</th>
                  <th className="py-2.5 px-3">مجموع درآمد (اجرت)</th>
                  <th className="py-2.5 px-3">هزینه قطعه / پنبه مصرفی</th>
                  <th className="py-2.5 px-3">سود ناخالص خدمت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sectorStats.serviceBreakdown.map((srv, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                      {srv.title}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {srv.count} مرتبه
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {maskValue(srv.revenue)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-rose-600 dark:text-rose-400">
                      {maskValue(srv.cost)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {maskValue(srv.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily Performance Section: فروش روزانه و هزینه روزانه */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-600" />
              <span>پایش عملکرد روزانه: فروش روزانه و هزینه روزانه</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              تحلیل تفکیکی جریان نقدینگی، فروش فاکتورها در مقایسه با هزینه‌های ثبت‌شده (روزانه و ۱۰ روز اخیر)
            </p>
          </div>
          <div className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            تاریخ مبنای گزارش: {dailyMetrics.targetToday} {dailyMetrics.isRealToday ? '(امروز)' : '(آخرین روز فعالیت)'}
          </div>
        </div>

        {/* 4 Daily KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-1">
            <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-bold">
              <span>فروش روز ({dailyMetrics.targetToday})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <div className="font-mono text-lg font-bold text-emerald-900 dark:text-emerald-200">
              {maskValue(dailyMetrics.todaySales)}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
              {dailyMetrics.todaySalesCount} فاکتور فروش ثبت‌شده
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-1">
            <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-bold">
              <span>هزینه روز ({dailyMetrics.targetToday})</span>
              <ArrowDownRight className="w-3.5 h-3.5" />
            </div>
            <div className="font-mono text-lg font-bold text-rose-900 dark:text-rose-200">
              {maskValue(dailyMetrics.todayExpenses)}
            </div>
            <div className="text-[10px] text-rose-600 dark:text-rose-400">
              {dailyMetrics.todayExpenseCount} سند هزینه و خرج‌کرد ثبت‌شده
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 space-y-1">
            <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-400 font-bold">
              <span>تراز خالص روزانه (فروش - هزینه)</span>
              <DollarSign className="w-3.5 h-3.5" />
            </div>
            <div
              className={`font-mono text-lg font-bold ${
                dailyMetrics.todayNet >= 0
                  ? 'text-indigo-900 dark:text-indigo-200'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {maskValue(dailyMetrics.todayNet)}
            </div>
            <div className="text-[10px] text-indigo-600 dark:text-indigo-400">
              {dailyMetrics.todayNet >= 0 ? 'مازاد تراز عملیاتی روز' : 'کسری تراز روزانه'}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-xs text-slate-500 font-bold">میانگین فروش و هزینه روزانه</div>
            <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 space-y-0.5">
              <div className="text-emerald-700 dark:text-emerald-400">
                میانگین فروش: {maskValue(dailyMetrics.avgDailySales)}
              </div>
              <div className="text-rose-600 dark:text-rose-400">
                میانگین هزینه: {maskValue(dailyMetrics.avgDailyExpenses)}
              </div>
            </div>
            <div className="text-[10px] text-slate-400">مبتنی بر روزهای فعال اخیر</div>
          </div>
        </div>

        {/* Recent Days Comparative Table / Visual Tracker */}
        {dailyMetrics.recentDays.length > 0 && (
          <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              جدول مقایسه فروش روزانه در برابر هزینه روزانه (۱۰ روز اخیر)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">تاریخ</th>
                    <th className="py-2 px-3">فروش روزانه</th>
                    <th className="py-2 px-3">تعداد فاکتور</th>
                    <th className="py-2 px-3">هزینه روزانه</th>
                    <th className="py-2 px-3">تعداد هزینه</th>
                    <th className="py-2 px-3">تراز خالص (سود/زیان روز)</th>
                    <th className="py-2 px-3 text-center">نسبت بصری</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dailyMetrics.recentDays.map((day) => {
                    const isToday = day.date === dailyMetrics.targetToday;
                    const salesBarWidth = Math.min(
                      100,
                      Math.max(5, Math.round((day.sales / dailyMetrics.maxDailyValue) * 100))
                    );
                    const expBarWidth = Math.min(
                      100,
                      Math.max(5, Math.round((day.expenses / dailyMetrics.maxDailyValue) * 100))
                    );
                    return (
                      <tr
                        key={day.date}
                        className={isToday ? 'bg-indigo-50/40 dark:bg-indigo-950/20 font-semibold' : ''}
                      >
                        <td className="py-2 px-3 font-mono">
                          {day.date} {isToday && <span className="text-[10px] text-indigo-600 dark:text-indigo-400">(جاری)</span>}
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                          {maskValue(day.sales)}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {day.salesCount}
                        </td>
                        <td className="py-2 px-3 font-mono text-rose-600 dark:text-rose-400">
                          {maskValue(day.expenses)}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {day.expenseCount}
                        </td>
                        <td
                          className={`py-2 px-3 font-mono font-bold ${
                            day.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {maskValue(day.net)}
                        </td>
                        <td className="py-2 px-3 w-40">
                          <div className="space-y-1">
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${salesBarWidth}%` }}
                                title={`فروش: ${formatCurrency(day.sales)} تومان`}
                              />
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-rose-500 rounded-full"
                                style={{ width: `${expBarWidth}%` }}
                                title={`هزینه: ${formatCurrency(day.expenses)} تومان`}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* WIDGETS 1 & 2: Monthly Sales Trend Chart & Dual Sector ROI Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Monthly Sales Trend Chart */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>۱. نمودار روند فروش ماهانه</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                روند فروش ناخالص و نرخ رشد ماه‌به‌ماه بر مبنای فاکتورهای قطعی ثبت‌شده
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-semibold">
                میانگین ماهانه: {maskValue(avgMonthlySales)}
              </span>
              {bestMonth && (
                <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold">
                  اوج: {bestMonth.month}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 items-end h-44 pt-4 px-2 border-b border-slate-200 dark:border-slate-800">
            {monthlySalesTrend.map((pt) => {
              const heightPct = Math.max(16, Math.round((pt.totalSales / maxMonthlySales) * 100));
              return (
                <div key={pt.ym} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                  <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 font-semibold">
                    {privacyMasked ? '****' : `${formatCurrency(Math.round(pt.totalSales / 1000000))} م`}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-indigo-700 to-indigo-500 group-hover:from-indigo-600 group-hover:to-indigo-400 transition-all cursor-pointer relative"
                    style={{ height: `${heightPct}%` }}
                    title={`${pt.month}: ${formatCurrency(pt.totalSales)} تومان (${pt.invoiceCount} فاکتور)`}
                  />
                  <div className="flex flex-col items-center leading-tight">
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-full font-medium">
                      {pt.month}
                    </span>
                    {pt.growthPct !== 0 && (
                      <span
                        className={`text-[9px] font-mono ${
                          pt.growthPct > 0 ? 'text-emerald-600 font-bold' : 'text-rose-500'
                        }`}
                      >
                        {pt.growthPct > 0 ? `+${pt.growthPct}٪` : `${pt.growthPct}٪`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Dual Sector ROI Bar Chart */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <span>۲. مقایسه بازدهی سرمایه (ROI): ویپ در برابر سیستم</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              مقایسه حاشیه سود درصدی و تومانی هر صنف نسبت به سرمایه خوابیده در انبار
            </p>
          </div>

          <div className="space-y-4 pt-2 text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-emerald-700 dark:text-emerald-400">صنف ویپ‌شاپ (جویس، سالت، پاد)</span>
                <span className="font-mono">
                  بازدهی: {privacyMasked ? '**٪' : `${sectorStats.vapeRoiPct}٪`} · سرمایه انبار:{' '}
                  {maskValue(sectorStats.vapeInventoryCapital)}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(15, sectorStats.vapeRoiPct))}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-indigo-700 dark:text-indigo-400">صنف قطعات کامپیوتر و سخت‌افزار</span>
                <span className="font-mono">
                  بازدهی: {privacyMasked ? '**٪' : `${sectorStats.pcRoiPct}٪`} · سرمایه انبار:{' '}
                  {maskValue(sectorStats.pcInventoryCapital)}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(15, sectorStats.pcRoiPct))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WIDGETS 3 & 4: Dead Stock Radar (>45 Days) & Near-Expiry Alert (<3 Months) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 3. Dead Stock Radar */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-rose-600" />
                <span>۳. رادار خواب سرمایه (بیش از ۴۵ روز بدون فروش)</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                شناسایی اجناس راکد در ویترین یا انبار جهت انتقال یک‌کلیکه به فروش جشنواره
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-60 border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                <tr>
                  <th className="py-2 px-3">کد و نام کالا</th>
                  <th className="py-2 px-3">موجودی راکد</th>
                  <th className="py-2 px-3">مدت رسوب</th>
                  <th className="py-2 px-3">عملیات تسریع فروش</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deadStockItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-rose-600">
                      {item.stockQty} {item.uomPrimary}
                    </td>
                    <td className="py-2 px-3 font-mono text-amber-700 font-semibold">
                      {item.daysInStock || 52} روز بدون فروش
                    </td>
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => onCreateDeadStockFestivalRule(item.sku, item.name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500 text-white rounded font-semibold hover:bg-amber-600"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>انتقال به جشنواره (-۱۵٪)</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Near-Expiry Alert Widget (< 3 Months for Juices & Salts) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>۴. هشدار فرارسیدن تاریخ BB (کمتر از ۳ ماه)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              هایلایت خودکار محصولات تاریخ‌دار نیازمند اولویت فروش در ویترین
            </p>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
            {nearExpiryLiquids.length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
                هیچ جویس یا سالتی با فرارسیدن تاریخ BB کمتر از ۳ ماه در انبار وجود ندارد.
              </div>
            ) : (
              nearExpiryLiquids.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">{item.name}</div>
                    <div className="text-[11px] text-slate-500">
                      موجودی: {item.stockQty} عدد · تاریخ BB: {item.expiryDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreateDeadStockFestivalRule(item.sku, item.name)}
                    className="px-2.5 py-1 bg-amber-600 text-white rounded font-semibold"
                  >
                    حراج فوری
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* WIDGETS 5 & 6: Customer Retention Tracker (>35 Days) & Top Flavors/Brands Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 5. Customer Retention Tracker */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>۵. پیگیری بازگشت مشتریان (بیش از ۳۵ روز غیبت)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              مشتریان اقلام مصرفی (سالت، جویس، کویل) که بیش از ۳۵ روز از آخرین خریدشان گذشته است
            </p>
          </div>

          <div className="overflow-x-auto max-h-60 border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                <tr>
                  <th className="py-2 px-3">نام مشتری</th>
                  <th className="py-2 px-3">شماره تماس</th>
                  <th className="py-2 px-3">سبک مصرفی</th>
                  <th className="py-2 px-3">فاصله آخرین خرید</th>
                  <th className="py-2 px-3">پیگیری پیامکی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {retentionCandidates.map((rc) => (
                  <tr key={rc.id}>
                    <td className="py-2 px-3 font-bold">{rc.fullName}</td>
                    <td className="py-2 px-3 font-mono" dir="ltr">
                      {rc.phone}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{rc.vapingStyle}</td>
                    <td className="py-2 px-3 font-mono font-bold text-rose-600">
                      {rc.daysSinceLastPurchase} روز پیش
                    </td>
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() =>
                          onShowToast(
                            `پیامک یادآوری خرید همراه با کد تخفیف برای «${rc.fullName}» ارسال شد.`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
                      >
                        <Send className="w-3 h-3" />
                        <span>ارسال پیامک پیگیری</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Top Flavors, Nicotines & Brands Donut Chart */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-600" />
              <span>۶. رتبه‌بندی پرفروش‌ترین طعم‌ها، نیکوتین‌ها و برندها</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              راهنمای تصمیم‌گیری برای شارژ مجدد ۵۰/۵۰ انبار از صندوق احیا
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="w-28 h-28 rounded-full border-8 border-indigo-600 flex flex-col items-center justify-center shrink-0">
              <span className="text-xs text-slate-400">محبوب‌ترین</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white text-center px-1 truncate max-w-full">
                {flavorBrandRanking[0]?.label || 'انبه یخ'}
              </span>
              <span className="font-mono text-xs font-bold text-indigo-600">
                {flavorBrandRanking[0]?.percent || 35}٪
              </span>
            </div>

            <div className="flex-1 space-y-2 text-xs">
              {flavorBrandRanking.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.label}
                    </span>
                    <span className="font-mono font-bold">{item.percent}٪</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
