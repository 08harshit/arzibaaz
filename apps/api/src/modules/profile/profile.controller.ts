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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateWorkExperienceDto, UpdateWorkExperienceDto } from './dto/work-experience.dto';
import { CreateEducationDto, UpdateEducationDto } from './dto/education.dto';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { UpsertSkillDto } from './dto/skill.dto';
import { UpsertWorkEligibilityDto } from './dto/eligibility.dto';
import { UpdatePreferencesDto } from './dto/preferences.dto';
import { ConfirmExtractedDto } from './dto/confirm-extracted.dto';

@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * ============================================================
   * CV INGESTION & DOCUMENT EXTRACTION
   * ============================================================
   */
  @Post('extract')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Extract structured information from an uploaded CV document' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async extractCv(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('CV document file is required');
    }
    return this.profileService.extractCv(req.user.id, req.accessToken, file);
  }

  @Post('confirm-extracted')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm and commit user-reviewed CV data into profile & knowledge base' })
  async confirmExtracted(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmExtractedDto,
  ) {
    return this.profileService.confirmExtractedData(req.user.id, req.accessToken, dto);
  }

  @Get('documents')
  @ApiOperation({ summary: "List user's uploaded documents" })
  async getDocuments(@Req() req: AuthenticatedRequest) {
    return this.profileService.getDocuments(req.user.id, req.accessToken);
  }

  @Get('facts')
  @ApiOperation({ summary: "List verified professional facts for AI grounding" })
  async getFacts(@Req() req: AuthenticatedRequest) {
    return this.profileService.getFacts(req.user.id, req.accessToken);
  }

  @Delete('facts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a professional fact' })
  async deleteFact(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profileService.deleteFact(req.user.id, id, req.accessToken);
  }

  /**
   * ============================================================
   * PERSONAL PROFILE
   * ============================================================
   */
  @Get()
  @ApiOperation({ summary: "Get the authenticated user's personal profile" })
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.profileService.getProfile(req.user.id, req.accessToken);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update the authenticated user's personal profile" })
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(req.user.id, req.accessToken, dto);
  }

  @Get('full')
  @ApiOperation({ summary: "Get the authenticated user's complete aggregated profile" })
  async getFullProfile(@Req() req: AuthenticatedRequest) {
    return this.profileService.getFullProfile(req.user.id, req.accessToken);
  }

  /**
   * ============================================================
   * WORK EXPERIENCES
   * ============================================================
   */
  @Get('experiences')
  @ApiOperation({ summary: "List work experiences" })
  async getExperiences(@Req() req: AuthenticatedRequest) {
    return this.profileService.getExperiences(req.user.id, req.accessToken);
  }

  @Post('experiences')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a work experience entry" })
  async createExperience(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateWorkExperienceDto,
  ) {
    return this.profileService.createExperience(req.user.id, req.accessToken, dto);
  }

  @Patch('experiences/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update a work experience entry" })
  async updateExperience(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateWorkExperienceDto,
  ) {
    return this.profileService.updateExperience(req.user.id, id, req.accessToken, dto);
  }

  @Delete('experiences/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a work experience entry" })
  async deleteExperience(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profileService.deleteExperience(req.user.id, id, req.accessToken);
  }

  /**
   * ============================================================
   * EDUCATION
   * ============================================================
   */
  @Get('education')
  @ApiOperation({ summary: "List education entries" })
  async getEducation(@Req() req: AuthenticatedRequest) {
    return this.profileService.getEducation(req.user.id, req.accessToken);
  }

  @Post('education')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create an education entry" })
  async createEducation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateEducationDto,
  ) {
    return this.profileService.createEducation(req.user.id, req.accessToken, dto);
  }

  @Patch('education/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update an education entry" })
  async updateEducation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEducationDto,
  ) {
    return this.profileService.updateEducation(req.user.id, id, req.accessToken, dto);
  }

  @Delete('education/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete an education entry" })
  async deleteEducation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profileService.deleteEducation(req.user.id, id, req.accessToken);
  }

  /**
   * ============================================================
   * PROJECTS
   * ============================================================
   */
  @Get('projects')
  @ApiOperation({ summary: "List projects" })
  async getProjects(@Req() req: AuthenticatedRequest) {
    return this.profileService.getProjects(req.user.id, req.accessToken);
  }

  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a project entry" })
  async createProject(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateProjectDto,
  ) {
    return this.profileService.createProject(req.user.id, req.accessToken, dto);
  }

  @Patch('projects/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update a project entry" })
  async updateProject(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.profileService.updateProject(req.user.id, id, req.accessToken, dto);
  }

  @Delete('projects/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a project entry" })
  async deleteProject(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profileService.deleteProject(req.user.id, id, req.accessToken);
  }

  /**
   * ============================================================
   * SKILLS
   * ============================================================
   */
  @Get('skills')
  @ApiOperation({ summary: "List skills" })
  async getSkills(@Req() req: AuthenticatedRequest) {
    return this.profileService.getSkills(req.user.id, req.accessToken);
  }

  @Post('skills')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Add a skill" })
  async upsertSkill(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpsertSkillDto,
  ) {
    return this.profileService.upsertSkill(req.user.id, req.accessToken, dto);
  }

  @Delete('skills/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a skill" })
  async deleteSkill(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profileService.deleteSkill(req.user.id, id, req.accessToken);
  }

  /**
   * ============================================================
   * WORK ELIGIBILITY
   * ============================================================
   */
  @Get('eligibility')
  @ApiOperation({ summary: "List work eligibility entries" })
  async getEligibility(@Req() req: AuthenticatedRequest) {
    return this.profileService.getEligibility(req.user.id, req.accessToken);
  }

  @Post('eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Create or update work eligibility for a country" })
  async upsertEligibility(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpsertWorkEligibilityDto,
  ) {
    return this.profileService.upsertEligibility(req.user.id, req.accessToken, dto);
  }

  @Delete('eligibility/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a work eligibility entry" })
  async deleteEligibility(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.profileService.deleteEligibility(req.user.id, id, req.accessToken);
  }

  /**
   * ============================================================
   * PREFERENCES
   * ============================================================
   */
  @Get('preferences')
  @ApiOperation({ summary: "Get answer generation preferences" })
  async getPreferences(@Req() req: AuthenticatedRequest) {
    return this.profileService.getPreferences(req.user.id, req.accessToken);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update answer generation preferences" })
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.profileService.updatePreferences(req.user.id, req.accessToken, dto);
  }
}
