// package: sanitizer
// file: sanitizer.proto

import * as jspb from "google-protobuf";

export class SanitizeRequest extends jspb.Message {
  getDocumentType(): string;
  setDocumentType(value: string): void;

  getDocumentData(): Uint8Array | string;
  getDocumentData_asU8(): Uint8Array;
  getDocumentData_asB64(): string;
  setDocumentData(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SanitizeRequest.AsObject;
  static toObject(includeInstance: boolean, msg: SanitizeRequest): SanitizeRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: SanitizeRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SanitizeRequest;
  static deserializeBinaryFromReader(message: SanitizeRequest, reader: jspb.BinaryReader): SanitizeRequest;
}

export namespace SanitizeRequest {
  export type AsObject = {
    documentType: string,
    documentData: Uint8Array | string,
  }
}

export class SanitizeResponse extends jspb.Message {
  getSanitizedContent(): string;
  setSanitizedContent(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SanitizeResponse.AsObject;
  static toObject(includeInstance: boolean, msg: SanitizeResponse): SanitizeResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: SanitizeResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SanitizeResponse;
  static deserializeBinaryFromReader(message: SanitizeResponse, reader: jspb.BinaryReader): SanitizeResponse;
}

export namespace SanitizeResponse {
  export type AsObject = {
    sanitizedContent: string,
  }
}

