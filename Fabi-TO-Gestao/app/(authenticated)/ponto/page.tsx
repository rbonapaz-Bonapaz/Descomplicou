
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  ChevronLeft, 
  Plus, 
  Clock, 
  Loader2,
  Lock,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { format, isSameDay, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/components/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ClockInRecord } from '@/app/lib/types';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PontoDigitalPage() {
  const { user, isGuest } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [punchRecords, setPunchRecords] = useState<ClockInRecord[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [justPunched, setJustPunched] = useState(false);
  
  const lastClickRef = useRef<number>(0);

  const loadGuestData = () => {
    if (isGuest && user) {
      const saved = localStorage.getItem('demo_clock_ins');
      if (saved) {
        const all = JSON.parse(saved) as ClockInRecord[];
        const filtered = all.filter(r => r.userId === user.uid).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setPunchRecords(filtered);
      }
    }
  };

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLoadingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: 'Localização confirmada via GPS' });
        setLoadingLocation(false);
      },
      () => {
        setLoadingLocation(false);
        toast({ variant: 'destructive', title: 'GPS Desativado', description: 'Ative a localização para bater o ponto.' });
      }
    );
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    
    if (isGuest) {
      loadGuestData();
      window.addEventListener('storage', loadGuestData);
      return () => window.removeEventListener('storage', loadGuestData);
    } else if (firestore) {
      const q = query(collection(firestore, 'batidas_ponto'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
      return onSnapshot(q, (snap) => {
        setPunchRecords(snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(), 
          timestamp: d.data().timestamp instanceof Timestamp ? d.data().timestamp.toDate().toISOString() : d.data().timestamp 
        } as ClockInRecord)));
      });
    }
  }, [user, isGuest, firestore]);

  const todayPunches = useMemo(() => {
    if (!currentTime) return [];
    const todayStr = format(currentTime, 'yyyy-MM-dd');
    return punchRecords
      .filter(r => {
        const d = parseISO(r.timestamp);
        return isValid(d) && format(d, 'yyyy-MM-dd') === todayStr && r.status !== 'reprovado';
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [punchRecords, currentTime]);

  const handlePunch = async () => {
    if (!user || isRegistering) return;
    if (!location) return toast({ variant: 'destructive', title: 'Aguarde o GPS' });

    setIsRegistering(true);
    const lastPunch = punchRecords[0];
    const isEntry = !lastPunch || lastPunch.type === 'saida' || format(new Date(lastPunch.timestamp), 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd');
    
    const newRecord: ClockInRecord = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.uid,
      userName: user.nome,
      timestamp: new Date().toISOString(),
      type: isEntry ? 'entrada' : 'saida',
      status: 'aprovado',
      location
    };

    try {
      if (isGuest) {
        const saved = JSON.parse(localStorage.getItem('demo_clock_ins') || '[]');
        localStorage.setItem('demo_clock_ins', JSON.stringify([newRecord, ...saved]));
        loadGuestData();
        window.dispatchEvent(new Event('storage'));
      } else if (firestore) {
        const { id: _, ...payload } = newRecord;
        await addDoc(collection(firestore, 'batidas_ponto'), payload);
      }
      setJustPunched(true);
      setTimeout(() => setJustPunched(false), 3000);
      toast({ title: 'Ponto Registrado' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao registrar' });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    if (now - lastClickRef.current < 400 && lastClickRef.current !== 0) { 
      handlePunch(); 
      lastClickRef.current = 0; 
    } else { 
      lastClickRef.current = now; 
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-20 px-4 md:px-0">
      <div className="flex items-center justify-between"><div className="flex items-center gap-4"><Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full border shadow-sm"><ChevronLeft className="h-4 w-4" /></Button><h1 className="text-xl md:text-2xl font-headline font-bold text-primary">Bater Ponto Digital</h1></div></div>
      <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white"><CardContent className="p-0"><div className="py-12 text-center border-b bg-white"><h2 className="text-6xl font-black text-slate-800 tabular-nums leading-none mb-2">{currentTime ? format(currentTime, 'HH:mm') : '--:--'}</h2><p className="text-xs font-black uppercase text-primary/40 tracking-widest">{currentTime ? format(currentTime, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : '---'}</p></div><div className="py-16 flex items-center justify-center bg-slate-50 relative overflow-hidden"><button onClick={handleDoubleTap} onTouchStart={handleDoubleTap} disabled={isRegistering} className={cn("relative h-48 w-48 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-3xl z-10 border-8 border-white/50 active:scale-95", justPunched ? "bg-emerald-600" : (isRegistering ? "bg-slate-400" : "bg-primary"))}><div className="text-center px-4 text-white">{isRegistering ? <Loader2 className="h-10 w-10 animate-spin mx-auto" /> : justPunched ? <CheckCircle2 className="h-10 w-10 mx-auto" /> : <div className="flex flex-col items-center"><span className="text-xl font-black uppercase tracking-tighter">BATER PONTO</span><span className="text-[8px] font-bold uppercase opacity-60 mt-1">Toque 2 vezes</span></div>}</div></button></div><div className="p-6 flex items-start gap-4 bg-white"><MapPin className="h-5 w-5 text-rose-500 shrink-0" /><div className="min-w-0"><p className="text-[10px] font-black uppercase text-slate-800 mb-0.5">Localização GPS</p><p className="text-xs font-medium text-slate-500 truncate">{location?.address || "Detectando GPS..."}</p></div></div></CardContent></Card>
      <Card className="rounded-2xl border-none ring-1 ring-border shadow-md bg-white"><CardContent className="p-6"><h3 className="text-xs font-black uppercase text-slate-500 mb-6 tracking-widest flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Batidas de Hoje</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{todayPunches.map((punch) => (<div key={punch.id} className="flex flex-col p-3 rounded-2xl bg-slate-50 border border-slate-100 items-center text-center"><Badge variant="outline" className={cn("text-[7px] font-black uppercase mb-1 px-2 py-0.5", punch.type === 'entrada' ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700")}>{punch.type}</Badge><span className="text-lg font-black text-slate-800">{format(parseISO(punch.timestamp), 'HH:mm')}</span></div>))}{todayPunches.length === 0 && <p className="col-span-full text-center py-6 text-[10px] font-black uppercase opacity-20">Nenhuma batida registrada hoje</p>}</div></CardContent></Card>
      <div className="flex gap-3"><Link href="/ponto/espelho/" className="flex-1"><Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-[10px] tracking-widest border-primary/10"><FileText className="h-4 w-4 mr-2" /> Espelho de Ponto</Button></Link></div>
    </div>
  );
}
