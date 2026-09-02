/**
 * O pacote já declarava `pnpm test` e trazia ts-jest, jsdom e testing-library
 * nas dependências, mas nunca teve configuração: rodar o comando quebrava no
 * primeiro `import`. Isto é o mínimo para a lógica pura do front ser testável
 * sem subir o Next.
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    // Mesmo alias do tsconfig, para os testes importarem como o resto do app.
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
