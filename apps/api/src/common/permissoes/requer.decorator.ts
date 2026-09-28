import { SetMetadata } from "@nestjs/common";
import { Capacidade } from "./capacidades";

export const CAPACIDADE_KEY = "capacidade";

/**
 * A capacidade que a rota exige, conferida pelo `JwtAuthGuard`. No método
 * vale mais que na classe. Sem argumento, libera a rota para todos dentro de
 * um controller restrito.
 */
export const Requer = (capacidade?: Capacidade) => SetMetadata(CAPACIDADE_KEY, capacidade ?? null);
