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
