import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Package, 
  Barcode, 
  Coins, 
  Layers, 
  Tag, 
  X, 
  CheckCircle2, 
  ArrowRight, 
  AlertCircle,
  Globe,
  Plus
} from 'lucide-react';
import { GlobalProduct } from '../../lib/global-catalog';

export interface QuickRegisteredProductData {
  barcode: string;
  name: string;
  category: string;
  price: number;
  purchasePrice: number;
  stock: number;
  imageUrl?: string;
}

interface GlobalProductQuickRegisterModalProps {
  isOpen: boolean;
  barcode: string;
  globalProduct: GlobalProduct | null;
  onClose: () => void;
  onSave: (productData: QuickRegisteredProductData) => Promise<void> | void;
  actionType?: 'pos' | 'inventory';
}

const COMMON_CATEGORIES = [
  'Kırtasiye',
  'Gıda & Atıştırmalık',
  'İçecek',
  'Süt & Şarküteri',
  'Temizlik & Kişisel Bakım',
  'Fotokopi & Kağıt',
  'Ambalaj & Koli',
  'Tekstil & Giyim',
  'Kozmetik & Bakım',
  'Manav & Şarküteri',
  'Genel'
];

export const GlobalProductQuickRegisterModal: React.FC<GlobalProductQuickRegisterModalProps> = ({
  isOpen,
  barcode,
  globalProduct,
  onClose,
  onSave,
  actionType = 'pos'
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Genel');
  const [price, setPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [stock, setStock] = useState('10');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allowEditName, setAllowEditName] = useState(false);

  const priceInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (globalProduct) {
        setName(globalProduct.name || '');
        setCategory(globalProduct.category || 'Genel');
        setImageUrl(globalProduct.imageUrl || '');
        setPrice(globalProduct.suggestedPrice ? String(globalProduct.suggestedPrice) : '');
        setPurchasePrice(globalProduct.suggestedPurchasePrice ? String(globalProduct.suggestedPurchasePrice) : '');
        setStock('10');
        setAllowEditName(false);
        // Focus price directly so user doesn't have to touch name
        setTimeout(() => {
          priceInputRef.current?.focus();
          priceInputRef.current?.select();
        }, 100);
      } else {
        setName('');
        setCategory('Genel');
        setImageUrl('');
        setPrice('');
        setPurchasePrice('');
        setStock('10');
        setAllowEditName(true);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
      }
    }
  }, [isOpen, globalProduct, barcode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPrice = parseFloat(price.replace(',', '.')) || 0;
    const cleanPurchasePrice = parseFloat(purchasePrice.replace(',', '.')) || 0;
    const cleanStock = parseInt(stock, 10) || 0;

    if (!cleanName) {
      alert("Lütfen ürün adını giriniz.");
      return;
    }
    if (cleanPrice <= 0) {
      alert("Lütfen geçerli bir satış fiyatı giriniz.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        barcode: barcode.trim(),
        name: cleanName,
        category: category || 'Genel',
        price: cleanPrice,
        purchasePrice: cleanPurchasePrice,
        stock: cleanStock,
        imageUrl: imageUrl.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      console.error("Quick register error:", err);
      alert("Ürün kaydedilirken bir hata oluştu: " + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFromGlobalPool = Boolean(globalProduct && globalProduct.name);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div 
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between ${
          isFromGlobalPool ? 'bg-gradient-to-r from-blue-50 via-indigo-50/70 to-purple-50' : 'bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs ${
              isFromGlobalPool ? 'bg-blue-600 text-white shadow-blue-600/30' : 'bg-slate-800 text-white'
            }`}>
              {isFromGlobalPool ? <Sparkles className="w-5 h-5 animate-pulse" /> : <Package className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                  {isFromGlobalPool ? 'Ortak Havuzdan Otomatik Tanındı!' : 'Yeni Ürün Tanımla'}
                </h3>
                {isFromGlobalPool && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200">
                    <Globe className="w-3 h-3" />
                    <span>Ortak Havuz</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {isFromGlobalPool 
                  ? 'Ürün adı ve kategorisi hazır. Sadece kendi satış fiyatınızı ve stoğunuzu girin.' 
                  : `${barcode} barkodu için ürün detaylarını belirleyin.`}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Barcode & Info Card */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Barcode className="w-4 h-4 text-slate-500" />
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Barkod Numarası</p>
                <p className="font-mono font-black text-slate-900 text-sm tracking-wider">{barcode}</p>
              </div>
            </div>
            {isFromGlobalPool && (
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-bold border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>İsim Yazmaya Gerek Yok</span>
              </span>
            )}
          </div>

          {/* Product Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                Ürün Adı *
              </label>
              {isFromGlobalPool && !allowEditName && (
                <button
                  type="button"
                  onClick={() => setAllowEditName(true)}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  İsmi Düzenle
                </button>
              )}
            </div>

            {isFromGlobalPool && !allowEditName ? (
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/70 flex items-center justify-between">
                <span className="text-sm font-black text-slate-900">{name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Otomatik</span>
              </div>
            ) : (
              <input
                ref={nameInputRef}
                type="text"
                required
                placeholder="Örn: Eti Karam Gurme 50g"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
              Kategori
            </label>
            <div className="flex gap-2">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {COMMON_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Price & Stock Fields (HIGHLIGHTED) */}
          <div className="p-3.5 sm:p-4 bg-amber-50/40 rounded-2xl border border-amber-200/60 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-600" />
              <span>Dükkan Fiyatı & Stok Girişi</span>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sales Price */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Satış Fiyatı (₺) *
                </label>
                <div className="relative">
                  <input
                    ref={priceInputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-white border-2 border-blue-400 focus:border-blue-600 rounded-xl text-sm font-black text-slate-900 font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₺</span>
                </div>
              </div>

              {/* Purchase Price */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Alış Fiyatı (₺)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₺</span>
                </div>
              </div>

              {/* Stock Quantity */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Mevcut Stok Adedi *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    placeholder="10"
                    value={stock}
                    onChange={e => setStock(e.target.value)}
                    className="w-full pl-3 pr-12 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">Adet</span>
                </div>
              </div>
            </div>
          </div>

          {/* Global Pool Sync Notification Note */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed flex items-start gap-2">
            <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Ortak Havuz Koruması:</strong> Bu ürünü kaydettiğinizde bilgiler ortak barkod havuzuna da eklenecek, böylece gelecekte diğer kiracılar da aynı barkodu okuttuğunda ürün ismi yazmak zorunda kalmayacaktır.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {actionType === 'pos' 
                      ? 'Dükkanıma Kaydet & Sepete Ekle' 
                      : 'Dükkanıma Kaydet & Stoğa Ekle'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
