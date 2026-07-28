
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { redirect } from 'next/navigation';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { col, ref, SUB } from '@/lib/tenancy';
import { db } from '@/lib/firebase';
import { ExpenseCategory, ExpenseStatus, RecurringExpense, ExpenseRecord, MonthlyClosure, Appointment } from '@/app/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Sparkles, 
  Calculator,
  CalendarDays,
  Lock,
  ShieldCheck,
  History,
  Printer,
  Download,
  Unlock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { format, setDate, parseISO, isSameMonth, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function DespesasPage() {
  const { loading: authLoading, user, identidade, temPapel } = useAuth();
  const clinicaId = identidade.clinicaId;
  const ehAdmin = temPapel('admin_clinica');
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('lancamentos');
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isClosureDialogOpen, setIsClosureDialogOpen] = useState(false);
  
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [closures, setClosures] = useState<MonthlyClosure[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [newExpense, setNewExpense] = useState<Partial<ExpenseRecord>>({
    nome: '',
    valor: 0,
    vencimento: format(new Date(), 'yyyy-MM-dd'),
    status: 'pendente',
    categoria: 'avulso',
    tipo: 'despesa',
    bloqueado_fechamento: false
  });

  const [newRecurring, setNewRecurring] = useState<Partial<RecurringExpense>>({
    nome: '',
    valor_estimado: 0,
    dia_vencimento: 5,
    categoria: 'fixo',
    ativa: true
  });

  const currentMesAno = format(new Date(), 'yyyy-MM');
  const activeClosure = closures.find(c => c.id === currentMesAno);
  const isMonthClosed = !!activeClosure;

  useEffect(() => {
    if (!authLoading && !ehAdmin) {
      redirect('/dashboard');
    }
  }, [ehAdmin, authLoading]);

  useEffect(() => {
    if (!db && !isGuest) return;

    if (isGuest) {
      const savedRecurring = localStorage.getItem('demo_recurring_expenses');
      const savedRecords = localStorage.getItem('demo_expense_records');
      const savedClosures = localStorage.getItem('demo_closures');
      const savedApts = localStorage.getItem('demo_appointments');
      
      if (savedRecurring) setRecurringExpenses(JSON.parse(savedRecurring));
      if (savedRecords) setExpenseRecords(JSON.parse(savedRecords));
      if (savedClosures) setClosures(JSON.parse(savedClosures));
      if (savedApts) setAppointments(JSON.parse(savedApts));
      
      setLoading(false);
      return;
    }

    const unsubRec = onSnapshot(col(db!, clinicaId!, SUB.despesasRecorrentes), (snap) => {
      setRecurringExpenses(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as RecurringExpense)));
    });

    const unsubRecs = onSnapshot(col(db!, clinicaId!, SUB.despesas), (snap) => {
      setExpenseRecords(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ExpenseRecord)));
    });

    const unsubClosures = onSnapshot(col(db!, clinicaId!, SUB.fechamentosMensais), (snap) => {
      setClosures(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as MonthlyClosure)));
    });

    const unsubApts = onSnapshot(col<Appointment>(db!, clinicaId!, SUB.agendamentos), (snap) => {
      setAppointments(snap.docs.map(doc => ({ ...doc.data(), id: doc.id,
        data_hora: (doc.data().data_hora as any) instanceof Timestamp ? (doc.data().data_hora as any).toDate().toISOString() : doc.data().data_hora
      } as Appointment)));
    });

    setLoading(false);
    return () => { unsubRec(); unsubRecs(); unsubClosures(); unsubApts(); };
  }, [isGuest]);

  const monthlyStats = useMemo(() => {
    const currentMonthRecords = expenseRecords.filter(r => r.mes_ano === currentMesAno);
    const currentMonthApts = appointments.filter(apt => {
      const d = new Date(apt.data_hora);
      return isSameMonth(d, new Date());
    });

    const totalDespesas = currentMonthRecords.reduce((acc, curr) => acc + curr.valor, 0);
    const despesasPagas = currentMonthRecords.filter(r => r.status === 'pago').reduce((acc, curr) => acc + curr.valor, 0);
    
    // Receita Realizada: Sessões finalizadas ou em atendimento
    const receitaRealizada = currentMonthApts
      .filter(apt => apt.status === 'realizado' || apt.status === 'atendimento')
      .reduce((acc, curr) => acc + (curr.valor_final || 0), 0);

    // Receita Projetada: Sessões agendadas/confirmadas que ainda não ocorreram ou faltas cobradas
    const receitaProjetada = currentMonthApts
      .filter(apt => ['agendado', 'confirmado', 'espera', 'aguardando_confirmacao'].includes(apt.status) || (apt.status === 'faltou' && apt.cancelamento_cobrado))
      .reduce((acc, curr) => acc + (curr.valor_final || 0), 0);

    const totalReceitaEstimada = receitaRealizada + receitaProjetada;

    return {
      totalDespesas,
      despesasPagas,
      despesasPendentes: totalDespesas - despesasPagas,
      receitaRealizada,
      receitaProjetada: totalReceitaEstimada,
      saldoProjetado: totalReceitaEstimada - totalDespesas
    };
  }, [expenseRecords, appointments, currentMesAno]);

  const handleSaveExpense = async () => {
    if (!newExpense.nome || !newExpense.valor || !newExpense.vencimento) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    const mesAno = format(parseISO(newExpense.vencimento as string), 'yyyy-MM');
    if (closures.some(c => c.id === mesAno)) {
      toast({ variant: 'destructive', title: 'Mês Fechado', description: 'Não é possível lançar despesas em um mês que já foi encerrado.' });
      return;
    }

    const recordData = { 
      ...newExpense, 
      mes_ano: mesAno,
      bloqueado_fechamento: false,
      tipo: 'despesa'
    };

    try {
      if (isGuest) {
        const record = { ...recordData, id: Math.random().toString(36).substr(2, 9) } as ExpenseRecord;
        const updated = [...expenseRecords, record];
        setExpenseRecords(updated);
        localStorage.setItem('demo_expense_records', JSON.stringify(updated));
      } else {
        await addDoc(col(db!, clinicaId!, SUB.despesas), recordData);
      }
      setIsNewDialogOpen(false);
      toast({ title: 'Sucesso', description: 'Despesa registrada.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar' });
    }
  };

  const handleCloseMonth = async () => {
    const mesAno = currentMesAno;
    const recordsToClose = expenseRecords.filter(r => r.mes_ano === mesAno);
    
    const closureData: MonthlyClosure = {
      id: mesAno,
      total_receitas: monthlyStats.receitaProjetada,
      total_despesas: monthlyStats.despesasPagas,
      saldo_final: monthlyStats.receitaProjetada - monthlyStats.despesasPagas,
      data_fechamento: new Date().toISOString(),
      responsavel_fechamento: user?.nome || 'Gestor',
      status: 'fechado'
    };

    try {
      if (isGuest) {
        const updatedRecords = expenseRecords.map(r => r.mes_ano === mesAno ? { ...r, bloqueado_fechamento: true } : r);
        setExpenseRecords(updatedRecords);
        localStorage.setItem('demo_expense_records', JSON.stringify(updatedRecords));

        const updatedClosures = [...closures, closureData];
        setClosures(updatedClosures);
        localStorage.setItem('demo_closures', JSON.stringify(updatedClosures));
      } else {
        const batch = writeBatch(db!);
        recordsToClose.forEach(rec => {
          batch.update(ref(db!, clinicaId!, SUB.despesas, rec.id), { bloqueado_fechamento: true });
        });
        batch.set(ref(db!, clinicaId!, SUB.fechamentosMensais, mesAno), closureData);
        await batch.commit();
      }
      setIsClosureDialogOpen(false);
      toast({ title: 'Mês Encerrado', description: `O fechamento de ${format(new Date(), 'MMMM/yyyy', { locale: ptBR })} foi concluído.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro no fechamento' });
    }
  };

  const handleReopenMonth = async () => {
    const mesAno = currentMesAno;
    try {
      if (isGuest) {
        const updatedRecords = expenseRecords.map(r => r.mes_ano === mesAno ? { ...r, bloqueado_fechamento: false } : r);
        setExpenseRecords(updatedRecords);
        localStorage.setItem('demo_expense_records', JSON.stringify(updatedRecords));

        const updatedClosures = closures.filter(c => c.id !== mesAno);
        setClosures(updatedClosures);
        localStorage.setItem('demo_closures', JSON.stringify(updatedClosures));
      } else {
        const batch = writeBatch(db!);
        const recordsToOpen = expenseRecords.filter(r => r.mes_ano === mesAno);
        recordsToOpen.forEach(rec => {
          batch.update(ref(db!, clinicaId!, SUB.despesas, rec.id), { bloqueado_fechamento: false });
        });
        batch.delete(ref(db!, clinicaId!, SUB.fechamentosMensais, mesAno));
        await batch.commit();
      }
      toast({ title: 'Mês Reaberto', description: 'Os lançamentos foram desbloqueados para edição.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao reabrir mês' });
    }
  };

  const generateMonthlyExpenses = async () => {
    const today = new Date();
    const mesAno = format(today, 'yyyy-MM');
    const existingForMonth = expenseRecords.filter(r => r.mes_ano === mesAno);
    
    if (existingForMonth.length > 0) {
      toast({ title: 'Atenção', description: 'Já existem despesas geradas para este mês.' });
      return;
    }

    const newRecords: ExpenseRecord[] = recurringExpenses
      .filter(rec => rec.ativa)
      .map(rec => {
        const dueDate = setDate(today, rec.dia_vencimento);
        return {
          id: Math.random().toString(36).substr(2, 9),
          nome: rec.nome,
          valor: rec.categoria === 'fixo' ? rec.valor_estimado : 0,
          vencimento: dueDate.toISOString(),
          status: 'pendente',
          categoria: rec.categoria,
          template_id: rec.id,
          mes_ano: mesAno,
          bloqueado_fechamento: false,
          tipo: 'despesa'
        };
      });

    if (isGuest) {
      const updated = [...expenseRecords, ...newRecords];
      setExpenseRecords(updated);
      localStorage.setItem('demo_expense_records', JSON.stringify(updated));
    } else {
      for (const rec of newRecords) {
        await addDoc(col(db!, clinicaId!, SUB.despesas), rec);
      }
    }
    toast({ title: 'Automação Concluída', description: `${newRecords.length} despesas geradas.` });
  };

  const togglePaymentStatus = async (record: ExpenseRecord) => {
    if (record.bloqueado_fechamento) {
      toast({ variant: 'destructive', title: 'Registro Bloqueado', description: 'Este mês está fechado.' });
      return;
    }

    const newStatus: ExpenseStatus = record.status === 'pago' ? 'pendente' : 'pago';
    const payDate = newStatus === 'pago' ? new Date().toISOString() : null;

    if (isGuest) {
      const updated = expenseRecords.map(r => r.id === record.id ? { ...r, status: newStatus, pagamento: payDate || undefined } : r);
      setExpenseRecords(updated);
      localStorage.setItem('demo_expense_records', JSON.stringify(updated));
    } else {
      await updateDoc(ref(db!, clinicaId!, SUB.despesas, record.id), { status: newStatus, pagamento: payDate });
    }
    toast({ title: 'Status Atualizado' });
  };

  const handleSaveRecurring = async () => {
    if (!newRecurring.nome || !newRecurring.dia_vencimento) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Preencha nome e dia.' });
      return;
    }

    try {
      if (isGuest) {
        const record = { ...newRecurring, id: Math.random().toString(36).substr(2, 9) } as RecurringExpense;
        const updated = [...recurringExpenses, record];
        setRecurringExpenses(updated);
        localStorage.setItem('demo_recurring_expenses', JSON.stringify(updated));
      } else {
        await addDoc(col(db!, clinicaId!, SUB.despesasRecorrentes), newRecurring);
      }
      setIsRecurringDialogOpen(false);
      toast({ title: 'Sucesso' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar' });
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    try {
      if (isGuest) {
        const updated = recurringExpenses.filter(r => r.id !== id);
        setRecurringExpenses(updated);
        localStorage.setItem('demo_recurring_expenses', JSON.stringify(updated));
      } else {
        await deleteDoc(ref(db!, clinicaId!, SUB.despesasRecorrentes, id));
      }
      toast({ title: 'Sucesso' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao remover' });
    }
  };

  if (authLoading) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16 print:p-0">
      <div className="hidden print:block border-b-2 border-primary pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-headline font-bold text-primary">Fabi - Terapeuta Ocupacional</h1>
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Relatório Financeiro e Fluxo de Caixa</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">Emitido por: {user?.nome}</p>
            <p>Data: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary">Gestão de Despesas</h1>
          <p className="text-sm text-muted-foreground">Controle de caixa e projeção de resultados.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()} className="h-11 font-bold border-primary/20 text-primary hover:bg-primary/5">
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          {!isMonthClosed ? (
            <>
              <Button variant="outline" onClick={generateMonthlyExpenses} className="h-11 font-bold border-primary/20 text-primary hover:bg-primary/5">
                <Sparkles className="h-4 w-4 mr-2" /> Gerar Mês
              </Button>
              <Button onClick={() => setIsClosureDialogOpen(true)} variant="outline" className="h-11 font-bold border-accent text-accent hover:bg-accent/5">
                <ShieldCheck className="h-4 w-4 mr-2" /> Fechar Mês
              </Button>
            </>
          ) : (
            <Button onClick={handleReopenMonth} variant="outline" className="h-11 font-bold border-amber-500 text-amber-600 hover:bg-amber-50">
              <Unlock className="h-4 w-4 mr-2" /> Reabrir para Correções
            </Button>
          )}
          <Button onClick={() => setIsNewDialogOpen(true)} disabled={isMonthClosed} className="h-11 font-bold bg-accent shadow-lg">
            <Plus className="h-4 w-4 mr-2" /> Novo Lançamento
          </Button>
        </div>
      </div>

      {isMonthClosed && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-4 text-amber-800 print:hidden animate-in slide-in-from-top-2">
          <Lock className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">O mês de {format(new Date(), 'MMMM', { locale: ptBR })} está fechado.</p>
            <p className="text-xs">Para editar lançamentos ou adicionar novos registros, clique em "Reabrir para Correções".</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:grid-cols-4">
        <Card className="border-none ring-1 ring-border shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <p className="text-[10px] font-black uppercase text-muted-foreground">Receita Projetada (Agenda)</p>
            </div>
            <p className="text-xl font-black text-emerald-600">R$ {monthlyStats.receitaProjetada.toFixed(2)}</p>
            <div className="flex items-center gap-1 mt-1 opacity-60">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="text-[9px] font-bold">R$ {monthlyStats.receitaRealizada.toFixed(2)} já realizado</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none ring-1 ring-border shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />
              <p className="text-[10px] font-black uppercase text-muted-foreground">Despesas Totais</p>
            </div>
            <p className="text-xl font-black text-rose-600">R$ {monthlyStats.totalDespesas.toFixed(2)}</p>
            <div className="flex items-center gap-1 mt-1 opacity-60">
              <CheckCircle2 className="h-3 w-3 text-slate-500" />
              <span className="text-[9px] font-bold">R$ {monthlyStats.despesasPagas.toFixed(2)} pago</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none ring-1 ring-border shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-[10px] font-black uppercase text-muted-foreground">A Pagar (Pendente)</p>
            </div>
            <p className="text-xl font-black text-amber-600">R$ {monthlyStats.despesasPendentes.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className={cn("border-none ring-1 shadow-md", monthlyStats.saldoProjetado >= 0 ? "ring-emerald-200 bg-emerald-50/30" : "ring-rose-200 bg-rose-50/30")}>
          <CardContent className="p-4 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] font-black uppercase text-primary">Saldo Estimado</p>
            </div>
            <p className={cn("text-xl font-black", monthlyStats.saldoProjetado >= 0 ? "text-emerald-700" : "text-rose-700")}>
              R$ {monthlyStats.saldoProjetado.toFixed(2)}
            </p>
            <span className="text-[8px] font-black uppercase opacity-40 mt-1 tracking-tighter">Cruza Agenda + Despesas</span>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 border mb-6 h-auto p-1 flex overflow-x-auto print:hidden">
          <TabsTrigger value="lancamentos" className="flex-1 py-2.5 text-xs font-bold gap-2">
            <CalendarDays className="h-4 w-4" /> Contas do Mês
          </TabsTrigger>
          <TabsTrigger value="recorrentes" className="flex-1 py-2.5 text-xs font-bold gap-2">
            <Clock className="h-4 w-4" /> Modelos Recorrentes
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 py-2.5 text-xs font-bold gap-2">
            <History className="h-4 w-4" /> Fechamentos Mensais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos">
          <Card className="border-none ring-1 ring-border shadow-md rounded-2xl overflow-hidden print:shadow-none">
            <CardHeader className="bg-muted/5 border-b py-4">
              <CardTitle className="text-lg font-headline">Fluxo de Caixa: {format(new Date(), 'MMMM yyyy', { locale: ptBR })}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Despesa</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right print:hidden">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseRecords.filter(r => r.mes_ano === currentMesAno).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                        Nenhuma conta lançada para este mês.
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenseRecords
                      .filter(r => r.mes_ano === currentMesAno)
                      .sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime())
                      .map((record) => (
                      <TableRow key={record.id} className={cn(record.status === 'pago' && "opacity-60")}>
                        <TableCell className="font-bold text-primary flex items-center gap-2">
                          {record.bloqueado_fechamento && <Lock className="h-3 w-3 text-muted-foreground print:hidden" />}
                          {record.nome}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{format(new Date(record.vencimento), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="font-black">R$ {record.valor.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[8px] uppercase font-black">{record.categoria}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-[9px] uppercase font-black", record.status === 'pago' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white")}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right print:hidden">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={record.bloqueado_fechamento}
                            onClick={() => togglePaymentStatus(record)}
                            className={cn("h-8 px-2 font-bold text-[10px] uppercase", record.status === 'pago' ? "text-slate-400" : "text-emerald-600")}
                          >
                            {record.status === 'pago' ? 'Estornar' : 'Marcar Pago'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recorrentes">
          <div className="grid gap-6 lg:grid-cols-2">
            {['fixo', 'variavel'].map((cat) => (
              <Card key={cat} className="border-none ring-1 ring-border shadow-md rounded-2xl overflow-hidden">
                <CardHeader className="bg-muted/5 border-b py-4 flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-lg font-headline capitalize">Custos {cat === 'fixo' ? 'Fixos' : 'Variáveis'}</CardTitle>
                    <CardDescription className="text-xs">Modelos base para geração mensal.</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { setNewRecurring({ ...newRecurring, categoria: cat as ExpenseCategory }); setIsRecurringDialogOpen(true); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/10">
                      <TableRow>
                        <TableHead className="text-[10px] uppercase font-bold">Item</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-center">Dia</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-right">Valor Est.</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurringExpenses.filter(r => r.categoria === cat).map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell className="font-bold text-slate-700 text-sm">{rec.nome}</TableCell>
                          <TableCell className="text-center font-bold text-xs">Dia {rec.dia_vencimento}</TableCell>
                          <TableCell className="text-right font-black text-sm">
                            {rec.categoria === 'fixo' ? `R$ ${rec.valor_estimado.toFixed(2)}` : 'Variável'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => handleDeleteRecurring(rec.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="historico">
          <Card className="border-none ring-1 ring-border shadow-md rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/5 border-b py-4">
              <CardTitle className="text-lg font-headline">Relatórios de Fechamento</CardTitle>
              <CardDescription>Consolidação auditável de receitas e despesas.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Mês/Ano</TableHead>
                    <TableHead>Total Receitas</TableHead>
                    <TableHead>Total Despesas</TableHead>
                    <TableHead>Saldo Final</TableHead>
                    <TableHead>Data Fechamento</TableHead>
                    <TableHead className="text-right">Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closures.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                        Nenhum fechamento registrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    closures.sort((a, b) => b.id.localeCompare(a.id)).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-bold text-primary">{c.id}</TableCell>
                        <TableCell className="text-emerald-600 font-bold">R$ {c.total_receitas.toFixed(2)}</TableCell>
                        <TableCell className="text-rose-600 font-bold">R$ {c.total_despesas.toFixed(2)}</TableCell>
                        <TableCell className={cn("font-black", c.saldo_final >= 0 ? "text-primary" : "text-rose-700")}>
                          R$ {c.saldo_final.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs">{format(new Date(c.data_fechamento), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell className="text-right font-medium">{c.responsavel_fechamento}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Fechamento */}
      <Dialog open={isClosureDialogOpen} onOpenChange={setIsClosureDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl text-accent">Fechamento Mensal</DialogTitle>
            <DialogDescription>
              Confirme a consolidação do mês de <strong>{format(new Date(), 'MMMM yyyy', { locale: ptBR })}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/30 rounded-2xl">
                <Label className="text-[10px] uppercase font-black text-muted-foreground">Receitas (Agenda)</Label>
                <p className="text-lg font-black text-emerald-600">R$ {monthlyStats.receitaProjetada.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-2xl">
                <Label className="text-[10px] uppercase font-black text-muted-foreground">Despesas (Pagas)</Label>
                <p className="text-lg font-black text-rose-600">R$ {monthlyStats.despesasPagas.toFixed(2)}</p>
              </div>
            </div>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl text-center">
              <Label className="text-[10px] uppercase font-black text-primary">Saldo Final Auditado</Label>
              <p className="text-2xl font-black text-primary">R$ {(monthlyStats.receitaProjetada - monthlyStats.despesasPagas).toFixed(2)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsClosureDialogOpen(false)}>Cancelar</Button>
            <Button className="bg-accent font-bold" onClick={handleCloseMonth}>
              Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Novo Lançamento */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl text-primary">Novo Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Descrição</Label>
              <Input placeholder="Ex: Manutenção" className="h-11" value={newExpense.nome} onChange={(e) => setNewExpense({...newExpense, nome: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Valor (R$)</Label>
                <Input type="number" className="h-11" value={newExpense.valor} onChange={(e) => setNewExpense({...newExpense, valor: Number(e.target.value)})} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Vencimento</Label>
                <Input type="date" className="h-11" value={newExpense.vencimento} onChange={(e) => setNewExpense({...newExpense, vencimento: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-primary h-12 rounded-xl font-bold shadow-lg" onClick={handleSaveExpense}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Novo Recorrente */}
      <Dialog open={isRecurringDialogOpen} onOpenChange={setIsRecurringDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl text-primary">Modelo Recorrente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Nome</Label>
              <Input placeholder="Ex: Internet" className="h-11" value={newRecurring.nome} onChange={(e) => setNewRecurring({...newRecurring, nome: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Dia Vencimento</Label>
                <Input type="number" max="31" min="1" className="h-11" value={newRecurring.dia_vencimento} onChange={(e) => setNewRecurring({...newRecurring, dia_vencimento: Number(e.target.value)})} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Valor (Opcional)</Label>
                <Input type="number" className="h-11" value={newRecurring.valor_estimado} onChange={(e) => setNewRecurring({...newRecurring, valor_estimado: Number(e.target.value)})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-primary h-12 rounded-xl font-bold shadow-lg" onClick={handleSaveRecurring}>
              Salvar Modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
