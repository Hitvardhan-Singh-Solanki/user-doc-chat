import io
from docling.document_converter import DocumentConverter

MAX_BYTES = 25 * 1024 * 1024  

def sanitize_pdf(file_bytes: bytes) -> str:
    temp_file = io.BytesIO(file_bytes)
    converter = DocumentConverter()
    conv_res = converter.convert(temp_file)

    document = conv_res.document

    markdown_output = document.export_to_markdown()
    
    return markdown_output.strip()

def sanitize_file(file_data: bytes, file_type: str) -> str:
    """
    Sanitizes a file by converting its content to a clean markdown string.
    This function now directly accepts file data as bytes.
    """
    if len(file_data) > MAX_BYTES:
        raise ValueError(f"File too large; limit is {MAX_BYTES} bytes")

    if file_type == "application/pdf":
        return sanitize_pdf(file_data)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")