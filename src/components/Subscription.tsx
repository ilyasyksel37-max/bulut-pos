import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, ShieldCheck, Sparkles, MessageCircle, ExternalLink, Phone, PhoneCall, X, HelpCircle } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Plan {
  id: string;
  title: string;
  priceMonthly: string;
  priceYearly: string;
  features: string[];
  highlight?: boolean;
}

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'baslangic',
    title: 'Başlangıç',
    priceMonthly: '₺299',
    priceYearly: '₺2,999',
    features: ['Hızlı Satış (POS)', 'Stok Yönetimi', 'Basit Raporlar', '1 Kullanıcı']
  },
  {
    id: 'standart',
    title: 'Standart',
    priceMonthly: '₺599',
    priceYearly: '₺5,999',
    features: ['Tüm Başlangıç Özellikleri', 'Saha Sipariş Yönetimi', 'Detaylı Cari Takibi', 'Öncelikli Güncellemeler'],
    highlight: true
  },
  {
    id: 'pro',
    title: 'Pro',
    priceMonthly: '₺999',
    priceYearly: '₺9,999',
    features: ['Tüm Standart Özellikleri', 'Gelişmiş Prim Raporları', 'Çoklu Depo / Şube', '7/24 Özel Destek']
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    priceMonthly: '₺1,999',
    priceYearly: '₺19,999',
    features: ['Özel Sunucu / Sınırsız Şube', 'Özel API Entegrasyonları', 'Sınırsız Kullanıcı', 'Özel Müşteri Temsilcisi']
  }
];

export const Subscription: React.FC = () => {
  const { tenantName, currentTenant } = useAuth();
  const currentPlan = currentTenant?.package || 'standart';

  const [whatsappNumber, setWhatsappNumber] = useState('+905382516406');
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedPlanForContact, setSelectedPlanForContact] = useState<string>('Standart');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_settings', 'pricing_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.whatsappNumber) setWhatsappNumber(data.whatsappNumber);
        if (data.plans && Array.isArray(data.plans)) setPlans(data.plans);
      }
    }, (err) => {
      console.warn("Pricing config real-time sync warning:", err);
    });
    return () => unsub();
  }, []);

  const openContactModal = (planName: string) => {
    setSelectedPlanForContact(planName);
    setIsContactModalOpen(true);
  };

  const handleWhatsApp = (planName: string) => {
    const cleanNum = whatsappNumber.replace(/[^0-9+]/g, '');
    const text = `Merhaba, ${tenantName || 'Firma'} olarak ${planName} paketine geçiş / yenileme / destek almak istiyorum.`;
    const url = `https://wa.me/${cleanNum}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setIsContactModalOpen(false);
  };

  const handleCall = () => {
    const cleanNum = whatsappNumber.replace(/[^0-9+]/g, '');
    window.location.href = `tel:${cleanNum}`;
    setIsContactModalOpen(false);
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">Abonelik & Lisans Yönetimi</h2>
          <p className="text-xs text-slate-500 mt-1">
            Aktif Paket: <span className="font-bold text-blue-600 uppercase">{currentPlan}</span> • Durum: <span className="font-bold text-emerald-600 uppercase">AKTİF (Lisans Onaylı)</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Aylık Fiyat
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${billingCycle === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Yıllık (%20 İndirimli)
            </button>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs font-black">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Sistem Lisansı Onaylandı</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map((p) => {
          const isActive = currentPlan.toLowerCase() === p.id.toLowerCase() || currentPlan.toLowerCase() === p.title.toLowerCase();
          const displayPrice = billingCycle === 'monthly' ? p.priceMonthly : p.priceYearly;
          return (
            <div 
              key={p.id}
              className={`p-5 rounded-2xl border-2 relative transition-all flex flex-col justify-between ${
                p.highlight ? 'border-blue-600 bg-blue-50/50 shadow-md' : 'border-slate-100 bg-white'
              } ${isActive ? 'ring-2 ring-emerald-500 bg-emerald-50/20' : ''}`}
            >
              {isActive && (
                <div className="absolute -top-3 right-4 bg-emerald-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-sm flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Mevcut Paketiniz</span>
                </div>
              )}

              <div>
                <h3 className="text-sm font-black text-slate-900">{p.title}</h3>
                <div className="text-2xl font-black text-slate-950 mt-1">
                  {displayPrice}
                  <span className="text-xs font-bold text-slate-400">/{billingCycle === 'monthly' ? 'ay' : 'yıl'}</span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {p.features?.map((f: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button 
                type="button"
                onClick={() => openContactModal(p.title)}
                className={`w-full mt-6 py-2.5 text-xs font-black rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 ${
                  isActive 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                    : p.highlight 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                <span>{isActive ? 'Paketi Yenile / Görüş' : 'Hemen Geç / İletişim'}</span>
              </button>
            </div>
          );
        })}
      </div>
      
      {/* WhatsApp & Call Support Footer */}
      <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wide">Yönetici & Destek İletişim Hattı</h4>
            <p className="text-xs font-bold text-emerald-800 mt-0.5">
              WhatsApp veya Doğrudan Arama ile 7/24 destek alabilirsiniz: <span className="font-mono font-black">{whatsappNumber}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openContactModal(currentPlan)}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 transition-all active:scale-95"
          >
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp Destek</span>
          </button>
          <button
            type="button"
            onClick={handleCall}
            className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 transition-all active:scale-95"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Hemen Ara</span>
          </button>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 text-center">
        * Abonelikler merkezi olarak yönetilir. Paket yükseltme ve yenileme talepleriniz için yönetici hattımızla her an iletişime geçebilirsiniz.
      </p>

      {/* Contact Choice Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Yöneticiyle İletişim Kur</h3>
                  <p className="text-xs text-slate-500">Seçilen Paket: <span className="font-bold text-blue-600 uppercase">{selectedPlanForContact}</span></p>
                </div>
              </div>
              <button 
                onClick={() => setIsContactModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-600">
                Abonelik işlemleri, paket yükseltme veya teknik destek için aşağıdaki iletişim kanallarından birini seçebilirsiniz:
              </p>

              <button
                type="button"
                onClick={() => handleWhatsApp(selectedPlanForContact)}
                className="w-full p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl flex items-center justify-between shadow-lg shadow-emerald-600/20 transition-all active:scale-95 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase">WhatsApp Destek Hattı</p>
                    <p className="text-[11px] text-emerald-100 font-mono">{whatsappNumber}</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 opacity-80 group-hover:opacity-100" />
              </button>

              <button
                type="button"
                onClick={handleCall}
                className="w-full p-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl flex items-center justify-between shadow-lg transition-all active:scale-95 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <PhoneCall className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase">Doğrudan Telefonla Ara</p>
                    <p className="text-[11px] text-slate-400 font-mono">{whatsappNumber}</p>
                  </div>
                </div>
                <Phone className="w-4 h-4 opacity-80 group-hover:opacity-100" />
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Vazgeç / Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
