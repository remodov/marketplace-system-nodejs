export type AuthMode = 'local' | 'jwt';

export type Config = {
  httpPort: number;
  databaseUrl: string;
  authMode: AuthMode;
  jwksUrl: string;
  jwtIssuer: string;
  jwtAudience: string;
  s3Endpoint: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Bucket: string;
  imageUploadUrlTtlSeconds: number;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3080),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/catalog',
    authMode: env.AUTH_MODE === 'jwt' ? 'jwt' : 'local',
    jwksUrl: env.JWKS_URL ?? 'http://localhost:8180/realms/marketplace/protocol/openid-connect/certs',
    jwtIssuer: env.JWT_ISSUER ?? 'http://localhost:8180/realms/marketplace',
    jwtAudience: env.JWT_AUDIENCE ?? '',
    s3Endpoint: env.S3_ENDPOINT ?? 'http://localhost:9002',
    s3Region: env.S3_REGION ?? 'us-east-1',
    s3AccessKey: env.S3_ACCESS_KEY ?? 'marketplace',
    s3SecretKey: env.S3_SECRET_KEY ?? 'marketplace',
    s3Bucket: env.S3_BUCKET ?? 'marketplace-images',
    imageUploadUrlTtlSeconds: Number(env.IMAGE_UPLOAD_URL_TTL_SECONDS ?? 600),
  };
}
