import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Settings as SettingsIcon, Shield, UserCheck, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Settings: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const { role: currentUserRole } = useAuth();

  useEffect(() => {
    if (currentUserRole !== 'admin') return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [currentUserRole]);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'staff' : 'admin';
    await updateDoc(doc(db, 'users', userId), { role: newRole });
  };

  return (
    <div className="p-3 sm:p-4 lg:p-8 space-y-4 lg:space-y-6 max-w-4xl mx-auto">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm group">
          <SettingsIcon className="w-5 h-5 transition-transform group-hover:rotate-90" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Sistem Ayarları</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Kullanıcı yetkilendirme ve uygulama yapılandırması.</p>
        </div>
      </header>

      <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-900">Kullanıcı Yetkileri</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {users.map(user => (
            <div key={user.id} className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                  {user.email.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{user.email}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Rol: <span className="capitalize font-bold text-blue-600">{user.role === 'admin' ? 'Yönetici' : 'Personel'}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => toggleRole(user.id, user.role)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                ROLÜ DEĞİŞTİR
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="max-w-2xl bg-blue-50 border border-blue-100 p-6 rounded-xl space-y-2">
        <h4 className="text-blue-900 font-bold flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          Uygulama Bilgisi
        </h4>
        <p className="text-blue-700 text-sm">
          Bu uygulama özel olarak AI Studio ile geliştirilmiştir. 
          Tüm verileriniz Firebase bulut altyapısında güvenle saklanmaktadır.
        </p>
      </div>
    </div>
  );
};

export default Settings;
