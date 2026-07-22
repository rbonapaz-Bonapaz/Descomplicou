
"use client"

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CreditCard, History, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function HistoricoSalarialPage() {
  const mockPagamentos = [
    { mes: 'Junho/2024', valor: 4500, status: 'Efetuado', data: '05/06/2024' },
    { mes: 'Maio/2024', valor: 4200, status: 'Efetuado', data: '05/05/2024' },
  ];

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-accent" /> Histórico de Pagamentos
        </h1>
        <p className="text-muted-foreground text-sm uppercase font-black tracking-widest opacity-60 ml-1">Autoconsulta de repasses e demonstrativos</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {mockPagamentos.map((p, idx) => (
          <Card key={idx} className="border-none ring-1 ring-border shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                    <History className="h-5 w-5" />
                 </div>
                 <div>
                    <p className="text-sm font-black text-primary">{p.mes}</p>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                       Data: {p.data}
                    </span>
                 </div>
              </div>
              <div className="flex items-center gap-6">
                 <div className="text-right">
                    <p className="text-sm font-black text-primary">R$ {p.valor.toFixed(2)}</p>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-none text-[8px] font-black uppercase">
                       <ArrowUpRight className="h-2 w-2 mr-1" /> {p.status}
                    </Badge>
                 </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
