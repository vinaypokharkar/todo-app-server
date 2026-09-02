import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FirebaseService } from '../../firebase/firebase.service';

/**
 * Verifies the Firebase ID token on the Authorization header and attaches
 * the caller to `request.user`.
 *
 * Deliberately does NOT write to Mongo. Upserting a user document on every
 * request would add a write to every read path; the client calls
 * POST /auth/sync once after each sign-in instead, which is enough to
 * guarantee the profile exists.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Empty bearer token');

    try {
      const decoded = await this.firebase.auth.verifyIdToken(token);
      request.user = {
        uid: decoded.uid,
        email: decoded.email ?? null,
        displayName: decoded.name ?? null,
        photoURL: decoded.picture ?? null,
      };
      return true;
    } catch (error) {
      // Log the reason server-side; never leak token internals to the client.
      this.logger.warn(`Token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
