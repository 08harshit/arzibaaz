import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ProfileApiService } from '../../core/services/profile-api.service';
import { AuthComponent } from '../auth/auth.component';
import type {
  PersonalProfile,
  WorkExperience,
  Project,
  Education,
  SkillRecord,
  WorkEligibility,
  AnswerPreferences,
  ExtractedProfileData,
  ProfessionalFact,
} from '@arzi-baaz/contracts';

type ActiveTab =
  | 'personal'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'eligibility'
  | 'preferences'
  | 'import-cv'
  | 'facts';

@Component({
  selector: 'ab-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, AuthComponent],
  template: `
    <div class="profile-container">
      @if (!auth.isAuthenticated()) {
        <ab-auth />
      } @else {
        <!-- Profile Header -->
        <div class="profile-header">
          <div class="user-info">
            <h2 class="title">Professional Knowledge Base</h2>
            <p class="subtitle">{{ personal.email || auth.user()?.email }}</p>
          </div>
          <button class="logout-btn" (click)="onLogout()" title="Sign Out">Sign Out</button>
        </div>

        @if (feedbackMessage()) {
          <div class="feedback-toast" [class.error]="isError()">
            {{ feedbackMessage() }}
          </div>
        }

        <!-- Tab Navigation -->
        <div class="tab-bar">
          <button
            class="tab highlight"
            [class.active]="activeTab() === 'import-cv'"
            (click)="setTab('import-cv')"
          >
            📄 Import CV
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'personal'"
            (click)="setTab('personal')"
          >
            Personal
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'experience'"
            (click)="setTab('experience')"
          >
            Experience
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'education'"
            (click)="setTab('education')"
          >
            Education
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'projects'"
            (click)="setTab('projects')"
          >
            Projects
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'skills'"
            (click)="setTab('skills')"
          >
            Skills
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'facts'"
            (click)="setTab('facts')"
          >
            🧠 Facts ({{ facts.length }})
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'eligibility'"
            (click)="setTab('eligibility')"
          >
            Eligibility
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'preferences'"
            (click)="setTab('preferences')"
          >
            AI Prefs
          </button>
        </div>

        @if (loading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading your profile & facts...</p>
          </div>
        } @else {
          <!-- TAB: IMPORT CV -->
          @if (activeTab() === 'import-cv') {
            <div class="tab-content">
              @if (!extractedData) {
                <div class="upload-box">
                  <div class="upload-icon">📑</div>
                  <h3>Upload Your Resume / CV</h3>
                  <p class="upload-sub">Supports PDF, DOCX, TXT or Markdown (max 10MB). Scanned images are not supported.</p>
                  
                  <input
                    type="file"
                    #fileInput
                    (change)="onFileSelected($event)"
                    accept=".pdf,.docx,.txt,.md"
                    class="file-input"
                  />

                  <button
                    class="upload-btn"
                    (click)="fileInput.click()"
                    [disabled]="extracting()"
                  >
                    @if (extracting()) {
                      <span class="spinner-small"></span> Parsing document...
                    } @else {
                      Select Resume File
                    }
                  </button>
                </div>
              } @else {
                <!-- HUMAN-IN-THE-LOOP EXTRACTION REVIEW SCREEN -->
                <div class="review-container">
                  <div class="info-alert">
                    <strong>Review Extracted Context:</strong> Please review and edit the parsed information before committing to your verified knowledge base.
                  </div>

                  <!-- Extracted Personal Details -->
                  <div class="review-section">
                    <h4>Personal & Contact Details</h4>
                    <div class="form-grid">
                      <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" [(ngModel)]="extractedData.personal.fullName" />
                      </div>
                      <div class="form-group">
                        <label>Email</label>
                        <input type="email" [(ngModel)]="extractedData.personal.email" />
                      </div>
                      <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" [(ngModel)]="extractedData.personal.phone" />
                      </div>
                      <div class="form-group">
                        <label>LinkedIn</label>
                        <input type="url" [(ngModel)]="extractedData.personal.linkedinUrl" />
                      </div>
                    </div>
                  </div>

                  <!-- Extracted Skills -->
                  <div class="review-section">
                    <h4>Extracted Skills ({{ extractedData.skills.length }})</h4>
                    <div class="skills-cloud">
                      @for (s of extractedData.skills; track s.name) {
                        <div class="skill-chip">
                          <span>{{ s.name }}</span>
                          <button class="chip-delete" (click)="removeExtractedSkill(s.name)">&times;</button>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Extracted Experiences -->
                  <div class="review-section">
                    <h4>Work History ({{ extractedData.experiences.length }} detected)</h4>
                    @for (exp of extractedData.experiences; track exp.company) {
                      <div class="item-card">
                        <div class="item-title">{{ exp.role }} &bull; {{ exp.company }}</div>
                        <div class="item-sub">{{ exp.startDate }} - {{ exp.isCurrent ? 'Present' : exp.endDate }}</div>
                        @if (exp.achievements.length > 0) {
                          <ul class="bullet-list">
                            @for (ach of exp.achievements; track ach) {
                              <li>{{ ach }}</li>
                            }
                          </ul>
                        }
                      </div>
                    }
                  </div>

                  <!-- Extracted Facts -->
                  <div class="review-section">
                    <h4>Candidate Grounding Facts ({{ extractedData.facts.length }} facts)</h4>
                    <p class="help-text">These factual statements will be used to accurately ground AI answers without hallucination.</p>
                    <div class="facts-list">
                      @for (fact of extractedData.facts; track fact.content) {
                        <div class="fact-card">
                          <span class="category-badge">{{ fact.category }}</span>
                          <span class="fact-text">{{ fact.content }}</span>
                          <span class="conf-badge">{{ (fact.confidence * 100).toFixed(0) }}% conf</span>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="review-actions">
                    <button class="cancel-btn" (click)="extractedData = null">Cancel & Discard</button>
                    <button class="save-btn" (click)="confirmExtracted()" [disabled]="saving()">
                      {{ saving() ? 'Committing...' : 'Confirm & Save to Knowledge Base' }}
                    </button>
                  </div>
                </div>
              }
            </div>
          }

          <!-- TAB: PROFESSIONAL FACTS -->
          @if (activeTab() === 'facts') {
            <div class="tab-content">
              <div class="info-alert">
                <strong>Anti-Hallucination Grounding Layer:</strong> The AI draws exclusively from these verified facts when generating custom application answers.
              </div>

              @if (facts.length === 0) {
                <div class="empty-state">
                  <p class="empty-icon">🧠</p>
                  <p class="empty-text">No verified facts stored yet.</p>
                  <p class="empty-sub">Import your CV above or save experiences to automatically generate professional facts.</p>
                </div>
              } @else {
                <div class="facts-list">
                  @for (fact of facts; track fact.id) {
                    <div class="fact-card">
                      <div class="fact-header">
                        <span class="category-badge">{{ fact.category }}</span>
                        <span class="source-tag">{{ fact.source }}</span>
                        <button class="icon-btn danger" (click)="deleteFact(fact.id)" title="Remove Fact">🗑️</button>
                      </div>
                      <div class="fact-text">{{ fact.content }}</div>
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- TAB 1: PERSONAL DETAILS -->
          @if (activeTab() === 'personal') {
            <div class="tab-content">
              <div class="form-grid">
                <div class="form-group">
                  <label>Full Name *</label>
                  <input type="text" [(ngModel)]="personal.fullName" placeholder="John Doe" />
                </div>
                <div class="form-group">
                  <label>Email *</label>
                  <input type="email" [(ngModel)]="personal.email" placeholder="john@example.com" />
                </div>
                <div class="form-group">
                  <label>Phone</label>
                  <input type="tel" [(ngModel)]="personal.phone" placeholder="+1 555-0199" />
                </div>
                <div class="form-group">
                  <label>Location (City, State/Region)</label>
                  <input type="text" [(ngModel)]="personal.location" placeholder="San Francisco, CA" />
                </div>
                <div class="form-group">
                  <label>Country</label>
                  <input type="text" [(ngModel)]="personal.country" placeholder="United States" />
                </div>
                <div class="form-group">
                  <label>Current Status</label>
                  <select [(ngModel)]="personal.currentStatus">
                    <option value="employed">Employed</option>
                    <option value="unemployed">Unemployed</option>
                    <option value="freelancing">Freelancing</option>
                    <option value="student">Student</option>
                  </select>
                </div>
                <div class="form-group full-width">
                  <label>Professional Headline</label>
                  <input type="text" [(ngModel)]="personal.headline" placeholder="Senior Backend Engineer | Node.js & Distributed Systems" />
                </div>
                <div class="form-group full-width">
                  <label>LinkedIn URL</label>
                  <input type="url" [(ngModel)]="personal.linkedinUrl" placeholder="https://linkedin.com/in/username" />
                </div>
                <div class="form-group full-width">
                  <label>GitHub URL</label>
                  <input type="url" [(ngModel)]="personal.githubUrl" placeholder="https://github.com/username" />
                </div>
                <div class="form-group full-width">
                  <label>Portfolio / Personal Website</label>
                  <input type="url" [(ngModel)]="personal.portfolioUrl" placeholder="https://yourportfolio.dev" />
                </div>
                <div class="form-group full-width">
                  <label>Professional Summary</label>
                  <textarea rows="4" [(ngModel)]="personal.summary" placeholder="Brief summary of your background, core strengths, and what drives you..."></textarea>
                </div>
              </div>

              <button class="save-btn" (click)="savePersonal()" [disabled]="saving()">
                {{ saving() ? 'Saving...' : 'Save Personal Details' }}
              </button>
            </div>
          }

          <!-- TAB 2: WORK EXPERIENCES -->
          @if (activeTab() === 'experience') {
            <div class="tab-content">
              <div class="section-actions">
                <span class="count-badge">{{ experiences.length }} roles</span>
                <button class="add-btn" (click)="startAddExperience()">+ Add Experience</button>
              </div>

              @if (editingExperience) {
                <div class="edit-card">
                  <h4>{{ editingExperience.id ? 'Edit Experience' : 'Add Experience' }}</h4>
                  <div class="form-grid">
                    <div class="form-group">
                      <label>Company *</label>
                      <input type="text" [(ngModel)]="editingExperience.company" placeholder="Acme Corp" />
                    </div>
                    <div class="form-group">
                      <label>Role *</label>
                      <input type="text" [(ngModel)]="editingExperience.role" placeholder="Staff Software Engineer" />
                    </div>
                    <div class="form-group">
                      <label>Employment Type</label>
                      <input type="text" [(ngModel)]="editingExperience.employmentType" placeholder="Full-time, Contract, etc." />
                    </div>
                    <div class="form-group checkbox-group">
                      <label>
                        <input type="checkbox" [(ngModel)]="editingExperience.isCurrent" />
                        Currently working here
                      </label>
                    </div>
                    <div class="form-group">
                      <label>Start Date</label>
                      <input type="text" [(ngModel)]="editingExperience.startDate" placeholder="Jan 2022" />
                    </div>
                    @if (!editingExperience.isCurrent) {
                      <div class="form-group">
                        <label>End Date</label>
                        <input type="text" [(ngModel)]="editingExperience.endDate" placeholder="Present / Nov 2024" />
                      </div>
                    }
                    <div class="form-group full-width">
                      <label>Technologies (comma separated)</label>
                      <input type="text" [ngModel]="editingExperience.technologies.join(', ')" (ngModelChange)="editingExperience.technologies = parseCsv($event)" placeholder="TypeScript, PostgreSQL, Docker, AWS" />
                    </div>
                    <div class="form-group full-width">
                      <label>Key Responsibilities (one per line)</label>
                      <textarea rows="3" [ngModel]="editingExperience.responsibilities.join('\n')" (ngModelChange)="editingExperience.responsibilities = parseLines($event)" placeholder="Led backend architecture redesign..."></textarea>
                    </div>
                    <div class="form-group full-width">
                      <label>Notable Achievements (one per line)</label>
                      <textarea rows="3" [ngModel]="editingExperience.achievements.join('\n')" (ngModelChange)="editingExperience.achievements = parseLines($event)" placeholder="Reduced API latency by 45%..."></textarea>
                    </div>
                  </div>
                  <div class="card-actions">
                    <button class="cancel-btn" (click)="editingExperience = null">Cancel</button>
                    <button class="save-btn" (click)="saveExperience()" [disabled]="saving()">Save Role</button>
                  </div>
                </div>
              }

              <div class="items-list">
                @for (exp of experiences; track exp.id || exp.company) {
                  <div class="item-card">
                    <div class="item-header">
                      <div>
                        <h4 class="item-title">{{ exp.role }}</h4>
                        <p class="item-sub">{{ exp.company }} &bull; {{ exp.startDate }} - {{ exp.isCurrent ? 'Present' : exp.endDate }}</p>
                      </div>
                      <div class="item-btns">
                        <button class="icon-btn" (click)="startEditExperience(exp)" title="Edit">✏️</button>
                        <button class="icon-btn danger" (click)="deleteExperience(exp.id!)" title="Delete">🗑️</button>
                      </div>
                    </div>
                    @if (exp.technologies.length > 0) {
                      <div class="tags-container">
                        @for (tech of exp.technologies; track tech) {
                          <span class="tag">{{ tech }}</span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- TAB 3: EDUCATION -->
          @if (activeTab() === 'education') {
            <div class="tab-content">
              <div class="section-actions">
                <span class="count-badge">{{ educationList.length }} entries</span>
                <button class="add-btn" (click)="startAddEducation()">+ Add Education</button>
              </div>

              @if (editingEducation) {
                <div class="edit-card">
                  <h4>{{ editingEducation.id ? 'Edit Education' : 'Add Education' }}</h4>
                  <div class="form-grid">
                    <div class="form-group">
                      <label>Institution *</label>
                      <input type="text" [(ngModel)]="editingEducation.institution" placeholder="University of California" />
                    </div>
                    <div class="form-group">
                      <label>Degree *</label>
                      <input type="text" [(ngModel)]="editingEducation.degree" placeholder="B.S. in Computer Science" />
                    </div>
                    <div class="form-group full-width">
                      <label>Field of Study</label>
                      <input type="text" [(ngModel)]="editingEducation.fieldOfStudy" placeholder="Software Engineering" />
                    </div>
                    <div class="form-group">
                      <label>Start Date</label>
                      <input type="text" [(ngModel)]="editingEducation.startDate" placeholder="2018" />
                    </div>
                    <div class="form-group">
                      <label>End Date</label>
                      <input type="text" [(ngModel)]="editingEducation.endDate" placeholder="2022" />
                    </div>
                  </div>
                  <div class="card-actions">
                    <button class="cancel-btn" (click)="editingEducation = null">Cancel</button>
                    <button class="save-btn" (click)="saveEducation()" [disabled]="saving()">Save Education</button>
                  </div>
                </div>
              }

              <div class="items-list">
                @for (edu of educationList; track edu.id || edu.institution) {
                  <div class="item-card">
                    <div class="item-header">
                      <div>
                        <h4 class="item-title">{{ edu.degree }}</h4>
                        <p class="item-sub">{{ edu.institution }} {{ edu.fieldOfStudy ? '(' + edu.fieldOfStudy + ')' : '' }} &bull; {{ edu.startDate }} - {{ edu.endDate }}</p>
                      </div>
                      <div class="item-btns">
                        <button class="icon-btn" (click)="startEditEducation(edu)">✏️</button>
                        <button class="icon-btn danger" (click)="deleteEducation(edu.id!)">🗑️</button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- TAB 4: PROJECTS -->
          @if (activeTab() === 'projects') {
            <div class="tab-content">
              <div class="section-actions">
                <span class="count-badge">{{ projects.length }} projects</span>
                <button class="add-btn" (click)="startAddProject()">+ Add Project</button>
              </div>

              @if (editingProject) {
                <div class="edit-card">
                  <h4>{{ editingProject.id ? 'Edit Project' : 'Add Project' }}</h4>
                  <div class="form-grid">
                    <div class="form-group full-width">
                      <label>Project Name *</label>
                      <input type="text" [(ngModel)]="editingProject.name" placeholder="Real-Time Analytics Platform" />
                    </div>
                    <div class="form-group full-width">
                      <label>Description *</label>
                      <textarea rows="3" [(ngModel)]="editingProject.description" placeholder="What does this project do and what was its purpose?"></textarea>
                    </div>
                    <div class="form-group full-width">
                      <label>Technologies (comma separated)</label>
                      <input type="text" [ngModel]="editingProject.technologies.join(', ')" (ngModelChange)="editingProject.technologies = parseCsv($event)" placeholder="Node.js, Redis, Kafka, React" />
                    </div>
                    <div class="form-group">
                      <label>Project / Demo URL</label>
                      <input type="url" [(ngModel)]="editingProject.projectUrl" placeholder="https://myproject.com" />
                    </div>
                    <div class="form-group">
                      <label>GitHub Repository URL</label>
                      <input type="url" [(ngModel)]="editingProject.githubUrl" placeholder="https://github.com/myproject" />
                    </div>
                  </div>
                  <div class="card-actions">
                    <button class="cancel-btn" (click)="editingProject = null">Cancel</button>
                    <button class="save-btn" (click)="saveProject()" [disabled]="saving()">Save Project</button>
                  </div>
                </div>
              }

              <div class="items-list">
                @for (p of projects; track p.id || p.name) {
                  <div class="item-card">
                    <div class="item-header">
                      <div>
                        <h4 class="item-title">{{ p.name }}</h4>
                        <p class="item-desc">{{ p.description }}</p>
                      </div>
                      <div class="item-btns">
                        <button class="icon-btn" (click)="startEditProject(p)">✏️</button>
                        <button class="icon-btn danger" (click)="deleteProject(p.id!)">🗑️</button>
                      </div>
                    </div>
                    @if (p.technologies.length > 0) {
                      <div class="tags-container">
                        @for (tech of p.technologies; track tech) {
                          <span class="tag">{{ tech }}</span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- TAB 5: SKILLS -->
          @if (activeTab() === 'skills') {
            <div class="tab-content">
              <div class="add-skill-form">
                <input
                  type="text"
                  [(ngModel)]="newSkillName"
                  placeholder="e.g. PostgreSQL, TypeScript, Kubernetes"
                  (keyup.enter)="addSkill()"
                />
                <select [(ngModel)]="newSkillProficiency">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
                <input
                  type="number"
                  [(ngModel)]="newSkillYears"
                  placeholder="Yrs"
                  style="width: 60px;"
                />
                <button class="add-btn" (click)="addSkill()" [disabled]="saving()">Add</button>
              </div>

              <div class="skills-cloud">
                @for (skill of skills; track skill.id || skill.name) {
                  <div class="skill-chip">
                    <span class="skill-name">{{ skill.name }}</span>
                    @if (skill.years) {
                      <span class="skill-yrs">{{ skill.years }}y</span>
                    }
                    @if (skill.proficiency) {
                      <span class="skill-level" [class]="skill.proficiency">{{ skill.proficiency }}</span>
                    }
                    <button class="chip-delete" (click)="deleteSkill(skill.id!)">&times;</button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- TAB 6: WORK ELIGIBILITY -->
          @if (activeTab() === 'eligibility') {
            <div class="tab-content">
              <div class="info-alert">
                <strong>Legal Grounding Rule:</strong> Work authorization is strictly jurisdiction-specific. An authorization in one country does not imply authorization in another.
              </div>

              <div class="add-elig-card">
                <h4>Add / Update Country Eligibility</h4>
                <div class="form-grid">
                  <div class="form-group full-width">
                    <label>Country Code (e.g. US, IN, UK, CA, DE) *</label>
                    <input type="text" [(ngModel)]="newEligCountry" placeholder="US" maxlength="10" />
                  </div>
                  <div class="form-group checkbox-group">
                    <label>
                      <input type="checkbox" [(ngModel)]="newEligAuthorized" />
                      Legally authorized to work
                    </label>
                  </div>
                  <div class="form-group checkbox-group">
                    <label>
                      <input type="checkbox" [(ngModel)]="newEligSponsorship" />
                      Requires visa sponsorship
                    </label>
                  </div>
                  <div class="form-group checkbox-group">
                    <label>
                      <input type="checkbox" [(ngModel)]="newEligRemote" />
                      Can work remotely from here
                    </label>
                  </div>
                  <div class="form-group checkbox-group">
                    <label>
                      <input type="checkbox" [(ngModel)]="newEligRelocate" />
                      Willing to relocate
                    </label>
                  </div>
                </div>
                <button class="save-btn" (click)="saveEligibility()" [disabled]="saving()">Save Eligibility</button>
              </div>

              <div class="items-list">
                @for (elig of eligibilityList; track elig.id || elig.country) {
                  <div class="item-card">
                    <div class="item-header">
                      <div>
                        <h4 class="item-title">Country: {{ elig.country }}</h4>
                        <div class="eligibility-tags">
                          <span class="status-tag" [class.positive]="elig.legallyAuthorized" [class.negative]="!elig.legallyAuthorized">
                            {{ elig.legallyAuthorized ? 'Authorized' : 'Not Authorized' }}
                          </span>
                          <span class="status-tag" [class.warning]="elig.requiresSponsorship">
                            {{ elig.requiresSponsorship ? 'Needs Sponsorship' : 'No Sponsorship Needed' }}
                          </span>
                          @if (elig.remoteWorkAllowed) {
                            <span class="status-tag positive">Remote Eligible</span>
                          }
                          @if (elig.willingToRelocate) {
                            <span class="status-tag positive">Willing to Relocate</span>
                          }
                        </div>
                      </div>
                      <button class="icon-btn danger" (click)="deleteEligibility(elig.id!)">🗑️</button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- TAB 7: AI PREFERENCES -->
          @if (activeTab() === 'preferences') {
            <div class="tab-content">
              <div class="form-grid">
                <div class="form-group full-width">
                  <label>Answer Length</label>
                  <select [(ngModel)]="preferences.length">
                    <option value="short">Short (30–50 words)</option>
                    <option value="medium">Medium (75–100 words)</option>
                    <option value="detailed">Detailed (150–200 words)</option>
                  </select>
                </div>

                <div class="form-group full-width">
                  <label>Tone</label>
                  <select [(ngModel)]="preferences.tone">
                    <option value="natural_professional">Natural Professional</option>
                    <option value="formal">Formal</option>
                    <option value="conversational">Conversational</option>
                    <option value="confident">Confident</option>
                  </select>
                </div>

                <div class="form-group full-width">
                  <label>Style</label>
                  <select [(ngModel)]="preferences.style">
                    <option value="first_person">First person (I built, I designed)</option>
                    <option value="bullet_points">Bullet points</option>
                    <option value="paragraph">Structured paragraph</option>
                  </select>
                </div>

                <div class="form-group full-width">
                  <label>Additional Instructions for AI</label>
                  <textarea rows="4" [(ngModel)]="preferences.additionalInstructions" placeholder="e.g. Keep it direct, focus on system reliability and scale, avoid buzzwords like passionate rockstar."></textarea>
                </div>
              </div>

              <button class="save-btn" (click)="savePreferences()" [disabled]="saving()">
                {{ saving() ? 'Saving...' : 'Save AI Preferences' }}
              </button>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .profile-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .profile-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid #e8eaed;
    }

    .title {
      font-size: 15px;
      font-weight: 700;
      color: #202124;
    }

    .subtitle {
      font-size: 11px;
      color: #5f6368;
    }

    .logout-btn {
      background: transparent;
      border: 1px solid #dadce0;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      color: #5f6368;
    }

    .logout-btn:hover {
      background: #f1f3f4;
      color: #d93025;
    }

    .feedback-toast {
      padding: 8px 12px;
      border-radius: 6px;
      background: #e6f4ea;
      color: #137333;
      font-size: 12px;
      font-weight: 500;
    }

    .feedback-toast.error {
      background: #fce8e6;
      color: #c5221f;
    }

    .tab-bar {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .tab {
      background: #f8f9fa;
      border: 1px solid #dadce0;
      border-radius: 14px;
      padding: 4px 10px;
      font-size: 11px;
      white-space: nowrap;
      cursor: pointer;
      color: #5f6368;
      transition: all 120ms;
    }

    .tab.highlight {
      background: #e8f0fe;
      color: #1a73e8;
      border-color: #c2e7ff;
      font-weight: 600;
    }

    .tab.active {
      background: #1a73e8;
      color: white;
      border-color: #1a73e8;
      font-weight: 500;
    }

    .tab-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .upload-box {
      border: 2px dashed #dadce0;
      border-radius: 8px;
      padding: 32px 16px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      background: #fafbfc;
    }

    .upload-icon {
      font-size: 40px;
    }

    .upload-sub {
      font-size: 11px;
      color: #5f6368;
      margin-bottom: 8px;
    }

    .file-input {
      display: none;
    }

    .upload-btn {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 9px 18px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .upload-btn:hover:not(:disabled) {
      background: #1557b0;
    }

    .review-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .review-section {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .review-section h4 {
      font-size: 13px;
      color: #202124;
      font-weight: 600;
    }

    .help-text {
      font-size: 11px;
      color: #5f6368;
    }

    .bullet-list {
      padding-left: 16px;
      font-size: 11px;
      color: #3c4043;
      margin-top: 4px;
    }

    .facts-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .fact-card {
      background: #f8f9fa;
      border: 1px solid #e8eaed;
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .fact-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .category-badge {
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      background: #e8f0fe;
      color: #1a73e8;
      padding: 1px 6px;
      border-radius: 3px;
      align-self: flex-start;
    }

    .source-tag {
      font-size: 10px;
      color: #5f6368;
      font-style: italic;
    }

    .fact-text {
      font-size: 12px;
      color: #202124;
      line-height: 1.4;
    }

    .conf-badge {
      font-size: 10px;
      color: #137333;
      font-weight: 500;
    }

    .review-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 8px;
    }

    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .checkbox-group label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      cursor: pointer;
    }

    label {
      font-size: 11px;
      font-weight: 600;
      color: #3c4043;
    }

    input, select, textarea {
      padding: 8px 10px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
      font-family: inherit;
    }

    input:focus, select:focus, textarea:focus {
      border-color: #1a73e8;
    }

    .save-btn {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      align-self: flex-start;
      margin-top: 6px;
    }

    .save-btn:hover:not(:disabled) {
      background: #1557b0;
    }

    .save-btn:disabled {
      opacity: 0.6;
    }

    .section-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .count-badge {
      font-size: 11px;
      color: #5f6368;
      font-weight: 500;
    }

    .add-btn {
      background: #e8f0fe;
      color: #1a73e8;
      border: 1px solid #d2e3fc;
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .add-btn:hover {
      background: #d2e3fc;
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .item-card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 6px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .item-title {
      font-size: 13px;
      font-weight: 600;
      color: #202124;
    }

    .item-sub {
      font-size: 11px;
      color: #5f6368;
      margin-top: 2px;
    }

    .item-desc {
      font-size: 12px;
      color: #3c4043;
      margin-top: 4px;
    }

    .item-btns {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 13px;
      padding: 2px 4px;
      border-radius: 3px;
    }

    .icon-btn:hover {
      background: #f1f3f4;
    }

    .icon-btn.danger:hover {
      background: #fce8e6;
    }

    .edit-card {
      background: #f8f9fa;
      border: 1px solid #c2e7ff;
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .card-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 6px;
    }

    .cancel-btn {
      background: transparent;
      border: 1px solid #dadce0;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }

    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .tag {
      background: #e8eaed;
      color: #3c4043;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
    }

    .add-skill-form {
      display: flex;
      gap: 6px;
    }

    .add-skill-form input[type="text"] {
      flex: 1;
    }

    .skills-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }

    .skill-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f1f3f4;
      border: 1px solid #dadce0;
      border-radius: 16px;
      padding: 4px 10px;
      font-size: 12px;
    }

    .chip-delete {
      background: transparent;
      border: none;
      font-size: 14px;
      cursor: pointer;
      color: #80868b;
      margin-left: 2px;
    }

    .chip-delete:hover {
      color: #d93025;
    }

    .info-alert {
      background: #e8f0fe;
      border-left: 4px solid #1a73e8;
      padding: 8px 12px;
      font-size: 11px;
      color: #1a73e8;
      border-radius: 2px;
    }

    .add-elig-card {
      background: #f8f9fa;
      border: 1px solid #dadce0;
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .eligibility-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .status-tag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }

    .status-tag.positive { background: #e6f4ea; color: #137333; }
    .status-tag.negative { background: #fce8e6; color: #c5221f; }
    .status-tag.warning { background: #fef7e0; color: #b06000; }

    .loading-state {
      text-align: center;
      padding: 32px 16px;
      color: #5f6368;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #dadce0;
      border-top-color: #1a73e8;
      border-radius: 50%;
      animation: spin 700ms linear infinite;
    }

    .spinner-small {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid white;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 600ms linear infinite;
    }

    .empty-state {
      text-align: center;
      padding: 32px 16px;
      color: #5f6368;
    }

    .empty-icon {
      font-size: 40px;
      margin-bottom: 8px;
    }

    .empty-text {
      font-size: 13px;
      font-weight: 600;
      color: #202124;
    }

    .empty-sub {
      font-size: 11px;
      color: #5f6368;
      margin-top: 4px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class ProfileComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ProfileApiService);

  readonly activeTab = signal<ActiveTab>('import-cv');
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly extracting = signal<boolean>(false);
  readonly feedbackMessage = signal<string | null>(null);
  readonly isError = signal<boolean>(false);

  // Extracted CV for human review
  extractedData: ExtractedProfileData | null = null;

  // Verified facts
  facts: ProfessionalFact[] = [];

  // Profile data
  personal: PersonalProfile = {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    country: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    headline: '',
    summary: '',
    currentStatus: 'employed',
  };

  experiences: WorkExperience[] = [];
  editingExperience: WorkExperience | null = null;

  educationList: Education[] = [];
  editingEducation: Education | null = null;

  projects: Project[] = [];
  editingProject: Project | null = null;

  skills: SkillRecord[] = [];
  newSkillName = '';
  newSkillProficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert' = 'intermediate';
  newSkillYears?: number;

  eligibilityList: WorkEligibility[] = [];
  newEligCountry = '';
  newEligAuthorized = true;
  newEligSponsorship = false;
  newEligRemote = true;
  newEligRelocate = false;

  preferences: AnswerPreferences = {
    length: 'medium',
    tone: 'natural_professional',
    style: 'first_person',
    additionalInstructions: '',
  };

  ngOnInit() {
    if (this.auth.isAuthenticated()) {
      this.loadProfile();
      this.loadFacts();
    }
  }

  setTab(tab: ActiveTab) {
    this.activeTab.set(tab);
    this.feedbackMessage.set(null);
  }

  showToast(msg: string, isErr = false) {
    this.feedbackMessage.set(msg);
    this.isError.set(isErr);
    setTimeout(() => this.feedbackMessage.set(null), 4000);
  }

  async loadProfile() {
    this.loading.set(true);
    try {
      const data = await this.api.getFullProfile();
      if (data.profile) {
        this.personal = { ...this.personal, ...data.profile };
      } else if (this.auth.user()) {
        this.personal.email = this.auth.user()!.email || '';
      }
      this.experiences = data.experiences || [];
      this.educationList = data.education || [];
      this.projects = data.projects || [];
      this.skills = data.skills || [];
      this.eligibilityList = data.eligibility || [];
      if (data.preferences) {
        this.preferences = { ...this.preferences, ...data.preferences };
      }
    } catch (err: unknown) {
      console.warn('Could not load full profile from API:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async loadFacts() {
    try {
      this.facts = await this.api.getFacts();
    } catch {
      // Handled silently
    }
  }

  // CV Upload & Extraction
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
      this.showToast('That file is larger than 10 MB. Upload a smaller PDF, DOCX or TXT file.', true);
      input.value = '';
      return;
    }
    this.extracting.set(true);

    try {
      const result = await this.api.uploadCv(file);
      this.extractedData = result;
      this.showToast('Document parsed successfully! Review the extracted details below.');
    } catch (err) {
      this.showToast(this.uploadErrorMessage(err), true);
      console.error(err);
    } finally {
      this.extracting.set(false);
      input.value = '';
    }
  }

  /** The API explains file problems (scanned PDF, wrong type...); show that instead of a generic failure. */
  private uploadErrorMessage(err: unknown): string {
    const e = err as { status?: number; error?: { message?: string | string[] } };
    const serverMessage = Array.isArray(e?.error?.message) ? e.error?.message.join(' ') : e?.error?.message;
    if (e?.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    if (e?.status === 429) return 'Too many uploads in a short time. Wait a minute and try again.';
    if (e?.status === 401) return 'Your session expired. Sign in again.';
    return serverMessage || 'Failed to read the CV. Upload a PDF, DOCX or TXT file.';
  }

  removeExtractedSkill(skillName: string) {
    if (this.extractedData) {
      this.extractedData.skills = this.extractedData.skills.filter(
        (s) => s.name !== skillName,
      );
    }
  }

  async confirmExtracted() {
    if (!this.extractedData) return;

    this.saving.set(true);
    try {
      const res = await this.api.confirmExtractedData({
        documentId: this.extractedData.documentId,
        personal: this.extractedData.personal,
        experiences: this.extractedData.experiences,
        education: this.extractedData.education,
        projects: this.extractedData.projects,
        skills: this.extractedData.skills,
        facts: this.extractedData.facts,
      });

      this.showToast(
        `Added ${res.confirmed['facts'] || 0} verified facts and updated profile records!`,
      );
      this.extractedData = null;

      // Reload full state
      await Promise.all([this.loadProfile(), this.loadFacts()]);
      this.setTab('facts');
    } catch {
      this.showToast('Could not save extracted information. Please try again.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteFact(id: string) {
    try {
      await this.api.deleteFact(id);
      this.facts = this.facts.filter((f) => f.id !== id);
      this.showToast('Fact removed.');
    } catch {
      this.showToast('Failed to remove fact.', true);
    }
  }

  // Personal
  async savePersonal() {
    this.saving.set(true);
    try {
      await this.api.updatePersonalProfile(this.personal);
      this.showToast('Personal details saved successfully!');
    } catch {
      this.showToast('Failed to save personal details.', true);
    } finally {
      this.saving.set(false);
    }
  }

  // Experience
  startAddExperience() {
    this.editingExperience = {
      company: '',
      role: '',
      employmentType: 'Full-time',
      startDate: '',
      endDate: '',
      isCurrent: false,
      responsibilities: [],
      technologies: [],
      achievements: [],
    };
  }

  startEditExperience(exp: WorkExperience) {
    this.editingExperience = { ...exp };
  }

  async saveExperience() {
    if (!this.editingExperience || !this.editingExperience.company || !this.editingExperience.role) {
      this.showToast('Please fill in Company and Role.', true);
      return;
    }
    this.saving.set(true);
    try {
      if (this.editingExperience.id) {
        const updated = await this.api.updateExperience(
          this.editingExperience.id,
          this.editingExperience,
        );
        this.experiences = this.experiences.map((e) =>
          e.id === updated.id ? updated : e,
        );
      } else {
        const created = await this.api.createExperience(this.editingExperience);
        this.experiences.unshift(created);
      }
      this.editingExperience = null;
      this.showToast('Experience saved.');
      this.loadFacts();
    } catch {
      this.showToast('Failed to save experience.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteExperience(id: string) {
    try {
      await this.api.deleteExperience(id);
      this.experiences = this.experiences.filter((e) => e.id !== id);
      this.showToast('Experience deleted.');
    } catch {
      this.showToast('Failed to delete experience.', true);
    }
  }

  // Education
  startAddEducation() {
    this.editingEducation = {
      institution: '',
      degree: '',
      fieldOfStudy: '',
      startDate: '',
      endDate: '',
    };
  }

  startEditEducation(edu: Education) {
    this.editingEducation = { ...edu };
  }

  async saveEducation() {
    if (!this.editingEducation || !this.editingEducation.institution || !this.editingEducation.degree) {
      this.showToast('Please fill in Institution and Degree.', true);
      return;
    }
    this.saving.set(true);
    try {
      if (this.editingEducation.id) {
        const updated = await this.api.updateEducation(
          this.editingEducation.id,
          this.editingEducation,
        );
        this.educationList = this.educationList.map((e) =>
          e.id === updated.id ? updated : e,
        );
      } else {
        const created = await this.api.createEducation(this.editingEducation);
        this.educationList.unshift(created);
      }
      this.editingEducation = null;
      this.showToast('Education saved.');
    } catch {
      this.showToast('Failed to save education.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteEducation(id: string) {
    try {
      await this.api.deleteEducation(id);
      this.educationList = this.educationList.filter((e) => e.id !== id);
      this.showToast('Education deleted.');
    } catch {
      this.showToast('Failed to delete education.', true);
    }
  }

  // Projects
  startAddProject() {
    this.editingProject = {
      name: '',
      description: '',
      technologies: [],
      responsibilities: [],
      challenges: [],
      solutions: [],
      outcomes: [],
    };
  }

  startEditProject(p: Project) {
    this.editingProject = { ...p };
  }

  async saveProject() {
    if (!this.editingProject || !this.editingProject.name || !this.editingProject.description) {
      this.showToast('Please fill in Project Name and Description.', true);
      return;
    }
    this.saving.set(true);
    try {
      if (this.editingProject.id) {
        const updated = await this.api.updateProject(
          this.editingProject.id,
          this.editingProject,
        );
        this.projects = this.projects.map((p) => (p.id === updated.id ? updated : p));
      } else {
        const created = await this.api.createProject(this.editingProject);
        this.projects.unshift(created);
      }
      this.editingProject = null;
      this.showToast('Project saved.');
    } catch {
      this.showToast('Failed to save project.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteProject(id: string) {
    try {
      await this.api.deleteProject(id);
      this.projects = this.projects.filter((p) => p.id !== id);
      this.showToast('Project deleted.');
    } catch {
      this.showToast('Failed to delete project.', true);
    }
  }

  // Skills
  async addSkill() {
    if (!this.newSkillName.trim()) return;
    this.saving.set(true);
    try {
      const created = await this.api.upsertSkill({
        name: this.newSkillName.trim(),
        proficiency: this.newSkillProficiency,
        years: this.newSkillYears,
        verified: false,
      });
      this.skills.push(created);
      this.newSkillName = '';
      this.showToast('Skill added.');
    } catch {
      this.showToast('Failed to add skill.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteSkill(id: string) {
    try {
      await this.api.deleteSkill(id);
      this.skills = this.skills.filter((s) => s.id !== id);
    } catch {
      this.showToast('Failed to delete skill.', true);
    }
  }

  // Work Eligibility
  async saveEligibility() {
    if (!this.newEligCountry.trim()) {
      this.showToast('Please enter a country code.', true);
      return;
    }
    this.saving.set(true);
    try {
      const created = await this.api.upsertEligibility({
        country: this.newEligCountry.trim().toUpperCase(),
        legallyAuthorized: this.newEligAuthorized,
        requiresSponsorship: this.newEligSponsorship,
        remoteWorkAllowed: this.newEligRemote,
        willingToRelocate: this.newEligRelocate,
      });
      this.eligibilityList = this.eligibilityList.filter(
        (e) => e.country !== created.country,
      );
      this.eligibilityList.push(created);
      this.newEligCountry = '';
      this.showToast('Eligibility updated.');
    } catch {
      this.showToast('Failed to save eligibility.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteEligibility(id: string) {
    try {
      await this.api.deleteEligibility(id);
      this.eligibilityList = this.eligibilityList.filter((e) => e.id !== id);
      this.showToast('Eligibility removed.');
    } catch {
      this.showToast('Failed to delete eligibility.', true);
    }
  }

  // Preferences
  async savePreferences() {
    this.saving.set(true);
    try {
      await this.api.updatePreferences(this.preferences);
      this.showToast('AI preferences saved!');
    } catch {
      this.showToast('Failed to save preferences.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async onLogout() {
    await this.auth.signOut();
  }

  parseCsv(val: string): string[] {
    return (val || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  parseLines(val: string): string[] {
    return (val || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
