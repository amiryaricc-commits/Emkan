import React, { useState, useMemo } from 'react';
import {
  Users,
  UserCheck,
  Briefcase,
  Truck,
  Megaphone,
  MessageSquare,
  Plus,
  Eye,
  EyeOff,
  Upload,
  Send,
} from 'lucide-react';
import {
  CrmLeadRecord,
  CustomerContactRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  PaymentEntryRecord,
  BulkSmsContactRecord,
} from '../data/erpSeedData';
import { formatCurrency } from '../utils/erpEngine';
import { normalizePhoneNumber } from '../utils/posService';
import {
  PolarisButton,
  PolarisButtonGroup,
  PolarisCollapsible,
  PolarisSheet,
} from './CreatableCombobox';

interface CrmMarketingModuleProps {
  leads: CrmLeadRecord[];
  contacts: CustomerContactRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices: PurchaseInvoiceRecord[];
  paymentEntries: PaymentEntryRecord[];
  bulkSmsPool: BulkSmsContactRecord[];
  privacyMasked?: boolean;
  productionMode: boolean;
  onAddContact: (contact: CustomerContactRecord) => void;
  onUpdateContact?: (contact: CustomerContactRecord) => void;
  onSettleContactBalance?: (payload: {
    contactId: string;
    amount: number;
    settlementType: 'receive_debt' | 'pay_credit';
    accountCode: string;
    note?: string;
  }) => void;
  onAddLead: (lead: CrmLeadRecord) => void;
  onAdvanceLeadStage: (id: string) => void;
  onImportBulkSmsNumbers: (items: BulkSmsContactRecord[]) => void;
  onShowToast: (msg: string) => void;
}

type CrmSixTab =
  | 'all_contacts'
  | 'customers'
  | 'resellers'
  | 'suppliers'
  | 'marketing_leads'
  | 'bulk_sms_pool';

export const CrmMarketingModule: React.FC<CrmMarketingModuleProps> = ({
  leads,
  contacts,
  salesInvoices,
  purchaseInvoices,
  paymentEntries,
  bulkSmsPool,
  privacyMasked = false,
  onAddContact,
  onUpdateContact,
  onSettleContactBalance,
  onAddLead,
  onAdvanceLeadStage,
  onImportBulkSmsNumbers,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<CrmSixTab>('all_contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedContactIds, setExpandedContactIds] = useState<Record<string, boolean>>({});
  const [editingContact, setEditingContact] = useState<CustomerContactRecord | null>(null);
  const [settlingContact, setSettlingContact] = useState<{
    contact: CustomerContactRecord;
    settlementType: 'receive_debt' | 'pay_credit';
    maxAmount: number;
  } | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleAccountCode, setSettleAccountCode] = useState('110102');
  const [settleNote, setSettleNote] = useState('');

  // Polaris Sheet 1: New Contact / Reseller / Supplier (Closed by default, opens via +)
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [phoneValidationError, setPhoneValidationError] = useState<string | null>(null);
  const [cCategory, setCCategory] = useState<'customer' | 'reseller' | 'supplier' | ''>('');
  const [cVapeStyle, setCVapeStyle] = useState('');
  const [cInstagram, setCInstagram] = useState('');
  const [cTelegram, setCTelegram] = useState('');
  const [cProfession, setCProfession] = useState('');

  // Polaris Sheet 2: New Marketing Lead (Closed by default, opens via +)
  const [isLeadSheetOpen, setIsLeadSheetOpen] = useState(false);
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSource, setLeadSource] = useState<CrmLeadRecord['source'] | ''>('');
  const [leadCampaign, setLeadCampaign] = useState('');
  const [leadStyle, setLeadStyle] = useState<CrmLeadRecord['interestStyle'] | ''>('');

  // Polaris Collapsible: Bulk SMS Import Form (Closed by default)
  const [isBulkImportCollapsibleOpen, setIsBulkImportCollapsibleOpen] = useState(false);
  const [isSendingBulkSms, setIsSendingBulkSms] = useState(false);
  const [bulkRawInput, setBulkRawInput] = useState('');
  const [bulkGroupTag, setBulkGroupTag] = useState('');
  const [smsMessageText, setSmsMessageText] = useState('');

  const enrichedContacts = useMemo(() => {
    return contacts.map((contact) => {
      const roleLower = (contact.role || '').toLowerCase();
      const notesLower = (contact.notes || '').toLowerCase();
      let category: 'customer' | 'reseller' | 'supplier' =
        contact.contactCategory || 'customer';

      if (!contact.contactCategory) {
        if (
          roleLower.includes('تامین') ||
          roleLower.includes('تأمین') ||
          roleLower.includes('فروشنده') ||
          notesLower.includes('تامین')
        ) {
          category = 'supplier';
        } else if (
          roleLower.includes('همکار') ||
          roleLower.includes('ریسلر') ||
          roleLower.includes('عمده') ||
          notesLower.includes('همکار')
        ) {
          category = 'reseller';
        }
      }

      const custInvoices = salesInvoices.filter(
        (inv) =>
          inv.docstatus === 1 &&
          inv.status !== 'ابطال‌شده' &&
          (inv.customerId
            ? inv.customerId === contact.id
            : inv.customerName.trim() === contact.fullName.trim())
      );
      const suppBills = purchaseInvoices.filter(
        (pinv) =>
          pinv.docstatus === 1 &&
          pinv.status !== 'ابطال‌شده' &&
          (pinv.supplierId
            ? pinv.supplierId === contact.id
            : pinv.supplierName.trim() === contact.fullName.trim())
      );
      const partyPayments = paymentEntries.filter(
        (pe) =>
          pe.docstatus === 1 &&
          (pe.partyId
            ? pe.partyId === contact.id
            : pe.partyName.trim() === contact.fullName.trim())
      );

      let totalPurchasesAmount = contact.manualTotalPurchases || 0;
      let customerNetProfit = contact.manualNetProfit || 0;
      let resolvedDebit = contact.debitBalance || 0;
      let resolvedCredit = contact.creditBalance || 0;

      // Netting debt and credit if both exist
      if (resolvedDebit > 0 && resolvedCredit > 0) {
        if (resolvedDebit >= resolvedCredit) {
          resolvedDebit -= resolvedCredit;
          resolvedCredit = 0;
        } else {
          resolvedCredit -= resolvedDebit;
          resolvedDebit = 0;
        }
      }

      for (const inv of custInvoices) {
        const isReturn = Boolean(inv.returnAgainst);
        const sign = isReturn ? -1 : 1;
        totalPurchasesAmount += sign * inv.totalAmount;
        const cogs =
          inv.cogsAmount ||
          (inv.lines
            ? inv.lines.reduce((s, l) => s + l.qty * (l.valuationRate || l.unitPrice * 0.72), 0)
            : Math.round(inv.totalAmount * 0.72));
        customerNetProfit += sign * (inv.totalAmount - cogs);
      }

      const referredCount = salesInvoices.filter(
        (inv) =>
          inv.docstatus === 1 &&
          inv.referralName &&
          inv.referralName.trim() === contact.fullName.trim()
      ).length;

      return {
        ...contact,
        resolvedCategory: category,
        invoiceCount: custInvoices.length + suppBills.length,
        totalPurchasesAmount: Math.max(0, totalPurchasesAmount),
        customerNetProfit,
        debitBalance: resolvedDebit,
        creditBalance: resolvedCredit,
        referredCount,
        custInvoices,
        suppBills,
        partyPayments,
      };
    });
  }, [contacts, salesInvoices, purchaseInvoices, paymentEntries]);

  const visibleContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedContacts.filter((c) => {
      if (activeTab === 'customers' && c.resolvedCategory !== 'customer') return false;
      if (activeTab === 'resellers' && c.resolvedCategory !== 'reseller') return false;
      if (activeTab === 'suppliers' && c.resolvedCategory !== 'supplier') return false;
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.vapingStyle && c.vapingStyle.toLowerCase().includes(q)) ||
        (c.instagramId && c.instagramId.toLowerCase().includes(q)) ||
        (c.profession && c.profession.toLowerCase().includes(q))
      );
    });
  }, [enrichedContacts, activeTab, searchQuery]);

  const handleSaveNewContact = () => {
    if (!cName.trim() || !cCategory || isSavingContact) return;

    const trimmedPhone = cPhone.trim();
    if (trimmedPhone) {
      const cleanPhone = normalizePhoneNumber(trimmedPhone);
      if (cleanPhone.length < 8) {
        setPhoneValidationError('شماره تماس واردشده کوتاه یا نامعتبر است.');
        onShowToast('شماره تماس واردشده معتبر نیست.');
        return;
      }
      const duplicate = contacts.find(
        (c) => c.phone && normalizePhoneNumber(c.phone) === cleanPhone
      );
      if (duplicate) {
        const errorMsg = `این شماره تلفن قبلاً برای مخاطب «${duplicate.fullName}» (${duplicate.role || 'مشتری'}) ثبت شده است.`;
        setPhoneValidationError(errorMsg);
        onShowToast(`خطای اعتبارسنجی: شماره تلفن تکراری است (مربوط به ${duplicate.fullName}).`);
        return;
      }
    }
    setPhoneValidationError(null);
    setIsSavingContact(true);
    const roleLabel =
      cCategory === 'reseller'
        ? 'همکار / ریسلر'
        : cCategory === 'supplier'
          ? 'تأمین‌کننده'
          : 'مشتری عادی';

    window.setTimeout(() => {
      onAddContact({
        id: `crm-c-${Date.now()}`,
        sourceCode: `CRM-${contacts.length + 201}`,
        fullName: cName.trim(),
        personType: 'حقیقی',
        role: roleLabel,
        contactCategory: cCategory as 'customer' | 'reseller' | 'supplier',
        phone: cPhone.trim(),
        vapingStyle: cVapeStyle.trim() || undefined,
        instagramId: cInstagram.trim(),
        telegramId: cTelegram.trim(),
        profession: cProfession.trim(),
        notes: `${roleLabel} — ثبت‌شده در CRM`,
      });
      setCName('');
      setCPhone('');
      setPhoneValidationError(null);
      setCCategory('');
      setCVapeStyle('');
      setCInstagram('');
      setCTelegram('');
      setCProfession('');
      setIsSavingContact(false);
      setIsContactSheetOpen(false);
    }, 120);
  };

  const handleSaveNewLead = () => {
    if (!leadName.trim() || !leadPhone.trim() || !leadSource || !leadStyle || isSavingLead) return;
    setIsSavingLead(true);
    window.setTimeout(() => {
      onAddLead({
        id: `lead-${Date.now()}`,
        fullName: leadName.trim(),
        phone: leadPhone.trim(),
        source: leadSource as CrmLeadRecord['source'],
        campaignName: leadCampaign.trim(),
        interestStyle: leadStyle as CrmLeadRecord['interestStyle'],
        stage: 'لید جدید',
        probability: 45,
        estimatedValue: 1850000,
        loyaltyTier: 'نقره‌ای',
        loyaltyPoints: 50,
        clvAmount: 0,
        lastPurchaseDaysAgo: 0,
      });
      setLeadName('');
      setLeadPhone('');
      setLeadSource('');
      setLeadCampaign('');
      setLeadStyle('');
      setIsSavingLead(false);
      setIsLeadSheetOpen(false);
    }, 120);
  };

  const handleBulkSmsParseAndImport = () => {
    const rawTokens = bulkRawInput
      .split(/[\n,;،]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 7);

    if (rawTokens.length === 0) {
      onShowToast('لطفاً حداقل یک شماره موبایل معتبر وارد کنید.');
      return;
    }

    const normalizePhone = (raw: string): string => {
      let p = raw
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[^0-9+]/g, '')
        .trim();
      if (p.startsWith('+98')) p = '0' + p.slice(3);
      else if (p.startsWith('0098')) p = '0' + p.slice(4);
      else if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
      else if (p.startsWith('9') && p.length === 10) p = '0' + p;
      return p;
    };

    const seenPhones = new Set(bulkSmsPool.map((b) => normalizePhone(b.phone)));
    const created: BulkSmsContactRecord[] = [];

    for (const token of rawTokens) {
      const parts = token.split(/[-:]/).map((p) => p.trim());
      const hasName = parts.length > 1;
      const rawPhone = hasName ? parts[1] : parts[0];
      const cleanPhone = normalizePhone(rawPhone);
      if (cleanPhone.length < 10) continue;
      if (seenPhones.has(cleanPhone)) continue;
      seenPhones.add(cleanPhone);

      created.push({
        id: `bsms-${Date.now()}-${created.length}`,
        phone: cleanPhone,
        fullName: hasName ? parts[0] : `شماره تبلیغاتی #${bulkSmsPool.length + created.length + 1}`,
        groupTag: bulkGroupTag.trim() || 'عمومی',
        importedAt: '۱۴۰۴/۰۸/۱۴',
      });
    }

    if (created.length === 0) {
      onShowToast('همه شماره‌های واردشده تکراری یا نامعتبر بودند.');
      return;
    }

    onImportBulkSmsNumbers(created);
    setBulkRawInput('');
    setIsBulkImportCollapsibleOpen(false);
    onShowToast(`${created.length} شماره جدید به لیست پیامک اضافه شد.`);
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Polaris Secondary Segmented ButtonGroup + (+) Sheet Trigger */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <PolarisButtonGroup segmented>
          <PolarisButton
            size="slim"
            primary={activeTab === 'all_contacts'}
            icon={<Users className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('all_contacts')}
          >
            همه مخاطبین ({enrichedContacts.length})
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeTab === 'customers'}
            icon={<UserCheck className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('customers')}
          >
            مشتریان ({enrichedContacts.filter((c) => c.resolvedCategory === 'customer').length})
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeTab === 'resellers'}
            icon={<Briefcase className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('resellers')}
          >
            ریسلرها ({enrichedContacts.filter((c) => c.resolvedCategory === 'reseller').length})
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeTab === 'suppliers'}
            icon={<Truck className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('suppliers')}
          >
            تأمین‌کنندگان ({enrichedContacts.filter((c) => c.resolvedCategory === 'supplier').length})
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeTab === 'marketing_leads'}
            icon={<Megaphone className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('marketing_leads')}
          >
            لیدهای بازاریابی ({leads.length})
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeTab === 'bulk_sms_pool'}
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('bulk_sms_pool')}
          >
            استخر پیامک ({bulkSmsPool.length})
          </PolarisButton>
        </PolarisButtonGroup>

        <div className="flex items-center gap-2">
          {activeTab === 'marketing_leads' ? (
            <PolarisButton
              size="slim"
              primary
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsLeadSheetOpen(true)}
            >
              ثبت لید بازاریابی جدید
            </PolarisButton>
          ) : (
            <PolarisButton
              size="slim"
              primary
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                if (activeTab === 'resellers') setCCategory('reseller');
                else if (activeTab === 'suppliers') setCCategory('supplier');
                else setCCategory('customer');
                setIsContactSheetOpen(true);
              }}
            >
              ثبت مخاطب جدید
            </PolarisButton>
          )}
        </div>
      </div>

      {/* =====================================================================
          TABS 1 TO 4: CONTACTS POLARIS INDEXTABLE + ROW-LEVEL COLLAPSIBLE
         ===================================================================== */}
      {(activeTab === 'all_contacts' ||
        activeTab === 'customers' ||
        activeTab === 'resellers' ||
        activeTab === 'suppliers') && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی نام، شماره تماس، آیدی اینستاگرام، شغل یا سبک ویپینگ..."
              className="w-full sm:max-w-md px-3.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <span className="text-xs text-slate-500">
              نمایش {visibleContacts.length} رکورد در جدول فشرده (IndexTable)
            </span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[520px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3">نام مخاطب</th>
                  <th className="py-2 px-3">نقش</th>
                  <th className="py-2 px-3">موبایل</th>
                  <th className="py-2 px-3">سبک / مشخصات</th>
                  <th className="py-2 px-3">تعداد فاکتور</th>
                  <th className="py-2 px-3">مجموع خرید</th>
                  <th className="py-2 px-3">سود خالص</th>
                  <th className="py-2 px-3">بدهکار / بستانکار</th>
                  <th className="py-2 px-3 text-center">سوابق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleContacts.map((contact) => {
                  const isExpanded = Boolean(expandedContactIds[contact.id]);
                  const roleLabel =
                    contact.resolvedCategory === 'reseller'
                      ? 'همکار ریسلر'
                      : contact.resolvedCategory === 'supplier'
                        ? 'تأمین‌کننده'
                        : 'مشتری';

                  return (
                    <React.Fragment key={contact.id}>
                      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{contact.fullName}</span>
                            {contact.custInvoices.some((inv) => Boolean(inv.returnAgainst)) && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                مرجوعی
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                          {roleLabel}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          {contact.phone || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {contact.vapingStyle || '—'}
                          {contact.instagramId ? ` · @${contact.instagramId}` : ''}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums">
                          {contact.invoiceCount}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums">
                          {formatCurrency(contact.totalPurchasesAmount)} ت
                        </td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {privacyMasked ? '****' : `${formatCurrency(contact.customerNetProfit)} ت`}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          {contact.debitBalance > 0 ? (
                            <span className="text-rose-600 font-bold">
                              بدهکار: {formatCurrency(contact.debitBalance)}
                            </span>
                          ) : contact.creditBalance > 0 ? (
                            <span className="text-emerald-700 font-bold">
                              بستانکار: {formatCurrency(contact.creditBalance)}
                            </span>
                          ) : (
                            <span className="text-slate-400">تسویه</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <PolarisButton
                              size="slim"
                              primary={isExpanded}
                              icon={<Plus className="w-3 h-3" />}
                              onClick={() =>
                                setExpandedContactIds((prev) => ({
                                  ...prev,
                                  [contact.id]: !prev[contact.id],
                                }))
                              }
                            >
                              {isExpanded ? 'بستن' : 'فاکتورها'}
                            </PolarisButton>
                            {onUpdateContact && (
                              <PolarisButton
                                size="slim"
                                onClick={() => setEditingContact({ ...contact })}
                              >
                                ویرایش
                              </PolarisButton>
                            )}
                            {onSettleContactBalance &&
                              (contact.debitBalance > 0 || contact.creditBalance > 0) && (
                                <PolarisButton
                                  size="slim"
                                  primary
                                  onClick={() => {
                                    const isDebt = contact.debitBalance > 0;
                                    const maxAmt = isDebt
                                      ? contact.debitBalance
                                      : contact.creditBalance;
                                    setSettlingContact({
                                      contact,
                                      settlementType: isDebt ? 'receive_debt' : 'pay_credit',
                                      maxAmount: maxAmt,
                                    });
                                    setSettleAmount(String(maxAmt));
                                    setSettleAccountCode('110102');
                                    setSettleNote('');
                                  }}
                                >
                                  تسویه حساب
                                </PolarisButton>
                              )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-slate-800/50">
                          <td colSpan={9} className="p-3 border-b border-slate-200 dark:border-slate-700">
                            <PolarisCollapsible
                              id={`crm-contact-collapsible-${contact.id}`}
                              open={isExpanded}
                            >
                              {contact.custInvoices.length === 0 &&
                              contact.suppBills.length === 0 ? (
                                <div className="text-slate-400 text-center py-2">
                                  هنوز فاکتوری برای این مخاطب ثبت نشده است.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {contact.custInvoices.map((inv) => (
                                    <div
                                      key={inv.id}
                                      className="flex items-center justify-between py-1 px-2.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"
                                    >
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono font-bold ml-2">
                                          {inv.invoiceNo}
                                        </span>
                                        {inv.returnAgainst && (
                                          <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">
                                            مرجوعی ({inv.returnAgainst})
                                          </span>
                                        )}
                                        <span className="text-slate-500">{inv.date}</span>
                                        <span className="mr-2 font-medium">
                                          {inv.itemsSummary || 'فاکتور فروش'}
                                        </span>
                                      </div>
                                      <span className="font-mono font-bold tabular-nums">
                                        {formatCurrency(inv.totalAmount)} تومان
                                      </span>
                                    </div>
                                  ))}
                                  {contact.suppBills.map((bill) => (
                                    <div
                                      key={bill.id}
                                      className="flex items-center justify-between py-1 px-2.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"
                                    >
                                      <div>
                                        <span className="font-mono font-bold ml-2">
                                          {bill.billNo}
                                        </span>
                                        <span className="text-slate-500">{bill.date}</span>
                                        <span className="mr-2 font-medium">
                                          {bill.itemsSummary || 'فاکتور خرید'}
                                        </span>
                                      </div>
                                      <span className="font-mono font-bold tabular-nums">
                                        {formatCurrency(bill.totalAmount)} تومان
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </PolarisCollapsible>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: MARKETING LEADS POLARIS INDEXTABLE (Form closed by default in Sheet)
         ===================================================================== */}
      {activeTab === 'marketing_leads' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              جدول لیدهای بازاریابی و سرنخ‌های تبلیغاتی ({leads.length} مورد)
            </h3>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-3">نام سرنخ</th>
                  <th className="py-2 px-3">شماره تماس</th>
                  <th className="py-2 px-3">کانال ورودی</th>
                  <th className="py-2 px-3">کمپین</th>
                  <th className="py-2 px-3">سبک مورد علاقه</th>
                  <th className="py-2 px-3">مرحله</th>
                  <th className="py-2 px-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-3 font-bold">{lead.fullName}</td>
                    <td className="py-2 px-3 font-mono tabular-nums">{lead.phone}</td>
                    <td className="py-2 px-3">{lead.source}</td>
                    <td className="py-2 px-3">{lead.campaignName || '—'}</td>
                    <td className="py-2 px-3">{lead.interestStyle}</td>
                    <td className="py-2 px-3 font-semibold text-indigo-600">{lead.stage}</td>
                    <td className="py-2 px-3 text-center">
                      {lead.stage !== 'مشتری وفادار' && (
                        <PolarisButton
                          size="slim"
                          onClick={() => {
                            onAdvanceLeadStage(lead.id);
                            onAddContact({
                              id: `conv-${Date.now()}`,
                              sourceCode: `L-${contacts.length + 300}`,
                              fullName: lead.fullName,
                              personType: 'حقیقی',
                              role: 'مشتری عادی',
                              contactCategory: 'customer',
                              phone: lead.phone,
                              vapingStyle: lead.interestStyle,
                              notes: `تبدیل‌شده از لید (${lead.source})`,
                            });
                          }}
                        >
                          تبدیل به مشتری
                        </PolarisButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: BULK SMS POOL INDEXTABLE + COLLAPSIBLE IMPORT
         ===================================================================== */}
      {activeTab === 'bulk_sms_pool' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                استخر شماره‌های تبلیغاتی (Bulk SMS Pool — مجزا از مشتریان اصلی)
              </h3>
            </div>
            <PolarisButton
              size="slim"
              icon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => setIsBulkImportCollapsibleOpen((prev) => !prev)}
            >
              {isBulkImportCollapsibleOpen ? 'بستن فرم ایمپورت' : '+ ایمپورت دسته‌ای شماره‌ها'}
            </PolarisButton>
          </div>

          <PolarisCollapsible
            id="crm-bulk-import-collapsible"
            open={isBulkImportCollapsibleOpen}
            className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-end">
              <div>
                <label className="block font-medium mb-1">برچسب گروه تبلیغاتی</label>
                <input
                  type="text"
                  value={bulkGroupTag}
                  onChange={(e) => setBulkGroupTag(e.target.value)}
                  placeholder="مثلاً: تبلیغات اینستاگرام"
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">لیست شماره‌ها (کپی متنی)</label>
                <input
                  type="text"
                  value={bulkRawInput}
                  onChange={(e) => setBulkRawInput(e.target.value)}
                  placeholder="09121112233, 09352223344..."
                  className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">آپلود فایل (.csv / .txt)</label>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setBulkRawInput((prev) => (prev ? `${prev}\n${text}` : text));
                  }}
                  className="w-full text-[11px] bg-white dark:bg-slate-900 border border-slate-300 rounded-lg p-1"
                />
              </div>
              <PolarisButton primary size="slim" onClick={handleBulkSmsParseAndImport}>
                افزودن به استخر پیامک
              </PolarisButton>
            </div>
          </PolarisCollapsible>

          <div className="flex items-center gap-2 text-xs">
            <input
              type="text"
              value={smsMessageText}
              onChange={(e) => setSmsMessageText(e.target.value)}
              placeholder="متن پیامک تبلیغاتی / اطلاع‌رسانی را وارد کنید..."
              className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 rounded-lg"
            />
            <PolarisButton
              primary
              size="slim"
              loading={isSendingBulkSms}
              disabled={isSendingBulkSms || !smsMessageText.trim() || bulkSmsPool.length === 0}
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={() => {
                setIsSendingBulkSms(true);
                window.setTimeout(() => {
                  setIsSendingBulkSms(false);
                  onShowToast(
                    `پیامک کمپین برای ${bulkSmsPool.length} شماره در صف ارسال قرار گرفت.`
                  );
                }, 150);
              }}
            >
              ارسال پیامک انبوه ({bulkSmsPool.length})
            </PolarisButton>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                <tr>
                  <th className="py-2 px-3">شماره موبایل</th>
                  <th className="py-2 px-3">عنوان</th>
                  <th className="py-2 px-3">گروه تبلیغاتی</th>
                  <th className="py-2 px-3">تاریخ ورود</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bulkSmsPool.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 px-3 font-mono font-bold tabular-nums">{item.phone}</td>
                    <td className="py-2 px-3">{item.fullName || '—'}</td>
                    <td className="py-2 px-3 text-slate-500">{item.groupTag}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{item.importedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          POLARIS SHEET 1: NEW CONTACT / RESELLER / SUPPLIER (Closed by default)
         ===================================================================== */}
      <PolarisSheet
        open={isContactSheetOpen}
        onClose={() => setIsContactSheetOpen(false)}
        title="افزودن مخاطب جدید (مشتری / همکار / تأمین‌کننده)"
        footer={
          <>
            <PolarisButton onClick={() => setIsContactSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingContact}
              disabled={isSavingContact || !cName.trim() || !cCategory}
              onClick={handleSaveNewContact}
            >
              ذخیره پروفایل در CRM
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block font-semibold mb-1">نام و نام خانوادگی / نام تجاری *</label>
            <input
              type="text"
              autoFocus
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="نام کامل..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">شماره تماس (یکتا)</label>
            <input
              type="text"
              value={cPhone}
              onChange={(e) => {
                setCPhone(e.target.value);
                if (phoneValidationError) setPhoneValidationError(null);
              }}
              placeholder="0912..."
              className={`w-full px-3 py-2 font-mono border rounded-lg bg-white dark:bg-slate-900 tabular-nums ${
                phoneValidationError ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-300'
              }`}
            />
            {phoneValidationError && (
              <div className="mt-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                <span className="shrink-0">⚠️</span>
                <span>{phoneValidationError}</span>
              </div>
            )}
          </div>
          <div>
            <label className="block font-semibold mb-1">دسته‌بندی مخاطب *</label>
            <select
              value={cCategory}
              onChange={(e) =>
                setCCategory(e.target.value as 'customer' | 'reseller' | 'supplier' | '')
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            >
              <option value="">انتخاب دسته‌بندی مخاطب...</option>
              <option value="customer">مشتری عادی (خرده‌فروشی)</option>
              <option value="reseller">همکار / ریسلر (عمده‌فروشی)</option>
              <option value="supplier">تأمین‌کننده (فروشنده بار به ما)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">سبک ویپینگ / حوزه فعالیت</label>
            <input
              type="text"
              value={cVapeStyle}
              onChange={(e) => setCVapeStyle(e.target.value)}
              placeholder="مثلاً: سالت نیکوتین (MTL)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold mb-1">آیدی اینستاگرام</label>
              <input
                type="text"
                value={cInstagram}
                onChange={(e) => setCInstagram(e.target.value)}
                placeholder="@id"
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">آیدی تلگرام</label>
              <input
                type="text"
                value={cTelegram}
                onChange={(e) => setCTelegram(e.target.value)}
                placeholder="@id"
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">شغل / تخصص</label>
            <input
              type="text"
              value={cProfession}
              onChange={(e) => setCProfession(e.target.value)}
              placeholder="مثلاً: کارمند / آزاد"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
        </div>
      </PolarisSheet>

      {/* =====================================================================
          POLARIS SHEET 2: NEW MARKETING LEAD (Closed by default)
         ===================================================================== */}
      <PolarisSheet
        open={isLeadSheetOpen}
        onClose={() => setIsLeadSheetOpen(false)}
        title="افزودن لید تبلیغاتی جدید"
        footer={
          <>
            <PolarisButton onClick={() => setIsLeadSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingLead}
              disabled={isSavingLead || !leadName.trim() || !leadPhone.trim() || !leadSource || !leadStyle}
              onClick={handleSaveNewLead}
            >
              ذخیره لید بازاریابی
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block font-semibold mb-1">نام مخاطب لید *</label>
            <input
              type="text"
              autoFocus
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="مثلاً: سارا نوری"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">شماره تماس *</label>
            <input
              type="text"
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              placeholder="0912..."
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white dark:bg-slate-900 tabular-nums"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">کانال جذب *</label>
            <select
              value={leadSource}
              onChange={(e) => setLeadSource(e.target.value as CrmLeadRecord['source'])}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            >
              <option value="">انتخاب کانال جذب...</option>
              <option value="اینستاگرام">اینستاگرام</option>
              <option value="تلگرام">تلگرام</option>
              <option value="تماس تلفنی">تماس تلفنی</option>
              <option value="مراجعه حضوری">مراجعه حضوری</option>
              <option value="کمپین اینفلوئنسر">کمپین اینفلوئنسر</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">کمپین</label>
            <input
              type="text"
              value={leadCampaign}
              onChange={(e) => setLeadCampaign(e.target.value)}
              placeholder="مثلاً: معرفی طعم‌های جدید"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">علاقه‌مندی *</label>
            <select
              value={leadStyle}
              onChange={(e) => setLeadStyle(e.target.value as CrmLeadRecord['interestStyle'])}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            >
              <option value="">انتخاب سبک علاقه‌مندی...</option>
              <option value="سبک MTL (سیگاری)">سبک MTL (سیگاری)</option>
              <option value="سبک DTL (قلیانی)">سبک DTL (قلیانی)</option>
              <option value="همکار عمده‌فروش">همکار عمده‌فروش</option>
            </select>
          </div>
        </div>
      </PolarisSheet>

      {/* =====================================================================
          POLARIS SHEET 3: EDIT CONTACT (Balances Read-Only per BUG-FIN-09)
         ===================================================================== */}
      <PolarisSheet
        open={Boolean(editingContact)}
        onClose={() => setEditingContact(null)}
        title={`ویرایش پروفایل مخاطب: ${editingContact?.fullName || ''}`}
        footer={
          <>
            <PolarisButton onClick={() => setEditingContact(null)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              disabled={!editingContact?.fullName.trim()}
              onClick={() => {
                if (!editingContact || !onUpdateContact) return;
                onUpdateContact(editingContact);
                setEditingContact(null);
              }}
            >
              ذخیره تغییرات
            </PolarisButton>
          </>
        }
      >
        {editingContact && (
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold mb-1">نام کامل / تجاری *</label>
              <input
                type="text"
                value={editingContact.fullName}
                onChange={(e) =>
                  setEditingContact({ ...editingContact, fullName: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">شماره تماس</label>
              <input
                type="text"
                value={editingContact.phone || ''}
                onChange={(e) =>
                  setEditingContact({ ...editingContact, phone: e.target.value })
                }
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white dark:bg-slate-900 tabular-nums"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold mb-1 text-slate-500">
                  مانده بدهی (فقط‌خواندنی 🔒)
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={`${formatCurrency(editingContact.debitBalance || 0)} تومان`}
                  className="w-full px-3 py-2 font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-500">
                  مانده بستانکاری (فقط‌خواندنی 🔒)
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={`${formatCurrency(editingContact.creditBalance || 0)} تومان`}
                  className="w-full px-3 py-2 font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              برای حفظ تراز دفتر کل (حساب‌های ۱۱۰۲، ۲۱۰۱ و ۲۱۰۲)، تغییر مانده بدهی یا اعتبار صرفاً از طریق دکمه «تسویه حساب» و صدور سند حسابداری دوبل انجام می‌شود.
            </p>
          </div>
        )}
      </PolarisSheet>

      {/* =====================================================================
          POLARIS SHEET 4: SETTLE CONTACT BALANCE (Double-Entry GL)
         ===================================================================== */}
      <PolarisSheet
        open={Boolean(settlingContact)}
        onClose={() => setSettlingContact(null)}
        title={`تسویه حساب مالی: ${settlingContact?.contact.fullName || ''}`}
        footer={
          <>
            <PolarisButton onClick={() => setSettlingContact(null)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              disabled={!settlingContact || (Number(settleAmount) || 0) <= 0}
              onClick={() => {
                if (!settlingContact || !onSettleContactBalance) return;
                const amt = Math.min(
                  settlingContact.maxAmount,
                  Math.max(0, Number(settleAmount) || 0)
                );
                if (amt <= 0) return;
                onSettleContactBalance({
                  contactId: settlingContact.contact.id,
                  amount: amt,
                  settlementType: settlingContact.settlementType,
                  accountCode: settleAccountCode,
                  note: settleNote.trim() || undefined,
                });
                setSettlingContact(null);
              }}
            >
              ثبت سند تسویه در دفتر کل
            </PolarisButton>
          </>
        }
      >
        {settlingContact && (
          <div className="space-y-3 text-xs">
            <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 font-semibold">
              {settlingContact.settlementType === 'receive_debt'
                ? `دریافت وجه بدهی از مشتری (حداکثر: ${formatCurrency(settlingContact.maxAmount)} تومان)`
                : `پرداخت / تسویه بستانکاری مخاطب (حداکثر: ${formatCurrency(settlingContact.maxAmount)} تومان)`}
            </div>
            <div>
              <label className="block font-semibold mb-1">مبلغ تسویه (تومان) *</label>
              <input
                type="number"
                min={1}
                max={settlingContact.maxAmount}
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">حساب بانک / صندوق *</label>
              <select
                value={settleAccountCode}
                onChange={(e) => setSettleAccountCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="110102">بانک ملت (کارتخوان / کارت‌به‌کارت) - 110102</option>
                <option value="110101">بانک سامان - 110101</option>
                <option value="110103">صندوق نقد مغازه - 110103</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">توضیحات سند</label>
              <input
                type="text"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                placeholder="شماره پیگیری / توضیحات..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
          </div>
        )}
      </PolarisSheet>
    </div>
  );
};
