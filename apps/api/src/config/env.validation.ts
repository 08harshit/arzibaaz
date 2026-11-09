import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  SUPABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_ANON_KEY!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  XAI_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  XAI_MODEL!: string;

  /** Number of reverse-proxy hops to trust for client IPs (set to 1 on Render/Railway/Fly). */
  @IsString()
  @IsOptional()
  TRUST_PROXY?: string;

  /** OpenAI-compatible endpoint for the AI provider. Defaults to xAI. */
  @IsString()
  @IsOptional()
  AI_BASE_URL?: string;

  /** Pin CORS to one published extension id in production (optional). */
  @IsString()
  @IsOptional()
  EXTENSION_ID?: string;
}

/**
 * Validates all required environment variables at startup.
 * The application will refuse to start if required variables are missing.
 */
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n')}`,
    );
  }

  return validated;
}
