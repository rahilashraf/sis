import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { toNullableTrimmedString, toTrimmedString } from './shared';

export class CreateLibraryHoldDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  itemId: string;

  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
