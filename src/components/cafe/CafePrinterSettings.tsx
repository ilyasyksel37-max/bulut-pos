import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Printer,
  FileText,
  ChefHat,
  Sliders,
  CheckCircle2,
  Save,
  RotateCcw,
  Eye,
  Wifi,
  QrCode,
  Sparkles,
  Layers,
  UtensilsCrossed,
  Receipt,
  Copy,
  Clock,
  Info
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  CafePrinterConfig,
  DEFAULT_CAFE_PRINTER_CONFIG,
  loadCafePrinterSettings,
  saveCafePrinterSettings,
  buildCafeBillHtml,
  buildCafeKitchenOrderHtml,
  printCafeHtml
} from '../../lib/cafe-printer';

export const CafePrinterSettings: React.FC = () => {
  const { tenantId, currentTenant, tenantName } = useAuth();
  const [config, setConfig] = useState<CafePrinterConfig>(() => loadCafePrinterSettings(tenantId));
  const [activeTab, setActiveTab] = useState<'bill' | 'kitchen' | 'hardware'>('bill');
  const [previewType, setPreviewType] = useState<'bill' | 'kitchen'>('bill');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const storeInfo = {
    name: currentTenant?.name || tenantName || 'Lezzet Kafe & Restoran',
    phone: currentTenant?.phone || '0212 444 00 00',
    address: currentTenant?.address || 'Merkez Cad. No:44 Kadıköy / İstanbul'
  };

  // Sample data for preview
  const sampleTable = {
    name: 'Masa 4',
    area: 'Teras',
    bill: {
      id: 'B-74921',
      waiter: 'Ahmet Yılmaz',
      items: [
        { name: 'Karisik Izgara Tabagi', qty: 2, price: 340, portion: 'Duble', notes: 'Az pismis olsun' },
        { name: 'Kasarlı Mantarlı Pide', qty: 1, price: 190, portion: 'Tek', notes: 'Aci sos yaninda' },
        { name: 'Coca-Cola Zero 330ml', qty: 2, price: 55, portion: 'Kutu', notes: '' },
        { name: 'Kunefe (Dondurmali)', qty: 1, price: 160, portion: 'Tek', notes: 'Cevizli' }
      ],
      total: 1140
    }
  };

  const sampleKitchenOrder = {
    id: 'K-8812',
    tableName: 'Masa 4',
    area: 'Teras',
    waiter: 'Ahmet Yılmaz',
    time: '19:42',
    items: [
      { name: 'Karisik Izgara Tabagi', qty: 2, portion: 'Duble', notes: 'Az pismis, bol salatali' },
      { name: 'Kasarlı Mantarlı Pide', qty: 1, portion: 'Tek', notes: 'Kenari citir olsun' }
    ]
  };

  // Real-time listener from Firestore for multi-device sync
  useEffect(() => {
    const docRef = doc(db, 'cafe_printer_settings', tenantId || 'default');
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data() as Partial<CafePrinterConfig>;
        setConfig(prev => ({
          ...DEFAULT_CAFE_PRINTER_CONFIG,
          ...prev,
          ...cloudData
        }));
      }
    }, (err) => {
      console.warn('Realtime cafe printer listener notice:', err);
    });

    return () => unsubscribe();
  }, [tenantId]);

  const handleUpdate = <K extends keyof CafePrinterConfig>(key: K, value: CafePrinterConfig[K]) => {
    setConfig(prev => {
      const updated = { ...prev, [key]: value };
      // Save locally immediately
      try {
        localStorage.setItem(`cafe_printer_settings_${tenantId || 'default'}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleSaveToCloud = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      await saveCafePrinterSettings(config, tenantId);
      setSaveStatus('Ayarlar buluta ve tüm cihazlara başarıyla kaydedildi!');
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (err: any) {
      setSaveStatus('Kaydedilirken hata oluştu: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Tüm kafe & restoran yazdırma şablonlarını varsayılan ayarlara sıfırlamak istediğinize emin misiniz?')) {
      setConfig(DEFAULT_CAFE_PRINTER_CONFIG);
      saveCafePrinterSettings(DEFAULT_CAFE_PRINTER_CONFIG, tenantId);
      setSaveStatus('Varsayılan şablonlara geri dönüldü.');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleTestPrint = () => {
    if (previewType === 'bill') {
      const html = buildCafeBillHtml(sampleTable, config, storeInfo);
      printCafeHtml(html, { autoClose: config.autoClosePrintWindow, method: config.printMethod });
    } else {
      const html = buildCafeKitchenOrderHtml(sampleKitchenOrder, config, storeInfo);
      printCafeHtml(html, { autoClose: config.autoClosePrintWindow, method: config.printMethod });
    }
  };

  // Preview calculations
  const rawSubtotal = sampleTable.bill.total;
  const coverCharge = config.billShowCoverCharge && config.billCoverChargeRate > 0
    ? Math.round(rawSubtotal * (config.billCoverChargeRate / 100))
    : 0;
  const previewGrandTotal = rawSubtotal + coverCharge;
  const vatAmount = previewGrandTotal * (config.billVatRate / (100 + config.billVatRate));
  const netVatTotal = previewGrandTotal - vatAmount;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
            <Printer className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-black uppercase tracking-wider">
                Gerçek Zamanlı Senkronizasyon
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Bulut Eş Zamanlı Aktif
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
              Kafe & Restoran Yazdırma Şablonları ve Ayarları
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Masa adisyon fişi, mutfak sipariş fişi (KDS) ve kasa tahsilat şablonlarını özelleştirin; tüm garson ve mutfak cihazlarında eş zamanlı çalışsın.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleTestPrint}
            className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-lg shadow-orange-500/25 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Test Fişi Yazdır</span>
          </button>
          <button
            type="button"
            onClick={handleSaveToCloud}
            disabled={isSaving}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Kaydediliyor...' : 'Buluta Kaydet'}</span>
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Main Grid: Settings (Left) + Interactive Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Forms (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Section Tabs */}
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('bill');
                setPreviewType('bill');
              }}
              className={cn(
                "flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === 'bill'
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Receipt className="w-4 h-4" />
              <span>Adisyon & Hesap Fişi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('kitchen');
                setPreviewType('kitchen');
              }}
              className={cn(
                "flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === 'kitchen'
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <ChefHat className="w-4 h-4" />
              <span>Mutfak Fişi (KDS)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hardware')}
              className={cn(
                "flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === 'hardware'
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Sliders className="w-4 h-4" />
              <span>Yazıcı & Otomasyon</span>
            </button>
          </div>

          {/* TAB 1: Adisyon & Ön Hesap Fişi Şablonu */}
          {activeTab === 'bill' && (
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-orange-600" />
                  <span>Masa Adisyon & Ön Hesap Şablon Ayarları</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Müşteriye masada sunulan hesap fişi, ara toplamlar, Wi-Fi ve teşekkür mesajlarını belirleyin.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Fiş Ana Başlığı</label>
                  <input
                    type="text"
                    value={config.billTitle}
                    onChange={(e) => handleUpdate('billTitle', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    placeholder="Örn: ADİSYON & HESAP FİŞİ"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Alt Bilgi Notu</label>
                  <input
                    type="text"
                    value={config.billHeaderNote}
                    onChange={(e) => handleUpdate('billHeaderNote', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    placeholder="Örn: Ön Hesap Bilgilendirmesi"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Özel İşletme Adı (İsteğe Bağlı)</label>
                  <input
                    type="text"
                    value={config.billCustomStoreTitle}
                    onChange={(e) => handleUpdate('billCustomStoreTitle', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    placeholder={storeInfo.name}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Üst Logo Rozet Metni</label>
                  <input
                    type="text"
                    value={config.billLogoText}
                    onChange={(e) => handleUpdate('billLogoText', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    placeholder="★ LEZZET DURAĞI ★"
                  />
                </div>
              </div>

              {/* Fiş İçeriği Seçenekleri (Checkboxes) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Fiş Üzerinde Görünecek Alanlar</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.billShowTableName}
                      onChange={(e) => handleUpdate('billShowTableName', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Masa Numarası ve Bölüm Adı</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.billShowWaiterName}
                      onChange={(e) => handleUpdate('billShowWaiterName', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Garson / Personel İsmi</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.billShowDateTime}
                      onChange={(e) => handleUpdate('billShowDateTime', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Tarih ve Saat Bilgisi</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.billShowItemPortions}
                      onChange={(e) => handleUpdate('billShowItemPortions', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Porsiyon / Boyut Detayları</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.billShowItemNotes}
                      onChange={(e) => handleUpdate('billShowItemNotes', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Müşteri Ürün Notları</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.billShowVatBreakdown}
                      onChange={(e) => handleUpdate('billShowVatBreakdown', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>KDV Matrah & Dağılımı</span>
                  </label>
                </div>
              </div>

              {/* Kuver & Servis Bedeli */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase">Kuver / Servis Bedeli Ekle</h4>
                    <p className="text-[11px] text-slate-500">Masa adisyonu fişine opsiyonel kuver veya servis yüzdesi yansıtılır.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.billShowCoverCharge}
                    onChange={(e) => handleUpdate('billShowCoverCharge', e.target.checked)}
                    className="w-5 h-5 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                  />
                </div>
                {config.billShowCoverCharge && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Servis / Kuver Oranı (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={config.billCoverChargeRate}
                      onChange={(e) => handleUpdate('billCoverChargeRate', Number(e.target.value))}
                      className="w-32 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                    />
                  </div>
                )}
              </div>

              {/* Wi-Fi & Sosyal Medya Tanımları */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                  <Wifi className="w-4 h-4 text-indigo-600" />
                  <span>Misafir Wi-Fi & Sosyal Medya</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Wi-Fi Ağ Adı (SSID)</label>
                    <input
                      type="text"
                      value={config.billWifiSSID}
                      onChange={(e) => handleUpdate('billWifiSSID', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      placeholder="Örn: Lezzet_Misafir"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Wi-Fi Şifresi</label>
                    <input
                      type="text"
                      value={config.billWifiPassword}
                      onChange={(e) => handleUpdate('billWifiPassword', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      placeholder="Örn: lezzet2026"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Instagram / Sosyal Medya</label>
                    <input
                      type="text"
                      value={config.billSocialHandle}
                      onChange={(e) => handleUpdate('billSocialHandle', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      placeholder="Örn: @lezzetkafe"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Adisyon Kopya Sayısı</label>
                    <select
                      value={config.billCopies}
                      onChange={(e) => handleUpdate('billCopies', Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    >
                      <option value={1}>1 Kopya (Standart)</option>
                      <option value={2}>2 Kopya (1 Müşteri + 1 Muhasebe)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Fiş Altı Teşekkür & Dipnot */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Fiş Altı Dipnot ve Teşekkür Metni</label>
                <textarea
                  rows={2}
                  value={config.billFooterText}
                  onChange={(e) => handleUpdate('billFooterText', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                  placeholder="Afiyet olsun, yine bekleriz!"
                />
              </div>
            </div>
          )}

          {/* TAB 2: Mutfak & Bar Sipariş Fişi Şablonu (KDS) */}
          {activeTab === 'kitchen' && (
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-orange-600" />
                  <span>Mutfak & Bar Sipariş Fişi Şablonu (KDS)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aşçı ve barmenlerin rahatça görebileceği büyük masa yazısı, sipariş notları ve otomatik yazdırma ayarları.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Fiş Başlığı</label>
                  <input
                    type="text"
                    value={config.kitchenTitle}
                    onChange={(e) => handleUpdate('kitchenTitle', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    placeholder="MUTFAK SİPARİŞİ"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Mutfak Fişi Kopya Sayısı</label>
                  <select
                    value={config.kitchenCopies}
                    onChange={(e) => handleUpdate('kitchenCopies', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value={1}>1 Kopya (Sadece Mutfak)</option>
                    <option value={2}>2 Kopya (1 Mutfak + 1 Servis/Garson)</option>
                  </select>
                </div>
              </div>

              {/* Otomatik Mutfak Yazdırma Tetikleyicisi */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 rounded-2xl border border-orange-200 flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase">
                      Sipariş Verilince Otomatik Mutfak Fişi Yazdır
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Garson veya kasiyer siparişi KDS'ye gönderdiği an, fiş otomatik olarak yazıcıya iletilir.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.kitchenAutoPrintOnSend}
                  onChange={(e) => handleUpdate('kitchenAutoPrintOnSend', e.target.checked)}
                  className="w-6 h-6 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                />
              </div>

              {/* Mutfak Fişi Detayları */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Mutfak Fişi Görünüm Seçenekleri</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.kitchenShowLargeTable}
                      onChange={(e) => handleUpdate('kitchenShowLargeTable', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Büyük Masa Numarası Kutusu</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.kitchenShowArea}
                      onChange={(e) => handleUpdate('kitchenShowArea', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Bölüm / Alan Adı (Teras, Salon vb.)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.kitchenShowWaiter}
                      onChange={(e) => handleUpdate('kitchenShowWaiter', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Garson İsmi</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.kitchenShowTime}
                      onChange={(e) => handleUpdate('kitchenShowTime', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Sipariş Saati (HH:mm)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.kitchenShowPortions}
                      onChange={(e) => handleUpdate('kitchenShowPortions', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Porsiyon Gösterimi (Duble, Tek)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.kitchenHighlightNotes}
                      onChange={(e) => handleUpdate('kitchenHighlightNotes', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Özel Pişirme Notlarını Vurgula</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Yazıcı Donanım & Otomasyon Ayarları */}
          {activeTab === 'hardware' && (
            <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-orange-600" />
                  <span>Termal Yazıcı Donanım & Çıktı Yapılandırması</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kağıt rulo genişliği, font boyutu, kenar boşlukları ve otomatik pencere kapatma ayarları.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Termal Kağıt Genişliği</label>
                  <select
                    value={config.paperWidth}
                    onChange={(e) => handleUpdate('paperWidth', e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="80mm">80mm (Standart Termal Fiş Yazıcı)</option>
                    <option value="58mm">58mm (Mobil / Küçük Termal Yazıcı)</option>
                    <option value="72mm">72mm (Kompakt Masaüstü)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Yazı Boyutu (Font Size)</label>
                  <select
                    value={config.fontSize}
                    onChange={(e) => handleUpdate('fontSize', e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="small">Küçük (Kompakt & Tasarruflu)</option>
                    <option value="medium">Orta (Önerilen Standart)</option>
                    <option value="large">Büyük (Kolay Okunur)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Yazı Tipi (Font Ailesi)</label>
                  <select
                    value={config.fontFamily}
                    onChange={(e) => handleUpdate('fontFamily', e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="monospace">Termal Monospace (Klasik Fiş Fontu)</option>
                    <option value="sans-serif">Modern Sans-Serif (Net & Temiz)</option>
                    <option value="courier">Courier Daktilo Tipi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ayırıcı Çizgi Stili</label>
                  <select
                    value={config.dividerStyle}
                    onChange={(e) => handleUpdate('dividerStyle', e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="dashed">Kesikli Çizgi (- - - - - -)</option>
                    <option value="dotted">Noktalı Çizgi (. . . . . .)</option>
                    <option value="solid">Düz Çizgi (───────)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kenar Boşluğu (Margin mm)</label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={config.marginMm}
                    onChange={(e) => handleUpdate('marginMm', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Yazdırma Yöntemi</label>
                  <select
                    value={config.printMethod}
                    onChange={(e) => handleUpdate('printMethod', e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="iframe">Gizli Pencere (Engellemesiz & Doğrudan)</option>
                    <option value="popup">Açılır Pencere (Ayrı Sayfa)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Otomasyon Seçenekleri</h4>
                <div className="space-y-2 text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.autoClosePrintWindow}
                      onChange={(e) => handleUpdate('autoClosePrintWindow', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Yazdırma penceresini yazdırdıktan sonra otomatik kapat</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.openCashDrawerOnPayment}
                      onChange={(e) => handleUpdate('openCashDrawerOnPayment', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Nakit hesap kapatıldığında para çekmecesini otomatik tetikle</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="px-3.5 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Varsayılan Ayarlara Dön</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Live Thermal Paper Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Preview Header & Switch */}
          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-black text-slate-900 uppercase">Canlı Önizleme:</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setPreviewType('bill')}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                  previewType === 'bill' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Adisyon Fişi
              </button>
              <button
                type="button"
                onClick={() => setPreviewType('kitchen')}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                  previewType === 'kitchen' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Mutfak Fişi
              </button>
            </div>
          </div>

          {/* Thermal Paper Simulation Container */}
          <div className="bg-slate-200/80 p-4 sm:p-6 rounded-3xl border border-slate-300 flex justify-center items-start shadow-inner overflow-x-auto min-h-[580px]">
            {/* The Thermal Slip */}
            <div 
              className="bg-white text-black p-5 shadow-2xl relative font-mono text-xs transition-all duration-200"
              style={{
                width: config.paperWidth === '58mm' ? '250px' : config.paperWidth === '72mm' ? '290px' : '330px',
                minHeight: '440px',
                borderTop: '2px solid #e2e8f0',
                borderBottom: '4px dashed #94a3b8',
                fontFamily: config.fontFamily === 'sans-serif' ? 'sans-serif' : 'monospace',
                fontSize: config.fontSize === 'small' ? '11px' : config.fontSize === 'large' ? '13px' : '12px'
              }}
            >
              {previewType === 'bill' ? (
                /* ADİSYON FİŞİ CANLI SİMÜLASYONU */
                <div className="space-y-3">
                  <div className="text-center">
                    {config.billShowLogoBadge && (
                      <div className="inline-block border border-black px-1.5 py-0.5 text-[10px] font-bold uppercase mb-1">
                        {config.billLogoText}
                      </div>
                    )}
                    <h3 className="font-black text-sm uppercase">
                      {config.billCustomStoreTitle || storeInfo.name}
                    </h3>
                    <p className="text-[10px]">{storeInfo.address}</p>
                    <p className="text-[10px]">Tel: {storeInfo.phone}</p>
                    <div className="font-black text-xs mt-1.5 uppercase underline">
                      {config.billTitle}
                    </div>
                    {config.billHeaderNote && (
                      <p className="text-[10px] italic">{config.billHeaderNote}</p>
                    )}
                  </div>

                  <div className={cn("border-b", config.dividerStyle === 'dotted' ? 'border-dotted' : config.dividerStyle === 'solid' ? 'border-solid' : 'border-dashed', 'border-black')} />

                  <div className="text-[11px] space-y-0.5">
                    {config.billShowTableName && (
                      <div className="flex justify-between font-bold">
                        <span>MASA:</span>
                        <span>{sampleTable.name} ({sampleTable.area})</span>
                      </div>
                    )}
                    {config.billShowWaiterName && (
                      <div className="flex justify-between">
                        <span>Garson:</span>
                        <span className="font-bold">{sampleTable.bill.waiter}</span>
                      </div>
                    )}
                    {config.billShowDateTime && (
                      <div className="flex justify-between">
                        <span>Tarih & Saat:</span>
                        <span>{new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Adisyon No:</span>
                      <span>#{sampleTable.bill.id}</span>
                    </div>
                  </div>

                  <div className={cn("border-b", config.dividerStyle === 'dotted' ? 'border-dotted' : config.dividerStyle === 'solid' ? 'border-solid' : 'border-dashed', 'border-black')} />

                  <div className="flex justify-between font-black text-[10px] uppercase">
                    <span>ÜRÜN</span>
                    {config.billShowItemPrices && <span>TUTAR</span>}
                  </div>

                  <div className={cn("border-b", config.dividerStyle === 'dotted' ? 'border-dotted' : config.dividerStyle === 'solid' ? 'border-solid' : 'border-dashed', 'border-black')} />

                  <div className="space-y-1.5">
                    {sampleTable.bill.items.map((it, idx) => (
                      <div key={idx} className="text-[11px]">
                        <div className="flex justify-between">
                          <span>
                            <strong className="font-black">{it.qty}x</strong> {it.name}
                            {config.billShowItemPortions && it.portion ? ` [${it.portion}]` : ''}
                          </span>
                          {config.billShowItemPrices && (
                            <span className="font-bold">{(it.price * it.qty).toLocaleString('tr-TR')} ₺</span>
                          )}
                        </div>
                        {config.billShowItemNotes && it.notes && (
                          <div className="text-[10px] italic pl-2.5 opacity-80">
                            ↳ Not: {it.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className={cn("border-b", config.dividerStyle === 'dotted' ? 'border-dotted' : config.dividerStyle === 'solid' ? 'border-solid' : 'border-dashed', 'border-black')} />

                  <div className="space-y-0.5 text-[11px]">
                    {(coverCharge > 0 || config.billShowVatBreakdown) && (
                      <div className="flex justify-between">
                        <span>Ara Toplam:</span>
                        <span>{rawSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                    )}
                    {coverCharge > 0 && (
                      <div className="flex justify-between">
                        <span>Servis / Kuver (%{config.billCoverChargeRate}):</span>
                        <span>{coverCharge.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                    )}
                    {config.billShowVatBreakdown && (
                      <>
                        <div className="flex justify-between text-[10px] opacity-80">
                          <span>KDV Hariç Tutar:</span>
                          <span>{netVatTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                        </div>
                        <div className="flex justify-between text-[10px] opacity-80">
                          <span>KDV (%{config.billVatRate}):</span>
                          <span>{vatAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                        </div>
                      </>
                    )}
                    <div className="border-b-2 border-double border-black pt-1" />
                    <div className="flex justify-between font-black text-sm pt-1">
                      <span>TOPLAM TUTAR:</span>
                      <span>{previewGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>

                  <div className={cn("border-b", config.dividerStyle === 'dotted' ? 'border-dotted' : config.dividerStyle === 'solid' ? 'border-solid' : 'border-dashed', 'border-black')} />

                  {config.billShowWifiInfo && (config.billWifiSSID || config.billWifiPassword) && (
                    <div className="text-center border border-dotted border-black p-1 text-[10px]">
                      <div className="font-black">📶 MİSAFİR WI-FI AĞI</div>
                      {config.billWifiSSID && <div>Ağ: <span className="font-bold">{config.billWifiSSID}</span></div>}
                      {config.billWifiPassword && <div>Şifre: <span className="font-bold">{config.billWifiPassword}</span></div>}
                    </div>
                  )}

                  {config.billShowSocialMedia && config.billSocialHandle && (
                    <div className="text-center font-bold text-[10px]">
                      📷 Bizi takip edin: {config.billSocialHandle}
                    </div>
                  )}

                  {config.billFooterText && (
                    <div className="text-center text-[10px] opacity-90 whitespace-pre-wrap">
                      {config.billFooterText}
                    </div>
                  )}
                </div>
              ) : (
                /* MUTFAK FİŞİ CANLI SİMÜLASYONU */
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="font-black text-sm uppercase">
                      👨‍🍳 {config.kitchenTitle}
                    </div>
                    <div className="text-[10px] font-bold">{storeInfo.name}</div>
                  </div>

                  {config.kitchenShowLargeTable && (
                    <div className="border-2 border-black p-2 text-center my-2">
                      <div className="text-2xl font-black uppercase tracking-wider">{sampleKitchenOrder.tableName}</div>
                      {config.kitchenShowArea && (
                        <div className="text-xs font-black uppercase">[ {sampleKitchenOrder.area} ]</div>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] space-y-0.5">
                    {config.kitchenShowTime && (
                      <div className="flex justify-between">
                        <span className="font-bold">Sipariş Saati:</span>
                        <span className="font-black text-xs">{sampleKitchenOrder.time}</span>
                      </div>
                    )}
                    {config.kitchenShowWaiter && (
                      <div className="flex justify-between">
                        <span>Garson:</span>
                        <span className="font-bold">{sampleKitchenOrder.waiter}</span>
                      </div>
                    )}
                    {config.kitchenShowOrderNo && (
                      <div className="flex justify-between">
                        <span>Sıra No:</span>
                        <span className="font-bold">#{sampleKitchenOrder.id}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-b-2 border-dashed border-black" />

                  <div className="font-black text-xs uppercase mb-1">
                    HAZIRLANACAK SİPARİŞLER:
                  </div>

                  <div className="space-y-2">
                    {sampleKitchenOrder.items.map((it, idx) => (
                      <div key={idx} className="pb-2 border-b border-dotted border-slate-400">
                        <div className="flex items-baseline">
                          <span className="text-base font-black mr-2">{it.qty}x</span>
                          <span className="font-black text-xs">{it.name}</span>
                          {config.kitchenShowPortions && it.portion && (
                            <span className="ml-1 text-[11px] font-bold underline">[{it.portion}]</span>
                          )}
                        </div>
                        {config.kitchenHighlightNotes && it.notes && (
                          <div className="mt-1 p-1 bg-slate-100 border border-black font-black text-[10px]">
                            ⚠️ NOT: {it.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-b-2 border-dashed border-black pt-2" />
                  <div className="text-center font-bold text-[10px]">
                    *** SİPARİŞİ EKSİKSİZ VE SICAK ÇIKARINIZ ***
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
