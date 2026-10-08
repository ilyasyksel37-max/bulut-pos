import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer, Tag } from 'lucide-react';

interface BarcodePrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    name: string;
    barcode: string;
    price: number;
  } | null;
}

export const BarcodePrinterModal: React.FC<BarcodePrinterModalProps> = ({
  isOpen,
  onClose,
  product
}) => {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const printBarcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (isOpen && product && (barcodeRef.current || printBarcodeRef.current)) {
      const barcodeValue = product.barcode || product.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
      
      try {
        if (barcodeRef.current) {
          JsBarcode(barcodeRef.current, barcodeValue, {
            format: "CODE128",
            lineColor: "#000",
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 12,
            margin: 5
          });
        }
        if (printBarcodeRef.current) {
          JsBarcode(printBarcodeRef.current, barcodeValue, {
            format: "CODE128",
            lineColor: "#000",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            margin: 10
          });
        }
      } catch (err) {
        console.error("Barcode generation error:", err);
      }
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 print:hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">Barkod Etiketi Yazdır</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 flex flex-col items-center justify-center">
          {/* Label Preview */}
          <div className="bg-white p-6 border-2 border-slate-100 rounded-2xl shadow-sm text-center w-full max-w-[280px]">
            <div className="mb-2">
              <h4 className="font-black text-slate-900 text-sm uppercase leading-tight line-clamp-2">
                {product.name}
              </h4>
            </div>
            
            <div className="flex justify-center my-2">
              <svg ref={barcodeRef} className="max-w-full h-auto"></svg>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FİYAT</span>
              <span className="text-lg font-black text-blue-600 tabular-nums">
                {product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </span>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-slate-400 text-center px-4 leading-relaxed">
            Yazdır butonuna bastığınızda tarayıcınızın yazdırma penceresi açılacaktır. Etiket yazıcısı için uygun kağıt boyutunu seçmeyi unutmayın.
          </p>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl transition-all"
          >
            Vazgeç
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Yazdır
          </button>
        </div>
      </div>

      {/* Print-only View */}
      <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-0">
         <div className="flex flex-col items-center justify-center h-full w-full">
            <div className="text-center w-[60mm] p-4 flex flex-col items-center justify-center border border-slate-100">
              <h4 className="font-black text-black text-[14pt] uppercase leading-tight mb-2">
                {product.name}
              </h4>
              <svg ref={printBarcodeRef} className="w-full h-auto"></svg>
              <p className="text-[18pt] font-black text-black mt-2">
                {product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
         </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { margin: 0; size: auto; }
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          .print\\:block { 
            position: fixed; 
            left: 0; 
            top: 0; 
            width: 100vw; 
            height: 100vh; 
            display: flex !important;
            justify-content: center;
            align-items: center;
            background: white;
          }
        }
      `}} />
    </div>
  );
};
