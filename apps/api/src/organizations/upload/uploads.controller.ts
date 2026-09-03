import { Controller, Get, Header, NotFoundException, Param, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { ArmazenamentoService } from "./armazenamento.service";

/**
 * Serve as imagens enviadas.
 *
 * Fora do prefixo `/api` e sem sessão, como o redirecionamento de link: a
 * logo aparece no cabeçalho de um relatório impresso e em telas públicas, e
 * exigir token ali quebraria a imagem sem ganho nenhum. O nome sorteado de
 * trinta e dois caracteres é o que impede alguém adivinhar o arquivo de
 * outro cliente.
 */
@SkipThrottle()
@Controller("uploads")
export class UploadsController {
  constructor(private readonly armazenamento: ArmazenamentoService) {}

  @Get(":nome")
  // `nosniff` importa aqui mais que em qualquer outra rota: é conteúdo que
  // veio de fora, e sem ele o navegador poderia adivinhar o tipo e executar
  // o que deveria ser uma imagem.
  @Header("X-Content-Type-Options", "nosniff")
  @Header("Content-Security-Policy", "default-src 'none'; sandbox")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async servir(@Param("nome") nome: string, @Res() res: Response): Promise<void> {
    const arquivo = await this.armazenamento.ler(nome);
    if (!arquivo) throw new NotFoundException();

    // O nome inclui o resumo do conteúdo, então o arquivo nunca muda: cache
    // longo com etag evita rebaixar a mesma logo a cada visita.
    res.setHeader("Content-Type", arquivo.tipo);
    res.setHeader("ETag", this.armazenamento.etagDe(arquivo.bytes));
    res.end(arquivo.bytes);
  }
}
