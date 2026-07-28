'use client';

import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth as useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Sparkles, Loader2, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const auth = useFirebase();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // O destino depende dos papéis no token; o AuthProvider redireciona
      // assim que a identidade carrega.
      router.push('/dashboard/');
    } catch {
      // Mensagem propositalmente genérica: dizer "este e-mail não existe" entrega
      // a quem sonda quais contas são válidas.
      toast({
        variant: 'destructive',
        title: 'Não foi possível entrar',
        description: 'E-mail ou senha incorretos.',
      });
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
          <h1 className="text-3xl font-headline font-bold text-primary tracking-tight">Prontta</h1>
          <p className="text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] opacity-60">GESTÃO CLÍNICA DESCOMPLICADA</p>
        </div>

        <Card className="border-none shadow-2xl overflow-hidden rounded-[2.5rem] bg-white">
          <CardHeader className="bg-muted/30 pb-8 pt-10 text-center border-b border-dashed">
            <CardTitle className="text-2xl font-headline text-primary">Bem-vindo de volta</CardTitle>
            <CardDescription className="text-xs font-medium">Entre com seus dados de acesso.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-8 pt-10 px-8">
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
            <Link href="/ponto-mobile/" className="w-full">
              <Button type="button" variant="outline" className="w-full h-12 rounded-xl border-primary/10 text-primary font-black uppercase text-[9px] tracking-widest gap-2">
                <Smartphone className="h-4 w-4" /> Bater ponto pelo celular
              </Button>
            </Link>

            <p className="text-center text-[10px] text-muted-foreground font-medium uppercase">
              Ainda não tem conta?{' '}
              <Link href="/register/" className="text-primary font-black hover:underline">Solicitar acesso</Link>
            </p>
            <p className="text-center text-[10px] text-muted-foreground/70 leading-relaxed">
              Ao entrar você concorda com os{' '}
              <Link href="/termos/" className="font-bold underline">Termos de Uso</Link> e a{' '}
              <Link href="/privacidade/" className="font-bold underline">Política de Privacidade</Link>.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}