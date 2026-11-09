import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { FieldGapsService } from './field-gaps.service';

class FieldGapDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  canonicalField?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  inputType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  host?: string;

  @IsIn(['no_answer', 'fill_failed', 'profile_missing'])
  reason!: 'no_answer' | 'fill_failed' | 'profile_missing';
}

class RecordFieldGapsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FieldGapDto)
  gaps!: FieldGapDto[];
}

class ResolveFieldGapDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label!: string;
}

@ApiTags('Field gaps')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('field-gaps')
export class FieldGapsController {
  constructor(private readonly fieldGaps: FieldGapsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record form fields that could not be filled' })
  async record(@Req() req: AuthenticatedRequest, @Body() dto: RecordFieldGapsDto) {
    return this.fieldGaps.record(req.user.id, req.accessToken, dto.gaps);
  }

  @Post('resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a missing field as answered' })
  async resolve(@Req() req: AuthenticatedRequest, @Body() dto: ResolveFieldGapDto) {
    await this.fieldGaps.resolve(req.user.id, req.accessToken, dto.label);
  }
}
