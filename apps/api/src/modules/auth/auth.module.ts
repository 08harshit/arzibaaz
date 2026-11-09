import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { AuthGuard } from './auth.guard';
import { AuthPagesController } from './auth-pages.controller';

/**
 * AuthModule provides:
 * - SupabaseService for JWT verification and database access.
 * - AuthGuard for protecting endpoints with Supabase JWTs.
 *
 * Marked global so other modules can inject SupabaseService without
 * re-importing AuthModule.
 */
@Global()
@Module({
  controllers: [AuthPagesController],
  providers: [SupabaseService, AuthGuard],
  exports: [SupabaseService, AuthGuard],
})
export class AuthModule {}
