
"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { collection, query } from 'firebase/firestore';
import { col, SUB } from '@/lib/tenancy';
import { useFirestore, useCollection } from '@/firebase';
import { useAuth } from '@/components/providers/auth-provider';
import { Cake, Medal, Star, Phone, Calendar, ChevronRight, User } from 'lucide-react';
import { parseISO, isValid, differenceInYears, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User as UserType, Patient as PatientType } from '@/app/lib/types';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface AnniversaryItem {
  id: string;
  nome: string;
  tipo: 'nascimento' | 'empresa';
  info: string;
  foto_url?: string;
  telefone?: string;
  perfil?: string;
  data_base: string;
  categoria: 'equipe' | 'cliente';
}

interface AniversariantesDoDiaProps {
  mode: 'equipe' | 'pacientes';
  showBanner?: boolean;
  triggerOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AniversariantesDoDia({ 
  mode = 'equipe', 
  showBanner = true, 
  triggerOpen = false, 
  onOpenChange 
}: AniversariantesDoDiaProps) {
  const firestore = useFirestore();
  const { identidade } = useAuth();
  const clinicaId = identidade.clinicaId;
  // Modo demo removido: dava sessão de gestor sem autenticação nenhuma.
  const isGuest = false;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (triggerOpen) {
      setIsOpen(true);
    }
  }, [triggerOpen]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (onOpenChange) onOpenChange(open);
  };

  // Queries baseadas no modo
  const staffQuery = useMemo(() => 
    mode === 'equipe' && firestore ? query(col<UserType>(firestore, clinicaId!, SUB.usuarios)) : null, 
  [firestore, mode]);
  
  const patientsQuery = useMemo(() => 
    mode === 'pacientes' && firestore ? query(col<PatientType>(firestore, clinicaId!, SUB.pacientes)) : null, 
  [firestore, mode]);

  const { data: firestoreStaff } = useCollection<UserType>(staffQuery);
  const { data: firestorePatients } = useCollection<PatientType>(patientsQuery);

  const bdays = useMemo(() => {
    if (typeof window === 'undefined') return [];
    
    const todayStr = format(new Date(), 'dd/MM');
    const results: AnniversaryItem[] = [];

    const isToday = (dateStr?: string) => {
      if (!dateStr) return false;
      try {
        const d = parseISO(dateStr);
        return isValid(d) && format(d, 'dd/MM') === todayStr;
      } catch (e) { return false; }
    };

    if (mode === 'equipe') {
      const staff = isGuest 
        ? [{ uid: 'g1', nome: 'Rodrigo Turra Bonapaz', data_nascimento: '1987-05-19', data_admissao: '2023-05-19', perfil: 'gestor', telefone: '(21) 99999-8888' }] as UserType[]
        : (firestoreStaff || []);

      staff.forEach((u) => {
        if (isToday(u.data_nascimento)) {
          const idade = differenceInYears(new Date(), parseISO(u.data_nascimento!));
          results.push({ 
            id: u.uid,
            nome: u.nome, 
            tipo: 'nascimento', 
            info: `${idade} anos`,
            foto_url: u.foto_url,
            telefone: u.telefone,
            perfil: u.perfil,
            data_base: u.data_nascimento!,
            categoria: 'equipe'
          });
        }
        if (isToday(u.data_admissao)) {
          const adm = parseISO(u.data_admissao!);
          const anos = new Date().getFullYear() - adm.getFullYear();
          if (anos > 0) {
            results.push({ 
              id: `${u.uid}-adm`,
              nome: u.nome, 
              tipo: 'empresa', 
              info: `${anos} ${anos === 1 ? 'ano' : 'anos'} de casa`,
              foto_url: u.foto_url,
              telefone: u.telefone,
              perfil: u.perfil,
              data_base: u.data_admissao!,
              categoria: 'equipe'
            });
          }
        }
      });
    } else {
      const patients = isGuest 
        ? JSON.parse(localStorage.getItem('demo_patients') || '[]') as PatientType[]
        : (firestorePatients || []);

      patients.forEach((p) => {
        if (isToday(p.data_nascimento)) {
          const idade = differenceInYears(new Date(), parseISO(p.data_nascimento!));
          results.push({ 
            id: p.id,
            nome: p.nome, 
            tipo: 'nascimento', 
            info: `${idade} anos`,
            foto_url: p.foto_url,
            telefone: p.telefone,
            data_base: p.data_nascimento!,
            categoria: 'cliente'
          });
        }
      });
    }

    return results;
  }, [firestoreStaff, firestorePatients, isGuest, mode]);

  if (bdays.length === 0 && !triggerOpen) return null;

  return (
    <>
      {showBanner && bdays.length > 0 && (
        <div 
          onClick={() => setIsOpen(true)}
          className="px-6 md:px-12 py-3 bg-white border-b border-primary/10 animate-in fade-in slide-in-from-top-2 duration-500 shadow-sm overflow-hidden relative cursor-pointer hover:bg-slate-50 transition-all group z-20"
        >
          <div className="absolute inset-0 bg-primary/[0.02] pointer-events-none" />
          <div className="flex flex-wrap items-center gap-6 relative z-10">
            <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
               <Star className="h-4 w-4 text-accent fill-accent animate-pulse" />
               <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                 {mode === 'equipe' ? 'Celebrações da Equipe' : 'Clientes Aniversariantes'}
               </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 flex-1">
              {bdays.slice(0, 3).map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                    item.tipo === 'empresa' ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
                  )}>
                    {item.tipo === 'empresa' ? <Medal className="h-4 w-4" /> : <Cake className="h-4 w-4" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-slate-800 leading-none">{item.nome}</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-tight mt-0.5",
                      item.tipo === 'empresa' ? "text-accent" : "text-slate-400"
                    )}>
                      {item.info}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-1 text-[9px] font-black uppercase text-primary/40 group-hover:text-primary transition-colors">
              Ver lista completa <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] p-0 border-none shadow-3xl overflow-hidden z-[100]">
          <DialogHeader className="p-8 bg-primary text-white">
            <DialogTitle className="text-2xl font-headline flex items-center gap-3">
              <Star className="h-7 w-7 text-accent" /> 
              {mode === 'equipe' ? 'Celebrações de Hoje' : 'Clientes Aniversariantes'}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/70 font-medium">
              {mode === 'equipe' 
                ? 'Datas especiais para celebrar o tempo de casa e o nascimento da nossa equipe.' 
                : 'Pacientes que celebram aniversário hoje. Aproveite para enviar um carinho!'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="p-8 space-y-6">
              {bdays.map((item) => (
                <div key={item.id} className="flex flex-col md:flex-row items-center md:items-start justify-between p-6 rounded-[2rem] border-2 border-slate-50 bg-white hover:border-primary/20 transition-all gap-6">
                  <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                    <Avatar className="h-20 w-20 border-4 border-white shadow-xl">
                      <AvatarImage src={item.foto_url} className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black">
                        {item.nome.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <div className="flex flex-col md:flex-row items-center gap-2">
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">{item.nome}</h4>
                        <Badge variant="secondary" className={cn(
                          "text-[8px] font-black uppercase py-0.5",
                          item.categoria === 'equipe' ? (item.tipo === 'empresa' ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary") : "bg-emerald-100 text-emerald-700"
                        )}>
                          {item.categoria === 'equipe' ? 'Equipe' : 'Paciente'}
                        </Badge>
                      </div>
                      <p className="text-sm font-bold text-slate-500">
                        {item.tipo === 'empresa' ? (
                          <span className="flex items-center justify-center md:justify-start gap-1.5 text-accent font-black">
                            <Medal className="h-3.5 w-3.5" /> ANIVERSÁRIO DE EMPRESA: {item.info}
                          </span>
                        ) : (
                          <span className="flex items-center justify-center md:justify-start gap-1.5 text-primary font-black">
                            <Cake className="h-3.5 w-3.5" /> ANIVERSÁRIO: {item.info}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 w-full md:w-auto">
                    {item.telefone && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => window.open(`https://wa.me/55${item.telefone?.replace(/\D/g, '')}`, '_blank')}
                        className="h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest border-emerald-100 text-emerald-700 hover:bg-emerald-50 gap-2"
                      >
                        <Phone className="h-3.5 w-3.5" /> Parabenizar WhatsApp
                      </Button>
                    )}
                    <Badge variant="outline" className="h-11 justify-center rounded-xl border-dashed border-slate-200 font-bold text-slate-400 text-[10px]">
                      <Calendar className="h-3.5 w-3.5 mr-2" /> {format(parseISO(item.data_base), 'dd/MM')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-8 bg-slate-50 border-t flex justify-end">
            <Button onClick={() => handleOpenChange(false)} className="h-12 rounded-xl font-black uppercase tracking-widest px-8">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
