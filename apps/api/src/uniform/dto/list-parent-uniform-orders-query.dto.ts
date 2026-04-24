import { Transform } from 'class-transformer';
import { UniformOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { toOptionalTrimmedString } from './shared';

export class ListParentUniformOrdersQueryDto {
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsEnum(UniformOrderStatus)
  status?: UniformOrderStatus;
}
