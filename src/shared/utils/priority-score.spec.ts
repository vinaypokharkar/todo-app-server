import { priorityScore, sortBySmartScore } from './priority-score';
import type { Priority } from '../types/task.types';

const NOW = new Date('2026-09-02T16:00:00.000Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const make = (over: Partial<{
  priority: Priority; startAt: string; deadline: string; completed: boolean; createdAt: string;
}> = {}) => ({
  priority: 'medium' as Priority,
  startAt: hoursFromNow(-1),
  deadline: hoursFromNow(24),
  completed: false,
  createdAt: hoursFromNow(-48),
  ...over,
});

describe('priorityScore', () => {
  it('sinks completed tasks below every active task', () => {
    const done = make({ completed: true, priority: 'urgent', deadline: hoursFromNow(-100) });
    const active = make({ priority: 'low', deadline: hoursFromNow(720) });
    expect(priorityScore(done, NOW)).toBe(-1);
    expect(priorityScore(active, NOW)).toBeGreaterThan(priorityScore(done, NOW));
  });

  it('ranks an overdue high above a not-yet-due medium', () => {
    const overdueHigh = make({ priority: 'high', deadline: hoursFromNow(-6) });
    const futureMedium = make({ priority: 'medium', deadline: hoursFromNow(48) });
    expect(priorityScore(overdueHigh, NOW)).toBeGreaterThan(priorityScore(futureMedium, NOW));
  });

  it('ranks an imminent urgent above an overdue high', () => {
    const imminentUrgent = make({ priority: 'urgent', deadline: hoursFromNow(2) });
    const overdueHigh = make({ priority: 'high', deadline: hoursFromNow(-6) });
    expect(priorityScore(imminentUrgent, NOW)).toBeGreaterThan(priorityScore(overdueHigh, NOW));
  });

  it('damps a task whose start time has not arrived', () => {
    const base = { priority: 'high' as Priority, deadline: hoursFromNow(10) };
    const startable = make({ ...base, startAt: hoursFromNow(-1) });
    const notYet = make({ ...base, startAt: hoursFromNow(5) });
    expect(priorityScore(notYet, NOW)).toBeLessThan(priorityScore(startable, NOW));
    expect(priorityScore(notYet, NOW)).toBeCloseTo(priorityScore(startable, NOW) * 0.6, 6);
  });

  it('saturates the overdue boost after 24 hours late', () => {
    const oneDayLate = make({ priority: 'low', deadline: hoursFromNow(-24) });
    const oneMonthLate = make({ priority: 'low', deadline: hoursFromNow(-720) });
    expect(priorityScore(oneMonthLate, NOW)).toBeCloseTo(priorityScore(oneDayLate, NOW), 6);
  });

  it('contributes no urgency beyond the 7-day horizon', () => {
    const farOut = make({ priority: 'low', deadline: hoursFromNow(200) });
    expect(priorityScore(farOut, NOW)).toBeCloseTo(0.45 * 0.15, 6);
  });

  it('produces a deterministic order for equal scores', () => {
    const a = { ...make({ deadline: hoursFromNow(5) }), id: 'a' };
    const b = { ...make({ deadline: hoursFromNow(5) }), id: 'b', createdAt: hoursFromNow(-1) };
    const sorted = sortBySmartScore([a, b], NOW);
    expect(sorted[0].id).toBe('b'); // newer createdAt wins the final tiebreak
  });
});
