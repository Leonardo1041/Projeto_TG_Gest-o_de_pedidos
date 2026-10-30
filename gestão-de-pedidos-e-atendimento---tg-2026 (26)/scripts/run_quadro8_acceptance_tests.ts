/**
 * Alias de compatibilidade: scripts/run_quadro8_acceptance_tests.ts -> scripts/run_quadro7_acceptance_tests.ts
 * No documento do TG (FATEC Franca), o roteiro de aceitação é oficialmente o Quadro 7.
 */
console.log('ℹ Redirecionando para o roteiro oficial do TG: scripts/run_quadro7_acceptance_tests.ts (Quadro 7)...');
import('./run_quadro7_acceptance_tests.js').catch(() => {
  // Se executado via tsx:
  import('./run_quadro7_acceptance_tests.ts');
});
