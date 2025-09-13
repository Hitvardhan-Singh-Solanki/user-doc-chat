from concurrent import futures

import grpc
from services.proto import sanitizer_pb2
from services.proto import sanitizer_pb2_grpc

from services.sanitizer import sanitize_file

class SanitizerService(sanitizer_pb2_grpc.SanitizerServiceServicer):
    """
    Implements the gRPC service definition for file sanitization.
    """
    def SanitizeDocument(self, request, context):
        """
        Processes a gRPC request to sanitize a document.
        """
        try:
            sanitized = sanitize_file(request.document_data, request.document_type)
            return sanitizer_pb2.SanitizeResponse(sanitized_content=sanitized)
        except ValueError as e:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(e))
        except Exception as e:
            context.abort(grpc.StatusCode.INTERNAL, f"An unexpected error occurred: {e!s}")

def serve():
    """
    Starts the gRPC server.
    """
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    sanitizer_pb2_grpc.add_SanitizerServiceServicer_to_server(SanitizerService(), server)
    server.add_insecure_port('[::]:50051')
    server.start()
    print("gRPC server started on port 50051")
    server.wait_for_termination()

if __name__ == '__main__':
    serve()