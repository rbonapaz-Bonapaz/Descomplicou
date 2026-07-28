
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { 
  DollarSign, 
  Wallet, 
  Settings2,
  TrendingUp,
  Calculator,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Handshake,
  FileSpreadsheet,
  PieChart as PieChartIcon,
  Download,
  AlertCircle,
  TrendingDown,
  Scale,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { col, SUB } from '@/lib/tenancy';
import { db } from '@/lib/firebase';
import { Transaction, User, Appointment, ExpenseRecord, HealthPlan } from '@/app/lib/types';
import { format, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function FinanceiroPage() {
  const { loading: authLoading, identidade, temPapel } = useAuth();
  const clinicaId = identidade.clinicaId;
  const ehAdmin = temPapel('admin_clinica');
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const { toast } = useToast();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [activeTab, setActiveTab] = useState('fluxo');

  useEffect(() => {
    if (!authLoading && !ehAdmin) redirect('/dashboard');
  }, [ehAdmin, authLoading]);

  useEffect(() => {
    if (!db) return;

    if (isGuest) {
      setStaff([
        { uid: 'g1', nome: 'Dra. Fabiula de Oliveira', email: 'g1@demo.local', papeis: [], vinculo: 'proprietario', pro_labore: 8000, perfil: 'gestor', role_profissional: true, destino_pagamento: 'clinica', repasse_tipo: 'percentual', repasse_valor: 100 },
        { uid: 'u2', nome: 'Ana Secretária', email: 'u2@demo.local', papeis: [], vinculo: 'clt', salario_base: 2500, perfil: 'secretaria' },
        { uid: 'u3', nome: 'Dra. Ana Paula (Fono)', email: 'u3@demo.local', papeis: [], vinculo: 'parceiro', perfil: 'colaborador', possui_agenda: true, cobranca_tipo: 'fixo', cobranca_valor: 50, destino_pagamento: 'profissional' },
      ]);
      setAppointments(JSON.parse(localStorage.getItem('demo_appointments') || '[]'));
      setExpenses(JSON.parse(localStorage.getItem('demo_expense_records') || '[]'));
      setTransactions(JSON.parse(localStorage.getItem('demo_transactions') || '[]'));
      setPlans(JSON.parse(localStorage.getItem('demo_convenios') || '[]'));
      return;
    }

    const unsubTrans = onSnapshot(query(col<Transaction>(db, clinicaId!, SUB.transacoes), orderBy('data_criacao', 'desc')), (snap) => {
      setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id } as Transaction)));
    });

    const unsubStaff = onSnapshot(query(col<User>(db, clinicaId!, SUB.usuarios)), (snap) => {
      setStaff(snap.docs.map(d => ({ ...d.data() } as User)));
    });

    const unsubApts = onSnapshot(col<Appointment>(db, clinicaId!, SUB.agendamentos), (snap) => {
      setAppointments(snap.docs.map(d => ({ 
        ...d.data(), 
        id: d.id, 
        data_hora: (d.data().data_hora as any) instanceof Timestamp ? d.data().data_hora.toDate().toISOString() : d.data().data_hora 
      } as Appointment)));
    });

    const unsubExp = onSnapshot(col<Transaction>(db, clinicaId!, SUB.transacoes), (snap) => {
      setExpenses(snap.docs.map(d => ({ ...d.data(), id: d.id } as ExpenseRecord)));
    });

    const unsubPlans = onSnapshot(col<HealthPlan>(db, clinicaId!, SUB.convenios), (snap) => {
      setPlans(snap.docs.map(d => ({ ...d.data(), id: d.id } as HealthPlan)));
    });

    return () => { unsubTrans(); unsubStaff(); unsubApts(); unsubExp(); unsubPlans(); };
  }, [isGuest]);

  const dreStats = useMemo(() => {
    const now = new Date();
    const currentTrans = transactions.filter(t => isSameMonth(new Date(t.data_criacao), now) && t.status === 'pago');
    const currentApts = appointments.filter(a => isSameMonth(new Date(a.data_hora), now) && (a.status === 'realizado' || a.status === 'cancelado' || a.status === 'faltou'));
    const currentExp = expenses.filter(e => isSameMonth(new Date(e.vencimento), now) && e.status === 'pago' && e.tipo === 'despesa');

    const receitaDireta = currentTrans.reduce((acc, t) => acc + t.valor_bruto, 0);
    const taxasBancarias = currentTrans.reduce((acc, t) => acc + (t.taxa_valor || 0), 0);

    let receitaEstrutura = 0;
    staff.forEach(u => {
      if (u.vinculo === 'parceiro' && u.destino_pagamento === 'profissional' && u.cobranca_valor) {
        const userApts = currentApts.filter(a => a.profissional_id === u.uid && a.status === 'realizado');
        if (u.cobranca_tipo === 'fixo') {
           receitaEstrutura += (userApts.length * u.cobranca_valor);
        } else {
           const revenue = userApts.reduce((acc, a) => acc + (a.valor_final || 0), 0);
           receitaEstrutura += (revenue * (u.cobranca_valor / 100));
        }
      }
    });

    const totalFolhaFixo = staff.reduce((acc, u) => {
      if (u.vinculo === 'clt') return acc + (u.salario_base || 0);
      if (u.vinculo === 'proprietario') return acc + (u.pro_labore || 0);
      return acc;
    }, 0);

    let custosRepasse = 0;
    staff.forEach(u => {
      if (u.vinculo === 'parceiro' && u.destino_pagamento === 'clinica' && u.repasse_valor) {
        const userApts = currentApts.filter(a => a.profissional_id === u.uid && a.status === 'realizado');
        if (u.repasse_tipo === 'fixo') {
          custosRepasse += (userApts.length * u.repasse_valor);
        } else {
          const revenue = userApts.reduce((acc, a) => acc + (a.valor_final || 0), 0);
          custosRepasse += (revenue * (u.repasse_valor / 100));
        }
      }
    });

    const despesasOperacionais = currentExp.reduce((acc, e) => acc + e.valor, 0);

    const receitaTotalReal = receitaDireta + receitaEstrutura;
    const custoTotalReal = taxasBancarias + totalFolhaFixo + custosRepasse + despesasOperacionais;
    const lucroLiquido = receitaTotalReal - custoTotalReal;

    const missedRevenue = currentApts
      .filter(a => (a.status === 'faltou' || a.status === 'cancelado') && !a.cancelamento_cobrado)
      .reduce((acc, a) => acc + (a.valor_final || 0), 0);

    const planMargins = plans.map(p => {
      const planApts = currentApts.filter(a => a.convenio_id === p.id && a.status === 'realizado');
      const gross = planApts.reduce((acc, a) => acc + (a.valor_final || 0), 0);
      const margin = (gross * (p.porcentagem_lucro / 100)) * 0.98;
      return { nome: p.nome, margin, gross };
    }).sort((a, b) => b.margin - a.margin);

    return {
      receitaBruta: receitaDireta,
      receitaEstrutura,
      receitaTotal: receitaTotalReal,
      taxasBancarias,
      folhaFixo: totalFolhaFixo,
      repasses: custosRepasse,
      despesasAdm: despesasOperacionais,
      custoTotal: custoTotalReal,
      lucroLiquido,
      margem: receitaTotalReal > 0 ? (lucroLiquido / receitaTotalReal) * 100 : 0,
      missedRevenue,
      planMargins
    };
  }, [transactions, appointments, expenses, staff, plans]);

  const handleExportFluxo = () => {
    const headers = ['Paciente', 'Data', 'Bruto', 'Líquido', 'Meio Pagamento'];
    const rows = transactions.map(t => [
      t.paciente_nome,
      format(new Date(t.data_criacao), 'dd/MM/yyyy'),
      t.valor_bruto.toFixed(2),
      t.valor_liquido.toFixed(2),
      t.meio_pagamento
    ]);
    const csv = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `caixa_clinica_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (authLoading) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto pb-20 px-2 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary flex items-center gap-3">
             <Calculator className="h-8 w-8 text-accent" /> Controladoria & DRE
          </h1>
          <p className="text-muted-foreground text-sm uppercase font-black tracking-widest opacity-60 ml-1">Relatórios Contábeis e Resultados Líquidos</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={handleExportFluxo} className="h-12 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest border-primary/20 text-primary gap-2 w-full md:w-auto">
             <Download className="h-4 w-4" /> Exportar Dados
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-none ring-1 ring-border shadow-sm p-6 bg-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0"><ArrowUpRight className="h-4 w-4" /></div>
              <p className="text-[10px] font-black uppercase text-muted-foreground">Faturamento Real</p>
            </div>
            <p className="text-xl font-black text-emerald-600">R$ {dreStats.receitaTotal.toFixed(2)}</p>
            <p className="text-[9px] font-bold text-muted-foreground uppercase mt-1">Mês: {format(new Date(), 'MMMM', {locale: ptBR})}</p>
        </Card>

        <Card className="border-none ring-1 ring-border shadow-sm p-6 bg-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 shrink-0"><ArrowDownRight className="h-4 w-4" /></div>
              <p className="text-[10px] font-black uppercase text-muted-foreground">Custos Totais</p>
            </div>
            <p className="text-xl font-black text-rose-600">R$ {dreStats.custoTotal.toFixed(2)}</p>
            <p className="text-[9px] font-bold text-muted-foreground uppercase mt-1">Folha + Repasse + Op.</p>
        </Card>

        <Card className={cn("border-none ring-1 shadow-md", dreStats.lucroLiquido >= 0 ? "ring-emerald-200 bg-emerald-50/20" : "ring-rose-200 bg-rose-50/20")}>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary shrink-0"><TrendingUp className="h-4 w-4" /></div>
              <p className="text-[10px] font-black uppercase text-muted-foreground">Lucro Líquido</p>
            </div>
            <p className={cn("text-2xl font-black", dreStats.lucroLiquido >= 0 ? "text-emerald-700" : "text-rose-700")}>
              R$ {dreStats.lucroLiquido.toFixed(2)}
            </p>
            <Badge variant="outline" className="mt-2 text-[9px] font-black border-primary/20">Margem: {dreStats.margem.toFixed(1)}%</Badge>
          </CardContent>
        </Card>

        <Card className="border-none ring-1 ring-border shadow-sm bg-rose-50/40 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 shrink-0"><TrendingDown className="h-4 w-4" /></div>
              <p className="text-[10px] font-black uppercase text-rose-800">Receita Perdida</p>
            </div>
            <p className="text-xl font-black text-rose-600">R$ {dreStats.missedRevenue.toFixed(2)}</p>
            <p className="text-[9px] font-bold text-rose-700 uppercase mt-1">Faltas não cobradas</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-2 scrollbar-none">
          <TabsList className="bg-[#E9EEF1] p-1.5 rounded-2xl h-14 w-max md:w-auto mb-8 shadow-inner flex flex-nowrap">
            <TabsTrigger value="fluxo" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white shadow-sm gap-2 whitespace-nowrap">Caixa (Clínica)</TabsTrigger>
            <TabsTrigger value="dre" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white shadow-sm gap-2 whitespace-nowrap">DRE Consolidado</TabsTrigger>
            <TabsTrigger value="planos" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white shadow-sm gap-2 whitespace-nowrap">Rentabilidade Convênios</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fluxo" className="mt-0">
          <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl overflow-hidden bg-white">
            <CardHeader className="p-8 border-b bg-muted/5">
              <CardTitle className="font-headline text-2xl flex items-center gap-3"><FileSpreadsheet className="h-6 w-6 text-primary" /> Movimentação de Entradas</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
               <table className="w-full text-left min-w-[700px]">
                 <thead className="bg-muted/30 border-b">
                   <tr>
                     <th className="p-6 text-[10px] uppercase font-black text-muted-foreground">Paciente</th>
                     <th className="p-6 text-[10px] uppercase font-black text-muted-foreground text-center">Data</th>
                     <th className="p-6 text-[10px] uppercase font-black text-muted-foreground text-right">Bruto</th>
                     <th className="p-6 text-[10px] uppercase font-black text-muted-foreground text-right">Líquido</th>
                     <th className="p-6 text-[10px] uppercase font-black text-muted-foreground text-center">Meio</th>
                   </tr>
                 </thead>
                 <tbody>
                   {transactions.map((t) => (
                     <tr key={t.id} className="border-b hover:bg-slate-50 transition-colors">
                       <td className="p-6 font-black text-primary text-sm">{t.paciente_nome}</td>
                       <td className="p-6 text-center text-xs font-bold text-slate-500">{format(new Date(t.data_criacao), 'dd/MM/yyyy')}</td>
                       <td className="p-6 text-right text-xs font-bold">R$ {t.valor_bruto.toFixed(2)}</td>
                       <td className="p-6 text-right text-sm font-black text-emerald-600">R$ {t.valor_liquido.toFixed(2)}</td>
                       <td className="p-6 text-center">
                          <Badge variant="outline" className="text-[8px] font-black uppercase">{t.meio_pagamento}</Badge>
                       </td>
                     </tr>
                   ))}
                   {transactions.length === 0 && (
                     <tr><td colSpan={5} className="p-20 text-center opacity-20 font-black uppercase text-xs">Nenhuma transação este mês</td></tr>
                   )}
                 </tbody>
               </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dre" className="mt-0">
          <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white p-6 md:p-12 overflow-hidden">
             <div className="max-w-4xl mx-auto space-y-12">
                <div className="text-center space-y-2">
                   <h2 className="text-2xl md:text-4xl font-headline font-bold text-primary">Demonstrativo de Resultado</h2>
                   <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em]">{format(new Date(), 'MMMM yyyy', { locale: ptBR })}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                   <div className="space-y-8">
                      <div className="space-y-4">
                         <h3 className="text-xs font-black uppercase text-emerald-600 border-b pb-2 flex items-center justify-between">Receita Operacional <span className="text-base md:text-lg">R$ {dreStats.receitaTotal.toFixed(2)}</span></h3>
                         <div className="space-y-3 pl-4">
                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Entradas Diretas</span><span>R$ {dreStats.receitaBruta.toFixed(2)}</span></div>
                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Renda de Estrutura</span><span>R$ {dreStats.receitaEstrutura.toFixed(2)}</span></div>
                         </div>
                      </div>

                      <div className="space-y-4">
                         <h3 className="text-xs font-black uppercase text-rose-600 border-b pb-2 flex items-center justify-between">Custos & Despesas <span className="text-base md:text-lg">R$ {dreStats.custoTotal.toFixed(2)}</span></h3>
                         <div className="space-y-3 pl-4">
                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Taxas Bancárias</span><span>R$ {dreStats.taxasBancarias.toFixed(2)}</span></div>
                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Folha de Pagto (Fixo)</span><span>R$ {dreStats.folhaFixo.toFixed(2)}</span></div>
                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Repasses a Parceiros</span><span>R$ {dreStats.repasses.toFixed(2)}</span></div>
                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Despesas Operacionais</span><span>R$ {dreStats.despesasAdm.toFixed(2)}</span></div>
                         </div>
                      </div>
                   </div>

                   <div className="flex flex-col justify-center">
                      <div className="bg-primary text-white p-8 md:p-12 rounded-[2.5rem] md:rounded-[3.5rem] space-y-4 shadow-2xl relative overflow-hidden group">
                         <TrendingUp className="h-16 w-16 md:h-24 md:w-24 absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform" />
                         <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Lucro Líquido Real</p>
                         <h3 className="text-3xl md:text-5xl font-black tabular-nums">R$ {dreStats.lucroLiquido.toFixed(2)}</h3>
                         <div className="pt-6">
                            <Badge className="bg-white/20 text-white border-none py-2 px-6 font-black uppercase text-[10px]">Rentabilidade: {dreStats.margem.toFixed(1)}%</Badge>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </Card>
        </TabsContent>

        <TabsContent value="planos" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white overflow-hidden">
               <CardHeader className="p-8 border-b bg-emerald-50/30">
                  <CardTitle className="font-headline text-xl text-emerald-800 flex items-center gap-3"><Scale className="h-6 w-6" /> Margem de Contribuição</CardTitle>
                  <CardDescription className="text-[10px] font-black uppercase">Lucro real por operadora (Pós-Repasse)</CardDescription>
               </CardHeader>
               <CardContent className="p-0">
                  <div className="divide-y">
                     {dreStats.planMargins.map((p, idx) => (
                        <div key={idx} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                           <div className="space-y-1">
                              <p className="text-sm font-black text-slate-700 uppercase">{p.nome}</p>
                              <p className="text-[9px] font-bold text-muted-foreground uppercase">Bruto: R$ {p.gross.toFixed(2)}</p>
                           </div>
                           <div className="text-right">
                              <p className="text-lg font-black text-emerald-600">R$ {p.margin.toFixed(2)}</p>
                              <Badge variant="outline" className="text-[8px] border-emerald-200 text-emerald-600 font-black">LÍQUIDO CLÍNICA</Badge>
                           </div>
                        </div>
                     ))}
                  </div>
               </CardContent>
            </Card>

            <div className="space-y-6">
               <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-xl p-8 bg-primary text-white relative overflow-hidden">
                  <Zap className="h-24 w-24 absolute -right-6 -bottom-6 opacity-10" />
                  <h3 className="text-lg font-headline font-bold mb-4">Análise Estratégica</h3>
                  <div className="space-y-4 relative z-10">
                     <p className="text-[11px] font-medium leading-relaxed opacity-90">
                        Sua melhor margem de contribuição este mês vem do plano **{dreStats.planMargins[0]?.nome || '---'}**. 
                        Planos com margem abaixo de 30% devem ser reavaliados quanto ao volume de atendimentos e custos de materiais.
                     </p>
                     <div className="pt-4 border-t border-white/10">
                        <p className="text-[9px] font-black uppercase tracking-widest text-accent mb-2">Recomendação:</p>
                        <p className="text-[11px] font-medium leading-relaxed italic opacity-80">
                           "Aumentar o ticket médio através da cobrança rigorosa de faltas tardias pode elevar seu lucro líquido em até **R$ {dreStats.missedRevenue.toFixed(2)}**."
                        </p>
                     </div>
                  </div>
               </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
