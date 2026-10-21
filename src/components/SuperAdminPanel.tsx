import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, ShieldCheck, DollarSign, Calendar, Plus, Trash2, 
  CheckCircle2, AlertTriangle, Lock, Unlock, CreditCard, Clock, Search, 
  ExternalLink, Sparkles, X, RefreshCw, Award, Sliders, ToggleLeft, 
  ToggleRight, Barcode, ShoppingCart, Landmark, Truck, FileText, 
  Package, FileSpreadsheet, Camera, Receipt, LayoutDashboard, 
  ShieldAlert, Check, Layers, Filter, CheckSquare, MessageCircle,
  Printer, Scale, Shirt, Palette, Scissors, Store, Smartphone, Monitor
} from 'lucide-react';
import { collection, query, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, DEFAULT_ADMIN_PERMISSIONS, STORE_STAFF_PERMISSIONS, FIELD_STAFF_PERMISSIONS } from '../context/AuthContext';
import { 
  TenantInfo, 
  PRIMARY_TENANT_ID, 
  AVAILABLE_TENANT_FEATURES, 
  getDefaultModulesForPackage,
  isTenantFeatureEnabled,
  TenantFeature,
  getRemainingDuration,
  SECTORAL_MODULES,
  isTenantSectorModuleEnabled,
  isSepetayTenant,
  SEPETAY_LEGACY_APPLET_ID
} from '../lib/tenant';
import { format, isAfter, addDays, addMonths, addYears, parseISO } from 'date-fns';

export const SuperAdminPanel: React.FC = () => {
  const { isSuperAdmin, switchTenant, tenantId } = useAuth();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active sub-tab in Super Admin Panel: 'tenants' | 'features' | 'pricing_settings'
  const [activeSubTab, setActiveSubTab] = useState<'tenants' | 'features' | 'pricing_settings'>('tenants');

  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('+905382516406');
  const [pricingPlans, setPricingPlans] = useState<any[]>([
    {
      id: 'baslangic',
      title: 'Başlangıç',
      priceMonthly: '₺299',
      priceYearly: '₺2,999',
      features: ['Hızlı Satış (POS)', 'Stok Yönetimi', 'Basit Raporlar', '1 Kullanıcı']
    },
    {
      id: 'standart',
      title: 'Standart',
      priceMonthly: '₺599',
      priceYearly: '₺5,999',
      features: ['Tüm Başlangıç Özellikleri', 'Saha Sipariş Yönetimi', 'Detaylı Cari Takibi', 'Öncelikli Güncellemeler'],
      highlight: true
    },
    {
      id: 'pro',
      title: 'Pro',
      priceMonthly: '₺999',
      priceYearly: '₺9,999',
      features: ['Tüm Standart Özellikleri', 'Gelişmiş Prim Raporları', 'Çoklu Depo / Şube', '7/24 Özel Destek']
    },
    {
      id: 'enterprise',
      title: 'Enterprise',
      priceMonthly: '₺1,999',
      priceYearly: '₺19,999',
      features: ['Özel Sunucu / Sınırsız Şube', 'Özel API Entegrasyonları', 'Sınırsız Kullanıcı', 'Özel Müşteri Temsilcisi']
    }
  ]);
  const [newFeatureInputs, setNewFeatureInputs] = useState<{ [planId: string]: string }>({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_settings', 'pricing_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.whatsappNumber) setAdminWhatsappNumber(data.whatsappNumber);
        if (data.plans && Array.isArray(data.plans)) setPricingPlans(data.plans);
      }
    }, (err) => {
      console.warn("Pricing config load warning:", err);
    });
    return () => unsub();
  }, []);

  const handleSavePricingConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'system_settings', 'pricing_config'), {
        whatsappNumber: adminWhatsappNumber.trim(),
        plans: pricingPlans,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast("✅ Paket fiyatları ve iletişim numarası güncellendi ve tüm kiracılara yansıtıldı!");
    } catch (err: any) {
      console.error(err);
      alert("Kaydedilirken hata oluştu: " + err.message);
    }
  };

  // Selected Tenant for Feature / Module Permissions Tab
  const [selectedTenantId, setSelectedTenantId] = useState<string>(PRIMARY_TENANT_ID);
  const [featureSearchQuery, setFeatureSearchQuery] = useState('');
  const [featureCategoryFilter, setFeatureCategoryFilter] = useState<string>('Tümü');

  // New Tenant Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    adminUsername: '',
    adminPassword: '123',
    package: 'pro' as 'standart' | 'pro' | 'enterprise',
    phone: '',
    address: '',
    initialDurationDays: 30,
    enabledModules: getDefaultModulesForPackage('pro'),
    modules: {
      kirtasiye_modulu: false,
      bakkal_market_modulu: false,
      tekstil_modulu: false,
      esarp_sal_modulu: false,
      kozmetik_modulu: false,
      tuhafiye_modulu: false
    }
  });

  // Payment / Renew Modal
  const [renewTenant, setRenewTenant] = useState<TenantInfo | null>(null);
  const [editingTenant, setEditingTenant] = useState<TenantInfo | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('599');
  const [paymentMethod, setPaymentMethod] = useState<'Nakit' | 'Havale' | 'Kredi Kartı'>('Havale');
  const [extensionDays, setExtensionDays] = useState(30);
  const [renewalType, setRenewalType] = useState<'preset' | 'custom'>('preset');
  const [customYears, setCustomYears] = useState(0);
  const [customMonths, setCustomMonths] = useState(0);
  const [customDays, setCustomDays] = useState(0);

  const handleSaveTenantEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    try {
      await updateDoc(doc(db, 'tenants', editingTenant.id), {
        name: editingTenant.name.trim(),
        code: (editingTenant.code || '').trim().toUpperCase(),
        phone: editingTenant.phone?.trim() || '',
        package: editingTenant.package || 'pro',
        modules: editingTenant.modules || {},
        enabledModules: editingTenant.enabledModules || {},
        updatedAt: serverTimestamp()
      });
      showToast(`✅ ${editingTenant.name} bilgileri güncellendi!`);
      setEditingTenant(null);
    } catch (err: any) {
      console.error(err);
      alert("Kiracı güncellenirken hata oluştu: " + err.message);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tenants'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as TenantInfo));
      setTenants(list);
      setLoading(false);

      // Keep selectedTenantId valid
      if (list.length > 0 && !list.some(t => t.id === selectedTenantId)) {
        setSelectedTenantId(list[0].id);
      }
    }, (err) => {
      console.warn("Tenants error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const currentSelectedTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0] || null;

  // Toggle a single feature for the selected tenant
  const handleToggleTenantFeature = async (targetTenant: TenantInfo, featureId: string) => {
    const currentEnabled = isTenantFeatureEnabled(targetTenant, featureId);
    const newStatus = !currentEnabled;

    const currentModules = targetTenant.enabledModules || getDefaultModulesForPackage(targetTenant.package || 'pro');
    const updatedModules: Record<string, boolean> = {
      ...currentModules,
      [featureId]: newStatus
    };

    const currentSectoral = targetTenant.modules || {};
    const updatedSectoral: Record<string, boolean> = {
      ...currentSectoral,
      [featureId]: newStatus
    };

    try {
      await updateDoc(doc(db, 'tenants', targetTenant.id), {
        enabledModules: updatedModules,
        modules: updatedSectoral,
        updatedAt: serverTimestamp()
      });

      const featureDef = AVAILABLE_TENANT_FEATURES.find(f => f.id === featureId);
      const featureName = featureDef ? featureDef.name : featureId;
      showToast(
        newStatus 
          ? `✅ "${featureName}" özelliği ${targetTenant.name} için açıldı!` 
          : `⚠️ "${featureName}" özelliği ${targetTenant.name} için kapatıldı/kaldırıldı!`
      );
    } catch (err: any) {
      console.error(err);
      alert("Özellik yetkisi güncellenemedi: " + err.message);
    }
  };

  // Bulk Apply Preset or All On/Off
  const handleApplyFeaturePreset = async (targetTenant: TenantInfo, preset: 'all_on' | 'all_off' | 'standart' | 'pro' | 'enterprise') => {
    let updatedModules: Record<string, boolean> = {};

    if (preset === 'all_on') {
      AVAILABLE_TENANT_FEATURES.forEach(f => {
        updatedModules[f.id] = true;
      });
    } else if (preset === 'all_off') {
      AVAILABLE_TENANT_FEATURES.forEach(f => {
        updatedModules[f.id] = false;
      });
    } else {
      updatedModules = getDefaultModulesForPackage(preset);
    }

    try {
      await updateDoc(doc(db, 'tenants', targetTenant.id), {
        enabledModules: updatedModules,
        updatedAt: serverTimestamp()
      });
      showToast(`🎯 ${targetTenant.name} için "${preset.toUpperCase()}" şablonu başarıyla uygulandı.`);
    } catch (err: any) {
      console.error(err);
      alert("Şablon uygulanamadı: " + err.message);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Lütfen işletme adı girin.");
      return;
    }

    try {
      const slug = formData.code.trim() || formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const newId = `tenant-${slug}`;
      const code = (formData.code || slug.slice(0, 6)).toUpperCase();
      const adminUser = (formData.adminUsername || `admin_${code.toLowerCase()}`).trim().toLowerCase();
      const initialDays = Number(formData.initialDurationDays) || 30;
      const expires = addDays(new Date(), initialDays).toISOString();

      const newTenant: TenantInfo = {
        id: newId,
        name: formData.name.trim(),
        code,
        status: 'active',
        package: formData.package,
        expiresAt: expires,
        adminUsername: adminUser,
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        enabledModules: formData.enabledModules || getDefaultModulesForPackage(formData.package),
        modules: formData.modules || {
          kirtasiye_modulu: false,
          bakkal_market_modulu: false,
          tekstil_modulu: false,
          esarp_sal_modulu: false,
          kozmetik_modulu: false,
          tuhafiye_modulu: false
        },
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'tenants', newId), newTenant);

      // Create admin user
      await setDoc(doc(db, 'users', `admin-${newId}`), {
        uid: `admin-${newId}`,
        id: `admin-${newId}`,
        username: adminUser,
        password: formData.adminPassword.trim() || '123',
        displayName: `${formData.name} Yöneticisi`,
        role: 'admin',
        staffType: 'admin',
        sellerCode: 'Y01',
        tenantId: newId,
        tenantName: formData.name.trim(),
        permissions: DEFAULT_ADMIN_PERMISSIONS,
        createdAt: new Date().toISOString()
      });

      // Create store staff
      await setDoc(doc(db, 'users', `kasiyer-${newId}`), {
        uid: `kasiyer-${newId}`,
        id: `kasiyer-${newId}`,
        username: `kasiyer_${code.toLowerCase()}`,
        password: '123',
        displayName: `${formData.name} Kasiyeri`,
        role: 'staff',
        staffType: 'store',
        sellerCode: 'K01',
        tenantId: newId,
        tenantName: formData.name.trim(),
        permissions: STORE_STAFF_PERMISSIONS,
        createdAt: new Date().toISOString()
      });

      // Create field staff
      await setDoc(doc(db, 'users', `saha-${newId}`), {
        uid: `saha-${newId}`,
        id: `saha-${newId}`,
        username: `saha_${code.toLowerCase()}`,
        password: '123',
        displayName: `${formData.name} Saha Satış`,
        role: 'staff',
        staffType: 'field',
        sellerCode: 'S01',
        tenantId: newId,
        tenantName: formData.name.trim(),
        permissions: FIELD_STAFF_PERMISSIONS,
        createdAt: new Date().toISOString()
      });

      showToast(`🎉 "${formData.name}" kiracısı başarıyla oluşturuldu!`);
      setIsAddModalOpen(false);
      setFormData({ 
        name: '', 
        code: '', 
        adminUsername: '', 
        adminPassword: '123', 
        package: 'pro', 
        phone: '', 
        address: '',
        initialDurationDays: 30,
        enabledModules: getDefaultModulesForPackage('pro'),
        modules: {
          kirtasiye_modulu: false,
          bakkal_market_modulu: false,
          tekstil_modulu: false,
          esarp_sal_modulu: false,
          kozmetik_modulu: false,
          tuhafiye_modulu: false
        }
      });
    } catch (err: any) {
      console.error(err);
      alert("Kiracı oluşturulurken hata: " + err.message);
    }
  };

  const handleToggleSuspend = async (t: TenantInfo) => {
    const nextStatus = t.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateDoc(doc(db, 'tenants', t.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      showToast(`Kiracı durumu güncellendi: ${nextStatus === 'suspended' ? 'Askıya Alındı' : 'Aktif'}`);
    } catch (e) {
      console.error(e);
      alert("Durum güncellenemedi.");
    }
  };

  const handleChangePackage = async (tenantId: string, pkg: 'standart' | 'pro' | 'enterprise') => {
    try {
      await updateDoc(doc(db, 'tenants', tenantId), {
        package: pkg,
        updatedAt: serverTimestamp()
      });
      showToast(`Paket güncellendi: ${pkg.toUpperCase()}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenewSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewTenant) return;

    try {
      const currentExpiry = renewTenant.expiresAt ? parseISO(renewTenant.expiresAt) : new Date();
      const baseDate = isAfter(currentExpiry, new Date()) ? currentExpiry : new Date();
      let targetDate = baseDate;
      let durationDescription = '';

      if (renewalType === 'custom') {
        if (customYears > 0) targetDate = addYears(targetDate, Number(customYears));
        if (customMonths > 0) targetDate = addMonths(targetDate, Number(customMonths));
        if (customDays > 0) targetDate = addDays(targetDate, Number(customDays));

        const parts: string[] = [];
        if (customYears > 0) parts.push(`${customYears} Yıl`);
        if (customMonths > 0) parts.push(`${customMonths} Ay`);
        if (customDays > 0) parts.push(`${customDays} Gün`);
        durationDescription = parts.join(' ') || '1 Gün';
      } else {
        targetDate = addDays(baseDate, Number(extensionDays) || 30);
        durationDescription = `${extensionDays} Gün`;
      }

      const newExpiry = targetDate.toISOString();

      await updateDoc(doc(db, 'tenants', renewTenant.id), {
        status: 'active',
        expiresAt: newExpiry,
        lastPaymentDate: new Date().toISOString(),
        lastPaymentAmount: parseFloat(paymentAmount) || 0,
        lastPaymentMethod: paymentMethod,
        updatedAt: serverTimestamp()
      });

      showToast(`✅ Abonelik uzatıldı ve ödeme kaydedildi (${durationDescription}).`);
      setRenewTenant(null);
      setCustomYears(0);
      setCustomMonths(0);
      setCustomDays(0);
    } catch (e: any) {
      console.error(e);
      alert("Abonelik uzatılamadı: " + e.message);
    }
  };

  const handleDeleteTenant = async (t: TenantInfo) => {
    if (!window.confirm(`⚠️ DİKKAT: "${t.name}" kiracısını ve tüm verilerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) return;
    try {
      await deleteDoc(doc(db, 'tenants', t.id));
      showToast(`Kiracı silindi.`);
    } catch (e) {
      console.error(e);
      alert("Silme başarısız.");
    }
  };

  // Helper icon renderer for each feature
  const renderFeatureIcon = (featureId: string) => {
    switch (featureId) {
      case 'barcode': return <Barcode className="w-5 h-5 text-indigo-600" />;
      case 'pos': return <ShoppingCart className="w-5 h-5 text-blue-600" />;
      case 'mobile_pos_sync': return <Smartphone className="w-5 h-5 text-indigo-600" />;
      case 'kasa': return <Landmark className="w-5 h-5 text-emerald-600" />;
      case 'field_orders': return <Truck className="w-5 h-5 text-amber-600" />;
      case 'quotations': return <FileText className="w-5 h-5 text-violet-600" />;
      case 'inventory': return <Package className="w-5 h-5 text-cyan-600" />;
      case 'excel_import': return <FileSpreadsheet className="w-5 h-5 text-emerald-700" />;
      case 'stock_reset': return <RefreshCw className="w-5 h-5 text-rose-600" />;
      case 'camera_scanner': return <Camera className="w-5 h-5 text-purple-600" />;
      case 'customers': return <Users className="w-5 h-5 text-blue-700" />;
      case 'suppliers': return <Building2 className="w-5 h-5 text-slate-700" />;
      case 'expenses': return <Receipt className="w-5 h-5 text-rose-500" />;
      case 'dashboard': return <LayoutDashboard className="w-5 h-5 text-indigo-700" />;
      case 'personnel': return <ShieldCheck className="w-5 h-5 text-teal-600" />;
      case 'marketplace': return <Store className="w-5 h-5 text-orange-600" />;
      case 'kirtasiye_modulu': return <Printer className="w-5 h-5 text-blue-600" />;
      case 'bakkal_market_modulu': return <Scale className="w-5 h-5 text-amber-600" />;
      case 'tekstil_modulu': return <Shirt className="w-5 h-5 text-indigo-600" />;
      case 'esarp_sal_modulu': return <Sparkles className="w-5 h-5 text-rose-600" />;
      case 'kozmetik_modulu': return <Palette className="w-5 h-5 text-purple-600" />;
      case 'tuhafiye_modulu': return <Scissors className="w-5 h-5 text-emerald-600" />;
      default: return <Sparkles className="w-5 h-5 text-blue-500" />;
    }
  };

  // Financial Stats
  const totalTenants = tenants.length;
  const activeTenantsCount = tenants.filter(t => t.status === 'active').length;
  const suspendedCount = tenants.filter(t => t.status === 'suspended').length;
  const expiringSoonCount = tenants.filter(t => {
    if (!t.expiresAt) return false;
    const days = Math.ceil((parseISO(t.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 5;
  }).length;

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter features list for features tab
  const categories = ['Tümü', 'Sektörel Modüller', 'Stok & Barkod', 'Satış & Kasa', 'Cari & Operasyon', 'Gelişmiş Araçlar'];

  const filteredFeatures = AVAILABLE_TENANT_FEATURES.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(featureSearchQuery.toLowerCase()) ||
                          f.description.toLowerCase().includes(featureSearchQuery.toLowerCase()) ||
                          f.id.toLowerCase().includes(featureSearchQuery.toLowerCase());
    const matchesCat = featureCategoryFilter === 'Tümü' || f.category === featureCategoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 rounded-3xl text-white shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/30">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-black text-[10px] uppercase tracking-wider">
                Süper Admin Paneli
              </span>
              <span className="text-xs text-slate-400">| Tüm İşletme & Yetki Yönetimi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">Bulut POS SaaS Yönetim Merkezi</h1>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni İşletme / Kiracı Ekle</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs: 1) İşletmeler | 2) Yetkiler | 3) Fiyat & İletişim */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-2xl max-w-2xl border border-slate-200">
        <button
          onClick={() => setActiveSubTab('tenants')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'tenants'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>İşletmeler</span>
        </button>

        <button
          onClick={() => setActiveSubTab('features')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'features'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-500 hover:text-blue-600'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Yetkiler</span>
          <span className="px-1.5 py-0.2 rounded-full bg-blue-400/30 text-[10px] font-mono">
            {AVAILABLE_TENANT_FEATURES.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('pricing_settings')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'pricing_settings'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
              : 'text-slate-500 hover:text-emerald-600'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Fiyat & İletişim</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TENANTS LIST & OVERVIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'tenants' && (
        <div className="space-y-6">
          {/* Financial & Status Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Toplam Kiracı</p>
                <h3 className="text-2xl font-black text-slate-900 mt-0.5">{totalTenants} İşletme</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Aktif Abonelik</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-0.5">{activeTenantsCount} İşletme</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Süresi Yaklaşan</p>
                <h3 className="text-2xl font-black text-amber-600 mt-0.5">{expiringSoonCount} İşletme</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Askıya Alınanlar</p>
                <h3 className="text-2xl font-black text-rose-600 mt-0.5">{suspendedCount} İşletme</h3>
              </div>
            </div>
          </div>

          {/* Tenants Table Section */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">Kayıtlı İşletmeler & Abonelikler</h3>
                <p className="text-xs text-slate-500">Kiracıların paketlerini, ödeme sürelerini yönetin ve anlık erişim verin.</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="İşletme adı veya kodu ile ara..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3.5">İşletme Bilgisi</th>
                    <th className="px-6 py-3.5">Abonelik Paketi</th>
                    <th className="px-6 py-3.5">Aktif Özellikler</th>
                    <th className="px-6 py-3.5">Son Kullanma</th>
                    <th className="px-6 py-3.5">Durum</th>
                    <th className="px-6 py-3.5">Son Ödeme</th>
                    <th className="px-6 py-3.5 text-right">Yönetim & Yetkiler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        İşletmeler yükleniyor...
                      </td>
                    </tr>
                  ) : filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        Kayıtlı işletme bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map(t => {
                      const expiryDate = t.expiresAt ? parseISO(t.expiresAt) : new Date();
                      const isExpired = isAfter(new Date(), expiryDate);
                      const remDuration = getRemainingDuration(t.expiresAt);

                      // Count active features
                      const activeFeaturesCount = AVAILABLE_TENANT_FEATURES.filter(f => 
                        isTenantFeatureEnabled(t, f.id)
                      ).length;

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-xs uppercase shadow-xs">
                                {(t.code || t.name).substring(0, 2)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                                  {isSepetayTenant(t.id) && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black font-mono border border-emerald-300">
                                      ⚡ CANLI DB: 36ef09c0
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-mono font-bold text-slate-400">
                                  ID: {t.id} {t.code && `• [${t.code}]`}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={t.package || 'pro'}
                              onChange={e => handleChangePackage(t.id, e.target.value as any)}
                              className={`px-3 py-1 rounded-xl text-xs font-black uppercase border transition-all ${
                                t.package === 'enterprise' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                t.package === 'standart' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                            >
                              <option value="standart">Standart Paket</option>
                              <option value="pro">Pro Paket</option>
                              <option value="enterprise">Enterprise</option>
                            </select>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedTenantId(t.id);
                                  setActiveSubTab('features');
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
                                title="Özellik yetkilerini aç/kapat"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                                <span>{activeFeaturesCount} / {AVAILABLE_TENANT_FEATURES.length} Açık</span>
                              </button>

                              {/* Quick Toggle for Mobile-to-PC Sales Sync */}
                              {(() => {
                                const isMobileSyncOn = isTenantFeatureEnabled(t, 'mobile_pos_sync');
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTenantFeature(t, 'mobile_pos_sync')}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer active:scale-95 ${
                                      isMobileSyncOn
                                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                                    }`}
                                    title="Mobilden satış eklendiğinde tüm kullanıcılar için PC masaüstüne gönderme sistemini aç/kapat"
                                  >
                                    <Smartphone className="w-3 h-3" />
                                    <Monitor className="w-3 h-3" />
                                    <span>Mobil→PC: {isMobileSyncOn ? 'AÇIK' : 'KAPALI'}</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-800 text-xs">
                                {t.expiresAt ? format(expiryDate, 'dd.MM.yyyy') : 'Sınırsız'}
                              </p>
                              <span className={`inline-block text-[11px] font-black ${
                                remDuration.isExpired 
                                  ? 'text-rose-600' 
                                  : remDuration.badgeColor === 'amber' 
                                  ? 'text-amber-600' 
                                  : 'text-emerald-700'
                              }`}>
                                {remDuration.formattedText}
                              </span>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                              t.status === 'suspended' || isExpired ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {t.status === 'suspended' || isExpired ? '● Askıda / Süresi Doldu' : '● Aktif'}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-700 font-mono">
                                {t.lastPaymentAmount ? `${t.lastPaymentAmount.toLocaleString('tr-TR')} ₺` : 'Ödeme Yok'}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {t.lastPaymentMethod || '-'} {t.lastPaymentDate ? `• ${format(parseISO(t.lastPaymentDate), 'dd.MM.yyyy')}` : ''}
                              </p>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                            <button
                              onClick={() => {
                                switchTenant(t.id);
                                showToast(`"${t.name}" işletmesine geçiş yapıldı.`);
                              }}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black shadow-xs transition-all"
                              title="Bu işletmenin paneline geçiş yap"
                            >
                              Mağazaya Geç
                            </button>

                            <button
                              onClick={() => setEditingTenant({ ...t })}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-xs transition-all"
                              title="Kiracı bilgilerini ve kodunu düzenle"
                            >
                              Düzenle
                            </button>

                            <button
                              onClick={() => {
                                setSelectedTenantId(t.id);
                                setActiveSubTab('features');
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition-all inline-flex items-center gap-1.5"
                              title="Bu kiracıya yetki & özellik aç/kaldır"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Yetkiler</span>
                            </button>

                            <button
                              onClick={() => {
                                setRenewTenant(t);
                                setPaymentAmount(t.package === 'enterprise' ? '999' : t.package === 'standart' ? '299' : '599');
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition-all"
                              title="Ödeme al ve aboneliği uzat"
                            >
                              Uzat
                            </button>

                            <button
                              onClick={() => {
                                const cleanPhone = (t.phone || '').replace(/[^0-9]/g, '');
                                if (!cleanPhone) {
                                  alert(`"${t.name}" işletmesine ait telefon numarası kayıtlı değil.`);
                                  return;
                                }
                                const msg = `Sayın ${t.name}, işletmenizin yazılım aboneliği ${remDuration.formattedText}. Hizmetlerinizin kesintiye uğramaması için aboneliğinizi yenilemenizi rica ederiz.`;
                                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                              }}
                              className="px-3 py-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-black shadow-xs transition-all inline-flex items-center gap-1"
                              title="WhatsApp ile Hatırlat / Mesaj Gönder"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </button>

                            <button
                              onClick={() => handleToggleSuspend(t)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                t.status === 'suspended' 
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                  : 'bg-amber-500 hover:bg-amber-600 text-white'
                              }`}
                            >
                              {t.status === 'suspended' ? 'Aktifleştir' : 'Askıya Al'}
                            </button>

                            {t.id !== PRIMARY_TENANT_ID && (
                              <button
                                onClick={() => handleDeleteTenant(t)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all"
                                title="Kiracıyı Sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TENANT FEATURE & MODULE PERMISSIONS TAB (KİRACI YETKİ ÖZELLİK AÇMA) */}
      {/* ========================================================================= */}
      {activeSubTab === 'features' && (
        <div className="space-y-6">
          {/* Top Tenant Selector & Quick Overview Banner */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider">
                    Yetki & Özellik Modülü
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Kiracılara Özel Modül Açma / Kaldırma</span>
                </div>
                <h2 className="text-xl font-black text-slate-900 mt-1">
                  Kiracı Seçimi & Modül Yetkileri
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Buradan seçtiğiniz işletmeye dilediğiniz modülü (örn. Barkod Oluştur, Teklifler, POS vb.) anında açabilir veya menüden kaldırabilirsiniz.
                </p>
              </div>

              {/* Tenant Dropdown */}
              <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                <Building2 className="w-5 h-5 text-indigo-600 shrink-0 ml-2" />
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase text-slate-400">Yönetilen İşletme</label>
                  <select
                    value={selectedTenantId}
                    onChange={e => setSelectedTenantId(e.target.value)}
                    className="bg-transparent text-sm font-black text-slate-900 focus:outline-none cursor-pointer pr-4"
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.code ? `(${t.code})` : ''} - {t.package?.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Current Selected Tenant Info Card */}
            {currentSelectedTenant && (
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 sm:p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center font-black text-blue-300 text-lg uppercase">
                    {(currentSelectedTenant.code || currentSelectedTenant.name).slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">{currentSelectedTenant.name}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono text-[10px] uppercase font-bold">
                        {currentSelectedTenant.code || currentSelectedTenant.id}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        currentSelectedTenant.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {currentSelectedTenant.status === 'active' ? 'Aktif' : 'Askıda'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                      <span>Paket: <strong className="text-white uppercase">{currentSelectedTenant.package || 'pro'}</strong></span>
                      <span>•</span>
                      <span>Aktif Modüller: <strong className="text-emerald-400">
                        {AVAILABLE_TENANT_FEATURES.filter(f => isTenantFeatureEnabled(currentSelectedTenant, f.id)).length} / {AVAILABLE_TENANT_FEATURES.length}
                      </strong></span>
                    </p>
                  </div>
                </div>

                {/* Quick Action Presets */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">Hızlı Şablonlar:</span>
                  <button
                    onClick={() => handleApplyFeaturePreset(currentSelectedTenant, 'standart')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                    title="Standart perakende modülleri uygula"
                  >
                    Standart Paket
                  </button>
                  <button
                    onClick={() => handleApplyFeaturePreset(currentSelectedTenant, 'pro')}
                    className="px-3 py-1.5 rounded-xl bg-blue-500/30 hover:bg-blue-500/40 text-blue-200 border border-blue-400/30 text-xs font-bold transition-colors"
                    title="Pro paket modülleri uygula"
                  >
                    Pro Paket
                  </button>
                  <button
                    onClick={() => handleApplyFeaturePreset(currentSelectedTenant, 'enterprise')}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/30 hover:bg-purple-500/40 text-purple-200 border border-purple-400/30 text-xs font-bold transition-colors"
                    title="Tüm modülleri aç"
                  >
                    Enterprise (Tümü Açık)
                  </button>
                  <button
                    onClick={() => handleApplyFeaturePreset(currentSelectedTenant, 'all_on')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                  >
                    Tümünü Aç
                  </button>
                  <button
                    onClick={() => handleApplyFeaturePreset(currentSelectedTenant, 'all_off')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-bold transition-colors"
                  >
                    Tümünü Kapat
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Filter & Search Bar for Features */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFeatureCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                    featureCategoryFilter === cat
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Feature Search */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Özellik veya modül ara... (örn: barkod, teklif)"
                value={featureSearchQuery}
                onChange={e => setFeatureSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Feature Grid Cards */}
          {currentSelectedTenant ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFeatures.map(feature => {
                const isEnabled = isTenantFeatureEnabled(currentSelectedTenant, feature.id);

                return (
                  <div 
                    key={feature.id}
                    className={`bg-white rounded-3xl p-5 border transition-all duration-200 flex flex-col justify-between shadow-xs hover:shadow-md ${
                      isEnabled 
                        ? 'border-indigo-100 hover:border-indigo-300 ring-1 ring-indigo-500/10' 
                        : 'border-slate-200/80 bg-slate-50/50 opacity-80'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                            isEnabled ? 'bg-indigo-50 text-indigo-600 shadow-xs' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {renderFeatureIcon(feature.id)}
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              {feature.category}
                            </span>
                            <h4 className="text-sm font-black text-slate-900 leading-snug">
                              {feature.name}
                            </h4>
                          </div>
                        </div>

                        {/* Status Switch Pill */}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                          isEnabled 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {isEnabled ? 'Açık' : 'Kapalı'}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-600 font-medium leading-relaxed min-h-[38px]">
                        {feature.description}
                      </p>
                    </div>

                    {/* Bottom Action Footer with Interactive Switch Button */}
                    <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                        <span>Modül Kodu:</span>
                        <strong className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{feature.id}</strong>
                      </div>

                      <button
                        onClick={() => handleToggleTenantFeature(currentSelectedTenant, feature.id)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 shadow-xs ${
                          isEnabled
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        }`}
                        title={isEnabled ? 'Özelliği kapat / kaldır' : 'Özelliği bu kiracıya aç'}
                      >
                        {isEnabled ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-emerald-200" />
                            <span>Açık (Kaldır)</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-slate-500" />
                            <span>Kapalı (Ekle)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400">
              Lütfen modül yetkilerini düzenlemek için bir işletme seçin.
            </div>
          )}

          {/* Quick Info Box */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-3xl p-5 flex items-start gap-3.5 text-xs text-blue-900">
            <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-blue-950">Nasıl Çalışır?</p>
              <p className="mt-1 leading-relaxed">
                Bu sekmede yaptığınız yetki değişiklikleri doğrudan <strong>{currentSelectedTenant?.name}</strong> kiracısının ayarlarına kaydedilir. 
                Örneğin <strong>"Barkod Oluştur & Etiket Basımı"</strong> veya <strong>"Resmi Teklif Hazırlama"</strong> modülünü kaldırdığınızda, 
                o kiracının çalışanlarının ve yöneticisinin sol menüsünde bu sekme görünmez ve erişimleri kısıtlanır. 
                Tekrar tıkladığınızda anında geri yüklenir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SYSTEM PRICING & WHATSAPP CONTACT SETTINGS */}
      {/* ========================================================================= */}
      {activeSubTab === 'pricing_settings' && (
        <form onSubmit={handleSavePricingConfig} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-8 animate-fadeIn">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                  Merkezi Sistem Ayarları
                </span>
                <span className="text-xs text-slate-400 font-medium">Tüm Kiracılarda Eş Zamanlı Güncellenir</span>
              </div>
              <h2 className="text-xl font-black text-slate-900 mt-1">
                Paket Fiyatları & WhatsApp / İletişim Yönetimi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Burada belirleyeceğiniz fiyatlar, paket özellikleri ve WhatsApp / telefon numarası tüm kiracıların (Tenant) "Abonelik & Lisans" ekranında anında görünür.
              </p>
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all active:scale-95 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Değişiklikleri Kaydet & Tüm Kiracılara Yansıt</span>
            </button>
          </div>

          {/* Admin Contact Number Setting */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>Yönetici & WhatsApp Destek Numarası (Global)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Kiracılar abonelik yenileme veya paket yükseltme talebinde bulunduğunda bu numara aranır ve WhatsApp yönlendirmesi bu numaraya yapılır.
            </p>
            <div className="max-w-md">
              <input
                type="text"
                value={adminWhatsappNumber}
                onChange={e => setAdminWhatsappNumber(e.target.value)}
                placeholder="+905382516406"
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          {/* Package Pricing & Feature Builder */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span>Paket Fiyatları ve Özellikleri (Bullet Points)</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {pricingPlans.map((plan, planIdx) => (
                <div key={plan.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={plan.title}
                        onChange={e => {
                          const updated = [...pricingPlans];
                          updated[planIdx].title = e.target.value;
                          setPricingPlans(updated);
                        }}
                        className="text-sm font-black text-slate-900 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 w-full"
                        placeholder="Paket Adı"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Aylık Fiyat</label>
                        <input
                          type="text"
                          value={plan.priceMonthly}
                          onChange={e => {
                            const updated = [...pricingPlans];
                            updated[planIdx].priceMonthly = e.target.value;
                            setPricingPlans(updated);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-900 mt-0.5"
                          placeholder="₺299"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Yıllık Fiyat</label>
                        <input
                          type="text"
                          value={plan.priceYearly}
                          onChange={e => {
                            const updated = [...pricingPlans];
                            updated[planIdx].priceYearly = e.target.value;
                            setPricingPlans(updated);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-900 mt-0.5"
                          placeholder="₺2,999"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Paket Maddeleri (Özellikler)</label>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {plan.features?.map((feat: string, featIdx: number) => (
                          <div key={featIdx} className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs">
                            <span className="flex-1 text-[11px] text-slate-700 truncate">{feat}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...pricingPlans];
                                updated[planIdx].features = updated[planIdx].features.filter((_: any, i: number) => i !== featIdx);
                                setPricingPlans(updated);
                              }}
                              className="text-red-500 hover:text-red-700 p-0.5"
                              title="Özelliği Sil"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add Feature Input */}
                      <div className="flex items-center gap-1 mt-2">
                        <input
                          type="text"
                          value={newFeatureInputs[plan.id] || ''}
                          onChange={e => setNewFeatureInputs({ ...newFeatureInputs, [plan.id]: e.target.value })}
                          placeholder="Yeni özellik ekle..."
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px]"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = (newFeatureInputs[plan.id] || '').trim();
                              if (!val) return;
                              const updated = [...pricingPlans];
                              if (!updated[planIdx].features) updated[planIdx].features = [];
                              updated[planIdx].features.push(val);
                              setPricingPlans(updated);
                              setNewFeatureInputs({ ...newFeatureInputs, [plan.id]: '' });
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = (newFeatureInputs[plan.id] || '').trim();
                            if (!val) return;
                            const updated = [...pricingPlans];
                            if (!updated[planIdx].features) updated[planIdx].features = [];
                            updated[planIdx].features.push(val);
                            setPricingPlans(updated);
                            setNewFeatureInputs({ ...newFeatureInputs, [plan.id]: '' });
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold"
                        >
                          Ekle
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
                    <span>ID: {plan.id}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(plan.highlight)}
                        onChange={e => {
                          const updated = [...pricingPlans];
                          updated[planIdx].highlight = e.target.checked;
                          setPricingPlans(updated);
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Öne Çıkar</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Değişiklikleri Kaydet & Tüm Kiracılara Yansıt</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD NEW TENANT */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-black uppercase tracking-tight">Yeni İşletme / Kiracı Ekle</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1">İşletme Adı *</label>
                <input
                  required
                  type="text"
                  placeholder="örn. Kadıköy Kitapçısı"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Kısa Kod (Slug)</label>
                  <input
                    type="text"
                    placeholder="örn. kadikoy"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Abonelik Paketi</label>
                  <select
                    value={formData.package}
                    onChange={e => {
                      const newPkg = e.target.value as any;
                      setFormData({ 
                        ...formData, 
                        package: newPkg,
                        enabledModules: getDefaultModulesForPackage(newPkg)
                      });
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="standart">Standart (₺299/ay)</option>
                    <option value="pro">Pro (₺599/ay)</option>
                    <option value="enterprise">Enterprise (₺999/ay)</option>
                  </select>
                </div>
              </div>

              {/* Başlangıç Üyelik Süresi */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1">Başlangıç Üyelik Süresi</label>
                <select
                  value={formData.initialDurationDays}
                  onChange={e => setFormData({ ...formData, initialDurationDays: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value={15}>15 Günlük Deneme</option>
                  <option value={30}>1 Ay (30 Gün)</option>
                  <option value={60}>2 Ay (60 Gün)</option>
                  <option value={90}>3 Ay (90 Gün)</option>
                  <option value={180}>6 Ay (180 Gün)</option>
                  <option value={365}>1 Yıl (365 Gün)</option>
                  <option value={730}>2 Yıl (730 Gün)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Yönetici Kullanıcı Adı</label>
                  <input
                    type="text"
                    placeholder="örn. admin_kadikoy"
                    value={formData.adminUsername}
                    onChange={e => setFormData({ ...formData, adminUsername: e.target.value.toLowerCase().trim() })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Yönetici Şifresi</label>
                  <input
                    type="text"
                    placeholder="123"
                    value={formData.adminPassword}
                    onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Telefon</label>
                  <input
                    type="text"
                    placeholder="0532..."
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Adres / Şehir</label>
                  <input
                    type="text"
                    placeholder="İstanbul"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              {/* Feature modules preview */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-black uppercase text-slate-700">Başlangıç Modül Yetkileri</label>
                  <span className="text-[10px] font-bold text-blue-600 uppercase">{formData.package} pakete göre ayarlandı</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1">
                  {AVAILABLE_TENANT_FEATURES.map(f => {
                    const isChecked = formData.enabledModules ? formData.enabledModules[f.id] !== false : true;
                    return (
                      <label key={f.id} className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer hover:bg-white p-1 rounded">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            setFormData({
                              ...formData,
                              enabledModules: {
                                ...(formData.enabledModules || {}),
                                [f.id]: e.target.checked
                              }
                            });
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="truncate">{f.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-2xl text-[11px] text-blue-900 font-medium">
                💡 Yeni kiracı oluşturulduğunda sistem otomatik olarak 1 adet **Yönetici**, 1 adet **Kasiyer** ve 1 adet **Saha Satış** personeli hesabı tanımlar.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md"
                >
                  Kiracıyı Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RENEW / PAYMENT MODAL */}
      {/* ========================================================================= */}
      {renewTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-black uppercase tracking-tight">Ödeme Al & Abonelik Uzat</h3>
              </div>
              <button onClick={() => setRenewTenant(null)} className="w-8 h-8 rounded-full bg-white/25 hover:bg-white/40 flex items-center justify-center text-white font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleRenewSubscription} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500 uppercase">İşletme:</p>
                  <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                    ID: {renewTenant.id}
                  </span>
                </div>
                <p className="text-sm font-black text-slate-900 mt-0.5">{renewTenant.name}</p>
                <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Mevcut Bitiş:</span>
                  <span className="font-bold text-slate-800">
                    {renewTenant.expiresAt ? format(parseISO(renewTenant.expiresAt), 'dd.MM.yyyy') : 'Sınırsız'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mt-0.5">
                  <span className="text-slate-500">Kalan Süre:</span>
                  <span className="font-black text-blue-600">
                    {getRemainingDuration(renewTenant.expiresAt).formattedText}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-black uppercase text-slate-700">Uzatma Yöntemi</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setRenewalType('preset')}
                      className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                        renewalType === 'preset' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      Hazır Süre
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenewalType('custom')}
                      className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                        renewalType === 'custom' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      Tam Yıl/Ay/Gün
                    </button>
                  </div>
                </div>

                {renewalType === 'preset' ? (
                  <select
                    value={extensionDays}
                    onChange={e => setExtensionDays(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value={15}>15 Gün</option>
                    <option value={30}>1 Ay (30 Gün)</option>
                    <option value={60}>2 Ay (60 Gün)</option>
                    <option value={90}>3 Ay (90 Gün)</option>
                    <option value={180}>6 Ay (180 Gün)</option>
                    <option value={365}>1 Yıl (365 Gün)</option>
                    <option value={730}>2 Yıl (730 Gün)</option>
                  </select>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="text-[11px] font-bold text-slate-600">
                      Mevcut bitiş tarihine eklenecek tam süreyi girin:
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Yıl:</span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={customYears}
                          onChange={e => setCustomYears(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Ay:</span>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={customMonths}
                          onChange={e => setCustomMonths(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Gün:</span>
                        <input
                          type="number"
                          min="0"
                          max="365"
                          value={customDays}
                          onChange={e => setCustomDays(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Tahsilat Tutarı (₺)</label>
                  <input
                    required
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">Ödeme Yöntemi</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="Havale">Havale / EFT</option>
                    <option value="Nakit">Nakit</option>
                    <option value="Kredi Kartı">Kredi Kartı</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenewTenant(null)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md"
                >
                  Ödemeyi Onayla & Süreyi Uzat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT TENANT MODAL */}
      {/* ========================================================================= */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-black uppercase tracking-tight">Kiracı Bilgilerini Düzenle</h3>
              </div>
              <button onClick={() => setEditingTenant(null)} className="w-8 h-8 rounded-full bg-white/25 hover:bg-white/40 flex items-center justify-center text-white font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTenantEdit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1">İşletme / Kiracı Adı</label>
                <input
                  required
                  type="text"
                  value={editingTenant.name}
                  onChange={e => setEditingTenant({ ...editingTenant, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1">Kiracı Kodu / ID</label>
                <input
                  type="text"
                  value={editingTenant.code || ''}
                  onChange={e => setEditingTenant({ ...editingTenant, code: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500"
                  placeholder="Örn: BEYOGLU"
                />
                <p className="text-[10px] text-slate-400 mt-1">Sistem ID: <code className="font-mono">{editingTenant.id}</code> (Değiştirilemez)</p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1">Telefon Numarası</label>
                <input
                  type="text"
                  value={editingTenant.phone || ''}
                  onChange={e => setEditingTenant({ ...editingTenant, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                  placeholder="0555..."
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1">Abonelik Paketi</label>
                <select
                  value={editingTenant.package || 'pro'}
                  onChange={e => setEditingTenant({ ...editingTenant, package: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                >
                  <option value="standart">Standart Paket</option>
                  <option value="pro">Pro Paket</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              {/* Mobil Satış -> PC Masaüstüne Gönderme Sistemi (Süper Admin Aç/Kapat) */}
              <div className="pt-3 border-t border-slate-200/80 space-y-2">
                <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Mobil Satış & PC Masaüstüne Gönderme Sistemi</span>
                </h4>
                {(() => {
                  const isMobSyncEnabled = isTenantFeatureEnabled(editingTenant, 'mobile_pos_sync');
                  return (
                    <div
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isMobSyncEnabled
                          ? 'bg-indigo-50/70 border-indigo-200 shadow-xs'
                          : 'bg-slate-50 border-slate-200/80 opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isMobSyncEnabled ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-200 text-slate-500'
                        }`}>
                          <Monitor className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">
                              Mobilden PC Masaüstüne Satış Gönderme
                            </span>
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                              isMobSyncEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isMobSyncEnabled ? 'Açık' : 'Kapalı'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Mobilden satış eklendiğinde bütün kullanıcılar için PC masaüstü ekranına anlık gönderme ve sesli bildirim.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const newStatus = !isMobSyncEnabled;
                          const baseEnabled = editingTenant.enabledModules || getDefaultModulesForPackage(editingTenant.package || 'pro');
                          const updatedEnabledModules = {
                            ...baseEnabled,
                            mobile_pos_sync: newStatus
                          };
                          setEditingTenant({
                            ...editingTenant,
                            enabledModules: updatedEnabledModules
                          });
                          try {
                            await updateDoc(doc(db, 'tenants', editingTenant.id), {
                              enabledModules: updatedEnabledModules,
                              updatedAt: serverTimestamp()
                            });
                            showToast(
                              newStatus
                                ? `✅ Mobil -> PC Masaüstü Satış Gönderme sistemi ${editingTenant.name} için AÇILDI!`
                                : `⚠️ Mobil -> PC Masaüstü Satış Gönderme sistemi ${editingTenant.name} için KAPATILDI!`
                            );
                          } catch (err: any) {
                            console.error(err);
                            alert("Güncellenemedi: " + err.message);
                          }
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all active:scale-95 shadow-xs cursor-pointer ${
                          isMobSyncEnabled
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        }`}
                      >
                        {isMobSyncEnabled ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-emerald-200" />
                            <span>Açık</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-slate-500" />
                            <span>Kapalı</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Sektörel Modül Yönetimi (Feature Switch) */}
              <div className="pt-3 border-t border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-600" />
                      Sektörel Modül Yönetimi (Dükkan Türü)
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                      İşletmenin dükkan/sektör türüne göre modülleri açın veya kapatın. Değişiklikler anında Firestore'a kaydedilir.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {SECTORAL_MODULES.map(mod => {
                    const isModEnabled = isTenantSectorModuleEnabled(editingTenant, mod.id);

                    return (
                      <div 
                        key={mod.id}
                        className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          isModEnabled 
                            ? 'bg-blue-50/60 border-blue-200 shadow-xs' 
                            : 'bg-slate-50 border-slate-200/80 opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isModEnabled ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {renderFeatureIcon(mod.id)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900 leading-tight">
                                {mod.name}
                              </span>
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full ${
                                isModEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isModEnabled ? 'Açık' : 'Kapalı'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {mod.tagline}
                            </p>
                          </div>
                        </div>

                        {/* Toggle Button */}
                        <button
                          type="button"
                          onClick={async () => {
                            const newStatus = !isModEnabled;
                            const updatedModules = {
                              ...(editingTenant.modules || {}),
                              [mod.id]: newStatus
                            };
                            const updatedEnabledModules = {
                              ...(editingTenant.enabledModules || {}),
                              [mod.id]: newStatus
                            };
                            setEditingTenant({
                              ...editingTenant,
                              modules: updatedModules,
                              enabledModules: updatedEnabledModules
                            });

                            try {
                              await updateDoc(doc(db, 'tenants', editingTenant.id), {
                                [`modules.${mod.id}`]: newStatus,
                                [`enabledModules.${mod.id}`]: newStatus,
                                updatedAt: serverTimestamp()
                              });
                              showToast(
                                newStatus 
                                  ? `✅ "${mod.name}" ${editingTenant.name} için açıldı!` 
                                  : `⚠️ "${mod.name}" ${editingTenant.name} için kapatıldı!`
                              );
                            } catch (err: any) {
                              console.error(err);
                              alert("Modül güncellenemedi: " + err.message);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all active:scale-95 shadow-xs ${
                            isModEnabled
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                        >
                          {isModEnabled ? (
                            <>
                              <ToggleRight className="w-4 h-4 text-emerald-200" />
                              <span>Açık</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-4 h-4 text-slate-500" />
                              <span>Kapalı</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md"
                >
                  Değişiklikleri Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
