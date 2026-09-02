import { IsIn } from "class-validator";
import { MembershipRole } from "@prisma/client";

const PAPEIS: MembershipRole[] = ["OWNER", "ADMIN", "MEMBER"];

export class UpdateMemberDto {
  @IsIn(PAPEIS)
  role!: MembershipRole;
}
