
"use client"

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FileText, 
  Download, 
  Lock, 
  Info,
  Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function InformeRendimentosPage() {
  return (
    <div className="space-y-10 pb-16 animate-in fade-in duration-500 max-w-[1400px] mx-auto px-2">
      {/* Header Section */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-headline font-bold text-primary flex items-center gap-3">
          <FileText className="h-7 w-7 text-accent" /> Informe de Rendimentos
        </h1>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">
          DECLARAÇÃO ANUAL DE RENDIMENTOS
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        {/* Card 2023 - Disponível */}
        <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white overflow-hidden flex flex-col">
          <CardHeader className="p-8 md:p-10 pb-4">
            <CardTitle className="text-xl md:text-2xl font-black text-slate-800">
              Ano Calendário 2023
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 md:p-10 pt-0 flex-1 flex flex-col">
            <p className="text-xs md:text-sm font-bold text-muted-foreground leading-relaxed mb-10">
              Documento consolidado para Declaração de Imposto de Renda Pessoa Física.
            </p>
            <div className="mt-auto pt-4">
              <Button className="w-full h-14 rounded-2xl bg-[#F1F4F5] hover:bg-[#E9EEF1] text-primary border-none shadow-sm font-black uppercase text-[10px] tracking-widest gap-3 transition-all">
                <Download className="h-4 w-4" />
                BAIXAR DOCUMENTO
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card 2024 - Bloqueado */}
        <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-xl bg-white/40 backdrop-blur-sm overflow-hidden flex flex-col opacity-60">
          <CardHeader className="p-8 md:p-10 pb-4">
            <CardTitle className="text-xl md:text-2xl font-black text-slate-400">
              Ano Calendário 2024
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 md:p-10 pt-0 flex-1 flex flex-col">
            <div className="mb-6">
               <Badge variant="outline" className="bg-amber-50/50 text-accent border-accent/20 font-black uppercase text-[9px] py-1.5 px-4 flex items-center w-fit gap-2">
                 <Lock className="h-3 w-3" /> DISPONÍVEL EM 2025
               </Badge>
            </div>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-tight leading-relaxed">
              O informe do ano atual será gerado após o encerramento do exercício em Dezembro.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Help Banner Section */}
      <div className="pt-4">
        <Card className="rounded-[2.5rem] border-none ring-1 ring-[#D6E6F2] bg-[#EBF5FF]/50 overflow-hidden">
          <CardContent className="p-8 flex items-center gap-6">
            <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center text-primary border border-[#D6E6F2]">
              <Info className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs md:text-sm font-black text-primary uppercase tracking-tight">
                AJUDA COM O IMPOSTO DE RENDA?
              </h3>
              <p className="text-[10px] md:text-xs font-bold text-[#4F6D7A]/80 leading-relaxed max-w-2xl">
                Se você tiver dúvidas sobre como declarar os valores recebidos da clínica, entre em contato com o nosso setor contábil através do e-mail administrativo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
