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

export class PurchaseLineDto {
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

export class CreatePurchaseDto {
  @IsUUID()
  @IsNotEmpty()
  party_id: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  narration?: string;

  @IsOptional()
  @IsUUID()
  order_id?: string;

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
  @Type(() => PurchaseLineDto)
  lines: PurchaseLineDto[];
}

export class UpdatePurchaseDto {
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  narration?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines?: PurchaseLineDto[];
}
