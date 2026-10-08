import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  UserPlus, 
  Mail, 
  Calendar, 
  Trash2, 
  X, 
  Plus,
  TrendingUp,
  Award,
  Receipt,
  DollarSign,
  Euro,
  Coins,
  ChevronRight,
  ExternalLink,
  Edit2,
  Check,
  BarChart3,
  UserCheck,
  Key,
  Eye,
  EyeOff,
  ShoppingCart,
  Landmark,
  Truck,
  Package,
  Building2,
  LayoutDashboard,
  Settings,
  Tag,
  CheckCircle2,
  Lock,
  Sparkles,
  Phone,
  Power
} from 'lucide-react';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  where,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, PersonnelPermissions, DEFAULT_STAFF_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS } from '../context/AuthContext';
import { format } from 'date-fns';

export interface PersonnelUser {
  id: string;
  username?: string;
  password?: string;
  email?: string;
  role: 'admin' | 'staff';
  createdAt?: string | any;
  displayName?: string;
  sellerCode?: string;
  phone?: string;
  isActive?: boolean;
  permissions?: PersonnelPermissions;
}

export const PERMISSION_ITEMS: {
  key: keyof PersonnelPermissions;
  label: string;
  description: string;
  icon: any;
  category: 'Temel Modüller' | 'İşlem Yetkileri';
}[] = [
  { key: 'pos', label: 'Hızlı Satış (POS)', description: 'Kasada barkodlu ve veresiye perakende satış yapabilme', icon: ShoppingCart, category: 'Temel Modüller' },
  { key: 'field_orders', label: 'Saha Siparişleri', description: 'Müşteri ziyaretlerinde sipariş oluşturma ve merkez şubeye iletme', icon: Truck, category: 'Temel Modüller' },
  { key: 'customers', label: 'Müşteriler & Cari', description: 'Müşteri bakiyesi, veresiye borç defteri ve tahsilat alma', icon: Users, category: 'Temel Modüller' },
  { key: 'inventory', label: 'Stok Yönetimi', description: 'Ürün listesi, stok miktarları ve kritik seviyeleri görme', icon: Package, category: 'Temel Modüller' },
  { key: 'kasa', label: 'Kasa Yönetimi', description: 'TL, Dolar ve Euro kasalarını görme ve nakit hareketi kaydetme', icon: Landmark, category: 'Temel Modüller' },
  { key: 'suppliers', label: 'Tedarikçiler', description: 'Tedarikçi borçları ve mal alımlarını takip etme', icon: Building2, category: 'Temel Modüller' },
  { key: 'dashboard', label: 'Raporlar & Ciro', description: 'Günlük ve aylık mağaza ciro ve kar raporlarını görme', icon: LayoutDashboard, category: 'Temel Modüller' },
  { key: 'expenses', label: 'Gider Yönetimi', description: 'İşletme masraf ve harcamalarını kaydetme', icon: Receipt, category: 'Temel Modüller' },
  { key: 'personnel', label: 'Personel Yönetimi', description: 'Personel kullanıcı adı, şifre ve yetkilerini düzenleme', icon: Users, category: 'Temel Modüller' },
  { key: 'settings', label: 'Sistem Ayarları', description: 'İşletme ve program ayarlarını değiştirme', icon: Settings, category: 'Temel Modüller' },
  
  // Hassas İşlem İzinleri
  { key: 'canDiscount', label: 'İskonto / İndirim Yapma', description: 'Satış anında müşteriye sepet veya ürün indirimi uygulayabilme', icon: Tag, category: 'İşlem Yetkileri' },
  { key: 'canFulfillOrders', label: 'Sipariş Hazırlama & Onay', description: 'Merkez şubede saha siparişini onaylayıp stoktan düşebilme', icon: CheckCircle2, category: 'İşlem Yetkileri' },
  { key: 'canEditPrice', label: 'Ürün Fiyatı Değiştirme', description: 'Satış yaparken ürün birim fiyatını elle değiştirebilme', icon: Edit2, category: 'İşlem Yetkileri' },
];

export const Personnel: React.FC = () => {
  const { isDemo, checkDemoRestricted } = useAuth();

  const [activeTab, setActiveTab] = useState<'list' | 'turnover'>('list');
  const [users, setUsers] = useState<PersonnelUser[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Month filter for turnover
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<PersonnelUser | null>(null);
  const [editingPasswordUser, setEditingPasswordUser] = useState<PersonnelUser | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state for creating personnel
  const [formData, setFormData] = useState({
    displayName: '',
    username: '',
    password: '',
    sellerCode: '',
    phone: '',
    role: 'staff' as 'admin' | 'staff',
    permissions: { ...DEFAULT_STAFF_PERMISSIONS }
  });

  // Sales detail modal for specific seller
  const [selectedSellerSales, setSelectedSellerSales] = useState<{ seller: any; sales: any[] } | null>(null);

  useEffect(() => {
    // 1. Listen to users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const usersList = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PersonnelUser[];
      setUsers(usersList);
      setLoading(false);
    });

    // 2. Listen to sales for turnover calculation
    const unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
      const salesList = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesList);
    });

    return () => {
      unsubUsers();
      unsubSales();
    };
  }, []);

  // Quick preset permissions applier
  const applyPreset = (preset: 'all' | 'staff' | 'field' | 'cashier') => {
    let p: PersonnelPermissions = { ...DEFAULT_STAFF_PERMISSIONS };
    if (preset === 'all') {
      p = { ...DEFAULT_ADMIN_PERMISSIONS };
    } else if (preset === 'staff') {
      p = {
        pos: true,
        field_orders: true,
        customers: true,
        inventory: true,
        kasa: false,
        suppliers: false,
        dashboard: false,
        personnel: false,
        expenses: false,
        settings: false,
        canDiscount: false,
        canFulfillOrders: false,
        canEditPrice: false
      };
    } else if (preset === 'field') {
      p = {
        pos: false,
        field_orders: true,
        customers: true,
        inventory: true,
        kasa: false,
        suppliers: false,
        dashboard: false,
        personnel: false,
        expenses: false,
        settings: false,
        canDiscount: true,
        canFulfillOrders: false,
        canEditPrice: false
      };
    } else if (preset === 'cashier') {
      p = {
        pos: true,
        field_orders: false,
        customers: true,
        inventory: true,
        kasa: true,
        suppliers: false,
        dashboard: false,
        personnel: false,
        expenses: true,
        settings: false,
        canDiscount: false,
        canFulfillOrders: true,
        canEditPrice: false
      };
    }

    if (editingPermissionsUser) {
      setEditingPermissionsUser({ ...editingPermissionsUser, permissions: p });
    } else {
      setFormData(prev => ({ ...prev, permissions: p }));
    }
  };

  // Toggle single permission for editing user
  const toggleEditPermission = (key: keyof PersonnelPermissions) => {
    if (!editingPermissionsUser) return;
    const current = editingPermissionsUser.permissions || DEFAULT_STAFF_PERMISSIONS;
    const updated = {
      ...current,
      [key]: !current[key]
    };
    setEditingPermissionsUser({
      ...editingPermissionsUser,
      permissions: updated
    });
  };

  // Toggle single permission for new user form
  const toggleFormPermission = (key: keyof PersonnelPermissions) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  // Save updated permissions & user info to Firestore
  const handleSavePermissions = async () => {
    if (!editingPermissionsUser) return;
    if (checkDemoRestricted("Yetki ve personel düzenleme")) return;

    const cleanUsername = (editingPermissionsUser.username || '').trim().toLowerCase();
    const cleanPassword = (editingPermissionsUser.password || '').trim();
    const cleanDisplayName = (editingPermissionsUser.displayName || '').trim();
    const cleanSellerCode = (editingPermissionsUser.sellerCode || '').trim().toUpperCase();

    if (!cleanUsername) {
      alert("Lütfen bir kullanıcı adı girin.");
      return;
    }
    if (!cleanPassword) {
      alert("Lütfen bir giriş şifresi girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', editingPermissionsUser.id), {
        displayName: cleanDisplayName || cleanUsername,
        username: cleanUsername,
        password: cleanPassword,
        sellerCode: cleanSellerCode,
        phone: editingPermissionsUser.phone || null,
        permissions: editingPermissionsUser.permissions,
        role: editingPermissionsUser.role,
        updatedAt: serverTimestamp()
      });
      alert(`✅ ${cleanDisplayName || cleanUsername} kullanıcı bilgileri, şifresi ve modül yetkileri başarıyla güncellendi!`);
      setEditingPermissionsUser(null);
    } catch (err: any) {
      console.error(err);
      alert("Bilgiler kaydedilirken hata oluştu: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save new password
  const handleSavePassword = async () => {
    if (!editingPasswordUser) return;
    if (checkDemoRestricted("Şifre değiştirme")) return;
    const cleanPass = newPasswordValue.trim();
    if (!cleanPass) {
      alert("Lütfen yeni şifreyi girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', editingPasswordUser.id), {
        password: cleanPass,
        updatedAt: serverTimestamp()
      });
      alert(`✅ ${editingPasswordUser.displayName || editingPasswordUser.username} için yeni şifre tanımlandı: ${cleanPass}`);
      setEditingPasswordUser(null);
      setNewPasswordValue('');
    } catch (err: any) {
      console.error(err);
      alert("Şifre güncellenirken hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Active/Inactive state
  const handleToggleActive = async (targetUser: PersonnelUser) => {
    if (checkDemoRestricted("Personel durumu değiştirme")) return;
    const newStatus = targetUser.isActive === false ? true : false;
    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        isActive: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert("Durum güncellenemedi.");
    }
  };

  // Add new personnel
  const handleCreatePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkDemoRestricted("Personel oluşturma")) return;

    const cleanUsername = formData.username.trim().toLowerCase();
    const cleanPassword = formData.password.trim();
    const cleanName = formData.displayName.trim();
    const cleanCode = formData.sellerCode.trim().toUpperCase() || `E0${users.length + 1}`;

    if (!cleanUsername) {
      alert("Lütfen bir kullanıcı adı belirleyin.");
      return;
    }
    if (!cleanPassword) {
      alert("Lütfen bir giriş şifresi belirleyin.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Check if username already exists
      const qUser = query(collection(db, 'users'), where('username', '==', cleanUsername));
      const snap = await getDocs(qUser);
      if (!snap.empty) {
        alert(`"${cleanUsername}" kullanıcı adı zaten kullanımda. Lütfen başka bir kullanıcı adı seçin.`);
        setIsSubmitting(false);
        return;
      }

      const newUserData = {
        username: cleanUsername,
        password: cleanPassword,
        displayName: cleanName || cleanUsername,
        sellerCode: cleanCode,
        phone: formData.phone.trim() || null,
        role: formData.role,
        isActive: true,
        permissions: formData.permissions,
        createdAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'users'), newUserData);

      alert(`🎉 Personel başarıyla oluşturuldu!\n\nKullanıcı Adı: ${cleanUsername}\nŞifre: ${cleanPassword}\nSatış Kodu: [${cleanCode}]\n\nPersonel bu bilgilerle 'Personel Girişi' ekranından anında sisteme giriş yapabilir.`);
      
      setIsAddModalOpen(false);
      setFormData({
        displayName: '',
        username: '',
        password: '',
        sellerCode: '',
        phone: '',
        role: 'staff',
        permissions: { ...DEFAULT_STAFF_PERMISSIONS }
      });
    } catch (err: any) {
      console.error(err);
      alert("Personel kaydedilirken hata oluştu: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Seed sample personnel if empty
  const handleSeedDemoPersonnel = async () => {
    if (checkDemoRestricted("Örnek personel ekleme")) return;
    try {
      const sampleStaff = [
        {
          username: 'saha01',
          password: '123',
          displayName: 'Ahmet Yılmaz (Saha Satış)',
          sellerCode: 'E01',
          phone: '0532 111 22 33',
          role: 'staff',
          isActive: true,
          permissions: {
            pos: false,
            field_orders: true,
            customers: true,
            inventory: true,
            kasa: false,
            suppliers: false,
            dashboard: false,
            personnel: false,
            expenses: false,
            settings: false,
            canDiscount: true,
            canFulfillOrders: false,
            canEditPrice: false
          },
          createdAt: new Date().toISOString()
        },
        {
          username: 'kasiyer01',
          password: '123',
          displayName: 'Ayşe Kaya (Mağaza & Kasa)',
          sellerCode: 'E02',
          phone: '0544 222 33 44',
          role: 'staff',
          isActive: true,
          permissions: {
            pos: true,
            field_orders: false,
            customers: true,
            inventory: true,
            kasa: true,
            suppliers: false,
            dashboard: false,
            personnel: false,
            expenses: true,
            settings: false,
            canDiscount: false,
            canFulfillOrders: true,
            canEditPrice: false
          },
          createdAt: new Date().toISOString()
        }
      ];

      for (const st of sampleStaff) {
        await addDoc(collection(db, 'users'), st);
      }
      alert("✅ Örnek personel hesapları oluşturuldu!\n\n1. Kullanıcı: saha01 / Şifre: 123 (Saha Yetkili)\n2. Kullanıcı: kasiyer01 / Şifre: 123 (Kasa & Satış Yetkili)");
    } catch (e: any) {
      console.error(e);
      alert("Hata: " + e.message);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (checkDemoRestricted("Personel silme")) return;
    if (!window.confirm(`"${name}" personelini silmek istediğinize emin misiniz?`)) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Personel silinirken bir hata oluştu.");
    }
  };

  // Filter sales by selected month
  const filteredSalesForMonth = sales.filter((s: any) => {
    if (!s.date) return false;
    const sDate = s.date?.toDate ? s.date.toDate() : (s.date ? new Date(s.date) : new Date());
    const [year, month] = selectedMonth.split('-').map(Number);
    return sDate.getFullYear() === year && (sDate.getMonth() + 1) === month;
  });

  // Calculate turnover per salesperson
  const sellerStats = users.map((u, index) => {
    const code = u.sellerCode || `E0${index + 1}`;
    const name = u.displayName || u.username || u.email?.split('@')[0] || `Personel ${index + 1}`;

    const sellerSales = filteredSalesForMonth.filter((s: any) => 
      (s.sellerCode && s.sellerCode.toUpperCase() === code.toUpperCase()) ||
      (s.sellerId && s.sellerId === u.id)
    );

    const totalTurnoverTRY = sellerSales.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
    const count = sellerSales.length;
    const avgBasket = count > 0 ? totalTurnoverTRY / count : 0;

    const usdTurnover = sellerSales
      .filter((s: any) => s.currency === 'USD')
      .reduce((sum: number, s: any) => sum + Number(s.foreignAmount || 0), 0);

    const eurTurnover = sellerSales
      .filter((s: any) => s.currency === 'EUR')
      .reduce((sum: number, s: any) => sum + Number(s.foreignAmount || 0), 0);

    return {
      user: u,
      code,
      name,
      salesCount: count,
      totalTurnoverTRY,
      usdTurnover,
      eurTurnover,
      avgBasket,
      sellerSales
    };
  });

  sellerStats.sort((a, b) => b.totalTurnoverTRY - a.totalTurnoverTRY);
  const topSeller = sellerStats[0];
  const grandTotalMonthTurnover = sellerStats.reduce((sum, s) => sum + s.totalTurnoverTRY, 0);
  const grandTotalMonthSalesCount = sellerStats.reduce((sum, s) => sum + s.salesCount, 0);

  const filteredUsers = users.filter(user => 
    (user.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.sellerCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 lg:pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Personel & Yetki Yönetimi</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Kullanıcı Adı & Şifre Tanımlama, Modül Yetki Tikleri ve Aylık Satış Cirosu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {users.length <= 1 && (
            <button
              onClick={handleSeedDemoPersonnel}
              className="px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-all"
              title="Örnek Saha ve Kasiyer Personelleri Tanımla"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Örnek Personel Ekle</span>
            </button>
          )}

          <button
            onClick={() => {
              if (checkDemoRestricted("Personel ekleme")) return;
              setIsAddModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-black text-xs sm:text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Yeni Personel Tanımla</span>
          </button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'list'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Personel Hesapları & Yetki Tikleri</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-bold">
            {users.length} Hesap
          </span>
        </button>

        <button
          onClick={() => setActiveTab('turnover')}
          className={`pb-3 px-4 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'turnover'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Aylık Satış & Ciro Performansı</span>
        </button>
      </div>

      {/* TAB 1: PERSONNEL ACCOUNTS & PERMISSION CHECKBOXES */}
      {activeTab === 'list' && (
        <div className="space-y-5">
          {/* Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="İsim, kullanıcı adı (@ahmet) veya satış kodu ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Toplam <strong>{filteredUsers.length}</strong> personel listeleniyor
            </div>
          </div>

          {/* Personnel Table */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3.5">Satış Kodu</th>
                    <th className="px-5 py-3.5">Personel & Kullanıcı Adı</th>
                    <th className="px-5 py-3.5">Giriş Şifresi</th>
                    <th className="px-5 py-3.5">Rol & Durum</th>
                    <th className="px-5 py-3.5">Aktif İzinler / Yetkiler (Tikler)</th>
                    <th className="px-5 py-3.5 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        Personel listesi yükleniyor...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        Kayıtlı personel bulunamadı. "Yeni Personel Tanımla" butonuna basarak ekleyin.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, idx) => {
                      const userPerms = u.permissions || (u.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS);
                      const isPassVisible = showPasswordMap[u.id];
                      const activePermKeys = Object.entries(userPerms).filter(([_, v]) => Boolean(v)).map(([k]) => k);

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Seller Code */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-black text-xs">
                              {u.sellerCode || `E0${idx + 1}`}
                            </span>
                          </td>

                          {/* Name & Username */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-black flex items-center justify-center text-xs uppercase shadow-xs">
                                {(u.displayName || u.username || 'P').substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">{u.displayName || 'İsimsiz Personel'}</p>
                                <p className="text-[11px] font-mono font-bold text-blue-600">
                                  @{u.username || u.email?.split('@')[0] || 'tanımsız'}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Password */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                                {u.password ? (isPassVisible ? u.password : '••••••') : '(Google Girişi)'}
                              </span>
                              {u.password && (
                                <button
                                  onClick={() => setShowPasswordMap(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                                  className="text-slate-400 hover:text-slate-700 p-1"
                                  title={isPassVisible ? "Şifreyi Gizle" : "Şifreyi Göster"}
                                >
                                  {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingPasswordUser(u);
                                  setNewPasswordValue(u.password || '');
                                }}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                              >
                                Değiştir
                              </button>
                            </div>
                          </td>

                          {/* Role & Status */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                u.role === 'admin' 
                                  ? 'bg-purple-100 text-purple-700' 
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {u.role === 'admin' ? 'Yönetici' : 'Personel'}
                              </span>

                              <button
                                onClick={() => handleToggleActive(u)}
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full transition-all ${
                                  u.isActive !== false 
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                                    : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                }`}
                                title="Hesap durumunu değiştir"
                              >
                                {u.isActive !== false ? '● Aktif' : '○ Pasif'}
                              </button>
                            </div>
                          </td>

                          {/* Permissions Badges */}
                          <td className="px-5 py-4 max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {u.role === 'admin' ? (
                                <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-black text-[10px] border border-purple-200">
                                  Tüm Modüller Açık (Tam Yetki)
                                </span>
                              ) : (
                                <>
                                  {PERMISSION_ITEMS.filter(it => userPerms[it.key]).map(it => (
                                    <span 
                                      key={it.key}
                                      className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200"
                                      title={it.description}
                                    >
                                      {it.label.split(' ')[0]}
                                    </span>
                                  ))}
                                  {activePermKeys.length === 0 && (
                                    <span className="text-[10px] text-rose-600 font-bold italic">Yetki verilmemiş</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingPermissionsUser({
                                    ...u,
                                    permissions: { ...userPerms }
                                  });
                                }}
                                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded-lg text-xs font-black transition-all flex items-center gap-1 shadow-2xs"
                                title="Kullanıcı Adı, Şifre ve Modül Yetki Tiklerini Düzenle"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Düzenle & Yetki Tikleri</span>
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u.id, u.displayName || u.username || 'Personel')}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Personeli Sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
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

      {/* TAB 2: TURNOVER & SALES PERFORMANCE REPORT */}
      {activeTab === 'turnover' && (
        <div className="space-y-6">
          {/* Top Month Filter & Overview */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Dönem / Ay Seçimi</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="text-sm font-black text-slate-800 bg-transparent outline-none cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Dönem Toplam Ciro</span>
                <span className="text-2xl font-black text-indigo-600 font-mono">
                  {grandTotalMonthTurnover.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
              <div className="text-right pl-4 border-l border-slate-200">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Toplam Satış</span>
                <span className="text-xl font-black text-slate-800 font-mono">
                  {grandTotalMonthSalesCount} Fiş
                </span>
              </div>
            </div>
          </div>

          {/* Quick Highlight Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. Lider Eleman */}
            <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center font-bold">
                  <Award className="w-6 h-6 text-amber-100" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-white/20 rounded-full">
                  Ayın Lideri
                </span>
              </div>
              <p className="text-[11px] font-bold text-amber-100 uppercase tracking-widest">En Yüksek Ciro Yapan Eleman</p>
              <h3 className="text-xl font-black text-white mt-1 truncate">
                {topSeller?.name || 'Henüz Satış Yok'}
              </h3>
              <p className="text-xs font-mono font-bold text-amber-200 mt-0.5">
                Kod: [{topSeller?.code || '-'}]
              </p>
              <div className="mt-4 pt-3 border-t border-white/20 flex justify-between text-xs font-bold">
                <span>Ciro:</span>
                <span className="text-sm font-black font-mono">
                  {(topSeller?.totalTurnoverTRY || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
            </div>

            {/* 2. Toplam Satış Hacmi */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-bold">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-full">
                  Ciro
                </span>
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tüm Ekip Toplamı</p>
              <h3 className="text-2xl sm:text-3xl font-black text-white mt-1 font-mono">
                {grandTotalMonthTurnover.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </h3>
              <div className="mt-4 pt-3 border-t border-white/10 flex justify-between text-xs text-slate-400 font-bold">
                <span>Fiş Sayısı:</span>
                <span className="text-white font-mono">{grandTotalMonthSalesCount} Adet Satış</span>
              </div>
            </div>

            {/* 3. Ortalama Sepet */}
            <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center font-bold">
                  <Receipt className="w-6 h-6 text-indigo-400" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full">
                  Ortalama
                </span>
              </div>
              <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-widest">Ortalama Fiş Tutarı</p>
              <h3 className="text-2xl sm:text-3xl font-black text-white mt-1 font-mono">
                {(grandTotalMonthSalesCount > 0 ? grandTotalMonthTurnover / grandTotalMonthSalesCount : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </h3>
              <div className="mt-4 pt-3 border-t border-white/10 flex justify-between text-xs text-indigo-300 font-bold">
                <span>Dönem:</span>
                <span className="text-white font-mono">{selectedMonth}</span>
              </div>
            </div>
          </div>

          {/* Salesperson Turnover Table */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">Satış Elemanları Ciro Tablosu</h3>
                <p className="text-xs text-slate-500">Seçili ayda satış yapan personellerin toplam cirosu ve performansı</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4">Sıra</th>
                    <th className="px-6 py-4">Satış Elemanı Kodu</th>
                    <th className="px-6 py-4">Personel Adı</th>
                    <th className="px-6 py-4 text-center">Satış Fişi</th>
                    <th className="px-6 py-4 text-right">Dövizli Ciro</th>
                    <th className="px-6 py-4 text-right">Ortalama Fiş</th>
                    <th className="px-6 py-4 text-right">Toplam Ciro (TL)</th>
                    <th className="px-6 py-4 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {sellerStats.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                        Kayıtlı satış elemanı bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    sellerStats.map((st, idx) => (
                      <tr key={st.user.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4">
                          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-black ${
                            idx === 0 ? 'bg-amber-100 text-amber-800' :
                            idx === 1 ? 'bg-slate-200 text-slate-700' :
                            idx === 2 ? 'bg-amber-50 text-amber-700' : 'text-slate-400'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-black text-xs">
                            {st.code}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="font-bold text-slate-900 text-sm">{st.name}</p>
                          <p className="text-[10px] text-slate-400">@{st.user.username || 'personel'}</p>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap font-mono font-bold">
                          {st.salesCount} Adet
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap font-mono">
                          {st.usdTurnover > 0 && <span className="block text-emerald-600 font-bold">${st.usdTurnover.toFixed(2)}</span>}
                          {st.eurTurnover > 0 && <span className="block text-blue-600 font-bold">€{st.eurTurnover.toFixed(2)}</span>}
                          {st.usdTurnover === 0 && st.eurTurnover === 0 && <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap font-mono text-slate-600">
                          {st.avgBasket.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap font-mono font-black text-sm text-indigo-600">
                          {st.totalTurnoverTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedSellerSales({ seller: st, sales: st.sellerSales })}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                          >
                            Fişleri İncele
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD NEW PERSONNEL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-600 text-white">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-200" />
                  Yeni Personel & Kullanıcı Tanımla
                </h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  Kullanıcı adı ve şifre vererek personel girişi hazırlayın ve aktif yetkileri seçin.
                </p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePersonnel} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Account Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1">
                    Ad Soyad *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Örn: Ahmet Yılmaz"
                    value={formData.displayName}
                    onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1">
                    Satış Elemanı Kodu *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder={`Örn: E0${users.length + 1}`}
                    value={formData.sellerCode}
                    onChange={e => setFormData({ ...formData, sellerCode: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-black uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1">
                    Giriş Kullanıcı Adı *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">@</span>
                    <input
                      required
                      type="text"
                      placeholder="ahmet (küçük harfle)"
                      value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                      className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-black focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1">
                    Giriş Şifresi *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Şifre belirleyin (örn: 1234)"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Role Preset Selector */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Yetki Şablonu (Hızlı Seçim)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPreset('staff')}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      Standart Satış
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('field')}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      Saha Elemanı
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('cashier')}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                      Kasiyer / Kasa
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('all')}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100"
                    >
                      Tümünü Aç
                    </button>
                  </div>
                </div>

                {/* Permission Checkboxes Grid */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 max-h-72 overflow-y-auto">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Programda Aktif Olarak Kullanabileceği Modüller (Tikleyin):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PERMISSION_ITEMS.map((item) => {
                      const isChecked = Boolean(formData.permissions[item.key]);
                      const Icon = item.icon;

                      return (
                        <label
                          key={item.key}
                          onClick={() => toggleFormPermission(item.key)}
                          className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                            isChecked 
                              ? 'bg-blue-50/80 border-blue-400 text-slate-900 shadow-2xs' 
                              : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent onClick
                            className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 font-bold text-xs">
                              <Icon className={`w-3.5 h-3.5 ${isChecked ? 'text-blue-600' : 'text-slate-400'}`} />
                              <span>{item.label}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                              {item.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Personeli ve Yetkileri Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT PERMISSIONS (TIKLER) MODAL */}
      {editingPermissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-400" />
                  <h3 className="text-base font-black uppercase tracking-tight">
                    Yetki Tikleri Yönetimi: {editingPermissionsUser.displayName || editingPermissionsUser.username}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kullanıcı Adı: @{editingPermissionsUser.username || '-'} | Satış Kodu: [{editingPermissionsUser.sellerCode || '-'}]
                </p>
              </div>
              <button 
                onClick={() => setEditingPermissionsUser(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Personnel Login & Profile Credentials */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    <span>Giriş Bilgileri & Profil</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">Yönetici tarafından düzenlenebilir</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">Ad Soyad</label>
                    <input
                      type="text"
                      value={editingPermissionsUser.displayName || ''}
                      onChange={e => setEditingPermissionsUser({ ...editingPermissionsUser, displayName: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                      placeholder="Ad Soyad"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                      Kullanıcı Adı <span className="text-blue-600">(Giriş için)</span>
                    </label>
                    <input
                      type="text"
                      value={editingPermissionsUser.username || ''}
                      onChange={e => setEditingPermissionsUser({ ...editingPermissionsUser, username: e.target.value.toLowerCase().trim() })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                      placeholder="kullaniciadi"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                      Giriş Şifresi <span className="text-emerald-600">(Uygulama Giriş)</span>
                    </label>
                    <input
                      type="text"
                      value={editingPermissionsUser.password || ''}
                      onChange={e => setEditingPermissionsUser({ ...editingPermissionsUser, password: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                      placeholder="Şifre"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">Satış Elemanı Kodu</label>
                    <input
                      type="text"
                      value={editingPermissionsUser.sellerCode || ''}
                      onChange={e => setEditingPermissionsUser({ ...editingPermissionsUser, sellerCode: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500"
                      placeholder="E01"
                    />
                  </div>
                </div>
              </div>

              {/* Presets Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-black uppercase text-slate-700">Hızlı Yetki Şablonu:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('staff')}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    Standart Satış
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('field')}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  >
                    Saha Elemanı
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('cashier')}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  >
                    Kasiyer / Kasa
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('all')}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100"
                  >
                    Tümünü Aç
                  </button>
                </div>
              </div>

              {/* Checkboxes List */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-slate-700">
                  Bu personelin programda görebileceği ve işlem yapabileceği alanlar:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PERMISSION_ITEMS.map((item) => {
                    const currentPerms = editingPermissionsUser.permissions || DEFAULT_STAFF_PERMISSIONS;
                    const isChecked = Boolean(currentPerms[item.key]);
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.key}
                        onClick={() => toggleEditPermission(item.key)}
                        className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                          isChecked 
                            ? 'bg-blue-50/70 border-blue-400 text-slate-900 shadow-xs' 
                            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 mt-0.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-xs">
                            <Icon className={`w-3.5 h-3.5 ${isChecked ? 'text-blue-600' : 'text-slate-400'}`} />
                            <span>{item.label}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingPermissionsUser(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Yetkileri Güncelle & Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CHANGE PASSWORD MODAL */}
      {editingPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <h3 className="text-sm font-black uppercase flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400" />
                Şifre Değiştir: {editingPasswordUser.displayName || editingPasswordUser.username}
              </h3>
              <button onClick={() => setEditingPasswordUser(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1">Yeni Giriş Şifresi</label>
                <input
                  type="text"
                  placeholder="Yeni şifreyi yazın..."
                  value={newPasswordValue}
                  onChange={e => setNewPasswordValue(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Personel bu yeni şifreyle hemen giriş yapabilir.</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingPasswordUser(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl"
                >
                  İptal
                </button>
                <button
                  onClick={handleSavePassword}
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SELLER SALES BREAKDOWN MODAL */}
      {selectedSellerSales && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-600 font-mono text-xs font-black">
                    {selectedSellerSales.seller.code}
                  </span>
                  <h3 className="font-black text-base uppercase">
                    {selectedSellerSales.seller.name} - Satış Hareketleri
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dönem: {selectedMonth} | Toplam Ciro: {selectedSellerSales.seller.totalTurnoverTRY.toLocaleString('tr-TR')} ₺
                </p>
              </div>
              <button
                onClick={() => setSelectedSellerSales(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {selectedSellerSales.sales.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic text-xs">
                  Bu ay için kayıtlı satış bulunmuyor.
                </div>
              ) : (
                selectedSellerSales.sales.map((sale: any) => {
                  const sDate = sale.date?.toDate ? sale.date.toDate() : (sale.date ? new Date(sale.date) : new Date());
                  return (
                    <div key={sale.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-slate-500">Fiş: {sale.id.slice(0, 8)}</span>
                          <span className="text-slate-400 ml-2">{format(sDate, 'dd.MM.yyyy HH:mm')}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-slate-900 font-mono">
                            {Number(sale.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </span>
                          {sale.currency && sale.currency !== 'TRY' && (
                            <span className="text-[11px] font-bold text-indigo-600 ml-2 font-mono">
                              ({sale.currency === 'USD' ? '$' : '€'}{Number(sale.foreignAmount || 0).toFixed(2)})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-600">
                        <strong>Müşteri:</strong> {sale.customerName || 'Perakende Müşteri'} | 
                        <strong className="ml-2">Ödeme:</strong> {sale.paymentMethod === 'cash' ? 'Nakit' : sale.paymentMethod === 'card' ? 'Kredi Kartı' : 'Veresiye'}
                      </div>

                      <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-700 space-y-1">
                        {sale.items?.map((it: any, iIdx: number) => (
                          <div key={iIdx} className="flex justify-between">
                            <span>{it.quantity}x {it.name}</span>
                            <span className="font-mono">{(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString('tr-TR')} ₺</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Personnel;
