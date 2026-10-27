import React, { useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { InventoryItemRecord, SalesInvoiceRecord } from '../data/erpSeedData';
import { formatCurrency } from '../utils/erpEngine';
import { PolarisButton, PolarisButtonGroup } from './CreatableCombobox';

interface PosReturnsPanelProps {
  invoices: SalesInvoiceRecord[];
  inventoryItems: InventoryItemRecord[];
  onProcessReturn: (payload: {
    sourceInvoiceId: string;
    resolutionMode: 'credit_balance' | 'exchange' | 'cash_refund';
    refundAccountCode: '110102' | '110103';
    exchangeReplacementSku?: string;
    exchangeReplacementQty?: number;
    notes?: string;
  }) => boolean;
  onShowToast: (message: string) => void;
}

export const PosReturnsPanel: React.FC<PosReturnsPanelProps> = ({
  invoices,
  inventoryItems,
  onProcessReturn,
  onShowToast,
}) => {
  const replacementItems = inventoryItems.filter((item) => !item.isVirtualDecantBottle);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [resolutionMode, setResolutionMode] = useState<
    'credit_balance' | 'exchange' | 'cash_refund'
  >('credit_balance');
  const [refundAccountCode, setRefundAccountCode] = useState<'110102' | '110103' | ''>('');
  const [replacementSku, setReplacementSku] = useState('');
  const [replacementQty, setReplacementQty] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (selectedInvoiceId && !invoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      setSelectedInvoiceId('');
    }
  }, [invoices, selectedInvoiceId]);

  useEffect(() => {
    if (replacementSku && !replacementItems.some((item) => item.sku === replacementSku)) {
      setReplacementSku('');
    }
  }, [replacementItems, replacementSku]);

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          ثبت برگشت از فروش (مرجوعی کالا) با ۳ گزینه عملیاتی
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          کالا به انبار بازگردانده شده و بر اساس گزینه انتخابی، سند معکوس در حسابداری صادر می‌شود.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
            ۱. انتخاب فاکتور فروش مرجع:
          </label>
          <select
            value={selectedInvoiceId}
            onChange={(event) => setSelectedInvoiceId(event.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            disabled={invoices.length === 0}
          >
            <option value="">انتخاب فاکتور فروش مرجع...</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNo} — {invoice.customerName} (
                {formatCurrency(invoice.totalAmount)} تومان)
              </option>
            ))}
          </select>
          {invoices.length === 0 && (
            <p className="mt-1 text-amber-700">فاکتور فروشِ قابل مرجوعی وجود ندارد.</p>
          )}
        </div>

        <div>
          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
            ۲. روش تسویه مرجوعی:
          </label>
          <PolarisButtonGroup segmented fullWidth>
            <PolarisButton
              size="slim"
              primary={resolutionMode === 'credit_balance'}
              onClick={() => setResolutionMode('credit_balance')}
              className="flex-1"
            >
              ۱. بستانکار کردن مشتری
            </PolarisButton>
            <PolarisButton
              size="slim"
              primary={resolutionMode === 'exchange'}
              onClick={() => setResolutionMode('exchange')}
              className="flex-1"
            >
              ۲. تعویض با کالای دیگر
            </PolarisButton>
            <PolarisButton
              size="slim"
              primary={resolutionMode === 'cash_refund'}
              onClick={() => setResolutionMode('cash_refund')}
              className="flex-1"
            >
              ۳. عودت وجه نقد/کارت
            </PolarisButton>
          </PolarisButtonGroup>
        </div>
      </div>

      {resolutionMode === 'exchange' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
          <div>
            <label className="block font-semibold mb-1">کالای جایگزین از انبار:</label>
            <select
              value={replacementSku}
              onChange={(event) => setReplacementSku(event.target.value)}
              disabled={replacementItems.length === 0}
              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="">انتخاب کالای جایگزین...</option>
              {replacementItems.map((item) => (
                <option key={item.sku} value={item.sku}>
                  {item.name} — {formatCurrency(item.retailPrice)} ت (موجودی: {item.stockQty})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">تعداد کالای جایگزین:</label>
            <input
              type="number"
              min={1}
              value={replacementQty || ''}
              onChange={(event) =>
                setReplacementQty(Math.max(0, Number(event.target.value) || 0))
              }
              onFocus={(e) => e.target.select()}
              placeholder=""
              className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
        </div>
      )}

      {resolutionMode === 'cash_refund' && (
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
          <label className="block font-semibold mb-1.5">حساب پرداخت‌کننده وجه مرجوعی:</label>
          <PolarisButtonGroup segmented>
            <PolarisButton
              size="slim"
              primary={refundAccountCode === '110102'}
              onClick={() => setRefundAccountCode('110102')}
            >
              کارت بانکی (کارت به کارت)
            </PolarisButton>
            <PolarisButton
              size="slim"
              primary={refundAccountCode === '110103'}
              onClick={() => setRefundAccountCode('110103')}
            >
              صندوق نقد مغازه
            </PolarisButton>
          </PolarisButtonGroup>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="علت مرجوعی یا توضیحات سند..."
          className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
        />
        <PolarisButton
          primary
          loading={isSubmitting}
          disabled={
            isSubmitting ||
            !selectedInvoiceId ||
            (resolutionMode === 'exchange' && (!replacementSku || replacementQty <= 0)) ||
            (resolutionMode === 'cash_refund' && !refundAccountCode)
          }
          icon={<PackageCheck className="w-4 h-4" />}
          onClick={() => {
            if (!selectedInvoiceId || isSubmitting) {
              onShowToast('لطفاً یک فاکتور فروش معتبر انتخاب کنید.');
              return;
            }
            if (resolutionMode === 'exchange' && (!replacementSku || replacementQty <= 0)) {
              onShowToast('لطفاً کالای جایگزین و تعداد را وارد کنید.');
              return;
            }
            if (resolutionMode === 'cash_refund' && !refundAccountCode) {
              onShowToast('لطفاً حساب پرداخت‌کننده وجه را انتخاب کنید.');
              return;
            }
            setIsSubmitting(true);
            window.setTimeout(() => {
              try {
                onProcessReturn({
                  sourceInvoiceId: selectedInvoiceId,
                  resolutionMode,
                  refundAccountCode: refundAccountCode || '110102',
                  exchangeReplacementSku: replacementSku,
                  exchangeReplacementQty: replacementQty,
                  notes,
                });
              } finally {
                setIsSubmitting(false);
              }
            }, 150);
          }}
        >
          ثبت قطعی برگشت از فروش
        </PolarisButton>
      </div>
    </div>
  );
};
