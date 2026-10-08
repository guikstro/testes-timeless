import { Module } from "@nestjs/common";
import { ConversionEventsModule } from "../integrations/meta/conversion-events.module";
import {
  SalesController,
  SalesEventsController,
  SalesIntegrationGuard,
} from "./sales.controller";
import { SalesSourcesService } from "./sales-sources.service";
import { SalesService } from "./sales.service";
import { DeterministicSaleClassifier, SaleClassifier } from "./sale-classifier";

@Module({
  imports: [ConversionEventsModule],
  controllers: [SalesController, SalesEventsController],
  providers: [
    SalesService,
    SalesSourcesService,
    SalesIntegrationGuard,
    { provide: SaleClassifier, useClass: DeterministicSaleClassifier },
  ],
  exports: [SalesService, SaleClassifier],
})
export class SalesModule {}
