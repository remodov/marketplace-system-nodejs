import { HttpStatus, INestApplication } from '@nestjs/common';
import { ProblemFilter, validationPipe } from './http/problem';

export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ProblemFilter());
  app.getHttpAdapter().getInstance().set('json spaces', 0);
  void HttpStatus;
  return app;
}
