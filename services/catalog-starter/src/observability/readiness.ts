import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const databaseAnswerTimeoutMs = 2000;

@Injectable()
export class DatabaseReadiness {
  private readonly log = new Logger('readiness');

  constructor(private readonly dataSource: DataSource) {}

  async databaseAnswers(): Promise<boolean> {
    try {
      await withinTimeout(this.dataSource.query('select 1'), databaseAnswerTimeoutMs);
      return true;
    } catch (error) {
      this.log.warn(`база не отвечает: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

function withinTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`нет ответа за ${ms} мс`)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
