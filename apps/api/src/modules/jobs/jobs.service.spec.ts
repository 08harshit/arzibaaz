import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobsService } from './jobs.service';
import { AiService } from '../ai/ai.service';

describe('JobsService', () => {
  let service: JobsService;
  let aiMock: { analyzeJob: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    aiMock = {
      analyzeJob: vi.fn().mockResolvedValue({
        jobTitle: 'Senior Full Stack Engineer',
        companyName: 'Stripe',
        location: 'Remote',
        employmentType: 'Full-time',
        experienceRequired: '5+ years',
        requiredSkills: ['TypeScript', 'Ruby', 'PostgreSQL'],
        preferredSkills: ['Docker', 'AWS'],
        responsibilities: ['Build billing APIs', 'Improve checkout conversion'],
      }),
    };
    service = new JobsService(aiMock as unknown as AiService);
  });

  it('delegates to AiService and preserves original job description text', async () => {
    const rawDesc = 'Stripe is looking for a Senior Full Stack Engineer with 5+ years of experience...';
    const result = await service.analyzeJobDescription(rawDesc);

    expect(aiMock.analyzeJob).toHaveBeenCalledWith(rawDesc);
    expect(result.jobTitle).toBe('Senior Full Stack Engineer');
    expect(result.companyName).toBe('Stripe');
    expect(result.description).toBe(rawDesc);
    expect(result.requiredSkills).toContain('TypeScript');
  });
});
