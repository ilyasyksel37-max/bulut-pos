import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  setLogLevel,
  collection 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Suppress non-critical warning logs in iframe / preview environments
try {
  setLogLevel('error');
} catch (e) {}

const app = initializeApp(firebaseConfig);

// Standard Firestore initialization matching Firebase skill specification
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Tenant subcollection references (e.g. tenants/sepetay/customers, tenants/sepetay/products)
export const getTenantSubcollection = (tenantId: string, subName: string) => collection(db, 'tenants', tenantId, subName);
export const sepetayCustomersRef = collection(db, 'tenants', 'sepetay', 'customers');
export const sepetayProductsRef = collection(db, 'tenants', 'sepetay', 'products');
export const sepetayTransactionsRef = collection(db, 'tenants', 'sepetay', 'customer_transactions');
export const sepetaySalesRef = collection(db, 'tenants', 'sepetay', 'sales');

