import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // As regras rodam contra um emulador compartilhado: testes em paralelo
    // disputariam o mesmo banco e o clearFirestore() de um limparia o do outro.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
