
"use client"

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * REDIRECIONAMENTO DE SEGURANÇA
 * A página de relatórios foi unificada na nova central de 'Inteligência Clínica'.
 */
export default function RelatoriosRedirectPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/inteligencia/');
  }, [router]);

  return <div className="p-12 text-center font-black uppercase text-xs animate-pulse">Redirecionando para Inteligência Clínica...</div>;
}
