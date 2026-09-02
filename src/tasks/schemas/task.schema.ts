import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PRIORITIES, type Priority } from '../../shared/types/task.types';

export type TaskDocument = HydratedDocument<Task>;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
})
export class Task {
  /** Clerk user id of the owner. Every query filters on this. */
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 120 })
  title: string;

  @Prop({ type: String, trim: true, maxlength: 1000, default: null })
  description: string | null;

  /** When the user intends to start. Feeds the damping term of the score. */
  @Prop({ required: true, type: Date })
  startAt: Date;

  /** When it is due. Feeds the urgency and overdue terms. */
  @Prop({ required: true, type: Date })
  deadline: Date;

  @Prop({ type: String, required: true, enum: PRIORITIES, default: 'medium' })
  priority: Priority;

  @Prop({ type: [String], default: [], index: true })
  tags: string[];

  @Prop({ required: true, default: false, index: true })
  completed: boolean;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  createdAt: Date; // added by timestamps
  updatedAt: Date; // added by timestamps
}

export const TaskSchema = SchemaFactory.createForClass(Task);

/** Supports the dominant access pattern: one user's tasks, filtered by status, by deadline. */
TaskSchema.index({ userId: 1, completed: 1, deadline: 1 });

/** Supports free-text search on title + description. */
TaskSchema.index({ title: 'text', description: 'text' });
