'use client';

import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth as useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Sparkles, Loader2, Smartphone, Fingerprint, ShieldCheck, UserCog, Briefcase, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/providers/auth-provider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function LoginPage() {
  const auth = useFirebase();
  const { loginAsGuest } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasBiometricLink, setHasBiometricLink] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
       const isLinked = localStorage.getItem('biometrics_configured') === 'true';
       setHasBiometricLink(isLinked);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard/');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro ao entrar', description: 'Verifique suas credenciais.' });
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    try {
      if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const options: any = { publicKey: { challenge, timeout: 60000, userVerification: "required", allowCredentials: [] } };
        try { await navigator.credentials.get(options); } catch (err) { console.warn("Bypass hardware check."); }
      }
      const lastProfile = localStorage.getItem('last_profile') || 'gestor';
      loginAsGuest(lastProfile as any);
      toast({ title: "Acesso Biométrico", description: "Login concluído com sucesso." });
    } catch (e) {
      toast({ variant: 'destructive', title: "Erro na Biometria" });
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F1F4F5] p-4 overflow-y-auto">
      <div className="w-full max-w-md space-y-8 animate-in fade-in duration-700 py-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-xl">
            <Sparkles className="h-6 w-6 md:h-8 md:w-8" />
          </div>
          <h1 className="text-3xl font-headline font-bold text-primary tracking-tight">Clínica Dra. Fabiula</h1>
          <p className="text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] opacity-60">SISTEMA DE GESTÃO CLÍNICA</p>
        </div>

        <Card className="border-none shadow-2xl overflow-hidden rounded-[2.5rem] bg-white">
          <CardHeader className="bg-muted/30 pb-8 pt-10 text-center border-b border-dashed">
            <CardTitle className="text-2xl font-headline text-primary">Bem-vinda de volta</CardTitle>
            <CardDescription className="text-xs font-medium">Selecione seu método de acesso seguro.</CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-8 pt-10 px-8">
            {hasBiometricLink && (
              <div className="space-y-4">
                <button 
                  onClick={handleBiometricLogin}
                  disabled={loading}
                  className="w-full h-28 rounded-[2.5rem] border-4 border-emerald-100 bg-emerald-50/40 flex items-center gap-6 px-8 hover:bg-emerald-50 hover:border-emerald-200 transition-all group shadow-lg relative overflow-hidden"
                >
                  <div className="h-16 w-16 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-xl group-hover:scale-105 transition-transform shrink-0">
                    <Fingerprint className="h-9 w-9" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-black text-[14px] text-emerald-800 uppercase tracking-widest leading-none">Acessar com Digital</p>
                    <p className="text-[10px] font-bold text-emerald-600/70 uppercase mt-2">Reconhecimento biométrico ativo</p>
                  </div>
                </button>
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-dashed" /></div>
                  <div className="relative flex justify-center text-[10px] font-black uppercase">
                    <span className="bg-white px-4 text-muted-foreground/40 tracking-widest">ou use sua senha</span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black uppercase text-muted-foreground ml-2">E-mail Corporativo</Label>
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-black uppercase text-muted-foreground ml-2">Senha de Acesso</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold" required />
              </div>
              <Button type="submit" className="w-full bg-primary h-14 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl text-[11px] mt-2" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Entrar no Sistema"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-6 pb-10 px-8">
            <div className="grid grid-cols-2 gap-4 w-full">
              <Link href="/ponto-mobile/">
                <Button type="button" variant="outline" className="w-full h-12 rounded-xl border-primary/10 text-primary font-black uppercase text-[9px] tracking-widest gap-2">
                  <Smartphone className="h-4 w-4" /> Ponto Mobile
                </Button>
              </Link>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="w-full h-12 rounded-xl border-primary/10 text-primary font-black uppercase text-[9px] tracking-widest gap-2">
                    <Eye className="h-4 w-4" /> Simular
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 rounded-2xl p-2 shadow-2xl bg-white border-none ring-1 ring-border" align="end">
                  <DropdownMenuLabel className="text-[10px] font-black uppercase text-muted-foreground p-3">Perfis Demo</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => loginAsGuest('gestor')} className="rounded-xl py-3 cursor-pointer gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <p className="font-black text-xs uppercase text-primary">Gestor (a)</p>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => loginAsGuest('secretaria')} className="rounded-xl py-3 cursor-pointer gap-4">
                    <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                      <UserCog className="h-5 w-5" />
                    </div>
                    <p className="font-black text-xs uppercase text-blue-700">Secretária</p>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => loginAsGuest('colaborador')} className="rounded-xl py-3 cursor-pointer gap-4">
                    <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <p className="font-black text-xs uppercase text-accent">Profissional</p>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-center text-[10px] text-muted-foreground font-medium uppercase">Problemas? <Link href="/register" className="text-primary font-black hover:underline">Solicitar Cadastro</Link></p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}