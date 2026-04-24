import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumberString, IsString, Matches, Min } from 'class-validator';
import { LibraryLateFineFrequency } from '@prisma/client';
import { toTrimmedString } from './shared';

export class UpsertLibraryFineSettingsDto {
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  schoolId: string;

  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'lateFineAmount must be a positive number with at most 2 decimal places',
  })
  lateFineAmount: string;

  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'lostItemFineAmount must be a positive number with at most 2 decimal places',
  })
  lostItemFineAmount: string;

  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'unclaimedHoldFineAmount must be a positive number with at most 2 decimal places',
  })
  unclaimedHoldFineAmount: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  lateFineGraceDays: number;

  @IsEnum(LibraryLateFineFrequency)
  lateFineFrequency: LibraryLateFineFrequency;
}
