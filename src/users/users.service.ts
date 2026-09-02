import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserProfile } from '../shared/types/task.types';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  /** Upserts the profile from the verified token. Called once per sign-in, idempotent. */
  async sync(user: AuthenticatedUser): Promise<UserProfile> {
    const doc = await this.userModel
      .findOneAndUpdate(
        { uid: user.uid },
        {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();
    return this.toProfile(doc);
  }

  /** Returns null when no profile row exists yet — caller decides how to respond. */
  async findByUid(uid: string): Promise<UserProfile | null> {
    const doc = await this.userModel.findOne({ uid }).exec();
    return doc ? this.toProfile(doc) : null;
  }

  private toProfile(doc: UserDocument): UserProfile {
    return {
      uid: doc.uid,
      email: doc.email,
      displayName: doc.displayName,
      photoURL: doc.photoURL,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
