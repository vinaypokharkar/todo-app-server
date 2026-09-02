import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PRIORITIES, type Priority } from '../../shared/types/task.types';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : null))
  description?: string | null;

  @IsDateString({}, { message: 'startAt must be a valid ISO-8601 date string' })
  startAt: string;

  @IsDateString({}, { message: 'deadline must be a valid ISO-8601 date string' })
  deadline: string;

  @IsOptional()
  @IsEnum(PRIORITIES, { message: `priority must be one of: ${PRIORITIES.join(', ')}` })
  priority?: Priority;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(24, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean))]
      : value,
  )
  tags?: string[];
}
