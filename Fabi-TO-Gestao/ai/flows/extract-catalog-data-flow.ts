'use server';
/**
 * @fileOverview Fluxo de IA para extração de catálogos Farmasi/Nutriplus.
 * Focado em capturar exclusivamente o preço de tabela (valor riscado).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ExtractCatalogDataInputSchema = z.object({
  photoDataUri: z.string().describe("A imagem do catálogo como Data URI (base64)."),
});

const ExtractCatalogDataOutputSchema = z.object({
  products: z.array(z.object({
    nome: z.string().describe("Nome completo do produto."),
    linha: z.string().describe("Categoria ou linha do produto."),
    preco: z.number().describe("O preço original (o valor que está COM UM RISCO/LINHA em cima na imagem).")
  }))
});

export type ExtractCatalogDataInput = z.infer<typeof ExtractCatalogDataInputSchema>;
export type ExtractCatalogDataOutput = z.infer<typeof ExtractCatalogDataOutputSchema>;

export async function extractCatalogData(input: ExtractCatalogDataInput): Promise<ExtractCatalogDataOutput> {
  return extractCatalogDataFlow(input);
}

const extractCatalogDataFlow = ai.defineFlow(
  {
    name: 'extractCatalogDataFlow',
    inputSchema: ExtractCatalogDataInputSchema,
    outputSchema: ExtractCatalogDataOutputSchema,
  },
  async (input) => {
    // Limpa o Base64 para a IA
    const base64Data = input.photoDataUri.includes(',') 
      ? input.photoDataUri.split(',')[1] 
      : input.photoDataUri;
    
    const response = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: [
        { text: `Você é um especialista em leitura de catálogos Farmasi e Nutriplus.
        
        REGRA DE OURO OBRIGATÓRIA PARA PREÇOS:
        Neste catálogo, os produtos possuem dois preços: um preço de promoção (menor) e um PREÇO DE TABELA (maior, que está RISCADO com uma linha horizontal cortando o número).
        Você DEVE extrair APENAS o PREÇO DE TABELA que está RISCADO. 
        Ignore totalmente o preço menor de promoção que está sem o risco.
        
        Para cada produto identificado:
        1. NOME: Nome comercial completo.
        2. PREÇO: O valor que está com o risco/linha por cima.
        3. LINHA: Classifique em: "Novos Produtos", "Nutrição", "Perfumaria", "Maquiagem", "Cuidados Pele", "Cuidados Pessoais", "Cuidados Cabelo", "Homem", "Kits/Combos".
        
        Retorne os dados rigorosamente em formato JSON.` },
        { media: { url: `data:image/jpeg;base64,${base64Data}`, contentType: 'image/jpeg' } }
      ],
      output: { schema: ExtractCatalogDataOutputSchema },
      config: { 
        temperature: 0.1,
      }
    });

    if (!response.output) {
      throw new Error('Não foi possível extrair os dados. Verifique se os preços riscados estão visíveis na foto.');
    }

    return response.output;
  }
);
