import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Calendar, Clock, ShieldCheck, AlertTriangle, CheckCircle2, 
  Sparkles, Building2, CreditCard, ChevronRight, RefreshCw, 
  Award, ShieldAlert, Zap, History, PhoneCall, ArrowUpRight, MessageCircle
} from 'lucide-react';
import { format, parseISO, addDays, addMonths, addYears } from 'date-fns';
import { getRemainingDuration, TenantInfo, isSepetayTenant } from '../lib/tenant';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TenantMembershipSettingsProps {
  onRenewRequested?: (tenant: TenantInfo) => void;
}

export const TenantMembershipSettings: React.FC<TenantMembershipSettingsProps> = ({ onRenewRequested }) => {
  const { currentTenant, isSuperAdmin, allTenants, switchTenant } = useAuth();
  const [selectedTenantState, setSelectedTenantState] = useState<string>(currentTenant?.id || '');
  const [quickExtendLoading, setQuickExtendLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Custom extension form for Super Admin directly inside Settings
  const [customDays, setCustomDays] = useState<number>(30);
  const [customMonths, setCustomMonths] = useState<number>(0);
  const [customYears, setCustomYears] = useState<number>(0);
  const [extendMode, setExtendMode] = useState<'preset' | 'custom'>('preset');

  // Determine active tenant to display
  const activeTenant: TenantInfo = (isSuperAdmin && selectedTenantState
    ? allTenants.find(t => t.id === selectedTenantState)
    : null) || currentTenant;

  const durationInfo = getRemainingDuration(activeTenant?.expiresAt);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Direct extend by days/months/years for SuperAdmin
  const handleExtendDuration = async (daysToAdd: number, label: string) => {
    if (!isSuperAdmin || !activeTenant) return;
    try {
      setQuickExtendLoading(true);
      const currentExpiry = activeTenant.expiresAt ? parseISO(activeTenant.expiresAt) : new Date();
      const baseDate = currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
      const newExpiry = addDays(baseDate, daysToAdd).toISOString();

      await updateDoc(doc(db, 'tenants', activeTenant.id), {
        status: 'active',
        expiresAt: newExpiry,
        updatedAt: serverTimestamp()
      });

      showToast(`✅ ${activeTenant.name} üyeliği ${label} uzatıldı.`);
    } catch (err: any) {
      console.error(err);
      alert('Süre güncellenemedi: ' + err.message);
    } finally {
      setQuickExtendLoading(false);
    }
  };

  // Exact custom extension (e.g. exactly 1 year + 2 months + 15 days)
  const handleCustomExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !activeTenant) return;

    try {
      setQuickExtendLoading(true);
      const currentExpiry = activeTenant.expiresAt ? parseISO(activeTenant.expiresAt) : new Date();
      let targetDate = currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();

      if (customYears > 0) targetDate = addYears(targetDate, Number(customYears));
      if (customMonths > 0) targetDate = addMonths(targetDate, Number(customMonths));
      if (customDays > 0) targetDate = addDays(targetDate, Number(customDays));

      const newExpiry = targetDate.toISOString();

      await updateDoc(doc(db, 'tenants', activeTenant.id), {
        status: 'active',
        expiresAt: newExpiry,
        updatedAt: serverTimestamp()
      });

      showToast(`✅ ${activeTenant.name} üyelik süresi tam olarak ayarlandı.`);
      setCustomYears(0);
      setCustomMonths(0);
      setCustomDays(30);
    } catch (err: any) {
      console.error(err);
      alert('Süre güncellenemedi: ' + err.message);
    } finally {
      setQuickExtendLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Toast Notification */}
      {successToast && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between animate-fadeIn">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {successToast}
          </span>
          <button onClick={() => setSuccessToast(null)} className="text-white/80 hover:text-white font-black">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base sm:text-lg tracking-tight">Kiracı Üyelik & Kalan Süre Takibi</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/30 text-blue-300 border border-blue-400/30">
                Canlı Sayaç
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              İşletmenizin ve kiracıların kalan gün, ay ve yıl bazında tam üyelik süresi.
            </p>
          </div>
        </div>

        {/* SuperAdmin Tenant Selector */}
        {isSuperAdmin && allTenants.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
            <Building2 className="w-4 h-4 text-slate-400 ml-1.5" />
            <select
              value={selectedTenantState || currentTenant?.id}
              onChange={(e) => setSelectedTenantState(e.target.value)}
              className="bg-transparent text-xs font-bold text-white pr-2 outline-none cursor-pointer"
            >
              {allTenants.map(t => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  {t.name} {t.code ? `[${t.code}]` : ''} {isSepetayTenant(t.id) ? '⚡ (Canlı Firebase DB: 36ef09c0)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Main Tenant Membership Card */}
        <div className={`p-5 rounded-2xl border transition-all ${
          durationInfo.isExpired 
            ? 'bg-rose-50/70 border-rose-200' 
            : durationInfo.badgeColor === 'amber'
            ? 'bg-amber-50/70 border-amber-200'
            : 'bg-slate-50 border-slate-200/80'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">İşletme / Mağaza</span>
                <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                  ID: {activeTenant?.id}
                </span>
              </div>
              <h4 className="text-lg font-black text-slate-900">{activeTenant?.name}</h4>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-blue-100 text-blue-700">
                  <Award className="w-3 h-3" />
                  Paket: {activeTenant?.package?.toUpperCase() || 'PRO'}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                  durationInfo.isExpired
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                  {durationInfo.isExpired ? 'Süresi Doldu / Askıda' : 'Aktif Lisans'}
                </span>
              </div>
            </div>

            {/* Large Remaining Duration Badge */}
            <div className="flex flex-col sm:items-end bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Kalan Üyelik Süresi
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className={`text-xl sm:text-2xl font-black tracking-tight ${
                  durationInfo.isExpired 
                    ? 'text-rose-600' 
                    : durationInfo.badgeColor === 'amber'
                    ? 'text-amber-600'
                    : 'text-slate-900'
                }`}>
                  {durationInfo.formattedText}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 mt-1">
                Bitiş Tarihi: <strong className="text-slate-800">
                  {activeTenant?.expiresAt ? format(parseISO(activeTenant.expiresAt), 'dd MMMM yyyy (HH:mm)') : 'Sınırsız'}
                </strong>
              </p>
            </div>
          </div>

          {/* Breakdown Grid (Yıl, Ay, Gün Sayacı) */}
          {!durationInfo.isUnlimited && !durationInfo.isExpired && (
            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-200/60">
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 text-center">
                <span className="text-[10px] font-black uppercase text-slate-400">Kalan Yıl</span>
                <p className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">{durationInfo.years}</p>
                <span className="text-[10px] font-bold text-slate-400">Yıl</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 text-center">
                <span className="text-[10px] font-black uppercase text-slate-400">Kalan Ay</span>
                <p className="text-xl sm:text-2xl font-black text-blue-600 mt-0.5">{durationInfo.months}</p>
                <span className="text-[10px] font-bold text-slate-400">Ay</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 text-center">
                <span className="text-[10px] font-black uppercase text-slate-400">Kalan Gün</span>
                <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5">{durationInfo.days}</p>
                <span className="text-[10px] font-bold text-slate-400">({durationInfo.totalDays} Toplam Gün)</span>
              </div>
            </div>
          )}

          {/* Expired Warning Banner */}
          {durationInfo.isExpired && (
            <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black">Üyelik Süreniz Sona Ermiştir</p>
                <p className="text-rose-700 text-[11px] mt-0.5">
                  İşletmeniz için tanımlı abonelik süresi {durationInfo.totalDaysPast} gün önce dolmuştur. Kesintisiz satış ve veri kaydı için üyeliğinizi hemen uzatabilirsiniz.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* SuperAdmin Exact Duration Adjuster (Kaç gün, kaç ay, kaç sene tam olacak şekilde ayarla) */}
        {isSuperAdmin && (
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  Süper Yönetici: Üyelik Süresi Ayarla & Uzat
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Kiracı: {activeTenant?.name}
              </span>
            </div>

            {/* Quick Extension Buttons */}
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-500 mb-2">
                ⚡ Hızlı Süre Ekleme Seçenekleri:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={quickExtendLoading}
                  onClick={() => handleExtendDuration(30, '1 Ay (30 Gün)')}
                  className="px-3 py-2 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded-xl text-xs font-black text-slate-700 transition-all shadow-2xs"
                >
                  +1 Ay (30 Gün)
                </button>
                <button
                  type="button"
                  disabled={quickExtendLoading}
                  onClick={() => handleExtendDuration(90, '3 Ay (90 Gün)')}
                  className="px-3 py-2 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded-xl text-xs font-black text-slate-700 transition-all shadow-2xs"
                >
                  +3 Ay (90 Gün)
                </button>
                <button
                  type="button"
                  disabled={quickExtendLoading}
                  onClick={() => handleExtendDuration(180, '6 Ay (180 Gün)')}
                  className="px-3 py-2 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded-xl text-xs font-black text-slate-700 transition-all shadow-2xs"
                >
                  +6 Ay (180 Gün)
                </button>
                <button
                  type="button"
                  disabled={quickExtendLoading}
                  onClick={() => handleExtendDuration(365, '1 Yıl (365 Gün)')}
                  className="px-3 py-2 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded-xl text-xs font-black text-slate-700 transition-all shadow-2xs"
                >
                  +1 Yıl (365 Gün)
                </button>
              </div>
            </div>

            {/* Exact Custom Duration Form (Kaç Gün + Kaç Ay + Kaç Sene Tam Olarak Ayarlama) */}
            <form onSubmit={handleCustomExtend} className="pt-3 border-t border-slate-200/80 space-y-3">
              <label className="block text-[11px] font-black uppercase text-slate-700">
                🎯 Tam Süre Belirle (Gün, Ay ve Yıl Ekle):
              </label>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Kaç Yıl:</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={customYears}
                    onChange={e => setCustomYears(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Kaç Ay:</span>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={customMonths}
                    onChange={e => setCustomMonths(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Kaç Gün:</span>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={customDays}
                    onChange={e => setCustomDays(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="30"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500 font-medium">
                  {customYears > 0 ? `${customYears} Yıl ` : ''}
                  {customMonths > 0 ? `${customMonths} Ay ` : ''}
                  {customDays > 0 ? `${customDays} Gün` : ''} mevcut bitişe eklenecek.
                </span>
                <button
                  type="submit"
                  disabled={quickExtendLoading || (customYears === 0 && customMonths === 0 && customDays === 0)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50"
                >
                  {quickExtendLoading ? 'Kaydediliyor...' : 'Tam Süreyi Uygula'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Support & Contact Box for Normal Tenants */}
        {!isSuperAdmin && (
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="font-bold text-blue-950">Abonelik Yenileme & Destek</p>
              <p className="text-blue-700 text-[11px]">
                Üyelik sürenizi uzatmak, paket yükseltmek veya ek modül açtırmak için sistem yöneticinizle iletişime geçebilirsiniz.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`https://wa.me/905382516406?text=${encodeURIComponent(`Merhaba, ${currentTenant?.name || 'Firma'} olarak abonelik ve destek hakkında bilgi almak istiyorum.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
              <a
                href="tel:+905382516406"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white font-black text-xs hover:bg-blue-700 transition-colors shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Yöneticiyi Ara (+90 538 251 64 06)</span>
              </a>
            </div>
          </div>
        )}

        {/* SuperAdmin Quick Table of All Tenants Memberships */}
        {isSuperAdmin && allTenants.length > 1 && (
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">
              Tüm Kiracıların Üyelik Süreleri Özeti
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {allTenants.map(t => {
                const rem = getRemainingDuration(t.expiresAt);
                return (
                  <div 
                    key={t.id} 
                    onClick={() => setSelectedTenantState(t.id)}
                    className={`p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedTenantState === t.id ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{t.name}</span>
                        {t.code && (
                          <span className="text-[10px] font-mono text-slate-400">[{t.code}]</span>
                        )}
                        <span className="text-[10px] uppercase font-bold text-slate-500">
                          {t.package || 'PRO'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Bitiş: {t.expiresAt ? format(parseISO(t.expiresAt), 'dd.MM.yyyy') : 'Sınırsız'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                        rem.isExpired 
                          ? 'bg-rose-100 text-rose-700' 
                          : rem.badgeColor === 'amber'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {rem.formattedText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
