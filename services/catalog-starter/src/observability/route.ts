import { Request } from 'express';

export function routeOf(req: Request): string {
  const matched = req.route as { path?: string } | undefined;
  if (!matched?.path) return 'unmatched';
  return `${req.baseUrl}${matched.path}`;
}
