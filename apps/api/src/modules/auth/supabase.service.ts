import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly client: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    // Use the anon key — RLS enforces data isolation.
    // The service-role key must NEVER be used in this application.
    this.client = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_ANON_KEY'),
    );
  }

  /**
   * Verifies a Supabase access token and returns the authenticated user.
   * Returns null if the token is invalid or expired.
   *
   * SECURITY: Always use this method to derive user identity.
   * Never trust a user_id supplied in a request body.
   */
  async verifyToken(token: string): Promise<User | null> {
    try {
      const { data, error } = await this.client.auth.getUser(token);
      if (error || !data.user) {
        this.logger.warn(`Token verification failed: ${error?.message}`);
        return null;
      }
      return data.user;
    } catch (err) {
      this.logger.error('Unexpected error during token verification', err);
      return null;
    }
  }

  /**
   * Returns a Supabase client authenticated with the user's access token.
   * This ensures RLS policies are applied using the user's identity.
   */
  getAuthenticatedClient(accessToken: string): SupabaseClient {
    return createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_ANON_KEY'),
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      },
    );
  }
}
