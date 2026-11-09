import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeJobDto {
  @ApiProperty({ description: 'Raw job description text' })
  @IsString()
  @MinLength(50)
  @MaxLength(20_000)
  description!: string;
}
