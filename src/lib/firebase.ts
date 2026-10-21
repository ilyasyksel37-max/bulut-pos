import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with modern multi-tab persistence and automatic long-polling detection
// to prevent proxy/iframe 10-second backend connection timeouts.
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);

// Tenant subcollection references (e.g. tenants/sepetay/customers, tenants/sepetay/products)
export const getTenantSubcollection = (tenantId: string, subName: string) => collection(db, 'tenants', tenantId, subName);
export const sepetayCustomersRef = collection(db, 'tenants', 'sepetay', 'customers');
export const sepetayProductsRef = collection(db, 'tenants', 'sepetay', 'products');
export const sepetayTransactionsRef = collection(db, 'tenants', 'sepetay', 'customer_transactions');
export const sepetaySalesRef = collection(db, 'tenants', 'sepetay', 'sales');

