from concurrent import futures

import grpc
from services.proto import sanitizer_pb2
from services.proto import sanitizer_pb2_grpc

from services.sanitizer import sanitize_file

class SanitizerService(sanitizer_pb2_grpc.SanitizerService):
    """
    Implements the gRPC service definition for file sanitization.
    """
    def SanitizeDocument(self, request, context):
        """
        Processes a gRPC request to sanitize a PDF document.
        """
        try:
            markdown_content = sanitize_file(request.file_data, request.file_type)
            return sanitizer_pb2.SanitizeResponse(markdown=markdown_content)
        except ValueError as e:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details(str(e))
            return sanitizer_pb2.SanitizeResponse(markdown="")
        except Exception as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"An unexpected error occurred: {str(e)}")
            return sanitizer_pb2.SanitizeResponse(markdown="")

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
