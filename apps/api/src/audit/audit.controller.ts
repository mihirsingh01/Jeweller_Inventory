import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators';

@ApiTags('Audit Log')
@Controller('audit')
@Roles('OWNER')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'List immutable audit log trail filtered by user, table, record, and date range (Owner only)',
  })
  @ApiQuery({ name: 'actor_id', required: false, description: 'Filter by user/actor UUID' })
  @ApiQuery({ name: 'user_id', required: false, description: 'Alias for actor_id' })
  @ApiQuery({ name: 'table_name', required: false, description: 'Filter by table name (e.g. sales, purchases, money_vouchers)' })
  @ApiQuery({ name: 'record_id', required: false, description: 'Filter by entity record UUID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action (e.g. CREATE, SOFT_DELETE, UPDATE_STATUS)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date/timestamp' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date/timestamp' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  findAll(
    @Query('actor_id') actorId?: string,
    @Query('user_id') userId?: string,
    @Query('table_name') tableName?: string,
    @Query('record_id') recordId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    const effectiveActorId = actorId || userId;
    return this.auditService.findAll(
      effectiveActorId,
      tableName,
      recordId,
      startDate,
      endDate,
      action,
      Number(limit),
      Number(offset),
    );
  }
}
