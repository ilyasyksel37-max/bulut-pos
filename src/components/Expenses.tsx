import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Receipt, Plus, Trash2, Calendar, Tag, Printer, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const Expenses: React.FC = () => {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [formData, setFormData] = useState({ title: '', amount: '', category: '', description: '' });

  useEffect(() => {
    const q = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = parseFloat(formData.amount.replace(',', '.')) || 0;
    try {
      await addDoc(collection(db, 'expenses'), {
        ...formData,
        amount: cleanAmount,
        date: serverTimestamp()
      });
      setFormData({ title: '', amount: '', category: '', description: '' });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteExpense = async (id: string) => {
    if (confirm('Silmek istediğinize emin misiniz?')) {
      await deleteDoc(doc(db, 'expenses', id));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 lg:space-y-6 pb-24 lg:pb-12 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <img 
            src="/logo.jpg" 
            alt="Logo" 
            className="w-10 h-10 rounded-lg object-cover shadow-sm border border-slate-100 hidden lg:block"
            referrerPolicy="no-referrer"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Gider & Masraf Takibi</h2>
              <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {expenses.length} Gider Kalemi
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">İşletme masrafları, faturalar ve personel giderleri.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95"
            title="Gider Listesini Yazdır"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Gider Raporunu Yazdır</span>
          </button>
        </div>
      </header>

      {/* Summary Stat Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Toplam Kayıtlı Gider</p>
            <p className="text-xl sm:text-2xl font-black text-red-600 mt-0.5">
              {totalExpenseAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          Ortalama: {expenses.length > 0 ? (totalExpenseAmount / expenses.length).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : 0} ₺ / işlem
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs h-fit print:hidden">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Plus className="w-5 h-5 text-blue-600" />
            Yeni Gider Ekle
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Gider Başlığı *</label>
              <input 
                required 
                value={formData.title} 
                onChange={e => setFormData({...formData, title: e.target.value})} 
                placeholder="Örn: Elektrik Faturası, Dükkan Kirası"
                type="text" 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Tutar (₺) *</label>
                <input 
                  required 
                  value={formData.amount} 
                  onChange={e => setFormData({...formData, amount: e.target.value})} 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kategori *</label>
                <select 
                  required 
                  value={formData.category} 
                  onChange={e => setFormData({...formData, category: e.target.value})} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seçiniz</option>
                  <option value="Kira">Kira</option>
                  <option value="Fatura">Fatura (Elektrik/Su/İnternet)</option>
                  <option value="Personel">Personel & Maaş</option>
                  <option value="Mal Alımı">Mal Alımı (Tedarikçi)</option>
                  <option value="Yemek & Çay">Yemek & Çay</option>
                  <option value="Kargo & Nakliye">Kargo & Nakliye</option>
                  <option value="Diğer">Diğer</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Açıklama (İsteğe Bağlı)</label>
              <textarea 
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                placeholder="Örn: Ekim ayı kira bedeli elden verildi..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <button 
              type="submit" 
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-all active:scale-[0.98] text-xs sm:text-sm shadow-md"
            >
              GİDERİ KAYDET
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-2.5 sm:space-y-3">
          {expenses.map(expense => (
            <div key={expense.id} className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                  <Receipt className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">{expense.title}</h4>
                  <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                    <span className="flex items-center gap-1 font-semibold text-slate-600">
                      <Tag className="w-3 h-3" /> {expense.category}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> 
                      {expense.date ? format(expense.date.toDate(), 'dd MMMM yyyy', { locale: tr }) : ''}
                    </span>
                    {expense.description && (
                      <>
                        <span>•</span>
                        <span className="italic truncate max-w-[140px]">"{expense.description}"</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <p className="text-sm sm:text-base font-black text-red-600">
                  -{Number(expense.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </p>
                <button 
                  onClick={() => deleteExpense(expense.id)} 
                  className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-colors print:hidden"
                  title="Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {expenses.length === 0 && (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl py-14 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-25" />
              <p className="text-sm font-semibold text-slate-600">Henüz gider kaydı bulunmuyor.</p>
              <p className="text-xs text-slate-400 mt-0.5">Soldaki formdan yeni bir gider ekleyebilirsiniz.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Expenses;
