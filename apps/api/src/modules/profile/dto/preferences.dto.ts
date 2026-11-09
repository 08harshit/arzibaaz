import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: ['short', 'medium', 'detailed'] })
  @IsOptional()
  @IsEnum(['short', 'medium', 'detailed'])
  answerLength?: 'short' | 'medium' | 'detailed';

  @ApiPropertyOptional({ enum: ['natural_professional', 'formal', 'conversational', 'confident'] })
  @IsOptional()
  @IsEnum(['natural_professional', 'formal', 'conversational', 'confident'])
  answerTone?: 'natural_professional' | 'formal' | 'conversational' | 'confident';

  @ApiPropertyOptional({ enum: ['first_person', 'bullet_points', 'paragraph'] })
  @IsOptional()
  @IsEnum(['first_person', 'bullet_points', 'paragraph'])
  answerStyle?: 'first_person' | 'bullet_points' | 'paragraph';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  additionalInstructions?: string;
}
