import { IsOptional, IsString, IsUrl, MinLength } from "class-validator";

export class UpdateTrackingLinkDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  destinationUrl?: string;

  @IsOptional()
  @IsString()
  defaultSource?: string;

  @IsOptional()
  @IsString()
  defaultMedium?: string;

  @IsOptional()
  @IsString()
  defaultCampaign?: string;
}
