export type AuthMode = 'local' | 'jwt';

export type Config = {
  httpPort: number;
  databaseUrl: string;
  authMode: AuthMode;
  jwksUrl: string;
  jwtIssuer: string;
  jwtAudience: string;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3080),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/catalog',
    authMode: env.AUTH_MODE === 'jwt' ? 'jwt' : 'local',
    jwksUrl: env.JWKS_URL ?? 'http://localhost:8180/realms/marketplace/protocol/openid-connect/certs',
    jwtIssuer: env.JWT_ISSUER ?? 'http://localhost:8180/realms/marketplace',
    jwtAudience: env.JWT_AUDIENCE ?? '',
  };
}
