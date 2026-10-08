import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Package, AlertTriangle, 
  Calendar, Download, FileSpreadsheet, Printer, 
  CreditCard, Banknote, Receipt, DollarSign, ArrowUpRight, 
  ShoppingBag, Users, Clock, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { 
  format, isToday, isYesterday, subDays, 
  startOfMonth, endOfMonth, subMonths, isWithinInterval 
} from 'date-fns';
import { tr } from 'date-fns/locale';
import * as XLSX from 'xlsx';

type DateFilter = 'today' | 'yesterday' | 'last7' | 'this_month' | 'last_month' | 'all';

const Dashboard: React.FC = () => {
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [loading, setLoading] = useState(true);
  const [salesSearch, setSalesSearch] = useState('');
  const [reportTab, setReportTab] = useState<'sales' | 'top_products' | 'low_stock'>('sales');

  useEffect(() => {
    // Realtime listeners for sales, expenses, products and customers
    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        parsedDate: d.data().date?.toDate ? d.data().date.toDate() : (d.data().date ? new Date(d.data().date) : new Date())
      }));
      setSales(list);
    });

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        parsedDate: d.data().date?.toDate ? d.data().date.toDate() : (d.data().date ? new Date(d.data().date) : new Date())
      }));
      setExpenses(list);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubSales();
      unsubExpenses();
      unsubProducts();
      unsubCustomers();
    };
  }, []);

  // Filter items by selected date range
  const { filteredSales, filteredExpenses } = useMemo(() => {
    const now = new Date();

    const isMatch = (itemDate: Date) => {
      if (dateFilter === 'all') return true;
      if (dateFilter === 'today') return isToday(itemDate);
      if (dateFilter === 'yesterday') return isYesterday(itemDate);
      if (dateFilter === 'last7') return itemDate >= subDays(now, 7);
      if (dateFilter === 'this_month') {
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        return isWithinInterval(itemDate, { start, end });
      }
      if (dateFilter === 'last_month') {
        const lastM = subMonths(now, 1);
        const start = startOfMonth(lastM);
        const end = endOfMonth(lastM);
        return isWithinInterval(itemDate, { start, end });
      }
      return true;
    };

    const s = sales.filter(item => isMatch(item.parsedDate));
    const e = expenses.filter(item => isMatch(item.parsedDate));

    // Sort newest first
    s.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
    e.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());

    return { filteredSales: s, filteredExpenses: e };
  }, [sales, expenses, dateFilter]);

  // Financial metrics
  const totalSalesAmount = filteredSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  
  const totalCostOfGoodsSold = filteredSales.reduce((sum, s) => {
    return sum + (s.items || []).reduce((itemSum: number, item: any) => {
      const pPrice = Number(item.purchasePrice || 0);
      const qty = Number(item.quantity || 1);
      return itemSum + (pPrice * qty);
    }, 0);
  }, 0);

  const netProfit = totalSalesAmount - totalCostOfGoodsSold - totalExpensesAmount;

  const cashSales = filteredSales
    .filter(s => s.paymentMethod === 'cash')
    .reduce((sum, s) => sum + Number(s.total || 0), 0);

  const cardSales = filteredSales
    .filter(s => s.paymentMethod === 'card')
    .reduce((sum, s) => sum + Number(s.total || 0), 0);

  const veresiyeSales = filteredSales
    .filter(s => s.paymentMethod === 'veresiye')
    .reduce((sum, s) => sum + Number(s.total || 0), 0);

  // Total debt receivables from all customers
  const totalReceivables = customers.reduce((sum, c) => sum + Number(c.debt || 0), 0);
  const lowStockProducts = products.filter(p => Number(p.stock || 0) <= Number(p.minStock || 5));

  // Payment methods chart data
  const paymentMethodChartData = useMemo(() => {
    return [
      { name: 'Nakit', value: cashSales, color: '#10b981' },
      { name: 'Kredi Kartı', value: cardSales, color: '#3b82f6' },
      { name: 'Veresiye', value: veresiyeSales, color: '#ef4444' },
    ].filter(i => i.value > 0);
  }, [cashSales, cardSales, veresiyeSales]);

  // Daily trend data for chart
  const dailyTrendData = useMemo(() => {
    const daysMap: { [key: string]: { date: string; sales: number; expenses: number } } = {};

    filteredSales.forEach(s => {
      const dayKey = format(s.parsedDate, 'dd MMM', { locale: tr });
      if (!daysMap[dayKey]) daysMap[dayKey] = { date: dayKey, sales: 0, expenses: 0 };
      daysMap[dayKey].sales += Number(s.total || 0);
    });

    filteredExpenses.forEach(e => {
      const dayKey = format(e.parsedDate, 'dd MMM', { locale: tr });
      if (!daysMap[dayKey]) daysMap[dayKey] = { date: dayKey, sales: 0, expenses: 0 };
      daysMap[dayKey].expenses += Number(e.amount || 0);
    });

    const result = Object.values(daysMap);
    return result.slice(-10);
  }, [filteredSales, filteredExpenses]);

  // Best selling products
  const topProducts = useMemo(() => {
    const counts: { [name: string]: { name: string; quantity: number; revenue: number } } = {};
    filteredSales.forEach(s => {
      (s.items || []).forEach((item: any) => {
        const key = item.name || 'Bilinmeyen Ürün';
        if (!counts[key]) counts[key] = { name: key, quantity: 0, revenue: 0 };
        counts[key].quantity += Number(item.quantity || 1);
        counts[key].revenue += Number(item.price || 0) * Number(item.quantity || 1);
      });
    });

    return Object.values(counts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [filteredSales]);

  // Excel Export
  const exportToExcel = () => {
    const salesExport = filteredSales.map(s => ({
      'Tarih': format(s.parsedDate, 'dd.MM.yyyy HH:mm'),
      'Fiş No': s.id,
      'Müşteri': s.customerName || 'Perakende Müşteri',
      'Ödeme Yöntemi': s.paymentMethod === 'cash' ? 'Nakit' : s.paymentMethod === 'card' ? 'Kredi Kartı' : 'Veresiye (Borç)',
      'Ürün Sayısı': (s.items || []).reduce((acc: number, i: any) => acc + (i.quantity || 1), 0),
      'Tutar (TL)': s.total,
      'Maliyet (TL)': (s.items || []).reduce((acc: number, i: any) => acc + (Number(i.purchasePrice || 0) * (i.quantity || 1)), 0),
      'Kâr (TL)': s.total - (s.items || []).reduce((acc: number, i: any) => acc + (Number(i.purchasePrice || 0) * (i.quantity || 1)), 0),
    }));

    const expenseExport = filteredExpenses.map(e => ({
      'Tarih': format(e.parsedDate, 'dd.MM.yyyy HH:mm'),
      'Gider Başlığı': e.title,
      'Kategori': e.category || 'Genel',
      'Tutar (TL)': e.amount,
      'Açıklama': e.description || '',
    }));

    const wb = XLSX.utils.book_new();
    const wsSales = XLSX.utils.json_to_sheet(salesExport);
    const wsExpenses = XLSX.utils.json_to_sheet(expenseExport);

    XLSX.utils.book_append_sheet(wb, wsSales, 'Satışlar');
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Giderler');

    XLSX.writeFile(wb, `Bulut_POS_Rapor_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  const dateFilterLabels: { [key in DateFilter]: string } = {
    today: 'Bugün',
    yesterday: 'Dün',
    last7: 'Son 7 Gün',
    this_month: 'Bu Ay',
    last_month: 'Geçen Ay',
    all: 'Tüm Zamanlar'
  };

  // Search in filtered sales
  const searchedSales = filteredSales.filter(s => {
    const term = salesSearch.toLowerCase();
    const cust = (s.customerName || '').toLowerCase();
    const id = (s.id || '').toLowerCase();
    const items = (s.items || []).map((i: any) => i.name.toLowerCase()).join(' ');
    return cust.includes(term) || id.includes(term) || items.includes(term);
  });

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 lg:space-y-6 pb-28 lg:pb-12 max-w-7xl mx-auto">
      {/* Header and Controls */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <img 
            src="/logo.jpg" 
            alt="Logo" 
            className="w-10 h-10 rounded-lg object-cover shadow-sm border border-slate-100 hidden lg:block"
            referrerPolicy="no-referrer"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Detaylı Raporlar & Gelir-Gider
              </h2>
              <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                Canlı Bulut Verisi
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Bulut POS satış cirosu, veresiye alacakları, giderler ve kârlılık analizi.
            </p>
          </div>
        </div>

        {/* Date Filter & Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Selector Buttons */}
          <div className="bg-white p-1 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center gap-1 overflow-x-auto max-w-full">
            {(['today', 'yesterday', 'last7', 'this_month', 'all'] as DateFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  dateFilter === f
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {dateFilterLabels[f]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={exportToExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              title="Excel Raporu İndir"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Excel'e Aktar</span>
            </button>
            <button
              onClick={handlePrint}
              className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl transition-all shadow-2xs"
              title="Raporu Yazdır"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main KPI Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {/* Toplam Ciro / Satış */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Toplam Satış Cirosu ({dateFilterLabels[dateFilter]})
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {totalSalesAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
            <ShoppingBag className="w-3 h-3 text-blue-500" />
            <span>{filteredSales.length} Adet Satış İşlemi</span>
          </div>
        </div>

        {/* Toplam Giderler */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Toplam Gider ({dateFilterLabels[dateFilter]})
            </span>
            <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-red-600 mt-1">
            {totalExpensesAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {filteredExpenses.length} Kalem Harcama
          </p>
        </div>

        {/* Net Kâr / Zarar */}
        <div className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl border shadow-xs ${
          netProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider ${
              netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}>
              Net Kâr / Denge
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              netProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-xl sm:text-2xl font-black mt-1 ${
            netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
          }`}>
            {netProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <p className={`text-[11px] font-semibold mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {netProfit >= 0 ? '✓ Net Kâr (Ciro - Maliyet - Gider)' : '⚠️ Zarar Durumu'}
          </p>
        </div>

        {/* Veresiye Alacakları (Piyasa) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/40 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-700">
              Piyasa Veresiye Alacağı
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-800 mt-1">
            {totalReceivables.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <p className="text-[11px] text-amber-700 font-semibold mt-1">
            {customers.filter(c => Number(c.debt || 0) > 0).length} Müşteri açık hesap
          </p>
        </div>
      </div>

      {/* Breakdown by Payment Method (Nakit, Kredi Kartı, Veresiye) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Nakit Satışlar</p>
              <p className="text-lg font-black text-emerald-700 mt-0.5">
                {cashSales.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400">
            %{totalSalesAmount > 0 ? Math.round((cashSales / totalSalesAmount) * 100) : 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Kredi Kartı Satışları</p>
              <p className="text-lg font-black text-blue-700 mt-0.5">
                {cardSales.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400">
            %{totalSalesAmount > 0 ? Math.round((cardSales / totalSalesAmount) * 100) : 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Veresiye Satışlar</p>
              <p className="text-lg font-black text-red-600 mt-0.5">
                {veresiyeSales.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400">
            %{totalSalesAmount > 0 ? Math.round((veresiyeSales / totalSalesAmount) * 100) : 0}
          </span>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Daily Sales vs Expenses Bar Chart */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">Satış & Gider Karşılaştırma Grafiği</h3>
              <p className="text-xs text-slate-400">Günlük ciro ve gider hareketleri</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-blue-600">
                <span className="w-3 h-3 rounded-full bg-blue-600"></span> Satış
              </span>
              <span className="flex items-center gap-1.5 text-red-500">
                <span className="w-3 h-3 rounded-full bg-red-500"></span> Gider
              </span>
            </div>
          </div>

          <div className="h-64 sm:h-72">
            {dailyTrendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Seçilen dönemde grafik verisi bulunamadı.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 16px -2px rgba(0,0,0,0.1)', fontSize: '12px' }}
                    formatter={(val: any) => [`${Number(val).toLocaleString('tr-TR')} ₺`]}
                  />
                  <Bar dataKey="sales" name="Satış Cirosu" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={22} />
                  <Bar dataKey="expenses" name="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Methods Distribution Pie Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Ödeme Dağılımı</h3>
            <p className="text-xs text-slate-400">Nakit, kart ve veresiye oranları</p>
          </div>

          <div className="h-52 sm:h-60 flex items-center justify-center">
            {paymentMethodChartData.length === 0 ? (
              <div className="text-slate-400 text-xs text-center py-10">
                Ödeme verisi bulunmuyor.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodChartData}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {paymentMethodChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${Number(val).toLocaleString('tr-TR')} ₺`]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Nakit
              </span>
              <span className="font-bold text-slate-900">{cashSales.toLocaleString('tr-TR')} ₺</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Kredi Kartı
              </span>
              <span className="font-bold text-slate-900">{cardSales.toLocaleString('tr-TR')} ₺</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Veresiye
              </span>
              <span className="font-bold text-red-600">{veresiyeSales.toLocaleString('tr-TR')} ₺</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Reports Section (Tabs: Sales, Top Products, Low Stock) */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setReportTab('sales')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                reportTab === 'sales'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Satış İşlemleri ({filteredSales.length})
            </button>
            <button
              onClick={() => setReportTab('top_products')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                reportTab === 'top_products'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Çok Satan Ürünler ({topProducts.length})
            </button>
            <button
              onClick={() => setReportTab('low_stock')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                reportTab === 'low_stock'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-amber-700 hover:bg-amber-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Kritik Stok ({lowStockProducts.length})</span>
            </button>
          </div>

          {reportTab === 'sales' && (
            <input
              type="text"
              placeholder="Fiş no, müşteri veya ürün ara..."
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
              value={salesSearch}
              onChange={(e) => setSalesSearch(e.target.value)}
            />
          )}
        </div>

        {/* Tab 1: Detailed Sales List */}
        {reportTab === 'sales' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-3 sm:p-4">Tarih / Saat</th>
                  <th className="p-3 sm:p-4">Müşteri</th>
                  <th className="p-3 sm:p-4">Ödeme Tipi</th>
                  <th className="p-3 sm:p-4">Satılan Ürünler</th>
                  <th className="p-3 sm:p-4 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {searchedSales.map((sale) => {
                  const itemsCount = (sale.items || []).reduce((acc: number, i: any) => acc + (i.quantity || 1), 0);
                  const itemsSummary = (sale.items || [])
                    .map((i: any) => `${i.quantity}x ${i.name}`)
                    .join(', ');

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 sm:p-4 text-slate-600 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {format(sale.parsedDate, 'dd MMMM yyyy', { locale: tr })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {format(sale.parsedDate, 'HH:mm:ss')} • ID: {sale.id.substring(0, 6)}
                        </div>
                      </td>
                      <td className="p-3 sm:p-4">
                        {sale.customerName ? (
                          <div className="font-bold text-slate-900">{sale.customerName}</div>
                        ) : (
                          <span className="text-slate-400 italic">Perakende Müşteri</span>
                        )}
                      </td>
                      <td className="p-3 sm:p-4 whitespace-nowrap">
                        {sale.paymentMethod === 'veresiye' ? (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold text-[10px]">
                            Veresiye (Borç)
                          </span>
                        ) : sale.paymentMethod === 'card' ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                            Kredi Kartı
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            Nakit
                          </span>
                        )}
                      </td>
                      <td className="p-3 sm:p-4 max-w-xs truncate text-slate-600" title={itemsSummary}>
                        <span className="font-bold text-slate-800 mr-1.5">{itemsCount} adet</span>
                        <span className="text-slate-500 text-[11px]">{itemsSummary}</span>
                      </td>
                      <td className="p-3 sm:p-4 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                        {Number(sale.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                    </tr>
                  );
                })}

                {searchedSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Seçilen kriterlere uygun satış kaydı bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Top Selling Products */}
        {reportTab === 'top_products' && (
          <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {topProducts.map((item, idx) => (
              <div 
                key={item.name}
                className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Toplam Satılan: {item.quantity} Adet</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-blue-600 text-xs sm:text-sm">
                    {item.revenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">Elde Edilen Ciro</p>
                </div>
              </div>
            ))}

            {topProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400">
                Seçilen dönemde ürün satışı bulunmuyor.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Low Stock Alerts */}
        {reportTab === 'low_stock' && (
          <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStockProducts.map(p => (
              <div key={p.id} className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{p.name}</h4>
                  <p className="text-[10px] text-slate-500">Barkod: {p.barcode || 'Yok'} • Kat: {p.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-red-600">{p.stock} Adet</p>
                  <p className="text-[10px] text-slate-400">Min: {p.minStock}</p>
                </div>
              </div>
            ))}

            {lowStockProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-emerald-600 font-bold text-xs flex flex-col items-center gap-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <span>Harika! Kritik seviyede ürün bulunmuyor, tüm stoklar yeterli.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
