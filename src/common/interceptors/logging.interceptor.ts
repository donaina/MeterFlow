import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const startTime = Date.now();
    const { method, url, ip } = req;
    const requestId = (req as any).requestId || req.headers['x-request-id'] || 'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          this.logger.log(
            JSON.stringify({
              type: 'request_completed',
              requestId,
              method,
              url,
              statusCode,
              durationMs: duration,
              ip,
              timestamp: new Date().toISOString(),
            }),
          );
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const statusCode = err.status || 500;
          this.logger.error(
            JSON.stringify({
              type: 'request_failed',
              requestId,
              method,
              url,
              statusCode,
              durationMs: duration,
              error: err.message,
              timestamp: new Date().toISOString(),
            }),
          );
        },
      }),
    );
  }
}
