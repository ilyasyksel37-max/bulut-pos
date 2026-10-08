import React, { useState, useEffect } from 'react';
import { 
  X, Receipt, ArrowDownRight, ArrowUpRight, Plus, 
  Calendar, Phone, CreditCard, AlertCircle, Printer, FileText, Trash2, 
  ShoppingBag, CheckCircle2, Building2, MessageCircle 
} from 'lucide-react';
import { 
  collection, query, where, getDocs, addDoc, 
  updateDoc, doc, increment, serverTimestamp, orderBy, limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SupplierData } from './SupplierModal';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { generateSupplierPDF, shareOnWhatsApp } from '../../lib/statement-utils';

interface SupplierLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: SupplierData | null;
  onSupplierUpdated: () => void;
}

export const SupplierLedgerModal: React.FC<SupplierLedgerModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onSupplierUpdated,
}) => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState<'PURCHASE' | 'PAYMENT'>('PURCHASE');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [purchaseQty, setPurchaseQty] = useState<string>('0');
  const [products, setProducts] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const [activeTab, setActiveTab] = useState<'ekstre' | 'products'>('ekstre');
  const [dateFilter, setDateFilter] = useState({
    start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const fetchProducts = async () => {
      const snap = await getDocs(collection(db, 'products'));
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!isOpen || !supplier?.id) return;
    loadTransactions();
  }, [isOpen, supplier?.id, dateFilter]);

  const loadTransactions = async () => {
    if (!supplier?.id) return;
    setLoading(true);
    try {
      const startDate = new Date(dateFilter.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateFilter.end);
      endDate.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'supplier_transactions'),
        where('supplierId', '==', supplier.id),
        orderBy('date', 'desc'),
        limit(100)
      );
      const snap = await getDocs(q);
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      list = list.filter((t: any) => {
        const d = t.date?.toDate ? t.date.toDate() : (t.date ? new Date(t.date) : new Date());
        return d >= startDate && d <= endDate;
      });

      setTransactions(list);
    } catch (err) {
      console.error("Supplier ledger load error:", err);
      try {
        const qFallback = query(collection(db, 'supplier_transactions'), where('supplierId', '==', supplier.id));
        const snap = await getDocs(qFallback);
        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

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

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (!amountNum || amountNum <= 0) return;

    setIsSubmitting(true);
    try {
      const balanceChange = type === 'PURCHASE' ? amountNum : -amountNum;
      const qtyNum = parseInt(purchaseQty) || 0;
      
      const supplierDoc = doc(db, 'suppliers', supplier!.id!);
      const currentBalance = Number(supplier!.balance || 0);
      const newBalance = currentBalance + balanceChange;

      await addDoc(collection(db, 'supplier_transactions'), {
        supplierId: supplier!.id,
        supplierName: supplier!.name,
        type,
        productId: type === 'PURCHASE' ? selectedProductId : null,
        quantity: type === 'PURCHASE' ? qtyNum : null,
        title: note.trim() || (type === 'PURCHASE' ? 'Mal Alımı' : 'Tedarikçi Ödemesi'),
        amount: amountNum,
        balanceAfter: newBalance,
        date: serverTimestamp(),
      });

      if (type === 'PURCHASE' && selectedProductId && qtyNum > 0) {
        await updateDoc(doc(db, 'products', selectedProductId), {
          stock: increment(qtyNum),
          updatedAt: serverTimestamp()
        });
      }

      await updateDoc(supplierDoc, {
        balance: increment(balanceChange),
        updatedAt: serverTimestamp(),
      });

      setAmount('');
      setNote('');
      setSelectedProductId('');
      setPurchaseQty('0');
      setShowAddTransaction(false);
      await loadTransactions();
      onSupplierUpdated();
    } catch (err) {
      console.error(err);
      alert("İşlem kaydedilirken hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 50);
  };

  if (!isOpen || !supplier) return null;

  const handleDownloadPDF = () => {
    generateSupplierPDF(supplier, transactions, products);
  };

  const handleShareWhatsApp = () => {
    if (!supplier.phone) {
      alert("Tedarikçinin telefon numarası kayıtlı değil.");
      return;
    }
    shareOnWhatsApp(supplier.name, supplier.phone, Number(supplier.balance || 0), transactions, 'supplier', products);
  };

  const totalPurchaseAmount = transactions
    .filter(t => t.type === 'PURCHASE')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalPaymentAmount = transactions
    .filter(t => t.type === 'PAYMENT')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const currentBalance = Number(supplier.balance || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-50 rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-white/25 flex flex-col print:h-auto print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none print:text-black print-area">
        
        {/* Header UI */}
        <div className="p-6 sm:p-8 border-b border-white/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 bg-white/40 backdrop-blur-sm print:hidden">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[2rem] bg-amber-500 text-white flex items-center justify-center shadow-xl shadow-amber-100 -rotate-3">
              <Building2 className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-black text-2xl sm:text-3xl text-slate-900 tracking-tighter">
                  {supplier.name}
                </h3>
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700">
                  Tedarikçi
                </span>
              </div>
              <p className="text-sm text-slate-500 font-bold flex items-center gap-2 mt-1">
                <Phone className="w-4 h-4 text-slate-400" />
                {supplier.phone || 'Telefon Kayıtlı Değil'}
                <span className="text-slate-300 mx-1">•</span>
                <Calendar className="w-4 h-4 text-slate-400" />
                Son İşlem: {transactions[0]?.date?.toDate ? format(transactions[0].date.toDate(), 'dd MMM yyyy', { locale: tr }) : '-'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <button
              onClick={handleShareWhatsApp}
              className="px-5 py-3 rounded-2xl bg-[#25D366] hover:bg-[#128C7E] text-white text-sm font-black flex items-center gap-2.5 transition-all shadow-lg shadow-emerald-100"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              className="px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black flex items-center gap-2.5 transition-all shadow-lg shadow-amber-100"
            >
              <FileText className="w-4 h-4" />
              <span>PDF Ekstre</span>
            </button>
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-50 transition-all"
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
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Toplam Alım</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{totalPurchaseAmount.toLocaleString('tr-TR')} ₺</p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Toplam Ödeme</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{totalPaymentAmount.toLocaleString('tr-TR')} ₺</p>
          </div>

          <div className="p-5 rounded-3xl border bg-slate-900 text-white shadow-xl shadow-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-white/50 uppercase tracking-widest">Güncel Borcumuz</span>
            </div>
            <p className="text-2xl font-black">{currentBalance.toLocaleString('tr-TR')} ₺</p>
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

          <div className="flex items-center gap-3 w-full lg:w-auto">
            <button
              onClick={() => { setType('PURCHASE'); setShowAddTransaction(true); }}
              className="flex-1 lg:flex-none px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Mal Alımı
            </button>
            <button
              onClick={() => { setType('PAYMENT'); setShowAddTransaction(true); }}
              className="flex-1 lg:flex-none px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
            >
              <ArrowDownRight className="w-4 h-4" />
              Ödeme Yap
            </button>
          </div>
        </div>

        {/* Add Transaction Form */}
        {showAddTransaction && (
          <div className="mx-6 sm:mx-8 mt-4 animate-slideDown print:hidden">
            <form onSubmit={handleAddTransaction} className={`p-6 rounded-3xl border flex flex-col gap-4 ${
              type === 'PURCHASE' ? 'bg-blue-50 border-blue-100' : 'bg-emerald-50 border-emerald-100'
            }`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">İşlem Tutarı</label>
                  <div className="relative">
                    <input
                      required type="number" step="0.01" placeholder="0.00"
                      className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={amount} onChange={(e) => setAmount(e.target.value)}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₺</span>
                  </div>
                </div>

                {type === 'PURCHASE' && (
                  <>
                    <div className="lg:col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Ürün Seçimi (Opsiyonel)</label>
                      <select
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                      >
                        <option value="">Sadece Borç Girişi</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.stock} {p.unit || 'Adet'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Miktar</label>
                      <input
                        type="number" placeholder="0"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className={type === 'PAYMENT' ? 'lg:col-span-3' : 'lg:col-span-4'}>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Açıklama / Not</label>
                  <input
                    type="text" placeholder="İşlem detaylarını buraya yazın..."
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={note} onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddTransaction(false)} className="px-6 py-2.5 text-xs font-black text-slate-500 hover:bg-slate-100 rounded-xl">Vazgeç</button>
                <button type="submit" disabled={isSubmitting} className={`px-10 py-2.5 text-white rounded-xl text-xs font-black shadow-lg ${
                  type === 'PURCHASE' ? 'bg-blue-600 shadow-blue-100' : 'bg-emerald-600 shadow-emerald-100'
                }`}>
                  {isSubmitting ? 'Kaydediliyor...' : 'İşlemi Kaydet'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Transactions Table & Tabs */}
        <div className="p-4 sm:p-8 flex flex-col space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-2 print:hidden">
            <button
              onClick={() => setActiveTab('ekstre')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${
                activeTab === 'ekstre' 
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-100' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              📊 Hesap Ekstresi (Tüm Hareketler)
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${
                activeTab === 'products' 
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-100' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              📦 Alınan Ürünler ({transactions.filter(t => t.productId || (t.type === 'PURCHASE' && Number(t.quantity || 0) > 0)).length})
            </button>
          </div>

          <div className="bg-white rounded-2xl sm:rounded-[2rem] border border-slate-200 flex flex-col h-full overflow-x-auto overflow-y-auto shadow-sm min-h-[300px]">
            {activeTab === 'products' ? (
              <div className="overflow-x-auto min-w-[700px] sm:min-w-full">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tarih</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ürün / Açıklama</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Miktar</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.filter(t => t.productId || (t.type === 'PURCHASE' && Number(t.quantity || 0) > 0)).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-20 text-center text-slate-400 font-bold text-sm">
                          Alınan ürün kaydı bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      transactions
                        .filter(t => t.productId || (t.type === 'PURCHASE' && Number(t.quantity || 0) > 0))
                        .map((tx, idx) => {
                          const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
                          const foundProd = products.find(p => p.id === tx.productId);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                {format(txDate, 'dd.MM.yyyy')}
                              </td>
                              <td className="px-6 py-4 text-xs font-black text-slate-900">
                                {foundProd ? foundProd.name : tx.title}
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-bold text-slate-600">
                                {tx.quantity || 1}
                              </td>
                              <td className="px-6 py-4 text-right text-xs font-black text-slate-900">
                                {Number(tx.amount || 0).toLocaleString('tr-TR')} ₺
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto min-w-[700px] sm:min-w-full">
                <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tarih</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">İşlem</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detay</th>
                    <th className="px-6 py-4 text-[10px] font-black text-red-500 uppercase tracking-widest text-right">Alış (+)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-emerald-500 uppercase tracking-widest text-right">Ödeme (-)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Bakiye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={6} className="py-20 text-center"><div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></td></tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-sm font-black text-slate-400">İşlem kaydı bulunamadı.</p>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => {
                      const isPurchase = tx.type === 'PURCHASE';
                      const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
                      
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-[13px] font-black text-slate-900">{format(txDate, 'dd.MM.yyyy')}</p>
                            <p className="text-[10px] font-bold text-slate-400">{format(txDate, 'HH:mm')}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                              isPurchase ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isPurchase ? 'Alım' : 'Ödeme'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[13px] font-bold text-slate-700 uppercase">{tx.title}</p>
                            {tx.quantity && <p className="text-[10px] font-bold text-slate-400">{tx.quantity} Adet Mal Alımı</p>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="inline-block sm:hidden text-[10px] font-bold text-slate-400 mr-1">Alış:</span>
                            {isPurchase ? (
                              <span className="inline-block text-[13px] font-black text-red-600">+{Number(tx.amount || 0).toLocaleString('tr-TR')} ₺</span>
                            ) : (
                              <span className="inline-block text-[13px] font-bold text-slate-400">0 ₺</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="inline-block sm:hidden text-[10px] font-bold text-slate-400 mr-1">Ödeme:</span>
                            {!isPurchase ? (
                              <span className="inline-block text-[13px] font-black text-emerald-600">-{Number(tx.amount || 0).toLocaleString('tr-TR')} ₺</span>
                            ) : (
                              <span className="inline-block text-[13px] font-bold text-slate-400">0 ₺</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-[13px] font-black text-slate-900">{Number(tx.balanceAfter || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>

        {/* Footer Area UI */}
        <div className="p-6 sm:p-8 border-t border-slate-100 bg-white/50 flex items-center justify-end gap-3 print:hidden">
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
    </div>
  );
};
