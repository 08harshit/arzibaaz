import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AnswersService } from './answers.service';
import { AiService } from '../ai/ai.service';
import { ProfileService } from '../profile/profile.service';
import { SupabaseService } from '../auth/supabase.service';

describe('AnswersService', () => {
  let service: AnswersService;
  let aiMock: {
    classifyQuestion: ReturnType<typeof vi.fn>;
    filterRelevantFacts: ReturnType<typeof vi.fn>;
    generateAnswer: ReturnType<typeof vi.fn>;
    refineAnswer: ReturnType<typeof vi.fn>;
  };
  let profileMock: {
    getProfile: ReturnType<typeof vi.fn>;
    getPreferences: ReturnType<typeof vi.fn>;
    getFacts: ReturnType<typeof vi.fn>;
  };
  let supabaseMock: {
    getAuthenticatedClient: ReturnType<typeof vi.fn>;
  };
  let queryBuilderMock: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    queryBuilderMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ans-123' }, error: null }),
    };

    supabaseMock = {
      getAuthenticatedClient: vi.fn().mockReturnValue(queryBuilderMock),
    };

    aiMock = {
      classifyQuestion: vi.fn().mockResolvedValue({ category: 'job_fit', confidence: 0.9 }),
      filterRelevantFacts: vi.fn().mockReturnValue([{ id: 'f-1', content: 'Node.js skill' }]),
      generateAnswer: vi.fn().mockResolvedValue({
        questionId: 'q-1',
        answer: 'I have extensive Node.js backend experience.',
        category: 'job_fit',
        confidence: 0.95,
        supportingFacts: [{ factId: 'f-1', reason: 'Verified skill' }],
        missingInformation: [],
        requiresReview: false,
      }),
      refineAnswer: vi.fn().mockResolvedValue({
        answer: 'Refined answer text',
        confidence: 0.96,
        changesSummary: 'Shortened',
        requiresReview: false,
      }),
    };

    profileMock = {
      getProfile: vi.fn().mockResolvedValue({ full_name: 'Alex Candidate', headline: 'Engineer' }),
      getPreferences: vi.fn().mockResolvedValue({ length: 'medium', tone: 'natural_professional' }),
      getFacts: vi.fn().mockResolvedValue([{ id: 'f-1', content: 'Node.js skill' }]),
    };

    service = new AnswersService(
      aiMock as unknown as AiService,
      profileMock as unknown as ProfileService,
      supabaseMock as unknown as SupabaseService,
    );
  });

  describe('generateAnswer', () => {
    it('retrieves user facts, classifies question, generates grounded answer, and records it', async () => {
      const result = await service.generateAnswer('user-1', 'token-123', {
        question: 'Why are you a good fit for this role?',
        questionId: 'q-1',
      });

      expect(profileMock.getFacts).toHaveBeenCalledWith('user-1', 'token-123');
      expect(aiMock.classifyQuestion).toHaveBeenCalledWith('Why are you a good fit for this role?');
      expect(aiMock.generateAnswer).toHaveBeenCalled();
      expect(queryBuilderMock.from).toHaveBeenCalledWith('generated_answers');
      expect(queryBuilderMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          question_text: 'Why are you a good fit for this role?',
        }),
      );
      expect(result.answer).toContain('Node.js');
      expect(result.id).toBe('ans-123');
    });
  });

  describe('refineAnswer', () => {
    it('refines an existing answer scoped to user_id', async () => {
      queryBuilderMock.maybeSingle.mockResolvedValueOnce({
        data: { id: 'ans-123', user_id: 'user-1', answer: 'Original answer' },
        error: null,
      });

      const result = await service.refineAnswer('user-1', 'token-123', {
        answerId: 'ans-123',
        instruction: 'Make it more concise',
      });

      expect(queryBuilderMock.from).toHaveBeenCalledWith('generated_answers');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('id', 'ans-123');
      expect(queryBuilderMock.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(aiMock.refineAnswer).toHaveBeenCalledWith({
        answer: 'Original answer',
        instruction: 'Make it more concise',
      });
      expect(result.answer).toBe('Refined answer text');
    });

    it('throws NotFoundException if answer does not exist or belongs to another user', async () => {
      queryBuilderMock.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await expect(
        service.refineAnswer('user-1', 'token-123', {
          answerId: 'other-user-ans',
          instruction: 'Edit this',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
