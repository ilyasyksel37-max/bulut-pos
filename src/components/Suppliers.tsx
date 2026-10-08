import React, { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, query, deleteDoc, doc, 
  addDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Building2, Phone, Plus, Search, Edit2, Trash2, 
  ArrowDownRight, Receipt, CreditCard, Sparkles, Filter, 
  AlertCircle, CheckCircle2, User, Printer 
} from 'lucide-react';
import { SupplierModal, SupplierData } from './suppliers/SupplierModal';
import { SupplierLedgerModal } from './suppliers/SupplierLedgerModal';

const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierData | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<SupplierData | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const q = query(collection(db, 'suppliers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as SupplierData[];

      // Sort by balance descending (who we owe most)
      list.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));

      setSuppliers(list);
      setLoading(false);
    }, (error) => {
      console.error("Suppliers listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteSupplier = async (sup: SupplierData) => {
    if (!sup.id) return;
    const balance = Number(sup.balance || 0);
    const confirmMsg = balance > 0
      ? `DİKKAT: ${sup.name} isimli firmaya ${balance.toLocaleString('tr-TR')} ₺ borcunuz bulunmaktadır! Silmek istediğinize emin misiniz?`
      : `${sup.name} isimli tedarikçiyi silmek istediğinize emin misiniz?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, 'suppliers', sup.id));
      showToast(`${sup.name} silindi.`);
    } catch (err) {
      console.error(err);
      alert("Tedarikçi silinirken hata oluştu.");
    }
  };

  const filtered = suppliers.filter(s => {
    const term = searchTerm.toLowerCase();
    return (s.name || '').toLowerCase().includes(term) || 
           (s.contactPerson || '').toLowerCase().includes(term) ||
           (s.phone || '').includes(term) ||
           (s.category || '').toLowerCase().includes(term);
  });

  const totalBalance = suppliers.reduce((sum, s) => sum + Number(s.balance || 0), 0);

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
          <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Tedarikçi & Toptancı Yönetimi
              </h2>
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {suppliers.length} Firma
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Toptancılar, mal alımları ve tedarikçi borç takibi.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingSupplier(null);
            setIsSupplierModalOpen(true);
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Tedarikçi Ekle</span>
        </button>
      </header>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Toplam Tedarikçi
            </span>
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{suppliers.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Aktif toptancı ve imalatçı</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-red-200/80 bg-gradient-to-br from-white to-red-50/40 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-600">
              Toplam Borcumuz
            </span>
            <CreditCard className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-red-600 mt-1">
            {totalBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <p className="text-[10px] text-red-500 font-semibold mt-0.5">
            Tedarikçilere ödenecek toplam tutar
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              En Büyük Tedarikçi
            </span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1 truncate">
            {suppliers[0]?.name || '-'}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Bakiye: {Number(suppliers[0]?.balance || 0).toLocaleString('tr-TR')} ₺</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs relative">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Firma adı, yetkili veya kategori ara..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm">Tedarikçi listesi yükleniyor...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-xs max-w-lg mx-auto">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-900">Sonuç Bulunamadı</h3>
          <p className="text-xs text-slate-500 mt-1">Lütfen farklı bir kelime deneyin veya yeni bir tedarikçi ekleyin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(sup => (
            <div key={sup.id} className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-md transition-all p-4 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">{sup.name}</h4>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">{sup.category || 'Genel Tedarikçi'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      setEditingSupplier(sup);
                      setIsSupplierModalOpen(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteSupplier(sup)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Bakiye (Borcumuz)</span>
                  <span className={`text-sm font-black ${Number(sup.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {Number(sup.balance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <User className="w-3 h-3" />
                    <span className="truncate">{sup.contactPerson || '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Phone className="w-3 h-3" />
                    <span className="truncate">{sup.phone || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button 
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/10"
                  onClick={() => {
                    setSelectedSupplier(sup);
                    setIsLedgerModalOpen(true);
                  }}
                >
                  Mal Alımı
                </button>
                <button 
                  className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
                  onClick={() => {
                    setSelectedSupplier(sup);
                    setIsLedgerModalOpen(true);
                  }}
                >
                  Ödeme Yap
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SupplierModal 
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        supplier={editingSupplier}
        onSuccess={(saved) => showToast(`${saved.name} başarıyla kaydedildi.`)}
      />

      <SupplierLedgerModal
        isOpen={isLedgerModalOpen}
        onClose={() => setIsLedgerModalOpen(false)}
        supplier={selectedSupplier}
        onSupplierUpdated={() => {}}
      />
    </div>
  );
};

export default Suppliers;
