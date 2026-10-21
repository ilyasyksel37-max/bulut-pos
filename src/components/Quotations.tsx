import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { FileText, Plus, Search, Printer, Trash2, CheckCircle2, X, Calendar, User, ShoppingCart, ArrowRight, Package } from 'lucide-react';
import { isDocInTenant, withTenant } from '../lib/tenant';
import { triggerPrintDialog } from '../lib/utils';

export const Quotations: React.FC = () => {
  const { user, tenantId, checkDemoRestricted, currentTenant, tenantName } = useAuth();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'BEKLIYOR' | 'ONAYLANDI' | 'REDDEDILDI'>('all');

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Manual product input state
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualKdv, setManualKdv] = useState('20');

  // Selected quotation for view/print modal
  const [viewingQuote, setViewingQuote] = useState<any | null>(null);

  const handlePrintQuote = () => {
    handleOpenPdf();
  };

  const handleOpenPdf = () => {
    if (!viewingQuote) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Lütfen tarayıcınızın açılır pencere (popup) engelleyicisini kapatın.");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8">
        <title>Proforma Teklif - ${viewingQuote.quoteNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
          h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; border: 1px solid #000; padding: 15px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: bold; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .summary { margin-top: 20px; display: flex; justify-content: flex-end; }
          .summary-box { width: 280px; border: 1px solid #000; padding: 12px; font-size: 13px; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .summary-total { font-weight: bold; font-size: 15px; border-top: 1px solid #000; padding-top: 6px; }
          .footer { margin-top: 40px; font-size: 11px; text-align: center; color: #555; border-top: 1px solid #ddd; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>PROFORMA FİYAT TEKLİFİ</h1>
            <p>Teklif No: <strong>${viewingQuote.quoteNumber}</strong></p>
          </div>
          <div style="text-align: right;">
            <p>Düzenleme Tarihi: ${viewingQuote.createdAt?.split('T')[0] || ''}</p>
            <p>Son Geçerlilik: <strong>${viewingQuote.validUntil}</strong></p>
          </div>
        </div>

        <div class="grid">
          <div>
            <strong>MÜŞTERİ BİLGİLERİ</strong><br><br>
            <strong>${viewingQuote.customerName}</strong><br>
            Tel: ${viewingQuote.customerPhone || '-'}<br>
            Adres: ${viewingQuote.customerAddress || '-'}
          </div>
          <div>
            <strong>FİRMA / SATICI BİLGİLERİ</strong><br><br>
            <strong>${currentTenant?.name || tenantName || 'Elnara Kırtasiye'}</strong><br>
            Kurumsal Satış Departmanı<br>
            Teklif Onay Tarihi: ${viewingQuote.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]}<br>
            Tel: ${currentTenant?.phone || '-'}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px;" class="text-center">#</th>
              <th>Ürün / Açıklama</th>
              <th style="width: 70px;" class="text-center">Miktar</th>
              <th style="width: 60px;" class="text-center">KDV</th>
              <th style="width: 100px;" class="text-right">Birim Fiyat</th>
              <th style="width: 110px;" class="text-right">Toplam Tutar</th>
            </tr>
          </thead>
          <tbody>
            ${viewingQuote.items?.map((item: any, i: number) => {
              const lineSub = Number(item.price) * Number(item.quantity);
              const kdvRate = Number(item.kdv) || 0;
              const lineVat = (lineSub * kdvRate) / 100;
              const lineTotal = lineSub + lineVat;
              return `
                <tr>
                  <td class="text-center">${i + 1}</td>
                  <td><strong>${item.name}</strong></td>
                  <td class="text-center">${item.quantity}</td>
                  <td class="text-center">%${item.kdv ?? 20}</td>
                  <td class="text-right">₺${Number(item.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right"><strong>₺${lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-box">
            <div class="summary-row">
              <span>Ara Toplam:</span>
              <span>₺${Number(viewingQuote.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="summary-row">
              <span>Toplam KDV:</span>
              <span>₺${Number(viewingQuote.vatTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="summary-row summary-total">
              <span>Genel Toplam:</span>
              <span>₺${Number(viewingQuote.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        ${viewingQuote.notes ? `<div style="margin-top: 20px; border: 1px solid #000; padding: 10px; font-size: 12px;"><strong>Notlar ve Şartlar:</strong><br>${viewingQuote.notes}</div>` : ''}

        <div class="footer">
          Bu belge resmi teklif mahiyetindedir. Belirtilen geçerlilik süresi içerisinde sabittir.
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

  useEffect(() => {
    const unsubQ = onSnapshot(collection(db, 'quotations'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(q => isDocInTenant(q, tenantId));
      setQuotations(list);
    }, (err) => console.warn("Quotations error:", err));

    const unsubC = onSnapshot(collection(db, 'customers'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => isDocInTenant(c, tenantId));
      setCustomers(list);
    }, (err) => console.warn("Customers error:", err));

    const unsubI = onSnapshot(collection(db, 'inventory'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(i => isDocInTenant(i, tenantId));
      setInventory(list);
    }, (err) => console.warn("Inventory error:", err));

    return () => {
      unsubQ();
      unsubC();
      unsubI();
    };
  }, [tenantId]);

  const handleAddItemFromStock = (prod: any) => {
    const existingIndex = items.findIndex(i => i.productId === prod.id);
    if (existingIndex > -1) {
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      setItems(updated);
    } else {
      setItems([...items, {
        productId: prod.id,
        name: prod.name || prod.title || 'Ürün',
        barcode: prod.barcode || '',
        price: Number(prod.salePrice || prod.price || 0),
        quantity: 1,
        kdv: 20 // Default KDV
      }]);
    }
    setProductSearch('');
  };

  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) {
      alert("Lütfen ürün / hizmet adı girin.");
      return;
    }
    const price = parseFloat(manualPrice) || 0;
    const qty = parseInt(manualQty) || 1;
    const kdv = parseInt(manualKdv) || 0;

    setItems([...items, {
      productId: 'manual-' + Date.now(),
      name: manualName.trim(),
      barcode: '',
      price,
      quantity: qty,
      kdv
    }]);

    setManualName('');
    setManualPrice('');
    setManualQty('1');
    setManualKdv('20');
  };

  const handleUpdateItemQty = (index: number, qty: number) => {
    if (qty <= 0) {
      setItems(items.filter((_, i) => i !== index));
    } else {
      const updated = [...items];
      updated[index].quantity = qty;
      setItems(updated);
    }
  };

  const handleUpdateItemPrice = (index: number, price: number) => {
    const updated = [...items];
    updated[index].price = price;
    setItems(updated);
  };

  const handleUpdateItemKdv = (index: number, kdv: number) => {
    const updated = [...items];
    updated[index].kdv = kdv;
    setItems(updated);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  };

  const calculateVatTotal = () => {
    return items.reduce((sum, item) => {
      const lineTotal = Number(item.price) * Number(item.quantity);
      const kdvRate = Number(item.kdv) || 0;
      return sum + (lineTotal * kdvRate) / 100;
    }, 0);
  };

  const calculateGrandTotal = () => {
    return calculateSubtotal() + calculateVatTotal();
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkDemoRestricted('Teklif verme')) return;
    if (!selectedCustomerId) {
      alert("Lütfen bir müşteri seçin.");
      return;
    }
    if (items.length === 0) {
      alert("Lütfen teklife en az bir ürün ekleyin.");
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    const subtotal = calculateSubtotal();
    const vatTotal = calculateVatTotal();
    const totalAmount = calculateGrandTotal();
    const quoteNumber = `TEK-${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      const newQuote = withTenant({
        quoteNumber,
        customerId: customer?.id || '',
        customerName: customer?.name || customer?.fullName || 'Müşteri',
        customerPhone: customer?.phone || '',
        customerAddress: customer?.address || '',
        items,
        subtotal,
        vatTotal,
        totalAmount,
        validUntil,
        notes,
        status: 'BEKLIYOR',
        createdBy: user?.displayName || user?.email || 'Personel',
        createdAt: new Date().toISOString()
      }, tenantId);

      await addDoc(collection(db, 'quotations'), newQuote);
      setIsModalOpen(false);
      setSelectedCustomerId('');
      setItems([]);
      setNotes('');
    } catch (err: any) {
      console.error(err);
      alert("Teklif kaydedilemedi: " + err.message);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    if (checkDemoRestricted('Teklif durumu güncelleme')) return;
    try {
      await updateDoc(doc(db, 'quotations', id), { status });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (checkDemoRestricted('Teklif silme')) return;
    if (!window.confirm("Bu teklifi silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, 'quotations', id));
      if (viewingQuote?.id === id) setViewingQuote(null);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredQuotations = quotations.filter(q => {
    const matchSearch = (q.quoteNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (q.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTabFilter === 'all') return matchSearch;
    return matchSearch && q.status === activeTabFilter;
  });

  const filteredInventory = inventory.filter(i => {
    const term = productSearch.toLowerCase().trim();
    if (!term) return false;
    const name = (i.name || i.title || '').toLowerCase();
    const barcode = (i.barcode || '').toLowerCase();
    const sku = (i.sku || '').toLowerCase();
    return name.includes(term) || barcode.includes(term) || sku.includes(term);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-900 to-indigo-900 p-6 sm:p-8 rounded-3xl text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white backdrop-blur-md">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Teklifler & Proforma</h1>
            <p className="text-blue-200 text-xs sm:text-sm mt-0.5">Müşterilerinize özel teklifler hazırlayın ve yazdırın.</p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-white text-blue-900 hover:bg-blue-50 rounded-2xl font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>Yeni Teklif Oluştur</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'Tüm Teklifler' },
            { id: 'BEKLIYOR', label: 'Bekleyenler' },
            { id: 'ONAYLANDI', label: 'Onaylananlar' },
            { id: 'REDDEDILDI', label: 'Reddedilenler' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTabFilter(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                activeTabFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Teklif No veya Müşteri ara..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Quotations List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredQuotations.map(quote => (
          <div key={quote.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                  {quote.quoteNumber}
                </span>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  quote.status === 'ONAYLANDI' ? 'bg-emerald-100 text-emerald-800' :
                  quote.status === 'REDDEDILDI' ? 'bg-red-100 text-red-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {quote.status === 'ONAYLANDI' ? 'Onaylandı' : quote.status === 'REDDEDILDI' ? 'Reddedildi' : 'Beklemede'}
                </span>
              </div>

              <div>
                <h3 className="font-black text-slate-900 text-base">{quote.customerName}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Son Geçerlilik: <span className="font-bold text-slate-700">{quote.validUntil}</span>
                </p>
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl space-y-1">
                <div className="flex justify-between font-medium">
                  <span>Ürün Kalem Sayısı:</span>
                  <span className="font-bold text-slate-900">{quote.items?.length || 0} Kalem</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200/60">
                  <span>Genel Toplam:</span>
                  <span className="text-blue-600 font-mono">₺{Number(quote.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                onClick={() => setViewingQuote(quote)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>İncele / Yazdır</span>
              </button>

              <select
                value={quote.status}
                onChange={e => handleUpdateStatus(quote.id, e.target.value)}
                className="px-2.5 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold"
              >
                <option value="BEKLIYOR">Bekliyor</option>
                <option value="ONAYLANDI">Onayla</option>
                <option value="REDDEDILDI">Reddet</option>
              </select>

              <button
                onClick={() => handleDelete(quote.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredQuotations.length === 0 && (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 space-y-3">
          <FileText className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">Teklif Bulunamadı</h3>
          <p className="text-xs text-slate-400">Henüz kayıtlı teklif yok veya arama kriterine uygun teklif bulunamadı.</p>
        </div>
      )}

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg">Yeni Proforma Teklif Hazırla</h3>
                  <p className="text-xs text-slate-400">Müşteriye özel fiyat teklifi oluşturun (Stoktan seçin veya manuel ekleyin)</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuotation} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1.5">Müşteri Seçin *</label>
                  <select
                    value={selectedCustomerId}
                    onChange={e => setSelectedCustomerId(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Müşteri Seçin --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.fullName} ({c.phone || 'Telefon yok'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 mb-1.5">Son Geçerlilik Tarihi</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* TWO SECTIONS FOR ADDING PRODUCTS: STOCK SEARCH & MANUAL ENTRY */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                {/* 1. Stock Search */}
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-blue-600" />
                    Stoktan Ürün Bul & Ekle
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Ürün adı, barkod veya kod ile arat..."
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {productSearch.trim() && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {filteredInventory.length > 0 ? (
                        filteredInventory.map(prod => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => handleAddItemFromStock(prod)}
                            className="w-full px-3.5 py-2 text-left hover:bg-blue-50 flex items-center justify-between text-xs transition-colors"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{prod.name}</p>
                              <p className="text-[10px] text-slate-500">Stok: {prod.stock ?? prod.quantity ?? 0} | Barkod: {prod.barcode || 'Yok'}</p>
                            </div>
                            <span className="font-mono font-black text-blue-600">₺{Number(prod.salePrice || prod.price || 0).toLocaleString('tr-TR')}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-400 font-medium">
                          Stokta eşleşen ürün bulunamadı. Yan taraftan manuel ekleyebilirsiniz.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Manual Product Entry */}
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    Manuel Ürün / Hizmet Ekle
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Ürün / Hizmet Adı *"
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Birim Fiyat (₺) *"
                      value={manualPrice}
                      onChange={e => setManualPrice(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 font-mono"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="w-1/3">
                      <input
                        type="number"
                        min="1"
                        placeholder="Miktar"
                        value={manualQty}
                        onChange={e => setManualQty(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 font-mono"
                      />
                    </div>
                    <div className="w-1/3">
                      <select
                        value={manualKdv}
                        onChange={e => setManualKdv(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                      >
                        <option value="0">KDV %0</option>
                        <option value="10">KDV %10</option>
                        <option value="20">KDV %20</option>
                      </select>
                    </div>
                    <div className="w-1/3">
                      <button
                        type="button"
                        onClick={handleAddManualItem}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow transition-all flex items-center justify-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Ekle</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-[11px] font-black uppercase text-slate-700">
                      <th className="p-3">Ürün / Açıklama</th>
                      <th className="p-3 w-28">Birim Fiyat (₺)</th>
                      <th className="p-3 w-20">Miktar</th>
                      <th className="p-3 w-24">KDV</th>
                      <th className="p-3 w-28 text-right">Toplam</th>
                      <th className="p-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium">
                    {items.map((item, index) => {
                      const lineSub = Number(item.price) * Number(item.quantity);
                      const kdvRate = Number(item.kdv) || 0;
                      const lineVat = (lineSub * kdvRate) / 100;
                      const lineTotal = lineSub + lineVat;

                      return (
                        <tr key={index} className="hover:bg-slate-50/80">
                          <td className="p-3 font-bold text-slate-900">{item.name}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={e => handleUpdateItemPrice(index, parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => handleUpdateItemQty(index, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono"
                            />
                          </td>
                          <td className="p-3">
                            <select
                              value={item.kdv ?? 20}
                              onChange={e => handleUpdateItemKdv(index, parseInt(e.target.value))}
                              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                            >
                              <option value="0">%0</option>
                              <option value="10">%10</option>
                              <option value="20">%20</option>
                            </select>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">
                            ₺{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleUpdateItemQty(index, 0)}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                          Henüz ürün eklenmedi. Yukarıdan stoktan aratın veya manuel ekleyin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total summary */}
              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Ara Toplam (KDV Hariç):</span>
                  <span className="font-mono font-bold text-slate-900">₺{calculateSubtotal().toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Toplam KDV:</span>
                  <span className="font-mono font-bold text-slate-900">₺{calculateVatTotal().toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm sm:text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                  <span>Genel Toplam (KDV Dahil):</span>
                  <span className="text-xl font-black font-mono text-blue-600">
                    ₺{calculateGrandTotal().toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-700 mb-1.5">Notlar / Şartlar</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Örn. Teklif 15 gün geçerlidir. Ödeme peşin havaledir."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-600/20 transition-all"
                >
                  Teklifi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW & PRINT MODAL */}
      {viewingQuote && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white print:hidden">
              <h3 className="font-black text-lg">Resmi Proforma Teklif ({viewingQuote.quoteNumber})</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintQuote}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>İncele / Yazdır</span>
                </button>
                <button
                  onClick={handleOpenPdf}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <FileText className="w-4 h-4" />
                  <span>PDF İndir / Aç</span>
                </button>
                <button onClick={() => setViewingQuote(null)} className="text-slate-400 hover:text-white p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* SCREEN VIEW */}
            <div className="p-8 overflow-y-auto space-y-6 text-slate-800 bg-white print:hidden">
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-wide text-slate-900">PROFORMA FİYAT TEKLİFİ</h2>
                  <p className="text-xs text-slate-500 font-mono mt-1">Teklif No: {viewingQuote.quoteNumber}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold text-slate-900">Düzenleme Tarihi: {viewingQuote.createdAt?.split('T')[0]}</p>
                  <p className="text-slate-600 mt-0.5">Son Geçerlilik: <strong className="text-slate-900">{viewingQuote.validUntil}</strong></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <p className="font-black text-blue-900 uppercase text-[11px] mb-1">MÜŞTERİ BİLGİLERİ</p>
                  <p className="font-bold text-slate-900 text-sm">{viewingQuote.customerName}</p>
                  <p className="text-slate-600">Tel: {viewingQuote.customerPhone || 'Belirtilmemiş'}</p>
                  <p className="text-slate-600">Adres: {viewingQuote.customerAddress || 'Belirtilmemiş'}</p>
                </div>
                <div>
                  <p className="font-black text-blue-900 uppercase text-[11px] mb-1">FİRMA / SATICI BİLGİLERİ</p>
                  <p className="font-bold text-slate-900 text-sm">{currentTenant?.name || tenantName || 'Elnara Kırtasiye'}</p>
                  <p className="text-slate-700 font-bold mt-0.5">Kurumsal Satış Departmanı</p>
                  <p className="text-slate-600 mt-0.5">Teklif Onay Tarihi: <strong className="text-slate-900">{viewingQuote.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]}</strong></p>
                  <p className="text-slate-600">Tel: {currentTenant?.phone || '-'}</p>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-y border-slate-300 text-slate-800 font-black">
                    <th className="p-3">#</th>
                    <th className="p-3">Ürün / Açıklama</th>
                    <th className="p-3 text-center">Miktar</th>
                    <th className="p-3 text-center">KDV</th>
                    <th className="p-3 text-right">Birim Fiyat</th>
                    <th className="p-3 text-right">Toplam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {viewingQuote.items?.map((item: any, i: number) => {
                    const lineSub = Number(item.price) * Number(item.quantity);
                    const kdvRate = Number(item.kdv) || 0;
                    const lineVat = (lineSub * kdvRate) / 100;
                    const lineTotal = lineSub + lineVat;

                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-500 font-mono">{i + 1}</td>
                        <td className="p-3 font-bold text-slate-900">{item.name}</td>
                        <td className="p-3 text-center font-bold font-mono">{item.quantity}</td>
                        <td className="p-3 text-center text-slate-600">%{item.kdv ?? 20}</td>
                        <td className="p-3 text-right font-mono">₺{Number(item.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 text-right font-mono font-bold">₺{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-end pt-4 border-t border-slate-200">
                <div className="w-72 space-y-2 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>Ara Toplam (KDV Hariç):</span>
                    <span className="font-mono font-bold text-slate-900">₺{Number(viewingQuote.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Toplam KDV:</span>
                    <span className="font-mono font-bold text-slate-900">₺{Number(viewingQuote.vatTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-black text-base text-slate-900 pt-2 border-t border-slate-300">
                    <span>Genel Toplam:</span>
                    <span className="font-mono text-blue-600 text-lg">₺{Number(viewingQuote.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {viewingQuote.notes && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                  <p className="font-black uppercase tracking-wider">Özel Şartlar ve Notlar:</p>
                  <p className="whitespace-pre-wrap">{viewingQuote.notes}</p>
                </div>
              )}
            </div>

            {/* DEDICATED OFFICIAL PRINT TEMPLATE (VISIBLE ONLY DURING PRINTING) */}
            <div className="hidden print:block p-10 bg-white text-black font-sans space-y-6">
              <div className="flex justify-between items-start border-b-2 border-black pb-6">
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-wider">PROFORMA FİYAT TEKLİFİ</h1>
                  <p className="text-sm font-mono mt-1">Teklif No: {viewingQuote.quoteNumber}</p>
                </div>
                <div className="text-right text-xs space-y-1">
                  <p className="font-bold">Düzenleme Tarihi: {viewingQuote.createdAt?.split('T')[0]}</p>
                  <p>Son Geçerlilik Tarihi: <strong className="font-bold">{viewingQuote.validUntil}</strong></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 border border-black p-4 text-xs">
                <div>
                  <p className="font-black uppercase tracking-wide border-b border-black pb-1 mb-2">MÜŞTERİ BİLGİLERİ</p>
                  <p className="font-bold text-sm">{viewingQuote.customerName}</p>
                  <p className="mt-0.5">Telefon: {viewingQuote.customerPhone || '-'}</p>
                  <p className="mt-0.5">Adres: {viewingQuote.customerAddress || '-'}</p>
                </div>
                <div>
                  <p className="font-black uppercase tracking-wide border-b border-black pb-1 mb-2">FİRMA / SATICI BİLGİLERİ</p>
                  <p className="font-bold text-sm">{currentTenant?.name || tenantName || 'Elnara Kırtasiye'}</p>
                  <p className="mt-0.5 font-bold">Kurumsal Satış Departmanı</p>
                  <p className="mt-0.5">Teklif Onay Tarihi: {viewingQuote.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]}</p>
                  <p className="mt-0.5">Telefon: {currentTenant?.phone || '-'}</p>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-xs mt-6">
                <thead>
                  <tr className="border-b-2 border-black text-black font-black">
                    <th className="py-2.5 px-2">#</th>
                    <th className="py-2.5 px-2">Ürün / Açıklama</th>
                    <th className="py-2.5 px-2 text-center">Miktar</th>
                    <th className="py-2.5 px-2 text-center">KDV</th>
                    <th className="py-2.5 px-2 text-right">Birim Fiyat</th>
                    <th className="py-2.5 px-2 text-right">Toplam Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/30">
                  {viewingQuote.items?.map((item: any, i: number) => {
                    const lineSub = Number(item.price) * Number(item.quantity);
                    const kdvRate = Number(item.kdv) || 0;
                    const lineVat = (lineSub * kdvRate) / 100;
                    const lineTotal = lineSub + lineVat;

                    return (
                      <tr key={i}>
                        <td className="py-3 px-2 font-mono">{i + 1}</td>
                        <td className="py-3 px-2 font-bold">{item.name}</td>
                        <td className="py-3 px-2 text-center font-bold font-mono">{item.quantity}</td>
                        <td className="py-3 px-2 text-center font-mono">%{item.kdv ?? 20}</td>
                        <td className="py-3 px-2 text-right font-mono">₺{Number(item.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                        <td className="py-3 px-2 text-right font-mono font-bold">₺{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-end pt-6">
                <div className="w-72 space-y-2 text-xs border border-black p-4">
                  <div className="flex justify-between">
                    <span>Ara Toplam:</span>
                    <span className="font-mono font-bold">₺{Number(viewingQuote.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Toplam KDV:</span>
                    <span className="font-mono font-bold">₺{Number(viewingQuote.vatTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm pt-2 border-t border-black">
                    <span>Genel Toplam:</span>
                    <span className="font-mono text-base">₺{Number(viewingQuote.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {viewingQuote.notes && (
                <div className="border border-black p-3 text-xs space-y-1 mt-4">
                  <p className="font-black uppercase">Notlar ve Şartlar:</p>
                  <p className="whitespace-pre-wrap">{viewingQuote.notes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 pt-12 mt-12 border-t border-black text-xs">
                <div className="text-center space-y-12">
                  <p className="font-black uppercase">Müşteri / Alıcı Onayı</p>
                  <p className="text-slate-500">(İmza / Kaşe)</p>
                </div>
                <div className="text-center space-y-12">
                  <p className="font-black uppercase">Firma Yetkilisi</p>
                  <p className="text-slate-500">(İmza / Kaşe)</p>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-500 pt-8 mt-12 border-t border-slate-200">
                Bu belge resmi teklif mahiyetindedir. Belirtilen geçerlilik süresi içerisinde sabittir.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end print:hidden">
              <button
                onClick={() => setViewingQuote(null)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all"
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
