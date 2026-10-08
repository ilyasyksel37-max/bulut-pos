import React, { useState, useEffect } from 'react';
import { X, UserPlus, Save, Building, Phone, Mail, MapPin, CreditCard, FileText } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export interface CustomerData {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  debt?: number;
  creditLimit?: number;
  loyaltyPoints?: number;
  totalSpent?: number;
}

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: CustomerData | null;
  onSuccess: (savedCustomer: CustomerData) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    creditLimit: '2000',
    initialDebt: '0',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        notes: customer.notes || '',
        creditLimit: String(customer.creditLimit || '2000'),
        initialDebt: String(customer.debt || '0'),
      });
    } else {
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
        creditLimit: '2000',
        initialDebt: '0',
      });
    }
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Lütfen müşteri adını girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const dataToSave = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
        notes: formData.notes.trim(),
        creditLimit: parseFloat(formData.creditLimit) || 0,
        debt: customer ? (customer.debt || 0) : (parseFloat(formData.initialDebt) || 0),
        loyaltyPoints: customer ? (customer.loyaltyPoints || 0) : 0,
        totalSpent: customer ? (customer.totalSpent || 0) : 0,
        updatedAt: serverTimestamp(),
      };

      let savedId = customer?.id;
      if (customer?.id) {
        await updateDoc(doc(db, 'customers', customer.id), dataToSave);
      } else {
        const newDoc = await addDoc(collection(db, 'customers'), {
          ...dataToSave,
          createdAt: serverTimestamp(),
        });
        savedId = newDoc.id;

        const initialDebtVal = parseFloat(formData.initialDebt) || 0;
        if (initialDebtVal > 0) {
          await addDoc(collection(db, 'customer_transactions'), {
            customerId: savedId,
            customerName: formData.name.trim(),
            type: 'DEBT',
            title: 'Eski Bakiye / Açılış Borç Devri',
            amount: initialDebtVal,
            paymentMethod: 'Devir',
            balanceAfter: initialDebtVal,
            date: serverTimestamp(),
          });
        }
      }

      onSuccess({ id: savedId, ...dataToSave });
      onClose();
    } catch (err) {
      console.error("Customer save error:", err);
      alert("Müşteri kaydedilirken hata oluştu: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 leading-tight">
                {customer ? 'Müşteri Bilgilerini Düzenle' : 'Yeni Müşteri / Cari Kart Ekle'}
              </h3>
              <p className="text-xs text-slate-500 leading-tight mt-0.5">
                Veresiye ve sadakat takibi için müşteri kaydı
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Müşteri Adı Soyadı / Firma Ünvanı *
            </label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                required
                type="text"
                placeholder="Örn: Ahmet Yılmaz veya Atatürk İlkokulu"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Telefon Numarası *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="tel"
                  placeholder="05xx xxx xx xx"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                E-posta (İsteğe Bağlı)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="ornek@mail.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Veresiye Limiti (₺)
              </label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="100"
                  placeholder="2000"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {!customer && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Mevcut Borç Devri (₺)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.initialDebt}
                  onChange={(e) => setFormData({ ...formData, initialDebt: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-red-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Adres / Okul / Kurum Bilgisi
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <textarea
                rows={2}
                placeholder="Adres, okul veya dükkan konumu..."
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Özel Notlar
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <textarea
                rows={2}
                placeholder="Örn: Ay başında ödeme yapar, veli iletişim bilgisi vb."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-all"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Kaydediliyor...' : 'Müşteriyi Kaydet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
