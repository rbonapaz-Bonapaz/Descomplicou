"use client"

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CatalogoRedirectPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/dashboard/');
  }, [router]);

  return <div className="p-12 text-center font-black uppercase text-xs animate-pulse">Removendo módulo de catálogo...</div>;
}