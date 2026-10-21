import React from 'react';
import { AlertTriangle, Lock, Phone, Mail, ShieldAlert, CreditCard, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SuspendedScreen: React.FC = () => {
  const { tenantName, currentTenant, logout } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg animate-fadeIn">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-8 sm:p-10 text-center space-y-6 border border-white/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500"></div>

        <div className="w-20 h-20 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-xl shadow-rose-900/10 rotate-3">
          <Lock className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-widest">
            Abonelik Durumu: Askıya Alındı / Süre Doldu
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {tenantName || 'İşletme'} Hesabı Askıya Alındı
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
            Bu işletmenin (<strong>{currentTenant?.id}</strong>) aylık abonelik süresi dolmuş veya ödeme beklenmektedir. Sistem yöneticiniz ile iletişime geçerek üyeliğinizi yenileyebilirsiniz.
          </p>
        </div>

        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 text-left space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <span>Ödeme & İletişim Bilgileri</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            Aylık abonelik yenileme ücreti ve IBAN bilgileri için sistem sahibi ile görüşün:
          </p>
          <div className="pt-2 border-t border-slate-200/60 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Mail className="w-4 h-4 text-slate-400" />
              <span>Sistem Sahibi: <strong>ilyasyksel37@gmail.com</strong></span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <button
            onClick={logout}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>Güvenli Çıkış Yap</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          Bulut POS • Güvenli Çok Kiracılı Altyapı
        </p>
      </div>
    </div>
  );
};
