import io
import tempfile
import os
from docling.document_converter import DocumentConverter

MAX_BYTES = 25 * 1024 * 1024  

def sanitize_pdf(file_bytes: bytes) -> str:
    # Create a temporary file to write the PDF bytes
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
        temp_file.write(file_bytes)
        temp_file_path = temp_file.name
    
    try:
        converter = DocumentConverter()
        conv_res = converter.convert(temp_file_path)

        document = conv_res.document
        markdown_output = document.export_to_markdown()
        
        return markdown_output.strip()
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)

def sanitize_text(file_bytes: bytes) -> str:
    """
    Sanitizes a text file by decoding and cleaning the content.
    """
    try:
        # Try to decode as UTF-8
        text_content = file_bytes.decode('utf-8')
    except UnicodeDecodeError:
        # If UTF-8 fails, try with error handling
        text_content = file_bytes.decode('utf-8', errors='replace')
    
    # Basic sanitization - remove any potential harmful content
    # For now, just return the content as markdown
    return f"```\n{text_content}\n```"

def sanitize_file(file_data: bytes, file_type: str) -> str:
    """
    Sanitizes a file by converting its content to a clean markdown string.
    This function now directly accepts file data as bytes.
    """
    if len(file_data) > MAX_BYTES:
        raise ValueError(f"File too large; limit is {MAX_BYTES} bytes")

    if file_type == "application/pdf":
        return sanitize_pdf(file_data)
    elif file_type == "text/plain":
        return sanitize_text(file_data)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")