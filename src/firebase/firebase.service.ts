import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app!: App;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Guard against double-init during Jest watch runs / hot reload.
    const existing = getApps();
    if (existing.length > 0) {
      this.app = existing[0]!;
      return;
    }

    const b64 = this.config.getOrThrow<string>('FIREBASE_SERVICE_ACCOUNT_BASE64');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json) as ServiceAccount & { projectId?: string };

    this.app = initializeApp({
      credential: cert(serviceAccount),
    });

    this.logger.log(`Firebase Admin initialised for project ${serviceAccount.projectId}`);
  }

  get auth(): Auth {
    return getAuth(this.app);
  }
}
