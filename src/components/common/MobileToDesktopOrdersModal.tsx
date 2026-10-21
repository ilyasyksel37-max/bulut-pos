import React from 'react';
import { Smartphone, Monitor, User, Trash2, ArrowRight, X, CheckCircle2, Clock } from 'lucide-react';

export interface MobilePosOrder {
  id: string;
  cart: any[];
  customer?: any | null;
  saleMode?: 'retail' | 'customer';
  paymentMethod?: string;
  total: number;
  subtotal?: number;
  sellerName?: string;
  sellerCode?: string;
  notes?: string;
  orderType?: 'CART_TRANSFER' | 'COMPLETED_SALE';
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  createdAt?: any;
  timestampMs?: number;
  tenantId?: string;
  tenant_id?: string;
}

interface MobileToDesktopOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: MobilePosOrder[];
  onLoadIntoPOS: (order: MobilePosOrder) => void;
  onDeleteOrder: (orderId: string) => void;
}

export const MobileToDesktopOrdersModal: React.FC<MobileToDesktopOrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  onLoadIntoPOS,
  onDeleteOrder,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-700 via-blue-700 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-white">
              <Smartphone className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base leading-tight">
                  Mobilden PC Masaüstüne Gelen Satışlar
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                  {orders.length} Bekleyen
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Mobilden eklenen veya oluşturulan satışların tüm kullanıcılar için PC masaüstü ekranına aktarımı
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Orders List */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 bg-slate-50/60">
          {orders.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Monitor className="w-7 h-7" />
              </div>
              <p className="font-bold text-slate-700 text-sm">Bekleyen Mobil Satış Yok</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Personel veya kullanıcılar mobilden satış ekleyip &quot;PC Masaüstüne Gönder&quot; dediğinde anında tüm kullanıcıların PC ekranında listelenir.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const itemCount = (order.cart || []).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
              const timeStr = order.timestampMs
                ? new Date(order.timestampMs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : 'Canlı';
              return (
                <div
                  key={order.id}
                  className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-4 shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-black flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        {order.sellerCode ? `[${order.sellerCode}] ` : ''}{order.sellerName || 'Mobil Kullanıcı'}
                      </span>
                      {order.orderType === 'COMPLETED_SALE' && (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Mobilde Onaylandı
                        </span>
                      )}
                      {order.customer?.name ? (
                        <span className="px-2.5 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Cari: {order.customer.name}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold">
                          Perakende Müşteri
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {timeStr}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 line-clamp-2">
                      {(order.cart || []).map((item: any, idx: number) => (
                        <span key={idx} className="mr-2 font-medium">
                          • {item.quantity}x {item.name} ({Number(item.price || 0).toLocaleString('tr-TR')} ₺)
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-xs font-bold text-slate-500">
                        Toplam {itemCount} Adet Ürün
                      </span>
                      <span className="text-base font-black text-emerald-600 font-mono">
                        {Number(order.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDeleteOrder(order.id)}
                      className="p-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition-all cursor-pointer"
                      title="Listeden Kaldır / Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadIntoPOS(order)}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black shadow-md shadow-blue-600/20 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Monitor className="w-4 h-4" />
                      <span>PC Kasaya Aktar</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            * Bu özellik Süper Admin tarafından kiracı bazlı açılıp kapatılabilir.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
