import { sanitizer } from '../../infrastructure/external-services/grpc/proto/sanitizer';

export type SanitizerServiceClientType = InstanceType<
  typeof sanitizer.SanitizerServiceClient
>;
