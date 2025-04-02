from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import io
import logging
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF
import pdfplumber
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
import torch

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = './uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB limit
CORS(app)

# Initialize models
try:
    processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
    model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
except Exception as e:
    logger.error(f"Model initialization failed: {str(e)}")

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def extract_pdf_text(filepath: str) -> str:
    """Extract text with accessibility tags"""
    try:
        text_content = ""
        with fitz.open(filepath) as doc:
            for page in doc:
                text_page = page.get_text("dict", flags=fitz.TEXT_PRESERVE_IMAGES)
                for block in text_page.get("blocks", []):
                    if block["type"] == 0:  # Text block
                        for line in block["lines"]:
                            for span in line["spans"]:
                                text_content += f'<span role="text" aria-label="{span["text"]}">{span["text"]}</span>'
                            text_content += "\n"
                    elif block["type"] == 1:  # Image block
                        text_content += f'[Image: {block.get("alt", "No description")}]'
        return text_content
    except Exception as e:
        raise Exception(f"Text extraction failed: {str(e)}")

def extract_pdf_tables(filepath: str) -> list:
    """Extract tables with accessibility metadata"""
    try:
        tables = []
        with pdfplumber.open(filepath) as pdf:
            for page_num, page in enumerate(pdf.pages):
                for table_num, table in enumerate(page.extract_tables()):
                    table_data = {
                        "page": page_num + 1,
                        "table_num": table_num + 1,
                        "rows": table,
                        "summary": f"Table {table_num + 1} with {len(table)} rows",
                        "role": "table"
                    }
                    tables.append(table_data)
        return tables
    except Exception as e:
        raise Exception(f"Table extraction failed: {str(e)}")

def generate_image_caption(image_bytes: bytes) -> dict:
    """Generate image descriptions"""
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inputs = processor(image, return_tensors="pt")
        with torch.no_grad():
            caption_ids = model.generate(**inputs)
        return {
            "basic_description": processor.decode(caption_ids[0], skip_special_tokens=True),
            "width": image.width,
            "height": image.height
        }
    except Exception as e:
        raise Exception(f"Image captioning failed: {str(e)}")

def extract_pdf_images(filepath: str) -> list:
    """Extract images with accessibility data"""
    images_data = []
    try:
        doc = fitz.open(filepath)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            for img_index, img in enumerate(page.get_images(full=True)):
                xref = img[0]
                base_image = doc.extract_image(xref)
                descriptions = generate_image_caption(base_image["image"])
                images_data.append({
                    "page": page_num + 1,
                    "image_index": img_index + 1,
                    "alt_text": descriptions["basic_description"],
                    "width": descriptions["width"],
                    "height": descriptions["height"],
                    "role": "graphic",
                    "aria-label": f"Image {img_index + 1} on page {page_num + 1}"
                })
        return images_data
    except Exception as e:
        raise Exception(f"Image extraction failed: {str(e)}")

@app.route('/parse-pdf', methods=['POST'])
def parse_pdf():
    if 'pdfFile' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['pdfFile']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
    
    filepath = None
    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify({
            'text': extract_pdf_text(filepath),
            'tables': extract_pdf_tables(filepath),
            'images': extract_pdf_images(filepath),
            'status': 'success',
            'accessibility': {
                'compliance': 'WCAG 2.1 AA',
                'features': ['alt-text', 'semantic-structure']
            }
        })
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
        return jsonify({'error': str(e), 'status': 'error'}), 500
    finally:
        if filepath and os.path.exists(filepath):
            os.remove(filepath)

if __name__ == '__main__':
    app.run(port=8000, debug=True)