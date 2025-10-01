import { Queue, QueueEvents } from 'bullmq';

export const fileQueueName = 'file-processing';
export const legalDocumentsQueueName = 'legal-documents';

// Parse and validate Redis port with proper error handling
const parseRedisPort = (): number => {
  const portStr = process.env.REDIS_PORT;

  if (!portStr) {
    return 6379; // Default port when unset
  }

  const port = parseInt(portStr, 10);

  if (isNaN(port)) {
    throw new Error(
      `Invalid REDIS_PORT value: "${portStr}". Must be a valid number.`,
    );
  }

  if (port < 1 || port > 65535) {
    throw new Error(
      `Invalid REDIS_PORT value: ${port}. Must be between 1 and 65535.`,
    );
  }

  return port;
};

export const connectionOptions = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseRedisPort(),
};

export const fileQueue = new Queue(fileQueueName, {
  connection: connectionOptions,
});

export const fileQueueEvents = new QueueEvents(fileQueueName, {
  connection: connectionOptions,
});

export const legalDocumentsQueue = new Queue(legalDocumentsQueueName, {
  connection: connectionOptions,
});
