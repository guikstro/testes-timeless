import { brandPalette } from "@/lib/brand";

/**
 * Pinta a interface inteira com a cor da organização.
 *
 * Sobrescreve as variáveis no `:root` em vez de passar cores por props: assim
 * qualquer componente que use os papéis já nasce na cor certa, e trocar a
 * marca não exige tocar em nenhuma tela.
 *
 * Inclui o acento e as séries do gráfico. Antes só o menu e os botões
 * mudavam, então trocar a cor nas configurações não alcançava o dashboard,
 * que é justamente onde a marca aparece mais.
 */
export function BrandStyle({ brandColor }: { brandColor: string | null }) {
  const p = brandPalette(brandColor);
  return (
    <style
      // Só triplas de números derivadas de um hex validado no servidor — nada
      // aqui vem de texto livre do usuário.
      dangerouslySetInnerHTML={{
        __html:
          `:root{--brand:${p.base};--brand-soft:${p.soft};--brand-ink:${p.ink};` +
          `--accent:${p.accent};--accent-contrast:${p.accentContrast};` +
          `--serie-1:${p.serie1};--serie-2:${p.serie2}}`,
      }}
    />
  );
}
