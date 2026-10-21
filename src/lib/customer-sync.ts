import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  increment, 
  serverTimestamp, 
  Firestore 
} from 'firebase/firestore';
import { isSepetayTenant, withTenant } from './tenant';
import { sepetayCustomersRef, sepetayTransactionsRef } from './firebase';

export interface RecordCustomerSaleOptions {
  db: Firestore;
  tenantId?: string | null;
  customer: {
    id?: string;
    name: string;
    phone?: string | null;
    debt?: number;
    tenantId?: string;
    tenant_id?: string;
    loyaltyPoints?: number;
    totalSpent?: number;
    [key: string]: any;
  };
  saleId: string;
  paymentMethod: 'veresiye' | 'cash' | 'card' | 'parcali' | 'cek' | 'senet' | string;
  grandTotal: number;
  itemsSummary: string;
  splitCashAmount?: number;
  splitCardAmount?: number;
  selectedCurrency?: string;
  activeRate?: number;
  foreignTotal?: number | null;
  sellerCode?: string;
  sellerName?: string;
}

export interface CustomerSaleResult {
  newDebt: number;
  isDebtType: boolean;
  methodLabel: string;
}

/**
 * Returns all potential Firestore document paths where this customer record might exist across tenants.
 */
export const getTargetCustomerDocRefs = (
  db: Firestore, 
  customerId: string, 
  tenantId?: string | null, 
  customerTenantId?: string | null
) => {
  const paths = [
    `customers/${customerId}`,
    `musteriler/${customerId}`,
    `cariler/${customerId}`,
    `tenants/sepetay/customers/${customerId}`,
  ];

  if (tenantId) {
    paths.push(`tenants/${tenantId}/customers/${customerId}`);
  }
  if (customerTenantId && customerTenantId !== tenantId) {
    paths.push(`tenants/${customerTenantId}/customers/${customerId}`);
  }

  // Deduplicate
  const uniquePaths = Array.from(new Set(paths));
  return uniquePaths.map(p => {
    const parts = p.split('/');
    if (parts.length === 2) {
      return doc(db, parts[0], parts[1]);
    }
    return doc(db, parts[0], parts[1], parts[2], parts[3]);
  });
};

/**
 * Updates customer balance, loyalty points, and records full ledger entries across ALL tenant databases.
 * Guarantees that sales (both Veresiye and Cash/Card) reflect immediately in Sepetay and every other tenant.
 */
export async function recordCustomerSaleAndLedger(
  options: RecordCustomerSaleOptions
): Promise<CustomerSaleResult> {
  const {
    db,
    tenantId,
    customer,
    saleId,
    paymentMethod,
    grandTotal,
    itemsSummary,
    splitCashAmount = 0,
    splitCardAmount = 0,
    selectedCurrency = 'TRY',
    activeRate = 1,
    foreignTotal = null,
    sellerCode = 'E01',
    sellerName = 'Kasiyer'
  } = options;

  const currentDebt = Number(customer.debt || 0);
  const isDebtType = paymentMethod === 'veresiye' || paymentMethod === 'cek' || paymentMethod === 'senet';
  const newDebt = isDebtType ? Number((currentDebt + grandTotal).toFixed(2)) : currentDebt;

  const methodLabel = 
    paymentMethod === 'veresiye' ? 'Cari (Veresiye)' :
    paymentMethod === 'cek' ? 'Çek' :
    paymentMethod === 'senet' ? 'Senet' :
    paymentMethod === 'cash' ? 'Nakit' :
    paymentMethod === 'card' ? 'Kredi Kartı' :
    paymentMethod === 'parcali' ? 'Parçalı' : paymentMethod;

  const summaryText = itemsSummary.length > 70 
    ? itemsSummary.substring(0, 70) + '...' 
    : itemsSummary;

  // 1. Prepare Customer Document Updates
  const customerUpdates: Record<string, any> = {
    name: customer.name,
    loyaltyPoints: increment(Math.floor(grandTotal / 10)),
    totalSpent: increment(grandTotal),
    lastSaleDate: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (customer.phone) customerUpdates.phone = customer.phone;
  if (isDebtType) {
    customerUpdates.debt = increment(grandTotal);
  }

  const custId = customer.id;
  if (!custId) {
    return {
      newDebt,
      isDebtType,
      methodLabel
    };
  }

  // Determine all customer doc paths
  const custTenantId = customer.tenantId || customer.tenant_id;
  const targetDocRefs = getTargetCustomerDocRefs(db, custId, tenantId, custTenantId);

  // Update in all customer locations
  await Promise.allSettled(
    targetDocRefs.map(cRef => setDoc(cRef, customerUpdates, { merge: true }))
  );

  // 2. Helper to broadcast transaction to all ledger collections
  const broadcastTransaction = async (txData: Record<string, any>) => {
    const payload = withTenant(txData, tenantId || undefined);

    // Root collection
    const mainTxDoc = await addDoc(collection(db, 'customer_transactions'), payload);

    // Tenant subcollections
    const subcollPromises: Promise<any>[] = [];

    if (isSepetayTenant(tenantId) || isSepetayTenant(custTenantId)) {
      subcollPromises.push(
        setDoc(doc(sepetayTransactionsRef, mainTxDoc.id), payload, { merge: true }).catch(() => {})
      );
    }

    if (tenantId && !isSepetayTenant(tenantId)) {
      subcollPromises.push(
        setDoc(doc(db, 'tenants', tenantId, 'customer_transactions', mainTxDoc.id), payload, { merge: true }).catch(() => {})
      );
    }

    if (custTenantId && custTenantId !== tenantId && !isSepetayTenant(custTenantId)) {
      subcollPromises.push(
        setDoc(doc(db, 'tenants', custTenantId, 'customer_transactions', mainTxDoc.id), payload, { merge: true }).catch(() => {})
      );
    }

    await Promise.allSettled(subcollPromises);
    return mainTxDoc.id;
  };

  // 3. Record Transactions in Ledger depending on payment mode
  if (isDebtType) {
    // Veresiye / Çek / Senet: single DEBT transaction increasing balance
    await broadcastTransaction({
      customerId: customer.id,
      customerName: customer.name,
      saleId: saleId,
      type: 'DEBT',
      title: `${methodLabel} Satış (${summaryText})`,
      amount: grandTotal,
      previousBalance: currentDebt,
      paymentMethod: methodLabel,
      balanceAfter: newDebt,
      currency: selectedCurrency,
      exchangeRate: activeRate || 1,
      foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : null,
      sellerCode,
      sellerName,
      date: serverTimestamp()
    });
  } else if (paymentMethod === 'parcali') {
    // Parçalı ödeme: 1 Satış (DEBT) + Partial Cash (PAYMENT) + Partial Card (PAYMENT)
    const saleTempBalance = Number((currentDebt + grandTotal).toFixed(2));
    
    // Satış kaydı
    await broadcastTransaction({
      customerId: customer.id,
      customerName: customer.name,
      saleId: saleId,
      type: 'DEBT',
      title: `Parçalı Satış (${summaryText})`,
      amount: grandTotal,
      previousBalance: currentDebt,
      paymentMethod: 'Parçalı',
      balanceAfter: saleTempBalance,
      currency: selectedCurrency,
      exchangeRate: activeRate || 1,
      foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : null,
      sellerCode,
      sellerName,
      date: serverTimestamp()
    });

    let runningBal = saleTempBalance;
    if (splitCashAmount > 0) {
      const balAfterCash = Number((runningBal - splitCashAmount).toFixed(2));
      await broadcastTransaction({
        customerId: customer.id,
        customerName: customer.name,
        saleId: saleId,
        type: 'PAYMENT',
        title: `Parçalı Satış Nakit Tahsilatı (Fiş No: ${saleId.slice(0, 8)})`,
        amount: splitCashAmount,
        previousBalance: runningBal,
        paymentMethod: 'Nakit',
        balanceAfter: balAfterCash,
        currency: selectedCurrency,
        sellerCode,
        sellerName,
        date: serverTimestamp()
      });
      runningBal = balAfterCash;
    }

    if (splitCardAmount > 0) {
      await broadcastTransaction({
        customerId: customer.id,
        customerName: customer.name,
        saleId: saleId,
        type: 'PAYMENT',
        title: `Parçalı Satış Kart Tahsilatı (Fiş No: ${saleId.slice(0, 8)})`,
        amount: splitCardAmount,
        previousBalance: runningBal,
        paymentMethod: 'Kredi Kartı',
        balanceAfter: currentDebt,
        currency: selectedCurrency,
        sellerCode,
        sellerName,
        date: serverTimestamp()
      });
    }
  } else {
    // Nakit veya Kredi Kartı Cari Satış:
    // Both Satış (DEBT/PURCHASE) and immediate collection (PAYMENT) are logged in customer statement
    // This allows customer statement to show the purchase, products and immediate settlement!
    const saleTempBalance = Number((currentDebt + grandTotal).toFixed(2));

    // 1. Satış Kaydı
    await broadcastTransaction({
      customerId: customer.id,
      customerName: customer.name,
      saleId: saleId,
      type: 'DEBT',
      title: `${methodLabel} Satış (${summaryText})`,
      amount: grandTotal,
      previousBalance: currentDebt,
      paymentMethod: methodLabel,
      balanceAfter: saleTempBalance,
      currency: selectedCurrency,
      exchangeRate: activeRate || 1,
      foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : null,
      sellerCode,
      sellerName,
      date: serverTimestamp()
    });

    // 2. Anında Nakit / Kart Tahsilat Kaydı
    await broadcastTransaction({
      customerId: customer.id,
      customerName: customer.name,
      saleId: saleId,
      type: 'PAYMENT',
      title: `${methodLabel} Satış Tahsilatı (Fiş No: ${saleId.slice(0, 8)})`,
      amount: grandTotal,
      previousBalance: saleTempBalance,
      paymentMethod: methodLabel,
      balanceAfter: currentDebt,
      currency: selectedCurrency,
      exchangeRate: activeRate || 1,
      foreignAmount: selectedCurrency !== 'TRY' ? foreignTotal : null,
      sellerCode,
      sellerName,
      date: serverTimestamp()
    });
  }

  return {
    newDebt,
    isDebtType,
    methodLabel
  };
}

/**
 * Decrements customer debt and broadcasts payment transaction across all tenant databases.
 */
export async function recordCustomerPaymentAndLedger(
  db: Firestore,
  tenantId: string | null | undefined,
  customer: { id: string; name: string; debt?: number; tenantId?: string; tenant_id?: string },
  amount: number,
  method: string,
  notes?: string
) {
  const currentDebt = Number(customer.debt || 0);
  const remainingDebt = Math.max(0, Number((currentDebt - amount).toFixed(2)));

  const custTenantId = customer.tenantId || customer.tenant_id;
  const targetDocRefs = getTargetCustomerDocRefs(db, customer.id, tenantId, custTenantId);

  // 1. Update customer document across collections
  const updatePayload = {
    debt: increment(-amount),
    updatedAt: serverTimestamp()
  };
  await Promise.allSettled(
    targetDocRefs.map(cRef => setDoc(cRef, updatePayload, { merge: true }))
  );

  // 2. Broadcast payment transaction
  const txPayload = withTenant({
    customerId: customer.id,
    customerName: customer.name,
    type: 'PAYMENT',
    title: notes?.trim() ? `Tahsilat (${method}): ${notes.trim()}` : `Borç Tahsilatı (${method})`,
    amount: amount,
    previousBalance: currentDebt,
    paymentMethod: method,
    notes: notes?.trim() || '',
    balanceAfter: remainingDebt,
    date: serverTimestamp()
  }, tenantId || undefined);

  const txDoc = await addDoc(collection(db, 'customer_transactions'), txPayload);

  const subcollPromises: Promise<any>[] = [];
  if (isSepetayTenant(tenantId) || isSepetayTenant(custTenantId)) {
    subcollPromises.push(
      setDoc(doc(sepetayTransactionsRef, txDoc.id), txPayload, { merge: true }).catch(() => {})
    );
  }
  if (tenantId && !isSepetayTenant(tenantId)) {
    subcollPromises.push(
      setDoc(doc(db, 'tenants', tenantId, 'customer_transactions', txDoc.id), txPayload, { merge: true }).catch(() => {})
    );
  }
  if (custTenantId && custTenantId !== tenantId && !isSepetayTenant(custTenantId)) {
    subcollPromises.push(
      setDoc(doc(db, 'tenants', custTenantId, 'customer_transactions', txDoc.id), txPayload, { merge: true }).catch(() => {})
    );
  }

  await Promise.allSettled(subcollPromises);
  return { remainingDebt, txId: txDoc.id };
}
