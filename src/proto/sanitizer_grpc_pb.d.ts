import * as grpc from '@grpc/grpc-js';
import { SanitizeRequest, SanitizeResponse } from './sanitizer_pb';

export class SanitizerServiceClient extends grpc.Client {
  constructor(
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: object,
  );
  sanitizeDocument(
    request: SanitizeRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: SanitizeResponse,
    ) => void,
  ): grpc.ClientUnaryCall;
  sanitizeDocument(
    request: SanitizeRequest,
    metadata: grpc.Metadata,
    callback: (
      error: grpc.ServiceError | null,
      response: SanitizeResponse,
    ) => void,
  ): grpc.ClientUnaryCall;
  sanitizeDocument(
    request: SanitizeRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (
      error: grpc.ServiceError | null,
      response: SanitizeResponse,
    ) => void,
  ): grpc.ClientUnaryCall;
}
