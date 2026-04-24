import { Transform } from 'class-transformer';
import { UniformOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { toOptionalTrimmedString } from './shared';

export class ListUniformOrdersQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsEnum(UniformOrderStatus)
  status?: UniformOrderStatus;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  studentId?: string;

  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  parentId?: string;
}
