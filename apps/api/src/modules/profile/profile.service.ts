import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../auth/supabase.service';
import { CvParserService } from './cv-parser.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateWorkExperienceDto, UpdateWorkExperienceDto } from './dto/work-experience.dto';
import { CreateEducationDto, UpdateEducationDto } from './dto/education.dto';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { UpsertSkillDto } from './dto/skill.dto';
import { UpsertWorkEligibilityDto } from './dto/eligibility.dto';
import { UpdatePreferencesDto } from './dto/preferences.dto';
import { ConfirmExtractedDto } from './dto/confirm-extracted.dto';
import type { ExtractedProfileData } from '@arzi-baaz/contracts';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly cvParser: CvParserService,
  ) {}

  /**
   * ============================================================
   * PERSONAL PROFILE
   * ============================================================
   */
  async getProfile(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch profile for ${userId}`, error);
      throw error;
    }

    return data;
  }

  async updateProfile(userId: string, accessToken: string, dto: UpdateProfileDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const payload: Record<string, unknown> = {
      id: userId,
      updated_at: new Date().toISOString(),
    };

    if (dto.fullName !== undefined) payload.full_name = dto.fullName;
    if (dto.email !== undefined) payload.email = dto.email;
    if (dto.phone !== undefined) payload.phone = dto.phone;
    if (dto.location !== undefined) payload.location = dto.location;
    if (dto.country !== undefined) payload.country = dto.country;
    if (dto.linkedinUrl !== undefined) payload.linkedin_url = dto.linkedinUrl;
    if (dto.githubUrl !== undefined) payload.github_url = dto.githubUrl;
    if (dto.portfolioUrl !== undefined) payload.portfolio_url = dto.portfolioUrl;
    if (dto.headline !== undefined) payload.headline = dto.headline;
    if (dto.summary !== undefined) payload.summary = dto.summary;
    if (dto.currentStatus !== undefined) payload.current_status = dto.currentStatus;

    const { data, error } = await client
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update profile for ${userId}`, error);
      throw error;
    }

    return data;
  }

  /**
   * ============================================================
   * AGGREGATED FULL PROFILE
   * ============================================================
   */
  async getFullProfile(userId: string, accessToken: string) {
    const [profile, experiences, education, projects, skills, eligibility, preferences] =
      await Promise.all([
        this.getProfile(userId, accessToken),
        this.getExperiences(userId, accessToken),
        this.getEducation(userId, accessToken),
        this.getProjects(userId, accessToken),
        this.getSkills(userId, accessToken),
        this.getEligibility(userId, accessToken),
        this.getPreferences(userId, accessToken),
      ]);

    return {
      profile,
      experiences,
      education,
      projects,
      skills,
      eligibility,
      preferences,
    };
  }

  /**
   * ============================================================
   * CV INGESTION & EXTRACTION
   * ============================================================
   */
  async extractCv(
    userId: string,
    accessToken: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ): Promise<ExtractedProfileData> {
    this.logger.log(`Extracting CV: ${file.originalname} for user ${userId}`);

    // 1. Extract raw text from file
    const rawText = await this.cvParser.extractText(file.buffer, file.mimetype);

    // 2. Parse structured profile data and factual statements
    const extracted = this.cvParser.parseCv(rawText);

    // 3. Store document reference in private user documents table
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const storagePath = `cvs/${userId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const { data: doc, error: docError } = await client
      .from('documents')
      .insert({
        user_id: userId,
        type: 'cv',
        storage_path: storagePath,
        original_name: file.originalname,
        mime_type: file.mimetype,
      })
      .select()
      .maybeSingle();

    if (docError) {
      this.logger.warn(`Could not save document record for ${userId}: ${docError.message}`);
    }

    return {
      documentId: doc?.id,
      ...extracted,
    };
  }

  /**
   * Commits candidate-confirmed CV data into the user profile and professional_facts knowledge base.
   * Human-in-the-loop guarantee: nothing is committed without user approval.
   */
  async confirmExtractedData(userId: string, accessToken: string, dto: ConfirmExtractedDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    let factsCount = 0;
    let experiencesCount = 0;
    let educationCount = 0;
    let projectsCount = 0;
    let skillsCount = 0;

    // 1. Update personal profile if present
    if (dto.personal) {
      await this.updateProfile(userId, accessToken, dto.personal);
    }

    // 2. Insert confirmed experiences
    if (dto.experiences && dto.experiences.length > 0) {
      const expRows = dto.experiences.map((exp) => ({
        user_id: userId,
        company: exp.company,
        role: exp.role,
        employment_type: exp.employmentType,
        start_date: exp.startDate,
        end_date: exp.endDate,
        is_current: exp.isCurrent ?? false,
        responsibilities: exp.responsibilities ?? [],
        technologies: exp.technologies ?? [],
        achievements: exp.achievements ?? [],
      }));

      const { data, error } = await client.from('work_experiences').insert(expRows).select();
      if (error) this.logger.error('Error inserting confirmed experiences', error);
      else experiencesCount = data?.length ?? 0;
    }

    // 3. Insert confirmed education
    if (dto.education && dto.education.length > 0) {
      const eduRows = dto.education.map((edu) => ({
        user_id: userId,
        institution: edu.institution,
        degree: edu.degree,
        field_of_study: edu.fieldOfStudy,
        start_date: edu.startDate,
        end_date: edu.endDate,
      }));

      const { data, error } = await client.from('education').insert(eduRows).select();
      if (error) this.logger.error('Error inserting confirmed education', error);
      else educationCount = data?.length ?? 0;
    }

    // 4. Insert confirmed projects
    if (dto.projects && dto.projects.length > 0) {
      const projRows = dto.projects.map((proj) => ({
        user_id: userId,
        name: proj.name,
        description: proj.description,
        technologies: proj.technologies ?? [],
        responsibilities: proj.responsibilities ?? [],
        challenges: proj.challenges ?? [],
        solutions: proj.solutions ?? [],
        outcomes: proj.outcomes ?? [],
        project_url: proj.projectUrl,
        github_url: proj.githubUrl,
      }));

      const { data, error } = await client.from('projects').insert(projRows).select();
      if (error) this.logger.error('Error inserting confirmed projects', error);
      else projectsCount = data?.length ?? 0;
    }

    // 5. Insert confirmed skills
    if (dto.skills && dto.skills.length > 0) {
      const skillRows = dto.skills.map((skill) => ({
        user_id: userId,
        name: skill.name.trim(),
        years: skill.years,
        proficiency: skill.proficiency,
        verified: true,
      }));

      const { data, error } = await client.from('skills').insert(skillRows).select();
      if (error) this.logger.error('Error inserting confirmed skills', error);
      else skillsCount = data?.length ?? 0;
    }

    // 6. Insert confirmed professional facts (grounding layer for AI)
    if (dto.facts && dto.facts.length > 0) {
      const factRows = dto.facts.map((fact) => ({
        user_id: userId,
        category: fact.category,
        content: fact.content,
        source: 'user_confirmed',
        confidence: fact.confidence ?? 0.9,
        verified: true,
      }));

      const { data, error } = await client.from('professional_facts').insert(factRows).select();
      if (error) this.logger.error('Error inserting professional facts', error);
      else factsCount = data?.length ?? 0;
    }

    // 7. Update document timestamp if documentId provided
    if (dto.documentId) {
      await client
        .from('documents')
        .update({ extracted_at: new Date().toISOString() })
        .eq('id', dto.documentId)
        .eq('user_id', userId);
    }

    return {
      success: true,
      confirmed: {
        experiences: experiencesCount,
        education: educationCount,
        projects: projectsCount,
        skills: skillsCount,
        facts: factsCount,
      },
    };
  }

  /**
   * ============================================================
   * DOCUMENTS
   * ============================================================
   */
  async getDocuments(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch documents for ${userId}`, error);
      throw error;
    }
    return data ?? [];
  }

  /**
   * ============================================================
   * PROFESSIONAL FACTS
   * ============================================================
   */
  async getFacts(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('professional_facts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch facts for ${userId}`, error);
      throw error;
    }
    return data ?? [];
  }

  async deleteFact(userId: string, factId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { error } = await client
      .from('professional_facts')
      .delete()
      .eq('id', factId)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete fact ${factId}`, error);
      throw error;
    }
    return { success: true };
  }

  /**
   * ============================================================
   * WORK EXPERIENCES
   * ============================================================
   */
  async getExperiences(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('work_experiences')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch experiences for ${userId}`, error);
      throw error;
    }
    return data ?? [];
  }

  async createExperience(userId: string, accessToken: string, dto: CreateWorkExperienceDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('work_experiences')
      .insert({
        user_id: userId,
        company: dto.company,
        role: dto.role,
        employment_type: dto.employmentType,
        start_date: dto.startDate,
        end_date: dto.endDate,
        is_current: dto.isCurrent ?? false,
        responsibilities: dto.responsibilities ?? [],
        technologies: dto.technologies ?? [],
        achievements: dto.achievements ?? [],
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create experience for ${userId}`, error);
      throw error;
    }
    return data;
  }

  async updateExperience(
    userId: string,
    id: string,
    accessToken: string,
    dto: UpdateWorkExperienceDto,
  ) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.company !== undefined) payload.company = dto.company;
    if (dto.role !== undefined) payload.role = dto.role;
    if (dto.employmentType !== undefined) payload.employment_type = dto.employmentType;
    if (dto.startDate !== undefined) payload.start_date = dto.startDate;
    if (dto.endDate !== undefined) payload.end_date = dto.endDate;
    if (dto.isCurrent !== undefined) payload.is_current = dto.isCurrent;
    if (dto.responsibilities !== undefined) payload.responsibilities = dto.responsibilities;
    if (dto.technologies !== undefined) payload.technologies = dto.technologies;
    if (dto.achievements !== undefined) payload.achievements = dto.achievements;

    const { data, error } = await client
      .from('work_experiences')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to update experience ${id}`, error);
      throw error;
    }
    if (!data) throw new NotFoundException('Work experience entry not found');

    return data;
  }

  async deleteExperience(userId: string, id: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { error } = await client
      .from('work_experiences')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete experience ${id}`, error);
      throw error;
    }
    return { success: true };
  }

  /**
   * ============================================================
   * EDUCATION
   * ============================================================
   */
  async getEducation(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('education')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch education for ${userId}`, error);
      throw error;
    }
    return data ?? [];
  }

  async createEducation(userId: string, accessToken: string, dto: CreateEducationDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('education')
      .insert({
        user_id: userId,
        institution: dto.institution,
        degree: dto.degree,
        field_of_study: dto.fieldOfStudy,
        start_date: dto.startDate,
        end_date: dto.endDate,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create education for ${userId}`, error);
      throw error;
    }
    return data;
  }

  async updateEducation(
    userId: string,
    id: string,
    accessToken: string,
    dto: UpdateEducationDto,
  ) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.institution !== undefined) payload.institution = dto.institution;
    if (dto.degree !== undefined) payload.degree = dto.degree;
    if (dto.fieldOfStudy !== undefined) payload.field_of_study = dto.fieldOfStudy;
    if (dto.startDate !== undefined) payload.start_date = dto.startDate;
    if (dto.endDate !== undefined) payload.end_date = dto.endDate;

    const { data, error } = await client
      .from('education')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to update education ${id}`, error);
      throw error;
    }
    if (!data) throw new NotFoundException('Education entry not found');

    return data;
  }

  async deleteEducation(userId: string, id: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { error } = await client
      .from('education')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete education ${id}`, error);
      throw error;
    }
    return { success: true };
  }

  /**
   * ============================================================
   * PROJECTS
   * ============================================================
   */
  async getProjects(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch projects for ${userId}`, error);
      throw error;
    }
    return data ?? [];
  }

  async createProject(userId: string, accessToken: string, dto: CreateProjectDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('projects')
      .insert({
        user_id: userId,
        name: dto.name,
        description: dto.description,
        technologies: dto.technologies ?? [],
        responsibilities: dto.responsibilities ?? [],
        challenges: dto.challenges ?? [],
        solutions: dto.solutions ?? [],
        outcomes: dto.outcomes ?? [],
        project_url: dto.projectUrl,
        github_url: dto.githubUrl,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create project for ${userId}`, error);
      throw error;
    }
    return data;
  }

  async updateProject(userId: string, id: string, accessToken: string, dto: UpdateProjectDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.technologies !== undefined) payload.technologies = dto.technologies;
    if (dto.responsibilities !== undefined) payload.responsibilities = dto.responsibilities;
    if (dto.challenges !== undefined) payload.challenges = dto.challenges;
    if (dto.solutions !== undefined) payload.solutions = dto.solutions;
    if (dto.outcomes !== undefined) payload.outcomes = dto.outcomes;
    if (dto.projectUrl !== undefined) payload.project_url = dto.projectUrl;
    if (dto.githubUrl !== undefined) payload.github_url = dto.githubUrl;

    const { data, error } = await client
      .from('projects')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to update project ${id}`, error);
      throw error;
    }
    if (!data) throw new NotFoundException('Project entry not found');

    return data;
  }

  async deleteProject(userId: string, id: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete project ${id}`, error);
      throw error;
    }
    return { success: true };
  }

  /**
   * ============================================================
   * SKILLS
   * ============================================================
   */
  async getSkills(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('skills')
      .select('*')
      .eq('user_id', userId)
      .order('name');

    if (error) {
      this.logger.error(`Failed to fetch skills for ${userId}`, error);
      throw error;
    }
    return data ?? [];
  }

  async upsertSkill(userId: string, accessToken: string, dto: UpsertSkillDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('skills')
      .insert({
        user_id: userId,
        name: dto.name.trim(),
        years: dto.years,
        proficiency: dto.proficiency,
        verified: dto.verified ?? false,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to upsert skill for ${userId}`, error);
      throw error;
    }
    return data;
  }

  async deleteSkill(userId: string, id: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { error } = await client
      .from('skills')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete skill ${id}`, error);
      throw error;
    }
    return { success: true };
  }

  /**
   * ============================================================
   * WORK ELIGIBILITY
   * ============================================================
   */
  async getEligibility(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('work_eligibility')
      .select('*')
      .eq('user_id', userId)
      .order('country');

    if (error) {
      this.logger.error(`Failed to fetch eligibility for ${userId}`, error);
      throw error;
    }
    return data ?? [];
  }

  async upsertEligibility(userId: string, accessToken: string, dto: UpsertWorkEligibilityDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('work_eligibility')
      .upsert(
        {
          user_id: userId,
          country: dto.country.trim().toUpperCase(),
          legally_authorized: dto.legallyAuthorized ?? null,
          requires_sponsorship: dto.requiresSponsorship ?? null,
          remote_work_allowed: dto.remoteWorkAllowed ?? null,
          willing_to_relocate: dto.willingToRelocate ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id, country' },
      )
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to upsert eligibility for ${userId}`, error);
      throw error;
    }
    return data;
  }

  async deleteEligibility(userId: string, id: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { error } = await client
      .from('work_eligibility')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to delete eligibility ${id}`, error);
      throw error;
    }
    return { success: true };
  }

  /**
   * ============================================================
   * USER PREFERENCES
   * ============================================================
   */
  async getPreferences(userId: string, accessToken: string) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const { data, error } = await client
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch preferences for ${userId}`, error);
      throw error;
    }
    return data;
  }

  async updatePreferences(userId: string, accessToken: string, dto: UpdatePreferencesDto) {
    const client = this.supabase.getAuthenticatedClient(accessToken);
    const payload: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (dto.answerLength !== undefined) payload.answer_length = dto.answerLength;
    if (dto.answerTone !== undefined) payload.answer_tone = dto.answerTone;
    if (dto.answerStyle !== undefined) payload.answer_style = dto.answerStyle;
    if (dto.additionalInstructions !== undefined) {
      payload.additional_instructions = dto.additionalInstructions;
    }

    const { data, error } = await client
      .from('user_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update preferences for ${userId}`, error);
      throw error;
    }
    return data;
  }
}
