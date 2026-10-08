import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../common/dto/pagination.dto";

export class SalesEventDto {
  @IsOptional() @IsUUID() saleId?: string;
  @IsString() @Matches(/\S/) @MaxLength(200) externalId!: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(200) eventId?: string;
  @IsIn(["WON", "LOST", "CANCELLED", "REFUNDED"]) status!:
    | "WON"
    | "LOST"
    | "CANCELLED"
    | "REFUNDED";
  @IsOptional() @IsString() @Matches(/^\+?[\d\s().-]{7,30}$/) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsString() @MaxLength(200) customerExternalId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) valueCents?: number;
  @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(60) unitCode?: string;
  @IsOptional() @IsString() @MaxLength(200) customerName?: string;
  @IsOptional() @IsString() @MaxLength(200) lossReason?: string;
}
export class ManualSaleDto {
  @IsUUID() requestId!: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsString() @Matches(/^\+?[\d\s().-]{7,30}$/) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(200) customerName?: string;
  @IsInt() @Min(0) @Max(2147483647) valueCents!: number;
  @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(60) unitCode?: string;
  @IsOptional() @IsString() @MaxLength(200) product?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class ReviewSaleDto {
  @IsUUID() requestId!: string;
  @IsIn(["CONFIRM", "REJECT", "CANCEL", "RESOLVE", "LINK"]) action!:
    | "CONFIRM"
    | "REJECT"
    | "CANCEL"
    | "RESOLVE"
    | "LINK";
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) valueCents?: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsUUID() selectedEvidenceId?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class CreateSourceDto {
  @IsString() @Matches(/\S/) @MaxLength(100) name!: string;
  @IsIn(["CRM", "PAYMENT", "ERP", "ECOMMERCE", "API"]) type!:
    | "CRM"
    | "PAYMENT"
    | "ERP"
    | "ECOMMERCE"
    | "API";
  @IsOptional() @IsString() @MaxLength(60) unitCode?: string;
}
export class CreateUnitDto {
  @IsString() @Matches(/\S/) @MaxLength(100) name!: string;
  @Matches(/^[a-z0-9_-]{1,60}$/) code!: string;
}
export class SalesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["POSSIBLE", "PROBABLE", "CONFIRMED", "REJECTED", "CANCELLED"])
  status?: "POSSIBLE" | "PROBABLE" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  @IsOptional() @IsIn(["1"]) review?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
}
