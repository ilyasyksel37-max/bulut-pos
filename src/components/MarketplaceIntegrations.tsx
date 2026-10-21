import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Globe, Store, CheckCircle2, Save, RefreshCw, ShieldAlert } from 'lucide-react';
import { MarketplaceConfig } from '../lib/marketplaceSync';
import { isTenantFeatureEnabled } from '../lib/tenant';

export const MarketplaceIntegrations: React.FC = () => {
  const { tenantId, currentTenant } = useAuth();
  const [activeTab, setActiveTab] = useState<'trendyol' | 'hepsiburada' | 'ciceksepeti' | 'pazarama' | 'n11' | 'amazon'>('trendyol');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isMarketplaceEnabled = isTenantFeatureEnabled(currentTenant, 'marketplace');

  const [config, setConfig] = useState<MarketplaceConfig>({
    trendyol: { enabled: false, apiKey: '', apiSecret: '', supplierId: '' },
    hepsiburada: { enabled: false, merchantId: '', apiKey: '', apiSecret: '' },
    ciceksepeti: { enabled: false, apiKey: '', apiSecret: '', supplierCode: '' },
    pazarama: { enabled: false, apiKey: '', apiSecret: '', merchantCode: '' },
    n11: { enabled: false, apiKey: '', apiSecret: '' },
    amazon: { enabled: false, sellerId: '', mwsAuthToken: '', awsAccessKey: '', secretKey: '', region: 'eu-west-1' }
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docId = tenantId || 'default_tenant';
        const snap = await getDoc(doc(db, 'marketplace_settings', docId));
        if (snap.exists()) {
          const data = snap.data() as MarketplaceConfig;
          setConfig(prev => ({
            ...prev,
            ...data
          }));
        }
      } catch (err) {
        console.error("Error loading marketplace integrations:", err);
      }
    };
    fetchConfig();
  }, [tenantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMessage(null);
    try {
      const docId = tenantId || 'default_tenant';
      await setDoc(doc(db, 'marketplace_settings', docId), {
        ...config,
        tenantId: tenantId || 'default',
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSuccessMessage("Pazaryeri entegrasyon ayarları başarıyla kaydedildi!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert("Kaydedilirken hata oluştu: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isMarketplaceEnabled) {
    return (
      <div className="max-w-2xl bg-amber-50/70 border border-amber-200 rounded-2xl p-6 text-center space-y-3 shadow-sm">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-black text-amber-900 text-base">Pazaryeri Entegrasyonları Modülü Kapalı</h3>
        <p className="text-xs text-amber-800 max-w-md mx-auto">
          Bu işletme / kiracı için Pazaryeri Entegrasyonları modülü henüz aktif edilmemiştir. Kiracı Yönetimi (Süper Yönetici) panelinden bu modülü aktif ederek Trendyol, Hepsiburada ve diğer pazaryeri API entegrasyonlarını kullanmaya başlayabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">Pazaryeri Entegrasyonları</h3>
            <p className="text-xs text-slate-500">Trendyol, Hepsiburada, Çiçeksepeti, Pazarama, N11 ve Amazon API Ayarları</p>
          </div>
        </div>
        {successMessage && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4" /> {successMessage}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto bg-slate-50 border-b border-slate-200 p-1.5 gap-1">
        {[
          { id: 'trendyol', name: 'Trendyol', color: 'text-orange-600' },
          { id: 'hepsiburada', name: 'Hepsiburada', color: 'text-amber-600' },
          { id: 'ciceksepeti', name: 'Çiçeksepeti', color: 'text-rose-600' },
          { id: 'pazarama', name: 'Pazarama', color: 'text-blue-600' },
          { id: 'n11', name: 'N11', color: 'text-red-600' },
          { id: 'amazon', name: 'Amazon', color: 'text-yellow-600' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${config[tab.id as keyof MarketplaceConfig]?.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {tab.name}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="p-6 space-y-5">
        {/* TRENDYOL TAB */}
        {activeTab === 'trendyol' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-sm text-slate-900">Trendyol Satıcı API Entegrasyonu</h4>
                <p className="text-xs text-slate-500">Trendyol Partner API Bilgileri (Opsiyonel)</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.trendyol?.enabled || false}
                  onChange={e => setConfig({
                    ...config,
                    trendyol: { ...config.trendyol!, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-700">Aktif</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Supplier ID (Satıcı ID)</label>
                <input
                  type="text"
                  placeholder="Örn. 123456"
                  value={config.trendyol?.supplierId || ''}
                  onChange={e => setConfig({
                    ...config,
                    trendyol: { ...config.trendyol!, supplierId: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">API Key (API Anahtarı)</label>
                <input
                  type="text"
                  placeholder="Trendyol API Key"
                  value={config.trendyol?.apiKey || ''}
                  onChange={e => setConfig({
                    ...config,
                    trendyol: { ...config.trendyol!, apiKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">API Secret (Gizli Anahtar)</label>
                <input
                  type="password"
                  placeholder="Trendyol API Secret"
                  value={config.trendyol?.apiSecret || ''}
                  onChange={e => setConfig({
                    ...config,
                    trendyol: { ...config.trendyol!, apiSecret: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* HEPSİBURADA TAB */}
        {activeTab === 'hepsiburada' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-sm text-slate-900">Hepsiburada Merchant Entegrasyonu</h4>
                <p className="text-xs text-slate-500">Hepsiburada İş Ortaklığı API Bilgileri</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.hepsiburada?.enabled || false}
                  onChange={e => setConfig({
                    ...config,
                    hepsiburada: { ...config.hepsiburada!, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-700">Aktif</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Merchant ID (Mağaza ID)</label>
                <input
                  type="text"
                  placeholder="Hepsiburada Merchant ID"
                  value={config.hepsiburada?.merchantId || ''}
                  onChange={e => setConfig({
                    ...config,
                    hepsiburada: { ...config.hepsiburada!, merchantId: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">API Key / Token</label>
                <input
                  type="text"
                  placeholder="API Key"
                  value={config.hepsiburada?.apiKey || ''}
                  onChange={e => setConfig({
                    ...config,
                    hepsiburada: { ...config.hepsiburada!, apiKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">API Secret</label>
                <input
                  type="password"
                  placeholder="Secret Key"
                  value={config.hepsiburada?.apiSecret || ''}
                  onChange={e => setConfig({
                    ...config,
                    hepsiburada: { ...config.hepsiburada!, apiSecret: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* ÇİÇEKSEPETİ TAB */}
        {activeTab === 'ciceksepeti' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-sm text-slate-900">Çiçeksepeti (Crm / Entegrasyon)</h4>
                <p className="text-xs text-slate-500">Çiçeksepeti Supplier API Bilgileri</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.ciceksepeti?.enabled || false}
                  onChange={e => setConfig({
                    ...config,
                    ciceksepeti: { ...config.ciceksepeti!, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-700">Aktif</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Supplier Code / Mağaza Kodu</label>
                <input
                  type="text"
                  placeholder="Çiçeksepeti Mağaza Kodu"
                  value={config.ciceksepeti?.supplierCode || ''}
                  onChange={e => setConfig({
                    ...config,
                    ciceksepeti: { ...config.ciceksepeti!, supplierCode: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">API Key</label>
                <input
                  type="text"
                  placeholder="API Key"
                  value={config.ciceksepeti?.apiKey || ''}
                  onChange={e => setConfig({
                    ...config,
                    ciceksepeti: { ...config.ciceksepeti!, apiKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">API Secret</label>
                <input
                  type="password"
                  placeholder="API Secret"
                  value={config.ciceksepeti?.apiSecret || ''}
                  onChange={e => setConfig({
                    ...config,
                    ciceksepeti: { ...config.ciceksepeti!, apiSecret: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* PAZARAMA TAB */}
        {activeTab === 'pazarama' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-sm text-slate-900">Pazarama (İş Bankası) Entegrasyonu</h4>
                <p className="text-xs text-slate-500">Pazarama Satıcı API Bilgileri</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.pazarama?.enabled || false}
                  onChange={e => setConfig({
                    ...config,
                    pazarama: { ...config.pazarama!, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-700">Aktif</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Merchant Code</label>
                <input
                  type="text"
                  placeholder="Pazarama Merchant Code"
                  value={config.pazarama?.merchantCode || ''}
                  onChange={e => setConfig({
                    ...config,
                    pazarama: { ...config.pazarama!, merchantCode: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">API Key</label>
                <input
                  type="text"
                  placeholder="API Key"
                  value={config.pazarama?.apiKey || ''}
                  onChange={e => setConfig({
                    ...config,
                    pazarama: { ...config.pazarama!, apiKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">API Secret</label>
                <input
                  type="password"
                  placeholder="API Secret"
                  value={config.pazarama?.apiSecret || ''}
                  onChange={e => setConfig({
                    ...config,
                    pazarama: { ...config.pazarama!, apiSecret: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* N11 TAB */}
        {activeTab === 'n11' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-sm text-slate-900">N11 (Koçtaş / n11) Entegrasyonu</h4>
                <p className="text-xs text-slate-500">N11 Web Service API Bilgileri</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.n11?.enabled || false}
                  onChange={e => setConfig({
                    ...config,
                    n11: { ...config.n11!, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-700">Aktif</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">App Key (API Kullanıcı Adı)</label>
                <input
                  type="text"
                  placeholder="N11 App Key"
                  value={config.n11?.apiKey || ''}
                  onChange={e => setConfig({
                    ...config,
                    n11: { ...config.n11!, apiKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">App Secret (API Şifresi)</label>
                <input
                  type="password"
                  placeholder="N11 App Secret"
                  value={config.n11?.apiSecret || ''}
                  onChange={e => setConfig({
                    ...config,
                    n11: { ...config.n11!, apiSecret: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* AMAZON TAB */}
        {activeTab === 'amazon' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-sm text-slate-900">Amazon SP-API (Selling Partner) Entegrasyonu</h4>
                <p className="text-xs text-slate-500">Amazon Global / Türkiye Satıcı API Bilgileri</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.amazon?.enabled || false}
                  onChange={e => setConfig({
                    ...config,
                    amazon: { ...config.amazon!, enabled: e.target.checked }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-700">Aktif</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Seller ID (Satıcı ID)</label>
                <input
                  type="text"
                  placeholder="Amazon Seller ID"
                  value={config.amazon?.sellerId || ''}
                  onChange={e => setConfig({
                    ...config,
                    amazon: { ...config.amazon!, sellerId: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">MWS Auth Token / LWA Token</label>
                <input
                  type="password"
                  placeholder="Token"
                  value={config.amazon?.mwsAuthToken || ''}
                  onChange={e => setConfig({
                    ...config,
                    amazon: { ...config.amazon!, mwsAuthToken: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">AWS Access Key ID</label>
                <input
                  type="text"
                  placeholder="AKIA..."
                  value={config.amazon?.awsAccessKey || ''}
                  onChange={e => setConfig({
                    ...config,
                    amazon: { ...config.amazon!, awsAccessKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">AWS Secret Access Key</label>
                <input
                  type="password"
                  placeholder="Secret Key"
                  value={config.amazon?.secretKey || ''}
                  onChange={e => setConfig({
                    ...config,
                    amazon: { ...config.amazon!, secretKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Bölge (Region)</label>
                <select
                  value={config.amazon?.region || 'eu-west-1'}
                  onChange={e => setConfig({
                    ...config,
                    amazon: { ...config.amazon!, region: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white"
                >
                  <option value="eu-west-1">Europe (Turkey / EU - eu-west-1)</option>
                  <option value="us-east-1">North America (us-east-1)</option>
                  <option value="fe-west-1">Far East (fe-west-1)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[11px] text-slate-400 font-medium">
            * Ayarlar şifrelenerek Firestore bulut veritabanında güvenle saklanır. Stok güncellemeleri otomatik olarak tetiklenir.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 transition-all disabled:opacity-50 shrink-0"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Ayarları Kaydet</span>
          </button>
        </div>
      </form>
    </div>
  );
};
