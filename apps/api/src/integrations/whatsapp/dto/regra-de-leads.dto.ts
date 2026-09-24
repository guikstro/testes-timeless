import { OrigemDosLeads } from "@prisma/client";
import { IsEnum } from "class-validator";

export class RegraDeLeadsDto {
  @IsEnum(OrigemDosLeads)
  origemDosLeads!: OrigemDosLeads;
}
