import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Package, 
  ArrowLeftRight, 
  Truck, 
  History, 
  Search, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft, 
  Store, 
  Warehouse, 
  Clock, 
  User, 
  Tag, 
  RefreshCw,
  FileText,
  Camera,
  Layers,
  DollarSign,
  Barcode,
  Boxes,
  FileCheck,
  Building,
  Sparkles
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  runTransaction, 
  orderBy,
  increment,
  setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { isDocInTenant, withTenant, isSepetayTenant } from '../lib/tenant';
import { format } from 'date-fns';
import { BarcodeScannerModal } from './scanner/BarcodeScannerModal';

// Robust backwards compatibility helpers for store and warehouse stocks
export const getProductMagazaStok = (p: any): number => {
  if (!p) return 0;
  // 1. Explicit magazaStok or magazaStoku
  const explicit = p.magazaStoku ?? p.magazaStok;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const val = Number(explicit);
    if (!isNaN(val)) {
      if (val > 0) return val;
      // If explicit is 0, but legacy fields (stok, stock, quantity) have value and depoStok wasn't set, respect legacy
      const legacy = Number(p.stock ?? p.stok ?? p.quantity ?? p.miktar ?? p.adet ?? 0);
      if (val === 0 && legacy > 0 && !p.depoStok && !p.depoStoku) {
        return legacy;
      }
      return val;
    }
  }
  // 2. Direct acceptance of legacy stock/stok/quantity as magazaStoku
  const fallback = Number(p.stock ?? p.stok ?? p.quantity ?? p.miktar ?? p.adet ?? 0);
  return isNaN(fallback) ? 0 : fallback;
};

export const getProductDepoStok = (p: any): number => {
  if (!p) return 0;
  const explicit = p.depoStoku ?? p.depoStok ?? p.stokDepo ?? p.warehouseStock;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const val = Number(explicit);
    if (!isNaN(val)) return val;
  }
  return 0;
};

export const getProductToplamStok = (p: any): number => {
  return getProductMagazaStok(p) + getProductDepoStok(p);
};

export const WarehouseManagement: React.FC = () => {
  const { user, role, tenantId, isSuperAdmin, hasPermission } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'intake' | 'transfer' | 'orders' | 'history'>('stock');
  const [stockViewMode, setStockViewMode] = useState<'all' | 'magaza' | 'depo'>('all');
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [fieldOrders, setFieldOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Camera Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTargetMode, setScannerTargetMode] = useState<'search' | 'intake' | 'transfer' | 'new_product_barcode'>('search');

  // Depo Düzenle & Ürün Girişi Modal State
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [modalNewDepoStok, setModalNewDepoStok] = useState('');
  const [incomingQty, setIncomingQty] = useState('');
  const [incomingPurchasePrice, setIncomingPurchasePrice] = useState('');
  const [incomingSupplier, setIncomingSupplier] = useState('');
  const [incomingInvoiceNo, setIncomingInvoiceNo] = useState('');
  const [incomingNote, setIncomingNote] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);

  // Dedicated Depo Mal Girişi (Intake) Form State
  const [intakeMode, setIntakeMode] = useState<'existing' | 'new_product'>('existing');
  const [intakeProductId, setIntakeProductId] = useState('');
  const [intakeSearchTerm, setIntakeSearchTerm] = useState('');
  const [intakeQty, setIntakeQty] = useState('1');
  const [intakePurchasePrice, setIntakePurchasePrice] = useState('');
  const [intakeSupplier, setIntakeSupplier] = useState('');
  const [intakeInvoiceNo, setIntakeInvoiceNo] = useState('');
  const [intakeNote, setIntakeNote] = useState('');
  const [isIntakeSaving, setIsIntakeSaving] = useState(false);

  // Mod B: Sıfırdan Yeni Ürün Tanımlayarak Depo Girişi Form State
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    barcode: '',
    category: 'Kırtasiye',
    purchasePrice: '',
    price: '',
    qty: '1',
    supplier: '',
    invoiceNo: '',
    note: ''
  });
  const [isNewProductSaving, setIsNewProductSaving] = useState(false);

  // Transfer Form State
  const [transferProductId, setTransferProductId] = useState('');
  const [transferQty, setTransferQty] = useState('1');
  const [transferDirection, setTransferDirection] = useState<'depo_to_magaza' | 'magaza_to_depo'>('depo_to_magaza');
  const [isTransferring, setIsTransferring] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    const isSep = isSepetayTenant(tenantId);
    const pMap = new Map<string, any>();

    const updateCombinedProducts = () => {
      const list = Array.from(pMap.values()).filter(p => isDocInTenant(p, tenantId));
      setProducts(list);
      setLoading(false);
    };

    const unsubs: (() => void)[] = [];

    // 1. Direct subcollection listener for Sepetay
    if (isSep) {
      const unsubSepSub = onSnapshot(collection(db, 'tenants', 'sepetay', 'products'), (snapshot) => {
        snapshot.docs.forEach(d => {
          pMap.set(d.id, { id: d.id, tenantId: 'sepetay', tenant_id: 'sepetay', ...d.data() });
        });
        updateCombinedProducts();
      }, (err) => console.warn("tenants/sepetay/products listener warning in warehouse:", err));
      unsubs.push(unsubSepSub);
    }

    // 2. Root collections (products, urunler, stok)
    const collNames = ['products', 'urunler', 'stok'];
    collNames.forEach(cName => {
      const u = onSnapshot(collection(db, cName), (snapshot) => {
        snapshot.docs.forEach(d => {
          pMap.set(d.id, { id: d.id, ...d.data() });
        });
        updateCombinedProducts();
      }, (err) => console.warn(`Product collection listener warning in warehouse for ${cName}:`, err));
      unsubs.push(u);
    });

    // 3. Stock movements history listener
    const unsubMovements = onSnapshot(query(collection(db, 'stok_hareketleri'), orderBy('createdAt', 'desc')), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((m: any) => isDocInTenant(m, tenantId));
      setMovements(list);
    }, (err) => console.warn("Stock movements error:", err));
    unsubs.push(unsubMovements);

    // 4. Field orders / mal talepleri listener
    const unsubOrders = onSnapshot(collection(db, 'field_orders'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((o: any) => isDocInTenant(o, tenantId));
      setFieldOrders(list);
    }, (err) => console.warn("Field orders error:", err));
    unsubs.push(unsubOrders);

    return () => {
      unsubs.forEach(u => u());
    };
  }, [tenantId]);

  // Handle Atomic Stock Transfer using Firebase Transaction
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferProductId) {
      alert("Lütfen bir ürün seçin.");
      return;
    }
    const qty = parseInt(transferQty);
    if (isNaN(qty) || qty <= 0) {
      alert("Lütfen geçerli bir transfer miktarı girin.");
      return;
    }

    const selectedProduct = products.find(p => p.id === transferProductId);
    if (!selectedProduct) {
      alert("Seçilen ürün bulunamadı.");
      return;
    }

    const currentMagazaStok = getProductMagazaStok(selectedProduct);
    const currentDepoStok = getProductDepoStok(selectedProduct);

    if (transferDirection === 'depo_to_magaza' && currentDepoStok < qty) {
      alert(`Yetersiz depo stoku! Depoda mevcut: ${currentDepoStok}, İstenen: ${qty}`);
      return;
    }
    if (transferDirection === 'magaza_to_depo' && currentMagazaStok < qty) {
      alert(`Yetersiz mağaza stoku! Mağazada mevcut: ${currentMagazaStok}, İstenen: ${qty}`);
      return;
    }

    setIsTransferring(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', transferProductId);
        const pDoc = await transaction.get(productRef);
        
        let pData = pDoc.exists() ? pDoc.data() : selectedProduct;
        const magazaStok = getProductMagazaStok(pData);
        const depoStok = getProductDepoStok(pData);

        let newMagazaStok = magazaStok;
        let newDepoStok = depoStok;

        if (transferDirection === 'depo_to_magaza') {
          if (depoStok < qty) throw new Error("Depoda yeterli stok kalmadı.");
          newDepoStok = depoStok - qty;
          newMagazaStok = magazaStok + qty;
        } else {
          if (magazaStok < qty) throw new Error("Mağazada yeterli stok kalmadı.");
          newMagazaStok = magazaStok - qty;
          newDepoStok = depoStok + qty;
        }

        // Update product document atomically across all compatibility fields
        const updatePayload = {
          stock: newMagazaStok,
          stok: newMagazaStok,
          magazaStok: newMagazaStok,
          magazaStoku: newMagazaStok,
          depoStok: newDepoStok,
          depoStoku: newDepoStok,
          stokDepo: newDepoStok,
          warehouseStock: newDepoStok,
          updatedAt: serverTimestamp()
        };

        if (pDoc.exists()) {
          transaction.update(productRef, updatePayload);
        } else {
          transaction.set(productRef, { ...selectedProduct, ...updatePayload }, { merge: true });
        }

        if (isSepetayTenant(tenantId)) {
          const sepSubRef = doc(db, 'tenants', 'sepetay', 'products', transferProductId);
          transaction.set(sepSubRef, updatePayload, { merge: true });
        }

        // Add to stok_hareketleri log
        const logRef = doc(collection(db, 'stok_hareketleri'));
        transaction.set(logRef, withTenant({
          productId: transferProductId,
          productName: pData.name || selectedProduct.name || 'İsimsiz Ürün',
          barcode: pData.barcode || selectedProduct.barcode || '',
          quantity: qty,
          direction: transferDirection,
          senderLocation: transferDirection === 'depo_to_magaza' ? 'Depo' : 'Mağaza',
          receiverLocation: transferDirection === 'depo_to_magaza' ? 'Mağaza' : 'Depo',
          operatorName: user?.displayName || user?.email || 'Depo Sorumlusu',
          createdAt: serverTimestamp()
        }, tenantId));
      });

      showToast(`✅ Stok transferi başarıyla gerçekleştirildi! (${qty} adet)`);
      setTransferQty('1');
      setTransferProductId('');
      setActiveSubTab('history');
    } catch (err: any) {
      console.error(err);
      alert("Transfer işlemi başarısız: " + err.message);
    } finally {
      setIsTransferring(false);
    }
  };

  // Open Edit Stock Modal
  const openEditModal = (p: any) => {
    setEditingProduct(p);
    const depo = getProductDepoStok(p);
    setModalNewDepoStok(depo.toString());
    setIncomingQty('');
    setIncomingPurchasePrice(p.purchasePrice ? String(p.purchasePrice) : '');
    setIncomingSupplier('');
    setIncomingInvoiceNo('');
    setIncomingNote('');
  };

  // Save Warehouse Stock & Incoming Shipment Modal
  const handleSaveWarehouseStockModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const baseDepo = getProductDepoStok(editingProduct);
    const directTarget = modalNewDepoStok !== '' ? parseInt(modalNewDepoStok) : baseDepo;
    const addQty = incomingQty !== '' ? parseInt(incomingQty) : 0;
    
    if (isNaN(directTarget) || directTarget < 0) {
      alert("Lütfen geçerli bir depo stok miktarı girin.");
      return;
    }

    const finalDepoStok = addQty > 0 ? baseDepo + addQty : directTarget;

    setIsSavingStock(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', editingProduct.id);
        const pDoc = await transaction.get(productRef);
        const pData = pDoc.exists() ? pDoc.data() : editingProduct;
        const currentDepo = getProductDepoStok(pData);
        const diff = finalDepoStok - currentDepo;

        const warehouseUpdatePayload: any = {
          depoStok: finalDepoStok,
          depoStoku: finalDepoStok,
          stokDepo: finalDepoStok,
          warehouseStock: finalDepoStok,
          updatedAt: serverTimestamp()
        };

        if (incomingPurchasePrice && parseFloat(incomingPurchasePrice) > 0) {
          warehouseUpdatePayload.purchasePrice = parseFloat(incomingPurchasePrice);
          warehouseUpdatePayload.alisFiyati = parseFloat(incomingPurchasePrice);
        }

        if (pDoc.exists()) {
          transaction.update(productRef, warehouseUpdatePayload);
        } else {
          transaction.set(productRef, { ...editingProduct, ...warehouseUpdatePayload }, { merge: true });
        }

        if (isSepetayTenant(tenantId)) {
          const sepSubRef = doc(db, 'tenants', 'sepetay', 'products', editingProduct.id);
          transaction.set(sepSubRef, warehouseUpdatePayload, { merge: true });
        }

        // Log to stok_hareketleri
        if (diff !== 0 || addQty > 0) {
          const logRef = doc(collection(db, 'stok_hareketleri'));
          transaction.set(logRef, withTenant({
            productId: editingProduct.id,
            productName: pData.name || editingProduct.name || 'İsimsiz Ürün',
            barcode: pData.barcode || editingProduct.barcode || '',
            quantity: addQty > 0 ? addQty : Math.abs(diff),
            direction: addQty > 0 ? 'depo_giris' : (diff >= 0 ? 'depo_giris' : 'depo_cikis'),
            type: addQty > 0 ? 'mal_girisi' : 'stok_duzenleme',
            senderLocation: addQty > 0 ? (incomingSupplier || 'Tedarikçi / Mal Alımı') : 'Manuel Güncelleme',
            receiverLocation: 'Merkez Depo',
            supplier: incomingSupplier || null,
            invoiceNo: incomingInvoiceNo || null,
            purchasePrice: incomingPurchasePrice ? parseFloat(incomingPurchasePrice) : 0,
            operatorName: user?.displayName || user?.email || 'Depo Sorumlusu',
            note: incomingNote || (addQty > 0 ? 'Depoya Yeni Mal Girişi' : 'Depo Stoğu Manuel Düzeltme'),
            createdAt: serverTimestamp()
          }, tenantId));
        }
      });

      showToast("✅ Depo stoku ve hareket kayıtları başarıyla güncellendi!");
      setEditingProduct(null);
    } catch (err: any) {
      console.error(err);
      alert("Stok güncellenemedi: " + err.message);
    } finally {
      setIsSavingStock(false);
    }
  };

  // Dedicated Depo Mal Girişi (Intake) Submission
  const handleExecuteIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intakeProductId) {
      alert("Lütfen mal alımı yapılacak ürünü seçin veya barkodunu okutun.");
      return;
    }
    const qty = parseInt(intakeQty);
    if (isNaN(qty) || qty <= 0) {
      alert("Lütfen geçerli bir alım miktarı (en az 1 adet) girin.");
      return;
    }

    const selectedProduct = products.find(p => p.id === intakeProductId);
    if (!selectedProduct) {
      alert("Seçilen ürün veritabanında bulunamadı.");
      return;
    }

    setIsIntakeSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', intakeProductId);
        const pDoc = await transaction.get(productRef);
        const pData = pDoc.exists() ? pDoc.data() : selectedProduct;
        
        const currentDepo = getProductDepoStok(pData);
        const newDepo = currentDepo + qty;

        const updatePayload: any = {
          depoStok: newDepo,
          depoStoku: newDepo,
          stokDepo: newDepo,
          warehouseStock: newDepo,
          updatedAt: serverTimestamp()
        };

        if (intakePurchasePrice && parseFloat(intakePurchasePrice) > 0) {
          updatePayload.purchasePrice = parseFloat(intakePurchasePrice);
          updatePayload.alisFiyati = parseFloat(intakePurchasePrice);
        }

        if (pDoc.exists()) {
          transaction.update(productRef, updatePayload);
        } else {
          transaction.set(productRef, { ...selectedProduct, ...updatePayload }, { merge: true });
        }

        if (isSepetayTenant(tenantId)) {
          const sepSubRef = doc(db, 'tenants', 'sepetay', 'products', intakeProductId);
          transaction.set(sepSubRef, updatePayload, { merge: true });
        }

        // Create atomic movement record
        const logRef = doc(collection(db, 'stok_hareketleri'));
        transaction.set(logRef, withTenant({
          productId: intakeProductId,
          productName: pData.name || selectedProduct.name || 'İsimsiz Ürün',
          barcode: pData.barcode || selectedProduct.barcode || '',
          quantity: qty,
          direction: 'depo_giris',
          type: 'mal_girisi',
          senderLocation: intakeSupplier.trim() || 'Tedarikçi / Fabrika Girişi',
          receiverLocation: 'Merkez Depo',
          supplier: intakeSupplier.trim() || null,
          invoiceNo: intakeInvoiceNo.trim() || null,
          purchasePrice: intakePurchasePrice ? parseFloat(intakePurchasePrice) : (selectedProduct.purchasePrice || 0),
          operatorName: user?.displayName || user?.email || 'Depo Görevlisi',
          note: intakeNote.trim() || 'Depoya Mal Girişi & Tedarikçi Alımı',
          createdAt: serverTimestamp()
        }, tenantId));
      });

      showToast(`✅ "${selectedProduct.name}" için ${qty} adet ürün depoya alındı ve stok güncellendi!`);
      // Reset intake form
      setIntakeQty('1');
      setIntakePurchasePrice('');
      setIntakeSupplier('');
      setIntakeInvoiceNo('');
      setIntakeNote('');
      setActiveSubTab('stock');
    } catch (err: any) {
      console.error(err);
      alert("Mal girişi kaydedilirken hata oluştu: " + err.message);
    } finally {
      setIsIntakeSaving(false);
    }
  };

  // Mod B: Sıfırdan Yeni Ürün Tanımlayarak Doğrudan Depo Girişi Yapma
  const handleExecuteNewProductIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProductForm.name.trim();
    const barcode = newProductForm.barcode.trim();
    const qty = parseInt(newProductForm.qty, 10);
    const price = parseFloat(newProductForm.price.replace(',', '.')) || 0;
    const purchasePrice = parseFloat(newProductForm.purchasePrice.replace(',', '.')) || 0;
    const supplier = newProductForm.supplier.trim();
    const invoiceNo = newProductForm.invoiceNo.trim();
    const note = newProductForm.note.trim();
    const category = newProductForm.category.trim() || 'Genel';

    if (!name) {
      alert("Lütfen ürün adını giriniz.");
      return;
    }
    if (!barcode) {
      alert("Lütfen ürün barkodunu giriniz veya 'Barkod Oluştur' butonuna basınız.");
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      alert("Lütfen geçerli bir depo giriş miktarı (en az 1 adet) giriniz.");
      return;
    }

    // Check if product with this barcode already exists
    const existing = products.find(p => String(p.barcode || '').trim() === barcode);
    if (existing) {
      const confirmSwitch = confirm(
        `⚠️ "${barcode}" barkoduna sahip "${existing.name}" ürünü veritabanında zaten kayıtlı!\n\nMevcut ürüne depo girişi moduna geçmek ister misiniz?`
      );
      if (confirmSwitch) {
        setIntakeMode('existing');
        setIntakeProductId(existing.id);
        setIntakeQty(String(qty));
        if (purchasePrice > 0) setIntakePurchasePrice(String(purchasePrice));
        if (supplier) setIntakeSupplier(supplier);
        if (invoiceNo) setIntakeInvoiceNo(invoiceNo);
        if (note) setIntakeNote(note);
      }
      return;
    }

    setIsNewProductSaving(true);
    try {
      const isSep = isSepetayTenant(tenantId);
      const newProductPayload: any = {
        name,
        barcode,
        category,
        price,
        satisFiyati: price,
        fiyat: price,
        purchasePrice,
        alisFiyati: purchasePrice,
        // Mağaza stoku otomatik 0 (sıfır) tanımlanır
        magazaStok: 0,
        magazaStoku: 0,
        stock: 0,
        stok: 0,
        quantity: 0,
        miktar: 0,
        // Depo stoku doğrudan girilen miktar
        depoStok: qty,
        depoStoku: qty,
        stokDepo: qty,
        warehouseStock: qty,
        minStock: 5,
        supplier: supplier || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // 1. Root products collection
      const docRef = await addDoc(collection(db, 'products'), withTenant(newProductPayload, tenantId));
      const newProdId = docRef.id;

      // 2. If Sepetay tenant, sync subcollection
      if (isSep) {
        await setDoc(doc(db, 'tenants', 'sepetay', 'products', newProdId), withTenant(newProductPayload, 'sepetay'), { merge: true }).catch(() => {});
      }

      // 3. Record in stok_hareketleri
      await addDoc(collection(db, 'stok_hareketleri'), withTenant({
        productId: newProdId,
        productName: name,
        barcode,
        quantity: qty,
        direction: 'depo_giris',
        type: 'yeni_urun_depo_girisi',
        senderLocation: supplier || 'Tedarikçi / Fabrika (Yeni Ürün)',
        receiverLocation: 'Merkez Depo',
        supplier: supplier || null,
        invoiceNo: invoiceNo || null,
        purchasePrice: purchasePrice || 0,
        operatorName: user?.displayName || user?.email || 'Depo Sorumlusu',
        note: note || 'Sıfırdan Yeni Ürün Tanımlanarak Depoya Alındı (Mağaza Stoku: 0)',
        createdAt: serverTimestamp()
      }, tenantId));

      showToast(`🎉 "${name}" sisteme kaydedildi ve ${qty} adet doğrudan DEPO STOKUNA alındı!`);

      // Reset form
      setNewProductForm({
        name: '',
        barcode: '',
        category: 'Kırtasiye',
        purchasePrice: '',
        price: '',
        qty: '1',
        supplier: '',
        invoiceNo: '',
        note: ''
      });
      setActiveSubTab('stock');
    } catch (err: any) {
      console.error(err);
      alert("Yeni ürün depo girişi kaydedilemedi: " + err.message);
    } finally {
      setIsNewProductSaving(false);
    }
  };

  // Complete field order fulfillment from warehouse
  const handleFulfillDepoFieldOrder = async (order: any) => {
    if (!window.confirm(`"${order.orderNumber}" numaralı saha siparişini depodan onaylayıp ürünleri sevk etmek istiyor musunuz? Depo stoklarından düşüş yapılacaktır.`)) {
      return;
    }

    try {
      // 1. Decrement depoStok for all items in the order
      for (const item of order.items || []) {
        if (!item.id) continue;
        try {
          const pRef = doc(db, 'products', item.id);
          await updateDoc(pRef, {
            depoStok: increment(-item.quantity),
            depoStoku: increment(-item.quantity),
            stokDepo: increment(-item.quantity),
            warehouseStock: increment(-item.quantity),
            updatedAt: serverTimestamp()
          });

          if (isSepetayTenant(tenantId)) {
            const sepSubRef = doc(db, 'tenants', 'sepetay', 'products', item.id);
            await setDoc(sepSubRef, {
              depoStok: increment(-item.quantity),
              depoStoku: increment(-item.quantity),
              stokDepo: increment(-item.quantity),
              warehouseStock: increment(-item.quantity),
              updatedAt: serverTimestamp()
            }, { merge: true });
          }

          // Log item exit
          await addDoc(collection(db, 'stok_hareketleri'), withTenant({
            productId: item.id,
            productName: item.name || 'Saha Sipariş Ürünü',
            barcode: item.barcode || '',
            quantity: item.quantity,
            direction: 'depo_cikis',
            type: 'saha_sevkiyat',
            senderLocation: 'Merkez Depo',
            receiverLocation: `Saha / Müşteri: ${order.customerName}`,
            operatorName: user?.displayName || user?.email || 'Depo Sorumlusu',
            note: `Saha Siparişi Sevkiyatı (#${order.orderNumber})`,
            createdAt: serverTimestamp()
          }, tenantId));
        } catch (itemErr) {
          console.warn("Item stock decrement error:", itemErr);
        }
      }

      // 2. Mark order as TAMAMLANDI
      await updateDoc(doc(db, 'field_orders', order.id), {
        status: 'TAMAMLANDI',
        preparedAt: serverTimestamp(),
        preparedBy: user?.displayName || user?.email || 'Depo Sorumlusu'
      });

      showToast(`✅ "${order.orderNumber}" numaralı sipariş depodan hazırlandı ve sevk edildi!`);
    } catch (err: any) {
      alert("İşlem sırasında hata oluştu: " + err.message);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.barcode || '').includes(searchTerm) ||
      (p.category || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    const magaza = getProductMagazaStok(p);
    const depo = getProductDepoStok(p);

    if (stockViewMode === 'magaza') return magaza > 0;
    if (stockViewMode === 'depo') return depo > 0;
    return true;
  });

  const selectedIntakeProduct = products.find(p => p.id === intakeProductId);

  // Field orders targeting warehouse
  const depoFieldOrders = fieldOrders.filter(o => o.targetLocation === 'depo' || !o.targetLocation);
  const pendingDepoOrdersCount = depoFieldOrders.filter(o => o.status === 'BEKLIYOR').length;

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-lg animate-fadeIn">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {toastMessage}
          </span>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white font-black">✕</button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
            <Warehouse className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Depo Yönetimi & Mal Girişi</h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Çoklu lokasyon stok takibi, depoya ürün alımları, transferler ve saha mal talepleri.
            </p>
          </div>
        </div>

        {/* Sub-Tab Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab('stock')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'stock' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Depo & Mağaza Stokları</span>
          </button>
          
          <button
            onClick={() => setActiveSubTab('intake')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'intake' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-4 h-4 text-emerald-300" />
            <span>Depoya Ürün Alımı / Mal Girişi</span>
          </button>

          <button
            onClick={() => setActiveSubTab('transfer')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'transfer' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Stok Transferi</span>
          </button>

          <button
            onClick={() => setActiveSubTab('orders')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'orders' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Saha Siparişleri {pendingDepoOrdersCount > 0 && `(${pendingDepoOrdersCount})`}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'history' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Transfer & Giriş Logları</span>
          </button>
        </div>
      </header>

      {/* Sub-Tab 1: Depo Stok Durumu */}
      {activeSubTab === 'stock' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          {/* Top Bar / Filters */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900">Merkez Depo & Mağaza Stokları (Canlı Senkronize)</h3>
              </div>
              
              {/* Stock View Mode Buttons */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStockViewMode('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    stockViewMode === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 font-bold'
                  }`}
                >
                  📊 Toplu & Ayrı Görünüm
                </button>
                <button
                  type="button"
                  onClick={() => setStockViewMode('magaza')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    stockViewMode === 'magaza' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 font-bold'
                  }`}
                >
                  🏬 Sadece Mağaza Stoku
                </button>
                <button
                  type="button"
                  onClick={() => setStockViewMode('depo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    stockViewMode === 'depo' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 font-bold'
                  }`}
                >
                  📦 Sadece Depo Stoku
                </button>
              </div>
            </div>

            {/* Search Box with Camera Barcode Scanner Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ürün adı, barkod veya kategori ara..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
                {searchTerm && (
                  <button 
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setScannerTargetMode('search');
                  setIsScannerOpen(true);
                }}
                className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer shrink-0"
                title="Kamera ile Barkod Okut ve Ürünü Bul"
              >
                <Camera className="w-4 h-4 text-indigo-100" />
                <span>Barkod Tara (Kamera)</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-black tracking-wider border-b border-slate-200">
                  <th className="p-4">Ürün Adı</th>
                  <th className="p-4">Barkod</th>
                  <th className="p-4">Kategori</th>
                  <th className="p-4 text-center bg-blue-50/50 text-blue-800">Mağaza Stoku</th>
                  <th className="p-4 text-center bg-indigo-50/50 text-indigo-800">Depo Stoku</th>
                  <th className="p-4 text-center bg-slate-100 text-slate-900 font-black">Toplam Stok</th>
                  <th className="p-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                      Ürün bulunamadı veya filtrelere uygun stok yok.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    const magazaStok = getProductMagazaStok(p);
                    const depoStok = getProductDepoStok(p);
                    const toplamStok = magazaStok + depoStok;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold text-slate-900 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black shrink-0">
                            {p.name?.substring(0, 1).toUpperCase()}
                          </div>
                          <span className="truncate max-w-xs">{p.name}</span>
                        </td>
                        <td className="p-4 font-mono text-slate-600">{p.barcode || '-'}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                            {p.category || 'Genel'}
                          </span>
                        </td>
                        <td className="p-4 text-center bg-blue-50/30">
                          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-black text-xs">
                            {magazaStok} Adet
                          </span>
                        </td>
                        <td className="p-4 text-center bg-indigo-50/30">
                          <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 font-black text-xs">
                            {depoStok} Adet
                          </span>
                        </td>
                        <td className="p-4 text-center font-black text-slate-900 text-sm bg-slate-50/50">
                          {toplamStok} Adet
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => openEditModal(p)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ml-auto"
                          >
                            <Warehouse className="w-3.5 h-3.5" />
                            <span>Depo Düzenle & Alım</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: DEPOYA ÖZEL ÜRÜN ALIMI / MAL GİRİŞİ */}
      {activeSubTab === 'intake' && (
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Intake Mode Selector: Mod A vs Mod B */}
          <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIntakeMode('existing')}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                intakeMode === 'existing'
                  ? 'bg-emerald-50/80 border-emerald-500 text-emerald-950 shadow-xs ring-1 ring-emerald-500/30'
                  : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-100/70'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                intakeMode === 'existing' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                <Boxes className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Mod A</span>
                  <span className="font-bold text-xs truncate">Mevcut Ürüne Giriş</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">Sistemdeki kayıtlı ürünün depo stoğunu artırın</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIntakeMode('new_product')}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                intakeMode === 'new_product'
                  ? 'bg-teal-50/80 border-teal-500 text-teal-950 shadow-xs ring-1 ring-teal-500/30'
                  : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-100/70'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                intakeMode === 'new_product' ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-teal-700">Mod B (Yeni)</span>
                  <span className="font-bold text-xs truncate">Sıfırdan Yeni Ürün Tanımla</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">Mağaza: 0 adet, doğrudan depo stokuyla kaydet</p>
              </div>
            </button>
          </div>

          {/* Form Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className={`p-5 border-b border-slate-100 flex items-center justify-between text-white ${
              intakeMode === 'existing'
                ? 'bg-gradient-to-r from-emerald-800 to-teal-900'
                : 'bg-gradient-to-r from-teal-800 to-cyan-900'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                  {intakeMode === 'existing' ? <Boxes className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-black text-base">
                    {intakeMode === 'existing' ? 'Depoya Ürün Alımı (Mevcut Ürün)' : 'Sıfırdan Yeni Ürün Kaydıyla Depo Girişi'}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    {intakeMode === 'existing'
                      ? 'Tedarikçi ve fabrikadan gelen malları mevcut ürünün depo stokuna ekleyin.'
                      : 'Henüz sistemde olmayan ürünü doğrudan depo stokuyla sisteme tanımlayın (Mağaza stoku otomatik 0 kalır).'}
                  </p>
                </div>
              </div>

              {intakeMode === 'existing' && (
                <button
                  type="button"
                  onClick={() => {
                    setScannerTargetMode('intake');
                    setIsScannerOpen(true);
                  }}
                  className="px-3 py-1.5 bg-white text-emerald-900 rounded-xl text-xs font-black hover:bg-emerald-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Camera className="w-4 h-4 text-emerald-700" />
                  <span className="hidden sm:inline">Barkod Oku</span>
                </button>
              )}
            </div>

            {/* MOD A: MEVCUT ÜRÜNE DEPO GİRİŞİ FORMU */}
            {intakeMode === 'existing' && (
              <form onSubmit={handleExecuteIntake} className="p-6 space-y-5">
                {/* 1. Ürün Seçimi & Kamera ile Arama */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-700 text-xs">Alımı Yapılacak Ürünü Seçin</label>
                    <span className="text-[11px] text-slate-400 font-medium">Barkod okutarak veya listeden seçebilirsiniz</span>
                  </div>

                  <div className="flex gap-2 mb-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Ürün adı veya barkod ile filtrele..."
                        value={intakeSearchTerm}
                        onChange={e => setIntakeSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTargetMode('intake');
                        setIsScannerOpen(true);
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                    >
                      <Camera className="w-4 h-4" />
                      <span className="hidden sm:inline">Kamera</span>
                    </button>
                  </div>

                  <select
                    value={intakeProductId}
                    onChange={e => {
                      const val = e.target.value;
                      setIntakeProductId(val);
                      const found = products.find(p => p.id === val);
                      if (found && found.purchasePrice) {
                        setIntakePurchasePrice(String(found.purchasePrice));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">-- Depoya Eklenecek Ürünü Seçiniz --</option>
                    {products
                      .filter(p => {
                        if (!intakeSearchTerm) return true;
                        const term = intakeSearchTerm.toLowerCase();
                        return (p.name || '').toLowerCase().includes(term) || (p.barcode || '').includes(term);
                      })
                      .map(p => {
                        const magaza = getProductMagazaStok(p);
                        const depo = getProductDepoStok(p);
                        const toplam = magaza + depo;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} [Mağaza: {magaza} | Depo: {depo} | Toplam: {toplam}] {p.barcode ? `(Barkod: ${p.barcode})` : ''}
                          </option>
                        );
                      })}
                  </select>
                </div>

                {/* Selected Product Summary Card */}
                {selectedIntakeProduct && (
                  <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Seçili Ürün</span>
                      <span className="font-black text-slate-900 text-sm truncate block">{selectedIntakeProduct.name}</span>
                      <span className="text-slate-400 font-mono text-[11px]">{selectedIntakeProduct.barcode || 'Barkodsuz'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Mevcut Mağaza Stoku</span>
                      <span className="font-black text-blue-700 text-sm">{getProductMagazaStok(selectedIntakeProduct)} Adet</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Mevcut Depo Stoku</span>
                      <span className="font-black text-amber-700 text-sm">{getProductDepoStok(selectedIntakeProduct)} Adet</span>
                    </div>
                    <div>
                      <span className="text-emerald-700 block text-[10px] uppercase font-black">Alım Sonrası Depo</span>
                      <span className="font-black text-emerald-700 text-sm">
                        {getProductDepoStok(selectedIntakeProduct) + (parseInt(intakeQty) || 0)} Adet
                      </span>
                    </div>
                  </div>
                )}

                {/* Giriş Bilgileri (Miktar, Alış Fiyatı, Tedarikçi, İrsaliye No) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Alınan Miktar / Giriş Adedi (Adet) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={intakeQty}
                      onChange={e => setIntakeQty(e.target.value)}
                      placeholder="Örn: 25"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-black text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Birim Alış Fiyatı (₺)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={intakePurchasePrice}
                      onChange={e => setIntakePurchasePrice(e.target.value)}
                      placeholder="0.00 ₺"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Tedarikçi / Fabrika / Toptancı Adı
                    </label>
                    <input
                      type="text"
                      value={intakeSupplier}
                      onChange={e => setIntakeSupplier(e.target.value)}
                      placeholder="Örn: Anadolu Kırtasiye A.Ş."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Fatura / İrsaliye Numarası
                    </label>
                    <input
                      type="text"
                      value={intakeInvoiceNo}
                      onChange={e => setIntakeInvoiceNo(e.target.value)}
                      placeholder="Örn: IRS-2026-0891"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-medium text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">
                    İşlem Notu / Sevkiyat Açıklaması
                  </label>
                  <input
                    type="text"
                    value={intakeNote}
                    onChange={e => setIntakeNote(e.target.value)}
                    placeholder="Örn: 2026 Sezon açılışı doğrudan fabrika sevkiyatı"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isIntakeSaving || !intakeProductId}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    {isIntakeSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Depo Stokuna Ekleniyor & Atomik Kayıt Yapılıyor...</span>
                      </>
                    ) : (
                      <>
                        <Boxes className="w-4 h-4" />
                        <span>Depo Stokuna Miktar Ekle ve Hareketi Kaydet</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* MOD B: SIFIRDAN YENİ ÜRÜN TANIMLAYARAK DEPO GİRİŞİ FORMU */}
            {intakeMode === 'new_product' && (
              <form onSubmit={handleExecuteNewProductIntake} className="p-6 space-y-5">
                {/* Information Highlight: Mağaza Stoku = 0 Garantisi */}
                <div className="p-3.5 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl flex items-start gap-3">
                  <div className="p-1.5 bg-teal-600 text-white rounded-lg shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <p className="font-black text-teal-950">
                      🏬 Mağaza Stoku Zorunluluğu Yoktur (Otomatik 0 Adet Tanımlanır)
                    </p>
                    <p className="text-teal-800 text-[11px] mt-0.5 leading-relaxed">
                      Bu ekrandan kaydedeceğiniz ürün sıfırdan sisteme eklenir ve girdiğiniz miktar <span className="font-bold underline">yalnızca Depo Stokuna</span> yansıtılır. Ürün kasada hazır tutulmaz; mağazaya aktarmak istediğinizde "Stok Transferi" sekmesini kullanabilirsiniz.
                    </p>
                  </div>
                </div>

                {/* 1. Ürün Adı & Barkod */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Ürün Adı <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newProductForm.name}
                      onChange={e => setNewProductForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Örn: Faber Castell 0.7 Versatil Kalem (Mavi)"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 text-xs">
                        Barkod <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const autoBarcode = '869' + Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10);
                          setNewProductForm(prev => ({ ...prev, barcode: autoBarcode }));
                        }}
                        className="text-[11px] font-bold text-teal-600 hover:text-teal-700 underline cursor-pointer"
                      >
                        Barkod Üret
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProductForm.barcode}
                        onChange={e => setNewProductForm(prev => ({ ...prev, barcode: e.target.value }))}
                        placeholder="Barkod girin veya okutun..."
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setScannerTargetMode('new_product_barcode');
                          setIsScannerOpen(true);
                        }}
                        className="px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer shrink-0"
                        title="Kamerayla Barkod Oku"
                      >
                        <Camera className="w-4 h-4" />
                        <span className="hidden sm:inline">Kamera</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Kategori
                    </label>
                    <select
                      value={newProductForm.category}
                      onChange={e => setNewProductForm(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="Kırtasiye">Kırtasiye</option>
                      <option value="Kitap">Kitap</option>
                      <option value="Oyuncak">Oyuncak</option>
                      <option value="Ofis Malzemeleri">Ofis Malzemeleri</option>
                      <option value="Sanatsal Malzeme">Sanatsal Malzeme</option>
                      <option value="Fotokopi & Kağıt">Fotokopi & Kağıt</option>
                      <option value="Hobi / Hediyelik">Hobi / Hediyelik</option>
                      <option value="Diğer">Diğer</option>
                    </select>
                  </div>
                </div>

                {/* 2. Fiyatlar ve Depo Miktarı */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Alış Fiyatı (₺)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProductForm.purchasePrice}
                      onChange={e => setNewProductForm(prev => ({ ...prev, purchasePrice: e.target.value }))}
                      placeholder="0.00 ₺"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Satış Fiyatı (₺) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProductForm.price}
                      onChange={e => setNewProductForm(prev => ({ ...prev, price: e.target.value }))}
                      placeholder="0.00 ₺"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-black text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-teal-800 text-xs mb-1">
                      📦 Depo Giriş Miktarı (Adet) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newProductForm.qty}
                      onChange={e => setNewProductForm(prev => ({ ...prev, qty: e.target.value }))}
                      placeholder="Örn: 50"
                      className="w-full px-3.5 py-2.5 bg-teal-50/50 border border-teal-300 rounded-xl font-mono font-black text-teal-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>
                </div>

                {/* Visual Stock Allocation Preview */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">🏬 Mağaza Stoku</span>
                    <span className="text-slate-700 font-black text-sm">0 Adet</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Mağaza zorunluluğu yok</span>
                  </div>
                  <div className="bg-teal-50/60 p-2.5 rounded-lg border border-teal-200">
                    <span className="text-teal-700 block text-[10px] font-bold uppercase">📦 Depo Stoku</span>
                    <span className="text-teal-900 font-black text-sm">{parseInt(newProductForm.qty) || 0} Adet</span>
                    <span className="text-[10px] text-teal-600 block mt-0.5">Doğrudan depoya kaydedilecek</span>
                  </div>
                </div>

                {/* 3. Tedarikçi, İrsaliye, Not */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Tedarikçi / Fabrika Adı
                    </label>
                    <input
                      type="text"
                      value={newProductForm.supplier}
                      onChange={e => setNewProductForm(prev => ({ ...prev, supplier: e.target.value }))}
                      placeholder="Örn: Faber Castell Türkiye"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-xs mb-1">
                      Fatura / İrsaliye Numarası
                    </label>
                    <input
                      type="text"
                      value={newProductForm.invoiceNo}
                      onChange={e => setNewProductForm(prev => ({ ...prev, invoiceNo: e.target.value }))}
                      placeholder="Örn: IRS-2026-9042"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-medium text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">
                    Depo Giriş Notu / Açıklama
                  </label>
                  <input
                    type="text"
                    value={newProductForm.note}
                    onChange={e => setNewProductForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="Örn: İlk defa tedarik edilen yeni ürün partisi"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isNewProductSaving || !newProductForm.name || !newProductForm.barcode || !newProductForm.price}
                    className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    {isNewProductSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sıfırdan Ürün Tanımlanıyor ve Depoya Kaydediliyor...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>✨ Sıfırdan Ürünü Kaydet & Depo Stokuna Al (Mağaza: 0)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Stok Transferi */}
      {activeSubTab === 'transfer' && (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-indigo-900 to-slate-900 text-white">
            <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-black text-base">Atomik Stok Transferi (Firebase Transaction)</h3>
              <p className="text-xs text-indigo-200 mt-0.5">Depo ve Mağaza arasında güvenli ve tutarlı çift yönlü stok aktarımı.</p>
            </div>
          </div>

          <form onSubmit={handleExecuteTransfer} className="p-6 space-y-5">
            <div>
              <label className="block font-bold text-slate-700 text-xs mb-1.5">Transfer Yönü</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTransferDirection('depo_to_magaza')}
                  className={`p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    transferDirection === 'depo_to_magaza'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Warehouse className="w-4 h-4" />
                  <span>Depo ➔ Mağaza</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTransferDirection('magaza_to_depo')}
                  className={`p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    transferDirection === 'magaza_to_depo'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <span>Mağaza ➔ Depo</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-slate-700 text-xs">Ürün Seçin</label>
                <button
                  type="button"
                  onClick={() => {
                    setScannerTargetMode('transfer');
                    setIsScannerOpen(true);
                  }}
                  className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Barkod Tara</span>
                </button>
              </div>
              <select
                value={transferProductId}
                onChange={e => setTransferProductId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">-- Ürün Seçiniz --</option>
                {products.map(p => {
                  const magaza = getProductMagazaStok(p);
                  const depo = getProductDepoStok(p);
                  const toplam = magaza + depo;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} [Mağaza: {magaza} | Depo: {depo} | Toplam: {toplam}] {p.barcode ? `(Barkod: ${p.barcode})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 text-xs mb-1.5">Transfer Miktarı (Adet)</label>
              <input
                type="number"
                min="1"
                value={transferQty}
                onChange={e => setTransferQty(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isTransferring}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isTransferring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Atomik İşlem Yapılıyor...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>Transferi Gerçekleştir ve Logla</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sub-Tab 4: Saha Siparişleri / Mal Talepleri (Depo Odaklı) */}
      {activeSubTab === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Truck className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900">Saha Siparişleri & Depo Mal Talepleri</h3>
                <p className="text-xs text-slate-500">Saha elemanlarından doğrudan depoya yönlendirilen anlık siparişler ve sevkiyat talepleri.</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full font-black text-xs border border-amber-200">
              {pendingDepoOrdersCount} Bekleyen Talep
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {depoFieldOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-bold">
                Henüz depoya yönlendirilmiş saha siparişi veya mal talebi bulunmuyor.
              </div>
            ) : (
              depoFieldOrders.map(order => (
                <div key={order.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-indigo-600">{order.orderNumber || 'SİP-001'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        order.status === 'BEKLIYOR' ? 'bg-amber-100 text-amber-800' :
                        order.status === 'TAMAMLANDI' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {order.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                        Hedef: {order.targetLocation === 'depo' ? '📦 Merkez Depo' : '🏬 Mağaza'}
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-900">{order.customerName || 'Müşteri / Mağaza'}</p>
                    <p className="text-xs text-slate-500">
                      Saha Personeli: <strong className="text-slate-700">{order.sellerName || 'Saha Elemanı'}</strong> • Toplam: <strong className="text-slate-900 font-mono">{(order.total || 0).toFixed(2)} ₺</strong>
                      {order.items && ` • (${order.items.length} Kalem Ürün)`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {order.status === 'BEKLIYOR' && (
                      <button
                        onClick={() => handleFulfillDepoFieldOrder(order)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Talebi Onayla & Depodan Çıkış Yap</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 5: Transfer & Giriş Geçmişi (Loglar) */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900">Transfer & Mal Giriş Geçmişi (Denetim Logları)</h3>
                <p className="text-xs text-slate-500">Depoya ürün alımları, sevkiyatlar ve mağaza transferlerinin detaylı denetim kaydı.</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-black tracking-wider border-b border-slate-200">
                  <th className="p-4">Tarih & Saat</th>
                  <th className="p-4">Ürün Adı</th>
                  <th className="p-4">Miktar</th>
                  <th className="p-4">İşlem / Hareket Türü</th>
                  <th className="p-4">Kaynak / Tedarikçi</th>
                  <th className="p-4">Hedef Lokasyon</th>
                  <th className="p-4">Personel / Fatura No / Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                      Henüz transfer veya hareket geçmişi bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  movements.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 text-slate-600 font-mono">
                        {m.createdAt?.seconds ? format(new Date(m.createdAt.seconds * 1000), 'dd.MM.yyyy HH:mm') : 'Az önce'}
                      </td>
                      <td className="p-4 font-bold text-slate-900">{m.productName}</td>
                      <td className="p-4 font-mono font-black text-indigo-600">
                        {m.direction === 'depo_cikis' ? '-' : '+'}{m.quantity} Adet
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          m.direction === 'depo_giris' ? 'bg-emerald-100 text-emerald-800' :
                          m.direction === 'depo_cikis' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {m.type === 'mal_girisi' ? '📦 Mal Girişi' : m.direction === 'depo_giris' ? 'Giriş' : m.direction || 'Transfer'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-700 font-bold">{m.supplier || m.senderLocation || 'Depo'}</td>
                      <td className="p-4 text-slate-700 font-bold">{m.receiverLocation || 'Merkez Depo'}</td>
                      <td className="p-4 text-slate-600">
                        <div>{m.operatorName || 'Yönetici'}</div>
                        {m.invoiceNo && <div className="text-[10px] text-indigo-600 font-mono font-bold">Fat/İrs: {m.invoiceNo}</div>}
                        {m.note && <div className="text-[10px] text-slate-400 italic">{m.note}</div>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {isScannerOpen && (
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={(barcode) => {
            if (scannerTargetMode === 'new_product_barcode') {
              setNewProductForm(prev => ({ ...prev, barcode }));
              showToast(`🎯 Barkod okundu ve forma aktarıldı: ${barcode}`);
            } else if (scannerTargetMode === 'intake') {
              setIntakeSearchTerm(barcode);
              const found = products.find(p => String(p.barcode || '').trim() === barcode.trim());
              if (found) {
                setIntakeProductId(found.id);
                if (found.purchasePrice) setIntakePurchasePrice(String(found.purchasePrice));
                showToast(`🎯 Ürün bulundu: ${found.name}`);
              } else {
                showToast(`🔍 Barkod okundu: ${barcode} (Kayıtlı ürün bulunamadı, 'Mod B: Yeni Ürün' ile ekleyebilirsiniz)`);
                setNewProductForm(prev => ({ ...prev, barcode }));
              }
            } else if (scannerTargetMode === 'transfer') {
              const found = products.find(p => String(p.barcode || '').trim() === barcode.trim());
              if (found) {
                setTransferProductId(found.id);
                showToast(`🎯 Transfer için ürün seçildi: ${found.name}`);
              }
            } else {
              setSearchTerm(barcode);
              showToast(`🔍 Barkod tarandı: ${barcode}`);
            }
            setIsScannerOpen(false);
          }}
          title="Depo Ürün Barkod Tarayıcı"
          description="Kameraya barkod göstererek hızlıca stok aratın veya mal girişi seçin."
        />
      )}

      {/* Depo Düzenle & Yeni Ürün Alımı / Girişi Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base">{editingProduct.name}</h3>
                  <p className="text-xs text-indigo-200">Depo Stoku Düzenleme & Yeni Mal Alım Girişi</p>
                </div>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-white/80 hover:text-white font-black text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWarehouseStockModal} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Mevcut Mağaza Stoku</span>
                  <span className="text-sm font-black text-blue-700">{getProductMagazaStok(editingProduct)} Adet</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Mevcut Depo Stoku</span>
                  <span className="text-sm font-black text-indigo-700">{getProductDepoStok(editingProduct)} Adet</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 text-xs mb-1">Doğrudan Depo Stok Miktarını Güncelle (Manuel Düzeltme)</label>
                <input
                  type="number"
                  min="0"
                  value={modalNewDepoStok}
                  onChange={e => setModalNewDepoStok(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="border-t border-slate-100 pt-3">
                <h4 className="font-black text-slate-900 text-xs mb-2 flex items-center gap-1.5 text-indigo-600">
                  <Plus className="w-4 h-4" />
                  <span>VEYA Depoya Yeni Ürün Alımı / Sevkiyat Girişi (+ Adet Ekle)</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 text-[11px] mb-1">Eklenecek Adet (+)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Örn: 50"
                      value={incomingQty}
                      onChange={e => setIncomingQty(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[11px] mb-1">Alış Fiyatı (Birim)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00 ₺"
                      value={incomingPurchasePrice}
                      onChange={e => setIncomingPurchasePrice(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">Tedarikçi / Kaynak Adı</label>
                  <input
                    type="text"
                    placeholder="Örn: ABC Toptan Gıda Ltd."
                    value={incomingSupplier}
                    onChange={e => setIncomingSupplier(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 text-xs mb-1">Fatura / İrsaliye No</label>
                  <input
                    type="text"
                    placeholder="Örn: IRS-2026-001"
                    value={incomingInvoiceNo}
                    onChange={e => setIncomingInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 text-xs mb-1">İşlem Notu / Açıklama</label>
                <input
                  type="text"
                  placeholder="Örn: Fabrika sevkiyatı"
                  value={incomingNote}
                  onChange={e => setIncomingNote(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSavingStock}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center gap-2"
                >
                  {isSavingStock ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Değişiklikleri Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
