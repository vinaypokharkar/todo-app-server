import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, isValidObjectId } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { priorityScore } from '../shared/utils/priority-score';
import { PRIORITY_WEIGHT } from '../shared/utils/priority-score';
import { Priority, TaskStats } from '../shared/types/task.types';

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>) {}

  /** Rejects a deadline that precedes the start time. Applied on create and update. */
  private assertChronology(startAt?: string | Date, deadline?: string | Date): void {
    if (!startAt || !deadline) return;
    if (new Date(deadline).getTime() < new Date(startAt).getTime()) {
      throw new BadRequestException('deadline must be the same as or after startAt');
    }
  }

  private assertObjectId(id: string): void {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid task id');
  }

  async create(userId: string, dto: CreateTaskDto) {
    this.assertChronology(dto.startAt, dto.deadline);
    const created = await this.taskModel.create({
      ...dto,
      userId,
      description: dto.description ?? null,
      priority: dto.priority ?? 'medium',
      tags: dto.tags ?? [],
      completed: false,
      completedAt: null,
    });
    return this.withScore(created);
  }

  async findAll(userId: string, query: QueryTasksDto) {
    const filter: QueryFilter<TaskDocument> = { userId };

    if (query.status === 'active') filter.completed = false;
    if (query.status === 'completed') filter.completed = true;
    if (query.priority) filter.priority = query.priority;
    if (query.tag) filter.tags = query.tag.toLowerCase();
    if (query.search) {
      // Escape regex metacharacters so a user searching "c++" doesn't blow up.
      const safe = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ title: rx }, { description: rx }];
    }

    const docs = await this.taskModel.find(filter).lean({ virtuals: false }).exec();
    const now = new Date();

    const withScores = docs.map((d) => ({
      ...d,
      id: String(d._id),
      _id: undefined,
      score: Number(priorityScore(d as never, now).toFixed(3)),
    }));

    // ponytail: sorting in memory rather than a Mongo aggregation.
    // Exact, trivially testable, and fine to ~1k tasks per user. If a
    // single user ever exceeds that, move this into an $addFields stage.
    const sorted = this.applySort(withScores, query.sort ?? 'smart');

    return { data: sorted, count: sorted.length };
  }

  private applySort(tasks: Array<Record<string, any>>, sort: string) {
    // Every non-smart mode sinks completed tasks below active ones first (smart gets this
    // for free from the score, which is -1 for completed) — named once so the four modes
    // read as the same rule applied with different tiebreakers, not four hand-rolled copies.
    const byCompletedLast = (a: any, b: any) => Number(a.completed) - Number(b.completed);
    const byDeadline = (a: any, b: any) =>
      new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    const byCreated = (a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    switch (sort) {
      case 'deadline':
        return tasks.sort((a, b) => byCompletedLast(a, b) || byDeadline(a, b));
      case 'priority':
        return tasks.sort(
          (a, b) =>
            byCompletedLast(a, b) ||
            PRIORITY_WEIGHT[b.priority as Priority] - PRIORITY_WEIGHT[a.priority as Priority] ||
            byDeadline(a, b),
        );
      case 'created':
        return tasks.sort((a, b) => byCompletedLast(a, b) || byCreated(a, b));
      case 'smart':
      default:
        return tasks.sort(
          (a, b) => b.score - a.score || byDeadline(a, b) || byCreated(a, b),
        );
    }
  }

  async findOne(userId: string, id: string) {
    this.assertObjectId(id);
    // Ownership lives in the filter — a foreign id is indistinguishable from a missing one.
    const doc = await this.taskModel.findOne({ _id: id, userId }).exec();
    if (!doc) throw new NotFoundException('Task not found');
    return this.withScore(doc);
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    this.assertObjectId(id);
    const existing = await this.taskModel.findOne({ _id: id, userId }).exec();
    if (!existing) throw new NotFoundException('Task not found');

    this.assertChronology(dto.startAt ?? existing.startAt, dto.deadline ?? existing.deadline);

    if (dto.completed !== undefined && dto.completed !== existing.completed) {
      existing.completedAt = dto.completed ? new Date() : null;
    }
    Object.assign(existing, dto);
    await existing.save();
    return this.withScore(existing);
  }

  async toggle(userId: string, id: string) {
    this.assertObjectId(id);
    const doc = await this.taskModel.findOne({ _id: id, userId }).exec();
    if (!doc) throw new NotFoundException('Task not found');

    doc.completed = !doc.completed;
    doc.completedAt = doc.completed ? new Date() : null;
    await doc.save();
    return this.withScore(doc);
  }

  async remove(userId: string, id: string) {
    this.assertObjectId(id);
    const res = await this.taskModel.deleteOne({ _id: id, userId }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('Task not found');
    return { id, deleted: true };
  }

  async stats(userId: string): Promise<TaskStats> {
    const docs = await this.taskModel.find({ userId }).lean().exec();
    const now = Date.now();

    const byPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    let active = 0;
    let completed = 0;
    let overdue = 0;

    for (const t of docs) {
      byPriority[t.priority as Priority] += 1;
      if (t.completed) completed += 1;
      else {
        active += 1;
        if (new Date(t.deadline).getTime() < now) overdue += 1;
      }
    }

    const total = docs.length;
    return {
      total,
      active,
      completed,
      overdue,
      byPriority,
      completionRate: total === 0 ? 0 : Number((completed / total).toFixed(2)),
    };
  }

  /** Serialises a document and appends its computed score. */
  private withScore(doc: TaskDocument) {
    const json = doc.toJSON() as unknown as Record<string, unknown>;
    return { ...json, score: Number(priorityScore(doc as never).toFixed(3)) };
  }
}
