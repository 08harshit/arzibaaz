import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type {
  ExtractedProfileData,
  PersonalProfile,
  WorkExperience,
  Education,
  Project,
  SkillRecord,
} from '@arzi-baaz/contracts';

@Injectable()
export class CvParserService {
  private readonly logger = new Logger(CvParserService.name);

  /**
   * Extracts raw text from an uploaded CV: PDF, DOCX or plain text.
   * Problems with the file itself are reported as 400s with a message the user can act on.
   */
  async extractText(buffer: Buffer, mimeType: string, fileName = ''): Promise<string> {
    const name = fileName.toLowerCase();
    const isPdf = mimeType === 'application/pdf' || name.endsWith('.pdf');
    const isDocx = mimeType.includes('wordprocessingml') || name.endsWith('.docx');
    const isText = mimeType.startsWith('text/') || /.(txt|md|markdown)$/.test(name);

    let text: string;
    if (isPdf) {
      text = await this.readPdf(buffer);
    } else if (isDocx) {
      text = await this.readDocx(buffer);
    } else if (isText) {
      text = buffer.toString('utf-8');
    } else if (name.endsWith('.doc') || mimeType === 'application/msword') {
      throw new BadRequestException('Old .doc files are not supported. Save the file as DOCX or PDF and upload it again.');
    } else {
      throw new BadRequestException('Unsupported file type. Upload a PDF, DOCX or TXT file.');
    }

    if (text.trim().length < 30) {
      throw new BadRequestException(
        isPdf
          ? 'This PDF has no selectable text (it looks like a scan). Export a text-based PDF, or upload a DOCX or TXT file.'
          : 'No readable text was found in this file.',
      );
    }
    return text;
  }

  private async readPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text ?? '';
    } catch (err) {
      this.logger.error('Failed to parse PDF text', err);
      throw new BadRequestException('Could not read this PDF. It may be password-protected or damaged.');
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private async readDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    } catch (err) {
      this.logger.error('Failed to parse DOCX text', err);
      throw new BadRequestException('Could not read this DOCX file. It may be damaged.');
    }
  }

  /**
   * Parses raw CV text into structured sections and candidate facts.
   */
  parseCv(rawText: string): ExtractedProfileData {
    const text = rawText.replace(/\r\n/g, '\n');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    const personal = this.extractPersonal(text, lines);
    const skills = this.extractSkills(text);
    const education = this.extractEducation(text);
    const experiences = this.extractExperiences(text);
    const projects = this.extractProjects(text);

    // Formulate granular professional facts for knowledge-base grounding
    const facts = this.generateFacts(personal, skills, experiences, projects, education);

    return {
      rawText: text.slice(0, 15_000), // retain sample for review
      personal,
      skills,
      education,
      experiences,
      projects,
      facts,
    };
  }

  private extractPersonal(text: string, lines: string[]): Partial<PersonalProfile> {
    const personal: Partial<PersonalProfile> = {};

    // Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) personal.email = emailMatch[0];

    // Phone
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) personal.phone = phoneMatch[0];

    // LinkedIn
    const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/);
    if (linkedinMatch) personal.linkedinUrl = linkedinMatch[0];

    // GitHub
    const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/);
    if (githubMatch) personal.githubUrl = githubMatch[0];

    // Name heuristic: usually one of the first 3 lines before headers
    const candidateName = lines.slice(0, 3).find((line) => {
      return (
        line.length > 2 &&
        line.length < 50 &&
        !line.includes('@') &&
        !line.includes('http') &&
        !/resume|curriculum|cv|page/i.test(line)
      );
    });
    if (candidateName) personal.fullName = candidateName;

    return personal;
  }

  private extractSkills(text: string): Array<Omit<SkillRecord, 'id'>> {
    const knownSkills = [
      'JavaScript', 'TypeScript', 'Node.js', 'React', 'Angular', 'Vue.js', 'Next.js',
      'Python', 'Go', 'Rust', 'Java', 'C++', 'C#', '.NET',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB',
      'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'CI/CD',
      'GraphQL', 'REST API', 'gRPC', 'Kafka', 'RabbitMQ', 'Git', 'Linux',
    ];

    const foundSkills: Array<Omit<SkillRecord, 'id'>> = [];
    const lowerText = text.toLowerCase();

    for (const skill of knownSkills) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerText)) {
        foundSkills.push({
          name: skill,
          proficiency: 'intermediate',
          verified: false,
        });
      }
    }

    return foundSkills;
  }

  private extractEducation(text: string): Array<Omit<Education, 'id'>> {
    const educationEntries: Array<Omit<Education, 'id'>> = [];
    const degreeRegex = /(Bachelor|Master|B\.S\.|M\.S\.|B\.Tech|M\.Tech|Ph\.D\.|Associate|Diploma)[^\n,]*/gi;
    const matches = Array.from(text.matchAll(degreeRegex));

    for (const match of matches) {
      const degree = match[0].trim();
      const contextIndex = match.index ?? 0;
      const snippet = text.slice(contextIndex, contextIndex + 200);

      // Extract year if present
      const yearMatch = snippet.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? yearMatch[0] : undefined;

      educationEntries.push({
        institution: 'University / Institution',
        degree,
        endDate: year,
      });
    }

    return educationEntries.slice(0, 3);
  }

  private extractExperiences(text: string): Array<Omit<WorkExperience, 'id'>> {
    const experiences: Array<Omit<WorkExperience, 'id'>> = [];

    // Identify experience sections
    const expHeader = /(?:EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT HISTORY|WORK HISTORY)/i;
    const match = text.search(expHeader);

    if (match !== -1) {
      const expSection = text.slice(match, match + 3000);
      const lines = expSection.split('\n').map((l) => l.trim()).filter(Boolean);

      let currentExp: Omit<WorkExperience, 'id'> | null = null;

      for (const line of lines) {
        // Date pattern (e.g. 2021 - Present or Jan 2020 - Dec 2022)
        const dateMatch = line.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})\s*[-–—]\s*(?:Present|\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);

        if (dateMatch && line.length < 100) {
          if (currentExp) experiences.push(currentExp);
          currentExp = {
            company: line.split(/[-–|,]/)[0]?.trim() || 'Company',
            role: 'Software Engineer',
            isCurrent: /present/i.test(line),
            startDate: dateMatch[0].split(/[-–—]/)[0]?.trim(),
            endDate: dateMatch[0].split(/[-–—]/)[1]?.trim(),
            responsibilities: [],
            technologies: [],
            achievements: [],
          };
        } else if (currentExp && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*'))) {
          const bullet = line.replace(/^[•\-*]\s*/, '').trim();
          if (bullet.length > 10) {
            if (/increase|reduce|improve|scale|lead|achieve|deliver/i.test(bullet)) {
              currentExp.achievements.push(bullet);
            } else {
              currentExp.responsibilities.push(bullet);
            }
          }
        }
      }

      if (currentExp) experiences.push(currentExp);
    }

    return experiences;
  }

  private extractProjects(text: string): Array<Omit<Project, 'id'>> {
    const projects: Array<Omit<Project, 'id'>> = [];
    const projHeader = /(?:PROJECTS|KEY PROJECTS|PERSONAL PROJECTS)/i;
    const match = text.search(projHeader);

    if (match !== -1) {
      const projSection = text.slice(match, match + 2000);
      const lines = projSection.split('\n').map((l) => l.trim()).filter(Boolean);

      let currentProj: Omit<Project, 'id'> | null = null;

      for (const line of lines.slice(1)) {
        if (/^[A-Z][a-zA-Z0-9\s-]{2,30}(?:\s*\||\s*[-–])/.test(line) && line.length < 60) {
          if (currentProj) projects.push(currentProj);
          const name = line.split(/[|–-]/)[0]?.trim() || 'Project';
          currentProj = {
            name,
            description: '',
            technologies: [],
            responsibilities: [],
          };
        } else if (currentProj) {
          if (!currentProj.description) {
            currentProj.description = line;
          } else if (line.startsWith('•') || line.startsWith('-')) {
            currentProj.responsibilities.push(line.replace(/^[•\-*]\s*/, '').trim());
          }
        }
      }
      if (currentProj) projects.push(currentProj);
    }

    return projects;
  }

  private generateFacts(
    personal: Partial<PersonalProfile>,
    skills: Array<Omit<SkillRecord, 'id'>>,
    experiences: Array<Omit<WorkExperience, 'id'>>,
    projects: Array<Omit<Project, 'id'>>,
    education: Array<Omit<Education, 'id'>>,
  ): ExtractedProfileData['facts'] {
    const facts: ExtractedProfileData['facts'] = [];

    // Skill facts
    for (const skill of skills) {
      facts.push({
        category: 'skill',
        content: `Demonstrated technical capability with ${skill.name}.`,
        confidence: 0.9,
      });
    }

    // Experience facts
    for (const exp of experiences) {
      facts.push({
        category: 'experience',
        content: `Worked as ${exp.role} at ${exp.company} (${exp.startDate || ''} - ${exp.isCurrent ? 'Present' : exp.endDate || ''}).`,
        confidence: 0.95,
      });

      for (const ach of exp.achievements) {
        facts.push({
          category: 'achievement',
          content: `At ${exp.company}: ${ach}`,
          confidence: 0.88,
        });
      }
    }

    // Project facts
    for (const proj of projects) {
      facts.push({
        category: 'project',
        content: `Developed project "${proj.name}": ${proj.description}`,
        confidence: 0.85,
      });
    }

    // Education facts
    for (const edu of education) {
      facts.push({
        category: 'education',
        content: `Earned ${edu.degree} from ${edu.institution}${edu.endDate ? ` (${edu.endDate})` : ''}.`,
        confidence: 0.95,
      });
    }

    return facts;
  }
}
