'use client';

import React, { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, ShieldAlert, Clock } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { CAPACIDADE_POR_ROTA, PREFIXO_SUPERADMIN, podeAlguma } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * GUARDA DE ROTA
 *
 * O app é exportado como site estático: toda página vira um HTML público, e digitar
 * `/financeiro/` na barra de endereço abre a tela. Esconder o link no menu não impede
 * nada — este componente impede.
 *
 * Continua sendo conveniência, não segurança: o dado em si é protegido pelo
 * `firestore.rules`, que recusa a consulta mesmo que alguém force a tela a montar.
 * O guarda existe para o usuário ver uma mensagem clara em vez de uma tela quebrada
 * cheia de erro de permissão.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { loading, firebaseUser, identidade, situacaoPlano } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const rota = useMemo(() => {
    if (!pathname) return '/';
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
  }, [pathname]);

  const ehAreaDono = rota.startsWith(PREFIXO_SUPERADMIN);
  const capacidadesExigidas = CAPACIDADE_POR_ROTA[rota];

  const liberado = useMemo(() => {
    if (!firebaseUser) return false;
    if (ehAreaDono) return identidade.superadmin;
    // O dono do sistema não navega pelas telas de clínica: ele não tem clínica.
    if (identidade.superadmin && !identidade.clinicaId) return false;
    if (!capacidadesExigidas) return true;
    return podeAlguma(identidade, capacidadesExigidas);
  }, [firebaseUser, identidade, ehAreaDono, capacidadesExigidas]);

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) router.replace('/login/');
  }, [loading, firebaseUser, router]);

  if (loading || !firebaseUser) {
    return (
      <div className="flex h-svh w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Login válido mas sem clínica: acontece logo depois de uma mudança de papéis,
  // quando o token antigo ainda está em cache. Renovar resolve.
  if (!identidade.clinicaId && !identidade.superadmin) {
    return (
      <Aviso
        icone={<Clock className="h-7 w-7" />}
        titulo="Conta ainda sem clínica vinculada"
        texto="Sua conta existe, mas ainda não está ligada a uma clínica. Se você acabou de ser cadastrado, saia e entre novamente para atualizar seu acesso."
      />
    );
  }

  if (!liberado) {
    return (
      <Aviso
        icone={<ShieldAlert className="h-7 w-7" />}
        titulo="Você não tem acesso a esta área"
        texto="Seu perfil não inclui esta função. Se precisar dela para trabalhar, peça ao administrador da clínica para ajustar suas permissões."
      />
    );
  }

  return (
    <>
      {situacaoPlano?.somenteLeitura && <FaixaPlanoVencido />}
      {children}
    </>
  );
}

function Aviso({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-5 rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-border">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          {icone}
        </div>
        <h2 className="font-headline text-xl font-bold text-primary">{titulo}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{texto}</p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/dashboard/">Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}

/** Plano vencido: o sistema fica legível, mas não grava. */
function FaixaPlanoVencido() {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-amber-800">
          Plano vencido — modo somente leitura
        </p>
        <p className="mt-1 text-sm text-amber-700">
          Seus dados continuam aqui e podem ser consultados normalmente. Para voltar a
          registrar atendimentos, renove o plano.
        </p>
      </div>
      <Button asChild className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700">
        <Link href="/perfil/">Ver meu plano</Link>
      </Button>
    </div>
  );
}
