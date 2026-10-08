import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, query, where, getDocs, addDoc, 
  doc, updateDoc, increment, serverTimestamp, onSnapshot 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Search, ShoppingCart, Trash2, User, CreditCard, 
  Banknote, ScanBarcode, Camera, CheckCircle2, AlertCircle, Plus,
  Receipt, ArrowDownRight, UserPlus, X, AlertTriangle, Printer, Store, UserCheck, Package,
  DollarSign, Euro, Coins, UserCircle2, ChevronDown
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { cn } from '../lib/utils';
import { BarcodeScannerModal } from './scanner/BarcodeScannerModal';
import { CustomerModal, CustomerData } from './customers/CustomerModal';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { recordCashMovement, CurrencyType } from '../lib/kasa-utils';

interface CartItem {
  id: string;
  name: string;
  price: number;
  purchasePrice?: number;
  quantity: number;
  stock: number;
  barcode?: string;
  discount?: number; // Price-based discount per item
}

interface CompletedSaleReceipt {
  saleId: string;
  date: Date;
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'veresiye';
  customerName?: string;
  customerPhone?: string;
  previousDebt?: number;
  newDebt?: number;
  currency?: CurrencyType;
  exchangeRate?: number;
  foreignAmount?: number;
  sellerCode?: string;
  sellerName?: string;
}

interface POSProps {
  initialCustomer?: CustomerData | null;
  onClearInitialCustomer?: () => void;
}

const POS: React.FC<POSProps> = ({ initialCustomer, onClearInitialCustomer }) => {
  const { user, isDemo, checkDemoRestricted } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Multi-Currency and Manual Exchange Rate states
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyType>('TRY');
  const [exchangeRates, setExchangeRates] = useState<{ USD: number; EUR: number }>({
    USD: Number(localStorage.getItem('sep_rate_usd') || '38.50'),
    EUR: Number(localStorage.getItem('sep_rate_eur') || '41.20')
  });

  // Salesperson (Satış Elemanı) states
  const [staffList, setStaffList] = useState<{ id: string; name: string; sellerCode: string }[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<{ id: string; name: string; code: string }>({
    id: user?.uid || 'guest',
    name: user?.displayName || user?.email?.split('@')[0] || 'Kasiyer',
    code: user?.sellerCode || 'E01'
  });
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState(false);

  // Sale Mode: 'retail' (Perakende / Hızlı Fiş) or 'customer' (Kayıtlı Müşteri / Cari)
  const [saleMode, setSaleMode] = useState<'retail' | 'customer'>('retail');
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerData[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'veresiye'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // Completed Receipt state for printing
  const [lastReceipt, setLastReceipt] = useState<CompletedSaleReceipt | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // If initialCustomer prop changes (e.g. from Customers -> "Satış Yap")
  useEffect(() => {
    if (initialCustomer) {
      setCustomer(initialCustomer);
      setSaleMode('customer');
      showToast(`Müşteri seçildi: ${initialCustomer.name}`);
      if (onClearInitialCustomer) onClearInitialCustomer();
    }
  }, [initialCustomer, onClearInitialCustomer]);

  // Load staff list for salesperson selection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d, index) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.displayName || data.email?.split('@')[0] || `Personel ${index + 1}`,
          sellerCode: data.sellerCode || `E0${index + 1}`
        };
      });
      setStaffList(list);

      // Auto-assign current user
      if (user) {
        const current = list.find(s => s.id === user.uid || (user.sellerCode && s.sellerCode === user.sellerCode));
        if (current) {
          setSelectedSeller({ id: current.id, name: current.name, code: current.sellerCode });
        } else {
          setSelectedSeller({
            id: user.uid || 'guest',
            name: user.displayName || user.email?.split('@')[0] || 'Kasiyer',
            code: user.sellerCode || 'E01'
          });
        }
      }
    });

    return () => unsub();
  }, [user]);

  const handleUpdateExchangeRate = (curr: 'USD' | 'EUR', val: string) => {
    const num = parseFloat(val.replace(',', '.')) || 0;
    setExchangeRates(prev => {
      const updated = { ...prev, [curr]: num };
      if (curr === 'USD') localStorage.setItem('sep_rate_usd', num.toString());
      if (curr === 'EUR') localStorage.setItem('sep_rate_eur', num.toString());
      return updated;
    });
  };

  // Search products by name or barcode
  useEffect(() => {
    if (searchTerm.length > 1) {
      const delayDebounceFn = setTimeout(async () => {
        try {
          const qName = query(
            collection(db, 'products'),
            where('name', '>=', searchTerm),
            where('name', '<=', searchTerm + '\uf8ff')
          );
          const snap = await getDocs(qName);
          const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          const qBarcode = query(
            collection(db, 'products'),
            where('barcode', '==', searchTerm.trim())
          );
          const bSnap = await getDocs(qBarcode);
          bSnap.docs.forEach(d => {
            if (!results.some(r => r.id === d.id)) {
              results.unshift({ id: d.id, ...d.data() });
            }
          });

          setSearchResults(results);
        } catch (e) {
          console.error(e);
        }
      }, 200);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  // Customer search suggestions
  useEffect(() => {
    if (customerSearchQuery.trim().length > 0) {
      const delayFn = setTimeout(async () => {
        try {
          const snap = await getDocs(collection(db, 'customers'));
          const term = customerSearchQuery.toLowerCase().trim();
          const matches = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as CustomerData))
            .filter(c => 
              (c.name || '').toLowerCase().includes(term) ||
              (c.phone || '').includes(term)
            )
            .slice(0, 6);
          setCustomerSuggestions(matches);
          setIsCustomerDropdownOpen(true);
        } catch (err) {
          console.error("Customer search error:", err);
        }
      }, 200);
      return () => clearTimeout(delayFn);
    } else {
      setCustomerSuggestions([]);
      setIsCustomerDropdownOpen(false);
    }
  }, [customerSearchQuery]);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addToCart = (product: any) => {
    const priceVal = Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0) || 0;
    const stockVal = Number(product.stock ?? product.miktar ?? product.adet ?? 0) || 0;

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= stockVal) {
          showToast(`Stok yetersiz! Mevcut stok: ${stockVal}`, 'error');
          return prev;
        }
        showToast(`${product.name} (+1 Adet)`);
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      showToast(`${product.name} sepete eklendi`);
      return [...prev, { 
        id: product.id, 
        name: product.name, 
        price: priceVal, 
        purchasePrice: Number(product.purchasePrice || 0),
        quantity: 1, 
        stock: stockVal,
        barcode: product.barcode,
        discount: 0
      }];
    });
    setSearchTerm('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  const handleBarcodeScanned = async (scannedBarcode: string) => {
    try {
      const cleanCode = scannedBarcode.trim();
      const q = query(collection(db, 'products'), where('barcode', '==', cleanCode));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const product = { id: snap.docs[0].id, ...snap.docs[0].data() };
        addToCart(product);
      } else {
        showToast(`Barkod bulunamadı: ${cleanCode}`, 'error');
      }
    } catch (err) {
      console.error("Barcode lookup error:", err);
      showToast("Ürün aranırken hata oluştu", 'error');
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = searchTerm.trim();
      if (!trimmed) return;

      try {
        const qBarcode = query(collection(db, 'products'), where('barcode', '==', trimmed));
        const bSnap = await getDocs(qBarcode);

        if (!bSnap.empty) {
          const product = { id: bSnap.docs[0].id, ...bSnap.docs[0].data() };
          addToCart(product);
          return;
        }

        if (searchResults.length > 0) {
          addToCart(searchResults[0]);
        } else {
          showToast(`Ürün bulunamadı: "${trimmed}"`, 'error');
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        if (newQty < 1) return item;
        if (newQty > item.stock) {
          showToast(`Maksimum stok miktarına ulaşıldı (${item.stock} adet)`, 'error');
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const updateQuantityManual = (id: string, value: string) => {
    const newQty = parseInt(value) || 0;
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        if (newQty > item.stock) {
          showToast(`Maksimum stok miktarına ulaşıldı (${item.stock} adet)`, 'error');
          return { ...item, quantity: item.stock };
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const updatePrice = (id: string, value: string) => {
    const newPrice = parseFloat(value) || 0;
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, price: Math.max(0, newPrice) } : item
    ));
  };

  const updateDiscount = (id: string, discount: number) => {
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, discount: Math.max(0, discount) } : item
    ));
  };

  const calculateItemTotal = (item: CartItem) => {
    return (item.price * item.quantity) - (item.discount || 0);
  };

  const total = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const totalBeforeDiscount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalDiscount = cart.reduce((sum, item) => sum + (item.discount || 0), 0);
  const subtotal = total; // This is (Price * Qty) - Discount
  const taxRate = 0.10; // 10% KDV for textile/wholesale
  const taxAmount = subtotal * taxRate;
  const grandTotal = subtotal + taxAmount;

  const activeRate = selectedCurrency === 'USD' ? exchangeRates.USD : selectedCurrency === 'EUR' ? exchangeRates.EUR : 1;
  const foreignTotal = selectedCurrency !== 'TRY' && activeRate > 0 ? Number((grandTotal / activeRate).toFixed(2)) : grandTotal;

  // Switch to customer mode automatically if Veresiye is clicked
  const handleSelectPaymentMethod = (method: 'cash' | 'card' | 'veresiye') => {
    setPaymentMethod(method);
    if (method === 'veresiye' && saleMode === 'retail') {
      setSaleMode('customer');
      showToast("Veresiye satış için lütfen cari müşteri seçin.", 'error');
    }
  };

  // Complete Sale
  const completeSale = async () => {
    if (cart.length === 0 || isProcessing) return;
    if (checkDemoRestricted("Satış tamamlama")) return;

    // Check Veresiye constraints
    if (paymentMethod === 'veresiye') {
      if (!customer || !customer.id) {
        setSaleMode('customer');
        showToast('⚠️ Veresiye satış için lütfen bir müşteri seçin veya ekleyin!', 'error');
        setIsCustomerDropdownOpen(true);
        return;
      }
    }

    setIsProcessing(true);

    try {
      const isCustomerSale = saleMode === 'customer' && !!customer;
      const currentDebt = Number(customer?.debt || 0);
      const newDebt = currentDebt + grandTotal;

      const saleData = {
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          purchasePrice: item.purchasePrice || 0,
          quantity: item.quantity,
          barcode: item.barcode || '',
          discount: item.discount || 0
        })),
        totalBeforeDiscount,
        discount: totalDiscount,
        subtotal,
        taxAmount,
        total: grandTotal,
        currency: selectedCurrency,
        exchangeRate: activeRate,
        foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : null,
        sellerCode: selectedSeller.code,
        sellerName: selectedSeller.name,
        sellerId: selectedSeller.id,
        saleType: isCustomerSale ? 'customer' : 'retail',
        customerId: isCustomerSale ? customer.id : null,
        customerName: isCustomerSale ? customer.name : 'Perakende Müşteri',
        customerPhone: isCustomerSale ? (customer.phone || null) : null,
        date: serverTimestamp(),
        paymentMethod
      };

      const saleRef = await addDoc(collection(db, 'sales'), saleData);

      // Decrement stock for items
      for (const item of cart) {
        await updateDoc(doc(db, 'products', item.id), {
          stock: increment(-item.quantity),
          updatedAt: serverTimestamp()
        });
      }

      // Record cash payment into the respective Cash Register
      if (paymentMethod === 'cash') {
        await recordCashMovement({
          currency: selectedCurrency,
          type: 'IN',
          amount: selectedCurrency !== 'TRY' ? foreignTotal : grandTotal,
          category: 'SALE',
          description: `Satış Tahsilatı (Fiş No: ${saleRef.id.slice(0, 8)}) - ${selectedSeller.code} ${selectedSeller.name}`,
          referenceId: saleRef.id,
          sellerCode: selectedSeller.code,
          sellerName: selectedSeller.name,
          exchangeRate: selectedCurrency !== 'TRY' ? activeRate : undefined
        });
      }

      // Handle Customer Transaction Recording
      if (isCustomerSale && customer?.id) {
        const itemsSummary = cart.map(i => `${i.quantity}x ${i.name}`).join(', ');
        const isVeresiye = paymentMethod === 'veresiye';
        
        // Update customer document
        const customerUpdates: any = {
          loyaltyPoints: increment(Math.floor(grandTotal / 10)),
          totalSpent: increment(grandTotal),
          updatedAt: serverTimestamp()
        };
        if (isVeresiye) {
          customerUpdates.debt = increment(grandTotal);
        }
        await updateDoc(doc(db, 'customers', customer.id), customerUpdates);

        // Record in ledger
        await addDoc(collection(db, 'customer_transactions'), {
          customerId: customer.id,
          customerName: customer.name,
          saleId: saleRef.id,
          type: isVeresiye ? 'DEBT' : 'PURCHASE',
          title: `${isVeresiye ? 'Veresiye' : (paymentMethod === 'cash' ? 'Nakit' : 'Kartlı')} Satış (${itemsSummary.length > 70 ? itemsSummary.substring(0, 70) + '...' : itemsSummary})`,
          amount: grandTotal,
          previousBalance: currentDebt,
          paymentMethod: paymentMethod === 'veresiye' ? 'Veresiye' : (paymentMethod === 'cash' ? 'Nakit' : 'Kredi Kartı'),
          balanceAfter: isVeresiye ? newDebt : currentDebt, // Balance only changes for Veresiye
          currency: selectedCurrency,
          exchangeRate: activeRate,
          foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : undefined,
          sellerCode: selectedSeller.code,
          sellerName: selectedSeller.name,
          date: serverTimestamp()
        });

        if (isVeresiye) {
          showToast(`🎉 Veresiye satış tamamlandı! (${customer.name} borcuna eklendi)`);
        } else {
          showToast(`🎉 Satış tamamlandı (${paymentMethod === 'cash' ? 'Nakit' : 'Kredi Kartı'})! Puan yüklendi.`);
        }
      } else {
        showToast(`🎉 Perakende satış tamamlandı (${paymentMethod === 'cash' ? 'Nakit' : 'Kredi Kartı'})!`);
      }

      // Create Receipt object for printable receipt
      const receiptData: CompletedSaleReceipt = {
        saleId: saleRef.id,
        date: new Date(),
        items: [...cart],
        subtotal,
        taxAmount,
        total: grandTotal,
        paymentMethod,
        customerName: isCustomerSale ? customer.name : 'Perakende Müşteri',
        customerPhone: isCustomerSale ? customer.phone : undefined,
        previousDebt: isCustomerSale ? currentDebt : undefined,
        newDebt: isCustomerSale ? (paymentMethod === 'veresiye' ? newDebt : currentDebt) : undefined,
        currency: selectedCurrency,
        exchangeRate: activeRate,
        foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : undefined,
        sellerCode: selectedSeller.code,
        sellerName: selectedSeller.name
      };

      setLastReceipt(receiptData);
      setIsReceiptModalOpen(true);

      setCart([]);
      if (saleMode === 'retail') {
        setCustomer(null);
      }
      setIsCartOpen(false);
    } catch (e) {
      console.error("Sale error:", e);
      handleFirestoreError(e, OperationType.WRITE, 'sales');
    } finally {
      setIsProcessing(false);
    }
  };

  const [printMode, setPrintMode] = useState<'full' | 'individual'>('full');

  const handlePrintReceipt = () => {
    setPrintMode('full');
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 50);
  };

  const handlePrintIndividualItems = () => {
    setPrintMode('individual');
    if (!lastReceipt) return;
    setIsPrinting(true);
    
    setTimeout(() => {
      const style = document.createElement('style');
      style.id = 'print-break-style';
      style.textContent = `
        @media print {
          .receipt-page { page-break-after: always; display: block !important; }
          .receipt-page:last-child { page-break-after: auto; }
          .receipt-full { display: none !important; }
        }
      `;
      document.head.appendChild(style);
      window.print();
      const s = document.getElementById('print-break-style');
      if (s) document.head.removeChild(s);
      setIsPrinting(false);
    }, 50);
  };

  const customerDebt = Number(customer?.debt || 0);
  const customerLimit = Number(customer?.creditLimit || 2000);
  const isLimitExceeded = paymentMethod === 'veresiye' && customer && (customerDebt + total > customerLimit);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeCategory, setActiveCategory] = useState('Tümü');
  const [categories, setCategories] = useState<string[]>(['Tümü']);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setAllProducts(list);
      const cats = ['Tümü', ...new Set(list.map((p: any) => (p.category as string) || 'Genel'))] as string[];
      setCategories(cats);
    });
    return () => unsub();
  }, []);

  const filteredGridProducts = allProducts.filter(p => {
    if (activeCategory !== 'Tümü' && (p.category || 'Genel') !== activeCategory) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (p.name || '').toLowerCase().includes(term) || (p.barcode || '').includes(term);
    }
    return true;
  }).slice(0, 12); // Limit grid to top 12 for performance/UX

  return (
    <div className="p-3 sm:p-4 lg:p-6 h-screen lg:h-[calc(100vh-1rem)] flex flex-col lg:flex-row gap-3 sm:gap-4 lg:gap-6 pb-24 lg:pb-6 overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-semibold animate-fadeIn ${
          toastMessage.type === 'error' ? 'bg-red-600 border border-red-500' : 'bg-slate-900 border border-slate-700'
        }`}>
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-white" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Area: Search, Categories & Grid */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Salesperson Selector Bar */}
        <div className="flex items-center justify-between bg-white px-4 py-2 rounded-2xl border border-slate-200/80 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <UserCircle2 className="w-4 h-4 text-indigo-600" />
              <span>Satış Elemanı:</span>
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSellerDropdownOpen(!isSellerDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-900 transition-all active:scale-95"
              >
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white font-mono text-[10px] font-black tracking-tight">
                  {selectedSeller.code}
                </span>
                <span className="truncate max-w-[140px] sm:max-w-[200px]">{selectedSeller.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isSellerDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 min-w-[220px] p-2 space-y-1 animate-fadeIn">
                  <div className="px-2 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    Satış Elemanı Değiştir
                  </div>
                  {staffList.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">Kayıtlı personel bulunamadı</div>
                  ) : (
                    staffList.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setSelectedSeller({ id: st.id, name: st.name, code: st.sellerCode });
                          setIsSellerDropdownOpen(false);
                          showToast(`Satış elemanı seçildi: [${st.sellerCode}] ${st.name}`);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${
                          selectedSeller.code === st.sellerCode 
                            ? 'bg-indigo-50 text-indigo-700' 
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] font-black text-slate-600">
                            {st.sellerCode}
                          </span>
                          <span className="truncate">{st.name}</span>
                        </div>
                        {selectedSeller.code === st.sellerCode && (
                          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="text-[10px] text-slate-400 uppercase">Giriş:</span>
            <span className="font-mono text-indigo-600">{user?.displayName || user?.email || 'Yetkili'}</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Ürün ara veya barkod okut..."
              className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          <button
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-2 px-5 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-black shadow-lg transition-all active:scale-95 shrink-0"
          >
            <Camera className="w-5 h-5" />
            <span className="hidden sm:inline">BARKOD TARA</span>
          </button>
        </div>

        {/* Category Tabs & View Mode */}
        <div className="flex items-center justify-between gap-4 overflow-hidden">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar flex-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border-2",
                  activeCategory === cat 
                    ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" 
                    : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                )}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>

        {/* Product Grid / List */}
        <div className={cn(
          "flex-1 overflow-y-auto pr-1",
          viewMode === 'grid' 
            ? "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3" 
            : "flex flex-col gap-2"
        )}>
          {filteredGridProducts.map(product => {
            const price = Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0) || 0;
            const stock = Number(product.stock ?? product.miktar ?? product.adet ?? 0) || 0;
            const isLowStock = stock <= Number(product.minStock || 5);

            if (viewMode === 'list') {
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-white p-3 rounded-2xl border-2 border-slate-100 hover:border-blue-500 transition-all flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-blue-50">
                      <Package className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 text-sm truncate uppercase tracking-tight">{product.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{product.category || 'GENEL'} • STOK: {stock}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-blue-600 tabular-nums">
                      {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="group bg-white p-3 rounded-[1.5rem] border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all text-left flex flex-col justify-between gap-3 relative overflow-hidden"
              >
                <div className="space-y-1">
                  <p className="font-black text-slate-900 text-xs sm:text-sm line-clamp-2 leading-tight tracking-tight uppercase">
                    {product.name}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{product.category || 'GENEL'}</p>
                </div>
                <div className="flex items-end justify-between">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">STOK: <span className={cn(isLowStock ? "text-red-600" : "text-slate-600")}>{stock}</span></p>
                    <p className="text-sm font-black text-blue-600 tabular-nums">
                      {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 group-hover:bg-blue-600 text-blue-600 group-hover:text-white flex items-center justify-center transition-colors">
                    <Plus className="w-5 h-5" />
                  </div>
                </div>
                {isLowStock && (
                  <div className="absolute top-0 right-0 p-1 bg-red-100 rounded-bl-xl">
                    <AlertTriangle className="w-3 h-3 text-red-600" />
                  </div>
                )}
              </button>
            );
          })}
          
          {filteredGridProducts.length === 0 && (
            <div className="col-span-full h-full flex flex-col items-center justify-center text-slate-400 py-10 opacity-50">
              <Package className="w-12 h-12 mb-2" />
              <p className="text-sm font-black uppercase tracking-widest">ÜRÜN BULUNAMADI</p>
            </div>
          )}
        </div>

        {/* Cart Preview (Selected items summary) */}
        {cart.length > 0 && (
          <div className="bg-slate-900 rounded-3xl p-4 sm:p-5 text-white flex items-center justify-between shadow-2xl animate-slideUp">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center relative">
                <ShoppingCart className="w-6 h-6" />
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-black">
                  {cart.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SEPET TOPLAMI (+KDV)</p>
                <p className="text-xl font-black text-white tabular-nums">{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCart([])}
                className="p-3 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsCartOpen(true)}
                className="px-6 py-3 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-50 transition-all active:scale-95"
              >
                ÖDEME AL
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cart List Modal for Desktop (if needed) - but I'll keep the sidebar/drawer for both */}
      {/* Revamped Sidebar handle in previous step */}

      {/* Checkout Section (Desktop Sidebar / Mobile Drawer) */}
      <div className={cn(
        "lg:w-[400px] flex flex-col gap-4 transition-all duration-500 ease-in-out",
        "fixed lg:static inset-x-0 bottom-0 z-40 bg-white lg:bg-transparent p-4 lg:p-0 border-t lg:border-none rounded-t-[2.5rem] lg:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.2)] lg:shadow-none h-[85vh] lg:h-auto overflow-y-auto",
        isCartOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0"
      )}>
        {/* Mobile handle indicator */}
        <div 
          className="lg:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 cursor-pointer hover:bg-slate-300 transition-colors" 
          onClick={() => setIsCartOpen(false)}
        />
        
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] border-none lg:border border-slate-200/90 shadow-none lg:shadow-sm space-y-6 pb-20 lg:pb-8">
          <div className="flex items-center justify-between lg:hidden mb-4">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">ÖDEME AL</h2>
            <button 
              onClick={() => setIsCartOpen(false)} 
              className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Cart List for Mobile/Desktop Drawer */}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
            <h3 className="font-black text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              <span>SEPETTEKİ ÜRÜNLER ({cart.length})</span>
            </h3>
            
            {cart.map((item) => (
              <div key={item.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-xs truncate uppercase">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Birim:</span>
                      <input 
                        type="number"
                        className="w-20 h-6 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-blue-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        value={item.price}
                        onChange={(e) => updatePrice(item.id, e.target.value)}
                        step="0.01"
                      />
                      <span className="text-[10px] text-slate-400 font-bold">₺</span>
                    </div>
                  </div>
                  <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center bg-white rounded-xl border border-slate-200 overflow-hidden shrink-0">
                    <button onClick={() => updateQuantity(item.id, -1)} className="px-2.5 py-1.5 hover:bg-slate-50 text-slate-400 font-bold">-</button>
                    <input 
                      type="number"
                      className="w-12 h-8 text-xs font-black text-slate-900 text-center focus:outline-none border-x border-slate-100"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => updateQuantityManual(item.id, e.target.value)}
                      onBlur={() => {
                        if (item.quantity < 1) updateQuantityManual(item.id, '1');
                      }}
                    />
                    <button onClick={() => updateQuantity(item.id, 1)} className="px-2.5 py-1.5 hover:bg-slate-50 text-slate-400 font-bold">+</button>
                  </div>
                  
                  <div className="flex flex-col items-end flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase">İskonto:</span>
                      <input 
                        type="number"
                        placeholder="0"
                        className="w-16 h-7 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-right"
                        value={item.discount || ''}
                        onChange={(e) => updateDiscount(item.id, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <p className="font-black text-blue-600 text-xs mt-1">
                      {calculateItemTotal(item).toLocaleString('tr-TR')} ₺
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                SEPET BOŞ
              </div>
            )}
          </div>

          {/* Totals Section */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-tight">
              <span>ARA TOPLAM:</span>
              <span>{subtotal.toLocaleString('tr-TR')} ₺</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-blue-600 uppercase tracking-tight">
              <span>KDV (%10):</span>
              <span>{taxAmount.toLocaleString('tr-TR')} ₺</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-xs font-bold text-red-600 uppercase tracking-tight">
                <span>TOPLAM İSKONTO:</span>
                <span>-{totalDiscount.toLocaleString('tr-TR')} ₺</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-black text-slate-900 pt-2 border-t border-slate-200">
              <span className="tracking-tighter">GENEL TOPLAM:</span>
              <span className="tabular-nums font-mono">{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          </div>

          {/* Sale Type Selector: Perakende vs Müşteri Satışı */}
          <div className="bg-slate-100/80 p-1.5 rounded-2xl flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSaleMode('retail');
                if (paymentMethod === 'veresiye') setPaymentMethod('cash');
              }}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2",
                saleMode === 'retail'
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Store className="w-4 h-4 text-blue-600" />
              <span>HIZLI FİŞ</span>
            </button>

            <button
              type="button"
              onClick={() => setSaleMode('customer')}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2",
                saleMode === 'customer'
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>CARİ SATIŞ</span>
            </button>
          </div>

          {/* Customer Selection Section */}
          {saleMode === 'customer' ? (
            <div className="space-y-3" ref={customerDropdownRef}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>MÜŞTERİ SEÇİMİ</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="text-blue-600 hover:text-blue-700 text-xs font-black flex items-center gap-1 transition-colors bg-blue-50 px-2 py-1 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>YENİ</span>
                </button>
              </div>

              {customer ? (
                <div className={`p-4 rounded-2xl border-2 relative transition-all animate-scaleIn ${
                  Number(customer.debt || 0) > 0 ? 'bg-red-50/40 border-red-100' : 'bg-blue-50/40 border-blue-100'
                }`}>
                  <button 
                    onClick={() => setCustomer(null)} 
                    className="absolute top-3 right-3 p-1.5 rounded-xl bg-white text-slate-400 hover:text-red-600 transition-colors shadow-sm border border-slate-100"
                    title="Seçimi Kaldır"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <p className="font-black text-slate-900 text-sm pr-8 truncate tracking-tight">{customer.name}</p>
                  <p className="text-[11px] text-slate-500 font-bold font-mono mt-0.5">{customer.phone || 'TELEFON YOK'}</p>

                  <div className="mt-4 pt-3 border-t border-slate-200/60 grid grid-cols-2 gap-3">
                    <div className="bg-white/60 p-2 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[9px] uppercase font-black">Güncel Borç</span>
                      <span className={`font-black text-sm ${Number(customer.debt || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {Number(customer.debt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                    <div className="bg-white/60 p-2 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[9px] uppercase font-black">Kullanılabilir Limit</span>
                      <span className="font-black text-sm text-slate-700">
                        {Number(customer.creditLimit || 2000).toLocaleString('tr-TR')} ₺
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Müşteri ara..."
                      className="w-full pl-11 pr-10 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all shadow-inner"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      onFocus={() => {
                        if (customerSuggestions.length > 0) setIsCustomerDropdownOpen(true);
                      }}
                    />
                    {customerSearchQuery && (
                      <button
                        onClick={() => setCustomerSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isCustomerDropdownOpen && customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-3xl shadow-2xl z-50 max-h-64 overflow-y-auto p-2 space-y-1 animate-fadeIn">
                      {customerSuggestions.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setCustomer(c);
                            setIsCustomerDropdownOpen(false);
                            setCustomerSearchQuery('');
                          }}
                          className="p-3 hover:bg-blue-50/80 rounded-2xl cursor-pointer flex items-center justify-between text-sm transition-all border border-transparent hover:border-blue-100"
                        >
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 truncate tracking-tight">{c.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{c.phone || 'No Telefon'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-xs font-black ${
                              Number(c.debt || 0) > 0 ? 'text-red-600' : 'text-emerald-600'
                            }`}>
                              {Number(c.debt || 0).toLocaleString('tr-TR')} ₺
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center gap-4 text-xs text-slate-500">
              <div className="w-10 h-10 rounded-full bg-slate-200/50 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="font-black text-slate-700 uppercase tracking-wider">İSİMSİZ PERAKENDE SATIŞ</p>
                <p className="font-medium">Müşteri kaydı olmadan hızlıca fiş kesin.</p>
              </div>
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="font-black text-slate-900 mb-4 text-xs uppercase tracking-wider flex items-center gap-2">
              <Banknote className="w-4 h-4 text-blue-600" />
              <span>ÖDEME YÖNTEMİ</span>
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('cash')}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border-2 transition-all group",
                  paymentMethod === 'cash' 
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-md shadow-emerald-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <Banknote className={cn("w-6 h-6 transition-transform group-active:scale-90", paymentMethod === 'cash' ? "text-emerald-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">NAKİT</span>
              </button>

              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('card')}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border-2 transition-all group",
                  paymentMethod === 'card' 
                    ? "border-blue-600 bg-blue-50 text-blue-800 shadow-md shadow-blue-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <CreditCard className={cn("w-6 h-6 transition-transform group-active:scale-90", paymentMethod === 'card' ? "text-blue-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">KART</span>
              </button>

              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('veresiye')}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border-2 transition-all group relative",
                  paymentMethod === 'veresiye' 
                    ? "border-red-600 bg-red-50 text-red-800 shadow-md shadow-red-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <Receipt className={cn("w-6 h-6 transition-transform group-active:scale-90", paymentMethod === 'veresiye' ? "text-red-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">CARİ</span>
                <div className="absolute -top-2 -right-1 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg shadow-sm border border-white">BORÇ</div>
              </button>
            </div>
          </div>

          {/* Multi-Currency & Exchange Rate Selector */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                <span>PARA BİRİMİ</span>
              </h3>
              {selectedCurrency !== 'TRY' && (
                <span className="text-[10px] font-black text-indigo-600 font-mono">
                  1 {selectedCurrency} = {activeRate.toFixed(2)} ₺
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedCurrency('TRY')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border-2 ${
                  selectedCurrency === 'TRY'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>₺ TL</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCurrency('USD')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border-2 ${
                  selectedCurrency === 'USD'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>USD ($)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCurrency('EUR')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border-2 ${
                  selectedCurrency === 'EUR'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Euro className="w-3.5 h-3.5" />
                <span>EUR (€)</span>
              </button>
            </div>

            {/* Manuel Kur Düzenleme Girişi */}
            {selectedCurrency !== 'TRY' && (
              <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 flex items-center justify-between gap-3 animate-fadeIn">
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase text-amber-900 mb-1">
                    {selectedCurrency === 'USD' ? 'Dolar Kuru (₺)' : 'Euro Kuru (₺)'} [Manuel Kur]
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedCurrency === 'USD' ? exchangeRates.USD : exchangeRates.EUR}
                    onChange={(e) => handleUpdateExchangeRate(selectedCurrency as 'USD' | 'EUR', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-sm font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono shadow-inner"
                  />
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[9px] font-black text-amber-700 uppercase">Döviz Tutarı</span>
                  <span className="text-base font-black text-amber-950 font-mono">
                    {selectedCurrency === 'USD' ? '$' : '€'}{foreignTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Price Summary */}
          <div className="bg-slate-900 rounded-[2rem] p-6 text-white space-y-4 shadow-2xl">
            <div className="flex justify-between items-center text-[11px] font-black text-slate-400 tracking-widest uppercase">
              <span>ARA TOPLAM</span>
              <span>{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between items-center text-[11px] font-black text-red-400 tracking-widest uppercase">
                <span>TOPLAM İSKONTO</span>
                <span>-{totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
            )}
            <div className="flex justify-between items-center text-[11px] font-black text-blue-400 tracking-widest uppercase">
              <span>KDV (%10)</span>
              <span>{taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
            <div className="h-px bg-slate-800 my-2"></div>
            
            <div className="space-y-1">
              <div className="flex justify-between items-end">
                <span className="text-xs font-black text-blue-400 tracking-widest uppercase">
                  {selectedCurrency !== 'TRY' ? `ÖDENECEK (${selectedCurrency})` : 'ÖDENECEK'}
                </span>
                <span className="text-3xl font-black tracking-tighter tabular-nums font-mono">
                  {selectedCurrency === 'TRY' ? (
                    <>{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-lg">₺</span></>
                  ) : (
                    <>{selectedCurrency === 'USD' ? '$' : '€'}{foreignTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</>
                  )}
                </span>
              </div>
              {selectedCurrency !== 'TRY' && (
                <div className="flex justify-between text-[11px] text-slate-400 font-bold pt-0.5">
                  <span>TL Karşılığı:</span>
                  <span className="font-mono text-slate-200">₺{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <button 
              disabled={cart.length === 0 || isProcessing || (paymentMethod === 'veresiye' && !customer)}
              onClick={completeSale}
              className={cn(
                "w-full py-5 rounded-2xl font-black text-sm tracking-widest uppercase shadow-2xl transition-all active:scale-[0.97] flex items-center justify-center gap-3 mt-4",
                paymentMethod === 'veresiye'
                  ? "bg-red-600 hover:bg-red-700 shadow-red-600/30 disabled:bg-slate-700 disabled:text-slate-500"
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 disabled:bg-slate-700 disabled:text-slate-500"
              )}
            >
              {isProcessing ? (
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5" />
                  <span>SATIŞI ONAYLA</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Printable Sales Receipt Modal (Satış Fişi) */}
      {isReceiptModalOpen && lastReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Satış Bilgi Fişi</h3>
              </div>
              <button 
                onClick={() => setIsReceiptModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Body (Thermal / Standard format) */}
            <div className="p-5 font-mono text-xs text-slate-800 space-y-3 overflow-y-auto flex-1 print:overflow-visible">
              <div className={cn("receipt-full print:block", printMode === 'individual' ? "print:hidden" : "")}>
                <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 pb-3">
                  <h2 className="text-base font-black tracking-tight">SATIŞ BİLGİ FİŞİ</h2>
                  <p className="text-[11px] text-slate-500">Mali Değeri Yoktur</p>
                  <p className="text-[10px] text-slate-400">Fiş No: {lastReceipt.saleId.slice(0, 8)}</p>
                  <p className="text-[10px] text-slate-400">{format(lastReceipt.date, 'dd.MM.yyyy HH:mm:ss')}</p>
                </div>

                <div className="text-[11px] space-y-0.5 border-b border-dashed border-slate-300 pb-2">
                  <div className="flex justify-between">
                    <span>Müşteri:</span>
                    <span className="font-bold">{lastReceipt.customerName || 'Perakende'}</span>
                  </div>
                  {lastReceipt.customerPhone && (
                    <div className="flex justify-between text-slate-500">
                      <span>Tel:</span>
                      <span>{lastReceipt.customerPhone}</span>
                    </div>
                  )}
                  {lastReceipt.sellerCode && (
                    <div className="flex justify-between text-slate-600">
                      <span>Satış Elemanı:</span>
                      <span className="font-bold font-mono">[{lastReceipt.sellerCode}] {lastReceipt.sellerName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Ödeme Türü:</span>
                    <span className="font-bold">
                      {lastReceipt.paymentMethod === 'cash' ? 'NAKİT' : lastReceipt.paymentMethod === 'card' ? 'KREDİ KARTI' : 'VERESİYE (CARİ)'}
                    </span>
                  </div>
                  {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                    <div className="flex justify-between text-indigo-700 font-bold">
                      <span>Para Birimi:</span>
                      <span>{lastReceipt.currency} (Kur: {lastReceipt.exchangeRate?.toFixed(2)} ₺)</span>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3">
                  <div className="flex justify-between font-bold text-[10px] text-slate-400 uppercase">
                    <span>Ürün</span>
                    <span>Tutar</span>
                  </div>
                  {lastReceipt.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-[11px]">
                      <div className="pr-2">
                        <p className="font-bold text-slate-900 leading-tight uppercase">{item.name}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span>{item.quantity} x {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          {item.discount && item.discount > 0 && (
                            <span className="text-red-600 font-bold">(-{item.discount.toLocaleString('tr-TR')} ₺ İsk)</span>
                          )}
                        </div>
                      </div>
                      <span className="font-bold whitespace-nowrap">
                        {calculateItemTotal(item).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                {(() => {
                  const receiptDiscount = lastReceipt.items.reduce((s, it) => s + (it.discount || 0), 0);
                  const rawItemsTotal = lastReceipt.items.reduce((s, it) => s + (it.price * it.quantity), 0);
                  return (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>ARA TOPLAM:</span>
                        <span>{(rawItemsTotal > 0 ? rawItemsTotal : lastReceipt.subtotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                      {receiptDiscount > 0 && (
                        <div className="flex justify-between text-[11px] text-red-600 font-bold">
                          <span>İSKONTO:</span>
                          <span>-{receiptDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>KDV (%10):</span>
                        <span>{lastReceipt.taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-800 pt-1">
                        <span>GENEL TOPLAM (TL):</span>
                        <span>{lastReceipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                      </div>

                      {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                        <div className="flex justify-between text-sm font-black text-indigo-700 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                          <span>DÖVİZ TUTARI:</span>
                          <span>
                            {lastReceipt.currency === 'USD' ? '$' : '€'}{lastReceipt.foreignAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {lastReceipt.previousDebt !== undefined && (
                        <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-[11px] space-y-0.5">
                          <div className="flex justify-between text-slate-600">
                            <span>Eski Bakiye (Önceki Borç):</span>
                            <span className="font-bold">{(lastReceipt.previousDebt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          </div>
                          <div className="flex justify-between font-bold text-red-700">
                            <span>Güncel Kalan Borç:</span>
                            <span>{(lastReceipt.newDebt !== undefined ? lastReceipt.newDebt : lastReceipt.previousDebt).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="text-center pt-3 border-t border-dashed border-slate-300 text-[10px] text-slate-400 space-y-0.5">
                  <p>İyi günlerde kullanınız.</p>
                  <p>Mali değeri yoktur, bilgi fişidir.</p>
                  <p className="font-bold pt-2 uppercase tracking-widest text-[8px]">by ilyasyksel</p>
                </div>
              </div>

              {/* Individual Item Slips (Hidden in UI, Visible in Print when triggered) */}
              <div className="hidden print:block space-y-8">
                {lastReceipt.items.map((item, idx) => (
                  <div key={`item-${idx}`} className="receipt-page pt-8 space-y-4">
                    <div className="text-center border-b border-dashed border-slate-300 pb-4">
                      <h2 className="text-lg font-black uppercase">SATIŞ FİŞİ</h2>
                      <p className="text-xs font-bold">ÜRÜN ETİKET / FİŞ</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Tarih:</span>
                        <span>{format(lastReceipt.date, 'dd.MM.yyyy')}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Fiş No:</span>
                        <span>{lastReceipt.saleId.slice(0, 8)}</span>
                      </div>
                      <div className="pt-4">
                        <p className="text-slate-500 text-[10px] uppercase font-bold">Satılan Ürün:</p>
                        <p className="text-xl font-black uppercase leading-tight">{item.name}</p>
                      </div>
                      <div className="flex justify-between items-end pt-4">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Miktar:</p>
                          <p className="text-lg font-black">{item.quantity} ADET</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Birim Fiyat:</p>
                          <p className="text-lg font-black">{item.price.toLocaleString('tr-TR')} ₺</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handlePrintReceipt}
                disabled={isPrinting}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>{isPrinting ? 'Hazırlanıyor...' : 'Fişi Yazdır'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrintIndividualItems}
                disabled={isPrinting}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-95"
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>Ayrı Ayrı Yazdır</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HD Barcode Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="POS Barkod Okuyucu"
        description="Barkodu kamera çerçevesine tutun veya fotoğrafını seçin"
        continuous={true}
      />

      {/* Fast Customer Modal (Add directly from POS) */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={(saved) => {
          setCustomer(saved);
          setSaleMode('customer');
          showToast(`Müşteri eklendi ve seçildi: ${saved.name}`);
        }}
      />
    </div>
  );
};

export default POS;
