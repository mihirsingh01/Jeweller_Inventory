import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class JobWorkLineDto {
  @IsOptional()
  @IsUUID()
  issue_line_id?: string;

  @IsOptional()
  @IsUUID()
  item_id?: string;

  @IsOptional()
  @IsString()
  unit?: 'PCS' | 'KG';

  @IsOptional()
  @IsNumber()
  @Min(0)
  pieces?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight_kg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  labour_charge?: number;

  @IsOptional()
  @IsBoolean()
  is_closed?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateJobWorkDto {
  @IsEnum(['POLISH', 'MEENA'])
  @IsNotEmpty()
  work_type: 'POLISH' | 'MEENA';

  @IsUUID()
  @IsNotEmpty()
  party_id: string;

  @IsEnum(['ISSUE', 'RECEIVE'])
  @IsNotEmpty()
  direction: 'ISSUE' | 'RECEIVE';

  @IsOptional()
  @IsUUID()
  issue_id?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  // Single line legacy compatibility
  @IsOptional()
  @IsUUID()
  item_id?: string;

  @IsOptional()
  @IsNumber()
  weight_kg?: number;

  @IsOptional()
  @IsNumber()
  charge_amount?: number;

  // Multi-line support (Req 30, 32)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobWorkLineDto)
  lines?: JobWorkLineDto[];
}

export class UpdateJobWorkDto {
  @IsOptional()
  @IsEnum(['ISSUE', 'RECEIVE'])
  direction?: 'ISSUE' | 'RECEIVE';

  @IsOptional()
  @IsNumber()
  weight_kg?: number;

  @IsOptional()
  @IsNumber()
  charge_amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobWorkLineDto)
  lines?: JobWorkLineDto[];
}
