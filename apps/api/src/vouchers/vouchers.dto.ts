import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class AllocationItemDto {
  @IsOptional()
  @IsUUID()
  sale_id?: string;

  @IsOptional()
  @IsUUID()
  purchase_id?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreateVoucherDto {
  @IsIn(['RECEIPT', 'PAYMENT'])
  @IsNotEmpty()
  kind: 'RECEIPT' | 'PAYMENT';

  @IsUUID()
  @IsNotEmpty()
  party_id: string;

  @IsIn(['CASH', 'BANK'])
  @IsNotEmpty()
  mode: 'CASH' | 'BANK';

  @IsOptional()
  @IsUUID()
  bank_account_id?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reference_no?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  allocations?: AllocationItemDto[];
}

export class UpdateVoucherDto {
  @IsOptional()
  @IsIn(['RECEIPT', 'PAYMENT'])
  kind?: 'RECEIPT' | 'PAYMENT';

  @IsOptional()
  @IsUUID()
  party_id?: string;

  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  mode?: 'CASH' | 'BANK';

  @IsOptional()
  @IsUUID()
  bank_account_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  reference_no?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  allocations?: AllocationItemDto[];
}

