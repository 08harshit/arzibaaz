import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateProfileDto } from './update-profile.dto';
import { CreateWorkExperienceDto } from './work-experience.dto';
import { CreateEducationDto } from './education.dto';
import { CreateProjectDto } from './project.dto';
import { UpsertSkillDto } from './skill.dto';

class ExtractedFactDto {
  @IsString()
  category!: 'skill' | 'achievement' | 'responsibility' | 'project' | 'experience' | 'education' | 'preference';

  @IsString()
  content!: string;

  @IsNumber()
  confidence!: number;
}

export class ConfirmExtractedDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ type: () => UpdateProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProfileDto)
  personal?: UpdateProfileDto;

  @ApiPropertyOptional({ type: () => [CreateWorkExperienceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkExperienceDto)
  experiences?: CreateWorkExperienceDto[];

  @ApiPropertyOptional({ type: () => [CreateEducationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEducationDto)
  education?: CreateEducationDto[];

  @ApiPropertyOptional({ type: () => [CreateProjectDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProjectDto)
  projects?: CreateProjectDto[];

  @ApiPropertyOptional({ type: () => [UpsertSkillDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertSkillDto)
  skills?: UpsertSkillDto[];

  @ApiPropertyOptional({ type: () => [ExtractedFactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractedFactDto)
  facts?: ExtractedFactDto[];
}
