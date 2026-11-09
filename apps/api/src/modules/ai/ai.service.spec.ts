import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from './ai.service';
import { GrokService } from './grok.service';
import type { ProfessionalFact } from '@arzi-baaz/contracts';

describe('AiService', () => {
  let service: AiService;
  let grokMock: { completeJson: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    grokMock = {
      completeJson: vi.fn(),
    };
    service = new AiService(grokMock as unknown as GrokService);
  });

  describe('analyzeJob', () => {
    it('analyzes job description and extracts criteria', async () => {
      const mockResult = {
        jobTitle: 'Backend Engineer',
        companyName: 'Acme',
        location: 'Remote',
        employmentType: 'Full-time',
        experienceRequired: '3+ years',
        requiredSkills: ['Node.js', 'TypeScript', 'PostgreSQL'],
        preferredSkills: ['Redis', 'AWS'],
        responsibilities: ['Build APIs', 'Scale database'],
      };
      grokMock.completeJson.mockResolvedValueOnce(mockResult);

      const result = await service.analyzeJob('We are looking for a Backend Engineer with 3+ years experience in Node.js');

      expect(grokMock.completeJson).toHaveBeenCalled();
      expect(result.jobTitle).toBe('Backend Engineer');
      expect(result.requiredSkills).toContain('TypeScript');
    });

    it('handles grok parsing errors gracefully with fallback', async () => {
      grokMock.completeJson.mockRejectedValueOnce(new Error('Rate limit'));

      const result = await service.analyzeJob('Some job description');

      expect(result.requiredSkills).toEqual([]);
      expect(result.jobTitle).toBeUndefined();
    });
  });

  describe('classifyQuestion', () => {
    it('classifies question into canonical category', async () => {
      grokMock.completeJson.mockResolvedValueOnce({
        category: 'job_fit',
        confidence: 0.95,
        reasoning: 'Matches why hire you question',
      });

      const result = await service.classifyQuestion('Why are you a good fit for this role?');

      expect(result.category).toBe('job_fit');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('filterRelevantFacts', () => {
    const mockFacts: ProfessionalFact[] = [
      {
        id: 'f-1',
        userId: 'u1',
        category: 'skill',
        content: 'Experienced in Node.js and TypeScript',
        source: 'user_confirmed',
        confidence: 0.95,
        verified: true,
      },
      {
        id: 'f-2',
        userId: 'u1',
        category: 'project',
        content: 'Built distributed caching with Redis',
        source: 'user_confirmed',
        confidence: 0.9,
        verified: true,
      },
      {
        id: 'f-3',
        userId: 'u1',
        category: 'education',
        content: 'BS in Computer Science from UC Berkeley',
        source: 'user_confirmed',
        confidence: 0.95,
        verified: true,
      },
      {
        id: 'f-4',
        userId: 'u1',
        category: 'achievement',
        content: 'Reduced API latency by 45%',
        source: 'user_confirmed',
        confidence: 0.9,
        verified: true,
      },
    ];

    it('selects skill facts for technical questions', () => {
      const selected = service.filterRelevantFacts(
        'technical_skills',
        'Which programming languages do you know?',
        mockFacts,
      );
      expect(selected.some((f) => f.category === 'skill')).toBe(true);
    });

    it('selects project and achievement facts for project experience questions', () => {
      const selected = service.filterRelevantFacts(
        'project_experience',
        'Describe a challenging project you built.',
        mockFacts,
      );
      expect(selected.some((f) => f.category === 'project')).toBe(true);
    });

    it('retrieves relevant facts for introduction & job fit', () => {
      const selected = service.filterRelevantFacts(
        'introduction',
        'Tell us about yourself.',
        mockFacts,
      );
      expect(selected.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('generateAnswer', () => {
    it('generates structured answer grounded in verified facts', async () => {
      grokMock.completeJson.mockResolvedValueOnce({
        answer: 'I have 6 years of experience building Node.js microservices.',
        category: 'job_fit',
        confidence: 0.92,
        supportingFacts: [{ factId: 'f-1', reason: 'Demonstrates Node.js experience' }],
        missingInformation: [],
        requiresReview: false,
      });

      const result = await service.generateAnswer({
        question: 'Why should we hire you?',
        questionId: 'q-1',
        category: 'job_fit',
        facts: [
          {
            id: 'f-1',
            userId: 'u1',
            category: 'skill',
            content: 'Node.js expertise',
            source: 'user_confirmed',
            confidence: 0.95,
            verified: true,
          },
        ],
      });

      expect(result.questionId).toBe('q-1');
      expect(result.answer).toContain('Node.js');
      expect(result.confidence).toBe(0.92);
      expect(result.requiresReview).toBe(false);
    });

    it('flags answer for review when facts are missing', async () => {
      grokMock.completeJson.mockResolvedValueOnce({
        answer: 'I need more information about your leadership experience.',
        category: 'job_fit',
        confidence: 0.4,
        supportingFacts: [],
        missingInformation: ['No leadership details in profile'],
        requiresReview: true,
      });

      const result = await service.generateAnswer({
        question: 'Tell us about a time you led a team.',
        questionId: 'q-2',
        category: 'job_fit',
        facts: [],
      });

      expect(result.requiresReview).toBe(true);
      expect(result.missingInformation.length).toBeGreaterThan(0);
    });
  });

  describe('refineAnswer', () => {
    it('refines answer according to candidate instruction', async () => {
      grokMock.completeJson.mockResolvedValueOnce({
        answer: 'Over 6 years building high-throughput Node.js microservices.',
        confidence: 0.95,
        changesSummary: 'Made more concise.',
        requiresReview: false,
      });

      const result = await service.refineAnswer({
        answer: 'I have 6 years of experience building Node.js microservices with multiple frameworks.',
        instruction: 'Make it more concise and punchy.',
      });

      expect(result.answer).toContain('Over 6 years');
      expect(result.changesSummary).toBe('Made more concise.');
    });
  });
});
