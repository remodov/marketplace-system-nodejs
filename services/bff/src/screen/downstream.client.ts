import { Agent, fetch } from 'undici';

export const NO_RESPONSE = 0;
const DEFAULT_TIMEOUT_MS = 2000;

export class DownstreamError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    cause?: unknown,
  ) {
    super(status === NO_RESPONSE ? `${service}: ${messageOf(cause)}` : `${service}: ответил ${status}`, { cause });
    this.name = 'DownstreamError';
  }
}

export const answered = (service: string, status: number): DownstreamError => new DownstreamError(service, status);
export const unreachable = (service: string, cause: unknown): DownstreamError => new DownstreamError(service, NO_RESPONSE, cause);

export function isNotFound(error: unknown, service: string): boolean {
  return error instanceof DownstreamError && error.service === service && error.status === 404;
}

export class DownstreamClient {
  private readonly agent: Agent;

  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.agent = new Agent({ connect: { timeout: timeoutMs } });
  }

  async getJson<T>(path: string, authorization: string | undefined): Promise<T> {
    const response = await this.send(path, authorization);
    if (response.status !== 200) {
      await response.body?.cancel();
      throw answered(this.name, response.status);
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw unreachable(this.name, error);
    }
  }

  async close(): Promise<void> {
    await this.agent.close();
  }

  private async send(path: string, authorization: string | undefined) {
    try {
      return await fetch(this.baseUrl + path, {
        dispatcher: this.agent,
        headers: authorization ? { authorization } : {},
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw unreachable(this.name, error);
    }
  }
}

function messageOf(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  return cause.cause instanceof Error ? `${cause.message}: ${describe(cause.cause)}` : cause.message;
}

function describe(error: Error): string {
  const code = (error as { code?: string }).code;
  return error.message || code || error.name;
}
