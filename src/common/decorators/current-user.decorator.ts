import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) {
      // Reaching here means a controller used @CurrentUser() without the guard.
      throw new InternalServerErrorException('CurrentUser used without ClerkAuthGuard');
    }
    return request.user;
  },
);
