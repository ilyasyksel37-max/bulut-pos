/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import Inventory from './components/Inventory';
import Customers from './components/Customers';
import Suppliers from './components/Suppliers';
import Expenses from './components/Expenses';
import Settings from './components/Settings';
import Personnel from './components/Personnel';
import CashRegister from './components/CashRegister';
import FieldOrders from './components/FieldOrders';
import { Quotations } from './components/Quotations';
import { BarcodeGenerator } from './components/BarcodeGenerator';
import { SuperAdminPanel } from './components/SuperAdminPanel';
import { SuspendedScreen } from './components/SuspendedScreen';
import { SectoralModules } from './components/SectoralModules';
import { CafeRestaurantModule } from './components/CafeRestaurantModule';
import { PrinterSettings } from './components/PrinterSettings';
import { WarehouseManagement } from './components/WarehouseManagement';
import { isDocInTenant, isTenantFeatureEnabled, isTenantSectorModuleEnabled, SECTORAL_MODULES, isSepetayTenant, SEPETAY_LEGACY_APPLET_ID } from './lib/tenant';
import { 
  LogIn, 
  ShoppingBag, 
  ArrowRight, 
  ChevronDown, 
  Settings as SettingsIcon, 
  Users, 
  LogOut, 
  UserCheck, 
  Eye, 
  EyeOff,
  AlertTriangle, 
  Truck, 
  Bell,
  Lock,
  Key,
  Shield,
  Sparkles,
  CheckCircle2,
  User as UserIcon,
  ShieldAlert,
  Cloud,
  Database,
  Smartphone,
  Monitor,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { CloudSyncHealthPanel } from './components/CloudSyncHealthPanel';
import { SepetayDirectDbStatusModal } from './components/common/SepetayDirectDbStatusModal';
import { MobileToDesktopOrdersModal, MobilePosOrder } from './components/common/MobileToDesktopOrdersModal';

const playChimeSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Audio autoplay might be blocked before first user gesture
  }
};

const getTabTitle = (tab: string) => {
  switch (tab) {
    case 'super_admin': return 'Kiracı & Abonelik Yönetimi';
    case 'pos': return 'Hızlı Satış (POS)';
    case 'kasa': return 'Kasa Yönetimi';
    case 'field_orders': return 'Saha Siparişleri';
    case 'quotations': return 'Teklifler';
    case 'barcode': return 'Barkod Oluştur';
    case 'inventory': return 'Stok & Ürünler';
    case 'warehouse': return 'Depo Yönetimi & Transferler';
    case 'customers': return 'Müşteriler & Cari';
    case 'suppliers': return 'Tedarikçiler';
    case 'dashboard': return 'Raporlar & Ciro';
    case 'expenses': return 'Giderler';
    case 'personnel': return 'Personel Yönetimi';
    case 'printer_settings': return 'Yazıcı & Şablon Ayarları';
    case 'settings': return 'Sistem Ayarları';
    // Sektörel Modüller
    case 'kirtasiye_modulu': return 'Kırtasiye Modülü (Fotokopi & Baskı)';
    case 'bakkal_market_modulu': return 'Bakkal & Market Modülü (Terazi & SKT)';
    case 'tekstil_modulu': return 'Tekstil Modülü (Beden & Askı Etiketi)';
    case 'esarp_sal_modulu': return 'Eşarp & Şal Modülü (Kumaş, Desen & Seri Satış)';
    case 'kozmetik_modulu': return 'Kozmetik Modülü (Ton/Renk No & Tester)';
    case 'tuhafiye_modulu': return 'Tuhafiye Modülü (Metraj, İplik & Lot)';
    default: return 'Bulut POS';
  }
};

const AppContent: React.FC = () => {
  const { 
    user, 
    role, 
    isDemo, 
    loading, 
    error: authError, 
    login, 
    loginStaff, 
    loginAdmin,
    loginAdminWithPassword, 
    loginDemo, 
    logout, 
    hasPermission,
    isSuperAdmin,
    currentTenant,
    tenantId
  } = useAuth();

  const isOrderTaker = Boolean(
    user?.permissions?.isGarson ||
    user?.permissions?.isMutfak ||
    user?.cafeRole === 'garson' ||
    user?.cafeRole === 'mutfak' ||
    user?.staffType === 'garson' ||
    user?.staffType === 'mutfak'
  );

  const isWarehouseStaff = Boolean(
    !isSuperAdmin && role !== 'admin' && (
      user?.staffType === 'warehouse'
    )
  );

  const getInitialTab = (): string => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash && hash !== 'personnel' && hash !== 'dashboard') return hash;
      const params = new URLSearchParams(window.location.search);
      const queryTab = params.get('tab') || params.get('module');
      if (queryTab) return queryTab;
    }
    if (isWarehouseStaff) {
      return 'warehouse';
    }
    if (user?.cafeRole && user.cafeRole !== 'admin') {
      return 'kafe_restoran_modulu';
    }
    if (isOrderTaker) {
      return 'kafe_restoran_modulu';
    }
    return 'pos';
  };

  const [activeTab, setActiveTabState] = useState<string>(getInitialTab);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
      window.location.hash = tab;
    }
  };

  useEffect(() => {
    if (user?.cafeRole && user.cafeRole !== 'admin') {
      const currentHash = window.location.hash.replace('#', '').trim();
      if (!currentHash || currentHash === 'pos' || currentHash === 'personnel' || currentHash === 'dashboard') {
        setActiveTab('kafe_restoran_modulu');
      }
    } else if (isOrderTaker) {
      const currentHash = window.location.hash.replace('#', '').trim();
      if (!currentHash || currentHash === 'pos' || currentHash === 'personnel' || currentHash === 'dashboard') {
        setActiveTab('kafe_restoran_modulu');
      }
    }
  }, [user, isOrderTaker, isWarehouseStaff]);

  // Sync with browser address bar hash changes
  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash && hash !== activeTab) {
        setActiveTabState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  const [selectedCustomerForPOS, setSelectedCustomerForPOS] = useState<any>(null);
  const [selectedCustomerForFieldOrder, setSelectedCustomerForFieldOrder] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCloudHealthOpen, setIsCloudHealthOpen] = useState(false);
  const [isSepetayDbModalOpen, setIsSepetayDbModalOpen] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const prevCountRef = React.useRef<number>(0);

  // Mobile-to-PC Desktop Sales Transfer states
  const [mobilePosOrders, setMobilePosOrders] = useState<MobilePosOrder[]>([]);
  const [isMobileOrdersModalOpen, setIsMobileOrdersModalOpen] = useState(false);
  const [latestMobileOrderAlert, setLatestMobileOrderAlert] = useState<MobilePosOrder | null>(null);
  const prevMobileOrdersCountRef = React.useRef<number>(0);
  const isMobileSyncEnabledForTenant = isTenantFeatureEnabled(currentTenant, 'mobile_pos_sync');

  // Persistent POS Cart & Held Sales across tabs & navigation
  const tenantStorageKey = currentTenant?.id || 'default';
  const [sharedCart, setSharedCart] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`pos_cart_${tenantStorageKey}`) || localStorage.getItem('pos_cart_default');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sharedHeldSales, setSharedHeldSales] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`pos_held_sales_${tenantStorageKey}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sharedCustomer, setSharedCustomer] = useState<any>(null);
  const [sharedSaleMode, setSharedSaleMode] = useState<'retail' | 'customer'>('retail');

  // Add item from Sectoral Modules or anywhere directly to active POS cart
  const handleAddToCartFromAnywhere = (newItem: any) => {
    setSharedCart(prev => {
      const existingIndex = prev.findIndex(item => item.id === newItem.id);
      if (existingIndex > -1) {
        const copy = [...prev];
        copy[existingIndex] = {
          ...copy[existingIndex],
          quantity: copy[existingIndex].quantity + (newItem.quantity || 1)
        };
        return copy;
      }
      return [...prev, newItem];
    });
  };

  // Login form states
  const [loginTab, setLoginTab] = useState<'staff' | 'admin' | 'demo'>('staff');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [localLoginError, setLocalLoginError] = useState<string | null>(null);

  // Real-time listener for pending field orders (filtered by tenant)
  React.useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'field_orders'), where('status', '==', 'BEKLIYOR'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => isDocInTenant(o, tenantId));
      const count = list.length;
      if (count > prevCountRef.current && prevCountRef.current !== 0) {
        playChimeSound();
      }
      prevCountRef.current = count;
      setPendingOrdersCount(count);
    }, (err) => {
      console.warn("Field orders listener notice:", err);
    });

    return () => unsub();
  }, [user, tenantId]);

  // Real-time listener for Mobile-to-PC Desktop sales transfers (all users of the tenant, controlled by Super Admin toggle)
  React.useEffect(() => {
    if (!user || !isMobileSyncEnabledForTenant) {
      setMobilePosOrders([]);
      setLatestMobileOrderAlert(null);
      return;
    }

    const q = query(collection(db, 'mobile_pos_orders'), where('status', '==', 'PENDING'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as MobilePosOrder))
        .filter(o => isDocInTenant(o, tenantId))
        .sort((a, b) => (Number(b.timestampMs) || 0) - (Number(a.timestampMs) || 0));

      if (list.length > 0) {
        if (list.length > prevMobileOrdersCountRef.current) {
          playChimeSound();
          setLatestMobileOrderAlert(list[0]);
        } else {
          setLatestMobileOrderAlert(prev => prev ? (list.find(o => o.id === prev.id) || list[0]) : prev);
        }
      } else {
        setLatestMobileOrderAlert(null);
      }
      prevMobileOrdersCountRef.current = list.length;
      setMobilePosOrders(list);
    }, (err) => {
      console.warn("Mobile POS orders listener notice:", err);
    });

    return () => unsub();
  }, [user, tenantId, isMobileSyncEnabledForTenant]);

  const handleLoadMobileOrderIntoPOS = async (order: MobilePosOrder) => {
    // If current cart has items, park it in heldSales so nothing is lost
    if (sharedCart.length > 0) {
      const parked = {
        id: `held_${Date.now()}`,
        cart: [...sharedCart],
        customer: sharedCustomer ? { ...sharedCustomer } : null,
        saleMode: sharedSaleMode,
        date: new Date().toISOString(),
        note: sharedCustomer?.name || 'Önceki Aktif Sepet (Otomatik Beklemeye Alındı)',
        total: sharedCart.reduce((acc, i) => acc + ((Number(i.price) || 0) * (Number(i.quantity) || 1) - (Number(i.discount) || 0)), 0)
      };
      setSharedHeldSales(prev => [parked, ...prev]);
    }

    setSharedCart(order.cart || []);
    if (order.customer) {
      setSharedCustomer(order.customer);
      setSharedSaleMode('customer');
    } else {
      setSharedCustomer(null);
      setSharedSaleMode(order.saleMode || 'retail');
    }

    setIsMobileOrdersModalOpen(false);
    setLatestMobileOrderAlert(null);
    setActiveTab('pos');

    try {
      await updateDoc(doc(db, 'mobile_pos_orders', order.id), {
        status: 'COMPLETED',
        loadedBy: user?.displayName || user?.email || 'PC Kasiyer',
        loadedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Failed to mark mobile order completed:", e);
    }
  };

  const handleDeleteMobileOrder = async (orderId: string) => {
    try {
      await deleteDoc(doc(db, 'mobile_pos_orders', orderId));
      if (latestMobileOrderAlert?.id === orderId) {
        setLatestMobileOrderAlert(null);
      }
    } catch (e) {
      console.warn("Failed to delete mobile order:", e);
    }
  };

  // Auto-switch to first permitted tab if staff user's activeTab is restricted
  React.useEffect(() => {
    if (role === 'staff' && user && hasPermission) {
      const allowedOrder = ['pos', 'field_orders', 'customers', 'inventory', 'kasa', 'dashboard', 'suppliers', 'expenses', 'settings', 'personnel'];
      if (!hasPermission(activeTab as any)) {
        const firstAllowed = allowedOrder.find(t => hasPermission(t as any));
        if (firstAllowed) {
          setActiveTab(firstAllowed);
        }
      }
    }
  }, [role, user, activeTab, hasPermission]);

  const handleStartSaleForCustomer = (cust: any) => {
    setSelectedCustomerForPOS(cust);
    setSharedCustomer(cust);
    setSharedSaleMode('customer');
    setActiveTab('pos');
  };

  const handleStartFieldOrderForCustomer = (cust: any) => {
    setSelectedCustomerForFieldOrder(cust);
    setActiveTab('field_orders');
  };

  // Staff Login Submit
  const handleStaffLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalLoginError(null);
    if (!staffUsername.trim()) {
      setLocalLoginError('Lütfen kullanıcı adınızı veya personel kodunuzu girin.');
      return;
    }
    if (!staffPassword.trim()) {
      setLocalLoginError('Lütfen giriş şifrenizi girin.');
      return;
    }

    setIsSubmittingLogin(true);
    try {
      const res = await loginStaff(staffUsername, staffPassword);
      if (!res.success) {
        setLocalLoginError(res.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
      }
    } catch (err: any) {
      setLocalLoginError(err.message || 'Bir hata oluştu.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  // Admin Password Login Submit
  const handleAdminLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalLoginError(null);
    if (!adminUsername.trim()) {
      setLocalLoginError('Lütfen yönetici kullanıcı adınızı, işletme kodunuzu veya e-posta adresinizi girin.');
      return;
    }
    if (!adminPassword.trim()) {
      setLocalLoginError('Lütfen yönetici şifrenizi girin.');
      return;
    }

    setIsSubmittingLogin(true);
    try {
      const res = await loginAdmin(adminUsername, adminPassword);
      if (!res.success) {
        setLocalLoginError(res.message || 'Hatalı yönetici bilgileri.');
      }
    } catch (err: any) {
      setLocalLoginError(err.message || 'Bir hata oluştu.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  // Quick fill demo/sample credentials
  const handleFillCredentials = (userCode: string, pass: string) => {
    setStaffUsername(userCode);
    setStaffPassword(pass);
    setLocalLoginError(null);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">Sistem yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full flex bg-slate-950 overflow-y-auto relative">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-purple-600/20 pointer-events-none"></div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 lg:p-12 relative z-10 my-auto">
          <div className="bg-white p-6 sm:p-9 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-md space-y-6 border border-white/20">
            {/* Header Brand */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-900/20 rotate-3 mx-auto">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight uppercase">Bulut POS</h1>
                <p className="text-slate-500 font-medium text-xs sm:text-sm">Bulut POS & Saha Satış Otomasyonu</p>
              </div>
            </div>

            {/* Error Banners */}
            {(localLoginError || authError) && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs font-bold flex items-start gap-2.5 animate-shake">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="flex-1">{localLoginError || authError}</span>
              </div>
            )}

            {/* Login Type Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setLoginTab('staff');
                  setLocalLoginError(null);
                }}
                className={`py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  loginTab === 'staff'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Personel</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginTab('admin');
                  setLocalLoginError(null);
                }}
                className={`py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  loginTab === 'admin'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Yönetici</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginTab('demo');
                  setLocalLoginError(null);
                }}
                className={`py-2 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  loginTab === 'demo'
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Demo</span>
              </button>
            </div>

            {/* TAB 1: DEDICATED PERSONNEL LOGIN */}
            {loginTab === 'staff' && (
              <form onSubmit={handleStaffLoginSubmit} className="space-y-4">
                <div className="bg-blue-50/60 p-3 rounded-2xl border border-blue-100 text-[11px] text-blue-900 font-medium">
                  💡 <strong>Özel Personel Girişi:</strong> Yöneticiniz tarafından uygulamadaki Personel Yönetimi menüsünden tanımlanan kullanıcı adı ve şifrenizle giriş yapın.
                </div>

                {/* Username / Code input */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Kullanıcı Adı veya Personel Kodu
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="örn. saha01, kasiyer01 veya E01"
                      value={staffUsername}
                      onChange={e => setStaffUsername(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Password input */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Giriş Şifresi
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showStaffPassword ? "text" : "password"}
                      placeholder="Şifrenizi yazın"
                      value={staffPassword}
                      onChange={e => setStaffPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStaffPassword(!showStaffPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmittingLogin}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmittingLogin ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Personel Olarak Giriş Yap</span>
                    </>
                  )}
                </button>

                {/* Quick Fill Credentials for Fast Testing removed per user request */}
                <div className="pt-2 border-t border-slate-100 hidden">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-center">
                    Hızlı Test Hesapları (Örnek)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleFillCredentials('saha01', '123')}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-left transition-all group"
                    >
                      <div className="flex items-center gap-1 font-bold text-[11px] text-indigo-700">
                        <Truck className="w-3 h-3 text-indigo-600" />
                        <span>Saha Elemanı</span>
                      </div>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">saha01 / 123</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFillCredentials('kasiyer01', '123')}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200/80 hover:border-emerald-200 text-left transition-all group"
                    >
                      <div className="flex items-center gap-1 font-bold text-[11px] text-emerald-700">
                        <ShoppingBag className="w-3 h-3 text-emerald-600" />
                        <span>Kasiyer & Kasa</span>
                      </div>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">kasiyer01 / 123</p>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: ADMIN PASSWORD LOGIN */}
            {loginTab === 'admin' && (
              <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                    <Shield className="w-4 h-4" />
                    <span>Yönetici & Patron Girişi</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    İşletmenizin ciro raporları, stok/kasa ve personel yönetimine tam yetkili erişim.
                  </p>
                </div>

                {/* Manager Username / Business Code / Email */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Yönetici Kullanıcı Adı veya E-posta
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="örn. admin, admin_beyoglu veya e-posta"
                      value={adminUsername}
                      onChange={e => setAdminUsername(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoFocus
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Her işletme yöneticisinin hesabı kullanıcı adıyla güvenle ayrıştırılır.
                  </p>
                </div>

                {/* Password input */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Yönetici Şifresi
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showAdminPassword ? "text" : "password"}
                      placeholder="Yönetici şifrenizi girin"
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingLogin}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmittingLogin ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Shield className="w-4 h-4 text-blue-400" />
                      <span>Yönetici Olarak Giriş Yap</span>
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => login('admin')}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Google Hesabı ile Yönetici Girişi Yap →
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: DEMO LOGIN */}
            {loginTab === 'demo' && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-950 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Hızlı Demo Modu (Salt Okunur)</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                    Kullanıcı adı ve şifreye gerek kalmadan programın tüm özelliklerini, hızlı satış, saha siparişleri ve kasa ekranlarını anında inceleyebilirsiniz.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => loginDemo()}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <Eye className="w-4 h-4" />
                  <span>Demo Modunu Başlat (Hemen İncele)</span>
                </button>
              </div>
            )}

            <div className="pt-2 text-center border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                Bulut POS Satış & Saha Otomasyonu v1.3
              </p>
            </div>
          </div>
        </div>

        {/* Right Hero / Features Banner */}
        <div className="flex-1 hidden lg:block bg-slate-900 relative overflow-hidden">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[80%] bg-blue-600 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[80%] h-[80%] bg-purple-600 rounded-full blur-[120px]"></div>
          </div>
          <div className="relative h-full flex flex-col justify-center p-12 text-white">
            <h2 className="text-5xl font-black mb-6 tracking-tighter uppercase leading-tight">
              İşletmenizi & Sahanızı Tek Panelden Yönetin.
            </h2>
            <div className="space-y-6 max-w-lg">
              <FeatureItem text="Barkodlu Hızlı Satış & Dokunmatik Ekran Desteği" />
              <FeatureItem text="Saha Satış Elemanları için Müşteriden Anlık Sipariş İletimi" />
              <FeatureItem text="Merkez Şube Sipariş Hazırlığı, Stok Düşümü & Otomatik Cari İşleme" />
              <FeatureItem text="Dövizli Satış, TL / Dolar / Euro Kasa Takibi & Manuel Kur" />
              <FeatureItem text="Yönetici Tarafından Kullanıcı Adı/Şifre & Tik ile Modül Yetkilendirme" />
              <FeatureItem text="Personel Satış Cirosu & Prim Raporları" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if tenant is suspended or expired (Super Admin bypasses this)
  const isSuspended = !isSuperAdmin && (
    currentTenant?.status === 'suspended' || 
    (currentTenant?.expiresAt && new Date() > new Date(currentTenant.expiresAt))
  );

  if (isSuspended) {
    return <SuspendedScreen />;
  }

  const renderContent = () => {
    // Tenant feature module & Sectoral module check (Super Admin can view everything; settings is always accessible)
    const isSectoral = SECTORAL_MODULES.some(m => m.id === activeTab);
    const isModuleAllowed = isSuperAdmin || activeTab === 'settings' || activeTab === 'printer_settings' || (
      isSectoral 
        ? isTenantSectorModuleEnabled(currentTenant, activeTab)
        : isTenantFeatureEnabled(currentTenant, activeTab)
    );

    if (!isModuleAllowed) {
      return (
        <div className="p-8 max-w-lg mx-auto my-12 bg-white rounded-3xl border border-rose-200/80 shadow-xl text-center space-y-4 animate-fadeIn">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900 leading-snug">
            Bu modül paketinizde aktif değildir. İletişime geçiniz.
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Erişmeye çalıştığınız modül (<strong>{getTabTitle(activeTab)}</strong>) işletmeniz (<strong>{currentTenant?.name}</strong>) için aktif değildir. Bu modülü kullanabilmek için lütfen Süper Admin yöneticisiyle iletişime geçiniz.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setActiveTab('pos')}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 shadow-md transition-all active:scale-95"
            >
              Ana Ekrana (POS) Dön
            </button>
            <a
              href={`tel:${currentTenant?.phone || '05551234567'}`}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              Destek Hattı / İletişim
            </a>
          </div>
        </div>
      );
    }

    // Permission check for staff
    if (role === 'staff' && !hasPermission(activeTab as any)) {
      return (
        <div className="p-8 max-w-lg mx-auto my-12 bg-white rounded-3xl border border-slate-200/80 shadow-xl text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Modül Yetkiniz Bulunmamaktadır</h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Bu bölüm (<strong>{getTabTitle(activeTab)}</strong>) yöneticiniz tarafından hesabınıza kapalı tutulmuştur. Bu modülü kullanabilmek için işletme yöneticinizden yetki tikini açmasını isteyebilirsiniz.
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                const allowedOrder = ['pos', 'field_orders', 'customers', 'inventory', 'kasa', 'dashboard', 'suppliers', 'expenses', 'settings', 'personnel'];
                const firstAllowed = allowedOrder.find(t => hasPermission(t as any));
                if (firstAllowed) setActiveTab(firstAllowed);
              }}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 shadow-md transition-all active:scale-95"
            >
              Yetkili Ekranıma Dön
            </button>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'super_admin': return <SuperAdminPanel />;
      case 'dashboard': return <Dashboard />;
      case 'pos': return (
        <POS 
          initialCustomer={selectedCustomerForPOS} 
          onClearInitialCustomer={() => setSelectedCustomerForPOS(null)}
          cart={sharedCart}
          setCart={setSharedCart}
          heldSales={sharedHeldSales}
          setHeldSales={setSharedHeldSales}
          customer={sharedCustomer}
          setCustomer={setSharedCustomer}
          saleMode={sharedSaleMode}
          setSaleMode={setSharedSaleMode}
          mobilePosOrdersCount={mobilePosOrders.length}
          onOpenMobilePosOrders={() => setIsMobileOrdersModalOpen(true)}
        />
      );
      case 'field_orders': return (
        <FieldOrders
          initialCustomer={selectedCustomerForFieldOrder}
          onClearInitialCustomer={() => setSelectedCustomerForFieldOrder(null)}
        />
      );
      case 'quotations': return <Quotations />;
      case 'barcode': return <BarcodeGenerator />;
      case 'inventory': return <Inventory />;
      case 'warehouse': return <WarehouseManagement />;
      case 'customers': return (
        <Customers 
          onStartSale={handleStartSaleForCustomer} 
          onStartFieldOrder={handleStartFieldOrderForCustomer} 
        />
      );
      case 'suppliers': return <Suppliers />;
      case 'kasa': return <CashRegister />;
      case 'expenses': return <Expenses />;
      case 'personnel': return <Personnel />;
      case 'printer_settings': return <PrinterSettings />;
      case 'settings': return <Settings />;
      // Sektörel Modüller
      case 'kafe_restoran_modulu': return <CafeRestaurantModule showToast={(msg) => console.log('[Kafe]:', msg)} />;
      case 'kirtasiye_modulu':
      case 'bakkal_market_modulu':
      case 'tekstil_modulu':
      case 'esarp_sal_modulu':
      case 'kozmetik_modulu':
      case 'tuhafiye_modulu':
        return (
          <SectoralModules 
            activeModule={activeTab} 
            onNavigateToPOS={(prefilledItem) => {
              if (prefilledItem) handleAddToCartFromAnywhere(prefilledItem);
              setActiveTab('pos');
            }} 
            onAddToCart={handleAddToCartFromAnywhere}
          />
        );
      default: return (
        <POS 
          cart={sharedCart}
          setCart={setSharedCart}
          heldSales={sharedHeldSales}
          setHeldSales={setSharedHeldSales}
          customer={sharedCustomer}
          setCustomer={setSharedCustomer}
          saleMode={sharedSaleMode}
          setSaleMode={setSharedSaleMode}
          mobilePosOrdersCount={mobilePosOrders.length}
          onOpenMobilePosOrders={() => setIsMobileOrdersModalOpen(true)}
        />
      );
    }
  };


  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} pendingOrdersCount={pendingOrdersCount} />
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Demo Mode Alert Banner */}
        {isDemo && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between sticky top-0 z-50 border-b border-amber-600 shadow-sm print:hidden">
            <div className="flex items-center gap-2 max-w-4xl mx-auto">
              <AlertTriangle className="w-4 h-4 shrink-0 text-slate-950" />
              <span>
                <strong>DEMO GİRİŞİ (KONTROL AMAÇLI):</strong> Sistem sadece kontrol ve inceleme amaçlıdır. Canlı stokları, kasayı ve raporları görebilirsiniz; veri değiştirme veya yeni satış yapma işlemleri kapalıdır.
              </span>
            </div>
          </div>
        )}

        {/* Universal Top Header (Visible on Desktop & Mobile) */}
        <header className="bg-white border-b border-slate-200 px-2.5 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 sticky top-0 z-40 shadow-sm print:hidden">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm font-black text-xs shrink-0">
                {(currentTenant?.name || 'Elnara').substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight uppercase leading-none truncate">
                  {currentTenant?.name || 'Elnara'}
                </h1>
                <span className="text-[10px] text-slate-400 font-bold capitalize block truncate mt-0.5">
                  {activeTab === 'pos' ? 'Hızlı Satış' : 
                   activeTab === 'kasa' ? 'Kasa Yönetimi' :
                   activeTab === 'field_orders' ? 'Saha Siparişleri' :
                   activeTab === 'dashboard' ? 'Genel Raporlar' : 
                   activeTab === 'inventory' ? 'Stok Yönetimi' : 
                   activeTab === 'customers' ? 'Müşteri Kayıtları' : 
                   activeTab === 'suppliers' ? 'Tedarikçi Takibi' : 
                   activeTab === 'personnel' ? 'Personel Yönetimi' : 
                   activeTab === 'expenses' ? 'Gider Yönetimi' : 'Ayarlar'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Mobile-to-PC Desktop Incoming Sales Alert in Header (Static, no pulse/bounce) */}
            {isMobileSyncEnabledForTenant && mobilePosOrders.length > 0 && (
              <button
                type="button"
                onClick={() => setIsMobileOrdersModalOpen(true)}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] sm:text-xs font-black shadow-sm transition-colors cursor-pointer"
                title="Mobilden PC Masaüstüne Gönderilen Satışları Gör ve Kasaya Aktar"
              >
                <Monitor className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Gelen Mobil Satış:</span>
                <span>{mobilePosOrders.length}</span>
              </button>
            )}

            {/* Pending Field Orders Central Alert in Header */}
            {pendingOrdersCount > 0 && (
              <button
                onClick={() => setActiveTab('field_orders')}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] sm:text-xs font-black shadow-sm transition-colors"
                title="Merkez hazırlık bekleyen saha siparişleri"
              >
                <Truck className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Merkez Bekleyen:</span>
                <span>{pendingOrdersCount}</span>
              </button>
            )}

            {/* Cloud Sync Health Indicator Button */}
            <button
              onClick={() => setIsCloudHealthOpen(true)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors shadow-sm"
              title="Bulut Bağlantı Sağlığı & Anlık Senkronizasyon"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">Bulut Sağlığı</span>
            </button>

            {/* Sepetay Direct Firebase Live Sync Badge */}
            {isSepetayTenant(tenantId) && (
              <button
                type="button"
                onClick={() => setIsSepetayDbModalOpen(true)}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-[11px] sm:text-xs font-black shadow-sm transition-colors cursor-pointer"
                title="Sepetay Doğrudan Firebase Firestore Eşlemesi (36ef09c0-0dc2-48a5-8551-5f7ed5163106)"
              >
                <Database className="w-3.5 h-3.5 text-emerald-100 shrink-0" />
                <span className="hidden md:inline">Sepetay Canlı DB</span>
                <span className="md:hidden">DB</span>
              </button>
            )}

            {/* Quick Actions (Desktop) */}
            {hasPermission('pos') && (
              <div className="hidden sm:flex items-center gap-2 border-r border-slate-100 pr-4 mr-2">
                 <button 
                  onClick={() => setActiveTab('pos')}
                  className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                  title="Yeni Satış"
                 >
                   <ShoppingBag className="w-4 h-4" />
                 </button>
              </div>
            )}

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 pl-2 sm:pl-3 pr-1 sm:pr-2 py-1 sm:py-1.5 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-blue-200 transition-all shadow-sm active:scale-95"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-[11px] font-black text-slate-900 leading-none">
                    {user?.displayName || (role === 'admin' ? 'Yönetici' : 'Personel')}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                    {role === 'admin' ? 'Tam Yetki' : 'Personel'}
                  </p>
                </div>
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 flex items-center justify-center text-[10px] font-black text-white uppercase border-2 border-white shadow-sm overflow-hidden">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    user?.email?.substring(0, 2).toUpperCase() || 'E'
                  )}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {isProfileOpen && (
                  <>
                    {/* Backdrop for closing */}
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsProfileOpen(false)}
                    ></div>
                    
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-20 overflow-hidden"
                    >
                      <div className="px-4 py-2 border-b border-slate-50 mb-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Hızlı Erişim</p>
                      </div>
                      
                      {(role === 'admin' || hasPermission('personnel')) && (
                        <button 
                          onClick={() => {
                            setActiveTab('personnel');
                            setIsProfileOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                        >
                          <UserCheck className="w-4 h-4" />
                          Personel Yönetimi
                        </button>
                      )}
                      {(role === 'admin' || hasPermission('settings')) && (
                        <button 
                          onClick={() => {
                            setActiveTab('settings');
                            setIsProfileOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                        >
                          <SettingsIcon className="w-4 h-4" />
                          Uygulama Ayarları
                        </button>
                      )}
                      
                      {hasPermission('pos') && (
                        <button 
                          onClick={() => {
                            setActiveTab('pos');
                            setIsProfileOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          Yeni Satış Ekranı
                        </button>
                      )}
                      
                      <div className="h-px bg-slate-50 my-1"></div>
                      
                      <button 
                        onClick={() => {
                          setIsProfileOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Güvenli Çıkış
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="flex-1 pb-24 lg:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <CloudSyncHealthPanel 
        isOpen={isCloudHealthOpen} 
        onClose={() => setIsCloudHealthOpen(false)} 
      />

      <SepetayDirectDbStatusModal
        isOpen={isSepetayDbModalOpen}
        onClose={() => setIsSepetayDbModalOpen(false)}
      />

      <MobileToDesktopOrdersModal
        isOpen={isMobileOrdersModalOpen}
        onClose={() => setIsMobileOrdersModalOpen(false)}
        orders={mobilePosOrders}
        onLoadIntoPOS={handleLoadMobileOrderIntoPOS}
        onDeleteOrder={handleDeleteMobileOrder}
      />

      {/* Global Fixed Notification Banner when a Mobile Sale arrives (completely static, no bounce/pulse) */}
      {isMobileSyncEnabledForTenant && latestMobileOrderAlert && (
        <div className="fixed bottom-20 lg:bottom-6 right-3 left-3 sm:left-auto sm:right-6 z-50 sm:w-96 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border-2 border-indigo-500 print:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <Monitor className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 truncate">
                    Mobilden PC Masaüstüne Satış Aktarıldı
                  </span>
                </div>
                <p className="text-xs font-black text-white mt-0.5 truncate">
                  {latestMobileOrderAlert.sellerName || 'Mobil Kullanıcı'} • {latestMobileOrderAlert.customer?.name || 'Perakende'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLatestMobileOrderAlert(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer shrink-0"
              title="Uyarıyı Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between text-xs">
            <span className="text-slate-300 font-bold">
              {(latestMobileOrderAlert.cart || []).reduce((s, i) => s + (Number(i.quantity) || 1), 0)} Adet Ürün Hazır
            </span>
            <span className="text-base font-black text-emerald-400 font-mono">
              {Number(latestMobileOrderAlert.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsMobileOrdersModalOpen(true);
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              Listeyi Gör ({mobilePosOrders.length})
            </button>
            <button
              type="button"
              onClick={() => handleLoadMobileOrderIntoPOS(latestMobileOrderAlert)}
              className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>PC Kasaya Aktar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FeatureItem = ({ text }: { text: string }) => (
  <div className="flex items-center gap-3">
    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
    <p className="text-slate-300 font-medium">{text}</p>
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

