
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart,
  Cell,
  Pie
} from 'recharts';
import { 
  Activity,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Users,
  UserX,
  CheckCircle2,
  Download,
  Timer,
  Zap,
  TrendingDown
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parseISO, differenceInDays, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { collection, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Appointment, Transaction, Patient, User, HealthPlan } from '@/app/lib/types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const COLORS = ['#4F6D7A', '#BA8E32', '#10B981', '#F43F5E', '#8B5CF6'];

export default function InteligenciaClinicaPage() {
  const { isGestor, loading: authLoading, isGuest } = useAuth();
  
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isGestor) redirect('/dashboard');
  }, [isGestor, authLoading]);

  useEffect(() => {
    if (!db && !isGuest) return;

    if (isGuest) {
      setAppointments(JSON.parse(localStorage.getItem('demo_appointments') || '[]'));
      setTransactions(JSON.parse(localStorage.getItem('demo_transactions') || '[]'));
      setPatients(JSON.parse(localStorage.getItem('demo_patients') || '[]'));
      setPlans(JSON.parse(localStorage.getItem('demo_convenios') || '[]'));
      setStaff([
        { uid: 'g1', nome: 'Dra. Fabiula', perfil: 'gestor', possui_agenda: true },
        { uid: 'u3', nome: 'Dra. Ana Paula', perfil: 'colaborador', possui_agenda: true }
      ] as any);
      setLoading(false);
      return;
    }

    const unsubApts = onSnapshot(collection(db!, 'agendamentos'), (snap) => {
      setAppointments(snap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        data_hora: doc.data().data_hora instanceof Timestamp ? doc.data().data_hora.toDate().toISOString() : doc.data().data_hora
      })) as Appointment[]);
    });

    const unsubTrans = onSnapshot(collection(db!, 'transacoes_financeiras'), (snap) => {
      setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Transaction[]);
    });

    const unsubPatients = onSnapshot(collection(db!, 'pacientes'), (snap) => {
      setPatients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Patient[]);
    });

    const unsubStaff = onSnapshot(collection(db!, 'usuarios'), (snap) => {
      setStaff(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[]);
    });

    const unsubPlans = onSnapshot(collection(db!, 'convenios'), (snap) => {
      setPlans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HealthPlan[]);
    });

    setLoading(false);
    return () => { unsubApts(); unsubTrans(); unsubPatients(); unsubStaff(); unsubPlans(); };
  }, [isGuest]);

  const biStats = useMemo(() => {
    const totalApts = appointments.length;
    const realizedApts = appointments.filter(a => a.status === 'realizado');
    const absentApts = appointments.filter(a => a.status === 'faltou' || a.status === 'cancelado');
    
    const absenteismo = totalApts > 0 ? (absentApts.length / totalApts) * 100 : 0;
    const faturamentoBruto = transactions.filter(t => t.status === 'pago').reduce((acc, t) => acc + t.valor_bruto, 0);
    const ticketMedio = realizedApts.length > 0 ? (faturamentoBruto / realizedApts.length) : 0;
    
    const today = new Date();
    const churnList = patients.filter(p => {
      const patientApts = appointments.filter(a => a.paciente_id === p.id);
      if (patientApts.length === 0) return true;
      const lastAptDate = new Date(Math.max(...patientApts.map(a => new Date(a.data_hora).getTime())));
      return differenceInDays(today, lastAptDate) > 30;
    });

    const waits = realizedApts
      .filter(a => a.chegada_horario && a.inicio_atendimento)
      .map(a => differenceInMinutes(new Date(a.inicio_atendimento!), new Date(a.chegada_horario!)));
    const avgWait = waits.length > 0 ? (waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

    const missedRevenue = appointments
      .filter(a => (a.status === 'faltou' || a.status === 'cancelado') && !a.cancelamento_cobrado)
      .reduce((acc, a) => acc + (a.valor_final || 0), 0);

    const planProfit = plans.map(p => {
      const planTrans = transactions.filter(t => t.status === 'pago' && appointments.find(a => a.id === t.agendamento_id)?.convenio_id === p.id);
      const net = planTrans.reduce((acc, t) => acc + t.valor_liquido, 0);
      return { name: p.nome, value: net };
    }).sort((a, b) => b.value - a.value);

    return {
      totalApts,
      realizedCount: realizedApts.length,
      absenteismo,
      ticketMedio,
      churnCount: churnList.length,
      churnList: churnList.slice(0, 10),
      faturamentoBruto,
      avgWait,
      missedRevenue,
      planProfit
    };
  }, [appointments, transactions, patients, plans]);

  if (authLoading || loading) return <div className="p-12 text-center text-xs font-black uppercase animate-pulse">Processando Inteligência de Negócio...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16 px-2 md:px-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div>
          <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary flex items-center gap-3">
            <Activity className="h-8 w-8 text-accent shrink-0" /> BI & Performance Clínica
          </h1>
          <p className="text-muted-foreground text-sm font-black uppercase tracking-widest opacity-60 ml-1">Análise de Lucratividade, Retenção e Gargalos</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" className="h-12 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest border-primary/20 text-primary gap-2">
                <Download className="h-4 w-4" /> Exportar BI
            </Button>
            <Button className="bg-primary h-12 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg text-white gap-2">
                <Zap className="h-4 w-4 text-accent" /> Gerar Insights IA
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
         <Card className="border-none ring-1 ring-border shadow-sm p-6 bg-white">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Absenteísmo</p>
            <div className="flex items-center justify-between">
               <p className={cn("text-3xl font-black", biStats.absenteismo > 15 ? "text-rose-600" : "text-emerald-600")}>{biStats.absenteismo.toFixed(1)}%</p>
               <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400"><UserX className="h-5 w-5" /></div>
            </div>
            <p className="text-[8px] font-bold text-muted-foreground uppercase mt-2">Alvo da Clínica: Abaixo de 10%</p>
         </Card>

         <Card className="border-none ring-1 ring-border shadow-sm p-6 bg-white">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Espera Média</p>
            <div className="flex items-center justify-between">
               <p className={cn("text-3xl font-black", biStats.avgWait > 15 ? "text-amber-600" : "text-primary")}>{biStats.avgWait.toFixed(0)} min</p>
               <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary"><Timer className="h-5 w-5" /></div>
            </div>
            <p className="text-[8px] font-bold text-muted-foreground uppercase mt-2">Eficiência da Recepção e Fluxo</p>
         </Card>

         <Card className="border-none ring-1 ring-border shadow-sm p-6 bg-rose-50/30">
            <p className="text-[10px] font-black uppercase text-rose-800 tracking-widest mb-1">Receita Perdida</p>
            <div className="flex items-center justify-between">
               <p className="text-3xl font-black text-rose-600">R$ {biStats.missedRevenue.toFixed(2)}</p>
               <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-500"><TrendingDown className="h-5 w-5" /></div>
            </div>
            <p className="text-[8px] font-bold text-rose-800/60 uppercase mt-2">Faltas não cobradas no mês</p>
         </Card>

         <Card className="border-none ring-1 ring-border shadow-sm p-6 bg-emerald-50/30">
            <p className="text-[10px] font-black uppercase text-emerald-800 tracking-widest mb-1">Ticket Médio</p>
            <div className="flex items-center justify-between">
               <p className="text-3xl font-black text-emerald-700">R$ {biStats.ticketMedio.toFixed(2)}</p>
               <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600"><DollarSign className="h-5 w-5" /></div>
            </div>
            <p className="text-[8px] font-bold text-emerald-700/60 uppercase mt-2">Valor médio por atendimento</p>
         </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         <Card className="lg:col-span-8 rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white overflow-hidden">
            <CardHeader className="p-8 border-b bg-muted/5 flex items-center justify-between">
               <div>
                  <CardTitle className="font-headline text-2xl text-slate-800">Produtividade por Profissional</CardTitle>
                  <CardDescription className="text-xs font-bold uppercase tracking-wider">Volume de sessões realizadas vs. Faltas</CardDescription>
               </div>
               <TrendingUp className="h-6 w-6 text-emerald-500" />
            </CardHeader>
            <CardContent className="p-8">
               <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={staff.filter(u => u.possui_agenda).map(u => ({ 
                        nome: u.nome.split(' ')[0], 
                        realizado: appointments.filter(a => a.profissional_id === u.uid && a.status === 'realizado').length,
                        faltas: appointments.filter(a => (a.status === 'faltou' || a.status === 'cancelado') && a.profissional_id === u.uid).length
                     }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="nome" fontSize={10} fontWeights="black" axisLine={false} tickLine={false} />
                        <YAxis fontSize={10} fontWeights="black" axisLine={false} tickLine={false} />
                        <Tooltip 
                            cursor={{fill: '#f8fafb'}}
                            contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}} 
                        />
                        <Bar dataKey="realizado" name="Concluídos" fill="#4F6D7A" radius={[10, 10, 0, 0]} barSize={35} />
                        <Bar dataKey="faltas" name="Faltas/Canc." fill="#f43f5e" radius={[10, 10, 0, 0]} barSize={35} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </CardContent>
         </Card>

         <Card className="lg:col-span-4 rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white overflow-hidden">
            <CardHeader className="p-8 border-b bg-primary/5">
               <CardTitle className="font-headline text-xl text-primary">Rentabilidade por Plano</CardTitle>
               <CardDescription className="text-[10px] font-black uppercase">Faturamento Líquido (Receita Real)</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
               <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                           data={biStats.planProfit.filter(p => p.value > 0)}
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           paddingAngle={5}
                           dataKey="value"
                        >
                           {biStats.planProfit.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                        </Pie>
                        <Tooltip formatter={(val: number) => `R$ ${val.toFixed(2)}`} />
                     </PieChart>
                  </ResponsiveContainer>
               </div>
               <div className="space-y-3 mt-6">
                  {biStats.planProfit.map((p, idx) => (
                     <div key={idx} className="flex items-center justify-between text-[10px] font-black uppercase">
                        <div className="flex items-center gap-2">
                           <div className="h-2 w-2 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}} />
                           <span className="text-slate-600 truncate max-w-[120px]">{p.name}</span>
                        </div>
                        <span className="text-primary">R$ {p.value.toFixed(2)}</span>
                     </div>
                  ))}
               </div>
            </CardContent>
         </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white overflow-hidden">
            <CardHeader className="p-8 border-b bg-rose-50/50">
               <CardTitle className="font-headline text-xl flex items-center gap-3 text-rose-800">
                  <UserX className="h-6 w-6" /> Alerta de Evasão (Churn)
               </CardTitle>
               <CardDescription className="text-xs font-bold uppercase text-rose-600">Pacientes que não comparecem há mais de 30 dias</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-rose-100">
                     {biStats.churnList.map(p => (
                        <div key={p.id} className="p-5 hover:bg-rose-50 transition-colors flex items-center justify-between group">
                           <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xs">{p.nome.charAt(0)}</div>
                              <div>
                                 <p className="text-sm font-black text-slate-700 uppercase leading-none">{p.nome}</p>
                                 <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">{p.telefone}</p>
                              </div>
                           </div>
                           <button 
                             onClick={() => window.open(`https://wa.me/55${p.telefone?.replace(/\D/g, '')}`, '_blank')} 
                             className="h-10 px-4 rounded-xl bg-white border border-rose-200 text-rose-600 flex items-center gap-2 font-black text-[9px] uppercase shadow-sm hover:bg-rose-600 hover:text-white transition-all"
                           >
                              <Users className="h-4 w-4" /> Reativar
                           </button>
                        </div>
                     ))}
                     {biStats.churnList.length === 0 && (
                        <div className="p-24 text-center">
                           <CheckCircle2 className="h-12 w-12 text-emerald-200 mx-auto mb-4" />
                           <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Retenção em 100%</p>
                        </div>
                     )}
                  </div>
               </ScrollArea>
            </CardContent>
         </Card>

         <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl bg-white overflow-hidden">
            <CardHeader className="p-8 border-b bg-primary/5">
               <CardTitle className="font-headline text-xl flex items-center gap-3 text-primary">
                  <Timer className="h-6 w-6 text-accent" /> Gargalos de Processo
               </CardTitle>
               <CardDescription className="text-xs font-bold uppercase">Análise de tempo e atrasos sinalizados</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
               <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                     <p className="text-[10px] font-black uppercase text-slate-500">Atrasos por Profissional</p>
                     <Badge className="bg-amber-100 text-amber-700 border-none text-[8px]">Sinalizados na TV</Badge>
                  </div>
                  <div className="space-y-3">
                     {staff.filter(s => s.possui_agenda).map((s, idx) => {
                        const profApts = appointments.filter(a => a.profissional_id === s.uid && a.status === 'realizado');
                        const totalAtraso = profApts.reduce((acc, a) => acc + (a.atraso_sinalizado_minutos || 0), 0);
                        const mediaAtraso = profApts.length > 0 ? (totalAtraso / profApts.length) : 0;
                        return (
                           <div key={idx} className="space-y-1.5">
                              <div className="flex justify-between text-[9px] font-black uppercase px-1">
                                 <span>{s.nome}</span>
                                 <span className={cn(mediaAtraso > 5 ? "text-rose-600" : "text-emerald-600")}>{mediaAtraso.toFixed(1)} min avg</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                 <div 
                                    className={cn("h-full rounded-full transition-all duration-1000", mediaAtraso > 10 ? "bg-rose-500" : "bg-primary")} 
                                    style={{width: `${Math.min(mediaAtraso * 5, 100)}%`}} 
                                 />
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </div>

               <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                     <h4 className="text-[10px] font-black uppercase text-amber-800">Insight de Melhoria</h4>
                     <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                        O tempo médio de espera está em **{biStats.avgWait.toFixed(0)} minutos**. Considere ajustar o intervalo entre sessões nas configurações caso este número ultrapasse 15 minutos de forma recorrente.
                     </p>
                  </div>
               </div>
            </CardContent>
         </Card>
      </div>
    </div>
  );
}
