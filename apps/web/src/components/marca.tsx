/**
 * A marca do produto: um traço contínuo entre dois pontos.
 *
 * O produto acompanha uma cadeia — clique, mensagem, lead, venda — e só
 * entrega valor enquanto ela não se rompe. O ponto de partida é vazado, como o
 * © do logotipo do estúdio; o de chegada é cheio. Pontas arredondadas, para
 * rimar com as terminações do wordmark da Timeless sem imitá-lo.
 *
 * Não entra na barra lateral: aquele espaço é da marca do cliente, e as duas
 * lado a lado brigariam. O produto é filho, não irmão.
 */

/** Centro do anel de origem. */
const ORIGEM = { x: 11, y: 35 };
/** Centro do ponto de chegada. */
const CHEGADA = { x: 37, y: 13 };

/**
 * O anel não muda de tamanho, só o traço.
 *
 * Um anel proporcionalmente mais grosso em tamanho pequeno fecha o buraco, e
 * aí a origem vira uma bolha cheia igual à chegada — que é justamente a
 * distinção que o desenho existe para fazer. Com raio 4,6 e espessura 3,5 o
 * furo tem 5,7 unidades de diâmetro, o que ainda são quase dois pixels aos
 * dezesseis, tamanho da aba do navegador.
 */
const ANEL = { raio: 4.6, espessura: 3.5 };
const RAIO_EXTERNO_DO_ANEL = ANEL.raio + ANEL.espessura / 2;

/** Respiro entre o anel e o começo do traço, para os dois não se tocarem. */
const FOLGA = 1.2;

/**
 * O traço engrossa conforme a marca diminui.
 *
 * Uma espessura só, escalada junto, some na aba do navegador: aos dezesseis
 * pixels a curva viraria um fio de meio pixel.
 */
function espessuraDoTraco(tamanho: number): number {
  if (tamanho >= 64) return 3.5;
  if (tamanho >= 32) return 4;
  return 6;
}

/**
 * Onde o traço começa.
 *
 * Depende da espessura dele: `stroke-linecap="round"` estende a linha por
 * meia espessura ALÉM do ponto declarado, então um traço grosso que partisse
 * de um ponto fixo cresceria para trás e invadiria o anel. Somar a metade
 * aqui é o que mantém o respiro igual em qualquer tamanho.
 */
function inicioDoTraco(espessura: number): number {
  return ORIGEM.x + RAIO_EXTERNO_DO_ANEL + espessura / 2 + FOLGA;
}

export function Marca({
  tamanho = 24,
  className,
  titulo,
}: {
  tamanho?: number;
  className?: string;
  /** Quando ausente, a marca é decorativa e some para o leitor de tela. */
  titulo?: string;
}) {
  const espessura = espessuraDoTraco(tamanho);

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 48 48"
      className={className}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      {/*
        O traço nasce fora do anel, e não no centro dele.

        Se partisse do centro, o anel precisaria ser preenchido com a cor do
        fundo para continuar parecendo vazado — e aí a marca só funcionaria
        sobre a superfície para a qual foi desenhada. Começando de fora, ela
        vale sobre qualquer fundo, inclusive na aba do navegador.
      */}
      <path
        d={`M ${inicioDoTraco(espessura)} ${ORIGEM.y} C 29 ${ORIGEM.y}, 29 ${CHEGADA.y}, ${CHEGADA.x} ${CHEGADA.y}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={espessura}
        strokeLinecap="round"
      />
      {/* Origem: vazada. */}
      <circle
        cx={ORIGEM.x}
        cy={ORIGEM.y}
        r={ANEL.raio}
        fill="none"
        stroke="currentColor"
        strokeWidth={ANEL.espessura}
      />
      {/* Resultado: cheio. */}
      <circle cx={CHEGADA.x} cy={CHEGADA.y} r="5" fill="currentColor" />
    </svg>
  );
}
