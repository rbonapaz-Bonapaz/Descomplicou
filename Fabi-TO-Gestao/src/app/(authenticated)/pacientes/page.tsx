
"use client"

import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Patient, HealthPlan } from '@/app/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Search, UserPlus, ClipboardList, Edit2, User, Camera, PlusCircle, Wallet, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { differenceInYears, parseISO } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function PacientesPage() {
  const { isGuest, isGestor, user, firebaseUser } = useAuth();
  const [pacientes, setPacientes] = useState<Patient[]>([]);
  const [convenios, setConvenios] = useState<HealthPlan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreditDialogOpen, setIsCreditDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [creditAmount, setCreditAmount] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [today, setToday] = useState('');
  
  useEffect(() => {
    setToday(new Date().toISOString().split('T')[0]);
  }, []);

  const initialPatientState: Partial<Patient> = {
    nome: '', 
    cpf: '', 
    genero: '',
    data_nascimento: '', 
    email: '', 
    telefone: '', 
    responsavel_nome: '',
    responsavel_parentesco: '', 
    convenio_id: 'particular', 
    endereco_cep: '',
    endereco_logradouro: '', 
    endereco_numero: '', 
    endereco_bairro: '',
    endereco_cidade: '', 
    endereco_estado: '', 
    queixa_principal: '',
    foto_url: '',
    saldo_creditos: 0
  };

  const [newPatient, setNewPatient] = useState<Partial<Patient>>(initialPatientState);
  const { toast } = useToast();

  useEffect(() => {
    if (isGuest || !db || !firebaseUser) {
      const saved = localStorage.getItem('demo_convenios');
      setConvenios(saved ? JSON.parse(saved) : []);
    } else {
      return onSnapshot(query(collection(db, 'convenios')), (snap) => {
        setConvenios(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HealthPlan[]);
      });
    }
  }, [isGuest, firebaseUser]);

  useEffect(() => {
    if (isGuest || !db || !firebaseUser) {
       const loadData = () => {
         setPacientes(JSON.parse(localStorage.getItem('demo_patients') || '[]'));
       };
       loadData();
       window.addEventListener('storage', loadData);
       return () => window.removeEventListener('storage', loadData);
    } else {
      return onSnapshot(query(collection(db, 'pacientes')), (snap) => {
        setPacientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Patient[]);
      });
    }
  }, [isGuest, firebaseUser]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewPatient({ ...newPatient, foto_url: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleSavePatient = async () => {
    if (!newPatient.nome || !newPatient.data_nascimento || !newPatient.telefone) {
      toast({ variant: 'destructive', title: 'Campos Obrigatórios' });
      return;
    }
    try {
      if (db && !isGuest) {
        if (editingId) await updateDoc(doc(db, 'pacientes', editingId), newPatient);
        else await addDoc(collection(db, 'pacientes'), { ...newPatient, historico_clinico: [], saldo_creditos: 0 });
      } else {
        let updated = editingId 
          ? pacientes.map(p => p.id === editingId ? { ...newPatient, id: p.id } as Patient : p) 
          : [...pacientes, { ...newPatient, id: Math.random().toString(36).substr(2,9), historico_clinico: [], saldo_creditos: 0 } as Patient];
        setPacientes(updated);
        localStorage.setItem('demo_patients', JSON.stringify(updated));
      }
      setIsDialogOpen(false);
      setEditingId(null);
      setNewPatient(initialPatientState);
      toast({ title: 'Sucesso' });
    } catch (e) { 
      toast({ variant: 'destructive', title: 'Erro ao salvar' }); 
    }
  };

  const handleAddCredits = async () => {
    if (!selectedPatient) return;
    try {
      if (db && !isGuest) {
        await updateDoc(doc(db, 'pacientes', selectedPatient.id), {
          saldo_creditos: increment(creditAmount)
        });
      } else {
        const updated = pacientes.map(p => p.id === selectedPatient.id ? { ...p, saldo_creditos: (p.saldo_creditos || 0) + creditAmount } : p);
        setPacientes(updated);
        localStorage.setItem('demo_patients', JSON.stringify(updated));
      }
      toast({ title: 'Créditos Adicionados' });
      setIsCreditDialogOpen(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro' });
    }
  };

  const handleDeletePatient = async (id: string) => {
    if (!isGestor && !user?.can_delete_data) {
      toast({ 
        variant: 'destructive', 
        title: "Acesso Negado", 
        description: "Você não tem permissão para excluir pacientes." 
      });
      return;
    }

    if (!confirm("Deseja excluir permanentemente este paciente e todo seu histórico?")) return;

    try {
      if (db && !isGuest) {
        await deleteDoc(doc(db, 'pacientes', id));
      } else {
        const updated = pacientes.filter(p => p.id !== id);
        setPacientes(updated);
        localStorage.setItem('demo_patients', JSON.stringify(updated));
      }
      toast({ title: "Paciente removido" });
    } catch (e) {
      toast({ variant: 'destructive', title: "Erro ao excluir" });
    }
  };

  const filtered = pacientes.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.cpf?.includes(searchTerm)
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-headline font-bold text-primary">Base de Pacientes</h1>
          <p className="text-[10px] font-black uppercase text-muted-foreground opacity-60 tracking-widest">Controle Clínico Central</p>
        </div>
        <Button className="bg-accent h-11 px-6 font-black uppercase tracking-widest shadow-lg rounded-xl" onClick={() => { setEditingId(null); setNewPatient(initialPatientState); setIsDialogOpen(true); }}>
          <UserPlus className="h-4 w-4 mr-2" /> Novo Cadastro
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl w-[95vw] rounded-[2rem] p-0 border-none shadow-2xl overflow-hidden">
          <ScrollArea className="max-h-[90vh]">
            <DialogHeader className="p-6 md:p-8 bg-muted/30 border-b">
              <DialogTitle className="text-xl md:text-2xl font-headline font-bold text-primary">{editingId ? 'Editar Prontuário' : 'Nova Ficha Digital'}</DialogTitle>
            </DialogHeader>
            
            <div className="p-6 md:p-8">
              <Tabs defaultValue="pessoal" className="w-full">
                <div className="overflow-x-auto pb-2 scrollbar-none">
                  <TabsList className="flex h-auto p-1 bg-[#E9EEF1] rounded-xl mb-6 shadow-inner w-max md:grid md:grid-cols-4 md:w-full">
                    <TabsTrigger value="pessoal" className="text-[8px] md:text-[9px] font-black uppercase tracking-widest rounded-lg data-[state=active]:bg-white py-2 px-6">Pessoal</TabsTrigger>
                    <TabsTrigger value="responsavel" className="text-[8px] md:text-[9px] font-black uppercase tracking-widest rounded-lg data-[state=active]:bg-white py-2 px-6">Responsável</TabsTrigger>
                    <TabsTrigger value="endereco" className="text-[8px] md:text-[9px] font-black uppercase tracking-widest rounded-lg data-[state=active]:bg-white py-2 px-6">Endereço</TabsTrigger>
                    <TabsTrigger value="clinico" className="text-[8px] md:text-[9px] font-black uppercase tracking-widest rounded-lg data-[state=active]:bg-white py-2 px-6">Clínico</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="pessoal" className="space-y-6">
                  <div className="flex flex-col items-center gap-6 mb-4">
                    <div className="relative">
                      <Avatar className="h-24 w-24 border-4 border-white shadow-md">
                        <AvatarImage src={newPatient.foto_url} className="object-cover" />
                        <AvatarFallback className="bg-primary/5 text-primary text-2xl font-black">{newPatient.nome?.charAt(0) || <User className="h-8 w-8" />}</AvatarFallback>
                      </Avatar>
                      <label htmlFor="p-photo" className="absolute bottom-0 right-0 h-8 w-8 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg"><Camera className="h-3.5 w-3.5" /><input type="file" id="p-photo" className="hidden" accept="image/*" onChange={handlePhotoChange} /></label>
                    </div>
                    <div className="w-full space-y-4">
                      <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Nome Completo</Label><Input className="h-11 rounded-xl" value={newPatient.nome} onChange={(e) => setNewPatient({ ...newPatient, nome: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Nascimento</Label><Input type="date" max={today} className="h-11 rounded-xl" value={newPatient.data_nascimento} onChange={(e) => setNewPatient({ ...newPatient, data_nascimento: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Gênero</Label>
                          <Select value={newPatient.genero} onValueChange={(v) => setNewPatient({ ...newPatient, genero: v })}>
                            <SelectTrigger className="h-11 rounded-xl">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Masculino">Masculino</SelectItem>
                              <SelectItem value="Feminino">Feminino</SelectItem>
                              <SelectItem value="Outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">CPF</Label><Input className="h-11 rounded-xl" value={newPatient.cpf} onChange={(e) => setNewPatient({ ...newPatient, cpf: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Telefone Principal</Label><Input className="h-11 rounded-xl" value={newPatient.telefone} onChange={(e) => setNewPatient({ ...newPatient, telefone: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase ml-1">Convênio / Plano</Label>
                    <Select value={newPatient.convenio_id} onValueChange={(v) => setNewPatient({ ...newPatient, convenio_id: v })}>
                      <SelectTrigger className="h-11 rounded-xl font-bold">
                        <SelectValue placeholder="Selecione o plano..." />
                      </SelectTrigger>
                      <SelectContent>
                        {convenios.map(c => (
                          <SelectItem key={c.id} value={c.id} className="font-bold">{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="responsavel" className="space-y-4">
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Nome do Responsável</Label><Input className="h-11 rounded-xl" value={newPatient.responsavel_nome} onChange={(e) => setNewPatient({ ...newPatient, responsavel_nome: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Grau de Parentesco</Label><Input className="h-11 rounded-xl" value={newPatient.responsavel_parentesco} onChange={(e) => setNewPatient({ ...newPatient, responsavel_parentesco: e.target.value })} /></div>
                </TabsContent>

                <TabsContent value="endereco" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">CEP</Label><Input className="h-11 rounded-xl" value={newPatient.endereco_cep} onChange={(e) => setNewPatient({ ...newPatient, endereco_cep: e.target.value })} /></div>
                    <div className="md:col-span-2 space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Logradouro</Label><Input className="h-11 rounded-xl" value={newPatient.endereco_logradouro} onChange={(e) => setNewPatient({ ...newPatient, endereco_logradouro: e.target.value })} /></div>
                  </div>
                </TabsContent>

                <TabsContent value="clinico" className="space-y-4">
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Queixa Principal</Label><Textarea className="min-h-[120px] rounded-xl" value={newPatient.queixa_principal} onChange={(e) => setNewPatient({ ...newPatient, queixa_principal: e.target.value })} /></div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className="p-6 bg-muted/10 border-t flex flex-col md:flex-row gap-3">
              <button onClick={() => setIsDialogOpen(false)} className="h-12 font-black uppercase text-[10px] tracking-widest text-slate-600 hover:text-primary transition-all flex-1">CANCELAR</button>
              <Button onClick={handleSavePatient} className="bg-primary h-12 font-black uppercase text-[10px] tracking-widest flex-[2]">Salvar Ficha</Button>
            </DialogFooter>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreditDialogOpen} onOpenChange={setIsCreditDialogOpen}>
        <DialogContent className="max-w-sm w-[90vw] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl text-primary">Gerar Pacote de Créditos</DialogTitle>
            <DialogDescription>Adicione sessões pré-pagas ao paciente {selectedPatient?.nome}.</DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4 text-center">
             <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">Sessões a adicionar</p>
                <div className="flex items-center justify-center gap-6">
                   <Button variant="outline" size="icon" className="rounded-full h-10 w-10 border-primary/20" onClick={() => setCreditAmount(Math.max(1, creditAmount - 1))}>
                     <Trash2 className="h-4 w-4" />
                   </Button>
                   <span className="text-5xl font-black text-primary">{creditAmount}</span>
                   <Button variant="outline" size="icon" className="rounded-full h-10 w-10 border-primary/20" onClick={() => setCreditAmount(creditAmount + 1)}>
                     <PlusCircle className="h-4 w-4" />
                   </Button>
                </div>
             </div>
             <p className="text-[10px] text-muted-foreground italic font-medium">Os créditos serão abatidos automaticamente na recepção.</p>
          </div>
          <DialogFooter>
            <Button className="w-full bg-primary h-12 rounded-xl font-black uppercase tracking-widest shadow-lg" onClick={handleAddCredits}>Confirmar Pacote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-[2rem] overflow-hidden border-none ring-1 ring-border shadow-xl bg-white/80 backdrop-blur-xl">
        <CardHeader className="p-5 md:p-8 border-b bg-muted/5 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou CPF..." className="h-12 pl-12 rounded-full bg-white border-none shadow-md" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <Badge variant="outline" className="h-9 px-4 rounded-full font-black text-primary border-primary/20 text-[9px]">{filtered.length} Pacientes</Badge>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[700px]">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-none">
                  <TableHead className="pl-8 text-[9px] uppercase font-black h-12">Identificação</TableHead>
                  <TableHead className="text-[9px] uppercase font-black h-12">Perfil & Créditos</TableHead>
                  <TableHead className="text-[9px] uppercase font-black h-12">Convênio</TableHead>
                  <TableHead className="text-right pr-8 text-[9px] uppercase font-black h-12">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className="hover:bg-primary/[0.01] border-primary/5 group">
                    <TableCell className="pl-8 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm shrink-0">
                          <AvatarImage src={p.foto_url} className="object-cover" />
                          <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-black">{p.nome.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="font-black text-primary text-sm truncate">{p.nome}</span>
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">{p.cpf || 'Sem CPF'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-600 text-xs">{p.data_nascimento ? differenceInYears(new Date(), parseISO(p.data_nascimento)) : '-'} anos</span>
                        <div className="flex items-center gap-2">
                           <Badge variant="outline" className={cn("text-[7px] font-black uppercase px-2 py-0.5", (p.saldo_creditos || 0) > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100")}>
                              {p.saldo_creditos || 0} Créditos
                           </Badge>
                           <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-primary hover:bg-primary/5" onClick={() => { setSelectedPatient(p); setIsCreditDialogOpen(true); }}>
                              <Wallet className="h-3 w-3" />
                           </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-[#E9EEF1] text-primary border-none font-bold text-[8px] uppercase">{convenios.find(c => c.id === p.convenio_id)?.nome || 'Particular'}</Badge>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-primary" onClick={() => { setEditingId(p.id); setNewPatient(p); setIsDialogOpen(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Link href={`/pacientes/prontuario/?id=${p.id}`}>
                          <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg font-black uppercase text-[8px] tracking-widest border-primary/10">
                            <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Prontuário
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-rose-500 hover:bg-rose-50" onClick={() => handleDeletePatient(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
