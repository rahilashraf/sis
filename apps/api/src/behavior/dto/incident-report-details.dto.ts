import { Type } from 'class-transformer';
import {
  IncidentAffectedPersonType,
  IncidentFirstAidStatus,
  IncidentJhscNotificationStatus,
  IncidentPostDestination,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IncidentWitnessDto } from './incident-witness.dto';

export class IncidentReportDetailsDto {
  @IsOptional()
  @IsString()
  program?: string;

  @IsOptional()
  @IsString()
  reporterName?: string;

  @IsOptional()
  @IsString()
  reporterEmail?: string;

  @IsOptional()
  @IsString()
  reporterRole?: string;

  @IsOptional()
  @IsEnum(IncidentAffectedPersonType)
  affectedPersonType?: IncidentAffectedPersonType;

  @IsOptional()
  @IsString()
  affectedPersonName?: string;

  @IsOptional()
  @IsString()
  affectedPersonAddress?: string;

  @IsOptional()
  @IsDateString()
  affectedPersonDateOfBirth?: string;

  @IsOptional()
  @IsString()
  affectedPersonPhone?: string;

  @IsOptional()
  @IsEnum(IncidentFirstAidStatus)
  firstAidStatus?: IncidentFirstAidStatus;

  @IsOptional()
  @IsString()
  firstAidAdministeredBy?: string;

  @IsOptional()
  @IsString()
  firstAidAdministeredByPhone?: string;

  @IsOptional()
  @IsString()
  firstAidDetails?: string;

  @IsOptional()
  @IsBoolean()
  isIncidentTimeApproximate?: boolean;

  @IsOptional()
  @IsEnum(IncidentPostDestination)
  postIncidentDestination?: IncidentPostDestination;

  @IsOptional()
  @IsString()
  postIncidentDestinationOther?: string;

  @IsOptional()
  @IsEnum(IncidentJhscNotificationStatus)
  jhscNotificationStatus?: IncidentJhscNotificationStatus;

  @IsOptional()
  @IsString()
  additionalNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IncidentWitnessDto)
  witnesses?: IncidentWitnessDto[];
}
