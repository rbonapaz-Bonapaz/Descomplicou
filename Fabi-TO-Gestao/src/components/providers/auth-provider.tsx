'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth as useFirebaseAuth, useFirestore } from '@/firebase';
import { User, UserProfile } from '@/app/lib/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isGestor: boolean;
  isSecretaria: boolean;
  isGuest: boolean;
  logout: () => Promise<void>;
  loginAsGuest: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  isGestor: false,
  isSecretaria: false,
  isGuest: false,
  logout: async () => {},
  loginAsGuest: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const auth = useFirebaseAuth();
  const db = useFirestore();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);

    // Check for existing guest session
    const guestSession = localStorage.getItem('guest_session');
    if (guestSession) {
      setUser(JSON.parse(guestSession));
      setIsGuest(true);
      setLoading(false);
      return;
    }

    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        onSnapshot(doc(db, 'usuarios', fUser.uid), (docSnap) => {
          if (docSnap.exists()) setUser(docSnap.data() as User);
          setLoading(false);
        }, () => setLoading(false));
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [auth, db]);

  useEffect(() => {
    if (!loading && mounted && router && pathname) {
      const isPublic = ['/login/', '/register/', '/ponto-mobile/'].some(r => pathname.startsWith(r));
      const hasAccess = !!firebaseUser || isGuest;
      if (!hasAccess && !isPublic) router.replace('/login/');
      else if (hasAccess && isPublic && !pathname.startsWith('/ponto-mobile')) router.replace('/dashboard/');
    }
  }, [firebaseUser, isGuest, loading, pathname, mounted, router]);

  const loginAsGuest = (profile: UserProfile) => {
    const dummyUser: User = {
      uid: 'guest_uid',
      nome: profile === 'gestor' ? 'Dra. Fabiula Oliveira' : profile === 'secretaria' ? 'Ana Secretária' : 'Dr. Pedro (TO)',
      email: `${profile}@demo.com`,
      perfil: profile,
      role_gestor: profile === 'gestor',
      role_secretaria: profile === 'secretaria',
      role_profissional: profile === 'colaborador' || profile === 'gestor',
      possui_agenda: profile === 'colaborador' || profile === 'gestor',
      area_atuacao: profile === 'gestor' ? 'Terapia Ocupacional' : 'Recepção',
      cor_agenda: profile === 'gestor' ? '#4F6D7A' : '#BA8E32'
    };
    
    // Seed initial dummy data if not exists
    if (!localStorage.getItem('demo_convenios')) {
      localStorage.setItem('demo_convenios', JSON.stringify([
        { id: '1', nome: 'Unimed Rio', tipo: 'convenio', valor_sessao: 110, porcentagem_lucro: 40 },
        { id: 'particular', nome: 'Particular', tipo: 'particular', valor_sessao: 200, porcentagem_lucro: 100 }
      ]));
    }
    
    if (!localStorage.getItem('demo_patients')) {
      localStorage.setItem('demo_patients', JSON.stringify([
        { id: 'p1', nome: 'Ana Silva', data_nascimento: '2015-05-20', telefone: '(21) 98888-7777', convenio_id: '1', queixa_principal: 'Dificuldade sensorial.' },
        { id: 'p2', nome: 'Pedro Souza', data_nascimento: '2018-10-12', telefone: '(21) 97777-6666', convenio_id: 'particular', queixa_principal: 'Atraso motor.' }
      ]));
    }

    localStorage.setItem('guest_session', JSON.stringify(dummyUser));
    setUser(dummyUser);
    setIsGuest(true);
    router.push('/dashboard/');
  };

  const logout = async () => {
    if (auth) await auth.signOut();
    localStorage.removeItem('guest_session');
    setIsGuest(false);
    setUser(null);
    router.replace('/login/');
  };

  const value = useMemo(() => ({
    user, 
    firebaseUser, 
    loading, 
    isGestor: user?.perfil === 'gestor', 
    isSecretaria: user?.perfil === 'secretaria', 
    isGuest,
    logout,
    loginAsGuest
  }), [user, firebaseUser, loading, isGuest]);

  if (!mounted) return null;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
