import React, { useState, useEffect } from 'react';
import { 
  Printer, FileText, Receipt, CheckCircle2, 
  X, Sparkles, Check, ChevronRight 
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type PrintFormat = 'a4' | 'thermal';

export interface PrintSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmPrint: (format: PrintFormat) => void;
  documentTitle?: string;
  documentSubtitle?: string;
  saleId?: string;
  totalAmount?: number;
  customerName?: string;
  itemCount?: number;
  initialFormat?: PrintFormat;
  onViewPreview?: () => void;
}

export const PrintSelectionModal: React.FC<PrintSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirmPrint,
  documentTitle = 'Yazıcı Formatı Seçin',
  documentSubtitle = 'Yazdırma işlemine başlamadan önce kullanmak istediğiniz yazıcı tipini seçin.',
  saleId,
  totalAmount,
  customerName,
  itemCount,
  initialFormat,
  onViewPreview
}) => {
  const [selectedFormat, setSelectedFormat] = useState<PrintFormat>(() => {
    if (initialFormat) return initialFormat;
    const saved = localStorage.getItem('pos_preferred_receipt_format');
    return (saved === 'thermal' ? 'thermal' : 'a4') as PrintFormat;
  });

  const [rememberDefault, setRememberDefault] = useState(true);
  const [printCount, setPrintCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setPrintCount(0);
    }
    if (initialFormat) {
      setSelectedFormat(initialFormat);
    } else {
      const saved = localStorage.getItem('pos_preferred_receipt_format');
      if (saved === 'thermal' || saved === 'a4') {
        setSelectedFormat(saved as PrintFormat);
      }
    }
  }, [isOpen, initialFormat]);

  if (!isOpen) return null;

  const handleConfirm = (overrideFormat?: PrintFormat) => {
    const fmt = overrideFormat || selectedFormat;
    setSelectedFormat(fmt);
    if (rememberDefault) {
      try {
        localStorage.setItem('pos_preferred_receipt_format', fmt);
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
    }
    onConfirmPrint(fmt);
    setPrintCount(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
              <Printer className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base sm:text-lg text-slate-900 leading-tight truncate">
                {documentTitle}
              </h3>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {documentSubtitle}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors shrink-0 ml-2 cursor-pointer"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optional Document Summary Banner */}
        {(saleId || totalAmount !== undefined || customerName) && (
          <div className="px-5 py-3 bg-blue-50/70 border-b border-blue-100/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-blue-900 px-2 py-0.5 bg-blue-200/60 rounded-md">
                #{saleId ? saleId.slice(0, 10).toUpperCase() : 'SATIŞ'}
              </span>
              <span className="font-medium text-blue-800">
                {customerName ? customerName : 'Perakende Müşteri'}
              </span>
              {itemCount !== undefined && (
                <span className="text-blue-600 text-[11px]">
                  ({itemCount} Kalem)
                </span>
              )}
            </div>
            {totalAmount !== undefined && (
              <div className="text-right">
                <span className="font-black text-blue-950 font-mono text-sm">
                  {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
            )}
          </div>
        )}

        {/* Format Selection Cards */}
        <div className="p-4 sm:p-6 space-y-3.5 bg-slate-50/40 overflow-y-auto max-h-[60vh]">
          {printCount > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Yazıcı ekranı açıldı ({printCount}. baskı). Aynı fişi tekrar yazdırmak için aşağıdaki butona tekrar basabilirsiniz.</span>
              </div>
            </div>
          )}

          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Yazdırma Türünü Belirleyin (Kartlara çift tıklayarak da anında basabilirsiniz):
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Format Option 1: A4 Laser / Inkjet */}
            <div
              onClick={() => setSelectedFormat('a4')}
              onDoubleClick={() => handleConfirm('a4')}
              className={cn(
                "p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative group",
                selectedFormat === 'a4'
                  ? "bg-white border-blue-600 ring-2 ring-blue-500/30 shadow-lg shadow-blue-600/10"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-md"
              )}
            >
              {selectedFormat === 'a4' && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}

              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
                  <FileText className="w-5 h-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900 leading-tight">
                  A4 Laser / Inkjet
                </h4>
                <p className="text-[11px] font-bold text-blue-700 mt-0.5">
                  Standart A4 Kağıt Çıktısı
                </p>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Lazer, Mürekkep Püskürtmeli, Tanklı (Epson, HP, Canon, Brother vb.) tüm standart yazıcılar ve PDF formatı.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[10px] text-slate-600">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0" />
                  <span>210 x 297 mm tam sayfa teslim formu</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirm('a4');
                  }}
                  className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-black text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  <span>{printCount > 0 && selectedFormat === 'a4' ? 'Tekrar A4 Yazdır' : 'Hemen A4 Yazdır'}</span>
                </button>
              </div>
            </div>

            {/* Format Option 2: Thermal Printer */}
            <div
              onClick={() => setSelectedFormat('thermal')}
              onDoubleClick={() => handleConfirm('thermal')}
              className={cn(
                "p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative group",
                selectedFormat === 'thermal'
                  ? "bg-white border-slate-900 ring-2 ring-slate-800/30 shadow-lg shadow-slate-900/10"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-md"
              )}
            >
              {selectedFormat === 'thermal' && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}

              <div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center mb-3">
                  <Receipt className="w-5 h-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900 leading-tight">
                  Thermal Printer
                </h4>
                <p className="text-[11px] font-bold text-slate-700 mt-0.5">
                  80mm / 58mm Termal Fiş Yazıcı
                </p>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Perakende kasa fiş yazıcıları, dar rulo kağıtlar ve hızlı bilgi fişleri için optimize edilmiştir.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[10px] text-slate-600">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Hızlı termal rulo baskısı</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirm('thermal');
                  }}
                  className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 font-black text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  <span>{printCount > 0 && selectedFormat === 'thermal' ? 'Tekrar Fiş Yazdır' : 'Hemen Fiş Yazdır'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Remember Choice Toggle */}
          <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberDefault}
              onChange={(e) => setRememberDefault(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
            />
            <span className="text-xs text-slate-600 font-medium">
              Bu seçimimi sonraki yazdırmalar için varsayılan olarak hatırla
            </span>
          </label>
        </div>

        {/* Actions Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-700 bg-slate-200/80 hover:bg-slate-300 transition-all cursor-pointer"
            >
              {printCount > 0 ? 'Kapat / Yeni Satış' : 'Kapat'}
            </button>
            {onViewPreview && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewPreview();
                }}
                className="px-3.5 py-2.5 rounded-xl font-bold text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Detaylı Önizleme</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleConfirm()}
            className={cn(
              "px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider text-white shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer",
              selectedFormat === 'a4'
                ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/25"
                : "bg-slate-900 hover:bg-slate-800 shadow-slate-900/25"
            )}
          >
            <Printer className="w-4 h-4" />
            <span>
              {printCount > 0
                ? selectedFormat === 'a4'
                  ? '📄 Tekrar A4 Yazdır'
                  : '🧾 Tekrar Termal Fiş Yazdır'
                : selectedFormat === 'a4' 
                ? '📄 A4 Formatında Yazdır' 
                : '🧾 Termal Fiş Olarak Yazdır'}
            </span>
            <ChevronRight className="w-4 h-4 opacity-70" />
          </button>
        </div>
      </div>
    </div>
  );
};
