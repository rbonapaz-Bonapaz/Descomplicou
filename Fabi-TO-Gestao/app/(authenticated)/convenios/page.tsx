
"use client"

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { redirect } from 'next/navigation';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { HealthPlan, PriceLog } from '@/app/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Plus, Handshake, Edit2, Percent, DollarSign, History, Save, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ConveniosPage() {
  const { isGestor, loading: authLoading, isGuest, user } = useAuth();
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<HealthPlan | null>(null);
  
  const [newPlan, setNewPlan] = useState<Partial<HealthPlan>>({
    nome: '',
    tipo: 'convenio',
    valor_sessao: 120,
    porcentagem_lucro: 50
  });

  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !isGestor) {
      redirect('/dashboard');
    }
  }, [isGestor, authLoading]);

  useEffect(() => {
    if (!db && !isGuest) return;
    
    if (isGuest) {
      const saved = localStorage.getItem('demo_convenios');
      if (saved) {
        setPlans(JSON.parse(saved));
      } else {
        const initial: HealthPlan[] = [
          { 
            id: '1', 
            nome: 'Unimed Rio', 
            tipo: 'convenio', 
            valor_sessao: 110, 
            porcentagem_lucro: 40,
            historico_precos: [
              { data: '2023-01-01T10:00:00Z', valor_anterior: 0, valor_novo: 100, lucro_anterior: 0, lucro_novo: 35, usuario_nome: 'Sistema' },
              { data: '2023-06-01T14:30:00Z', valor_anterior: 100, valor_novo: 110, lucro_anterior: 35, lucro_novo: 40, usuario_nome: 'Gestor (Demo)' }
            ]
          },
          { id: '2', nome: 'Cassi', tipo: 'convenio', valor_sessao: 95, porcentagem_lucro: 50 },
          { id: '3', nome: 'Bradesco Saúde', tipo: 'convenio', valor_sessao: 125, porcentagem_lucro: 45 },
          { id: 'particular', nome: 'Particular', tipo: 'particular', valor_sessao: 200, porcentagem_lucro: 100 },
        ];
        setPlans(initial);
        localStorage.setItem('demo_convenios', JSON.stringify(initial));
      }
      return;
    }

    const q = query(collection(db!, 'convenios'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HealthPlan[];
      setPlans(data);
    });
    return () => unsubscribe();
  }, [isGuest]);

  const handleAddPlan = async () => {
    if (!newPlan.nome) {
      toast({ variant: 'destructive', title: 'Erro', description: 'O nome do plano é obrigatório.' });
      return;
    }

    const initialLog: PriceLog = {
      data: new Date().toISOString(),
      valor_anterior: 0,
      valor_novo: newPlan.valor_sessao || 0,
      lucro_anterior: 0,
      lucro_novo: newPlan.porcentagem_lucro || 0,
      usuario_nome: user?.nome || 'Gestor'
    };

    try {
      if (db && !isGuest) {
        await addDoc(collection(db, 'convenios'), { 
          ...newPlan, 
          historico_precos: [initialLog] 
        });
        toast({ title: 'Sucesso', description: 'Plano configurado com sucesso.' });
      } else {
        const p = { ...newPlan, id: Math.random().toString(36).substr(2, 9), historico_precos: [initialLog] } as HealthPlan;
        const updated = [...plans, p];
        setPlans(updated);
        localStorage.setItem('demo_convenios', JSON.stringify(updated));
        toast({ title: 'Modo Demo', description: 'Plano adicionado localmente.' });
      }
      setIsDialogOpen(false);
      setNewPlan({ nome: '', tipo: 'convenio', valor_sessao: 120, porcentagem_lucro: 50 });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao cadastrar convênio.' });
    }
  };

  const handleEditPlan = (plan: HealthPlan) => {
    setSelectedPlan(plan);
    setNewPlan({ ...plan });
    setIsDialogOpen(true);
  };

  const handleUpdatePlan = async () => {
    if (!selectedPlan) return;

    const hasValueChanged = newPlan.valor_sessao !== selectedPlan.valor_sessao || 
                            newPlan.porcentagem_lucro !== selectedPlan.porcentagem_lucro;

    const log: PriceLog = {
      data: new Date().toISOString(),
      valor_anterior: selectedPlan.valor_sessao,
      valor_novo: newPlan.valor_sessao || 0,
      lucro_anterior: selectedPlan.porcentagem_lucro,
      lucro_novo: newPlan.porcentagem_lucro || 0,
      usuario_nome: user?.nome || 'Gestor'
    };

    try {
      if (db && !isGuest) {
        const updateData: any = {
          nome: newPlan.nome,
          tipo: newPlan.tipo,
          valor_sessao: newPlan.valor_sessao,
          porcentagem_lucro: newPlan.porcentagem_lucro,
        };
        
        if (hasValueChanged) {
          updateData.historico_precos = arrayUnion(log);
        }

        await updateDoc(doc(db, 'convenios', selectedPlan.id), updateData);
        toast({ title: 'Sucesso', description: 'Plano atualizado.' });
      } else {
        const updated = plans.map(p => {
          if (p.id === selectedPlan.id) {
            return {
              ...p,
              nome: newPlan.nome || p.nome,
              tipo: (newPlan.tipo || p.tipo) as 'convenio' | 'particular',
              valor_sessao: newPlan.valor_sessao !== undefined ? newPlan.valor_sessao : p.valor_sessao,
              porcentagem_lucro: newPlan.porcentagem_lucro !== undefined ? newPlan.porcentagem_lucro : p.porcentagem_lucro,
              historico_precos: hasValueChanged ? [...(p.historico_precos || []), log] : (p.historico_precos || [])
            };
          }
          return p;
        });
        setPlans(updated);
        localStorage.setItem('demo_convenios', JSON.stringify(updated));
        toast({ title: 'Modo Demo', description: 'Alterações salvas localmente.' });
      }
      setIsDialogOpen(false);
      setSelectedPlan(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível atualizar o plano.' });
    }
  };

  const openHistory = (plan: HealthPlan) => {
    setSelectedPlan(plan);
    setIsHistoryOpen(true);
  };

  if (authLoading) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary">Gestão de Convênios</h1>
          <p className="text-muted-foreground">Configuração estratégica e histórico de repasses.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90 shadow-md" onClick={() => { setSelectedPlan(null); setNewPlan({ nome: '', tipo: 'convenio', valor_sessao: 120, porcentagem_lucro: 50 }); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-headline text-xl">
                {selectedPlan ? 'Editar Configuração do Plano' : 'Configurar Novo Plano'}
              </DialogTitle>
              <CardDescription>
                Alterações de valor não afetam consultas já realizadas.
              </CardDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="plan_nome">Nome da Operadora ou Identificação</Label>
                <Input 
                  id="plan_nome" 
                  value={newPlan.nome}
                  placeholder="Ex: Bradesco Saúde, Particular Especial..."
                  onChange={(e) => setNewPlan({ ...newPlan, nome: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan_tipo">Tipo</Label>
                  <select 
                    id="plan_tipo"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    value={newPlan.tipo}
                    onChange={(e) => setNewPlan({ ...newPlan, tipo: e.target.value as any })}
                  >
                    <option value="convenio">Convênio</option>
                    <option value="particular">Particular</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan_valor">Valor da Sessão (R$)</Label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-muted-foreground text-sm">R$</div>
                    <Input 
                      id="plan_valor" 
                      type="number"
                      className="pl-10"
                      value={newPlan.valor_sessao}
                      onChange={(e) => setNewPlan({ ...newPlan, valor_sessao: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan_lucro">Margem da Clínica (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="plan_lucro" 
                    type="number"
                    max="100"
                    min="0"
                    className="pl-10"
                    value={newPlan.porcentagem_lucro}
                    onChange={(e) => setNewPlan({ ...newPlan, porcentagem_lucro: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); setSelectedPlan(null); }}>Cancelar</Button>
              <Button onClick={selectedPlan ? handleUpdatePlan : handleAddPlan} className="bg-accent">
                <Save className="h-4 w-4 mr-2" />
                {selectedPlan ? 'Salvar Alterações' : 'Criar Plano'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/5 border-b">
          <CardTitle className="font-headline text-xl">Tabela Financeira Ativa</CardTitle>
          <CardDescription>Valores atuais utilizados para novos agendamentos.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Operadora / Plano</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor Bruto</TableHead>
                <TableHead>Retenção Clínica (%)</TableHead>
                <TableHead>Líquido Clínica</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Handshake className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Nenhum plano configurado.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-bold text-primary">{plan.nome}</TableCell>
                    <TableCell>
                      <Badge variant={plan.tipo === 'particular' ? 'default' : 'secondary'} className="capitalize text-[10px]">
                        {plan.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">R$ {plan.valor_sessao?.toFixed(2)}</TableCell>
                    <TableCell>{plan.porcentagem_lucro}%</TableCell>
                    <TableCell className="text-emerald-600 font-black">
                      R$ {((plan.valor_sessao || 0) * ((plan.porcentagem_lucro || 0) / 100)).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openHistory(plan)}>
                        <History className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-accent" onClick={() => handleEditPlan(plan)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl flex items-center gap-2">
              <History className="h-6 w-6 text-primary" /> Histórico de Alterações
            </DialogTitle>
            <CardDescription>
              Log auditável de mudanças de valores para {selectedPlan?.nome}.
            </CardDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] mt-4 pr-4">
            <div className="space-y-4">
              {selectedPlan?.historico_precos?.slice().reverse().map((log, idx) => (
                <div key={idx} className="p-4 rounded-xl border bg-muted/5 space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      {format(new Date(log.data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    <Badge variant="outline" className="text-[9px] bg-background">Por: {log.usuario_nome}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground">Valor da Sessão</p>
                      <div className="flex items-center gap-2 font-medium">
                        <span className="line-through opacity-40">R$ {log.valor_anterior.toFixed(2)}</span>
                        <ArrowRight className="h-3 w-3 opacity-40" />
                        <span className="text-emerald-600 font-bold">R$ {log.valor_novo.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground">Margem Clínica</p>
                      <div className="flex items-center gap-2 font-medium">
                        <span className="line-through opacity-40">{log.lucro_anterior}%</span>
                        <ArrowRight className="h-3 w-3 opacity-40" />
                        <span className="text-primary font-bold">{log.lucro_novo}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {(!selectedPlan?.historico_precos || selectedPlan.historico_precos.length === 0) && (
                <p className="text-center py-12 text-muted-foreground italic text-sm">Nenhuma alteração registrada para este plano.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
