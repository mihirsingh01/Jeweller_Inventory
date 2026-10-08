import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderLineDto {
  @IsUUID()
  @IsNotEmpty()
  item_id: string;

  @IsIn(['PCS', 'KG'])
  @IsNotEmpty()
  unit: 'PCS' | 'KG';

  @IsOptional()
  @IsInt()
  @Min(1)
  pieces?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  weight_kg?: number;

  @IsNumber()
  @Min(0.01)
  rate: number;

  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreateOrderDto {
  @IsIn(['SO', 'PO'])
  @IsNotEmpty()
  type: 'SO' | 'PO'; // Sales Order or Purchase Order

  @IsUUID()
  @IsNotEmpty()
  party_id: string;

  @IsOptional()
  @IsDateString()
  expected_delivery_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines: OrderLineDto[];
}

export class UpdateOrderStatusDto {
  @IsIn(['PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED'])
  @IsNotEmpty()
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';
}
