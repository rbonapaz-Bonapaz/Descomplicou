"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Users, 
  Clock, 
  Wifi, 
  ChevronDown, 
  Cake, 
  Medal, 
  Calendar, 
  Heart
} from 'lucide-react';
import Link from 'next/link';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { col, SUB } from '@/lib/tenancy';
import { useFirestore, useCollection } from '@/firebase';
import { Patient, User } from '@/app/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { parseISO, format, addDays, isWithinInterval, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AniversariantesDoDia } from '@/components/AniversariantesDoDia';

export default function DashboardPage() {
  const { user, firebaseUser, loading: authLoading, identidade, temPapel } = useAuth();
  const clinicaId = identidade.clinicaId;
  const ehAdmin = temPapel('admin_clinica');
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const firestore = useFirestore();
  const [firebaseStatus, setFirebaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [demoPatients, setDemoPatients] = useState<Patient[]>([]);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);

  const patientsQuery = useMemo(() => firestore && firebaseUser && !isGuest ? query(col<Patient>(firestore, clinicaId!, SUB.pacientes)) : null, [firestore, firebaseUser, isGuest]);
  const staffQuery = useMemo(() => firestore && firebaseUser && !isGuest ? query(col<User>(firestore, clinicaId!, SUB.usuarios)) : null, [firestore, firebaseUser, isGuest]);
  
  const { data: firestorePatients } = useCollection<Patient>(patientsQuery);
  const { data: firestoreStaff } = useCollection<User>(staffQuery);

  useEffect(() => {
    if (authLoading) return;

    if (isGuest) {
      setFirebaseStatus('connected');
      const savedPatients = localStorage.getItem('demo_patients');
      if (savedPatients) setDemoPatients(JSON.parse(savedPatients));
      return;
    }

    if (firebaseUser) {
      setFirebaseStatus('connected');
    }
  }, [isGuest, authLoading, firebaseUser]);

  const patients = useMemo(() => isGuest ? demoPatients : (firestorePatients || []), [isGuest, firestorePatients, demoPatients]);
  const staff = useMemo(() => {
    if (isGuest) return [{ uid: 'g1', nome: 'Dra. Fabiula de Oliveira', data_nascimento: '1987-05-19', data_admissao: '2023-05-19', perfil: 'gestor' }] as User[];
    return firestoreStaff || [];
  }, [isGuest, firestoreStaff]);

  const upcomingAnniversaries = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endRange = addDays(today, 30);
    const list: any[] = [];

    const getAnniversaryThisYear = (dateStr: string) => {
      try {
        const d = parseISO(dateStr);
        if (!isValid(d)) return null;
        const anniv = new Date(today.getFullYear(), d.getMonth(), d.getDate());
        if (anniv < today) return new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
        return anniv;
      } catch (e) { return null; }
    };

    staff.forEach(u => {
      if (u.data_nascimento) {
        const date = getAnniversaryThisYear(u.data_nascimento);
        if (date && isWithinInterval(date, { start: today, end: endRange })) {
          list.push({ nome: u.nome, data: date, tipo: 'nascimento', info: 'Equipe' });
        }
      }
      if (u.data_admissao) {
        const date = getAnniversaryThisYear(u.data_admissao);
        if (date && isWithinInterval(date, { start: today, end: endRange })) {
          const adm = parseISO(u.data_admissao);
          if (isValid(adm)) {
            const anos = date.getFullYear() - adm.getFullYear();
            if (anos > 0) list.push({ nome: u.nome, data: date, tipo: 'empresa', info: `${anos} anos de casa` });
          }
        }
      }
    });

    patients.forEach(p => {
      if (p.data_nascimento) {
        const date = getAnniversaryThisYear(p.data_nascimento);
        if (date && isWithinInterval(date, { start: today, end: endRange })) {
          list.push({ nome: p.nome, data: date, tipo: 'nascimento', info: 'Paciente' });
        }
      }
    });

    return list.sort((a, b) => a.data.getTime() - b.data.getTime()).slice(0, 5);
  }, [staff, patients]);

  const patientBdaysTodayCount = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    const todayStr = format(new Date(), 'dd/MM');
    return patients.filter(p => {
      if (!p.data_nascimento) return false;
      try {
        const d = parseISO(p.data_nascimento);
        return isValid(d) && format(d, 'dd/MM') === todayStr;
      } catch (e) { return false; }
    }).length;
  }, [patients]);

  const stats = [
    { id: 'atendimentos', title: ehAdmin ? 'Atendimentos (Clínica)' : 'Meus Atendimentos', value: ehAdmin ? '24' : '12', icon: Clock, description: 'Sessões para hoje', color: 'text-primary' },
    { id: 'novos', title: 'Novos Pacientes', value: patients.length.toString(), icon: Users, description: 'Total na base', color: 'text-emerald-600' },
    { id: 'niver', title: 'Aniversariantes', value: patientBdaysTodayCount.toString(), icon: Heart, description: 'Toque para detalhes', color: 'text-rose-500', clickable: true },
    { id: 'agenda', title: 'Agenda Livre', value: '80%', icon: Calendar, description: 'Capacidade semanal', color: 'text-accent' }
  ];

  const displayName = user?.nome ? user.nome.split(' ')[0] : 'Profissional';

  if (authLoading) return <div className="p-12 text-center text-xs font-black uppercase animate-pulse">Iniciando Dashboard...</div>;

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto px-1 md:px-0">
      <AniversariantesDoDia mode="equipe" />

      <AniversariantesDoDia 
        mode="pacientes" 
        showBanner={false} 
        triggerOpen={isPatientModalOpen} 
        onOpenChange={setIsPatientModalOpen} 
      />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5 md:mb-2">
            <h1 className="text-2xl md:text-3xl font-headline font-bold text-primary">Olá, {displayName}!</h1>
            {firebaseStatus === 'connected' ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[8px] md:text-[9px] font-black uppercase flex items-center gap-1 py-0.5">
                <Wifi className="h-2 w-2 md:h-2.5 md:w-2.5" /> Sincronizado
              </Badge>
            ) : (
              <Badge variant="outline" className="animate-pulse text-[8px] md:text-[9px] font-black uppercase py-0.5">Conectando...</Badge>
            )}
          </div>
          <p className="text-sm md:text-base text-muted-foreground">{ehAdmin ? 'Visão administrativa da clínica para hoje.' : 'Sua pauta de atendimentos para hoje.'}</p>
        </div>
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card 
            key={stat.id}
            onClick={() => stat.clickable && setIsPatientModalOpen(true)}
            className={cn(
              "border-border shadow-sm hover:shadow-md transition-all rounded-2xl h-full",
              stat.clickable && "cursor-pointer hover:border-primary/40 bg-white hover:scale-[1.02] active:scale-95"
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 space-y-0 px-4 pt-4">
              <CardTitle className="text-[10px] md:text-sm font-black uppercase text-muted-foreground truncate mr-2 tracking-widest">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${stat.color} shrink-0`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl md:text-3xl font-black">{stat.value}</div>
              <p className="text-[8px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 truncate font-bold">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        <Card className="border-none ring-1 ring-border shadow-sm lg:col-span-7 h-fit rounded-3xl">
          <CardHeader className="px-6 py-6 border-b bg-muted/5">
            <CardTitle className="font-headline text-xl md:text-2xl text-primary">{ehAdmin ? 'Movimentação da Clínica' : 'Meus Próximos Atendimentos'}</CardTitle>
            <CardDescription className="text-xs md:text-sm font-medium">Sessões confirmadas que exigem atenção agora.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-6">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-white hover:border-primary/20 transition-colors">
                  <div className="flex-shrink-0 w-12 text-center border-r pr-4">
                    <span className="text-sm font-black text-primary">{8 + i}:00</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">Paciente Exemplo {i}</p>
                    <p className="text-[10px] font-black uppercase text-muted-foreground truncate tracking-widest">Convênio Ativo</p>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-700 border-none font-black text-[8px] uppercase px-2 py-0.5">Confirmado</Badge>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <Link href="/agenda/">
                <Button variant="ghost" className="text-xs font-black uppercase text-accent hover:text-accent hover:bg-accent/5 tracking-[0.2em]">
                  Ver agenda operacional <ChevronDown className="h-4 w-4 -rotate-90 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-5 space-y-6">
          <Card className="border-none ring-1 ring-border shadow-xl bg-white border-accent/20 rounded-[2rem] overflow-hidden">
             <CardHeader className="bg-accent/5 border-b p-5">
                <CardTitle className="font-headline text-lg flex items-center gap-3 text-accent uppercase tracking-tighter">
                   <Calendar className="h-5 w-5" /> Próximas Datas
                </CardTitle>
                <CardDescription className="text-[10px] font-black uppercase tracking-wider opacity-60">Celebrações nos próximos 30 dias</CardDescription>
             </CardHeader>
             <CardContent className="p-0">
                <div className="max-h-[350px] overflow-y-auto">
                   {upcomingAnniversaries.map((anniv, idx) => (
                     <div key={idx} className="flex items-center justify-between p-4 border-b border-accent/5 hover:bg-accent/[0.02] transition-colors">
                        <div className="flex items-center gap-3">
                           <div className={cn(
                             "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                             anniv.tipo === 'empresa' ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
                           )}>
                              {anniv.tipo === 'empresa' ? <Medal className="h-4 w-4" /> : <Cake className="h-4 w-4" />}
                           </div>
                           <div>
                              <p className="text-sm font-black text-slate-800 leading-none uppercase tracking-tight">{anniv.nome}</p>
                              <p className="text-[9px] font-black text-muted-foreground uppercase mt-1 tracking-widest">{anniv.info}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-sm font-black text-accent">{format(anniv.data, 'dd/MM')}</p>
                           <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{format(anniv.data, 'EEEE', { locale: ptBR })}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}