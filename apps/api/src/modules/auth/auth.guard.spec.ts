import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { SupabaseService } from './supabase.service';

describe('AuthGuard (Security & Isolation)', () => {
  let guard: AuthGuard;
  let supabaseMock: { verifyToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    supabaseMock = {
      verifyToken: vi.fn(),
    };
    guard = new AuthGuard(supabaseMock as unknown as SupabaseService);
  });

  const createMockContext = (authHeader?: string): ExecutionContext => {
    const request = {
      headers: {
        authorization: authHeader,
      },
      user: undefined,
      accessToken: undefined,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('rejects requests with missing authorization header', async () => {
    const context = createMockContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests with non-Bearer authorization header', async () => {
    const context = createMockContext('Basic xyz123');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests when token is invalid or expired', async () => {
    supabaseMock.verifyToken.mockResolvedValue(null);
    const context = createMockContext('Bearer invalid_token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(supabaseMock.verifyToken).toHaveBeenCalledWith('invalid_token');
  });

  it('attaches verified user identity from token to request (preventing client spoofing)', async () => {
    const mockUser = { id: 'usr_valid_123', email: 'test@example.com' };
    supabaseMock.verifyToken.mockResolvedValue(mockUser);

    const context = createMockContext('Bearer valid_jwt_token');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest();
    expect(req.user).toEqual(mockUser);
    expect(req.user.id).toBe('usr_valid_123');
    expect(req.accessToken).toBe('valid_jwt_token');
  });
});
