// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var sanitizer_pb = require('./sanitizer_pb.js');

function serialize_sanitizer_SanitizeRequest(arg) {
  if (!(arg instanceof sanitizer_pb.SanitizeRequest)) {
    throw new Error('Expected argument of type sanitizer.SanitizeRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_sanitizer_SanitizeRequest(buffer_arg) {
  return sanitizer_pb.SanitizeRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_sanitizer_SanitizeResponse(arg) {
  if (!(arg instanceof sanitizer_pb.SanitizeResponse)) {
    throw new Error('Expected argument of type sanitizer.SanitizeResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_sanitizer_SanitizeResponse(buffer_arg) {
  return sanitizer_pb.SanitizeResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// Defines the service contract for sanitizing documents.
var SanitizerServiceService = exports.SanitizerServiceService = {
  // A RPC to sanitize a document.
sanitizeDocument: {
    path: '/sanitizer.SanitizerService/SanitizeDocument',
    requestStream: false,
    responseStream: false,
    requestType: sanitizer_pb.SanitizeRequest,
    responseType: sanitizer_pb.SanitizeResponse,
    requestSerialize: serialize_sanitizer_SanitizeRequest,
    requestDeserialize: deserialize_sanitizer_SanitizeRequest,
    responseSerialize: serialize_sanitizer_SanitizeResponse,
    responseDeserialize: deserialize_sanitizer_SanitizeResponse,
  },
};

exports.SanitizerServiceClient = grpc.makeGenericClientConstructor(SanitizerServiceService, 'SanitizerService');
