
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, Break, VinculoTipo } from '@/app/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  UserCog, 
  ShieldCheck, 
  Settings2,
  Wallet,
  Check,
  Palette,
  Plus,
  Trash2,
  UserCheck,
  Repeat,
  HelpCircle,
  Briefcase,
  Users,
  Layout,
  Lock,
  Key,
  TrendingUp,
  CircleDollarSign,
  BriefcaseBusiness,
  DollarSign,
  CalendarDays,
  Stethoscope,
  Paintbrush,
  MapPin,
  Globe,
  Phone,
  ShieldAlert
} from 'lucide-react';
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
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export default function EquipeRHPage() {
  const { isGestor, loading: authLoading, isGuest } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading || !isGestor) return;
    if (isGuest) {
      setUsers([
        { uid: '1', nome: 'Dra. Fabiula Oliveira', email: 'fabi@demo.com', perfil: 'gestor', vinculo: 'proprietario', pro_labore: 10000, role_gestor: true, role_profissional: true, possui_agenda: true, area_atuacao: 'Terapia Ocupacional', cor_agenda: '#4F6D7A', can_delete_data: true },
        { uid: '2', nome: 'Rodrigo Turra Bonapaz', email: 'rodrigo@demo.com', perfil: 'gestor', vinculo: 'proprietario', pro_labore: 10000, role_gestor: true, role_profissional: false, possui_agenda: false, area_atuacao: 'Gestão Clínica', cor_agenda: '#f43f5e', can_delete_data: true },
        { uid: '3', nome: 'Beatriz Secretaria', email: 'beatriz@demo.com', perfil: 'secretaria', vinculo: 'clt', salario_base: 2500, role_gestor: false, role_profissional: false, role_secretaria: true, medicos_gerenciados: ['1'], can_delete_data: false },
      ]);
      setLoading(false);
      return;
    }
    if (!db) return;
    const q = query(collection(db, 'usuarios'));
    return onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ ...doc.data() } as User)));
      setLoading(false);
    });
  }, [isGuest, authLoading, isGestor]);

  const handleUpdateUser = async (userId: string, data: Partial<User>) => {
    try {
      if (db && !isGuest) {
        await updateDoc(doc(db, 'usuarios', userId), data);
      } else {
        setUsers(prev => prev.map(u => u.uid === userId ? { ...u, ...data } : u));
      }
      toast({ title: 'Configurações Atualizadas' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar' });
    }
  };

  const handleOpenConfig = (user: User) => {
    setSelectedUser({ 
      ...user,
      vinculo: user.vinculo || 'parceiro',
      salario_base: user.salario_base || 0,
      pro_labore: user.pro_labore || 0,
      role_gestor: user.role_gestor ?? (user.perfil === 'gestor'),
      role_secretaria: user.role_secretaria ?? (user.perfil === 'secretaria'),
      role_profissional: user.role_profissional ?? (user.perfil === 'colaborador' || user.possui_agenda),
      repasse_tipo: user.repasse_tipo || 'percentual',
      repasse_valor: user.repasse_valor || 0,
      cobranca_tipo: user.cobranca_tipo || 'fixo',
      cobranca_valor: user.cobranca_valor || 0,
      destino_pagamento: user.destino_pagamento || 'clinica',
      medicos_gerenciados: user.medicos_gerenciados || [],
      possui_agenda: user.possui_agenda || false,
      area_atuacao: user.area_atuacao || '',
      cor_agenda: user.cor_agenda || '#4F6D7A',
      matricula: user.matricula || '',
      superior: user.superior || '',
      departamento: user.departamento || '',
      data_admissao: user.data_admissao || '',
      cpf: user.cpf || '',
      data_nascimento: user.data_nascimento || '',
      genero: user.genero || '',
      telefone: user.telefone || '',
      endereco_cep: user.endereco_cep || '',
      endereco_logradouro: user.endereco_logradouro || '',
      endereco_numero: user.endereco_numero || '',
      endereco_cidade: user.endereco_cidade || '',
      endereco_estado: user.endereco_estado || '',
      can_delete_data: user.can_delete_data || false
    });
    setIsConfigOpen(true);
  };

  const handleSaveConfig = () => {
    if (selectedUser) {
      handleUpdateUser(selectedUser.uid, selectedUser);
      setIsConfigOpen(false);
    }
  };

  if (authLoading || loading) return <div className="p-12 text-center text-xs font-black uppercase animate-pulse">Carregando Gestão de Equipe...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 px-1 md:px-4 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div>
          <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary flex items-center gap-4">
            <UserCog className="h-10 w-10 text-accent" /> Gestão de Colaboradores
          </h1>
          <p className="text-muted-foreground text-sm uppercase font-black tracking-widest opacity-60 ml-1">Vínculos Contábeis, Multifunções e Acessos</p>
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none ring-1 ring-border shadow-2xl overflow-hidden bg-white/70 backdrop-blur-xl">
        <CardHeader className="p-6 md:p-8 border-b bg-muted/5">
          <CardTitle className="font-headline text-2xl">Equipe Habilitada</CardTitle>
          <CardDescription className="text-xs font-bold uppercase tracking-wider">Estrutura de Contratos e Permissões Administrativas</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto scrollbar-none">
          <Table className="min-w-[800px]">
            <TableHeader className="bg-muted/30">
              <TableRow className="border-none">
                <TableHead className="pl-10 text-[10px] uppercase font-black tracking-widest h-16">Colaborador</TableHead>
                <TableHead className="text-[10px] uppercase font-black tracking-widest h-16 text-center">Vínculo</TableHead>
                <TableHead className="text-[10px] uppercase font-black tracking-widest h-16 text-center">Funções</TableHead>
                <TableHead className="text-right pr-10 text-[10px] uppercase font-black tracking-widest h-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.uid} className="hover:bg-primary/[0.02] border-primary/5 transition-all">
                  <TableCell className="pl-10 py-6">
                    <div className="flex items-center gap-5">
                      <div 
                        className="h-12 w-12 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-md shrink-0"
                        style={{ backgroundColor: u.cor_agenda || 'hsl(var(--primary))' }}
                      >
                        {u.nome?.charAt(0) || 'U'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-primary text-base uppercase tracking-tight truncate">{u.nome}</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 truncate">{u.area_atuacao || 'Administrativo'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">
                      {u.vinculo || 'Não definido'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-wrap justify-center gap-1.5 max-w-[200px] mx-auto">
                      {u.role_gestor && <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase">Gestor</Badge>}
                      {u.role_profissional && <Badge className="bg-accent/10 text-accent border-none text-[8px] font-black uppercase">Médico/TO</Badge>}
                      {u.role_secretaria && <Badge className="bg-blue-100 text-blue-700 border-none text-[8px] font-black uppercase">Secretaria</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-10">
                    <Button 
                      variant="ghost" 
                      onClick={() => handleOpenConfig(u)}
                      className="h-12 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-primary/5 text-primary gap-2"
                    >
                      <Settings2 className="h-4 w-4" /> Gestão RH
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="max-w-5xl w-[95vw] rounded-[2.5rem] md:rounded-[3rem] p-0 border-none shadow-3xl overflow-hidden bg-white">
          <DialogHeader className="p-6 md:p-8 bg-primary text-white">
            <DialogTitle className="text-xl md:text-2xl font-headline flex items-center gap-3">
              <UserCog className="h-6 w-6 text-accent" /> Painel de Vínculo: {selectedUser?.nome}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="vinculo" className="w-full">
            <div className="px-4 md:px-8 pt-4 bg-muted/30 border-b overflow-x-auto scrollbar-none">
              <TabsList className="bg-slate-200/50 p-1 rounded-xl h-11 md:h-12 shadow-inner w-max md:w-full flex flex-nowrap md:grid md:grid-cols-5">
                <TabsTrigger value="vinculo" className="px-6 font-black uppercase text-[8px] md:text-[9px] tracking-widest rounded-lg data-[state=active]:bg-white shrink-0">Contrato</TabsTrigger>
                <TabsTrigger value="ficha" className="px-6 font-black uppercase text-[8px] md:text-[9px] tracking-widest rounded-lg data-[state=active]:bg-white shrink-0">Ficha</TabsTrigger>
                <TabsTrigger value="funcoes" className="px-6 font-black uppercase text-[8px] md:text-[9px] tracking-widest rounded-lg data-[state=active]:bg-white shrink-0">Funções</TabsTrigger>
                <TabsTrigger value="acessos" className="px-6 font-black uppercase text-[8px] md:text-[9px] tracking-widest rounded-lg data-[state=active]:bg-white shrink-0">Acessos</TabsTrigger>
                <TabsTrigger value="operacional" className="px-6 font-black uppercase text-[8px] md:text-[9px] tracking-widest rounded-lg data-[state=active]:bg-white shrink-0">Agenda</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="max-h-[60vh] md:max-h-[75vh]">
              <div className="p-6 md:p-8">
                <TabsContent value="vinculo" className="space-y-10 mt-0 animate-in fade-in slide-in-from-left-4">
                  <div className="space-y-6">
                    <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Tipo de Vínculo Profissional (DRE)</Label>
                    <RadioGroup 
                      value={selectedUser?.vinculo || 'parceiro'} 
                      onValueChange={(val: any) => setSelectedUser({...selectedUser!, vinculo: val})}
                      className="grid grid-cols-1 md:grid-cols-3 gap-4"
                    >
                      <div className={cn("flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all cursor-pointer", selectedUser?.vinculo === 'proprietario' ? "border-primary bg-primary/5 shadow-inner" : "border-slate-100")} onClick={() => setSelectedUser({...selectedUser!, vinculo: 'proprietario'})}>
                        <RadioGroupItem value="proprietario" id="v-prop" className="sr-only" />
                        <ShieldCheck className={cn("h-8 w-8", selectedUser?.vinculo === 'proprietario' ? "text-primary" : "text-slate-300")} />
                        <Label htmlFor="v-prop" className="font-black text-[10px] uppercase cursor-pointer">Sócio / Proprietário</Label>
                      </div>
                      <div className={cn("flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all cursor-pointer", selectedUser?.vinculo === 'clt' ? "border-primary bg-primary/5 shadow-inner" : "border-slate-100")} onClick={() => setSelectedUser({...selectedUser!, vinculo: 'clt'})}>
                        <RadioGroupItem value="clt" id="v-clt" className="sr-only" />
                        <BriefcaseBusiness className={cn("h-8 w-8", selectedUser?.vinculo === 'clt' ? "text-primary" : "text-slate-300")} />
                        <Label htmlFor="v-clt" className="font-black text-[10px] uppercase cursor-pointer">Colaborador (CLT/Fixo)</Label>
                      </div>
                      <div className={cn("flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all cursor-pointer", selectedUser?.vinculo === 'parceiro' ? "border-primary bg-primary/5 shadow-inner" : "border-slate-100")} onClick={() => setSelectedUser({...selectedUser!, vinculo: 'parceiro'})}>
                        <RadioGroupItem value="parceiro" id="v-parc" className="sr-only" />
                        <Users className={cn("h-8 w-8", selectedUser?.vinculo === 'parceiro' ? "text-primary" : "text-slate-300")} />
                        <Label htmlFor="v-parc" className="font-black text-[10px] uppercase cursor-pointer">Profissional Parceiro</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-dashed">
                    {selectedUser?.vinculo === 'proprietario' && (
                      <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground">Valor Pró-labore Mensal (R$)</Label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-emerald-600">R$</div>
                          <Input type="number" className="h-14 pl-12 rounded-2xl bg-slate-50 border-none font-black text-xl" value={selectedUser?.pro_labore || 0} onChange={e => setSelectedUser({...selectedUser!, pro_labore: Number(e.target.value)})} />
                        </div>
                      </div>
                    )}
                    {selectedUser?.vinculo === 'clt' && (
                      <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground">Salário Base Mensal (R$)</Label>
                        <div className="relative">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-emerald-600">R$</div>
                          <Input type="number" className="h-14 pl-12 rounded-2xl bg-slate-50 border-none font-black text-xl" value={selectedUser?.salario_base || 0} onChange={e => setSelectedUser({...selectedUser!, salario_base: Number(e.target.value)})} />
                        </div>
                      </div>
                    )}
                    
                    {selectedUser?.vinculo === 'parceiro' && (
                       <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 bg-emerald-50/20 p-6 md:p-8 rounded-3xl border-2 border-dashed border-emerald-100">
                          <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase text-emerald-800">Repasse Clínica (R$ ou %)</Label>
                            <div className="flex items-center gap-3">
                               <Select value={selectedUser?.repasse_tipo || 'percentual'} onValueChange={v => setSelectedUser({...selectedUser!, repasse_tipo: v as any})}>
                                  <SelectTrigger className="w-24 h-11 bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="percentual">%</SelectItem><SelectItem value="fixo">R$</SelectItem></SelectContent>
                               </Select>
                               <Input type="number" className="h-11 bg-white border-none shadow-sm font-bold" value={selectedUser?.repasse_valor || 0} onChange={e => setSelectedUser({...selectedUser!, repasse_valor: Number(e.target.value)})} />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase text-emerald-800">Taxa de Estrutura (R$ ou %)</Label>
                            <div className="flex items-center gap-3">
                               <Select value={selectedUser?.cobranca_tipo || 'fixo'} onValueChange={v => setSelectedUser({...selectedUser!, cobranca_tipo: v as any})}>
                                  <SelectTrigger className="w-24 h-11 bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="percentual">%</SelectItem><SelectItem value="fixo">R$</SelectItem></SelectContent>
                               </Select>
                               <Input type="number" className="h-11 bg-white border-none shadow-sm font-bold" value={selectedUser?.cobranca_valor || 0} onChange={e => setSelectedUser({...selectedUser!, cobranca_valor: Number(e.target.value)})} />
                            </div>
                          </div>
                       </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="ficha" className="space-y-8 mt-0 animate-in fade-in slide-in-from-right-4">
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Matrícula</Label><Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={selectedUser?.matricula || ''} onChange={e => setSelectedUser({...selectedUser!, matricula: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Superior Imediato</Label><Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={selectedUser?.superior || ''} onChange={e => setSelectedUser({...selectedUser!, superior: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Departamento</Label><Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={selectedUser?.departamento || ''} onChange={e => setSelectedUser({...selectedUser!, departamento: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Admissão</Label><Input type="date" className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={selectedUser?.data_admissao || ''} onChange={e => setSelectedUser({...selectedUser!, data_admissao: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">CPF</Label><Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={selectedUser?.cpf || ''} onChange={e => setSelectedUser({...selectedUser!, cpf: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">Nascimento</Label><Input type="date" className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={selectedUser?.data_nascimento || ''} onChange={e => setSelectedUser({...selectedUser!, data_nascimento: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase ml-1">WhatsApp</Label><Input className="h-11 rounded-xl bg-slate-50 border-none font-bold" value={selectedUser?.telefone || ''} onChange={e => setSelectedUser({...selectedUser!, telefone: e.target.value})} /></div>
                   </div>
                </TabsContent>

                <TabsContent value="funcoes" className="space-y-8 mt-0 animate-in fade-in slide-in-from-right-4">
                   <div className="space-y-6">
                      <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Habilitação de Funções</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                         {[
                           { id: 'role_gestor', label: 'Gestor (Acesso Total)', icon: ShieldCheck },
                           { id: 'role_profissional', label: 'Profissional / Médico', icon: Stethoscope },
                           { id: 'role_secretaria', label: 'Secretário(a) / Recepção', icon: UserCheck }
                         ].map(role => (
                           <div key={role.id} className={cn("flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all cursor-pointer", selectedUser?.[role.id as keyof User] ? "border-primary bg-primary/5" : "border-slate-50")} onClick={() => setSelectedUser({...selectedUser!, [role.id]: !selectedUser?.[role.id as keyof User]})}>
                              <role.icon className={cn("h-7 w-7", selectedUser?.[role.id as keyof User] ? "text-primary" : "text-slate-200")} />
                              <span className="text-[10px] font-black uppercase text-center">{role.label}</span>
                              <Checkbox checked={!!selectedUser?.[role.id as keyof User]} onCheckedChange={() => {}} />
                           </div>
                         ))}
                      </div>
                   </div>
                </TabsContent>

                <TabsContent value="acessos" className="space-y-8 mt-0 animate-in fade-in zoom-in-95">
                   <div className="space-y-6">
                      <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Módulos do Sistema</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { id: 'access_recepcao', label: 'Módulo Recepção & Caixa', icon: UserCheck },
                          { id: 'access_agenda', label: 'Agenda Operacional Completa', icon: CalendarDays },
                          { id: 'access_pacientes', label: 'Base de Pacientes & Prontuários', icon: Users },
                          { id: 'access_financeiro', label: 'Relatórios Financeiros & DRE', icon: Wallet },
                          { id: 'access_inteligencia', label: 'BI & Inteligência de Negócio', icon: TrendingUp },
                          { id: 'access_rh', label: 'Gestão de RH & Equipe', icon: UserCog },
                          { id: 'access_configuracoes', label: 'Ajustes Globais de Sistema', icon: Settings2 }
                        ].map(mod => (
                          <div key={mod.id} className="flex items-center justify-between p-4 md:p-5 bg-slate-50 rounded-2xl border hover:border-primary/20 transition-colors">
                             <div className="flex items-center gap-4 min-w-0">
                                <mod.icon className="h-5 w-5 text-primary shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-700 truncate">{mod.label}</span>
                             </div>
                             <Switch 
                               checked={!!selectedUser?.[mod.id as keyof User]} 
                               onCheckedChange={val => setSelectedUser({...selectedUser!, [mod.id]: val})} 
                             />
                          </div>
                        ))}
                      </div>
                   </div>

                   <div className="space-y-6 pt-8 border-t border-dashed">
                      <Label className="text-[10px] font-black uppercase text-rose-600 tracking-widest">Ações Críticas</Label>
                      <div className="flex items-center justify-between p-6 bg-rose-50/20 rounded-3xl border-2 border-dashed border-rose-100">
                         <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                               <Trash2 className="h-5 w-5" />
                            </div>
                            <div className="space-y-0.5">
                               <p className="text-sm font-black text-rose-800 uppercase">Excluir Registros</p>
                               <p className="text-[10px] font-bold text-rose-600/60 uppercase leading-tight">Permitir exclusão definitiva de agendamentos, pacientes e lançamentos financeiros.</p>
                            </div>
                         </div>
                         <Switch 
                           checked={!!selectedUser?.can_delete_data} 
                           onCheckedChange={val => setSelectedUser({...selectedUser!, can_delete_data: val})} 
                         />
                      </div>
                   </div>
                </TabsContent>

                <TabsContent value="operacional" className="space-y-8 mt-0 animate-in fade-in slide-in-from-bottom-4">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <Card className="rounded-3xl border-none ring-1 ring-border p-6 bg-slate-50/50">
                         <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                               <CalendarDays className="h-5 w-5 text-primary" />
                               <Label className="text-[10px] font-black uppercase tracking-widest">Habilitar Agenda Própria</Label>
                            </div>
                            <Switch checked={selectedUser?.possui_agenda || false} onCheckedChange={val => setSelectedUser({...selectedUser!, possui_agenda: val})} />
                         </div>

                         {selectedUser?.possui_agenda && (
                           <div className="space-y-4 animate-in fade-in zoom-in-95">
                              <div className="space-y-1.5">
                                 <Label className="text-[9px] font-black uppercase ml-1">Área de Atuação</Label>
                                 <Input className="h-11 rounded-xl bg-white border-none shadow-sm" value={selectedUser?.area_atuacao || ''} onChange={e => setSelectedUser({...selectedUser!, area_atuacao: e.target.value})} placeholder="Ex: Terapia Ocupacional" />
                              </div>
                              <div className="space-y-1.5">
                                 <Label className="text-[9px] font-black uppercase ml-1">Cor na Agenda</Label>
                                 <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl shadow-sm shrink-0 border" style={{ backgroundColor: selectedUser?.cor_agenda || '#4F6D7A' }} />
                                    <Input type="color" className="h-10 p-1 rounded-xl w-full border-none cursor-pointer" value={selectedUser?.cor_agenda || '#4F6D7A'} onChange={e => setSelectedUser({...selectedUser!, cor_agenda: e.target.value})} />
                                 </div>
                              </div>
                           </div>
                         )}
                      </Card>

                      {selectedUser?.role_secretaria && (
                        <Card className="rounded-3xl border-none ring-1 ring-border p-6 bg-blue-50/30">
                           <div className="flex items-center gap-3 mb-4">
                              <UserCheck className="h-5 w-5 text-blue-600" />
                              <Label className="text-[10px] font-black uppercase tracking-widest text-blue-800">Médicos sob Gestão</Label>
                           </div>
                           <p className="text-[9px] font-bold text-blue-600/70 mb-4 uppercase">Selecione quais agendas podem ser gerenciadas.</p>
                           <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                              {users.filter(u => u.possui_agenda && u.uid !== selectedUser?.uid).map(doc => (
                                <div key={doc.uid} className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-blue-100">
                                   <Checkbox 
                                     id={`managed-${doc.uid}`}
                                     checked={selectedUser?.medicos_gerenciados?.includes(doc.uid)} 
                                     onCheckedChange={(val) => {
                                       const list = selectedUser?.medicos_gerenciados || [];
                                       const newList = val ? [...list, doc.uid] : list.filter(id => id !== doc.uid);
                                       setSelectedUser({...selectedUser!, medicos_gerenciados: newList});
                                     }}
                                   />
                                   <Label htmlFor={`managed-${doc.uid}`} className="text-xs font-bold text-slate-700 cursor-pointer truncate">{doc.nome}</Label>
                                </div>
                              ))}
                           </div>
                        </Card>
                      )}
                   </div>
                </TabsContent>
              </div>
            </ScrollArea>

            <DialogFooter className="p-6 md:p-8 bg-slate-50 border-t gap-3 flex flex-col md:flex-row">
              <Button variant="ghost" className="font-black uppercase text-[10px] h-12 md:h-14 flex-1" onClick={() => setIsConfigOpen(false)}>Cancelar</Button>
              <Button className="bg-primary h-12 md:h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex-[2] hover:scale-[1.02] transition-transform" onClick={handleSaveConfig}>
                Confirmar Alterações
              </Button>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
