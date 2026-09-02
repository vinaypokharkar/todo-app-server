/**
 * SMART SORT SCORING — MIRRORED FILE
 * ------------------------------------------------------------------
 * An identical copy lives at `src/utils/priority-score.ts` in the
 * `todo-app-mobile` repository. If you change one, change both.
 *
 * The client needs this to re-rank instantly after an optimistic
 * update without waiting for a refetch; the server needs it to return
 * a correctly ordered list. Same maths, both sides, no drift.
 * ------------------------------------------------------------------
 */

import type { Priority } from '../types/task.types';

/** Relative weight of each priority level. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  urgent: 1.0,
  high: 0.7,
  medium: 0.4,
  low: 0.15,
};

/**
 * How far ahead a deadline starts to generate urgency, in hours.
 * 168h = 7 days. A deadline further out than this contributes no
 * urgency at all; urgency then ramps smoothly to 1.0 at the deadline.
 */
export const HORIZON_HOURS = 168;

/** Weighting of the three score components. Must sum to 1.0. */
export const WEIGHTS = { priority: 0.45, urgency: 0.4, overdue: 0.15 } as const;

/**
 * Multiplier applied when a task's start time is still in the future.
 * The user cannot act on it yet, so it is damped rather than hidden.
 */
export const NOT_STARTABLE_DAMPING = 0.6;

const MS_PER_HOUR = 3_600_000;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export interface ScorableTask {
  priority: Priority;
  startAt: string | Date;
  deadline: string | Date;
  completed: boolean;
}

/**
 * Computes a task's smart-sort score.
 *
 * Returns -1 for completed tasks so they always sink below every active
 * task regardless of how urgent they once were.
 * Active tasks return a value in roughly 0..1 (higher = more pressing).
 *
 * Components:
 *   priority — static importance the user assigned.
 *   urgency  — how close the deadline is, ramping over HORIZON_HOURS.
 *   overdue  — extra push for tasks already past their deadline,
 *              saturating after 24h late so a task forgotten for a
 *              month cannot permanently pin itself to the top.
 */
export function priorityScore(task: ScorableTask, now: Date = new Date()): number {
  if (task.completed) return -1;

  const nowMs = now.getTime();
  const deadlineMs = new Date(task.deadline).getTime();
  const startMs = new Date(task.startAt).getTime();

  const hoursLeft = (deadlineMs - nowMs) / MS_PER_HOUR;

  const urgency = clamp01(1 - hoursLeft / HORIZON_HOURS);
  const overdue = hoursLeft < 0 ? clamp01(-hoursLeft / 24) : 0;
  const damping = startMs > nowMs ? NOT_STARTABLE_DAMPING : 1;

  const raw =
    WEIGHTS.priority * PRIORITY_WEIGHT[task.priority] +
    WEIGHTS.urgency * urgency +
    WEIGHTS.overdue * overdue;

  return damping * raw;
}

/**
 * Sorts a copy of the list by descending score.
 * Ties break by nearest deadline, then by newest creation date, so the
 * order is fully deterministic — important because the mobile client
 * sorts the same array locally and must produce an identical result.
 */
export function sortBySmartScore<
  T extends ScorableTask & { deadline: string | Date; createdAt: string | Date },
>(tasks: T[], now: Date = new Date()): T[] {
  return [...tasks].sort((a, b) => {
    const diff = priorityScore(b, now) - priorityScore(a, now);
    if (Math.abs(diff) > 1e-9) return diff;

    const deadlineDiff =
      new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (deadlineDiff !== 0) return deadlineDiff;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
