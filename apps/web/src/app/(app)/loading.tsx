import { PaginaEsqueleto } from "@/components/ui/skeleton";

/**
 * O que aparece enquanto a tela busca os dados no servidor.
 *
 * Nenhuma rota tinha isto, então toda navegação ficava parada na tela
 * anterior até a resposta chegar, e um clique que não muda nada por dois
 * segundos parece um clique perdido.
 *
 * Um arquivo só na raiz do grupo cobre todas as telas do app. É de propósito:
 * quase toda tela daqui é título, uma fileira de números e uma lista, e uma
 * silhueta aproximada entrega a mesma sensação que oito arquivos quase iguais.
 * A caixa de entrada, que não se parece com nenhuma outra, tem o seu.
 */
export default function Carregando() {
  return <PaginaEsqueleto />;
}
