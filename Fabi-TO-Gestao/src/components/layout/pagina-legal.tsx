'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { SecaoLegal } from '@/app/lib/legal';

/**
 * Página de texto legal. Acessível sem login de propósito: quem ainda não tem
 * conta precisa poder ler os termos antes de aceitar, e o titular de dados precisa
 * poder consultar a política sem depender da clínica.
 */
export function PaginaLegal({
  titulo,
  subtitulo,
  versao,
  atualizadoEm,
  secoes,
}: {
  titulo: string;
  subtitulo: string;
  versao: string;
  atualizadoEm: string;
  secoes: SecaoLegal[];
}) {
  return (
    <div className="min-h-screen bg-[#F1F4F5] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <Link
          href="/login/"
          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" /> Voltar
        </Link>

        <header className="space-y-3 rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-border">
          <h1 className="font-headline text-3xl font-bold text-primary">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Versão {versao} · Atualizado em {atualizadoEm}
          </p>
        </header>

        <article className="space-y-8 rounded-[2rem] bg-white p-8 shadow-xl ring-1 ring-border">
          {secoes.map((secao) => (
            <section key={secao.titulo} className="space-y-3">
              <h2 className="font-headline text-lg font-bold text-primary">{secao.titulo}</h2>
              {secao.paragrafos.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-slate-700">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </article>

        <footer className="pb-10 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60">
          <Link href="/termos/" className="font-bold hover:underline">
            Termos de Uso
          </Link>
          {' · '}
          <Link href="/privacidade/" className="font-bold hover:underline">
            Política de Privacidade
          </Link>
        </footer>
      </div>
    </div>
  );
}
