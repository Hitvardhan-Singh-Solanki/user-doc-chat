import * as grpc from "@grpc/grpc-js";
import { SanitizeRequest, SanitizeResponse } from "./sanitizer_pb";

export class SanitizerClient extends grpc.Client {
  constructor(
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: object
  );
  sanitize(
    request: SanitizeRequest,
    callback: (
      error: grpc.ServiceError | null,
      response: SanitizeResponse
    ) => void
  ): grpc.ClientUnaryCall;
}
