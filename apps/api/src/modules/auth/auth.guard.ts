import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from './supabase.service';

/**
 * AuthGuard validates the Bearer token on every protected route.
 *
 * Usage:
 *   @UseGuards(AuthGuard)
 *   @Get('protected-route')
 *   someMethod(@Req() req: AuthenticatedRequest) { ... }
 *
 * The verified user is attached to req.user.
 * Controllers must ALWAYS read the user from req.user, never from the body.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const user = await this.supabase.verifyToken(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Attach user and raw token to request for downstream use
    (request as AuthenticatedRequest).user = user;
    (request as AuthenticatedRequest).accessToken = token;

    return true;
  }

  private extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return null;
    return authorization.slice(7);
  }
}

/**
 * Extends the Express Request type to carry the authenticated user
 * and their access token (needed for RLS-aware Supabase queries).
 */
export interface AuthenticatedRequest extends Request {
  user: import('@supabase/supabase-js').User;
  accessToken: string;
}
