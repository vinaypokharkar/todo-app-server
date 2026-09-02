import { plainToInstance } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, validateSync } from 'class-validator';

class EnvVars {
  @IsOptional() @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  @IsOptional() @IsString()
  PORT?: string;

  @IsString() @IsNotEmpty({ message: 'MONGODB_URI is required' })
  MONGODB_URI: string;

  @IsString() @IsNotEmpty({ message: 'CLERK_SECRET_KEY is required' })
  CLERK_SECRET_KEY: string;

  @IsOptional() @IsString()
  CORS_ORIGINS?: string;
}

/** Runs at boot. A missing variable crashes the process with a readable message. */
export function validateEnv(config: Record<string, unknown>): EnvVars {
  const parsed = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => `  - ${Object.values(e.constraints ?? {}).join(', ')}`)
        .join('\n')}`,
    );
  }
  return parsed;
}
