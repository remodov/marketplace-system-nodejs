import { CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { unauthorized, forbidden } from '../../../core/apperr';
import { Principal, Role } from '../../../core/security/principal';
import { AUTHENTICATOR, Authenticator, bearerOf } from './auth';

const REQUIRED_ROLES = 'requiredRoles';

export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);

export type AuthenticatedRequest = Request & { principal?: Principal };

export const CurrentPrincipal = createParamDecorator((_: unknown, context: ExecutionContext): Principal | undefined => {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
});

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTHENTICATOR) private readonly auth: Authenticator,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.principal = await this.principalOf(request);
    const required = this.reflector.get<Role[] | undefined>(REQUIRED_ROLES, context.getHandler()) ?? [];
    if (required.length === 0) return true;
    if (!request.principal) throw unauthorized('TOKEN_MISSING', 'Требуется аутентификация');
    if (!required.some((role) => request.principal?.hasRole(role))) throw forbidden('ACCESS_DENIED', 'Доступ запрещён');
    return true;
  }

  private async principalOf(request: Request): Promise<Principal | undefined> {
    const token = bearerOf(request.header('authorization'));
    if (!token) return undefined;
    try {
      return await this.auth.authenticate(token);
    } catch (error) {
      throw unauthorized('TOKEN_INVALID', `Токен не принят: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
