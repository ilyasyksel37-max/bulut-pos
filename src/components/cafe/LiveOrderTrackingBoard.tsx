import React, { useState, useMemo } from 'react';
import {
  ChefHat,
  Bell,
  CheckCircle2,
  Clock,
  Printer,
  Search,
  Filter,
  Check,
  Flame,
  Utensils,
  Volume2,
  VolumeX,
  Sparkles,
  Archive,
  RefreshCw,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

export interface KitchenOrderData {
  id: string;
  tableName: string;
  area?: string;
  waiter?: string;
  time?: string;
  status: 'pending' | 'preparing' | 'ready' | 'delivered';
  items: Array<{
    name: string;
    qty?: number;
    quantity?: number;
    portion?: string;
    notes?: string;
  }>;
  tenantId?: string;
  createdAt?: any;
  updatedAt?: any;
  readyTime?: string;
  deliveredTime?: string;
  deliveredBy?: string;
}

interface LiveOrderTrackingBoardProps {
  orders: KitchenOrderData[];
  mode: 'kitchen' | 'waiter';
  onUpdateStatus: (orderId: string, newStatus: 'pending' | 'preparing' | 'ready' | 'delivered' | 'completed') => void;
  onPrintTicket: (order: KitchenOrderData) => void;
  currentWaiterName?: string;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  showToast?: (msg: string) => void;
}

export const LiveOrderTrackingBoard: React.FC<LiveOrderTrackingBoardProps> = ({
  orders,
  mode,
  onUpdateStatus,
  onPrintTicket,
  currentWaiterName = '',
  soundEnabled = true,
  onToggleSound,
  showToast
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'preparing' | 'ready' | 'delivered'>('all');
  const [waiterFilter, setWaiterFilter] = useState<'all' | 'mine'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Counts by status
  const counts = useMemo(() => {
    return {
      all: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      preparing: orders.filter(o => o.status === 'preparing').length,
      ready: orders.filter(o => o.status === 'ready').length,
      delivered: orders.filter(o => o.status === 'delivered').length
    };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;

      // Waiter filter (only relevant for waiter mode)
      if (mode === 'waiter' && waiterFilter === 'mine' && currentWaiterName) {
        if (!order.waiter || !order.waiter.toLowerCase().includes(currentWaiterName.toLowerCase())) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTable = order.tableName?.toLowerCase().includes(term);
        const matchArea = order.area?.toLowerCase().includes(term);
        const matchWaiter = order.waiter?.toLowerCase().includes(term);
        const matchItem = order.items?.some(it => it.name.toLowerCase().includes(term));
        if (!matchTable && !matchArea && !matchWaiter && !matchItem) return false;
      }

      return true;
    }).sort((a, b) => {
      // Ready first, then preparing, then pending, then delivered
      const priority: Record<string, number> = { ready: 1, preparing: 2, pending: 3, delivered: 4 };
      const pA = priority[a.status] || 99;
      const pB = priority[b.status] || 99;
      return pA - pB;
    });
  }, [orders, statusFilter, waiterFilter, searchTerm, mode, currentWaiterName]);

  const handleDeliver = (order: KitchenOrderData) => {
    onUpdateStatus(order.id, 'delivered');
    if (showToast) {
      showToast(`✅ ${order.tableName} siparişi masaya teslim edildi!`);
    }
  };

  const handleArchive = (order: KitchenOrderData) => {
    onUpdateStatus(order.id, 'completed');
    if (showToast) {
      showToast(`📦 ${order.tableName} siparişi arşivlendi.`);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Top Banner and Quick Metrics */}
      <div className={cn(
        "rounded-3xl p-5 sm:p-6 text-white shadow-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4",
        mode === 'kitchen' 
          ? "bg-gradient-to-r from-amber-900 via-orange-950 to-slate-900 border-amber-800"
          : "bg-gradient-to-r from-indigo-900 via-slate-900 to-emerald-950 border-indigo-800"
      )}>
        <div className="flex items-center gap-3.5">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg",
            mode === 'kitchen' ? "bg-amber-600" : "bg-emerald-600"
          )}>
            {mode === 'kitchen' ? <ChefHat className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider">
                {mode === 'kitchen' ? 'Mutfak KDS Paneli' : 'Garson Canlı Sipariş Paneli'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Canlı Senkronize
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mt-0.5">
              {mode === 'kitchen'
                ? 'Mutfak Canlı Sipariş Hazırlama & Takip Ekranı'
                : 'Garson Masaya Servis & Canlı Sipariş Takip Kartları'}
            </h3>
            <p className="text-xs text-white/80">
              {mode === 'kitchen'
                ? 'Ocağa alınan, pişirilen ve garsona servise hazır edilen tüm masaların canlı takibi.'
                : 'Mutfakta hazırlanan, servise hazır edilen ve masaya teslim edilen tüm siparişler anlık güncellenir.'}
            </p>
          </div>
        </div>

        {/* Action Controls in Banner */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {onToggleSound && (
            <button
              type="button"
              onClick={onToggleSound}
              className={cn(
                "px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm",
                soundEnabled
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              )}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>{soundEnabled ? 'Ses Açık' : 'Ses Kapalı'}</span>
            </button>
          )}

          {counts.ready > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black flex items-center gap-2 animate-bounce shadow-lg">
              <Bell className="w-4 h-4" />
              <span>{counts.ready} Masa Servis Bekliyor!</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Status Counter Tabs */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
                statusFilter === 'all'
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <span>Tümü</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                {counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('preparing')}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
                statusFilter === 'preparing'
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-amber-700"
              )}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Hazırlanıyor</span>
              {counts.preparing > 0 && (
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                  statusFilter === 'preparing' ? "bg-white text-amber-900 font-bold" : "bg-amber-100 text-amber-800"
                )}>
                  {counts.preparing}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('ready')}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer relative",
                statusFilter === 'ready'
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-emerald-700"
              )}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Servise Hazır</span>
              {counts.ready > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white font-black animate-pulse">
                  {counts.ready}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('delivered')}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer",
                statusFilter === 'delivered'
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-blue-700"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Teslim Edildi</span>
              {counts.delivered > 0 && (
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                  statusFilter === 'delivered' ? "bg-white text-blue-900 font-bold" : "bg-blue-100 text-blue-800"
                )}>
                  {counts.delivered}
                </span>
              )}
            </button>
          </div>

          {/* Waiter specific toggle */}
          {mode === 'waiter' && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl text-xs">
              <button
                type="button"
                onClick={() => setWaiterFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer",
                  waiterFilter === 'all' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Tüm Garsonlar
              </button>
              <button
                type="button"
                onClick={() => setWaiterFilter('mine')}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1",
                  waiterFilter === 'mine' ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Benim Masalarım</span>
              </button>
            </div>
          )}

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Masa veya ürün ara..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            {mode === 'kitchen' ? <ChefHat className="w-8 h-8" /> : <Bell className="w-8 h-8" />}
          </div>
          <h4 className="text-base font-black text-slate-800">
            {statusFilter === 'all'
              ? 'Şu an aktif takipte sipariş bulunmuyor.'
              : `"${statusFilter.toUpperCase()}" durumunda sipariş bulunmuyor.`}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Yeni bir masa siparişi verildiğinde burada canlı olarak belirecektir.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => {
            const isPending = order.status === 'pending';
            const isPreparing = order.status === 'preparing';
            const isReady = order.status === 'ready';
            const isDelivered = order.status === 'delivered';

            return (
              <div
                key={order.id}
                className={cn(
                  "bg-white rounded-3xl border-2 shadow-lg overflow-hidden flex flex-col justify-between transition-all duration-200 relative",
                  isReady
                    ? "border-emerald-500 ring-4 ring-emerald-500/20 shadow-emerald-500/10"
                    : isPreparing
                    ? "border-amber-500 ring-2 ring-amber-500/10"
                    : isDelivered
                    ? "border-blue-400 bg-slate-50/50 opacity-95"
                    : "border-rose-400"
                )}
              >
                {/* Card Header with Status Badge */}
                <div
                  className={cn(
                    "p-4 text-white flex justify-between items-center transition-colors",
                    isReady
                      ? "bg-gradient-to-r from-emerald-600 to-teal-700"
                      : isPreparing
                      ? "bg-gradient-to-r from-amber-600 to-orange-600"
                      : isDelivered
                      ? "bg-gradient-to-r from-blue-700 to-indigo-800"
                      : "bg-gradient-to-r from-rose-600 to-red-700"
                  )}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-base tracking-tight">{order.tableName}</h4>
                      {order.area && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/25 font-bold uppercase">
                          {order.area}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/90 flex items-center gap-1.5">
                      <span>Garson: <strong>{order.waiter || 'Garson'}</strong></span>
                    </p>
                  </div>

                  <div className="text-right space-y-1">
                    <span className="font-mono text-xs font-black bg-black/25 px-2.5 py-1 rounded-xl inline-block">
                      {order.time || '12:00'}
                    </span>
                    {/* Status Pill on top-right */}
                    <div>
                      {isReady && (
                        <span className="px-2 py-0.5 rounded-full bg-white text-emerald-900 text-[10px] font-black uppercase flex items-center gap-1 animate-pulse">
                          <Bell className="w-3 h-3" />
                          <span>Servise Hazır</span>
                        </span>
                      )}
                      {isPreparing && (
                        <span className="px-2 py-0.5 rounded-full bg-white/30 text-white text-[10px] font-black uppercase flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-200" />
                          <span>Hazırlanıyor</span>
                        </span>
                      )}
                      {isDelivered && (
                        <span className="px-2 py-0.5 rounded-full bg-white/30 text-white text-[10px] font-black uppercase flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-300" />
                          <span>Teslim Edildi</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="px-2 py-0.5 rounded-full bg-white/30 text-white text-[10px] font-black uppercase flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Bekliyor</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Notice Strip */}
                {isReady && (
                  <div className="bg-emerald-100 border-b border-emerald-200 px-4 py-2 flex items-center justify-between text-xs font-black text-emerald-900">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping shrink-0" />
                      <span>🔔 Mutfak çıkardı! Masaya servis edilmeyi bekliyor</span>
                    </div>
                    {order.readyTime && (
                      <span className="font-mono text-[11px] bg-emerald-200 px-2 py-0.5 rounded-md text-emerald-800">
                        {order.readyTime}
                      </span>
                    )}
                  </div>
                )}

                {isDelivered && (
                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between text-xs font-bold text-blue-900">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Masaya servis edildi</span>
                    </div>
                    {order.deliveredTime && (
                      <span className="font-mono text-[11px] bg-blue-100 px-2 py-0.5 rounded-md text-blue-800">
                        Teslim: {order.deliveredTime}
                      </span>
                    )}
                  </div>
                )}

                {/* Items List */}
                <div className="p-4 sm:p-5 space-y-3 flex-1">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <span>Sipariş Edilen Ürünler:</span>
                    <span>{order.items?.length || 0} Kalem</span>
                  </div>

                  <div className="space-y-2">
                    {order.items?.map((it, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "p-2.5 rounded-2xl border text-xs flex justify-between items-start",
                          isReady ? "bg-emerald-50/60 border-emerald-200" : "bg-slate-50 border-slate-200"
                        )}
                      >
                        <div>
                          <p className="font-black text-slate-900 uppercase">
                            <span className="text-orange-600 font-mono text-sm mr-1.5">
                              {it.qty || it.quantity || 1}x
                            </span>
                            {it.name}
                            {it.portion && it.portion !== 'Standart' && (
                              <span className="text-slate-500 font-bold ml-1 text-[11px]">
                                ({it.portion})
                              </span>
                            )}
                          </p>
                          {it.notes && (
                            <div className="mt-1 bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                              ⚠️ Not: {it.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2">
                  {/* Fiş Yazdır Butonu (Her zaman erişilebilir) */}
                  <button
                    type="button"
                    onClick={() => onPrintTicket(order)}
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Mutfak Fişi Yazdır"
                  >
                    <Printer className="w-4 h-4" />
                    <span className="hidden sm:inline">Fiş Yazdır</span>
                  </button>

                  {/* Mode-specific and status-specific workflow actions */}
                  {mode === 'waiter' ? (
                    /* GARSON WORKFLOW ACTIONS */
                    <>
                      {isReady && (
                        <button
                          type="button"
                          onClick={() => handleDeliver(order)}
                          className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 animate-pulse"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>🍽️ Masaya Teslim Et</span>
                        </button>
                      )}

                      {isPreparing && (
                        <div className="flex-1 text-center py-2 px-3 bg-amber-100 text-amber-900 font-black text-xs rounded-xl border border-amber-200 flex items-center justify-center gap-1.5">
                          <Flame className="w-4 h-4 text-amber-600 animate-spin" />
                          <span>Mutfakta Hazırlanıyor...</span>
                        </div>
                      )}

                      {isPending && (
                        <div className="flex-1 text-center py-2 px-3 bg-rose-100 text-rose-900 font-black text-xs rounded-xl border border-rose-200 flex items-center justify-center gap-1.5">
                          <Clock className="w-4 h-4 text-rose-600" />
                          <span>Sıraya Alındı (Bekliyor)</span>
                        </div>
                      )}

                      {isDelivered && (
                        <div className="flex-1 flex items-center gap-2">
                          <span className="flex-1 text-center py-2 px-2 bg-blue-100 text-blue-800 font-black text-xs rounded-xl border border-blue-200 flex items-center justify-center gap-1">
                            <Check className="w-3.5 h-3.5 text-blue-600" />
                            <span>Teslim Edildi</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleArchive(order)}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                            title="Ekrandan Kaldır / Arşivle"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    /* MUTFAK (KDS) WORKFLOW ACTIONS */
                    <>
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(order.id, 'preparing')}
                            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                          >
                            <Flame className="w-4 h-4" />
                            <span>Hazırlanıyor</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(order.id, 'ready')}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Servise Hazır</span>
                          </button>
                        </>
                      )}

                      {isPreparing && (
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(order.id, 'ready')}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>✅ Servise Hazır / Garsona Bildir</span>
                        </button>
                      )}

                      {isReady && (
                        <div className="flex-1 flex gap-2 items-center">
                          <span className="flex-1 text-center py-2 px-2 bg-emerald-100 text-emerald-800 font-black text-xs rounded-xl border border-emerald-300 flex items-center justify-center gap-1">
                            <Bell className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                            <span>Garson Bekleniyor</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeliver(order)}
                            className="py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1"
                            title="Doğrudan Masaya Verildi Olarak İşaretle"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Verildi</span>
                          </button>
                        </div>
                      )}

                      {isDelivered && (
                        <div className="flex-1 flex items-center gap-2">
                          <span className="flex-1 text-center py-2 px-2 bg-blue-100 text-blue-800 font-black text-xs rounded-xl border border-blue-200 flex items-center justify-center gap-1">
                            <Check className="w-3.5 h-3.5 text-blue-600" />
                            <span>Masaya Teslim Edildi</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleArchive(order)}
                            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl transition-all cursor-pointer"
                            title="Kapat / Arşivle"
                          >
                            Kapat
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
