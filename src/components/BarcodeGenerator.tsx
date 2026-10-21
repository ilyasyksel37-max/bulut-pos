import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Barcode, Printer, Search, Package, CheckCircle2, Sliders, RefreshCw } from 'lucide-react';
import { isDocInTenant } from '../lib/tenant';

export const BarcodeGenerator: React.FC = () => {
  const { tenantId } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [labelCount, setLabelCount] = useState(1);
  const [printerType, setPrinterType] = useState<'thermal_58' | 'thermal_80' | 'a4_sheet'>('thermal_58');
  const [showPriceOnLabel, setShowPriceOnLabel] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      let list: any[] = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(i => isDocInTenant(i, tenantId));
      
      if (list.length === 0) {
        // Fallback demo products so Barcode Generator is never empty
        list = [
          { id: 'demo-1', name: 'Kurşun Kalem 2B', barcode: '8690826010015', salePrice: 15.00, stock: 250 },
          { id: 'demo-2', name: 'Silgi (Yumuşak)', barcode: '8690826010022', salePrice: 10.00, stock: 120 },
          { id: 'demo-3', name: 'Defter A5 96 Yaprak', barcode: '8690826010039', salePrice: 45.00, stock: 85 }
        ];
      }

      setInventory(list);
      if (list.length > 0 && !selectedProduct) {
        setSelectedProduct(list[0]);
      }
    }, (err) => {
      console.warn("Products error:", err);
      // Fallback on error
      const fallbackList: any[] = [
        { id: 'demo-1', name: 'Kurşun Kalem 2B', barcode: '8690826010015', salePrice: 15.00, stock: 250 },
        { id: 'demo-2', name: 'Silgi (Yumuşak)', barcode: '8690826010022', salePrice: 10.00, stock: 120 },
        { id: 'demo-3', name: 'Defter A5 96 Yaprak', barcode: '8690826010039', salePrice: 45.00, stock: 85 }
      ];
      setInventory(fallbackList);
      if (!selectedProduct) setSelectedProduct(fallbackList[0]);
    });
    return () => unsub();
  }, [tenantId]);

  const filteredInventory = inventory.filter(i => 
    (i.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.barcode || '').includes(searchTerm)
  );

  const handlePrint = () => {
    if (!selectedProduct) {
      alert("Lütfen yazdırmak için bir ürün seçin.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Lütfen tarayıcınızın açılır pencere (popup) engelleyicisini kapatın.");
      return;
    }

    const labelsHtml = Array.from({ length: labelCount }).map(() => `
      <div class="label-item">
        <div class="product-name">${selectedProduct.name}</div>
        ${showPriceOnLabel ? `<div class="product-price">₺${Number(selectedProduct.salePrice || selectedProduct.price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>` : ''}
        <div class="barcode-lines">||| | || || ||| || |||</div>
        <div class="barcode-text">${selectedProduct.barcode || '8690000123456'}</div>
      </div>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8">
        <title>Barkod Etiketleri - ${selectedProduct.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 10px; background: #fff; color: #000; }
          .labels-container {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: flex-start;
          }
          .label-item {
            width: ${printerType === 'thermal_58' ? '50mm' : printerType === 'thermal_80' ? '72mm' : '60mm'};
            padding: 8px;
            border: 1px dashed #666;
            text-align: center;
            box-sizing: border-box;
            page-break-inside: avoid;
            margin-bottom: 10px;
            background: #fff;
          }
          .product-name {
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .product-price {
            font-size: 14px;
            font-weight: 900;
            margin-bottom: 4px;
          }
          .barcode-lines {
            font-family: monospace;
            font-size: 18px;
            letter-spacing: 2px;
            font-weight: bold;
            margin: 4px 0;
          }
          .barcode-text {
            font-family: monospace;
            font-size: 10px;
            letter-spacing: 1px;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="labels-container">
          ${labelsHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 rounded-3xl text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
            <Barcode className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Barkod Oluşturma & Yazdırma</h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-0.5">Ürünleriniz için barkod etiketleri oluşturun ve yazıcı ayarlarını yapılandırın.</p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Printer className="w-5 h-5" />
          <span>Etiketleri Yazdır</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Product Selection */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <span>Ürün Seçin</span>
          </h3>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Stok adı veya barkod ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {filteredInventory.map(prod => (
              <button
                key={prod.id}
                onClick={() => setSelectedProduct(prod)}
                className={`w-full p-3 text-left rounded-xl transition-all flex items-center justify-between ${
                  selectedProduct?.id === prod.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'
                }`}
              >
                <div>
                  <p className="font-bold text-slate-900 text-xs">{prod.name}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">Barkod: {prod.barcode || 'Yok'}</p>
                </div>
                <span className="font-mono font-bold text-blue-600 text-xs">₺{Number(prod.salePrice || prod.price || 0).toLocaleString('tr-TR')}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Middle: Configuration */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
          <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-600" />
            <span>Yazıcı & Etiket Ayarları</span>
          </h3>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-black uppercase text-slate-700 mb-1.5">Yazıcı Tipi</label>
              <select
                value={printerType}
                onChange={e => setPrinterType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              >
                <option value="thermal_58">Termal Fiş Yazıcı (58mm)</option>
                <option value="thermal_80">Termal Barkod Yazıcı (80mm)</option>
                <option value="a4_sheet">A4 Tabaka Etiket Kağıdı</option>
              </select>
            </div>

            <div>
              <label className="block font-black uppercase text-slate-700 mb-1.5">Yazdırılacak Etiket Adedi</label>
              <input
                type="number"
                min="1"
                max="100"
                value={labelCount}
                onChange={e => setLabelCount(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="showPrice"
                checked={showPriceOnLabel}
                onChange={e => setShowPriceOnLabel(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300"
              />
              <label htmlFor="showPrice" className="font-bold text-slate-800">Etiket Üzerinde Fiyatı Göster</label>
            </div>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 shadow-inner flex flex-col items-center justify-center space-y-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Etiket Önizleme</p>

          {selectedProduct ? (
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200 w-64 text-center space-y-3">
              <p className="font-bold text-xs text-slate-900 uppercase truncate">{selectedProduct.name}</p>
              
              {/* Simulated Barcode */}
              <div className="py-2 bg-slate-50 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center space-y-1">
                <div className="font-mono tracking-widest text-lg font-black text-slate-900">
                  ||| | || || ||| || |||
                </div>
                <p className="font-mono text-[11px] text-slate-600">{selectedProduct.barcode || '8690000123456'}</p>
              </div>

              {showPriceOnLabel && (
                <p className="text-lg font-black text-blue-600 font-mono">
                  ₺{Number(selectedProduct.salePrice || selectedProduct.price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Önizleme için soldan ürün seçin.</p>
          )}

          <p className="text-[10px] text-slate-400 text-center">
            Yukarıdaki ayarlara göre {labelCount} adet etiket yazdırılacaktır.
          </p>
        </div>
      </div>
    </div>
  );
};
