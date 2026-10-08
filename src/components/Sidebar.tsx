import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Receipt, 
  Settings, 
  LogOut,
  Bell,
  Building2,
  MoreHorizontal,
  Plus,
  Landmark,
  Truck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingOrdersCount?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, pendingOrdersCount = 0 }) => {
  const { logout, role, user, hasPermission } = useAuth();
  const [showMobileMore, setShowMobileMore] = React.useState(false);

  const menuItems = [
    { id: 'pos', label: 'Satış', icon: ShoppingCart, roles: ['admin', 'staff', 'demo'] },
    { id: 'kasa', label: 'Kasa', icon: Landmark, roles: ['admin', 'staff', 'demo'] },
    { id: 'field_orders', label: 'Saha Siparişleri', icon: Truck, roles: ['admin', 'staff', 'demo'], badge: pendingOrdersCount },
    { id: 'inventory', label: 'Stok', icon: Package, roles: ['admin', 'staff', 'demo'] },
    { id: 'customers', label: 'Müşteriler', icon: Users, roles: ['admin', 'staff', 'demo'] },
    { id: 'suppliers', label: 'Tedarikçiler', icon: Building2, roles: ['admin', 'staff', 'demo'] },
    { id: 'dashboard', label: 'Raporlar', icon: LayoutDashboard, roles: ['admin', 'staff', 'demo'] },
    { id: 'personnel', label: 'Personel', icon: Users, roles: ['admin', 'staff', 'demo'] },
    { id: 'expenses', label: 'Giderler', icon: Receipt, roles: ['admin', 'staff', 'demo'] },
    { id: 'settings', label: 'Ayarlar', icon: Settings, roles: ['admin', 'staff', 'demo'] },
  ];

  const visibleItems = menuItems.filter(item => {
    if (!item.roles.includes(role || '')) return false;
    if (role === 'staff' && hasPermission) {
      return hasPermission(item.id as any);
    }
    return true;
  });

  const hasMoreThan4 = visibleItems.length > 4;
  const primaryItems = hasMoreThan4 ? visibleItems.slice(0, 4) : visibleItems;
  const moreItems = hasMoreThan4 ? visibleItems.slice(4) : [];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-300 flex-col h-screen sticky top-0 z-50">
        <div className="p-6 border-b border-slate-800/50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-900/20 rotate-3 group">
              <ShoppingCart className="w-8 h-8 transition-transform group-hover:scale-110" />
            </div>
            <div className="text-center">
              <h1 className="text-lg font-black text-white tracking-tight leading-none uppercase">POS & STOK</h1>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">Bulut Yönetim Paneli</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                activeTab === item.id 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                  : "hover:bg-slate-800 hover:text-white"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <item.icon className={cn("w-5 h-5 shrink-0", activeTab === item.id ? "" : "text-slate-500 group-hover:text-blue-400")} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={cn(
                  "px-2 py-0.5 text-[10px] font-black rounded-full shrink-0 animate-pulse",
                  activeTab === item.id ? "bg-white text-blue-700" : "bg-amber-500 text-white"
                )}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-black text-white shadow-sm">
              {user?.email?.substring(0, 2).toUpperCase() || 'E'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate leading-none">
                {user?.displayName || (role === 'admin' ? 'Yönetici' : role === 'demo' ? 'Demo Girişi' : 'Personel')}
              </p>
              <p className="text-[10px] text-slate-500 truncate uppercase tracking-tighter mt-1">
                {role === 'admin' ? 'Tam Yetkili' : role === 'demo' ? 'Sadece İnceleme (Salt Okunur)' : 'Sınırlı Yetki'}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sistemden Çıkış
          </button>
          
          <div className="mt-4 pt-4 border-t border-slate-800/50 text-center">
            <p className="text-[10px] text-slate-600 font-bold tracking-widest uppercase">
              by ilyasyksel
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-safe shadow-[0_-1px_15px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-around h-16 px-2">
          {primaryItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setShowMobileMore(false);
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all",
                activeTab === item.id && !showMobileMore
                  ? "text-blue-600" 
                  : "text-slate-400"
              )}
            >
              <div className="relative">
                <item.icon className={cn("w-5 h-5", activeTab === item.id && !showMobileMore ? "fill-blue-600/10" : "")} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 text-[9px] font-black rounded-full bg-amber-500 text-white animate-pulse">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter">{item.label}</span>
              {activeTab === item.id && !showMobileMore && (
                <div className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-full"></div>
              )}
            </button>
          ))}
          
          {hasMoreThan4 && (
            <button
              onClick={() => setShowMobileMore(!showMobileMore)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 w-full h-full transition-all",
                showMobileMore ? "text-blue-600" : "text-slate-400"
              )}
            >
              <div className="relative">
                <MoreHorizontal className="w-5 h-5" />
                {moreItems.some(i => (i.badge || 0) > 0) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                )}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter">Diğer</span>
              {showMobileMore && (
                <div className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-full"></div>
              )}
            </button>
          )}
        </div>

        {/* Mobile More Menu Popover */}
        {hasMoreThan4 && showMobileMore && (
          <div className="absolute bottom-16 right-4 left-4 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 grid grid-cols-2 gap-2 animate-in slide-in-from-bottom-2 duration-200">
            {moreItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setShowMobileMore(false);
                }}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all",
                  activeTab === item.id
                    ? "bg-blue-600 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-amber-500 text-white animate-pulse shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </nav>
    </>
  );
};

export default Sidebar;
