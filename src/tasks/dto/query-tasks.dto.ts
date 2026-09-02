import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  PRIORITIES, type Priority, TASK_SORTS, TASK_STATUSES, type TaskSort, type TaskStatus,
} from '../../shared/types/task.types';

export class QueryTasksDto {
  @IsOptional() @IsEnum(TASK_STATUSES)
  status?: TaskStatus = 'all';

  @IsOptional() @IsEnum(PRIORITIES)
  priority?: Priority;

  @IsOptional() @IsString() @MaxLength(24)
  tag?: string;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsEnum(TASK_SORTS)
  sort?: TaskSort = 'smart';
}
