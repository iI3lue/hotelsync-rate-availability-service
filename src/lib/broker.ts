import amqplib, { ChannelModel, ConfirmChannel, ConsumeMessage } from "amqplib";

export const EXCHANGE = "hotelsync.events";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15000;

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;
let connecting: Promise<ConfirmChannel> | null = null;

export async function connect(): Promise<ConfirmChannel> {
  if (channel) return channel;

  connecting ??= (async () => {
    let attempt = 0;
    for (;;) {
      try {
        const conn = await amqplib.connect(RABBITMQ_URL);
        connection = conn;
        conn.on("error", () => {});
        conn.on("close", async () => {
          connection = null;
          channel = null;
          connecting = null;
          await sleep(RETRY_BASE_MS);
          void connect();
        });

        const connectedChannel = await conn.createConfirmChannel();
        await connectedChannel.assertExchange(EXCHANGE, "topic", { durable: true });
        channel = connectedChannel;
        return connectedChannel;
      } catch (err) {
        attempt += 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
        console.warn(
          `[broker] no se pudo conectar a RabbitMQ (intento ${attempt}), reintento en ${delay}ms`,
          err
        );
        await sleep(delay);
      }
    }
  })();

  return connecting;
}

/** Publishes a persistent topic event and waits for the broker confirm. */
export async function publish(routingKey: string, payload: unknown): Promise<void> {
  const connectedChannel = await connect();
  await new Promise<void>((resolve, reject) => {
    connectedChannel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true },
      (error) => (error ? reject(error) : resolve())
    );
  });
}

export type Dispatcher = {
  flush: (max?: number) => Promise<number>;
  publishOne: (routingKey: string, payload: unknown) => Promise<boolean>;
};

export function createDispatcher(
  getPending: (
    max?: number
  ) => Promise<Array<{ event_id: string; event_type: string; payload: unknown }>>,
  markSent: (eventId: string) => Promise<void>
): Dispatcher {
  return {
    async publishOne(routingKey, payload) {
      try {
        await publish(routingKey, payload);
        return true;
      } catch (error) {
        console.error(`[dispatcher] error publicando ${routingKey}`, error);
        return false;
      }
    },
    async flush(max = 100) {
      const rows = await getPending(max);
      let delivered = 0;
      for (const row of rows) {
        if (!(await this.publishOne(row.event_type, row.payload))) break;
        await markSent(row.event_id);
        delivered += 1;
      }
      return delivered;
    },
  };
}

export function startDispatcher(
  flush: () => Promise<unknown>,
  intervalMs = 10_000
): NodeJS.Timeout {
  const timer = setInterval(() => {
    flush().catch((error) => console.error("[dispatcher] flush falló", error));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export type MessageHandler = (routingKey: string, payload: unknown) => Promise<void>;

export async function consume(
  queue: string,
  routingKeys: string[],
  handler: MessageHandler,
  prefetch = 10
): Promise<void> {
  const connectedChannel = await connect();
  await connectedChannel.assertQueue(queue, { durable: true });
  for (const routingKey of routingKeys) {
    await connectedChannel.bindQueue(queue, EXCHANGE, routingKey);
  }
  await connectedChannel.prefetch(prefetch);
  await connectedChannel.consume(
    queue,
    async (message: ConsumeMessage | null) => {
      if (!message) return;
      try {
        const payload = JSON.parse(message.content.toString()) as unknown;
        await handler(message.fields.routingKey, payload);
        connectedChannel.ack(message);
      } catch (error) {
        console.error(
          `[broker] error procesando ${message.fields.routingKey}, requeue`,
          error
        );
        connectedChannel.nack(message, false, true);
      }
    },
    { noAck: false }
  );

  connectedChannel.once("close", () => {
    if (channel === connectedChannel) {
      channel = null;
      connecting = null;
    }
    setTimeout(() => {
      consume(queue, routingKeys, handler, prefetch).catch((error) =>
        console.error(`[broker] no se pudo reanudar ${queue}`, error)
      );
    }, RETRY_BASE_MS).unref?.();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
