import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './orders.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Orders (SO & PO)')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List sales or purchase orders with staff scoping (Req 6, 7)' })
  @ApiQuery({ name: 'type', enum: ['SO', 'PO'], required: true })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED'] })
  @ApiQuery({ name: 'party_id', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  findAll(
    @Query('type') type: 'SO' | 'PO' = 'SO',
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('party_id') partyId?: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.ordersService.findAll(type, user, status, partyId, Number(limit), Number(offset));
  }

  @Get(':id')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get single order by ID with line items' })
  @ApiQuery({ name: 'type', enum: ['SO', 'PO'], required: true })
  findOne(
    @Param('id') id: string,
    @Query('type') type: 'SO' | 'PO' = 'SO',
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.findOne(type, id, user);
  }

  @Post()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Create Sales Order or Purchase Order (no ledger or stock impact)' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.create(dto, user);
  }

  @Post(':id/convert')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Convert order to bill with prefilled items (Req 6, 7)' })
  @ApiQuery({ name: 'type', enum: ['SO', 'PO'], required: true })
  convertToBill(
    @Param('id') id: string,
    @Query('type') type: 'SO' | 'PO' = 'SO',
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.convertToBill(type, id, user);
  }

  @Patch(':id/status')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Update order status (PENDING, PARTIAL, COMPLETED, CANCELLED)' })
  @ApiQuery({ name: 'type', enum: ['SO', 'PO'], required: true })
  updateStatus(
    @Param('id') id: string,
    @Query('type') type: 'SO' | 'PO' = 'SO',
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.updateStatus(type, id, dto, user);
  }

  @Delete(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Soft delete order (Owner only)' })
  @ApiQuery({ name: 'type', enum: ['SO', 'PO'], required: true })
  remove(
    @Param('id') id: string,
    @Query('type') type: 'SO' | 'PO' = 'SO',
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.softDelete(type, id, user);
  }
}
