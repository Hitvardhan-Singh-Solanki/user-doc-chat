"""
Tests for the document sanitizer service.
"""
import pytest
import grpc
from unittest.mock import Mock, patch
from services.sanitizer import sanitize_file
from services.proto import sanitizer_pb2
from services.proto import sanitizer_pb2_grpc
from main_grpc_server import SanitizerService


class TestSanitizerService:
    """Test cases for the SanitizerService gRPC service."""

    def test_sanitize_document_success(self):
        """Test successful document sanitization."""
        service = SanitizerService()
        context = Mock()
        
        # Mock the sanitize_file function
        with patch('services.sanitizer.sanitize_file') as mock_sanitize:
            mock_sanitize.return_value = "sanitized content"
            
            request = sanitizer_pb2.SanitizeRequest(
                document_data=b"test document",
                document_type="pdf"
            )
            
            response = service.SanitizeDocument(request, context)
            
            assert response.sanitized_content == "sanitized content"
            mock_sanitize.assert_called_once_with(b"test document", "pdf")

    def test_sanitize_document_value_error(self):
        """Test handling of ValueError in document sanitization."""
        service = SanitizerService()
        context = Mock()
        
        with patch('services.sanitizer.sanitize_file') as mock_sanitize:
            mock_sanitize.side_effect = ValueError("Invalid document type")
            
            request = sanitizer_pb2.SanitizeRequest(
                document_data=b"test document",
                document_type="invalid"
            )
            
            with pytest.raises(grpc.RpcError):
                service.SanitizeDocument(request, context)
            
            context.abort.assert_called_once_with(
                grpc.StatusCode.INVALID_ARGUMENT,
                "Invalid document type"
            )

    def test_sanitize_document_general_error(self):
        """Test handling of general exceptions in document sanitization."""
        service = SanitizerService()
        context = Mock()
        
        with patch('services.sanitizer.sanitize_file') as mock_sanitize:
            mock_sanitize.side_effect = Exception("Unexpected error")
            
            request = sanitizer_pb2.SanitizeRequest(
                document_data=b"test document",
                document_type="pdf"
            )
            
            with pytest.raises(grpc.RpcError):
                service.SanitizeDocument(request, context)
            
            context.abort.assert_called_once_with(
                grpc.StatusCode.INTERNAL,
                "An unexpected error occurred: Unexpected error"
            )


class TestSanitizeFile:
    """Test cases for the sanitize_file function."""

    def test_sanitize_pdf_document(self):
        """Test sanitization of PDF documents."""
        # Mock document data
        document_data = b"PDF document content"
        document_type = "pdf"
        
        # This is a basic test - in a real scenario, you'd test actual sanitization
        result = sanitize_file(document_data, document_type)
        
        # For now, just ensure the function doesn't crash
        assert isinstance(result, str)

    def test_sanitize_docx_document(self):
        """Test sanitization of DOCX documents."""
        document_data = b"DOCX document content"
        document_type = "docx"
        
        result = sanitize_file(document_data, document_type)
        
        assert isinstance(result, str)

    def test_sanitize_txt_document(self):
        """Test sanitization of TXT documents."""
        document_data = b"TXT document content"
        document_type = "txt"
        
        result = sanitize_file(document_data, document_type)
        
        assert isinstance(result, str)

    def test_sanitize_unsupported_document_type(self):
        """Test handling of unsupported document types."""
        document_data = b"Document content"
        document_type = "unsupported"
        
        with pytest.raises(ValueError, match="Unsupported document type"):
            sanitize_file(document_data, document_type)


if __name__ == "__main__":
    pytest.main([__file__])
