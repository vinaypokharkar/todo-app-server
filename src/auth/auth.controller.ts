import { Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UsersService } from '../users/users.service';

@Controller('auth')
@UseGuards(FirebaseAuthGuard)
export class AuthController {
  constructor(private readonly users: UsersService) {}

  /** Called by the app immediately after every successful sign-in. Idempotent. */
  @Post('sync')
  @HttpCode(200)
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.users.sync(user);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.users.findByUid(user.uid);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }
}
