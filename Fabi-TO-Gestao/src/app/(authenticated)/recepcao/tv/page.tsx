
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { col, ref, SUB } from '@/lib/tenancy';
import { Appointment, User, ClinicSettings } from '@/app/lib/types';
import { format, isSameDay, parseISO, isAfter, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/components/providers/auth-provider';
import { 
  Clock, 
  Monitor, 
  Maximize,
  Minimize,
  Bell,
  Wifi,
  Phone,
  Calendar,
  User as UserIcon,
  Stethoscope
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TVDashboardPage() {
  const firestore = useFirestore();
  const { firebaseUser, loading: authLoading, identidade } = useAuth();
  const clinicaId = identidade.clinicaId;
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [comunicados, setComunicados] = useState<{ id: string; texto: string }[]>([]);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [allApts, setAllApts] = useState<Appointment[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (authLoading || !mounted) return;
    
    if (isGuest) {
      const loadSimulation = () => {
        setAllApts(JSON.parse(localStorage.getItem('demo_appointments') || '[]'));
        setStaff([
          { uid: 'g1', nome: 'Dra. Fabiula Oliveira', perfil: 'gestor' },
          { uid: 'u3', nome: 'Dra. Ana Paula', perfil: 'colaborador' }
        ] as any);
        const savedMural = localStorage.getItem('demo_mural');
        setComunicados(savedMural ? JSON.parse(savedMural) : [{ id: '1', texto: 'Seja bem-vindo(a) à nossa clínica. Conte conosco para o seu bem-estar.' }]);
        
        const savedSettings = localStorage.getItem('demo_settings');
        setSettings(savedSettings ? JSON.parse(savedSettings) : null);
      };

      loadSimulation();
      window.addEventListener('storage', loadSimulation);
      return () => window.removeEventListener('storage', loadSimulation);

    } else if (firestore && firebaseUser) {
      const unsubCom = onSnapshot(col(firestore, clinicaId!, SUB.comunicados), (snap) => setComunicados(snap.docs.map(d => ({ ...d.data(), id: d.id } as any))));
      const unsubSet = onSnapshot(ref(firestore, clinicaId!, SUB.configuracoes, 'clinica'), (snap) => snap.exists() && setSettings(snap.data() as ClinicSettings));
      const unsubApts = onSnapshot(col<Appointment>(firestore, clinicaId!, SUB.agendamentos), (snap) => setAllApts(snap.docs.map(d => ({ ...d.data(), id: d.id } as any))));
      const unsubStaff = onSnapshot(col<User>(firestore, clinicaId!, SUB.usuarios), (snap) => setStaff(snap.docs.map(d => ({ ...d.data(), uid: d.id } as User))));
      return () => { unsubCom(); unsubSet(); unsubApts(); unsubStaff(); };
    }
  }, [firestore, isGuest, firebaseUser, authLoading, mounted]);

  const normalizeDate = (d: any) => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d.toDate === 'function') return d.toDate();
    if (typeof d === 'string') return parseISO(d);
    return new Date(d);
  };

  const formatNameForPrivacy = (fullName: string) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const firstName = parts[0];
    const lastPart = parts[parts.length - 1];
    return `${firstName} ${lastPart.charAt(0).toUpperCase()}.`;
  };

  const todayApts = useMemo(() => {
    return (allApts || []).filter(a => {
      const d = normalizeDate(a.data_hora);
      return d && isSameDay(d, new Date()) && a.status !== 'cancelado' && a.status !== 'bloqueado';
    });
  }, [allApts]);

  const inRoom = todayApts.filter(a => a.status === 'atendimento');
  const upcoming = todayApts
    .filter(a => ['agendado', 'confirmado', 'espera', 'aguardando_confirmacao'].includes(a.status))
    .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));

  const getStatusInfo = (apt: Appointment, now: Date) => {
    const aptTime = normalizeDate(apt.data_hora);
    // Prioridade total para o atraso real (Vermelho)
    if (aptTime && isAfter(now, addMinutes(aptTime, 10))) {
      return { label: 'ATRASADO', color: 'bg-rose-600' };
    }
    
    // Status secundário: sinalizado pelo profissional (Laranja)
    const profActiveApt = inRoom.find(a => a.profissional_id === apt.profissional_id);
    if (profActiveApt?.atraso_sinalizado_minutos && profActiveApt.atraso_sinalizado_minutos > 0) {
      const profUpcoming = upcoming.filter(u => u.profissional_id === apt.profissional_id);
      if (profUpcoming[0]?.id === apt.id) {
        return { label: `ATRASO PREVISTO (+${profActiveApt.atraso_sinalizado_minutos}m)`, color: 'bg-amber-500' };
      }
    }
    return { label: 'CONFORME CRONOGRAMA', color: 'bg-emerald-500' };
  };

  const formattedWorkingHours = useMemo(() => {
    if (!settings?.workingHours) return null;

    const formatDayConfig = (config: any) => {
      if (!config?.active) return null;
      const start = config.start || "08:00";
      const end = config.end || "18:00";
      const pausas = (config.pausas || []).filter((p: any) => p.start >= start && p.end <= end);
      
      if (pausas.length === 0) return `das ${start} às ${end} (sem fechar ao meio dia)`;
      
      const sortedPausas = [...pausas].sort((a, b) => a.start.localeCompare(b.start));
      const segments: string[] = [];
      let lastTime = start;
      
      sortedPausas.forEach((pausa) => {
        if (pausa.start > lastTime) {
          segments.push(`${lastTime} às ${pausa.start}`);
        }
        lastTime = pausa.end;
      });
      
      if (lastTime < end) {
        segments.push(`${lastTime} às ${end}`);
      }
      
      const combined = segments.reduce((acc, curr, idx) => {
        if (idx === 0) return `das ${curr}`;
        return `${acc} e das ${curr}`;
      }, "");

      return combined;
    };

    const weekdays = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
    const isSameConfig = (c1: any, c2: any) => {
      if (!c1 || !c2) return false;
      if (c1.active !== c2.active || c1.start !== c2.start || c1.end !== c2.end) return false;
      return JSON.stringify(c1.pausas) === JSON.stringify(c2.pausas);
    };

    const firstWeekdayConfig = settings.workingHours[weekdays[0]];
    const allWeekdaysSame = weekdays.every(day => isSameConfig(settings.workingHours[day], firstWeekdayConfig));

    if (!currentTime) return null;
    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const todayKey = dayNames[currentTime.getDay()];

    if (allWeekdaysSame && weekdays.includes(todayKey) && firstWeekdayConfig.active) {
      const formatted = formatDayConfig(firstWeekdayConfig);
      if (formatted) return `Segunda a Sexta-feira: ${formatted}`;
    }

    const todayConfig = settings.workingHours[todayKey];
    const formattedToday = formatDayConfig(todayConfig);
    return formattedToday ? `Hoje: ${formattedToday}` : 'Fechado hoje';
  }, [settings, currentTime]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { 
      document.documentElement.requestFullscreen(); 
      setIsFullscreen(true); 
    } else { 
      document.exitFullscreen(); 
      setIsFullscreen(false); 
    }
  };

  if (!mounted || !currentTime) return null;

  return (
    <div className="fixed inset-0 bg-[#F1F4F5] z-[1000] overflow-hidden flex flex-col">
      <div className="h-16 md:h-24 bg-primary text-white flex items-center justify-between px-6 md:px-10 shadow-2xl border-b-4 md:border-b-8 border-accent shrink-0">
        <div className="flex items-center gap-4">
           <div className="h-10 w-10 md:h-14 md:w-14 rounded-xl bg-white flex items-center justify-center shadow-lg">
             <Monitor className="h-6 w-6 md:h-8 md:w-8 text-primary" />
           </div>
           <div>
             <h1 className="text-sm md:text-2xl font-headline font-bold uppercase tracking-tight leading-none">Painel de Chamadas</h1>
             <p className="text-[7px] md:text-[10px] font-black uppercase text-white/50 mt-1">Dra. Fabiula Oliveira • Terapia Ocupacional</p>
           </div>
        </div>
        <div className="flex items-center gap-4 md:gap-8">
           <div className="text-right">
             <p className="text-[8px] md:text-xs font-black uppercase text-white/40 tracking-[0.2em] mb-1">
               {format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR })}
             </p>
             <p className="text-xl md:text-5xl font-black tabular-nums leading-none">{format(currentTime, 'HH:mm:ss')}</p>
           </div>
           <button onClick={toggleFullscreen} className="text-white/20 hover:text-white transition-colors">
             {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
           </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-4 p-4 md:p-6 overflow-hidden min-h-0">
        <div className="lg:col-span-7 flex flex-col min-h-0">
           <h2 className="text-[10px] md:text-lg font-black uppercase text-primary tracking-widest mb-2 px-1 flex items-center gap-2">
             <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Atendimento Agora
           </h2>
           <Card className="flex-1 rounded-2xl md:rounded-[3rem] shadow-xl overflow-hidden bg-white/40 backdrop-blur-sm border-none p-2 flex flex-col min-h-0">
              <ScrollArea className="flex-1">
                <div className="space-y-3 p-2 md:p-4">
                  {inRoom.map(apt => {
                    const doctor = staff.find(s => s.uid === apt.profissional_id);
                    return (
                      <Card key={apt.id} className="rounded-xl md:rounded-3xl border-none shadow-md p-4 md:p-8 flex items-center gap-6 bg-white relative overflow-hidden group animate-in slide-in-from-left duration-500">
                        <div className="absolute top-0 left-0 bottom-0 w-2 md:w-3 bg-emerald-500" />
                        <div className="h-12 w-12 md:h-20 md:w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl md:text-3xl font-black shrink-0 shadow-inner">
                          {apt.paciente_nome.charAt(0)}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-[8px] md:text-[10px] font-black uppercase text-primary/40 tracking-widest">PACIENTE EM SALA</p>
                          <h3 className="text-sm md:text-3xl font-black text-slate-800 uppercase truncate leading-tight">
                            {formatNameForPrivacy(apt.paciente_nome)}
                          </h3>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-accent/10 text-accent border-none text-[8px] md:text-xs font-black uppercase py-1">
                              <Stethoscope className="h-3 w-3 mr-1.5 inline" /> {doctor?.nome || 'Profissional'}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {inRoom.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-slate-300 py-12">
                      <Clock className="h-16 w-16 mb-4 opacity-20" />
                      <p className="text-sm font-black uppercase tracking-widest text-center">Aguardando Próximo Paciente</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
           </Card>
        </div>

        <div className="lg:col-span-5 flex flex-col min-h-0">
           <h2 className="text-[10px] md:text-lg font-black uppercase text-primary tracking-widest mb-2 px-1">Próximos Chamados</h2>
           <Card className="flex-1 rounded-2xl md:rounded-[3rem] shadow-2xl overflow-hidden bg-white flex flex-col min-h-0">
              <ScrollArea className="flex-1">
                 <div className="divide-y divide-slate-50">
                    {upcoming.map(apt => {
                      const st = getStatusInfo(apt, currentTime || new Date());
                      const doctor = staff.find(s => s.uid === apt.profissional_id);
                      return (
                        <div key={apt.id} className="p-4 md:p-6 flex items-center justify-between hover:bg-slate-50 transition-colors animate-in fade-in">
                           <div className="flex items-center gap-4 md:gap-6 min-w-0">
                              <span className="text-sm md:text-2xl font-black text-slate-800 tabular-nums w-8 md:w-16 text-center">{apt.time}</span>
                              <div className="min-w-0 space-y-0.5">
                                 <p className="text-xs md:text-xl font-black text-primary uppercase truncate leading-none">
                                   {formatNameForPrivacy(apt.paciente_nome)}
                                 </p>
                                 <p className="text-[8px] md:text-xs font-bold text-slate-400 uppercase tracking-tighter truncate flex items-center gap-1">
                                    <UserIcon className="h-2 w-2 md:h-3 md:w-3" /> {doctor?.nome || 'Profissional'}
                                 </p>
                              </div>
                           </div>
                           <Badge className={cn("text-[6px] md:text-[9px] font-black uppercase border-none text-white px-2 md:px-4 py-1.5 rounded-full whitespace-nowrap shadow-sm transition-colors duration-500", st.color)}>
                              {st.label}
                           </Badge>
                        </div>
                      );
                    })}
                    {upcoming.length === 0 && (
                      <div className="p-12 text-center opacity-20 flex flex-col items-center gap-4">
                        <Calendar className="h-12 w-12" />
                        <p className="text-[10px] md:text-lg font-black uppercase tracking-[0.3em]">Agenda encerrada</p>
                      </div>
                    )}
                 </div>
              </ScrollArea>
           </Card>
        </div>
      </div>

      <div className="h-auto bg-white border-t p-4 md:px-10 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
           <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="h-4 w-4 text-emerald-700" />
                <p className="text-[7px] md:text-[8px] font-black text-emerald-600 uppercase tracking-widest">WiFi: {settings?.wifi_nome || 'Clínica'}</p>
              </div>
              <p className="text-xs md:text-lg font-black text-emerald-900 leading-tight break-words">{settings?.wifi_senha || '---'}</p>
           </div>
           <div className="bg-primary/5 rounded-xl p-3 border border-primary/10 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-1">
                <Phone className="h-4 w-4 text-primary" />
                <p className="text-[7px] md:text-[8px] font-black text-primary/60 uppercase tracking-widest">Contato</p>
              </div>
              <p className="text-xs md:text-lg font-black text-primary leading-tight break-words">{settings?.telefone_clinica || '---'}</p>
           </div>
           <div className="bg-accent/5 rounded-xl p-3 border border-accent/10 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-accent" />
                <p className="text-[7px] md:text-[8px] font-black text-accent/60 uppercase tracking-widest">Expediente</p>
              </div>
              <p className="text-xs md:text-lg font-black text-accent leading-tight break-words">{formattedWorkingHours || 'Segunda a Sexta-feira: das 08:00 às 18:00'}</p>
           </div>
        </div>

        <div className="h-10 md:h-12 bg-accent text-white flex items-center px-4 rounded-xl relative overflow-hidden shadow-lg">
           <div className="flex items-center gap-3 z-10 bg-accent pr-4 border-r border-white/20 h-full">
              <Bell className="h-4 w-4 animate-bounce" />
              <h4 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em]">Avisos</h4>
           </div>
           <div className="flex-1 overflow-hidden h-full flex items-center">
              <div className="flex whitespace-nowrap animate-marquee gap-24">
                 {(comunicados.length > 0 ? comunicados : [{texto: 'Bem-vindos à Clínica Dra. Fabiula Oliveira.'}]).map((c, i) => (
                   <span key={i} className="text-xs md:text-base font-bold uppercase tracking-tight px-10">"{c.texto}"</span>
                 ))}
                 {(comunicados.length > 0 ? comunicados : [{texto: 'Bem-vindos à Clínica Dra. Fabiula Oliveira.'}]).map((c, i) => (
                   <span key={`dup-${i}`} className="text-xs md:text-base font-bold uppercase tracking-tight px-10">"{c.texto}"</span>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
