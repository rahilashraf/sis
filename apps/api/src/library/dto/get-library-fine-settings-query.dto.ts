import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { toTrimmedString } from './shared';

export class GetLibraryFineSettingsQueryDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;
}
