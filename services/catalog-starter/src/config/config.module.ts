import { Global, Module } from '@nestjs/common';
import { Config, fromEnv } from './config';

export const CONFIG = Symbol('CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: Config = fromEnv()) {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}
