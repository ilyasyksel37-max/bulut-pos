import React, { useState, useEffect } from 'react';
import { 
  collection, query, onSnapshot, addDoc, 
  updateDoc, deleteDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { 
  Plus, Search, Edit2, Trash2, X, AlertCircle, 
  FileSpreadsheet, Download, ScanBarcode, CheckCircle2, 
  Printer, Package, Layers, DollarSign, RotateCcw, Tag 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { BarcodeScannerModal } from './scanner/BarcodeScannerModal';
import { ExcelImportModal } from './inventory/ExcelImportModal';
import { StockResetModal } from './inventory/StockResetModal';
import { BarcodePrinterModal } from './inventory/BarcodePrinterModal';

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodePrinterOpen, setIsBarcodePrinterOpen] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState<any>(null);
  const [scannerTarget, setScannerTarget] = useState<'search' | 'form'>('search');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { role } = useAuth();

  // ... (rest of state and effects)

  const openBarcodePrinter = (product: any) => {
    setSelectedProductForBarcode({
      name: product.name,
      barcode: product.barcode,
      price: Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0)
    });
    setIsBarcodePrinterOpen(true);
  };

  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    price: '',
    purchasePrice: '',
    stock: '',
    minStock: '',
    category: ''
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrice = parseFloat(formData.price.replace(',', '.')) || 0;
    const cleanPurchasePrice = parseFloat(formData.purchasePrice.replace(',', '.')) || 0;
    const cleanStock = parseInt(formData.stock, 10) || 0;
    const cleanMinStock = parseInt(formData.minStock, 10) || 5;

    const data = {
      name: formData.name.trim(),
      barcode: formData.barcode.trim(),
      price: cleanPrice,
      purchasePrice: cleanPurchasePrice,
      stock: cleanStock,
      minStock: cleanMinStock,
      category: formData.category.trim() || 'Genel',
      updatedAt: serverTimestamp()
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), data);
        showToast(`"${formData.name}" ürünü güncellendi.`);
      } else {
        await addDoc(collection(db, 'products'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        showToast(`"${formData.name}" yeni ürün olarak eklendi.`);
      }
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', barcode: '', price: '', purchasePrice: '', stock: '', minStock: '', category: '' });
    } catch (e) {
      console.error(e);
      alert('Hata oluştu!');
    }
  };

  const deleteProduct = async (id: string) => {
    if (confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
      await deleteDoc(doc(db, 'products', id));
      showToast('Ürün başarıyla silindi.');
    }
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      barcode: product.barcode || '',
      price: (product.price ?? product.satisFiyati ?? product.fiyat ?? 0).toString(),
      purchasePrice: (product.purchasePrice ?? product.alisFiyati ?? 0).toString(),
      stock: (product.stock ?? product.miktar ?? product.adet ?? 0).toString(),
      minStock: (product.minStock ?? 5).toString(),
      category: product.category || 'Genel'
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

  const handleBarcodeScanned = (barcode: string) => {
    if (scannerTarget === 'search') {
      setSearchTerm(barcode);
      showToast(`Barkod arandı: ${barcode}`);
    } else if (scannerTarget === 'form') {
      setFormData(prev => ({ ...prev, barcode }));
      showToast(`Barkod forma aktarıldı: ${barcode}`);
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
          <img 
            src="/logo.jpg" 
            alt="Logo" 
            className="w-10 h-10 rounded-lg object-cover shadow-sm border border-slate-100 hidden lg:block"
            referrerPolicy="no-referrer"
          />
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
          <button
            onClick={() => setIsExcelModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
            title="Excel dosyasından toplu ürün yükle"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel ile Yükle</span>
          </button>

          {/* Reset Stocks Button */}
          <button
            onClick={() => setIsResetModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
            title="Tüm stokları sıfırla veya kataloğu boşalt"
          >
            <RotateCcw className="w-4 h-4 text-red-600" />
            <span>Stokları Sıfırla</span>
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
              placeholder="Ürün adı, kategori veya barkod ile hızlı ara..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wider font-bold border-b border-slate-100">
                <th className="px-6 py-4">Ürün Bilgisi / Barkod</th>
                <th className="px-6 py-4">Kategori</th>
                <th className="px-6 py-4 text-right">Satış Fiyatı</th>
                <th className="px-6 py-4">Mevcut Stok</th>
                <th className="px-6 py-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map(product => {
                const price = Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0) || 0;
                const stock = Number(product.stock ?? product.miktar ?? product.adet ?? 0) || 0;
                const minStock = Number(product.minStock ?? 5);
                const isCritical = stock <= minStock;

                return (
                  <tr key={product.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900 text-sm">{product.name || 'İsimsiz Ürün'}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{product.barcode || 'Barkodsuz'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
                        {product.category || 'Genel'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-black text-slate-900 text-right text-sm">
                      {price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${isCritical ? 'text-red-600' : 'text-emerald-700'}`}>
                          {stock} Adet
                        </span>
                        {isCritical && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                            <AlertCircle className="w-3 h-3" />
                            Kritik (Min: {minStock})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => openBarcodePrinter(product)} 
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                          title="Barkod Yazdır"
                        >
                          <Tag className="w-4 h-4" />
                        </button>
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
            const stock = Number(product.stock ?? product.miktar ?? product.adet ?? 0) || 0;
            const minStock = Number(product.minStock ?? 5);
            const isCritical = stock <= minStock;

            return (
              <div key={product.id} className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-sm truncate">{product.name || 'İsimsiz Ürün'}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <span className="text-slate-400 font-mono">{product.barcode || 'Barkodsuz'}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">{product.category || 'Genel'}</span>
                  </div>
                  <div className="flex items-center gap-2.5 mt-2">
                    <span className="text-slate-900 font-black text-sm">
                      {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                    <span className={cn(
                      "text-[11px] font-bold px-2 py-0.5 rounded-lg",
                      isCritical ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                    )}>
                      {stock} Adet {isCritical ? '(Kritik)' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openBarcodePrinter(product)} className="p-2 text-slate-500 active:text-emerald-600 bg-slate-100 rounded-xl">
                    <Tag className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(product)} className="p-2 text-slate-500 active:text-blue-600 bg-slate-100 rounded-xl">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteProduct(product.id)} className="p-2 text-slate-500 active:text-red-600 bg-slate-100 rounded-xl">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ürün Adı *</label>
                <input 
                  required 
                  type="text" 
                  placeholder="Örn: Faber-Castell Kurşun Kalem" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Barkod Numarası *</label>
                  <button
                    type="button"
                    onClick={() => {
                      const randomBarcode = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
                      setFormData({...formData, barcode: randomBarcode});
                    }}
                    className="text-emerald-600 hover:text-emerald-700 text-xs font-bold flex items-center gap-1 ml-auto mr-3"
                  >
                    <span>Barkod Oluştur</span>
                  </button>
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
                <input 
                  required 
                  type="text" 
                  placeholder="8690826010015" 
                  value={formData.barcode} 
                  onChange={e => setFormData({...formData, barcode: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Alış Fiyatı (₺)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={formData.purchasePrice} 
                    onChange={e => setFormData({...formData, purchasePrice: e.target.value})} 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Mevcut Stok *</label>
                  <input 
                    required 
                    type="number" 
                    placeholder="0" 
                    value={formData.stock} 
                    onChange={e => setFormData({...formData, stock: e.target.value})} 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kritik Stok Uyarısı</label>
                  <input 
                    required 
                    type="number" 
                    placeholder="5" 
                    value={formData.minStock} 
                    onChange={e => setFormData({...formData, minStock: e.target.value})} 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kategori</label>
                  <input 
                    type="text" 
                    placeholder="Kalemler, Kağıt vb." 
                    value={formData.category} 
                    onChange={e => setFormData({...formData, category: e.target.value})} 
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl"
                >
                  İptal
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
                >
                  {editingProduct ? 'Değişiklikleri Kaydet' : 'Ürünü Ekle'}
                </button>
              </div>
            </form>
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

      {/* Barcode Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="Barkod Okuyucu"
        description="Ürünün barkodunu kameraya tutun veya fotoğrafını seçin"
        continuous={false}
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
    </div>
  );
};

export default Inventory;
