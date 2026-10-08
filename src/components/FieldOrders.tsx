import React, { useState, useEffect, useRef } from 'react';
import { 
  Truck, 
  Send, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  User, 
  Package, 
  Printer, 
  MessageCircle, 
  Trash2, 
  ChevronRight, 
  Calendar, 
  Store, 
  DollarSign, 
  Euro, 
  Coins, 
  Receipt, 
  Check, 
  ArrowRight,
  Filter,
  Layers,
  Sparkles,
  Phone,
  MapPin
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  serverTimestamp, 
  getDocs, 
  where, 
  increment, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { recordCashMovement, CurrencyType } from '../lib/kasa-utils';
import { CustomerData } from './customers/CustomerModal';
import { format } from 'date-fns';

export interface FieldOrderItem {
  id: string;
  name: string;
  barcode?: string;
  quantity: number;
  price: number;
  discount?: number;
  total: number;
}

export interface FieldOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  sellerCode: string;
  sellerName: string;
  sellerId: string;
  items: FieldOrderItem[];
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  currency: CurrencyType;
  exchangeRate?: number;
  foreignAmount?: number;
  paymentMethod: 'veresiye' | 'cash' | 'card' | 'transfer';
  notes?: string;
  status: 'BEKLIYOR' | 'HAZIRLANIYOR' | 'TAMAMLANDI' | 'IPTAL';
  createdAt: any;
  preparedAt?: any;
  preparedBy?: string;
  saleId?: string;
}

interface FieldOrdersProps {
  initialCustomer?: CustomerData | null;
  onClearInitialCustomer?: () => void;
}

export const FieldOrders: React.FC<FieldOrdersProps> = ({ 
  initialCustomer, 
  onClearInitialCustomer 
}) => {
  const { user, role, isDemo, checkDemoRestricted, hasPermission } = useAuth();

  const [orders, setOrders] = useState<FieldOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // New Order Modal states
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [orderCustomer, setOrderCustomer] = useState<CustomerData | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerData[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Products and Cart for the new order
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [orderCart, setOrderCart] = useState<FieldOrderItem[]>([]);
  
  // Staff Selection for Field Sales
  const [staffList, setStaffList] = useState<{ id: string; name: string; sellerCode: string }[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<{ id: string; name: string; code: string }>({
    id: user?.uid || 'guest',
    name: user?.displayName || user?.email?.split('@')[0] || 'Saha Personeli',
    code: user?.sellerCode || 'E01'
  });

  // Order Payment & Currency settings
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<'veresiye' | 'cash' | 'card' | 'transfer'>('veresiye');
  const [orderCurrency, setOrderCurrency] = useState<CurrencyType>('TRY');
  const [exchangeRates, setExchangeRates] = useState<{ USD: number; EUR: number }>({
    USD: Number(localStorage.getItem('sep_rate_usd') || '38.50'),
    EUR: Number(localStorage.getItem('sep_rate_eur') || '41.20')
  });
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected Order for detail & warehouse preparation
  const [selectedOrder, setSelectedOrder] = useState<FieldOrder | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isProcessingFulfillment, setIsProcessingFulfillment] = useState(false);

  // Central Fulfill / Edit Order Modal (Allow quantity and price changes by central branch)
  const [isFulfillModalOpen, setIsFulfillModalOpen] = useState(false);
  const [fulfillmentOrder, setFulfillmentOrder] = useState<FieldOrder | null>(null);
  const [fulfillmentItems, setFulfillmentItems] = useState<FieldOrderItem[]>([]);

  const openFulfillModal = (order: FieldOrder) => {
    if (checkDemoRestricted("Sipariş onaylama ve hazırlama")) return;
    if (role === 'staff' && !hasPermission('canFulfillOrders')) {
      alert("⚠️ Yetki Kısıtlaması: Merkez şube sipariş onaylama ve hazırlama yetkiniz bulunmamaktadır. Bu yetki yöneticiniz tarafından verilmelidir.");
      return;
    }
    setFulfillmentOrder(order);
    setFulfillmentItems(JSON.parse(JSON.stringify(order.items)));
    setIsFulfillModalOpen(true);
  };

  const updateFulfillmentItemQty = (id: string, delta: number) => {
    setFulfillmentItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty, total: newQty * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const setFulfillmentItemQtyDirect = (id: string, qty: number) => {
    const q = Math.max(0, qty);
    setFulfillmentItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, quantity: q, total: q * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const updateFulfillmentItemPrice = (id: string, price: number) => {
    const p = Math.max(0, price);
    setFulfillmentItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, price: p, total: item.quantity * p };
      }
      return item;
    }));
  };

  const fulfillRawSubtotal = fulfillmentItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const fulfillTotalDiscount = fulfillmentItems.reduce((sum, it) => sum + (it.discount || 0), 0);
  const fulfillSubtotal = fulfillRawSubtotal - fulfillTotalDiscount;
  const fulfillTaxAmount = fulfillSubtotal * 0.10;
  const fulfillGrandTotal = fulfillSubtotal + fulfillTaxAmount;
  const fulfillActiveRate = fulfillmentOrder?.currency === 'USD' ? exchangeRates.USD : fulfillmentOrder?.currency === 'EUR' ? exchangeRates.EUR : 1;
  const fulfillForeignAmount = fulfillmentOrder?.currency !== 'TRY' && fulfillActiveRate > 0 ? Number((fulfillGrandTotal / fulfillActiveRate).toFixed(2)) : fulfillGrandTotal;

  const handleConfirmFulfillment = async () => {
    if (!fulfillmentOrder) return;
    if (fulfillmentItems.length === 0) {
      alert("Siparişte hiç ürün kalmadı. İptal etmek istiyorsanız siparişi iptal edebilirsiniz.");
      return;
    }

    if (!window.confirm(`"${fulfillmentOrder.orderNumber}" numaralı siparişi düzenlenen miktar ve fiyatlarla onaylayıp hazırlamak istiyor musunuz?\n\n• Ürünler stoktan düşülecek\n• Müşterinin (${fulfillmentOrder.customerName}) carisine işlenecektir.`)) {
      return;
    }

    setIsProcessingFulfillment(true);
    try {
      // 1. Decrement Stock for all modified items in fulfillment
      for (const item of fulfillmentItems) {
        await updateDoc(doc(db, 'products', item.id), {
          stock: increment(-item.quantity),
          updatedAt: serverTimestamp()
        });
      }

      // 2. Create Sale Record in sales collection
      const saleRef = await addDoc(collection(db, 'sales'), {
        items: fulfillmentItems.map(it => ({
          id: it.id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          barcode: it.barcode || '',
          discount: it.discount || 0
        })),
        totalBeforeDiscount: fulfillRawSubtotal,
        discount: fulfillTotalDiscount,
        subtotal: fulfillSubtotal,
        taxAmount: fulfillTaxAmount,
        total: fulfillGrandTotal,
        currency: fulfillmentOrder.currency,
        exchangeRate: fulfillActiveRate,
        foreignAmount: fulfillmentOrder.currency !== 'TRY' ? fulfillForeignAmount : null,
        saleType: 'customer',
        customerId: fulfillmentOrder.customerId,
        customerName: fulfillmentOrder.customerName,
        customerPhone: fulfillmentOrder.customerPhone || null,
        sellerCode: fulfillmentOrder.sellerCode,
        sellerName: fulfillmentOrder.sellerName,
        sellerId: fulfillmentOrder.sellerId,
        paymentMethod: fulfillmentOrder.paymentMethod,
        orderNumber: fulfillmentOrder.orderNumber,
        notes: `Saha Siparişi Hazırlandı (Düzenlendi) (${fulfillmentOrder.orderNumber})`,
        date: serverTimestamp()
      });

      // 3. Customer Ledger & Debt Update
      const isVeresiye = fulfillmentOrder.paymentMethod === 'veresiye';
      const custDocRef = doc(db, 'customers', fulfillmentOrder.customerId);
      const custSnap = await getDoc(custDocRef);
      const currentDebt = Number(custSnap.data()?.debt || 0);
      const newDebt = isVeresiye ? (currentDebt + fulfillGrandTotal) : currentDebt;

      if (isVeresiye) {
        await updateDoc(custDocRef, {
          debt: increment(fulfillGrandTotal),
          totalSpent: increment(fulfillGrandTotal),
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(custDocRef, {
          totalSpent: increment(fulfillGrandTotal),
          updatedAt: serverTimestamp()
        });
      }

      // 4. Record Customer Transaction
      const itemsSummary = fulfillmentItems.map(i => `${i.quantity}x ${i.name}`).join(', ');
      await addDoc(collection(db, 'customer_transactions'), {
        customerId: fulfillmentOrder.customerId,
        customerName: fulfillmentOrder.customerName,
        saleId: saleRef.id,
        orderNumber: fulfillmentOrder.orderNumber,
        type: isVeresiye ? 'DEBT' : 'PURCHASE',
        title: `Saha Siparişi Teslimi (Düzenlendi) (${fulfillmentOrder.orderNumber}) - ${itemsSummary.length > 60 ? itemsSummary.slice(0, 60) + '...' : itemsSummary}`,
        amount: fulfillGrandTotal,
        previousBalance: currentDebt,
        balanceAfter: newDebt,
        paymentMethod: isVeresiye ? 'Veresiye (Saha)' : (fulfillmentOrder.paymentMethod === 'cash' ? 'Nakit (Saha)' : fulfillmentOrder.paymentMethod === 'card' ? 'Kredi Kartı (Saha)' : 'Havale (Saha)'),
        currency: fulfillmentOrder.currency,
        exchangeRate: fulfillActiveRate,
        foreignAmount: fulfillmentOrder.currency !== 'TRY' ? fulfillForeignAmount : null,
        sellerCode: fulfillmentOrder.sellerCode,
        sellerName: fulfillmentOrder.sellerName,
        date: serverTimestamp()
      });

      // 5. Cash Register movement if cash
      if (fulfillmentOrder.paymentMethod === 'cash') {
        await recordCashMovement({
          currency: fulfillmentOrder.currency,
          type: 'IN',
          amount: fulfillForeignAmount || fulfillGrandTotal,
          category: 'SALE',
          description: `Saha Sipariş Tahsilatı (${fulfillmentOrder.orderNumber}) - ${fulfillmentOrder.sellerCode} ${fulfillmentOrder.sellerName}`,
          referenceId: fulfillmentOrder.id,
          sellerCode: fulfillmentOrder.sellerCode,
          sellerName: fulfillmentOrder.sellerName,
          exchangeRate: fulfillActiveRate
        });
      }

      // 6. Update Field Order status to TAMAMLANDI
      await updateDoc(doc(db, 'field_orders', fulfillmentOrder.id), {
        status: 'TAMAMLANDI',
        items: fulfillmentItems,
        subtotal: fulfillSubtotal,
        taxAmount: fulfillTaxAmount,
        total: fulfillGrandTotal,
        foreignAmount: fulfillmentOrder.currency !== 'TRY' ? fulfillForeignAmount : null,
        preparedAt: serverTimestamp(),
        preparedBy: user?.displayName || user?.email || 'Merkez Şube',
        saleId: saleRef.id
      });

      alert(`✅ Sipariş (#${fulfillmentOrder.orderNumber}) güncellenerek onaylandı, stoktan düşüldü ve carisine işlendi!`);
      setIsFulfillModalOpen(false);
      setIsDetailModalOpen(false);
      setFulfillmentOrder(null);
    } catch (e: any) {
      console.error(e);
      alert("Sipariş onaylanırken hata oluştu: " + e.message);
    } finally {
      setIsProcessingFulfillment(false);
    }
  };

  // Print order template
  const [printingOrder, setPrintingOrder] = useState<FieldOrder | null>(null);

  // Load orders, products & staff in real-time
  useEffect(() => {
    // 1. Listen to field orders
    const q = query(collection(db, 'field_orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as FieldOrder[];
      setOrders(list);
      setLoading(false);
    });

    // 2. Listen to products for order cart search
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      const pList = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setAllProducts(pList);
    });

    // 3. Listen to staff users
    const unsubStaff = onSnapshot(collection(db, 'users'), (snap) => {
      const sList = snap.docs.map((d, index) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.displayName || data.email?.split('@')[0] || `Personel ${index + 1}`,
          sellerCode: data.sellerCode || `E0${index + 1}`
        };
      });
      setStaffList(sList);
      if (user) {
        const current = sList.find(s => s.id === user.uid || (user.sellerCode && s.sellerCode === user.sellerCode));
        if (current) {
          setSelectedSeller({ id: current.id, name: current.name, code: current.sellerCode });
        }
      }
    });

    return () => {
      unsubOrders();
      unsubProducts();
      unsubStaff();
    };
  }, [user]);

  // Handle preselected customer from Customer page
  useEffect(() => {
    if (initialCustomer) {
      setOrderCustomer(initialCustomer);
      setIsNewOrderModalOpen(true);
      if (onClearInitialCustomer) onClearInitialCustomer();
    }
  }, [initialCustomer, onClearInitialCustomer]);

  // Customer search autocomplete
  useEffect(() => {
    if (customerSearchQuery.trim().length > 1) {
      const timeout = setTimeout(async () => {
        try {
          const qCust = query(
            collection(db, 'customers'),
            where('name', '>=', customerSearchQuery),
            where('name', '<=', customerSearchQuery + '\uf8ff')
          );
          const snap = await getDocs(qCust);
          setCustomerSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerData)));
          setIsCustomerDropdownOpen(true);
        } catch (e) {
          console.error(e);
        }
      }, 200);
      return () => clearTimeout(timeout);
    } else {
      setCustomerSuggestions([]);
      setIsCustomerDropdownOpen(false);
    }
  }, [customerSearchQuery]);

  // Cart helper functions
  const addItemToCart = (prod: any) => {
    setOrderCart(prev => {
      const existing = prev.find(item => item.id === prod.id);
      if (existing) {
        return prev.map(item => 
          item.id === prod.id 
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price } 
            : item
        );
      }
      return [...prev, {
        id: prod.id,
        name: prod.name,
        barcode: prod.barcode || '',
        price: Number(prod.price || 0),
        quantity: 1,
        discount: 0,
        total: Number(prod.price || 0)
      }];
    });
    setProductSearchTerm('');
  };

  const updateCartQty = (id: string, delta: number) => {
    setOrderCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty, total: (newQty * item.price) - (item.discount || 0) };
      }
      return item;
    }));
  };

  const updateCartPrice = (id: string, newPrice: number) => {
    setOrderCart(prev => prev.map(item => {
      if (item.id === id) {
        const p = Math.max(0, newPrice);
        return { ...item, price: p, total: (item.quantity * p) - (item.discount || 0) };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setOrderCart(prev => prev.filter(item => item.id !== id));
  };

  // Calculations for order cart
  const rawSubtotal = orderCart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const totalDiscount = orderCart.reduce((sum, it) => sum + (it.discount || 0), 0);
  const subtotal = rawSubtotal - totalDiscount;
  const taxAmount = subtotal * 0.10; // 10% KDV
  const grandTotal = subtotal + taxAmount;

  const activeRate = orderCurrency === 'USD' ? exchangeRates.USD : orderCurrency === 'EUR' ? exchangeRates.EUR : 1;
  const foreignTotal = orderCurrency !== 'TRY' && activeRate > 0 ? Number((grandTotal / activeRate).toFixed(2)) : grandTotal;

  // 1. SAHA ELEMANI: SİPARİŞİ MERKEZE GÖNDER
  const handleSubmitOrderToCentral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkDemoRestricted("Saha siparişi oluşturma")) return;

    if (!orderCustomer || !orderCustomer.id) {
      alert("Lütfen sipariş için bir müşteri seçin.");
      return;
    }

    if (orderCart.length === 0) {
      alert("Lütfen siparişe en az bir ürün ekleyin.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Generate order number
      const orderNumber = `SIP-${Date.now().toString().slice(-6)}`;

      const orderData = {
        orderNumber,
        customerId: orderCustomer.id,
        customerName: orderCustomer.name,
        customerPhone: orderCustomer.phone || null,
        customerAddress: orderCustomer.address || null,
        sellerCode: selectedSeller.code || user?.sellerCode || 'E01',
        sellerName: selectedSeller.name || user?.displayName || user?.email?.split('@')[0] || 'Saha Personeli',
        sellerId: selectedSeller.id || user?.uid || 'guest',
        items: orderCart,
        subtotal,
        discount: totalDiscount,
        taxAmount,
        total: grandTotal,
        currency: orderCurrency,
        exchangeRate: activeRate,
        foreignAmount: orderCurrency !== 'TRY' ? foreignTotal : null,
        paymentMethod: orderPaymentMethod,
        notes: orderNotes.trim() || null,
        status: 'BEKLIYOR', // Merkez şube hazırlığı bekliyor!
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'field_orders'), orderData);

      alert(`✅ Sipariş (#${orderNumber}) merkez şubeye iletildi! Merkez şube ürünü hazırlayınca stoktan düşecek ve müşterinin carisine işlenecektir.`);
      
      // Reset form
      setOrderCart([]);
      setOrderCustomer(null);
      setOrderNotes('');
      setIsNewOrderModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Sipariş kaydedilirken hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. MERKEZ ŞUBE: SİPARİŞİ ONAYLA & HAZIRLA (STOKTAN DÜŞ + CARİYE İŞLE)
  const handleFulfillOrder = async (order: FieldOrder) => {
    if (checkDemoRestricted("Sipariş onaylama ve hazırlama")) return;

    if (role === 'staff' && !hasPermission('canFulfillOrders')) {
      alert("⚠️ Yetki Kısıtlaması: Merkez şube sipariş onaylama ve hazırlama yetkiniz bulunmamaktadır. Bu yetki yöneticiniz tarafından verilmelidir.");
      return;
    }

    if (!window.confirm(`"${order.orderNumber}" numaralı siparişi onaylayıp hazırlamak istiyor musunuz?\n\n• Ürünler stoktan düşülecek\n• Müşterinin (${order.customerName}) carisine işlenecektir.`)) {
      return;
    }

    setIsProcessingFulfillment(true);
    try {
      // 1. Decrement Stock for all items in order
      for (const item of order.items) {
        await updateDoc(doc(db, 'products', item.id), {
          stock: increment(-item.quantity),
          updatedAt: serverTimestamp()
        });
      }

      // 2. Create Sale Record in `sales` collection for accounting & staff turnover
      const saleRef = await addDoc(collection(db, 'sales'), {
        items: order.items.map(it => ({
          id: it.id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          barcode: it.barcode || '',
          discount: it.discount || 0
        })),
        totalBeforeDiscount: order.subtotal + order.discount,
        discount: order.discount || 0,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        total: order.total,
        currency: order.currency,
        exchangeRate: order.exchangeRate || 1,
        foreignAmount: order.foreignAmount || null,
        saleType: 'customer',
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone || null,
        sellerCode: order.sellerCode,
        sellerName: order.sellerName,
        sellerId: order.sellerId,
        paymentMethod: order.paymentMethod,
        orderNumber: order.orderNumber,
        notes: `Saha Siparişi Hazırlandı (${order.orderNumber})`,
        date: serverTimestamp()
      });

      // 3. Customer Ledger & Debt Update
      const isVeresiye = order.paymentMethod === 'veresiye';
      const custDocRef = doc(db, 'customers', order.customerId);
      const custSnap = await getDoc(custDocRef);
      const currentDebt = Number(custSnap.data()?.debt || 0);
      const newDebt = isVeresiye ? (currentDebt + order.total) : currentDebt;

      if (isVeresiye) {
        // Increment customer debt
        await updateDoc(custDocRef, {
          debt: increment(order.total),
          totalSpent: increment(order.total),
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(custDocRef, {
          totalSpent: increment(order.total),
          updatedAt: serverTimestamp()
        });
      }

      // 4. Record customer transaction with previousBalance and balanceAfter
      const itemsSummary = order.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
      await addDoc(collection(db, 'customer_transactions'), {
        customerId: order.customerId,
        customerName: order.customerName,
        saleId: saleRef.id,
        orderNumber: order.orderNumber,
        type: isVeresiye ? 'DEBT' : 'PURCHASE',
        title: `Saha Siparişi Teslimi (${order.orderNumber}) - ${itemsSummary.length > 60 ? itemsSummary.slice(0, 60) + '...' : itemsSummary}`,
        amount: order.total,
        previousBalance: currentDebt,
        balanceAfter: newDebt,
        paymentMethod: isVeresiye ? 'Veresiye (Saha)' : (order.paymentMethod === 'cash' ? 'Nakit (Saha)' : order.paymentMethod === 'card' ? 'Kredi Kartı (Saha)' : 'Havale (Saha)'),
        currency: order.currency,
        exchangeRate: order.exchangeRate || null,
        foreignAmount: order.foreignAmount || null,
        sellerCode: order.sellerCode,
        sellerName: order.sellerName,
        date: serverTimestamp()
      });

      // 5. If cash was collected by field agent, record into Cash Register
      if (order.paymentMethod === 'cash') {
        await recordCashMovement({
          currency: order.currency,
          type: 'IN',
          amount: order.foreignAmount || order.total,
          category: 'SALE',
          description: `Saha Sipariş Tahsilatı (${order.orderNumber}) - ${order.sellerCode} ${order.sellerName}`,
          referenceId: order.id,
          sellerCode: order.sellerCode,
          sellerName: order.sellerName,
          exchangeRate: order.exchangeRate
        });
      }

      // 6. Update order status to TAMAMLANDI
      await updateDoc(doc(db, 'field_orders', order.id), {
        status: 'TAMAMLANDI',
        saleId: saleRef.id,
        preparedAt: serverTimestamp(),
        preparedBy: user?.displayName || user?.email || 'Merkez Şube'
      });

      alert(`🎉 "${order.orderNumber}" numaralı sipariş başarıyla tamamlandı!\n• Stoklar güncellendi\n• Müşteri carisine ${isVeresiye ? 'borç olarak ' : ''}işlendi.`);
      setIsDetailModalOpen(false);
      setSelectedOrder(null);
    } catch (err) {
      console.error(err);
      alert("Sipariş hazırlanırken bir hata oluştu: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessingFulfillment(false);
    }
  };

  // Status changer (e.g. Hazırlanıyor / İptal)
  const handleChangeStatus = async (orderId: string, newStatus: 'HAZIRLANIYOR' | 'IPTAL') => {
    if (checkDemoRestricted("Sipariş durumu güncelleme")) return;
    try {
      await updateDoc(doc(db, 'field_orders', orderId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert("Durum güncellenirken hata oluştu.");
    }
  };

  // Print warehouse preparation ticket
  const handlePrintOrder = (order: FieldOrder) => {
    setPrintingOrder(order);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintingOrder(null), 1000);
    }, 150);
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'veresiye': return 'Veresiye (Cari)';
      case 'cash': return 'Nakit';
      case 'card': return 'Kredi Kartı';
      case 'transfer': return 'Havale / EFT';
      default: return method;
    }
  };

  // WhatsApp share
  const handleShareWhatsApp = (order: FieldOrder) => {
    if (!order.customerPhone) {
      alert("Müşterinin telefon numarası kayıtlı değil.");
      return;
    }
    const cleanPhone = order.customerPhone.replace(/[^0-9]/g, '');
    let msg = `Sayın *${order.customerName}*,\n\n`;
    msg += `📦 *Sipariş No:* ${order.orderNumber}\n`;
    msg += `👤 *Saha Temsilcisi:* [${order.sellerCode}] ${order.sellerName}\n`;
    msg += `💳 *Ödeme Türü:* ${getPaymentMethodLabel(order.paymentMethod)}\n`;
    msg += `📋 *Durum:* ${order.status === 'TAMAMLANDI' ? '✅ Hazırlandı & Onaylandı' : order.status === 'HAZIRLANIYOR' ? '⏳ Merkezde Hazırlanıyor' : '🕒 Merkez Onayı Bekliyor'}\n\n`;
    msg += `*Sipariş Kalemleri:*\n`;
    order.items.forEach((it, idx) => {
      msg += `${idx + 1}. ${it.name} - ${it.quantity} adet x ${it.price.toLocaleString('tr-TR')} ₺ = *${it.total.toLocaleString('tr-TR')} ₺*\n`;
    });
    msg += `\n*Toplam Tutar:* *${order.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺*`;
    if (order.currency !== 'TRY') {
      msg += ` (${order.currency === 'USD' ? '$' : '€'}${order.foreignAmount?.toFixed(2)})`;
    }
    msg += `\n\nTeşekkür eder, iyi çalışmalar dileriz.`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Filter orders
  const pendingOrdersCount = orders.filter(o => o.status === 'BEKLIYOR').length;

  const filteredOrders = orders.filter(o => {
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    const matchesSearch = searchTerm === '' || 
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.sellerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.sellerCode.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 lg:pb-12">
      {/* Pending Central Alert Banner */}
      {pendingOrdersCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white p-4 rounded-3xl shadow-xl flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center font-black">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-tight">Merkez Şube Uyarısı</h3>
              <p className="text-xs text-amber-100 font-medium">
                Saha personelinden gelen <strong>{pendingOrdersCount} adet yeni sipariş</strong> hazırlık ve onay bekliyor!
              </p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('BEKLIYOR')}
            className="px-4 py-2 bg-white text-amber-900 rounded-xl text-xs font-black shadow-md hover:bg-amber-50 transition-all shrink-0"
          >
            Bekleyenleri Gör
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Saha Satış & Sipariş Modülü</h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Mağaza ziyaret siparişleri, merkez şube hazırlığı, stok düşümü ve cari entegrasyonu
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            if (checkDemoRestricted("Saha siparişi oluşturma")) return;
            setOrderCustomer(null);
            setOrderCart([]);
            setIsNewOrderModalOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl flex items-center justify-center gap-2 font-black text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
        >
          <Send className="w-4 h-4" />
          <span>Yeni Saha Siparişi Gir</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tüm Siparişler ({orders.length})
          </button>

          <button
            onClick={() => setStatusFilter('BEKLIYOR')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              statusFilter === 'BEKLIYOR'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Merkez Hazırlık Bekliyor ({orders.filter(o => o.status === 'BEKLIYOR').length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('HAZIRLANIYOR')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              statusFilter === 'HAZIRLANIYOR'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <span>Hazırlanıyor ({orders.filter(o => o.status === 'HAZIRLANIYOR').length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('TAMAMLANDI')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              statusFilter === 'TAMAMLANDI'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tamamlandı / Cari & Stok İşlendi ({orders.filter(o => o.status === 'TAMAMLANDI').length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Sipariş no, müşteri veya eleman ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Orders List / Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-bold text-xs">
          Saha siparişleri yükleniyor...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200/80 p-8 space-y-3">
          <Truck className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-black text-slate-700 text-sm">Bu Filtrede Sipariş Bulunmuyor</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Saha satış personeli mağazaları gezip sipariş girdikçe burada listelenir ve merkez şube hazırlığına sunulur.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((ord) => {
            const oDate = ord.createdAt?.toDate ? ord.createdAt.toDate() : (ord.createdAt ? new Date(ord.createdAt) : new Date());
            const isPending = ord.status === 'BEKLIYOR';
            const isPreparing = ord.status === 'HAZIRLANIYOR';
            const isCompleted = ord.status === 'TAMAMLANDI';
            const isCancelled = ord.status === 'IPTAL';

            return (
              <div 
                key={ord.id}
                className={`bg-white rounded-3xl border transition-all p-5 shadow-sm hover:shadow-md flex flex-col justify-between space-y-4 ${
                  isPending ? 'border-amber-300 bg-amber-50/20' : 
                  isPreparing ? 'border-blue-300 bg-blue-50/20' :
                  isCompleted ? 'border-slate-200' : 'border-rose-200 bg-rose-50/20'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      {ord.orderNumber}
                    </span>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">
                      {format(oDate, 'dd.MM.yyyy HH:mm')}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                    isPending ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse' :
                    isPreparing ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                    isCompleted ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                    'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}>
                    {isPending ? 'Merkez Bekliyor' :
                     isPreparing ? 'Hazırlanıyor' :
                     isCompleted ? 'Hazırlandı & İşlendi' : 'İptal'}
                  </span>
                </div>

                {/* Customer & Staff Info */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-black text-slate-900 text-sm">
                    <User className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="truncate">{ord.customerName}</span>
                  </div>

                  {ord.customerPhone && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{ord.customerPhone}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
                    <span className="text-slate-400">Saha Elemanı:</span>
                    <span className="font-bold font-mono text-slate-800">
                      [{ord.sellerCode}] {ord.sellerName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="text-slate-400">Ödeme Şekli:</span>
                    <span className={`font-black uppercase ${
                      ord.paymentMethod === 'veresiye' ? 'text-rose-600' : 'text-slate-800'
                    }`}>
                      {getPaymentMethodLabel(ord.paymentMethod)}
                    </span>
                  </div>
                </div>

                {/* Order Summary & Items Preview */}
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-xs space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                    <span>Kalemler ({ord.items.length})</span>
                    <span>Tutar</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-medium text-[11px]">
                    {ord.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-slate-700">
                        <span className="truncate pr-2">{it.quantity}x {it.name}</span>
                        <span className="font-mono shrink-0">{it.total.toLocaleString('tr-TR')} ₺</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline font-black">
                    <span className="text-slate-900 text-xs">Toplam Tutar:</span>
                    <div className="text-right">
                      <span className="text-base text-indigo-700 font-mono">
                        {ord.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                      {ord.currency !== 'TRY' && (
                        <span className="block text-[10px] text-indigo-600 font-mono font-bold">
                          ({ord.currency === 'USD' ? '$' : '€'}{Number(ord.foreignAmount || 0).toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="space-y-2 pt-1">
                  {/* Fulfillment Action for Central Branch */}
                  {isPending && (
                    <button
                      onClick={() => openFulfillModal(ord)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Hazırla & Stoktan Düş + Cariye Yaz</span>
                    </button>
                  )}

                  {isPreparing && (
                    <button
                      onClick={() => openFulfillModal(ord)}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      <span>Hazırlığı Tamamla & Cariye Ekle</span>
                    </button>
                  )}

                  {isCompleted && (
                    <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100 text-[11px] text-emerald-800 font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Cariye ve Stoğa İşlendi</span>
                    </div>
                  )}

                  {/* Secondary buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedOrder(ord);
                        setIsDetailModalOpen(true);
                      }}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                    >
                      Detay / İncele
                    </button>

                    <button
                      onClick={() => handlePrintOrder(ord)}
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
                      title="Hazırlık / Fiş Çıktısı"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {ord.customerPhone && (
                      <button
                        onClick={() => handleShareWhatsApp(ord)}
                        className="p-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] rounded-xl transition-colors"
                        title="WhatsApp ile Müşteriye Gönder"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NEW FIELD ORDER MODAL (Saha Satış Elemanı İçin) */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] animate-slideUp">
            {/* Modal Header */}
            <div className="p-5 bg-indigo-600 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-indigo-200" />
                  <h3 className="font-black text-base uppercase tracking-tight">Yeni Saha Siparişi Gir</h3>
                </div>
                <p className="text-xs text-indigo-100 mt-0.5">
                  Sipariş doğrudan merkez şubeye gönderilir. Merkez hazırlayınca stoktan düşülür.
                </p>
              </div>
              <button 
                onClick={() => setIsNewOrderModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitOrderToCentral} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* SAHA SATIŞ ELEMANI SEÇİMİ */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-600" />
                    Saha Satış Temsilcisi (Personel)
                  </label>
                  <span className="text-[10px] font-mono font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    Kod: {selectedSeller.code}
                  </span>
                </div>
                <select
                  value={selectedSeller.code}
                  onChange={(e) => {
                    const found = staffList.find(s => s.sellerCode === e.target.value);
                    if (found) {
                      setSelectedSeller({ id: found.id, name: found.name, code: found.sellerCode });
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                >
                  {staffList.length > 0 ? (
                    staffList.map((st) => (
                      <option key={st.id} value={st.sellerCode}>
                        [{st.sellerCode}] {st.name}
                      </option>
                    ))
                  ) : (
                    <option value={selectedSeller.code}>
                      [{selectedSeller.code}] {selectedSeller.name}
                    </option>
                  )}
                </select>
              </div>

              {/* 1. MÜŞTERİ CARİSİ SEÇİMİ */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1.5">
                  1. Müşteri Carisi Seçimi *
                </label>
                {orderCustomer ? (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="font-black text-sm text-indigo-950">{orderCustomer.name}</p>
                      <p className="text-[11px] text-indigo-700 font-mono">
                        {orderCustomer.phone || 'Telefon Kayıtlı Değil'} | Güncel Borç: {Number(orderCustomer.debt || 0).toLocaleString('tr-TR')} ₺
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOrderCustomer(null)}
                      className="px-2.5 py-1 bg-white text-indigo-600 rounded-lg text-xs font-bold border border-indigo-200 hover:bg-indigo-100"
                    >
                      Değiştir
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Müşteri adı veya telefon ile ara..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />

                    {isCustomerDropdownOpen && customerSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto p-1.5 space-y-1">
                        {customerSuggestions.map(cust => (
                          <div
                            key={cust.id}
                            onClick={() => {
                              setOrderCustomer(cust);
                              setIsCustomerDropdownOpen(false);
                              setCustomerSearchQuery('');
                            }}
                            className="p-2.5 hover:bg-indigo-50 rounded-xl cursor-pointer text-xs flex items-center justify-between transition-colors"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{cust.name}</p>
                              <p className="text-[10px] text-slate-400">{cust.phone || 'Telefon yok'}</p>
                            </div>
                            <span className="font-black text-rose-600 font-mono">
                              {Number(cust.debt || 0).toLocaleString('tr-TR')} ₺
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. ÜRÜN EKLEME */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1.5">
                  2. Sipariş Kalemleri / Ürünler *
                </label>
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Siparişe eklenecek ürünü ara..."
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                  />

                  {productSearchTerm.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto p-1.5 space-y-1">
                      {allProducts
                        .filter(p => p.name?.toLowerCase().includes(productSearchTerm.toLowerCase()) || p.barcode?.includes(productSearchTerm))
                        .slice(0, 8)
                        .map(p => (
                          <div
                            key={p.id}
                            onClick={() => addItemToCart(p)}
                            className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer text-xs flex items-center justify-between"
                          >
                            <div>
                              <p className="font-bold text-slate-800">{p.name}</p>
                              <p className="text-[10px] text-slate-400">Mevcut Stok: {p.stock || 0}</p>
                            </div>
                            <span className="font-black text-indigo-600 font-mono">{Number(p.price || 0).toLocaleString('tr-TR')} ₺</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Selected Items Cart */}
                {orderCart.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                    Henüz ürün eklenmedi. Yukarıdan ürün aratarak sepete ekleyin.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {orderCart.map((it) => (
                      <div key={it.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 truncate">{it.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                            <span>Birim: {it.price.toLocaleString('tr-TR')} ₺</span>
                          </div>
                        </div>

                        {/* Qty Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQty(it.id, -1)}
                            className="w-6 h-6 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-black font-mono">{it.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(it.id, 1)}
                            className="w-6 h-6 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>

                        <div className="w-20 text-right font-black font-mono text-slate-900 shrink-0">
                          {it.total.toLocaleString('tr-TR')} ₺
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(it.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. ÖDEME YÖNTEMİ & DÖVİZ SEÇİMİ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1">
                    Ödeme Şekli *
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOrderPaymentMethod('veresiye')}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-black border transition-all ${
                        orderPaymentMethod === 'veresiye'
                          ? 'border-rose-600 bg-rose-50 text-rose-700 shadow-sm'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Veresiye (Cari)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderPaymentMethod('cash')}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-black border transition-all ${
                        orderPaymentMethod === 'cash'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Nakit
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderPaymentMethod('card')}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-black border transition-all ${
                        orderPaymentMethod === 'card'
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Kredi Kartı
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderPaymentMethod('transfer')}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-black border transition-all ${
                        orderPaymentMethod === 'transfer'
                          ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-sm'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      Havale / EFT
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1">
                    Para Birimi
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['TRY', 'USD', 'EUR'] as CurrencyType[]).map((cur) => (
                      <button
                        key={cur}
                        type="button"
                        onClick={() => setOrderCurrency(cur)}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-black border transition-all ${
                          orderCurrency === cur
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {cur === 'TRY' ? '₺ TL' : cur === 'USD' ? '$ USD' : '€ EUR'}
                      </button>
                    ))}
                  </div>

                  {/* Manuel Kur Girişi (USD / EUR) */}
                  {orderCurrency !== 'TRY' && (
                    <div className="mt-2.5 p-2 bg-indigo-50/60 border border-indigo-200/80 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-bold text-indigo-950">
                        {orderCurrency} Manuel Kur:
                      </span>
                      <div className="flex items-center gap-1.5 w-28">
                        <input
                          type="number"
                          step="0.01"
                          value={orderCurrency === 'USD' ? exchangeRates.USD : exchangeRates.EUR}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setExchangeRates(prev => {
                              const updated = { ...prev, [orderCurrency]: val };
                              if (orderCurrency === 'USD') localStorage.setItem('sep_rate_usd', val.toString());
                              if (orderCurrency === 'EUR') localStorage.setItem('sep_rate_eur', val.toString());
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 bg-white border border-indigo-300 rounded-lg text-right font-black font-mono focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-indigo-700">₺</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-1">
                  Saha Teslimat Notları / Açıklama
                </label>
                <textarea
                  rows={2}
                  placeholder="Müşterinin özel isteği, teslimat saati veya adres detayı..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Order Total Bar */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Sipariş Toplamı</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black font-mono">
                      {grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                    {orderCurrency !== 'TRY' && (
                      <span className="text-sm font-bold text-indigo-300 font-mono">
                        ({orderCurrency === 'USD' ? '$' : '€'}{foreignTotal.toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNewOrderModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || orderCart.length === 0}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'İletiliyor...' : 'Merkez Şubeye Gönder'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL (Merkez Şube İnceleme & İşlem) */}
      {isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="px-2 py-0.5 rounded bg-indigo-600 font-mono text-xs font-black">
                  {selectedOrder.orderNumber}
                </span>
                <h3 className="font-black text-base uppercase mt-1">Saha Siparişi Detayı</h3>
              </div>
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Customer & Field Staff */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Müşteri:</span>
                  <span className="font-black text-slate-900 text-sm">{selectedOrder.customerName}</span>
                </div>
                {selectedOrder.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Telefon:</span>
                    <span className="font-bold text-slate-700">{selectedOrder.customerPhone}</span>
                  </div>
                )}
                {selectedOrder.customerAddress && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Adres:</span>
                    <span className="text-slate-700 text-right">{selectedOrder.customerAddress}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-400">Saha Satış Elemanı:</span>
                  <span className="font-bold text-indigo-700 font-mono">[{selectedOrder.sellerCode}] {selectedOrder.sellerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ödeme Şekli:</span>
                  <span className="font-black uppercase text-slate-800">{getPaymentMethodLabel(selectedOrder.paymentMethod)}</span>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-black text-xs uppercase tracking-wider text-slate-400 mb-2">Hazırlanacak Ürünler</h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {selectedOrder.items.map((it, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{it.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{it.quantity} Adet x {it.price.toLocaleString('tr-TR')} ₺</p>
                      </div>
                      <span className="font-black text-indigo-700 font-mono">{it.total.toLocaleString('tr-TR')} ₺</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.notes && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                  <span className="font-bold block text-[10px] uppercase">Saha Notu:</span>
                  <p className="mt-0.5">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex flex-col gap-2">
                {selectedOrder.status === 'BEKLIYOR' && (
                  <button
                    onClick={() => openFulfillModal(selectedOrder)}
                    disabled={isProcessingFulfillment}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isProcessingFulfillment ? 'İşleniyor...' : 'Siparişi Hazırla (Stoktan Düş & Cariye Ekle)'}</span>
                  </button>
                )}

                {selectedOrder.status === 'BEKLIYOR' && (
                  <button
                    onClick={() => handleChangeStatus(selectedOrder.id, 'IPTAL')}
                    className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors"
                  >
                    Siparişi İptal Et
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CENTRAL FULFILL & EDIT ORDER MODAL (Merkez Şube Ürün Eksik / Adet / Fiyat Düzenleme) */}
      {isFulfillModalOpen && fulfillmentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="p-5 bg-emerald-600 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="font-black text-base uppercase tracking-tight">
                    Sipariş Hazırlama & Düzenleme ({fulfillmentOrder.orderNumber})
                  </h3>
                </div>
                <p className="text-xs text-emerald-100 mt-0.5">
                  Müşteri: <strong>{fulfillmentOrder.customerName}</strong> | Ürün eksikse adet değiştirebilir veya fiyat güncelleyebilirsiniz.
                </p>
              </div>
              <button 
                onClick={() => setIsFulfillModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Order Info Banner */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 flex flex-wrap justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Saha Elemanı</span>
                  <span className="font-bold text-slate-800">[{fulfillmentOrder.sellerCode}] {fulfillmentOrder.sellerName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Ödeme Türü</span>
                  <span className="font-black uppercase text-indigo-700">{getPaymentMethodLabel(fulfillmentOrder.paymentMethod)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Para Birimi</span>
                  <span className="font-bold text-slate-800">{fulfillmentOrder.currency}</span>
                </div>
              </div>

              {/* Editable Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-700">
                    Sipariş Kalemleri (Adet ve Fiyatları Düzenleyebilirsiniz):
                  </h4>
                  <span className="text-[11px] text-slate-400 font-medium">Stoklar onaylandığı anda düşer</span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white shadow-2xs">
                  {fulfillmentItems.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-bold">
                      Siparişte hiç ürün kalmadı.
                    </div>
                  ) : (
                    fulfillmentItems.map((item) => (
                      <div key={item.id} className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">Barkod: {item.barcode || 'Yok'}</p>
                        </div>

                        {/* Quantity & Price Editors */}
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                          {/* Quantity Stepper */}
                          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                            <button
                              type="button"
                              onClick={() => updateFulfillmentItemQty(item.id, -1)}
                              className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-200 font-bold text-xs"
                              title="Adet Azalt"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => setFulfillmentItemQtyDirect(item.id, parseInt(e.target.value) || 0)}
                              className="w-12 py-1.5 text-center bg-transparent font-black text-xs focus:outline-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => updateFulfillmentItemQty(item.id, 1)}
                              className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-200 font-bold text-xs"
                              title="Adet Artır"
                            >
                              +
                            </button>
                          </div>

                          {/* Unit Price Input */}
                          <div className="flex items-center gap-1 w-28">
                            <input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => updateFulfillmentItemPrice(item.id, parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-right font-black font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                              title="Birim Fiyatı Değiştir"
                            />
                            <span className="text-slate-500 font-bold text-xs">₺</span>
                          </div>

                          {/* Total for item */}
                          <div className="w-24 text-right font-black font-mono text-slate-900 text-xs">
                            {item.total.toLocaleString('tr-TR')} ₺
                          </div>

                          {/* Remove item button */}
                          <button
                            type="button"
                            onClick={() => {
                              setFulfillmentItems(prev => prev.filter(i => i.id !== item.id));
                            }}
                            className="text-slate-300 hover:text-rose-600 p-1 rounded-lg transition-colors"
                            title="Ürünü Siparişten Çıkar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white space-y-2">
                <div className="flex justify-between text-slate-300 text-xs">
                  <span>Ara Toplam:</span>
                  <span className="font-mono font-bold">{fulfillSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
                <div className="flex justify-between text-slate-300 text-xs">
                  <span>KDV (%10):</span>
                  <span className="font-mono font-bold">{fulfillTaxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
                  <span className="font-black uppercase text-sm">Güncel Genel Toplam:</span>
                  <div className="text-right">
                    <span className="text-xl font-black text-emerald-400 font-mono">
                      {fulfillGrandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                    {fulfillmentOrder.currency !== 'TRY' && (
                      <span className="block text-[11px] text-emerald-300 font-mono font-bold">
                        ({fulfillmentOrder.currency === 'USD' ? '$' : '€'}{fulfillForeignAmount.toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsFulfillModalOpen(false)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={isProcessingFulfillment || fulfillmentItems.length === 0}
                onClick={handleConfirmFulfillment}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isProcessingFulfillment ? 'İşleniyor...' : 'Onayla, Stoktan Düş ve Carisine İşle'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY WAREHOUSE PACKING SLIP (Yazdırma Şablonu) */}
      {printingOrder && (
        <div id="field-order-print" className="hidden print:block p-8 bg-white text-black font-sans">
          <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">SAHA SİPARİŞİ / DEPO HAZIRLIK FİŞİ</h1>
              <p className="text-xs text-indigo-600 font-black tracking-widest uppercase mt-0.5">BULUT POS - MERKEZ ŞUBE</p>
            </div>
            <div className="text-right text-xs space-y-1">
              <p><span className="font-bold">Sipariş No:</span> {printingOrder.orderNumber}</p>
              <p><span className="font-bold">Tarih:</span> {format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
            <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
              <h3 className="font-black text-[10px] uppercase text-slate-500 mb-1">MÜŞTERİ CARİ BİLGİSİ</h3>
              <p className="font-black text-sm">{printingOrder.customerName}</p>
              <p className="text-slate-600">Tel: {printingOrder.customerPhone || '-'}</p>
              <p className="text-slate-600">Adres: {printingOrder.customerAddress || '-'}</p>
            </div>

            <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
              <h3 className="font-black text-[10px] uppercase text-slate-500 mb-1">SAHA SATIŞ BİLGİSİ</h3>
              <p className="font-black text-sm">[{printingOrder.sellerCode}] {printingOrder.sellerName}</p>
              <p className="text-slate-600">Ödeme: {printingOrder.paymentMethod.toUpperCase()}</p>
              <p className="text-slate-600">Durum: {printingOrder.status}</p>
            </div>
          </div>

          <table className="w-full text-left text-xs mb-4 border border-slate-300">
            <thead className="bg-slate-900 text-white font-bold text-[10px] uppercase">
              <tr>
                <th className="p-2 w-10 text-center">#</th>
                <th className="p-2">Ürün Adı</th>
                <th className="p-2 text-center w-20">Adet</th>
                <th className="p-2 text-right w-24">Birim Fiyat</th>
                <th className="p-2 text-right w-28">Toplam</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {printingOrder.items.map((it, idx) => (
                <tr key={idx}>
                  <td className="p-2 text-center font-bold">{idx + 1}</td>
                  <td className="p-2 font-bold">{it.name}</td>
                  <td className="p-2 text-center font-bold text-sm">{it.quantity}</td>
                  <td className="p-2 text-right">{it.price.toLocaleString('tr-TR')} TL</td>
                  <td className="p-2 text-right font-bold">{it.total.toLocaleString('tr-TR')} TL</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center p-3 border border-slate-300 rounded-xl bg-slate-50 text-sm font-black mb-8">
            <span>GENEL TOPLAM:</span>
            <span>{printingOrder.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
          </div>

          <div className="grid grid-cols-2 gap-8 text-xs pt-8 border-t border-slate-300 text-center">
            <div>
              <p className="font-bold">Siparişi Alan (Saha Elemanı)</p>
              <p className="mt-8 text-slate-400">İmza</p>
            </div>
            <div>
              <p className="font-bold">Depo / Merkez Hazırlayan</p>
              <p className="mt-8 text-slate-400">İmza</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default FieldOrders;
