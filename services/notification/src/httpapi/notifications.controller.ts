import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import { Config } from '../config';
import { InboxProcessor, isUuid, Notification } from '../inbox/inbox';
import { accessDenied, validationError } from './problem';

export const CONFIG = Symbol('CONFIG');

export type NotificationList = {
  items: Notification[];
};

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly processor: InboxProcessor,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined, @Query('userId') userId: string | undefined): Promise<NotificationList> {
    if (bearerOf(authorization) !== this.config.adminToken) throw accessDenied();
    if (!isUuid(userId)) throw validationError('userId должен быть UUID');
    return { items: await this.processor.listByUser(userId.toLowerCase()) };
  }
}

function bearerOf(header: string | undefined): string | undefined {
  if (!header || header.slice(0, 7).toLowerCase() !== 'bearer ') return undefined;
  const token = header.slice(7).trim();
  return token === '' ? undefined : token;
}
