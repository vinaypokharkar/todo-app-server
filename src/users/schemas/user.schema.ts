import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  toJSON: {
    versionKey: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret._id;
      return ret;
    },
  },
})
export class User {
  /** Clerk user id. The join key between Clerk identity and our data. */
  @Prop({ required: true, unique: true, index: true })
  uid: string;

  @Prop({ type: String, default: null })
  email: string | null;

  @Prop({ type: String, default: null })
  displayName: string | null;

  @Prop({ type: String, default: null })
  photoURL: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
