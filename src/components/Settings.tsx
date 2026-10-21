import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, setDoc, doc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { updatePassword, signOut } from 'firebase/auth';
import { Settings as SettingsIcon, Shield, UserCheck, Download, Globe, CheckCircle2, FileArchive, Server, Landmark, Plus, Trash2, Building, Lock, Database, Activity, Layers, Warehouse } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Subscription } from './Subscription';
import { TenantMembershipSettings } from './TenantMembershipSettings';
import { MarketplaceIntegrations } from './MarketplaceIntegrations';
import { GlobalCatalogSyncModal } from './inventory/GlobalCatalogSyncModal';
import { SepetayDirectDbStatusModal } from './common/SepetayDirectDbStatusModal';
import { isDocInTenant, withTenant, isSepetayTenant, SEPETAY_LEGACY_APPLET_ID } from '../lib/tenant';

const Settings: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const { role: currentUserRole, isSuperAdmin, tenantId, currentTenant } = useAuth();
  const [isGlobalSyncOpen, setIsGlobalSyncOpen] = useState(false);
  const [isSepetayStatusOpen, setIsSepetayStatusOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'all' | 'users' | 'bank' | 'system'>('all');

  // Bank accounts management
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankName, setBankName] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankCurrency, setBankCurrency] = useState('TRY');
  const [isAddingBank, setIsAddingBank] = useState(false);

  // Admin password change state
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassword.trim()) {
      alert("Lütfen yeni şifreyi giriniz.");
      return;
    }
    const newPass = newAdminPassword.trim();
    try {
      const targetId = selectedAdminId || users.find(u => u.role === 'admin')?.id || 'admin-master';
      
      // Update target admin doc and master admin doc with setDoc merge: true
      await setDoc(doc(db, 'users', targetId), { 
        password: newPass,
        role: 'admin',
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(doc(db, 'users', 'admin-master'), { 
        password: newPass,
        role: 'admin',
        username: 'admin',
        displayName: 'Yönetici (Tam Yetkili)',
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (auth.currentUser) {
        try {
          await updatePassword(auth.currentUser, newPass);
        } catch (authErr: any) {
          console.warn("Firebase Auth updatePassword notice:", authErr);
        }
      }

      alert("Şifreniz başarıyla değiştirildi. Lütfen yeni şifrenizle tekrar giriş yapın.");
      await signOut(auth);
      window.location.reload();
    } catch (err: any) {
      alert("Şifre güncellenirken hata oluştu: " + err.message);
    }
  };

  useEffect(() => {
    if (!currentUserRole) return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((u: any) => {
          if (!isSuperAdmin) {
            const email = (u.email || '').toLowerCase();
            if (
              u.isSuperAdmin === true ||
              u.id === 'admin-master' ||
              email.includes('ilyasyksel') ||
              email.includes('sepetaykrtasiyep')
            ) {
              return false;
            }
            if (!isDocInTenant(u)) return false;
          }
          return true;
        });
      setUsers(list);
    });
    return () => unsubscribe();
  }, [currentUserRole, isSuperAdmin, tenantId]);

  useEffect(() => {
    const unsubB = onSnapshot(collection(db, 'bank_accounts'), (snapshot) => {
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((b: any) => isDocInTenant(b, tenantId));
      setBankAccounts(list);
    }, (err) => console.warn("Bank accounts error:", err));
    return () => unsubB();
  }, [tenantId]);

  const handleAddBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !bankIban.trim()) {
      alert("Lütfen banka adı ve IBAN numarasını girin.");
      return;
    }
    try {
      await addDoc(collection(db, 'bank_accounts'), withTenant({
        bankName: bankName.trim(),
        iban: bankIban.trim(),
        accountHolder: bankHolder.trim(),
        branch: bankBranch.trim(),
        currency: bankCurrency,
        createdAt: serverTimestamp()
      }, tenantId));
      setBankName('');
      setBankIban('');
      setBankHolder('');
      setBankBranch('');
      setIsAddingBank(false);
    } catch (err: any) {
      alert("Banka hesabı eklenirken hata oluştu: " + err.message);
    }
  };

  const handleDeleteBankAccount = async (id: string) => {
    if (!window.confirm("Bu banka hesabını silmek istediğinizden emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, 'bank_accounts', id));
    } catch (err: any) {
      alert("Banka hesabı silinirken hata oluştu: " + err.message);
    }
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'staff' : 'admin';
    await updateDoc(doc(db, 'users', userId), { role: newRole });
  };

  const updateSubscriptionStatus = async (userId: string, newStatus: string) => {
    if (!isSuperAdmin) return;
    await updateDoc(doc(db, 'users', userId), { subscriptionStatus: newStatus });
  };

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm group shrink-0">
            <SettingsIcon className="w-5 h-5 transition-transform group-hover:rotate-90" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Sistem & Hesap Ayarları</h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Kullanıcı yetkileri, personel hesapları, yönetici şifresi, banka hesapları ve sistem yapılandırması.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSettingsSection('all')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              settingsSection === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tüm Ayarlar
          </button>
          <button
            type="button"
            onClick={() => setSettingsSection('users')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              settingsSection === 'users' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kullanıcılar & Roller
          </button>
          <button
            type="button"
            onClick={() => setSettingsSection('bank')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              settingsSection === 'bank' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Banka & IBAN
          </button>
          <button
            type="button"
            onClick={() => setSettingsSection('system')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              settingsSection === 'system' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sistem & Abonelik
          </button>
        </div>
      </header>

      <div className="space-y-6">
          <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-900">
            {isSuperAdmin ? 'Kullanıcı Yetkileri ve Abonelik' : 'Personel ve Kullanıcılarım'}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {users.map(user => (
            <div key={user.id} className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                  {user.email?.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{user.email}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Rol: <span className="capitalize font-bold text-blue-600">{user.role === 'admin' ? 'Yönetici' : 'Personel'}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <select 
                    value={user.subscriptionStatus || 'inactive'}
                    onChange={(e) => updateSubscriptionStatus(user.id, e.target.value)}
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-slate-50"
                  >
                    <option value="inactive">Pasif</option>
                    <option value="trial">Deneme</option>
                    <option value="active">Aktif</option>
                  </select>
                )}
                {isSuperAdmin && (
                  <button 
                    onClick={() => toggleRole(user.id, user.role)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    ROLÜ DEĞİŞTİR
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Yönetici Şifre Değiştirme */}
      {isSuperAdmin && (
        <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <Lock className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900">Yönetici Şifresini Değiştir</h3>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            <p className="text-xs text-slate-500">
              Yönetici şifrenizi istediğiniz zaman buradan güncelleyebilirsiniz.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Yönetici Seçin</label>
                <select
                  value={selectedAdminId}
                  onChange={e => setSelectedAdminId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900"
                >
                  <option value="">Varsayılan / Ana Yönetici (admin-master)</option>
                  {users.filter(u => u.role === 'admin').map(u => (
                    <option key={u.id} value={u.id}>{u.email || u.username || u.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Yeni Şifre</label>
                <input
                  type="text"
                  value={newAdminPassword}
                  onChange={e => setNewAdminPassword(e.target.value)}
                  placeholder="Yeni şifre girin"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-sm"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Şifreyi Güncelle</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Global Ürün Kataloğu & Ortak Havuz */}
      <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Global Ürün Kataloğu & Ortak Havuz</h3>
              <p className="text-xs text-slate-500">Tüm kiracıların ortak faydalandığı akıllı barkod veritabanı (global_products)</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> 1.200+ Ürün Aktif
          </span>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Sistemdeki tüm eski ve yeni ürünler bu ortak havuzda toplanır. Bir dükkan yeni bir ürün eklediğinde veya barkod okuttuğunda ürün ismi ve kategorisi otomatik dolar. İstediğiniz zaman tüm eski ürünleri tek tıkla havuza senkronize edebilirsiniz.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsGlobalSyncOpen(true)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              <span>Eski Ürünleri Global Havuza Aktar (Senkronize Et)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Depo Yönetimi Modülü (Aç/Kapat) */}
      <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Depo Yönetimi Modülü (Aç / Kapat)</h3>
              <p className="text-xs text-slate-500">Sol ana menüdeki Depo Yönetimi sekmesini ve çoklu lokasyon transferlerini açın veya kapatın.</p>
            </div>
          </div>
          <button
            onClick={async () => {
              const currentActive = currentTenant?.depoYonetimiAktif !== false;
              try {
                await updateDoc(doc(db, 'tenants', tenantId), {
                  depoYonetimiAktif: !currentActive,
                  updatedAt: serverTimestamp()
                });
                alert(`✅ Depo Yönetimi Modülü ${!currentActive ? 'açıldı' : 'kapatıldı'}.`);
              } catch (err: any) {
                alert("Güncellenemedi: " + err.message);
              }
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              currentTenant?.depoYonetimiAktif !== false 
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md' 
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            {currentTenant?.depoYonetimiAktif !== false ? 'AÇIK (Kapatmak için tıkla)' : 'KAPALI (Açmak için tıkla)'}
          </button>
        </div>
      </div>

      {/* Sepetay Doğrudan Firebase Firestore Eşlemesi */}
      {isSepetayTenant(tenantId) && (
        <div className="max-w-2xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 text-white rounded-xl border border-emerald-500/40 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                <Database className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-white">Sepetay Doğrudan Firebase Eşlemesi</h3>
                <p className="text-xs text-emerald-300 font-mono">Proje / Applet ID: {SEPETAY_LEGACY_APPLET_ID}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Canlı Bağlantı (Live Sync)
            </span>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Sepetay kiracısı için harici bir ara API olmaksızın doğrudan Firestore <code className="text-emerald-400 font-mono font-bold">onSnapshot</code> gerçek zamanlı dinleyicisi aktiftir. Eski sistem ile yeni Bulut POS arasında <code className="text-white font-mono font-bold">products</code> (stok), <code className="text-white font-mono font-bold">customers</code> (cari) ve <code className="text-white font-mono font-bold">sales</code> (satış) verileri live sync olarak eş zamanlı çalışmaktadır.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsSepetayStatusOpen(true)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Activity className="w-4 h-4" />
                <span>Canlı Bağlantı & Eşleme Durumunu Görüntüle</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Marketplace Integrations Section */}
      <MarketplaceIntegrations />

      {/* Bank Accounts Section */}
      <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Landmark className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900">Banka Hesaplarım (IBAN)</h3>
          </div>
          <button
            onClick={() => setIsAddingBank(!isAddingBank)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Banka Hesabı Ekle</span>
          </button>
        </div>

        {isAddingBank && (
          <form onSubmit={handleAddBankAccount} className="p-6 bg-slate-50 border-b border-slate-100 space-y-4 animate-fadeIn">
            <h4 className="font-black text-xs uppercase tracking-wider text-slate-700">Yeni Banka Hesabı Tanımla</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Banka Adı</label>
                <input
                  type="text"
                  placeholder="Örn. Garanti BBVA / Akbank"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">IBAN Numarası</label>
                <input
                  type="text"
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  value={bankIban}
                  onChange={e => setBankIban(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Hesap Sahibi / Ünvan</label>
                <input
                  type="text"
                  placeholder="Firma veya Yetkili Adı"
                  value={bankHolder}
                  onChange={e => setBankHolder(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Şube</label>
                  <input
                    type="text"
                    placeholder="Şube Adı / Kodu"
                    value={bankBranch}
                    onChange={e => setBankBranch(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Para Birimi</label>
                  <select
                    value={bankCurrency}
                    onChange={e => setBankCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingBank(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md"
              >
                Kaydet
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-100">
          {bankAccounts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-bold">
              Henüz tanımlı banka hesabı bulunmuyor. Yukarıdan "Banka Hesabı Ekle" butonuna basarak ekleyin.
            </div>
          ) : (
            bankAccounts.map(bank => (
              <div key={bank.id} className="p-5 flex items-center justify-between text-xs gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-black">
                    <Building className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-slate-900 text-sm">{bank.bankName}</p>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-bold font-mono text-[10px]">{bank.currency || 'TRY'}</span>
                    </div>
                    <p className="font-mono text-slate-700 font-bold mt-0.5 tracking-wider">{bank.iban}</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      {bank.accountHolder ? `Hesap Sahibi: ${bank.accountHolder}` : ''} {bank.branch ? `• Şube: ${bank.branch}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteBankAccount(bank.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors shrink-0"
                  title="Hesabı Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Canlıya Alma ve ZIP İndirme Bölümü */}
      {isSuperAdmin && (
        <div className="max-w-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl shadow-lg overflow-hidden border border-slate-700">
          <div className="p-6 border-b border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Canlıya Alma & ZIP Dosyaları</h3>
                <p className="text-xs text-slate-400">pos.beyoglukirtasiye.tr veya hostinginiz için hazır paketler</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> Canlıya Hazır
            </span>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Sisteminizi kendi alan adınızda (<span className="text-emerald-400 font-mono font-semibold">pos.beyoglukirtasiye.tr</span>) yayınlamak için hazırlanmış ZIP paketlerini aşağıdan tek tıkla indirebilirsiniz. 
              Verileriniz Firebase bulut veritabanına bağlı olduğu için siteden eklediğiniz tüm ürünler, satışlar ve stoklar her yerden eş zamanlı (canlı) çalışır.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              {/* Canlı Yayın Paketi (dist.zip) */}
              <a
                href="/pos-canli-web-dist.zip"
                download="pos-canli-web-dist.zip"
                className="flex flex-col justify-between p-4 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-emerald-500/40 hover:border-emerald-400 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
                    <Server className="w-4 h-4" />
                    <span>Canlı Yayın Paketi</span>
                  </div>
                  <Download className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  cPanel / Plesk / Nginx / Apache public_html içine doğrudan çıkartılacak hazır HTML+JS dosyaları ve .htaccess.
                </p>
                <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-emerald-300 font-medium">
                  <span>pos-canli-web-dist.zip</span>
                  <span className="bg-emerald-500/20 px-2 py-0.5 rounded font-mono">1.6 MB</span>
                </div>
              </a>

              {/* Tüm Kaynak Kodları (source.zip) */}
              <a
                href="/pos-proje-kaynak-kodlari.zip"
                download="pos-proje-kaynak-kodlari.zip"
                className="flex flex-col justify-between p-4 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 hover:border-slate-550 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5 text-blue-400 font-bold text-sm">
                    <FileArchive className="w-4 h-4" />
                    <span>Kaynak Kodları</span>
                  </div>
                  <Download className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Tüm React + Vite + TypeScript proje dosyaları, bileşenler ve konfigürasyonlar.
                </p>
                <div className="mt-3 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-blue-300 font-medium">
                  <span>pos-proje-kaynak-kodlari.zip</span>
                  <span className="bg-blue-500/20 px-2 py-0.5 rounded font-mono">1.3 MB</span>
                </div>
              </a>
            </div>

            {/* Hızlı Kurulum Adımları */}
            <div className="mt-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700/70 text-xs text-slate-300 space-y-2">
              <p className="font-semibold text-white flex items-center gap-1.5">
                <span>🚀</span> pos.beyoglukirtasiye.tr için 3 Adımda Canlıya Alma:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 leading-relaxed">
                <li>Yukarıdaki <b className="text-emerald-400 font-medium">Canlı Yayın Paketi (.zip)</b> butonuna basarak zip dosyasını indirin.</li>
                <li>Hostinginizin (cPanel / Plesk) Dosya Yöneticisine girip <code className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300">pos.beyoglukirtasiye.tr</code> klasörüne gidin.</li>
                <li>Zip dosyasını yükleyip <b className="text-white">"Extract / Çıkart"</b> yapın. Tebrikler, siteniz eş zamanlı olarak yayında!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Kiracıların Üyelik Süresi Takibi ve Ayarı (Canlı Sayaç & Gün/Ay/Yıl Ayarı) */}
      <div className="max-w-2xl">
        <TenantMembershipSettings />
      </div>

      <Subscription />
      
      <div className="max-w-2xl bg-blue-50 border border-blue-100 p-6 rounded-xl space-y-2">
        <h4 className="text-blue-900 font-bold flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          Uygulama Bilgisi
        </h4>
        <p className="text-blue-700 text-sm">
          Bu uygulama özel olarak ilyasyksel ile geliştirilmiştir. 
          Tüm verileriniz Firebase bulut altyapısında güvenle saklanmaktadır.
        </p>
      </div>
        </div>

      <GlobalCatalogSyncModal
        isOpen={isGlobalSyncOpen}
        onClose={() => setIsGlobalSyncOpen(false)}
      />

      <SepetayDirectDbStatusModal
        isOpen={isSepetayStatusOpen}
        onClose={() => setIsSepetayStatusOpen(false)}
      />
    </div>
  );
};

export default Settings;
