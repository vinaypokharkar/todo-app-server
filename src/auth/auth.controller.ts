import { Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClerkAuthGuard } from './guards/clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UsersService } from '../users/users.service';
import { ClerkService } from '../clerk/clerk.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
@UseGuards(ClerkAuthGuard)
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly clerk: ClerkService,
  ) {}

  /**
   * Called by the app immediately after every successful sign-in. Idempotent.
   *
   * The verified session token only carries `sub` (the user id) — email,
   * name, and avatar aren't guaranteed to be in its claims, so this fetches
   * the full profile from Clerk once here rather than on every request.
   */
  @Post('sync')
  @HttpCode(200)
  async sync(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.clerk.client.users.getUser(user.uid);
    return this.users.sync({
      uid: user.uid,
      email: profile.primaryEmailAddress?.emailAddress ?? profile.emailAddresses[0]?.emailAddress ?? null,
      displayName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username || null,
      photoURL: profile.imageUrl ?? null,
    });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.users.findByUid(user.uid);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }
}
