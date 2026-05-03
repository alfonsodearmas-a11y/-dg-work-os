export interface NotificationDeliveryContext {
  eventType: string;
  recipientId: string;
  parentEntityType: string | null;
  parentEntityId: string | null;
  cause: unknown;
}

export class NotificationDeliveryError extends Error {
  readonly eventType: string;
  readonly recipientId: string;
  readonly parentEntityType: string | null;
  readonly parentEntityId: string | null;

  constructor(ctx: NotificationDeliveryContext) {
    const causeMessage =
      (ctx.cause as { message?: string } | null | undefined)?.message ?? 'unknown';
    super(
      `Notification delivery failed (${ctx.eventType} → ${ctx.recipientId}): ${causeMessage}`,
      { cause: ctx.cause },
    );
    this.name = 'NotificationDeliveryError';
    this.eventType = ctx.eventType;
    this.recipientId = ctx.recipientId;
    this.parentEntityType = ctx.parentEntityType;
    this.parentEntityId = ctx.parentEntityId;
  }

  toLogContext(): {
    user_id: string;
    event_type: string;
    parent_entity_type: string | null;
    parent_entity_id: string | null;
    err_name: string | undefined;
    err_message: string | undefined;
    err_code: string | undefined;
  } {
    const e = this.cause as { name?: string; message?: string; code?: string } | null | undefined;
    return {
      user_id: this.recipientId,
      event_type: this.eventType,
      parent_entity_type: this.parentEntityType,
      parent_entity_id: this.parentEntityId,
      err_name: e?.name,
      err_message: e?.message,
      err_code: e?.code,
    };
  }
}
