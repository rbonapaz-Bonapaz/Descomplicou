
"use client"

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDoc, useFirestore, useCollection } from '@/firebase';
import { addDoc, updateDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { col, ref, prontuarioCol, SUB } from '@/lib/tenancy';
import { registrarAcessoProntuario } from '@/services/auditService';
import { Patient, EvolutionEntry, Appointment } from '@/app/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ArrowLeft, 
  Stethoscope, 
  History, 
  Activity, 
  Pill, 
  Files, 
  Brain, 
  CalendarCheck,
  LayoutDashboard,
  Timer,
  AlertTriangle,
  Repeat,
  Fingerprint,
  Download,
  Users,
  Calendar,
  HeartPulse,
  Clock,
  MessageSquare,
  ClipboardList,
  ChevronRight,
  XCircle,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, isSameDay, differenceInYears, parseISO, isValid, differenceInSeconds } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function PatientDetailsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  
  const db = useFirestore();
  const { user, firebaseUser, loading: authLoading, identidade, pode } = useAuth();
  const clinicaId = identidade.clinicaId;
  const semAcessoProntuario = !pode('prontuario.ler');
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const { toast } = useToast();
  
  const [guestPatient, setGuestPatient] = useState<Patient | null>(null);
  const [guestAppointments, setGuestAppointments] = useState<Appointment[]>([]);
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const [activeTab, setActiveTab] = useState<string>("timeline");
  const [hasInitializedTab, setHasInitializedTab] = useState(false);

  // Real-time synchronization hooks
  const patientRef = useMemo(() => (db && firebaseUser && !isGuest && id ? ref<Patient>(db, clinicaId!, SUB.pacientes, id) : null), [db, id, isGuest, firebaseUser]);
  const { data: firestorePatient, loading: firestoreLoading } = useDoc<Patient>(patientRef);
  
  const appointmentsQuery = useMemo(() => {
    if (!db || !id || !firebaseUser || isGuest) return null;
    return query(
      col<Appointment>(db, clinicaId!, SUB.agendamentos),
      where('paciente_id', '==', id),
      orderBy('data_hora', 'desc')
    );
  }, [db, id, isGuest, firebaseUser]);
  
  const radarQuery = useMemo(() => {
    if (!db || !user || !firebaseUser || isGuest) return null;
    return query(
      col<Appointment>(db, clinicaId!, SUB.agendamentos),
      where('profissional_id', '==', user.uid),
      orderBy('data_hora', 'asc')
    );
  }, [db, user, isGuest, firebaseUser]);

  const { data: firestoreAppointments } = useCollection<Appointment>(appointmentsQuery);
  const { data: radarApts } = useCollection<Appointment>(radarQuery);

  // O prontuário vive em subcoleção própria (`pacientes/{id}/prontuario`), que as
  // regras só liberam para o papel `profissional`. Quem não pode ler simplesmente
  // recebe lista vazia do servidor — não é a tela que esconde.
  const prontuarioQuery = useMemo(() => {
    if (!db || !clinicaId || !id) return null;
    return query(prontuarioCol<EvolutionEntry>(db, clinicaId, id), orderBy('data', 'desc'));
  }, [db, clinicaId, id]);

  const { data: prontuario } = useCollection<EvolutionEntry>(prontuarioQuery);

  useEffect(() => {
    if (authLoading) return;
    if (isGuest && id) {
      const loadData = () => {
        const savedPatients = localStorage.getItem('demo_patients');
        const patientsList: Patient[] = savedPatients ? JSON.parse(savedPatients) : [];
        const selected = patientsList.find(p => p.id === id);
        if (selected) setGuestPatient(selected);
        const savedApts = localStorage.getItem('demo_appointments');
        const allApts: Appointment[] = savedApts ? JSON.parse(savedApts) : [];
        setGuestAppointments(allApts.filter(a => a.paciente_id === id));
      };
      loadData();
    }
  }, [isGuest, id, authLoading]);

  const appointments = isGuest ? guestAppointments : firestoreAppointments;

  const normalizeDate = (d: any) => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d.toDate === 'function') return d.toDate();
    if (typeof d === 'string') return parseISO(d);
    if (d && d.seconds) return new Date(d.seconds * 1000);
    return new Date(d);
  };

  const currentApt = useMemo(() => {
    return (appointments || []).find(a => {
      const aptDate = normalizeDate(a.data_hora);
      return a.status === 'atendimento' && aptDate && isSameDay(aptDate, new Date());
    });
  }, [appointments]);

  useEffect(() => {
    if (appointments && !hasInitializedTab) {
      if (currentApt) {
        setActiveTab("cockpit");
      } else if (semAcessoProntuario) {
        setActiveTab("sessoes");
      } else {
        setActiveTab("timeline");
      }
      setHasInitializedTab(true);
    }
  }, [currentApt, semAcessoProntuario, appointments, hasInitializedTab]);

  useEffect(() => {
    if (!currentApt?.inicio_atendimento) {
      setElapsedTime("00:00");
      return;
    }
    
    const updateTimer = () => {
      const start = normalizeDate(currentApt.inicio_atendimento);
      if (start && !isNaN(start.getTime())) {
        const totalSeconds = differenceInSeconds(new Date(), start);
        if (totalSeconds >= 0) {
          const h = Math.floor(totalSeconds / 3600);
          const m = Math.floor((totalSeconds % 3600) / 60);
          const s = totalSeconds % 60;
          
          const pad = (n: number) => n.toString().padStart(2, '0');
          if (h > 0) {
            setElapsedTime(`${pad(h)}:${pad(m)}:${pad(s)}`);
          } else {
            setElapsedTime(`${pad(m)}:${pad(s)}`);
          }
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentApt?.inicio_atendimento]);

  const [newEvolution, setNewEvolution] = useState('');
  const [newSecNote, setNewSecNote] = useState('');
  const [newPrescription, setNewPrescription] = useState('');
  const [needsReturn, setNeedsReturn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const patient = isGuest ? guestPatient : firestorePatient;
  const loading = !isGuest && (firestoreLoading || authLoading);

  // Registra o acesso ao prontuário (LGPD art. 37). Só uma vez por paciente aberto,
  // não a cada re-render, senão a trilha vira ruído e não serve de prova.
  const acessoRegistrado = React.useRef<string | null>(null);
  useEffect(() => {
    if (!db || !clinicaId || !user || !id || !patient) return;
    if (!pode('prontuario.ler')) return;
    if (acessoRegistrado.current === id) return;
    acessoRegistrado.current = id;
    registrarAcessoProntuario(db, clinicaId, { uid: user.uid, nome: user.nome }, id, patient.nome);
  }, [db, clinicaId, user, id, patient, pode]);


  const waitlist = useMemo(() => {
    const apts = isGuest ? (JSON.parse(localStorage.getItem('demo_appointments') || '[]') as Appointment[]).filter(a => a.profissional_id === user?.uid) : radarApts;
    return (apts || []).filter(a => {
      const aptDate = normalizeDate(a.data_hora);
      return a.status === 'espera' && aptDate && isSameDay(aptDate, new Date());
    });
  }, [radarApts, isGuest, user?.uid]);

  const todayAgenda = useMemo(() => {
    const apts = isGuest ? (JSON.parse(localStorage.getItem('demo_appointments') || '[]') as Appointment[]).filter(a => a.profissional_id === user?.uid) : radarApts;
    return (apts || []).filter(a => {
      const aptDate = normalizeDate(a.data_hora);
      return aptDate && isSameDay(aptDate, new Date()) && a.status !== 'bloqueado';
    });
  }, [radarApts, isGuest, user?.uid]);

  const handleAddEntry = async (tipo: 'evolucao' | 'prescricao') => {
    if (!id || isSaving) return;
    const descricao = tipo === 'evolucao' ? newEvolution : newPrescription;
    if (!descricao.trim()) return;
    
    if (!db || !clinicaId || !user) return;

    setIsSaving(true);
    // A entrada NÃO carrega recado de recepção. Nota administrativa vive no
    // agendamento (que a recepção lê); o prontuário guarda só conteúdo clínico.
    // Misturar os dois foi o que obrigava a abrir o prontuário para a recepção.
    const entry: Omit<EvolutionEntry, 'id'> = {
      data: new Date().toISOString(),
      profissional_id: user.uid,
      profissional_nome: user.nome || 'Profissional',
      ...(user.conselho_sigla && user.conselho_numero
        ? { profissional_conselho: `${user.conselho_sigla} ${user.conselho_numero}` }
        : {}),
      descricao,
      tipo,
      assinatura_digital: true,
      assinada_em: new Date().toISOString(),
      ...(currentApt ? { agendamento_id: currentApt.id } : {}),
      ...(tipo === 'evolucao' ? { necessita_retorno: needsReturn } : {}),
      criada_em: new Date().toISOString(),
    };

    try {
      // Subcoleção própria, protegida por regra que só aceita profissional de saúde.
      await addDoc(prontuarioCol(db, clinicaId, id), entry);

      if (currentApt && newSecNote.trim()) {
        await updateDoc(ref(db, clinicaId, SUB.agendamentos, currentApt.id), {
          observacao_secretaria: newSecNote,
        });
      }
      setNewEvolution('');
      setNewSecNote('');
      setNewPrescription('');
      setNeedsReturn(false);
      toast({ title: 'Registro Assinado' });
    } catch (e) { toast({ variant: 'destructive', title: 'Erro ao salvar' }); }
    finally { setIsSaving(false); }
  };

  const handleSignalDelay = async () => {
    if (!currentApt) return;
    const novoAtraso = (currentApt.atraso_sinalizado_minutos || 0) + 10;
    
    try {
      if (isGuest) {
        const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
        const updated = saved.map((x: any) => x.id === currentApt.id ? { ...x, atraso_sinalizado_minutos: novoAtraso } : x);
        localStorage.setItem('demo_appointments', JSON.stringify(updated));
        setGuestAppointments(updated.filter((a: any) => a.paciente_id === id));
      } else if (db) {
        await updateDoc(ref<Appointment>(db, clinicaId!, SUB.agendamentos, currentApt.id), { atraso_sinalizado_minutos: novoAtraso });
      }
      toast({ title: `Atraso sinalizado: +${novoAtraso} min`, description: "A recepção e o painel TV foram notificados." });
    } catch (e) {
      toast({ variant: 'destructive', title: "Erro ao sinalizar atraso" });
    }
  };

  const handleClearDelay = async () => {
    if (!currentApt) return;
    try {
      if (isGuest) {
        const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
        const updated = saved.map((x: any) => x.id === currentApt.id ? { ...x, atraso_sinalizado_minutos: 0 } : x);
        localStorage.setItem('demo_appointments', JSON.stringify(updated));
        setGuestAppointments(updated.filter((a: any) => a.paciente_id === id));
      } else if (db) {
        await updateDoc(ref<Appointment>(db, clinicaId!, SUB.agendamentos, currentApt.id), { atraso_sinalizado_minutos: 0 });
      }
      toast({ title: "Atraso Removido", description: "O cronograma foi normalizado na recepção." });
    } catch (e) {
      toast({ variant: 'destructive', title: "Erro ao limpar atraso" });
    }
  };

  const renderTimelineEntry = (entry: EvolutionEntry) => {
    const typeConfig: Record<string, { label: string, icon: any, color: string }> = {
      evolucao: { label: 'EVOLUÇÃO', icon: Activity, color: 'text-primary' },
      prescricao: { label: 'PRESCRIÇÃO', icon: Pill, color: 'text-accent' },
      anamnese: { label: 'ANAMNESE', icon: Brain, color: 'text-indigo-600' },
      exame: { label: 'EXAME / DOC', icon: Files, color: 'text-emerald-600' },
      avaliacao: { label: 'AVALIAÇÃO', icon: ClipboardList, color: 'text-orange-600' }
    };

    const config = typeConfig[entry.tipo] || typeConfig.evolucao;
    const Icon = config.icon;

    return (
      <Card key={entry.id} className={cn("border-none ring-1 ring-border shadow-sm rounded-2xl overflow-hidden mb-4", entry.tipo === 'prescricao' && "bg-slate-50")}>
        <CardHeader className={cn("py-3 border-b flex flex-row items-center justify-between px-4", entry.tipo === 'prescricao' ? "bg-accent/5" : "bg-muted/5")}>
          <div className="flex items-center gap-2">
            <Icon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
            <span className={cn("text-[9px] font-black uppercase tracking-widest", config.color)}>
              {format(normalizeDate(entry.data) || new Date(), "dd 'MMMM', yyyy", { locale: ptBR })}
              {" • "}{config.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {entry.assinatura_digital && (
               <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[7px] font-black uppercase px-1.5 py-0 shrink-0">
                 Assinado
               </Badge>
            )}
            <Badge variant="outline" className="text-[7px] bg-white uppercase font-black shrink-0">Por: {entry.profissional_nome}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap font-medium">{entry.descricao}</p>
          {entry.retifica_entrada_id && (
            <p className="mt-2 text-[9px] font-black uppercase text-amber-700">
              Retificação de registro anterior
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) return <div className="p-12 text-center text-xs font-black uppercase animate-pulse">Carregando PEP...</div>;
  if (!patient) return <div className="p-12 text-center">Paciente não encontrado.</div>;

  return (
    <div className="space-y-4 md:space-y-6 pb-20 animate-in fade-in duration-500 px-1 md:px-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10 border bg-white shadow-sm shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-12 w-12 border-2 border-white shadow-md shrink-0">
              <AvatarImage src={patient?.foto_url} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-primary font-black">{patient?.nome.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-lg md:text-2xl font-headline font-bold text-primary truncate">{patient?.nome}</h1>
              <Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-1.5">{patient?.data_nascimento ? differenceInYears(new Date(), parseISO(patient.data_nascimento)) : '---'} ANOS</Badge>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="h-10 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest border-primary/20 text-primary hidden md:flex shrink-0">
          <Download className="h-4 w-4 mr-2" /> PDF
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-1 overflow-x-auto scrollbar-none pb-2">
          <TabsList className="flex h-auto p-1 bg-[#E9EEF1] rounded-2xl shadow-inner mb-6 print:hidden w-max md:grid md:grid-cols-7 md:w-full">
            {[
              { id: 'cockpit', label: 'Atendimento', icon: LayoutDashboard },
              { id: 'timeline', label: 'Timeline', icon: History },
              { id: 'anamnese', label: 'Anamnese', icon: Brain },
              { id: 'evolucao', label: 'Evolução', icon: Activity },
              { id: 'prescricao', label: 'Receitas', icon: Pill },
              { id: 'documentos', label: 'Exames', icon: Files },
              { id: 'sessoes', label: 'Sessões', icon: CalendarCheck }
            ].map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="py-2.5 px-6 md:px-0 text-[8px] font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-white shrink-0">
                <tab.icon className="h-3 w-3 mr-1.5 hidden md:inline" /> {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="cockpit" className="space-y-4 md:space-y-6 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-8 px-1">
            <div className="lg:col-span-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="rounded-2xl p-4 bg-primary/5 border-none ring-1 ring-border shadow-sm">
                  <p className="text-[8px] font-black uppercase text-primary/60 mb-1 tracking-widest">Queixa Base</p>
                  <p className="text-[10px] font-bold text-slate-700 italic line-clamp-2">"{patient?.queixa_principal || 'Não informada'}"</p>
                </Card>
                <Card className="rounded-2xl p-4 bg-accent/5 border-none ring-1 ring-border shadow-sm relative overflow-hidden">
                  <div className="absolute top-2 right-4 flex items-center gap-2">
                     {/* Novo Local do Badge (Seta Azul) */}
                     {currentApt?.atraso_sinalizado_minutos && currentApt.atraso_sinalizado_minutos > 0 ? (
                        <Badge className="bg-rose-500 text-white border-none text-[8px] font-black animate-pulse py-0.5 px-1.5 h-auto">+{currentApt.atraso_sinalizado_minutos}M</Badge>
                     ) : null}
                     <div className="flex items-center gap-1">
                        <div className={cn("h-1.5 w-1.5 rounded-full", currentApt ? "bg-accent animate-pulse" : "bg-slate-300")} />
                        <span className="text-[6px] font-black uppercase text-accent/60">Live</span>
                     </div>
                  </div>
                  <p className="text-[8px] font-black uppercase text-accent/60 mb-1 tracking-widest">Tempo de Sessão</p>
                  <div className="flex items-end justify-between">
                    <p className="text-2xl font-black text-accent tabular-nums leading-none mt-1">{elapsedTime}</p>
                  </div>
                </Card>
                <Card className={cn("rounded-2xl p-4 border-none ring-1 ring-border shadow-sm flex items-center justify-between", currentApt ? "bg-emerald-50" : "bg-slate-50")}>
                  <div>
                    <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Status</p>
                    <p className={cn("text-[10px] font-black uppercase", currentApt ? "text-emerald-700" : "text-slate-500")}>
                      {currentApt ? "Sessão Ativa" : "Aguardando Início"}
                    </p>
                  </div>
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", currentApt ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400")}>
                    <HeartPulse className={cn("h-4 w-4", currentApt && "animate-bounce")} />
                  </div>
                </Card>
              </div>

              <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl overflow-hidden bg-white">
                <CardHeader className="bg-primary/5 border-b p-6 flex flex-row items-center justify-between">
                  <CardTitle className="font-headline text-lg md:text-2xl text-primary flex items-center gap-3">Relato da Sessão</CardTitle>
                </CardHeader>
                <CardContent className="p-6 md:p-8 space-y-6">
                  <Textarea 
                    placeholder="Descreva a evolução terapêutica..."
                    className="min-h-[250px] rounded-2xl bg-slate-50 border-none shadow-inner p-4 text-sm font-medium focus-visible:ring-primary/20"
                    value={newEvolution}
                    onChange={(e) => setNewEvolution(e.target.value)}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-2">
                      <Label className="text-[9px] font-black uppercase text-amber-700 flex items-center gap-2"><MessageSquare className="h-3 w-3" /> Recado para Recepção</Label>
                      <Textarea placeholder="Próximo agendamento, cobrar material..." className="h-20 rounded-xl bg-white border-none shadow-md text-xs font-bold focus-visible:ring-amber-200" value={newSecNote} onChange={(e) => setNewSecNote(e.target.value)} />
                    </div>
                    <div className="p-4 bg-accent/5 rounded-2xl border border-accent/10 space-y-2">
                      <Label className="text-[9px] font-black uppercase text-accent flex items-center gap-2"><Pill className="h-3 w-3" /> Prescrição & Conduta</Label>
                      <Textarea placeholder="Orientações e exercícios..." className="h-20 rounded-xl bg-white border-none shadow-md text-xs font-bold focus-visible:ring-accent/20" value={newPrescription} onChange={(e) => setNewPrescription(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-dashed">
                    <div className="flex flex-col items-center gap-1.5">
                       <button 
                         onClick={handleSignalDelay} 
                         disabled={!currentApt || (currentApt?.atraso_sinalizado_minutos || 0) >= 60}
                         className={cn(
                           "h-12 px-6 rounded-xl font-black uppercase text-[9px] tracking-widest border-2 transition-all flex items-center justify-center gap-2",
                           currentApt?.atraso_sinalizado_minutos ? "border-amber-100 bg-amber-50/50 text-amber-400 cursor-default" : "border-amber-200 text-amber-600 hover:bg-amber-50"
                         )}
                       >
                         <AlertTriangle className="h-4 w-4" /> Sinalizar Atraso (+10m)
                       </button>
                       {/* Texto "Sinalizado" e botão de cancelamento */}
                       {currentApt?.atraso_sinalizado_minutos && currentApt.atraso_sinalizado_minutos > 0 && (
                          <div className="flex items-center gap-2 px-1">
                             <span className="text-[10px] font-black uppercase text-rose-600">Sinalizado</span>
                             <button 
                               onClick={handleClearDelay}
                               className="h-5 w-5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center hover:bg-rose-100 transition-colors"
                             >
                               <X className="h-3 w-3" />
                             </button>
                          </div>
                       )}
                    </div>
                    
                    <button 
                      onClick={() => setNeedsReturn(!needsReturn)} 
                      className={cn(
                        "h-12 px-6 rounded-xl font-black uppercase text-[9px] tracking-widest border-2 transition-all flex items-center justify-center gap-2", 
                        needsReturn ? "border-rose-600 bg-rose-600 text-white shadow-lg" : "border-slate-200 text-slate-400 hover:bg-slate-50"
                      )}
                    >
                      <Repeat className="h-4 w-4" /> {needsReturn ? 'Retorno Pedido' : 'Sugerir Retorno'}
                    </button>
                    <Button 
                      onClick={() => handleAddEntry('evolucao')} 
                      disabled={isSaving || !newEvolution.trim()} 
                      className="bg-primary h-12 px-10 rounded-xl font-black uppercase tracking-widest text-[9px] text-white shadow-xl hover:scale-105 transition-transform"
                    >
                      {isSaving ? 'Gravando...' : 'Assinar Evolução'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <Card className="rounded-[1.5rem] border-none ring-1 ring-border shadow-md bg-white overflow-hidden">
                <CardHeader className="bg-amber-50 p-4 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-700 min-w-0">
                    <Users className="h-4 w-4 shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-widest truncate">Sala de Espera</span>
                  </div>
                  <Badge className="bg-amber-500 text-white text-[8px] h-4 w-4 p-0 flex items-center justify-center rounded-full shrink-0">{waitlist.length}</Badge>
                </CardHeader>
                <div className="divide-y max-h-[200px] overflow-y-auto">
                   {waitlist.map(w => (
                     <div key={w.id} className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-primary uppercase truncate">{w.paciente_nome}</p>
                          <p className="text-[8px] font-bold text-muted-foreground truncate">Chegou: {w.chegada_horario ? format(normalizeDate(w.chegada_horario)!, 'HH:mm') : '--:--'}</p>
                        </div>
                        <Badge variant="outline" className="text-[7px] border-amber-200 text-amber-600 font-black shrink-0">ESPERA</Badge>
                     </div>
                   ))}
                   {waitlist.length === 0 && <p className="p-6 text-center text-[9px] font-bold opacity-30 uppercase">Sala vazia</p>}
                </div>
              </Card>

              <Card className="rounded-[1.5rem] border-none ring-1 ring-border shadow-md bg-white overflow-hidden">
                <CardHeader className="bg-slate-50 p-4 border-b flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary truncate">Hoje</span>
                </CardHeader>
                <div className="divide-y max-h-[400px] overflow-y-auto">
                   {todayAgenda.map(a => (
                     <div key={a.id} className={cn("p-3 flex items-center justify-between gap-3 transition-colors", a.paciente_id === id && "bg-primary/5")}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-[10px] font-black text-slate-400 w-8 shrink-0">{a.time}</span>
                          <p className="text-[10px] font-bold text-slate-700 truncate uppercase">{a.paciente_nome}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                           <Badge className={cn(
                             "text-[7px] font-black uppercase border-none px-1.5 h-4",
                             a.status === 'atendimento' ? "bg-emerald-100 text-emerald-700" :
                             a.status === 'espera' ? "bg-amber-100 text-amber-700" :
                             a.status === 'realizado' ? "bg-slate-200 text-slate-600" :
                             "bg-slate-100 text-slate-500"
                           )}>
                             {a.status}
                           </Badge>
                        </div>
                     </div>
                   ))}
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4 px-1 mt-0">
          {(prontuario || []).length > 0 ? (
            (prontuario || []).slice().sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime()).map(renderTimelineEntry)
          ) : (
            <div className="py-20 text-center text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-20">Nenhum registro clínico</div>
          )}
        </TabsContent>

        <TabsContent value="anamnese" className="space-y-4 px-1 mt-0">
           {(prontuario || []).filter(e => e.tipo === 'anamnese').length > 0 ? (
             (prontuario || []).filter(e => e.tipo === 'anamnese').map(renderTimelineEntry)
           ) : (
            <div className="py-20 text-center text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-20">Nenhuma anamnese arquivada</div>
           )}
        </TabsContent>

        <TabsContent value="evolucao" className="space-y-4 px-1 mt-0">
           {(prontuario || []).filter(e => e.tipo === 'evolucao').length > 0 ? (
             (prontuario || []).filter(e => e.tipo === 'evolucao').map(renderTimelineEntry)
           ) : (
            <div className="py-20 text-center text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-20">Nenhuma evolução registrada</div>
           )}
        </TabsContent>

        <TabsContent value="prescricao" className="space-y-4 px-1 mt-0">
           {(prontuario || []).filter(e => e.tipo === 'prescricao').length > 0 ? (
             (prontuario || []).filter(e => e.tipo === 'prescricao').map(renderTimelineEntry)
           ) : (
            <div className="py-20 text-center text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-20">Nenhuma receita prescrita</div>
           )}
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4 px-1 mt-0">
           {(prontuario || []).filter(e => e.tipo === 'exame' || e.tipo === 'avaliacao').length > 0 ? (
             (prontuario || []).filter(e => e.tipo === 'exame' || e.tipo === 'avaliacao').map(renderTimelineEntry)
           ) : (
            <div className="py-20 text-center text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-20">Nenhum documento anexado</div>
           )}
        </TabsContent>

        <TabsContent value="sessoes" className="space-y-2 px-1 mt-0">
          {appointments && appointments.length > 0 ? (
            appointments.map(apt => (
              <Card key={apt.id} className="rounded-2xl p-4 flex items-center justify-between border-none ring-1 ring-border shadow-sm bg-white hover:ring-primary/40 transition-all group gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-primary truncate">{format(normalizeDate(apt.data_hora) || new Date(), 'dd/MM/yyyy')}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                      {apt.time || '--:--'} • {apt.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                     <p className="text-[10px] font-black text-emerald-600 uppercase">R$ {apt.valor_final?.toFixed(2)}</p>
                  </div>
                  <Badge className={cn(
                    "text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border-none whitespace-nowrap", 
                    apt.status === 'realizado' ? "bg-emerald-100 text-emerald-700" : 
                    apt.status === 'atendimento' ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                  )}>
                    {apt.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-primary transition-colors hidden xs:block" />
                </div>
              </Card>
            ))
          ) : (
            <div className="py-20 text-center text-muted-foreground italic text-xs uppercase font-black tracking-widest opacity-20">Nenhum agendamento encontrado</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
