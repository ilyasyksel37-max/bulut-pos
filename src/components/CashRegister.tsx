import React, { useState, useEffect } from 'react';
import { 
  Landmark, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCcw, 
  Plus, 
  Minus, 
  ArrowRightLeft, 
  Search, 
  Calendar, 
  Filter, 
  FileText, 
  Download, 
  Printer, 
  DollarSign, 
  Euro, 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  CurrencyType, 
  CashRegisterData, 
  CashTransaction, 
  initCashRegisters, 
  recordCashMovement, 
  transferBetweenRegisters 
} from '../lib/kasa-utils';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

export const CashRegister: React.FC = () => {
  const { user, isDemo, checkDemoRestricted } = useAuth();
  
  const [registers, setRegisters] = useState<Record<CurrencyType, CashRegisterData>>({
    TRY: { id: 'TRY', currency: 'TRY', name: 'Türk Lirası Kasası', symbol: '₺', balance: 0 },
    USD: { id: 'USD', currency: 'USD', name: 'Dolar Kasası', symbol: '$', balance: 0 },
    EUR: { id: 'EUR', currency: 'EUR', name: 'Euro Kasası', symbol: '€', balance: 0 }
  });
  
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurrencyFilter, setSelectedCurrencyFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Exchange rates for estimated net worth in TL
  const [rates, setRates] = useState({
    USD: Number(localStorage.getItem('sep_rate_usd') || '38.50'),
    EUR: Number(localStorage.getItem('sep_rate_eur') || '41.20')
  });

  // Modal states
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [selectedTargetReg, setSelectedTargetReg] = useState<CurrencyType>('TRY');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementCategory, setMovementCategory] = useState<string>('MANUAL_IN');
  const [movementDesc, setMovementDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transfer modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState<CurrencyType>('USD');
  const [transferTo, setTransferTo] = useState<CurrencyType>('TRY');
  const [transferFromAmount, setTransferFromAmount] = useState('');
  const [transferRate, setTransferRate] = useState(rates.USD.toString());
  const [transferNotes, setTransferNotes] = useState('');

  useEffect(() => {
    initCashRegisters();

    // Listen to registers
    const unsubRegs = onSnapshot(collection(db, 'cash_registers'), (snap) => {
      const regMap: any = {};
      snap.docs.forEach(doc => {
        regMap[doc.id] = doc.data();
      });
      setRegisters(prev => ({
        ...prev,
        ...regMap
      }));
    });

    // Listen to cash transactions
    const q = query(collection(db, 'cash_transactions'), orderBy('date', 'desc'), limit(150));
    const unsubTx = onSnapshot(q, (snap) => {
      const txs = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CashTransaction[];
      setTransactions(txs);
      setLoading(false);
    });

    return () => {
      unsubRegs();
      unsubTx();
    };
  }, []);

  const handleOpenMovementModal = (type: 'IN' | 'OUT', defaultCurrency: CurrencyType = 'TRY') => {
    if (checkDemoRestricted("Kasa para işlemi")) return;
    setMovementType(type);
    setSelectedTargetReg(defaultCurrency);
    setMovementCategory(type === 'IN' ? 'MANUAL_IN' : 'EXPENSE');
    setMovementAmount('');
    setMovementDesc('');
    setIsMovementModalOpen(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkDemoRestricted("Kasa hareketi ekleme")) return;

    const amt = parseFloat(movementAmount.replace(',', '.'));
    if (!amt || amt <= 0) {
      alert("Lütfen geçerli bir tutar girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordCashMovement({
        currency: selectedTargetReg,
        type: movementType,
        amount: amt,
        category: movementCategory as any,
        description: movementDesc.trim() || (movementType === 'IN' ? 'Kasa Girişi' : 'Kasa Çıkışı'),
        sellerCode: user?.sellerCode || 'GENEL',
        sellerName: user?.displayName || user?.email || 'Yetkili'
      });
      setIsMovementModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Kasa hareketi kaydedilirken hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenTransfer = () => {
    if (checkDemoRestricted("Kasa transferi")) return;
    setTransferFrom('USD');
    setTransferTo('TRY');
    setTransferFromAmount('');
    setTransferRate(rates.USD.toString());
    setTransferNotes('');
    setIsTransferModalOpen(true);
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkDemoRestricted("Döviz transferi")) return;

    const fromAmt = parseFloat(transferFromAmount.replace(',', '.'));
    const rate = parseFloat(transferRate.replace(',', '.'));
    if (!fromAmt || fromAmt <= 0 || !rate || rate <= 0) {
      alert("Lütfen geçerli bir tutar ve kur girin.");
      return;
    }

    if (transferFrom === transferTo) {
      alert("Kaynak ve hedef kasa aynı olamaz.");
      return;
    }

    // Calculate toAmount based on currencies
    let toAmt = 0;
    if (transferFrom !== 'TRY' && transferTo === 'TRY') {
      toAmt = fromAmt * rate;
    } else if (transferFrom === 'TRY' && transferTo !== 'TRY') {
      toAmt = fromAmt / rate;
    } else {
      toAmt = fromAmt * rate;
    }

    setIsSubmitting(true);
    try {
      await transferBetweenRegisters({
        fromCurrency: transferFrom,
        toCurrency: transferTo,
        fromAmount: fromAmt,
        toAmount: Number(toAmt.toFixed(2)),
        exchangeRate: rate,
        sellerCode: user?.sellerCode || 'GENEL',
        sellerName: user?.displayName || 'Yetkili',
        notes: transferNotes.trim()
      });
      setIsTransferModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Transfer sırasında hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculations
  const tryBal = registers.TRY?.balance || 0;
  const usdBal = registers.USD?.balance || 0;
  const eurBal = registers.EUR?.balance || 0;

  const usdInTRY = usdBal * rates.USD;
  const eurInTRY = eurBal * rates.EUR;
  const totalNetWorthTRY = tryBal + usdInTRY + eurInTRY;

  const filteredTransactions = transactions.filter(t => {
    const matchesCurrency = selectedCurrencyFilter === 'ALL' || t.currency === selectedCurrencyFilter;
    const matchesSearch = searchTerm === '' || 
      t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.sellerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.sellerCode?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCurrency && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 lg:pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Kasa Yönetimi</h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">TL, Dolar ($) ve Euro (€) Kasaları ve Canlı Hareketler</p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenMovementModal('IN')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Para Girişi</span>
          </button>

          <button
            onClick={() => handleOpenMovementModal('OUT')}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-lg shadow-rose-600/20 active:scale-95"
          >
            <Minus className="w-4 h-4" />
            <span>Para Çıkışı / Harcama</span>
          </button>

          <button
            onClick={handleOpenTransfer}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Döviz Bozma / Virman</span>
          </button>
        </div>
      </div>

      {/* 3 Main Currency Register Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* 1. TL KASASI */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden border border-slate-700/50">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-black text-amber-400 text-sm">
                ₺
              </div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider text-slate-200">TL Kasası</h3>
                <p className="text-[10px] text-slate-400 font-bold">Nakit Türk Lirası</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
              Canlı
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Kasa Mevcudu</p>
            <p className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {tryBal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-bold text-amber-400">₺</span>
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
            <button
              onClick={() => handleOpenMovementModal('IN', 'TRY')}
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Giriş Yap
            </button>
            <button
              onClick={() => handleOpenMovementModal('OUT', 'TRY')}
              className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 hover:underline"
            >
              <Minus className="w-3.5 h-3.5" /> Çıkış Yap
            </button>
          </div>
        </div>

        {/* 2. DOLAR KASASI (USD) */}
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden border border-emerald-700/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center font-black text-emerald-400 text-sm">
                $
              </div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider text-slate-200">Dolar Kasası (USD)</h3>
                <p className="text-[10px] text-emerald-400 font-bold">1 USD ≈ {rates.USD.toFixed(2)} ₺</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
              USD
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-bold text-emerald-300/70 uppercase tracking-widest">Kasa Mevcudu</p>
            <p className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {usdBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-bold text-emerald-400">$</span>
            </p>
            <p className="text-xs font-bold text-emerald-400/90 pt-0.5">
              ≈ {usdInTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
            <button
              onClick={() => handleOpenMovementModal('IN', 'USD')}
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Dolar Girişi
            </button>
            <button
              onClick={() => handleOpenMovementModal('OUT', 'USD')}
              className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 hover:underline"
            >
              <Minus className="w-3.5 h-3.5" /> Dolar Çıkışı
            </button>
          </div>
        </div>

        {/* 3. EURO KASASI (EUR) */}
        <div className="bg-gradient-to-br from-blue-950 via-slate-900 to-indigo-950 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden border border-blue-700/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center font-black text-blue-400 text-sm">
                €
              </div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider text-slate-200">Euro Kasası (EUR)</h3>
                <p className="text-[10px] text-blue-400 font-bold">1 EUR ≈ {rates.EUR.toFixed(2)} ₺</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
              EUR
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-bold text-blue-300/70 uppercase tracking-widest">Kasa Mevcudu</p>
            <p className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {eurBal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-bold text-blue-400">€</span>
            </p>
            <p className="text-xs font-bold text-blue-400/90 pt-0.5">
              ≈ {eurInTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
            <button
              onClick={() => handleOpenMovementModal('IN', 'EUR')}
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Euro Girişi
            </button>
            <button
              onClick={() => handleOpenMovementModal('OUT', 'EUR')}
              className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 hover:underline"
            >
              <Minus className="w-3.5 h-3.5" /> Euro Çıkışı
            </button>
          </div>
        </div>
      </div>

      {/* Total Net Worth Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-black text-sm text-slate-800 uppercase tracking-tight">Toplam Kasa Varlığı (TL Karşılığı)</h4>
            <p className="text-xs text-slate-500 font-medium">TL + USD + EUR kasalarının güncel kurlara göre toplam değeri</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Genel Toplam</p>
            <p className="text-2xl font-black text-indigo-700">
              {totalNetWorthTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
            </p>
          </div>
          <div className="flex items-center gap-2 pl-4 border-l border-slate-200 text-xs text-slate-500">
            <div className="flex flex-col text-[11px]">
              <span>USD Kuru: <strong className="text-slate-800">{rates.USD.toFixed(2)} ₺</strong></span>
              <span>EUR Kuru: <strong className="text-slate-800">{rates.EUR.toFixed(2)} ₺</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History Section */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Controls & Filter Bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedCurrencyFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                selectedCurrencyFilter === 'ALL' 
                  ? 'bg-slate-900 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tüm Kasalar ({transactions.length})
            </button>
            <button
              onClick={() => setSelectedCurrencyFilter('TRY')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                selectedCurrencyFilter === 'TRY' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ₺ TL Kasası
            </button>
            <button
              onClick={() => setSelectedCurrencyFilter('USD')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                selectedCurrencyFilter === 'USD' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              $ Dolar Kasası
            </button>
            <button
              onClick={() => setSelectedCurrencyFilter('EUR')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                selectedCurrencyFilter === 'EUR' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              € Euro Kasası
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Kasa hareketlerinde ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5">Tarih / Saat</th>
                <th className="px-5 py-3.5">Kasa</th>
                <th className="px-5 py-3.5 text-center">İşlem</th>
                <th className="px-5 py-3.5">Kategori & Açıklama</th>
                <th className="px-5 py-3.5">Eleman / Kasiyer</th>
                <th className="px-5 py-3.5 text-right">Tutar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    Kasa hareketleri yükleniyor...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400 italic">
                    Henüz kasa hareketi bulunmuyor.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isIncoming = tx.type === 'IN';
                  const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
                  const symbol = tx.currency === 'USD' ? '$' : tx.currency === 'EUR' ? '€' : '₺';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 font-bold">
                        <div>{format(txDate, 'dd.MM.yyyy')}</div>
                        <div className="text-[10px] text-slate-400">{format(txDate, 'HH:mm')}</div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                          tx.currency === 'USD' ? 'bg-emerald-100 text-emerald-800' :
                          tx.currency === 'EUR' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {tx.currency} Kasası
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          isIncoming 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isIncoming ? <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> : <ArrowUpRight className="w-3 h-3 text-rose-600" />}
                          {isIncoming ? 'Giriş' : 'Çıkış'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-800">{tx.description}</p>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">
                          {tx.category === 'SALE' ? 'Satış Tahsilatı' :
                           tx.category === 'COLLECTION' ? 'Veresiye Tahsilatı' :
                           tx.category === 'EXPENSE' ? 'Gider / Harcama' :
                           tx.category === 'TRANSFER' ? 'Döviz Virman' : 'Nakit Giriş/Çıkış'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 font-semibold">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold mr-1.5">
                          {tx.sellerCode || 'GENEL'}
                        </span>
                        {tx.sellerName || 'Personel'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-black text-sm">
                        <span className={isIncoming ? 'text-emerald-600' : 'text-rose-600'}>
                          {isIncoming ? '+' : '-'}{Number(tx.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {symbol}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Modal (Para Giriş / Çıkış) */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 animate-slideUp">
            <div className={`p-5 text-white ${movementType === 'IN' ? 'bg-emerald-600' : 'bg-rose-600'} flex items-center justify-between`}>
              <div>
                <h3 className="font-black text-base uppercase tracking-tight">
                  {movementType === 'IN' ? 'Kasaya Para Girişi' : 'Kasadan Para Çıkışı / Masraf'}
                </h3>
                <p className="text-xs text-white/80">Kasa mevcudunu günceller ve kayda alır</p>
              </div>
              <button 
                onClick={() => setIsMovementModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="p-6 space-y-4">
              {/* Currency Target */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">İşlem Yapılacak Kasa</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['TRY', 'USD', 'EUR'] as CurrencyType[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedTargetReg(c)}
                      className={`py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                        selectedTargetReg === c 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' 
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {c === 'TRY' ? '₺ TL' : c === 'USD' ? '$ Dolar' : '€ Euro'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">Tutar</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    required
                    autoFocus
                    placeholder="0.00"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-400">
                    {selectedTargetReg === 'USD' ? '$' : selectedTargetReg === 'EUR' ? '€' : '₺'}
                  </span>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">İşlem Kategorisi</label>
                <select
                  value={movementCategory}
                  onChange={(e) => setMovementCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {movementType === 'IN' ? (
                    <>
                      <option value="MANUAL_IN">Nakit Devir / Açılış</option>
                      <option value="COLLECTION">Nakit Tahsilat</option>
                      <option value="CAPITAL">Ek Sermaye Girişi</option>
                      <option value="OTHER">Diğer Giriş</option>
                    </>
                  ) : (
                    <>
                      <option value="EXPENSE">Dükkan Masrafı / Gider</option>
                      <option value="BANK_DEPOSIT">Bankaya Yatırma</option>
                      <option value="OWNER_DRAW">Ortak / Patron Çekimi</option>
                      <option value="SUPPLIER">Tedarikçi Nakit Ödeme</option>
                      <option value="OTHER">Diğer Çıkış</option>
                    </>
                  )}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">Açıklama</label>
                <input
                  type="text"
                  placeholder="İşlem açıklaması girin..."
                  value={movementDesc}
                  onChange={(e) => setMovementDesc(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-5 py-2.5 ${movementType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'} text-white rounded-xl text-xs font-black shadow-lg transition-all active:scale-95`}
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Currency Transfer Modal (Döviz Bozma / Virman) */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 animate-slideUp">
            <div className="p-5 text-white bg-indigo-600 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base uppercase tracking-tight">Döviz Bozma & Kasa Virman</h3>
                <p className="text-xs text-indigo-100">Dolar veya Euro'yu TL kasasına aktarır</p>
              </div>
              <button 
                onClick={() => setIsTransferModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1">Kaynak Kasa (Çıkış)</label>
                  <select
                    value={transferFrom}
                    onChange={(e) => {
                      const val = e.target.value as CurrencyType;
                      setTransferFrom(val);
                      if (val === 'USD') setTransferRate(rates.USD.toString());
                      if (val === 'EUR') setTransferRate(rates.EUR.toString());
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="USD">$ Dolar Kasası</option>
                    <option value="EUR">€ Euro Kasası</option>
                    <option value="TRY">₺ TL Kasası</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1">Hedef Kasa (Giriş)</label>
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value as CurrencyType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="TRY">₺ TL Kasası</option>
                    <option value="USD">$ Dolar Kasası</option>
                    <option value="EUR">€ Euro Kasası</option>
                  </select>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">
                  Çıkacak Tutar ({transferFrom})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={transferFromAmount}
                  onChange={(e) => setTransferFromAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Exchange Rate */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">
                  Döviz Kuru (1 {transferFrom} = ? TL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={transferRate}
                  onChange={(e) => setTransferRate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Preview */}
              {(() => {
                const amt = parseFloat(transferFromAmount) || 0;
                const r = parseFloat(transferRate) || 0;
                const calculatedTo = (amt * r).toFixed(2);
                return (
                  <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-xs">
                    <p className="text-indigo-900 font-bold">
                      Aktarılacak Tutar: <strong className="text-indigo-700 text-sm font-black">{calculatedTo} ₺</strong>
                    </p>
                    <p className="text-[11px] text-indigo-600 mt-0.5">
                      {transferFrom} kasasından {amt} düşecek, {transferTo} kasasına {calculatedTo} eklenecektir.
                    </p>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5">Not / Açıklama</label>
                <input
                  type="text"
                  placeholder="Örn: Kapalıçarşı döviz bozduruldu"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg transition-all"
                >
                  {isSubmitting ? 'Aktarılıyor...' : 'Aktarımı Onayla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default CashRegister;
