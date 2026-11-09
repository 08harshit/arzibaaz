import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Low-level wrapper around the xAI Grok API.
 *
 * SECURITY: This service holds the API key. It must NEVER be exposed
 * to the frontend or included in any response payload.
 *
 * The API key is loaded exclusively from server-side environment variables.
 */
@Injectable()
export class GrokService {
  private readonly logger = new Logger(GrokService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('XAI_API_KEY'),
      // Any OpenAI-compatible provider works (xAI, Groq, ...); set AI_BASE_URL to switch.
      baseURL: this.config.get<string>('AI_BASE_URL') || 'https://api.x.ai/v1',
      // Free tiers have tight per-minute token limits; the SDK honours retry-after on 429.
      maxRetries: 5,
    });
    this.model = this.config.getOrThrow<string>('XAI_MODEL');
  }

  /**
   * Sends a prompt to Grok and returns the raw text response.
   *
   * @param systemPrompt - Instructions that define the AI's behavior.
   * @param userContent - The user-facing content (treated as data, not instructions).
   */
  async complete(systemPrompt: string, userContent: string): Promise<string> {
    this.logger.debug(`Sending completion request to Grok (${this.model})`);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2, // low temperature for high factual accuracy
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error('Empty response from Grok API');
    }

    return text;
  }

  /**
   * Sends a prompt and parses the JSON response into a typed object.
   * Cleans markdown fences if present.
   */
  async completeJson<T>(systemPrompt: string, userContent: string): Promise<T> {
    const raw = await this.complete(systemPrompt, userContent);
    return this.cleanAndParseJson<T>(raw);
  }

  private cleanAndParseJson<T>(text: string): T {
    // Strip markdown code fences if model returned ```json ... ```
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      this.logger.error('Failed to parse Grok JSON output', { rawText: text, err });
      throw new Error(`Invalid JSON returned from AI provider: ${text.slice(0, 200)}`);
    }
  }
}
