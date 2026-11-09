import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class AnswerPreferencesDto {
  @ApiPropertyOptional({ enum: ['short', 'medium', 'detailed'] })
  @IsOptional()
  @IsEnum(['short', 'medium', 'detailed'])
  length?: 'short' | 'medium' | 'detailed';

  @ApiPropertyOptional({ enum: ['natural_professional', 'formal', 'conversational', 'confident'] })
  @IsOptional()
  @IsEnum(['natural_professional', 'formal', 'conversational', 'confident'])
  tone?: 'natural_professional' | 'formal' | 'conversational' | 'confident';

  @ApiPropertyOptional({ enum: ['first_person', 'bullet_points', 'paragraph'] })
  @IsOptional()
  @IsEnum(['first_person', 'bullet_points', 'paragraph'])
  style?: 'first_person' | 'bullet_points' | 'paragraph';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalInstructions?: string;
}

class FieldConstraintsDto {
  @ApiPropertyOptional({ description: 'Exact choices the form field accepts' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'True when the field takes a bare value, not prose' })
  @IsOptional()
  @IsBoolean()
  shortAnswer?: boolean;
}

export class GenerateAnswerDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  question!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldConstraintsDto)
  fieldConstraints?: FieldConstraintsDto;

  @ApiProperty()
  @IsString()
  questionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  jobContext?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => AnswerPreferencesDto)
  preferences?: AnswerPreferencesDto;
}

export class RefineAnswerDto {
  @ApiProperty()
  @IsUUID()
  answerId!: string;

  @ApiProperty({ example: 'Make this sound more natural and concise.' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  instruction!: string;
}
