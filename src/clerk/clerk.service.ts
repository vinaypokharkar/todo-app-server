import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClerkClient, createClerkClient } from '@clerk/backend';

@Injectable()
export class ClerkService {
  readonly client: ClerkClient;
  readonly secretKey: string;

  constructor(config: ConfigService) {
    this.secretKey = config.getOrThrow<string>('CLERK_SECRET_KEY');
    this.client = createClerkClient({ secretKey: this.secretKey });
  }
}
