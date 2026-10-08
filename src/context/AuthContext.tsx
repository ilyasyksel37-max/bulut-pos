import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

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
}

export const DEFAULT_STAFF_PERMISSIONS: PersonnelPermissions = {
  pos: true,
  kasa: false,
  field_orders: true,
  inventory: true,
  customers: true,
  suppliers: false,
  dashboard: false,
  personnel: false,
  expenses: false,
  settings: false,
  canDiscount: false,
  canFulfillOrders: false,
  canEditPrice: false,
};

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
};

interface AuthContextType {
  user: any | null;
  role: 'admin' | 'staff' | 'demo' | null;
  isDemo: boolean;
  loading: boolean;
  error: string | null;
  login: (requestedRole?: 'admin' | 'staff') => Promise<void>;
  loginStaff: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  loginAdminWithPassword: (password: string) => Promise<{ success: boolean; message?: string }>;
  loginDemo: () => void;
  logout: () => Promise<void>;
  checkDemoRestricted: (actionName?: string) => boolean;
  hasPermission: (permission: keyof PersonnelPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | 'demo' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState<'admin' | 'staff' | null>(null);

  const isDemo = role === 'demo';

  const checkDemoRestricted = (actionName = 'Bu işlem'): boolean => {
    if (role === 'demo') {
      alert(`⚠️ Demo Girişi: Sistem sadece kontrol ve inceleme amaçlıdır. ${actionName} gerçekleştirilemez.`);
      return true;
    }
    return false;
  };

  const hasPermission = (permission: keyof PersonnelPermissions): boolean => {
    if (role === 'admin') return true;
    if (role === 'demo') {
      // Demo mode can view all normal tabs
      return true;
    }
    if (role === 'staff') {
      if (user?.permissions && user.permissions[permission] !== undefined) {
        return Boolean(user.permissions[permission]);
      }
      return Boolean(DEFAULT_STAFF_PERMISSIONS[permission]);
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
              createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'users', fbUser.uid), newUserData);
            setRole(finalRole);
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
        role: userData.role || 'staff',
        permissions: userData.permissions || DEFAULT_STAFF_PERMISSIONS,
      };

      setUser(staffUser);
      setRole(staffUser.role as any);
      setLoading(false);
      localStorage.setItem('sep_session', JSON.stringify({ user: staffUser, role: staffUser.role }));

      return { success: true };
    } catch (err: any) {
      console.error("loginStaff error:", err);
      return { success: false, message: err.message || 'Giriş yapılırken sunucu hatası oluştu.' };
    }
  };

  // Administrator login with password / PIN
  const loginAdminWithPassword = async (password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanPass = password.trim();
    if (!cleanPass) {
      return { success: false, message: 'Lütfen yönetici şifresini girin.' };
    }

    try {
      // 1. Check if an admin user in firestore has this password
      const qAdmin = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminSnap = await getDocs(qAdmin);
      
      let matchedAdmin: any = null;
      adminSnap.forEach(d => {
        const data = d.data();
        if (data.password && String(data.password).trim() === cleanPass) {
          matchedAdmin = { id: d.id, uid: d.id, ...data };
        }
      });

      // Master password fallback: 'admin123' or '1234'
      if (!matchedAdmin && (cleanPass === 'admin123' || cleanPass === '1234' || cleanPass === 'admin')) {
        matchedAdmin = {
          uid: 'admin-master',
          id: 'admin-master',
          email: 'ilyasyksel37@gmail.com',
          displayName: 'Yönetici (Tam Yetkili)',
          sellerCode: 'Y01',
          role: 'admin',
          permissions: DEFAULT_ADMIN_PERMISSIONS
        };
      }

      if (!matchedAdmin) {
        return { success: false, message: 'Hatalı yönetici şifresi!' };
      }

      const adminUser = {
        ...matchedAdmin,
        role: 'admin',
        permissions: DEFAULT_ADMIN_PERMISSIONS
      };

      setUser(adminUser);
      setRole('admin');
      setLoading(false);
      localStorage.setItem('sep_session', JSON.stringify({ user: adminUser, role: 'admin' }));

      return { success: true };
    } catch (err: any) {
      console.error("loginAdminWithPassword error:", err);
      return { success: false, message: 'Giriş doğrulanırken bir hata oluştu.' };
    }
  };

  const loginDemo = () => {
    setError(null);
    const demoUser = {
      uid: 'demo-user-guest',
      email: 'demo@bulutpos.local',
      displayName: 'Demo Girişi (Kontrol Amaçlı)',
      sellerCode: 'D01',
      photoURL: null,
      isAnonymous: true,
      permissions: DEFAULT_ADMIN_PERMISSIONS
    };
    setUser(demoUser);
    setRole('demo');
    setLoading(false);
    localStorage.setItem('sep_session', JSON.stringify({ user: demoUser, role: 'demo', isDemo: true }));
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
      isDemo, 
      loading, 
      error, 
      login, 
      loginStaff,
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
