
"use client"

import React, { Suspense } from 'react';
import PatientDetailsClient from './patient-details-client';

/**
 * Página de Prontuário (Estática)
 * Utiliza Suspense para permitir o uso de useSearchParams no cliente,
 * sendo totalmente compatível com 'output: export'.
 */
export default function ProntuarioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground uppercase font-black text-xs animate-pulse">Carregando Prontuário...</div>}>
      <PatientDetailsClient />
    </Suspense>
  );
}
