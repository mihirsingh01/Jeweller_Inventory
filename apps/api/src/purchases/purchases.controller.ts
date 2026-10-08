import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto, UpdatePurchaseDto } from './purchases.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Purchase Entries')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List purchases with staff isolation' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.purchasesService.findAll(user, Number(limit), Number(offset));
  }

  @Get(':id')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get single purchase entry with lines' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.purchasesService.findOne(id, user);
  }

  @Post()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Create new purchase entry (adds stock & ledger credit)' })
  create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchasesService.create(dto, user);
  }

  @Patch(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Edit purchase with reversing rows and audit log (Owner only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchasesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Soft-delete purchase entry with reversing rows (Owner only)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.purchasesService.softDelete(id, user);
  }
}
