import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  collection, query, where, getDocs, addDoc, 
  doc, updateDoc, setDoc, increment, serverTimestamp, onSnapshot 
} from 'firebase/firestore';
import { db, auth, sepetayCustomersRef, sepetayProductsRef, sepetayTransactionsRef, sepetaySalesRef } from '../lib/firebase';
import { 
  Search, ShoppingCart, Trash2, User, CreditCard, 
  Banknote, ScanBarcode, Camera, CheckCircle2, AlertCircle, Plus, Check,
  Receipt, ArrowDownRight, UserPlus, X, AlertTriangle, Printer, Store, UserCheck, Package,
  DollarSign, Euro, Coins, UserCircle2, ChevronDown, Percent, FileText, Sparkles, RotateCcw,
  Clock, Pause, Play, Scale, Smartphone, Monitor, Send
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { cn } from '../lib/utils';
import { BarcodeScannerModal } from './scanner/BarcodeScannerModal';
import { CustomerModal, CustomerData } from './customers/CustomerModal';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { recordCashMovement, CurrencyType } from '../lib/kasa-utils';
import { isTenantFeatureEnabled, isTenantSectorModuleEnabled, isSepetayTenant, isTenantPersonnel } from '../lib/tenant';
import { lookupGlobalProduct, saveToGlobalCatalog, GlobalProduct } from '../lib/global-catalog';
import { GlobalProductQuickRegisterModal, QuickRegisteredProductData } from './common/GlobalProductQuickRegisterModal';
import { PrintSelectionModal, PrintFormat } from './common/PrintSelectionModal';
import { loadPrinterSettings, buildReceiptPrintHtml, printHtmlDocument } from '../lib/printer-settings';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  purchasePrice?: number;
  quantity: number;
  stock: number;
  barcode?: string;
  discount?: number; // Price-based discount per item
}

export interface HeldSale {
  id: string;
  cart: CartItem[];
  customer?: CustomerData | null;
  saleMode?: 'retail' | 'customer';
  date: string;
  note?: string;
  total: number;
  sellerCode?: string;
  sellerName?: string;
}

interface CompletedSaleReceipt {
  saleId: string;
  date: Date;
  items: CartItem[];
  subtotal: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'veresiye' | 'cek' | 'senet' | 'parcali';
  cashAmount?: number;
  cardAmount?: number;
  customerName?: string;
  customerPhone?: string;
  previousDebt?: number;
  newDebt?: number;
  currency?: CurrencyType;
  exchangeRate?: number;
  foreignAmount?: number;
  sellerCode?: string;
  sellerName?: string;
  receivedCash?: number;
  changeDue?: number;
}

export interface POSProps {
  initialCustomer?: CustomerData | null;
  onClearInitialCustomer?: () => void;
  cart?: CartItem[];
  setCart?: React.Dispatch<React.SetStateAction<CartItem[]>>;
  heldSales?: HeldSale[];
  setHeldSales?: React.Dispatch<React.SetStateAction<HeldSale[]>>;
  customer?: CustomerData | null;
  setCustomer?: React.Dispatch<React.SetStateAction<CustomerData | null>>;
  saleMode?: 'retail' | 'customer';
  setSaleMode?: React.Dispatch<React.SetStateAction<'retail' | 'customer'>>;
  mobilePosOrdersCount?: number;
  onOpenMobilePosOrders?: () => void;
}

const POS: React.FC<POSProps> = ({ 
  initialCustomer, 
  onClearInitialCustomer,
  cart: propsCart,
  setCart: propsSetCart,
  heldSales: propsHeldSales,
  setHeldSales: propsSetHeldSales,
  customer: propsCustomer,
  setCustomer: propsSetCustomer,
  saleMode: propsSaleMode,
  setSaleMode: propsSetSaleMode,
  mobilePosOrdersCount = 0,
  onOpenMobilePosOrders
}) => {
  const { user, isDemo, checkDemoRestricted, tenantId, tenantName, isDocInTenant, withTenant, currentTenant } = useAuth();
  const isMobilePosSyncEnabled = isTenantFeatureEnabled(currentTenant, 'mobile_pos_sync');
  const [isSendingToDesktop, setIsSendingToDesktop] = useState(false);

  const cartStorageKey = `pos_cart_${tenantId || currentTenant?.id || 'default'}`;

  // Local fallback cart initialized from localStorage so cart survives tab switches and navigation
  const [internalCart, setInternalCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(`pos_cart_${tenantId || currentTenant?.id || 'default'}`) || localStorage.getItem('pos_cart_default');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const cart = propsCart !== undefined ? propsCart : internalCart;
  const setCart: React.Dispatch<React.SetStateAction<CartItem[]>> = (action) => {
    if (propsSetCart) {
      propsSetCart(action);
    } else {
      setInternalCart(prev => {
        const next = typeof action === 'function' ? action(prev) : action;
        try {
          localStorage.setItem(cartStorageKey, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
    }
  };

  // Sync cart changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart, cartStorageKey]);

  // Held sales state (Bekleyen Satışlar)
  const [internalHeldSales, setInternalHeldSales] = useState<HeldSale[]>(() => {
    try {
      const saved = localStorage.getItem(`pos_held_sales_${tenantId || currentTenant?.id || 'default'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const heldSales = propsHeldSales !== undefined ? propsHeldSales : internalHeldSales;
  const setHeldSales: React.Dispatch<React.SetStateAction<HeldSale[]>> = (action) => {
    if (propsSetHeldSales) {
      propsSetHeldSales(action);
    } else {
      setInternalHeldSales(prev => {
        const next = typeof action === 'function' ? action(prev) : action;
        try {
          localStorage.setItem(`pos_held_sales_${tenantId || currentTenant?.id || 'default'}`, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
    }
  };

  // Modals for hold sale & confirm delete
  const [isHeldSalesModalOpen, setIsHeldSalesModalOpen] = useState(false);
  const [isConfirmClearModalOpen, setIsConfirmClearModalOpen] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdNote, setHoldNote] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // Multi-Currency and Manual Exchange Rate states
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyType>('TRY');
  const [exchangeRates, setExchangeRates] = useState<{ USD: number; EUR: number }>({
    USD: Number(localStorage.getItem('sep_rate_usd') || '38.50'),
    EUR: Number(localStorage.getItem('sep_rate_eur') || '41.20')
  });

  // VAT (KDV) Rate state: Defaults to 0 (Genel olarak 0 da kalsın)
  const [taxRate, setTaxRate] = useState<number>(0);

  // Salesperson (Satış Elemanı) states
  const [staffList, setStaffList] = useState<{ id: string; name: string; sellerCode: string }[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<{ id: string; name: string; code: string }>({
    id: user?.uid || 'guest',
    name: user?.displayName || user?.email?.split('@')[0] || 'Kasiyer',
    code: user?.sellerCode || 'E01'
  });
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState(false);

  // Sale Mode: 'retail' (Perakende / Hızlı Fiş) or 'customer' (Kayıtlı Müşteri / Cari)
  const [internalSaleMode, setInternalSaleMode] = useState<'retail' | 'customer'>('retail');
  const [internalCustomer, setInternalCustomer] = useState<CustomerData | null>(null);

  const saleMode = propsSaleMode !== undefined ? propsSaleMode : internalSaleMode;
  const setSaleMode = propsSetSaleMode || setInternalSaleMode;

  const customer = propsCustomer !== undefined ? propsCustomer : internalCustomer;
  const setCustomer = propsSetCustomer || setInternalCustomer;

  const [allCustomers, setAllCustomers] = useState<CustomerData[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'veresiye' | 'cek' | 'senet' | 'parcali'>('cash');
  const [splitCashAmount, setSplitCashAmount] = useState<string>('');
  const [splitCardAmount, setSplitCardAmount] = useState<string>('');
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // Unknown barcode & quick add product modal states
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    name: '',
    barcode: '',
    price: '',
    purchasePrice: '',
    stock: '10',
    category: 'Genel'
  });

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
  
  // Completed Receipt state for printing (persisted in localStorage so Tekrar Yazdır always works)
  const [lastReceipt, setLastReceipt] = useState<CompletedSaleReceipt | null>(() => {
    try {
      const saved = localStorage.getItem(`pos_last_receipt_${tenantId || 'default'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          date: parsed.date ? new Date(parsed.date) : new Date()
        };
      }
    } catch (e) {
      console.warn('Last receipt load warning:', e);
    }
    return null;
  });
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isPrintSelectionModalOpen, setIsPrintSelectionModalOpen] = useState(false);
  const [previewImageState, setPreviewImageState] = useState<{ url: string; title: string } | null>(null);

  // Muhtelif Ürün Modal state
  const [isMuhtelifModalOpen, setIsMuhtelifModalOpen] = useState(false);
  const [muhtelifForm, setMuhtelifForm] = useState({
    name: 'Muhtelif Ürün',
    price: '',
    quantity: '1'
  });

  // Kırtasiye Modülü: Hızlı Fotokopi / Baskı Hesaplama modal state
  const [isPhotocopyModalOpen, setIsPhotocopyModalOpen] = useState(false);
  const [photoPageCount, setPhotoPageCount] = useState<string>('10');
  const [photoCopyCount, setPhotoCopyCount] = useState<string>('1');
  const [photoPaperSize, setPhotoPaperSize] = useState<'A4' | 'A3'>('A4');
  const [photoColorMode, setPhotoColorMode] = useState<'bw' | 'color'>('bw');
  const [photoDoubleSided, setPhotoDoubleSided] = useState<boolean>(false);
  const [photoBinding, setPhotoBinding] = useState<string>('none');
  const [photoLamination, setPhotoLamination] = useState<boolean>(false);
  const [photoLaminationCount, setPhotoLaminationCount] = useState<string>('1');

  // Market & Terazi: Quick Weight Scale Modal state
  const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
  const [scaleItems, setScaleItems] = useState<any[]>([
    { id: 'b1', name: 'Kaşar Peyniri', pricePerKg: 320, plu: '0145' },
    { id: 'b2', name: 'Siyah Zeytin', pricePerKg: 180, plu: '0146' },
    { id: 'b3', name: 'Dana Kıyma', pricePerKg: 490, plu: '0147' },
    { id: 'b4', name: 'Domates Salkım', pricePerKg: 45, plu: '0148' },
    { id: 'b5', name: 'Baldo Pirinç', pricePerKg: 65, plu: '0149' }
  ]);
  const [selectedScaleItem, setSelectedScaleItem] = useState<any>(scaleItems[0]);
  const [scaleWeightKg, setScaleWeightKg] = useState<number>(0.500);
  const [scaleCustomPricePerKg, setScaleCustomPricePerKg] = useState<string>('320');

  useEffect(() => {
    if (!isTenantSectorModuleEnabled(currentTenant, 'bakkal_market_modulu')) return;
    const currentTenantId = tenantId || currentTenant?.id || 'PRIMARY_TENANT';
    const q = query(
      collection(db, 'sectoral_module_items'),
      where('tenantId', '==', currentTenantId),
      where('module', '==', 'bakkal_market_modulu'),
      where('itemType', '==', 'bulk_item')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      if (list.length > 0) {
        setScaleItems(list);
        setSelectedScaleItem(list[0]);
        setScaleCustomPricePerKg(String(list[0].pricePerKg || 320));
      }
    }, (err) => {
      console.warn("Scale items load warning:", err);
    });
    return () => unsub();
  }, [currentTenant, tenantId]);

  const handleAddWeightedItemToCart = () => {
    const priceKg = parseFloat(scaleCustomPricePerKg) || selectedScaleItem?.pricePerKg || 100;
    const weight = scaleWeightKg || 0.5;
    const totalAmount = Math.round(weight * priceKg * 100) / 100;
    const itemName = selectedScaleItem?.name || 'Açık Ürün';
    const pluCode = selectedScaleItem?.plu || '0145';

    const weightedItem: CartItem = {
      id: `scale-${Date.now()}`,
      name: `${itemName} (${weight.toFixed(3)} kg)`,
      price: totalAmount,
      purchasePrice: priceKg * 0.75 * weight,
      quantity: 1,
      stock: 999,
      barcode: `28${pluCode.padStart(5, '0')}00000`,
      discount: 0
    };
    setCart(prev => [...prev, weightedItem]);
    showToast(`⚖️ ${itemName} (${weight.toFixed(3)} kg - ${totalAmount.toFixed(2)} TL) sepete eklendi!`);
    setIsScaleModalOpen(false);
  };

  const getKirtasiyeRates = () => {
    try {
      const tenantKey = tenantId || currentTenant?.id || 'default';
      const saved = localStorage.getItem(`sep_kirtasiye_rates_${tenantKey}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      A4_bw: 1.5,
      A4_color: 5.0,
      A3_bw: 3.0,
      A3_color: 10.0,
      A4_bw_double: 2.5,
      A4_color_double: 8.0,
      A3_bw_double: 5.0,
      A3_color_double: 16.0,
      plasticSpiral: 25,
      wireSpiral: 35,
      thermal: 45,
      laminationPrice: 15
    };
  };

  // Verilen Nakit ve Para Üstü Hesabı
  const [receivedCash, setReceivedCash] = useState<string>('');

  // Barkodsuz Ürünler Bölümü Açık/Kapalı
  const [isNoBarcodePanelOpen, setIsNoBarcodePanelOpen] = useState<boolean>(() => {
    return localStorage.getItem('pos_no_barcode_panel') !== 'false';
  });

  // Ürün İade Alma Modal state
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnMode, setReturnMode] = useState<'retail' | 'customer'>('retail');
  const [returnCustomer, setReturnCustomer] = useState<CustomerData | null>(null);
  const [returnItemSearch, setReturnItemSearch] = useState('');
  const [selectedReturnProduct, setSelectedReturnProduct] = useState<any | null>(null);
  const [returnQty, setReturnQty] = useState('1');
  const [returnUnitPrice, setReturnUnitPrice] = useState('');
  const [returnReason, setReturnReason] = useState('Müşteri İadesi');
  const [restockOnReturn, setRestockOnReturn] = useState(true);
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const customerSearchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Real-time synchronization of all customers for instant search & balance display (including tenants/sepetay/customers without where filter)
  useEffect(() => {
    const isSep = isSepetayTenant(tenantId);
    const map = new Map<string, CustomerData>();

    const updateList = () => {
      const list = Array.from(map.values()).filter(c => isDocInTenant(c));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
      setAllCustomers(list);
    };

    const unsubs: (() => void)[] = [];

    if (isSep) {
      const unsubSepSub = onSnapshot(sepetayCustomersRef, (snap) => {
        snap.docs.forEach(d => {
          map.set(d.id, { id: d.id, tenantId: 'sepetay', tenant_id: 'sepetay', ...(d.data() as any) } as CustomerData);
        });
        updateList();
      }, (err) => {
        console.warn("tenants/sepetay/customers dinleme uyarısı:", err);
      });
      unsubs.push(unsubSepSub);
    }

    ['customers', 'musteriler', 'cariler'].forEach(colName => {
      const u = onSnapshot(collection(db, colName), (snap) => {
        snap.docs.forEach(d => {
          map.set(d.id, { id: d.id, ...d.data() } as CustomerData);
        });
        updateList();
      }, (err) => {
        console.warn(`Müşteri koleksiyonu (${colName}) dinleme uyarısı:`, err);
      });
      unsubs.push(u);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [tenantId]);

  // Filtered customer list for instant selection
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return allCustomers;
    return allCustomers.filter(c => 
      (c.name || '').toLocaleLowerCase('tr-TR').includes(q) ||
      (c.phone || '').includes(q) ||
      (c.notes || '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [allCustomers, customerSearchQuery]);

  // If initialCustomer prop changes (e.g. from Customers -> "Satış Yap")
  const onClearInitialCustomerRef = useRef(onClearInitialCustomer);
  onClearInitialCustomerRef.current = onClearInitialCustomer;

  useEffect(() => {
    if (initialCustomer) {
      const timer = setTimeout(() => {
        setCustomer(initialCustomer);
        setSaleMode('customer');
        setPaymentMethod('veresiye');
        showToast(`Cari müşteri seçildi: ${initialCustomer.name}`);
        if (onClearInitialCustomerRef.current) onClearInitialCustomerRef.current();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialCustomer]);

  // Load staff list for salesperson selection (strictly isolated to the current tenant's own personnel)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs
        .map((d, index) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.displayName || data.username || data.email?.split('@')[0] || `Personel ${index + 1}`,
            sellerCode: data.sellerCode || `E0${index + 1}`,
            username: data.username,
            email: data.email,
            tenantId: data.tenantId,
            tenant_id: data.tenant_id,
            isSuperAdmin: data.isSuperAdmin,
            isActive: data.isActive
          };
        })
        .filter(s => isTenantPersonnel(s, tenantId) && s.isActive !== false);

      setStaffList(list.map(s => ({ id: s.id, name: s.name, sellerCode: s.sellerCode })));

      // Only allow selecting from the tenant's own personnel
      const currentInStaff = user
        ? list.find(
            s =>
              s.id === user.uid ||
              s.id === (user as any).id ||
              (user.sellerCode && s.sellerCode === user.sellerCode) ||
              ((user as any).username && s.username === (user as any).username)
          )
        : null;

      if (currentInStaff) {
        setSelectedSeller({ id: currentInStaff.id, name: currentInStaff.name, code: currentInStaff.sellerCode });
      } else if (list.length > 0) {
        setSelectedSeller(prev => {
          const stillInTenant = list.find(s => s.id === prev.id && s.sellerCode === prev.code);
          if (stillInTenant) {
            return { id: stillInTenant.id, name: stillInTenant.name, code: stillInTenant.sellerCode };
          }
          return { id: list[0].id, name: list[0].name, code: list[0].sellerCode };
        });
      } else {
        setSelectedSeller({
          id: `default-${tenantId}`,
          name: `${currentTenant?.name || 'Mağaza'} Personeli`,
          code: 'P01'
        });
      }
    });
    return () => unsub();
  }, [tenantId, user, currentTenant?.name]);

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

          setSearchResults(results.filter(r => isDocInTenant(r)));
        } catch (e) {
          console.error(e);
        }
      }, 200);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, tenantId]);

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
    const pName = product.name || product.urunAdi || product.title || product.adi || product.isim || product.description || 'İsimsiz Ürün';

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= stockVal) {
          showToast(`Stok yetersiz! Mevcut stok: ${stockVal}`, 'error');
          return prev;
        }
        showToast(`${pName} (+1 Adet)`);
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      showToast(`${pName} sepete eklendi`);
      return [...prev, { 
        id: product.id, 
        name: pName, 
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
      if (!cleanCode) return;

      // 1. Check in memory allProducts first (instant & robust against type mismatches)
      const matchingProduct = allProducts.find(p => String(p.barcode || '').trim() === cleanCode);
      if (matchingProduct) {
        addToCart(matchingProduct);
        showToast(`✅ ${matchingProduct.name} sepete eklendi`);
        return;
      }

      // Check for electronic scale barcode (bakkal_market_modulu)
      if (
        isTenantSectorModuleEnabled(currentTenant, 'bakkal_market_modulu') && 
        cleanCode.length === 13 && 
        ['27', '28', '29'].includes(cleanCode.substring(0, 2))
      ) {
        const pluCode = cleanCode.substring(2, 7);
        const weightGrams = parseInt(cleanCode.substring(7, 12), 10) || 0;
        const weightKg = weightGrams / 1000;

        const scaleMatch = allProducts.find(p => 
          String(p.barcode || '').trim().includes(pluCode) ||
          String(p.id).includes(pluCode)
        );

        if (scaleMatch) {
          const itemPrice = scaleMatch.price || 0;
          const calculatedTotal = Math.round(itemPrice * weightKg * 100) / 100;
          const weightedItem: CartItem = {
            id: `${scaleMatch.id}-${Date.now()}`,
            name: `${scaleMatch.name} (${weightKg.toFixed(3)} kg)`,
            price: calculatedTotal,
            purchasePrice: scaleMatch.purchasePrice ? scaleMatch.purchasePrice * weightKg : 0,
            quantity: 1,
            stock: scaleMatch.stock || 999,
            barcode: cleanCode,
            discount: 0
          };
          setCart(prev => [...prev, weightedItem]);
          showToast(`⚖️ ${scaleMatch.name} (${weightKg.toFixed(3)} kg) terazi tartımı sepete eklendi`);
          return;
        }
      }

      // 2. Fallback to Firestore query
      const q = query(collection(db, 'products'), where('barcode', '==', cleanCode));
      const snap = await getDocs(q);
      const firestoreMatch = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(p => isDocInTenant(p));

      if (firestoreMatch) {
        addToCart(firestoreMatch);
        showToast(`✅ ${(firestoreMatch as any).name} sepete eklendi`);
      } else {
        // Not in tenant's own stock -> Check global_products pool
        const globalFound = await lookupGlobalProduct(cleanCode);
        setGlobalRegisterModal({
          isOpen: true,
          barcode: cleanCode,
          globalProduct: globalFound
        });
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
        // 1. Check in-memory products
        const memoryMatch = allProducts.find(p => String(p.barcode || '').trim() === trimmed);
        if (memoryMatch) {
          addToCart(memoryMatch);
          setSearchTerm('');
          setSearchResults([]);
          return;
        }

        const qBarcode = query(collection(db, 'products'), where('barcode', '==', trimmed));
        const bSnap = await getDocs(qBarcode);
        const matchingProduct = bSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .find(p => isDocInTenant(p));

        if (matchingProduct) {
          addToCart(matchingProduct);
          setSearchTerm('');
          setSearchResults([]);
          return;
        }

        if (searchResults.length > 0) {
          addToCart(searchResults[0]);
          setSearchTerm('');
          setSearchResults([]);
        } else {
          // Check global product pool for new product / auto-recognition
          const globalFound = await lookupGlobalProduct(trimmed);
          setGlobalRegisterModal({
            isOpen: true,
            barcode: trimmed,
            globalProduct: globalFound
          });
        }
      } catch (err) {
        console.error(err);
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'products'), withTenant(newProductData));

      // Save/merge into shared global pool for other tenants
      saveToGlobalCatalog({
        barcode: data.barcode,
        name: data.name,
        category: data.category,
        imageUrl: data.imageUrl,
        price: data.price,
        purchasePrice: data.purchasePrice,
        sourceTenantName: tenantName
      });

      addToCart({
        id: docRef.id,
        name: data.name,
        price: data.price,
        purchasePrice: data.purchasePrice,
        stock: data.stock,
        barcode: data.barcode,
        quantity: 1
      });

      showToast(`✅ "${data.name}" dükkanınıza kaydedildi ve sepete eklendi!`);
      setSearchTerm('');
      setSearchResults([]);
      searchInputRef.current?.focus();
    } catch (err: any) {
      console.error("Error saving quick registered product:", err);
      showToast("Ürün kaydedilirken hata oluştu", "error");
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
  const taxAmount = subtotal * (taxRate / 100);
  const grandTotal = subtotal + taxAmount;

  const activeRate = selectedCurrency === 'USD' ? exchangeRates.USD : selectedCurrency === 'EUR' ? exchangeRates.EUR : 1;
  const foreignTotal = selectedCurrency !== 'TRY' && activeRate > 0 ? Number((grandTotal / activeRate).toFixed(2)) : grandTotal;

  const currentTotalToPay = selectedCurrency !== 'TRY' ? foreignTotal : grandTotal;
  const receivedCashNum = parseFloat(receivedCash.replace(',', '.')) || 0;

  // Hold Sale (Satışı Beklet / Park Et)
  const handleHoldSale = (customNote?: string) => {
    if (cart.length === 0) {
      showToast("Bekletilecek ürün bulunmuyor (Sepet boş)", 'error');
      return;
    }
    const label = customNote || (customer ? customer.name : `Perakende Satış (#${heldSales.length + 1})`);
    const newHeld: HeldSale = {
      id: `held_${Date.now()}`,
      cart: [...cart],
      customer: customer ? { ...customer } : null,
      saleMode,
      date: new Date().toISOString(),
      note: label,
      total: grandTotal,
      sellerCode: selectedSeller.code,
      sellerName: selectedSeller.name
    };

    setHeldSales(prev => {
      const updated = [newHeld, ...prev];
      try {
        localStorage.setItem(`pos_held_sales_${tenantId || currentTenant?.id || 'default'}`, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });

    setCart([]);
    if (saleMode === 'retail') {
      setCustomer(null);
    }
    setIsHoldModalOpen(false);
    setHoldNote('');
    showToast(`🕒 Satış beklemeye alındı: "${label}"`, 'success');
  };

  // Send Sale / Cart from Mobile (or any terminal) to all PC Desktop POS screens for this tenant
  const handleSendToDesktopPOS = async () => {
    if (!isMobilePosSyncEnabled) {
      showToast('Bu özellik Süper Admin tarafından bu işletme için kapatılmıştır.', 'error');
      return;
    }
    if (cart.length === 0) {
      showToast('PC Masaüstüne gönderilecek ürün bulunmuyor (Sepet boş)', 'error');
      return;
    }
    if (isSendingToDesktop) return;
    if (checkDemoRestricted('PC Masaüstüne satış gönderme')) return;

    setIsSendingToDesktop(true);
    try {
      await addDoc(collection(db, 'mobile_pos_orders'), withTenant({
        cart: cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          purchasePrice: item.purchasePrice || 0,
          quantity: item.quantity,
          stock: item.stock,
          barcode: item.barcode || '',
          discount: item.discount || 0
        })),
        customer: customer ? { ...customer } : null,
        saleMode,
        paymentMethod,
        subtotal,
        taxRate,
        taxAmount,
        discount: totalDiscount,
        total: grandTotal,
        sellerCode: selectedSeller.code,
        sellerName: selectedSeller.name || user?.displayName || 'Mobil Kullanıcı',
        sellerId: selectedSeller.id,
        senderUid: user?.uid || 'guest',
        orderType: 'CART_TRANSFER',
        status: 'PENDING',
        createdAt: serverTimestamp(),
        timestampMs: Date.now()
      }));

      setCart([]);
      if (saleMode === 'retail') {
        setCustomer(null);
      }
      setIsCartOpen(false);
      showToast('💻 Satış bütün kullanıcılar için PC Masaüstü Kasaya gönderildi!', 'success');
    } catch (err: any) {
      console.error('Send to desktop error:', err);
      showToast('PC Masaüstüne gönderilirken hata oluştu: ' + (err?.message || 'Lütfen tekrar deneyin'), 'error');
    } finally {
      setIsSendingToDesktop(false);
    }
  };

  const handleResumeHeldSale = (item: HeldSale) => {
    if (cart.length > 0) {
      const parkCurrent: HeldSale = {
        id: `held_${Date.now()}`,
        cart: [...cart],
        customer: customer ? { ...customer } : null,
        saleMode,
        date: new Date().toISOString(),
        note: customer ? customer.name : `Perakende Satış`,
        total: grandTotal,
        sellerCode: selectedSeller.code,
        sellerName: selectedSeller.name
      };
      setHeldSales(prev => [parkCurrent, ...prev.filter(h => h.id !== item.id)]);
      showToast(`Mevcut aktif satış beklemeye alındı, ${item.note || 'seçilen satış'} yüklendi`, 'success');
    } else {
      setHeldSales(prev => prev.filter(h => h.id !== item.id));
      showToast(`✅ "${item.note || 'Satış'}" satış ekranına geri yüklendi`, 'success');
    }

    setCart(item.cart);
    if (item.customer) {
      setCustomer(item.customer);
      setSaleMode('customer');
    } else {
      setCustomer(null);
      setSaleMode(item.saleMode || 'retail');
    }
    setIsHeldSalesModalOpen(false);
  };

  const handleDeleteHeldSale = (id: string) => {
    setHeldSales(prev => {
      const updated = prev.filter(h => h.id !== id);
      try {
        localStorage.setItem(`pos_held_sales_${tenantId || currentTenant?.id || 'default'}`, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
    showToast("Bekleyen satış silindi", 'success');
  };

  const handleClearActiveCart = () => {
    setCart([]);
    if (saleMode === 'retail') {
      setCustomer(null);
    }
    setIsConfirmClearModalOpen(false);
    showToast("Sepet ve satış sıfırlandı", 'success');
  };
  const changeDue = receivedCashNum >= currentTotalToPay ? Number((receivedCashNum - currentTotalToPay).toFixed(2)) : 0;

  // Muhtelif Ürün Sepete Ekleme
  const handleAddMuhtelifProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const priceVal = parseFloat(muhtelifForm.price.replace(',', '.')) || 0;
    const qtyVal = parseInt(muhtelifForm.quantity, 10) || 1;
    if (priceVal <= 0) {
      showToast("Lütfen geçerli bir fiyat giriniz.", 'error');
      return;
    }
    const customItem: CartItem = {
      id: `muhtelif-${Date.now()}`,
      name: muhtelifForm.name.trim() || 'Muhtelif Ürün',
      price: priceVal,
      purchasePrice: 0,
      quantity: qtyVal,
      stock: 9999,
      barcode: 'MUHTELIF',
      discount: 0
    };
    setCart(prev => [...prev, customItem]);
    showToast(`✨ "${customItem.name}" sepete eklendi.`);
    setIsMuhtelifModalOpen(false);
    setMuhtelifForm({ name: 'Muhtelif Ürün', price: '', quantity: '1' });
  };

  // Kırtasiye Modülü: Fotokopi Hesaplayıp Sepete Aktarma
  const handleAddQuickPhotocopy = (e: React.FormEvent) => {
    e.preventDefault();
    const pages = Math.max(1, parseInt(photoPageCount, 10) || 1);
    const copies = Math.max(1, parseInt(photoCopyCount, 10) || 1);
    const rates = getKirtasiyeRates();

    let baseRate = 1.5;
    if (photoPaperSize === 'A4') {
      if (photoDoubleSided) {
        baseRate = photoColorMode === 'bw' ? rates.A4_bw_double : rates.A4_color_double;
      } else {
        baseRate = photoColorMode === 'bw' ? rates.A4_bw : rates.A4_color;
      }
    } else {
      if (photoDoubleSided) {
        baseRate = photoColorMode === 'bw' ? rates.A3_bw_double : rates.A3_color_double;
      } else {
        baseRate = photoColorMode === 'bw' ? rates.A3_bw : rates.A3_color;
      }
    }

    const printCost = pages * copies * baseRate;
    const bindingExtra = photoBinding === 'plastic' ? rates.plasticSpiral : photoBinding === 'wire' ? rates.wireSpiral : photoBinding === 'thermal' ? rates.thermal : 0;
    const laminationCost = photoLamination ? (rates.laminationPrice || 15) * (parseInt(photoLaminationCount, 10) || 1) : 0;
    const total = printCost + bindingExtra + laminationCost;

    const label = `Fotokopi / Baskı (${pages} Sayfa × ${copies} Kopya - ${photoPaperSize} ${photoColorMode === 'color' ? 'Renkli' : 'S/B'}${photoDoubleSided ? ' Çift Yön' : ''}${bindingExtra > 0 ? ' +Cilt' : ''}${photoLamination ? ` +${photoLaminationCount} PVC` : ''})`;

    const customItem: CartItem = {
      id: `fotokopi-${Date.now()}`,
      name: label,
      price: Math.round(total * 100) / 100,
      purchasePrice: 0,
      quantity: 1,
      stock: 9999,
      barcode: 'FOTOKOPI',
      discount: 0
    };
    setCart(prev => [...prev, customItem]);
    showToast(`🖨️ "${label}" sepete eklendi.`);
    setIsPhotocopyModalOpen(false);
  };

  // Ürün İadesi İşleme (Perakende & Cari)
  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturnProduct) {
      showToast("Lütfen iade alınacak bir ürün seçiniz.", 'error');
      return;
    }
    const qty = parseInt(returnQty, 10) || 1;
    const unitPrice = parseFloat(returnUnitPrice.replace(',', '.')) || 0;
    const returnTotal = Number((qty * unitPrice).toFixed(2));
    if (qty <= 0 || returnTotal <= 0) {
      showToast("Lütfen geçerli bir adet ve iade tutarı giriniz.", 'error');
      return;
    }

    if (returnMode === 'customer' && !returnCustomer?.id) {
      showToast("Lütfen cari borcundan düşülecek müşteriyi seçiniz.", 'error');
      return;
    }

    setIsProcessingReturn(true);
    try {
      // 1. Restock if requested
      if (restockOnReturn && selectedReturnProduct.id && !selectedReturnProduct.id.startsWith('muhtelif-')) {
        try {
          await updateDoc(doc(db, 'products', selectedReturnProduct.id), {
            stock: increment(qty),
            updatedAt: serverTimestamp()
          });
        } catch (stockErr) {
          console.warn("İade stok artırımı hatası:", stockErr);
        }
      }

      // 2. Financial settlement
      if (returnMode === 'retail') {
        await recordCashMovement({
          currency: 'TRY',
          type: 'OUT',
          amount: returnTotal,
          category: 'EXPENSE',
          description: `Perakende Ürün İadesi (${returnReason}): ${selectedReturnProduct.name} (${qty} Adet)`,
          sellerCode: selectedSeller.code,
          sellerName: selectedSeller.name,
          tenantId
        });

        await addDoc(collection(db, 'sales'), withTenant({
          items: [{
            id: selectedReturnProduct.id,
            name: `[İADE] ${selectedReturnProduct.name}`,
            price: -unitPrice,
            quantity: qty,
            stock: 0,
            barcode: selectedReturnProduct.barcode || ''
          }],
          subtotal: -returnTotal,
          taxRate: 0,
          taxAmount: 0,
          total: -returnTotal,
          currency: 'TRY',
          sellerCode: selectedSeller.code,
          sellerName: selectedSeller.name,
          sellerId: selectedSeller.id,
          saleType: 'retail_return',
          returnReason,
          date: serverTimestamp(),
          paymentMethod: 'cash'
        }));

        showToast(`🎉 Perakende ürün iadesi alındı (${returnTotal.toLocaleString('tr-TR')} ₺ nakit ödendi).`);
      } else if (returnMode === 'customer' && returnCustomer?.id) {
        const currentCustDebt = Number(returnCustomer.debt || 0);
        const newCustDebt = Math.max(0, Number((currentCustDebt - returnTotal).toFixed(2)));

        await updateDoc(doc(db, 'customers', returnCustomer.id), {
          debt: increment(-returnTotal),
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'customer_transactions'), withTenant({
          customerId: returnCustomer.id,
          customerName: returnCustomer.name,
          type: 'PAYMENT',
          title: `Ürün İadesi (${returnReason}): ${selectedReturnProduct.name} (${qty} Adet)`,
          amount: returnTotal,
          previousBalance: currentCustDebt,
          balanceAfter: newCustDebt,
          paymentMethod: 'Ürün İadesi',
          date: serverTimestamp()
        }));

        await addDoc(collection(db, 'sales'), withTenant({
          items: [{
            id: selectedReturnProduct.id,
            name: `[İADE] ${selectedReturnProduct.name}`,
            price: -unitPrice,
            quantity: qty,
            stock: 0,
            barcode: selectedReturnProduct.barcode || ''
          }],
          subtotal: -returnTotal,
          taxRate: 0,
          taxAmount: 0,
          total: -returnTotal,
          currency: 'TRY',
          sellerCode: selectedSeller.code,
          sellerName: selectedSeller.name,
          sellerId: selectedSeller.id,
          saleType: 'customer_return',
          customerId: returnCustomer.id,
          customerName: returnCustomer.name,
          returnReason,
          date: serverTimestamp(),
          paymentMethod: 'veresiye'
        }));

        showToast(`🎉 Cari ürün iadesi alındı (${returnCustomer.name} hesabından ${returnTotal.toLocaleString('tr-TR')} ₺ borç düşüldü).`);
      }

      setIsReturnModalOpen(false);
      setSelectedReturnProduct(null);
      setReturnItemSearch('');
      setReturnQty('1');
      setReturnUnitPrice('');
      setReturnReason('Müşteri İadesi');
    } catch (err: any) {
      console.error("Return error:", err);
      showToast("İade kaydedilirken hata oluştu: " + (err?.message || "Lütfen tekrar deneyin"), 'error');
    } finally {
      setIsProcessingReturn(false);
    }
  };

  // Switch to customer mode automatically if Veresiye, Çek or Senet is clicked, or open Split Modal for Parcali
  const handleSelectPaymentMethod = (method: 'cash' | 'card' | 'veresiye' | 'cek' | 'senet' | 'parcali') => {
    if (method === 'parcali') {
      setPaymentMethod('parcali');
      if (!splitCashAmount && !splitCardAmount) {
        setSplitCashAmount((currentTotalToPay / 2).toFixed(2));
        setSplitCardAmount((currentTotalToPay - (currentTotalToPay / 2)).toFixed(2));
      }
      setIsSplitModalOpen(true);
      return;
    }

    setPaymentMethod(method);
    if (method === 'veresiye' || method === 'cek' || method === 'senet') {
      setSaleMode('customer');
      if (!customer) {
        setIsCustomerDropdownOpen(true);
        showToast("Cari, Çek veya Senet satışı için lütfen cari müşteri seçin.", 'error');
        customerSearchInputRef.current?.focus();
      }
    }
  };

  const handleCashChange = (val: string) => {
    setSplitCashAmount(val);
    const cashNum = parseFloat(val.replace(',', '.')) || 0;
    const remaining = Math.max(0, currentTotalToPay - cashNum);
    setSplitCardAmount(remaining > 0 ? remaining.toFixed(2) : '');
  };

  const handleCardChange = (val: string) => {
    setSplitCardAmount(val);
    const cardNum = parseFloat(val.replace(',', '.')) || 0;
    const remaining = Math.max(0, currentTotalToPay - cardNum);
    setSplitCashAmount(remaining > 0 ? remaining.toFixed(2) : '');
  };

  // Complete Sale
  const completeSale = async (autoPrint: boolean = false) => {
    if (cart.length === 0) {
      showToast('⚠️ Sepetiniz boş! Lütfen önce ürün ekleyin.', 'error');
      return;
    }
    if (isProcessing) return;
    if (checkDemoRestricted("Satış tamamlama")) return;

    // Check Veresiye / Çek / Senet constraints
    const isDebtType = paymentMethod === 'veresiye' || paymentMethod === 'cek' || paymentMethod === 'senet';
    if (isDebtType && (!customer || !customer.id)) {
      setSaleMode('customer');
      setIsCustomerDropdownOpen(true);
      showToast('⚠️ Cari, Çek veya Senet satışı için lütfen bir müşteri seçin veya + YENİ butonuyla ekleyin!', 'error');
      customerSearchInputRef.current?.focus();
      return;
    }

    if (paymentMethod === 'parcali') {
      const cAmt = parseFloat(splitCashAmount.replace(',', '.')) || 0;
      const kAmt = parseFloat(splitCardAmount.replace(',', '.')) || 0;
      if (Math.abs((cAmt + kAmt) - currentTotalToPay) >= 0.01) {
        showToast('⚠️ Ödeme tutarı toplam tutara eşit olmalıdır!', 'error');
        setIsSplitModalOpen(true);
        return;
      }
    }

    setIsProcessing(true);

    try {
      const isCustomerSale = saleMode === 'customer' && !!customer;
      const currentDebt = Number(customer?.debt || 0);
      const newDebt = Number((currentDebt + grandTotal).toFixed(2));

      const cashAmt = paymentMethod === 'parcali' ? (parseFloat(splitCashAmount.replace(',', '.')) || 0) : paymentMethod === 'cash' ? grandTotal : 0;
      const cardAmt = paymentMethod === 'parcali' ? (parseFloat(splitCardAmount.replace(',', '.')) || 0) : paymentMethod === 'card' ? grandTotal : 0;

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
        taxRate,
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
        paymentMethod,
        ...(paymentMethod === 'parcali' ? {
          cashAmount: cashAmt,
          cardAmount: cardAmt
        } : {})
      };

      const saleRef = await addDoc(collection(db, 'sales'), withTenant(saleData));

      // If sale is added/completed on a mobile screen and tenant has mobile_pos_sync enabled, notify all PC Desktop users
      if (isMobilePosSyncEnabled && typeof window !== 'undefined' && window.innerWidth < 1024) {
        try {
          await addDoc(collection(db, 'mobile_pos_orders'), withTenant({
            cart: cart.map(item => ({
              id: item.id,
              name: item.name,
              price: item.price,
              purchasePrice: item.purchasePrice || 0,
              quantity: item.quantity,
              stock: item.stock,
              barcode: item.barcode || '',
              discount: item.discount || 0
            })),
            customer: isCustomerSale && customer ? { ...customer } : null,
            saleMode,
            paymentMethod,
            subtotal,
            taxRate,
            taxAmount,
            discount: totalDiscount,
            total: grandTotal,
            sellerCode: selectedSeller.code,
            sellerName: selectedSeller.name || user?.displayName || 'Mobil Kullanıcı',
            sellerId: selectedSeller.id,
            senderUid: user?.uid || 'guest',
            saleId: saleRef.id,
            orderType: 'COMPLETED_SALE',
            status: 'PENDING',
            createdAt: serverTimestamp(),
            timestampMs: Date.now()
          }));
        } catch (mobSyncErr) {
          console.warn('Mobile to PC sale notification warning:', mobSyncErr);
        }
      }

      // Decrement stock for items safely (skip custom/muhtelif products)
      for (const item of cart) {
        if (item.id.startsWith('muhtelif-') || item.barcode === 'MUHTELIF') continue;
        try {
          await updateDoc(doc(db, 'products', item.id), {
            stock: increment(-item.quantity),
            updatedAt: serverTimestamp()
          });
        } catch (stockErr) {
          console.warn(`Stok düşümü atlandı (${item.name}):`, stockErr);
        }
      }

      // Record payment into the respective Cash Register or Portfolio
      if (paymentMethod === 'cash' || paymentMethod === 'cek' || paymentMethod === 'senet' || paymentMethod === 'parcali') {
        try {
          if (paymentMethod === 'parcali') {
            if (cashAmt > 0) {
              await recordCashMovement({
                currency: selectedCurrency as any,
                type: 'IN',
                amount: cashAmt,
                category: 'SALE',
                description: `Parçalı Ödeme (Nakit Kısmı) Satış Tahsilatı (Fiş No: ${saleRef.id.slice(0, 8)}) - ${selectedSeller.code} ${selectedSeller.name}`,
                referenceId: saleRef.id,
                sellerCode: selectedSeller.code,
                sellerName: selectedSeller.name,
                exchangeRate: selectedCurrency !== 'TRY' ? activeRate : null,
                tenantId
              });
            }
          } else {
            const regCurrency = paymentMethod === 'cek' ? 'CEK' : paymentMethod === 'senet' ? 'SENET' : selectedCurrency;
            const methodLabel = paymentMethod === 'cek' ? 'Çek' : paymentMethod === 'senet' ? 'Senet' : 'Nakit';
            await recordCashMovement({
              currency: regCurrency as any,
              type: 'IN',
              amount: selectedCurrency !== 'TRY' && paymentMethod === 'cash' ? foreignTotal : grandTotal,
              category: 'SALE',
              description: `${methodLabel} Satış Tahsilatı (Fiş No: ${saleRef.id.slice(0, 8)}) - ${selectedSeller.code} ${selectedSeller.name}`,
              referenceId: saleRef.id,
              sellerCode: selectedSeller.code,
              sellerName: selectedSeller.name,
              exchangeRate: selectedCurrency !== 'TRY' ? activeRate : null,
              tenantId
            });
          }
        } catch (cashErr) {
          console.warn("Kasa kaydı hatası:", cashErr);
        }
      }

      // Handle Customer Transaction Recording
      if (isCustomerSale && customer?.id) {
        try {
          const itemsSummary = cart.map(i => `${i.quantity}x ${i.name}`).join(', ');
          const isDebtType = paymentMethod === 'veresiye' || paymentMethod === 'cek' || paymentMethod === 'senet';
          
          const methodLabel = paymentMethod === 'veresiye' ? 'Cari (Veresiye)' : paymentMethod === 'cek' ? 'Çek' : paymentMethod === 'senet' ? 'Senet' : paymentMethod === 'cash' ? 'Nakit' : 'Kredi Kartı';
          
          // Update customer document
          const customerUpdates: any = {
            loyaltyPoints: increment(Math.floor(grandTotal / 10)),
            totalSpent: increment(grandTotal),
            updatedAt: serverTimestamp()
          };
          if (isDebtType) {
            customerUpdates.debt = increment(grandTotal);
          }
          await updateDoc(doc(db, 'customers', customer.id), customerUpdates);

          // Record in ledger
          await addDoc(collection(db, 'customer_transactions'), withTenant({
            customerId: customer.id,
            customerName: customer.name,
            saleId: saleRef.id,
            type: isDebtType ? 'DEBT' : 'PURCHASE',
            title: `${methodLabel} Satış (${itemsSummary.length > 70 ? itemsSummary.substring(0, 70) + '...' : itemsSummary})`,
            amount: grandTotal,
            previousBalance: currentDebt,
            paymentMethod: methodLabel,
            balanceAfter: isDebtType ? newDebt : currentDebt, 
            currency: selectedCurrency,
            exchangeRate: activeRate || 1,
            foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : null,
            sellerCode: selectedSeller.code || 'E01',
            sellerName: selectedSeller.name || 'Kasiyer',
            date: serverTimestamp()
          }));

          // Immediately update local customer state
          setCustomer(prev => prev ? {
            ...prev,
            debt: isDebtType ? newDebt : Number(prev.debt || 0),
            loyaltyPoints: (prev.loyaltyPoints || 0) + Math.floor(grandTotal / 10),
            totalSpent: (prev.totalSpent || 0) + grandTotal
          } : null);

          if (isDebtType) {
            showToast(`🎉 ${methodLabel} satış tamamlandı! (${customer.name} carisine ${grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ işlendi)`);
          } else {
            showToast(`🎉 Satış tamamlandı (${paymentMethod === 'cash' ? 'Nakit' : 'Kredi Kartı'})! Puan yüklendi.`);
          }
        } catch (custErr) {
          console.error("Müşteri cari ekstresi kaydı hatası:", custErr);
          showToast("Müşteri carisi işlenirken bir sorun oluştu!", 'error');
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
        taxRate,
        taxAmount,
        total: grandTotal,
        paymentMethod,
        cashAmount: paymentMethod === 'parcali' ? cashAmt : undefined,
        cardAmount: paymentMethod === 'parcali' ? cardAmt : undefined,
        customerName: isCustomerSale ? customer.name : 'Perakende Müşteri',
        customerPhone: isCustomerSale ? customer.phone : undefined,
        previousDebt: isCustomerSale ? currentDebt : undefined,
        newDebt: isCustomerSale ? (paymentMethod === 'veresiye' ? newDebt : currentDebt) : undefined,
        currency: selectedCurrency,
        exchangeRate: activeRate,
        foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : undefined,
        sellerCode: selectedSeller.code,
        sellerName: selectedSeller.name,
        receivedCash: paymentMethod === 'cash' && receivedCashNum > 0 ? receivedCashNum : undefined,
        changeDue: paymentMethod === 'cash' && changeDue > 0 ? changeDue : undefined
      };

      setLastReceipt(receiptData);
      try {
        localStorage.setItem(`pos_last_receipt_${tenantId || 'default'}`, JSON.stringify(receiptData));
      } catch (e) {
        console.warn('Could not persist lastReceipt:', e);
      }
      
      setCart([]);
      setReceivedCash('');
      if (saleMode === 'retail') {
        setCustomer(null);
      }
      setIsCartOpen(false);

      if (autoPrint) {
        setIsPrintSelectionModalOpen(true);
      }
    } catch (e: any) {
      console.error("Sale error:", e);
      showToast("Satış kaydedilirken hata oluştu: " + (e?.message || "Lütfen tekrar deneyin"), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const [receiptFormat, setReceiptFormat] = useState<'a4' | 'thermal'>(() => {
    return (localStorage.getItem('pos_preferred_receipt_format') as 'a4' | 'thermal') || 'a4';
  });

  const handleSelectReceiptFormat = (fmt: 'a4' | 'thermal') => {
    setReceiptFormat(fmt);
    try {
      localStorage.setItem('pos_preferred_receipt_format', fmt);
    } catch (e) {
      console.warn("Storage save warning:", e);
    }
  };

  // Sync body data-attributes whenever receipt modal or format changes to guarantee print isolation
  useEffect(() => {
    if (isReceiptModalOpen) {
      document.body.setAttribute('data-receipt-modal-active', 'true');
      document.body.setAttribute('data-receipt-format', receiptFormat);
    } else {
      document.body.removeAttribute('data-receipt-modal-active');
      document.body.removeAttribute('data-receipt-format');
      document.body.removeAttribute('data-receipt-printing');
      document.body.classList.remove('printing-pos-receipt-a4', 'printing-pos-receipt-thermal', 'printing-pos-receipt-items');
    }
    return () => {
      document.body.removeAttribute('data-receipt-modal-active');
      document.body.removeAttribute('data-receipt-format');
      document.body.removeAttribute('data-receipt-printing');
      document.body.classList.remove('printing-pos-receipt-a4', 'printing-pos-receipt-thermal', 'printing-pos-receipt-items');
    };
  }, [isReceiptModalOpen, receiptFormat]);

  // Helper function 'triggerPrintDialog' that sets body class to 'printing-pos-receipt-a4' and triggers window.print()
  const triggerPrintDialog = (format: 'a4' | 'thermal' | 'items' = 'a4', onComplete?: () => void) => {
    if (format === 'a4' || format === 'thermal') {
      handleSelectReceiptFormat(format);
    }
    setIsPrinting(true);

    // Sets document body class to 'printing-pos-receipt-a4' (or format) and data attributes
    document.body.classList.remove('printing-pos-receipt-a4', 'printing-pos-receipt-thermal', 'printing-pos-receipt-items');
    document.body.classList.add(`printing-pos-receipt-${format}`);
    document.body.setAttribute('data-receipt-printing', 'true');
    document.body.setAttribute('data-receipt-format', format);

    // Update dynamic @page style tag so the print layout and native printer selection is enabled
    let pageStyleEl = document.getElementById('dynamic-pos-print-page-style');
    if (!pageStyleEl) {
      pageStyleEl = document.createElement('style');
      pageStyleEl.id = 'dynamic-pos-print-page-style';
      document.head.appendChild(pageStyleEl);
    }

    if (format === 'thermal') {
      pageStyleEl.textContent = `@media print { @page { size: 80mm auto !important; margin: 2mm 1mm 4mm 1mm !important; } }`;
    } else {
      pageStyleEl.textContent = `@media print { @page { margin: 8mm 10mm 10mm 10mm; } }`;
    }

    const cleanup = () => {
      document.body.classList.remove('printing-pos-receipt-a4', 'printing-pos-receipt-thermal', 'printing-pos-receipt-items');
      document.body.removeAttribute('data-receipt-printing');
      setIsPrinting(false);
      window.removeEventListener('afterprint', cleanup);
      if (onComplete) onComplete();
    };

    window.addEventListener('afterprint', cleanup, { once: true });

    // Triggers 'window.print()' using a 'setTimeout' delay to ensure the browser has fully rendered the DOM for the print layout
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn("window.print() error:", err);
      }
      // Safety cleanup so the button never stays stuck on 'Yazdırılıyor...'
      setTimeout(cleanup, 1200);
    }, 150);
  };

  const handleOpenReceiptPrintWindow = (formatType: 'a4' | 'thermal', customReceipt?: CompletedSaleReceipt) => {
    handleSelectReceiptFormat(formatType);
    const targetReceipt = customReceipt || lastReceipt;
    if (!targetReceipt) return;

    const printerConfig = loadPrinterSettings(tenantId);
    const storeName = currentTenant?.name || tenantName || (isSepetayTenant(tenantId) ? 'Sepetay Kırtasiye & Büro' : 'İşletme Mağazası');
    const storeAddress = currentTenant?.address || '';
    const storePhone = currentTenant?.phone || '';

    const paymentLabel = targetReceipt.paymentMethod === 'cash' ? 'Nakit Ödeme' :
                         targetReceipt.paymentMethod === 'card' ? 'Kredi Kartı' :
                         targetReceipt.paymentMethod === 'parcali' ? `Parçalı (Nakit: ${targetReceipt.cashAmount || 0}₺, Kart: ${targetReceipt.cardAmount || 0}₺)` :
                         targetReceipt.paymentMethod === 'cek' ? 'Çek' :
                         targetReceipt.paymentMethod === 'senet' ? 'Senet' : 'Veresiye (Cari Hesap)';

    const safeDate =
      targetReceipt.date instanceof Date && !isNaN(targetReceipt.date.getTime())
        ? targetReceipt.date
        : new Date(targetReceipt.date || Date.now());

    const htmlContent = buildReceiptPrintHtml(
      formatType,
      {
        saleId: targetReceipt.saleId || 'SATIS',
        dateFormatted: format(safeDate, 'dd.MM.yyyy HH:mm:ss'),
        items: (targetReceipt.items || []).map(it => ({
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          discount: it.discount,
          barcode: it.barcode
        })),
        subtotal: targetReceipt.subtotal || 0,
        taxRate: targetReceipt.taxRate ?? 20,
        taxAmount: targetReceipt.taxAmount || 0,
        total: targetReceipt.total || 0,
        paymentMethodLabel: paymentLabel,
        customerName: targetReceipt.customerName || 'Perakende Müşteri',
        customerPhone: targetReceipt.customerPhone,
        previousDebt: targetReceipt.previousDebt,
        newDebt: targetReceipt.newDebt,
        sellerCode: targetReceipt.sellerCode,
        sellerName: targetReceipt.sellerName,
        currency: targetReceipt.currency,
        exchangeRate: targetReceipt.exchangeRate,
        foreignAmount: targetReceipt.foreignAmount
      },
      {
        name: storeName,
        address: storeAddress,
        phone: storePhone
      },
      printerConfig
    );

    printHtmlDocument(htmlContent);
  };

  const handlePrintA4 = () => {
    handleOpenReceiptPrintWindow('a4');
  };

  const handlePrintThermal = () => {
    handleOpenReceiptPrintWindow('thermal');
  };

  const handlePrintIndividualItems = () => {
    triggerPrintDialog('items');
  };

  // General print button based on currently selected format
  const handlePrintCurrentReceipt = () => {
    handleOpenReceiptPrintWindow(receiptFormat);
  };

  const customerDebt = Number(customer?.debt || 0);
  const customerLimit = Number(customer?.creditLimit || 2000);
  const isLimitExceeded = paymentMethod === 'veresiye' && customer && (customerDebt + total > customerLimit);


  const [activeCategory, setActiveCategory] = useState('Tümü');
  const [categories, setCategories] = useState<string[]>(['Tümü']);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  useEffect(() => {
    const isSep = isSepetayTenant(tenantId);
    const collNames = ['products', 'urunler', 'stok'];
    const map = new Map<string, any>();

    const updateCombined = () => {
      const list = Array.from(map.values()).filter(p => isDocInTenant(p));
      setAllProducts(list);
      const cats = ['Tümü', ...new Set(list.map((p: any) => (p.category as string) || 'Genel'))] as string[];
      setCategories(cats);
    };

    const unsubs: (() => void)[] = [];

    // Direct listener on tenants/sepetay/products without where filter
    if (isSep) {
      const unsubSepSub = onSnapshot(sepetayProductsRef, (snapshot) => {
        snapshot.docs.forEach(d => {
          map.set(d.id, { id: d.id, tenantId: 'sepetay', tenant_id: 'sepetay', ...d.data() });
        });
        updateCombined();
      }, (err) => {
        console.warn("POS tenants/sepetay/products listener warning:", err);
      });
      unsubs.push(unsubSepSub);
    }

    collNames.forEach(cName => {
      const u = onSnapshot(collection(db, cName), (snapshot) => {
        snapshot.docs.forEach(d => {
          map.set(d.id, { id: d.id, ...d.data() });
        });
        updateCombined();
      }, (err) => {
        console.warn(`POS product collection listener warning for ${cName}:`, err);
      });
      unsubs.push(u);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [tenantId]);

  const isNoBarcode = (p: any) => {
    const b = (p.barcode || '').trim().toUpperCase();
    return !b || b === 'BARKODSUZ' || b === 'YOK' || b === 'MANUEL';
  };

  const noBarcodeProducts = useMemo(() => {
    return allProducts.filter(isNoBarcode);
  }, [allProducts]);

  const filteredGridProducts = allProducts.filter(p => {
    if (activeCategory !== 'Tümü' && (p.category || 'Genel') !== activeCategory) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const pName = (p.name || p.urunAdi || p.title || p.adi || p.isim || '').toLowerCase();
      return pName.includes(term) || (p.barcode || '').toLowerCase().includes(term);
    }
    return true;
  }).slice(0, 16);

  return (
    <div className="pos-screen-content print:hidden p-2.5 sm:p-4 lg:p-6 min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4.25rem)] flex flex-col lg:flex-row gap-2.5 sm:gap-4 lg:gap-6 pb-28 lg:pb-4 lg:overflow-hidden">
      {/* Static Toast Notification (no bounce/movement) */}
      {toastMessage && (
        <div className={`fixed top-16 right-3 left-3 sm:left-auto sm:right-4 z-[70] text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold ${
          toastMessage.type === 'error' ? 'bg-red-600 border border-red-500' : 'bg-slate-900 border border-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-white shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button type="button" onClick={() => setToastMessage(null)} className="text-white/70 hover:text-white p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Area: Search, Categories & Grid */}
      <div className="flex-1 flex flex-col gap-2.5 sm:gap-3.5 lg:overflow-hidden min-w-0">
        {/* Salesperson Selector Bar (Strictly Tenant Personnel + Mobile Responsive) */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl border border-slate-200/80 shadow-sm shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <UserCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="hidden sm:inline">Satış Elemanı:</span>
              <span className="sm:hidden">Personel:</span>
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSellerDropdownOpen(!isSellerDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-900 transition-colors"
              >
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white font-mono text-[10px] font-black tracking-tight shrink-0">
                  {selectedSeller.code}
                </span>
                <span className="truncate max-w-[115px] sm:max-w-[190px]">{selectedSeller.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {isSellerDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsSellerDropdownOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 min-w-[230px] max-w-[280px] p-2 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      {currentTenant?.name || 'İşletme'} Personelleri
                    </div>
                    {staffList.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-slate-500 font-medium">
                        Bu işletmeye ait kayıtlı personel bulunamadı. Personel menüsünden ekleyebilirsiniz.
                      </div>
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
                            selectedSeller.id === st.id
                              ? 'bg-indigo-50 text-indigo-700' 
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] font-black text-slate-600 shrink-0">
                              {st.sellerCode}
                            </span>
                            <span className="truncate">{st.name}</span>
                          </div>
                          {selectedSeller.id === st.id && (
                            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {isMobilePosSyncEnabled && mobilePosOrdersCount > 0 && onOpenMobilePosOrders && (
              <button
                type="button"
                onClick={onOpenMobilePosOrders}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[11px] sm:text-xs shadow-sm transition-colors cursor-pointer"
                title="Mobilden PC masaüstüne gönderilen satışları gör ve kasaya yükle"
              >
                <Monitor className="w-3.5 h-3.5 shrink-0" />
                <span>Gelen Satış ({mobilePosOrdersCount})</span>
              </button>
            )}

            {isMobilePosSyncEnabled && cart.length > 0 && (
              <button
                type="button"
                disabled={isSendingToDesktop}
                onClick={handleSendToDesktopPOS}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black rounded-xl text-[11px] sm:text-xs transition-colors border border-indigo-200 cursor-pointer disabled:opacity-50"
                title="Bu satışı bütün kullanıcılar için PC Masaüstü Kasaya gönder"
              >
                <Monitor className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>{isSendingToDesktop ? 'Gönderiliyor...' : 'PC Masaüstüne Aktar'}</span>
              </button>
            )}

            {heldSales.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHeldSalesModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-[11px] sm:text-xs shadow-sm transition-colors"
                title="Beklemeye alınan satışları gör ve geri yükle"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Bekleyen ({heldSales.length})</span>
              </button>
            )}

            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHoldModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-[11px] sm:text-xs transition-colors border border-slate-200"
                title="Bu satışı bekletip yeni satış aç"
              >
                <Pause className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline">Satışı Beklet</span>
              </button>
            )}
          </div>
        </div>

        {/* Persistent Active Sale Notice (Desktop & Tablet only, since Mobile has the pinned bottom cart bar) */}
        {cart.length > 0 && (
          <div className="hidden sm:flex bg-emerald-50 border border-emerald-200/80 px-4 py-2 rounded-2xl items-center justify-between text-xs text-emerald-900 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="font-black text-emerald-800">Aktif Satış Beklemede:</span>
              <span className="text-emerald-700 hidden md:inline">
                {cart.length} kalem ürün sepetinizde korunuyor. Diğer sayfalara geçseniz de silinmez.
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isMobilePosSyncEnabled && (
                <button
                  type="button"
                  disabled={isSendingToDesktop}
                  onClick={handleSendToDesktopPOS}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-black transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Bütün kullanıcılar için PC Masaüstü Kasaya gönder"
                >
                  <Monitor className="w-3 h-3" />
                  <span>PC&apos;ye Gönder</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsHoldModalOpen(true)}
                className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-black transition-colors flex items-center gap-1"
                title="Satışı park et"
              >
                <Pause className="w-3 h-3 text-amber-600" />
                <span>Beklet</span>
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmClearModalOpen(true)}
                className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition-colors"
                title="Satışı sil"
              >
                Satışı Sil
              </button>
            </div>
          </div>
        )}

        {/* Search Bar & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 shrink-0">
          <div className="relative flex-1 min-w-0 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Ürün ara veya barkod okut..."
              className="w-full pl-10 pr-24 py-2.5 sm:py-3 bg-white border-2 border-slate-100 rounded-2xl text-xs sm:text-sm font-bold shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
            />

            {/* Kamera Barkod Okuma Butonu */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black shadow-sm transition-colors flex items-center gap-1 cursor-pointer z-10"
              title="Kamera ile Barkod Okut"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-300" />
              <span>Kamera</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:overflow-visible shrink-0">
            {/* Muhtelif Ürün Butonu */}
            <button
              type="button"
              onClick={() => setIsMuhtelifModalOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-2 sm:px-3.5 sm:py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              title="Muhtelif Ürün Ekle"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>MUHTELİF</span>
            </button>

            {/* Fotokopi Hesapla Butonu */}
            {isTenantSectorModuleEnabled(currentTenant, 'kirtasiye_modulu') && (
              <button
                type="button"
                onClick={() => setIsPhotocopyModalOpen(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-2 sm:px-3.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                title="Fotokopi & Baskı Hesapla"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>FOTOKOPİ</span>
              </button>
            )}

            {/* Terazi / Gramajlı Ürün Satışı Butonu */}
            {isTenantSectorModuleEnabled(currentTenant, 'bakkal_market_modulu') && (
              <button
                type="button"
                onClick={() => setIsScaleModalOpen(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-2 sm:px-3.5 sm:py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                title="Terazi / Hızlı Gramaj Satışı"
              >
                <Scale className="w-3.5 h-3.5 shrink-0" />
                <span>TERAZİ</span>
              </button>
            )}

            {/* Ürün İade Al Butonu */}
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-2 sm:px-3.5 sm:py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-black shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              title="Ürün İadesi Al"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>İADE AL</span>
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide no-scrollbar w-full shrink-0">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-black whitespace-nowrap transition-colors border-2",
                activeCategory === cat 
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm" 
                  : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
              )}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Product List */}
        <div className="flex-1 lg:overflow-y-auto pr-0.5 flex flex-col gap-2">
          {filteredGridProducts.map(product => {
            const price = Number(product.price ?? product.satisFiyati ?? product.fiyat ?? 0) || 0;
            const stock = Number(product.stock ?? product.miktar ?? product.adet ?? 0) || 0;
            const isLowStock = stock <= Number(product.minStock || 5);
            const productName = product.name || product.urunAdi || product.title || product.adi || product.isim || product.description || 'İsimsiz Ürün';
            const productImage = product.image || product.imageUrl || product.fotograf || product.resim || product.photo || '';
            const cartItem = cart.find(item => item.id === product.id);
            const cartQty = cartItem ? cartItem.quantity : 0;

            return (
              <div
                key={product.id}
                className="bg-white p-2.5 sm:p-3.5 rounded-2xl border-2 border-slate-100 hover:border-blue-500 transition-colors flex items-center justify-between gap-2.5 sm:gap-3 group shadow-sm"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => addToCart(product)}>
                  {productImage ? (
                    <div 
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-50 overflow-hidden relative cursor-pointer group/img border border-slate-200 shrink-0 flex items-center justify-center shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImageState({ url: productImage, title: productName });
                      }}
                      title="Büyük görseli görmek için tıklayın"
                    >
                      <img src={productImage} alt={productName} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0 flex items-center justify-center font-black text-sm shadow-sm">
                      <Package className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900 text-xs sm:text-sm truncate uppercase tracking-tight">{productName}</p>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
                      {product.category && product.category !== 'Genel' && (
                        <span className="text-[10px] text-slate-500 font-extrabold uppercase bg-slate-100 px-1.5 py-0.5 rounded-md truncate max-w-[110px]">{product.category}</span>
                      )}
                      <span className={cn("text-[10px] font-extrabold uppercase", isLowStock ? "text-red-600" : "text-slate-400")}>STOK: {stock}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="font-black text-blue-600 tabular-nums text-xs sm:text-sm">
                    {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    {cartQty > 0 && (
                      <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-100 text-emerald-800 font-black text-[11px] sm:text-xs flex items-center justify-center tabular-nums shadow-sm">
                        {cartQty}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product);
                      }}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm transition-colors"
                      title="Ürün Ekle"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          
          {filteredGridProducts.length === 0 && (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 py-10 opacity-50">
              <Package className="w-12 h-12 mb-2" />
              <p className="text-sm font-black uppercase tracking-widest">ÜRÜN BULUNAMADI</p>
            </div>
          )}
        </div>

        {/* Mobile Pinned Cart Preview Bar (Fixed cleanly above the 64px bottom navigation bar on mobile) */}
        {cart.length > 0 && (
          <div className="fixed bottom-[68px] left-2.5 right-2.5 z-40 lg:hidden bg-slate-900 rounded-2xl p-2.5 sm:p-3.5 text-white flex items-center justify-between gap-2 shadow-2xl border border-slate-700">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-blue-600 flex items-center justify-center relative shrink-0">
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-black">
                  {cart.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate">SEPET TOPLAMI</p>
                <p className="text-sm sm:text-lg font-black text-white tabular-nums truncate">
                  {grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 shrink-0">
              {isMobilePosSyncEnabled && (
                <button
                  type="button"
                  disabled={isSendingToDesktop}
                  onClick={handleSendToDesktopPOS}
                  className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  title="Satışı tüm kullanıcılar için PC Masaüstü Kasaya gönder"
                >
                  <Monitor className="w-3.5 h-3.5 shrink-0" />
                  <span>PC AKTAR</span>
                </button>
              )}
              <button 
                type="button"
                onClick={() => setIsConfirmClearModalOpen(true)}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Sepeti Temizle"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsCartOpen(true)}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white text-slate-900 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider hover:bg-blue-50 transition-colors shadow-sm"
              >
                ÖDEME AL
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Backdrop for Checkout Drawer */}
      {isCartOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-[55] lg:hidden"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      {/* Checkout Section (Desktop Sidebar / Mobile Drawer) */}
      <div className={cn(
        "lg:w-[400px] flex flex-col gap-4 transition-transform duration-300 ease-out",
        "fixed lg:static inset-x-0 bottom-0 z-[60] lg:z-auto bg-white lg:bg-transparent p-4 lg:p-0 border-t lg:border-none rounded-t-[2rem] lg:rounded-none shadow-[0_-20px_50px_rgba(0,0,0,0.25)] lg:shadow-none h-[88vh] lg:h-full overflow-y-auto",
        isCartOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0"
      )}>
        {/* Mobile handle indicator */}
        <div 
          className="lg:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-3 cursor-pointer hover:bg-slate-300 transition-colors shrink-0" 
          onClick={() => setIsCartOpen(false)}
        />
        
        <div className="bg-white p-4 sm:p-6 lg:p-7 rounded-[2rem] border-none lg:border border-slate-200/90 shadow-none lg:shadow-sm space-y-5 pb-12 lg:pb-8">
          <div className="flex items-center justify-between lg:hidden mb-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">SEPET & ÖDEME AL</h2>
            <button 
              onClick={() => setIsCartOpen(false)} 
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart List for Mobile/Desktop Drawer */}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wider">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <span>SEPETTEKİ ÜRÜNLER ({cart.length})</span>
              </h3>
              {cart.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsHoldModalOpen(true)}
                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold border border-amber-200 flex items-center gap-1"
                    title="Satışı Beklet"
                  >
                    <Pause className="w-3 h-3 text-amber-600" />
                    <span>Beklet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmClearModalOpen(true)}
                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-200 flex items-center gap-1"
                    title="Satışı Sil"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Sil</span>
                  </button>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-100 text-[10px] text-blue-800 font-medium">
                💾 <strong>Otomatik Koruma:</strong> Farklı bir menüye (Stok, Cari, Modüller vb.) geçseniz de bu satış siz &quot;Sil&quot; veya &quot;Ödeme Al&quot; diyene kadar korunur.
              </div>
            )}
            
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
              <span>KDV (%{taxRate}):</span>
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
              onClick={() => {
                setSaleMode('customer');
                setPaymentMethod('veresiye');
                if (!customer) {
                  setIsCustomerDropdownOpen(true);
                  setTimeout(() => customerSearchInputRef.current?.focus(), 50);
                }
              }}
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
                  <span>MÜŞTERİ / CARİ SEÇİMİ</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="text-blue-600 hover:text-blue-700 text-xs font-black flex items-center gap-1 transition-colors bg-blue-50 px-2.5 py-1.5 rounded-xl border border-blue-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>YENİ CARİ</span>
                </button>
              </div>

              {customer ? (
                <div className={`p-4 rounded-2xl border-2 relative transition-all animate-scaleIn ${
                  Number(customer.debt || 0) > 0 ? 'bg-red-50/50 border-red-200' : 'bg-emerald-50/50 border-emerald-200'
                }`}>
                  <div className="flex items-start justify-between pr-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <p className="font-black text-slate-900 text-sm truncate tracking-tight">{customer.name}</p>
                      </div>
                      <p className="text-[11px] text-slate-500 font-bold font-mono mt-0.5">{customer.phone || 'TELEFON BELİRTİLMEMİŞ'}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button 
                        type="button"
                        onClick={() => {
                          setIsCustomerDropdownOpen(true);
                          setTimeout(() => customerSearchInputRef.current?.focus(), 50);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-white text-slate-700 hover:text-blue-600 text-[10px] font-black border border-slate-200 shadow-xs transition-colors"
                        title="Farklı Müşteri Seç"
                      >
                        Değiştir
                      </button>
                      <button 
                        type="button"
                        onClick={() => setCustomer(null)} 
                        className="p-1.5 rounded-xl bg-white text-slate-400 hover:text-red-600 transition-colors shadow-xs border border-slate-200"
                        title="Seçimi Kaldır"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/60 grid grid-cols-2 gap-2">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[9px] uppercase font-black">Güncel Cari Borç</span>
                      <span className={`font-black text-sm ${Number(customer.debt || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {Number(customer.debt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-slate-100">
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
                      ref={customerSearchInputRef}
                      type="text"
                      placeholder="Müşteri / Cari ara (veya tıklayın)..."
                      className="w-full pl-11 pr-10 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all shadow-inner"
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setIsCustomerDropdownOpen(true);
                      }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                    />
                    {customerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isCustomerDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-72 overflow-y-auto p-2 space-y-1 animate-fadeIn">
                      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11px] font-black text-slate-400 uppercase">
                        <span>Kayıtlı Cariler ({filteredCustomers.length})</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomerDropdownOpen(false);
                            setIsCustomerModalOpen(true);
                          }}
                          className="text-blue-600 hover:underline flex items-center gap-1 lowercase first-letter:uppercase"
                        >
                          <Plus className="w-3 h-3" /> Yeni Ekle
                        </button>
                      </div>

                      {filteredCustomers.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          <p className="font-bold">Müşteri bulunamadı</p>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomerDropdownOpen(false);
                              setIsCustomerModalOpen(true);
                            }}
                            className="mt-2 text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> Yeni Cari Kart Aç
                          </button>
                        </div>
                      ) : (
                        filteredCustomers.slice(0, 20).map((c) => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setCustomer(c);
                              setIsCustomerDropdownOpen(false);
                              setCustomerSearchQuery('');
                              setPaymentMethod('veresiye');
                              showToast(`Cari seçildi: ${c.name}`);
                            }}
                            className="p-3 hover:bg-blue-50/80 rounded-xl cursor-pointer flex items-center justify-between text-sm transition-all border border-transparent hover:border-blue-100"
                          >
                            <div className="min-w-0">
                              <p className="font-black text-slate-900 truncate tracking-tight">{c.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">{c.phone || 'Telefon Yok'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${
                                Number(c.debt || 0) > 0 
                                  ? 'bg-red-50 text-red-600 border border-red-100' 
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              }`}>
                                {Number(c.debt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ {Number(c.debt || 0) > 0 ? 'Borç' : ''}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('cash')}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all group",
                  paymentMethod === 'cash' 
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-md shadow-emerald-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <Banknote className={cn("w-5 h-5 transition-transform group-active:scale-90", paymentMethod === 'cash' ? "text-emerald-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">NAKİT</span>
              </button>

              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('card')}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all group",
                  paymentMethod === 'card' 
                    ? "border-blue-600 bg-blue-50 text-blue-800 shadow-md shadow-blue-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <CreditCard className={cn("w-5 h-5 transition-transform group-active:scale-90", paymentMethod === 'card' ? "text-blue-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">KART</span>
              </button>

              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('parcali')}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all group",
                  paymentMethod === 'parcali' 
                    ? "border-indigo-600 bg-indigo-50 text-indigo-800 shadow-md shadow-indigo-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <Percent className={cn("w-5 h-5 transition-transform group-active:scale-90", paymentMethod === 'parcali' ? "text-indigo-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">PARÇALI</span>
              </button>

              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('veresiye')}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all group relative",
                  paymentMethod === 'veresiye' 
                    ? "border-red-600 bg-red-50 text-red-800 shadow-md shadow-red-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <Receipt className={cn("w-5 h-5 transition-transform group-active:scale-90", paymentMethod === 'veresiye' ? "text-red-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">CARİ</span>
              </button>

              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('cek')}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all group",
                  paymentMethod === 'cek' 
                    ? "border-purple-600 bg-purple-50 text-purple-800 shadow-md shadow-purple-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <FileText className={cn("w-5 h-5 transition-transform group-active:scale-90", paymentMethod === 'cek' ? "text-purple-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">ÇEK</span>
              </button>

              <button 
                type="button"
                onClick={() => handleSelectPaymentMethod('senet')}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all group",
                  paymentMethod === 'senet' 
                    ? "border-amber-600 bg-amber-50 text-amber-800 shadow-md shadow-amber-600/10" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                )}
              >
                <FileText className={cn("w-5 h-5 transition-transform group-active:scale-90", paymentMethod === 'senet' ? "text-amber-600" : "text-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest">SENET</span>
              </button>
            </div>
          </div>

          {/* Parçalı Ödeme Detay / Özet Bölümü */}
          {paymentMethod === 'parcali' && cart.length > 0 && (
            <div className="p-3.5 bg-indigo-50/70 border-2 border-indigo-200/90 rounded-2xl space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase text-indigo-950 flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-indigo-600" />
                  <span>PARÇALI ÖDEME DAĞILIMI</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsSplitModalOpen(true)}
                  className="text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  Tutarları Düzenle
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 bg-white rounded-xl border border-emerald-200">
                  <span className="text-[9px] text-slate-400 block font-sans">Nakit:</span>
                  <span className="font-black text-emerald-700">{Number(splitCashAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-blue-200">
                  <span className="text-[9px] text-slate-400 block font-sans">Kredi Kartı:</span>
                  <span className="font-black text-blue-700">{Number(splitCardAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              </div>
            </div>
          )}

          {/* Nakit Verilen Para & Para Üstü Hesaplama Bölümü */}
          {paymentMethod === 'cash' && cart.length > 0 && (
            <div className="p-3.5 bg-emerald-50/70 border-2 border-emerald-200/90 rounded-2xl space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase text-emerald-950 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>VERİLEN NAKİT & PARA ÜSTÜ</span>
                </label>
                {receivedCashNum > 0 && (
                  <button
                    type="button"
                    onClick={() => setReceivedCash('')}
                    className="text-[10px] font-bold text-slate-400 hover:text-red-500"
                  >
                    Temizle
                  </button>
                )}
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Müşteriden alınan tutar..."
                  value={receivedCash}
                  onChange={(e) => setReceivedCash(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono shadow-inner"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 font-mono">
                  {selectedCurrency === 'USD' ? '$' : selectedCurrency === 'EUR' ? '€' : '₺'}
                </span>
              </div>

              {/* Hızlı Banknot Butonları */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setReceivedCash(currentTotalToPay.toFixed(2))}
                  className="px-2 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg text-[10px] font-black text-emerald-800 transition-all shadow-xs"
                >
                  Tam Tutar
                </button>
                {[50, 100, 200, 500, 1000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setReceivedCash(String(val))}
                    className="px-2 py-1 bg-white hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[10px] font-black text-slate-700 transition-all shadow-xs"
                  >
                    {val} ₺
                  </button>
                ))}
              </div>

              {/* Canlı Para Üstü Göstergesi */}
              {receivedCashNum > 0 && (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between font-mono ${
                  receivedCashNum >= currentTotalToPay
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-md'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}>
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    {receivedCashNum >= currentTotalToPay ? 'PARA ÜSTÜ:' : 'KALAN EKSİK TUTAR:'}
                  </span>
                  <span className="text-lg font-black tracking-tight">
                    {Math.abs(receivedCashNum - currentTotalToPay).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                  </span>
                </div>
              )}
            </div>
          )}

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
              <span>KDV (%{taxRate})</span>
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
                    <>{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span className="text-lg">₺</span></>
                  ) : (
                    <>{selectedCurrency === 'USD' ? '$' : '€'}{foreignTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</>
                  )}
                </span>
              </div>
              {selectedCurrency !== 'TRY' && (
                <div className="flex justify-between text-[11px] text-slate-400 font-bold pt-0.5">
                  <span>TL Karşılığı:</span>
                  <span className="font-mono text-slate-200">₺{grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            {isMobilePosSyncEnabled && (
              <button
                type="button"
                disabled={cart.length === 0 || isSendingToDesktop}
                onClick={handleSendToDesktopPOS}
                className={cn(
                  "w-full py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-3 cursor-pointer",
                  cart.length === 0
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 border border-indigo-400/30"
                )}
              >
                <Smartphone className="w-4 h-4 text-indigo-200" />
                <Monitor className="w-4 h-4 text-white" />
                <span>{isSendingToDesktop ? 'GÖNDERİLİYOR...' : 'PC MASAÜSTÜNE GÖNDER (TÜM KULLANICILAR)'}</span>
                <Send className="w-3.5 h-3.5 text-indigo-200" />
              </button>
            )}

            {/* Sistem ve Tarayıcı Yazıcısı Aktif Rozeti */}
            <div className="flex items-center justify-between py-2 px-3 bg-slate-900/80 rounded-xl border border-slate-700/80 text-[11px] font-bold text-slate-300 mt-2.5">
              <div className="flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sistem ve Tarayıcı Yazıcısı (A4 & Fiş)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-3 h-3" /> Aktif
              </span>
            </div>

            {/* Ana Ödeme Butonları: Ödeme & Yazdır + Son Fişi Tekrar Yazdır + Sadece Ödeme Al */}
            <div className="space-y-2 mt-2">
              <button 
                type="button"
                disabled={(cart.length === 0 && !lastReceipt) || isProcessing}
                onClick={() => {
                  if (cart.length > 0) {
                    completeSale(true);
                  } else if (lastReceipt) {
                    setIsPrintSelectionModalOpen(true);
                  }
                }}
                className={cn(
                  "w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase shadow-2xl transition-all active:scale-[0.97] flex flex-col items-center justify-center gap-1 cursor-pointer",
                  cart.length === 0 && !lastReceipt
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : cart.length === 0 && lastReceipt
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 border border-emerald-400/30"
                    : (paymentMethod === 'veresiye' && !customer)
                    ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30 ring-2 ring-amber-400/50 animate-pulse"
                    : paymentMethod === 'veresiye'
                    ? "bg-red-600 hover:bg-red-700 text-white shadow-red-600/30"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30"
                )}
                title={
                  cart.length === 0 && lastReceipt
                    ? "Son tamamlanan satış fişini tekrar yazdır"
                    : "Satışı tamamla ve yazıcı seçim penceresini aç"
                }
              >
                {isProcessing ? (
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : cart.length === 0 && lastReceipt ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Printer className="w-4 h-4 text-emerald-100" />
                      <span>SON FİŞİ TEKRAR YAZDIR (#{lastReceipt.saleId.slice(0, 6).toUpperCase()})</span>
                    </div>
                    <span className="text-[10px] font-medium tracking-normal text-emerald-100/90 lowercase">
                      ({lastReceipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ • termal veya a4 tekrar yazdır)
                    </span>
                  </>
                ) : (paymentMethod === 'veresiye' && !customer) ? (
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-amber-200" />
                    <span>MÜŞTERİ SEÇİN (CARİ SATIŞ)</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Printer className="w-4 h-4 text-blue-200" />
                      <span>{paymentMethod === 'veresiye' ? 'CARİ ÖDEME & YAZDIR' : 'ÖDEME & YAZDIR'}</span>
                    </div>
                    <span className="text-[10px] font-medium tracking-normal text-blue-100/90 lowercase">
                      (sistem ve tarayıcı yazıcısından anında basar)
                    </span>
                  </>
                )}
              </button>

              {cart.length > 0 && lastReceipt && (
                <button
                  type="button"
                  onClick={() => setIsPrintSelectionModalOpen(true)}
                  className="w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-800/80 border border-emerald-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  title="Sepette ürün varken bir önceki son fişi tekrar yazdır"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SON FİŞİ TEKRAR YAZDIR (#{lastReceipt.saleId.slice(0, 6).toUpperCase()} - {lastReceipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺)</span>
                </button>
              )}

              <button
                type="button"
                disabled={cart.length === 0 || isProcessing}
                onClick={() => completeSale(false)}
                className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Fiş veya fatura basmadan sadece satışı kaydet"
              >
                <Check className="w-3.5 h-3.5 text-slate-400" />
                <span>SADECE ÖDEME AL (FİŞSİZ)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Print Selection Modal (Thermal vs A4 choice when completing sale with print) */}
      <PrintSelectionModal
        isOpen={isPrintSelectionModalOpen}
        onClose={() => setIsPrintSelectionModalOpen(false)}
        onConfirmPrint={(format) => {
          handleOpenReceiptPrintWindow(format);
        }}
        documentTitle="Satış Tamamlandı - Yazıcı Seçimi"
        documentSubtitle="Satış fişini yazdırmak istediğiniz formatı belirleyin."
        saleId={lastReceipt?.saleId}
        totalAmount={lastReceipt?.total}
        customerName={lastReceipt?.customerName}
        itemCount={lastReceipt?.items?.length}
        onViewPreview={() => {
          setIsReceiptModalOpen(true);
        }}
      />

      {/* Printable Sales Receipt Modal (Satış Fişi) */}
      {isReceiptModalOpen && lastReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn print:hidden">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm sm:text-base text-slate-900 leading-tight truncate">
                    Satış Fişi & Fatura Yazdır
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium truncate">
                    Yazıcınıza göre A4 normal sayfa veya 80mm termal fiş formatında yazdırabilirsiniz.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsReceiptModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors shrink-0 ml-2"
                title="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Format Switcher Tabs */}
            <div className="px-4 sm:px-5 pt-3 pb-2 bg-slate-50/50 border-b border-slate-100 shrink-0 flex items-center gap-2">
              <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider hidden xs:inline">
                Yazdırma Boyutu:
              </span>
              <div className="grid grid-cols-2 gap-1.5 flex-1 max-w-md bg-slate-200/80 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => handleSelectReceiptFormat('a4')}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black transition-all",
                    receiptFormat === 'a4'
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>📄 Standart A4 Boyut (Tüm Yazıcılar)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectReceiptFormat('thermal')}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black transition-all",
                    receiptFormat === 'thermal'
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <span>🧾 Fiş Yazıcı (80mm Termal)</span>
                </button>
              </div>
            </div>

            {/* Receipt Preview Body (A4 or Thermal) */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100/60">
              {receiptFormat === 'a4' ? (
                /* A4 Document Preview Card */
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-slate-200 text-slate-800 space-y-6 text-xs max-w-xl mx-auto">
                  {/* Top Store Info & Header */}
                  <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight">
                        {currentTenant?.name || tenantName || (isSepetayTenant(tenantId) ? 'Sepetay Kırtasiye & Büro' : 'İşletme Mağazası')}
                      </h2>
                      {currentTenant?.address && (
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">{currentTenant.address}</p>
                      )}
                      {currentTenant?.phone && (
                        <p className="text-[11px] text-slate-500 font-medium">Tel: {currentTenant.phone}</p>
                      )}
                      <p className="text-[10px] text-blue-700 font-bold uppercase mt-1">Perakende Satış & Teslim Formu</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 bg-slate-100 rounded-lg font-mono text-[11px] font-black text-slate-700 block">
                        Fiş #{lastReceipt.saleId.slice(0, 8).toUpperCase()}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 font-medium">{format(lastReceipt.date, 'dd.MM.yyyy HH:mm')}</p>
                      {lastReceipt.sellerCode && (
                        <p className="text-[11px] text-slate-600 font-bold mt-0.5 font-mono">
                          Satış: [{lastReceipt.sellerCode}] {lastReceipt.sellerName}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Customer Info Box */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Müşteri / Cari:</span>
                      <p className="font-black text-slate-900 mt-0.5">{lastReceipt.customerName || 'Perakende Müşteri'}</p>
                      {lastReceipt.customerPhone && (
                        <p className="text-slate-500 text-[11px] font-mono mt-0.5">Tel: {lastReceipt.customerPhone}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Ödeme Türü:</span>
                      <p className="font-black text-blue-700 mt-0.5 uppercase">
                        {lastReceipt.paymentMethod === 'cash' ? 'Nakit Ödeme' :
                         lastReceipt.paymentMethod === 'card' ? 'Kredi Kartı' :
                         lastReceipt.paymentMethod === 'parcali' ? `Parçalı (Nakit: ${lastReceipt.cashAmount || 0}₺, Kart: ${lastReceipt.cardAmount || 0}₺)` :
                         lastReceipt.paymentMethod === 'cek' ? 'Çek' :
                         lastReceipt.paymentMethod === 'senet' ? 'Senet' : 'Veresiye (Cari Hesap)'}
                      </p>
                      {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                        <p className="text-indigo-600 font-bold text-[11px] mt-0.5 font-mono">
                          {lastReceipt.currency} (Kur: {lastReceipt.exchangeRate?.toFixed(2)} ₺)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-black text-[10px] uppercase border-b border-slate-200">
                          <th className="py-2 px-2.5 text-center w-8">#</th>
                          <th className="py-2 px-3">Ürün Adı</th>
                          <th className="py-2 px-2 text-center w-16">Miktar</th>
                          <th className="py-2 px-3 text-right w-24">Birim Fiyat</th>
                          <th className="py-2 px-3 text-right w-24">Toplam</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lastReceipt.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                            <td className="py-2 px-3 font-bold text-slate-900 uppercase">
                              {it.name}
                              {it.barcode && <span className="text-slate-400 text-[10px] block font-mono font-normal">{it.barcode}</span>}
                            </td>
                            <td className="py-2 px-2 text-center font-bold font-mono">{it.quantity}</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {it.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                              {it.discount && it.discount > 0 ? (
                                <span className="text-red-600 text-[10px] block font-bold">-{it.discount.toLocaleString('tr-TR')} ₺ İsk</span>
                              ) : null}
                            </td>
                            <td className="py-2 px-3 text-right font-black font-mono text-slate-900">
                              {calculateItemTotal(it).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Calculations & Totals */}
                  {(() => {
                    const receiptDiscount = lastReceipt.items.reduce((s, it) => s + (it.discount || 0), 0);
                    const rawItemsTotal = lastReceipt.items.reduce((s, it) => s + (it.price * it.quantity), 0);
                    const rawSub = rawItemsTotal > 0 ? rawItemsTotal : lastReceipt.subtotal;

                    return (
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
                        <div className="flex-1 text-[11px] text-slate-500 space-y-1">
                          <p className="italic">Bilgi amaçlı düzenlenmiştir. Mali değeri yoktur.</p>
                          {lastReceipt.previousDebt !== undefined && (
                            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-0.5 text-xs font-mono">
                              <div className="flex justify-between text-slate-600">
                                <span>Eski Bakiye (Önceki Borç):</span>
                                <span className="font-bold">{(lastReceipt.previousDebt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                              </div>
                              <div className="flex justify-between font-black text-red-700 border-t border-slate-200 pt-1">
                                <span>Güncel Toplam Borç:</span>
                                <span>{(lastReceipt.newDebt !== undefined ? lastReceipt.newDebt : lastReceipt.previousDebt).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="w-full sm:w-64 bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1.5 text-xs">
                          <div className="flex justify-between text-slate-600">
                            <span>Ara Toplam:</span>
                            <span className="font-mono font-bold">{rawSub.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          </div>
                          {receiptDiscount > 0 && (
                            <div className="flex justify-between text-red-600 font-bold">
                              <span>İskonto:</span>
                              <span className="font-mono">-{receiptDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-600">
                            <span>KDV (%{lastReceipt.taxRate || 20}):</span>
                            <span className="font-mono font-bold">{lastReceipt.taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          </div>
                          <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-300 pt-1.5">
                            <span>GENEL TOPLAM:</span>
                            <span className="font-mono text-blue-700">{lastReceipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                          </div>
                          {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                            <div className="flex justify-between text-xs font-black text-indigo-700 bg-indigo-50 p-1.5 rounded-lg border border-indigo-100">
                              <span>Döviz Tutarı:</span>
                              <span className="font-mono">{lastReceipt.currency === 'USD' ? '$' : '€'}{lastReceipt.foreignAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
                    <div>
                      <p className="font-bold text-slate-700 mb-8">Teslim Eden (Firma / Kasiyer)</p>
                      <div className="w-36 mx-auto border-b border-slate-300"></div>
                    </div>
                    <div>
                      <p className="font-bold text-slate-700 mb-8">Teslim Alan (Müşteri)</p>
                      <div className="w-36 mx-auto border-b border-slate-300"></div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Thermal 80mm Receipt Preview Card */
                <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-200 text-slate-900 font-mono text-xs max-w-xs mx-auto space-y-3">
                  <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 pb-3">
                    <h2 className="text-sm font-black tracking-tight uppercase">
                      {currentTenant?.name || tenantName || (isSepetayTenant(tenantId) ? 'Sepetay Kırtasiye' : 'İşletme Mağazası')}
                    </h2>
                    <p className="text-[11px] text-slate-500 font-bold">SATIŞ BİLGİ FİŞİ</p>
                    <p className="text-[10px] text-slate-400">Fiş No: #{lastReceipt.saleId.slice(0, 8).toUpperCase()}</p>
                    <p className="text-[10px] text-slate-400">{format(lastReceipt.date, 'dd.MM.yyyy HH:mm:ss')}</p>
                  </div>

                  <div className="text-[11px] space-y-0.5 border-b border-dashed border-slate-300 pb-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Müşteri:</span>
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
                        <span className="font-bold">[{lastReceipt.sellerCode}] {lastReceipt.sellerName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ödeme:</span>
                      <span className="font-bold uppercase">
                        {lastReceipt.paymentMethod === 'cash' ? 'NAKİT' :
                         lastReceipt.paymentMethod === 'card' ? 'KREDİ KARTI' :
                         lastReceipt.paymentMethod === 'parcali' ? `PARÇALI` :
                         lastReceipt.paymentMethod === 'cek' ? 'ÇEK' :
                         lastReceipt.paymentMethod === 'senet' ? 'SENET' : 'VERESİYE'}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3 text-[11px]">
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                      <span>Ürün</span>
                      <span>Tutar</span>
                    </div>
                    {lastReceipt.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start">
                        <div className="pr-2 min-w-0 flex-1">
                          <p className="font-bold truncate uppercase">{item.name}</p>
                          <span className="text-[10px] text-slate-500">
                            {item.quantity} x {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            {item.discount && item.discount > 0 && (
                              <span className="text-red-600 font-bold ml-1">(-{item.discount}₺ İsk)</span>
                            )}
                          </span>
                        </div>
                        <span className="font-black shrink-0">
                          {calculateItemTotal(item).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-slate-600">
                      <span>Ara Toplam:</span>
                      <span>{lastReceipt.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    {lastReceipt.taxAmount > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>KDV (%{lastReceipt.taxRate || 20}):</span>
                        <span>{lastReceipt.taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-800 pt-1">
                      <span>GENEL TOPLAM:</span>
                      <span>{lastReceipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                      <div className="flex justify-between text-xs font-black text-indigo-700 bg-indigo-50 p-1 rounded">
                        <span>Döviz Tutarı:</span>
                        <span>{lastReceipt.currency === 'USD' ? '$' : '€'}{lastReceipt.foreignAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {lastReceipt.previousDebt !== undefined && (
                      <div className="p-2 bg-slate-50 rounded border border-dashed border-slate-300 text-[10px] space-y-0.5 mt-2">
                        <div className="flex justify-between text-slate-600">
                          <span>Eski Borç:</span>
                          <span>{(lastReceipt.previousDebt || 0).toLocaleString('tr-TR')} ₺</span>
                        </div>
                        <div className="flex justify-between font-bold text-red-700">
                          <span>Kalan Borç:</span>
                          <span>{(lastReceipt.newDebt !== undefined ? lastReceipt.newDebt : lastReceipt.previousDebt).toLocaleString('tr-TR')} ₺</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-center pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-400 space-y-0.5">
                    <p>Mali değeri yoktur, bilgi fişidir.</p>
                    <p>Bizi tercih ettiğiniz için teşekkür ederiz.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                {/* Print A4 Button (Standard A4 Printers / All Models) */}
                <button
                  type="button"
                  onClick={handlePrintA4}
                  className={cn(
                    "flex-1 py-3 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer",
                    receiptFormat === 'a4'
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-400 ring-offset-1"
                      : "bg-white hover:bg-slate-100 text-blue-700 border-2 border-blue-200"
                  )}
                  title="Tüm yazıcılar (Lazer, Mürekkep, PDF) için tam sayfa A4 yazdır - istediğiniz kadar tekrar yazdırabilirsiniz"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">📄 Standart A4 Yazdır</span>
                </button>

                {/* Print Thermal 80mm Button */}
                <button
                  type="button"
                  onClick={handlePrintThermal}
                  className={cn(
                    "flex-1 py-3 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer",
                    receiptFormat === 'thermal'
                      ? "bg-slate-900 hover:bg-slate-800 text-white shadow-md ring-2 ring-slate-700 ring-offset-1"
                      : "bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-200"
                  )}
                  title="Termal kasa fiş yazıcıları (80mm rulo) için fiş yazdır - istediğiniz kadar tekrar yazdırabilirsiniz"
                >
                  <Receipt className="w-4 h-4 shrink-0" />
                  <span className="truncate">🧾 Fiş Yazıcı (80mm)</span>
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePrintIndividualItems}
                  disabled={isPrinting}
                  className="py-3 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  title="Her ürünü ayrı fiş/etiket olarak yazdır"
                >
                  <ArrowDownRight className="w-4 h-4 inline mr-1" />
                  <span className="hidden sm:inline">Ayrı Ürün Fişleri</span>
                  <span className="sm:hidden">Ayrı</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Print Portal: Mounted directly on document.body to ensure NOTHING from #root leaks onto print */}
      {lastReceipt && typeof document !== 'undefined' && createPortal(
        <div id="pos-receipt-print-root" aria-hidden="true">
          {/* 1. A4 Format Document (For all standard A4 printers and PDF) */}
          <div id="pos-receipt-a4-doc" className="p-8 text-black bg-white">
            <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-5">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight">
                  {currentTenant?.name || tenantName || (isSepetayTenant(tenantId) ? 'Sepetay Kırtasiye & Büro' : 'İşletme Mağazası')}
                </h1>
                {currentTenant?.address && (
                  <p className="text-xs text-gray-700 font-medium mt-1">{currentTenant.address}</p>
                )}
                {currentTenant?.phone && (
                  <p className="text-xs text-gray-700 font-medium">Tel: {currentTenant.phone}</p>
                )}
                <p className="text-xs font-bold uppercase mt-1 tracking-wider">Perakende Satış & Teslim Bilgi Formu</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black font-mono">BELGE NO: #{lastReceipt.saleId.slice(0, 10).toUpperCase()}</p>
                <p className="text-xs text-gray-700 font-medium mt-1">Tarih: {format(lastReceipt.date, 'dd.MM.yyyy HH:mm:ss')}</p>
                {lastReceipt.sellerCode && (
                  <p className="text-xs font-bold font-mono mt-0.5">Satış Elemanı: [{lastReceipt.sellerCode}] {lastReceipt.sellerName}</p>
                )}
              </div>
            </div>

            {/* Customer & Payment Details Box */}
            <div className="grid grid-cols-2 gap-4 p-3 border border-gray-400 rounded-lg mb-5 text-xs bg-gray-50/50">
              <div>
                <span className="font-bold text-gray-500 uppercase block text-[10px]">Müşteri / Cari Ünvanı:</span>
                <p className="text-sm font-black text-black mt-0.5">{lastReceipt.customerName || 'Perakende Müşteri'}</p>
                {lastReceipt.customerPhone && (
                  <p className="text-xs text-gray-700 font-mono mt-0.5">Telefon: {lastReceipt.customerPhone}</p>
                )}
              </div>
              <div className="text-right">
                <span className="font-bold text-gray-500 uppercase block text-[10px]">Ödeme Şekli:</span>
                <p className="text-sm font-black text-black mt-0.5 uppercase">
                  {lastReceipt.paymentMethod === 'cash' ? 'Nakit Ödeme' :
                   lastReceipt.paymentMethod === 'card' ? 'Kredi Kartı' :
                   lastReceipt.paymentMethod === 'parcali' ? `Parçalı (Nakit: ${lastReceipt.cashAmount || 0}₺, Kart: ${lastReceipt.cardAmount || 0}₺)` :
                   lastReceipt.paymentMethod === 'cek' ? 'Çek' :
                   lastReceipt.paymentMethod === 'senet' ? 'Senet' : 'Veresiye (Cari Hesap)'}
                </p>
                {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                  <p className="text-xs font-bold mt-0.5">
                    Para Birimi: {lastReceipt.currency} (Kur: {lastReceipt.exchangeRate?.toFixed(2)} ₺)
                  </p>
                )}
              </div>
            </div>

            {/* Products Table */}
            <table className="w-full text-left text-xs border border-gray-400 mb-6 border-collapse">
              <thead>
                <tr className="bg-gray-100 text-black font-black uppercase text-[10px] border-b border-gray-400">
                  <th className="py-2 px-2 border-r border-gray-400 text-center w-8">#</th>
                  <th className="py-2 px-3 border-r border-gray-400">Ürün Adı / Açıklama</th>
                  <th className="py-2 px-2 border-r border-gray-400 text-center w-16">Miktar</th>
                  <th className="py-2 px-3 border-r border-gray-400 text-right w-24">Birim Fiyat</th>
                  <th className="py-2 px-3 text-right w-28">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {lastReceipt.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-2 border-r border-gray-300 text-center font-mono text-[10px]">{idx + 1}</td>
                    <td className="py-2 px-3 border-r border-gray-300 font-bold uppercase">
                      {it.name}
                      {it.barcode && <span className="text-gray-500 font-mono text-[9px] block font-normal">{it.barcode}</span>}
                    </td>
                    <td className="py-2 px-2 border-r border-gray-300 text-center font-bold font-mono">{it.quantity}</td>
                    <td className="py-2 px-3 border-r border-gray-300 text-right font-mono">
                      {it.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      {it.discount && it.discount > 0 ? (
                        <span className="text-red-700 text-[9px] block font-bold">-{it.discount.toLocaleString('tr-TR')} ₺ İsk</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-3 text-right font-black font-mono">
                      {calculateItemTotal(it).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations Breakdown */}
            {(() => {
              const receiptDiscount = lastReceipt.items.reduce((s, it) => s + (it.discount || 0), 0);
              const rawItemsTotal = lastReceipt.items.reduce((s, it) => s + (it.price * it.quantity), 0);
              const rawSub = rawItemsTotal > 0 ? rawItemsTotal : lastReceipt.subtotal;

              return (
                <div className="flex justify-between items-start gap-6 mb-8">
                  <div className="flex-1 text-xs text-gray-700 space-y-1">
                    <p className="font-bold">Not:</p>
                    <p className="italic">Bu belge 213 sayılı V.U.K. hükümlerine göre bilgi amaçlı düzenlenmiştir. Maliye onaylı fatura yerine geçmez.</p>
                    {lastReceipt.previousDebt !== undefined && (
                      <div className="mt-3 p-3 border border-gray-400 rounded-lg max-w-xs space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-gray-700">
                          <span>Eski Bakiye (Önceki Borç):</span>
                          <span className="font-bold">{(lastReceipt.previousDebt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                        </div>
                        <div className="flex justify-between font-black text-black border-t border-gray-300 pt-1">
                          <span>Güncel Toplam Borç:</span>
                          <span>{(lastReceipt.newDebt !== undefined ? lastReceipt.newDebt : lastReceipt.previousDebt).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-72 border border-gray-400 rounded-lg p-3.5 space-y-1 text-xs bg-gray-50/50">
                    <div className="flex justify-between text-gray-700">
                      <span>Ara Toplam:</span>
                      <span className="font-mono font-bold">{rawSub.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    {receiptDiscount > 0 && (
                      <div className="flex justify-between text-red-700 font-bold">
                        <span>Toplam İskonto:</span>
                        <span className="font-mono">-{receiptDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-700">
                      <span>KDV (%{lastReceipt.taxRate || 20}):</span>
                      <span className="font-mono font-bold">{lastReceipt.taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    <div className="flex justify-between text-base font-black text-black border-t-2 border-black pt-1 mt-1">
                      <span>GENEL TOPLAM:</span>
                      <span className="font-mono">{lastReceipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                    {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                      <div className="flex justify-between text-xs font-black pt-1 border-t border-gray-300">
                        <span>Döviz Tutarı:</span>
                        <span className="font-mono">{lastReceipt.currency === 'USD' ? '$' : '€'}{lastReceipt.foreignAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Signature Area */}
            <div className="grid grid-cols-2 gap-12 pt-8 border-t border-gray-400 text-center text-xs text-gray-700">
              <div>
                <p className="font-bold mb-12">Teslim Eden (Firma Yetkilisi / Kaşe)</p>
                <div className="w-48 mx-auto border-b border-gray-400"></div>
              </div>
              <div>
                <p className="font-bold mb-12">Teslim Alan (Müşteri İmza)</p>
                <div className="w-48 mx-auto border-b border-gray-400"></div>
              </div>
            </div>

            <div className="text-center pt-8 text-[10px] text-gray-500">
              <p>Bizi tercih ettiğiniz için teşekkür ederiz. İyi günlerde kullanınız.</p>
            </div>
          </div>

          {/* 2. Thermal 80mm Receipt Document */}
          <div id="pos-receipt-thermal-doc" className="text-black bg-white">
            <div className="text-center border-b border-dashed border-black pb-2 mb-2">
              <h2 className="text-sm font-black uppercase">
                {currentTenant?.name || tenantName || (isSepetayTenant(tenantId) ? 'Sepetay Kırtasiye' : 'İşletme Mağazası')}
              </h2>
              {currentTenant?.phone && <p className="text-[10px]">Tel: {currentTenant.phone}</p>}
              <p className="text-[11px] font-bold mt-1">SATIŞ BİLGİ FİŞİ</p>
              <p className="text-[10px]">Fiş No: #{lastReceipt.saleId.slice(0, 8).toUpperCase()}</p>
              <p className="text-[10px]">{format(lastReceipt.date, 'dd.MM.yyyy HH:mm:ss')}</p>
            </div>

            <div className="text-[11px] border-b border-dashed border-black pb-2 mb-2">
              <div className="flex justify-between">
                <span>Müşteri:</span>
                <span className="font-bold">{lastReceipt.customerName || 'Perakende'}</span>
              </div>
              {lastReceipt.customerPhone && (
                <div className="flex justify-between">
                  <span>Tel:</span>
                  <span>{lastReceipt.customerPhone}</span>
                </div>
              )}
              {lastReceipt.sellerCode && (
                <div className="flex justify-between">
                  <span>Satış Elemanı:</span>
                  <span className="font-bold">[{lastReceipt.sellerCode}] {lastReceipt.sellerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Ödeme:</span>
                <span className="font-bold uppercase">
                  {lastReceipt.paymentMethod === 'cash' ? 'NAKİT' :
                   lastReceipt.paymentMethod === 'card' ? 'KREDİ KARTI' :
                   lastReceipt.paymentMethod === 'parcali' ? 'PARÇALI' :
                   lastReceipt.paymentMethod === 'cek' ? 'ÇEK' :
                   lastReceipt.paymentMethod === 'senet' ? 'SENET' : 'VERESİYE'}
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="border-b border-dashed border-black pb-2 mb-2 text-[11px]">
              <div className="flex justify-between font-bold text-[10px] uppercase mb-1">
                <span>Ürün</span>
                <span>Tutar</span>
              </div>
              {lastReceipt.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start mb-1">
                  <div className="pr-1 flex-1">
                    <p className="font-bold uppercase leading-tight">{item.name}</p>
                    <span className="text-[10px] text-gray-700">
                      {item.quantity} x {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      {item.discount && item.discount > 0 ? (
                        <span className="ml-1 font-bold">(-{item.discount}₺)</span>
                      ) : null}
                    </span>
                  </div>
                  <span className="font-black whitespace-nowrap">
                    {calculateItemTotal(item).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-0.5 text-[11px] mb-2">
              <div className="flex justify-between">
                <span>Ara Toplam:</span>
                <span>{lastReceipt.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              {lastReceipt.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>KDV:</span>
                  <span>{lastReceipt.taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-black border-t border-black pt-1">
                <span>GENEL TOPLAM:</span>
                <span>{lastReceipt.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              {lastReceipt.currency && lastReceipt.currency !== 'TRY' && (
                <div className="flex justify-between text-[11px] font-bold">
                  <span>Döviz:</span>
                  <span>{lastReceipt.currency === 'USD' ? '$' : '€'}{lastReceipt.foreignAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {lastReceipt.previousDebt !== undefined && (
                <div className="border border-dashed border-black p-1 text-[10px] mt-1">
                  <div className="flex justify-between">
                    <span>Eski Borç:</span>
                    <span>{(lastReceipt.previousDebt || 0).toLocaleString('tr-TR')} ₺</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Kalan Borç:</span>
                    <span>{(lastReceipt.newDebt !== undefined ? lastReceipt.newDebt : lastReceipt.previousDebt).toLocaleString('tr-TR')} ₺</span>
                  </div>
                </div>
              )}
            </div>

            <div className="text-center pt-2 border-t border-dashed border-black text-[9px]">
              <p>Mali değeri yoktur, bilgi fişidir.</p>
              <p>Bizi tercih ettiğiniz için teşekkür ederiz.</p>
            </div>
          </div>

          {/* 3. Individual Item Slips */}
          <div id="pos-receipt-items-doc" className="text-black bg-white">
            {lastReceipt.items.map((item, idx) => (
              <div key={`item-print-${idx}`} className="receipt-page p-6 border-b-2 border-dashed border-black mb-6">
                <div className="text-center border-b border-black pb-3 mb-3">
                  <h2 className="text-lg font-black uppercase">
                    {currentTenant?.name || tenantName || 'SATIŞ FİŞİ'}
                  </h2>
                  <p className="text-xs font-bold uppercase">ÜRÜN BİLGİ ETİKETİ</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tarih:</span>
                    <span>{format(lastReceipt.date, 'dd.MM.yyyy HH:mm')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fiş No:</span>
                    <span className="font-mono">#{lastReceipt.saleId.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <div className="pt-3 border-t border-gray-300">
                    <span className="text-gray-600 text-[10px] font-bold uppercase block">Ürün:</span>
                    <p className="text-xl font-black uppercase mt-0.5">{item.name}</p>
                    {item.barcode && <p className="text-xs font-mono text-gray-500">{item.barcode}</p>}
                  </div>
                  <div className="flex justify-between items-end pt-3 border-t border-gray-300">
                    <div>
                      <span className="text-gray-600 text-[10px] font-bold uppercase block">Miktar:</span>
                      <p className="text-lg font-black">{item.quantity} ADET</p>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-600 text-[10px] font-bold uppercase block">Birim Fiyat:</span>
                      <p className="text-lg font-black">{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

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
        continuous={true}
      />

      {/* Global Product Smart Quick Register Modal */}
      <GlobalProductQuickRegisterModal
        isOpen={globalRegisterModal.isOpen}
        barcode={globalRegisterModal.barcode}
        globalProduct={globalRegisterModal.globalProduct}
        onClose={() => setGlobalRegisterModal(prev => ({ ...prev, isOpen: false }))}
        onSave={handleSaveQuickRegisteredProduct}
        actionType="pos"
      />

      {/* Fast Customer Modal (Add directly from POS) */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={(saved) => {
          setCustomer(saved);
          setSaleMode('customer');
          setPaymentMethod('veresiye');
          showToast(`Cari müşteri eklendi ve seçildi: ${saved.name}`);
        }}
      />

      {/* Unknown Barcode Prompt Modal */}
      {unknownBarcode && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Ürün Bulunamadı</h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                <span className="font-mono font-bold text-slate-900">{unknownBarcode}</span> barkod numarasına ait kayıtlı ürün bulunamadı. Bu barkodla yeni ürün eklemek ister misiniz?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnknownBarcode(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const code = unknownBarcode;
                  setUnknownBarcode(null);
                  if (code) {
                    const globalFound = await lookupGlobalProduct(code);
                    setGlobalRegisterModal({
                      isOpen: true,
                      barcode: code,
                      globalProduct: globalFound
                    });
                  }
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Ürün Ekle</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal */}
      {isQuickAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <span>Hızlı Ürün Ekle</span>
              </h3>
              <button onClick={() => setIsQuickAddModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const name = quickAddForm.name.trim();
              const barcode = quickAddForm.barcode.trim();
              const price = parseFloat(quickAddForm.price.replace(',', '.')) || 0;
              const purchasePrice = parseFloat(quickAddForm.purchasePrice.replace(',', '.')) || 0;
              const stock = parseInt(quickAddForm.stock, 10) || 0;

              if (!name || !barcode || price <= 0) {
                showToast("Lütfen ürün adı, geçerli barkod ve satış fiyatı giriniz.", "error");
                return;
              }

              try {
                const newProductData = {
                  name,
                  barcode,
                  price,
                  purchasePrice,
                  stock,
                  minStock: 5,
                  category: quickAddForm.category || 'Genel',
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                };

                const docRef = await addDoc(collection(db, 'products'), withTenant(newProductData));
                
                // Save to shared global pool
                saveToGlobalCatalog({
                  barcode,
                  name,
                  category: quickAddForm.category || 'Genel',
                  price,
                  purchasePrice,
                  sourceTenantName: tenantName
                });

                showToast(`"${name}" başarıyla eklendi ve sepete eklendi.`);
                
                addToCart({
                  id: docRef.id,
                  name,
                  price,
                  purchasePrice,
                  stock,
                  barcode,
                  quantity: 1
                });

                setIsQuickAddModalOpen(false);
              } catch (err) {
                console.error("Error quick adding product:", err);
                showToast("Ürün eklenirken hata oluştu", "error");
              }
            }} className="p-5 space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ürün Adı *</label>
                <input
                  required
                  type="text"
                  placeholder="Örn: Yeni Ürün"
                  value={quickAddForm.name}
                  onChange={e => setQuickAddForm({...quickAddForm, name: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Barkod Numarası *</label>
                <input
                  required
                  type="text"
                  value={quickAddForm.barcode}
                  onChange={e => setQuickAddForm({...quickAddForm, barcode: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Satış Fiyatı (₺) *</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={quickAddForm.price}
                    onChange={e => setQuickAddForm({...quickAddForm, price: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Başlangıç Stoğu</label>
                  <input
                    type="number"
                    value={quickAddForm.stock}
                    onChange={e => setQuickAddForm({...quickAddForm, stock: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 transition-all"
                >
                  Kaydet & Sepete Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Muhtelif / Serbest Ürün Ekle Modal */}
      {isMuhtelifModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-amber-50/70">
              <h3 className="text-base sm:text-lg font-black text-amber-950 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span>Muhtelif Ürün Ekle</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setIsMuhtelifModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMuhtelifProduct} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ürün Tanımı / Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Muhtelif Ürün, Fotokopi, Çeşit vb."
                  value={muhtelifForm.name}
                  onChange={e => setMuhtelifForm({ ...muhtelifForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Satış Fiyatı (₺) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={muhtelifForm.price}
                  onChange={e => setMuhtelifForm({ ...muhtelifForm, price: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white border-2 border-amber-300 rounded-xl text-lg font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[10, 20, 50, 100, 200, 500].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMuhtelifForm(prev => ({ ...prev, price: String(val) }))}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold text-amber-800 transition-all active:scale-95 shadow-xs"
                    >
                      {val} ₺
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Adet / Miktar</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const q = Math.max(1, (parseInt(muhtelifForm.quantity, 10) || 1) - 1);
                      setMuhtelifForm(prev => ({ ...prev, quantity: String(q) }));
                    }}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-black text-base flex items-center justify-center text-slate-700"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={muhtelifForm.quantity}
                    onChange={e => setMuhtelifForm({ ...muhtelifForm, quantity: e.target.value })}
                    className="flex-1 text-center py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const q = (parseInt(muhtelifForm.quantity, 10) || 1) + 1;
                      setMuhtelifForm(prev => ({ ...prev, quantity: String(q) }));
                    }}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-black text-base flex items-center justify-center text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsMuhtelifModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Sepete Ekle</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Market & Terazi: Hızlı Gramaj / Açık Ürün Satışı Modal */}
      {isScaleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-amber-50/70">
              <h3 className="text-base sm:text-lg font-black text-amber-950 flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-600" />
                <span>Hızlı Gramaj / Açık Ürün Satışı (Terazi)</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setIsScaleModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">Açık / Gramajlı Ürün Seç</label>
                <select
                  value={selectedScaleItem?.id || ''}
                  onChange={e => {
                    const found = scaleItems.find(i => i.id === e.target.value);
                    if (found) {
                      setSelectedScaleItem(found);
                      setScaleCustomPricePerKg(String(found.pricePerKg || 100));
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  {scaleItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.pricePerKg} ₺ / kg (PLU: #{item.plu})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">KG Fiyatı (₺)</label>
                <input
                  type="number"
                  step="0.01"
                  value={scaleCustomPricePerKg}
                  onChange={e => setScaleCustomPricePerKg(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Tartılan Ağırlık / Miktar (KG)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0.01"
                    value={scaleWeightKg}
                    onChange={e => setScaleWeightKg(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2.5 bg-amber-50/50 border-2 border-amber-300 rounded-xl text-lg font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-center"
                  />
                  <span className="text-xs font-black text-slate-600">KG</span>
                </div>
                {/* Quick Weight Presets */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[0.100, 0.250, 0.450, 0.500, 0.750, 1.000, 1.500, 2.000].map(kg => (
                    <button
                      key={kg}
                      type="button"
                      onClick={() => setScaleWeightKg(kg)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all active:scale-95"
                    >
                      {kg >= 1 ? `${kg} kg` : `${kg * 1000} gr`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Hesaplanan Tutar</p>
                  <p className="text-base font-black text-slate-900 font-mono mt-0.5">
                    {((parseFloat(scaleCustomPricePerKg) || 0) * scaleWeightKg).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Seçilen Ürün</p>
                  <p className="text-xs font-black text-amber-800 mt-0.5">{selectedScaleItem?.name}</p>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsScaleModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleAddWeightedItemToCart}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <Scale className="w-4 h-4" />
                  <span>Satışa Ekle</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kırtasiye Modülü: Fotokopi / Baskı Hesaplama Modal */}
      {isPhotocopyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-blue-950">Fotokopi & Baskı Hesapla</h3>
                  <p className="text-[10px] text-blue-700">Bulut senkronize birim fiyatlarla anlık hesaplama</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsPhotocopyModalOpen(false)} 
                className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddQuickPhotocopy} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Sayfa Sayısı</label>
                  <input
                    type="number"
                    min="1"
                    value={photoPageCount}
                    onChange={e => setPhotoPageCount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kopya Adedi</label>
                  <input
                    type="number"
                    min="1"
                    value={photoCopyCount}
                    onChange={e => setPhotoCopyCount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kağıt Boyutu</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPhotoPaperSize('A4')}
                      className={`py-2 rounded-xl text-xs font-black transition-all ${
                        photoPaperSize === 'A4' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      A4
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoPaperSize('A3')}
                      className={`py-2 rounded-xl text-xs font-black transition-all ${
                        photoPaperSize === 'A3' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      A3
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Baskı Renk</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPhotoColorMode('bw')}
                      className={`py-2 rounded-xl text-xs font-black transition-all ${
                        photoColorMode === 'bw' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      S/B
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoColorMode('color')}
                      className={`py-2 rounded-xl text-xs font-black transition-all ${
                        photoColorMode === 'color' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      Renkli
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={photoDoubleSided}
                    onChange={e => setPhotoDoubleSided(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Çift Yönlü Baskı (Özel Tarife)</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ekstra Ciltleme</label>
                <select
                  value={photoBinding}
                  onChange={e => setPhotoBinding(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="none">Ciltleme Yok (0 TL)</option>
                  <option value="plastic">Plastik Spiral Cilt</option>
                  <option value="wire">Tel Spiral Cilt</option>
                  <option value="thermal">Isısal Karton Kapak</option>
                </select>
              </div>

              {/* Live Preview Box */}
              <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Hesaplanan Tutar:</span>
                  <p className="text-lg font-black text-blue-300">
                    {(() => {
                      const p = Math.max(1, parseInt(photoPageCount, 10) || 1);
                      const copies = Math.max(1, parseInt(photoCopyCount, 10) || 1);
                      const rates = getKirtasiyeRates();
                      let baseRate = 1.5;
                      if (photoPaperSize === 'A4') {
                        if (photoDoubleSided) {
                          baseRate = photoColorMode === 'bw' ? rates.A4_bw_double : rates.A4_color_double;
                        } else {
                          baseRate = photoColorMode === 'bw' ? rates.A4_bw : rates.A4_color;
                        }
                      } else {
                        if (photoDoubleSided) {
                          baseRate = photoColorMode === 'bw' ? rates.A3_bw_double : rates.A3_color_double;
                        } else {
                          baseRate = photoColorMode === 'bw' ? rates.A3_bw : rates.A3_color;
                        }
                      }
                      const printCost = p * copies * baseRate;
                      const bindingExtra = photoBinding === 'plastic' ? rates.plasticSpiral : photoBinding === 'wire' ? rates.wireSpiral : photoBinding === 'thermal' ? rates.thermal : 0;
                      return (printCost + bindingExtra).toFixed(2);
                    })()} ₺
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Sepete Aktar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ürün İade Al Modal (Perakende & Cari Müşteri İadesi) */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-rose-50/70">
              <div>
                <h3 className="text-base sm:text-lg font-black text-rose-950 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                  <span>Ürün İadesi Al</span>
                </h3>
                <p className="text-xs text-rose-700">Perakende nakit iade veya Cari müşteri hesabından borç düşme</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsReturnModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* İade Türü Seçimi */}
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1.5">İADE TÜRÜ *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnMode('retail')}
                    className={`p-3 rounded-2xl border-2 text-left transition-all ${
                      returnMode === 'retail'
                        ? 'border-rose-600 bg-rose-50/80 text-rose-950 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-black">Perakende İade</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Kasadan nakit para ödenir</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnMode('customer')}
                    className={`p-3 rounded-2xl border-2 text-left transition-all ${
                      returnMode === 'customer'
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-black">Cari Müşteri İadesi</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Müşterinin veresiye borcundan düşülür</p>
                  </button>
                </div>
              </div>

              {/* Cari Müşteri Seçimi (Eğer Cari Moddaysa) */}
              {returnMode === 'customer' && (
                <div className="p-3.5 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-2">
                  <label className="block text-[11px] font-black text-indigo-950 uppercase">İADE ALINACAK CARİ MÜŞTERİ *</label>
                  {returnCustomer ? (
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-indigo-300">
                      <div>
                        <p className="text-xs font-black text-slate-900">{returnCustomer.name}</p>
                        <p className="text-[10px] text-indigo-700 font-bold">
                          Mevcut Borç: {Number(returnCustomer.debt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReturnCustomer(null)}
                        className="text-xs font-bold text-red-500 hover:underline"
                      >
                        Değiştir
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="Müşteri adı veya telefon ile arayın..."
                        value={customerSearchQuery}
                        onChange={e => setCustomerSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="max-h-36 overflow-y-auto space-y-1 border border-indigo-100 rounded-xl bg-white p-1">
                        {filteredCustomers.slice(0, 8).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setReturnCustomer(c)}
                            className="w-full text-left p-2 hover:bg-indigo-50 rounded-lg flex items-center justify-between text-xs transition-colors"
                          >
                            <span className="font-bold text-slate-900">{c.name}</span>
                            <span className="text-[10px] font-bold text-slate-500 font-mono">
                              Borç: {Number(c.debt || 0).toLocaleString('tr-TR')} ₺
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* İade Edilecek Ürün Seçimi */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-700 uppercase">İADE ALINACAK ÜRÜN *</label>
                
                {selectedReturnProduct ? (
                  <div className="p-3 bg-slate-50 border border-slate-300 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-900">{selectedReturnProduct.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {selectedReturnProduct.barcode ? `Barkod: ${selectedReturnProduct.barcode} • ` : ''}
                        Kayıtlı Fiyat: {Number(selectedReturnProduct.price || 0).toLocaleString('tr-TR')} ₺
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedReturnProduct(null)}
                      className="text-xs font-bold text-red-500 hover:underline"
                    >
                      Değiştir
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="Ürün adı veya barkod ile arayın..."
                      value={returnItemSearch}
                      onChange={e => setReturnItemSearch(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <div className="max-h-36 overflow-y-auto space-y-1 border border-slate-200 rounded-xl bg-white p-1">
                      {allProducts
                        .filter(p => {
                          const q = returnItemSearch.trim().toLocaleLowerCase('tr-TR');
                          if (!q) return true;
                          return (p.name || '').toLocaleLowerCase('tr-TR').includes(q) || (p.barcode || '').includes(q);
                        })
                        .slice(0, 10)
                        .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedReturnProduct(p);
                              setReturnUnitPrice(String(p.price || 0));
                            }}
                            className="w-full text-left p-2 hover:bg-rose-50 rounded-lg flex items-center justify-between text-xs transition-colors"
                          >
                            <span className="font-bold text-slate-900 truncate pr-2">{p.name}</span>
                            <span className="text-[11px] font-bold text-rose-600 font-mono shrink-0">
                              {Number(p.price || 0).toLocaleString('tr-TR')} ₺
                            </span>
                          </button>
                        ))}
                      
                      {returnItemSearch.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReturnProduct({
                              id: `custom-return-${Date.now()}`,
                              name: returnItemSearch.trim(),
                              price: parseFloat(returnUnitPrice) || 0,
                              stock: 0
                            });
                          }}
                          className="w-full text-left p-2 bg-amber-50 hover:bg-amber-100 rounded-lg text-xs font-bold text-amber-900 flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-600" />
                          <span>"{returnItemSearch.trim()}" İsimli Özel Ürün Olarak Seç</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Adet & Birim Fiyat */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">İade Adedi *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={returnQty}
                    onChange={e => setReturnQty(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Birim İade Tutarı (₺) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={returnUnitPrice}
                    onChange={e => setReturnUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                  />
                </div>
              </div>

              {/* İade Nedeni & Stok Artırımı */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">İade Nedeni</label>
                  <select
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="Müşteri İadesi">Müşteri İadesi</option>
                    <option value="Kusurlu / Bozuk Ürün">Kusurlu / Bozuk Ürün</option>
                    <option value="Yanlış Ürün Verildi">Yanlış Ürün Verildi</option>
                    <option value="Beğenmedi / Cayma">Beğenmedi / Cayma</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={restockOnReturn}
                    onChange={e => setRestockOnReturn(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                  />
                  <span className="text-xs font-bold text-slate-700">Ürünü Stoğa Geri Ekle (Stoğu Artır)</span>
                </label>
              </div>

              {/* Toplam İade Özeti Banner */}
              {(() => {
                const qty = parseInt(returnQty, 10) || 0;
                const price = parseFloat(returnUnitPrice.replace(',', '.')) || 0;
                const totalRet = Number((qty * price).toFixed(2));
                return (
                  <div className="p-3.5 bg-rose-500 text-white rounded-2xl flex items-center justify-between font-mono shadow-md">
                    <span className="text-xs font-black uppercase">
                      {returnMode === 'retail' ? 'MÜŞTERİYE ÖDENECEK NAKİT:' : 'CARİ BORÇTAN DÜŞÜLECEK:'}
                    </span>
                    <span className="text-xl font-black">{totalRet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>
                );
              })()}

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isProcessingReturn}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isProcessingReturn ? 'İşleniyor...' : 'İadeyi Onayla & Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. Bekleyen Satışlar Listesi Modal */}
      {isHeldSalesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-black uppercase">Bekleyen Satışlar ({heldSales.length})</h3>
                  <p className="text-[11px] text-slate-400">Önceden beklemeye alınmış veya park edilmiş satışlar</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHeldSalesModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {heldSales.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Bekleyen satış bulunmuyor
                </div>
              ) : (
                heldSales.map((h, idx) => (
                  <div key={h.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-400 transition-all space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-black uppercase">
                            #{idx + 1}
                          </span>
                          <h4 className="text-xs font-black text-slate-900">{h.note || 'İsimsiz Satış'}</h4>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {format(new Date(h.date), 'dd MMMM yyyy HH:mm', { locale: tr })} • {h.cart.length} Kalem Ürün
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black text-blue-600">
                          {h.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </span>
                        {h.customer && (
                          <p className="text-[10px] text-emerald-700 font-bold">Cari: {h.customer.name}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 space-y-1">
                      {h.cart.slice(0, 3).map((ci, cidx) => (
                        <div key={cidx} className="flex justify-between text-[10px]">
                          <span className="truncate max-w-[220px] font-medium">• {ci.name}</span>
                          <span className="font-bold text-slate-700">{ci.quantity} ad × {ci.price} ₺</span>
                        </div>
                      ))}
                      {h.cart.length > 3 && (
                        <p className="text-[9px] text-slate-400 italic">...ve {h.cart.length - 3} ürün daha</p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteHeldSale(h.id)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all border border-rose-200"
                      >
                        Sil
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResumeHeldSale(h)}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Satışa Devam Et</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHeldSalesModalOpen(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Satışı Beklet (Park Et) Not Modalı */}
      {isHoldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Pause className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-black text-slate-900 uppercase">Satışı Beklet / Park Et</h3>
              </div>
              <button onClick={() => setIsHoldModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Bu satışı sepetteki <strong>{cart.length}</strong> ürünle birlikte beklemeye alabilir, ardından başka bir müşteriye yeni satış yapabilirsiniz. İstediğiniz an geri yükleyebilirsiniz.
            </p>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                Satış Notu / Tanımlayıcı (İsteğe Bağlı)
              </label>
              <input
                type="text"
                placeholder={customer ? customer.name : 'Örn: Gömlekli müşteri, cüzdanını alacak'}
                value={holdNote}
                onChange={e => setHoldNote(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsHoldModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => handleHoldSale(holdNote)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Clock className="w-4 h-4" />
                <span>Beklemeye Al</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parçalı Ödeme Penceresi (Modal) */}
      {isSplitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-5 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Parçalı Ödeme (Karma)</h3>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total display */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 block">TOPLAM SATIŞ TUTARI</span>
                <span className="text-2xl font-black text-indigo-950 font-mono">
                  {currentTotalToPay.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase text-slate-500 block">Kalan / Fark</span>
                <span className={`text-sm font-black font-mono ${Math.abs(((parseFloat(splitCashAmount.replace(',', '.')) || 0) + (parseFloat(splitCardAmount.replace(',', '.')) || 0)) - currentTotalToPay) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(((parseFloat(splitCashAmount.replace(',', '.')) || 0) + (parseFloat(splitCardAmount.replace(',', '.')) || 0)) - currentTotalToPay).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-black uppercase text-emerald-900 mb-1 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>Nakit Ödenen Tutar</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={splitCashAmount}
                    onChange={(e) => handleCashChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl text-base font-black text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₺</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-blue-900 mb-1 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  <span>Kredi Kartı Ödenen Tutar</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={splitCardAmount}
                    onChange={(e) => handleCardChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-blue-300 rounded-xl text-base font-black text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₺</span>
                </div>
              </div>

              {/* Quick distribution buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const half = (currentTotalToPay / 2).toFixed(2);
                    setSplitCashAmount(half);
                    setSplitCardAmount((currentTotalToPay - Number(half)).toFixed(2));
                  }}
                  className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-all"
                >
                  %50 Nakit / %50 Kart
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSplitCashAmount(currentTotalToPay.toFixed(2));
                    setSplitCardAmount('0');
                  }}
                  className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold transition-all"
                >
                  Tamamı Nakit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSplitCashAmount('0');
                    setSplitCardAmount(currentTotalToPay.toFixed(2));
                  }}
                  className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-[11px] font-bold transition-all"
                >
                  Tamamı Kart
                </button>
              </div>
            </div>

            {/* Validation warning */}
            {Math.abs(((parseFloat(splitCashAmount.replace(',', '.')) || 0) + (parseFloat(splitCardAmount.replace(',', '.')) || 0)) - currentTotalToPay) >= 0.01 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>Ödeme tutarı toplam tutara eşit olmalıdır!</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('cash');
                  setIsSplitModalOpen(false);
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={Math.abs(((parseFloat(splitCashAmount.replace(',', '.')) || 0) + (parseFloat(splitCardAmount.replace(',', '.')) || 0)) - currentTotalToPay) >= 0.01}
                onClick={() => {
                  setPaymentMethod('parcali');
                  setIsSplitModalOpen(false);
                }}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-xs font-black shadow-md flex items-center gap-2 transition-all",
                  Math.abs(((parseFloat(splitCashAmount.replace(',', '.')) || 0) + (parseFloat(splitCardAmount.replace(',', '.')) || 0)) - currentTotalToPay) >= 0.01
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30 active:scale-95"
                )}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Parçalı Ödemeyi Uygula</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Satışı Sil Onay Modalı ("satışı sil demeden satış silinmesin") */}
      {isConfirmClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-rose-200 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900">Aktif Satışı Silmek İstiyor musunuz?</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Sepetinizdeki <strong>{cart.length}</strong> kalem ürün ve seçili müşteri kaldırılacaktır. Bu işlem geri alınamaz.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmClearModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleClearActiveCart}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-600/20 active:scale-95 transition-all"
              >
                Evet, Satışı Sil
              </button>
            </div>
          </div>
        </div>
      )}

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

export default POS;
