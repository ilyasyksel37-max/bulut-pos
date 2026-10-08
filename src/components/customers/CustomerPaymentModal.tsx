import React, { useState } from 'react';
import { X, Banknote, CreditCard, ArrowDownRight, CheckCircle2 } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CustomerData } from './CustomerModal';

interface CustomerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerData | null;
  onSuccess: (amount: number) => void;
}

export const CustomerPaymentModal: React.FC<CustomerPaymentModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<'Nakit' | 'Kredi Kartı' | 'Havale/EFT'>('Nakit');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !customer) return null;

  const currentDebt = Number(customer.debt || 0);
  const paymentNum = parseFloat(amount) || 0;
  const remainingDebt = Math.max(0, currentDebt - paymentNum);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentNum <= 0) {
      alert("Lütfen geçerli bir tahsilat tutarı girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Record customer transaction
      await addDoc(collection(db, 'customer_transactions'), {
        customerId: customer.id,
        customerName: customer.name,
        type: 'PAYMENT',
        title: `Veresiye Tahsilatı (${method})`,
        amount: paymentNum,
        previousBalance: currentDebt,
        paymentMethod: method,
        notes: notes.trim(),
        balanceAfter: remainingDebt,
        date: serverTimestamp(),
      });

      // 2. Decrement customer debt
      await updateDoc(doc(db, 'customers', customer.id!), {
        debt: increment(-paymentNum),
        updatedAt: serverTimestamp(),
      });

      onSuccess(paymentNum);
      onClose();
    } catch (err) {
      console.error("Payment error:", err);
      alert("Tahsilat kaydedilirken hata oluştu: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-tight">Veresiye Borç Tahsilatı</h3>
              <p className="text-xs text-slate-500 leading-tight mt-0.5">{customer.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Debt Card */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="bg-gradient-to-br from-red-50 to-amber-50 border border-red-100 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">Mevcut Veresiye Borcu</p>
              <p className="text-2xl font-black text-red-700 mt-0.5">
                {currentDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
            {currentDebt > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(currentDebt))}
                className="bg-white hover:bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
              >
                Hepsini Kapat
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Tahsil Edilen Tutar (₺) *
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                max={currentDebt > 0 ? currentDebt : undefined}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {/* Quick Amount Pills */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                {[50, 100, 200, 500].filter(val => val <= currentDebt).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(String(val))}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all shrink-0"
                  >
                    +{val} ₺
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                Ödeme Yöntemi
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Nakit', 'Kredi Kartı', 'Havale/EFT'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      method === m
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m === 'Nakit' && <Banknote className="w-3.5 h-3.5" />}
                    {m === 'Kredi Kartı' && <CreditCard className="w-3.5 h-3.5" />}
                    <span>{m}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Açıklama / Makbuz Notu
              </label>
              <input
                type="text"
                placeholder="Örn: Elden teslim alındı, Fiş No: 120"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Remaining Balance Preview */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Kalan Borç Bakiyesi:</span>
              <span className="font-bold text-slate-900 text-sm">
                {remainingDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={isSubmitting || paymentNum <= 0}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Kaydediliyor...' : 'Tahsilatı Onayla'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
