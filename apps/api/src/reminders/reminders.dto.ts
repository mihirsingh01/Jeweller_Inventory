import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateManualReminderDto {
  @IsUUID()
  @IsNotEmpty()
  party_id: string;

  @IsDateString()
  @IsNotEmpty()
  reminder_date: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateReminderStatusDto {
  @IsIn(['PENDING', 'SENT', 'COMPLETED', 'CANCELLED', 'DISMISSED'])
  @IsNotEmpty()
  status: 'PENDING' | 'SENT' | 'COMPLETED' | 'CANCELLED' | 'DISMISSED';
}

export class ListRemindersQueryDto {
  @IsOptional()
  @IsIn(['ALL', 'TODAY', 'OVERDUE', 'UPCOMING', 'COMPLETED'])
  filter?: 'ALL' | 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'COMPLETED';

  @IsOptional()
  @IsIn(['PENDING', 'SENT', 'COMPLETED', 'CANCELLED', 'DISMISSED'])
  status?: 'PENDING' | 'SENT' | 'COMPLETED' | 'CANCELLED' | 'DISMISSED';

  @IsOptional()
  @IsUUID()
  party_id?: string;
}
