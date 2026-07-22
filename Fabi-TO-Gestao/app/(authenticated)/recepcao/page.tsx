
"use client"

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { 
  UserCheck, 
  Wallet, 
  History, 
  Search, 
  Clock, 
  CreditCard, 
  DollarSign, 
  QrCode, 
  CheckCircle2,
  MoreVertical,
  ChevronRight,
  HandCoins,
  AlertCircle,
  XCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useAuth } from '@/components/providers/auth-provider';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, doc, updateDoc, Timestamp, orderBy } from 'firebase/firestore';
import { Appointment, Transaction } from '@/app/lib/types';
import { format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { processarFechamentoSessao } from '@/services/financeiroService';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function RecepcaoCobrancaPage() {
  const { isGuest, firebaseUser, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [isCobrancaOpen, setIsCobrancaOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Transaction['meio_pagamento']>('pix');

  // 1. Carregar Agendamentos que exigem cobrança: Em Espera OU Cancelados Fora do Prazo
  const queueQuery = useMemo(() => {
    if (!firestore || !firebaseUser || isGuest) return null;
    return query(
      collection(firestore, 'agendamentos'),
      where('status', 'in', ['espera', 'cancelado']),
      orderBy('data_hora', 'asc')
    );
  }, [firestore, firebaseUser, isGuest]);

  const { data: firestoreApts } = useCollection<Appointment>(queueQuery);
  
  // Suporte para Modo Demo
  const [guestApts, setGuestApts] = useState<Appointment[]>([]);
  useEffect(() => {
    if (isGuest) {
      const saved = localStorage.getItem('demo_appointments');
      if (saved) {
        const all = JSON.parse(saved) as Appointment[];
        setGuestApts(all.filter(a => a.status === 'espera' || (a.status === 'cancelado' && a.cancelamento_cobrado)));
      }
    }
  }, [isGuest]);

  const appointments = isGuest ? guestApts : (firestoreApts || []);

  // 2. Carregar Transações para Caixa e Alertas de Débito
  const transactionsQuery = useMemo(() => {
    if (!firestore || !firebaseUser || isGuest) return null;
    return query(collection(firestore, 'transacoes_financeiras'));
  }, [firestore, firebaseUser, isGuest]);

  const { data: firestoreTransactions } = useCollection<Transaction>(transactionsQuery);
  
  const [guestTransactions, setGuestTransactions] = useState<Transaction[]>([]);
  useEffect(() => {
    if (isGuest) {
      const saved = localStorage.getItem('demo_transactions');
      if (saved) setGuestTransactions(JSON.parse(saved));
    }
  }, [isGuest]);

  const allTransactions = isGuest ? guestTransactions : (firestoreTransactions || []);
  
  const caixaDoDia = useMemo(() => {
    return allTransactions
      .filter(t => isSameDay(new Date(t.data_criacao), new Date()) && t.status === 'pago')
      .reduce((acc, curr) => acc + curr.valor_liquido, 0);
  }, [allTransactions]);

  const getPatientPendencies = (patientId: string | null) => {
    if (!patientId) return [];
    return allTransactions.filter(t => t.paciente_id === patientId && t.status === 'pendente' && t.tipo === 'entrada');
  };

  const filteredApts = useMemo(() => {
    return appointments.filter(a => {
      const searchMatch = a.paciente_nome.toLowerCase().includes(searchTerm.toLowerCase());
      // Mostrar se for ESPERA (chegou) ou se for CANCELADO com flag de cobrar ATIVA (pendente)
      return searchMatch && (a.status === 'espera' || (a.status === 'cancelado' && a.cancelamento_cobrado === true));
    });
  }, [appointments, searchTerm]);

  const handleOpenCobranca = (apt: Appointment) => {
    setSelectedApt(apt);
    setIsCobrancaOpen(true);
  };

  const handleConfirmPagamento = async () => {
    if (!selectedApt) return;

    try {
      if (firestore && !isGuest) {
        await processarFechamentoSessao(firestore, selectedApt, paymentMethod);
        
        const aptRef = doc(firestore, 'agendamentos', selectedApt.id);
        await updateDoc(aptRef, { cancelamento_cobrado: false, status_financeiro: 'pago' });
      } else {
        const newTrans: Transaction = {
          id: Math.random().toString(36).substr(2, 9),
          data_criacao: new Date().toISOString(),
          data_vencimento: new Date().toISOString(),
          paciente_id: selectedApt.paciente_id || 'anon',
          paciente_nome: selectedApt.paciente_nome,
          agendamento_id: selectedApt.id,
          tipo: 'entrada',
          meio_pagamento: paymentMethod,
          valor_bruto: selectedApt.valor_final,
          taxa_valor: 0,
          valor_liquido: selectedApt.valor_final,
          status: 'pago',
          categoria: 'sessao'
        };
        const updatedTrans = [...guestTransactions, newTrans];
        setGuestTransactions(updatedTrans);
        localStorage.setItem('demo_transactions', JSON.stringify(updatedTrans));
        
        const savedApts = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
        const updatedApts = savedApts.map((a: Appointment) => a.id === selectedApt.id ? { ...a, cancelamento_cobrado: false } : a);
        localStorage.setItem('demo_appointments', JSON.stringify(updatedApts));
        setGuestApts(updatedApts.filter((a: Appointment) => (a.status === 'espera' || (a.status === 'cancelado' && a.cancelamento_cobrado))));
      }

      toast({
        title: "Pagamento Registrado",
        description: `Cobrança de ${selectedApt.paciente_nome} concluída.`,
      });
      setIsCobrancaOpen(false);
      setSelectedApt(null);
    } catch (e) {
      toast({ variant: 'destructive', title: "Erro no processamento" });
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500 max-w-[1600px] mx-auto px-1 md:px-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div>
          <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary flex items-center gap-3">
            <UserCheck className="h-8 w-8 text-accent shrink-0" /> Recepção & Cobrança
          </h1>
          <p className="text-muted-foreground text-sm font-black uppercase tracking-widest opacity-60 ml-1">Frente de caixa e sala de espera</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 px-1">
        <Card className="border-none ring-1 ring-border shadow-sm rounded-3xl bg-emerald-50/40">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 shadow-inner shrink-0">
                <Wallet className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <p className="text-[9px] md:text-[10px] font-black uppercase text-emerald-700 tracking-widest">Caixa do Dia</p>
            </div>
            <p className="text-2xl md:text-3xl font-black text-emerald-900 leading-none truncate">R$ {caixaDoDia.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="border-none ring-1 ring-border shadow-sm rounded-3xl">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner shrink-0">
                <Clock className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <p className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Em Espera</p>
            </div>
            <p className="text-2xl md:text-3xl font-black text-primary leading-none truncate">{appointments.filter(a => a.status === 'espera').length}</p>
          </CardContent>
        </Card>

        <Card className="border-none ring-1 ring-border shadow-sm rounded-3xl sm:col-span-2 md:col-span-1">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-inner shrink-0">
                <HandCoins className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <p className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Pendente Cobrança</p>
            </div>
            <p className="text-2xl md:text-3xl font-black text-accent leading-none truncate">{filteredApts.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl overflow-hidden bg-white/70 backdrop-blur-xl">
        <CardHeader className="p-6 md:p-8 border-b bg-muted/5 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="w-full">
            <CardTitle className="font-headline text-xl md:text-2xl flex items-center gap-3">
              <Clock className="h-6 w-6 text-primary shrink-0" /> Fila & Cobrança
            </CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-wider opacity-60">Check-ins e Faltas Fora do Prazo</CardDescription>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar na fila..." 
              className="pl-10 h-11 rounded-xl bg-white border-none shadow-md"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="p-6 text-[10px] uppercase font-black tracking-widest text-muted-foreground">Paciente</th>
                <th className="p-6 text-[10px] uppercase font-black tracking-widest text-muted-foreground text-center">Status</th>
                <th className="p-6 text-[10px] uppercase font-black tracking-widest text-muted-foreground">Plano</th>
                <th className="p-6 text-[10px] uppercase font-black tracking-widest text-muted-foreground">Valor</th>
                <th className="p-6 text-right pr-10 text-[10px] uppercase font-black tracking-widest text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b">
              {filteredApts.map((apt) => {
                const pendencies = getPatientPendencies(apt.paciente_id);
                const hasDebt = pendencies.length > 0;
                const isLateCancel = apt.status === 'cancelado';

                return (
                  <tr key={apt.id} className={cn("hover:bg-primary/[0.02] transition-colors group", isLateCancel && "bg-rose-50/20")}>
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center font-black text-xs relative shrink-0",
                          isLateCancel ? "bg-rose-100 text-rose-700" : "bg-primary/10 text-primary"
                        )}>
                          {apt.paciente_nome.charAt(0)}
                          {hasDebt && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 border-2 border-white animate-bounce">
                                    <AlertCircle className="h-2 w-2" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="bg-rose-600 text-white border-none font-bold text-[10px] uppercase">
                                  Débitos pendentes.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-primary text-sm leading-none truncate">{apt.paciente_nome}</p>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase mt-1 inline-block whitespace-nowrap">
                            {format(parseISO(apt.data_hora), "dd/MM 'às' HH:mm")}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-center whitespace-nowrap">
                      {isLateCancel ? (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 font-black text-[9px] py-1 px-3">
                          CANCEL. TARDIO
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 font-black text-[9px] py-1 px-3">
                          PRESENTE
                        </Badge>
                      )}
                    </td>
                    <td className="p-6 whitespace-nowrap">
                       <span className="text-xs font-bold text-slate-600 uppercase">{apt.convenio_id === 'particular' ? 'Particular' : 'Convênio'}</span>
                    </td>
                    <td className="p-6 whitespace-nowrap">
                       <p className="text-sm font-black text-slate-800">R$ {apt.valor_final?.toFixed(2)}</p>
                    </td>
                    <td className="p-6 text-right pr-10">
                       <Button 
                         onClick={() => handleOpenCobranca(apt)}
                         className={cn(
                           "h-10 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-transform whitespace-nowrap",
                           isLateCancel ? "bg-rose-600 hover:bg-rose-700" : "bg-accent"
                         )}
                       >
                         {isLateCancel ? 'Cobrar' : 'Receber'}
                       </Button>
                    </td>
                  </tr>
                );
              })}
              {filteredApts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-24 text-center">
                     <div className="flex flex-col items-center gap-4 opacity-20">
                        <UserCheck className="h-16 w-16 text-primary" />
                        <p className="text-xs font-black uppercase tracking-[0.3em]">Fila vazia</p>
                     </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal de Cobrança */}
      <Dialog open={isCobrancaOpen} onOpenChange={setIsCobrancaOpen}>
        <DialogContent className="max-w-md w-[95vw] rounded-[2.5rem] p-0 border-none shadow-3xl overflow-hidden bg-white">
          <DialogHeader className={cn("p-8 text-white", selectedApt?.status === 'cancelado' ? "bg-rose-600" : "bg-primary")}>
            <DialogTitle className="text-xl md:text-2xl font-headline">
              {selectedApt?.status === 'cancelado' ? 'Cobrar Falta Tardia' : 'Recebimento'}
            </DialogTitle>
            <DialogDescription className="text-white/70 font-medium">Método de pagamento para {selectedApt?.paciente_nome}.</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[70vh]">
            <div className="p-6 md:p-8 space-y-8">
              <div className="p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-1">
                 <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Valor Devido</p>
                 <p className="text-3xl md:text-4xl font-black text-primary leading-tight">R$ {selectedApt?.valor_final?.toFixed(2)}</p>
              </div>

              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Método de Pagamento</Label>
                <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setPaymentMethod('pix')}
                     className={cn(
                       "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                       paymentMethod === 'pix' ? "border-primary bg-primary/5 text-primary shadow-inner" : "border-slate-100 hover:border-slate-200"
                     )}
                   >
                      <QrCode className="h-6 w-6" />
                      <span className="text-[10px] font-black uppercase">PIX</span>
                   </button>
                   <button 
                     onClick={() => setPaymentMethod('dinheiro')}
                     className={cn(
                       "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                       paymentMethod === 'dinheiro' ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-inner" : "border-slate-100 hover:border-slate-200"
                     )}
                   >
                      <DollarSign className="h-6 w-6" />
                      <span className="text-[10px] font-black uppercase">Dinheiro</span>
                   </button>
                   <button 
                     onClick={() => setPaymentMethod('cartao_credito')}
                     className={cn(
                       "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                       paymentMethod === 'cartao_credito' ? "border-accent bg-accent/5 text-accent shadow-inner" : "border-slate-100 hover:border-slate-200"
                     )}
                   >
                      <CreditCard className="h-6 w-6" />
                      <span className="text-[10px] font-black uppercase">Crédito</span>
                   </button>
                   <button 
                     onClick={() => setPaymentMethod('cartao_debito')}
                     className={cn(
                       "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                       paymentMethod === 'cartao_debito' ? "border-accent bg-accent/5 text-accent shadow-inner" : "border-slate-100 hover:border-slate-200"
                     )}
                   >
                      <CreditCard className="h-6 w-6" />
                      <span className="text-[10px] font-black uppercase">Débito</span>
                   </button>
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-3">
                 <CheckCircle2 className="h-5 w-5 text-amber-600 shrink-0" />
                 <p className="text-[10px] text-amber-800 font-bold leading-relaxed uppercase">O lançamento será gerado automaticamente no caixa.</p>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 md:p-8 bg-slate-50 border-t flex flex-col md:flex-row gap-3">
             <Button variant="ghost" className="font-black uppercase text-[10px] tracking-widest h-12 flex-1" onClick={() => setIsCobrancaOpen(false)}>Cancelar</Button>
             <Button className="bg-primary h-12 flex-[2] rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl" onClick={handleConfirmPagamento}>
               Confirmar Pagamento
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
