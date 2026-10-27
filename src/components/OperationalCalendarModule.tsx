import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Truck,
  HeartHandshake,
  Sparkles,
  Phone,
  User,
  Trash2,
  Filter,
  ListTodo,
  Building2,
  Wallet,
} from 'lucide-react';
import {
  OperationalCalendarEvent,
  CustomerWishlistRecord,
  PurchaseInvoiceRecord,
  SalesInvoiceRecord,
  RecurringExpenseTemplate,
  MonthlyExpenseLedgerRecord,
} from '../data/erpSeedData';
import { formatCurrency, formatPersianDate } from '../utils/erpEngine';
import { PolarisBadge, PolarisButton, parseCommaNumber } from './CreatableCombobox';
import { CurrencyInput } from './CurrencyInput';

interface OperationalCalendarModuleProps {
  events: OperationalCalendarEvent[];
  wishlist: CustomerWishlistRecord[];
  purchaseInvoices: PurchaseInvoiceRecord[];
  salesInvoices: SalesInvoiceRecord[];
  recurringTemplates: RecurringExpenseTemplate[];
  monthlyExpenseLedger?: MonthlyExpenseLedgerRecord[];
  onRecordMonthlyFixedExpense?: (payload: {
    templateId: string;
    monthYear: string;
    amount: number;
    paidFromAccountCode: string;
    note?: string;
  }) => void;
  onUpdateRecurringTemplateAmount?: (id: string, newAmount: number) => void;
  onAddEvent: (event: Omit<OperationalCalendarEvent, 'id'>) => void;
  onToggleEventComplete: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  onAddWishlist: (item: Omit<CustomerWishlistRecord, 'id'>) => void;
  onUpdateWishlistStatus: (
    id: string,
    status: CustomerWishlistRecord['status']
  ) => void;
  onDeleteWishlist: (id: string) => void;
  privacyMask: boolean;
}

const CATEGORY_META: Record<
  OperationalCalendarEvent['category'],
  { label: string; badgeClass: string; dotClass: string; icon: React.FC<{ className?: string }> }
> = {
  supplier_due: {
    label: 'سررسید بدهی به تأمین‌کننده',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
    icon: Wallet,
  },
  customer_receivable: {
    label: 'سررسید طلب از مشتری (نسیه)',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
    icon: User,
  },
  fixed_expense: {
    label: 'اجاره و هزینه‌های ثابت مغازه',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotClass: 'bg-purple-500',
    icon: Building2,
  },
  in_transit: {
    label: 'پیگیری بار در راه',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    dotClass: 'bg-sky-500',
    icon: Truck,
  },
  task: {
    label: 'تسک و برنامه کاری روزانه',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    icon: ListTodo,
  },
  customer_promise: {
    label: 'سفارش مشتری (لیست انتظار)',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotClass: 'bg-indigo-500',
    icon: HeartHandshake,
  },
};

const HOURLY_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
];

export const OperationalCalendarModule: React.FC<OperationalCalendarModuleProps> = ({
  events,
  wishlist,
  purchaseInvoices,
  salesInvoices,
  recurringTemplates,
  monthlyExpenseLedger = [],
  onRecordMonthlyFixedExpense,
  onUpdateRecurringTemplateAmount,
  onAddEvent,
  onToggleEventComplete,
  onDeleteEvent,
  onAddWishlist,
  onUpdateWishlistStatus,
  onDeleteWishlist,
  privacyMask,
}) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'wishlist' | 'fixed_expenses'>('calendar');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [lockMonthYear, setLockMonthYear] = useState('');
  const [lockAmount, setLockAmount] = useState<number>(0);
  const [lockPaidFromCode, setLockPaidFromCode] = useState('');
  const [lockNote, setLockNote] = useState('');
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [selectedCategory, setSelectedCategory] = useState<
    OperationalCalendarEvent['category'] | 'all'
  >('all');
  const [selectedDate, setSelectedDate] = useState(() => formatPersianDate(new Date()));

  // New Event Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newCategory, setNewCategory] =
    useState<OperationalCalendarEvent['category'] | ''>('');
  const [newPartyName, setNewPartyName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // New Wishlist Form State
  const [wishCustomerName, setWishCustomerName] = useState('');
  const [wishPhone, setWishPhone] = useState('');
  const [wishItemName, setWishItemName] = useState('');
  const [wishCategory, setWishCategory] =
    useState<CustomerWishlistRecord['category'] | ''>('');
  const [wishSpec, setWishSpec] = useState('');
  const [wishPromiseDate, setWishPromiseDate] = useState('');
  const [wishNotes, setWishNotes] = useState('');

  const maskValue = (val: number) => (privacyMask ? '****' : `${formatCurrency(val)} تومان`);

  // Merge manual events with live system-generated reminders (Purchase due dates, In-transit cargo, Credit sales, Recurring templates, Wishlist promises)
  const combinedEvents = useMemo<OperationalCalendarEvent[]>(() => {
    const autoEvents: OperationalCalendarEvent[] = [];

    // 1. Purchase Invoices with unpaid balance or In-Transit status
    purchaseInvoices.forEach((pi) => {
      if (pi.docstatus === 2) return;
      const unpaid = Math.max(0, pi.totalAmount - (pi.paidAmount ?? 0));
      if (unpaid > 0 && pi.settlementDueDate) {
        autoEvents.push({
          id: `auto-pi-due-${pi.id}`,
          title: `تسویه فاکتور خرید ${pi.billNo} (${pi.supplierName})`,
          date: pi.settlementDueDate,
          time: '12:00',
          category: 'supplier_due',
          amount: unpaid,
          referenceNo: pi.billNo,
          partyName: pi.supplierName,
          isCompleted: false,
          notes: pi.paymentNotes || 'ثبت‌شده خودکار از فاکتور خرید تعهدی',
        });
      }
      if (
        pi.deliveryStatus === 'در انتظار رسیدن بار' ||
        pi.deliveryStatus === 'در راه (هنوز نرسیده)'
      ) {
        autoEvents.push({
          id: `auto-pi-transit-${pi.id}`,
          title: `منتظر رسیدن بار: ${pi.itemsSummary}`,
          date: pi.settlementDueDate || pi.date,
          time: '10:00',
          category: 'in_transit',
          amount: pi.totalAmount,
          referenceNo: pi.billNo,
          partyName: pi.supplierName,
          isCompleted: false,
          notes: 'برچسب «در انتظار رسیدن بار» متصل به داشبورد و تقویم عملیاتی',
        });
      }
    });

    // 2. Credit Sales Invoices (نسیه مشتریان)
    salesInvoices.forEach((si) => {
      if (si.docstatus === 2 || si.isHistoricalArchive) return;
      const unpaid = Math.max(0, si.totalAmount - si.paidAmount - (si.creditedAmount ?? 0));
      if (unpaid > 0 && si.status === 'نسیه (بدهکار)') {
        autoEvents.push({
          id: `auto-si-due-${si.id}`,
          title: `دریافت طلب از ${si.customerName} (${si.invoiceNo})`,
          date: si.dueDate || si.date,
          time: '16:00',
          category: 'customer_receivable',
          amount: unpaid,
          referenceNo: si.invoiceNo,
          partyName: si.customerName,
          isCompleted: false,
          notes: si.itemsSummary,
        });
      }
    });

    // 3. Monthly Fixed Expense Templates
    recurringTemplates.forEach((tmpl) => {
      const dayPadded = new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2 }).format(
        tmpl.dueDayOfMonth
      );
      autoEvents.push({
        id: `auto-tmpl-${tmpl.id}`,
        title: `موعد پرداخت: ${tmpl.name}`,
        date: `۱۴۰۴/۰۸/${dayPadded}`,
        time: '10:00',
        category: 'fixed_expense',
        amount: tmpl.defaultMonthlyAmount,
        referenceNo: tmpl.code,
        partyName: tmpl.costCenterName,
        isCompleted: false,
        notes: 'قالب هزینه ثابت ماهانه مغازه',
      });
    });

    // 4. Customer Wishlist Promises
    wishlist.forEach((w) => {
      if (w.status === 'تحویل مشتری شد') return;
      autoEvents.push({
        id: `auto-wish-${w.id}`,
        title: `تهیه «${w.requestedItemName}» برای ${w.customerName}`,
        date: w.promiseDate,
        time: '17:00',
        category: 'customer_promise',
        partyName: `${w.customerName} (${w.customerPhone})`,
        isCompleted: w.status === 'موجود شد',
        notes: `${w.category} — ${w.flavorOrSpec}`,
      });
    });

    return [...events, ...autoEvents];
  }, [events, purchaseInvoices, salesInvoices, recurringTemplates, wishlist]);

  const filteredEvents = useMemo(() => {
    return combinedEvents.filter((ev) =>
      selectedCategory === 'all' ? true : ev.category === selectedCategory
    );
  }, [combinedEvents, selectedCategory]);

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddEvent({
      title: newTitle.trim(),
      date: newDate.trim() || formatPersianDate(new Date()),
      time: newTime.trim() || '12:00',
      category: (newCategory || 'task') as OperationalCalendarEvent['category'],
      partyName: newPartyName.trim() || undefined,
      amount: newAmount ? Number(newAmount) : undefined,
      isCompleted: false,
      notes: newNotes.trim() || undefined,
    });
    setNewTitle('');
    setNewPartyName('');
    setNewAmount('');
    setNewNotes('');
  };

  const handleCreateWishlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wishCustomerName.trim() || !wishItemName.trim()) return;
    onAddWishlist({
      customerName: wishCustomerName.trim(),
      customerPhone: wishPhone.trim() || '—',
      requestedItemName: wishItemName.trim(),
      category: (wishCategory || 'جویس و سالت') as CustomerWishlistRecord['category'],
      flavorOrSpec: wishSpec.trim() || 'استاندارد',
      requestedDate: new Date().toISOString().slice(0, 10),
      promiseDate: wishPromiseDate.trim() || '—',
      status: 'در انتظار تامین',
      notes: wishNotes.trim() || undefined,
    });
    setWishCustomerName('');
    setWishPhone('');
    setWishItemName('');
    setWishSpec('');
    setWishNotes('');
  };

  // Generate 30 days of current Persian month (آبان ۱۴۰۴)
  const monthDays = useMemo(() => {
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const toPersian = (n: number) =>
      String(n)
        .padStart(2, '0')
        .replace(/\d/g, (d) => persianDigits[Number(d)]);
    return Array.from({ length: 30 }, (_, idx) => {
      const dayNum = idx + 1;
      const dateStr = `۱۴۰۴/۰۸/${toPersian(dayNum)}`;
      const dayEvents = filteredEvents.filter((ev) => ev.date === dateStr);
      return { dayNum, dayLabel: toPersian(dayNum), dateStr, dayEvents };
    });
  }, [filteredEvents]);

  return (
    <div className="space-y-6">
      {/* Header & Sub-navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-black text-slate-900">
              تقویم عملیاتی Notion-Style و لیست انتظار شارژ کالا (Wishlist)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            رصد یکپارچه سررسید بدهی به تأمین‌کنندگان، مطالبات نسیه، موعد اجاره و قبوض، پیگیری بارهای در راه و قول‌های داده‌شده به مشتریان
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'calendar'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>تقویم عملیاتی و یادآورها ({combinedEvents.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wishlist')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'wishlist'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>درخواست شارژ کالا توسط خریدار (Wishlist: {wishlist.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fixed_expenses')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'fixed_expenses'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>ثبت قطعی و قفل هزینه ثابت ماهانه ({monthlyExpenseLedger.length})</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {(
          Object.entries(CATEGORY_META) as [
            OperationalCalendarEvent['category'],
            (typeof CATEGORY_META)['task'],
          ][]
        ).map(([catKey, meta]) => {
          const Icon = meta.icon;
          const count = combinedEvents.filter((e) => e.category === catKey && !e.isCompleted).length;
          const isSelected = selectedCategory === catKey;
          return (
            <button
              key={catKey}
              type="button"
              onClick={() =>
                setSelectedCategory((prev) => (prev === catKey ? 'all' : catKey))
              }
              className={`text-right p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
                <span
                  className={`text-sm font-black tabular-nums px-2 py-0.5 rounded-md ${
                    isSelected ? 'bg-white/20 text-white' : meta.badgeClass
                  }`}
                >
                  {count}
                </span>
              </div>
              <div
                className={`text-xs font-bold mt-2 line-clamp-1 ${
                  isSelected ? 'text-white' : 'text-slate-800'
                }`}
              >
                {meta.label}
              </div>
            </button>
          );
        })}
      </div>

      {activeTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Add Event / Reminder Form */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  + ثبت تسک، قول یا سررسید جدید در تقویم
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  افزودن یادآور ساعتی یا روزانه به تقویم عملیاتی مغازه
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  عنوان رویداد / تسک / تعهد *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثلاً: تسویه فاکتور سالت رایپ ویپز با پخش تهران..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع یادآور</label>
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as OperationalCalendarEvent['category'])
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 bg-white focus:border-slate-900 focus:outline-none"
                >
                  <option value="">انتخاب نوع یادآور...</option>
                  {Object.entries(CATEGORY_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاریخ سررسید (شمسی)</label>
                  <input
                    type="text"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    placeholder="۱۴۰۴/۰۸/۱۵"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ساعت (در نمای روزانه/هفتگی)</label>
                  <select
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 bg-white tabular-nums focus:border-slate-900 focus:outline-none"
                  >
                    {HOURLY_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">طرف حساب / مخاطب</label>
                  <input
                    type="text"
                    value={newPartyName}
                    onChange={(e) => setNewPartyName(e.target.value)}
                    placeholder="نام تامین‌کننده یا مشتری"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مبلغ مرتبط (تومان - اختیاری)</label>
                  <CurrencyInput
                    value={newAmount ? parseCommaNumber(newAmount) : ''}
                    onChange={(val) => setNewAmount(val > 0 ? String(val) : '')}
                    placeholder=""
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none text-left font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">توضیحات تکمیلی</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="شماره کارت مقصد، شرایط تحویل بار یا جزییات قول به مشتری..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت در تقویم عملیاتی</span>
              </button>
            </form>
          </div>

          {/* Right Column: Notion-Style Calendar Views (Daily / Weekly / Monthly) */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900">آبان ۱۴۰۴</span>
                {selectedCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    <Filter className="w-3 h-3" />
                    <span>نمایش همه دسته‌ها</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
                {[
                  { id: 'daily', label: 'نمای روزانه (ساعتی)' },
                  { id: 'weekly', label: 'نمای هفتگی (برنامه کاری)' },
                  { id: 'monthly', label: 'نمای ماهانه (گرید)' },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewMode(v.id as typeof viewMode)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                      viewMode === v.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* MONTHLY VIEW (Notion Grid) */}
            {viewMode === 'monthly' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {monthDays.map((day) => {
                    const isSelected = selectedDate === day.dateStr;
                    return (
                      <div
                        key={day.dateStr}
                        onClick={() => {
                          setSelectedDate(day.dateStr);
                          setNewDate(day.dateStr);
                        }}
                        className={`min-h-[104px] p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600'
                            : day.dayEvents.length > 0
                            ? 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
                            : 'border-slate-200/80 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-700 tabular-nums">
                            {day.dayLabel} آبان
                          </span>
                          {day.dayEvents.length > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900 text-white tabular-nums">
                              {day.dayEvents.length}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 mt-2">
                          {day.dayEvents.slice(0, 3).map((ev) => {
                            const meta = CATEGORY_META[ev.category];
                            return (
                              <div
                                key={ev.id}
                                className={`text-[10px] px-1.5 py-1 rounded border truncate font-semibold ${meta.badgeClass} ${
                                  ev.isCompleted ? 'line-through opacity-60' : ''
                                }`}
                                title={ev.title}
                              >
                                {ev.time} • {ev.title}
                              </div>
                            );
                          })}
                          {day.dayEvents.length > 3 && (
                            <div className="text-[10px] text-slate-500 font-bold pr-1">
                              + {day.dayEvents.length - 3} مورد دیگر
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DAILY VIEW (Hourly Schedule) */}
            {viewMode === 'daily' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-800">
                    برنامه ساعتی روز انتخاب‌شده:{' '}
                    <span className="font-black text-indigo-700">{selectedDate}</span>
                  </div>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold bg-white"
                  >
                    {monthDays.map((d) => (
                      <option key={d.dateStr} value={d.dateStr}>
                        {d.dateStr} ({d.dayEvents.length} رویداد)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {HOURLY_SLOTS.map((slot) => {
                    const slotEvents = filteredEvents.filter(
                      (ev) => ev.date === selectedDate && ev.time === slot
                    );
                    return (
                      <div
                        key={slot}
                        className="flex items-start gap-3 p-2.5 bg-white hover:bg-slate-50/70"
                      >
                        <div className="w-16 text-xs font-bold text-slate-500 tabular-nums pt-1 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{slot}</span>
                        </div>
                        <div className="flex-1 space-y-1.5">
                          {slotEvents.length === 0 ? (
                            <div className="text-[11px] text-slate-300 py-1">آزاد</div>
                          ) : (
                            slotEvents.map((ev) => {
                              const meta = CATEGORY_META[ev.category];
                              return (
                                <div
                                  key={ev.id}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${meta.badgeClass}`}
                                >
                                  <div>
                                    <div className="text-xs font-bold">{ev.title}</div>
                                    <div className="text-[11px] opacity-80 mt-0.5">
                                      {meta.label}
                                      {ev.partyName ? ` • طرف حساب: ${ev.partyName}` : ''}
                                      {ev.amount ? ` • مبلغ: ${maskValue(ev.amount)}` : ''}
                                    </div>
                                  </div>
                                  {!ev.id.startsWith('auto-') && (
                                    <button
                                      type="button"
                                      onClick={() => onToggleEventComplete(ev.id)}
                                      className="px-2.5 py-1 rounded-lg bg-white/80 text-slate-800 text-[11px] font-bold hover:bg-white"
                                    >
                                      {ev.isCompleted ? 'انجام شد' : 'علامت انجام'}
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WEEKLY VIEW */}
            {viewMode === 'weekly' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-600">
                  نمای برنامه هفتگی و تمام تعهدات پیش‌رو به تفکیک روز و ساعت:
                </div>
                <div className="space-y-2.5">
                  {filteredEvents.map((ev) => {
                    const meta = CATEGORY_META[ev.category];
                    const isAuto = ev.id.startsWith('auto-');
                    return (
                      <div
                        key={ev.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          ev.isCompleted
                            ? 'bg-slate-50 border-slate-200 opacity-65'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${meta.badgeClass}`}
                            >
                              {meta.label}
                            </span>
                            <span className="text-xs font-black text-slate-800 tabular-nums">
                              {ev.date} — ساعت {ev.time}
                            </span>
                            {isAuto && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                همگام‌سازی خودکار با اسناد
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-sm font-bold text-slate-900 ${
                              ev.isCompleted ? 'line-through' : ''
                            }`}
                          >
                            {ev.title}
                          </div>
                          <div className="text-xs text-slate-500">
                            {ev.partyName && <span>طرف حساب: {ev.partyName} • </span>}
                            {ev.amount !== undefined && (
                              <span className="font-bold text-slate-700 tabular-nums">
                                مبلغ: {maskValue(ev.amount)} •{' '}
                              </span>
                            )}
                            {ev.notes && <span>{ev.notes}</span>}
                          </div>
                        </div>

                        {!isAuto && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onToggleEventComplete(ev.id)}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${
                                ev.isCompleted
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{ev.isCompleted ? 'تکمیل شده' : 'ثبت انجام'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteEvent(ev.id)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                              title="حذف یادآور"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Day Detailed Drawer at Bottom of Calendar */}
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black text-slate-800">
                  فهرست کامل تعهدات و رویدادهای ثبت‌شده ({filteredEvents.length} مورد)
                </h4>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {filteredEvents.map((ev) => {
                  const meta = CATEGORY_META[ev.category];
                  const isAuto = ev.id.startsWith('auto-');
                  return (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dotClass}`} />
                        <div>
                          <div className="font-bold text-slate-900">
                            {ev.title}{' '}
                            <span className="text-slate-500 font-normal">
                              ({ev.date} ساعت {ev.time})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {meta.label}
                            {ev.partyName ? ` • ${ev.partyName}` : ''}
                            {ev.amount ? ` • ${maskValue(ev.amount)}` : ''}
                          </div>
                        </div>
                      </div>
                      {!isAuto && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onToggleEventComplete(ev.id)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-bold text-[11px] hover:bg-slate-100"
                          >
                            {ev.isCompleted ? 'بازگردانی' : 'تکمیل شد'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEvent(ev.id)}
                            className="p-1 rounded-lg text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMER WISHLIST (درخواست شارژ کالا توسط خریدار) */}
      {activeTab === 'wishlist' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 h-fit">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                + ثبت درخواست شارژ کالا توسط خریدار (Wishlist)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ثبت کالاهای ناموجودی که مشتریان تقاضا کرده‌اند؛ تاریخ قول تامین مستقیماً به تقویم عملیاتی متصل می‌شود.
              </p>
            </div>

            <form onSubmit={handleCreateWishlist} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نام مشتری *</label>
                  <input
                    type="text"
                    required
                    value={wishCustomerName}
                    onChange={(e) => setWishCustomerName(e.target.value)}
                    placeholder="مثلاً: آرش کمانگر"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">شماره تماس مشتری</label>
                  <input
                    type="text"
                    value={wishPhone}
                    onChange={(e) => setWishPhone(e.target.value)}
                    placeholder="0912..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">نام کالای درخواستی *</label>
                <input
                  type="text"
                  required
                  value={wishItemName}
                  onChange={(e) => setWishItemName(e.target.value)}
                  placeholder="مثلاً: سالت ویگاد بمب انبه 25mg یا گرافیک RTX 4060"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">دسته‌بندی</label>
                  <select
                    value={wishCategory}
                    onChange={(e) =>
                      setWishCategory(e.target.value as CustomerWishlistRecord['category'])
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 bg-white"
                  >
                    <option value="">انتخاب دسته‌بندی...</option>
                    <option value="جویس و سالت">جویس و سالت</option>
                    <option value="دستگاه پاد و ماد">دستگاه پاد و ماد</option>
                    <option value="کویل و کارتریج">کویل و کارتریج</option>
                    <option value="قطعات کامپیوتر">قطعات کامپیوتر</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاریخ قول تامین (یادآور تقویم)</label>
                  <input
                    type="text"
                    value={wishPromiseDate}
                    onChange={(e) => setWishPromiseDate(e.target.value)}
                    placeholder="۱۴۰۴/۰۸/۲۰"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">طعم / نیکوتین / مشخصات فنی</label>
                <input
                  type="text"
                  value={wishSpec}
                  onChange={(e) => setWishSpec(e.target.value)}
                  placeholder="مثلاً: نیکوتین ۳۰ میلی‌گرم - خنک"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">یادداشت (بیعانه یا توضیحات)</label>
                <input
                  type="text"
                  value={wishNotes}
                  onChange={(e) => setWishNotes(e.target.value)}
                  placeholder="به محض رسیدن بار پیامک ارسال شود..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت در لیست انتظار و اتصال به تقویم</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  لیست انتظار مشتریان برای شارژ مجدد کالاها ({wishlist.length} درخواست)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  با تغییر وضعیت به «موجود شد»، می‌توانید با مشتری جهت مراجعه یا ارسال پیک تماس بگیرید.
                </p>
              </div>
            </div>

            {wishlist.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                هنوز درخواستی در لیست انتظار مشتریان ثبت نشده است.
              </div>
            ) : (
              <div className="space-y-3">
                {wishlist.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-slate-900">
                          {item.requestedItemName}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {item.category}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            item.status === 'در انتظار تامین'
                              ? 'bg-amber-100 text-amber-800'
                              : item.status === 'موجود شد'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {item.customerName}
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {item.customerPhone}
                        </span>
                        <span>مشخصات: {item.flavorOrSpec}</span>
                        <span className="font-bold text-indigo-700 tabular-nums">
                          موعد قول تامین: {item.promiseDate}
                        </span>
                      </div>
                      {item.notes && (
                        <div className="text-[11px] text-slate-500">{item.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={item.status}
                        onChange={(e) =>
                          onUpdateWishlistStatus(
                            item.id,
                            e.target.value as CustomerWishlistRecord['status']
                          )
                        }
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold bg-white"
                      >
                        <option value="در انتظار تامین">در انتظار تامین</option>
                        <option value="موجود شد">موجود شد (آماده اطلاع‌رسانی)</option>
                        <option value="تحویل مشتری شد">تحویل مشتری شد</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => onDeleteWishlist(item.id)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                        title="حذف از لیست انتظار"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LOCK MONTHLY FIXED EXPENSES & RECURRING TEMPLATES */}
      {activeTab === 'fixed_expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 h-fit">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                ثبت قطعی و قفل کردن هزینه ثابت ماهانه (Monthly Expense Ledger)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                با ثبت قطعی هزینه ماه جاری، یک رکورد قفل‌شده با تگ ماه/سال ایجاد می‌شود تا تغییر مبلغ قالب در آینده، هزینه‌های ماه‌های قبل را دستکاری نکند.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  انتخاب قالب هزینه ثابت (Recurring Template)
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTemplateId(id);
                    const tmpl = recurringTemplates.find((t) => t.id === id);
                    if (tmpl) setLockAmount(tmpl.defaultMonthlyAmount);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                >
                  {recurringTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (پیش‌فرض: {formatCurrency(t.defaultMonthlyAmount)} تومان)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تگ ماه و سال
                  </label>
                  <input
                    type="text"
                    value={lockMonthYear}
                    onChange={(e) => setLockMonthYear(e.target.value)}
                    placeholder="۱۴۰۴/۰۸"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    مبلغ قطعی این ماه (تومان)
                  </label>
                  <CurrencyInput
                    value={lockAmount}
                    onChange={(val) => setLockAmount(Math.max(0, val))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold tabular-nums text-left"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  حساب نقدینگی پرداخت‌کننده
                </label>
                <select
                  value={lockPaidFromCode}
                  onChange={(e) => setLockPaidFromCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                >
                  <option value="110102">110102 — کارت بانکی (کارت به کارت)</option>
                  <option value="110101">110101 — کارتخوان (پوز)</option>
                  <option value="110103">110103 — صندوق نقد مغازه</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  یادداشت سند
                </label>
                <input
                  type="text"
                  value={lockNote}
                  onChange={(e) => setLockNote(e.target.value)}
                  placeholder="مثلاً: فیش واریزی اجاره آبان..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <PolarisButton
                primary
                fullWidth
                onClick={() => {
                  if (!onRecordMonthlyFixedExpense || lockAmount <= 0) return;
                  onRecordMonthlyFixedExpense({
                    templateId: selectedTemplateId,
                    monthYear: lockMonthYear.trim() || '۱۴۰۴/۰۸',
                    amount: lockAmount,
                    paidFromAccountCode: lockPaidFromCode,
                    note: lockNote.trim() || undefined,
                  });
                  setLockNote('');
                }}
              >
                ثبت قطعی و قفل هزینه ماه {lockMonthYear}
              </PolarisButton>
            </div>

            {/* Edit Default Template Amounts for Future Months */}
            <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
              <div className="font-bold text-slate-800">
                ویرایش مبلغ پیش‌فرض قالب‌ها برای ماه‌های آینده:
              </div>
              {recurringTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <span className="font-semibold text-slate-800">{tmpl.name}</span>
                  <div className="flex items-center gap-1.5">
                    <CurrencyInput
                      value={tmpl.defaultMonthlyAmount}
                      onChange={(nextVal) => {
                        if (
                          nextVal !== tmpl.defaultMonthlyAmount &&
                          onUpdateRecurringTemplateAmount
                        ) {
                          onUpdateRecurringTemplateAmount(tmpl.id, Math.max(0, nextVal));
                        }
                      }}
                      className="w-28 px-2 py-1 rounded border border-slate-300 bg-white font-mono text-left tabular-nums font-bold"
                    />
                    <span className="text-[11px] text-slate-500">تومان</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  دفتر هزینه‌های ماهانه قفل‌شده (Immutable Monthly Expense Ledger)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  رکوردهای این جدول با تگ ماه/سال قفل شده‌اند و با تغییر قالب‌های آینده تغییر نمی‌کنند.
                </p>
              </div>
              <PolarisBadge status="success">
                {monthlyExpenseLedger.length} رکورد قفل‌شده
              </PolarisBadge>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">شماره سند</th>
                    <th className="py-2.5 px-3">عنوان هزینه ثابت</th>
                    <th className="py-2.5 px-3">ماه و سال</th>
                    <th className="py-2.5 px-3">مبلغ قطعی</th>
                    <th className="py-2.5 px-3">حساب پرداخت</th>
                    <th className="py-2.5 px-3">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyExpenseLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        هنوز هزینه ماهانه‌ای قفل نشده است؛ از فرم سمت راست هزینه ماه جاری را ثبت و قفل کنید.
                      </td>
                    </tr>
                  ) : (
                    monthlyExpenseLedger.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                          {rec.voucherNo}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {rec.expenseName}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums">
                          {rec.monthYear}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold tabular-nums">
                          {maskValue(rec.amount)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {rec.paidFromAccountCode}
                        </td>
                        <td className="py-2.5 px-3">
                          <PolarisBadge status="success">قفل‌شده</PolarisBadge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
