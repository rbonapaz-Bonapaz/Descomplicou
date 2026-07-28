'use client';

import { PaginaLegal } from '@/components/layout/pagina-legal';
import { TERMOS_DE_USO, VERSAO_TERMOS, NOME_SISTEMA } from '@/app/lib/legal';

export default function TermosPage() {
  return (
    <PaginaLegal
      titulo="Termos de Uso"
      subtitulo={`Condições para usar o ${NOME_SISTEMA}, incluindo a responsabilidade de cada parte sobre o conteúdo registrado.`}
      versao={VERSAO_TERMOS}
      atualizadoEm="28 de julho de 2026"
      secoes={TERMOS_DE_USO}
    />
  );
}
