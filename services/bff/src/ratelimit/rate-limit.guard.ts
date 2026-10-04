import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { rateLimited } from '../httpapi/problem';
import { Decision, Limiter } from './limiter';

const CLIENT_HEADER = 'x-client-id';
const ANONYMOUS = 'anonymous';

export function clientOf(request: Request): string {
  const client = request.header(CLIENT_HEADER)?.trim();
  return client ? client : ANONYMOUS;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly log = new Logger('ratelimit');

  constructor(private readonly limiter: Limiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const client = clientOf(http.getRequest<Request>());
    const decision = await this.decide(client);
    if (!decision) return true;
    http.getResponse<Response>().setHeader('X-RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) throw rateLimited(decision.retryAfterSeconds);
    return true;
  }

  private async decide(client: string): Promise<Decision | undefined> {
    try {
      return await this.limiter.check(client);
    } catch (error) {
      this.log.warn(`лимит частоты не проверен, запрос пропущен: client=${client}, ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}
