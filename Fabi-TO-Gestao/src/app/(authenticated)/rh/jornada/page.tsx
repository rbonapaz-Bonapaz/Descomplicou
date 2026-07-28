
"use client"

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { collection, query, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { col, ref, SUB } from '@/lib/tenancy';
import { useFirestore } from '@/firebase';
import { ClockInRecord, User, TimeClosure } from '@/app/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ShieldCheck, 
  Clock, 
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function JornadaRHPage() {
  const { loading: authLoading, firebaseUser, identidade, temPapel } = useAuth();
  const clinicaId = identidade.clinicaId;
  const ehAdmin = temPapel('admin_clinica');
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [records, setRecords] = useState<ClockInRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [justifyingRecord, setJustifyingRecord] = useState<ClockInRecord | null>(null);
  const [justificationText, setJustificationText] = useState('');

  useEffect(() => {
    if (authLoading || !ehAdmin || isGuest || !firebaseUser || !firestore) {
      setLoading(false);
      return;
    }
    
    const q = query(col<ClockInRecord>(firestore, clinicaId!, SUB.batidasPonto), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setRecords(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ClockInRecord)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [firestore, isGuest, authLoading, ehAdmin, firebaseUser]);

  const handleReview = async (status: 'aprovado' | 'reprovado') => {
    if (!justifyingRecord || !firestore) return;
    const updateData = { status, observacao_gestor: justificationText };
    try {
      await updateDoc(ref(firestore, clinicaId!, SUB.batidasPonto, justifyingRecord.id), updateData);
      toast({ title: status === 'aprovado' ? 'Aprovado' : 'Reprovado' });
      setJustifyingRecord(null);
      setJustificationText('');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao processar' });
    }
  };

  if (loading) return <div className="p-12 text-center text-xs font-black uppercase animate-pulse">Carregando Auditoria...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-accent" /> Jornada & Auditoria
          </h1>
        </div>
      </div>

      <Card className="rounded-[2rem] border-none ring-1 ring-border shadow-2xl overflow-hidden bg-white">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="pl-8 text-[10px] uppercase font-black tracking-widest h-14">Colaborador</TableHead>
                <TableHead className="text-[10px] uppercase font-black h-14">Evento</TableHead>
                <TableHead className="text-[10px] uppercase font-black h-14">Data/Hora</TableHead>
                <TableHead className="text-right pr-8 text-[10px] uppercase font-black h-14">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id} className={cn("border-primary/5", r.status === 'reprovado' && "bg-rose-50")}>
                  <TableCell className="pl-8 font-black text-primary truncate max-w-[150px]">{r.userName}</TableCell>
                  <TableCell>
                    <Badge className={cn("text-[8px] font-black uppercase", r.type === 'entrada' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>{r.type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-bold text-slate-600 whitespace-nowrap">{format(new Date(r.timestamp), 'dd/MM/yy HH:mm')}</TableCell>
                  <TableCell className="text-right pr-8">
                     <Button 
                       variant="ghost" 
                       size="icon"
                       onClick={() => setJustifyingRecord(r)}
                       className={cn("h-9 w-9 rounded-xl", r.status === 'aprovado' ? "text-emerald-600 bg-emerald-50" : r.status === 'reprovado' ? "text-rose-600 bg-rose-100 shadow-sm" : "text-amber-600 bg-amber-50")}
                     >
                       {r.status === 'aprovado' ? <CheckCircle2 className="h-4 w-4" /> : r.status === 'reprovado' ? <XCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                     </Button>
                  </TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow><TableCell colSpan={4} className="p-20 text-center text-xs font-black uppercase opacity-20">Nenhum registro encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!justifyingRecord} onOpenChange={() => setJustifyingRecord(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle className="font-headline text-2xl text-primary">Revisar Batida</DialogTitle></DialogHeader>
          <div className="p-4 space-y-4">
             <div className="p-4 bg-slate-50 rounded-xl border italic text-sm">"{justifyingRecord?.justificativa || 'Sem justificativa.'}"</div>
             <Textarea placeholder="Observação de auditoria..." value={justificationText} onChange={e => setJustificationText(e.target.value)} className="min-h-[100px] rounded-xl" />
          </div>
          <DialogFooter className="gap-2">
             <Button variant="ghost" onClick={() => setJustifyingRecord(null)}>Voltar</Button>
             <div className="flex gap-2 w-full md:w-auto">
               <Button variant="outline" className="text-rose-600 border-rose-200" onClick={() => handleReview('reprovado')}>Reprovar</Button>
               <Button className="bg-emerald-600 font-bold" onClick={() => handleReview('aprovado')}>Aprovar Registro</Button>
             </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
