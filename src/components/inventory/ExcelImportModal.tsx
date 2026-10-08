import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, FileSpreadsheet, Download, UploadCloud, CheckCircle2, 
  AlertTriangle, ArrowRight, RefreshCw, Layers, Check, Edit3 
} from 'lucide-react';
import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export interface ParsedProductItem {
  id?: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  stock: number;
  minStock: number;
  isValid: boolean;
  errors: string[];
}

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

// Clean and normalize column names
const normalizeKey = (key: string): string => {
  return String(key || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_\-\.\/\\]+/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
};

// Robust number parser for Turkish and international formats
const parseNumberRobust = (val: unknown, fallback: number = 0): number => {
  if (typeof val === 'number') {
    return isNaN(val) ? fallback : val;
  }
  if (val === null || val === undefined) return fallback;

  let str = String(val).trim();
  // Remove non-numeric chars except digits, comma, period, minus
  str = str.replace(/[^\d.,\-]/g, '');
  if (!str) return fallback;

  // Handle both thousand & decimal separators
  if (str.includes('.') && str.includes(',')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      // Turkish "1.250,50" -> "1250.50"
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // English "1,250.50" -> "1250.50"
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // "15,50" -> "15.50"
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return isNaN(num) ? fallback : num;
};

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [parsedProducts, setParsedProducts] = useState<ParsedProductItem[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Download formatted Excel Template (.xlsx)
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Ürün Adı": "Faber-Castell 2B Kurşun Kalem",
        "Barkod": "8690826010015",
        "Kategori": "Kalemler",
        "Satış Fiyatı": 15.00,
        "Mevcut Stok": 150,
        "Kritik Stok": 20
      },
      {
        "Ürün Adı": "A4 Fotokopi Kağıdı 80gr 500'lü Paket",
        "Barkod": "8691234567890",
        "Kategori": "Kağıt Ürünleri",
        "Satış Fiyatı": 185.00,
        "Mevcut Stok": 50,
        "Kritik Stok": 10
      },
      {
        "Ürün Adı": "Pritt Stick Yapıştırıcı 22g",
        "Barkod": "4015000412345",
        "Kategori": "Yapıştırıcılar",
        "Satış Fiyatı": 45.00,
        "Mevcut Stok": 60,
        "Kritik Stok": 15
      },
      {
        "Ürün Adı": "Rotring Tikky 0.7 Versatil Kalem",
        "Barkod": "4006856001234",
        "Kategori": "Kalemler",
        "Satış Fiyatı": 120.00,
        "Mevcut Stok": 35,
        "Kritik Stok": 5
      },
      {
        "Ürün Adı": "Gıpta Spiralli A4 Kareli Defter 96 Yaprak",
        "Barkod": "8697412589632",
        "Kategori": "Defterler",
        "Satış Fiyatı": 65.00,
        "Mevcut Stok": 80,
        "Kritik Stok": 15
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 40 }, // Ürün Adı
      { wch: 20 }, // Barkod
      { wch: 18 }, // Kategori
      { wch: 15 }, // Satış Fiyatı
      { wch: 14 }, // Mevcut Stok
      { wch: 14 }, // Kritik Stok
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Urun_Listesi");
    XLSX.writeFile(workbook, "Urun_Yukleme_Sablonu.xlsx");
  };

  // 2. Parse uploaded File
  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!rawJson || rawJson.length === 0) {
          alert("Yüklenen Excel dosyasında ürün satırı bulunamadı.");
          return;
        }

        // Comprehensive column alias mappings in Turkish and English
        const nameAliases = [
          'urunadi', 'urun', 'malincinsi', 'stokadi', 'stokkarti', 
          'tanim', 'aciklama', 'name', 'title', 'item', 'malzeme', 'adi'
        ];
        const barcodeAliases = [
          'barkod', 'barkodu', 'barkodno', 'kod', 'kodu', 'stokkodu', 
          'barcode', 'ean', 'ean13', 'upc', 'code'
        ];
        const priceAliases = [
          'satisfiyati', 'fiyat', 'fiyati', 'satis', 'perakendefiyati', 
          'perakende', 'birimfiyat', 'kdvdahil', 'tutar', 'price', 'rate', 'satis_fiyati', 'etiketfiyati'
        ];
        const stockAliases = [
          'stok', 'mevcutstok', 'stokmiktari', 'mevcut', 'bakiye', 
          'kalan', 'miktar', 'miktari', 'adet', 'stock', 'qty', 'quantity', 'balance'
        ];
        const minStockAliases = [
          'minstok', 'kritikstok', 'minimumstok', 'kritik', 
          'alarm', 'asgari', 'minstock', 'enazstok'
        ];
        const categoryAliases = [
          'kategori', 'kategorisi', 'grup', 'grubu', 'urungrubu', 
          'tur', 'turu', 'reyon', 'category', 'group'
        ];

        // Map columns dynamically
        const items: ParsedProductItem[] = rawJson.map((row, index) => {
          const rowKeys = Object.keys(row);

          const findValue = (aliases: string[]): unknown => {
            for (const key of rowKeys) {
              const normalized = normalizeKey(key);
              if (aliases.includes(normalized)) {
                return row[key];
              }
            }
            return undefined;
          };

          const rawName = findValue(nameAliases);
          const nameVal = String(rawName || "").trim();

          let rawBarcode = findValue(barcodeAliases);
          let barcodeVal = String(rawBarcode || "").trim();
          // Clean scientific notation or float barcode from Excel (e.g. 8.69E+12)
          if (barcodeVal.includes('.') || barcodeVal.includes('e') || barcodeVal.includes('E')) {
            const num = Number(rawBarcode);
            if (!isNaN(num) && num > 0) {
              barcodeVal = num.toLocaleString('fullwide', { useGrouping: false });
            }
          }

          // If no barcode provided, generate auto barcode
          if (!barcodeVal) {
            barcodeVal = `869${Date.now().toString().slice(-7)}${String(index + 1).padStart(3, '0')}`;
          }

          const rawCategory = findValue(categoryAliases);
          const categoryVal = String(rawCategory || "Genel").trim() || "Genel";

          const rawPrice = findValue(priceAliases);
          const priceVal = parseNumberRobust(rawPrice, 0);

          const rawStock = findValue(stockAliases);
          const stockVal = Math.round(parseNumberRobust(rawStock, 0));

          const rawMinStock = findValue(minStockAliases);
          const minStockVal = Math.round(parseNumberRobust(rawMinStock, 5));

          const errors: string[] = [];
          if (!nameVal) errors.push("Ürün adı boş");
          if (priceVal < 0) errors.push("Geçersiz fiyat");
          if (stockVal < 0) errors.push("Geçersiz stok");

          return {
            name: nameVal || `Ürün #${index + 1}`,
            barcode: barcodeVal,
            category: categoryVal,
            price: Math.max(0, priceVal),
            stock: Math.max(0, stockVal),
            minStock: Math.max(0, minStockVal),
            isValid: errors.length === 0,
            errors,
          };
        });

        setParsedProducts(items);
      } catch (err) {
        console.error("Excel parse error:", err);
        alert("Excel dosyası okunurken hata oluştu. Lütfen geçerli bir .xlsx veya .xls dosyası seçin.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // 3. Save parsed items to Firestore
  const handleSaveToDatabase = async () => {
    const validItems = parsedProducts.filter(p => p.isValid);
    if (validItems.length === 0) {
      alert("Yüklenecek geçerli ürün bulunamadı.");
      return;
    }

    setIsProcessing(true);
    setUploadProgress({ current: 0, total: validItems.length });

    try {
      // First, fetch existing products to match existing barcodes
      const existingSnap = await getDocs(collection(db, 'products'));
      const existingMap = new Map<string, string>(); // barcode -> docId
      existingSnap.docs.forEach(d => {
        const data = d.data();
        if (data.barcode) {
          existingMap.set(String(data.barcode).trim(), d.id);
        }
      });

      // Firestore batches have a 500 operations limit
      const chunkSize = 350;
      let processedCount = 0;

      for (let i = 0; i < validItems.length; i += chunkSize) {
        const chunk = validItems.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const item of chunk) {
          const existingDocId = existingMap.get(item.barcode);

          if (existingDocId && updateExisting) {
            // Update existing product
            const ref = doc(db, 'products', existingDocId);
            batch.update(ref, {
              name: item.name,
              category: item.category,
              price: item.price,
              stock: item.stock,
              minStock: item.minStock,
              updatedAt: serverTimestamp(),
            });
          } else {
            // Insert new product
            const newRef = doc(collection(db, 'products'));
            batch.set(newRef, {
              name: item.name,
              barcode: item.barcode,
              category: item.category,
              price: item.price,
              stock: item.stock,
              minStock: item.minStock,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }

        await batch.commit();
        processedCount += chunk.length;
        setUploadProgress({ current: processedCount, total: validItems.length });
      }

      onSuccess(validItems.length);
      onClose();
    } catch (err) {
      console.error("Firestore batch upload error:", err);
      alert("Stoklar kaydedilirken hata oluştu: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  const validCount = parsedProducts.filter(p => p.isValid).length;
  const invalidCount = parsedProducts.length - validCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-xl text-slate-900 leading-tight">
                Excel ile Toplu Ürün & Stok Yükleme
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium leading-tight mt-0.5">
                Stokları, fiyatları ve barkodları Excel tablonuzdan sisteme aktarın
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

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
          {/* Step 1: Template Download Banner */}
          <div className="bg-blue-50/70 border border-blue-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs sm:text-sm text-blue-950">Hazır Excel Şablonu</p>
                <p className="text-[11px] sm:text-xs text-blue-700">
                  Kolon formatı: Ürün Adı, Barkod, Kategori, Satış Fiyatı, Mevcut Stok, Kritik Stok.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Örnek Şablonu İndir (.xlsx)</span>
            </button>
          </div>

          {/* Step 2: Upload Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/40'
                : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden"
            />
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="font-bold text-slate-800 text-sm sm:text-base">
              {fileName ? fileName : 'Excel dosyanızı buraya sürükleyin veya tıklayarak seçin'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Desteklenen formatlar: .xlsx, .xls, .csv</p>
          </div>

          {/* Step 3: Parsed Products Preview Table */}
          {parsedProducts.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-900">
                    Okunan Ürün Önizlemesi ({parsedProducts.length} Satır)
                  </h4>
                  <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {validCount} Geçerli
                  </span>
                  {invalidCount > 0 && (
                    <span className="bg-red-100 text-red-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {invalidCount} Hatalı
                    </span>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Aynı barkodlu mevcut ürünlerin stok & fiyatını güncelle</span>
                </label>
              </div>

              {/* Preview table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-[10px] font-bold sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">Durum</th>
                      <th className="p-2.5">Ürün Adı</th>
                      <th className="p-2.5">Barkod</th>
                      <th className="p-2.5">Kategori</th>
                      <th className="p-2.5 text-right">Fiyat</th>
                      <th className="p-2.5 text-right">Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedProducts.slice(0, 100).map((item, idx) => (
                      <tr key={idx} className={item.isValid ? "hover:bg-slate-50" : "bg-red-50/40"}>
                        <td className="p-2.5 whitespace-nowrap">
                          {item.isValid ? (
                            <span className="text-emerald-600 flex items-center gap-1 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Hazır</span>
                            </span>
                          ) : (
                            <span className="text-red-600 flex items-center gap-1 font-bold" title={item.errors.join(', ')}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Hata</span>
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-bold text-slate-900 max-w-xs truncate">{item.name}</td>
                        <td className="p-2.5 font-mono text-slate-600">{item.barcode}</td>
                        <td className="p-2.5 text-slate-500">{item.category}</td>
                        <td className="p-2.5 text-right font-black text-slate-900">
                          {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>
                        <td className="p-2.5 text-right font-bold text-blue-600">
                          {item.stock} Adet
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsedProducts.length > 100 && (
                <p className="text-[11px] text-slate-400 text-center">
                  İlk 100 satır gösteriliyor (Toplam {parsedProducts.length} ürün yüklenecek).
                </p>
              )}
            </div>
          )}

          {/* Progress bar during upload */}
          {uploadProgress && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Buluta Aktarılıyor...</span>
                <span>{uploadProgress.current} / {uploadProgress.total} Ürün</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
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
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all"
          >
            İptal
          </button>

          <button
            type="button"
            disabled={parsedProducts.length === 0 || isProcessing || validCount === 0}
            onClick={handleSaveToDatabase}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{validCount} Ürünü Veritabanına Yükle</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
