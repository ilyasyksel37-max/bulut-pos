import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { 
  TenantInfo, 
  DEFAULT_TENANT, 
  PRIMARY_TENANT_ID, 
  getActiveTenantId, 
  setActiveTenantId, 
  isDocInTenant, 
  withTenant,
  StaffType,
  getStaffTypeBadge,
  isSepetayTenant
} from '../lib/tenant';
import { sepetayLiveSync } from '../lib/sepetay-live-sync';
import { initCashRegisters } from '../lib/kasa-utils';

export type { StaffType };

export interface PersonnelPermissions {
  pos: boolean;            // Hızlı Satış (POS)
  kasa: boolean;           // Kasa Yönetimi
  field_orders: boolean;   // Saha Siparişleri
  inventory: boolean;      // Stok & Ürünler
  customers: boolean;      // Müşteriler & Cari
  suppliers: boolean;      // Tedarikçiler
  dashboard: boolean;      // Raporlar & Ciro
  personnel: boolean;      // Personel & Yetki Yönetimi
  expenses: boolean;       // Giderler
  settings: boolean;       // Ayarlar
  canDiscount?: boolean;   // İskonto Yetkisi
  canFulfillOrders?: boolean; // Merkez Sipariş Onaylama / Hazırlama
  canEditPrice?: boolean;  // Fiyat Değiştirme
  canAccessCafe?: boolean; // Kafe & Restoran Modülü
  isGarson?: boolean;      // Mobil Garson Ekranı
  isMutfak?: boolean;      // Mutfak & Bar Ekranı - KDS
}

// 🏢 İşletme Yöneticisi (Tenant Admin)
export const DEFAULT_ADMIN_PERMISSIONS: PersonnelPermissions = {
  pos: true,
  kasa: true,
  field_orders: true,
  inventory: true,
  customers: true,
  suppliers: true,
  dashboard: true,
  personnel: true,
  expenses: true,
  settings: true,
  canDiscount: true,
  canFulfillOrders: true,
  canEditPrice: true,
  canAccessCafe: true,
  isGarson: true,
  isMutfak: true,
};

// 🏬 Mağaza Personeli (Kasiyer)
export const STORE_STAFF_PERMISSIONS: PersonnelPermissions = {
  pos: true,
  kasa: true,
  field_orders: false,
  inventory: true,
  customers: true,
  suppliers: false,
  dashboard: false,
  personnel: false,
  expenses: true,
  settings: false,
  canDiscount: false,
  canFulfillOrders: true,
  canEditPrice: false,
};

// 🚚 Saha Satış Personeli
export const FIELD_STAFF_PERMISSIONS: PersonnelPermissions = {
  pos: false,
  kasa: false,
  field_orders: true,
  inventory: true,
  customers: true,
  suppliers: false,
  dashboard: false,
  personnel: false,
  expenses: false,
  settings: false,
  canDiscount: true,
  canFulfillOrders: false,
  canEditPrice: false,
};

export const DEFAULT_STAFF_PERMISSIONS = STORE_STAFF_PERMISSIONS;

interface AuthContextType {
  user: any | null;
  role: 'admin' | 'staff' | 'demo' | null;
  isDemo: boolean;
  loading: boolean;
  error: string | null;
  subscriptionStatus: 'active' | 'inactive' | 'trial' | null;
  tenantId: string;
  tenantName: string;
  currentTenant: TenantInfo;
  isSuperAdmin: boolean;
  allTenants: TenantInfo[];
  switchTenant: (newTenantId: string) => void;
  createTenant: (tenantData: Partial<TenantInfo>, adminPass: string) => Promise<{ success: boolean; message?: string }>;
  isDocInTenant: (docData: any) => boolean;
  withTenant: <T extends Record<string, any>>(data: T) => T & { tenantId: string };
  login: (requestedRole?: 'admin' | 'staff') => Promise<void>;
  loginStaff: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  loginAdmin: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  loginAdminWithPassword: (password: string, username?: string) => Promise<{ success: boolean; message?: string }>;
  loginDemo: () => void;
  logout: () => Promise<void>;
  checkDemoRestricted: (actionName?: string) => boolean;
  hasPermission: (permission: keyof PersonnelPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | 'demo' | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'inactive' | 'trial' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState<'admin' | 'staff' | null>(null);

  // Multi-Tenant States
  const [allTenants, setAllTenants] = useState<TenantInfo[]>([DEFAULT_TENANT]);
  const [currentTenantIdState, setCurrentTenantIdState] = useState<string>(() => getActiveTenantId());

  const isDemo = role === 'demo';

  // Platform Super Administrator check (can manage & switch all tenants)
  const isSuperAdmin = Boolean(
    user?.email?.toLowerCase() === 'ilyasyksel37@gmail.com' ||
    user?.isSuperAdmin === true ||
    (user?.role === 'admin' && user?.uid === 'admin-master')
  );

  // Active Tenant ID: Super Admin can switch tenants, standard users are locked to their tenant
  const tenantId = isSuperAdmin 
    ? (currentTenantIdState || PRIMARY_TENANT_ID)
    : (user?.tenantId || PRIMARY_TENANT_ID);

  const currentTenant = allTenants.find(t => t.id === tenantId || (isSepetayTenant(tenantId) && isSepetayTenant(t.id))) || {
    id: tenantId,
    name: user?.tenantName || (tenantId === PRIMARY_TENANT_ID ? 'Beyoğlu Kırtasiye' : isSepetayTenant(tenantId) ? 'Sepetay Kırtasiye' : 'İşletme Mağazası'),
    code: tenantId.replace('tenant-', '').toUpperCase().slice(0, 6),
    status: 'active'
  };

  const tenantName = currentTenant.name;

  // Real-time listener for tenants collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tenants'), (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as TenantInfo));
        if (!list.some(t => t.id === PRIMARY_TENANT_ID)) {
          list.unshift(DEFAULT_TENANT);
        }
        setAllTenants(list);
      } else {
        setAllTenants([DEFAULT_TENANT]);
        setDoc(doc(db, 'tenants', PRIMARY_TENANT_ID), DEFAULT_TENANT).catch(console.warn);
      }
    }, (err) => {
      console.warn("Tenants listener error:", err);
    });
    return () => unsub();
  }, []);

  // Real-time live sync for Sepetay direct Firebase mapping
  useEffect(() => {
    sepetayLiveSync.activate(tenantId);
    return () => {
      // Keep active while app is running
    };
  }, [tenantId]);

  const switchTenant = (newTenantId: string) => {
    if (!isSuperAdmin) {
      console.warn("Sadece platform yöneticisi kiracı değiştirebilir.");
      return;
    }
    setActiveTenantId(newTenantId);
    setCurrentTenantIdState(newTenantId);
  };

  const createTenant = async (tenantData: Partial<TenantInfo>, adminPass: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const generatedSlug = (tenantData.code || tenantData.name || Date.now().toString())
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-');
      const newTenantId = (tenantData.id || `tenant-${generatedSlug}`).trim();
      const newTenantName = (tenantData.name || 'Yeni İşletme').trim();
      const code = (tenantData.code || newTenantId.replace('tenant-', '').slice(0, 6)).toUpperCase();
      const adminUsername = (tenantData.adminUsername || `admin_${code.toLowerCase()}`).trim().toLowerCase();
      const cleanPass = adminPass.trim() || '123456';

      // 1. Create tenant doc
      const newTenant: TenantInfo = {
        id: newTenantId,
        name: newTenantName,
        code,
        status: tenantData.status || 'active',
        package: tenantData.package || 'pro',
        expiresAt: tenantData.expiresAt,
        adminUsername,
        phone: tenantData.phone || '',
        address: tenantData.address || '',
        enabledModules: tenantData.enabledModules || {},
        modules: tenantData.modules || {},
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'tenants', newTenantId), newTenant);

      // 2. Create Tenant Admin (İşletme Yöneticisi)
      const adminUserData = {
        uid: `admin-${newTenantId}`,
        id: `admin-${newTenantId}`,
        username: adminUsername,
        password: cleanPass,
        displayName: `${newTenantName} Yöneticisi`,
        role: 'admin',
        sellerCode: 'Y01',
        staffType: 'admin',
        tenantId: newTenantId,
        tenantName: newTenantName,
        permissions: DEFAULT_ADMIN_PERMISSIONS,
        subscriptionStatus: 'active',
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', adminUserData.id), adminUserData);

      // 3. Create starter Store Staff (Mağaza Personeli / Kasiyer)
      const storeStaff = {
        uid: `kasiyer-${newTenantId}`,
        id: `kasiyer-${newTenantId}`,
        username: `kasiyer_${code.toLowerCase()}`,
        password: '123',
        displayName: `${newTenantName} Kasiyeri`,
        role: 'staff',
        sellerCode: 'K01',
        staffType: 'store',
        tenantId: newTenantId,
        tenantName: newTenantName,
        permissions: STORE_STAFF_PERMISSIONS,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', storeStaff.id), storeStaff);

      // 4. Create starter Field Staff (Saha Satış Personeli)
      const fieldStaff = {
        uid: `saha-${newTenantId}`,
        id: `saha-${newTenantId}`,
        username: `saha_${code.toLowerCase()}`,
        password: '123',
        displayName: `${newTenantName} Saha Satış`,
        role: 'staff',
        sellerCode: 'S01',
        staffType: 'field',
        tenantId: newTenantId,
        tenantName: newTenantName,
        permissions: FIELD_STAFF_PERMISSIONS,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', fieldStaff.id), fieldStaff);

      // 5. Initialize cash registers for new tenant
      await initCashRegisters(newTenantId);

      // Switch view if super admin
      if (isSuperAdmin) {
        switchTenant(newTenantId);
      }

      return { success: true };
    } catch (err: any) {
      console.error("createTenant error:", err);
      return { success: false, message: err?.message || 'Kiracı oluşturulurken hata oluştu.' };
    }
  };

  const isDocInCurrentTenant = (docData: any) => isDocInTenant(docData, tenantId);
  const withCurrentTenant = <T extends Record<string, any>>(data: T) => withTenant(data, tenantId);

  const checkDemoRestricted = (actionName = 'Bu işlem'): boolean => {
    if (role === 'demo') {
      alert(`⚠️ Demo Girişi: Sistem sadece kontrol ve inceleme amaçlıdır. ${actionName} gerçekleştirilemez.`);
      return true;
    }
    return false;
  };

  const hasPermission = (permission: keyof PersonnelPermissions | string): boolean => {
    if (role === 'admin') return true;
    if (role === 'demo') {
      // Demo mode can view all normal tabs
      return true;
    }
    if (role === 'staff') {
      if (permission === 'kafe_restoran_modulu') {
        return Boolean(user?.permissions?.canAccessCafe || user?.permissions?.isGarson || user?.permissions?.isMutfak || user?.cafeRole === 'garson' || user?.cafeRole === 'mutfak' || user?.staffType === 'garson' || user?.staffType === 'mutfak');
      }
      if (user?.permissions && user.permissions[permission as keyof PersonnelPermissions] !== undefined) {
        return Boolean(user.permissions[permission as keyof PersonnelPermissions]);
      }
      return Boolean(DEFAULT_STAFF_PERMISSIONS[permission as keyof PersonnelPermissions]);
    }
    return false;
  };

  useEffect(() => {
    // Check local storage for bypass session
    const savedSession = localStorage.getItem('sep_session');
    if (savedSession) {
      try {
        const sessionData = JSON.parse(savedSession);
        setUser(sessionData.user);
        setRole(sessionData.role);
        setLoading(false);
        if (sessionData.role === 'demo' || sessionData.role === 'staff') {
          return;
        }
        setSubscriptionStatus(sessionData.subscriptionStatus || 'inactive');
      } catch (e) {
        localStorage.removeItem('sep_session');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      // If demo or staff mode was loaded from localStorage, don't overwrite
      const currentStored = localStorage.getItem('sep_session');
      if (currentStored) {
        try {
          const parsed = JSON.parse(currentStored);
          if (parsed.role === 'demo' || parsed.role === 'staff') {
            setLoading(false);
            return;
          }
        } catch (e) {}
      }

      if (fbUser) {
        try {
          setError(null);
          setUser(fbUser);
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setRole(userData.role);
            setSubscriptionStatus(userData.subscriptionStatus || 'inactive');
            setUser({ ...fbUser, ...userData, permissions: userData.permissions || (userData.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS) });
          } else {
            // Check pre_auth_users for an invitation
            const q = query(collection(db, 'pre_auth_users'), where('email', '==', fbUser.email?.toLowerCase()));
            const preAuthSnap = await getDocs(q);
            
            let finalRole: 'admin' | 'staff' = targetRole || 'staff';
            let displayName = fbUser.displayName;
            let sellerCode = 'E01';
            let permissions = DEFAULT_STAFF_PERMISSIONS;

            if (!preAuthSnap.empty) {
              const preAuthData = preAuthSnap.docs[0].data();
              finalRole = preAuthData.role;
              if (preAuthData.displayName) displayName = preAuthData.displayName;
              if (preAuthData.sellerCode) sellerCode = preAuthData.sellerCode;
              if (preAuthData.permissions) permissions = preAuthData.permissions;
            } else if (fbUser.email?.toLowerCase() === 'ilyasyksel37@gmail.com') {
              finalRole = 'admin';
              sellerCode = 'Y01';
              permissions = DEFAULT_ADMIN_PERMISSIONS;
            } else {
              // Not authorized
              await signOut(auth);
              setError("Bu sisteme giriş yetkiniz bulunmamaktadır. Lütfen yönetici ile iletişime geçin.");
              setLoading(false);
              return;
            }

            const newUserData = {
              email: fbUser.email?.toLowerCase(),
              displayName: displayName,
              role: finalRole,
              sellerCode: sellerCode,
              permissions: permissions,
              subscriptionStatus: 'trial',
              createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'users', fbUser.uid), newUserData);
            setRole(finalRole);
            setSubscriptionStatus('trial');
            setUser({ ...fbUser, ...newUserData });
          }
        } catch (err: any) {
          console.error("Auth error:", err);
          setError(err.message || "Giriş sırasında bir hata oluştu.");
        }
      }
      if (!savedSession) setLoading(false);
    });

    return unsubscribe;
  }, [targetRole]);

  // Google OAuth Login
  const login = async (requestedRole?: 'admin' | 'staff') => {
    try {
      setError(null);
      if (requestedRole) setTargetRole(requestedRole);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Google girişi başarısız oldu. Lütfen tarayıcı ayarlarınızı kontrol edin.");
    }
  };

  // Dedicated Username + Password Login for Personnel
  const loginStaff = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      return { success: false, message: 'Lütfen kullanıcı adı ve şifrenizi girin.' };
    }

    try {
      setError(null);
      // Query users collection by username
      const qUsername = query(collection(db, 'users'), where('username', '==', cleanUser));
      let snap = await getDocs(qUsername);

      // Fallback 1: check email
      if (snap.empty) {
        const qEmail = query(collection(db, 'users'), where('email', '==', cleanUser));
        snap = await getDocs(qEmail);
      }

      // Fallback 2: check sellerCode
      if (snap.empty) {
        const qCode = query(collection(db, 'users'), where('sellerCode', '==', cleanUser.toUpperCase()));
        snap = await getDocs(qCode);
      }

      if (snap.empty) {
        // Fallback: If user enters sample credentials on a fresh system
        if ((cleanUser === 'saha01' || cleanUser === 'kasiyer01') && cleanPass === '123') {
          const isSaha = cleanUser === 'saha01';
          const defaultStaff = {
            uid: `staff-${cleanUser}`,
            id: `staff-${cleanUser}`,
            username: cleanUser,
            displayName: isSaha ? 'Ahmet Yılmaz (Saha Satış)' : 'Ayşe Kaya (Kasiyer & Kasa)',
            sellerCode: isSaha ? 'E01' : 'E02',
            role: 'staff',
            isActive: true,
            permissions: isSaha ? {
              ...DEFAULT_STAFF_PERMISSIONS,
              pos: false,
              field_orders: true,
              customers: true,
              inventory: true,
              kasa: false,
              dashboard: false,
              suppliers: false,
              personnel: false,
              expenses: false,
              settings: false,
              canDiscount: true,
              canFulfillOrders: false,
              canEditPrice: false
            } : {
              ...DEFAULT_STAFF_PERMISSIONS,
              pos: true,
              kasa: true,
              field_orders: false,
              customers: true,
              inventory: true,
              dashboard: false,
              suppliers: false,
              personnel: false,
              expenses: true,
              settings: false,
              canDiscount: false,
              canFulfillOrders: true,
              canEditPrice: false
            }
          };

          try {
            await setDoc(doc(db, 'users', defaultStaff.id), {
              ...defaultStaff,
              password: '123',
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn("Could not save initial staff record:", e);
          }

          setUser(defaultStaff);
          setRole('staff');
          setLoading(false);
          localStorage.setItem('sep_session', JSON.stringify({ user: defaultStaff, role: 'staff' }));
          return { success: true };
        }

        return { success: false, message: 'Bu kullanıcı adına ait personel kaydı bulunamadı. Lütfen yöneticiniz ile görüşün.' };
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data();

      // Check active state
      if (userData.isActive === false) {
        return { success: false, message: 'Bu personel hesabı pasif durumdadır. Lütfen yöneticinize başvurun.' };
      }

      // Verify password
      const storedPass = String(userData.password || '');
      if (storedPass !== cleanPass) {
        return { success: false, message: 'Girdiğiniz şifre hatalı. Lütfen tekrar deneyin.' };
      }

      const staffUser = {
        uid: userDoc.id,
        id: userDoc.id,
        ...userData,
        tenantId: userData.tenantId || PRIMARY_TENANT_ID,
        tenantName: userData.tenantName || 'Beyoğlu Kırtasiye',
        staffType: userData.staffType || (userData.permissions?.field_orders && !userData.permissions?.pos ? 'field' : 'store'),
        role: userData.role || 'staff',
        permissions: userData.permissions || (userData.staffType === 'field' ? FIELD_STAFF_PERMISSIONS : STORE_STAFF_PERMISSIONS),
      };

      setActiveTenantId(staffUser.tenantId);
      setCurrentTenantIdState(staffUser.tenantId);
      setUser(staffUser);
      setRole(staffUser.role as any);
      setLoading(false);
      localStorage.setItem('sep_session', JSON.stringify({ user: staffUser, role: staffUser.role, subscriptionStatus: (staffUser as any).subscriptionStatus || 'inactive' }));

      if (!auth.currentUser) {
        signInAnonymously(auth).catch(() => {});
      }

      return { success: true };
    } catch (err: any) {
      console.error("loginStaff error:", err);
      return { success: false, message: err.message || 'Giriş yapılırken sunucu hatası oluştu.' };
    }
  };

  // Administrator login with username/code AND password to prevent collisions
  const loginAdmin = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();

    if (!cleanUser) {
      return { success: false, message: 'Lütfen yönetici kullanıcı adınızı, işletme kodunuzu veya e-posta adresinizi girin.' };
    }
    if (!cleanPass) {
      return { success: false, message: 'Lütfen yönetici şifrenizi girin.' };
    }

    try {
      const lowerUser = cleanUser.toLowerCase();

      // 1. Check all admin users in firestore
      const qAdmin = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminSnap = await getDocs(qAdmin);
      
      let matchedAdmin: any = null;
      let userExistsWithUsername = false;

      adminSnap.forEach(d => {
        const data = d.data();
        const storedUsername = String(data.username || '').toLowerCase().trim();
        const storedEmail = String(data.email || '').toLowerCase().trim();
        const storedCode = String(data.sellerCode || '').toLowerCase().trim();
        const storedTenantId = String(data.tenantId || '').toLowerCase().trim();
        const docId = d.id.toLowerCase().trim();

        const isUserMatch = 
          storedUsername === lowerUser ||
          storedEmail === lowerUser ||
          storedCode === lowerUser ||
          storedTenantId === lowerUser ||
          docId === `admin-${lowerUser}` ||
          docId === lowerUser;

        if (isUserMatch) {
          userExistsWithUsername = true;
          if (data.password && String(data.password).trim() === cleanPass) {
            matchedAdmin = { id: d.id, uid: d.id, ...data };
          }
        }
      });

      // 2. Also check tenants collection to match tenant adminUsername, code or id
      if (!matchedAdmin) {
        try {
          const tenantSnap = await getDocs(collection(db, 'tenants'));
          tenantSnap.forEach(tDoc => {
            const tData = tDoc.data();
            const tAdminUser = String(tData.adminUsername || '').toLowerCase().trim();
            const tCode = String(tData.code || '').toLowerCase().trim();
            const tId = tDoc.id.toLowerCase().trim();

            if (tAdminUser === lowerUser || tCode === lowerUser || tId === lowerUser) {
              userExistsWithUsername = true;
              // Check if there is an admin for this tenant whose password matches
              adminSnap.forEach(d => {
                const data = d.data();
                if (data.tenantId === tDoc.id && data.password && String(data.password).trim() === cleanPass) {
                  matchedAdmin = { id: d.id, uid: d.id, ...data };
                }
              });
            }
          });
        } catch (tErr) {
          console.warn("Tenant check notice:", tErr);
        }
      }


      // 3. Super Admin fallback for primary root manager accounts
      const isSuperAdminCandidate = 
        lowerUser === 'admin' || 
        lowerUser === 'admin_beyoglu' || 
        lowerUser === 'beyoglu' || 
        lowerUser === 'superadmin' || 
        lowerUser === 'ilyas' || 
        lowerUser === 'ilyasyksel37@gmail.com' ||
        lowerUser === 'y01';

      if (!matchedAdmin && isSuperAdminCandidate && cleanPass === '1921') {
        matchedAdmin = {
          uid: 'admin-master',
          id: 'admin-master',
          email: 'ilyasyksel37@gmail.com',
          username: lowerUser,
          displayName: 'Yönetici (Tam Yetkili)',
          sellerCode: 'Y01',
          role: 'admin',
          tenantId: PRIMARY_TENANT_ID,
          tenantName: 'Beyoğlu Kırtasiye',
          isSuperAdmin: true,
          permissions: DEFAULT_ADMIN_PERMISSIONS
        };
      }

      if (!matchedAdmin) {
        if (userExistsWithUsername) {
          return { success: false, message: 'Girdiğiniz yönetici şifresi hatalı! Lütfen kontrol edin.' };
        }
        return { success: false, message: 'Bu kullanıcı adı veya koda ait yönetici hesabı bulunamadı!' };
      }

      const adminTenantId = matchedAdmin.tenantId || PRIMARY_TENANT_ID;
      const adminTenantName = matchedAdmin.tenantName || (adminTenantId === PRIMARY_TENANT_ID ? 'Beyoğlu Kırtasiye' : 'İşletme Mağazası');

      const adminUser = {
        ...matchedAdmin,
        tenantId: adminTenantId,
        tenantName: adminTenantName,
        role: 'admin',
        isSuperAdmin: Boolean(matchedAdmin.email?.toLowerCase() === 'ilyasyksel37@gmail.com' || matchedAdmin.uid === 'admin-master' || matchedAdmin.isSuperAdmin),
        permissions: DEFAULT_ADMIN_PERMISSIONS
      };

      setActiveTenantId(adminTenantId);
      setCurrentTenantIdState(adminTenantId);
      setUser(adminUser);
      setRole('admin');
      setLoading(false);
      localStorage.setItem('sep_session', JSON.stringify({ user: adminUser, role: 'admin', subscriptionStatus: adminUser.subscriptionStatus || 'active' }));

      if (!auth.currentUser) {
        signInAnonymously(auth).catch(() => {});
      }

      return { success: true };
    } catch (err: any) {
      console.error("loginAdmin error:", err);
      return { success: false, message: 'Giriş doğrulanırken bir hata oluştu: ' + (err.message || '') };
    }
  };

  // Backwards compatibility wrapper
  const loginAdminWithPassword = async (password: string, username?: string): Promise<{ success: boolean; message?: string }> => {
    return loginAdmin(username || 'admin', password);
  };

  const loginDemo = () => {
    setError(null);
    const demoUser = {
      uid: 'demo-user-guest',
      email: 'demo@bulutpos.local',
      displayName: 'Demo Girişi (Kontrol Amaçlı)',
      sellerCode: 'D01',
      tenantId: PRIMARY_TENANT_ID,
      tenantName: 'Beyoğlu Kırtasiye (Demo)',
      photoURL: null,
      isAnonymous: true,
      permissions: DEFAULT_ADMIN_PERMISSIONS
    };
    setUser(demoUser);
    setRole('demo');
    setLoading(false);
    localStorage.setItem('sep_session', JSON.stringify({ user: demoUser, role: 'demo', isDemo: true, subscriptionStatus: 'active' }));
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(() => {});
    }
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (e) {
      console.warn("SignOut error:", e);
    }
    setUser(null);
    setRole(null);
    localStorage.removeItem('sep_session');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      role, 
      subscriptionStatus,
      isDemo, 
      loading, 
      error,
      tenantId,
      tenantName,
      currentTenant,
      isSuperAdmin,
      allTenants,
      switchTenant,
      createTenant,
      isDocInTenant: isDocInCurrentTenant,
      withTenant: withCurrentTenant,
      login, 
      loginStaff,
      loginAdmin,
      loginAdminWithPassword,
      loginDemo, 
      logout, 
      checkDemoRestricted,
      hasPermission
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
