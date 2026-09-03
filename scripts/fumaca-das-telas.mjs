/**
 * Abre toda tela do produto com uma sessão de verdade e confere se ela
 * renderiza.
 *
 * Existe por causa de um defeito que passou por tudo. Uma constante exportada
 * de um módulo `"use client"` e lida por um componente de servidor vira, na
 * fronteira, uma referência de cliente: o valor deixa de ser o que era e a
 * tela estoura. O tipo continua certo, porque não é erro de tipo, é o
 * empacotador trocando o valor em tempo de execução. Nem o TypeScript, nem o
 * lint, nem os testes de unidade veem isso.
 *
 * E a conferência que eu vinha fazendo, bater na URL sem sessão, também não
 * via: sem cookie, toda tela protegida devolve 307 para o login. Isso prova
 * roteamento, não renderização. Três telas ficaram quebradas ao mesmo tempo
 * com o verde na mão.
 *
 * Uso: node scripts/fumaca-das-telas.mjs [endereço]
 * Precisa da pilha no ar. Cria uma conta descartável e a apaga no fim.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const executar = promisify(execFile);
const WEB = process.argv[2] ?? "http://localhost:3000";

/** O texto que a tela de erro mostra. É o sinal de que algo estourou. */
const MARCA_DE_ERRO = "Esta tela não carregou";

const TELAS = [
  "/dashboard",
  "/leads",
  "/campanhas",
  "/conversas",
  "/relatorio",
  // Com parâmetro também: é por ali que a janela de período é lida, e foi
  // exatamente essa leitura que quebrou.
  "/relatorio?days=7",
  "/links",
  "/settings",
  "/notifications",
  "/integrations",
  "/integrations/google",
  "/integrations/meta",
  "/integrations/whatsapp",
];

/** Telas públicas: sem sessão, e por isso conferidas à parte. */
const PUBLICAS = ["/login", "/register", "/esqueci-senha", "/redefinir-senha"];

function guardaCookies(resposta, pote) {
  for (const bruto of resposta.headers.getSetCookie?.() ?? []) {
    const [par] = bruto.split(";");
    const [nome, ...resto] = par.split("=");
    pote.set(nome.trim(), resto.join("="));
  }
}

const cabecalhoDeCookies = (pote) =>
  [...pote.entries()].map(([nome, valor]) => `${nome}=${valor}`).join("; ");

async function main() {
  const pote = new Map();
  const email = `fumaca-${randomBytes(4).toString("hex")}@exemplo.com`;
  const organizacao = `Org Fumaca ${randomBytes(3).toString("hex")}`;

  const cadastro = await fetch(`${WEB}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Fumaca",
      email,
      password: `descartavel-${randomBytes(8).toString("hex")}`,
      organizationName: organizacao,
    }),
  });

  if (!cadastro.ok) {
    console.error(`Não consegui criar a conta de teste (${cadastro.status}). A pilha está no ar?`);
    process.exit(1);
  }
  guardaCookies(cadastro, pote);

  const quebradas = [];

  async function conferir(caminho, comSessao) {
    let resposta;
    try {
      resposta = await fetch(`${WEB}${caminho}`, {
        headers: comSessao ? { cookie: cabecalhoDeCookies(pote) } : {},
        redirect: "manual",
      });
    } catch (erro) {
      quebradas.push(caminho);
      console.log(`  ${caminho.padEnd(28)} sem resposta  ${erro.message}`);
      return;
    }

    const corpo = await resposta.text();
    const estourou = corpo.includes(MARCA_DE_ERRO);
    // Uma tela protegida que redireciona com sessão válida também é falha:
    // significa que a sessão não foi aceita.
    const naoRenderizou = comSessao && resposta.status >= 300 && resposta.status < 400;

    if (estourou || naoRenderizou || resposta.status >= 400) quebradas.push(caminho);
    const veredito = estourou ? "ESTOUROU" : naoRenderizou ? "REDIRECIONOU" : resposta.status >= 400 ? "ERRO" : "ok";
    console.log(`  ${caminho.padEnd(28)} ${String(resposta.status).padEnd(4)} ${veredito}`);
  }

  console.log("\nCom sessão:");
  for (const tela of TELAS) await conferir(tela, true);

  console.log("\nSem sessão:");
  for (const tela of PUBLICAS) await conferir(tela, false);

  // A conta some mesmo se algo acima falhar: deixar sujeira no banco a cada
  // execução tornaria o próprio teste um problema.
  await executar("docker", [
    "compose", "exec", "-T", "postgres", "psql", "-U", "tintim", "-d", "tintim", "-c",
    `DELETE FROM organizations WHERE name = '${organizacao}'; DELETE FROM users WHERE email = '${email}';`,
  ]).catch(() => console.warn("\n(não consegui apagar a conta de teste; apague à mão)"));

  if (quebradas.length > 0) {
    console.error(`\n${quebradas.length} tela(s) com problema: ${quebradas.join(", ")}`);
    process.exit(1);
  }
  console.log("\nTodas as telas renderizaram.");
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
