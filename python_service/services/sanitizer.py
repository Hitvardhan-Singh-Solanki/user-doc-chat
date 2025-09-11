import io

# PDF Libraries
import fitz
from docling.document_converter import DocumentConverter
from docling_core.types.doc import TableItem, TextItem

# DOCX Libraries
from docx import Document

# Other Utilities
import mammoth
import markdownify

# Helper function to convert a docling table to Markdown
def table_to_markdown(table: TableItem) -> str:
    """Converts a Docling TableItem object to a Markdown string."""
    df = table.export_to_dataframe()
    markdown_str = ""
    # Header
    markdown_str += "| " + " | ".join(df.columns) + " |\n"
    # Separator
    markdown_str += "|---" * len(df.columns) + "|\n"
    # Rows
    for _, row in df.iterrows():
        markdown_str += "| " + " | ".join(row.astype(str)) + " |\n"
    return markdown_str

# Sanitize a PDF file
def sanitize_pdf(file_bytes: bytes) -> str:
    temp_file = io.BytesIO(file_bytes)
    converter = DocumentConverter()
    conv_res = converter.convert(temp_file)
    
    output_parts = []
    
    for item in conv_res.document.iterate_items():
        if isinstance(item, TextItem):
            output_parts.append(item.text)
        elif isinstance(item, TableItem):
            output_parts.append("\n\n---\n\n")
            output_parts.append(table_to_markdown(item))
            output_parts.append("\n\n---\n\n")

    return "\n\n".join(output_parts)

# Sanitize a DOCX file
def sanitize_docx(file_bytes: bytes) -> str:
    temp_file = io.BytesIO(file_bytes)
    doc = Document(temp_file)
    output_parts = []
    
    for para in doc.paragraphs:
        output_parts.append(para.text)
    
    return "\n\n".join(output_parts)

# Main sanitization function
def sanitize_file(file_data: bytes, file_type: str) -> str:
    """
    Sanitizes a PDF or DOCX file into a Markdown string based on its type.
    """
    if file_type == "application/pdf":
        return sanitize_pdf(file_data)
    elif file_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return sanitize_docx(file_data)
    else:
        raise ValueError("Unsupported file type")
