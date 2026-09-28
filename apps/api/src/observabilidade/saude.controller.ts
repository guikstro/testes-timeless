import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import { RegistroDeErros } from "./registro-de-erros.service";
import { SaudeDaPlataformaService } from "./saude-da-plataforma.service";

/**
 * A saúde da plataforma, para a equipe Timeless. Mesma porta da
 * administração: operador da plataforma, com segundo fator.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SaudeDaPlataformaController {
  constructor(
    private readonly saude: SaudeDaPlataformaService,
    private readonly erros: RegistroDeErros,
  ) {}

  // A tela se atualiza sozinha; limitar seria cortar justamente quem está olhando um incidente.
  @SkipThrottle()
  @Get("saude")
  resumo() {
    return this.saude.resumo();
  }

  @Get("erros")
  lista(@Query("todos") todos?: string) {
    return this.erros.lista(todos === "1");
  }

  @Post("erros/:id/resolver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolve(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.erros.resolve(id);
  }
}
