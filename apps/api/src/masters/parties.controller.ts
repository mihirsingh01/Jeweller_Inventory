import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PartiesService, CreatePartyDto, UpdatePartyDto } from './parties.service';
import { Roles, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Masters: Parties')
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Get()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List parties with optional search by name or phone (masked for staff)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'reveal_phone', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('reveal_phone') revealPhone?: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.partiesService.findAll(
      user,
      search,
      type,
      revealPhone === 'true',
      Number(limit),
      Number(offset),
    );
  }

  @Get(':id')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get single party details and current running balance' })
  @ApiQuery({ name: 'reveal_phone', required: false, type: Boolean })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('reveal_phone') revealPhone?: string,
  ) {
    return this.partiesService.findOne(id, user, revealPhone === 'true');
  }

  @Post()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Create a new customer, supplier, or karigar party' })
  create(
    @Body() dto: CreatePartyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.partiesService.create(dto, user);
  }

  @Patch(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Update party details with audit logging (Owner only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.partiesService.update(id, dto, user);
  }
}
