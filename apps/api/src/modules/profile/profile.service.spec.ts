import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { SupabaseService } from '../auth/supabase.service';
import { CvParserService } from './cv-parser.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let supabaseMock: { getAuthenticatedClient: ReturnType<typeof vi.fn> };
  let cvParserMock: { extractText: ReturnType<typeof vi.fn>; parseCv: ReturnType<typeof vi.fn> };
  let queryBuilderMock: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    queryBuilderMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    supabaseMock = {
      getAuthenticatedClient: vi.fn().mockReturnValue(queryBuilderMock),
    };

    cvParserMock = {
      extractText: vi.fn().mockResolvedValue('Sample CV text'),
      parseCv: vi.fn().mockReturnValue({
        rawText: 'Sample CV text',
        personal: { fullName: 'Alex Mercer', email: 'alex@example.com' },
        skills: [{ name: 'TypeScript', proficiency: 'intermediate', verified: false }],
        education: [{ institution: 'UC Berkeley', degree: 'B.S. CS', endDate: '2018' }],
        experiences: [
          {
            company: 'Acme',
            role: 'Dev',
            isCurrent: true,
            responsibilities: [],
            technologies: [],
            achievements: [],
          },
        ],
        projects: [{ name: 'CloudScale', description: 'Agent' }],
        facts: [{ category: 'skill', content: 'TypeScript experience', confidence: 0.9 }],
      }),
    };

    service = new ProfileService(
      supabaseMock as unknown as SupabaseService,
      cvParserMock as unknown as CvParserService,
    );
  });

  describe('Personal Profile', () => {
    it('fetches profile scoped to authenticated userId', async () => {
      const mockProfile = { id: 'user-1', full_name: 'Harshit Example', email: 'harshit@test.com' };
      queryBuilderMock.maybeSingle.mockResolvedValueOnce({ data: mockProfile, error: null });

      const result = await service.getProfile('user-1', 'token-123');

      expect(supabaseMock.getAuthenticatedClient).toHaveBeenCalledWith('token-123');
      expect(queryBuilderMock.from).toHaveBeenCalledWith('profiles');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('id', 'user-1');
      expect(result).toEqual(mockProfile);
    });

    it('updates profile using upsert scoped to userId', async () => {
      const updated = { id: 'user-1', full_name: 'New Name' };
      queryBuilderMock.single.mockResolvedValueOnce({ data: updated, error: null });

      const result = await service.updateProfile('user-1', 'token-123', {
        fullName: 'New Name',
      });

      expect(queryBuilderMock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', full_name: 'New Name' }),
        { onConflict: 'id' },
      );
      expect(result).toEqual(updated);
    });
  });

  describe('CV Ingestion & Confirmation Flow', () => {
    it('extracts CV text and records document reference scoped to user_id', async () => {
      queryBuilderMock.maybeSingle.mockResolvedValueOnce({
        data: { id: 'doc-123', original_name: 'resume.pdf' },
        error: null,
      });

      const mockFile = {
        buffer: Buffer.from('fake pdf data'),
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };

      const result = await service.extractCv('user-1', 'token-123', mockFile);

      expect(cvParserMock.extractText).toHaveBeenCalledWith(mockFile.buffer, 'application/pdf');
      expect(cvParserMock.parseCv).toHaveBeenCalledWith('Sample CV text');
      expect(queryBuilderMock.from).toHaveBeenCalledWith('documents');
      expect(queryBuilderMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          type: 'cv',
          original_name: 'resume.pdf',
        }),
      );
      expect(result.documentId).toBe('doc-123');
      expect(result.personal.fullName).toBe('Alex Mercer');
    });

    it('commits confirmed CV data into verified facts and profile records', async () => {
      queryBuilderMock.insert.mockReturnValue(queryBuilderMock);
      queryBuilderMock.upsert.mockReturnValue(queryBuilderMock);
      queryBuilderMock.update.mockReturnValue(queryBuilderMock);
      queryBuilderMock.select.mockReturnValue(queryBuilderMock);
      queryBuilderMock.single.mockResolvedValue({ data: { id: '1' }, error: null });
      queryBuilderMock.maybeSingle.mockResolvedValue({ data: { id: '1' }, error: null });

      const result = await service.confirmExtractedData('user-1', 'token-123', {
        documentId: 'doc-123',
        personal: { fullName: 'Alex Confirmed' },
        experiences: [
          {
            company: 'Acme',
            role: 'Lead',
            isCurrent: true,
            responsibilities: ['Architecting APIs'],
            technologies: ['TypeScript'],
            achievements: [],
          },
        ],
        skills: [{ name: 'TypeScript', proficiency: 'expert', verified: true }],
        facts: [
          {
            category: 'skill',
            content: 'Expert with TypeScript',
            confidence: 0.95,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(queryBuilderMock.from).toHaveBeenCalledWith('work_experiences');
      expect(queryBuilderMock.from).toHaveBeenCalledWith('skills');
      expect(queryBuilderMock.from).toHaveBeenCalledWith('professional_facts');
      expect(queryBuilderMock.from).toHaveBeenCalledWith('documents');
    });

    it('fetches verified professional facts for AI grounding', async () => {
      const mockFacts = [{ id: 'f-1', content: 'Node.js expert', verified: true }];
      queryBuilderMock.order.mockResolvedValueOnce({ data: mockFacts, error: null });

      const facts = await service.getFacts('user-1', 'token-123');

      expect(queryBuilderMock.from).toHaveBeenCalledWith('professional_facts');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(facts).toEqual(mockFacts);
    });
  });

  describe('Work Experience CRUD', () => {
    it('lists experiences filtered by user_id', async () => {
      const exps = [{ id: 'exp-1', company: 'Google', role: 'SWE' }];
      queryBuilderMock.order.mockResolvedValueOnce({ data: exps, error: null });

      const result = await service.getExperiences('user-1', 'token-123');

      expect(queryBuilderMock.from).toHaveBeenCalledWith('work_experiences');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(result).toEqual(exps);
    });

    it('creates experience bound to user_id', async () => {
      const created = { id: 'exp-1', user_id: 'user-1', company: 'Acme', role: 'Dev' };
      queryBuilderMock.single.mockResolvedValueOnce({ data: created, error: null });

      const result = await service.createExperience('user-1', 'token-123', {
        company: 'Acme',
        role: 'Dev',
        isCurrent: true,
      });

      expect(queryBuilderMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', company: 'Acme', role: 'Dev' }),
      );
      expect(result).toEqual(created);
    });

    it('updates experience scoped to both experience id and user_id', async () => {
      const updated = { id: 'exp-1', user_id: 'user-1', role: 'Senior Dev' };
      queryBuilderMock.maybeSingle.mockResolvedValueOnce({ data: updated, error: null });

      const result = await service.updateExperience('user-1', 'exp-1', 'token-123', {
        role: 'Senior Dev',
      });

      expect(queryBuilderMock.from).toHaveBeenCalledWith('work_experiences');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('id', 'exp-1');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException if experience to update does not exist or belongs to another user', async () => {
      queryBuilderMock.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await expect(
        service.updateExperience('user-1', 'exp-other', 'token-123', { role: 'Hacker' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes experience with user_id verification', async () => {
      queryBuilderMock.eq.mockReturnValue(queryBuilderMock);

      const result = await service.deleteExperience('user-1', 'exp-1', 'token-123');

      expect(queryBuilderMock.from).toHaveBeenCalledWith('work_experiences');
      expect(queryBuilderMock.delete).toHaveBeenCalled();
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('id', 'exp-1');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('Skills & Eligibility', () => {
    it('upserts a skill for the user', async () => {
      const skill = { id: 'sk-1', user_id: 'user-1', name: 'TypeScript', years: 4 };
      queryBuilderMock.single.mockResolvedValueOnce({ data: skill, error: null });

      const result = await service.upsertSkill('user-1', 'token-123', {
        name: 'TypeScript',
        years: 4,
        proficiency: 'expert',
      });

      expect(queryBuilderMock.from).toHaveBeenCalledWith('skills');
      expect(queryBuilderMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', name: 'TypeScript' }),
      );
      expect(result).toEqual(skill);
    });

    it('upserts work eligibility with uppercase country code and user_id conflict key', async () => {
      const elig = { id: 'el-1', user_id: 'user-1', country: 'US', legally_authorized: true };
      queryBuilderMock.single.mockResolvedValueOnce({ data: elig, error: null });

      const result = await service.upsertEligibility('user-1', 'token-123', {
        country: 'us',
        legallyAuthorized: true,
        requiresSponsorship: false,
      });

      expect(queryBuilderMock.from).toHaveBeenCalledWith('work_eligibility');
      expect(queryBuilderMock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          country: 'US',
          legally_authorized: true,
          requires_sponsorship: false,
        }),
        { onConflict: 'user_id, country' },
      );
      expect(result).toEqual(elig);
    });
  });

  describe('User Preferences', () => {
    it('upserts preferences safely for user_id', async () => {
      const prefs = { user_id: 'user-1', answer_length: 'short', answer_tone: 'formal' };
      queryBuilderMock.single.mockResolvedValueOnce({ data: prefs, error: null });

      const result = await service.updatePreferences('user-1', 'token-123', {
        answerLength: 'short',
        answerTone: 'formal',
      });

      expect(queryBuilderMock.from).toHaveBeenCalledWith('user_preferences');
      expect(queryBuilderMock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          answer_length: 'short',
          answer_tone: 'formal',
        }),
        { onConflict: 'user_id' },
      );
      expect(result).toEqual(prefs);
    });
  });

  describe('Multi-user Isolation Check', () => {
    it('ensures queries for User A never use User B credentials or id', async () => {
      await service.getExperiences('user-A', 'token-A');
      expect(supabaseMock.getAuthenticatedClient).toHaveBeenCalledWith('token-A');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('user_id', 'user-A');

      await service.getExperiences('user-B', 'token-B');
      expect(supabaseMock.getAuthenticatedClient).toHaveBeenCalledWith('token-B');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('user_id', 'user-B');
    });
  });
});
