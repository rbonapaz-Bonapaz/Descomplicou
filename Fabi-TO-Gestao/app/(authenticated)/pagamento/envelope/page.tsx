
"use client"

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Printer, 
  Download, 
  Wallet, 
  CheckCircle2, 
  ShieldCheck,
  Info,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function EnvelopeDigitalPage() {
  const { user } = useAuth();
  const [mes, setMes] = useState('05');
  const [ano, setAno] = useState('2024');

  const meses = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  // Dados simulados baseados no layout
  const proventos = [
    { descricao: 'Salário Base (Mensal)', vencimento: 3500.00, desconto: null },
    { descricao: 'INSS', vencimento: null, desconto: 385.00 },
    { descricao: 'FGTS (Base de Cálculo)', vencimento: 280.00, desconto: null, isInfo: true },
  ];

  const totalVencimentos = 3500.00;
  const totalDescontos = 385.00;
  const valorLiquido = totalVencimentos - totalDescontos;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-headline font-bold text-primary flex items-center gap-3">
            <Wallet className="h-7 w-7 text-accent" /> Envelope de pagamento
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">
            DEMONSTRATIVO MENSAL
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest border-primary/20 text-primary">
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button className="h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest bg-primary shadow-lg">
            <Download className="h-4 w-4 mr-2" /> Baixar PDF
          </Button>
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white overflow-hidden">
        <CardContent className="p-0">
          {/* Header Card Section */}
          <div className="p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 border-b bg-slate-50/30">
            <div className="flex items-center gap-6">
              <div className="h-16 w-16 rounded-2xl bg-white border shadow-sm flex items-center justify-center">
                <div className="h-10 w-10 rounded-full bg-slate-200" />
              </div>
              <div className="space-y-0.5">
                <h2 className="text-lg font-black text-slate-800">Clínica Fabiula Oliveira</h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">CNPJ: 00.000.000/0001-00</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="w-[140px] h-12 rounded-xl bg-white border-none shadow-sm font-bold text-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {meses.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="w-[100px] h-12 rounded-xl bg-white border-none shadow-sm font-bold text-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Collaborator Info Section */}
          <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                <div className="h-3 w-3 rounded-full border border-muted-foreground/30" /> COLABORADOR
              </p>
              <div className="space-y-0.5">
                <h3 className="text-xl md:text-2xl font-black text-primary">{user?.nome || '---'}</h3>
                <p className="text-[10px] font-black text-muted-foreground uppercase">
                  {user?.perfil === 'gestor' ? 'GESTOR (A)' : 'SECRETÁRIO(A)'} • CPF: {user?.cpf || '***.***.***-**'}
                </p>
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-2 text-muted-foreground mb-1">
                <div className="h-4 w-4 rounded-full border border-muted-foreground/30 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest">DADOS DO PERÍODO</span>
              </div>
              <p className="text-xs font-bold text-slate-700">Mês de Referência: {meses.find(m => m.value === mes)?.label.toLowerCase()}/{ano}</p>
              <div className="flex items-center justify-end gap-2">
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">STATUS: PAGAMENTO CONFIRMADO</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              </div>
            </div>
          </div>

          {/* Table Section */}
          <div className="px-8 md:px-12">
            <div className="rounded-2xl border overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-4 text-[9px] font-black uppercase text-muted-foreground tracking-widest pl-6">DESCRIÇÃO</th>
                    <th className="p-4 text-[9px] font-black uppercase text-muted-foreground tracking-widest text-right">VENCIMENTOS</th>
                    <th className="p-4 text-[9px] font-black uppercase text-muted-foreground tracking-widest text-right pr-6">DESCONTOS</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {proventos.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-5 pl-6">
                        <span className={cn("text-xs font-bold", item.isInfo ? "text-slate-400 italic" : "text-slate-700")}>
                          {item.descricao}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        {item.vencimento ? (
                          <span className={cn("text-xs font-black text-slate-800", item.isInfo && "text-slate-400 italic")}>
                            R$ {item.vencimento.toFixed(2)} {item.isInfo && '*'}
                          </span>
                        ) : (
                          <span className="text-slate-200">---</span>
                        )}
                      </td>
                      <td className="p-5 text-right pr-6">
                        {item.desconto ? (
                          <span className="text-xs font-black text-rose-600">R$ {item.desconto.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-200">---</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Summary Section */}
          <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 border space-y-1">
              <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">TOTAL VENCIMENTOS</p>
              <p className="text-xl font-black text-slate-800">R$ {totalVencimentos.toFixed(2)}</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-rose-50 border border-rose-100 space-y-1">
              <p className="text-[8px] font-black uppercase text-rose-600 tracking-widest">TOTAL DESCONTOS</p>
              <p className="text-xl font-black text-rose-700">R$ {totalDescontos.toFixed(2)}</p>
            </div>

            <div className="p-6 rounded-2xl bg-[#F1F4F5] border border-primary/10 space-y-1">
              <p className="text-[8px] font-black uppercase text-primary tracking-widest">VALOR LÍQUIDO</p>
              <p className="text-xl font-black text-primary">R$ {valorLiquido.toFixed(2)}</p>
            </div>
          </div>

          {/* Signature and Hash Section */}
          <div className="px-12 py-6 border-t border-dashed flex flex-col md:flex-row items-center justify-between gap-4 opacity-40">
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-[9px] font-black uppercase tracking-widest">DOCUMENTO ASSINADO DIGITALMENTE</span>
            </div>
            <p className="text-[8px] font-mono font-bold uppercase tracking-tighter">
              93A571D0-3580-11EF-B939-A1B2C3D4E5F6 {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer Note */}
      <div className="flex justify-center px-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800 max-w-2xl shadow-sm">
          <Info className="h-4 w-4 shrink-0" />
          <p className="text-[10px] md:text-xs font-bold leading-relaxed">
            * O valor do FGTS é informativo e recolhido diretamente pela clínica em sua conta vinculada.
          </p>
        </div>
      </div>
    </div>
  );
}
