"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Número que sobe até o valor ao entrar na tela.
 *
 * O movimento serve ao dado, não ao enfeite: ele puxa o olho para a métrica no
 * momento em que ela chega, que é exatamente onde a atenção deveria estar numa
 * tela de números.
 *
 * Três cuidados que separam isto de um truque:
 *
 * - Só anima quando o elemento aparece de fato. Contar fora da vista gasta
 *   quadro à toa e a pessoa perde o efeito.
 * - Desacelera no fim, em vez de correr linear. Um contador linear parece um
 *   marcador de posto de gasolina.
 * - Com movimento reduzido pedido, mostra o valor final direto. Números
 *   pulando são dos piores gatilhos para quem tem sensibilidade vestibular.
 */
/**
 * O formato vem como palavra, e não como função, por imposição do framework:
 * um Server Component não consegue passar função para um Client Component, e
 * a tentativa quebra a página inteira em tempo de execução.
 */
export type FormatoNumero = "inteiro" | "moeda";

/** Exportada porque o cartão precisa formatar o valor anterior do mesmo jeito. */
export function formataNumero(valor: number, formato: FormatoNumero): string {
  if (formato === "moeda") {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  return valor.toLocaleString("pt-BR");
}

export function CountUp({
  value,
  duration = 900,
  formato = "inteiro",
  className,
}: {
  value: number;
  duration?: number;
  formato?: FormatoNumero;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [mostrado, setMostrado] = useState(value);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semMovimento) {
      setMostrado(value);
      setPronto(true);
      return;
    }

    let quadro = 0;
    let cancelado = false;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting || cancelado) return;
        observador.disconnect();
        cancelado = true;

        const inicio = performance.now();
        const passo = (agora: number) => {
          const t = Math.min(1, (agora - inicio) / duration);
          // Desaceleração cúbica: rápido no começo, assentando no fim.
          const eased = 1 - Math.pow(1 - t, 3);
          setMostrado(Math.round(value * eased));
          if (t < 1) quadro = requestAnimationFrame(passo);
          else setPronto(true);
        };
        quadro = requestAnimationFrame(passo);
      },
      { threshold: 0.2 },
    );

    setMostrado(0);
    observador.observe(elemento);

    return () => {
      cancelado = true;
      observador.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, [value, duration]);

  return (
    <span
      ref={ref}
      className={className}
      // O valor final fica no DOM para leitor de tela e para busca na página,
      // sem depender de a animação ter terminado.
      aria-label={pronto ? undefined : formataNumero(value, formato)}
    >
      {formataNumero(mostrado, formato)}
    </span>
  );
}
