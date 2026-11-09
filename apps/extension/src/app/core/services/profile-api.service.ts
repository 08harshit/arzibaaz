import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import type {
  PersonalProfile,
  WorkExperience,
  Project,
  Education,
  SkillRecord,
  WorkEligibility,
  AnswerPreferences,
  FullProfileResponse,
  DocumentRecord,
  ExtractedProfileData,
  ConfirmExtractedDataRequest,
  ProfessionalFact,
} from '@arzi-baaz/contracts';

@Injectable({
  providedIn: 'root',
})
export class ProfileApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/profile`;

  private getHeaders(contentType: string | null = 'application/json'): HttpHeaders {
    const token = this.auth.getAccessToken();
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return new HttpHeaders(headers);
  }

  // ============================================================
  // CV INGESTION & DOCUMENT EXTRACTION
  // ============================================================
  async uploadCv(file: File): Promise<ExtractedProfileData> {
    const formData = new FormData();
    formData.append('file', file);

    return firstValueFrom(
      this.http.post<ExtractedProfileData>(`${this.baseUrl}/extract`, formData, {
        headers: this.getHeaders(null), // multipart/form-data boundary set by browser
      }),
    );
  }

  async confirmExtractedData(
    dto: ConfirmExtractedDataRequest,
  ): Promise<{ success: boolean; confirmed: Record<string, number> }> {
    return firstValueFrom(
      this.http.post<{ success: boolean; confirmed: Record<string, number> }>(
        `${this.baseUrl}/confirm-extracted`,
        dto,
        { headers: this.getHeaders() },
      ),
    );
  }

  async getDocuments(): Promise<DocumentRecord[]> {
    return firstValueFrom(
      this.http.get<DocumentRecord[]>(`${this.baseUrl}/documents`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async getFacts(): Promise<ProfessionalFact[]> {
    return firstValueFrom(
      this.http.get<ProfessionalFact[]>(`${this.baseUrl}/facts`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async deleteFact(id: string): Promise<{ success: boolean }> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(`${this.baseUrl}/facts/${id}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  // ============================================================
  // PROFILE CRUD
  // ============================================================
  async getFullProfile(): Promise<FullProfileResponse> {
    return firstValueFrom(
      this.http.get<FullProfileResponse>(`${this.baseUrl}/full`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async updatePersonalProfile(dto: Partial<PersonalProfile>): Promise<PersonalProfile> {
    return firstValueFrom(
      this.http.patch<PersonalProfile>(this.baseUrl, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  // Work Experiences
  async getExperiences(): Promise<WorkExperience[]> {
    return firstValueFrom(
      this.http.get<WorkExperience[]>(`${this.baseUrl}/experiences`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async createExperience(dto: Omit<WorkExperience, 'id'>): Promise<WorkExperience> {
    return firstValueFrom(
      this.http.post<WorkExperience>(`${this.baseUrl}/experiences`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async updateExperience(id: string, dto: Partial<WorkExperience>): Promise<WorkExperience> {
    return firstValueFrom(
      this.http.patch<WorkExperience>(`${this.baseUrl}/experiences/${id}`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async deleteExperience(id: string): Promise<{ success: boolean }> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(`${this.baseUrl}/experiences/${id}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  // Education
  async getEducation(): Promise<Education[]> {
    return firstValueFrom(
      this.http.get<Education[]>(`${this.baseUrl}/education`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async createEducation(dto: Omit<Education, 'id'>): Promise<Education> {
    return firstValueFrom(
      this.http.post<Education>(`${this.baseUrl}/education`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async updateEducation(id: string, dto: Partial<Education>): Promise<Education> {
    return firstValueFrom(
      this.http.patch<Education>(`${this.baseUrl}/education/${id}`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async deleteEducation(id: string): Promise<{ success: boolean }> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(`${this.baseUrl}/education/${id}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return firstValueFrom(
      this.http.get<Project[]>(`${this.baseUrl}/projects`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async createProject(dto: Omit<Project, 'id'>): Promise<Project> {
    return firstValueFrom(
      this.http.post<Project>(`${this.baseUrl}/projects`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async updateProject(id: string, dto: Partial<Project>): Promise<Project> {
    return firstValueFrom(
      this.http.patch<Project>(`${this.baseUrl}/projects/${id}`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async deleteProject(id: string): Promise<{ success: boolean }> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(`${this.baseUrl}/projects/${id}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  // Skills
  async getSkills(): Promise<SkillRecord[]> {
    return firstValueFrom(
      this.http.get<SkillRecord[]>(`${this.baseUrl}/skills`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async upsertSkill(dto: Omit<SkillRecord, 'id'>): Promise<SkillRecord> {
    return firstValueFrom(
      this.http.post<SkillRecord>(`${this.baseUrl}/skills`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async deleteSkill(id: string): Promise<{ success: boolean }> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(`${this.baseUrl}/skills/${id}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  // Work Eligibility
  async getEligibility(): Promise<WorkEligibility[]> {
    return firstValueFrom(
      this.http.get<WorkEligibility[]>(`${this.baseUrl}/eligibility`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async upsertEligibility(dto: WorkEligibility): Promise<WorkEligibility> {
    return firstValueFrom(
      this.http.post<WorkEligibility>(`${this.baseUrl}/eligibility`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }

  async deleteEligibility(id: string): Promise<{ success: boolean }> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(`${this.baseUrl}/eligibility/${id}`, {
        headers: this.getHeaders(),
      }),
    );
  }

  // Preferences
  async getPreferences(): Promise<AnswerPreferences> {
    return firstValueFrom(
      this.http.get<AnswerPreferences>(`${this.baseUrl}/preferences`, {
        headers: this.getHeaders(),
      }),
    );
  }

  async updatePreferences(dto: Partial<AnswerPreferences>): Promise<AnswerPreferences> {
    return firstValueFrom(
      this.http.patch<AnswerPreferences>(`${this.baseUrl}/preferences`, dto, {
        headers: this.getHeaders(),
      }),
    );
  }
}
