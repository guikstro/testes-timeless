import { Controller, Get, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LINK_PUBLICO } from "../../common/throttling/limites";
import { LinkDeConexaoService } from "./link-de-conexao.service";

/**
 * A página que o cliente abre pelo link, sem login. Quem autentica é o token
 * do link: ele só inicia e consulta o QR, e nada além disso.
 */
@Controller("publico/whatsapp")
export class LinkPublicoController {
  constructor(private readonly links: LinkDeConexaoService) {}

  @Get(":token")
  @Throttle({ default: LINK_PUBLICO })
  situacao(@Param("token") token: string) {
    return this.links.situacao(token);
  }
}
