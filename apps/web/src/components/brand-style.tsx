import { brandPalette } from "@/lib/brand";

/**
 * Pinta a interface com o acento da organização.
 *
 * Sobrescreve as variáveis no `:root` em vez de passar cores por props: assim
 * qualquer componente que use `brand` já nasce na cor certa, e trocar a marca
 * não exige tocar em nenhuma tela.
 */
export function BrandStyle({ brandColor }: { brandColor: string | null }) {
  const palette = brandPalette(brandColor);
  return (
    <style
      // Só três triplas de números derivadas de um hex validado no servidor —
      // nada aqui vem de texto livre do usuário.
      dangerouslySetInnerHTML={{
        __html: `:root{--brand:${palette.base};--brand-soft:${palette.soft};--brand-ink:${palette.ink}}`,
      }}
    />
  );
}
