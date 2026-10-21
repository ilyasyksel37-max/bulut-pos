import React, { useState, useEffect } from 'react';
import { 
  Globe, CheckCircle2, RefreshCw, Layers, Database, 
  ArrowRight, X, Sparkles, AlertCircle 
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { syncAllExistingProductsToGlobal, GlobalSyncResult } from '../../lib/global-catalog';

interface GlobalCatalogSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: GlobalSyncResult) => void;
}

export const GlobalCatalogSyncModal: React.FC<GlobalCatalogSyncModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [totalInGlobal, setTotalInGlobal] = useState<number | null>(null);
  const [totalInProducts, setTotalInProducts] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; synced: number } | null>(null);
  const [syncResult, setSyncResult] = useState<GlobalSyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load initial counts when modal opens
  useEffect(() => {
    if (!isOpen) {
      setSyncResult(null);
      setProgress(null);
      setErrorMessage(null);
      return;
    }

    const loadCounts = async () => {
      setLoadingInitial(true);
      try {
        const [globalSnap, productsSnap] = await Promise.all([
          getDocs(collection(db, 'global_products')),
          getDocs(collection(db, 'products'))
        ]);
        setTotalInGlobal(globalSnap.size);
        setTotalInProducts(productsSnap.size);
      } catch (err) {
        console.warn("Could not load catalog counts:", err);
      } finally {
        setLoadingInitial(false);
      }
    };

    loadCounts();
  }, [isOpen]);

  const handleStartSync = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    setSyncResult(null);
    try {
      const res = await syncAllExistingProductsToGlobal((p) => {
        setProgress(p);
      });
      setSyncResult(res);
      setTotalInGlobal(res.totalInGlobal);
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err: any) {
      console.error("Global sync error:", err);
      setErrorMessage(err.message || 'Senkronizasyon sırasında bir hata oluştu.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  const percent = progress && progress.total > 0 
    ? Math.min(100, Math.round((progress.current / progress.total) * 100)) 
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-900 via-indigo-850 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-tight">
                Global Ürün Havuzu Senkronizasyonu
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Ortak Katalog (global_products) Yönetimi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSyncing}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-600">
          
          <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-950 text-xs sm:text-sm">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Bu İşlem Ne Sağlar?</span>
            </div>
            <p className="text-xs text-indigo-900/80 leading-relaxed">
              Sistemdeki tüm kayıtlı ürünleri (kırtasiye, market, gıda, temizlik vb.) barkodlarıyla birlikte ortak <strong>global_products</strong> havuzuna kopyalar.
            </p>
            <ul className="text-[11px] text-indigo-950/70 space-y-1 list-disc list-inside">
              <li>Diğer tüm kiracılar veya yeni şubeler barkod okuttuğunda ürün adı ve kategori otomatik dolar.</li>
              <li>Kullanıcılar isim yazmak zorunda kalmaz; sadece kendi satış fiyatını ve stoğunu girerek saniyeler içinde ürün tanımlar.</li>
            </ul>
          </div>

          {/* Counts statistics cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Sistemdeki Toplam Ürün
              </span>
              <p className="text-xl font-black text-slate-900 mt-0.5">
                {loadingInitial ? '...' : (totalInProducts ?? '0')}
              </p>
              <span className="text-[10px] text-slate-400">Veritabanındaki ürün kartları</span>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                Global Havuzdaki Ürün
              </span>
              <p className="text-xl font-black text-emerald-800 mt-0.5">
                {loadingInitial ? '...' : (totalInGlobal ?? '0')}
              </p>
              <span className="text-[10px] text-emerald-600">Ortak katalogda aktif</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Syncing Progress Bar */}
          {isSyncing && (
            <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  Eski Ürünler Global Havuza Aktarılıyor...
                </span>
                <span className="font-mono font-bold text-indigo-300">%{percent}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {progress && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>İşlenen: {progress.current} / {progress.total}</span>
                  <span>Aktarılan: {progress.synced}</span>
                </div>
              )}
            </div>
          )}

          {/* Success Summary */}
          {syncResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 animate-fadeIn text-emerald-950">
              <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Senkronizasyon Başarıyla Tamamlandı!</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Toplam <strong>{syncResult.syncedCount}</strong> adet ürün başarıyla ortak <strong>global_products</strong> havuzuna kaydedildi. Artık tüm kiracılar ve satış ekranları bu ürünleri anında tanıyacaktır.
              </p>
              <div className="text-[11px] font-mono text-emerald-700 pt-1 border-t border-emerald-200/60 flex justify-between">
                <span>Taranan: {syncResult.totalScanned}</span>
                <span>Havuzdaki Toplam: {syncResult.totalInGlobal}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Kapat
          </button>

          <button
            type="button"
            onClick={handleStartSync}
            disabled={isSyncing}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-black shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Aktarılıyor...</span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                <span>Eski Ürünleri Global Havuza Aktar</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
