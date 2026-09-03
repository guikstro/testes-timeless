import { Module } from "@nestjs/common";
import { TelemetriaController } from "./telemetria.controller";

@Module({ controllers: [TelemetriaController] })
export class TelemetriaModule {}
