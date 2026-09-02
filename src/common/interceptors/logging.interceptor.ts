import {
  CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Logs method, path, status, and duration for every request. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(`${method} ${originalUrl} ${response.statusCode} ${duration}ms`);
        },
        error: (err: unknown) => {
          const duration = Date.now() - start;
          const status = (err as { status?: number })?.status ?? 500;
          this.logger.log(`${method} ${originalUrl} ${status} ${duration}ms`);
        },
      }),
    );
  }
}
