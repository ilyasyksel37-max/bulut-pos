import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, query, onSnapshot, addDoc, 
  updateDoc, deleteDoc, doc, serverTimestamp, setDoc 
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { 
  Plus, Search, Edit2, Trash2, X, AlertCircle, 
  FileSpreadsheet, Download, ScanBarcode, CheckCircle2, 
  Printer, Package, Layers, DollarSign, RotateCcw, Tag, Image as ImageIcon,
  ChevronDown, ChevronUp, Sparkles, Shirt, Palette, Scissors, Coins, Check, ArrowRight,
  Globe, Warehouse, Store
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { BarcodeScannerModal } from './scanner/BarcodeScannerModal';
import { ExcelImportModal } from './inventory/ExcelImportModal';
import { StockResetModal } from './inventory/StockResetModal';
import { BarcodePrinterModal } from './inventory/BarcodePrinterModal';
import { GlobalCatalogSyncModal } from './inventory/GlobalCatalogSyncModal';
import { isTenantFeatureEnabled, ProductVariant, isSepetayTenant } from '../lib/tenant';
import { syncStockToMarketplaces } from '../lib/marketplaceSync';
import { lookupGlobalProduct, saveToGlobalCatalog, GlobalProduct } from '../lib/global-catalog';
import { GlobalProductQuickRegisterModal, QuickRegisteredProductData } from './common/GlobalProductQuickRegisterModal';
import { getProductMagazaStok, getProductDepoStok, getProductToplamStok } from './WarehouseManagement';

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodePrinterOpen, setIsBarcodePrinterOpen] = useState(false);
  const [isGlobalSyncModalOpen, setIsGlobalSyncModalOpen] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState<any>(null);
  const [scannerTarget, setScannerTarget] = useState<'search' | 'form'>('search');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { role, tenantId, isDocInTenant, withTenant, currentTenant } = useAuth();

  // Global Products Shared Pool Quick Register Modal state
  const [globalRegisterModal, setGlobalRegisterModal] = useState<{
    isOpen: boolean;
    barcode: string;
    globalProduct: GlobalProduct | null;
  }>({
    isOpen: false,
    barcode: '',
    globalProduct: null
  });

  // Quick price change modal state
  const [isPriceChangeModalOpen, setIsPriceChangeModalOpen] = useState(false);
  const [priceChangeProduct, setPriceChangeProduct] = useState<any>(null);
  const [quickNewPrice, setQuickNewPrice] = useState<string>('');
  const [quickNewPurchasePrice, setQuickNewPurchasePrice] = useState<string>('');
  const [quickVariantPrices, setQuickVariantPrices] = useState<Record<string, number>>({});
  const [expandedProductVariants, setExpandedProductVariants] = useState<Record<string, boolean>>({});
  const [previewImageState, setPreviewImageState] = useState<{ url: string; title: string } | null>(null);

  const toggleExpandVariants = (productId: string) => {
    setExpandedProductVariants(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  const openPriceChangeModal = (product: any) => {
    setPriceChangeProduct(product);
    const pPrice = Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0);
    const purPrice = Number(product.purchasePrice ?? product.alisFiyati ?? 0);
    setQuickNewPrice(pPrice > 0 ? pPrice.toString() : '');
    setQuickNewPurchasePrice(purPrice > 0 ? purPrice.toString() : '');

    const vMap: Record<string, number> = {};
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach((v: any) => {
        vMap[v.id] = Number(v.price ?? pPrice);
      });
    }
    setQuickVariantPrices(vMap);
    setIsPriceChangeModalOpen(true);
  };

  const handleApplyMarkup = (percent: number) => {
    const cost = parseFloat(quickNewPurchasePrice.replace(',', '.')) || 0;
    if (cost > 0) {
      const target = cost * (1 + percent / 100);
      setQuickNewPrice(target.toFixed(2));
      setQuickVariantPrices(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          next[k] = parseFloat(target.toFixed(2));
        });
        return next;
      });
    }
  };

  const handleSaveQuickPrice = async () => {
    if (!priceChangeProduct) return;
    const finalPrice = parseFloat(quickNewPrice.replace(',', '.')) || 0;
    const finalPurchasePrice = parseFloat(quickNewPurchasePrice.replace(',', '.')) || 0;

    try {
      const updatedVariants = (priceChangeProduct.variants || []).map((v: any) => ({
        ...v,
        price: quickVariantPrices[v.id] !== undefined ? quickVariantPrices[v.id] : finalPrice
      }));

      await updateDoc(doc(db, 'products', priceChangeProduct.id), {
        price: finalPrice,
        satisFiyati: finalPrice,
        purchasePrice: finalPurchasePrice,
        variants: updatedVariants,
        updatedAt: serverTimestamp()
      });

      await syncStockToMarketplaces({
        id: priceChangeProduct.id,
        barcode: priceChangeProduct.barcode,
        name: priceChangeProduct.name,
        stock: Number(priceChangeProduct.stock || 0)
      }, tenantId);

      showToast(`🏷️ "${priceChangeProduct.name}" fiyatı ${finalPrice.toFixed(2)} ₺ olarak güncellendi!`);
      setIsPriceChangeModalOpen(false);
      setPriceChangeProduct(null);
    } catch (err) {
      console.error(err);
      alert('Fiyat güncellenirken hata oluştu.');
    }
  };

  const openBarcodePrinter = (product: any) => {
    setSelectedProductForBarcode({
      name: product.name,
      barcode: product.barcode,
      price: Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0)
    });
    setIsBarcodePrinterOpen(true);
  };

  const productFileInputRef = useRef<HTMLInputElement>(null);

  const handleProductImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      if (!result) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 600;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setFormData(prev => ({ ...prev, imageUrl: compressedDataUrl }));
          showToast("✅ Ürün görseli başarıyla yüklendi ve mobil uyumlu hale getirildi!");
        } else {
          setFormData(prev => ({ ...prev, imageUrl: result }));
        }
      };
      img.onerror = () => {
        // Fallback if image parsing fails
        setFormData(prev => ({ ...prev, imageUrl: result }));
      };
      img.src = result;
    };
    reader.onerror = () => {
      alert("Görsel yüklenirken hata oluştu.");
    };
    reader.readAsDataURL(file);
  };

  const [formData, setFormData] = useState<{
    name: string;
    barcode: string;
    price: string;
    purchasePrice: string;
    stock: string;
    magazaStok: string;
    depoStok: string;
    minStock: string;
    category: string;
    imageUrl: string;
    hasVariants: boolean;
    variants: ProductVariant[];
  }>({
    name: '',
    barcode: '',
    price: '',
    purchasePrice: '',
    stock: '',
    magazaStok: '',
    depoStok: '',
    minStock: '',
    category: '',
    imageUrl: '',
    hasVariants: false,
    variants: []
  });

  const [expandedVariantProductId, setExpandedVariantProductId] = useState<string | null>(null);

  const addVariantPreset = (type: 'size' | 'color' | 'shoe' | 'fabric' | 'shade' | 'haberdashery') => {
    let newItems: string[] = [];
    if (type === 'size') newItems = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    if (type === 'color') newItems = ['Siyah', 'Beyaz', 'Gri', 'Lacivert', 'Haki', 'Kırmızı'];
    if (type === 'shoe') newItems = ['36', '37', '38', '39', '40', '41', '42', '43', '44'];
    if (type === 'fabric') newItems = ['İpek', 'Medine İpeği', 'Pamuk', 'Bambu', 'Tafta', 'Şifon'];
    if (type === 'shade') newItems = ['#01 Açık', '#02 Naturel', '#03 Buğday', '#04 Bronz'];
    if (type === 'haberdashery') newItems = ['1 Metre', '2 Metre', '5 Metre', '10 Metre Rulo'];

    const parentPrice = parseFloat(formData.price.replace(',', '.')) || 0;
    const existing = [...formData.variants];
    newItems.forEach(item => {
      if (!existing.some(v => v.name === item)) {
        existing.push({
          id: `var-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          name: item,
          barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
          price: parentPrice,
          stock: 10
        });
      }
    });

    setFormData(prev => ({
      ...prev,
      hasVariants: true,
      variants: existing
    }));
  };

  const addSingleCustomVariant = () => {
    const parentPrice = parseFloat(formData.price.replace(',', '.')) || 0;
    const newVariant: ProductVariant = {
      id: `var-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: '',
      barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
      price: parentPrice,
      stock: 5
    };
    setFormData(prev => ({
      ...prev,
      hasVariants: true,
      variants: [...prev.variants, newVariant]
    }));
  };

  const updateVariantField = (id: string, field: keyof ProductVariant, value: any) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.map(v => v.id === id ? { ...v, [field]: value } : v)
    }));
  };

  const removeVariant = (id: string) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.filter(v => v.id !== id)
    }));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  useEffect(() => {
    const isSep = isSepetayTenant(tenantId);
    const map = new Map<string, any>();

    const updateCombined = () => {
      const list = Array.from(map.values()).filter(p => isDocInTenant(p));
      setProducts(list);
    };

    const unsubs: (() => void)[] = [];

    // 1. Direct subcollection listener for Sepetay: tenants/sepetay/products (NO WHERE FILTER)
    if (isSep) {
      const unsubSepetaySub = onSnapshot(collection(db, 'tenants', 'sepetay', 'products'), (snapshot) => {
        snapshot.docs.forEach(doc => {
          map.set(doc.id, { id: doc.id, tenantId: 'sepetay', tenant_id: 'sepetay', ...doc.data() });
        });
        updateCombined();
      }, (err) => {
        console.warn("tenants/sepetay/products listener warning:", err);
      });
      unsubs.push(unsubSepetaySub);
    }

    // 2. Root collections (products, urunler, stok)
    const collNames = ['products', 'urunler', 'stok'];
    collNames.forEach(cName => {
      const u = onSnapshot(collection(db, cName), (snapshot) => {
        snapshot.docs.forEach(doc => {
          map.set(doc.id, { id: doc.id, ...doc.data() });
        });
        updateCombined();
      }, (err) => {
        console.warn(`Product collection listener warning for ${cName}:`, err);
      });
      unsubs.push(u);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrice = parseFloat(formData.price.replace(',', '.')) || 0;
    const cleanPurchasePrice = parseFloat(formData.purchasePrice.replace(',', '.')) || 0;
    const cleanStock = parseInt(formData.stock, 10) || 0;
    const cleanMinStock = parseInt(formData.minStock, 10) || 5;

    // Location stock synchronization (Mağaza vs Depo)
    const cleanMagaza = formData.magazaStok !== '' ? (parseInt(formData.magazaStok, 10) || 0) : cleanStock;
    const cleanDepo = formData.depoStok !== '' ? (parseInt(formData.depoStok, 10) || 0) : 0;
    const totalCalcStock = cleanMagaza + cleanDepo;

    const totalVariantStock = formData.hasVariants && formData.variants.length > 0
      ? formData.variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0)
      : totalCalcStock;

    const isSep = isSepetayTenant(tenantId);

    const data = {
      name: formData.name.trim(),
      barcode: formData.barcode.trim(),
      price: cleanPrice,
      purchasePrice: cleanPurchasePrice,
      stock: totalVariantStock,
      stok: totalVariantStock,
      magazaStok: cleanMagaza,
      magazaStoku: cleanMagaza,
      depoStok: cleanDepo,
      depoStoku: cleanDepo,
      stokDepo: cleanDepo,
      warehouseStock: cleanDepo,
      minStock: cleanMinStock,
      category: formData.category.trim() || 'Genel',
      imageUrl: formData.imageUrl.trim() || '',
      hasVariants: Boolean(formData.hasVariants && formData.variants.length > 0),
      variants: formData.hasVariants ? formData.variants : [],
      updatedAt: serverTimestamp()
    };

    try {
      let savedId = editingProduct ? editingProduct.id : '';
      if (editingProduct) {
        await setDoc(doc(db, 'products', editingProduct.id), withTenant(data), { merge: true }).catch(() => {});
        if (isSep) {
          await setDoc(doc(db, 'tenants', 'sepetay', 'products', editingProduct.id), withTenant(data), { merge: true }).catch(() => {});
        }
        showToast(`"${formData.name}" ürünü güncellendi.`);
      } else {
        const docRef = await addDoc(collection(db, 'products'), withTenant({
          ...data,
          createdAt: serverTimestamp(),
        }));
        if (isSep) {
          await setDoc(doc(db, 'tenants', 'sepetay', 'products', docRef.id), withTenant({
            ...data,
            createdAt: serverTimestamp(),
          })).catch(() => {});
        }
        savedId = docRef.id;
        showToast(`"${formData.name}" yeni ürün olarak eklendi.`);
      }

      // Save/merge into shared global pool for other tenants
      if (data.barcode && data.name) {
        saveToGlobalCatalog({
          barcode: data.barcode,
          name: data.name,
          category: data.category,
          imageUrl: data.imageUrl,
          price: data.price,
          purchasePrice: data.purchasePrice,
          sourceTenantName: currentTenant?.name || ''
        });
      }

      // Sync stock to connected marketplaces
      await syncStockToMarketplaces({
        id: savedId,
        barcode: data.barcode,
        name: data.name,
        stock: totalVariantStock
      }, tenantId);

      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({
        name: '',
        barcode: '',
        price: '',
        purchasePrice: '',
        stock: '',
        magazaStok: '',
        depoStok: '',
        minStock: '',
        category: '',
        imageUrl: '',
        hasVariants: false,
        variants: []
      });
    } catch (e) {
      console.error(e);
      alert('Hata oluştu!');
    }
  };

  const deleteProduct = async (id: string) => {
    if (confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
      const isSep = isSepetayTenant(tenantId);
      await deleteDoc(doc(db, 'products', id)).catch(() => {});
      if (isSep) {
        await deleteDoc(doc(db, 'tenants', 'sepetay', 'products', id)).catch(() => {});
      }
      showToast('Ürün başarıyla silindi.');
    }
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    const magazaVal = product.magazaStok ?? product.magazaStoku ?? product.stock ?? product.stok ?? 0;
    const depoVal = product.depoStok ?? product.depoStoku ?? product.stokDepo ?? product.warehouseStock ?? 0;
    setFormData({
      name: product.name || '',
      barcode: product.barcode || '',
      price: (product.price ?? product.satisFiyati ?? product.fiyat ?? 0).toString(),
      purchasePrice: (product.purchasePrice ?? product.alisFiyati ?? 0).toString(),
      stock: (product.stock ?? product.miktar ?? product.adet ?? 0).toString(),
      magazaStok: magazaVal.toString(),
      depoStok: depoVal.toString(),
      minStock: (product.minStock ?? 5).toString(),
      category: product.category || 'Genel',
      imageUrl: product.imageUrl || '',
      hasVariants: Boolean(product.hasVariants || (product.variants && product.variants.length > 0)),
      variants: product.variants || []
    });
    setIsModalOpen(true);
  };

  // Export current inventory to Excel
  const handleExportToExcel = () => {
    if (products.length === 0) {
      alert("Dışa aktarılacak ürün bulunmamaktadır.");
      return;
    }

    const exportData = products.map((p, idx) => {
      const priceVal = Number(p.price ?? p.satisFiyati ?? p.fiyat ?? 0);
      const stockVal = Number(p.stock ?? p.miktar ?? p.adet ?? 0);
      const minStockVal = Number(p.minStock ?? 5);

      return {
        "Sıra": idx + 1,
        "Ürün Adı": p.name,
        "Barkod": p.barcode,
        "Kategori": p.category || 'Genel',
        "Alış Fiyatı (₺)": Number(p.purchasePrice || 0),
        "Satış Fiyatı (₺)": priceVal,
        "Mevcut Stok": stockVal,
        "Min. Stok": minStockVal,
        "Stok Durumu": (stockVal <= minStockVal) ? "KRİTİK" : "NORMAL"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 35 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stok_Listesi");
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Stok_Listesi_${dateStr}.xlsx`);
    showToast('Stok listesi Excel olarak indirildi.');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBarcodeScanned = async (barcode: string) => {
    const clean = (barcode || '').trim();
    if (!clean) return;

    if (scannerTarget === 'search') {
      const match = products.find(p => String(p.barcode || '').trim() === clean);
      if (match) {
        setSearchTerm(clean);
        showToast(`✅ "${match.name}" bulundu.`);
      } else {
        // Not in tenant's own stock -> check global_products pool
        const globalFound = await lookupGlobalProduct(clean);
        setGlobalRegisterModal({
          isOpen: true,
          barcode: clean,
          globalProduct: globalFound
        });
      }
    } else if (scannerTarget === 'form') {
      setFormData(prev => ({ ...prev, barcode: clean }));
      showToast(`Barkod forma aktarıldı: ${clean}`);

      // Auto-populate if product name is still empty
      if (!formData.name) {
        const globalFound = await lookupGlobalProduct(clean);
        if (globalFound) {
          setFormData(prev => ({
            ...prev,
            name: globalFound.name,
            category: globalFound.category || prev.category,
            imageUrl: globalFound.imageUrl || prev.imageUrl,
            price: globalFound.suggestedPrice ? String(globalFound.suggestedPrice) : prev.price,
            purchasePrice: globalFound.suggestedPurchasePrice ? String(globalFound.suggestedPurchasePrice) : prev.purchasePrice
          }));
          showToast(`✨ Ortak havuzdan "${globalFound.name}" otomatik dolduruldu!`);
        }
      }
    }
  };

  const handleSaveQuickRegisteredProduct = async (data: QuickRegisteredProductData) => {
    try {
      const newProductData = {
        name: data.name,
        barcode: data.barcode,
        price: data.price,
        purchasePrice: data.purchasePrice,
        stock: data.stock,
        minStock: 5,
        category: data.category || 'Genel',
        imageUrl: data.imageUrl || '',
        hasVariants: false,
        variants: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'products'), withTenant(newProductData));

      // Save/merge into shared global pool for all tenants
      saveToGlobalCatalog({
        barcode: data.barcode,
        name: data.name,
        category: data.category,
        imageUrl: data.imageUrl,
        price: data.price,
        purchasePrice: data.purchasePrice,
        sourceTenantName: currentTenant?.name || ''
      });

      showToast(`🎉 "${data.name}" dükkanınıza ve stoğunuza başarıyla eklendi!`);
      setSearchTerm(data.barcode);
    } catch (err: any) {
      console.error("Error saving quick registered product:", err);
      alert("Ürün kaydedilirken hata oluştu: " + (err.message || ''));
    }
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const nameMatch = (p.name || '').toLowerCase().includes(term);
    const barcodeMatch = (p.barcode || '').includes(term);
    const categoryMatch = (p.category || '').toLowerCase().includes(term);
    return nameMatch || barcodeMatch || categoryMatch;
  });

  // Inventory summary calculations
  const totalStockUnits = products.reduce((sum, p) => sum + (Number(p.stock ?? p.miktar ?? p.adet ?? 0) || 0), 0);
  const totalStockValue = products.reduce((sum, p) => {
    const pr = Number(p.price ?? p.satisFiyati ?? p.fiyat ?? 0) || 0;
    const st = Number(p.stock ?? p.miktar ?? p.adet ?? 0) || 0;
    return sum + (pr * st);
  }, 0);
  const totalPurchaseValue = products.reduce((sum, p) => {
    const pr = Number(p.purchasePrice || 0) || 0;
    const st = Number(p.stock ?? p.miktar ?? p.adet ?? 0) || 0;
    return sum + (pr * st);
  }, 0);
  const criticalStockCount = products.filter(p => {
    const st = Number(p.stock ?? p.miktar ?? p.adet ?? 0) || 0;
    const min = Number(p.minStock ?? 5);
    return st <= min;
  }).length;

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 lg:space-y-6 pb-24 lg:pb-12 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2 text-xs sm:text-sm font-semibold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Actions */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Stok & Envanter Yönetimi
              </h2>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {products.length} Çeşit Ürün
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Barkodlu stok takibi, Excel toplu yükleme/dışa aktarma ve kritik stok kontrolü.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
            title="Stok Sayım Listesini Yazdır"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Stok Yazdır</span>
          </button>

          {/* Excel Export Button */}
          <button
            onClick={handleExportToExcel}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
            title="Tüm stokları Excel olarak indir"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Excel'e Aktar</span>
          </button>

          {/* Excel Import Button */}
          {isTenantFeatureEnabled(currentTenant, 'excel_import') && (
            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
              title="Excel dosyasından toplu ürün yükle"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel ile Yükle</span>
            </button>
          )}

          {/* Reset Stocks Button */}
          {isTenantFeatureEnabled(currentTenant, 'stock_reset') && (
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
              title="Tüm stokları sıfırla veya kataloğu boşalt"
            >
              <RotateCcw className="w-4 h-4 text-red-600" />
              <span>Stokları Sıfırla</span>
            </button>
          )}

          {/* Global Catalog Sync Button */}
          <button
            onClick={() => setIsGlobalSyncModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
            title="Eski ve yeni tüm ürünleri ortak Global Havuza senkronize et"
          >
            <Globe className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Global Havuz</span>
          </button>

          {/* Add Product Button */}
          <button 
            onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Ürün Ekle</span>
          </button>
        </div>
      </header>

      {/* Inventory Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Toplam Çeşit
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{products.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Aktif ürün kartı</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Toplam Stok Adedi
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-purple-700 mt-1">
            {totalStockUnits.toLocaleString('tr-TR')} Adet
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Depodaki toplam miktar</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Envanter Satış Değeri
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
            {totalStockValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Maliyet: {totalPurchaseValue.toLocaleString('tr-TR')} ₺</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-700">
              Kritik Stok Uyarıları
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">
            {criticalStockCount} Ürün
          </p>
          <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Tükenmek üzere olan ürünler</p>
        </div>
      </div>

      {/* Search and Filter Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
        <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Ürün adı, kategori veya barkod ile hızlı ara... (Enter ile barkod tanı)"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const clean = searchTerm.trim();
                  if (!clean) return;
                  const match = products.find(p => String(p.barcode || '').trim() === clean);
                  if (match) {
                    showToast(`✅ "${match.name}" bulundu.`);
                  } else if (filteredProducts.length === 0) {
                    const globalFound = await lookupGlobalProduct(clean);
                    setGlobalRegisterModal({
                      isOpen: true,
                      barcode: clean,
                      globalProduct: globalFound
                    });
                  }
                }
              }}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Camera Search Scanner Button */}
          {isTenantFeatureEnabled(currentTenant, 'camera_scanner') && (
            <button
              onClick={() => {
                setScannerTarget('search');
                setIsScannerOpen(true);
              }}
              className="px-3.5 py-2.5 bg-white hover:bg-blue-50 hover:text-blue-600 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 active:scale-95 shadow-2xs"
              title="Kamera ile Barkod Tara ve Ara"
            >
              <ScanBarcode className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">Kamera ile Ara</span>
            </button>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wider font-bold border-b border-slate-100">
                <th className="px-6 py-4">Ürün Bilgisi / Barkod</th>
                <th className="px-6 py-4">Kategori</th>
                <th className="px-6 py-4 text-right">Satış Fiyatı</th>
                <th className="px-6 py-4">Stok Dağılımı (Mağaza / Depo / Toplam)</th>
                <th className="px-6 py-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map(product => {
                const price = Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0) || 0;
                const magazaStok = getProductMagazaStok(product);
                const depoStok = getProductDepoStok(product);
                const toplamStok = getProductToplamStok(product);
                const minStock = Number(product.minStock ?? 5);
                const isCritical = toplamStok <= minStock;
                const hasVariants = Boolean(product.hasVariants || (product.variants && product.variants.length > 0));
                const isExpanded = Boolean(expandedProductVariants[product.id]);

                return (
                  <React.Fragment key={product.id}>
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <div 
                              onClick={() => setPreviewImageState({ url: product.imageUrl, title: product.name })}
                              className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                              title="Görseli büyüt"
                            >
                              <img src={product.imageUrl} alt="" className="w-full h-full object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display = 'none';}} />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{product.name || 'İsimsiz Ürün'}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-400 font-mono">{product.barcode || 'Barkodsuz'}</span>
                              {hasVariants && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandVariants(product.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] border border-indigo-200 transition-all cursor-pointer"
                                  title="Varyantları göster / gizle"
                                >
                                  <Layers className="w-3 h-3 text-indigo-600" />
                                  <span>{product.variants?.length || 0} Varyant</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
                          {product.category || 'Genel'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-black text-slate-900 text-sm">
                          {price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                        </div>
                        {hasVariants && (
                          <span className="text-[10px] text-indigo-600 font-semibold block">Varyant bazlı fiyat</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-[11px] font-bold border border-blue-200">
                              <Store className="w-3 h-3 text-blue-600" />
                              <span>Mağaza: {magazaStok}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200">
                              <Warehouse className="w-3 h-3 text-amber-600" />
                              <span>Depo: {depoStok}</span>
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black ${
                              isCritical ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-900'
                            }`}>
                              Toplam: {toplamStok} Adet
                            </span>
                          </div>
                          {isCritical && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-bold">
                              <AlertCircle className="w-3 h-3" />
                              Kritik (Min: {minStock})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick Price Change Button */}
                          <button 
                            onClick={() => openPriceChangeModal(product)} 
                            className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors active:scale-95 border border-slate-200"
                            title="Hızlı Fiyat Değiştir"
                          >
                            <Coins className="w-4 h-4 text-amber-600" />
                          </button>

                          {isTenantFeatureEnabled(currentTenant, 'barcode') && (
                            <button 
                              onClick={() => openBarcodePrinter(product)} 
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                              title="Barkod Yazdır"
                            >
                              <Tag className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => openEdit(product)} 
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                            title="Düzenle"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteProduct(product.id)} 
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Accordion: Variants breakdown row */}
                    {isExpanded && hasVariants && product.variants && (
                      <tr className="bg-indigo-50/40 border-y border-indigo-100">
                        <td colSpan={5} className="px-8 py-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                "{product.name}" Varyant & Fiyat Listesi
                              </span>
                              <button
                                onClick={() => openPriceChangeModal(product)}
                                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1"
                              >
                                <Coins className="w-3.5 h-3.5" />
                                <span>Tüm Varyant Fiyatlarını Düzenle</span>
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                              {product.variants.map((v: any, vIdx: number) => (
                                <div key={v.id || vIdx} className="bg-white p-2.5 rounded-xl border border-indigo-200/80 shadow-2xs flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <p className="font-bold text-slate-900 text-xs truncate">{v.name || `Varyant #${vIdx + 1}`}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{v.barcode || 'Barkodsuz'}</p>
                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                                      Stok: {v.stock ?? 0}
                                    </span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-xs font-black text-indigo-900">
                                      {Number(v.price ?? price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400 text-sm">
                    Arama kriterlerine uygun ürün bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="lg:hidden divide-y divide-slate-100">
          {filteredProducts.map(product => {
            const price = Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0) || 0;
            const magazaStok = getProductMagazaStok(product);
            const depoStok = getProductDepoStok(product);
            const toplamStok = getProductToplamStok(product);
            const minStock = Number(product.minStock ?? 5);
            const isCritical = toplamStok <= minStock;
            const hasVariants = Boolean(product.hasVariants || (product.variants && product.variants.length > 0));
            const isExpanded = Boolean(expandedProductVariants[product.id]);

            return (
              <div key={product.id} className="p-3.5 sm:p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {product.imageUrl ? (
                      <div 
                        onClick={() => setPreviewImageState({ url: product.imageUrl, title: product.name })}
                        className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                        title="Görseli büyüt"
                      >
                        <img src={product.imageUrl} alt="" className="w-full h-full object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display = 'none';}} />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-sm truncate">{product.name || 'İsimsiz Ürün'}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs">
                        <span className="text-slate-400 font-mono">{product.barcode || 'Barkodsuz'}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-600">{product.category || 'Genel'}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-slate-900 font-black text-sm">
                          {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                          Mağaza: {magazaStok}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                          Depo: {depoStok}
                        </span>
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-md",
                          isCritical ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-800"
                        )}>
                          Toplam: {toplamStok} Adet {isCritical ? '(Kritik)' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => openPriceChangeModal(product)} 
                      className="p-2 text-amber-600 bg-amber-50 active:bg-amber-100 rounded-xl border border-amber-200" 
                      title="Fiyat Değiştir"
                    >
                      <Coins className="w-4 h-4" />
                    </button>
                    {isTenantFeatureEnabled(currentTenant, 'barcode') && (
                      <button onClick={() => openBarcodePrinter(product)} className="p-2 text-slate-500 active:text-emerald-600 bg-slate-100 rounded-xl">
                        <Tag className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => openEdit(product)} className="p-2 text-slate-500 active:text-blue-600 bg-slate-100 rounded-xl">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteProduct(product.id)} className="p-2 text-slate-500 active:text-red-600 bg-slate-100 rounded-xl">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {hasVariants && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => toggleExpandVariants(product.id)}
                      className="w-full py-1.5 px-3 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center justify-between border border-indigo-200/80"
                    >
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        {product.variants?.length || 0} Varyant & Fiyatlar
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {isExpanded && product.variants && (
                      <div className="mt-2 grid grid-cols-2 gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                        {product.variants.map((v: any, idx: number) => (
                          <div key={v.id || idx} className="bg-white p-2 rounded-lg border border-slate-200 text-xs">
                            <p className="font-bold text-slate-800 truncate">{v.name}</p>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-[10px] text-slate-500">Stok: {v.stock}</span>
                              <span className="font-black text-indigo-900">{v.price} ₺</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              Arama kriterlerine uygun ürün bulunamadı.
            </div>
          )}
        </div>
      </div>

      {/* Manual Product Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">Temel ürün bilgileri, fiyatlandırma ve varyant seçenekleri</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 flex-1">
              {/* Product Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ürün Adı *</label>
                <input 
                  required 
                  type="text" 
                  placeholder="Örn: Medine İpeği Şal veya Polo Yaka Tişört" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold" 
                />
              </div>

              {/* Barcode & Scanner */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Barkod Numarası *</label>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const randomBarcode = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
                        setFormData({...formData, barcode: randomBarcode});
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-xs font-bold flex items-center gap-1"
                    >
                      <span>Barkod Oluştur</span>
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTarget('form');
                        setIsScannerOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-700 text-xs font-bold flex items-center gap-1"
                    >
                      <ScanBarcode className="w-3.5 h-3.5" />
                      <span>Kamerayla Oku</span>
                    </button>
                  </div>
                </div>
                <input 
                  required 
                  type="text" 
                  placeholder="8690826010015" 
                  value={formData.barcode} 
                  onChange={e => setFormData({...formData, barcode: e.target.value})}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val && !formData.name.trim()) {
                      const globalFound = await lookupGlobalProduct(val);
                      if (globalFound) {
                        setFormData(prev => ({
                          ...prev,
                          name: globalFound.name,
                          category: globalFound.category || prev.category,
                          imageUrl: globalFound.imageUrl || prev.imageUrl,
                          price: globalFound.suggestedPrice ? String(globalFound.suggestedPrice) : prev.price,
                          purchasePrice: globalFound.suggestedPurchasePrice ? String(globalFound.suggestedPurchasePrice) : prev.purchasePrice
                        }));
                        showToast(`✨ Ortak havuzdan "${globalFound.name}" otomatik getirildi!`);
                      }
                    }
                  }} 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                />
              </div>

              {/* Prices and Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Alış Fiyatı (₺)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={formData.purchasePrice} 
                    onChange={e => setFormData({...formData, purchasePrice: e.target.value})} 
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Satış Fiyatı (₺) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={formData.price} 
                    onChange={e => setFormData({...formData, price: e.target.value})} 
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
                    <span>🏬 Mağaza Stoku (Adet)</span>
                    <span className="text-[10px] text-slate-400 font-normal lowercase">(isteğe bağlı, varsayılan: 0)</span>
                  </label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="0" 
                    disabled={formData.hasVariants && formData.variants.length > 0}
                    value={formData.hasVariants && formData.variants.length > 0 
                      ? formData.variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0)
                      : (formData.magazaStok !== '' ? formData.magazaStok : formData.stock)
                    } 
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(prev => ({
                        ...prev, 
                        magazaStok: val,
                        stock: val
                      }));
                    }} 
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formData.hasVariants && formData.variants.length > 0 
                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 cursor-not-allowed'
                        : 'bg-blue-50/60 border border-blue-200 text-blue-900'
                    }`}
                  />
                </div>
              </div>

              {/* Depo Yönetimi & Çoklu Lokasyon Stok Ayrımı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-bold text-indigo-900 uppercase mb-1 flex items-center gap-1.5">
                    <Warehouse className="w-3.5 h-3.5 text-indigo-600" />
                    <span>📦 Depo Stoku (Adet)</span>
                  </label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="0" 
                    value={formData.depoStok} 
                    onChange={e => setFormData(prev => ({ ...prev, depoStok: e.target.value }))} 
                    className="w-full px-3.5 py-2.5 bg-white border border-indigo-200 rounded-xl text-xs sm:text-sm font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Depo sekmesinde görüntülenecek ve transfere hazır stok</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Toplam Stok (Mağaza + Depo)
                  </label>
                  <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-black text-slate-900 flex items-center justify-between">
                    <span className="text-slate-500 font-semibold text-xs">Hesaplanan Toplam:</span>
                    <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                      {((parseInt(formData.magazaStok || formData.stock || '0', 10) || 0) + (parseInt(formData.depoStok || '0', 10) || 0))} Adet
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">Stok ve Kasa ekranlarında anında güncellenir</p>
                </div>
              </div>

              {/* Min Stock & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kritik Stok Uyarısı</label>
                  <input 
                    required 
                    type="number" 
                    placeholder="5" 
                    value={formData.minStock} 
                    onChange={e => setFormData({...formData, minStock: e.target.value})} 
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kategori</label>
                  <input 
                    type="text" 
                    placeholder="Tekstil, Kırtasiye, Kozmetik vb." 
                    value={formData.category} 
                    onChange={e => setFormData({...formData, category: e.target.value})} 
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
              </div>

              {/* Product Image */}
              {isTenantFeatureEnabled(currentTenant, 'product_image') && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Ürün Görseli (Opsiyonel)</label>
                    <button
                      type="button"
                      onClick={() => productFileInputRef.current?.click()}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Cihazdan Seç / Yükle</span>
                    </button>
                    <input
                      type="file"
                      ref={productFileInputRef}
                      onChange={handleProductImageFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="url" 
                      placeholder="https://... veya cihazdan görsel seçin" 
                      value={formData.imageUrl} 
                      onChange={e => setFormData({...formData, imageUrl: e.target.value})} 
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    />
                    {formData.imageUrl && (
                      <div 
                        onClick={() => setPreviewImageState({ url: formData.imageUrl, title: formData.name || 'Ürün Görseli' })}
                        className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center relative group cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                        title="Büyük ekranda aç"
                      >
                        <img src={formData.imageUrl} alt="" className="w-full h-full object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display = 'none';}} />
                        <div className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold">
                          Büyüt
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* VARYANT EKLEME VE YÖNETİMİ (SEKTÖREL ALANLAR İLE ENTEGRE) */}
              {/* ========================================================================= */}
              <div className="pt-2 border-t border-slate-100">
                <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                          Varyant & Fiyatlandırma Yönetimi
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          Beden, renk, kumaş türü veya ton bazlı farklı fiyat ve barkod tanımlayın
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.hasVariants} 
                        onChange={e => {
                          const checked = e.target.checked;
                          setFormData(prev => ({
                            ...prev,
                            hasVariants: checked,
                            variants: checked && prev.variants.length === 0 
                              ? [{
                                  id: `var-${Date.now()}`,
                                  name: 'Standart / M',
                                  barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
                                  price: parseFloat(prev.price.replace(',', '.')) || 0,
                                  stock: 10
                                }]
                              : prev.variants
                          }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {formData.hasVariants && (
                    <div className="space-y-3 pt-2">
                      {/* Sektörel Hızlı Varyant Ekleme Şablonları */}
                      <div>
                        <span className="block text-[10px] font-black uppercase text-indigo-900 tracking-wider mb-1.5">
                          Hızlı Sektörel Varyant Paketleri Ekle:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => addVariantPreset('size')}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                          >
                            <Shirt className="w-3.5 h-3.5 text-indigo-600" />
                            <span>👕 Bedenler (XS-XXL)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => addVariantPreset('color')}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                          >
                            <Palette className="w-3.5 h-3.5 text-pink-600" />
                            <span>🎨 Renkler</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => addVariantPreset('fabric')}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                            <span>🧣 Kumaş (Eşarp/Şal)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => addVariantPreset('shade')}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>💄 Ton / Numara (Kozmetik)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => addVariantPreset('shoe')}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                          >
                            <span>👟 Ayakkabı (36-44)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => addVariantPreset('haberdashery')}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                          >
                            <Scissors className="w-3.5 h-3.5 text-emerald-600" />
                            <span>✂️ Metraj (Tuhafiye)</span>
                          </button>

                          <button
                            type="button"
                            onClick={addSingleCustomVariant}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all ml-auto"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Özel Varyant Ekle</span>
                          </button>
                        </div>
                      </div>

                      {/* Toplu Fiyat Eşitleme Çubuğu */}
                      {formData.variants.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-white/80 p-2.5 rounded-xl border border-indigo-100 text-xs">
                          <span className="text-slate-600 font-medium">
                            {formData.variants.length} adet varyant tanımlı
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const parentPrice = parseFloat(formData.price.replace(',', '.')) || 0;
                              setFormData(prev => ({
                                ...prev,
                                variants: prev.variants.map(v => ({ ...v, price: parentPrice }))
                              }));
                              showToast(`Tüm varyant fiyatları ${parentPrice.toFixed(2)} ₺ olarak eşitlendi.`);
                            }}
                            className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1"
                          >
                            <Coins className="w-3.5 h-3.5" />
                            <span>Tüm Varyant Fiyatlarını Ana Fiyata ({formData.price || '0'} ₺) Eşitle</span>
                          </button>
                        </div>
                      )}

                      {/* Varyant Listesi Tablosu */}
                      {formData.variants.length > 0 && (
                        <div className="overflow-x-auto max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b border-slate-200 text-[10px] uppercase">
                              <tr>
                                <th className="p-2.5">Varyant Adı</th>
                                <th className="p-2.5">Barkod</th>
                                <th className="p-2.5 w-24">Fiyat (₺)</th>
                                <th className="p-2.5 w-20">Stok</th>
                                <th className="p-2.5 text-center w-10">Sil</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {formData.variants.map(v => (
                                <tr key={v.id} className="hover:bg-slate-50/70">
                                  <td className="p-2">
                                    <input 
                                      type="text" 
                                      value={v.name}
                                      placeholder="Örn: Siyah / M"
                                      onChange={e => updateVariantField(v.id, 'name', e.target.value)}
                                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:bg-white"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <div className="flex items-center gap-1">
                                      <input 
                                        type="text" 
                                        value={v.barcode}
                                        placeholder="Barkod"
                                        onChange={e => updateVariantField(v.id, 'barcode', e.target.value)}
                                        className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:bg-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const rand = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
                                          updateVariantField(v.id, 'barcode', rand);
                                        }}
                                        className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                                        title="Barkod Üret"
                                      >
                                        <Tag className="w-3.5 h-3.5 text-emerald-600" />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <input 
                                      type="number" 
                                      step="0.01"
                                      value={v.price}
                                      onChange={e => updateVariantField(v.id, 'price', parseFloat(e.target.value) || 0)}
                                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black text-slate-900 focus:bg-white text-right"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input 
                                      type="number" 
                                      value={v.stock}
                                      onChange={e => updateVariantField(v.id, 'stock', parseInt(e.target.value, 10) || 0)}
                                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-blue-600 focus:bg-white text-right"
                                    />
                                  </td>
                                  <td className="p-2 text-center">
                                    <button 
                                      type="button"
                                      onClick={() => removeVariant(v.id)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl"
                >
                  İptal
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
                >
                  {editingProduct ? 'Değişiklikleri Kaydet' : 'Ürünü Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK PRICE CHANGE MODAL (HIZLI FİYAT DEĞİŞTİRME) */}
      {/* ========================================================================= */}
      {isPriceChangeModalOpen && priceChangeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Hızlı Fiyat Değiştir
                  </h3>
                  <p className="text-xs text-slate-500 font-medium truncate max-w-xs">
                    {priceChangeProduct.name} ({priceChangeProduct.barcode || 'Barkodsuz'})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsPriceChangeModalOpen(false);
                  setPriceChangeProduct(null);
                }} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Product Mini Header */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Mevcut Durum</span>
                  <p className="text-xs font-black text-slate-800">{priceChangeProduct.category || 'Genel'}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Mevcut Satış Fiyatı</span>
                  <p className="text-sm font-black text-emerald-700">
                    {Number(priceChangeProduct.price ?? priceChangeProduct.satisFiyati ?? 0).toFixed(2)} ₺
                  </p>
                </div>
              </div>

              {/* Purchase & Sale Price Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">
                    Alış / Maliyet (₺)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={quickNewPurchasePrice}
                    onChange={e => setQuickNewPurchasePrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1">
                    Yeni Satış Fiyatı (₺) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={quickNewPrice}
                    onChange={e => setQuickNewPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-amber-50/50 border border-amber-300 rounded-xl text-sm font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Fast Markup Preset Buttons */}
              <div>
                <span className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                  Maliyete Göre Hızlı Kar Marjı Uygula:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[15, 25, 35, 50, 100].map(percent => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => handleApplyMarkup(percent)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-700 text-xs font-bold transition-all active:scale-95"
                    >
                      +{percent}% Kar
                    </button>
                  ))}
                </div>
              </div>

              {/* Variants Price List (If product has variants) */}
              {priceChangeProduct.variants && priceChangeProduct.variants.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-800">
                      Varyant Fiyatlarını Ayarla ({priceChangeProduct.variants.length} Varyant)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const target = parseFloat(quickNewPrice.replace(',', '.')) || 0;
                        const next: Record<string, number> = {};
                        priceChangeProduct.variants.forEach((v: any) => {
                          next[v.id] = target;
                        });
                        setQuickVariantPrices(next);
                        showToast(`Tüm varyantlar ${target.toFixed(2)} ₺ olarak eşitlendi.`);
                      }}
                      className="text-[11px] text-indigo-700 font-bold hover:underline"
                    >
                      Tüm Varyantları Bu Fiyata Eşitle
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {priceChangeProduct.variants.map((v: any, idx: number) => (
                      <div key={v.id || idx} className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate">{v.name || `Varyant #${idx + 1}`}</p>
                          <span className="text-[10px] text-slate-400 font-mono">Stok: {v.stock}</span>
                        </div>
                        <div className="w-28">
                          <input
                            type="number"
                            step="0.01"
                            value={quickVariantPrices[v.id] !== undefined ? quickVariantPrices[v.id] : ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setQuickVariantPrices(prev => ({ ...prev, [v.id]: val }));
                            }}
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsPriceChangeModalOpen(false);
                  setPriceChangeProduct(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSaveQuickPrice}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Fiyatı Güncelle & Kaydet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Toplu Ürün Yükleme Modalı */}
      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onSuccess={(count) => {
          showToast(`🎉 ${count} adet ürün Excel'den başarıyla yüklendi!`);
        }}
      />

      {/* 4K Full HD Barcode Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
        onAddNewProduct={async (barcode) => {
          setIsScannerOpen(false);
          const globalFound = await lookupGlobalProduct(barcode);
          setGlobalRegisterModal({
            isOpen: true,
            barcode: barcode,
            globalProduct: globalFound
          });
        }}
        title="Ultra Hızlı Barkod Okuyucu"
        description="Gelişmiş sürekli otomatik odaklama & yüksek hızlı barkod tarama"
        continuous={false}
      />

      {/* Global Product Smart Quick Register Modal */}
      <GlobalProductQuickRegisterModal
        isOpen={globalRegisterModal.isOpen}
        barcode={globalRegisterModal.barcode}
        globalProduct={globalRegisterModal.globalProduct}
        onClose={() => setGlobalRegisterModal(prev => ({ ...prev, isOpen: false }))}
        onSave={handleSaveQuickRegisteredProduct}
        actionType="inventory"
      />

      {/* Stock Reset Modal */}
      <StockResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        productsCount={products.length}
        onSuccess={(msg) => {
          showToast(msg);
        }}
      />

      {/* Barcode Printer Modal */}
      <BarcodePrinterModal
        isOpen={isBarcodePrinterOpen}
        onClose={() => setIsBarcodePrinterOpen(false)}
        product={selectedProductForBarcode}
      />

      {/* Global Catalog Sync Modal */}
      <GlobalCatalogSyncModal
        isOpen={isGlobalSyncModalOpen}
        onClose={() => setIsGlobalSyncModalOpen(false)}
        onSuccess={(res) => {
          showToast(`🌍 ${res.syncedCount} adet ürün başarıyla Global Havuza aktarıldı!`);
        }}
      />

      {/* Image Lightbox Modal */}
      {previewImageState && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
          onClick={() => setPreviewImageState(null)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[90vh] bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
              <h3 className="text-white font-bold text-sm sm:text-base truncate pr-4">
                {previewImageState.title}
              </h3>
              <button
                onClick={() => setPreviewImageState(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-8 flex items-center justify-center overflow-auto flex-1 bg-black/40">
              <img 
                src={previewImageState.url} 
                alt={previewImageState.title}
                className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-lg border border-slate-800"
              />
            </div>
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span>Mobil, Tablet ve PC Uyumlu Önizleme</span>
              <button
                onClick={() => setPreviewImageState(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
