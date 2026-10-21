import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Utensils, ChefHat, Coffee, Users, Clock, CheckCircle2, AlertTriangle, 
  Plus, Trash2, ShoppingCart, RefreshCw, Layers, ChevronRight, Bookmark, 
  ArrowRight, Eye, Check, AlertCircle, Sliders, Box, ShieldAlert, Edit2, 
  Coins, DollarSign, Save, X, Printer, Receipt, Bell, Move, Armchair, 
  CreditCard, Banknote, Split, Sparkles, Filter, Volume2, VolumeX
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { CafePrinterSettings } from './cafe/CafePrinterSettings';
import { LiveOrderTrackingBoard } from './cafe/LiveOrderTrackingBoard';
import {
  loadCafePrinterSettings,
  buildCafeBillHtml,
  buildCafeKitchenOrderHtml,
  buildCafePaymentReceiptHtml,
  printCafeHtml,
  CafePrinterConfig,
  DEFAULT_CAFE_PRINTER_CONFIG
} from '../lib/cafe-printer';

// Web Audio API chime generator for Kitchen Ready Alert (Zero external assets needed)
export const playOrderReadySound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    
    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2: 739.99 Hz (F#5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(739.99, now + 0.15);
    gain2.gain.setValueAtTime(0.4, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.5);

    // Tone 3: 880.00 Hz (A5)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(880.00, now + 0.3);
    gain3.gain.setValueAtTime(0.45, now + 0.3);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.3);
    osc3.stop(now + 0.8);

    // Tone 4: 1174.66 Hz (D6 - Crisp High Bell)
    const osc4 = ctx.createOscillator();
    const gain4 = ctx.createGain();
    osc4.type = 'triangle';
    osc4.frequency.setValueAtTime(1174.66, now + 0.45);
    gain4.gain.setValueAtTime(0.35, now + 0.45);
    gain4.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc4.connect(gain4);
    gain4.connect(ctx.destination);
    osc4.start(now + 0.45);
    osc4.stop(now + 1.2);
  } catch (e) {
    console.error("Audio chime error:", e);
  }
};

interface CafeRestaurantModuleProps {
  showToast: (msg: string) => void;
}

export const CafeRestaurantModule: React.FC<CafeRestaurantModuleProps> = ({ showToast }) => {
  const { currentTenant, tenantId, tenantName, user, isSuperAdmin } = useAuth();
  
  // Strict Role & Permission detection from user and AuthContext
  const realUserRole = useMemo(() => {
    if (user?.role === 'admin' || isSuperAdmin) return 'admin';
    if (user?.permissions?.isMutfak || user?.cafeRole === 'mutfak') return 'mutfak';
    if (user?.permissions?.isGarson || user?.cafeRole === 'garson') return 'garson';
    if (user?.permissions?.kasa || user?.staffType === 'store' || user?.cafeRole === 'kasiyer') return 'kasiyer';
    if (user?.role === 'staff') return 'kasiyer';
    return 'garson';
  }, [user, isSuperAdmin]);

  const [userRole, setUserRole] = useState<'admin' | 'kasiyer' | 'garson' | 'mutfak'>(() => realUserRole);

  // Active sub-tab inside Cafe & Restaurant module: 'tables' | 'kds' | 'live_orders' | 'menu' | 'reports' | 'printer'
  const [activeSubTab, setActiveSubTab] = useState<'tables' | 'kds' | 'live_orders' | 'menu' | 'reports' | 'printer'>(() => {
    if (realUserRole === 'mutfak') return 'kds';
    if (realUserRole === 'garson') return 'tables';
    if (realUserRole === 'kasiyer') return 'tables';
    return 'tables';
  });

  // Real-time synced Cafe & Restaurant Printer Settings
  const [cafePrinterConfig, setCafePrinterConfig] = useState<CafePrinterConfig>(() => loadCafePrinterSettings(tenantId));

  useEffect(() => {
    const docRef = doc(db, 'cafe_printer_settings', tenantId || 'default');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data() as Partial<CafePrinterConfig>;
        setCafePrinterConfig(prev => ({ ...DEFAULT_CAFE_PRINTER_CONFIG, ...prev, ...cloudData }));
      }
    }, (err) => console.warn('Cafe printer sync notice:', err));
    return () => unsub();
  }, [tenantId]);

  // Enforce strict code-level constraints whenever user profile updates
  useEffect(() => {
    setUserRole(realUserRole);
    if (realUserRole === 'mutfak') {
      setActiveSubTab('kds');
    } else if (realUserRole === 'garson') {
      setActiveSubTab('tables');
    } else if (realUserRole === 'kasiyer') {
      if (activeSubTab !== 'tables' && activeSubTab !== 'live_orders') {
        setActiveSubTab('tables');
      }
    }
  }, [realUserRole]);

  // In-app floating toast state
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const displayToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMsg(null);
    }, 4500);
    if (showToast) {
      try { showToast(msg); } catch (e) {}
    }
  };

  const handleRoleChange = (role: 'admin' | 'kasiyer' | 'garson' | 'mutfak') => {
    setUserRole(role);
    localStorage.setItem('cafe_user_role', role);
    if (role === 'garson') setActiveSubTab('tables');
    if (role === 'mutfak') setActiveSubTab('kds');
    displayToast(`Rol değiştirildi: ${role.toUpperCase()}`);
  };

  // Tables & Areas state with Firestore persistence
  const [selectedArea, setSelectedArea] = useState<string>('Salon');
  const [areas, setAreas] = useState<string[]>(['Salon', 'Teras', 'Bahçe', 'VIP Salon']);
  const [tables, setTables] = useState<any[]>([]);

  // Area Management Modal state
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [newAreaInput, setNewAreaInput] = useState('');
  const [editingAreaName, setEditingAreaName] = useState<{ oldName: string; newName: string } | null>(null);

  // Table Reservation Modal state
  const [reservationModalTable, setReservationModalTable] = useState<any | null>(null);
  const [reservationNoteInput, setReservationNoteInput] = useState('');

  // Firestore Realtime Sync: Areas (cafe_settings)
  useEffect(() => {
    const settingsDocRef = doc(db, 'cafe_settings', tenantId || 'default');
    const unsubscribe = onSnapshot(settingsDocRef, (snap) => {
      if (snap.exists() && snap.data()?.areas && Array.isArray(snap.data().areas) && snap.data().areas.length > 0) {
        setAreas(snap.data().areas);
      } else {
        setDoc(settingsDocRef, {
          areas: ['Salon', 'Teras', 'Bahçe', 'VIP Salon'],
          tenantId: tenantId || 'default',
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
    });
    return () => unsubscribe();
  }, [tenantId]);

  // Selected Table for Bill / Order Modal
  const [activeTable, setActiveTable] = useState<any | null>(null);

  // Menu items for restaurant with Firestore persistence
  const [menuCategories, setMenuCategories] = useState<string[]>(['Tümü', 'Ana Yemekler', 'Izgaralar', 'Atıştırmalıklar', 'İçecekler', 'Tatlılar']);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [menuItems, setMenuItems] = useState<any[]>([]);

  // Menu item modal state for Add/Edit
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<any | null>(null);
  const [menuForm, setMenuForm] = useState({ name: '', category: 'Izgaralar', price: 100, portionsStr: 'Tek, Duble' });

  // Closed Sales / Adisyon Raporları state
  const [closedSales, setClosedSales] = useState<any[]>([]);

  // Firestore Realtime Sync: Tables with auto-seeding
  useEffect(() => {
    const q = tenantId ? query(collection(db, 'cafe_tables'), where('tenantId', '==', tenantId)) : collection(db, 'cafe_tables');
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        const defaultTables = [
          { name: 'Masa 1', area: 'Salon', status: 'empty', capacity: 4, bill: null, tenantId: tenantId || 'default' },
          { name: 'Masa 2', area: 'Salon', status: 'empty', capacity: 4, bill: null, tenantId: tenantId || 'default' },
          { name: 'Masa 3', area: 'Salon', status: 'empty', capacity: 6, bill: null, tenantId: tenantId || 'default' },
          { name: 'Masa 4', area: 'Salon', status: 'empty', capacity: 2, bill: null, tenantId: tenantId || 'default' },
          { name: 'Teras 1', area: 'Teras', status: 'empty', capacity: 4, bill: null, tenantId: tenantId || 'default' },
          { name: 'Teras 2', area: 'Teras', status: 'empty', capacity: 4, bill: null, tenantId: tenantId || 'default' },
          { name: 'Bahçe 1', area: 'Bahçe', status: 'empty', capacity: 8, bill: null, tenantId: tenantId || 'default' },
          { name: 'VIP 1', area: 'VIP Salon', status: 'empty', capacity: 10, bill: null, tenantId: tenantId || 'default' },
        ];
        try {
          for (const dt of defaultTables) {
            await addDoc(collection(db, 'cafe_tables'), dt);
          }
        } catch (e) {
          console.error("Error seeding default tables:", e);
        }
      } else {
        setTables(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    });
    return () => unsubscribe();
  }, [tenantId]);

  // Firestore Realtime Sync: Menu Items with auto-seeding
  useEffect(() => {
    const q = tenantId ? query(collection(db, 'cafe_menu'), where('tenantId', '==', tenantId)) : collection(db, 'cafe_menu');
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        const defaultMenu = [
          { name: 'Adana Kebap', category: 'Izgaralar', price: 280, portions: ['Tek', 'Duble'], tenantId: tenantId || 'default' },
          { name: 'Urfa Kebap', category: 'Izgaralar', price: 270, portions: ['Tek', 'Duble'], tenantId: tenantId || 'default' },
          { name: 'Kavurma', category: 'Ana Yemekler', price: 320, portions: ['Standart'], tenantId: tenantId || 'default' },
          { name: 'Mercimek Çorbası', category: 'Atıştırmalıklar', price: 90, portions: ['Kase'], tenantId: tenantId || 'default' },
          { name: 'Ayran (Büyük)', category: 'İçecekler', price: 40, portions: ['Büyük', 'Küçük'], tenantId: tenantId || 'default' },
          { name: 'Künefe', category: 'Tatlılar', price: 180, portions: ['Standart', 'Özel'], tenantId: tenantId || 'default' }
        ];
        try {
          for (const dm of defaultMenu) {
            await addDoc(collection(db, 'cafe_menu'), dm);
          }
        } catch (e) {
          console.error("Error seeding default menu:", e);
        }
      } else {
        setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    });
    return () => unsubscribe();
  }, [tenantId]);

  // Firestore Realtime Sync: Closed Sales / Reports
  useEffect(() => {
    const q = tenantId ? query(collection(db, 'sales'), where('tenantId', '==', tenantId)) : collection(db, 'sales');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClosedSales(list.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
    });
    return () => unsubscribe();
  }, [tenantId]);

  // Sound and notification settings
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('cafe_sound_enabled') !== 'false';
  });
  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('cafe_sound_enabled', String(next));
      showToast(next ? "🔔 Sesli uyarılar açıldı." : "🔇 Sesli uyarılar sessize alındı.");
      return next;
    });
  };

  // Active popup / alert for ready orders from kitchen (YALNIZCA Garson ekranı için)
  const [activeReadyAlert, setActiveReadyAlert] = useState<{
    id: string;
    tableName: string;
    area?: string;
    waiter?: string;
    items?: any[];
    time?: string;
  } | null>(null);

  // Ref to track known ready order IDs and latest user role
  const knownReadyIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const userRoleRef = useRef(userRole);
  userRoleRef.current = userRole;
  const activeSubTabRef = useRef(activeSubTab);
  activeSubTabRef.current = activeSubTab;

  // Clear ready alert immediately if kitchen screen or role is active
  useEffect(() => {
    if (userRole === 'mutfak' || activeSubTab === 'kds') {
      setActiveReadyAlert(null);
    }
  }, [userRole, activeSubTab]);

  // Firestore Realtime Sync: Kitchen Orders (KDS) & Waiter Alert
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);
  useEffect(() => {
    const q = tenantId ? query(collection(db, 'cafe_kitchen_orders'), where('tenantId', '==', tenantId)) : collection(db, 'cafe_kitchen_orders');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setKitchenOrders(list);

      const currentReadyOrders: any[] = list.filter((o: any) => o.status === 'ready');
      const currentReadyIds = new Set(currentReadyOrders.map((o: any) => o.id));

      if (isFirstLoadRef.current) {
        // First snapshot: register existing ready orders silently without blocking the screen
        knownReadyIdsRef.current = currentReadyIds;
        isFirstLoadRef.current = false;
      } else {
        // Subsequent snapshots: find newly ready orders
        const newlyReady: any[] = currentReadyOrders.filter((o: any) => !knownReadyIdsRef.current.has(o.id));
        if (newlyReady.length > 0) {
          const newest = newlyReady[newlyReady.length - 1];
          const currentRole = userRoleRef.current;
          const currentTab = activeSubTabRef.current;

          // UYARI SADECE GARSONA GİTSİN! Mutfakta sayfa düzenini bozmasın ve mutfak personeline çalmasın.
          const isTargetWaiter = currentRole === 'garson' || (currentRole === 'admin' && currentTab !== 'kds');

          if (isTargetWaiter) {
            setActiveReadyAlert(newest as any);

            // Play Audio chime for waiter
            if (soundEnabled) {
              playOrderReadySound();
            }

            // Vibrate on mobile
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) {}
            }

            displayToast(`🔔 ${(newest as any).tableName} siparişi mutfakta HAZIR! Lütfen servise çıkarın.`);
          }
        }
        knownReadyIdsRef.current = currentReadyIds;
      }
    });
    return () => unsubscribe();
  }, [tenantId, soundEnabled]);

  // Deliver order to table (Waitstaff marks served -> status 'delivered')
  const handleDeliverOrder = async (orderId: string, tableName: string) => {
    try {
      await updateDoc(doc(db, 'cafe_kitchen_orders', orderId), {
        status: 'delivered',
        deliveredTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        deliveredAt: serverTimestamp(),
        deliveredBy: user?.displayName || user?.username || 'Garson'
      });
      if (activeReadyAlert?.id === orderId) {
        setActiveReadyAlert(null);
      }
      showToast(`✅ ${tableName} siparişi masaya servis edildi ve 'Teslim Edildi' olarak kaydedildi.`);
    } catch (err: any) {
      console.error(err);
      alert("Hata: " + err.message);
    }
  };

  // New Table Modal
  const [isNewTableModalOpen, setIsNewTableModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableArea, setNewTableArea] = useState('Salon');
  const [newTableCapacity, setNewTableCapacity] = useState('4');

  // Add Table to Firestore
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    try {
      await addDoc(collection(db, 'cafe_tables'), {
        name: newTableName.trim(),
        area: newTableArea,
        status: 'empty',
        capacity: parseInt(newTableCapacity, 10) || 4,
        bill: null,
        tenantId: tenantId || 'default'
      });
      setIsNewTableModalOpen(false);
      setNewTableName('');
      showToast(`✅ Masa başarıyla Firestore'a kaydedildi: ${newTableName.trim()}`);
    } catch (err: any) {
      console.error(err);
      alert("Masa kaydedilirken hata: " + err.message);
    }
  };

  // Menu Item Add / Edit / Delete handlers
  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuForm.name.trim()) return;
    const portions = menuForm.portionsStr.split(',').map(s => s.trim()).filter(Boolean);
    const data = {
      name: menuForm.name.trim(),
      category: menuForm.category,
      price: Number(menuForm.price) || 0,
      portions,
      tenantId: tenantId || 'default'
    };
    try {
      if (editingMenuItem) {
        await updateDoc(doc(db, 'cafe_menu', editingMenuItem.id), data);
        showToast(`✅ Menü ürünü güncellendi: ${data.name}`);
      } else {
        await addDoc(collection(db, 'cafe_menu'), data);
        showToast(`✅ Yeni menü ürünü eklendi: ${data.name}`);
      }
      setIsMenuModalOpen(false);
      setEditingMenuItem(null);
      setMenuForm({ name: '', category: 'Izgaralar', price: 100, portionsStr: 'Tek, Duble' });
    } catch (err: any) {
      console.error(err);
      alert("Ürün kaydedilirken hata: " + err.message);
    }
  };

  const handleDeleteMenuItem = async (id: string) => {
    if (!confirm("Bu ürünü menüden kalıcı olarak silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, 'cafe_menu', id));
      showToast("🗑️ Ürün menüden silindi.");
    } catch (err: any) {
      console.error(err);
      alert("Silinirken hata: " + err.message);
    }
  };

  // Table Reservation Handler
  const handleToggleReservation = async (table: any, isReserved: boolean, note?: string) => {
    try {
      if (!table.id) return;
      const updatedStatus = isReserved ? 'reserved' : 'empty';
      const updatedNote = isReserved ? (note || 'Rezerve Masa') : null;

      // Update local state immediately
      setTables(prev => prev.map(t => t.id === table.id ? {
        ...t,
        status: updatedStatus,
        reservedFor: updatedNote
      } : t));

      if (isReserved) {
        await updateDoc(doc(db, 'cafe_tables', table.id), {
          status: 'reserved',
          reservedFor: updatedNote
        });
        displayToast(`📌 ${table.name} rezerve edildi.`);
      } else {
        await updateDoc(doc(db, 'cafe_tables', table.id), {
          status: 'empty',
          reservedFor: null
        });
        displayToast(`✅ ${table.name} rezervasyonu kaldırıldı, masa boş.`);
      }

      setActiveTable((prev: any) => prev && prev.id === table.id ? {
        ...prev,
        status: updatedStatus,
        reservedFor: updatedNote
      } : prev);
      setReservationModalTable(null);
    } catch (err: any) {
      console.error(err);
      alert("Rezervasyon güncellenirken hata: " + err.message);
    }
  };

  // Area Rename Handler
  const handleRenameArea = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) {
      setEditingAreaName(null);
      return;
    }
    const cleanNew = newName.trim();
    const updatedAreas = areas.map(a => a === oldName ? cleanNew : a);
    
    // Update local state immediately
    setAreas(updatedAreas);
    if (selectedArea === oldName) {
      setSelectedArea(cleanNew);
    }
    setEditingAreaName(null);

    try {
      await setDoc(doc(db, 'cafe_settings', tenantId || 'default'), {
        areas: updatedAreas,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Update all tables in that area in Firestore & local state
      const tablesInArea = tables.filter(t => t.area === oldName);
      setTables(prev => prev.map(t => t.area === oldName ? { ...t, area: cleanNew } : t));

      for (const t of tablesInArea) {
        if (t.id) {
          await updateDoc(doc(db, 'cafe_tables', t.id), { area: cleanNew });
        }
      }

      displayToast(`✅ Bölüm adı güncellendi: "${oldName}" → "${cleanNew}"`);
    } catch (err: any) {
      console.error(err);
      alert("Bölüm adı değiştirilirken hata: " + err.message);
    }
  };

  // Area Add Handler
  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaInput.trim()) return;
    const cleanName = newAreaInput.trim();
    if (areas.includes(cleanName)) {
      displayToast(`⚠️ "${cleanName}" bölümü zaten mevcut.`);
      return;
    }
    const updatedAreas = [...areas, cleanName];
    setAreas(updatedAreas);
    setSelectedArea(cleanName);
    setNewAreaInput('');

    try {
      await setDoc(doc(db, 'cafe_settings', tenantId || 'default'), {
        areas: updatedAreas,
        updatedAt: serverTimestamp()
      }, { merge: true });
      displayToast(`✅ Yeni bölüm eklendi: "${cleanName}"`);
    } catch (err: any) {
      console.error(err);
      alert("Bölüm eklenirken hata: " + err.message);
    }
  };

  // Area Delete Handler
  const handleDeleteArea = async (areaToDelete: string) => {
    if (areas.length <= 1) {
      displayToast("⚠️ En az bir bölüm bulunmalıdır.");
      return;
    }
    const countTables = tables.filter(t => t.area === areaToDelete).length;
    if (countTables > 0) {
      if (!confirm(`Bu bölümde ${countTables} adet masa bulunuyor. Bölüm silinirse masalar başka bölüme aktarılacaktır. Devam etmek istiyor musunuz?`)) {
        return;
      }
    }
    const updatedAreas = areas.filter(a => a !== areaToDelete);
    const fallbackArea = updatedAreas[0];

    setAreas(updatedAreas);
    if (selectedArea === areaToDelete) {
      setSelectedArea(fallbackArea);
    }

    try {
      await setDoc(doc(db, 'cafe_settings', tenantId || 'default'), {
        areas: updatedAreas,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const tablesInArea = tables.filter(t => t.area === areaToDelete);
      setTables(prev => prev.map(t => t.area === areaToDelete ? { ...t, area: fallbackArea } : t));

      for (const t of tablesInArea) {
        if (t.id) {
          await updateDoc(doc(db, 'cafe_tables', t.id), { area: fallbackArea });
        }
      }

      displayToast(`🗑️ "${areaToDelete}" bölümü silindi.`);
    } catch (err: any) {
      console.error(err);
      alert("Bölüm silinirken hata: " + err.message);
    }
  };

  // Send Order to Kitchen (Firestore)
  const handleSendOrderToKitchen = async (table: any, cartItems: any[]) => {
    if (!cartItems || cartItems.length === 0) {
      showToast('Sipariş edilecek ürün bulunmuyor.');
      return;
    }
    const newOrder = {
      tableName: table.name,
      area: table.area,
      waiter: user?.displayName || user?.username || 'Garson',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'pending',
      items: cartItems.map(i => ({ name: i.name, qty: i.qty || i.quantity || 1, portion: i.portion || 'Standart', notes: i.notes || '' })),
      tenantId: tenantId || 'default',
      createdAt: serverTimestamp()
    };
    try {
      await addDoc(collection(db, 'cafe_kitchen_orders'), newOrder);

      const existingBill = table.bill || { id: `b_${Date.now()}`, items: [], total: 0, waiter: user?.displayName || 'Garson', time: newOrder.time };
      const updatedItems = [...(existingBill.items || []), ...cartItems];
      const total = updatedItems.reduce((sum, item) => sum + (item.price * (item.qty || item.quantity || 1)), 0);

      if (table.id && !table.id.startsWith('table_')) {
        await updateDoc(doc(db, 'cafe_tables', table.id), {
          status: 'occupied',
          bill: { ...existingBill, items: updatedItems, total }
        });
      }

      // Eş Zamanlı Mutfak Fişi Otomatik Yazdırma (Şablona Göre)
      if (cafePrinterConfig.kitchenAutoPrintOnSend) {
        try {
          const storeInfo = {
            name: currentTenant?.name || tenantName || 'RESTORAN & KAFE',
            phone: currentTenant?.phone || '',
            address: currentTenant?.address || ''
          };
          const copies = cafePrinterConfig.kitchenCopies || 1;
          for (let i = 0; i < copies; i++) {
            const kHtml = buildCafeKitchenOrderHtml(newOrder, cafePrinterConfig, storeInfo);
            printCafeHtml(kHtml, { autoClose: cafePrinterConfig.autoClosePrintWindow, method: cafePrinterConfig.printMethod });
          }
        } catch (printErr) {
          console.warn("Auto kitchen print error:", printErr);
        }
      }

      showToast(`🚀 ${table.name} siparişi mutfağa (KDS) iletildi!`);
      setActiveTable(null);
    } catch (err: any) {
      console.error(err);
      alert("Sipariş gönderilirken hata: " + err.message);
    }
  };

  // Update Kitchen Order Status (Firestore)
  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: 'pending' | 'preparing' | 'ready' | 'delivered' | 'completed'
  ) => {
    try {
      if (newStatus === 'completed') {
        await deleteDoc(doc(db, 'cafe_kitchen_orders', orderId));
        showToast("Sipariş tamamlandı ve arşivlendi.");
      } else if (newStatus === 'delivered') {
        await updateDoc(doc(db, 'cafe_kitchen_orders', orderId), { 
          status: 'delivered',
          updatedAt: serverTimestamp(),
          deliveredTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          deliveredAt: serverTimestamp(),
          deliveredBy: user?.displayName || user?.username || 'Garson'
        });
        showToast(`🍽️ Sipariş masaya TESLİM EDİLDİ.`);
      } else {
        await updateDoc(doc(db, 'cafe_kitchen_orders', orderId), { 
          status: newStatus,
          updatedAt: serverTimestamp(),
          readyTime: newStatus === 'ready' ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
        });
        if (newStatus === 'ready') {
          showToast(`🔔 Sipariş SERVİSE HAZIR olarak işaretlendi ve garsona sesli bildirim iletildi!`);
        } else if (newStatus === 'preparing') {
          showToast(`🍳 Sipariş HAZIRLANIYOR olarak işaretlendi.`);
        } else {
          showToast(`Sipariş durumu güncellendi: ${newStatus.toUpperCase()}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert("Sipariş durumu güncellenirken hata: " + err.message);
    }
  };

  // Request Bill (Hesap İste)
  const handleRequestBill = async (table: any) => {
    try {
      if (table.id && !table.id.startsWith('table_')) {
        await updateDoc(doc(db, 'cafe_tables', table.id), { status: 'bill_requested' });
      }
    } catch (err) {
      console.error(err);
    }
    setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: 'bill_requested' } : t));
    showToast(`🔔 ${table.name} için hesap istendi!`);
  };

  // Close Bill & Free Table with Sales / Cashier integration
  const handleCloseBill = async (table: any, paymentMethod: 'cash' | 'card' | 'split', splitDetails?: any) => {
    if (userRole === 'garson') {
      showToast('⚠️ Garson rolünün hesabı kapatma yetkisi bulunmamaktadır. Lütfen kasaya/kasiyere yönlendirin.');
      return;
    }

    try {
      await addDoc(collection(db, 'sales'), {
        tenantId: tenantId || currentTenant?.id || 'default',
        tenantName: tenantName || currentTenant?.name || 'İşletme',
        items: table.bill?.items || [],
        total: table.bill?.total || 0,
        paymentMethod: paymentMethod === 'split' ? 'cash' : paymentMethod,
        customerName: `${table.name} Adisyonu`,
        sellerName: user?.username || user?.displayName || 'Kasiyer',
        createdAt: serverTimestamp(),
        date: new Date().toISOString()
      });

      if (table.id && !table.id.startsWith('table_')) {
        await updateDoc(doc(db, 'cafe_tables', table.id), {
          status: 'empty',
          bill: null
        });
      }

      // Eş Zamanlı Kasa Tahsilat Fişi Otomatik Yazdırma (Şablona Göre)
      if (cafePrinterConfig.paymentAutoPrintOnClose) {
        try {
          const storeInfo = {
            name: currentTenant?.name || tenantName || 'RESTORAN & KAFE',
            phone: currentTenant?.phone || '',
            address: currentTenant?.address || ''
          };
          const pHtml = buildCafePaymentReceiptHtml(
            table,
            paymentMethod,
            cafePrinterConfig,
            storeInfo,
            user?.displayName || user?.username || 'Kasiyer'
          );
          printCafeHtml(pHtml, { autoClose: cafePrinterConfig.autoClosePrintWindow, method: cafePrinterConfig.printMethod });
        } catch (printErr) {
          console.warn("Auto payment print error:", printErr);
        }
      }
    } catch (err: any) {
      console.error("Failed to record cafe sale in cashier or update table:", err);
    }

    setTables(prev => prev.map(t => {
      if (t.id === table.id) {
        return {
          ...t,
          status: 'empty',
          bill: null
        };
      }
      return t;
    }));
    setActiveTable(null);
    showToast(`🎉 ${table.name} hesabı kapatıldı (${paymentMethod.toUpperCase()}), kasaya ve ciroya işlendi.`);
  };

  // Thermal Receipt Printing with configured live templates & multi-copy support
  const handlePrintReceipt = (tableOrOrder: any, type: 'bill' | 'kitchen') => {
    const storeInfo = {
      name: currentTenant?.name || tenantName || 'RESTORAN & KAFE',
      phone: currentTenant?.phone || '',
      address: currentTenant?.address || ''
    };

    if (type === 'bill') {
      const copies = cafePrinterConfig.billCopies || 1;
      for (let i = 0; i < copies; i++) {
        const html = buildCafeBillHtml(tableOrOrder, cafePrinterConfig, storeInfo);
        printCafeHtml(html, { autoClose: cafePrinterConfig.autoClosePrintWindow, method: cafePrinterConfig.printMethod });
      }
      showToast(`🖨️ ${tableOrOrder.name || 'Masa'} adisyon fişi yazdırıldı.`);
    } else {
      const copies = cafePrinterConfig.kitchenCopies || 1;
      for (let i = 0; i < copies; i++) {
        const html = buildCafeKitchenOrderHtml(tableOrOrder, cafePrinterConfig, storeInfo);
        printCafeHtml(html, { autoClose: cafePrinterConfig.autoClosePrintWindow, method: cafePrinterConfig.printMethod });
      }
      showToast(`🖨️ ${tableOrOrder.tableName || 'Mutfak'} sipariş fişi yazdırıldı.`);
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-2 sm:p-6 lg:p-8 mx-auto space-y-6 box-border">
      {/* Module Header Banner with Role Switcher */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-amber-800 rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-hidden flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 w-full box-border">
        <div className="space-y-2 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-black/20 text-orange-200 border border-orange-400/30 text-[10px] font-black uppercase tracking-wider">
              Restoran & Kafe Otomasyonu
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Canlı Modül Aktif
            </span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black tracking-tight uppercase flex items-center gap-2">
            <Utensils className="w-7 h-7 sm:w-8 sm:h-8 text-orange-200 shrink-0" />
            <span>Kafe & Restoran Yönetimi</span>
          </h1>
          <p className="text-xs sm:text-sm text-orange-100 font-medium">
            Masa kat planı, anlık adisyon takibi, porsiyon/not seçimi ve sesli uyarı destekli Mutfak (KDS) paneli.
          </p>
        </div>

        {/* Role Selector Bar: ONLY VISIBLE TO ADMIN / SUPERADMIN */}
        {(user?.role === 'admin' || isSuperAdmin) ? (
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20 flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
            <span className="text-[11px] font-black uppercase text-orange-200 w-full lg:w-auto">Aktif Rol:</span>
            <div className="flex flex-wrap gap-1.5 w-full">
              <button
                type="button"
                onClick={() => handleRoleChange('admin')}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-black transition-all", userRole === 'admin' ? 'bg-white text-orange-900 shadow-md' : 'text-white hover:bg-white/10')}
              >
                👑 Şef / Admin
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('kasiyer')}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-black transition-all", userRole === 'kasiyer' ? 'bg-white text-orange-900 shadow-md' : 'text-white hover:bg-white/10')}
              >
                💳 Kasa
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('garson')}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-black transition-all", userRole === 'garson' ? 'bg-white text-orange-900 shadow-md' : 'text-white hover:bg-white/10')}
              >
                📱 Garson (Mobil)
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('mutfak')}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-black transition-all", userRole === 'mutfak' ? 'bg-white text-orange-900 shadow-md' : 'text-white hover:bg-white/10')}
              >
                🍳 Mutfak (KDS)
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 flex items-center gap-2">
            <span className="text-[11px] font-black uppercase text-orange-200">Personel Rolü:</span>
            <span className="px-3 py-1 bg-white text-orange-900 rounded-xl text-xs font-black uppercase shadow-sm">
              {userRole === 'mutfak' ? '🍳 Mutfak (KDS)' : userRole === 'garson' ? '📱 Garson' : userRole === 'kasiyer' ? '💳 Kasa' : '👑 Yetkili'}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="w-full overflow-x-auto pb-2 scrollbar-none">
        <div className="flex items-center gap-2 min-w-max border-b border-slate-200 pb-3">
          {(userRole === 'admin' || userRole === 'kasiyer' || userRole === 'garson') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('tables')}
              className={cn(
                "px-5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer relative",
                activeSubTab === 'tables'
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              )}
            >
              <Armchair className="w-4 h-4" />
              <span>Masa & Kat Planı</span>
              {kitchenOrders.filter(o => o.status === 'ready').length > 0 && (
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center animate-bounce shadow-md">
                  {kitchenOrders.filter(o => o.status === 'ready').length}
                </span>
              )}
            </button>
          )}

          {(userRole === 'admin' || userRole === 'kasiyer' || userRole === 'garson') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('live_orders')}
              className={cn(
                "px-5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer relative",
                activeSubTab === 'live_orders'
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              )}
            >
              <Bell className="w-4 h-4" />
              <span>Canlı Sipariş Takibi</span>
              {kitchenOrders.filter(o => o.status === 'ready').length > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center animate-bounce shadow-md">
                  🔔 {kitchenOrders.filter(o => o.status === 'ready').length} Servise Hazır
                </span>
              ) : kitchenOrders.filter(o => o.status === 'preparing').length > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                  🍳 {kitchenOrders.filter(o => o.status === 'preparing').length} Hazırlanıyor
                </span>
              ) : null}
            </button>
          )}

          {(userRole === 'admin' || userRole === 'kasiyer' || userRole === 'mutfak') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('kds')}
              className={cn(
                "px-5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer relative",
                activeSubTab === 'kds'
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              )}
            >
              <ChefHat className="w-4 h-4" />
              <span>Mutfak Ekranı (KDS)</span>
              {kitchenOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length > 0 && (
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center animate-bounce">
                  {kitchenOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length}
                </span>
              )}
            </button>
          )}

          {userRole === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => setActiveSubTab('menu')}
                className={cn(
                  "px-5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                  activeSubTab === 'menu'
                    ? "bg-slate-900 text-white shadow-md"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                )}
              >
                <Utensils className="w-4 h-4" />
                <span>Menü & Ürünler</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('reports')}
                className={cn(
                  "px-5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                  activeSubTab === 'reports'
                    ? "bg-slate-900 text-white shadow-md"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                )}
              >
                <Receipt className="w-4 h-4" />
                <span>Adisyon Raporları</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('printer')}
                className={cn(
                  "px-5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                  activeSubTab === 'printer'
                    ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                )}
              >
                <Printer className="w-4 h-4" />
                <span>Yazıcı & Şablonlar</span>
              </button>
            </>
          )}
        </div>

        {userRole === 'admin' && activeSubTab === 'tables' && (
          <button
            type="button"
            onClick={() => setIsNewTableModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Masa Ekle</span>
          </button>
        )}
      </div>

      {/* TAB 1: TABLES & FLOOR PLAN */}
      {activeSubTab === 'tables' && (
        <div className="space-y-6">
          {/* READY ORDERS ALERT BANNER (YALNIZCA Garson ve Yönetici için Servis Bildirimi) */}
          {kitchenOrders.filter(o => o.status === 'ready').length > 0 && (userRole === 'garson' || userRole === 'admin') && (
            <div className="w-full max-w-full overflow-hidden box-border bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 text-white p-4 sm:p-5 rounded-3xl shadow-xl border-2 border-emerald-400 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <Bell className="w-6 h-6 text-emerald-200 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-emerald-100 text-[10px] font-black uppercase">
                      Servis Uyarısı
                    </span>
                    <span className="text-xs font-bold text-emerald-200">
                      {kitchenOrders.filter(o => o.status === 'ready').length} Masa Bekliyor
                    </span>
                  </div>
                  <h3 className="font-black text-base sm:text-lg uppercase mt-0.5 flex items-center gap-2">
                    <span>🔔 Mutfaktan Hazır Siparişler Var!</span>
                  </h3>
                  <p className="text-xs text-emerald-100 font-medium">
                    Aşağıdaki masaların yemekleri hazırlandı. Lütfen tezgahtan alıp masaya servis edin:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {kitchenOrders.filter(o => o.status === 'ready').map(ro => (
                  <div 
                    key={ro.id} 
                    className="bg-white/15 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/30 text-xs flex items-center gap-3 shadow-md"
                  >
                    <div>
                      <p className="font-black text-white">{ro.tableName} <span className="text-[10px] text-emerald-200">({ro.area})</span></p>
                      <p className="text-[10px] text-emerald-200 max-w-[150px] truncate">
                        {ro.items?.map((it: any) => `${it.qty || 1}x ${it.name}`).join(', ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeliverOrder(ro.id, ro.tableName)}
                      className="px-3 py-1.5 bg-white text-emerald-900 hover:bg-emerald-50 font-black rounded-xl text-xs uppercase shadow transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Masaya Verildi</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Area Selector Tabs & Status Legend */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-2">Salon / Bölüm:</span>
              {areas.map(area => (
                <div key={area} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedArea(area)}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                      selectedArea === area
                        ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    <span>{area}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      selectedArea === area ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                    )}>
                      {tables.filter(t => t.area === area).length}
                    </span>
                  </button>
                  {selectedArea === area && (userRole === 'admin' || userRole === 'kasiyer') && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAreaName({ oldName: area, newName: area });
                        setIsAreaModalOpen(true);
                      }}
                      className="ml-1 p-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors cursor-pointer"
                      title={`"${area}" Bölümünün Adını Değiştir`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* Button to Manage / Rename Areas */}
              {(userRole === 'admin' || userRole === 'kasiyer') && (
                <button
                  type="button"
                  onClick={() => setIsAreaModalOpen(true)}
                  className="px-3 py-2 rounded-xl border border-dashed border-slate-300 hover:border-orange-500 hover:text-orange-600 text-slate-500 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer bg-slate-50"
                  title="Bölüm İsimlerini Değiştir & Yeni Bölüm Ekle"
                >
                  <Edit2 className="w-3.5 h-3.5 text-orange-600" />
                  <span>Bölüm İsimlerini Yönet</span>
                </button>
              )}
            </div>

            {/* Status Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-xs" />
                <span>Boş</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500 shadow-xs" />
                <span>Dolu (Açık)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-xs" />
                <span>Rezerve</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500 shadow-xs animate-pulse" />
                <span>Hesap İstendi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-xs ring-2 ring-emerald-500 animate-ping" />
                <span className="text-emerald-700 font-black">🔔 Sipariş Hazır!</span>
              </div>
            </div>
          </div>

          {/* Tables Grid (100% Mobile & Thumb-friendly) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables.filter(t => t.area === selectedArea).map(table => {
              const readyOrdersForTable = kitchenOrders.filter(o => o.tableName === table.name && o.status === 'ready');
              const isReady = readyOrdersForTable.length > 0;

              const statusColors = {
                empty: 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100',
                occupied: isReady 
                  ? 'bg-emerald-100/90 border-emerald-500 text-emerald-950 ring-4 ring-emerald-400/50 animate-pulse shadow-emerald-500/20 shadow-lg' 
                  : 'bg-rose-50 border-rose-300 text-rose-900 hover:bg-rose-100',
                reserved: 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-300 shadow-amber-500/10 hover:bg-amber-100',
                bill_requested: 'bg-blue-50 border-blue-400 text-blue-900 hover:bg-blue-100 ring-4 ring-blue-400/20 animate-pulse'
              };

              const badgeColors = {
                empty: 'bg-emerald-500 text-white',
                occupied: isReady ? 'bg-emerald-600 text-white animate-bounce' : 'bg-rose-600 text-white',
                reserved: 'bg-amber-500 text-white font-black',
                bill_requested: 'bg-blue-600 text-white'
              };

              return (
                <div
                  key={table.id}
                  onClick={() => setActiveTable(table)}
                  className={cn(
                    "p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between shadow-md active:scale-95 relative group min-h-[175px]",
                    statusColors[table.status as keyof typeof statusColors] || statusColors.empty
                  )}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-black text-base">{table.name}</span>
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", badgeColors[table.status as keyof typeof badgeColors])}>
                      {isReady ? '🔔 SİPARİŞ HAZIR!' :
                       table.status === 'empty' ? 'Boş' :
                       table.status === 'occupied' ? 'Dolu' :
                       table.status === 'reserved' ? '📌 Rezerve' : 'Hesap İstendi'}
                    </span>
                  </div>

                  <div className="my-auto py-2 text-center">
                    {isReady ? (
                      <div className="p-2 bg-emerald-200/70 rounded-2xl border border-emerald-400 text-center space-y-1">
                        <div className="flex items-center justify-center gap-1 text-emerald-950 font-black text-xs">
                          <Bell className="w-3.5 h-3.5 text-emerald-800 animate-bounce" />
                          <span>Mutfak Hazırladı!</span>
                        </div>
                        <p className="text-[10px] text-emerald-900 font-bold max-w-full truncate">
                          {readyOrdersForTable[0]?.items?.map((it: any) => `${it.qty || 1}x ${it.name}`).join(', ')}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeliverOrder(readyOrdersForTable[0].id, table.name);
                          }}
                          className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[11px] font-black shadow flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                        >
                          <Check className="w-3 h-3" />
                          <span>Masaya Verildi</span>
                        </button>
                      </div>
                    ) : table.status === 'occupied' || table.status === 'bill_requested' ? (
                      <div>
                        <p className="text-lg font-black font-mono">
                          {table.bill?.total ? `${table.bill.total.toLocaleString('tr-TR')} ₺` : '0 ₺'}
                        </p>
                        <p className="text-[10px] opacity-75 font-medium mt-0.5">
                          {table.bill?.items?.length || 0} Ürün • {table.bill?.waiter || 'Garson'}
                        </p>
                      </div>
                    ) : table.status === 'reserved' ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1 text-amber-800 font-black text-xs">
                          <Bookmark className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                          <span>REZERVE MASA</span>
                        </div>
                        <p className="text-xs font-bold text-amber-900 line-clamp-1 px-1">
                          {table.reservedFor || 'Masa Ayrılmıştır'}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReservation(table, false);
                          }}
                          className="mt-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black shadow flex items-center justify-center gap-1 mx-auto transition-all cursor-pointer active:scale-95"
                          title="Rezervasyonu Kaldır / Masayı Boşalt"
                        >
                          <X className="w-3 h-3" />
                          <span>Rezerveyi Kaldır</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-emerald-700">{table.capacity} Kişilik</p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReservationModalTable(table);
                            setReservationNoteInput(table.reservedFor || '');
                          }}
                          className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-[10px] font-bold border border-amber-300 flex items-center justify-center gap-1 mx-auto transition-all cursor-pointer shadow-xs active:scale-95"
                          title="Bu Masayı Rezerve Et"
                        >
                          <Bookmark className="w-3 h-3 text-amber-600" />
                          <span>Rezerve Yap</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-black/10 text-[10px] font-bold opacity-80">
                    <span>{table.area}</span>
                    <span className="underline">Adisyon Aç →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: KITCHEN ORDER DISPLAY (KDS - Canlı Mutfak Takip Sistemi) */}
      {activeSubTab === 'kds' && (
        <LiveOrderTrackingBoard
          orders={kitchenOrders}
          mode="kitchen"
          onUpdateStatus={handleUpdateOrderStatus}
          onPrintTicket={(order) => handlePrintReceipt(order, 'kitchen')}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          showToast={showToast}
        />
      )}

      {/* TAB: GARSON CANLI SİPARİŞ TAKİP PANELİ */}
      {activeSubTab === 'live_orders' && (
        <LiveOrderTrackingBoard
          orders={kitchenOrders}
          mode="waiter"
          onUpdateStatus={handleUpdateOrderStatus}
          onPrintTicket={(order) => handlePrintReceipt(order, 'kitchen')}
          currentWaiterName={user?.displayName || user?.username || ''}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          showToast={showToast}
        />
      )}

      {/* TAB 3: MENU & PRODUCTS (Admin) */}
      {activeSubTab === 'menu' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex-col sm:flex-row gap-4">
            <div>
              <h3 className="font-black text-base text-slate-900 uppercase">Restoran Menü & Porsiyon Tanımları</h3>
              <p className="text-xs text-slate-500">Ürün fiyatları, kategoriler ve porsiyon seçenekleri (Firestore'a kalıcı olarak kaydedilir).</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMenuItem(null);
                setMenuForm({ name: '', category: menuCategories[1] || 'Izgaralar', price: 100, portionsStr: 'Tek, Duble' });
                setIsMenuModalOpen(true);
              }}
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Yeni Menü Ürünü Ekle</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {menuItems.map(item => (
              <div key={item.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-start">
                    <h4 className="font-black text-sm text-slate-900">{item.name}</h4>
                    <span className="font-mono font-black text-orange-600 text-sm">{item.price} ₺</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">Kategori: <span className="text-slate-800 font-bold">{item.category}</span></p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.portions?.map((p: string, idx: number) => (
                      <span key={idx} className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">{p}</span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMenuItem(item);
                      setMenuForm({
                        name: item.name,
                        category: item.category,
                        price: item.price,
                        portionsStr: item.portions?.join(', ') || ''
                      });
                      setIsMenuModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Düzenle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMenuItem(item.id)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sil</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ADISYON RAPORLARI */}
      {activeSubTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-black text-base text-slate-900 uppercase">Geçmiş Adisyon & Ciro Raporları</h3>
              <p className="text-xs text-slate-500 font-medium">Kapatılan masalar, ödeme türleri (Nakit / Kredi Kartı) ve toplam ciro hareketleri.</p>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-black">
              Toplam Ciro: {closedSales.reduce((sum, s) => sum + Number(s.total || 0), 0).toLocaleString('tr-TR')} ₺
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px]">
                    <th className="p-4">Tarih / Saat</th>
                    <th className="p-4">Masa / Adisyon</th>
                    <th className="p-4">Kasiyer / Garson</th>
                    <th className="p-4">Ödeme Türü</th>
                    <th className="p-4">Ürünler</th>
                    <th className="p-4 text-right">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {closedSales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400 italic">
                        Henüz kapatılmış adisyon / satış bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    closedSales.map((sale: any) => {
                      const sDate = sale.date?.toDate ? sale.date.toDate() : (sale.date ? new Date(sale.date) : new Date());
                      return (
                        <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4 font-mono text-slate-600 font-bold">
                            {format(sDate, 'dd.MM.yyyy HH:mm')}
                          </td>
                          <td className="p-4 font-black text-slate-900">
                            {sale.customerName || 'Masa Adisyonu'}
                          </td>
                          <td className="p-4 font-bold text-slate-700">
                            {sale.sellerName || 'Kasiyer'}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black ${
                              sale.paymentMethod === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {sale.paymentMethod === 'cash' ? '💵 Nakit' : '💳 Kredi Kartı'}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600 text-[11px] max-w-xs truncate">
                            {sale.items?.map((i: any) => `${i.qty || i.quantity || 1}x ${i.name}`).join(', ') || '-'}
                          </td>
                          <td className="p-4 text-right font-mono font-black text-orange-600 text-sm">
                            {Number(sale.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CAFE & RESTAURANT PRINT TEMPLATES & SETTINGS */}
      {activeSubTab === 'printer' && (
        <CafePrinterSettings />
      )}

      {/* MENU ITEM ADD / EDIT MODAL */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">
              {editingMenuItem ? 'Menü Ürününü Düzenle' : 'Yeni Menü Ürünü Ekle'}
            </h3>
            <form onSubmit={handleSaveMenuItem} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ürün Adı *</label>
                <input
                  required
                  type="text"
                  placeholder="Örn: Adana Kebap"
                  value={menuForm.name}
                  onChange={e => setMenuForm({ ...menuForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kategori</label>
                <select
                  value={menuForm.category}
                  onChange={e => setMenuForm({ ...menuForm, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                >
                  {menuCategories.filter(c => c !== 'Tümü').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Birim Fiyatı (₺)</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={menuForm.price}
                  onChange={e => setMenuForm({ ...menuForm, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold font-mono text-orange-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Porsiyonlar (Virgülle Ayırın)</label>
                <input
                  type="text"
                  placeholder="Tek, Duble, Büyük"
                  value={menuForm.portionsStr}
                  onChange={e => setMenuForm({ ...menuForm, portionsStr: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsMenuModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black shadow-md"
                >
                  {editingMenuItem ? 'Değişiklikleri Kaydet' : 'Ürünü Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING ACTIVE READY ORDER ALERT POPUP (YALNIZCA Garson Ekranında Görünür) */}
      {activeReadyAlert && userRole !== 'mutfak' && activeSubTab !== 'kds' && (userRole === 'garson' || userRole === 'admin') && (
        <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[420px] max-w-[calc(100vw-24px)] z-[100] bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-950 text-white rounded-3xl shadow-2xl border-2 border-emerald-400/90 p-4 sm:p-5 animate-bounce-short box-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-200 animate-bounce" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-emerald-100 text-[10px] font-black uppercase tracking-wider">
                    Mutfak Bildirimi
                  </span>
                  <span className="text-[11px] font-mono font-bold text-emerald-200">
                    {activeReadyAlert.time || ''}
                  </span>
                </div>
                <h4 className="text-sm sm:text-base font-black uppercase text-white mt-0.5 flex items-center gap-1.5 truncate">
                  <span>🔔 {activeReadyAlert.tableName} Hazır!</span>
                </h4>
                <p className="text-xs text-emerald-100 font-medium line-clamp-1 mt-0.5">
                  {activeReadyAlert.items?.map((it: any) => `${it.qty || 1}x ${it.name}`).join(', ') || 'Sipariş hazırlandı'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveReadyAlert(null)}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors shrink-0"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-white/20 flex gap-2">
            <button
              type="button"
              onClick={() => {
                handleDeliverOrder(activeReadyAlert.id, activeReadyAlert.tableName);
              }}
              className="flex-1 py-2.5 bg-white text-emerald-950 hover:bg-emerald-50 rounded-xl text-xs font-black uppercase shadow-lg flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Check className="w-4 h-4 text-emerald-700 stroke-[3]" />
              <span>Masaya Teslim Et</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playOrderReadySound();
              }}
              className="px-3 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-bold text-white cursor-pointer flex items-center gap-1 transition-all"
              title="Zil Sesini Tekrar Çal"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE TABLE / BILL & ORDER MODAL (Garson / Kasiyer / Admin) */}
      {activeTable && (
        <TableBillOrderModal
          table={activeTable}
          menuItems={menuItems}
          menuCategories={menuCategories}
          onClose={() => setActiveTable(null)}
          onSendOrder={handleSendOrderToKitchen}
          onRequestBill={handleRequestBill}
          onCloseBill={handleCloseBill}
          onPrintReceipt={handlePrintReceipt}
          kitchenOrders={kitchenOrders}
          onDeliverOrder={handleDeliverOrder}
          userRole={userRole}
          showToast={showToast}
          onToggleReservation={handleToggleReservation}
          user={user}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {/* NEW TABLE MODAL */}
      {isNewTableModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Yeni Masa / Alan Ekle</h3>
            <form onSubmit={handleCreateTable} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Masa Adı / No *</label>
                <input
                  required
                  type="text"
                  placeholder="Örn: Masa 9"
                  value={newTableName}
                  onChange={e => setNewTableName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Bölüm / Salon</label>
                <select
                  value={newTableArea}
                  onChange={e => setNewTableArea(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold"
                >
                  {areas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Kişi Kapasitesi</label>
                <input
                  type="number"
                  value={newTableCapacity}
                  onChange={e => setNewTableCapacity(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold font-mono"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTableModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-xs font-black shadow-md"
                >
                  Masayı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AREA / SECTION MANAGEMENT MODAL (Bölüm İsimlerini Değiştir & Ekle / Sil) */}
      {isAreaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">Bölüm & Kat İsimlerini Yönet</h3>
                  <p className="text-xs text-slate-500 font-medium">Bölüm isimlerini değiştirebilir veya yeni bölüm ekleyebilirsiniz.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAreaModalOpen(false);
                  setEditingAreaName(null);
                }}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Yeni Bölüm Ekleme Formu */}
            <form onSubmit={handleAddArea} className="flex gap-2">
              <input
                type="text"
                placeholder="Yeni Bölüm Adı (Örn: Teras 2, Havuz Başı)..."
                value={newAreaInput}
                onChange={e => setNewAreaInput(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold focus:bg-white focus:border-orange-500 outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1 cursor-pointer transition-all shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Bölüm Ekle</span>
              </button>
            </form>

            {/* Mevcut Bölümler Listesi */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              <div className="text-[11px] font-black uppercase text-slate-400">Mevcut Salon & Bölümler ({areas.length}):</div>
              {areas.map(area => {
                const count = tables.filter(t => t.area === area).length;
                const isEditing = editingAreaName?.oldName === area;

                return (
                  <div
                    key={area}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 flex items-center justify-between gap-2 transition-colors"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingAreaName.newName}
                          onChange={e => setEditingAreaName({ ...editingAreaName, newName: e.target.value })}
                          className="flex-1 px-3 py-1.5 bg-white border border-orange-500 rounded-xl text-xs font-bold outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleRenameArea(area, editingAreaName.newName);
                            } else if (e.key === 'Escape') {
                              setEditingAreaName(null);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameArea(area, editingAreaName.newName)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Kaydet</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAreaName(null)}
                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-xs sm:text-sm text-slate-800">{area}</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                            {count} Masa
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingAreaName({ oldName: area, newName: area })}
                            className="px-2.5 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="İsmi Değiştir"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>İsmi Değiştir</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteArea(area)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Bölümü Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsAreaModalOpen(false);
                  setEditingAreaName(null);
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
              >
                Tamamla & Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLE RESERVATION MODAL (Masa Rezerve Yapma Modalı) */}
      {reservationModalTable && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    {reservationModalTable.name} Rezervasyon
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Bölüm: {reservationModalTable.area} ({reservationModalTable.capacity} Kişilik)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReservationModalTable(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reservationModalTable.status === 'reserved'}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      if (!isChecked) {
                        handleToggleReservation(reservationModalTable, false);
                      }
                    }}
                    className="w-5 h-5 text-amber-600 rounded-lg border-amber-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-black uppercase text-amber-950 block">
                      📌 Masa Rezerve Durumu {reservationModalTable.status === 'reserved' ? '(Aktif)' : '(Boş)'}
                    </span>
                    <span className="text-[11px] text-amber-700">
                      İşaretlendiğinde masa planda sarı rezerve olarak görünür.
                    </span>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Müşteri Adı / Rezervasyon Notu & Saati:
                </label>
                <input
                  type="text"
                  placeholder="Örn: Ahmet Bey - 20:00 (4 Kişi)"
                  value={reservationNoteInput}
                  onChange={e => setReservationNoteInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold focus:bg-white focus:border-amber-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                {reservationModalTable.status === 'reserved' && (
                  <button
                    type="button"
                    onClick={() => handleToggleReservation(reservationModalTable, false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Rezervasyonu İptal Et (Boşalt)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleToggleReservation(reservationModalTable, true, reservationNoteInput.trim() || 'Rezerve Masa')}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Bookmark className="w-4 h-4" />
                  <span>{reservationModalTable.status === 'reserved' ? 'Notu Güncelle' : 'Masayı Rezerve Et'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP FLOATING TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[120] bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 text-xs font-bold flex items-center gap-3 animate-fadeIn">
          <span>{toastMsg}</span>
          <button 
            type="button" 
            onClick={() => setToastMsg(null)}
            className="w-5 h-5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// TABLE BILL & ORDER MODAL (100% Mobile & Thumb Friendly)
// =========================================================================
interface TableBillOrderModalProps {
  table: any;
  menuItems: any[];
  menuCategories: string[];
  onClose: () => void;
  onSendOrder: (table: any, items: any[]) => void;
  onRequestBill: (table: any) => void;
  onCloseBill: (table: any, method: 'cash' | 'card' | 'split') => void;
  onPrintReceipt: (table: any, type: 'bill' | 'kitchen') => void;
  kitchenOrders?: any[];
  onDeliverOrder?: (orderId: string, tableName: string) => void;
  userRole: 'admin' | 'kasiyer' | 'garson' | 'mutfak';
  showToast: (m: string) => void;
  onToggleReservation?: (table: any, isReserved: boolean, note?: string) => void;
  user?: any;
  isSuperAdmin?: boolean;
}

const TableBillOrderModal: React.FC<TableBillOrderModalProps> = ({
  table,
  menuItems,
  menuCategories,
  onClose,
  onSendOrder,
  onRequestBill,
  onCloseBill,
  onPrintReceipt,
  kitchenOrders,
  onDeliverOrder,
  userRole,
  showToast,
  onToggleReservation,
  user,
  isSuperAdmin
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('Tümü');
  const [cart, setCart] = useState<any[]>([]); // New items to send to kitchen
  const [selectedProductForPortion, setSelectedProductForPortion] = useState<any | null>(null);
  const [selectedPortion, setSelectedPortion] = useState<string>('');
  const [itemNote, setItemNote] = useState<string>('');
  const [isPaymentView, setIsPaymentView] = useState<boolean>(false);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState<boolean>(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState<boolean>(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  const [discountVal, setDiscountVal] = useState<string>('10');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [splitPersons, setSplitPersons] = useState<number>(2);
  const [customSplitAmount, setCustomSplitAmount] = useState<string>('');

  const handleAddToCart = (product: any) => {
    if (product.portions && product.portions.length > 0) {
      setSelectedProductForPortion(product);
      setSelectedPortion(product.portions[0]);
      setItemNote('');
    } else {
      addItemToCartDirect(product, 'Standart', '');
    }
  };

  const addItemToCartDirect = (product: any, portion: string, note: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id && i.portion === portion && i.notes === note);
      if (existing) {
        return prev.map(i => i === existing ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        portion,
        notes: note,
        qty: 1
      }];
    });
    setSelectedProductForPortion(null);
    showToast(`+1 ${product.name} (${portion}) sepete eklendi`);
  };

  const existingBillItems = table.bill?.items || [];
  const newCartTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const existingBillTotal = table.bill?.total || 0;
  const grandTotal = existingBillTotal + newCartTotal;

  const tableReadyOrders = kitchenOrders ? kitchenOrders.filter(o => o.tableName === table.name && o.status === 'ready') : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col h-[92dvh] max-h-[92dvh] pb-8 sm:pb-0">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-600 to-amber-600 text-white flex justify-between items-center shrink-0 shadow-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center font-black">
              <Utensils className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-lg sm:text-xl">{table.name} ({table.area})</h3>
              <p className="text-xs text-orange-100">
                {table.status === 'empty' ? 'Boş Masa - Yeni Adisyon' : `Adisyon Toplamı: ${grandTotal.toLocaleString('tr-TR')} ₺`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ready Orders Alert Banner Inside Modal */}
        {tableReadyOrders.length > 0 && (
          <div className="bg-emerald-600 text-white p-3 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0 border-b border-emerald-500 animate-pulse z-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-emerald-100 animate-bounce" />
              </div>
              <div>
                <h5 className="font-black text-xs uppercase flex items-center gap-1">
                  <span>🔔 BU MASANIN MUTFAK SİPARİŞİ HAZIR!</span>
                </h5>
                <p className="text-[11px] text-emerald-100 truncate max-w-md">
                  {tableReadyOrders.map(o => o.items?.map((it: any) => `${it.qty || 1}x ${it.name}`).join(', ')).join(' | ')}
                </p>
              </div>
            </div>
            {onDeliverOrder && (
              <button
                type="button"
                onClick={() => onDeliverOrder(tableReadyOrders[0].id, table.name)}
                className="px-3 py-1 bg-white text-emerald-950 hover:bg-emerald-50 rounded-xl text-xs font-black uppercase shadow flex items-center gap-1 cursor-pointer shrink-0 transition-all active:scale-95"
              >
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span>Teslim Et</span>
              </button>
            )}
          </div>
        )}

        {/* Body Grid with proper overflow-y-auto */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* Left / Center: Menu & Categories */}
          <div className="lg:col-span-7 p-4 sm:p-5 overflow-y-auto space-y-4 border-r border-slate-200 bg-slate-50">
            {userRole !== 'mutfak' && (
              <>
                <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none pb-2 -mx-1 px-1">
                  {Array.from(new Set(['Tümü', ...menuCategories])).map((cat, idx) => (
                    <button
                      key={`${cat}-${idx}`}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer shrink-0",
                        activeCategory === cat
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-24 lg:pb-6">
                  {menuItems.filter(m => activeCategory === 'Tümü' || m.category === activeCategory).map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddToCart(item)}
                      className="bg-white p-3.5 rounded-2xl border border-slate-200 hover:border-orange-500 shadow-xs hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer group active:scale-95"
                    >
                      <div>
                        <h5 className="font-black text-xs text-slate-900 group-hover:text-orange-600 leading-tight">{item.name}</h5>
                      </div>
                      <div className="mt-3 flex justify-between items-center w-full">
                        <span className="font-mono font-black text-orange-600 text-xs">{item.price} ₺</span>
                        <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                          <Plus className="w-4 h-4" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right Column: Existing Bill & New Cart Items with Sticky Footer */}
          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col bg-white overflow-hidden relative">
            {/* Top scrollable section containing headers, reservation, and list of items */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="font-black text-sm text-slate-900 uppercase">Masa Adisyonu & Sepet</h4>
                <span className="text-xs font-bold text-orange-600">{table.bill?.waiter ? `Garson: ${table.bill.waiter}` : 'Yeni'}</span>
              </div>

              {/* MASA REZERVE YAPMA TİKİ (CHECKBOX) */}
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={table.status === 'reserved'}
                      onChange={(e) => {
                        const check = e.target.checked;
                        if (check) {
                          const note = prompt("Rezervasyon Notu / Müşteri Adı:", table.reservedFor || "Rezerve") || "Rezerve";
                          if (onToggleReservation) {
                            onToggleReservation(table, true, note);
                          }
                        } else {
                          if (onToggleReservation) {
                            onToggleReservation(table, false);
                          }
                        }
                      }}
                      className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-black text-xs text-amber-950 uppercase flex items-center gap-1">
                        📌 Bu Masayı Rezerve Yap
                      </span>
                      <span className="text-[10px] text-amber-700 block">
                        {table.status === 'reserved' 
                          ? `Rezerve: ${table.reservedFor || 'Rezerve Masa'}` 
                          : 'Masayı rezerve etmek için kutucuğu (tiki) işaretleyin.'}
                      </span>
                    </div>
                  </label>
                  {table.status === 'reserved' ? (
                    <button
                      type="button"
                      onClick={() => onToggleReservation && onToggleReservation(table, false)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Rezerveyi Kaldır
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const note = prompt("Rezervasyon Notu / Müşteri Adı:", "Rezerve") || "Rezerve";
                        if (onToggleReservation) {
                          onToggleReservation(table, true, note);
                        }
                      }}
                      className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Rezerve Et
                    </button>
                  )}
                </div>
              </div>

              {/* Existing Bill Items */}
              {existingBillItems.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-slate-400">Önceki Siparişler (Mutfakta / Masada):</div>
                  {existingBillItems.map((bi: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-800">{bi.qty || bi.quantity}x {bi.name}</p>
                        {bi.notes && <p className="text-[10px] text-slate-500">Not: {bi.notes}</p>}
                      </div>
                      <span className="font-mono font-bold text-slate-900">{(bi.price * (bi.qty || bi.quantity || 1))} ₺</span>
                    </div>
                  ))}
                </div>
              )}

              {/* New Cart Items to Send */}
              {cart.length > 0 && (
                <div className="space-y-1.5 pt-1 bg-slate-800 p-3 rounded-xl my-2 max-h-40 overflow-y-auto">
                  <div className="text-[10px] font-black uppercase text-orange-400">Eklenen Yeni Ürünler (Sepet):</div>
                  {cart.map((ci, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-700/80 rounded-xl border border-slate-600 text-xs flex justify-between items-center text-white">
                      <div>
                        <p className="font-bold text-white">{ci.qty}x {ci.name} <span className="text-[10px] text-orange-300">({ci.portion})</span></p>
                        {ci.notes && <p className="text-[10px] text-rose-300">Not: {ci.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{ci.price * ci.qty} ₺</span>
                        <button
                          type="button"
                          onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))}
                          className="text-rose-400 hover:text-rose-200 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions & Totals Sticky Footer */}
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 pt-3 pb-4 px-4 space-y-3 shadow-2xl z-20 shrink-0 text-white rounded-2xl mx-[-1rem] sm:mx-[-1.25rem] mb-[-1rem] sm:mb-[-1.25rem]">
              {/* Mobile quick cart toggle button */}
              {(cart.length > 0 || existingBillItems.length > 0) && (
                <div className="flex lg:hidden justify-between items-center bg-slate-800 px-3 py-2 rounded-xl mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-orange-600 text-white text-xs font-black flex items-center justify-center">
                      {(cart.reduce((s: number, i: any) => s + Number(i.qty || 1), 0)) + (existingBillItems.reduce((s: number, i: any) => s + Number(i.qty || i.quantity || 1), 0))}
                    </span>
                    <span className="text-xs font-bold text-slate-200">Sepet / Adisyon Özeti</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCartDrawerOpen(true)}
                    className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Sepeti Aç / Düzenle</span>
                  </button>
                </div>
              )}

              <div className="flex justify-between items-center text-sm font-black text-white">
                <span className="text-orange-400">GENEL TOPLAM:</span>
                <span className="font-mono text-orange-400 text-base">{grandTotal.toLocaleString('tr-TR')} ₺</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSendOrder(table, cart)}
                    className="col-span-2 py-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <ChefHat className="w-4 h-4" />
                    <span>Mutfağa Gönder / Siparişi Ver</span>
                  </button>
                )}

                {grandTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => onPrintReceipt(table, 'bill')}
                    className="col-span-2 py-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>🖨️ Fiş Yazdır / Hesap Yazdır</span>
                  </button>
                )}

                {userRole !== 'garson' && grandTotal > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsSplitModalOpen(true)}
                      className="col-span-1 py-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <span>✂️ Parçalı / Kişi Başı</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const canDisc = user?.role === 'admin' || isSuperAdmin || user?.permissions?.canDiscount === true;
                        if (!canDisc) {
                          const pass = prompt("🔒 İskonto yetkiniz bulunmamaktadır. Yetkili / Yönetici şifresini girin:");
                          if (pass !== '1234' && pass !== 'admin' && pass !== '9999') {
                            showToast("❌ Yetkisiz işlem! İskonto yetkiniz yok.");
                            return;
                          }
                        }
                        setIsDiscountModalOpen(true);
                      }}
                      className="col-span-1 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <span>🏷️ İskonto Uygula</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseBill(table, 'cash')}
                      className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <Banknote className="w-4 h-4" />
                      <span>Nakit Kapat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseBill(table, 'card')}
                      className="py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Kart Kapat</span>
                    </button>
                  </>
                )}

                {userRole === 'garson' && grandTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onRequestBill(table);
                      onClose();
                    }}
                    className="col-span-2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Bell className="w-4 h-4" />
                    <span>Hesap İste (Kasaya Bildir)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SPLIT PAYMENT MODAL */}
      {isSplitModalOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 text-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-800 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-black uppercase text-purple-400">✂️ Parçalı & Kişi Başı Ödeme ({table.name})</h3>
              <button
                type="button"
                onClick={() => setIsSplitModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-slate-800 rounded-2xl flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold">Toplam Tutar:</span>
                <span className="font-mono text-lg font-black text-orange-400">{grandTotal.toLocaleString('tr-TR')} ₺</span>
              </div>

              {/* Kişi Sayısına Böl */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 uppercase">Kişi Sayısına Bölerek Öde</label>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 3, 4, 6].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setSplitPersons(num)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-black transition-all cursor-pointer",
                        splitPersons === num ? "bg-purple-600 text-white shadow-md" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {num} Kişi
                    </button>
                  ))}
                </div>
                <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-2xl flex justify-between items-center text-xs">
                  <span>Kişi Başına Düşen Tutar ({splitPersons} Kişi):</span>
                  <span className="font-mono font-black text-purple-300 text-sm">{(grandTotal / splitPersons).toLocaleString('tr-TR')} ₺</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const share = Math.round((grandTotal / splitPersons) * 100) / 100;
                      showToast(`✅ ${share} ₺ Nakit tahsil edildi (${splitPersons} kişiden biri).`);
                      if (splitPersons <= 1) {
                        setIsSplitModalOpen(false);
                        onCloseBill(table, 'cash');
                      } else {
                        setSplitPersons(p => p - 1);
                      }
                    }}
                    className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase cursor-pointer"
                  >
                    1 Kişi Nakit Öde
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const share = Math.round((grandTotal / splitPersons) * 100) / 100;
                      showToast(`✅ ${share} ₺ Kart ile tahsil edildi (${splitPersons} kişiden biri).`);
                      if (splitPersons <= 1) {
                        setIsSplitModalOpen(false);
                        onCloseBill(table, 'card');
                      } else {
                        setSplitPersons(p => p - 1);
                      }
                    }}
                    className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase cursor-pointer"
                  >
                    1 Kişi Kart Öde
                  </button>
                </div>
              </div>

              {/* Tutar Bazlı Parçalı Ödeme */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300 uppercase">Özel Tutar Girerek Tahsil Et</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customSplitAmount}
                    onChange={(e) => setCustomSplitAmount(e.target.value)}
                    placeholder="Örn: 100"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const amt = Number(customSplitAmount);
                      if (!amt || amt <= 0) {
                        showToast("⚠️ Lütfen geçerli bir tutar girin.");
                        return;
                      }
                      showToast(`✅ ${amt} ₺ parçalı tahsilat yapıldı.`);
                      setCustomSplitAmount('');
                      if (amt >= grandTotal) {
                        setIsSplitModalOpen(false);
                        onCloseBill(table, 'cash');
                      }
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase cursor-pointer"
                  >
                    Nakit Al
                  </button>
                </div>
              </div>
            </div>
            
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsSplitModalOpen(false);
                  onCloseBill(table, 'cash');
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase cursor-pointer"
              >
                Kalan Tüm Hesabı Kapat (Nakit)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISCOUNT MODAL */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 text-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-800 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-black uppercase text-amber-400">🏷️ İskonto / İndirim Uygula</h3>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer", discountType === 'percent' ? "bg-amber-600 text-white" : "text-slate-400")}
                >
                  Yüzde İndirim (%)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('amount')}
                  className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer", discountType === 'amount' ? "bg-amber-600 text-white" : "text-slate-400")}
                >
                  Tutar İndirim (TL)
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  {discountType === 'percent' ? 'İndirim Oranı (%)' : 'İndirim Tutarı (TL)'}
                </label>
                <input
                  type="number"
                  value={discountVal}
                  onChange={(e) => setDiscountVal(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-2">
                {discountType === 'percent' ? (
                  ['5', '10', '15', '20', '25'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDiscountVal(p)}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-mono font-bold cursor-pointer"
                    >
                      %{p}
                    </button>
                  ))
                ) : (
                  ['20', '50', '100', '200'].map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setDiscountVal(a)}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-mono font-bold cursor-pointer"
                    >
                      {a} ₺
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const val = Number(discountVal) || 0;
                  if (val <= 0) {
                    showToast("⚠️ Geçerli bir indirim değeri girin.");
                    return;
                  }
                  let discountTotal = 0;
                  if (discountType === 'percent') {
                    discountTotal = Math.round((grandTotal * val) / 100);
                  } else {
                    discountTotal = val;
                  }
                  const newTotal = Math.max(0, grandTotal - discountTotal);
                  
                  if (table.bill) {
                    table.bill.total = newTotal;
                    table.bill.discountNote = discountType === 'percent' ? `%${val} İndirim (${discountTotal} ₺)` : `${discountTotal} ₺ İndirim`;
                  }
                  showToast(`🏷️ Başarıyla ${discountTotal} ₺ indirim uygulandı! Yeni Tutar: ${newTotal} ₺`);
                  setIsDiscountModalOpen(false);
                }}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer"
              >
                İndirimi Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE CART DRAWER MODAL (Sepeti Aç / Düzenle Penceresi) */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 text-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-800 flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-950 flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-orange-400" />
                <h4 className="font-black text-sm uppercase">Masa Sepet & Adisyon Detayı ({table.name})</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsCartDrawerOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Existing Bill Items */}
              {existingBillItems.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-black uppercase text-slate-400">Önceki Siparişler (Mutfakta / Masada):</div>
                  {existingBillItems.map((bi: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-800 rounded-xl border border-slate-700 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">{bi.qty || bi.quantity}x {bi.name}</p>
                        {bi.notes && <p className="text-[10px] text-slate-400">Not: {bi.notes}</p>}
                      </div>
                      <span className="font-mono font-bold text-orange-400">{(bi.price * (bi.qty || bi.quantity || 1))} ₺</span>
                    </div>
                  ))}
                </div>
              )}

              {/* New Cart Items to Send with Quantity Edit / Delete */}
              {cart.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <div className="text-[11px] font-black uppercase text-orange-400">Eklenen Yeni Ürünler (Sepet):</div>
                  {cart.map((ci, idx) => (
                    <div key={idx} className="p-3 bg-orange-950/40 rounded-xl border border-orange-800/60 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">{ci.name} <span className="text-[10px] text-orange-300">({ci.portion})</span></p>
                        {ci.notes && <p className="text-[10px] text-rose-300">Not: {ci.notes}</p>}
                        <span className="font-mono text-orange-400 font-bold">{ci.price * ci.qty} ₺</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                          <button
                            type="button"
                            onClick={() => {
                              setCart(prev => prev.map((item, i) => i === idx ? { ...item, qty: Math.max(1, item.qty - 1) } : item));
                            }}
                            className="px-2.5 py-1 text-slate-300 hover:bg-slate-700 font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <span className="px-3 py-1 text-white font-mono font-black">{ci.qty}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setCart(prev => prev.map((item, i) => i === idx ? { ...item, qty: item.qty + 1 } : item));
                            }}
                            className="px-2.5 py-1 text-slate-300 hover:bg-slate-700 font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 bg-rose-900/50 hover:bg-rose-800 text-rose-200 rounded-lg cursor-pointer"
                          title="Ürünü Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Yeni eklenen sepet ürünü bulunmuyor. Sol menüden ürün seçebilirsiniz.
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Genel Toplam</span>
                <span className="font-mono text-base font-black text-orange-400">{grandTotal.toLocaleString('tr-TR')} ₺</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Kapat
                </button>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCartDrawerOpen(false);
                      onSendOrder(table, cart);
                    }}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black shadow-lg cursor-pointer"
                  >
                    Mutfağa Gönder
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PORTION & NOTE MODAL */}
      {selectedProductForPortion && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 p-5 space-y-4">
            <h4 className="font-black text-base text-slate-900">{selectedProductForPortion.name}</h4>
            
            {selectedProductForPortion.portions && selectedProductForPortion.portions.length > 0 && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Porsiyon / Boy Seçin:</label>
                <div className="grid grid-cols-2 gap-2">
                  {selectedProductForPortion.portions.map((p: string) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedPortion(p)}
                      className={cn(
                        "py-2 px-3 rounded-xl text-xs font-black border transition-all cursor-pointer",
                        selectedPortion === p ? "bg-orange-600 text-white border-orange-600 shadow-md" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Özel Not / Garson Notu:</label>
              <input
                type="text"
                placeholder="Örn: Soslu olsun, soğansız..."
                value={itemNote}
                onChange={e => setItemNote(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedProductForPortion(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => addItemToCartDirect(selectedProductForPortion, selectedPortion || 'Standart', itemNote)}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-xs font-black shadow-md"
              >
                Sepete Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CafeRestaurantModule;
