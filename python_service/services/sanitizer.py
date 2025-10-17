import io
from pathlib import Path

from docling.document_converter import DocumentConverter

MAX_BYTES = 25 * 1024 * 1024


def sanitize_pdf(file_bytes: bytes) -> str:
    # Create a temporary file path for DocumentConverter
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_file:
        temp_file.write(file_bytes)
        temp_path = Path(temp_file.name)

    try:
        converter = DocumentConverter()
        conv_res = converter.convert(temp_path)
        document = conv_res.document
        markdown_output = document.export_to_markdown()
        return markdown_output.strip()
    finally:
        # Clean up temporary file
        temp_path.unlink(missing_ok=True)


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
