'use server';
/**
 * @fileOverview Fluxo Genkit para geração de resumo de performance financeira.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AiFinancialPerformanceSummaryInputSchema = z.object({
  month: z.string().describe('O mês de referência (ex: "Janeiro").'),
  year: z.number().describe('O ano de referência.'),
  totalGrossRevenue: z.number().describe('Receita bruta total.'),
  totalNetProfit: z.number().describe('Lucro líquido total.'),
  revenueByConvenio: z.array(z.object({
    convenioName: z.string().describe('Nome do plano ou Particular.'),
    grossAmount: z.number().describe('Valor bruto.'),
    netAmount: z.number().describe('Valor líquido.'),
  })),
  totalRealizedAppointments: z.number().describe('Total de sessões realizadas.'),
  totalMissedAppointments: z.number().describe('Total de faltas.'),
  totalCancelledByPatient: z.number().describe('Cancelamentos pelo paciente.'),
  totalCancelledByProfessional: z.number().describe('Cancelamentos pela clínica.'),
  totalRescheduled: z.number().describe('Total de reagendamentos.'),
});
export type AiFinancialPerformanceSummaryInput = z.infer<typeof AiFinancialPerformanceSummaryInputSchema>;

const AiFinancialPerformanceSummaryOutputSchema = z.object({
  summary: z.string().describe('Resumo executivo da performance da clínica.'),
});
export type AiFinancialPerformanceSummaryOutput = z.infer<typeof AiFinancialPerformanceSummaryOutputSchema>;

export async function aiFinancialPerformanceSummary(input: AiFinancialPerformanceSummaryInput): Promise<AiFinancialPerformanceSummaryOutput> {
  return aiFinancialPerformanceSummaryFlow(input);
}

const aiFinancialPerformanceSummaryFlow = ai.defineFlow(
  {
    name: 'aiFinancialPerformanceSummaryFlow',
    inputSchema: AiFinancialPerformanceSummaryInputSchema,
    outputSchema: AiFinancialPerformanceSummaryOutputSchema,
  },
  async input => {
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: `Você é o Diretor de Estratégia da Clínica Dra. Fabiula. 
      Analise os dados financeiros de ${input.month}/${input.year} e gere um resumo executivo.
      
      DADOS:
      - Faturamento Bruto: R$ ${input.totalGrossRevenue}
      - Lucro Líquido: R$ ${input.totalNetProfit}
      - Sessões Realizadas: ${input.totalRealizedAppointments}
      - Taxa de Absenteísmo: ${input.totalMissedAppointments} faltas
      
      REGRAS:
      1. Seja profissional, motivador e analítico.
      2. Identifique tendências de crescimento ou gargalos (como excesso de faltas).
      3. Sugira uma ação estratégica baseada nos números.
      4. Use emojis discretos e formatação clara.`,
      output: { schema: AiFinancialPerformanceSummaryOutputSchema }
    });
    return response.output!;
  }
);
