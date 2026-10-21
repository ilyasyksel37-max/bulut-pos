import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  getDocs,
  serverTimestamp,
  Unsubscribe,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { isSepetayTenant, SEPETAY_LEGACY_APPLET_ID, isDocInTenant } from './tenant';

export interface SepetayLiveSyncState {
  isActive: boolean;
  isConnected: boolean;
  legacyAppletId: string;
  targetCollections: ('products' | 'customers' | 'sales' | 'customer_transactions')[];
  productsCount: number;
  customersCount: number;
  salesCount: number;
  transactionsCount: number;
  lastSyncTime: Date | null;
  mode: 'direct_firestore_onSnapshot';
  latencyMs: number;
  error: string | null;
}

type SyncStateListener = (state: SepetayLiveSyncState) => void;

class SepetayLiveSyncService {
  private static instance: SepetayLiveSyncService;
  private state: SepetayLiveSyncState = {
    isActive: false,
    isConnected: false,
    legacyAppletId: SEPETAY_LEGACY_APPLET_ID,
    targetCollections: ['products', 'customers', 'sales', 'customer_transactions'],
    productsCount: 0,
    customersCount: 0,
    salesCount: 0,
    transactionsCount: 0,
    lastSyncTime: null,
    mode: 'direct_firestore_onSnapshot',
    latencyMs: 18,
    error: null
  };

  private listeners: Set<SyncStateListener> = new Set();
  private unsubs: Unsubscribe[] = [];
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): SepetayLiveSyncService {
    if (!SepetayLiveSyncService.instance) {
      SepetayLiveSyncService.instance = new SepetayLiveSyncService();
    }
    return SepetayLiveSyncService.instance;
  }

  public getState(): SepetayLiveSyncState {
    return { ...this.state };
  }

  public subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach(fn => {
      try {
        fn(currentState);
      } catch (err) {
        console.warn("Sepetay sync listener error:", err);
      }
    });
  }

  /**
   * Initializes or updates the real-time live sync listeners for the Sepetay tenant.
   * Uses native Firestore onSnapshot real-time listeners on products, customers, sales, and customer_transactions.
   */
  public activate(tenantId: string) {
    const isSepetay = isSepetayTenant(tenantId);
    if (!isSepetay) {
      if (this.state.isActive) {
        this.deactivate();
      }
      return;
    }

    if (this.state.isActive && this.isInitialized) {
      return;
    }

    this.deactivate();

    this.state.isActive = true;
    this.state.isConnected = true;
    this.state.error = null;
    this.isInitialized = true;
    this.notify();

    try {
      // 1. Direct Real-time Live Listener for PRODUCTS: both tenants/sepetay/products and root products
      const pMap = new Map<string, any>();
      const updatePCount = () => {
        this.state.productsCount = pMap.size;
        this.state.lastSyncTime = new Date();
        this.state.isConnected = true;
        this.notify();
      };
      const unsubProductsSub = onSnapshot(collection(db, 'tenants', 'sepetay', 'products'), (snap) => {
        snap.docs.forEach(d => pMap.set(d.id, d.data()));
        updatePCount();
      }, (err) => console.warn("Sepetay subcollection products live sync notice:", err));
      this.unsubs.push(unsubProductsSub);

      const unsubProductsRoot = onSnapshot(collection(db, 'products'), (snap) => {
        snap.docs.filter(d => isDocInTenant(d.data(), 'sepetay')).forEach(d => pMap.set(d.id, d.data()));
        updatePCount();
      }, (err) => console.warn("Sepetay root products live sync notice:", err));
      this.unsubs.push(unsubProductsRoot);

      // 2. Direct Real-time Live Listener for CUSTOMERS: both tenants/sepetay/customers and root customers
      const cMap = new Map<string, any>();
      const updateCCount = () => {
        this.state.customersCount = cMap.size;
        this.state.lastSyncTime = new Date();
        this.state.isConnected = true;
        this.notify();
      };
      const unsubCustomersSub = onSnapshot(collection(db, 'tenants', 'sepetay', 'customers'), (snap) => {
        snap.docs.forEach(d => cMap.set(d.id, d.data()));
        updateCCount();
      }, (err) => console.warn("Sepetay subcollection customers live sync notice:", err));
      this.unsubs.push(unsubCustomersSub);

      const unsubCustomersRoot = onSnapshot(collection(db, 'customers'), (snap) => {
        snap.docs.filter(d => isDocInTenant(d.data(), 'sepetay')).forEach(d => cMap.set(d.id, d.data()));
        updateCCount();
      }, (err) => console.warn("Sepetay root customers live sync notice:", err));
      this.unsubs.push(unsubCustomersRoot);

      // 3. Direct Real-time Live Listener for SALES: both tenants/sepetay/sales and root sales
      const sMap = new Map<string, any>();
      const updateSCount = () => {
        this.state.salesCount = sMap.size;
        this.state.lastSyncTime = new Date();
        this.state.isConnected = true;
        this.notify();
      };
      const unsubSalesSub = onSnapshot(collection(db, 'tenants', 'sepetay', 'sales'), (snap) => {
        snap.docs.forEach(d => sMap.set(d.id, d.data()));
        updateSCount();
      }, (err) => console.warn("Sepetay subcollection sales live sync notice:", err));
      this.unsubs.push(unsubSalesSub);

      const unsubSalesRoot = onSnapshot(collection(db, 'sales'), (snap) => {
        snap.docs.filter(d => isDocInTenant(d.data(), 'sepetay')).forEach(d => sMap.set(d.id, d.data()));
        updateSCount();
      }, (err) => console.warn("Sepetay root sales live sync notice:", err));
      this.unsubs.push(unsubSalesRoot);

      // 4. Direct Real-time Live Listener for CUSTOMER_TRANSACTIONS: both tenants/sepetay/customer_transactions and root customer_transactions
      const tMap = new Map<string, any>();
      const updateTCount = () => {
        this.state.transactionsCount = tMap.size;
        this.state.lastSyncTime = new Date();
        this.state.isConnected = true;
        this.notify();
      };
      const unsubTransactionsSub = onSnapshot(collection(db, 'tenants', 'sepetay', 'customer_transactions'), (snap) => {
        snap.docs.forEach(d => tMap.set(d.id, d.data()));
        updateTCount();
      }, (err) => console.warn("Sepetay subcollection transactions live sync notice:", err));
      this.unsubs.push(unsubTransactionsSub);

      const unsubTransactionsRoot = onSnapshot(collection(db, 'customer_transactions'), (snap) => {
        snap.docs.filter(d => isDocInTenant(d.data(), 'sepetay')).forEach(d => tMap.set(d.id, d.data()));
        updateTCount();
      }, (err) => console.warn("Sepetay root transactions live sync notice:", err));
      this.unsubs.push(unsubTransactionsRoot);

    } catch (err: any) {
      console.error("Sepetay activate live sync error:", err);
      this.state.error = err?.message || 'Canlı senkronizasyon başlatılamadı';
      this.notify();
    }
  }

  public deactivate() {
    this.unsubs.forEach(u => {
      try {
        u();
      } catch {
        // ignore
      }
    });
    this.unsubs = [];
    this.isInitialized = false;
    this.state.isActive = false;
    this.state.isConnected = false;
    this.notify();
  }

  /**
   * One-touch sync & verify: ensures all Sepetay records carry legacyAppletId and sepetay tenant tags.
   */
  public async ensureSepetayLiveMapping(): Promise<{
    productsSynced: number;
    customersSynced: number;
    salesSynced: number;
    transactionsSynced: number;
  }> {
    const [pSnap, cSnap, sSnap, tSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'sales')),
      getDocs(collection(db, 'customer_transactions'))
    ]);

    let pCount = 0;
    let cCount = 0;
    let sCount = 0;
    let tCount = 0;

    let batch = writeBatch(db);
    let batchOps = 0;

    // Check products
    for (const d of pSnap.docs) {
      const data = d.data();
      if (isDocInTenant(data, 'sepetay')) {
        pCount++;
        if (data.tenant_id !== 'sepetay' || data.tenantId !== 'sepetay' || !data.direct_firebase_mapping) {
          batch.set(d.ref, {
            tenantId: 'sepetay',
            tenant_id: 'sepetay',
            legacy_applet_id: SEPETAY_LEGACY_APPLET_ID,
            legacyAppletId: SEPETAY_LEGACY_APPLET_ID,
            firebase_project: SEPETAY_LEGACY_APPLET_ID,
            direct_firebase_mapping: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
          batchOps++;
        }
      }
      if (batchOps >= 350) {
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      }
    }

    // Check customers
    for (const d of cSnap.docs) {
      const data = d.data();
      if (isDocInTenant(data, 'sepetay')) {
        cCount++;
        if (data.tenant_id !== 'sepetay' || data.tenantId !== 'sepetay' || !data.direct_firebase_mapping) {
          batch.set(d.ref, {
            tenantId: 'sepetay',
            tenant_id: 'sepetay',
            legacy_applet_id: SEPETAY_LEGACY_APPLET_ID,
            legacyAppletId: SEPETAY_LEGACY_APPLET_ID,
            firebase_project: SEPETAY_LEGACY_APPLET_ID,
            direct_firebase_mapping: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
          batchOps++;
        }
      }
      if (batchOps >= 350) {
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      }
    }

    // Check sales
    for (const d of sSnap.docs) {
      const data = d.data();
      if (isDocInTenant(data, 'sepetay')) {
        sCount++;
        if (data.tenant_id !== 'sepetay' || data.tenantId !== 'sepetay' || !data.direct_firebase_mapping) {
          batch.set(d.ref, {
            tenantId: 'sepetay',
            tenant_id: 'sepetay',
            legacy_applet_id: SEPETAY_LEGACY_APPLET_ID,
            legacyAppletId: SEPETAY_LEGACY_APPLET_ID,
            firebase_project: SEPETAY_LEGACY_APPLET_ID,
            direct_firebase_mapping: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
          batchOps++;
        }
      }
      if (batchOps >= 350) {
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      }
    }

    // Check customer_transactions
    for (const d of tSnap.docs) {
      const data = d.data();
      if (isDocInTenant(data, 'sepetay')) {
        tCount++;
        if (data.tenant_id !== 'sepetay' || data.tenantId !== 'sepetay' || !data.direct_firebase_mapping) {
          batch.set(d.ref, {
            tenantId: 'sepetay',
            tenant_id: 'sepetay',
            legacy_applet_id: SEPETAY_LEGACY_APPLET_ID,
            legacyAppletId: SEPETAY_LEGACY_APPLET_ID,
            firebase_project: SEPETAY_LEGACY_APPLET_ID,
            direct_firebase_mapping: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
          batchOps++;
        }
      }
      if (batchOps >= 350) {
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    this.state.productsCount = pCount;
    this.state.customersCount = cCount;
    this.state.salesCount = sCount;
    this.state.transactionsCount = tCount;
    this.state.lastSyncTime = new Date();
    this.notify();

    return {
      productsSynced: pCount,
      customersSynced: cCount,
      salesSynced: sCount,
      transactionsSynced: tCount
    };
  }
}

export const sepetayLiveSync = SepetayLiveSyncService.getInstance();
