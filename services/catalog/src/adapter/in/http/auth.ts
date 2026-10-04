import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { Principal } from '../../../core/security/principal';

export const AUTHENTICATOR = Symbol('AUTHENTICATOR');

export interface Authenticator {
  authenticate(token: string): Promise<Principal>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bearerOf(header: string | undefined): string | undefined {
  if (!header || header.length < 8 || header.slice(0, 7).toLowerCase() !== 'bearer ') return undefined;
  const token = header.slice(7).trim();
  return token === '' ? undefined : token;
}

export class LocalTokens implements Authenticator {
  async authenticate(token: string): Promise<Principal> {
    const dot = token.indexOf('.');
    if (dot < 0) throw new Error('локальный токен имеет вид role.uuid');
    const role = token.slice(0, dot);
    const sub = token.slice(dot + 1);
    if (!uuidPattern.test(sub)) throw new Error('идентификатор в токене не UUID');
    return new Principal(sub.toLowerCase(), [role]);
  }
}

export class JwtAuthenticator implements Authenticator {
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    jwksUrl: string,
    private readonly issuer: string,
    private readonly audience: string,
  ) {
    this.keys = createRemoteJWKSet(new URL(jwksUrl));
  }

  async authenticate(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.issuer,
      audience: this.audience === '' ? undefined : this.audience,
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['exp'],
    });
    if (!payload.sub || !uuidPattern.test(payload.sub)) throw new Error('sub в токене не UUID');
    return new Principal(payload.sub.toLowerCase(), realmRoles(payload));
  }
}

function realmRoles(payload: JWTPayload): string[] {
  const access = payload.realm_access;
  if (typeof access !== 'object' || access === null) return [];
  const roles = (access as { roles?: unknown }).roles;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];
}
