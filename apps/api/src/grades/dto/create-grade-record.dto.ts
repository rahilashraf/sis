import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateGradeRecordDto {
  @IsString()
  classId: string;

  @IsString()
  studentId: string;

  @IsString()
  title: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  score: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxScore: number;

  @IsDateString()
  gradedAt: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
