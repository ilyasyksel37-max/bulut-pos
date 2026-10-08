import React, { useState } from 'react';
import { 
  X, AlertTriangle, RotateCcw, Trash2, CheckCircle2, 
  RefreshCw, ShieldAlert, Layers, PackageX 
} from 'lucide-react';
import { 
  collection, getDocs, writeBatch, doc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface StockResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  productsCount: number;
  onSuccess: (message: string) => void;
}

export const StockResetModal: React.FC<StockResetModalProps> = ({
  isOpen,
  onClose,
  productsCount,
  onSuccess,
}) => {
  const [resetType, setResetType] = useState<'zero_quantities' | 'delete_all'>('zero_quantities');
  const [confirmText, setConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  if (!isOpen) return null;

  const handleExecuteReset = async () => {
    if (confirmText.trim().toUpperCase() !== 'SIFIRLA') {
      alert('İşlemi onaylamak için lütfen kutucuğa "SIFIRLA" yazın.');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: productsCount });

    try {
      const snap = await getDocs(collection(db, 'products'));
      const docs = snap.docs;
      const total = docs.length;

      const chunkSize = 350;
      let processed = 0;

      for (let i = 0; i < total; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const d of chunk) {
          if (resetType === 'zero_quantities') {
            // Keep product, reset stock to 0
            batch.update(d.ref, {
              stock: 0,
              updatedAt: serverTimestamp(),
            });
          } else {
            // Delete product document completely
            batch.delete(d.ref);
          }
        }

        await batch.commit();
        processed += chunk.length;
        setProgress({ current: processed, total });
      }

      const msg = resetType === 'zero_quantities'
        ? `Tüm ürünlerin stok miktarları başarıyla sıfırlandı (0 Adet yapıldı).`
        : `Tüm ürün kataloğu ve stoklar başarıyla temizlendi.`;

      onSuccess(msg);
      onClose();
    } catch (err) {
      console.error("Stock reset error:", err);
      alert("Stok sıfırlama sırasında hata oluştu: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-tight">
                Stokları Sıfırlama İşlemi
              </h3>
              <p className="text-xs text-slate-500 leading-tight mt-0.5">
                Kayıtlı {productsCount} ürün için sıfırlama seçeneği
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* Option Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Sıfırlama Türünü Seçin
            </label>

            {/* Option 1: Zero stock quantities */}
            <div
              onClick={() => setResetType('zero_quantities')}
              className={`p-3.5 sm:p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                resetType === 'zero_quantities'
                  ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                resetType === 'zero_quantities' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs sm:text-sm text-slate-900">
                  Stok Miktarlarını Sıfırla (Adetleri 0 Yap)
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ürün isimleri, barkodlar ve fiyatlar korunur. Yalnızca tüm ürünlerin mevcut stok sayısı <strong>0</strong> yapılır. Yeni sayım öncesi önerilir.
                </p>
              </div>
            </div>

            {/* Option 2: Delete entire catalog */}
            <div
              onClick={() => setResetType('delete_all')}
              className={`p-3.5 sm:p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                resetType === 'delete_all'
                  ? 'border-red-600 bg-red-50/50 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                resetType === 'delete_all' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                <PackageX className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs sm:text-sm text-red-700">
                  Tüm Ürün Kataloğunu Tamamen Sil (Kataloğu Boşalt)
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Veritabanındaki tüm {productsCount} ürün kalıcı olarak silinir. Sıfırdan temiz bir Excel yüklemek için kullanılır.
                </p>
              </div>
            </div>
          </div>

          {/* Warning box */}
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>DİKKAT: Bu işlem geri alınamaz!</span>
            </div>
            <p className="text-[11px] text-red-700">
              {resetType === 'zero_quantities'
                ? 'Tüm ürünlerin stokları 0 adet olarak güncellenecektir.'
                : 'Katalogdaki tüm ürünler kalıcı olarak silinecektir.'}
            </p>
          </div>

          {/* Confirmation input */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-slate-700 block">
              Onaylamak için aşağıdaki kutucuğa büyük harflerle <strong>SIFIRLA</strong> yazın:
            </label>
            <input
              type="text"
              placeholder="SIFIRLA"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold tracking-wider text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Progress bar */}
          {progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>İşleniyor...</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-red-600 h-full rounded-full transition-all duration-200"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all"
          >
            Vazgeç
          </button>

          <button
            type="button"
            disabled={confirmText.trim().toUpperCase() !== 'SIFIRLA' || isProcessing}
            onClick={handleExecuteReset}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-red-600/20 transition-all active:scale-95"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Sıfırlanıyor...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>{resetType === 'zero_quantities' ? 'Stokları 0 Yap' : 'Tüm Ürünleri Sil'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
