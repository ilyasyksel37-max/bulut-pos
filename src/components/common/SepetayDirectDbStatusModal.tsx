import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  Users, 
  ShoppingCart, 
  ShieldCheck, 
  Activity, 
  X, 
  Sparkles, 
  ArrowRight,
  Server,
  Zap,
  Globe
} from 'lucide-react';
import { sepetayLiveSync, SepetayLiveSyncState } from '../../lib/sepetay-live-sync';
import { SEPETAY_LEGACY_APPLET_ID } from '../../lib/tenant';

interface SepetayDirectDbStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SepetayDirectDbStatusModal: React.FC<SepetayDirectDbStatusModalProps> = ({
  isOpen,
  onClose
}) => {
  const [syncState, setSyncState] = useState<SepetayLiveSyncState>(sepetayLiveSync.getState());
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setVerifyResult(null);
      return;
    }

    const unsub = sepetayLiveSync.subscribe((state) => {
      setSyncState(state);
    });

    return () => unsub();
  }, [isOpen]);

  const handleRunVerify = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await sepetayLiveSync.ensureSepetayLiveMapping();
      setVerifyResult(`✅ Başarılı: ${res.productsSynced} ürün, ${res.customersSynced} cari müşteri ve ${res.salesSynced} satış kaydı canlı olarak eşlendi.`);
    } catch (err: any) {
      setVerifyResult(`⚠️ Hata: ${err?.message || 'Eşleme sırasında hata oluştu'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Database className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base leading-tight">
                  Sepetay Doğrudan Firebase Eşlemesi
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                  Canlı (Live Sync)
                </span>
              </div>
              <p className="text-xs text-emerald-200 mt-0.5 font-mono">
                Hedef Proje: {SEPETAY_LEGACY_APPLET_ID}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-600">
          
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-950 text-xs sm:text-sm">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span>Harici API Olmaksızın Doğrudan Bulut Bağlantısı</span>
            </div>
            <p className="text-xs text-emerald-900/80 leading-relaxed">
              Sepetay kiracısı (<strong>tenant_id: 'sepetay'</strong>) için Firestore'un yerel <strong>onSnapshot</strong> gerçek zamanlı dinleme özelliği aktif edilmiştir. Eski sistem ile yeni Bulut POS arasında stok, cari ve satış verileri gecikmesiz çalışır.
            </p>
          </div>

          {/* Real-time stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Stok / Ürünler
              </span>
              <p className="text-xl font-black text-slate-900 mt-0.5">
                {syncState.productsCount}
              </p>
              <span className="text-[9px] text-slate-400 font-mono">products</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Cari Hesaplar
              </span>
              <p className="text-xl font-black text-slate-900 mt-0.5">
                {syncState.customersCount}
              </p>
              <span className="text-[9px] text-slate-400 font-mono">customers</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Cari Hareketleri
              </span>
              <p className="text-xl font-black text-slate-900 mt-0.5">
                {syncState.transactionsCount}
              </p>
              <span className="text-[9px] text-slate-400 font-mono">transactions</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Satış Fişleri
              </span>
              <p className="text-xl font-black text-slate-900 mt-0.5">
                {syncState.salesCount}
              </p>
              <span className="text-[9px] text-slate-400 font-mono">sales</span>
            </div>
          </div>

          {/* Connection Protocol Specifications */}
          <div className="p-3.5 bg-slate-900 text-slate-300 rounded-2xl space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5">
              <span>Protokol:</span>
              <span className="text-emerald-400 font-bold">Firestore onSnapshot (gRPC / WebSocket)</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5">
              <span>Hedef Proje ID:</span>
              <span className="text-white font-bold">{SEPETAY_LEGACY_APPLET_ID}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5">
              <span>Kiracı İzolasyonu:</span>
              <span className="text-blue-400 font-bold">Yalnızca Sepetay (İzole)</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Son Canlı Sinyal:</span>
              <span className="text-amber-400 font-bold">
                {syncState.lastSyncTime ? syncState.lastSyncTime.toLocaleTimeString('tr-TR') : 'Canlı Bağlı'}
              </span>
            </div>
          </div>

          {/* Verify result toast */}
          {verifyResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 animate-fadeIn">
              {verifyResult}
            </div>
          )}

          <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-900 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Diğer Kiracılar Etkilenmez</span>
            </p>
            <p className="text-[11px] text-blue-800/80 leading-relaxed">
              Bu özel Firebase eşlemesi sadece <strong>Sepetay</strong> kiracısı seçildiğinde aktif olur. Diğer mağazalar (Beyoğlu, Çoruh vb.) kendi bağımsız koleksiyonlarını ve verilerini kullanmaya devam eder.
            </p>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Kapat
          </button>

          <button
            type="button"
            onClick={handleRunVerify}
            disabled={isVerifying}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isVerifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Eşleme Denetleniyor...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Eşlemeyi Yeniden Doğrula</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
