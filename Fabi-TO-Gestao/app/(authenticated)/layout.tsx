
"use client"

import React, { useEffect } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/components/providers/auth-provider';
import { CloudOff, Wifi } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFirestore } from '@/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Appointment } from '@/app/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isGuest, firebaseUser, user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    if (!firestore || isGuest || !user?.possui_agenda) return;

    const q = query(
      collection(firestore, 'agendamentos'),
      where('profissional_id', '==', user.uid),
      where('status', '==', 'espera'),
      orderBy('chegada_horario', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const apt = change.doc.data() as Appointment;
          toast({
            title: "Paciente na Espera",
            description: `${apt.paciente_nome} acabou de chegar para o atendimento.`,
            duration: 5000,
          });
        }
      });
    });

    return () => unsub();
  }, [firestore, isGuest, user, toast]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh flex flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card px-4 sticky top-0 z-30 shadow-sm">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1 flex items-center justify-between min-w-0">
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider truncate mr-2">
              Clínica Dra. Fabiula
            </h2>
            
            <div className="flex items-center gap-2 shrink-0">
              {isGuest ? (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] font-black uppercase px-2 py-0.5 whitespace-nowrap">
                  <CloudOff className="h-2.5 w-2.5 mr-1 hidden xs:block" /> Simulação
                </Badge>
              ) : firebaseUser ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-black uppercase px-2 py-0.5 whitespace-nowrap">
                  <Wifi className="h-2.5 w-2.5 mr-1 hidden xs:block" /> Nuvem
                </Badge>
              ) : (
                <Badge variant="outline" className="animate-pulse text-[9px] font-black uppercase px-2 py-0.5">
                  ...
                </Badge>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-2 md:p-6 lg:p-10 max-w-full">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
