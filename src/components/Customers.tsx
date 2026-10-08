import React, { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, query, deleteDoc, doc, 
  addDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Users, Phone, Star, Plus, Search, Edit2, Trash2, 
  ArrowDownRight, Receipt, CreditCard, Sparkles, Filter, 
  AlertCircle, CheckCircle2, ShoppingBag, Printer, Truck 
} from 'lucide-react';
import { CustomerModal, CustomerData } from './customers/CustomerModal';
import { CustomerPaymentModal } from './customers/CustomerPaymentModal';
import { CustomerLedgerModal } from './customers/CustomerLedgerModal';

interface CustomersProps {
  onStartSale?: (customer: CustomerData) => void;
  onStartFieldOrder?: (customer: CustomerData) => void;
}

const Customers: React.FC<CustomersProps> = ({ onStartSale, onStartFieldOrder }) => {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in_debt' | 'no_debt'>('all');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerData | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<CustomerData | null>(null);

  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerCustomer, setLedgerCustomer] = useState<CustomerData | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const q = query(collection(db, 'customers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as CustomerData[];

      // Sort by debt descending, then name
      list.sort((a, b) => {
        const debtA = Number(a.debt || 0);
        const debtB = Number(b.debt || 0);
        if (debtB !== debtA) return debtB - debtA;
        return (a.name || '').localeCompare(b.name || '');
      });

      setCustomers(list);
      setLoading(false);
    }, (error) => {
      console.error("Customers listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteCustomer = async (cust: CustomerData) => {
    if (!cust.id) return;
    const debt = Number(cust.debt || 0);
    const confirmMsg = debt > 0
      ? `DİKKAT: ${cust.name} isimli müşterinin ${debt.toLocaleString('tr-TR')} ₺ veresiye borcu bulunmaktadır! Silmek istediğinize emin misiniz?`
      : `${cust.name} isimli müşteriyi silmek istediğinize emin misiniz?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, 'customers', cust.id));
      showToast(`${cust.name} silindi.`);
    } catch (err) {
      console.error(err);
      alert("Müşteri silinirken hata oluştu.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Seed sample customers for instant testing if database is empty
  const handleSeedDemoCustomers = async () => {
    try {
      const samples = [
        {
          name: "Ahmet Yılmaz (Öğretmen)",
          phone: "0532 111 22 33",
          email: "ahmet@okul.k12.tr",
          address: "Cumhuriyet İlkokulu - 3/A Sınıfı",
          debt: 450,
          creditLimit: 2500,
          loyaltyPoints: 120,
          totalSpent: 3400,
          notes: "Her ay başı maaş gününde veresiye kapatır.",
        },
        {
          name: "Zeynep Kaya (Veli)",
          phone: "0544 555 66 77",
          email: "zeynep.kaya@gmail.com",
          address: "Atatürk Mah. Lale Sok. No:4",
          debt: 180,
          creditLimit: 1500,
          loyaltyPoints: 65,
          totalSpent: 1250,
          notes: "Çocukların kırtasiye malzemeleri için açık hesap.",
        },
        {
          name: "Mehmet Demir - Demir İnşaat",
          phone: "0505 999 88 77",
          email: "muhasebe@demirinsaat.com",
          address: "Sanayi Sitesi B Blok No:12",
          debt: 1200,
          creditLimit: 5000,
          loyaltyPoints: 340,
          totalSpent: 8900,
          notes: "Ofis fotokopi kağıdı ve klasör alımları.",
        },
        {
          name: "Ayşe Özcan (Öğrenci)",
          phone: "0553 444 33 22",
          email: "ayse.ozcan@ogr.edu.tr",
          address: "Üniversite Kampüsü",
          debt: 0,
          creditLimit: 1000,
          loyaltyPoints: 210,
          totalSpent: 2100,
          notes: "Peşin alışveriş yapar.",
        }
      ];

      for (const sample of samples) {
        const docRef = await addDoc(collection(db, 'customers'), {
          ...sample,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (sample.debt > 0) {
          await addDoc(collection(db, 'customer_transactions'), {
            customerId: docRef.id,
            customerName: sample.name,
            type: 'DEBT',
            title: 'Açılış Veresiye Borç Bakiyesi',
            amount: sample.debt,
            paymentMethod: 'Veresiye',
            balanceAfter: sample.debt,
            date: serverTimestamp(),
          });
        }
      }

      showToast("Örnek müşteriler başarıyla yüklendi!");
    } catch (err) {
      console.error(err);
      alert("Örnek veri yüklenirken hata oluştu.");
    }
  };

  // Filter customers
  const filtered = customers.filter(c => {
    const matchesSearch = 
      (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (c.phone || '').includes(searchTerm) ||
      (c.address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.notes || '').toLowerCase().includes(searchTerm.toLowerCase());

    const debt = Number(c.debt || 0);
    if (!matchesSearch) return false;

    if (filterType === 'in_debt') return debt > 0;
    if (filterType === 'no_debt') return debt <= 0;
    return true;
  });

  const totalCustomersCount = customers.length;
  const customersInDebt = customers.filter(c => Number(c.debt || 0) > 0);
  const totalDebtReceivable = customers.reduce((sum, c) => sum + Number(c.debt || 0), 0);
  const totalLoyaltyPoints = customers.reduce((sum, c) => sum + Number(c.loyaltyPoints || 0), 0);

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 lg:space-y-6 pb-28 lg:pb-12 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-semibold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                Müşteriler & Cari Veresiye Takibi
              </h2>
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {totalCustomersCount} Cari
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Veresiye borç defteri, açık hesaplar, tahsilatlar ve müşteri sadakat puanları.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Print Customer Debt List Button */}
          <button
            onClick={handlePrint}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
            title="Müşteri ve Veresiye Listesini Yazdır"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Listeyi Yazdır</span>
          </button>

          {customers.length === 0 && (
            <button
              onClick={handleSeedDemoCustomers}
              className="px-3.5 py-2.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Örnek Veri Yükle</span>
            </button>
          )}

          <button
            onClick={() => {
              setEditingCustomer(null);
              setIsCustomerModalOpen(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Müşteri Ekle</span>
          </button>
        </div>
      </header>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Toplam Müşteri
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">{totalCustomersCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Kayıtlı cari hesap</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-red-200/80 bg-gradient-to-br from-white to-red-50/40 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-600">
              Toplam Veresiye Alacağı
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-red-600 mt-1">
            {totalDebtReceivable.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <p className="text-[10px] text-red-500 font-semibold mt-0.5">
            {customersInDebt.length} müşteride açık borç
          </p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Borçlu Oranı
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">
            %{totalCustomersCount > 0 ? Math.round((customersInDebt.length / totalCustomersCount) * 100) : 0}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Veresiye kullanan cari</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Toplam Sadakat Puanı
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-2xl font-black text-purple-600 mt-1">
            {totalLoyaltyPoints.toLocaleString('tr-TR')}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Kazanılan ödül puanı</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Müşteri adı, telefon, kurum veya notlarda ara..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
              filterType === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            Tümü ({totalCustomersCount})
          </button>
          <button
            onClick={() => setFilterType('in_debt')}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
              filterType === 'in_debt'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-red-50 hover:bg-red-100 text-red-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-400"></span>
            <span>Borcu Olanlar ({customersInDebt.length})</span>
          </button>
          <button
            onClick={() => setFilterType('no_debt')}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
              filterType === 'no_debt'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
            }`}
          >
            Temiz Bakiyeler ({totalCustomersCount - customersInDebt.length})
          </button>
        </div>
      </div>

      {/* Customers List / Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm">Müşteri listesi yükleniyor...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 sm:p-14 text-center border border-slate-200 shadow-xs max-w-lg mx-auto">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            {searchTerm ? 'Aramaya Uygun Müşteri Bulunamadı' : 'Henüz Müşteri Kaydı Yok'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xs mx-auto">
            {searchTerm 
              ? 'Lütfen arama terimini kontrol edin veya yeni bir müşteri kaydedin.' 
              : 'Veresiye satışı yapabilmek ve sadakat puanı biriktirmek için ilk müşterinizi ekleyin.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              onClick={() => {
                setEditingCustomer(null);
                setIsCustomerModalOpen(true);
              }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all"
            >
              + Müşteri Ekle
            </button>
            {customers.length === 0 && (
              <button
                onClick={handleSeedDemoCustomers}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Örnek Veri Yükle
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {filtered.map(cust => {
            const debt = Number(cust.debt || 0);
            const creditLimit = Number(cust.creditLimit || 2000);
            const spent = Number(cust.totalSpent || 0);
            const points = Number(cust.loyaltyPoints || 0);
            const initials = (cust.name || 'M')
              .split(' ')
              .map(n => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase();

            const tier = spent > 5000 ? 'Platin' : spent > 1500 ? 'Altın' : 'Gümüş';

            return (
              <div 
                key={cust.id}
                className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
              >
                {/* Card Top */}
                <div className="p-4 sm:p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border ${
                        debt > 0 
                          ? 'bg-red-50 text-red-600 border-red-100' 
                          : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 truncate">
                          {cust.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {cust.phone ? (
                            <a
                              href={`tel:${cust.phone}`}
                              className="text-slate-500 hover:text-blue-600 text-xs flex items-center gap-1 font-mono transition-colors"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{cust.phone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs">Telefon yok</span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                            tier === 'Platin' ? 'bg-purple-100 text-purple-700' :
                            tier === 'Altın' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {tier}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Edit/Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingCustomer(cust);
                          setIsCustomerModalOpen(true);
                        }}
                        title="Düzenle"
                        className="w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 flex items-center justify-center transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(cust)}
                        title="Sil"
                        className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Veresiye Borç Durumu Paneli */}
                  <div className={`p-3.5 rounded-2xl border transition-all ${
                    debt > 0 
                      ? 'bg-gradient-to-r from-red-50/80 to-amber-50/40 border-red-200' 
                      : 'bg-emerald-50/40 border-emerald-100'
                  }`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-bold uppercase tracking-wider text-[10px] ${
                        debt > 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}>
                        Veresiye Borcu
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        Limit: {creditLimit.toLocaleString('tr-TR')} ₺
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1">
                      <p className={`text-xl sm:text-2xl font-black ${
                        debt > 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {debt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </p>
                      {debt > 0 && creditLimit > 0 && (
                        <span className="text-[11px] font-bold text-red-700">
                          %{Math.round((debt / creditLimit) * 100)} Limit Kullanımı
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {creditLimit > 0 && (
                      <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden mt-2">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            debt > creditLimit ? 'bg-red-600' : debt > creditLimit * 0.7 ? 'bg-amber-500' : 'bg-blue-600'
                          }`}
                          style={{ width: `${Math.min(100, (debt / creditLimit) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Notes / Address */}
                  {(cust.notes || cust.address) && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 line-clamp-2">
                      {cust.notes ? `Not: ${cust.notes}` : `Adres: ${cust.address}`}
                    </div>
                  )}

                  {/* Loyalty and total spent stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Sadakat Puanı</p>
                      <p className="font-bold text-purple-600 mt-0.5">{points} Puan</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Toplam Alışveriş</p>
                      <p className="font-bold text-slate-800 mt-0.5">{spent.toLocaleString('tr-TR')} ₺</p>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons Footer: Satış Yap, Tahsilat Al, Veresiye Defteri, Saha Siparişi */}
                <div className="p-3 bg-slate-50/70 border-t border-slate-100 flex items-center gap-1.5 sm:gap-2">
                  {onStartSale && (
                    <button
                      onClick={() => onStartSale(cust)}
                      className="flex-1 py-2 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95"
                      title="Bu müşteriye hemen satış başlat"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Satış</span>
                    </button>
                  )}

                  {onStartFieldOrder && (
                    <button
                      onClick={() => onStartFieldOrder(cust)}
                      className="flex-1 py-2 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95"
                      title="Bu müşteri için saha siparişi aç"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Sipariş</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setPaymentCustomer(cust);
                      setIsPaymentModalOpen(true);
                    }}
                    className="flex-1 py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95"
                    title="Borç tahsilatı al"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Tahsilat</span>
                  </button>

                  <button
                    onClick={() => {
                      setLedgerCustomer(cust);
                      setIsLedgerModalOpen(true);
                    }}
                    className="flex-1 py-2 px-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-2xs"
                    title="Hesap hareketleri ve borç defteri"
                  >
                    <Receipt className="w-3.5 h-3.5 text-blue-600" />
                    <span>Ekstre</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Customer Modal (Add/Edit) */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customer={editingCustomer}
        onSuccess={(saved) => {
          showToast(`${saved.name} başarıyla kaydedildi!`);
        }}
      />

      {/* Customer Payment Modal (Tahsilat) */}
      <CustomerPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentCustomer(null);
        }}
        customer={paymentCustomer}
        onSuccess={(amount) => {
          showToast(`🎉 ${amount.toLocaleString('tr-TR')} ₺ tutarında tahsilat kaydedildi!`);
        }}
      />

      {/* Customer Ledger Modal (Veresiye Defteri / Ekstre) */}
      <CustomerLedgerModal
        isOpen={isLedgerModalOpen}
        onClose={() => {
          setIsLedgerModalOpen(false);
          setLedgerCustomer(null);
        }}
        customer={ledgerCustomer}
        onCustomerUpdated={() => {
          showToast("Müşteri hesap bakiyesi güncellendi.");
        }}
        onOpenPayment={() => {
          if (ledgerCustomer) {
            setPaymentCustomer(ledgerCustomer);
            setIsPaymentModalOpen(true);
          }
        }}
        onStartSale={onStartSale}
        onStartFieldOrder={onStartFieldOrder}
      />
    </div>
  );
};

export default Customers;
