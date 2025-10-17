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
                document_type="application/pdf"
            )
            
            response = service.SanitizeDocument(request, context)
            
            assert response.sanitized_content == "sanitized content"
            mock_sanitize.assert_called_once_with(b"test document", "application/pdf")

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
                document_type="application/pdf"
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
        document_type = "application/pdf"
        
        # Mock the DocumentConverter to avoid actual processing
        with patch('services.sanitizer.DocumentConverter') as mock_converter:
            mock_conv_res = Mock()
            mock_document = Mock()
            mock_document.export_to_markdown.return_value = "Mock PDF content"
            mock_conv_res.document = mock_document
            mock_converter.return_value.convert.return_value = mock_conv_res
            
            result = sanitize_file(document_data, document_type)
            
            assert isinstance(result, str)
            assert result == "Mock PDF content"

    def test_sanitize_unsupported_document_type(self):
        """Test handling of unsupported document types."""
        document_data = b"Document content"
        document_type = "unsupported"
        
        with pytest.raises(ValueError, match="Unsupported file type"):
            sanitize_file(document_data, document_type)

    def test_sanitize_file_too_large(self):
        """Test handling of files that are too large."""
        # Create a large document that exceeds MAX_BYTES
        large_document = b"x" * (26 * 1024 * 1024)  # 26MB, exceeds 25MB limit
        
        with pytest.raises(ValueError, match="File too large"):
            sanitize_file(large_document, "application/pdf")

    def test_sanitize_file_success(self):
        """Test successful file sanitization."""
        document_data = b"Small PDF content"
        document_type = "application/pdf"
        
        # Mock the DocumentConverter
        with patch('services.sanitizer.DocumentConverter') as mock_converter:
            mock_conv_res = Mock()
            mock_document = Mock()
            mock_document.export_to_markdown.return_value = "  Cleaned content  "
            mock_conv_res.document = mock_document
            mock_converter.return_value.convert.return_value = mock_conv_res
            
            result = sanitize_file(document_data, document_type)
            
            assert result == "Cleaned content"  # Should be stripped


if __name__ == "__main__":
    pytest.main([__file__])
