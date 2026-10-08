import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  increment, 
  serverTimestamp, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  where 
} from 'firebase/firestore';
import { db } from './firebase';

export type CurrencyType = 'TRY' | 'USD' | 'EUR';

export interface CashRegisterData {
  id: CurrencyType;
  currency: CurrencyType;
  name: string;
  symbol: string;
  balance: number;
  updatedAt?: any;
}

export interface CashTransaction {
  id?: string;
  registerId: CurrencyType;
  currency: CurrencyType;
  type: 'IN' | 'OUT';
  amount: number;
  category: 'SALE' | 'COLLECTION' | 'MANUAL_IN' | 'EXPENSE' | 'TRANSFER' | 'OTHER';
  description: string;
  referenceId?: string;
  sellerCode?: string;
  sellerName?: string;
  exchangeRate?: number;
  date: any;
  createdAt?: any;
}

const DEFAULT_REGISTERS: Record<CurrencyType, CashRegisterData> = {
  TRY: { id: 'TRY', currency: 'TRY', name: 'Türk Lirası Kasası', symbol: '₺', balance: 0 },
  USD: { id: 'USD', currency: 'USD', name: 'Dolar Kasası', symbol: '$', balance: 0 },
  EUR: { id: 'EUR', currency: 'EUR', name: 'Euro Kasası', symbol: '€', balance: 0 }
};

/**
 * Ensures all three registers (TRY, USD, EUR) exist in Firestore
 */
export const initCashRegisters = async () => {
  try {
    for (const [key, reg] of Object.entries(DEFAULT_REGISTERS)) {
      const docRef = doc(db, 'cash_registers', key);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        await setDoc(docRef, {
          ...reg,
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (err) {
    console.error("Error initializing cash registers:", err);
  }
};

/**
 * Record a movement into or out of a cash register
 */
export const recordCashMovement = async (params: {
  currency: CurrencyType;
  type: 'IN' | 'OUT';
  amount: number;
  category: 'SALE' | 'COLLECTION' | 'MANUAL_IN' | 'EXPENSE' | 'TRANSFER' | 'OTHER';
  description: string;
  referenceId?: string;
  sellerCode?: string;
  sellerName?: string;
  exchangeRate?: number;
}) => {
  try {
    const { currency, type, amount, category, description, referenceId, sellerCode, sellerName, exchangeRate } = params;
    if (!amount || amount <= 0) return;

    const delta = type === 'IN' ? amount : -amount;
    const registerRef = doc(db, 'cash_registers', currency);

    // Ensure doc exists, then increment
    const snap = await getDoc(registerRef);
    if (!snap.exists()) {
      await setDoc(registerRef, {
        ...DEFAULT_REGISTERS[currency],
        balance: delta,
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(registerRef, {
        balance: increment(delta),
        updatedAt: serverTimestamp()
      });
    }

    // Add transaction to history
    await addDoc(collection(db, 'cash_transactions'), {
      registerId: currency,
      currency,
      type,
      amount,
      category,
      description,
      referenceId: referenceId || null,
      sellerCode: sellerCode || 'GENEL',
      sellerName: sellerName || 'Kasiyer',
      exchangeRate: exchangeRate || null,
      date: serverTimestamp()
    });
  } catch (err) {
    console.error("Cash movement recording failed:", err);
  }
};

/**
 * Transfer funds between registers (e.g. converting 100 USD to 3850 TRY)
 */
export const transferBetweenRegisters = async (params: {
  fromCurrency: CurrencyType;
  toCurrency: CurrencyType;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  sellerCode?: string;
  sellerName?: string;
  notes?: string;
}) => {
  const { fromCurrency, toCurrency, fromAmount, toAmount, exchangeRate, sellerCode, sellerName, notes } = params;

  // 1. Take out from source register
  await recordCashMovement({
    currency: fromCurrency,
    type: 'OUT',
    amount: fromAmount,
    category: 'TRANSFER',
    description: `Döviz Çıkışı -> ${toCurrency} Kasasına Aktarım (${notes || 'Döviz Bozma/Virman'})`,
    exchangeRate,
    sellerCode,
    sellerName
  });

  // 2. Put into destination register
  await recordCashMovement({
    currency: toCurrency,
    type: 'IN',
    amount: toAmount,
    category: 'TRANSFER',
    description: `Döviz Girişi <- ${fromCurrency} Kasasından Aktarım (Kur: ${exchangeRate})`,
    exchangeRate,
    sellerCode,
    sellerName
  });
};
