import React, { useState, useEffect } from 'react';
import { 
  Printer, Scale, Shirt, Sparkles, Palette, Scissors, 
  CheckCircle2, AlertTriangle, Package, Tag, Clock, 
  FileText, Plus, Trash2, ShoppingCart, RefreshCw, Layers,
  ChevronRight, Bookmark, ArrowRight, Eye, Check, AlertCircle,
  HelpCircle, Sliders, Box, ShieldAlert, Edit2, Coins, DollarSign,
  Save, X
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SECTORAL_MODULES, SectoralModuleId, isTenantSectorModuleEnabled, ProductVariant } from '../lib/tenant';
import { useAuth } from '../context/AuthContext';

interface SectoralModulesProps {
  activeModule: SectoralModuleId | string;
  onNavigateToPOS?: (prefilledItem?: any) => void;
  onAddToCart?: (item: any) => void;
}

export const SectoralModules: React.FC<SectoralModulesProps> = ({ 
  activeModule,
  onNavigateToPOS,
  onAddToCart 
}) => {
  const { currentTenant, isSuperAdmin, withTenant, tenantId } = useAuth();

  // Notification toast inside sectoral module
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; onClick: () => void } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastAction(null);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const showToastWithAction = (msg: string, label: string, action: () => void) => {
    setToastMessage(msg);
    setToastAction({ label, onClick: action });
    setTimeout(() => {
      setToastMessage(null);
      setToastAction(null);
    }, 5000);
  };

  const handleAddItemToPOS = (item: any, directNavigate: boolean = false) => {
    if (onAddToCart) {
      onAddToCart(item);
    } else if (onNavigateToPOS) {
      onNavigateToPOS(item);
      return;
    }

    if (directNavigate && onNavigateToPOS) {
      onNavigateToPOS(item);
      return;
    }

    showToastWithAction(
      `🛒 "${item.name}" Satış (POS) Bölümüne Eklendi!`,
      "Satışa Git",
      () => {
        if (onNavigateToPOS) onNavigateToPOS(item);
      }
    );
  };

  // Find module definition
  const moduleDef = SECTORAL_MODULES.find(m => m.id === activeModule);

  // Check if current module is enabled
  const isEnabled = isSuperAdmin || isTenantSectorModuleEnabled(currentTenant, activeModule);

  if (!isEnabled || !moduleDef) {
    return (
      <div className="p-8 max-w-lg mx-auto my-12 bg-white rounded-3xl border border-rose-200/80 shadow-xl text-center space-y-4 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Bu modül paketinizde aktif değildir. İletişime geçiniz.</h2>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          Erişmeye çalıştığınız modül (<strong>{moduleDef?.name || activeModule}</strong>) işletmeniz (<strong>{currentTenant?.name}</strong>) için aktif değildir. Bu modülü kullanabilmek için lütfen Süper Admin yöneticisiyle iletişime geçiniz.
        </p>
        <div className="pt-2">
          <a
            href="tel:05551234567"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95"
          >
            Yönetici ile İletişime Geç
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Module Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 flex items-center justify-center pointer-events-none">
          {activeModule === 'kirtasiye_modulu' && <Printer className="w-72 h-72 text-white" />}
          {activeModule === 'bakkal_market_modulu' && <Scale className="w-72 h-72 text-white" />}
          {activeModule === 'tekstil_modulu' && <Shirt className="w-72 h-72 text-white" />}
          {activeModule === 'esarp_sal_modulu' && <Sparkles className="w-72 h-72 text-white" />}
          {activeModule === 'kozmetik_modulu' && <Palette className="w-72 h-72 text-white" />}
          {activeModule === 'tuhafiye_modulu' && <Scissors className="w-72 h-72 text-white" />}
        </div>

        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-black uppercase tracking-wider">
              Sektörel Çözüm Paketi
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Aktif Modül ({currentTenant?.name})
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
            {moduleDef.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-medium leading-relaxed">
            {moduleDef.description}
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {moduleDef.features.map((feat, idx) => (
              <span key={idx} className="text-[11px] font-semibold bg-white/10 text-slate-200 px-3 py-1 rounded-lg">
                ✓ {feat}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Internal Toast Message */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-black animate-slideDown border border-slate-700">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <span className="max-w-md">{toastMessage}</span>
          {toastAction && (
            <button
              type="button"
              onClick={toastAction.onClick}
              className="ml-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black rounded-xl shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-1"
            >
              <span>{toastAction.label}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Module Specific Body Content */}
      {activeModule === 'kirtasiye_modulu' && (
        <KirtasiyeModuluView showToast={showToast} onNavigateToPOS={onNavigateToPOS} onAddToCart={handleAddItemToPOS} withTenant={withTenant} tenantId={tenantId} />
      )}
      {activeModule === 'bakkal_market_modulu' && (
        <BakkalMarketModuluView showToast={showToast} onNavigateToPOS={onNavigateToPOS} onAddToCart={handleAddItemToPOS} withTenant={withTenant} tenantId={tenantId} />
      )}
      {activeModule === 'tekstil_modulu' && (
        <TekstilModuluView showToast={showToast} onNavigateToPOS={onNavigateToPOS} onAddToCart={handleAddItemToPOS} withTenant={withTenant} tenantId={tenantId} />
      )}
      {activeModule === 'esarp_sal_modulu' && (
        <EsarpSalModuluView showToast={showToast} onNavigateToPOS={onNavigateToPOS} onAddToCart={handleAddItemToPOS} withTenant={withTenant} tenantId={tenantId} />
      )}
      {activeModule === 'kozmetik_modulu' && (
        <KozmetikModuluView showToast={showToast} onNavigateToPOS={onNavigateToPOS} onAddToCart={handleAddItemToPOS} withTenant={withTenant} tenantId={tenantId} />
      )}
      {activeModule === 'tuhafiye_modulu' && (
        <TuhafiyeModuluView showToast={showToast} onNavigateToPOS={onNavigateToPOS} onAddToCart={handleAddItemToPOS} withTenant={withTenant} tenantId={tenantId} />
      )}
    </div>
  );
};

// =========================================================================
// 1. KIRTASİYE MODÜLÜ VIEW
// =========================================================================
const KirtasiyeModuluView: React.FC<{ 
  showToast: (m: string) => void; 
  onNavigateToPOS?: (i: any) => void;
  onAddToCart?: (i: any) => void;
  withTenant: (data: any) => any;
  tenantId?: string;
}> = ({ showToast, onNavigateToPOS, onAddToCart, withTenant, tenantId }) => {
  const currentTenantId = tenantId || (typeof window !== 'undefined' ? localStorage.getItem('sep_current_tenant_id') || 'PRIMARY_TENANT' : 'PRIMARY_TENANT');

  // Photocopy calculator state
  const [pageCount, setPageCount] = useState<number>(10);
  const [copyCount, setCopyCount] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<'A4' | 'A3'>('A4');
  const [colorMode, setColorMode] = useState<'bw' | 'color'>('bw');
  const [isDoubleSided, setIsDoubleSided] = useState<boolean>(false);
  const [binding, setBinding] = useState<string>('none');
  const [lamination, setLamination] = useState<boolean>(false);
  const [laminationCount, setLaminationCount] = useState<number>(1);

  // Configurable unit price rates (Fiyat Değiştirme)
  const [rates, setRates] = useState(() => {
    try {
      const saved = localStorage.getItem(`sep_kirtasiye_rates_${currentTenantId}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      A4_bw: 1.5,
      A4_color: 5.0,
      A3_bw: 3.0,
      A3_color: 10.0,
      A4_bw_double: 2.5,
      A4_color_double: 8.0,
      A3_bw_double: 5.0,
      A3_color_double: 16.0,
      plasticSpiral: 25,
      wireSpiral: 35,
      thermal: 45,
      laminationPrice: 15
    };
  });

  const handleSaveRates = () => {
    try {
      localStorage.setItem(`sep_kirtasiye_rates_${currentTenantId}`, JSON.stringify(rates));
      setIsEditingRates(false);
      showToast("✅ Kırtasiye birim fiyatları başarıyla kaydedildi ve kalıcı olarak saklandı!");
    } catch (err) {
      console.error(err);
      alert('Fiyatlar kaydedilirken hata oluştu.');
    }
  };

  const [isEditingRates, setIsEditingRates] = useState(false);
  const [editingPack, setEditingPack] = useState<any | null>(null);

  const getBaseRate = () => {
    if (paperSize === 'A4') {
      if (isDoubleSided) {
        return colorMode === 'bw' ? rates.A4_bw_double : rates.A4_color_double;
      }
      return colorMode === 'bw' ? rates.A4_bw : rates.A4_color;
    } else {
      if (isDoubleSided) {
        return colorMode === 'bw' ? rates.A3_bw_double : rates.A3_color_double;
      }
      return colorMode === 'bw' ? rates.A3_bw : rates.A3_color;
    }
  };

  const getBindingPrice = () => {
    if (binding === 'plastic_spiral') return rates.plasticSpiral;
    if (binding === 'wire_spiral') return rates.wireSpiral;
    if (binding === 'thermal') return rates.thermal;
    return 0;
  };

  const calculateTotal = () => {
    const baseRate = getBaseRate();
    const printCost = pageCount * copyCount * baseRate;
    const bindingCost = getBindingPrice();
    const laminationCost = lamination ? rates.laminationPrice * laminationCount : 0;
    return printCost + bindingCost + laminationCost;
  };

  const totalCost = calculateTotal();

  const handleSavePrintToInventory = async () => {
    try {
      const calcName = `Fotokopi / Baskı (${pageCount} sf × ${copyCount} kp - ${paperSize} ${colorMode === 'bw' ? 'S/B' : 'Renkli'}${binding !== 'none' ? ` + Cilt` : ''}${lamination ? ` + ${laminationCount} PVC` : ''})`;
      await addDoc(collection(db, 'products'), withTenant({
        name: calcName,
        barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
        price: Number(totalCost.toFixed(2)),
        purchasePrice: Number((totalCost * 0.4).toFixed(2)),
        stock: 999,
        minStock: 10,
        category: 'Kırtasiye / Baskı Hizmeti',
        hasVariants: false,
        variants: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
      showToast(`✅ Baskı ve hesaplama fiyatı otomatik olarak stoklara kaydedildi!`);
    } catch (err) {
      console.error(err);
      alert('Stoğa kaydedilirken hata oluştu.');
    }
  };

  // School book package packaging state (Tenant isolated & Firestore backed)
  const [schoolPacks, setSchoolPacks] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'sectoral_module_items'),
      where('tenantId', '==', currentTenantId),
      where('module', '==', 'kirtasiye_modulu'),
      where('itemType', '==', 'school_pack')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSchoolPacks(list);
    }, (err) => {
      console.warn("Kirtasiye packs fetch warning:", err);
    });
    return () => unsub();
  }, [currentTenantId]);

  const [isAddPackModalOpen, setIsAddPackModalOpen] = useState(false);
  const [newPackForm, setNewPackForm] = useState({
    name: '',
    grade: 'İlkokul / Ortaokul',
    itemsCount: '10',
    price: '550',
    discount: '10'
  });

  const handleSaveNewPack = async () => {
    if (!newPackForm.name.trim()) {
      alert('Lütfen paket adı giriniz.');
      return;
    }
    try {
      await addDoc(collection(db, 'sectoral_module_items'), withTenant({
        module: 'kirtasiye_modulu',
        itemType: 'school_pack',
        name: newPackForm.name.trim(),
        grade: newPackForm.grade || 'Genel',
        itemsCount: parseInt(newPackForm.itemsCount) || 10,
        price: parseFloat(newPackForm.price) || 500,
        discount: parseInt(newPackForm.discount) || 10,
        createdAt: serverTimestamp()
      }));
      showToast(`🎒 "${newPackForm.name}" başarıyla veritabanına kaydedildi!`);
      setIsAddPackModalOpen(false);
      setNewPackForm({ name: '', grade: 'İlkokul / Ortaokul', itemsCount: '10', price: '550', discount: '10' });
    } catch (err: any) {
      console.error(err);
      alert('Paket kaydedilirken hata: ' + err.message);
    }
  };

  const handleDeletePack = async (packId: string) => {
    if (!confirm("Bu paketi kalıcı olarak silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, 'sectoral_module_items', packId));
      showToast("🗑️ Paket başarıyla silindi!");
    } catch (err: any) {
      console.error(err);
      alert('Paket silinirken hata: ' + err.message);
    }
  };

  // Save service/pack to Inventory
  const handleSavePackToInventory = async (pack: any) => {
    try {
      await addDoc(collection(db, 'products'), withTenant({
        name: pack.name || 'Okul Set Paketi',
        barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
        price: Number(pack.price || 0),
        purchasePrice: Number((pack.price || 0) * 0.7),
        stock: 20,
        minStock: 5,
        category: 'Kırtasiye Paketleri',
        hasVariants: false,
        variants: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
      showToast(`📦 "${pack.name}" ürünü stok kartı olarak kaydedildi!`);
    } catch (err) {
      console.error(err);
      alert('Stoka kaydedilirken hata oluştu.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Section 1: Fotokopi & Dijital Baskı Hesaplayıcı */}
      <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase">Fotokopi & Baskı Hesaplama</h3>
              <p className="text-xs text-slate-400 font-medium">Sayfa başı çekim, renk ve ciltleme hesaplayıcısı</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingRates(!isEditingRates)}
            className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 border border-blue-200"
          >
            <Coins className="w-3.5 h-3.5" />
            <span>{isEditingRates ? 'Ayarları Kapat' : 'Birim Fiyatları Değiştir'}</span>
          </button>
        </div>

        {/* Fiyat Değiştirme / Birim Fiyat Ayarları Paneli */}
        {isEditingRates && (
          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-blue-900">
                Fotokopi & Ciltleme Birim Fiyatlarını Güncelle
              </span>
              <span className="text-[10px] text-blue-700 font-bold">Sayfa Başı TL</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A4 S/B (Tek Yön)</label>
                <input
                  type="number"
                  step="0.1"
                  value={rates.A4_bw}
                  onChange={e => setRates({ ...rates, A4_bw: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A4 S/B (Çift Yön)</label>
                <input
                  type="number"
                  step="0.1"
                  value={rates.A4_bw_double}
                  onChange={e => setRates({ ...rates, A4_bw_double: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A4 Renkli (Tek)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.A4_color}
                  onChange={e => setRates({ ...rates, A4_color: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right text-indigo-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A4 Renkli (Çift)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.A4_color_double}
                  onChange={e => setRates({ ...rates, A4_color_double: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right text-indigo-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A3 S/B (Tek)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.A3_bw}
                  onChange={e => setRates({ ...rates, A3_bw: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A3 S/B (Çift)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.A3_bw_double}
                  onChange={e => setRates({ ...rates, A3_bw_double: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A3 Renkli (Tek)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.A3_color}
                  onChange={e => setRates({ ...rates, A3_color: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right text-indigo-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">A3 Renkli (Çift)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rates.A3_color_double}
                  onChange={e => setRates({ ...rates, A3_color_double: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right text-indigo-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Plastik Spiral</label>
                <input
                  type="number"
                  value={rates.plasticSpiral}
                  onChange={e => setRates({ ...rates, plasticSpiral: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Tel Spiral</label>
                <input
                  type="number"
                  value={rates.wireSpiral}
                  onChange={e => setRates({ ...rates, wireSpiral: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Isısal Kapak</label>
                <input
                  type="number"
                  value={rates.thermal}
                  onChange={e => setRates({ ...rates, thermal: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Laminasyon</label>
                <input
                  type="number"
                  value={rates.laminationPrice}
                  onChange={e => setRates({ ...rates, laminationPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-right"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSaveRates}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Fiyatları Kaydet</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-1">Sayfa Sayısı</label>
            <input 
              type="number" 
              min="1"
              value={pageCount}
              onChange={e => setPageCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-1">Kopya / Adet</label>
            <input 
              type="number" 
              min="1"
              value={copyCount}
              onChange={e => setCopyCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-1">Kağıt Ebadı</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaperSize('A4')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all ${
                  paperSize === 'A4' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                A4 Standart ({colorMode === 'bw' ? rates.A4_bw : rates.A4_color} ₺)
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('A3')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all ${
                  paperSize === 'A3' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                A3 Büyük Boy ({colorMode === 'bw' ? rates.A3_bw : rates.A3_color} ₺)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-1">Baskı Rengi</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setColorMode('bw')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all ${
                  colorMode === 'bw' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Siyah-Beyaz
              </button>
              <button
                type="button"
                onClick={() => setColorMode('color')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all ${
                  colorMode === 'color' ? 'bg-gradient-to-r from-pink-500 to-indigo-500 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Renkli Çekim
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={isDoubleSided} 
                onChange={e => setIsDoubleSided(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span>Çift Taraflı (Ön-Arka) Baskı</span>
            </label>
            <span className="text-[11px] text-emerald-600 font-bold">%10 Tasarruflu</span>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-1">Ciltleme / Spiral</label>
            <select
              value={binding}
              onChange={e => setBinding(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="none">Ciltleme Yok (0 TL)</option>
              <option value="plastic_spiral">Plastik Spiral Cilt (+{rates.plasticSpiral} TL)</option>
              <option value="wire_spiral">Tel Spiral Cilt (+{rates.wireSpiral} TL)</option>
              <option value="thermal">Isısal Karton Kapak (+{rates.thermal} TL)</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={lamination} 
                  onChange={e => setLamination(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>PVC Laminasyon / Kaplama (+{rates.laminationPrice} TL / adet)</span>
              </label>
            </div>
            {lamination && (
              <div className="flex items-center gap-3 pl-6 pt-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase">PVC Adet:</label>
                <input
                  type="number"
                  min="1"
                  value={laminationCount}
                  onChange={e => setLaminationCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black"
                />
                <span className="text-[11px] text-slate-500">= {(laminationCount * rates.laminationPrice)} TL</span>
              </div>
            )}
          </div>
        </div>

        {/* Total Cost Calculation Box */}
        <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Hesaplanan Çekim & Baskı Bedeli</p>
            <p className="text-2xl font-black tracking-tight text-white mt-0.5">
              {totalCost.toFixed(2)} <span className="text-xs font-bold text-blue-300">TL</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {pageCount} sayfa × {copyCount} kopya • {paperSize} {colorMode === 'bw' ? 'S/B' : 'Renkli'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSavePrintToInventory}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
              title="Hesaplanan fiyatı otomatik olarak stoğa ve ürün kataloğuna kaydet"
            >
              <Save className="w-4 h-4 text-blue-400" />
              <span>Stoğa Kaydet</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const item = {
                  id: `kirtasiye_baski_${Date.now()}`,
                  name: `Fotokopi / Baskı (${pageCount} sf × ${copyCount} kp - ${paperSize} ${colorMode === 'bw' ? 'S/B' : 'Renkli'})`,
                  price: Number(totalCost.toFixed(2)),
                  quantity: 1,
                  stock: 999,
                  category: 'Kırtasiye / Baskı'
                };
                if (onAddToCart) onAddToCart(item);
                else if (onNavigateToPOS) onNavigateToPOS(item);
                else showToast(`🖨️ ${totalCost.toFixed(2)} TL tutarındaki baskı fişi oluşturuldu!`);
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/20 flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Satışa Ekle</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: Okul & Kitap Paketleme */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Package className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-black text-slate-900 uppercase">Okul & Kitap Set Paketleme</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsAddPackModalOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Paket Ekle</span>
            </button>
          </div>

          <div className="space-y-3">
            {schoolPacks.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-600">Henüz okul seti veya paket eklenmedi.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">'Yeni Paket Ekle' butonunu kullanarak ilk setinizi oluşturun.</p>
              </div>
            ) : (
              schoolPacks.map(pack => (
                <div 
                  key={pack.id} 
                  className="p-3.5 rounded-2xl border border-slate-100 hover:border-indigo-200 bg-slate-50/50 hover:bg-indigo-50/30 transition-all flex items-center justify-between"
                >
                  <div className="pr-2">
                    <h4 className="text-xs font-black text-slate-900">{pack.name || 'İsimsiz Paket'}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{pack.grade} • {pack.itemsCount} Parça Ürün</p>
                    <span className="inline-block mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      %{pack.discount} Paket İndirimi
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-slate-900">{pack.price} TL</div>
                    <div className="flex items-center gap-1.5 mt-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingPack({ ...pack })}
                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-[10px] font-bold border border-amber-200"
                        title="Paketi Düzenle"
                      >
                        <Coins className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePack(pack.id)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-200"
                        title="Paketi Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const item = {
                            id: `okul_seti_${pack.id}_${Date.now()}`,
                            name: pack.name,
                            price: Number(pack.price),
                            quantity: 1,
                            stock: 999,
                            category: 'Kırtasiye / Okul Seti'
                          };
                          if (onAddToCart) onAddToCart(item);
                          else if (onNavigateToPOS) onNavigateToPOS(item);
                          else showToast(`🎒 "${pack.name}" satış sepetine eklendi!`);
                        }}
                        className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold shadow-xs active:scale-95 flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" />
                        <span>Satışa Ekle</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Kırtasiye Raf & Mini Etiket Basımı Bilgilendirme */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-5 border border-blue-100 text-blue-950 space-y-2">
          <div className="flex items-center gap-2 font-black text-xs text-blue-900">
            <Tag className="w-4 h-4 text-blue-600" />
            <span>Kırtasiye Raf & Mini Kalem Etiketi</span>
          </div>
          <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
            Barkodsuz kalem, silgi, cetvel ve ataş gibi küçük ürünler için <strong>Barkod Oluştur</strong> menüsünden mini boyutlu etiket ve raf etiketleri şablonu basabilirsiniz.
          </p>
        </div>
      </div>

      {/* School Pack Price Change Modal */}
      {editingPack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Paket Fiyatını Değiştir</h3>
              <button onClick={() => setEditingPack(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 mb-1">{editingPack.name}</p>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Yeni Satış Fiyatı (TL)</label>
              <input
                type="number"
                value={editingPack.price}
                onChange={e => setEditingPack({ ...editingPack, price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPack(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setSchoolPacks(prev => prev.map(p => p.id === editingPack.id ? editingPack : p));
                  showToast(`✅ "${editingPack.name}" fiyatı ${editingPack.price} TL olarak güncellendi!`);
                  setEditingPack(null);
                }}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Okul Paketi Ekle Modal */}
      {isAddPackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Yeni Okul / Kitap Seti Ekle</h3>
              <button onClick={() => setIsAddPackModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Paket Adı</label>
                <input
                  type="text"
                  value={newPackForm.name}
                  onChange={e => setNewPackForm({ ...newPackForm, name: e.target.value })}
                  placeholder="Örn: 2. Sınıf Full Set"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Sınıf / Seviye</label>
                  <input
                    type="text"
                    value={newPackForm.grade}
                    onChange={e => setNewPackForm({ ...newPackForm, grade: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Parça Sayısı</label>
                  <input
                    type="number"
                    value={newPackForm.itemsCount}
                    onChange={e => setNewPackForm({ ...newPackForm, itemsCount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Fiyat (TL)</label>
                  <input
                    type="number"
                    value={newPackForm.price}
                    onChange={e => setNewPackForm({ ...newPackForm, price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">İndirim Oranı (%)</label>
                  <input
                    type="number"
                    value={newPackForm.discount}
                    onChange={e => setNewPackForm({ ...newPackForm, discount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddPackModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveNewPack}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
              >
                Paketi Ekle
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

// =========================================================================
// 2. BAKKAL & MARKET MODÜLÜ VIEW
// =========================================================================
const BakkalMarketModuluView: React.FC<{ 
  showToast: (m: string) => void; 
  onNavigateToPOS?: (i: any) => void;
  onAddToCart?: (i: any) => void;
  withTenant: (data: any) => any;
  tenantId?: string;
}> = ({ showToast, onNavigateToPOS, onAddToCart, withTenant, tenantId }) => {
  // Barcode decoder state
  const [testBarcode, setTestBarcode] = useState<string>('2801450012503');
  const [parsedData, setParsedData] = useState<any>(null);

  // Quick weight sales state
  const [bulkItems, setBulkItems] = useState([
    { id: 'b1', name: 'Kaşar Peyniri', pricePerKg: 320, plu: '0145' },
    { id: 'b2', name: 'Siyah Zeytin', pricePerKg: 180, plu: '0146' },
    { id: 'b3', name: 'Dana Kıyma', pricePerKg: 490, plu: '0147' },
    { id: 'b4', name: 'Domates Salkım', pricePerKg: 45, plu: '0148' },
    { id: 'b5', name: 'Baldo Pirinç', pricePerKg: 65, plu: '0149' },
  ]);

  const [selectedBulkItem, setSelectedBulkItem] = useState(bulkItems[0].name);
  const [bulkWeightKg, setBulkWeightKg] = useState<number>(0.450);
  const [bulkPricePerKg, setBulkPricePerKg] = useState<number>(320);

  // New bulk item modal state
  const [isAddBulkModalOpen, setIsAddBulkModalOpen] = useState(false);
  const [newBulkName, setNewBulkName] = useState('');
  const [newBulkPrice, setNewBulkPrice] = useState('');
  const [newBulkPlu, setNewBulkPlu] = useState('0150');

  // SKT items list
  const [sktItems, setSktItems] = useState([
    { id: 's1', name: 'Tam Yağlı Süt 1L', batch: 'PRT-902', expiryDate: '2026-10-17', daysLeft: 3, status: 'danger' },
    { id: 's2', name: 'Köy Tipi Tereyağı 500g', batch: 'PRT-881', expiryDate: '2026-10-21', daysLeft: 7, status: 'warning' },
    { id: 's3', name: 'Yoğurt Kaymaklı 1.5kg', batch: 'PRT-920', expiryDate: '2026-10-28', daysLeft: 14, status: 'normal' },
    { id: 's4', name: 'Organik Yumurta 15li', batch: 'PRT-945', expiryDate: '2026-11-05', daysLeft: 22, status: 'normal' }
  ]);

  const handleParseBarcode = () => {
    const raw = testBarcode.trim();
    if (raw.length !== 13) {
      alert("Lütfen geçerli bir 13 haneli EAN-13 terazi barkodu girin.");
      return;
    }
    const prefix = raw.substring(0, 2);
    if (!['27', '28', '29'].includes(prefix)) {
      alert("Bu barkod terazi barkodu formatında değil. Terazi barkodları genellikle 27, 28 veya 29 ile başlar.");
      return;
    }

    const productCode = raw.substring(2, 7);
    const weightRaw = parseInt(raw.substring(7, 12));
    const weightKg = weightRaw / 1000;
    const checksum = raw.substring(12, 13);

    setParsedData({
      prefix,
      productCode,
      weightKg,
      rawWeight: weightRaw,
      checksum,
      raw
    });
    showToast(`⚖️ Terazi barkodu çözümlendi: Kod #${productCode} • ${weightKg.toFixed(3)} kg`);
  };

  const handleSaveBulkToFirestore = async (item: any) => {
    try {
      await addDoc(collection(db, 'products'), withTenant({
        name: `${item.name} (Kg/Gramajlı)`,
        barcode: `28${item.plu.padStart(5, '0')}00000`,
        price: Number(item.pricePerKg || 0),
        purchasePrice: Number(item.pricePerKg * 0.75),
        stock: 50,
        minStock: 10,
        category: 'Manav & Şarküteri',
        hasVariants: false,
        variants: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
      showToast(`⚖️ "${item.name}" gramajlı ürün olarak stok kartına kaydedildi!`);
    } catch (err) {
      console.error(err);
      alert('Stoka kaydedilirken hata oluştu.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Col 1: Terazi Barkod Çözümleme & Hızlı Gramaj */}
      <div className="lg:col-span-7 space-y-6">
        {/* Terazi Barkodu Çözücü */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Scale className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-black text-slate-900 uppercase">Elektronik Terazi Barkod Çözümleme</h3>
            </div>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              EAN-13 (27/28/29)
            </span>
          </div>

          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Şarküteri, manav veya kasaptan basılan terazi barkodunu okutarak ürün kodu ve tartılan gramajı anında sepete aktarabilirsiniz.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Örn: 2801450012503"
              value={testBarcode}
              onChange={e => setTestBarcode(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold tracking-wider"
            />
            <button
              type="button"
              onClick={handleParseBarcode}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <span>Ayrıştır</span>
            </button>
          </div>

          {parsedData && (
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-amber-950">
                <span>Barkod: <code className="font-mono">{parsedData.raw}</code></span>
                <span className="bg-amber-200 px-2 py-0.5 rounded text-[10px]">Önek: {parsedData.prefix}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-amber-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Ürün Kodu (PLU)</p>
                  <p className="text-sm font-black text-slate-800 font-mono">#{parsedData.productCode}</p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Tartılan Gramaj</p>
                  <p className="text-sm font-black text-amber-700">{parsedData.weightKg.toFixed(3)} kg ({parsedData.rawWeight} gr)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hızlı Gramajlı Satış & Fiyat Değiştirme */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase">Hızlı Gramajlı / Açık Ürün Satışı</h3>
              <p className="text-[11px] text-slate-400 font-medium">Manav & Şarküteri kg fiyatı değiştirme ve satış</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddBulkModalOpen(true)}
              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold border border-amber-200 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Gramajlı Ürün Ekle</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Ürün Seç</label>
              <select
                value={selectedBulkItem}
                onChange={e => {
                  const itm = bulkItems.find(b => b.name === e.target.value);
                  setSelectedBulkItem(e.target.value);
                  if (itm) setBulkPricePerKg(itm.pricePerKg);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                {bulkItems.map(item => (
                  <option key={item.id} value={item.name}>
                    {item.name} ({item.pricePerKg} TL/kg)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Ağırlık (Kg)</label>
              <input
                type="number"
                step="0.05"
                value={bulkWeightKg}
                onChange={e => setBulkWeightKg(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-black uppercase text-slate-500">Kg Fiyatı (TL) *</label>
                <span className="text-[10px] text-amber-700 font-bold">Fiyat Değiştir</span>
              </div>
              <input
                type="number"
                value={bulkPricePerKg}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setBulkPricePerKg(val);
                  setBulkItems(prev => prev.map(b => b.name === selectedBulkItem ? { ...b, pricePerKg: val } : b));
                }}
                className="w-full px-3 py-2 bg-amber-50/60 border border-amber-300 rounded-xl text-xs font-black text-amber-950"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900 text-white">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Hesaplanan Tutar:</span>
              <p className="text-xl font-black text-amber-400">
                {(bulkWeightKg * bulkPricePerKg).toFixed(2)} TL
              </p>
              <p className="text-[10px] text-slate-400">{bulkWeightKg} kg × {bulkPricePerKg} TL/kg</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const itm = bulkItems.find(b => b.name === selectedBulkItem);
                  if (itm) handleSaveBulkToFirestore(itm);
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700"
                title="Stok kartı olarak Firestore'a kaydet"
              >
                Stoka Kaydet
              </button>
              <button
                type="button"
                onClick={() => {
                  const calculatedTotal = Number((bulkWeightKg * bulkPricePerKg).toFixed(2));
                  const item = {
                    id: `bakkal_bulk_${Date.now()}`,
                    name: `${selectedBulkItem} (${bulkWeightKg} kg)`,
                    price: calculatedTotal,
                    quantity: 1,
                    stock: 999,
                    category: 'Market / Açık Gramajlı'
                  };
                  if (onAddToCart) onAddToCart(item);
                  else if (onNavigateToPOS) onNavigateToPOS(item);
                  else showToast(`⚖️ ${selectedBulkItem} (${bulkWeightKg} kg) sepete aktarıldı!`);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs shadow-md active:scale-95 transition-all flex items-center gap-1.5"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Satışa Ekle</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Col 2: SKT Takibi */}
      <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-black text-slate-900 uppercase">SKT (Son Kullanma) Takibi</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400">Parti Kontrolü</span>
        </div>

        <div className="space-y-3">
          {sktItems.map(item => (
            <div 
              key={item.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                item.status === 'danger' 
                  ? 'bg-rose-50/60 border-rose-200' 
                  : item.status === 'warning'
                  ? 'bg-amber-50/60 border-amber-200'
                  : 'bg-slate-50/60 border-slate-100'
              }`}
            >
              <div>
                <h4 className="text-xs font-black text-slate-900">{item.name}</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Parti: {item.batch} • SKT: {item.expiryDate}</p>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                item.status === 'danger'
                  ? 'bg-rose-600 text-white animate-pulse'
                  : item.status === 'warning'
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {item.daysLeft} Gün Kaldı
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => showToast("📝 Yeni SKT parti takip kaydı formu açıldı.")}
          className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni SKT Parti Kaydı Ekle</span>
        </button>
      </div>

      {/* Yeni Gramajlı Ürün Ekle Modal */}
      {isAddBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Yeni Gramajlı Ürün Ekle</h3>
              <button onClick={() => setIsAddBulkModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Ürün Adı</label>
                <input
                  type="text"
                  placeholder="Örn: Erzincan Tulum Peyniri"
                  value={newBulkName}
                  onChange={e => setNewBulkName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Kg Fiyatı (TL)</label>
                  <input
                    type="number"
                    placeholder="350"
                    value={newBulkPrice}
                    onChange={e => setNewBulkPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Terazi PLU Kodu</label>
                  <input
                    type="text"
                    value={newBulkPlu}
                    onChange={e => setNewBulkPlu(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddBulkModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newBulkName.trim()) return;
                  const newItem = {
                    id: `b-${Date.now()}`,
                    name: newBulkName.trim(),
                    pricePerKg: parseFloat(newBulkPrice) || 100,
                    plu: newBulkPlu.trim() || '0150'
                  };
                  setBulkItems(prev => [...prev, newItem]);
                  setSelectedBulkItem(newItem.name);
                  setBulkPricePerKg(newItem.pricePerKg);
                  handleSaveBulkToFirestore(newItem);
                  setIsAddBulkModalOpen(false);
                  setNewBulkName('');
                  setNewBulkPrice('');
                }}
                className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold"
              >
                Ekle & Stoğa Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 3. TEKSTİL MODÜLÜ VIEW
// =========================================================================
const TekstilModuluView: React.FC<{ 
  showToast: (m: string) => void; 
  onNavigateToPOS?: (i: any) => void;
  onAddToCart?: (i: any) => void;
  withTenant: (data: any) => any;
  tenantId?: string;
}> = ({ showToast, onNavigateToPOS, onAddToCart, withTenant, tenantId }) => {
  const [selectedProduct, setSelectedProduct] = useState('Polo Yaka Tişört (Örme Pamuk)');
  const [variants, setVariants] = useState([
    { id: 'v1', size: 'S', color: 'Siyah', stock: 18, price: 350 },
    { id: 'v2', size: 'M', color: 'Siyah', stock: 24, price: 350 },
    { id: 'v3', size: 'L', color: 'Siyah', stock: 12, price: 350 },
    { id: 'v4', size: 'XL', color: 'Siyah', stock: 5, price: 350 },
    { id: 'v5', size: 'S', color: 'Beyaz', stock: 14, price: 350 },
    { id: 'v6', size: 'M', color: 'Beyaz', stock: 20, price: 350 },
    { id: 'v7', size: 'L', color: 'Beyaz', stock: 16, price: 350 },
    { id: 'v8', size: 'M', color: 'Haki', stock: 9, price: 350 }
  ]);

  const [editingVariant, setEditingVariant] = useState<any | null>(null);
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState(false);
  const [bulkNewPrice, setBulkNewPrice] = useState('380');
  const [isNewTextileModalOpen, setIsNewTextileModalOpen] = useState(false);
  const [newModelName, setNewModelName] = useState('Oversize Kapüşonlu Sweatshirt');
  const [newModelBasePrice, setNewModelBasePrice] = useState('450');

  // Toplu fiyat güncelleme
  const handleApplyBulkPrice = () => {
    const p = parseFloat(bulkNewPrice) || 0;
    setVariants(prev => prev.map(v => ({ ...v, price: p })));
    showToast(`🏷️ Tüm bedenlerin satış fiyatı ${p} TL olarak güncellendi!`);
    setIsBulkPriceModalOpen(false);
  };

  // Yeni tekstil modelini varyantlarıyla Firestore'a kaydetme
  const handleSaveTextileModelToFirestore = async () => {
    try {
      const basePrice = parseFloat(newModelBasePrice) || 400;
      const modelVariants: ProductVariant[] = [
        { id: `var-s-${Date.now()}`, name: 'S / Siyah', barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(), price: basePrice, stock: 15 },
        { id: `var-m-${Date.now()}`, name: 'M / Siyah', barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(), price: basePrice, stock: 20 },
        { id: `var-l-${Date.now()}`, name: 'L / Siyah', barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(), price: basePrice, stock: 15 },
        { id: `var-xl-${Date.now()}`, name: 'XL / Siyah', barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(), price: basePrice, stock: 10 },
        { id: `var-m-w-${Date.now()}`, name: 'M / Beyaz', barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(), price: basePrice, stock: 18 }
      ];

      await addDoc(collection(db, 'products'), withTenant({
        name: newModelName.trim(),
        barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
        price: basePrice,
        purchasePrice: Number(basePrice * 0.55),
        stock: modelVariants.reduce((a, b) => a + b.stock, 0),
        minStock: 10,
        category: 'Tekstil & Giyim',
        hasVariants: true,
        variants: modelVariants,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));

      setSelectedProduct(newModelName.trim());
      showToast(`👕 "${newModelName}" varyantları ile stok kartı olarak kaydedildi!`);
      setIsNewTextileModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Tekstil ürünü kaydedilirken hata oluştu.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Shirt className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-black text-slate-900 uppercase">Beden & Renk Varyant Matrisi</h3>
          </div>
          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">
            Tekstil Stok Yönetimi
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700">Seçili Model: <strong>{selectedProduct}</strong></span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBulkPriceModalOpen(true)}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-amber-200"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Toplu Fiyat Güncelle</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNewTextileModalOpen(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Varyantlı Model Ekle</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-black uppercase text-[10px]">
                <th className="py-2.5 px-3">Beden</th>
                <th className="py-2.5 px-3">Renk</th>
                <th className="py-2.5 px-3">Mevcut Stok</th>
                <th className="py-2.5 px-3">Satış Fiyatı</th>
                <th className="py-2.5 px-3 text-right">Fiyat & İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variants.map(v => (
                <tr key={v.id} className="hover:bg-slate-50/60 font-semibold text-slate-700">
                  <td className="py-3 px-3">
                    <span className="w-8 h-8 rounded-lg bg-slate-100 font-black text-slate-900 flex items-center justify-center text-xs">
                      {v.size}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-bold">{v.color}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      v.stock < 10 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {v.stock} Adet
                    </span>
                  </td>
                  <td className="py-3 px-3 font-black text-slate-900">
                    {v.price} TL
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const item = {
                            id: `textile_${v.id}_${Date.now()}`,
                            name: `${selectedProduct} (${v.size} - ${v.color})`,
                            price: Number(v.price),
                            quantity: 1,
                            stock: v.stock,
                            category: 'Tekstil & Beden'
                          };
                          if (onAddToCart) onAddToCart(item);
                          else if (onNavigateToPOS) onNavigateToPOS(item);
                          else showToast(`👕 ${selectedProduct} (${v.size} - ${v.color}) sepete eklendi`);
                        }}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black shadow-xs flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" />
                        <span>Satışa Ekle</span>
                      </button>
                      <button
                        onClick={() => setEditingVariant({ ...v })}
                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold border border-amber-200"
                        title="Varyant Fiyatını Değiştir"
                      >
                        Fiyat
                      </button>
                      <button
                        onClick={() => showToast(`🏷️ ${v.size} - ${v.color} askı etiketi yazıcıya gönderildi`)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold"
                      >
                        Etiket Bas
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Askı & Beden Etiket Kartı Önizleme */}
      <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Tag className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-black text-slate-900 uppercase">Sallantı / Askı Etiketi</h3>
        </div>

        {/* Hangtag */}
        <div className="w-56 mx-auto bg-slate-900 text-white p-5 rounded-2xl shadow-xl space-y-4 text-center border-t-8 border-indigo-500 relative">
          <div className="w-3 h-3 rounded-full bg-white mx-auto"></div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Tekstil Koleksiyon</p>
            <h4 className="text-xs font-black uppercase text-white mt-1">{selectedProduct}</h4>
          </div>

          <div className="w-14 h-14 rounded-2xl bg-indigo-600 mx-auto flex items-center justify-center font-black text-2xl text-white shadow-md">
            L
          </div>

          <div className="text-[11px] text-slate-300 font-bold">
            Renk: Siyah (01)
          </div>

          <div className="text-xl font-black text-emerald-400">
            {variants[2]?.price || 350}.00 TL
          </div>

          <div className="text-[9px] font-mono text-slate-400 border-t border-slate-800 pt-2">
            *8690123456789*
          </div>
        </div>

        <button
          type="button"
          onClick={() => showToast("🖨️ Tekstil sallantı etiketleri yazıcıya aktarıldı!")}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md"
        >
          Etiket Şablonunu Yazdır
        </button>
      </div>

      {/* Variant Price Change Modal */}
      {editingVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Varyant Fiyatını Değiştir</h3>
              <button onClick={() => setEditingVariant(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Beden: {editingVariant.size} • Renk: {editingVariant.color}</p>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mt-3 mb-1">Yeni Satış Fiyatı (TL)</label>
              <input
                type="number"
                value={editingVariant.price}
                onChange={e => setEditingVariant({ ...editingVariant, price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingVariant(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setVariants(prev => prev.map(v => v.id === editingVariant.id ? editingVariant : v));
                  showToast(`✅ ${editingVariant.size} (${editingVariant.color}) fiyatı ${editingVariant.price} TL olarak güncellendi!`);
                  setEditingVariant(null);
                }}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu Fiyat Güncelle Modal */}
      {isBulkPriceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Tüm Bedenlerin Fiyatını Güncelle</h3>
              <button onClick={() => setIsBulkPriceModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2 font-medium">Bu işlem listedeki tüm beden ve renklerin fiyatını eşitleyecektir.</p>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Yeni Ortak Fiyat (TL)</label>
              <input
                type="number"
                value={bulkNewPrice}
                onChange={e => setBulkNewPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-amber-50 border border-amber-300 rounded-xl text-sm font-black text-amber-950"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkPriceModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleApplyBulkPrice}
                className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold"
              >
                Tümüne Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Varyantlı Model Ekle Modal */}
      {isNewTextileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Yeni Varyantlı Tekstil Modeli Ekle</h3>
              <button onClick={() => setIsNewTextileModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Model Adı</label>
                <input
                  type="text"
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Satış Fiyatı (TL)</label>
                <input
                  type="number"
                  value={newModelBasePrice}
                  onChange={e => setNewModelBasePrice(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                />
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                S, M, L, XL bedenleri ve Siyah/Beyaz renk varyantları otomatik oluşturularak doğrudan stok kartlarınıza aktarılacaktır.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsNewTextileModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveTextileModelToFirestore}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
              >
                Varyantlarıyla Stoğa Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 4. EŞARP & ŞAL MODÜLÜ VIEW
// =========================================================================
const EsarpSalModuluView: React.FC<{ 
  showToast: (m: string) => void; 
  onNavigateToPOS?: (i: any) => void;
  onAddToCart?: (i: any) => void;
  withTenant: (data: any) => any;
  tenantId?: string;
}> = ({ showToast, onNavigateToPOS, onAddToCart, withTenant, tenantId }) => {
  const fabrics = [
    'İpek', 'Medine İpeği', 'Pamuk', 'Bambu', 'Tafta', 
    'Şifon', 'Viskon', 'Kaşmir', 'Modal', 'Krep'
  ];

  const categories = [
    '90x90 Klasik Eşarp',
    '100x100 Büyük Boy Eşarp',
    '75x190 Standart Şal',
    '80x200 Bambu Şal',
    'Pratik Hazır Bone / Türban'
  ];

  // Kumaş bazlı birim satış fiyatları (Fiyat Değiştirme)
  const [fabricPrices, setFabricPrices] = useState<Record<string, number>>({
    'İpek': 450,
    'Medine İpeği': 220,
    'Pamuk': 140,
    'Bambu': 180,
    'Tafta': 160,
    'Şifon': 130,
    'Viskon': 120,
    'Kaşmir': 350,
    'Modal': 190,
    'Krep': 150
  });

  const [selectedFabric, setSelectedFabric] = useState('Medine İpeği');
  const [selectedCategory, setSelectedCategory] = useState('75x190 Standart Şal');
  const [patternCode, setPatternCode] = useState('DSN-408');
  const [colorVariant, setColorVariant] = useState('Gül Kurusu');

  // Series wholesale package simulation
  const [seriesPackages, setSeriesPackages] = useState([
    { id: 'ser1', name: 'Medine İpeği 12\'li Asorti Seri', pieceCount: 12, packPrice: 1440, singlePrice: 160 },
    { id: 'ser2', name: 'Bambu Şal 6\'lı Yarım Seri Paketi', pieceCount: 6, packPrice: 780, singlePrice: 150 },
    { id: 'ser3', name: 'İpek Eşarp 90x90 6\'lı Desen Serisi', pieceCount: 6, packPrice: 1800, singlePrice: 350 }
  ]);

  const [isAddSeriesModalOpen, setIsAddSeriesModalOpen] = useState(false);
  const [newSeriesForm, setNewSeriesForm] = useState({
    name: 'Koton Şal 10\'lu Karma Seri',
    pieceCount: '10',
    packPrice: '1200',
    singlePrice: '150'
  });

  const [editingSeries, setEditingSeries] = useState<any | null>(null);

  const [isAddEsarpModalOpen, setIsAddEsarpModalOpen] = useState(false);
  const [newEsarpForm, setNewEsarpForm] = useState({
    name: '',
    fabric: 'Medine İpeği',
    category: '75x190 Standart Şal',
    pattern: 'DSN-101',
    color: 'Siyah',
    price: '220',
    stock: '25'
  });

  const handleSaveNewEsarp = async () => {
    try {
      const itemName = newEsarpForm.name || `${newEsarpForm.fabric} ${newEsarpForm.category} (${newEsarpForm.pattern} - ${newEsarpForm.color})`;
      const priceVal = parseFloat(newEsarpForm.price) || fabricPrices[newEsarpForm.fabric] || 150;
      await addDoc(collection(db, 'products'), withTenant({
        name: itemName,
        barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
        price: priceVal,
        purchasePrice: Number((priceVal * 0.6).toFixed(2)),
        stock: parseInt(newEsarpForm.stock) || 20,
        minStock: 5,
        category: 'Eşarp & Şal',
        hasVariants: false,
        variants: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
      showToast(`✨ "${itemName}" başarıyla stoğa ve kataloğa eklendi!`);
      setIsAddEsarpModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Ürün eklenirken hata oluştu.');
    }
  };



  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Kumaş & Desen Kartı Oluşturma */}
      <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-rose-600" />
            <h3 className="text-base font-black text-slate-900 uppercase">Eşarp & Şal Ürün & Varyant Girişi</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAddEsarpModalOpen(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Ürün Ekle</span>
            </button>
            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-rose-50 text-rose-700">
              Kumaş & Desen Kodlama
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-black uppercase text-slate-700">Kumaş Türü & Birim Fiyatı</label>
              <span className="text-[10px] text-rose-700 font-bold">Fiyatlar düzenlenebilir</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fabrics.map(fab => (
                <button
                  key={fab}
                  type="button"
                  onClick={() => setSelectedFabric(fab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    selectedFabric === fab
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <span>{fab}</span>
                  <span className={`text-[10px] font-mono px-1 rounded ${
                    selectedFabric === fab ? 'bg-rose-800 text-white' : 'bg-slate-200 text-slate-800'
                  }`}>
                    {fabricPrices[fab] || 150} ₺
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Seçili Kumaş Fiyatını Değiştirme Kutusu */}
          <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-rose-800 uppercase">Seçili Kumaş Fiyatını Güncelle:</span>
              <p className="text-xs font-black text-slate-900 mt-0.5">{selectedFabric} Satış Fiyatı</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={fabricPrices[selectedFabric] || 150}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setFabricPrices(prev => ({ ...prev, [selectedFabric]: val }));
                }}
                className="w-24 px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-xs font-black text-right"
              />
              <span className="text-xs font-bold text-slate-700">TL</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-1.5">Ebat / Model Kategorisi</label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 mb-1">Desen / Baskı Kodu</label>
              <input
                type="text"
                value={patternCode}
                onChange={e => setPatternCode(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase"
                placeholder="Örn: DSN-102"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 mb-1">Zemin Renk Varyantı</label>
              <input
                type="text"
                value={colorVariant}
                onChange={e => setColorVariant(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                placeholder="Örn: Gül Kurusu / Vizon"
              />
            </div>
          </div>

          {/* Preview & Save to Stock */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200/80 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-rose-800">Oluşturulan Eşarp / Şal Künyesi</p>
              <h4 className="text-sm font-black text-slate-900 mt-0.5">
                {selectedFabric} {selectedCategory}
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Desen: <strong>{patternCode}</strong> • Renk: <strong>{colorVariant}</strong> • Fiyat: <strong>{fabricPrices[selectedFabric] || 150} TL</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const itemName = `${selectedFabric} ${selectedCategory} (${patternCode} - ${colorVariant})`;
                const priceVal = fabricPrices[selectedFabric] || 150;
                try {
                  await addDoc(collection(db, 'products'), withTenant({
                    name: itemName,
                    barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
                    price: priceVal,
                    purchasePrice: Number((priceVal * 0.6).toFixed(2)),
                    stock: 25,
                    minStock: 5,
                    category: 'Eşarp & Şal',
                    hasVariants: false,
                    variants: [],
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                  }));
                  showToast(`✨ "${itemName}" kataloğa kaydedildi!`);
                } catch (e) {
                  console.error(e);
                  alert('Kayıt sırasında hata oluştu.');
                }
              }}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>Stoğa Kaydet</span>
            </button>
          </div>
        </div>
      </div>

      {/* Toptan Seri & Paket Satış */}
      <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase">Toptan Seri & Paket Satış</h3>
          </div>

        </div>

        <div className="space-y-3">
          {seriesPackages.map(ser => (
            <div 
              key={ser.id}
              className="p-3.5 rounded-2xl border border-slate-100 hover:border-rose-200 bg-slate-50/50 hover:bg-rose-50/20 transition-all space-y-2"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-xs font-black text-slate-900">{ser.name}</h4>
                  <span className="text-[10px] text-slate-500">{ser.pieceCount} Adet Asorti Renk</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-rose-700">{ser.packPrice} TL</span>
                  <p className="text-[9px] text-slate-400">Adet başı ~{ser.singlePrice} TL</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSeries({ ...ser })}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold border border-amber-200 flex items-center gap-1"
                >
                  <Coins className="w-3 h-3" />
                  <span>Fiyat Değiştir</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const item = {
                      id: `esarp_seri_${ser.id}_${Date.now()}`,
                      name: `${ser.name} (${ser.pieceCount} Adet Asorti)`,
                      price: Number(ser.packPrice),
                      quantity: 1,
                      stock: 99,
                      category: 'Eşarp & Şal / Toptan Seri'
                    };
                    if (onAddToCart) onAddToCart(item);
                    else if (onNavigateToPOS) onNavigateToPOS(item);
                    else showToast(`📦 "${ser.name}" tam paket olarak satışa eklendi!`);
                  }}
                  className="flex-1 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black shadow-xs active:scale-95 flex items-center justify-center gap-1"
                >
                  <ShoppingCart className="w-3 h-3" />
                  <span>Satışa Ekle</span>
                </button>
                <button
                  type="button"
                  onClick={() => showToast(`✂️ Paket bozuldu: 1 Adet tekli satışa aktarıldı (${ser.singlePrice} TL)`)}
                  className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-bold"
                  title="Seriyi bozup tekli perakende sat"
                >
                  Tek Sat
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Series Price Modal */}
      {editingSeries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Seri Fiyatını Değiştir</h3>
              <button onClick={() => setEditingSeries(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 mb-1">{editingSeries.name}</p>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Paket Fiyatı (TL)</label>
              <input
                type="number"
                value={editingSeries.packPrice}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setEditingSeries({
                    ...editingSeries,
                    packPrice: val,
                    singlePrice: Math.round(val / editingSeries.pieceCount)
                  });
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSeries(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setSeriesPackages(prev => prev.map(s => s.id === editingSeries.id ? editingSeries : s));
                  showToast(`✅ "${editingSeries.name}" fiyatı ${editingSeries.packPrice} TL olarak güncellendi!`);
                  setEditingSeries(null);
                }}
                className="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Eşarp / Şal Ürünü Ekle Modal */}
      {isAddEsarpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Yeni Eşarp / Şal Ürünü Ekle</h3>
              <button onClick={() => setIsAddEsarpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Ürün / Özel Adı (Opsiyonel)</label>
                <input
                  type="text"
                  value={newEsarpForm.name}
                  onChange={e => setNewEsarpForm({ ...newEsarpForm, name: e.target.value })}
                  placeholder="Örn: Özel Tasarım İpek Şal"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Kumaş Türü</label>
                  <select
                    value={newEsarpForm.fabric}
                    onChange={e => setNewEsarpForm({ ...newEsarpForm, fabric: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  >
                    {fabrics.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Ebat / Kategori</label>
                  <select
                    value={newEsarpForm.category}
                    onChange={e => setNewEsarpForm({ ...newEsarpForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Desen Kodu</label>
                  <input
                    type="text"
                    value={newEsarpForm.pattern}
                    onChange={e => setNewEsarpForm({ ...newEsarpForm, pattern: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Renk</label>
                  <input
                    type="text"
                    value={newEsarpForm.color}
                    onChange={e => setNewEsarpForm({ ...newEsarpForm, color: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Satış Fiyatı (TL)</label>
                  <input
                    type="number"
                    value={newEsarpForm.price}
                    onChange={e => setNewEsarpForm({ ...newEsarpForm, price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Başlangıç Stoğu</label>
                  <input
                    type="number"
                    value={newEsarpForm.stock}
                    onChange={e => setNewEsarpForm({ ...newEsarpForm, stock: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddEsarpModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveNewEsarp}
                className="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold"
              >
                Stoğa Ekle
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

// =========================================================================
// 5. KOZMETİK MODÜLÜ VIEW
// =========================================================================
const KozmetikModuluView: React.FC<{ 
  showToast: (m: string) => void; 
  onNavigateToPOS?: (i: any) => void;
  onAddToCart?: (i: any) => void;
  withTenant: (data: any) => any;
  tenantId?: string;
}> = ({ showToast, onNavigateToPOS, onAddToCart, withTenant, tenantId }) => {
  const [shades, setShades] = useState([
    { id: 'c1', code: '#01', name: 'Porselen / Açık', type: 'Fondöten', price: 420, testerStock: 1, sellStock: 14, pao: '12M' },
    { id: 'c2', code: '#02', name: 'Naturel Bej', type: 'Fondöten', price: 420, testerStock: 2, sellStock: 22, pao: '12M' },
    { id: 'c3', code: '#03', name: 'Buğday / Sıcak', type: 'Fondöten', price: 420, testerStock: 1, sellStock: 18, pao: '12M' },
    { id: 'c4', code: '#104', name: 'Klasik Kırmızı', type: 'Mat Ruj', price: 280, testerStock: 2, sellStock: 30, pao: '24M' },
    { id: 'c5', code: '#210', name: 'Nude Kahve', type: 'Mat Ruj', price: 280, testerStock: 1, sellStock: 25, pao: '24M' }
  ]);

  const [editingShade, setEditingShade] = useState<any | null>(null);
  const [setPrice, setSetPrice] = useState(790);
  const [isEditingSetPrice, setIsEditingSetPrice] = useState(false);
  const [isAddCosmeticModalOpen, setIsAddCosmeticModalOpen] = useState(false);
  const [newCosmeticForm, setNewCosmeticForm] = useState({
    code: '#04',
    name: 'Mat Likit Ruj',
    type: 'Ruj',
    price: '290',
    testerStock: '2',
    sellStock: '30',
    pao: '24M'
  });

  const handleSaveNewCosmetic = async () => {
    try {
      const itemName = `${newCosmeticForm.type} (${newCosmeticForm.code} ${newCosmeticForm.name})`;
      const priceVal = parseFloat(newCosmeticForm.price) || 280;
      await addDoc(collection(db, 'products'), withTenant({
        name: itemName,
        barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
        price: priceVal,
        purchasePrice: Number((priceVal * 0.5).toFixed(2)),
        stock: parseInt(newCosmeticForm.sellStock) || 20,
        minStock: 5,
        category: 'Kozmetik & Tester',
        hasVariants: false,
        variants: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
      showToast(`💄 "${itemName}" kozmetik ürünü stoğa eklendi!`);
      setIsAddCosmeticModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Kozmetik ürünü eklenirken hata oluştu.');
    }
  };



  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-black text-slate-900 uppercase">Renk / Ton / Tester Stok & Fiyat Takibi</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsAddCosmeticModalOpen(true)}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Ürün Ekle</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-black uppercase text-[10px]">
                <th className="py-2.5 px-3">Ton Kodu</th>
                <th className="py-2.5 px-3">Ton Adı / Ürün</th>
                <th className="py-2.5 px-3">Tester</th>
                <th className="py-2.5 px-3">Satış Stoğu</th>
                <th className="py-2.5 px-3">Fiyat (TL)</th>
                <th className="py-2.5 px-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shades.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60 font-semibold text-slate-700">
                  <td className="py-3 px-3 font-mono font-black text-purple-700">{s.code}</td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">{s.name}</div>
                    <span className="text-[10px] text-slate-400">{s.type}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">
                      {s.testerStock} Tester
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                      {s.sellStock} Adet
                    </span>
                  </td>
                  <td className="py-3 px-3 font-black text-slate-900">
                    {s.price} TL
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const item = {
                            id: `kozmetik_${s.id}_${Date.now()}`,
                            name: `${s.type} (${s.code} ${s.name})`,
                            price: Number(s.price),
                            quantity: 1,
                            stock: s.sellStock,
                            category: 'Kozmetik & Tester'
                          };
                          if (onAddToCart) onAddToCart(item);
                          else if (onNavigateToPOS) onNavigateToPOS(item);
                          else showToast(`💄 ${s.code} ${s.name} satışa eklendi`);
                        }}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-black shadow-xs flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" />
                        <span>Satışa Ekle</span>
                      </button>
                      <button
                        onClick={() => setEditingShade({ ...s })}
                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold border border-amber-200"
                        title="Fiyat Değiştir"
                      >
                        Fiyat
                      </button>

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Box className="w-5 h-5 text-purple-600" />
          <h3 className="text-sm font-black text-slate-900 uppercase">Set & Paket Ürün Yönetimi</h3>
        </div>

        <p className="text-xs text-slate-500 font-medium">
          Makyaj sandığı, parfüm + losyon setleri veya özel gün kutularını tek barkodla set olarak satabilirsiniz.
        </p>

        <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-xs font-black text-purple-950">Makyaj Başlangıç Seti</h4>
              <p className="text-[10px] text-purple-800">1x Fondöten + 1x Ruj + 1x Maskara + Hediye Çanta</p>
            </div>
            <button
              onClick={() => setIsEditingSetPrice(!isEditingSetPrice)}
              className="text-[10px] text-purple-700 font-bold hover:underline"
            >
              Fiyat Değiştir
            </button>
          </div>

          {isEditingSetPrice && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                value={setPrice}
                onChange={e => setSetPrice(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-1 bg-white border border-purple-300 rounded text-xs font-black"
              />
              <button
                onClick={() => {
                  setIsEditingSetPrice(false);
                  showToast(`🎁 Set fiyatı ${setPrice} TL olarak güncellendi!`);
                }}
                className="px-2 py-1 bg-purple-700 text-white rounded text-[10px] font-bold"
              >
                Kaydet
              </button>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <span className="text-sm font-black text-purple-900">{setPrice} TL</span>
            <button
              onClick={() => showToast("🎁 Hediye seti sepete eklendi")}
              className="px-3 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-[10px] font-bold"
            >
              Set Olarak Sat
            </button>
          </div>
        </div>
      </div>

      {/* Shade Price Edit Modal */}
      {editingShade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Ton Fiyatını Değiştir</h3>
              <button onClick={() => setEditingShade(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 mb-1">{editingShade.code} {editingShade.name}</p>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Satış Fiyatı (TL)</label>
              <input
                type="number"
                value={editingShade.price}
                onChange={e => setEditingShade({ ...editingShade, price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingShade(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setShades(prev => prev.map(s => s.id === editingShade.id ? editingShade : s));
                  showToast(`✅ ${editingShade.code} fiyatı ${editingShade.price} TL olarak güncellendi!`);
                  setEditingShade(null);
                }}
                className="px-5 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Kozmetik Ürünü Ekle Modal */}
      {isAddCosmeticModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Yeni Kozmetik / Tester Ürünü Ekle</h3>
              <button onClick={() => setIsAddCosmeticModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Ton / Renk Kodu</label>
                  <input
                    type="text"
                    value={newCosmeticForm.code}
                    onChange={e => setNewCosmeticForm({ ...newCosmeticForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Ürün Tipi</label>
                  <input
                    type="text"
                    value={newCosmeticForm.type}
                    onChange={e => setNewCosmeticForm({ ...newCosmeticForm, type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Ton / Ürün Adı</label>
                <input
                  type="text"
                  value={newCosmeticForm.name}
                  onChange={e => setNewCosmeticForm({ ...newCosmeticForm, name: e.target.value })}
                  placeholder="Örn: Naturel Bej"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Fiyat (TL)</label>
                  <input
                    type="number"
                    value={newCosmeticForm.price}
                    onChange={e => setNewCosmeticForm({ ...newCosmeticForm, price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Tester Adet</label>
                  <input
                    type="number"
                    value={newCosmeticForm.testerStock}
                    onChange={e => setNewCosmeticForm({ ...newCosmeticForm, testerStock: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Satış Stok</label>
                  <input
                    type="number"
                    value={newCosmeticForm.sellStock}
                    onChange={e => setNewCosmeticForm({ ...newCosmeticForm, sellStock: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddCosmeticModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveNewCosmetic}
                className="px-5 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
              >
                Stoğa Ekle
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

// =========================================================================
// 6. TUHAFİYE MODÜLÜ VIEW
// =========================================================================
const TuhafiyeModuluView: React.FC<{ 
  showToast: (m: string) => void; 
  onNavigateToPOS?: (i: any) => void;
  onAddToCart?: (i: any) => void;
  withTenant: (data: any) => any;
  tenantId?: string;
}> = ({ showToast, onNavigateToPOS, onAddToCart, withTenant, tenantId }) => {
  const [meterLength, setMeterLength] = useState<number>(2.75);
  const [meterPrice, setMeterPrice] = useState<number>(35);
  const [selectedFabricItem, setSelectedFabricItem] = useState('Güpür Dantel (Geniş 8cm)');

  const [yarnLots, setYarnLots] = useState([
    { id: 'y1', brand: 'Alize', model: 'Cotton Gold', colorCode: 'K-60 Siyah', lotNo: 'LOT-9421', stock: 32, price: 65 },
    { id: 'y2', brand: 'Alize', model: 'Cotton Gold', colorCode: 'K-60 Siyah', lotNo: 'LOT-9805', stock: 14, price: 65 },
    { id: 'y3', brand: 'Nako', model: 'Elit Baby', colorCode: 'M-12 Su Yeşili', lotNo: 'LOT-3312', stock: 28, price: 55 },
    { id: 'y4', brand: 'Himalaya', model: 'Dolphin Baby', colorCode: 'P-05 Pudra', lotNo: 'LOT-7740', stock: 40, price: 75 }
  ]);

  const [editingYarn, setEditingYarn] = useState<any | null>(null);

  const [isAddTuhafiyeModalOpen, setIsAddTuhafiyeModalOpen] = useState(false);
  const [newTuhafiyeForm, setNewTuhafiyeForm] = useState({
    name: 'Cotton Gold Yumak',
    category: 'Örgü İpliği',
    price: '65',
    stock: '40',
    lotNo: 'LOT-5512',
    colorCode: 'Bej'
  });

  const handleSaveNewTuhafiye = async () => {
    try {
      const itemName = `${newTuhafiyeForm.name} (${newTuhafiyeForm.colorCode} - ${newTuhafiyeForm.lotNo})`;
      const priceVal = parseFloat(newTuhafiyeForm.price) || 50;
      await addDoc(collection(db, 'products'), withTenant({
        name: itemName,
        barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
        price: priceVal,
        purchasePrice: Number((priceVal * 0.6).toFixed(2)),
        stock: parseInt(newTuhafiyeForm.stock) || 25,
        minStock: 5,
        category: 'Tuhafiye & Dikiş',
        hasVariants: false,
        variants: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
      showToast(`✂️ "${itemName}" tuhafiye ürünü stoğa eklendi!`);
      setIsAddTuhafiyeModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Tuhafiye ürünü eklenirken hata oluştu.');
    }
  };



  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Metraj / Küsüratlı Satış */}
      <div className="lg:col-span-6 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Scissors className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-black text-slate-900 uppercase">Metre / Küsüratlı Satış</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAddTuhafiyeModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Ürün Ekle</span>
            </button>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
              Kurdela, Dantel, Lastik
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-1">Ürün</label>
            <select
              value={selectedFabricItem}
              onChange={e => {
                setSelectedFabricItem(e.target.value);
                if (e.target.value.includes('35')) setMeterPrice(35);
                if (e.target.value.includes('12')) setMeterPrice(12);
                if (e.target.value.includes('18')) setMeterPrice(18);
                if (e.target.value.includes('25')) setMeterPrice(25);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="Güpür Dantel (Geniş 8cm)">Güpür Dantel (Geniş 8cm) - 35 TL/m</option>
              <option value="Saten Kurdela 2cm">Saten Kurdela 2cm - 12 TL/m</option>
              <option value="Dokuma Lastik 3cm">Dokuma Lastik 3cm - 18 TL/m</option>
              <option value="Gizli Fermuar 50cm">Gizli Fermuar 50cm - 25 TL/adet</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 mb-1">Ölçülen Metre</label>
              <input
                type="number"
                step="0.05"
                value={meterLength}
                onChange={e => setMeterLength(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-black uppercase text-slate-700">Metre Fiyatı (TL) *</label>
                <span className="text-[10px] text-emerald-700 font-bold">Fiyat Değiştir</span>
              </div>
              <input
                type="number"
                value={meterPrice}
                onChange={e => setMeterPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 bg-emerald-50/60 border border-emerald-300 rounded-xl text-sm font-bold font-mono text-emerald-950"
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between mt-2">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Hesaplanan Tutar:</span>
              <p className="text-xl font-black text-emerald-400">
                {(meterLength * meterPrice).toFixed(2)} TL
              </p>
              <p className="text-[10px] text-slate-400">{meterLength} metre × {meterPrice} TL</p>
            </div>
            <div className="flex gap-2">

              <button
                type="button"
                onClick={() => {
                  const calculatedTotal = Number((meterLength * meterPrice).toFixed(2));
                  const item = {
                    id: `tuhafiye_meter_${Date.now()}`,
                    name: `${selectedFabricItem} (${meterLength} m)`,
                    price: calculatedTotal,
                    quantity: 1,
                    stock: 999,
                    category: 'Tuhafiye & Metraj'
                  };
                  if (onAddToCart) onAddToCart(item);
                  else if (onNavigateToPOS) onNavigateToPOS(item);
                  else showToast(`✂️ ${selectedFabricItem} (${meterLength} m) satışa aktarıldı!`);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md active:scale-95 flex items-center gap-1.5"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Satışa Ekle</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* İplik Lot & Renk Kodu Eşleştirme */}
      <div className="lg:col-span-6 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase">Örgü İpliği Lot & Fiyat Takibi</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400">Lot Parti Eşleştirme</span>
        </div>

        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
          Kazak veya hırka ören müşteriler için aynı renk tonunun tutması amacıyla aynı parti (LOT) numaralı yumakları eşleştirebilir ve yumak fiyatlarını güncelleyebilirsiniz.
        </p>

        <div className="space-y-2.5">
          {yarnLots.map(y => (
            <div key={y.id} className="p-3 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-900">{y.brand} - {y.model}</h4>
                <p className="text-[10px] text-slate-500">
                  Renk: {y.colorCode} • <strong className="text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-mono">{y.lotNo}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 bg-white border px-2 py-1 rounded-lg">
                  {y.price} ₺
                </span>
                <span className="text-xs font-bold text-slate-600 bg-white border px-2 py-1 rounded-lg">
                  {y.stock} Yumak
                </span>
                <button
                  type="button"
                  onClick={() => setEditingYarn({ ...y })}
                  className="p-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg border border-amber-200"
                  title="Yumak Fiyatını Değiştir"
                >
                  <Coins className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Yarn Price Edit Modal */}
      {editingYarn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Yumak Fiyatını Değiştir</h3>
              <button onClick={() => setEditingYarn(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 mb-1">{editingYarn.brand} {editingYarn.model} ({editingYarn.lotNo})</p>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Yumak Fiyatı (TL)</label>
              <input
                type="number"
                value={editingYarn.price}
                onChange={e => setEditingYarn({ ...editingYarn, price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingYarn(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setYarnLots(prev => prev.map(y => y.id === editingYarn.id ? editingYarn : y));
                  showToast(`✅ ${editingYarn.brand} yumak fiyatı ${editingYarn.price} TL olarak güncellendi!`);
                  setEditingYarn(null);
                }}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Tuhafiye Ürünü Ekle Modal */}
      {isAddTuhafiyeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-slate-900">Yeni Tuhafiye / Metraj / İplik Ürünü Ekle</h3>
              <button onClick={() => setIsAddTuhafiyeModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Ürün / Marka Adı</label>
                <input
                  type="text"
                  value={newTuhafiyeForm.name}
                  onChange={e => setNewTuhafiyeForm({ ...newTuhafiyeForm, name: e.target.value })}
                  placeholder="Örn: Alize Cotton Gold"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Kategori</label>
                  <input
                    type="text"
                    value={newTuhafiyeForm.category}
                    onChange={e => setNewTuhafiyeForm({ ...newTuhafiyeForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Birim Fiyat (TL)</label>
                  <input
                    type="number"
                    value={newTuhafiyeForm.price}
                    onChange={e => setNewTuhafiyeForm({ ...newTuhafiyeForm, price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Stok Miktarı</label>
                  <input
                    type="number"
                    value={newTuhafiyeForm.stock}
                    onChange={e => setNewTuhafiyeForm({ ...newTuhafiyeForm, stock: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Lot No</label>
                  <input
                    type="text"
                    value={newTuhafiyeForm.lotNo}
                    onChange={e => setNewTuhafiyeForm({ ...newTuhafiyeForm, lotNo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Renk Kodu</label>
                  <input
                    type="text"
                    value={newTuhafiyeForm.colorCode}
                    onChange={e => setNewTuhafiyeForm({ ...newTuhafiyeForm, colorCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddTuhafiyeModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveNewTuhafiye}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
              >
                Stoğa Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
