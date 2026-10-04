export type Config = {
  httpPort: number;
  databaseUrl: string;
};

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    httpPort: Number(env.HTTP_PORT ?? 3086),
    databaseUrl: env.DATABASE_URL ?? 'postgres://catalog:catalog@localhost:5450/payments',
  };
}
