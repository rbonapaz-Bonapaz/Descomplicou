'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS } from '@/app/lib/legal';
import { PLATAFORMA } from '@/lib/tenancy';

/**
 * ACEITE DE TERMOS
 *
 * Bloqueia o sistema até a pessoa aceitar a versão vigente dos termos e da política.
 *
 * O aceite é gravado por usuário E por versão (`aceites/{uid}_{versao}`), e as regras
 * o tornam imutável: cria uma vez e nunca mais muda. Sem versão registrada, não há
 * como provar depois a que a pessoa consentiu — e é justamente essa prova que a LGPD
 * exige de quem trata dado sensível.
 *
 * Quando o texto muda, `VERSAO_TERMOS` sobe e o aceite é pedido de novo.
 */
export function AceiteTermos({ children }: { children: React.ReactNode }) {
  const db = useFirestore();
  const { firebaseUser, identidade, loading } = useAuth();
  const [aceito, setAceito] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  const idAceite = firebaseUser ? `${firebaseUser.uid}_${VERSAO_TERMOS}` : null;

  useEffect(() => {
    if (!db || !firebaseUser || !idAceite) return;
    let cancelado = false;

    getDoc(doc(db, PLATAFORMA.aceites, idAceite))
      .then((snap) => {
        if (!cancelado) setAceito(snap.exists());
      })
      // Falha de leitura não pode trancar quem já aceitou: em caso de erro
      // deixamos passar e o aceite é reconferido na próxima sessão.
      .catch(() => !cancelado && setAceito(true));

    return () => {
      cancelado = true;
    };
  }, [db, firebaseUser, idAceite]);

  const registrar = useCallback(async () => {
    if (!db || !firebaseUser || !idAceite) return;
    setSalvando(true);
    try {
      await setDoc(doc(db, PLATAFORMA.aceites, idAceite), {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        versao_termos: VERSAO_TERMOS,
        versao_privacidade: VERSAO_PRIVACIDADE,
        aceito_em: new Date().toISOString(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      });
      setAceito(true);
    } finally {
      setSalvando(false);
    }
  }, [db, firebaseUser, idAceite]);

  // Sem login, ou ainda carregando: nada a fazer aqui.
  if (loading || !firebaseUser || aceito === null) return <>{children}</>;
  if (aceito) return <>{children}</>;

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#F1F4F5] p-4">
      <div className="w-full max-w-lg space-y-6 rounded-[2rem] bg-white p-8 shadow-2xl ring-1 ring-border">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h1 className="font-headline text-2xl font-bold text-primary">
            Antes de continuar
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Atualizamos nossos termos. Para seguir usando o sistema, confirme que você
            leu e concorda com os documentos abaixo.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-slate-50 p-5 text-sm">
          <Link href="/termos/" target="_blank" className="block font-bold text-primary hover:underline">
            → Termos de Uso (versão {VERSAO_TERMOS})
          </Link>
          <Link href="/privacidade/" target="_blank" className="block font-bold text-primary hover:underline">
            → Política de Privacidade (versão {VERSAO_PRIVACIDADE})
          </Link>
        </div>

        {identidade.clinicaId && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
            Você é responsável pelo conteúdo que registrar no sistema, inclusive por
            dados de pacientes, e pelo sigilo do seu acesso. Não compartilhe seu login:
            é ele que identifica quem registrou cada evolução.
          </p>
        )}

        <Button
          onClick={registrar}
          disabled={salvando}
          className="h-13 w-full rounded-2xl bg-primary py-4 text-[11px] font-black uppercase tracking-[0.2em] shadow-xl"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Li e concordo'}
        </Button>
      </div>
    </div>
  );
}
