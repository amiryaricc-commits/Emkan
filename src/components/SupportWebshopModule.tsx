import React, { useState } from 'react';
import {
  Globe,
  UserCheck,
  FileEdit,
  CreditCard,
  Download,
} from 'lucide-react';
import { InventoryItemRecord, SalesInvoiceRecord } from '../data/erpSeedData';
import { formatCurrency } from '../utils/erpEngine';

interface SupportWebshopModuleProps {
  productionMode: boolean;
  inventoryItems: InventoryItemRecord[];
  salesInvoices: SalesInvoiceRecord[];
  onWebshopOrderCheckout: (item: InventoryItemRecord) => void;
  onShowToast: (msg: string) => void;
}

export const SupportWebshopModule: React.FC<SupportWebshopModuleProps> = ({
  productionMode,
  inventoryItems,
  salesInvoices,
  onWebshopOrderCheckout,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'webshop' | 'portal' | 'builder'>('webshop');

  // Webshop Filter
  const [brandFilter, setBrandFilter] = useState('همه');

  // Web Form Submission State
  const [agencyApplicant, setAgencyApplicant] = useState('');
  const [agencyCity, setAgencyCity] = useState('');
  const [submittedWebFormsCount, setSubmittedWebFormsCount] = useState(0);

  const activeInventoryItems = inventoryItems.filter((item) => item.isActive !== false);
  const filteredShopItems = activeInventoryItems.filter((i) =>
    brandFilter === 'همه'
      ? true
      : brandFilter === 'برند ثبت‌نشده'
        ? !i.brand
        : i.brand === brandFilter
  );
  const brandFilters = [
    'همه',
    ...new Set(
      activeInventoryItems
        .map((item) => item.brand || 'برند ثبت‌نشده')
        .filter((brand) => brand !== 'برند ثبت‌نشده' || activeInventoryItems.some((item) => !item.brand))
    ),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            وبسایت، فروشگاه اینترنتی و پورتال مشتریان
          </h2>
          <p className="text-sm text-slate-500">
            فروش آنلاین متصل به انبار، پورتال اختصاصی مشتریان و مدیریت محتوای سایت
          </p>
        </div>
      </div>
      {activeTab === 'webshop' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          محاسبه و ثبت مالیات در این نسخه غیرفعال است؛ مبلغ سفارش آنلاین بدون مالیات محاسبه می‌شود.
        </p>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl w-fit">
        {(productionMode
          ? [{ id: 'webshop', label: 'فروشگاه اینترنتی', icon: Globe }]
          : [
              { id: 'webshop', label: 'فروشگاه اینترنتی', icon: Globe },
              { id: 'portal', label: 'پورتال مشتریان', icon: UserCheck },
              { id: 'builder', label: 'سایت‌ساز و فرم‌های تماس', icon: FileEdit },
            ]
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: BUILT-IN WEBSHOP */}
      {activeTab === 'webshop' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                فروشگاه آنلاین یکپارچه با موجودی انبار
              </h3>
              <p className="text-xs text-slate-500">
                ثبت سفارش آنلاین به‌صورت خودکار فاکتور فروش صادر کرده و از انبار کسر می‌کند
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {brandFilters.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrandFilter(b)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    brandFilter === b
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredShopItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 flex flex-col justify-between gap-4 hover:border-indigo-300 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>برند: {item.brand || 'ثبت‌نشده'}</span>
                    <span>موجودی آنلاین: {item.stockQty} {item.uomPrimary}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                  <div className="text-xs text-slate-600">
                    <span>طعم: {item.flavor || 'استاندارد'}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>نیکوتین: {item.nicotine || '۰'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="font-mono tabular-nums text-sm font-bold text-indigo-700">
                    {formatCurrency(item.retailPrice)} تومان
                  </span>
                  <button
                    type="button"
                    disabled={item.stockQty <= 0}
                    onClick={() => onWebshopOrderCheckout(item)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                      item.stockQty > 0
                        ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                        : 'text-slate-400 bg-slate-100 dark:bg-slate-800 cursor-not-allowed'
                    }`}
                  >
                    {item.stockQty > 0 ? 'خرید آنلاین و ثبت سفارش' : 'ناموجود در انبار'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMER & SUPPLIER PORTAL */}
      {activeTab === 'portal' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              پورتال اختصاصی مشتریان و تامین‌کنندگان
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              پنل اختصاصی هر مشتری برای مشاهده سوابق فاکتورها، وضعیت سفارش‌ها، دانلود صورت‌حساب و تسویه آنلاین بدهی
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            هنوز حساب کاربری یا اطلاعات سفارش واقعی برای نمایش در پورتال ثبت نشده است.
          </div>

          {/* Customer Invoice History inside Portal */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900">
              سوابق فاکتورها و لینک تسویه آنلاین در پورتال مشتری
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-3">شماره فاکتور</th>
                    <th className="py-2.5 px-3">تاریخ صدور</th>
                    <th className="py-2.5 px-3">شرح اقلام</th>
                    <th className="py-2.5 px-3 text-left">مبلغ کل</th>
                    <th className="py-2.5 px-3 text-left">مانده قابل پرداخت</th>
                    <th className="py-2.5 px-3 text-left">عملیات پورتال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesInvoices.filter((invoice) => invoice.docstatus === 1).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        فاکتور ثبت‌شده‌ای برای نمایش وجود ندارد.
                      </td>
                    </tr>
                  )}
                  {salesInvoices.filter((invoice) => invoice.docstatus === 1).map((inv) => {
                    const rem = inv.returnAgainst
                      ? 0
                      : Math.max(
                          0,
                          inv.totalAmount - inv.paidAmount - (inv.creditedAmount || 0)
                        );
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                          {inv.invoiceNo}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{inv.date}</td>
                        <td className="py-2.5 px-3 text-slate-700">{inv.itemsSummary}</td>
                        <td className="py-2.5 px-3 font-mono text-left">
                          {formatCurrency(inv.totalAmount)} ت
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-left text-rose-700">
                          {formatCurrency(rem)} ت
                        </td>
                        <td className="py-2.5 px-3 text-left">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => window.print()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 rounded hover:bg-slate-200"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>دانلود صورت‌حساب</span>
                            </button>
                            {rem > 0 && !inv.isHistoricalArchive && (
                              <button
                                type="button"
                                onClick={() =>
                                  onShowToast(
                                    `لینک پرداخت آنلاین فاکتور ${inv.invoiceNo} (${formatCurrency(rem)} تومان) باز شد.`
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-white bg-indigo-600 rounded hover:bg-indigo-700"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>تسویه آنلاین</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WEB PAGE BUILDER, SEO BLOG & WEB FORMS */}
      {activeTab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              سایت‌ساز، صفحات فرود و مقالات وبلاگ
            </h3>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              هنوز صفحه یا مقاله‌ای ثبت نشده است.
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                فرم‌های تماس و درخواست نمایندگی متصل به سرنخ‌های فروش
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                فرم آنلاین «درخواست اخذ نمایندگی فروش و همکاری عمده» (تعداد فرم‌های دریافتی: {submittedWebFormsCount})
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!agencyApplicant.trim()) return;
                setSubmittedWebFormsCount((c) => c + 1);
                setAgencyApplicant('');
                setAgencyCity('');
                onShowToast('فرم آنلاین درخواست نمایندگی مستقیماً در جدول سرنخ‌های فروش ثبت شد.');
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">نام متقاضی نمایندگی / فروشگاه</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً گالری ویپ مدرن اهواز"
                  value={agencyApplicant}
                  onChange={(e) => setAgencyApplicant(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">شهر و استان فعالیت</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً اهواز - کیانپارس"
                  value={agencyCity}
                  onChange={(e) => setAgencyCity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                ارسال فرم آنلاین به واحد فروش
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
