import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import {
  Printer,
  FileText,
  Receipt,
  Save,
  RotateCcw,
  Eye,
  CheckCircle2,
  Sliders,
  Barcode,
  Sparkles,
  Layers,
  AlignLeft,
  AlignCenter,
  AlignRight,
  QrCode,
  Stamp,
  ZoomIn,
  ZoomOut,
  Wand2,
  LayoutTemplate
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  PrinterSettingsConfig,
  DEFAULT_PRINTER_SETTINGS,
  loadPrinterSettings,
  savePrinterSettings,
  buildReceiptPrintHtml,
  printHtmlDocument,
  PrintableReceiptData
} from '../lib/printer-settings';
import { isSepetayTenant } from '../lib/tenant';

interface PrinterSettingsProps {
  embedded?: boolean;
  onOpenStandalonePage?: () => void;
}

const DEFAULT_SAMPLE_RECEIPT_DATA: PrintableReceiptData = {
  saleId: 'POS-94827104',
  dateFormatted: format(new Date(), 'dd.MM.yyyy HH:mm'),
  items: [
    { name: "Faber-Castell 12'li Boya Kalemi", quantity: 2, price: 145.0, discount: 10, barcode: '8690826104215', unit: 'Paket' },
    { name: 'A4 Fotokopi Kağıdı 80gr (1 Top)', quantity: 1, price: 115.0, discount: 0, barcode: '8691452001928', unit: 'Top' },
    { name: 'Spirali Kareli Defter 100 Yp.', quantity: 3, price: 65.0, discount: 0, barcode: '8697412305112', unit: 'Adet' }
  ],
  subtotal: 600.0,
  taxRate: 20,
  taxAmount: 118.0,
  total: 590.0,
  paymentMethodLabel: 'KREDİ KARTI / NAKİT',
  customerName: 'Örnek Kurumsal Müşteri A.Ş.',
  customerPhone: '0532 555 44 33',
  previousDebt: 1250.0,
  newDebt: 1840.0,
  sellerCode: 'E01',
  sellerName: 'Kasiyer Personel'
};

export const PrinterSettings: React.FC<PrinterSettingsProps> = ({
  embedded = false,
  onOpenStandalonePage
}) => {
  const { tenantId, currentTenant, tenantName } = useAuth();
  const [config, setConfig] = useState<PrinterSettingsConfig>(() => loadPrinterSettings(tenantId));
  const [activeSubTab, setActiveSubTab] = useState<'thermal' | 'a4' | 'general' | 'labels'>('thermal');
  const [previewMode, setPreviewMode] = useState<'thermal' | 'a4'>('thermal');
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sampleCustomerName, setSampleCustomerName] = useState(DEFAULT_SAMPLE_RECEIPT_DATA.customerName || '');

  const storeName =
    currentTenant?.name ||
    tenantName ||
    (isSepetayTenant(tenantId) ? 'Sepetay Kırtasiye & Büro' : 'İşletme Mağazası');
  const storeAddress = currentTenant?.address || 'Merkez Mah. Atatürk Cad. No:12 İstanbul';
  const storePhone = currentTenant?.phone || '0212 555 00 00';

  const activeSampleReceipt: PrintableReceiptData = {
    ...DEFAULT_SAMPLE_RECEIPT_DATA,
    customerName: sampleCustomerName || 'Perakende Müşteri'
  };

  // Load from Firestore if available
  useEffect(() => {
    const localCfg = loadPrinterSettings(tenantId);
    setConfig(localCfg);

    const fetchCloudConfig = async () => {
      if (!tenantId) return;
      try {
        const snap = await getDoc(doc(db, 'printer_settings', tenantId));
        if (snap.exists()) {
          const cloudData = snap.data() as Partial<PrinterSettingsConfig>;
          const merged = { ...DEFAULT_PRINTER_SETTINGS, ...localCfg, ...cloudData };
          setConfig(merged);
          savePrinterSettings(merged, tenantId);
        }
      } catch (e) {
        // Offline or rule notice - local settings remain active
      }
    };
    fetchCloudConfig();
  }, [tenantId]);

  // Switch preview automatically when user switches between thermal and a4 tabs
  useEffect(() => {
    if (activeSubTab === 'thermal') setPreviewMode('thermal');
    if (activeSubTab === 'a4') setPreviewMode('a4');
  }, [activeSubTab]);

  const updateField = <K extends keyof PrinterSettingsConfig>(key: K, value: PrinterSettingsConfig[K]) => {
    setConfig(prev => {
      const next = { ...prev, [key]: value };
      savePrinterSettings(next, tenantId);
      return next;
    });
  };

  const applyPreset = (presetId: 'standard' | 'compact' | 'corporate' | 'boutique') => {
    let nextConfig = { ...config };
    if (presetId === 'standard') {
      nextConfig = {
        ...nextConfig,
        thermalPaperWidth: '80mm',
        thermalFontSize: 'medium',
        thermalFontFamily: 'monospace',
        thermalHeaderAlignment: 'center',
        thermalDividerStyle: 'dashed',
        thermalLineSpacing: 'normal',
        thermalShowLogoBadge: true,
        thermalShowOrderNumberBox: true,
        thermalShowBottomBarcode: true,
        a4PaperSize: 'A4-portrait',
        a4ColorTheme: 'blue',
        a4HeaderLayout: 'classic',
        a4TableStyle: 'grid',
        a4ShowSignatures: true
      };
      setSaveMessage('✨ "Standart Kasa & Kurumsal A4" hazır şablonu yüklendi.');
    } else if (presetId === 'compact') {
      nextConfig = {
        ...nextConfig,
        thermalPaperWidth: '58mm',
        thermalFontSize: 'small',
        thermalFontFamily: 'sans-serif',
        thermalHeaderAlignment: 'center',
        thermalDividerStyle: 'dotted',
        thermalLineSpacing: 'compact',
        thermalMarginMm: 2,
        thermalShowLogoBadge: false,
        thermalShowStoreAddress: false,
        thermalShowItemBarcodes: false,
        thermalShowBottomBarcode: false,
        thermalShowQrCode: false,
        a4PaperSize: 'A5-portrait',
        a4ColorTheme: 'slate',
        a4HeaderLayout: 'classic',
        a4TableStyle: 'minimal'
      };
      setSaveMessage('⚡ "Ekonomik Kompakt (Kağıt Tasarruflu)" şablon yüklendi.');
    } else if (presetId === 'corporate') {
      nextConfig = {
        ...nextConfig,
        thermalPaperWidth: '80mm',
        thermalFontSize: 'medium',
        thermalFontFamily: 'courier',
        thermalHeaderAlignment: 'center',
        thermalDividerStyle: 'solid',
        thermalShowTaxBreakdown: true,
        thermalShowCustomerBalance: true,
        a4PaperSize: 'A4-portrait',
        a4ColorTheme: 'indigo',
        a4HeaderLayout: 'modern-banner',
        a4TableStyle: 'striped',
        a4ShowWatermark: true,
        a4WatermarkText: 'KURUMSAL SATIŞ & TESLİM FORMU',
        a4ShowBankIban: true,
        a4ShowDiscountColumn: true,
        a4ShowUnitColumn: true,
        a4ShowSignatures: true
      };
      setSaveMessage('🏢 "Tam Detaylı Kurumsal & Filigranlı A4" şablonu yüklendi.');
    } else if (presetId === 'boutique') {
      nextConfig = {
        ...nextConfig,
        thermalPaperWidth: '80mm',
        thermalFontSize: 'medium',
        thermalFontFamily: 'sans-serif',
        thermalHeaderAlignment: 'center',
        thermalDividerStyle: 'dashed',
        thermalLineSpacing: 'relaxed',
        thermalShowLogoBadge: true,
        thermalLogoBadgeText: '✦ PREMIUM STORE ✦',
        thermalShowOrderNumberBox: true,
        thermalShowQrCode: true,
        thermalSocialHandle: '@magazamiz • WhatsApp: ' + storePhone,
        a4ColorTheme: 'emerald',
        a4HeaderLayout: 'centered',
        a4TableStyle: 'striped'
      };
      setSaveMessage('🎨 "Modern Mağaza & QR Kodlu Fiş" şablonu yüklendi.');
    }
    setConfig(nextConfig);
    savePrinterSettings(nextConfig, tenantId);
    setTimeout(() => setSaveMessage(null), 3500);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    savePrinterSettings(config, tenantId);
    try {
      if (tenantId) {
        await setDoc(
          doc(db, 'printer_settings', tenantId),
          {
            ...config,
            tenantId,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }
      setSaveMessage('Tüm yazıcı ve şablon ayarları başarıyla kaydedildi!');
      setTimeout(() => setSaveMessage(null), 3500);
    } catch (e) {
      setSaveMessage('Ayarlar yerel cihaza kaydedildi!');
      setTimeout(() => setSaveMessage(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig({ ...DEFAULT_PRINTER_SETTINGS });
    savePrinterSettings(DEFAULT_PRINTER_SETTINGS, tenantId);
    setSaveMessage('Varsayılan yazıcı şablon ayarlarına sıfırlandı.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleTestPrint = (fmt: 'thermal' | 'a4') => {
    const html = buildReceiptPrintHtml(
      fmt,
      activeSampleReceipt,
      { name: storeName, address: storeAddress, phone: storePhone },
      config
    );
    printHtmlDocument(html);
  };

  const themeColors: Record<
    PrinterSettingsConfig['a4ColorTheme'],
    { primary: string; bg: string; border: string; badgeBg: string; label: string; dot: string }
  > = {
    blue: {
      primary: 'text-blue-700 border-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      badgeBg: 'bg-blue-600 text-white',
      label: 'Kurumsal Mavi',
      dot: 'bg-blue-600'
    },
    slate: {
      primary: 'text-slate-900 border-slate-900',
      bg: 'bg-slate-100',
      border: 'border-slate-300',
      badgeBg: 'bg-slate-900 text-white',
      label: 'Resmi Siyah',
      dot: 'bg-slate-900'
    },
    emerald: {
      primary: 'text-emerald-700 border-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      badgeBg: 'bg-emerald-600 text-white',
      label: 'Zümrüt Yeşili',
      dot: 'bg-emerald-600'
    },
    indigo: {
      primary: 'text-indigo-700 border-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      badgeBg: 'bg-indigo-600 text-white',
      label: 'Koyu Lacivert',
      dot: 'bg-indigo-600'
    },
    rose: {
      primary: 'text-rose-700 border-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      badgeBg: 'bg-rose-600 text-white',
      label: 'Bordo / Kırmızı',
      dot: 'bg-rose-600'
    },
    amber: {
      primary: 'text-amber-700 border-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      badgeBg: 'bg-amber-600 text-white',
      label: 'Altın / Kehribar',
      dot: 'bg-amber-600'
    }
  };

  const activeTheme = themeColors[config.a4ColorTheme || 'blue'] || themeColors.blue;

  return (
    <div className={cn(embedded ? 'space-y-6' : 'p-3 sm:p-5 lg:p-8 max-w-7xl mx-auto space-y-6')}>
      {/* Top Studio Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-600/25 shrink-0">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                Termal Fiş & A4 Fatura Şablon Önizleme ve Düzenleme Stüdyosu
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                Canlı Tasarım & Önizleme
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              80mm/58mm Termal Fiş ve A4 Fatura/İrsaliye şablonlarınızı görsel olarak düzenleyin, hazır şablon seçin ve anında test çıktısı alın.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {embedded && onOpenStandalonePage && (
            <button
              type="button"
              onClick={onOpenStandalonePage}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Layers className="w-4 h-4" />
              <span>Tam Ekran Özel Sayfada Aç</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleTestPrint('thermal')}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Termal Test Yazdır</span>
          </button>
          <button
            type="button"
            onClick={() => handleTestPrint('a4')}
            className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <FileText className="w-4 h-4" />
            <span>A4 Test Yazdır</span>
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            title="Varsayılana Sıfırla"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sıfırla</span>
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Kaydediliyor...' : 'Şablonu Kaydet'}</span>
          </button>
        </div>
      </div>

      {/* Quick 1-Click Template Presets Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black tracking-tight flex items-center gap-1.5">
              <span>Hazır Şablon Profilleri (Tek Tıkla Yükle)</span>
            </h3>
            <p className="text-[11px] text-slate-300">
              İşletme tipinize uygun hazır termal fiş ve A4 fatura tasarımını seçip üzerinde özelleştirme yapabilirsiniz.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => applyPreset('standard')}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-black text-white transition-all cursor-pointer text-left"
          >
            <span className="block text-indigo-300 text-[10px]">80mm + A4</span>
            🧾 Standart Kasa
          </button>
          <button
            type="button"
            onClick={() => applyPreset('compact')}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-black text-white transition-all cursor-pointer text-left"
          >
            <span className="block text-emerald-300 text-[10px]">58mm + A5</span>
            ⚡ Ekonomik Kompakt
          </button>
          <button
            type="button"
            onClick={() => applyPreset('corporate')}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-black text-white transition-all cursor-pointer text-left"
          >
            <span className="block text-blue-300 text-[10px]">Filigran + IBAN</span>
            🏢 Kurumsal Detaylı
          </button>
          <button
            type="button"
            onClick={() => applyPreset('boutique')}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-black text-white transition-all cursor-pointer text-left"
          >
            <span className="block text-amber-300 text-[10px]">QR Kod + Rozet</span>
            ✨ Modern Mağaza
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveMessage}</span>
          </div>
          <button onClick={() => setSaveMessage(null)} className="text-emerald-700 hover:underline text-[11px]">
            Kapat
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-200/70 p-1.5 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveSubTab('thermal')}
          className={cn(
            'py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer',
            activeSubTab === 'thermal'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Receipt className="w-4 h-4 text-indigo-600" />
          <span>🧾 Termal Fiş Şablonu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('a4')}
          className={cn(
            'py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer',
            activeSubTab === 'a4'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <FileText className="w-4 h-4 text-blue-600" />
          <span>📄 A4 Fatura Şablonu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('general')}
          className={cn(
            'py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer',
            activeSubTab === 'general'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Sliders className="w-4 h-4 text-emerald-600" />
          <span>⚙️ Genel & Otomasyon</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('labels')}
          className={cn(
            'py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer',
            activeSubTab === 'labels'
              ? 'bg-white text-amber-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Barcode className="w-4 h-4 text-amber-600" />
          <span>🏷️ Barkod & Raf Etiketi</span>
        </button>
      </div>

      {/* Main Two-Column Editor & Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls & Form (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* TAB 1: THERMAL RECEIPT TEMPLATE EDITOR */}
          {activeSubTab === 'thermal' && (
            <div className="p-5 sm:p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-indigo-600" />
                    Termal Fiş Yazıcı Şablonu & Tasarım Araçları
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    80mm, 72mm ve 58mm rulo termal kasa yazıcıları için tipografi, hizalama, rozet, QR kod ve içerik ayarları.
                  </p>
                </div>
              </div>

              {/* Paper Width, Font Size, Font Family */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Rulo Kağıt Genişliği</label>
                  <select
                    value={config.thermalPaperWidth}
                    onChange={e => updateField('thermalPaperWidth', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="80mm">80mm (Standart Kasa Fişi)</option>
                    <option value="72mm">72mm (Orta Boy Rulo)</option>
                    <option value="58mm">58mm (Dar / Mobil POS Fişi)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Yazı Boyutu (Font)</label>
                  <select
                    value={config.thermalFontSize}
                    onChange={e => updateField('thermalFontSize', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="small">Küçük (10px - Kompakt)</option>
                    <option value="medium">Orta (11px - Standart)</option>
                    <option value="large">Büyük (13px - Kalın Okunaklı)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Yazı Tipi Karakteri</label>
                  <select
                    value={config.thermalFontFamily}
                    onChange={e => updateField('thermalFontFamily', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="monospace">Monospace (Klasik Termal)</option>
                    <option value="courier">Courier (Daktilo / Kasa)</option>
                    <option value="sans-serif">Sans-Serif (Modern Düz)</option>
                  </select>
                </div>
              </div>

              {/* Alignment, Divider Style, Line Spacing, Margin */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Başlık Hizalama</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                    {[
                      { id: 'left', icon: AlignLeft, label: 'Sol' },
                      { id: 'center', icon: AlignCenter, label: 'Orta' },
                      { id: 'right', icon: AlignRight, label: 'Sağ' }
                    ].map(al => (
                      <button
                        key={al.id}
                        type="button"
                        onClick={() => updateField('thermalHeaderAlignment', al.id as any)}
                        className={cn(
                          'py-1.5 rounded-lg flex items-center justify-center gap-1 font-bold text-[11px] cursor-pointer transition-all',
                          config.thermalHeaderAlignment === al.id
                            ? 'bg-white text-indigo-600 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900'
                        )}
                      >
                        <al.icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Ayırıcı Çizgi Stili</label>
                  <select
                    value={config.thermalDividerStyle}
                    onChange={e => updateField('thermalDividerStyle', e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="dashed">Kesikli Çizgi (---)</option>
                    <option value="dotted">Noktalı Çizgi (...)</option>
                    <option value="solid">Düz Çizgi (___)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Satır Aralığı</label>
                  <select
                    value={config.thermalLineSpacing}
                    onChange={e => updateField('thermalLineSpacing', e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="compact">Sıkı (Kağıt Tasarruflu)</option>
                    <option value="normal">Normal (Standart)</option>
                    <option value="relaxed">Geniş (Ferah Okuma)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Kenar Boşluğu (mm)</label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={config.thermalMarginMm}
                    onChange={e => updateField('thermalMarginMm', Math.max(0, Math.min(15, Number(e.target.value))))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Header, Logo Badge & Subtitle Texts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Üst Logo / Marka Rozeti
                  </label>
                  <input
                    type="text"
                    value={config.thermalLogoBadgeText}
                    onChange={e => updateField('thermalLogoBadgeText', e.target.value)}
                    placeholder="★ KURUMSAL MAĞAZA ★"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Fiş Üst Mağaza Başlığı
                  </label>
                  <input
                    type="text"
                    value={config.thermalCustomTitle}
                    onChange={e => updateField('thermalCustomTitle', e.target.value)}
                    placeholder={storeName}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Fiş Alt Başlığı / Belge Türü
                  </label>
                  <input
                    type="text"
                    value={config.thermalCustomSubtitle}
                    onChange={e => updateField('thermalCustomSubtitle', e.target.value)}
                    placeholder="PERAKENDE SATIŞ FİŞİ"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Visible Fields Checkboxes */}
              <div className="space-y-2.5">
                <label className="block font-black text-slate-700 uppercase text-[11px]">
                  Termal Fiş Üzerinde Gösterilecek Bölümler
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    { key: 'thermalShowLogoBadge', label: 'Üst Logo / Marka Rozetini Göster' },
                    { key: 'thermalShowOrderNumberBox', label: 'Fiş Numarasını Çerçeveli Kutuda Göster' },
                    { key: 'thermalShowStoreAddress', label: 'Mağaza Adresini Göster' },
                    { key: 'thermalShowStorePhone', label: 'Mağaza Telefonunu Göster' },
                    { key: 'thermalShowCustomerInfo', label: 'Müşteri Adı & Telefonunu Göster' },
                    { key: 'thermalShowSellerInfo', label: 'Satış Elemanı (Kasiyer) Kodunu Göster' },
                    { key: 'thermalShowItemBarcodes', label: 'Ürün Barkod Numaralarını Göster' },
                    { key: 'thermalShowDiscountDetails', label: 'Satır İskonto Tutarlarını Göster' },
                    { key: 'thermalShowTaxBreakdown', label: 'Ara Toplam ve KDV Dağılımını Göster' },
                    { key: 'thermalShowCustomerBalance', label: 'Müşteri Önceki / Güncel Borç Bakiyesi' },
                    { key: 'thermalShowBottomBarcode', label: 'Fiş Altı Takip Barkodu Göster' },
                    { key: 'thermalShowQrCode', label: 'Fiş Altı Web / E-Belge QR Kodu Göster' }
                  ].map(item => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 cursor-pointer select-none transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(config[item.key as keyof PrinterSettingsConfig])}
                        onChange={e => updateField(item.key as any, e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      <span className="font-bold text-slate-800">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* QR & Social Handle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    QR Kod Bağlantısı / Web Adresi
                  </label>
                  <input
                    type="text"
                    value={config.thermalQrCodeText}
                    onChange={e => updateField('thermalQrCodeText', e.target.value)}
                    placeholder="https://pos.beyoglukirtasiye.tr"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Sosyal Medya / WhatsApp Sipariş Satırı
                  </label>
                  <input
                    type="text"
                    value={config.thermalSocialHandle}
                    onChange={e => updateField('thermalSocialHandle', e.target.value)}
                    placeholder="Örn: @magazamiz • WhatsApp: 0532 000 00 00"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* Footer Message */}
              <div className="text-xs">
                <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                  Fiş Altı Teşekkür & İade/Değişim Mesajı
                </label>
                <textarea
                  rows={2}
                  value={config.thermalFooterText}
                  onChange={e => updateField('thermalFooterText', e.target.value)}
                  placeholder="Teşekkür ederiz. Değişim süresi fiş ile 7 gündür."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>
            </div>
          )}

          {/* TAB 2: A4 INVOICE / FORM TEMPLATE EDITOR */}
          {activeSubTab === 'a4' && (
            <div className="p-5 sm:p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  A4 Fatura & Teslim Bilgi Formu Şablon Düzenleyici
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lazer, Tanklı (Epson, HP, Canon, Brother) ve PDF yazıcılar için kurumsal A4/A5 sayfa tasarımı.
                </p>
              </div>

              {/* Paper Orientation, Header Layout & Table Style */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Kağıt Boyutu & Yönü</label>
                  <select
                    value={config.a4PaperSize}
                    onChange={e => updateField('a4PaperSize', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="A4-portrait">A4 Dikey (Standart)</option>
                    <option value="A4-landscape">A4 Yatay (Geniş Tablo)</option>
                    <option value="A5-portrait">A5 Dikey (Yarım Sayfa)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Üst Başlık Tasarımı</label>
                  <select
                    value={config.a4HeaderLayout}
                    onChange={e => updateField('a4HeaderLayout', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="classic">Klasik (Sol Firma / Sağ Belge)</option>
                    <option value="centered">Ortalanmış Kurumsal Başlık</option>
                    <option value="modern-banner">Modern Renkli Üst Bant</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Ürün Tablosu Stili</label>
                  <select
                    value={config.a4TableStyle}
                    onChange={e => updateField('a4TableStyle', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="grid">Klasik Tam Kutu Çizgili</option>
                    <option value="striped">Zebra Satırlı (Çift Renk)</option>
                    <option value="minimal">Minimal Yatay Çizgili</option>
                  </select>
                </div>
              </div>

              {/* Color Theme Picker (6 Themes) */}
              <div className="text-xs">
                <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">Kurumsal Renk Teması</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(['blue', 'slate', 'emerald', 'indigo', 'rose', 'amber'] as const).map(themeKey => (
                    <button
                      key={themeKey}
                      type="button"
                      onClick={() => updateField('a4ColorTheme', themeKey)}
                      className={cn(
                        'py-2 px-2.5 rounded-xl border-2 text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5',
                        config.a4ColorTheme === themeKey
                          ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      )}
                    >
                      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', themeColors[themeKey].dot)} />
                      <span className="truncate">{themeColors[themeKey].label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Titles & Tax Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Kurumsal Firma Başlığı (Boşsa İşletme Adı)
                  </label>
                  <input
                    type="text"
                    value={config.a4CustomStoreTitle}
                    onChange={e => updateField('a4CustomStoreTitle', e.target.value)}
                    placeholder={storeName}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Belge Türü Alt Başlığı
                  </label>
                  <input
                    type="text"
                    value={config.a4DocumentTitle}
                    onChange={e => updateField('a4DocumentTitle', e.target.value)}
                    placeholder="PERAKENDE SATIŞ & TESLİM BİLGİ FORMU"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Firma Vergi Dairesi (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    value={config.a4TaxOffice}
                    onChange={e => updateField('a4TaxOffice', e.target.value)}
                    placeholder="Örn: Beyoğlu V.D."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Firma Vergi No / T.C. No (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    value={config.a4TaxNumber}
                    onChange={e => updateField('a4TaxNumber', e.target.value)}
                    placeholder="Örn: 1234567890"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* A4 Toggle Switches */}
              <div className="space-y-2.5">
                <label className="block font-black text-slate-700 uppercase text-[11px]">
                  A4 Fatura / Form Üzerinde Gösterilecek Bölümler ve Sütunlar
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    { key: 'a4ShowLogoBadge', label: 'Firma Üst Kurumsal Rozet Başlığını Göster' },
                    { key: 'a4ShowStoreAddress', label: 'Mağaza Adresi ve Telefonunu Göster' },
                    { key: 'a4ShowItemBarcodes', label: 'Tabloda Ürün Barkodlarını Göster' },
                    { key: 'a4ShowUnitColumn', label: 'Miktar Yanında Birim (Adet/Paket) Göster' },
                    { key: 'a4ShowDiscountColumn', label: 'Tabloda Ayrı İskonto Sütunu Göster' },
                    { key: 'a4ShowTaxDetails', label: 'Ara Toplam, İskonto ve KDV Satırlarını Göster' },
                    { key: 'a4ShowCustomerBalanceBox', label: 'Müşteri Eski / Yeni Cari Bakiye Kutusunu Göster' },
                    { key: 'a4ShowBankIban', label: 'Fatura Altında Banka / IBAN Bilgisi Göster' },
                    { key: 'a4ShowWatermark', label: 'Sayfa Arka Planında Filigran (Damga) Göster' },
                    { key: 'a4ShowSignatures', label: 'Teslim Eden / Teslim Alan İmza Alanlarını Göster' },
                    { key: 'a4ShowLegalNote', label: 'V.U.K. Yasal Bilgi Notunu Göster' }
                  ].map(item => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 cursor-pointer select-none transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(config[item.key as keyof PrinterSettingsConfig])}
                        onChange={e => updateField(item.key as any, e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <span className="font-bold text-slate-800">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Watermark & Stamp Text */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Arka Plan Filigran (Watermark) Metni
                  </label>
                  <input
                    type="text"
                    value={config.a4WatermarkText}
                    onChange={e => updateField('a4WatermarkText', e.target.value)}
                    placeholder="Örn: BİLGİ FİŞİ / ÖDENDİ"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Firma Kaşe / İmza Alanı Başlığı
                  </label>
                  <input
                    type="text"
                    value={config.a4StampTitle}
                    onChange={e => updateField('a4StampTitle', e.target.value)}
                    placeholder="Teslim Eden (Firma Kaşe / İmza)"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Bank IBAN */}
              {config.a4ShowBankIban && (
                <div className="text-xs animate-fadeIn">
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    A4 Fatura Altı Banka & IBAN Bilgileri
                  </label>
                  <textarea
                    rows={2}
                    value={config.a4CustomIbanText}
                    onChange={e => updateField('a4CustomIbanText', e.target.value)}
                    placeholder="Örn: Garanti BBVA - TR00 0000 0000 0000 0000 0000 00 (Alıcı: Firma Adı)"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-900"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Yasal Uyarı / V.U.K. Bilgi Notu
                  </label>
                  <textarea
                    rows={2}
                    value={config.a4LegalNoteText}
                    onChange={e => updateField('a4LegalNoteText', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Sayfa En Alt Teşekkür Mesajı
                  </label>
                  <textarea
                    rows={2}
                    value={config.a4FooterText}
                    onChange={e => updateField('a4FooterText', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GENERAL & AUTOMATION SETTINGS */}
          {activeSubTab === 'general' && (
            <div className="p-5 sm:p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-emerald-600" />
                  Genel Yazıcı Davranışı & Otomasyon Ayarları
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hızlı satış ekranında "Ödeme Al & Yazdır" butonuna basıldığında sistemin nasıl davranacağını belirleyin.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Ödeme & Yazdır Varsayılan Davranışı
                  </label>
                  <select
                    value={config.defaultFormat}
                    onChange={e => updateField('defaultFormat', e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="ask">Her Satışta Sor (Termal veya A4 Seçim Penceresi Aç)</option>
                    <option value="thermal">Doğrudan Termal Fiş Yazıcıya Gönder (80mm/58mm)</option>
                    <option value="a4">Doğrudan A4 Yazıcıya Gönder (Lazer/Inkjet)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Varsayılan Baskı Kopya Sayısı
                  </label>
                  <select
                    value={config.copyCount}
                    onChange={e => updateField('copyCount', Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value={1}>1 Nüsha (Tek Çıktı)</option>
                    <option value={2}>2 Nüsha (Müşteri + Muhasebe)</option>
                    <option value={3}>3 Nüsha</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                {[
                  {
                    key: 'autoPrintOnSale',
                    title: 'Satış Tamamlandığında Yazdırma Diyaloğunu Otomatik Tetikle',
                    desc: 'Ödeme Al & Yazdır butonuna basıldığında ekstra tıklama gerektirmeden yazdırma işlemini başlatır.'
                  },
                  {
                    key: 'autoClosePrintWindow',
                    title: 'Yazdırma İşlemi Bitince Çıktı Sekmesini Otomatik Kapat',
                    desc: 'Tarayıcı yazdırma diyaloğu onaylandıktan sonra açılan pencereyi otomatik kapatıp satış ekranına döner.'
                  },
                  {
                    key: 'openCashDrawer',
                    title: 'Fiş Yazdırılırken Para Çekmecesini (RJ11) Otomatik Aç',
                    desc: 'Termal yazıcıya bağlı nakit çekmecesine standart ESC/POS açma sinyali gönderir.'
                  },
                  {
                    key: 'autoCutPaper',
                    title: 'Fiş Sonunda Otomatik Kağıt Kesiciyi (Auto-Cutter) Tetikle',
                    desc: 'Termal fişin alt kısmında kesim payı bırakır ve kesici bıçağı tetikler.'
                  }
                ].map(item => (
                  <label
                    key={item.key}
                    className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(config[item.key as keyof PrinterSettingsConfig])}
                      onChange={e => updateField(item.key as any, e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <div>
                      <p className="font-black text-slate-900">{item.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: BARCODE & SHELF LABEL SETTINGS */}
          {activeSubTab === 'labels' && (
            <div className="p-5 sm:p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Barcode className="w-5 h-5 text-amber-600" />
                  Barkod & Raf Etiketi Yazıcı Ayarları
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stok ve barkod modüllerinde basılan yapışkanlı ürün ve raf etiketlerinin varsayılan boyutları.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-black text-slate-700 mb-1.5 uppercase text-[11px]">
                    Varsayılan Termal Etiket Boyutu
                  </label>
                  <select
                    value={config.labelSize}
                    onChange={e => updateField('labelSize', e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  >
                    <option value="40x20mm">40 x 20 mm (Standart Barkod Etiketi)</option>
                    <option value="50x30mm">50 x 30 mm (Orta Boy Ürün Etiketi)</option>
                    <option value="60x40mm">60 x 40 mm (Büyük Raf / Koli Etiketi)</option>
                    <option value="38x25mm">38 x 25 mm (Kuyum / Kırtasiye Etiketi)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { key: 'labelShowStoreName', label: 'Etikette Mağaza Adı Göster' },
                  { key: 'labelShowKdvIncluded', label: '"KDV Dahil" İbaresi Göster' },
                  { key: 'labelShowDate', label: 'Etiket Basım Tarihini Göster' }
                ].map(item => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2.5 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(config[item.key as keyof PrinterSettingsConfig])}
                      onChange={e => updateField(item.key as any, e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                    />
                    <span className="font-bold text-slate-800">{item.label}</span>
                  </label>
                ))}
              </div>

              {/* Mini Label Preview */}
              <div className="p-5 bg-slate-100 rounded-2xl border border-slate-200 flex flex-col items-center justify-center">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-3">
                  Canlı Barkod Etiketi Önizlemesi ({config.labelSize})
                </p>
                <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-4 w-64 text-center shadow-sm text-black">
                  {config.labelShowStoreName && (
                    <p className="text-[10px] font-black uppercase tracking-wider border-b border-slate-200 pb-1 mb-1">
                      {storeName}
                    </p>
                  )}
                  <p className="text-xs font-bold truncate">Faber-Castell 12&apos;li Boya Kalemi</p>
                  <div className="my-1.5">
                    <span className="text-lg font-black font-mono">145,00 ₺</span>
                    {config.labelShowKdvIncluded && <span className="text-[9px] text-slate-500 block">KDV Dahildir</span>}
                  </div>
                  <div className="font-mono font-black tracking-[3px] text-sm">||| |||| || ||| ||||</div>
                  <p className="text-[9px] font-mono text-slate-600">8690826104215</p>
                  {config.labelShowDate && (
                    <p className="text-[8px] text-slate-400 mt-1">{format(new Date(), 'dd.MM.yyyy')}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: LIVE INTERACTIVE TEMPLATE PREVIEW (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 rounded-3xl border border-slate-800 shadow-xl overflow-hidden sticky top-4">
          <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950/60">
            <div className="flex items-center gap-2 text-white">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span className="font-black text-xs uppercase tracking-wider">Canlı Şablon Önizleme</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-slate-300">
                <button
                  type="button"
                  onClick={() => setPreviewZoom(z => Math.max(80, z - 10))}
                  className="p-1 hover:text-white cursor-pointer"
                  title="Küçült"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-bold px-1.5">%{previewZoom}</span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(z => Math.min(115, z + 10))}
                  className="p-1 hover:text-white cursor-pointer"
                  title="Büyüt"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Format Switcher */}
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPreviewMode('thermal')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer',
                    previewMode === 'thermal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  )}
                >
                  🧾 Termal ({config.thermalPaperWidth})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('a4')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer',
                    previewMode === 'a4' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  )}
                >
                  📄 A4 Fatura
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Sample Customer Input inside Preview Bar */}
          <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400 font-bold shrink-0">Örnek Müşteri:</span>
            <input
              type="text"
              value={sampleCustomerName}
              onChange={e => setSampleCustomerName(e.target.value)}
              placeholder="Örnek Müşteri Adı..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-bold text-[11px] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="p-4 sm:p-6 bg-slate-800/50 max-h-[72vh] overflow-y-auto flex justify-center">
            <div style={{ zoom: `${previewZoom}%` }} className="w-full flex justify-center">
              {previewMode === 'thermal' ? (
                /* LIVE THERMAL RECEIPT PREVIEW */
                <div
                  className={cn(
                    'bg-white text-black rounded-xl shadow-2xl p-4 transition-all border-t-4 border-indigo-500',
                    config.thermalPaperWidth === '58mm'
                      ? 'w-[235px]'
                      : config.thermalPaperWidth === '72mm'
                      ? 'w-[280px]'
                      : 'w-[315px]',
                    config.thermalFontSize === 'small'
                      ? 'text-[10px]'
                      : config.thermalFontSize === 'large'
                      ? 'text-[13px]'
                      : 'text-[11px]',
                    config.thermalFontFamily === 'monospace' || config.thermalFontFamily === 'courier'
                      ? 'font-mono'
                      : 'font-sans',
                    config.thermalLineSpacing === 'compact'
                      ? 'leading-tight'
                      : config.thermalLineSpacing === 'relaxed'
                      ? 'leading-relaxed'
                      : 'leading-snug'
                  )}
                >
                  <div
                    className={cn(
                      'pb-2.5 mb-2.5 border-b border-black',
                      config.thermalDividerStyle === 'dotted'
                        ? 'border-dotted'
                        : config.thermalDividerStyle === 'solid'
                        ? 'border-solid'
                        : 'border-dashed',
                      config.thermalHeaderAlignment === 'left'
                        ? 'text-left'
                        : config.thermalHeaderAlignment === 'right'
                        ? 'text-right'
                        : 'text-center'
                    )}
                  >
                    {config.thermalShowLogoBadge && config.thermalLogoBadgeText && (
                      <p className="text-[9px] font-black tracking-widest uppercase mb-0.5">
                        {config.thermalLogoBadgeText}
                      </p>
                    )}
                    <h4 className="font-black text-sm uppercase leading-tight">
                      {config.thermalCustomTitle?.trim() || storeName}
                    </h4>
                    {config.thermalShowStoreAddress && (
                      <p className="text-[10px] text-gray-700 mt-0.5">{storeAddress}</p>
                    )}
                    {config.thermalShowStorePhone && (
                      <p className="text-[10px] text-gray-700">Tel: {storePhone}</p>
                    )}
                    {config.thermalCustomSubtitle && (
                      <p className="font-black mt-1 uppercase">{config.thermalCustomSubtitle}</p>
                    )}
                    {config.thermalShowOrderNumberBox ? (
                      <div className="inline-block border border-black px-2 py-0.5 font-black text-[10px] my-1">
                        FİŞ NO: #{activeSampleReceipt.saleId.slice(0, 8)}
                      </div>
                    ) : (
                      <p className="text-[10px] mt-0.5">Fiş No: #{activeSampleReceipt.saleId.slice(0, 8)}</p>
                    )}
                    <p className="text-[10px]">{activeSampleReceipt.dateFormatted}</p>
                  </div>

                  <div
                    className={cn(
                      'pb-2 mb-2 space-y-0.5 border-b border-black',
                      config.thermalDividerStyle === 'dotted'
                        ? 'border-dotted'
                        : config.thermalDividerStyle === 'solid'
                        ? 'border-solid'
                        : 'border-dashed'
                    )}
                  >
                    {config.thermalShowCustomerInfo && (
                      <>
                        <div className="flex justify-between">
                          <span>Müşteri:</span>
                          <span className="font-bold truncate max-w-[160px]">{activeSampleReceipt.customerName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tel:</span>
                          <span>{activeSampleReceipt.customerPhone}</span>
                        </div>
                      </>
                    )}
                    {config.thermalShowSellerInfo && (
                      <div className="flex justify-between">
                        <span>Kasiyer:</span>
                        <span className="font-bold">
                          [{activeSampleReceipt.sellerCode}] {activeSampleReceipt.sellerName}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Ödeme:</span>
                      <span className="font-bold">{activeSampleReceipt.paymentMethodLabel}</span>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'pb-2 mb-2 space-y-1.5 border-b border-black',
                      config.thermalDividerStyle === 'dotted'
                        ? 'border-dotted'
                        : config.thermalDividerStyle === 'solid'
                        ? 'border-solid'
                        : 'border-dashed'
                    )}
                  >
                    <div className="flex justify-between font-black text-[10px] uppercase">
                      <span>ÜRÜN</span>
                      <span>TUTAR</span>
                    </div>
                    {activeSampleReceipt.items.map((it, idx) => (
                      <div key={idx} className="border-b border-dotted border-gray-300 pb-1">
                        <p className="font-bold uppercase leading-tight">{it.name}</p>
                        {config.thermalShowItemBarcodes && it.barcode && (
                          <p className="text-[9px] text-gray-500">{it.barcode}</p>
                        )}
                        <div className="flex justify-between">
                          <span>
                            {it.quantity} x {it.price.toFixed(2)} ₺
                          </span>
                          <span className="font-bold">{(it.quantity * it.price - (it.discount || 0)).toFixed(2)} ₺</span>
                        </div>
                        {config.thermalShowDiscountDetails && it.discount && it.discount > 0 ? (
                          <p className="text-[9px] text-right text-red-700">İskonto: -{it.discount.toFixed(2)} ₺</p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div
                    className={cn(
                      'pb-2 mb-2 space-y-0.5 border-b border-black',
                      config.thermalDividerStyle === 'dotted'
                        ? 'border-dotted'
                        : config.thermalDividerStyle === 'solid'
                        ? 'border-solid'
                        : 'border-dashed'
                    )}
                  >
                    {config.thermalShowTaxBreakdown && (
                      <>
                        <div className="flex justify-between">
                          <span>Ara Toplam:</span>
                          <span>{activeSampleReceipt.subtotal.toFixed(2)} ₺</span>
                        </div>
                        <div className="flex justify-between">
                          <span>KDV (%{activeSampleReceipt.taxRate}):</span>
                          <span>{activeSampleReceipt.taxAmount.toFixed(2)} ₺</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between font-black text-sm border-y border-black py-1 my-1">
                      <span>TOPLAM:</span>
                      <span>{activeSampleReceipt.total.toFixed(2)} ₺</span>
                    </div>
                    {config.thermalShowCustomerBalance && (
                      <>
                        <div className="flex justify-between text-[10px]">
                          <span>Önceki Borç:</span>
                          <span>{activeSampleReceipt.previousDebt?.toFixed(2)} ₺</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold">
                          <span>Güncel Borç:</span>
                          <span>{activeSampleReceipt.newDebt?.toFixed(2)} ₺</span>
                        </div>
                      </>
                    )}
                  </div>

                  {config.thermalShowBottomBarcode && (
                    <div className="text-center my-2">
                      <p className="font-mono font-black tracking-[3px] text-xs">||| || ||| | |||| |||</p>
                      <p className="text-[9px] font-mono">#{activeSampleReceipt.saleId}</p>
                    </div>
                  )}

                  {config.thermalShowQrCode && config.thermalQrCodeText && (
                    <div className="my-2 mx-auto p-1.5 border border-dotted border-black w-fit text-center">
                      <QrCode className="w-8 h-8 mx-auto text-black" />
                      <p className="text-[8px] font-mono mt-0.5 truncate max-w-[140px]">{config.thermalQrCodeText}</p>
                    </div>
                  )}

                  {config.thermalSocialHandle && (
                    <p className="text-center font-bold text-[9.5px] mt-1">{config.thermalSocialHandle}</p>
                  )}

                  {config.thermalFooterText && (
                    <p className="text-center text-[10px] whitespace-pre-wrap mt-2 text-gray-700">
                      {config.thermalFooterText}
                    </p>
                  )}
                </div>
              ) : (
                /* LIVE A4 INVOICE / FORM PREVIEW */
                <div className="bg-white text-slate-900 rounded-xl shadow-2xl p-5 w-full text-[10px] space-y-3.5 border-t-4 border-blue-600 relative overflow-hidden">
                  {config.a4ShowWatermark && config.a4WatermarkText && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                      <span className="text-2xl font-black uppercase text-slate-900/5 -rotate-24 whitespace-nowrap">
                        {config.a4WatermarkText}
                      </span>
                    </div>
                  )}

                  {/* Header Layout Switch */}
                  {config.a4HeaderLayout === 'modern-banner' ? (
                    <div className={cn('p-3 rounded-xl flex justify-between items-center', activeTheme.badgeBg)}>
                      <div>
                        {config.a4ShowLogoBadge && config.a4LogoBadgeText && (
                          <p className="text-[8px] font-black uppercase tracking-widest opacity-85">
                            {config.a4LogoBadgeText}
                          </p>
                        )}
                        <h4 className="font-black text-sm uppercase">
                          {config.a4CustomStoreTitle?.trim() || storeName}
                        </h4>
                        {config.a4ShowStoreAddress && (
                          <p className="text-[8.5px] opacity-90">
                            {storeAddress} • Tel: {storePhone}
                          </p>
                        )}
                      </div>
                      <div className="text-right font-mono">
                        <span className="inline-block px-2 py-0.5 rounded bg-white/20 text-[8px] font-black uppercase mb-0.5">
                          {config.a4DocumentTitle}
                        </span>
                        <p className="font-black text-[10px]">#{activeSampleReceipt.saleId.slice(0, 8)}</p>
                        <p className="text-[8.5px] opacity-90">{activeSampleReceipt.dateFormatted}</p>
                      </div>
                    </div>
                  ) : config.a4HeaderLayout === 'centered' ? (
                    <div className={cn('text-center border-b-2 pb-3', activeTheme.primary)}>
                      {config.a4ShowLogoBadge && config.a4LogoBadgeText && (
                        <p className="text-[8px] font-black uppercase tracking-widest">{config.a4LogoBadgeText}</p>
                      )}
                      <h4 className="font-black text-sm uppercase text-slate-900">
                        {config.a4CustomStoreTitle?.trim() || storeName}
                      </h4>
                      {config.a4ShowStoreAddress && (
                        <p className="text-[9px] text-slate-500">
                          {storeAddress} • Tel: {storePhone}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center justify-center gap-2">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded font-black text-[8px] uppercase border',
                            activeTheme.bg,
                            activeTheme.border,
                            activeTheme.primary
                          )}
                        >
                          {config.a4DocumentTitle}
                        </span>
                        <span className="font-mono font-black text-[9px] text-slate-800">
                          #{activeSampleReceipt.saleId.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={cn('flex justify-between items-start border-b-2 pb-3', activeTheme.primary)}>
                      <div>
                        {config.a4ShowLogoBadge && config.a4LogoBadgeText && (
                          <p className="text-[8px] font-black uppercase tracking-wider">{config.a4LogoBadgeText}</p>
                        )}
                        <h4 className="font-black text-sm uppercase text-slate-900">
                          {config.a4CustomStoreTitle?.trim() || storeName}
                        </h4>
                        {config.a4ShowStoreAddress && (
                          <>
                            <p className="text-[9px] text-slate-500">{storeAddress}</p>
                            <p className="text-[9px] text-slate-500">Tel: {storePhone}</p>
                          </>
                        )}
                        {(config.a4TaxOffice || config.a4TaxNumber) && (
                          <p className="text-[9px] text-slate-600 font-medium">
                            {config.a4TaxOffice ? `V.D.: ${config.a4TaxOffice}` : ''}{' '}
                            {config.a4TaxNumber ? `• V.No: ${config.a4TaxNumber}` : ''}
                          </p>
                        )}
                        <span
                          className={cn(
                            'inline-block mt-1 px-2 py-0.5 rounded font-black text-[8px] uppercase border',
                            activeTheme.bg,
                            activeTheme.border,
                            activeTheme.primary
                          )}
                        >
                          {config.a4DocumentTitle}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <p className="font-black text-[10px]">BELGE: #{activeSampleReceipt.saleId.slice(0, 8)}</p>
                        <p className="text-[9px] text-slate-500">{activeSampleReceipt.dateFormatted}</p>
                        <p className="text-[9px] font-bold">Satış: [{activeSampleReceipt.sellerCode}]</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[8px] font-bold uppercase text-slate-400 block">MÜŞTERİ / CARİ</span>
                      <p className="font-black text-slate-900">{activeSampleReceipt.customerName}</p>
                      <p className="text-[9px] text-slate-500">Tel: {activeSampleReceipt.customerPhone}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-bold uppercase text-slate-400 block">ÖDEME ŞEKLİ</span>
                      <p className={cn('font-black', activeTheme.primary)}>{activeSampleReceipt.paymentMethodLabel}</p>
                    </div>
                  </div>

                  <table className="w-full border-collapse text-[9px]">
                    <thead>
                      <tr className={cn('font-black uppercase', activeTheme.bg)}>
                        <th
                          className={cn(
                            'p-1 text-center',
                            config.a4TableStyle === 'minimal' ? 'border-b border-slate-300' : 'border border-slate-300'
                          )}
                        >
                          #
                        </th>
                        <th
                          className={cn(
                            'p-1 text-left',
                            config.a4TableStyle === 'minimal' ? 'border-b border-slate-300' : 'border border-slate-300'
                          )}
                        >
                          Ürün
                        </th>
                        <th
                          className={cn(
                            'p-1 text-center',
                            config.a4TableStyle === 'minimal' ? 'border-b border-slate-300' : 'border border-slate-300'
                          )}
                        >
                          Mik.
                        </th>
                        <th
                          className={cn(
                            'p-1 text-right',
                            config.a4TableStyle === 'minimal' ? 'border-b border-slate-300' : 'border border-slate-300'
                          )}
                        >
                          Fiyat
                        </th>
                        {config.a4ShowDiscountColumn && (
                          <th
                            className={cn(
                              'p-1 text-right',
                              config.a4TableStyle === 'minimal'
                                ? 'border-b border-slate-300'
                                : 'border border-slate-300'
                            )}
                          >
                            İsk.
                          </th>
                        )}
                        <th
                          className={cn(
                            'p-1 text-right',
                            config.a4TableStyle === 'minimal' ? 'border-b border-slate-300' : 'border border-slate-300'
                          )}
                        >
                          Toplam
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSampleReceipt.items.map((it, idx) => (
                        <tr
                          key={idx}
                          className={cn(config.a4TableStyle === 'striped' && idx % 2 === 1 ? 'bg-slate-50' : '')}
                        >
                          <td
                            className={cn(
                              'p-1 text-center font-mono',
                              config.a4TableStyle === 'minimal'
                                ? 'border-b border-slate-200'
                                : 'border border-slate-300'
                            )}
                          >
                            {idx + 1}
                          </td>
                          <td
                            className={cn(
                              'p-1 font-bold',
                              config.a4TableStyle === 'minimal'
                                ? 'border-b border-slate-200'
                                : 'border border-slate-300'
                            )}
                          >
                            {it.name}
                            {config.a4ShowItemBarcodes && it.barcode && (
                              <span className="block text-[8px] text-slate-400 font-mono font-normal">{it.barcode}</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              'p-1 text-center font-bold',
                              config.a4TableStyle === 'minimal'
                                ? 'border-b border-slate-200'
                                : 'border border-slate-300'
                            )}
                          >
                            {it.quantity} {config.a4ShowUnitColumn ? it.unit || 'Adet' : ''}
                          </td>
                          <td
                            className={cn(
                              'p-1 text-right font-mono',
                              config.a4TableStyle === 'minimal'
                                ? 'border-b border-slate-200'
                                : 'border border-slate-300'
                            )}
                          >
                            {it.price.toFixed(2)} ₺
                          </td>
                          {config.a4ShowDiscountColumn && (
                            <td
                              className={cn(
                                'p-1 text-right font-mono text-rose-600',
                                config.a4TableStyle === 'minimal'
                                  ? 'border-b border-slate-200'
                                  : 'border border-slate-300'
                              )}
                            >
                              {it.discount ? `-${it.discount.toFixed(2)}` : '0.00'} ₺
                            </td>
                          )}
                          <td
                            className={cn(
                              'p-1 text-right font-mono font-bold',
                              config.a4TableStyle === 'minimal'
                                ? 'border-b border-slate-200'
                                : 'border border-slate-300'
                            )}
                          >
                            {(it.quantity * it.price - (it.discount || 0)).toFixed(2)} ₺
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 space-y-1.5 text-[8.5px] text-slate-600">
                      {config.a4ShowCustomerBalanceBox && (
                        <div className="p-1.5 border border-slate-300 rounded bg-slate-50 font-mono">
                          <div className="flex justify-between">
                            <span>Önceki Bakiye:</span>
                            <span>{activeSampleReceipt.previousDebt?.toFixed(2)} ₺</span>
                          </div>
                          <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-0.5">
                            <span>Güncel Borç:</span>
                            <span>{activeSampleReceipt.newDebt?.toFixed(2)} ₺</span>
                          </div>
                        </div>
                      )}
                      {config.a4ShowBankIban && config.a4CustomIbanText && (
                        <div className="p-1.5 border border-dashed border-slate-300 rounded font-mono text-[8px]">
                          <strong>IBAN:</strong> {config.a4CustomIbanText}
                        </div>
                      )}
                      {config.a4ShowLegalNote && config.a4LegalNoteText && (
                        <p className="italic">{config.a4LegalNoteText}</p>
                      )}
                    </div>

                    <div className="w-40 border border-slate-800 rounded p-2 space-y-1">
                      {config.a4ShowTaxDetails && (
                        <>
                          <div className="flex justify-between">
                            <span>Ara Toplam:</span>
                            <span className="font-mono font-bold">{activeSampleReceipt.subtotal.toFixed(2)} ₺</span>
                          </div>
                          <div className="flex justify-between">
                            <span>KDV (%{activeSampleReceipt.taxRate}):</span>
                            <span className="font-mono font-bold">{activeSampleReceipt.taxAmount.toFixed(2)} ₺</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between font-black text-[11px] border-t border-slate-800 pt-1">
                        <span>TOPLAM:</span>
                        <span className="font-mono">{activeSampleReceipt.total.toFixed(2)} ₺</span>
                      </div>
                    </div>
                  </div>

                  {config.a4ShowSignatures && (
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200 text-center text-[8.5px] text-slate-500">
                      <div>
                        <p className="font-bold mb-4">{config.a4StampTitle || 'Teslim Eden (Kaşe/İmza)'}</p>
                        <div className="border-b border-slate-300 w-24 mx-auto" />
                      </div>
                      <div>
                        <p className="font-bold mb-4">Teslim Alan (Müşteri İmza)</p>
                        <div className="border-b border-slate-300 w-24 mx-auto" />
                      </div>
                    </div>
                  )}

                  {config.a4FooterText && (
                    <p className="text-center text-[8px] text-slate-400 border-t border-slate-100 pt-1.5">
                      {config.a4FooterText}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 font-medium">
              Değişiklikler tüm satış fişlerine ve faturalara anında uygulanır.
            </span>
            <button
              type="button"
              onClick={() => handleTestPrint(previewMode)}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Önizlemeyi Test Yazdır</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrinterSettings;
