
import React from 'react';
import PatientDetailsClient from './patient-details-client';

/**
 * Em exportações estáticas (output: export), rotas dinâmicas precisam de generateStaticParams.
 * Como este é um SPA que carrega dados via Firestore no cliente, fornecemos um ID dummy
 * apenas para satisfazer o build do Next.js.
 */
export async function generateStaticParams() {
  return [{ id: '1' }];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return (
      <div className="p-8 text-center text-muted-foreground uppercase font-black text-xs">
        Paciente inválido ou não selecionado.
      </div>
    );
  }

  return <PatientDetailsClient id={id} />;
}
