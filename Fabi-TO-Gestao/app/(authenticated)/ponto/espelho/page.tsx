
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  FileText, 
  ChevronLeft, 
  Clock, 
  MapPin, 
  AlertCircle,
  Calendar,
  ChevronRight,
  Info,
  CheckCircle2,
  MessageSquare,
  ShieldCheck,
  XCircle,
  Lock,
  Search,
  ArrowRight
} from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, isSaturday, isSunday, differenceInMinutes, startOfYear, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/components/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, Timestamp, doc, getDoc } from 'firebase/firestore';
import { ClockInRecord, TimeClosure, ClinicSettings } from '@/app/lib/types';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function EspelhoPontoPage() {
  const { user, isGuest } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const [punchRecords, setPunchRecords] = useState<ClockInRecord[]>([]);
  const [closures, setClosures] = useState<TimeClosure[]>([]);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPunch, setSelectedPunch] = useState<ClockInRecord | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');

  // Inicializar mês selecionado no cliente
  useEffect(() => {
    setSelectedMonth(format(new Date(), 'yyyy-MM'));
  }, []);

  // Carregar Configurações e Batidas
  useEffect(() => {
    if (!user) return;

    if (isGuest) {
      const demoSettings = localStorage.getItem('demo_settings');
      setSettings(demoSettings ? JSON.parse(demoSettings) : null);
      
      const saved = localStorage.getItem('demo_clock_ins');
      if (saved) {
        const all = JSON.parse(saved) as ClockInRecord[];
        setPunchRecords(all.filter(r => r.userId === user.uid));
      }
      setLoading(false);
    } else if (firestore) {
      getDoc(doc(firestore, 'configuracoes', 'clinica')).then(snap => {
        if (snap.exists()) setSettings(snap.data() as ClinicSettings);
      });

      const q = query(
        collection(firestore, 'batidas_ponto'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'asc')
      );

      const unsubPunches = onSnapshot(q, (snap) => {
        const data = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          timestamp: d.data().timestamp instanceof Timestamp ? d.data().timestamp.toDate().toISOString() : d.data().timestamp
        } as ClockInRecord));
        setPunchRecords(data);
        setLoading(false);
      });

      const unsubClosures = onSnapshot(collection(firestore, 'fechamentos_ponto'), (snap) => {
        setClosures(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeClosure)));
      });

      return () => { unsubPunches(); unsubClosures(); };
    }
  }, [user, isGuest, firestore]);

  // Lógica de Banco de Horas
  const mirrorData = useMemo(() => {
    if (!selectedMonth || typeof window === 'undefined') return { list: [], saldoAnterior: '+00:00', saldoPeriodo: '+00:00', totalBanco: '+00:00', isClosed: false };

    const today = new Date();
    const [year, month] = selectedMonth.split('-').map(Number);
    const baseDate = new Date(year, month - 1, 1);
    const start = startOfMonth(baseDate);
    const end = endOfMonth(baseDate);
    const daysInterval = eachDayOfInterval({ start, end: end > today ? today : end });

    const dailyMinExpected = settings?.banco_horas_carga_diaria_min || 480;
    const cycleMonths = settings?.banco_horas_ciclo_meses || 6;
    
    // Identificar início do ciclo (Jan-Jun / Jul-Dec)
    const currentMonthIdx = baseDate.getMonth();
    const cycleStartMonth = Math.floor(currentMonthIdx / cycleMonths) * cycleMonths;
    const cycleStartYear = baseDate.getFullYear();
    const cycleStartDate = new Date(cycleStartYear, cycleStartMonth, 1);

    let saldoPeriodoMinutos = 0;
    let saldoAnteriorMinutos = 0;

    // Buscar de closures fechados
    closures.filter(c => {
      const cDate = parseISO(c.id + '-01');
      return cDate >= cycleStartDate && cDate < start;
    }).forEach(c => {
      const userStat = c.totais_por_usuario.find(u => u.userId === user?.uid);
      if (userStat?.saldoMinutos) saldoAnteriorMinutos += userStat.saldoMinutos;
    });

    const list = daysInterval.reverse().map(day => {
      const dayPunches = punchRecords
        .filter(r => isSameDay(new Date(r.timestamp), day))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      let dayWorkedMinutes = 0;
      for (let i = 0; i < dayPunches.length; i += 2) {
        const ent = dayPunches[i];
        const sai = dayPunches[i+1];
        if (ent && sai && ent.type === 'entrada' && sai.type === 'saida' && ent.status === 'aprovado' && sai.status === 'aprovado') {
          dayWorkedMinutes += differenceInMinutes(new Date(sai.timestamp), new Date(ent.timestamp));
        }
      }

      const isWorkingDay = !isSaturday(day) && !isSunday(day);
      const dayBalance = isWorkingDay && dayPunches.length > 0 ? (dayWorkedMinutes - dailyMinExpected) : (isWorkingDay ? 0 : dayWorkedMinutes);
      
      saldoPeriodoMinutos += dayBalance;

      return {
        date: day,
        punches: dayPunches.slice(0, 4),
        isWeekend: isSaturday(day) || isSunday(day),
        worked: dayWorkedMinutes,
        balance: dayBalance
      };
    });

    const formatHours = (mins: number) => {
      const absMins = Math.abs(mins);
      const h = Math.floor(absMins / 60);
      const m = absMins % 60;
      return `${mins < 0 ? '-' : '+'}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    return {
      list,
      saldoAnterior: formatHours(saldoAnteriorMinutos),
      saldoPeriodo: formatHours(saldoPeriodoMinutos),
      totalBanco: formatHours(saldoAnteriorMinutos + saldoPeriodoMinutos),
      isClosed: closures.some(c => c.id === selectedMonth)
    };
  }, [punchRecords, settings, selectedMonth, closures, user]);

  const monthOptions = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(now, i);
      return {
        label: `${format(startOfMonth(d), 'dd/MM/yyyy')} - ${format(endOfMonth(d), 'dd/MM/yyyy')}`,
        value: format(d, 'yyyy-MM')
      };
    });
  }, []);

  if (loading || !selectedMonth) return <div className="p-12 text-center text-xs font-black uppercase animate-pulse">Acessando Banco de Horas...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 px-4 md:px-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10 border shadow-sm">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl md:text-2xl font-headline font-bold text-primary flex items-center gap-3">
            <FileText className="h-6 w-6 text-accent" /> Espelho de ponto
          </h1>
        </div>
      </div>

      <Card className="rounded-2xl border-none ring-1 ring-border shadow-md bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="p-6 md:p-8 border-b space-y-6">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Selecione o período ponto</Label>
              <div className="flex items-center justify-between">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-full md:w-80 h-11 rounded-xl bg-slate-50 border-primary/20 font-bold text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {monthOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="hidden md:flex gap-2">
                   <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/5 rounded-full"><Search className="h-5 w-5" /></Button>
                   <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/5 rounded-full"><FileText className="h-5 w-5" /></Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-4 border-t border-dashed">
               <div className="text-center md:text-right space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Saldo Anterior</p>
                  <p className="text-3xl font-black text-slate-800">{mirrorData.saldoAnterior}</p>
               </div>
               <div className="text-center md:text-right space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Saldo do Período</p>
                  <p className="text-3xl font-black text-slate-800">{mirrorData.saldoPeriodo}</p>
               </div>
               <div className="text-center md:text-right space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Banco</p>
                  <p className="text-3xl font-black text-slate-800">{mirrorData.totalBanco}</p>
               </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 border-b">
                <tr>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest pl-8">Data</th>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Entradas</th>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Saídas</th>
                  <th className="p-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right pr-8">Saldo Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mirrorData.list.map((dayData, idx) => (
                  <tr key={idx} className={cn(
                    "hover:bg-slate-50 transition-colors group",
                    dayData.isWeekend && "bg-slate-50/30 opacity-60"
                  )}>
                    <td className="p-6 pl-8">
                       <p className="text-sm font-black text-primary leading-none mb-1">
                         {format(dayData.date, 'dd/MM')}
                       </p>
                       <p className="text-[9px] font-bold text-muted-foreground uppercase">
                         {format(dayData.date, 'eeee', { locale: ptBR })}
                       </p>
                    </td>
                    
                    <td className="p-6">
                      <div className="flex flex-col gap-4 items-center">
                        {[0, 2].map(pos => {
                          const p = dayData.punches[pos];
                          return (
                            <div key={pos} className="flex items-center gap-3 w-32">
                               <div className={cn("h-7 w-7 rounded-full flex items-center justify-center border", p ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-slate-100 text-slate-200")}>
                                 {p?.status === 'pendente' ? <Clock className="h-3 w-3 animate-pulse" /> : <MapPin className="h-3 w-3" />}
                               </div>
                               <div className="flex flex-col">
                                  <span className={cn("text-xs font-black", p ? "text-slate-700" : "text-slate-200")}>{p ? format(new Date(p.timestamp), 'HH:mm') : '--:--'}</span>
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase opacity-40">Entrada {pos === 0 ? '1' : '2'}</span>
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    <td className="p-6">
                      <div className="flex flex-col gap-4 items-center">
                        {[1, 3].map(pos => {
                          const p = dayData.punches[pos];
                          return (
                            <div key={pos} className="flex items-center gap-3 w-32">
                               <div className={cn("h-7 w-7 rounded-full flex items-center justify-center border", p ? "border-blue-100 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-200")}>
                                  {p?.status === 'pendente' ? <Clock className="h-3 w-3 animate-pulse" /> : pos === 3 ? <Clock className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                               </div>
                               <div className="flex flex-col">
                                  <span className={cn("text-xs font-black", p ? "text-slate-700" : "text-slate-200")}>{p ? format(new Date(p.timestamp), 'HH:mm') : '--:--'}</span>
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase opacity-40">Saída {pos === 1 ? '1' : '2'}</span>
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    <td className="p-6 pr-8 text-right">
                       <span className={cn(
                         "text-sm font-black px-3 py-1 rounded-lg",
                         dayData.balance > 0 ? "text-emerald-700 bg-emerald-50" : 
                         dayData.balance < 0 ? "text-rose-700 bg-rose-50" : 
                         "text-slate-400 bg-slate-50"
                       )}>
                         {dayData.worked > 0 || dayData.balance !== 0 ? (dayData.balance > 0 ? '+' : '') + Math.floor(dayData.balance / 60).toString().padStart(2, '0') + ':' + Math.abs(dayData.balance % 60).toString().padStart(2, '0') : '--:--'}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="p-8 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50 flex items-center gap-6">
        <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary border border-slate-200 shrink-0">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Informações de Auditoria</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
            O ciclo de Banco de Horas atual é de **{settings?.banco_horas_ciclo_meses || 6} meses**. Saldos positivos são pagos ao final do ciclo e saldos negativos são descontados ou compensados conforme acordo coletivo. 
            Registros marcados com ícone de localização possuem coordenadas GPS capturadas no momento da batida.
          </p>
        </div>
      </div>
    </div>
  );
}
