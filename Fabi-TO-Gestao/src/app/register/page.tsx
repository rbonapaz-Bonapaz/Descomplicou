'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Sparkles, Building2, UserPlus, Mail } from 'lucide-react';

/**
 * SOLICITAÇÃO DE ACESSO
 *
 * Esta tela não cria conta — e isso é proposital.
 *
 * A versão anterior deixava qualquer visitante se cadastrar E escolher o próprio
 * perfil, inclusive "gestor". Numa clínica isso significa alguém de fora criando
 * uma conta com poder sobre a equipe e sobre dados de paciente.
 *
 * No modelo por clínica, acesso só nasce de duas formas:
 *   1. o dono do sistema provisiona a clínica (`provisionarClinica`);
 *   2. o administrador da clínica convida a pessoa (`convidarMembro`).
 *
 * Nos dois casos quem define os papéis é uma Cloud Function, que grava o custom
 * claim junto — nunca o navegador.
 */
export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-y-auto bg-[#F1F4F5] p-4">
      <div className="w-full max-w-md space-y-8 py-8 duration-700 animate-in fade-in">
        <div className="space-y-2 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-primary p-3 text-primary-foreground shadow-xl">
            <Sparkles className="h-6 w-6 md:h-8 md:w-8" />
          </div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-primary">Prontta</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">
            GESTÃO CLÍNICA DESCOMPLICADA
          </p>
        </div>

        <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white shadow-2xl">
          <CardHeader className="border-b border-dashed bg-muted/30 pb-8 pt-10 text-center">
            <CardTitle className="font-headline text-2xl text-primary">Solicitar acesso</CardTitle>
            <CardDescription className="text-xs font-medium">
              O acesso ao Prontta é sempre criado pela sua clínica.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-8 pt-10">
            <Opcao
              icone={<UserPlus className="h-5 w-5" />}
              titulo="Você trabalha numa clínica que já usa o Prontta"
              texto="Peça ao administrador da sua clínica para cadastrar seu e-mail em Ajustes → Equipe. Você receberá um link para criar sua senha."
            />

            <Opcao
              icone={<Building2 className="h-5 w-5" />}
              titulo="Você quer contratar o Prontta para a sua clínica"
              texto="Fale com a gente para abrir sua clínica no sistema. O período de teste começa assim que seu acesso é criado."
            />

            <a href="mailto:contato@prontta.com.br" className="block">
              <Button className="h-13 w-full rounded-2xl bg-primary py-4 text-[11px] font-black uppercase tracking-[0.2em] shadow-xl">
                <Mail className="mr-2 h-4 w-4" /> Falar com o suporte
              </Button>
            </a>
          </CardContent>

          <CardFooter className="flex flex-col gap-4 px-8 pb-10">
            <p className="text-center text-[10px] font-medium uppercase text-muted-foreground">
              Já tem acesso?{' '}
              <Link href="/login/" className="font-black text-primary hover:underline">
                Entrar
              </Link>
            </p>
            <p className="text-center text-[10px] leading-relaxed text-muted-foreground/70">
              <Link href="/termos/" className="font-bold underline">
                Termos de Uso
              </Link>{' '}
              ·{' '}
              <Link href="/privacidade/" className="font-bold underline">
                Política de Privacidade
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function Opcao({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl bg-slate-50 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icone}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-black uppercase leading-tight tracking-wide text-primary">
          {titulo}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}
