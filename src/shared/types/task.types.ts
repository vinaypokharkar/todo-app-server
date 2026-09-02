/**
 * SHARED DOMAIN TYPES — MIRRORED FILE
 * ------------------------------------------------------------------
 * An identical copy of this file lives at `src/types/task.types.ts`
 * in the `todo-app-mobile` repository. If you change one, change both.
 *
 * Kept as a duplicated file rather than a shared npm package: two
 * small files across two repos is less machinery than publishing and
 * versioning a package for a two-repo project.
 * ------------------------------------------------------------------
 */

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_SORTS = ['smart', 'deadline', 'priority', 'created'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export const TASK_STATUSES = ['all', 'active', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** A task as it crosses the wire. Dates are ISO-8601 strings in JSON. */
export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startAt: string;      // ISO-8601
  deadline: string;     // ISO-8601
  priority: Priority;
  tags: string[];
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStats {
  total: number;
  active: number;
  completed: number;
  overdue: number;
  byPriority: Record<Priority, number>;
  completionRate: number; // 0..1, rounded to 2dp
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
}
