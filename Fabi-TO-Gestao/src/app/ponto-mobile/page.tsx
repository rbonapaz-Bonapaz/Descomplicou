
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Clock, 
  Loader2,
  LogOut,
  Fingerprint,
  CheckCircle2,
  Info,
  CalendarDays,
  Smartphone
} from 'lucide-react';
import { format, isSameDay, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/components/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ClockInRecord } from '@/app/lib/types';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export default function PontoMobilePage() {
  const { user, isGuest, logout, loading: authLoading } = useAuth();
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
      },
      { enableHighAccuracy: true }
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
  }, [user, firestore, isGuest]);

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

  const handlePunch = () => {
    if (!user || isRegistering) return;
    if (!location) {
      toast({ variant: 'destructive', title: 'Aguarde o GPS' });
      return;
    }
    
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

    if (isGuest) {
      const saved = localStorage.getItem('demo_clock_ins');
      const all = saved ? JSON.parse(saved) : [];
      localStorage.setItem('demo_clock_ins', JSON.stringify([newRecord, ...all]));
      loadGuestData();
      window.dispatchEvent(new Event('storage'));
      setJustPunched(true);
      setTimeout(() => setJustPunched(false), 3000);
      setIsRegistering(false);
      toast({ title: isEntry ? 'Entrada Confirmada' : 'Saída Confirmada' });
    } else if (firestore) {
      const punchesRef = collection(firestore, 'batidas_ponto');
      const { id: _, ...payload } = newRecord;
      addDoc(punchesRef, payload).then(() => {
        setJustPunched(true);
        setTimeout(() => setJustPunched(false), 3000);
        toast({ title: 'Ponto Registrado' });
      }).finally(() => setIsRegistering(false));
    }
  };

  const handleDoubleTapDetection = () => {
    const now = Date.now();
    if (now - lastClickRef.current < 400 && lastClickRef.current !== 0) {
      handlePunch();
      lastClickRef.current = 0;
    } else {
      lastClickRef.current = now;
    }
  };

  if (authLoading) return <div className="min-h-screen bg-[#F1F4F5] flex items-center justify-center font-black uppercase text-[10px] animate-pulse">Autenticando...</div>;

  return (
    <div className="min-h-screen bg-[#F1F4F5] flex flex-col items-center p-4 pb-12 animate-in fade-in duration-500">
      <div className="w-full max-w-md flex justify-between items-center mb-8 pt-4">
        <div className="flex items-center gap-3">
           <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl"><Fingerprint className="h-7 w-7" /></div>
           <div><h1 className="text-xl font-black text-primary leading-none uppercase tracking-tighter">Ponto Digital</h1><p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">{user?.nome?.split(' ')[0] || 'Colaborador'}</p></div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} className="rounded-full h-11 w-11 text-rose-500"><LogOut className="h-5 w-5" /></Button>
      </div>

      <Card className="w-full max-w-md rounded-[3.5rem] border-none shadow-3xl overflow-hidden bg-white mb-8"><CardContent className="p-0"><div className="py-12 text-center bg-white border-b border-dashed"><h2 className="text-7xl font-black text-slate-800 tabular-nums leading-none mb-3">{currentTime ? format(currentTime, 'HH:mm') : '--:--'}</h2><p className="text-xs font-black uppercase text-primary/60 tracking-[0.2em]">{currentTime ? format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR }) : '---'}</p></div><div className="py-14 flex flex-col items-center justify-center bg-slate-50 relative"><button onClick={handleDoubleTapDetection} disabled={isRegistering || loadingLocation} className={cn("relative h-52 w-52 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-3xl z-10 border-[12px] border-white", justPunched ? "bg-emerald-600" : (isRegistering ? "bg-slate-300" : "bg-primary"))}>{isRegistering ? <Loader2 className="h-12 w-12 text-white animate-spin" /> : justPunched ? <CheckCircle2 className="h-12 w-12 text-white mx-auto mb-3" /> : <div className="text-center"><span className="text-2xl font-black text-white uppercase block mb-1">Confirmar</span><span className="text-[10px] font-bold text-white/60 uppercase">Toque Duplo</span></div>}</button><div className={cn("mt-10 flex items-center gap-3 px-6 py-2.5 rounded-full shadow-sm border", location ? "bg-white border-emerald-100 text-emerald-600" : "bg-white border-rose-100 text-rose-500")}>{loadingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}<span className="text-[9px] font-black uppercase tracking-widest">{loadingLocation ? "Detectando GPS..." : "GPS Ativo"}</span></div></div></CardContent></Card>

      <div className="w-full max-w-md space-y-4 mb-8">
        <h3 className="px-4 text-[10px] font-black uppercase text-slate-500">Batidas de Hoje</h3>
        <div className="grid grid-cols-2 gap-3">
          {todayPunches.length === 0 ? <div className="col-span-2 p-8 bg-white rounded-3xl text-center border-2 border-dashed border-slate-100 opacity-30">Nenhum registro hoje</div> : todayPunches.map((punch) => (<div key={punch.id} className="p-4 bg-white rounded-3xl shadow-sm border flex items-center gap-3"><div className={cn("h-8 w-8 rounded-full flex items-center justify-center", punch.type === 'entrada' ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-600")}><Clock className="h-4 w-4" /></div><div><p className="text-sm font-black text-slate-800 leading-none">{format(parseISO(punch.timestamp), 'HH:mm')}</p><p className="text-[8px] font-bold text-muted-foreground uppercase mt-1">{punch.type}</p></div></div>))}
        </div>
      </div>
    </div>
  );
}
