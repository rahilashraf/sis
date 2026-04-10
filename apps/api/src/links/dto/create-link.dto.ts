import { IsString } from 'class-validator';

export class CreateLinkDto {
  @IsString()
  parentId: string;

  @IsString()
  studentId: string;
}