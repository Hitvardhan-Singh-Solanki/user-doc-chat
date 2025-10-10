import { sanitizer } from '@grpc/proto/sanitizer';

export type SanitizerServiceClientType = InstanceType<
  typeof sanitizer.SanitizerServiceClient
>;
