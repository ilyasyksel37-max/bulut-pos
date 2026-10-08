import React, { useState, useEffect } from 'react';
import { 
  X, Receipt, ArrowDownRight, ArrowUpRight, Plus, 
  Calendar, Phone, CreditCard, AlertCircle, Printer, FileText, Trash2, 
  ShoppingBag, CheckCircle2, MessageCircle, MapPin, ExternalLink, Download, Truck 
} from 'lucide-react';
import { 
  collection, query, where, getDocs, addDoc, 
  updateDoc, doc, increment, serverTimestamp, orderBy, limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CustomerData } from './CustomerModal';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { generateCustomerPDF, generateSaleInvoicePDF, shareOnWhatsApp, shareSaleOnWhatsApp } from '../../lib/statement-utils';

interface CustomerLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerData | null;
  onCustomerUpdated: () => void;
  onOpenPayment: () => void;
  onStartSale?: (customer: CustomerData) => void;
  onStartFieldOrder?: (customer: CustomerData) => void;
}

export const CustomerLedgerModal: React.FC<CustomerLedgerModalProps> = ({
  isOpen,
  onClose,
  customer,
  onCustomerUpdated,
  onOpenPayment,
  onStartSale,
  onStartFieldOrder,
}) => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [manualDebtAmount, setManualDebtAmount] = useState('');
  const [manualDebtNote, setManualDebtNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printingSale, setPrintingSale] = useState<{ tx: any; details: any } | null>(null);

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [txDetails, setTxDetails] = useState<Record<string, any>>({});
  const [isDetailLoading, setIsDetailLoading] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'toplu' | 'detayli_satis' | 'products'>('toplu');
  const [dateFilter, setDateFilter] = useState({
    start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    if (!isOpen || !customer?.id) return;
    loadTransactions();
  }, [isOpen, customer?.id, dateFilter]);

  const loadAllSaleDetails = async (saleIds: string[]) => {
    try {
      const uniqueIds = Array.from(new Set(saleIds));
      for (let i = 0; i < uniqueIds.length; i += 10) {
        const chunk = uniqueIds.slice(i, i + 10);
        const salesSnap = await getDocs(query(collection(db, 'sales'), where('__name__', 'in', chunk)));
        const newDetails: Record<string, any> = {};
        salesSnap.docs.forEach(d => {
          newDetails[d.id] = d.data();
        });
        setTxDetails(prev => ({ ...prev, ...newDetails }));
      }
    } catch (err) {
      console.error("Batch load error:", err);
    }
  };

  const loadSaleDetails = async (saleId: string, txId: string) => {
    if (txDetails[saleId]) return;
    setIsDetailLoading(txId);
    try {
      const saleDoc = await getDocs(query(collection(db, 'sales'), where('__name__', '==', saleId)));
      if (!saleDoc.empty) {
        setTxDetails(prev => ({ ...prev, [saleId]: saleDoc.docs[0].data() }));
      }
    } catch (err) {
      console.error("Error loading sale details:", err);
    } finally {
      setIsDetailLoading(null);
    }
  };

  const loadTransactions = async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const startDate = new Date(dateFilter.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateFilter.end);
      endDate.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'customer_transactions'),
        where('customerId', '==', customer.id),
        orderBy('date', 'desc'),
        limit(200)
      );
      const snap = await getDocs(q);
      const rawDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Chronologically compute running balances and exact previousBalance
      const chronological = [...rawDocs].sort((a: any, b: any) => {
        const dateA = a.date?.toDate ? a.date.toDate().getTime() : (a.date ? new Date(a.date).getTime() : 0);
        const dateB = b.date?.toDate ? b.date.toDate().getTime() : (b.date ? new Date(b.date).getTime() : 0);
        return dateA - dateB;
      });

      let running = 0;
      chronological.forEach((tx: any) => {
        const amt = Number(tx.amount || 0);
        const prev = running;
        if (tx.type === 'DEBT') {
          running += amt;
        } else if (tx.type === 'PAYMENT') {
          running -= amt;
        }
        if (tx.balanceAfter !== undefined && tx.balanceAfter !== null) {
          running = Number(tx.balanceAfter);
        }
        tx.previousBalance = (tx.previousBalance !== undefined && tx.previousBalance !== null) ? Number(tx.previousBalance) : prev;
        tx.balanceAfter = (tx.balanceAfter !== undefined && tx.balanceAfter !== null) ? Number(tx.balanceAfter) : running;
      });

      // Sort descending for display (newest first)
      let list = chronological.sort((a: any, b: any) => {
        const dateA = a.date?.toDate ? a.date.toDate().getTime() : (a.date ? new Date(a.date).getTime() : 0);
        const dateB = b.date?.toDate ? b.date.toDate().getTime() : (b.date ? new Date(b.date).getTime() : 0);
        return dateB - dateA;
      });

      // Filter by date client-side
      list = list.filter((t: any) => {
        const d = t.date?.toDate ? t.date.toDate() : (t.date ? new Date(t.date) : new Date());
        return d >= startDate && d <= endDate;
      });

      setTransactions(list);

      const saleIds = list.filter((t: any) => t.saleId).map((t: any) => t.saleId);
      if (saleIds.length > 0) {
        loadAllSaleDetails(saleIds);
      }
    } catch (err) {
      console.error("Ledger load error:", err);
      // Fallback
      try {
        const qFallback = query(
          collection(db, 'customer_transactions'),
          where('customerId', '==', customer.id)
        );
        const snap = await getDocs(qFallback);
        const rawDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const chronological = [...rawDocs].sort((a: any, b: any) => {
          const dateA = a.date?.toDate ? a.date.toDate().getTime() : (a.date ? new Date(a.date).getTime() : 0);
          const dateB = b.date?.toDate ? b.date.toDate().getTime() : (b.date ? new Date(b.date).getTime() : 0);
          return dateA - dateB;
        });

        let running = 0;
        chronological.forEach((tx: any) => {
          const amt = Number(tx.amount || 0);
          const prev = running;
          if (tx.type === 'DEBT') running += amt;
          else if (tx.type === 'PAYMENT') running -= amt;
          if (tx.balanceAfter !== undefined && tx.balanceAfter !== null) running = Number(tx.balanceAfter);
          tx.previousBalance = (tx.previousBalance !== undefined && tx.previousBalance !== null) ? Number(tx.previousBalance) : prev;
          tx.balanceAfter = (tx.balanceAfter !== undefined && tx.balanceAfter !== null) ? Number(tx.balanceAfter) : running;
        });

        let list = chronological.sort((a: any, b: any) => {
          const dateA = a.date?.toDate ? a.date.toDate().getTime() : (a.date ? new Date(a.date).getTime() : 0);
          const dateB = b.date?.toDate ? b.date.toDate().getTime() : (b.date ? new Date(b.date).getTime() : 0);
          return dateB - dateA;
        });

        const startDate = new Date(dateFilter.start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateFilter.end);
        endDate.setHours(23, 59, 59, 999);

        list = list.filter((t: any) => {
          const d = t.date?.toDate ? t.date.toDate() : (t.date ? new Date(t.date) : new Date());
          return d >= startDate && d <= endDate;
        });

        setTransactions(list.slice(0, 100));
      } catch (e) {
        console.error("Fallback load error:", e);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !customer) return null;

  const currentDebt = Number(customer.debt || 0);

  const handleAddManualDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(manualDebtAmount.replace(',', '.'));
    if (!amountNum || amountNum <= 0) {
      alert("Lütfen geçerli bir borç tutarı girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newDebt = currentDebt + amountNum;
      await addDoc(collection(db, 'customer_transactions'), {
        customerId: customer.id,
        customerName: customer.name,
        type: 'DEBT',
        title: manualDebtNote.trim() || 'Manuel Veresiye / Borç Girişi',
        amount: amountNum,
        previousBalance: currentDebt,
        paymentMethod: 'Veresiye',
        balanceAfter: newDebt,
        date: serverTimestamp(),
      });

      await updateDoc(doc(db, 'customers', customer.id!), {
        debt: increment(amountNum),
        updatedAt: serverTimestamp(),
      });

      setManualDebtAmount('');
      setManualDebtNote('');
      setShowAddDebt(false);
      await loadTransactions();
      onCustomerUpdated();
    } catch (err) {
      console.error(err);
      alert("Borç kaydedilirken hata oluştu: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintSale = (tx: any, details: any) => {
    setPrintingSale({ tx, details });
    document.body.classList.add('printing-single-sale');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-single-sale');
        setPrintingSale(null);
      }, 800);
    }, 120);
  };

  const handlePrint = () => {
    document.body.classList.remove('printing-single-sale');
    setPrintingSale(null);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 120);
  };

  const handleDownloadPDF = () => {
    generateCustomerPDF(customer, transactions, txDetails);
  };

  const handleShareWhatsApp = () => {
    if (!customer.phone) {
      alert("Müşterinin telefon numarası kayıtlı değil.");
      return;
    }
    shareOnWhatsApp(customer.name, customer.phone, currentDebt, transactions, 'customer', [], txDetails);
  };

  const totalDebtPurchases = transactions
    .filter(t => t.type === 'DEBT')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalPaymentsMade = transactions
    .filter(t => t.type === 'PAYMENT')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Extract sold products list for the tab
  const soldProducts: any[] = [];
  transactions.forEach(tx => {
    if (tx.saleId && txDetails[tx.saleId]) {
      const sale = txDetails[tx.saleId];
      sale.items?.forEach((item: any) => {
        soldProducts.push({
          ...item,
          date: tx.date,
          saleId: tx.saleId
        });
      });
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-50 rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-white/25 flex flex-col print:h-auto print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none print:text-black print-area hide-on-single-print">
        
        {/* Dedicated Print-Only Header for Full Statement (A4 formatted) */}
        <div className="hidden print:block p-8 border-b-2 border-slate-900 bg-white text-black print-avoid-break">
          <div className="flex justify-between items-start pb-4 border-b border-slate-300">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">CARİ HESAP EKSTRESİ</h1>
              <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">BULUT POS & STOK TAKİP SİSTEMİ</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Rapor Tarihi: {format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
            </div>
            <div className="text-right text-xs">
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                currentDebt > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {currentDebt > 0 ? 'Borçlu Cari' : 'Bakiyeli Cari'}
              </span>
              <p className="text-sm font-black text-slate-900 mt-2">
                Güncel Bakiye: {currentDebt.toLocaleString('tr-TR')} ₺
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 text-xs">
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">MÜŞTERİ BİLGİLERİ</p>
              <p className="font-black text-slate-900 text-sm">{customer.name}</p>
              <p className="text-slate-600 mt-0.5">Tel: {customer.phone || 'Kayıtlı Değil'}</p>
              <p className="text-slate-600 mt-0.5">Adres: {customer.address || 'Adres Belirtilmemiş'}</p>
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">ÖZET BİLGİLER</p>
              <p className="text-slate-600">Toplam Alışveriş (Borç): <span className="font-bold text-slate-900">{totalDebtPurchases.toLocaleString('tr-TR')} ₺</span></p>
              <p className="text-slate-600 mt-0.5">Toplam Ödeme (Tahsilat): <span className="font-bold text-slate-900">{totalPaymentsMade.toLocaleString('tr-TR')} ₺</span></p>
              <p className="text-slate-600 mt-0.5">Toplam Alınan Ürün: <span className="font-bold text-slate-900">{soldProducts.length} Çeşit / Kalem</span></p>
            </div>
          </div>
        </div>

        {/* Header UI */}
        <div className="p-6 sm:p-8 border-b border-white/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 bg-white/40 backdrop-blur-sm print:hidden">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-200 rotate-3">
              <Receipt className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-black text-2xl sm:text-3xl text-slate-900 tracking-tighter">
                  {customer.name}
                </h3>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  currentDebt > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {currentDebt > 0 ? 'Borçlu' : 'Bakiyeli'}
                </span>
              </div>
              <p className="text-sm text-slate-500 font-bold flex items-center gap-2 mt-1">
                <Phone className="w-4 h-4 text-slate-400" />
                {customer.phone || 'Telefon Kayıtlı Değil'}
                <span className="text-slate-300 mx-1">•</span>
                <Calendar className="w-4 h-4 text-slate-400" />
                Kayıt: {(customer as any).createdAt?.toDate ? format((customer as any).createdAt.toDate(), 'dd MMM yyyy', { locale: tr }) : '-'}
              </p>
              {customer.address && (
                <p className="text-sm text-slate-500 font-bold flex items-center gap-2 mt-1">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {customer.address}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <button
              onClick={handleShareWhatsApp}
              className="px-5 py-3 rounded-2xl bg-[#25D366] hover:bg-[#128C7E] text-white text-sm font-black flex items-center gap-2.5 transition-all shadow-lg shadow-emerald-100 hover:-translate-y-0.5 active:translate-y-0"
            >
              <MessageCircle className="w-4 h-4 fill-current" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black flex items-center gap-2.5 transition-all shadow-lg shadow-indigo-100 hover:-translate-y-0.5 active:translate-y-0"
            >
              <FileText className="w-4 h-4" />
              <span>PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-50 transition-all hover:text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="px-6 sm:px-8 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:hidden">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Toplam Borç</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{totalDebtPurchases.toLocaleString('tr-TR')} ₺</p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Toplam Ödeme</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{totalPaymentsMade.toLocaleString('tr-TR')} ₺</p>
          </div>

          <div className={`p-5 rounded-3xl border shadow-lg ${
            currentDebt > 0 ? 'bg-red-600 border-red-500 text-white shadow-red-100' : 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-100'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-white/70 uppercase tracking-widest">Güncel Bakiye</span>
            </div>
            <p className="text-2xl font-black">{currentDebt.toLocaleString('tr-TR')} ₺</p>
          </div>
        </div>

        {/* Navigation & Controls */}
        <div className="px-6 sm:px-8 flex flex-col lg:flex-row items-center justify-between gap-6 print:hidden">
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex-1 lg:flex-none">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                className="text-xs font-bold text-slate-600 bg-transparent outline-none"
              />
              <span className="text-slate-300">—</span>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                className="text-xs font-bold text-slate-600 bg-transparent outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto">
            {onStartFieldOrder && (
              <button
                onClick={() => {
                  onClose();
                  onStartFieldOrder(customer);
                }}
                className="flex-1 lg:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-95"
                title="Bu müşteri için yeni saha siparişi aç"
              >
                <Truck className="w-4 h-4" />
                Saha Siparişi
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                onOpenPayment();
              }}
              className="flex-1 lg:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
            >
              <ArrowDownRight className="w-4 h-4" />
              Ödeme Al
            </button>
            <button
              onClick={() => setShowAddDebt(!showAddDebt)}
              className="flex-1 lg:flex-none px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Borç Ekle
            </button>
          </div>
        </div>

        {/* Manual Debt Form */}
        {showAddDebt && (
          <div className="mx-6 sm:mx-8 mt-4 animate-slideDown print:hidden">
            <form onSubmit={handleAddManualDebt} className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-48">
                <label className="block text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1.5 ml-1">Borç Tutarı</label>
                <div className="relative">
                  <input
                    required
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={manualDebtAmount}
                    onChange={(e) => setManualDebtAmount(e.target.value)}
                    autoFocus
                    className="w-full pl-4 pr-10 py-3 bg-white border border-amber-200 rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₺</span>
                </div>
              </div>
              <div className="w-full sm:flex-1">
                <label className="block text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1.5 ml-1">Açıklama / Not</label>
                <input
                  type="text"
                  placeholder="İşlem nedenini belirtin..."
                  value={manualDebtNote}
                  onChange={(e) => setManualDebtNote(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-amber-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                />
              </div>
              <div className="flex items-end h-full pt-6 w-full sm:w-auto">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-sm font-black shadow-lg shadow-amber-100 transition-all"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Borç Girişi Yap'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Content Area */}
        <div className="p-4 sm:p-8 flex flex-col space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-2 print:hidden">
            <button
              onClick={() => setActiveTab('toplu')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${
                activeTab === 'toplu' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              📊 Toplu Ekstre (Tüm Hareketler)
            </button>
            <button
              onClick={() => setActiveTab('detayli_satis')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${
                activeTab === 'detayli_satis' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              🛍️ Detaylı Satışlar Ekstresi ({transactions.filter(t => t.saleId).length})
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${
                activeTab === 'products' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              📦 Alınan Ürünler ({soldProducts.length})
            </button>
          </div>

          <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200 flex flex-col flex-1 overflow-x-auto overflow-y-auto shadow-sm min-h-[300px]">
            <div className="overflow-x-auto flex-1 min-w-[700px] sm:min-w-full">
              {activeTab === 'products' ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tarih</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ürün Adı</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Adet</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Birim Fiyat</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Toplam Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {soldProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-slate-400 font-bold text-sm">
                          Satın alınan ürün bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      soldProducts.map((item, idx) => {
                        const itemDate = item.date?.toDate ? item.date.toDate() : (item.date ? new Date(item.date) : new Date());
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 text-xs font-bold text-slate-600">
                              {format(itemDate, 'dd.MM.yyyy')}
                            </td>
                            <td className="px-6 py-4 text-xs font-black text-slate-900">
                              {item.name}
                            </td>
                            <td className="px-6 py-4 text-center text-xs font-bold text-slate-600">
                              {item.quantity}
                            </td>
                            <td className="px-6 py-4 text-right text-xs font-bold text-slate-600">
                              {Number(item.price || 0).toLocaleString('tr-TR')} ₺
                            </td>
                            <td className="px-6 py-4 text-right text-xs font-black text-slate-900">
                              {Number((item.price || 0) * (item.quantity || 1)).toLocaleString('tr-TR')} ₺
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : activeTab === 'detayli_satis' ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tarih</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ödeme Türü</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Satış Detayları / Ürünler</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Tutar</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center print:hidden">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 overflow-y-auto">
                    {transactions.filter(t => t.saleId).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-slate-400 font-bold text-sm">
                          Bu aralıkta satış kaydı bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      transactions.filter(t => t.saleId).map((tx) => {
                        const isExpanded = expandedTxId === tx.id;
                        const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
                        const details = tx.saleId ? txDetails[tx.saleId] : null;
                        const paymentMethod = tx.paymentMethod || 'Nakit';

                        return (
                          <React.Fragment key={tx.id}>
                            <tr className={`group hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                              <td className="px-6 py-4">
                                <p className="text-[13px] font-black text-slate-900">{format(txDate, 'dd.MM.yyyy')}</p>
                                <p className="text-[10px] font-bold text-slate-400">{format(txDate, 'HH:mm')}</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                                  paymentMethod === 'Veresiye' ? 'bg-red-100 text-red-700' :
                                  paymentMethod === 'Kredi Kartı' ? 'bg-purple-100 text-purple-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {paymentMethod === 'Veresiye' ? 'Veresiye Satış' : paymentMethod === 'Kredi Kartı' ? 'Kartlı Satış' : 'Nakit Satış'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-[13px] font-bold text-slate-700 line-clamp-1">{tx.title}</p>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="inline-block sm:hidden text-[10px] font-bold text-slate-400 mr-1">Tutar:</span>
                                <span className="inline-block text-[13px] font-black text-slate-900">{Number(tx.amount || 0).toLocaleString('tr-TR')} ₺</span>
                              </td>
                              <td className="px-6 py-4 text-center print:hidden">
                                <button
                                  onClick={() => {
                                    if (isExpanded) setExpandedTxId(null);
                                    else {
                                      setExpandedTxId(tx.id);
                                      loadSaleDetails(tx.saleId, tx.id);
                                    }
                                  }}
                                  className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                                >
                                  <ArrowDownRight className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={5} className="px-8 py-6 bg-slate-50/50 border-y border-slate-100">
                                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-slideDown">
                                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                                      <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">SATIŞ KALEMLERİ</h5>
                                      <span className="text-[10px] font-bold text-slate-400 italic">Fiş No: {tx.saleId}</span>
                                    </div>
                                    {isDetailLoading === tx.id && !details ? (
                                      <div className="p-8 text-center"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin inline-block"></div></div>
                                    ) : details ? (
                                      <div className="p-4">
                                        <table className="w-full text-left text-xs mb-4">
                                          <thead>
                                            <tr className="text-slate-400 font-bold border-b border-slate-100">
                                              <th className="px-3 py-2">Ürün Adı</th>
                                              <th className="px-3 py-2 text-center">Adet</th>
                                              <th className="px-3 py-2 text-right">Fiyat</th>
                                              <th className="px-3 py-2 text-right">Toplam</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-50">
                                            {details.items?.map((item: any, idx: number) => {
                                              const itPrice = Number(item.price || 0);
                                              const itQty = Number(item.quantity || 1);
                                              const itDiscount = Number(item.discount || 0);
                                              const itTotal = (itPrice * itQty) - itDiscount;
                                              return (
                                                <tr key={idx}>
                                                  <td className="px-3 py-3 font-bold text-slate-700">
                                                    {item.name}
                                                    {itDiscount > 0 && (
                                                      <span className="block text-[10px] text-red-600 font-semibold">
                                                        (İskonto: -{itDiscount.toLocaleString('tr-TR')} ₺)
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-3 text-center text-slate-500">{itQty}</td>
                                                  <td className="px-3 py-3 text-right text-slate-500">{itPrice.toLocaleString('tr-TR')} ₺</td>
                                                  <td className="px-3 py-3 text-right font-black text-slate-900">{itTotal.toLocaleString('tr-TR')} ₺</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                        {(() => {
                                          const items = details.items || [];
                                          const itemDiscountsSum = items.reduce((sum: number, it: any) => sum + Number(it.discount || 0), 0);
                                          const saleDiscount = Number(details.discount ?? details.totalDiscount ?? itemDiscountsSum);
                                          const itemsSum = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
                                          const saleTotal = Number(details.total || tx.amount || 0);
                                          const rawSubtotal = itemsSum > 0 ? itemsSum : (saleTotal + saleDiscount);
                                          const taxAmount = Number(details.taxAmount || 0);

                                          return (
                                            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100 px-3">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => handlePrintSale(tx, details)}
                                                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                  title="Bu Satışı Yazdır"
                                                >
                                                  <Printer className="w-3.5 h-3.5" />
                                                  <span>Yazdır</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => generateSaleInvoicePDF(customer, tx, details, "open")}
                                                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                  title="Bu Satışın PDF Faturasını Aç"
                                                >
                                                  <ExternalLink className="w-3.5 h-3.5" />
                                                  <span>PDF Aç</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => generateSaleInvoicePDF(customer, tx, details, "download")}
                                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                  title="Bu Satışın PDF Faturasını İndir"
                                                >
                                                  <Download className="w-3.5 h-3.5" />
                                                  <span>PDF İndir</span>
                                                </button>
                                                {customer.phone && (
                                                  <button
                                                    type="button"
                                                    onClick={() => shareSaleOnWhatsApp(customer, tx, details)}
                                                    className="px-3.5 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                    title="Müşteriye WhatsApp'tan Fiş Gönder"
                                                  >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    <span>PDF / Fiş Gönder</span>
                                                  </button>
                                                )}
                                              </div>
                                              <div className="w-full sm:w-64 bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1.5">
                                                <div className="flex justify-between text-slate-500 font-bold">
                                                  <span>Ara Toplam:</span>
                                                  <span>{rawSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                {saleDiscount > 0 && (
                                                  <div className="flex justify-between text-red-600 font-black">
                                                    <span>İskonto:</span>
                                                    <span>-{saleDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                  </div>
                                                )}
                                                {taxAmount > 0 && (
                                                  <div className="flex justify-between text-slate-500 font-bold">
                                                    <span>KDV (%10):</span>
                                                    <span>{taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                  </div>
                                                )}
                                                <div className="flex justify-between pt-1.5 border-t border-slate-200 font-black text-slate-900 text-sm">
                                                  <span>Genel Toplam:</span>
                                                  <span>{saleTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                {(() => {
                                                  const newBal = Number(tx.balanceAfter !== undefined ? tx.balanceAfter : customer.debt || 0);
                                                  let prevBal = 0;
                                                  if (tx.previousBalance !== undefined) {
                                                    prevBal = Number(tx.previousBalance);
                                                  } else if (tx.type === 'DEBT') {
                                                    prevBal = newBal - saleTotal;
                                                  } else if (tx.type === 'PAYMENT') {
                                                    prevBal = newBal + saleTotal;
                                                  } else {
                                                    prevBal = newBal;
                                                  }
                                                  if (Math.abs(prevBal) < 0.001) prevBal = 0;

                                                  return (
                                                    <div className="mt-2 pt-2 border-t border-dashed border-slate-200 text-[11px] space-y-1">
                                                      <div className="flex justify-between text-slate-500 font-semibold">
                                                        <span>Eski Bakiye:</span>
                                                        <span className="font-bold text-slate-800">{prevBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                      </div>
                                                      <div className="flex justify-between text-slate-700 font-bold">
                                                        <span>Güncel Kalan Borç:</span>
                                                        <span className="font-black text-red-600">{newBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    ) : (
                                      <div className="p-8 text-center text-slate-400 italic text-xs">Detay bulunamadı.</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tarih</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">İşlem Türü</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Açıklama</th>
                      <th className="px-6 py-4 text-[10px] font-black text-red-500 uppercase tracking-widest text-right">Borç (+)</th>
                      <th className="px-6 py-4 text-[10px] font-black text-emerald-500 uppercase tracking-widest text-right">Alacak (-)</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Bakiye</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center print:hidden">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 overflow-y-auto">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-20 text-center">
                          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                          <p className="text-xs font-bold text-slate-500">Hareketler listeleniyor...</p>
                        </td>
                      </tr>
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-20 text-center">
                          <Receipt className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                          <p className="text-sm font-black text-slate-400">Bu tarih aralığında kayıt bulunamadı.</p>
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => {
                        const isPayment = tx.type === 'PAYMENT';
                        const paymentMethod = tx.paymentMethod || '';
                        const isExpanded = expandedTxId === tx.id;
                        const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
                        const details = tx.saleId ? txDetails[tx.saleId] : null;

                        return (
                          <React.Fragment key={tx.id}>
                            <tr className={`group hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                              <td className="px-6 py-4">
                                <p className="text-[13px] font-black text-slate-900">{format(txDate, 'dd.MM.yyyy')}</p>
                                <p className="text-[10px] font-bold text-slate-400">{format(txDate, 'HH:mm')}</p>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                                  isPayment ? 'bg-emerald-100 text-emerald-700' :
                                  paymentMethod === 'Kredi Kartı' ? 'bg-purple-100 text-purple-700' :
                                  paymentMethod === 'Nakit' ? 'bg-blue-100 text-blue-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {isPayment ? `Tahsilat (${paymentMethod || 'Nakit'})` : paymentMethod === 'Kredi Kartı' ? 'Kartlı Satış' : paymentMethod === 'Nakit' ? 'Nakit Satış' : 'Veresiye Satış'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-[13px] font-bold text-slate-700 line-clamp-1">
                                  {tx.title || (isPayment ? 'Ödeme Alındı' : 'Satış')}
                                </p>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{paymentMethod || (isPayment ? 'Nakit' : 'Veresiye')}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="inline-block sm:hidden text-[10px] font-bold text-slate-400 mr-1">Borç:</span>
                                {!isPayment ? (
                                  <span className="inline-block text-[13px] font-black text-red-600">+{Number(tx.amount || 0).toLocaleString('tr-TR')} ₺</span>
                                ) : (
                                  <span className="inline-block text-[13px] font-bold text-slate-400">0 ₺</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="inline-block sm:hidden text-[10px] font-bold text-slate-400 mr-1">Alacak:</span>
                                {isPayment ? (
                                  <span className="inline-block text-[13px] font-black text-emerald-600">-{Number(tx.amount || 0).toLocaleString('tr-TR')} ₺</span>
                                ) : (
                                  <span className="inline-block text-[13px] font-bold text-slate-400">0 ₺</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="inline-block text-[13px] font-black text-slate-900">{Number(tx.balanceAfter || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                              </td>
                              <td className="px-6 py-4 text-center print:hidden">
                                {tx.saleId && (
                                  <button
                                    onClick={() => {
                                      if (isExpanded) setExpandedTxId(null);
                                      else {
                                        setExpandedTxId(tx.id);
                                        loadSaleDetails(tx.saleId, tx.id);
                                      }
                                    }}
                                    className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                                  >
                                    <ArrowDownRight className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} className="px-8 py-6 bg-slate-50/50 border-y border-slate-100">
                                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-slideDown">
                                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                                      <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">SATIŞ DETAYLARI</h5>
                                      <span className="text-[10px] font-bold text-slate-400 italic">Fiş No: {tx.saleId}</span>
                                    </div>
                                    {isDetailLoading === tx.id && !details ? (
                                      <div className="p-8 text-center">
                                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin inline-block"></div>
                                      </div>
                                    ) : details ? (
                                      <div className="p-4">
                                        <table className="w-full text-left text-xs mb-4">
                                          <thead>
                                            <tr className="text-slate-400 font-bold border-b border-slate-100">
                                              <th className="px-3 py-2">Ürün Adı</th>
                                              <th className="px-3 py-2 text-center">Adet</th>
                                              <th className="px-3 py-2 text-right">Fiyat</th>
                                              <th className="px-3 py-2 text-right">Toplam</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-50">
                                            {details.items?.map((item: any, idx: number) => {
                                              const itPrice = Number(item.price || 0);
                                              const itQty = Number(item.quantity || 1);
                                              const itDiscount = Number(item.discount || 0);
                                              const itTotal = (itPrice * itQty) - itDiscount;
                                              return (
                                                <tr key={idx}>
                                                  <td className="px-3 py-3 font-bold text-slate-700">
                                                    {item.name}
                                                    {itDiscount > 0 && (
                                                      <span className="block text-[10px] text-red-600 font-semibold">
                                                        (İskonto: -{itDiscount.toLocaleString('tr-TR')} ₺)
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-3 text-center text-slate-500">{itQty}</td>
                                                  <td className="px-3 py-3 text-right text-slate-500">{itPrice.toLocaleString('tr-TR')} ₺</td>
                                                  <td className="px-3 py-3 text-right font-black text-slate-900">{itTotal.toLocaleString('tr-TR')} ₺</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                        {(() => {
                                          const items = details.items || [];
                                          const itemDiscountsSum = items.reduce((sum: number, it: any) => sum + Number(it.discount || 0), 0);
                                          const saleDiscount = Number(details.discount ?? details.totalDiscount ?? itemDiscountsSum);
                                          const itemsSum = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
                                          const saleTotal = Number(details.total || tx.amount || 0);
                                          const rawSubtotal = itemsSum > 0 ? itemsSum : (saleTotal + saleDiscount);
                                          const taxAmount = Number(details.taxAmount || 0);

                                          return (
                                            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100 px-3">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => handlePrintSale(tx, details)}
                                                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                  title="Bu Satışı Yazdır"
                                                >
                                                  <Printer className="w-3.5 h-3.5" />
                                                  <span>Yazdır</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => generateSaleInvoicePDF(customer, tx, details, "open")}
                                                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                  title="Bu Satışın PDF Faturasını Aç"
                                                >
                                                  <ExternalLink className="w-3.5 h-3.5" />
                                                  <span>PDF Aç</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => generateSaleInvoicePDF(customer, tx, details, "download")}
                                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                  title="Bu Satışın PDF Faturasını İndir"
                                                >
                                                  <Download className="w-3.5 h-3.5" />
                                                  <span>PDF İndir</span>
                                                </button>
                                                {customer.phone && (
                                                  <button
                                                    type="button"
                                                    onClick={() => shareSaleOnWhatsApp(customer, tx, details)}
                                                    className="px-3.5 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                    title="Müşteriye WhatsApp'tan Fiş Gönder"
                                                  >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    <span>PDF / Fiş Gönder</span>
                                                  </button>
                                                )}
                                              </div>
                                              <div className="w-full sm:w-64 bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1.5">
                                                <div className="flex justify-between text-slate-500 font-bold">
                                                  <span>Ara Toplam:</span>
                                                  <span>{rawSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                {saleDiscount > 0 && (
                                                  <div className="flex justify-between text-red-600 font-black">
                                                    <span>İskonto:</span>
                                                    <span>-{saleDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                  </div>
                                                )}
                                                {taxAmount > 0 && (
                                                  <div className="flex justify-between text-slate-500 font-bold">
                                                    <span>KDV (%10):</span>
                                                    <span>{taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                  </div>
                                                )}
                                                <div className="flex justify-between pt-1.5 border-t border-slate-200 font-black text-slate-900 text-sm">
                                                  <span>Genel Toplam:</span>
                                                  <span>{saleTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                                </div>
                                                {(() => {
                                                  const newBal = Number(tx.balanceAfter !== undefined ? tx.balanceAfter : customer.debt || 0);
                                                  let prevBal = 0;
                                                  if (tx.previousBalance !== undefined) {
                                                    prevBal = Number(tx.previousBalance);
                                                  } else if (tx.type === 'DEBT') {
                                                    prevBal = newBal - saleTotal;
                                                  } else if (tx.type === 'PAYMENT') {
                                                    prevBal = newBal + saleTotal;
                                                  } else {
                                                    prevBal = newBal;
                                                  }
                                                  if (Math.abs(prevBal) < 0.001) prevBal = 0;

                                                  return (
                                                    <div className="mt-2 pt-2 border-t border-dashed border-slate-200 text-[11px] space-y-1">
                                                      <div className="flex justify-between text-slate-500 font-semibold">
                                                        <span>Eski Bakiye:</span>
                                                        <span className="font-bold text-slate-800">{prevBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                      </div>
                                                      <div className="flex justify-between text-slate-700 font-bold">
                                                        <span>Güncel Kalan Borç:</span>
                                                        <span className="font-black text-red-600">{newBal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    ) : (
                                      <div className="p-8 text-center text-slate-400 italic text-xs">Kayıt detayı bulunamadı.</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer Area UI */}
        <div className="p-6 sm:p-8 border-t border-slate-100 bg-white/50 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
              <span>Sistem Aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
              <span>Güvenli Bağlantı</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-8 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-sm font-black transition-all hover:bg-slate-50 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Yazdır
            </button>
            <button
              onClick={onClose}
              className="px-10 py-3 bg-slate-900 text-white rounded-2xl text-sm font-black transition-all hover:bg-slate-800 shadow-xl shadow-slate-200"
            >
              Kapat
            </button>
          </div>
        </div>

        {/* Dedicated Single Sale A4 Print Invoice Template */}
        {printingSale && (
          <div id="single-sale-print-template" className="hidden p-8 bg-white text-black font-sans">
            <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">SATIŞ BİLGİ FATURASI</h1>
                <p className="text-xs text-indigo-600 font-black tracking-widest uppercase mt-0.5">BULUT POS & STOK YÖNETİMİ</p>
                <p className="text-[10px] text-slate-400 mt-1">Mali değeri yoktur, bilgi fişidir.</p>
              </div>
              <div className="text-right text-xs text-slate-700 space-y-1">
                <p><span className="font-bold">Fiş No:</span> {printingSale.tx.saleId || printingSale.tx.id}</p>
                <p><span className="font-bold">Tarih:</span> {format(printingSale.tx.date?.toDate ? printingSale.tx.date.toDate() : (printingSale.tx.date ? new Date(printingSale.tx.date) : new Date()), "dd.MM.yyyy HH:mm")}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="border border-slate-300 rounded-2xl p-4 bg-slate-50/60">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">MÜŞTERİ BİLGİLERİ</h3>
                <p className="font-black text-sm text-slate-900">{customer.name}</p>
                <p className="text-xs text-slate-600 mt-1"><span className="font-bold">Telefon:</span> {customer.phone || "Kayıtlı Değil"}</p>
                <p className="text-xs text-slate-600 mt-1"><span className="font-bold">Adres:</span> {customer.address || "Adres Belirtilmemiş"}</p>
              </div>
              <div className="border border-slate-300 rounded-2xl p-4 bg-slate-50/60">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">SATIŞ & BAKİYE ÖZETİ</h3>
                {(() => {
                  const saleAmt = Number(printingSale.details?.total || printingSale.tx.amount || 0);
                  const newBal = Number(printingSale.tx.balanceAfter !== undefined ? printingSale.tx.balanceAfter : customer.debt || 0);
                  let prevBal = 0;
                  if (printingSale.tx.previousBalance !== undefined) {
                    prevBal = Number(printingSale.tx.previousBalance);
                  } else if (printingSale.tx.type === 'DEBT') {
                    prevBal = newBal - saleAmt;
                  } else if (printingSale.tx.type === 'PAYMENT') {
                    prevBal = newBal + saleAmt;
                  } else {
                    prevBal = newBal;
                  }
                  if (Math.abs(prevBal) < 0.001) prevBal = 0;

                  return (
                    <div className="space-y-1 text-xs text-slate-700">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Ödeme Şekli:</span>
                        <span className="font-bold text-slate-900">{printingSale.tx.paymentMethod || "Nakit"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Eski Bakiye:</span>
                        <span className="font-bold text-slate-900">{prevBal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Satış Tutarı:</span>
                        <span className="font-bold text-slate-900">+{saleAmt.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                      <div className="mt-1 pt-1 border-t border-slate-200 flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">Güncel Kalan Borç:</span>
                        <span className="font-black text-red-600 text-sm">{newBal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <table className="w-full text-left text-xs mb-6 border border-slate-300">
              <thead className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-2.5 text-center w-12 border-r border-slate-700">#</th>
                  <th className="p-2.5 border-r border-slate-700">Ürün Adı</th>
                  <th className="p-2.5 text-center w-20 border-r border-slate-700">Adet</th>
                  <th className="p-2.5 text-right w-28 border-r border-slate-700">Fiyat</th>
                  <th className="p-2.5 text-right w-32">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {printingSale.details?.items && printingSale.details.items.length > 0 ? (
                  printingSale.details.items.map((it: any, idx: number) => {
                    const itPrice = Number(it.price || 0);
                    const itQty = Number(it.quantity || 1);
                    const itDiscount = Number(it.discount || 0);
                    const itTotal = (itPrice * itQty) - itDiscount;
                    return (
                      <tr key={idx}>
                        <td className="p-2.5 text-center text-slate-500 border-r border-slate-200">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-800 border-r border-slate-200">
                          {it.name}
                          {itDiscount > 0 && (
                            <span className="block text-[10px] text-red-600 font-semibold">
                              (İskonto: -{itDiscount.toLocaleString("tr-TR")} ₺)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center border-r border-slate-200">{itQty}</td>
                        <td className="p-2.5 text-right border-r border-slate-200">{itPrice.toLocaleString("tr-TR")} ₺</td>
                        <td className="p-2.5 text-right font-black">{itTotal.toLocaleString("tr-TR")} ₺</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="p-2.5 text-center text-slate-500 border-r border-slate-200">1</td>
                    <td className="p-2.5 font-bold text-slate-800 border-r border-slate-200">{printingSale.tx.title || "Satış"}</td>
                    <td className="p-2.5 text-center border-r border-slate-200">1</td>
                    <td className="p-2.5 text-right border-r border-slate-200">{Number(printingSale.tx.amount || 0).toLocaleString("tr-TR")} ₺</td>
                    <td className="p-2.5 text-right font-black">{Number(printingSale.tx.amount || 0).toLocaleString("tr-TR")} ₺</td>
                  </tr>
                )}
              </tbody>
            </table>

            {(() => {
              const items = printingSale.details?.items || [];
              const itemDiscountsSum = items.reduce((sum: number, it: any) => sum + Number(it.discount || 0), 0);
              const saleDiscount = Number(printingSale.details?.discount ?? printingSale.details?.totalDiscount ?? itemDiscountsSum);
              const itemsSum = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
              const saleTotal = Number(printingSale.details?.total || printingSale.tx.amount || 0);
              const rawSubtotal = itemsSum > 0 ? itemsSum : (saleTotal + saleDiscount);
              const taxAmount = Number(printingSale.details?.taxAmount || 0);

              return (
                <div className="flex justify-end mb-8">
                  <div className="w-80 border border-slate-300 rounded-2xl p-4 bg-slate-50/80 text-xs space-y-2">
                    <div className="flex justify-between text-slate-600 font-medium">
                      <span>Ara Toplam:</span>
                      <span>{rawSubtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                    </div>
                    {saleDiscount > 0 && (
                      <div className="flex justify-between text-red-600 font-bold">
                        <span>İskonto:</span>
                        <span>-{saleDiscount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                      </div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-slate-600 font-medium">
                        <span>KDV (%10):</span>
                        <span>{taxAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-300 font-black text-sm text-slate-900">
                      <span>Genel Toplam:</span>
                      <span>{saleTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-12 pt-8 border-t border-slate-300 text-xs text-slate-600">
              <div className="text-center">
                <p className="font-bold mb-12">Teslim Eden (Firma / Kaşe)</p>
                <div className="w-48 mx-auto border-b border-slate-400"></div>
              </div>
              <div className="text-center">
                <p className="font-bold mb-12">Teslim Alan (Müşteri)</p>
                <div className="w-48 mx-auto border-b border-slate-400"></div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
