import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SalesSource } from "@prisma/client";
import { Request } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Requer } from "../common/permissoes/requer.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { autorDe } from "../auditoria/auditoria.service";
import { SalesService } from "./sales.service";
import { SalesSourcesService } from "./sales-sources.service";
import {
  CreateSourceDto,
  CreateUnitDto,
  ManualSaleDto,
  ReviewSaleDto,
  SalesEventDto,
  SalesQueryDto,
} from "./sales.dto";

@Controller("sales")
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly sources: SalesSourcesService,
  ) {}
  @Get() @Requer("lead.read") list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesQueryDto,
  ) {
    return this.sales.list(user.organizationId, query);
  }
  @Get("analytics") @Requer("analytics.read") analytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SalesQueryDto,
  ) {
    return this.sales.analytics(user.organizationId, query);
  }
  @Get("units") @Requer("lead.read") units(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sources.units(user.organizationId);
  }
  @Post("units") @Requer("settings.manage") createUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUnitDto,
  ) {
    return this.sources.createUnit(autorDe(user), dto);
  }
  @Get("sources") @Requer("integration.read") listSources(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sources.list(user.organizationId);
  }
  @Post("sources") @Requer("apikey.manage") createSource(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSourceDto,
  ) {
    return this.sources.create(autorDe(user), dto);
  }
  @Post("sources/:id/rotate") @Requer("apikey.manage") rotate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.sources.credential(autorDe(user), id, false);
  }
  @Post("sources/:id/revoke") @Requer("apikey.manage") revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.sources.credential(autorDe(user), id, true);
  }
  @Get(":id") @Requer("lead.read") detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.sales.detail(user.organizationId, id);
  }
  @Post() @Requer("lead.manage") manual(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ManualSaleDto,
  ) {
    return this.sales.manual(autorDe(user), dto);
  }
  @Post(":id/review") @Requer("lead.manage") review(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewSaleDto,
  ) {
    return this.sales.review(autorDe(user), id, dto);
  }
}

@Injectable()
export class SalesIntegrationGuard implements CanActivate {
  constructor(private readonly sources: SalesSourcesService) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { salesSource: SalesSource }>();
    request.salesSource = await this.sources.authenticate(
      request.headers.authorization,
    );
    return true;
  }
}

@Controller("integrations/sales")
export class SalesEventsController {
  constructor(private readonly sources: SalesSourcesService) {}
  @Post("events")
  @UseGuards(SalesIntegrationGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  event(
    @Req() request: Request & { salesSource: SalesSource },
    @Body() dto: SalesEventDto,
  ) {
    return this.sources.event(request.salesSource, dto);
  }
}
