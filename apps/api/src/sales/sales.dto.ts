import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleLineItemDto {
  @IsUUID()
  @IsNotEmpty()
  item_id: string;

  @IsNumber()
  @Min(0)
  pieces: number;

  @IsNumber()
  @Min(0)
  weight_kg: number;

  @IsNumber()
  @Min(0)
  rate: number;

  @IsOptional()
  @IsString()
  unit?: 'PCS' | 'KG';

  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class CreateSaleDto {
  @IsUUID()
  @IsNotEmpty()
  party_id: string;

  @IsDateString()
  @IsNotEmpty()
  due_date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsString()
  discount_type?: 'AMOUNT' | 'PERCENT';

  @IsOptional()
  @IsNumber()
  discount_value?: number;

  @IsOptional()
  @IsNumber()
  discount_amount?: number;

  @IsOptional()
  @IsNumber()
  taxable_amount?: number;

  @IsOptional()
  @IsNumber()
  gst_rate?: number;

  @IsOptional()
  @IsNumber()
  gst_amount?: number;

  @IsOptional()
  @IsNumber()
  transport_charges?: number;

  @IsOptional()
  @IsNumber()
  packaging_charges?: number;

  @IsOptional()
  @IsNumber()
  other_charges?: number;

  @IsOptional()
  @IsNumber()
  round_off?: number;

  @IsOptional()
  @IsNumber()
  total_amount?: number;

  @IsOptional()
  reminder?: {
    enabled: boolean;
    reminder_date: string;
    amount?: number;
    notes?: string;
  };

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleLineItemDto)
  lines: SaleLineItemDto[];
}

export class UpdateSaleDto {
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleLineItemDto)
  lines?: SaleLineItemDto[];
}
