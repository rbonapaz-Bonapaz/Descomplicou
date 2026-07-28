
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sun, Construction, Clock, ChevronLeft, Calendar, Plane, CheckCircle2, XCircle, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { col, ref, SUB } from '@/lib/tenancy';
import { VacationRequest } from '@/app/lib/types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function FeriasPage() {
  const router = useRouter();
  const { user, identidade, temPapel } = useAuth();
  const clinicaId = identidade.clinicaId;
  const ehAdmin = temPapel('admin_clinica');
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const firestore = useFirestore();
  const { toast } = useToast();

  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newReq, setNewReq] = useState({ start: '', end: '', obs: '' });

  useEffect(() => {
    if (!user) return;
    if (isGuest) {
      const saved = localStorage.getItem('demo_vacations');
      if (saved) setRequests(JSON.parse(saved));
    } else if (firestore) {
      const q = ehAdmin 
        ? col<VacationRequest>(firestore, clinicaId!, SUB.solicitacoesFerias) 
        : query(col<VacationRequest>(firestore, clinicaId!, SUB.solicitacoesFerias), where('userId', '==', user.uid));
        
      return onSnapshot(q, (snap) => {
        setRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as VacationRequest)));
      });
    }
  }, [user, isGuest, ehAdmin, firestore]);

  const handleRequest = async () => {
    if (!newReq.start || !newReq.end || !user) return;
    setLoading(true);
    const data: Partial<VacationRequest> = {
      userId: user.uid,
      userName: user.nome,
      data_inicio: newReq.start,
      data_fim: newReq.end,
      status: 'pendente',
      data_solicitacao: new Date().toISOString(),
      observacao: newReq.obs
    };

    try {
      if (isGuest) {
        const saved = JSON.parse(localStorage.getItem('demo_vacations') || '[]');
        localStorage.setItem('demo_vacations', JSON.stringify([{ ...data, id: Math.random().toString() }, ...saved]));
        setRequests([{ ...data, id: Math.random().toString() } as VacationRequest, ...requests]);
      } else if (firestore) {
        await addDoc(col<VacationRequest>(firestore, clinicaId!, SUB.solicitacoesFerias), data);
      }
      toast({ title: 'Solicitação Enviada', description: 'O gestor será notificado para análise.' });
      setIsDialogOpen(false);
      setNewReq({ start: '', end: '', obs: '' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao solicitar' });
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, status: 'aprovado' | 'reprovado') => {
    try {
      if (isGuest) {
        setRequests(requests.map(r => r.id === id ? { ...r, status } : r));
      } else if (firestore) {
        await updateDoc(ref(firestore, clinicaId!, SUB.solicitacoesFerias, id), { status });
      }
      toast({ title: status === 'aprovado' ? 'Férias Aprovadas' : 'Solicitação Reprovada' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro na ação' });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10 border bg-white shadow-sm">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-primary uppercase tracking-tight">Minhas Férias</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cronograma de Descanso</p>
          </div>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-accent h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg">
          <Plane className="h-4 w-4 mr-2" /> Solicitar Período
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {requests.length === 0 ? (
          <Card className="rounded-[2.5rem] border-none ring-1 ring-border p-12 text-center bg-white/50">
             <Sun className="h-12 w-12 text-slate-200 mx-auto mb-4" />
             <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Nenhuma solicitação registrada</p>
          </Card>
        ) : (
          requests.map((req) => (
            <Card key={req.id} className="rounded-[2rem] border-none ring-1 ring-border shadow-sm overflow-hidden bg-white hover:shadow-md transition-all">
               <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                     <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0", 
                       req.status === 'aprovado' ? "bg-emerald-50 text-emerald-600" : 
                       req.status === 'reprovado' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                     )}>
                        <Calendar className="h-7 w-7" />
                     </div>
                     <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{ehAdmin ? req.userName : 'Período Solicitado'}</p>
                        <h3 className="text-lg font-black text-slate-800 tabular-nums">
                           {format(parseISO(req.data_inicio), 'dd/MM/yy')} <span className="text-slate-300 font-medium px-2">até</span> {format(parseISO(req.data_fim), 'dd/MM/yy')}
                        </h3>
                     </div>
                  </div>

                  <div className="flex items-center gap-4">
                     <Badge className={cn("text-[9px] font-black uppercase py-1 px-4 border-none", 
                        req.status === 'aprovado' ? "bg-emerald-500 text-white" : 
                        req.status === 'reprovado' ? "bg-rose-500 text-white" : "bg-amber-500 text-white"
                     )}>
                        {req.status}
                     </Badge>
                     
                     {ehAdmin && req.status === 'pendente' && (
                        <div className="flex gap-2 border-l pl-4">
                           <Button size="icon" variant="ghost" className="h-10 w-10 text-emerald-600 rounded-xl hover:bg-emerald-50" onClick={() => handleAction(req.id, 'aprovado')}><CheckCircle2 className="h-5 w-5" /></Button>
                           <Button size="icon" variant="ghost" className="h-10 w-10 text-rose-600 rounded-xl hover:bg-rose-50" onClick={() => handleAction(req.id, 'reprovado')}><XCircle className="h-5 w-5" /></Button>
                        </div>
                     )}
                  </div>
               </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl text-primary">Solicitar Férias</DialogTitle>
            <DialogDescription>Seu pedido será enviado para a diretoria administrativa.</DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Início</Label><Input type="date" value={newReq.start} onChange={e => setNewReq({...newReq, start: e.target.value})} className="h-11 rounded-xl" /></div>
               <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Fim</Label><Input type="date" value={newReq.end} onChange={e => setNewReq({...newReq, end: e.target.value})} className="h-11 rounded-xl" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Motivo / Observação</Label><Input placeholder="Ex: Viagem familiar" value={newReq.obs} onChange={e => setNewReq({...newReq, obs: e.target.value})} className="h-11 rounded-xl" /></div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-primary h-12 rounded-xl font-black uppercase tracking-widest shadow-lg" onClick={handleRequest} disabled={loading}>
               {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5 mr-2" />} Confirmar Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
