import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import type { JobContext } from '@arzi-baaz/contracts';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly ai: AiService) {}

  async analyzeJobDescription(description: string): Promise<JobContext> {
    this.logger.log(`Analyzing job description (length: ${description.length} chars)`);

    const extracted = await this.ai.analyzeJob(description);

    return {
      jobTitle: extracted.jobTitle,
      companyName: extracted.companyName,
      location: extracted.location,
      employmentType: extracted.employmentType,
      experienceRequired: extracted.experienceRequired,
      requiredSkills: extracted.requiredSkills || [],
      preferredSkills: extracted.preferredSkills || [],
      responsibilities: extracted.responsibilities || [],
      description,
    };
  }
}
