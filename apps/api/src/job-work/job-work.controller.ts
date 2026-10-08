import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobWorkService } from './job-work.service';
import { CreateJobWorkDto, UpdateJobWorkDto } from './job-work.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Job Work: Polish & Meena')
@Controller('job-work')
export class JobWorkController {
  constructor(private readonly jobWorkService: JobWorkService) {}

  @Get()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List job work entries with staff isolation' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
    @Query('work_type') workType?: string,
  ) {
    return this.jobWorkService.findAll(user, Number(limit), Number(offset), workType);
  }

  @Get('balances')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get current net job work balances per party and item (Kg issued - received)' })
  getBalances() {
    return this.jobWorkService.getBalances();
  }

  @Get('pending/:partyId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get pending issued lines for a specific Karigar' })
  getPendingLines(
    @Param('partyId') partyId: string,
    @CurrentUser() user: AuthUser,
    @Query('work_type') workType?: string,
  ) {
    return this.jobWorkService.getPendingIssueLines(partyId, user, workType);
  }

  @Get(':id')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get single job work entry' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jobWorkService.findOne(id, user);
  }

  @Post()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Create new Polish or Meena job work issue or receive entry' })
  create(
    @Body() dto: CreateJobWorkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobWorkService.create(dto, user);
  }

  @Patch(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Edit job work entry with reversing rows and audit log (Owner only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateJobWorkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobWorkService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Soft-delete job work entry with reversing rows (Owner only)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jobWorkService.softDelete(id, user);
  }
}
