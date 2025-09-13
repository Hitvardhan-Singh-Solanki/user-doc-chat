import base64
import io
import binascii
MAX_BYTES = 25 * 1024 * 1024  # 25 MB cap
from docling.document_converter import DocumentConverter
import pandas as pd

def sanitize_pdf(file_bytes: bytes) -> str:
    temp_file = io.BytesIO(file_bytes)
    converter = DocumentConverter()
    conv_res = converter.convert(temp_file)

    document = conv_res.document

    markdown_output = document.export_to_markdown()
    
    return markdown_output.strip()

def sanitize_file(file_data: str, file_type: str) -> str:
    try:
        file_bytes = base64.b64decode(file_data)
    except Exception:
        raise ValueError("Invalid base64 file data")

    if file_type == "application/pdf":
        return sanitize_pdf(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")
