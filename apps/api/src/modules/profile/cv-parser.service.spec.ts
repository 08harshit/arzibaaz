import { describe, it, expect, beforeEach } from 'vitest';
import { CvParserService } from './cv-parser.service';

describe('CvParserService', () => {
  let service: CvParserService;

  beforeEach(() => {
    service = new CvParserService();
  });

  const sampleCvText = `
Alex Mercer
alex.mercer@example.com | (555) 234-5678 | San Francisco, CA
https://linkedin.com/in/alexmercer | https://github.com/alexmercer

SUMMARY
Senior Software Engineer with 6+ years of experience designing scalable backend architectures.

TECHNICAL SKILLS
Languages & Frameworks: TypeScript, Node.js, Python, Go, React
Databases: PostgreSQL, Redis, MongoDB
Infrastructure: Docker, Kubernetes, AWS, Terraform, CI/CD, Kafka

EXPERIENCE
Acme Systems | Senior Backend Engineer | Jan 2021 - Present
• Designed and deployed distributed event streaming pipelines using Kafka and Go.
• Reduced API p99 latency by 45% through aggressive Redis caching and query optimization.
• Mentored 4 junior engineers and led code review standards across the organization.

Beta Tech | Software Engineer | Jun 2018 - Dec 2020
• Built RESTful microservices in Node.js and TypeScript serving 5M daily active users.
• Improved database query throughput by 30% by introducing PostgreSQL partitioned tables.

EDUCATION
Bachelor of Science in Computer Science | 2018
University of California, Berkeley

PROJECTS
CloudScale Optimizer | TypeScript, Go, Docker
Automated cloud cost optimization agent for AWS infrastructure.
• Handled real-time telemetry analysis for 500+ EC2 instances.
• Saved customers an estimated 25% on monthly cloud bills.
`;

  it('extracts contact and personal details accurately', () => {
    const result = service.parseCv(sampleCvText);

    expect(result.personal.fullName).toBe('Alex Mercer');
    expect(result.personal.email).toBe('alex.mercer@example.com');
    expect(result.personal.phone).toContain('555');
    expect(result.personal.linkedinUrl).toBe('https://linkedin.com/in/alexmercer');
    expect(result.personal.githubUrl).toBe('https://github.com/alexmercer');
  });

  it('extracts technical skills present in the CV text', () => {
    const result = service.parseCv(sampleCvText);
    const skillNames = result.skills.map((s) => s.name);

    expect(skillNames).toContain('TypeScript');
    expect(skillNames).toContain('Node.js');
    expect(skillNames).toContain('PostgreSQL');
    expect(skillNames).toContain('Redis');
    expect(skillNames).toContain('Docker');
    expect(skillNames).toContain('Kubernetes');
    expect(skillNames).toContain('Kafka');
  });

  it('extracts work experiences with roles, dates, responsibilities, and achievements', () => {
    const result = service.parseCv(sampleCvText);

    expect(result.experiences.length).toBeGreaterThanOrEqual(1);
    const firstExp = result.experiences[0];
    expect(firstExp.company).toBe('Acme Systems');
    expect(firstExp.isCurrent).toBe(true);
    expect(firstExp.achievements.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts education entries with degree and year', () => {
    const result = service.parseCv(sampleCvText);

    expect(result.education.length).toBeGreaterThanOrEqual(1);
    expect(result.education[0].degree).toContain('Bachelor of Science');
    expect(result.education[0].endDate).toBe('2018');
  });

  it('extracts projects and associated details', () => {
    const result = service.parseCv(sampleCvText);

    expect(result.projects.length).toBeGreaterThanOrEqual(1);
    expect(result.projects[0].name).toBe('CloudScale Optimizer');
  });

  it('generates granular professional facts for AI grounding', () => {
    const result = service.parseCv(sampleCvText);

    expect(result.facts.length).toBeGreaterThan(5);

    // Should contain skill facts
    const skillFact = result.facts.find((f) => f.category === 'skill');
    expect(skillFact).toBeDefined();
    expect(skillFact?.confidence).toBeGreaterThanOrEqual(0.85);

    // Should contain experience facts
    const expFact = result.facts.find((f) => f.category === 'experience');
    expect(expFact).toBeDefined();

    // Should contain achievement facts
    const achFact = result.facts.find((f) => f.category === 'achievement');
    expect(achFact).toBeDefined();
  });

  it('extracts plain text from buffer', async () => {
    const textBuffer = Buffer.from('Plain text CV content', 'utf-8');
    const text = await service.extractText(textBuffer, 'text/plain');
    expect(text).toBe('Plain text CV content');
  });
});
