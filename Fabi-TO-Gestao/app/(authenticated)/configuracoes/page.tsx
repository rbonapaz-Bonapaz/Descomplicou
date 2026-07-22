
"use client"

import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useSearchParams } from 'next/navigation';
import { doc, setDoc, onSnapshot, collection, query, deleteDoc, orderBy, limit, addDoc, writeBatch, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Save, 
  Loader2, 
  Plus, 
  Trash2, 
  Clock, 
  Wifi,
  Bell,
  Settings2,
  History,
  ShieldAlert,
  Mail,
  Phone,
  Monitor,
  Database,
  Lock,
  CalendarX,
  Users2,
  Receipt,
  Fingerprint,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ClinicSettings, Break } from '@/app/lib/types';
import { logAction } from '@/services/auditService';
import { format } from 'date-fns';

const DAYS_OF_WEEK = [
  { id: 'domingo', label: 'D', full: 'Domingo' },
  { id: 'segunda', label: 'S', full: 'Segunda' },
  { id: 'terca', label: 'T', full: 'Terça' },
  { id: 'quarta', label: 'Q', full: 'Quarta' },
  { id: 'quinta', label: 'Q', full: 'Quinta' },
  { id: 'sexta', label: 'S', full: 'Sexta' },
  { id: 'sabado', label: 'S', full: 'Sábado' },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { user, isGestor, isGuest } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'clinica');
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [comunicados, setComunicados] = useState<{ id: string; texto: string }[]>([]);
  const [newComunicado, setNewComunicado] = useState('');

  // Segurança Zona de Perigo
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{ collection: string; label: string } | null>(null);

  const [settings, setSettings] = useState<ClinicSettings>({
    duracao_sessao: 50,
    intervalo_sessao: 10,
    limite_manha: 4,
    limite_tarde: 4,
    prazo_cancelamento_horas: 24,
    wifi_nome: 'Clinica_Fabiula',
    wifi_senha: '',
    telefone_clinica: '',
    workingHours: DAYS_OF_WEEK.reduce((acc, day) => ({
      ...acc,
      [day.id]: { active: day.id !== 'sabado' && day.id !== 'domingo', start: '08:00', end: '18:00', pausas: [] }
    }), {} as any)
  });

  useEffect(() => {
    if (!firestore) return;
    
    const unsub = onSnapshot(doc(firestore, 'configuracoes', 'clinica'), (snap) => {
      if (snap.exists()) setSettings(snap.data() as ClinicSettings);
    });

    const unsubMural = onSnapshot(collection(firestore, 'comunicados'), (snap) => {
      setComunicados(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    const qLogs = query(collection(firestore, 'logs_auditoria'), orderBy('timestamp', 'desc'), limit(50));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { 
      unsub(); 
      unsubMural(); 
      unsubLogs(); 
    };
  }, [firestore]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      if (firestore) {
        await setDoc(doc(firestore, 'configuracoes', 'clinica'), settings);
      }
      toast({ title: 'Configurações Salvas' });
      logAction(firestore, {
        userId: user?.uid || 'anon',
        userName: user?.nome || 'Admin',
        action: 'Atualização de Configurações Globais',
        module: 'Ajustes',
        details: 'Parâmetros operacionais da clínica atualizados.'
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddComunicado = async () => {
    if (!newComunicado.trim()) return;
    try {
      if (firestore) {
        await addDoc(collection(firestore, 'comunicados'), { texto: newComunicado });
      }
      setNewComunicado('');
      toast({ title: 'Mensagem adicionada ao mural' });
    } catch (e) { toast({ variant: 'destructive', title: 'Erro' }); }
  };

  const handleDeleteComunicado = async (id: string) => {
    try {
      if (firestore) {
        await deleteDoc(doc(firestore, 'comunicados', id));
      }
    } catch (e) { toast({ variant: 'destructive', title: 'Erro' }); }
  };

  const requestDeleteCode = (action: { collection: string; label: string }) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);
    setPendingDeleteAction(action);
    setIsCodeDialogOpen(true);
    toast({
      title: "Código de Segurança Gerado",
      description: "Em produção, este código seria enviado por e-mail.",
    });
    console.log("CÓDIGO DE SEGURANÇA:", code);
  };

  const handleVerifyCodeAndAction = async () => {
    if (confirmationCode === generatedCode) {
      setLoading(true);
      try {
        if (!firestore || isGuest) {
          // Limpeza em modo Simulação (LocalStorage)
          if (pendingDeleteAction?.collection === 'all') {
            localStorage.removeItem('demo_appointments');
            localStorage.removeItem('demo_patients');
            localStorage.removeItem('demo_transactions');
            localStorage.removeItem('demo_expense_records');
            localStorage.removeItem('demo_clock_ins');
          } else if (pendingDeleteAction?.collection === 'agendamentos') {
            localStorage.removeItem('demo_appointments');
          } else if (pendingDeleteAction?.collection === 'pacientes') {
            localStorage.removeItem('demo_patients');
          } else if (pendingDeleteAction?.collection === 'financeiro') {
            localStorage.removeItem('demo_transactions');
            localStorage.removeItem('demo_expense_records');
          } else if (pendingDeleteAction?.collection === 'ponto') {
            localStorage.removeItem('demo_clock_ins');
          }
          window.dispatchEvent(new Event('storage'));
          toast({ title: `Dados de ${pendingDeleteAction?.label} limpos (Modo Simulação)` });
        } else {
          // Limpeza em produção (Firestore)
          let collectionsToClear: string[] = [];
          if (pendingDeleteAction?.collection === 'all') {
            collectionsToClear = ['agendamentos', 'pacientes', 'transacoes_financeiras', 'lancamentos_financeiros', 'batidas_ponto'];
          } else if (pendingDeleteAction?.collection === 'agendamentos') {
            collectionsToClear = ['agendamentos'];
          } else if (pendingDeleteAction?.collection === 'pacientes') {
            collectionsToClear = ['pacientes'];
          } else if (pendingDeleteAction?.collection === 'financeiro') {
            collectionsToClear = ['transacoes_financeiras', 'lancamentos_financeiros'];
          } else if (pendingDeleteAction?.collection === 'ponto') {
            collectionsToClear = ['batidas_ponto'];
          }

          for (const colName of collectionsToClear) {
             const snap = await getDocs(collection(firestore, colName));
             const batch = writeBatch(firestore);
             snap.docs.forEach(d => batch.delete(d.ref));
             await batch.commit();
          }

          logAction(firestore, {
            userId: user?.uid || 'anon',
            userName: user?.nome || 'Admin',
            action: `Limpeza Granular: ${pendingDeleteAction?.label}`,
            module: 'Segurança',
            details: `Exclusão em massa solicitada para o módulo ${pendingDeleteAction?.label}.`,
            severity: 'critical'
          });

          toast({ title: `Dados de ${pendingDeleteAction?.label} limpos com sucesso` });
        }
        setIsCodeDialogOpen(false);
        setConfirmationCode('');
        setPendingDeleteAction(null);
      } catch (e) {
        toast({ variant: 'destructive', title: "Erro na operação" });
      } finally {
        setLoading(false);
      }
    } else {
      toast({ variant: 'destructive', title: "Código Inválido" });
    }
  };

  const addBreak = (dayId: string) => {
    const day = settings.workingHours[dayId] || { active: true, start: '08:00', end: '18:00', pausas: [] };
    const newBreak: Break = { 
      id: Math.random().toString(36).substr(2, 9), 
      label: 'Almoço', 
      start: '12:00', 
      end: '14:00', 
      recorrencia: 'semanal',
      data_inicio: new Date().toISOString()
    };
    setSettings({
      ...settings,
      workingHours: {
        ...settings.workingHours,
        [dayId]: { ...day, pausas: [...(day.pausas || []), newBreak] }
      }
    });
  };

  const removeBreak = (dayId: string, breakId: string) => {
    const day = settings.workingHours[dayId];
    setSettings({
      ...settings,
      workingHours: {
        ...settings.workingHours,
        [dayId]: { ...day, pausas: (day.pausas || []).filter((b: any) => b.id !== breakId) }
      }
    });
  };

  if (!isGestor) return (
    <div className="h-[500px] flex flex-col items-center justify-center text-center space-y-4">
      <Lock className="h-12 w-12 text-slate-300" />
      <h2 className="text-xl font-headline font-bold text-primary">Acesso Restrito</h2>
      <p className="text-muted-foreground text-sm max-w-xs">Apenas usuários com perfil de Gestor podem acessar as configurações globais do sistema.</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-20 max-w-[1400px] mx-auto px-1 md:px-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-3">
             <Settings2 className="h-8 w-8 text-accent" /> Painel de Controle
          </h1>
          <p className="text-muted-foreground text-sm uppercase font-black tracking-widest opacity-60 ml-1">Configurações Operacionais e Segurança</p>
        </div>
        <Button onClick={handleSaveSettings} disabled={loading} className="bg-primary h-12 px-8 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">
           {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Salvar Alterações
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-2 scrollbar-none px-1">
          <TabsList className="bg-slate-200/50 p-1.5 rounded-2xl h-14 w-max md:w-auto shadow-inner flex flex-nowrap md:grid md:grid-cols-5">
            <TabsTrigger value="clinica" className="rounded-xl px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white shadow-sm gap-2 shrink-0">Clínica</TabsTrigger>
            <TabsTrigger value="expediente" className="rounded-xl px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white shadow-sm gap-2 shrink-0">Horários</TabsTrigger>
            <TabsTrigger value="financeiro" className="rounded-xl px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white shadow-sm gap-2 shrink-0">Operadoras</TabsTrigger>
            <TabsTrigger value="auditoria" className="rounded-xl px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white shadow-sm gap-2 shrink-0">Logs</TabsTrigger>
            <TabsTrigger value="dados" className="rounded-xl px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-rose-50 text-rose-800 shadow-sm gap-2 shrink-0">Segurança</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="clinica" className="mt-6 space-y-6 animate-in slide-in-from-left-2">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="rounded-3xl border-none shadow-sm ring-1 ring-border">
                <CardHeader><CardTitle className="text-lg font-headline flex items-center gap-2"><Wifi className="h-5 w-5 text-emerald-500" /> Comunicação e WiFi</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">WiFi Rede</Label><Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={settings.wifi_nome} onChange={e => setSettings({...settings, wifi_nome: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">WiFi Senha</Label><Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={settings.wifi_senha} onChange={e => setSettings({...settings, wifi_senha: e.target.value})} /></div>
                   </div>
                   <div className="space-y-1.5">
                      <Label className="text-[9px] font-black uppercase ml-1 flex items-center gap-2"><Phone className="h-3 w-3" /> Telefone Público (TV)</Label>
                      <Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={settings.telefone_clinica} onChange={e => setSettings({...settings, telefone_clinica: e.target.value})} placeholder="(00) 0000-0000" />
                   </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-none shadow-sm ring-1 ring-border">
                <CardHeader><CardTitle className="text-lg font-headline flex items-center gap-2"><Bell className="h-5 w-5 text-accent" /> Mural da TV (Comunicados)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                   <div className="flex gap-2">
                      <Input placeholder="Nova mensagem para a TV..." value={newComunicado} onChange={e => setNewComunicado(e.target.value)} className="h-11 rounded-xl" />
                      <Button onClick={handleAddComunicado} variant="outline" className="h-11 rounded-xl border-accent text-accent"><Plus className="h-4 w-4" /></Button>
                   </div>
                   <div className="space-y-2">
                      {comunicados.map(c => (
                        <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border group">
                           <span className="text-xs font-bold text-slate-600 truncate mr-2">{c.texto}</span>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 opacity-0 group-hover:opacity-100" onClick={() => handleDeleteComunicado(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      ))}
                   </div>
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="expediente" className="mt-6 space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">
             <CardHeader className="bg-primary/5 p-8 border-b">
                <CardTitle className="font-headline text-2xl text-primary">Expediente Geral da Clínica</CardTitle>
                <CardDescription>Defina os horários em que a clínica está aberta para atendimento e suas pausas.</CardDescription>
             </CardHeader>
             <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {DAYS_OF_WEEK.map(day => (
                     <div key={day.id} className={cn("p-6 rounded-3xl border-2 transition-all", settings.workingHours[day.id]?.active ? "border-primary/20 bg-primary/[0.02]" : "border-slate-100 opacity-40")}>
                        <div className="flex items-center justify-between mb-4">
                           <span className="font-black text-sm uppercase text-primary">{day.full}</span>
                           <Switch checked={settings.workingHours[day.id]?.active} onCheckedChange={val => setSettings({...settings, workingHours: {...settings.workingHours, [day.id]: {...settings.workingHours[day.id], active: val}}})} />
                        </div>
                        {settings.workingHours[day.id]?.active && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                               <div className="space-y-1"><Label className="text-[8px] font-black uppercase">Início</Label><Input type="time" className="h-10 rounded-xl bg-white border-none shadow-sm text-center font-bold" value={settings.workingHours[day.id]?.start} onChange={e => setSettings({...settings, workingHours: {...settings.workingHours, [day.id]: {...settings.workingHours[day.id], start: e.target.value}}})} /></div>
                               <div className="space-y-1"><Label className="text-[8px] font-black uppercase">Fim</Label><Input type="time" className="h-10 rounded-xl bg-white border-none shadow-sm text-center font-bold" value={settings.workingHours[day.id]?.end} onChange={e => setSettings({...settings, workingHours: {...settings.workingHours, [day.id]: {...settings.workingHours[day.id], end: e.target.value}}})} /></div>
                            </div>
                            
                            <div className="space-y-2">
                               <div className="flex items-center justify-between">
                                  <Label className="text-[8px] font-black uppercase text-accent">Pausas / Almoço</Label>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-accent hover:bg-accent/10" onClick={() => addBreak(day.id)}><Plus className="h-3 w-3" /></Button>
                               </div>
                               <div className="space-y-2">
                                  {(settings.workingHours[day.id]?.pausas || []).map((p: Break) => (
                                    <div key={p.id} className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-dashed border-accent/20">
                                       <Input className="h-7 text-[9px] font-black uppercase border-none bg-slate-50 px-2" value={p.label} onChange={e => {
                                         const pausas = (settings.workingHours[day.id].pausas || []).map((b: any) => b.id === p.id ? {...b, label: e.target.value} : b);
                                         setSettings({...settings, workingHours: {...settings.workingHours, [day.id]: {...settings.workingHours[day.id], pausas}}});
                                       }} />
                                       <Input type="time" className="h-7 text-[10px] w-16 px-1 border-none bg-slate-50 text-center font-bold" value={p.start} onChange={e => {
                                         const pausas = (settings.workingHours[day.id].pausas || []).map((b: any) => b.id === p.id ? {...b, start: e.target.value} : b);
                                         setSettings({...settings, workingHours: {...settings.workingHours, [day.id]: {...settings.workingHours[day.id], pausas}}});
                                       }} />
                                       <span className="text-[10px] font-bold opacity-30">-</span>
                                       <Input type="time" className="h-7 text-[10px] w-16 px-1 border-none bg-slate-50 text-center font-bold" value={p.end} onChange={e => {
                                         const pausas = (settings.workingHours[day.id].pausas || []).map((b: any) => b.id === p.id ? {...b, end: e.target.value} : b);
                                         setSettings({...settings, workingHours: {...settings.workingHours, [day.id]: {...settings.workingHours[day.id], pausas}}});
                                       }} />
                                       <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => removeBreak(day.id, p.id)}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                  ))}
                               </div>
                            </div>
                          </div>
                        )}
                     </div>
                   ))}
                </div>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro" className="mt-6">
           <div className="h-40 flex items-center justify-center opacity-20 uppercase font-black text-xs tracking-widest">Módulo de Operadoras Ativo</div>
        </TabsContent>

        <TabsContent value="auditoria" className="mt-6 space-y-6">
           <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">
              <CardHeader className="p-8 border-b bg-muted/5 flex flex-row items-center justify-between">
                 <CardTitle className="font-headline text-2xl flex items-center gap-3"><History className="h-6 w-6 text-primary" /> Histórico de Auditoria</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                 <table className="w-full text-left min-w-[800px]">
                    <thead className="bg-slate-50 border-b">
                       <tr>
                          <th className="p-5 text-[9px] font-black uppercase text-muted-foreground pl-8">Data/Hora</th>
                          <th className="p-5 text-[9px] font-black uppercase text-muted-foreground">Responsável</th>
                          <th className="p-5 text-[9px] font-black uppercase text-muted-foreground">Ação Realizada</th>
                          <th className="p-5 text-[9px] font-black uppercase text-muted-foreground">Módulo</th>
                          <th className="p-5 text-right pr-8 text-[9px] font-black uppercase text-muted-foreground">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y">
                       {auditLogs.map(log => (
                         <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-5 pl-8 text-xs font-medium text-slate-500">{format(new Date(log.timestamp), 'dd/MM/yy HH:mm')}</td>
                            <td className="p-5 font-bold text-primary text-xs">{log.userName}</td>
                            <td className="p-5 text-xs font-bold text-slate-700">{log.action}</td>
                            <td className="p-5 text-[9px] font-black uppercase text-muted-foreground">{log.module}</td>
                            <td className="p-5 text-right pr-8">
                               <Badge className="bg-emerald-100 text-emerald-700 border-none text-[8px] font-black uppercase">Confirmado</Badge>
                            </td>
                         </tr>
                       ))}
                       {auditLogs.length === 0 && (
                         <tr><td colSpan={5} className="p-20 text-center text-xs font-black uppercase opacity-20">Nenhum registro encontrado</td></tr>
                       )}
                    </tbody>
                 </table>
              </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="dados" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-10">
            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white border-rose-100 overflow-hidden lg:col-span-2">
              <CardHeader className="p-8 border-b bg-rose-50/30">
                <CardTitle className="font-headline text-2xl text-rose-800 flex items-center gap-3"><ShieldAlert className="h-7 w-7" /> Zona de Perigo</CardTitle>
                <CardDescription className="text-sm font-medium">Ações irreversíveis que exigem autenticação adicional.</CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Opção Limpeza Total */}
                    <div className="flex flex-col justify-between p-6 border-2 border-rose-100 rounded-[2rem] bg-rose-50/10 hover:bg-rose-50/20 transition-all group">
                      <div className="mb-4">
                        <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Database className="h-6 w-6" /></div>
                        <p className="text-sm font-black uppercase text-rose-800 mb-1">LIMPAR TODA A BASE</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Exclui todos os agendamentos, pacientes e histórico financeiro permanentemente.</p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => requestDeleteCode({ collection: 'all', label: 'Toda a Base' })} 
                        className="h-12 w-full border-rose-200 text-rose-600 font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        SOLICITAR CÓDIGO
                      </Button>
                    </div>

                    {/* Opção Limpeza Agenda */}
                    <div className="flex flex-col justify-between p-6 border-2 border-slate-100 rounded-[2rem] bg-slate-50/30 hover:bg-slate-50/50 transition-all group">
                      <div className="mb-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><CalendarX className="h-6 w-6" /></div>
                        <p className="text-sm font-black uppercase text-slate-800 mb-1">LIMPAR AGENDAMENTOS</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Remove todos os registros de agenda e sessões marcadas.</p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => requestDeleteCode({ collection: 'agendamentos', label: 'Agendamentos' })} 
                        className="h-12 w-full border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        REMOVER DADOS
                      </Button>
                    </div>

                    {/* Opção Limpeza Pacientes */}
                    <div className="flex flex-col justify-between p-6 border-2 border-slate-100 rounded-[2rem] bg-slate-50/30 hover:bg-slate-50/50 transition-all group">
                      <div className="mb-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Users2 className="h-6 w-6" /></div>
                        <p className="text-sm font-black uppercase text-slate-800 mb-1">LIMPAR PACIENTES</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Remove toda a base de pacientes e seus prontuários.</p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => requestDeleteCode({ collection: 'pacientes', label: 'Pacientes' })} 
                        className="h-12 w-full border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        REMOVER DADOS
                      </Button>
                    </div>

                    {/* Opção Limpeza Financeiro */}
                    <div className="flex flex-col justify-between p-6 border-2 border-slate-100 rounded-[2rem] bg-slate-50/30 hover:bg-slate-50/50 transition-all group">
                      <div className="mb-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Receipt className="h-6 w-6" /></div>
                        <p className="text-sm font-black uppercase text-slate-800 mb-1">LIMPAR FINANCEIRO</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Exclui transações, caixa e lançamentos de despesas.</p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => requestDeleteCode({ collection: 'financeiro', label: 'Financeiro' })} 
                        className="h-12 w-full border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        REMOVER DADOS
                      </Button>
                    </div>

                    {/* Opção Limpeza Ponto */}
                    <div className="flex flex-col justify-between p-6 border-2 border-slate-100 rounded-[2rem] bg-slate-50/30 hover:bg-slate-50/50 transition-all group">
                      <div className="mb-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Fingerprint className="h-6 w-6" /></div>
                        <p className="text-sm font-black uppercase text-slate-800 mb-1">LIMPAR REGISTROS DE PONTO</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Remove o histórico de batidas e jornadas da equipe.</p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => requestDeleteCode({ collection: 'ponto', label: 'Registros de Ponto' })} 
                        className="h-12 w-full border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        REMOVER DADOS
                      </Button>
                    </div>
                  </div>

                  <div className="mt-10 p-8 bg-amber-50 rounded-3xl flex gap-6 items-center">
                    <div className="h-12 w-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0"><Info className="h-6 w-6" /></div>
                    <div className="space-y-1">
                       <h4 className="text-[10px] font-black uppercase text-amber-800 tracking-widest">AVISO LEGAL</h4>
                       <p className="text-[11px] font-medium text-amber-900 leading-relaxed italic">"Os dados excluídos não podem ser recuperados. De acordo com a Resolução n.º 473 do COFFITO, a clínica é responsável pela guarda dos prontuários por 20 anos."</p>
                    </div>
                  </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
        <DialogContent className="max-w-sm rounded-[2.5rem] border-none shadow-3xl bg-white p-0 overflow-hidden">
          <DialogHeader className="p-10 bg-primary text-white">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center"><Mail className="h-6 w-6" /></div>
              <DialogTitle className="text-2xl font-headline font-bold leading-none">Confirmação</DialogTitle>
            </div>
            <DialogDescription className="text-primary-foreground/70 font-medium">Insira o código enviado para o e-mail administrativo para limpar: <span className="text-white font-black">{pendingDeleteAction?.label}</span>.</DialogDescription>
          </DialogHeader>
          <div className="p-10 space-y-6">
             <Input 
                type="text" 
                maxLength={6}
                placeholder="000000"
                className="h-20 rounded-2xl bg-slate-50 border-none font-black text-4xl text-center tracking-[0.5em] text-primary focus-visible:ring-primary/20" 
                value={confirmationCode}
                onChange={e => setConfirmationCode(e.target.value.replace(/\D/g, ''))}
              />
          </div>
          <DialogFooter className="p-10 bg-slate-50 border-t flex flex-row gap-4">
             <Button variant="ghost" className="h-14 font-black uppercase text-[10px] tracking-widest flex-1" onClick={() => setIsCodeDialogOpen(false)}>Cancelar</Button>
             <Button className="bg-rose-600 h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex-[2] hover:scale-105 transition-transform" onClick={handleVerifyCodeAndAction}>
               LIMPAR DADOS
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ConfiguracoesPage() {
  return <Suspense fallback={<div className="p-12 text-center text-xs font-black uppercase animate-pulse">Carregando Ajustes...</div>}><SettingsContent /></Suspense>;
}
