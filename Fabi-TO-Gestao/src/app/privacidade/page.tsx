'use client';

import { PaginaLegal } from '@/components/layout/pagina-legal';
import { POLITICA_PRIVACIDADE, VERSAO_PRIVACIDADE, NOME_SISTEMA } from '@/app/lib/legal';

export default function PrivacidadePage() {
  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      subtitulo={`Como o ${NOME_SISTEMA} trata dados pessoais e dados de saúde, conforme a LGPD (Lei 13.709/2018).`}
      versao={VERSAO_PRIVACIDADE}
      atualizadoEm="28 de julho de 2026"
      secoes={POLITICA_PRIVACIDADE}
    />
  );
}
