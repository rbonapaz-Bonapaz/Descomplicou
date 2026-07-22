
"use client"

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDoc, useFirestore, useCollection } from '@/firebase';
import { doc, updateDoc, arrayUnion, collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { Patient, EvolutionEntry, Appointment } from '@/app/lib/types';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  User, 
  Clock, 
  FileText, 
  History, 
  Plus, 
  ArrowLeft, 
  Stethoscope, 
  ShieldCheck,
  FileSignature,
  CalendarCheck,
  BarChart2,
  Copy,
  Check,
  Download,
  Lock,
  MessageSquare,
  Info,
  Calendar,
  Pill
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function PatientDetailsClient({ id }: { id: string }) {
  const router = useRouter();
  const db = useFirestore();
  const { user, isGuest, isSecretaria } = useAuth();
  const { toast } = useToast();
  
  const [guestPatient, setGuestPatient] = useState<Patient | null>(null);
  const [guestAppointments, setGuestAppointments] = useState<Appointment[]>([]);

  const patientRef = useMemo(() => (db && !isGuest ? doc(db, 'pacientes', id) : null), [db, id, isGuest]);
  const { data: firestorePatient, loading: firestoreLoading } = useDoc<Patient>(patientRef);
  
  const appointmentsQuery = useMemo(() => {
    if (!db || !id || isGuest) return null;
    return query(
      collection(db, 'agendamentos'),
      where('paciente_id', '==', id),
      orderBy('data_hora', 'desc')
    );
  }, [db, id, isGuest]);
  
  const { data: firestoreAppointments } = useCollection<Appointment>(appointmentsQuery);
  
  useEffect(() => {
    if (isGuest) {
      const mockPatients: Record<string, Patient> = {
        '1': { 
          id: '1', 
          nome: 'Ana Silva', 
          cpf: '123.456.789-00', 
          data_nascimento: '2015-05-20', 
          telefone: '(21) 98888-7777', 
          convenio_id: 'Unimed Rio', 
          queixa_principal: 'Dificuldade de integração sensorial e foco escolar.',
          historico_clinico: [
            {
              id: 'e1',
              data: new Date().toISOString(),
              profissional_id: 'demo',
              profissional_nome: 'Dra. Fabiana (TO)',
              descricao: 'Paciente apresentou boa evolução na coordenação motora fina hoje. Trabalhamos com texturas diversas e houve menor resistência sensorial do que na sessão anterior.',
              observacao_secretaria: 'Paciente precisa agendar avaliação fonoaudiológica para o mês que vem.',
              tipo: 'evolucao'
            }
          ]
        },
        '2': { id: '2', nome: 'Pedro Souza', cpf: '234.567.890-11', data_nascimento: '2018-10-12', telefone: '(21) 97777-6666', convenio_id: 'Cassi', queixa_principal: 'Atraso no desenvolvimento motor fino.' },
      };

      const selected = mockPatients[id];
      if (selected) {
        setGuestPatient(selected);
        setGuestAppointments([
          { id: 'a1', paciente_id: id, paciente_nome: selected.nome, data_hora: new Date().toISOString(), status: 'realizado', convenio_id: selected.convenio_id, profissional_id: 'demo', valor_final: 120, observacao_secretaria: 'Paciente precisa agendar avaliação fonoaudiológica para o mês que vem.' }
        ]);
      }
    }
  }, [isGuest, id]);

  const patient = isGuest ? guestPatient : firestorePatient;
  const appointments = isGuest ? guestAppointments : firestoreAppointments;
  const loading = !isGuest && firestoreLoading;

  const [newEvolution, setNewEvolution] = useState('');
  const [newSecNote, setNewSecNote] = useState('');
  const [newPrescription, setNewPrescription] = useState('');
  const [newPrescSecNote, setNewPrescSecNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const handleAddEntry = async (tipo: 'evolucao' | 'prescricao') => {
    const descricao = tipo === 'evolucao' ? newEvolution : newPrescription;
    const obsSec = tipo === 'evolucao' ? newSecNote : newPrescSecNote;

    if (!descricao.trim() && !obsSec.trim()) return;
    
    setIsSaving(true);
    const entry: EvolutionEntry = {
      id: Math.random().toString(36).substr(2, 9),
      data: new Date().toISOString(),
      profissional_id: user?.uid || 'anon',
      profissional_nome: user?.nome || 'Profissional',
      descricao: descricao,
      observacao_secretaria: obsSec,
      tipo: tipo
    };

    try {
      if (isGuest) {
        setGuestPatient(prev => prev ? {
          ...prev,
          historico_clinico: [entry, ...(prev.historico_clinico || [])]
        } : null);
        if (guestAppointments.length > 0) {
            setGuestAppointments(prev => prev.map((apt, idx) => {
              if (idx === 0) return { ...apt, observacao_secretaria: obsSec };
              return apt;
            }));
        }
        toast({ title: 'Modo Demo', description: `${tipo === 'evolucao' ? 'Evolução' : 'Prescrição'} salva com sucesso.` });
      } else if (patientRef) {
        await updateDoc(patientRef, {
          historico_clinico: arrayUnion(entry)
        });

        if (db && obsSec.trim()) {
          const today = new Date();
          const qToday = query(
            collection(db, 'agendamentos'),
            where('paciente_id', '==', id),
            where('status', 'in', ['atendimento', 'realizado']),
            limit(5)
          );
          const snap = await getDocs(qToday);
          const todayApt = snap.docs.find(doc => isSameDay(new Date(doc.data().data_hora), today));
          
          if (todayApt) {
            await updateDoc(doc(db, 'agendamentos', todayApt.id), {
                observacao_secretaria: obsSec
            });
          }
        }

        toast({ title: 'Sucesso', description: `${tipo === 'evolucao' ? 'Evolução' : 'Prescrição'} registrada no prontuário.` });
      }

      if (tipo === 'evolucao') {
        setNewEvolution('');
        setNewSecNote('');
      } else {
        setNewPrescription('');
        setNewPrescSecNote('');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao salvar registro.' });
    } finally {
      setIsSaving(false);
    }
  };

  const statusColors: Record<string, string> = {
    realizado: 'bg-green-100 text-green-700',
    faltou: 'bg-red-100 text-red-700',
    confirmado: 'bg-emerald-100 text-emerald-700',
    aguardando_confirmacao: 'bg-amber-100 text-amber-700',
    agendado: 'bg-blue-100 text-blue-700',
    atendimento: 'bg-primary/10 text-primary'
  };

  const renderTimelineEntry = (entry: EvolutionEntry) => {
    const isPrescricao = entry.tipo === 'prescricao';
    return (
      <Card key={entry.id} className={cn("border-none ring-1 ring-border shadow-sm rounded-2xl overflow-hidden mb-6", isPrescricao && "bg-slate-50")}>
        <CardHeader className={cn("py-3 border-b flex flex-row items-center justify-between", isPrescricao ? "bg-accent/5" : "bg-muted/5")}>
          <div className="flex items-center gap-2">
            {isPrescricao ? <Pill className="h-3.5 w-3.5 text-accent" /> : <Calendar className="h-3.5 w-3.5 text-primary" />}
            <span className={cn("text-[10px] font-black uppercase tracking-widest", isPrescricao ? "text-accent" : "text-primary")}>
              {format(new Date(entry.data), "dd 'de' MMMM, yyyy", { locale: ptBR })}
              {isPrescricao && " • PRESCRIÇÃO"}
            </span>
          </div>
          <Badge variant="outline" className="text-[8px] bg-white uppercase font-black">Por: {entry.profissional_nome}</Badge>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div>
            <Label className="text-[9px] uppercase font-black text-muted-foreground/60 block mb-2">
              {isPrescricao ? 'Conduta e Orientações' : 'Relato Clínico'}
            </Label>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{entry.descricao}</p>
          </div>
          {entry.observacao_secretaria && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100/50">
              <Label className="text-[9px] uppercase font-black text-amber-700 block mb-1">Nota para Secretaria</Label>
              <p className="text-xs text-amber-900 italic font-medium">"{entry.observacao_secretaria}"</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) return <div className="p-8 text-center">Carregando prontuário...</div>;
  if (!patient) return <div className="p-8 text-center">Paciente não encontrado.</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 print:p-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-headline font-bold text-primary">{patient.nome}</h1>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="bg-background text-[10px] font-bold">
                {patient.data_nascimento ? (new Date().getFullYear() - new Date(patient.data_nascimento).getFullYear()) : '?'} anos
              </Badge>
              <Badge variant="secondary" className="capitalize text-[10px] font-bold">{patient.convenio_id === 'particular' ? 'Particular' : 'Convênio'}</Badge>
            </div>
          </div>
        </div>
        {!isSecretaria && (
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={() => window.print()} className="bg-primary shadow-md font-bold">
              <Download className="h-4 w-4 mr-2" /> Gerar PDF
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-6 print:hidden">
          <Card className="border-none ring-1 ring-border shadow-sm rounded-2xl">
            <CardHeader className="bg-muted/5 py-4 border-b rounded-t-2xl">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 text-primary" /> Ficha Cadastral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] uppercase font-black text-muted-foreground/60">CPF</Label>
                  <p className="font-bold text-primary">{patient.cpf || '---'}</p>
                </div>
                <div>
                  <Label className="text-[10px] uppercase font-black text-muted-foreground/60">Telefone</Label>
                  <p className="font-bold text-primary">{patient.telefone}</p>
                </div>
              </div>
              
              <div className="pt-4 border-t border-dashed">
                <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Proteção LGPD</span>
                </div>
                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                  Os dados sensíveis são criptografados.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-50 border-none ring-1 ring-border shadow-sm rounded-2xl">
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <Stethoscope className="h-4 w-4 text-primary" /> Queixa Principal
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm italic text-foreground leading-relaxed font-medium">
                "{patient.queixa_principal || 'Sem queixa registrada'}"
              </p>
            </CardContent>
          </Card>

          <Card className="border-none ring-1 ring-border shadow-sm rounded-2xl">
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <BarChart2 className="h-4 w-4 text-primary" /> Indicadores
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-bold uppercase tracking-tighter">Total de Sessões</span>
                <span className="font-black text-lg text-primary">{(appointments || []).filter(a => a.status === 'realizado').length}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-6 print:col-span-12">
          <Tabs defaultValue={isSecretaria ? "sessoes" : "timeline"} className="w-full print:block">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1 bg-muted/50 border rounded-2xl print:hidden">
              <TabsTrigger value="timeline" disabled={isSecretaria} className="py-2.5 text-[10px] uppercase font-black tracking-widest">
                {isSecretaria && <Lock className="h-3 w-3 mr-1.5 opacity-50" />}
                <History className="h-3.5 w-3.5 mr-2" /> Timeline
              </TabsTrigger>
              <TabsTrigger value="evolucao" disabled={isSecretaria} className="py-2.5 text-[10px] uppercase font-black tracking-widest">
                {isSecretaria && <Lock className="h-3 w-3 mr-1.5 opacity-50" />}
                <FileText className="h-3.5 w-3.5 mr-2" /> Evolução
              </TabsTrigger>
              <TabsTrigger value="prescricao" disabled={isSecretaria} className="py-2.5 text-[10px] uppercase font-black tracking-widest">
                {isSecretaria && <Lock className="h-3 w-3 mr-1.5 opacity-50" />}
                <FileSignature className="h-3.5 w-3.5 mr-2" /> Prescrição
              </TabsTrigger>
              <TabsTrigger value="sessoes" className="py-2.5 text-[10px] uppercase font-black tracking-widest">
                <CalendarCheck className="h-3.5 w-3.5 mr-2" /> Sessões
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="py-4 print:block">
              {isSecretaria ? (
                <div className="flex flex-col items-center justify-center py-24 bg-muted/20 rounded-3xl border border-dashed border-muted-foreground/20">
                  <Lock className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                  <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">Acesso Restrito ao Profissional</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(patient.historico_clinico || []).slice().sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime()).map(renderTimelineEntry)}
                  {(patient.historico_clinico || []).length === 0 && (
                    <div className="text-center py-20 text-muted-foreground italic uppercase text-xs font-black tracking-widest opacity-30">Nenhum registro clínico</div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="evolucao" className="py-4 print:hidden">
              <div className="space-y-6">
                <Card className="border-none ring-1 ring-border shadow-md rounded-3xl">
                  <CardHeader className="bg-primary/5 border-b rounded-t-3xl">
                    <CardTitle className="text-xl font-headline text-primary">Registrar Evolução</CardTitle>
                    <CardDescription className="text-xs font-medium">Preencha os dados técnicos e administrativos da sessão.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-8 space-y-8">
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase text-primary flex items-center gap-2">
                          <Stethoscope className="h-4 w-4" /> Relato Clínico (Privado)
                      </Label>
                      <Textarea 
                        placeholder="Descreva a evolução terapêutica do paciente nesta sessão..."
                        className="min-h-[200px] resize-none rounded-2xl bg-slate-50 border-none focus-visible:ring-primary/20"
                        value={newEvolution}
                        onChange={(e) => setNewEvolution(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-3 p-6 bg-accent/5 rounded-2xl border border-accent/10">
                      <Label className="text-xs font-black uppercase text-accent flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" /> Observações para Secretaria (Compartilhado)
                      </Label>
                      <Textarea 
                        placeholder="Informe recados sobre agendamentos, pagamentos ou orientações para a recepção..."
                        className="min-h-[100px] resize-none rounded-xl bg-white border-none focus-visible:ring-accent/20"
                        value={newSecNote}
                        onChange={(e) => setNewSecNote(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button onClick={() => handleAddEntry('evolucao')} disabled={isSaving || (!newEvolution.trim() && !newSecNote.trim())} className="h-12 px-8 rounded-xl font-black uppercase tracking-widest shadow-lg bg-primary hover:bg-primary/90">
                        Finalizar e Assinar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase text-muted-foreground px-1 tracking-widest">Histórico de Evoluções</h3>
                  {(patient.historico_clinico || []).filter(e => e.tipo === 'evolucao').slice().sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime()).map(renderTimelineEntry)}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="prescricao" className="py-4 print:hidden">
              <div className="space-y-6">
                <Card className="border-none ring-1 ring-border shadow-md rounded-3xl">
                  <CardHeader className="bg-accent/5 border-b rounded-t-3xl">
                    <CardTitle className="text-xl font-headline text-accent">Lançar Prescrição / Conduta</CardTitle>
                    <CardDescription className="text-xs font-medium">Registre as orientações técnicas e prescrições para o paciente.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-8 space-y-8">
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase text-accent flex items-center gap-2">
                          <Pill className="h-4 w-4" /> Conduta e Prescrição (Privado)
                      </Label>
                      <Textarea 
                        placeholder="Descreva as orientações, exercícios ou materiais prescritos..."
                        className="min-h-[200px] resize-none rounded-2xl bg-accent/[0.02] border-none focus-visible:ring-accent/20"
                        value={newPrescription}
                        onChange={(e) => setNewPrescription(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-3 p-6 bg-muted/5 rounded-2xl border border-muted-foreground/10">
                      <Label className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" /> Observações para Secretaria (Compartilhado)
                      </Label>
                      <Textarea 
                        placeholder="Recados administrativos relacionados à prescrição..."
                        className="min-h-[100px] resize-none rounded-xl bg-white border-none focus-visible:ring-primary/20"
                        value={newPrescSecNote}
                        onChange={(e) => setNewPrescSecNote(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button onClick={() => handleAddEntry('prescricao')} variant="outline" disabled={isSaving || (!newPrescription.trim() && !newPrescSecNote.trim())} className="h-12 px-8 rounded-xl font-black uppercase tracking-widest shadow-lg border-accent text-accent hover:bg-accent/5">
                        Registrar Prescrição
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase text-muted-foreground px-1 tracking-widest">Histórico de Prescrições</h3>
                  {(patient.historico_clinico || []).filter(e => e.tipo === 'prescricao').slice().sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime()).map(renderTimelineEntry)}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sessoes" className="py-4">
              <Card className="border-none ring-1 ring-border shadow-md rounded-3xl">
                <CardHeader className="bg-muted/5 border-b rounded-t-3xl">
                  <CardTitle className="text-xl font-headline text-primary">Histórico de Atendimentos</CardTitle>
                  <CardDescription className="text-xs font-medium">Lista de agendamentos e status administrativos.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {appointments && appointments.length > 0 ? (
                      appointments.map((apt) => (
                        <div 
                          key={apt.id} 
                          onClick={() => setSelectedAppointment(apt)}
                          className="group flex flex-col p-4 rounded-2xl border bg-white hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                                  <Calendar className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-sm font-black text-primary">
                                    {format(new Date(apt.data_hora), "dd/MM/yyyy")}
                                  </span>
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    {apt.time || format(new Date(apt.data_hora), "HH:mm")} • {apt.paciente_nome}
                                  </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge className={cn("text-[8px] px-2 py-0.5 font-black uppercase rounded-lg border-none", statusColors[apt.status] || 'bg-slate-100')}>
                                  {apt.status.replace('_', ' ')}
                              </Badge>
                            </div>
                          </div>
                          
                          {apt.observacao_secretaria && (
                            <div className="mt-3 pl-14">
                              <p className="text-[11px] text-amber-700 italic font-medium line-clamp-2 bg-amber-50/50 p-2 rounded-lg border border-dashed border-amber-200/50">
                                "{apt.observacao_secretaria}"
                              </p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-20 text-muted-foreground italic uppercase text-xs font-black tracking-widest opacity-30">Nenhuma sessão registrada</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={!!selectedAppointment} onOpenChange={(open) => !open && setSelectedAppointment(null)}>
        <DialogContent className="max-w-md rounded-3xl border-none p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 bg-primary text-white">
            <DialogTitle className="text-2xl font-headline">Detalhes do Atendimento</DialogTitle>
            <DialogDescription className="text-primary-foreground/70 font-medium">Informações administrativas da sessão.</DialogDescription>
          </DialogHeader>
          
          {selectedAppointment && (
            <div className="p-8 space-y-6">
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                     <Label className="text-[10px] uppercase font-black text-muted-foreground">Data e Hora</Label>
                     <p className="font-bold text-slate-800">
                        {format(new Date(selectedAppointment.data_hora), "dd/MM/yyyy 'às' HH:mm")}
                     </p>
                  </div>
                  <div className="space-y-1 text-right">
                     <Label className="text-[10px] uppercase font-black text-muted-foreground">Valor da Sessão</Label>
                     <p className="font-black text-emerald-600 text-lg">
                        R$ {selectedAppointment.valor_final?.toFixed(2)}
                     </p>
                  </div>
               </div>

               <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-black text-muted-foreground">Convênio / Pagamento</Label>
                  <div className="flex items-center gap-2 mt-1">
                     <Badge variant="outline" className="font-bold border-primary/20 bg-primary/5 text-primary">
                        {selectedAppointment.convenio_id === 'particular' ? 'Particular' : 'Plano de Saúde'}
                     </Badge>
                  </div>
               </div>

               {selectedAppointment.observacao_secretaria ? (
                  <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200/50 space-y-2">
                     <div className="flex items-center gap-2 text-amber-700">
                        <MessageSquare className="h-4 w-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Observação do Profissional</span>
                     </div>
                     <p className="text-sm text-amber-900 leading-relaxed font-medium italic">
                        "{selectedAppointment.observacao_secretaria}"
                     </p>
                  </div>
               ) : (
                  <div className="p-5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center gap-2 text-slate-400">
                     <Info className="h-4 w-4" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Sem notas para secretaria</span>
                  </div>
               )}

               <Button className="w-full h-12 rounded-xl bg-slate-100 text-slate-900 font-black uppercase tracking-widest hover:bg-slate-200 mt-4" onClick={() => setSelectedAppointment(null)}>
                  Fechar Detalhes
               </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
