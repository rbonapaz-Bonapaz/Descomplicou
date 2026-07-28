'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth as useFirebaseAuth, useFirestore } from '@/firebase';
import type { Assinatura, Clinica, SituacaoPlano, User } from '@/app/lib/types';
import {
  IDENTIDADE_VAZIA,
  pode as podeCapacidade,
  temPapel as temPapelDe,
  type Capacidade,
  type Identidade,
  type Papel,
} from '@/lib/permissions';
import { assinaturaRef, clinicaRef, ref, SUB } from '@/lib/tenancy';
import { useRouter, usePathname } from 'next/navigation';

/**
 * PROVEDOR DE IDENTIDADE
 *
 * A autoridade sobre quem é o usuário vem dos CUSTOM CLAIMS do token, não do
 * documento no Firestore. O documento diz o nome e o telefone; o token diz de qual
 * clínica a pessoa é e o que ela pode fazer. É o token que o `firestore.rules`
 * verifica, então é ele que a tela também precisa obedecer — se a tela olhasse o
 * documento, mostraria botões que o servidor recusa.
 */

interface AuthContextType {
  /** Cadastro do usuário na clínica (nome, foto, contato). */
  user: User | null;
  firebaseUser: FirebaseUser | null;
  /** Papéis e clínica, lidos do token verificado. */
  identidade: Identidade;
  clinica: Clinica | null;
  assinatura: Assinatura | null;
  situacaoPlano: SituacaoPlano | null;
  loading: boolean;
  /** Checagem de permissão para a interface. A trava de verdade está nas regras. */
  pode: (capacidade: Capacidade) => boolean;
  temPapel: (papel: Papel) => boolean;
  /** Recarrega o token após mudança de papéis feita por uma Cloud Function. */
  recarregarPermissoes: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  identidade: IDENTIDADE_VAZIA,
  clinica: null,
  assinatura: null,
  situacaoPlano: null,
  loading: true,
  pode: () => false,
  temPapel: () => false,
  recarregarPermissoes: async () => {},
  logout: async () => {},
});

function calcularSituacao(assinatura: Assinatura | null): SituacaoPlano | null {
  if (!assinatura) return null;

  const agora = Date.now();
  const expiraEm = Number(assinatura.expira_em || 0);
  const encerrado = assinatura.plano === 'vencido' || assinatura.plano === 'cancelado';
  const vencido = encerrado || expiraEm <= agora;
  const emTeste = assinatura.plano === 'teste' && !vencido;

  return {
    plano: assinatura.plano,
    emTeste,
    vencido,
    diasRestantes: vencido ? 0 : Math.ceil((expiraEm - agora) / 86_400_000),
    // Plano vencido não sequestra o dado: a clínica continua consultando o
    // histórico, só não grava. É o mesmo comportamento das regras do Firestore.
    somenteLeitura: vencido,
  };
}

/** Lê a identidade do token. Nunca aceita papéis vindos de documento do banco. */
async function lerIdentidade(fUser: FirebaseUser, forcarAtualizacao = false): Promise<Identidade> {
  const resultado = await fUser.getIdTokenResult(forcarAtualizacao);
  const claims = resultado.claims as Record<string, unknown>;
  const papeis = Array.isArray(claims.papeis) ? (claims.papeis as Papel[]) : [];

  return {
    uid: fUser.uid,
    clinicaId: typeof claims.clinicaId === 'string' ? claims.clinicaId : null,
    papeis,
    superadmin: claims.superadmin === true,
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const auth = useFirebaseAuth();
  const db = useFirestore();
  const router = useRouter();
  const pathname = usePathname();

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [identidade, setIdentidade] = useState<Identidade>(IDENTIDADE_VAZIA);
  const [user, setUser] = useState<User | null>(null);
  const [clinica, setClinica] = useState<Clinica | null>(null);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const cancelar = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);

      if (!fUser) {
        setIdentidade(IDENTIDADE_VAZIA);
        setUser(null);
        setClinica(null);
        setAssinatura(null);
        setLoading(false);
        return;
      }

      setIdentidade(await lerIdentidade(fUser));
      setLoading(false);
    });

    return () => cancelar();
  }, [auth]);

  // Dados da clínica e do próprio cadastro. Tudo escopado pelo `clinicaId` do token:
  // não existe caminho neste app que leia dado sem passar por ele.
  useEffect(() => {
    if (!db || !identidade.uid || !identidade.clinicaId) {
      setUser(null);
      setClinica(null);
      setAssinatura(null);
      return;
    }

    const { clinicaId, uid } = identidade;

    const cancelarUsuario = onSnapshot(
      ref(db, clinicaId, SUB.usuarios, uid),
      (snap) => setUser(snap.exists() ? ({ uid, ...snap.data() } as User) : null),
      () => setUser(null)
    );

    const cancelarClinica = onSnapshot(
      clinicaRef(db, clinicaId),
      (snap) => setClinica(snap.exists() ? ({ id: clinicaId, ...snap.data() } as Clinica) : null),
      () => setClinica(null)
    );

    const cancelarAssinatura = onSnapshot(
      assinaturaRef(db, clinicaId),
      (snap) => setAssinatura(snap.exists() ? (snap.data() as Assinatura) : null),
      () => setAssinatura(null)
    );

    return () => {
      cancelarUsuario();
      cancelarClinica();
      cancelarAssinatura();
    };
  }, [db, identidade]);

  const recarregarPermissoes = useCallback(async () => {
    if (!firebaseUser) return;
    setIdentidade(await lerIdentidade(firebaseUser, true));
  }, [firebaseUser]);

  const logout = useCallback(async () => {
    if (auth) await signOut(auth);
    setIdentidade(IDENTIDADE_VAZIA);
    setUser(null);
    setClinica(null);
    setAssinatura(null);
    router.replace('/login/');
  }, [auth, router]);

  // Redirecionamento básico entre área pública e área logada. A checagem de
  // permissão por rota fica no `RouteGuard`, que roda dentro do layout autenticado.
  useEffect(() => {
    if (loading || !mounted || !pathname) return;

    const publica = ['/login/', '/register/', '/ponto-mobile/', '/termos/', '/privacidade/'].some(
      (rota) => pathname.startsWith(rota)
    );

    if (!firebaseUser && !publica) {
      router.replace('/login/');
    } else if (firebaseUser && (pathname.startsWith('/login/') || pathname.startsWith('/register/'))) {
      router.replace(identidade.superadmin ? '/plataforma/' : '/dashboard/');
    }
  }, [firebaseUser, identidade.superadmin, loading, pathname, mounted, router]);

  const situacaoPlano = useMemo(() => calcularSituacao(assinatura), [assinatura]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      firebaseUser,
      identidade,
      clinica,
      assinatura,
      situacaoPlano,
      loading,
      pode: (capacidade: Capacidade) => podeCapacidade(identidade, capacidade),
      temPapel: (papel: Papel) => temPapelDe(identidade, papel),
      recarregarPermissoes,
      logout,
    }),
    [
      user,
      firebaseUser,
      identidade,
      clinica,
      assinatura,
      situacaoPlano,
      loading,
      recarregarPermissoes,
      logout,
    ]
  );

  if (!mounted) return null;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
