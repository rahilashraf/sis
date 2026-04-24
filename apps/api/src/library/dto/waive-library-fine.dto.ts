import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { toNullableTrimmedString } from './shared';

export class WaiveLibraryFineDto {
  @Transform(({ value }) => toNullableTrimmedString(value))
  @IsOptional()
  @IsString()
  reason?: string | null;
}
