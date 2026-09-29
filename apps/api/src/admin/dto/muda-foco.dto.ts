import { IsIn } from "class-validator";
import { FocoDoCliente } from "@prisma/client";

export class MudaFocoDto {
  @IsIn(["LEADS", "PRESENCA_LOCAL", "AMBOS"], { message: "Escolha leads, presença local ou os dois." })
  foco!: FocoDoCliente;
}
