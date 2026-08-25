import { Module } from "@nestjs/common";
import { AttributionEngine } from "./attribution-engine";

@Module({
  providers: [AttributionEngine],
  exports: [AttributionEngine],
})
export class AttributionModule {}
