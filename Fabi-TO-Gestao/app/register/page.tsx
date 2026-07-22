
"use client"

import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Sparkles, Loader2, ArrowLeft, ShieldCheck, UserCog, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/app/lib/types';

export default function RegisterPage() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [perfil, setPerfil] = useState<UserProfile>('visitante');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !db) {
      toast({
        variant: 'destructive',
        title: 'Erro de Configuração',
        description: 'O sistema não conseguiu conectar ao Firebase.',
      });
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'usuarios', user.uid), {
        uid: user.uid,
        nome,
        email,
        cpf,
        telefone,
        perfil: perfil,
        data_cadastro: new Date().toISOString()
      });

      toast({
        title: 'Conta criada!',
        description: perfil === 'visitante' 
          ? 'Seu cadastro foi enviado para aprovação do(a) Gestor (a).' 
          : `Bem-vinda ao sistema como ${perfil === 'gestor' ? 'Gestor (a)' : 'Secretário(a)'}.`,
      });
      
      router.push('/dashboard/');
    } catch (error: any) {
      let msg = 'Verifique sua conexão e tente novamente.';
      if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail já está em uso.';
      if (error.code === 'auth/weak-password') msg = 'A senha deve ter pelo menos 6 caracteres.';
      
      toast({
        variant: 'destructive',
        title: 'Erro ao cadastrar',
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 text-slate-900">
      <div className="w-full max-w-md space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-xl">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-headline font-bold text-primary tracking-tight">Clínica Fabiula Oliveira</h1>
          <p className="text-muted-foreground font-medium text-sm uppercase tracking-widest">Crie sua conta clínica</p>
        </div>

        <Card className="border-border shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="bg-muted/30 pb-8">
            <div className="flex items-center gap-2 mb-2">
              <Link href="/login/" className="text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <CardTitle className="text-2xl font-headline text-primary">Novo Cadastro</CardTitle>
            </div>
            <CardDescription>Escolha seu perfil e preencha os dados abaixo.</CardDescription>
          </CardHeader>
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-6 pt-8">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Perfil de Acesso</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setPerfil('visitante')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                      perfil === 'visitante' 
                        ? "border-primary bg-primary/5 text-primary shadow-inner" 
                        : "border-muted bg-white text-muted-foreground hover:border-muted-foreground/30"
                    )}
                  >
                    <Clock className="h-5 w-5" />
                    <span className="text-[9px] font-black uppercase">Colaborador (a)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerfil('secretaria')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                      perfil === 'secretaria' 
                        ? "border-primary bg-primary/5 text-primary shadow-inner" 
                        : "border-muted bg-white text-muted-foreground hover:border-muted-foreground/30"
                    )}
                  >
                    <UserCog className="h-5 w-5" />
                    <span className="text-[9px] font-black uppercase">Secretário(a)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerfil('gestor')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                      perfil === 'gestor' 
                        ? "border-accent bg-accent/5 text-accent shadow-inner" 
                        : "border-muted bg-white text-muted-foreground hover:border-muted-foreground/30"
                    )}
                  >
                    <ShieldCheck className="h-5 w-5" />
                    <span className="text-[9px] font-black uppercase">Gestor (a)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome" className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Nome Completo</Label>
                <Input id="nome" placeholder="Seu nome" className="h-12 rounded-xl border-muted" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cpf" className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">CPF</Label>
                  <Input id="cpf" placeholder="000.000.000-00" className="h-12 rounded-xl border-muted" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone" className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Telefone</Label>
                  <Input id="telefone" placeholder="(00) 00000-0000" className="h-12 rounded-xl border-muted" value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">E-mail Profissional</Label>
                <Input id="email" type="email" placeholder="exemplo@clinica.com" className="h-12 rounded-xl border-muted" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Senha de Acesso</Label>
                <Input id="password" type="password" placeholder="Mínimo 6 caracteres" className="h-12 rounded-xl border-muted" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pb-10">
              <Button type="submit" className="w-full bg-primary h-14 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] transition-transform" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Finalizar Cadastro
              </Button>
              <div className="text-center text-sm pt-2">
                <span className="text-muted-foreground font-medium">Já possui acesso? </span>
                <Link href="/login/" className="text-primary font-bold hover:underline">
                  Entrar aqui
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
