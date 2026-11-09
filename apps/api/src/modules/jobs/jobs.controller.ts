import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { JobsService } from './jobs.service';
import { AnalyzeJobDto } from './dto/analyze-job.dto';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('analyze')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze a job description and extract structured context' })
  async analyze(
    @Req() _req: AuthenticatedRequest,
    @Body() dto: AnalyzeJobDto,
  ) {
    return this.jobsService.analyzeJobDescription(dto.description);
  }
}
