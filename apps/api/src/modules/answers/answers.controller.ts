import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { AnswersService } from './answers.service';
import { GenerateAnswerDto, RefineAnswerDto } from './dto/answer.dto';
import type { QuestionCategory } from '@arzi-baaz/contracts';

@ApiTags('Answers')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('answers')
export class AnswersController {
  constructor(private readonly answersService: AnswersService) {}

  // One-click form fill can request an answer per field, so this is higher than other AI routes.
  @Post('generate')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a personalized answer for an application question' })
  async generate(@Req() req: AuthenticatedRequest, @Body() dto: GenerateAnswerDto) {
    return this.answersService.generateAnswer(req.user.id, req.accessToken, dto);
  }

  @Post('refine')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refine an existing answer based on user instructions' })
  async refine(@Req() req: AuthenticatedRequest, @Body() dto: RefineAnswerDto) {
    return this.answersService.refineAnswer(req.user.id, req.accessToken, dto);
  }

  /**
   * Milestone 7: Answer Library Endpoints
   * NOTE: static routes (library/suggest) must stay above library/:id.
   */

  @Post('library/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save a generated answer to the user library' })
  async saveToLibrary(
    @Req() req: AuthenticatedRequest,
    @Body()
    dto: {
      generatedAnswerId: string;
      category: QuestionCategory;
      tags?: string[];
    },
  ) {
    return this.answersService.saveAnswerToLibrary(
      req.user.id,
      req.accessToken,
      dto.generatedAnswerId,
      dto.category,
      dto.tags,
    );
  }

  @Post('library')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save an answer typed by the user for a question' })
  async createLibraryAnswer(
    @Req() req: AuthenticatedRequest,
    @Body()
    dto: {
      content: string;
      questionText: string;
      category?: QuestionCategory;
      tags?: string[];
    },
  ) {
    if (!dto.content?.trim() || !dto.questionText?.trim()) {
      throw new BadRequestException('content and questionText are required');
    }
    return this.answersService.createSavedAnswer(
      req.user.id,
      req.accessToken,
      dto.content.trim().slice(0, 5000),
      dto.questionText.trim().slice(0, 300),
      dto.category ?? 'unknown',
      dto.tags,
    );
  }

  @Get('library')
  @ApiOperation({ summary: 'List saved answers from library' })
  async getLibrary(
    @Req() req: AuthenticatedRequest,
    @Query('category') category?: QuestionCategory,
    @Query('search') search?: string,
  ) {
    return this.answersService.getSavedAnswers(req.user.id, req.accessToken, category, search);
  }

  @Get('library/suggest')
  @ApiOperation({ summary: 'Suggest library answers for a new question' })
  async suggestFromLibrary(
    @Req() req: AuthenticatedRequest,
    @Query('question') question?: string,
    @Query('category') category?: QuestionCategory,
  ) {
    if (!question?.trim()) return [];
    return this.answersService.suggestSavedAnswers(req.user.id, req.accessToken, question, category);
  }

  @Post('library/:id/use')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Use a library answer for a question (creates a refinable answer)' })
  async useLibraryAnswer(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: { question: string; questionId: string },
  ) {
    return this.answersService.useLibraryAnswer(
      req.user.id,
      req.accessToken,
      id,
      dto.question,
      dto.questionId,
    );
  }

  @Get('library/:id')
  @ApiOperation({ summary: 'Get a specific saved answer from library' })
  async getLibraryAnswer(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.answersService.getSavedAnswer(req.user.id, req.accessToken, id);
  }

  @Delete('library/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete (soft) a saved answer from library' })
  async deleteLibraryAnswer(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.answersService.deleteSavedAnswer(req.user.id, req.accessToken, id);
  }

  /**
   * Milestone 7: Application History Endpoints
   */

  @Post('applications/history')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save completed application to history' })
  async saveApplicationHistory(
    @Req() req: AuthenticatedRequest,
    @Body()
    dto: {
      jobTitle: string;
      company: string;
      jobUrl?: string;
      generatedAnswerIds?: string[];
    },
  ) {
    return this.answersService.saveApplicationHistory(
      req.user.id,
      req.accessToken,
      dto.jobTitle,
      dto.company,
      dto.jobUrl,
      dto.generatedAnswerIds,
    );
  }

  @Get('applications/history')
  @ApiOperation({ summary: 'Get application history' })
  async getApplicationHistory(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.answersService.getApplicationHistory(
      req.user.id,
      req.accessToken,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('applications/history/:id')
  @ApiOperation({ summary: 'Get one application with the answers used' })
  async getApplicationDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.answersService.getApplicationDetail(req.user.id, req.accessToken, id);
  }

  @Patch('applications/history/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an application as draft or submitted' })
  async updateApplicationStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: { status: 'draft' | 'submitted' },
  ) {
    if (dto.status !== 'draft' && dto.status !== 'submitted') {
      throw new BadRequestException('status must be "draft" or "submitted"');
    }
    return this.answersService.updateApplicationStatus(
      req.user.id,
      req.accessToken,
      id,
      dto.status,
    );
  }
}
