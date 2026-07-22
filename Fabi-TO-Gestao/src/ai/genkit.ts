import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * Inicialização centralizada do Genkit v1.x.
 * Exporta a instância 'ai' pronta para ser usada nos fluxos.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GEMINI_API_KEY,
    }),
  ],
});
