from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import io
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF
import pdfplumber  # For table extraction
import pytesseract  # For OCR
from sympy import sympify  # For formula detection
import cv2
import numpy as np
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
import torch

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = './uploads'
CORS(app)  # Enable CORS for all routes

processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def extract_pdf_text(filepath: str) -> str:
    """Extract raw text from PDF using PyMuPDF"""
    try:
        with fitz.open(filepath) as doc:
            return "\n".join([page.get_text("text") for page in doc])
    except Exception as e:
        raise Exception(f"Text extraction failed: {str(e)}")

def extract_pdf_tables(filepath: str) -> list:
    """Extract tables using pdfplumber"""
    try:
        tables = []
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                for table in page.extract_tables():
                    tables.append(table)
        return tables if tables else []
    except Exception as e:
        raise Exception(f"Table extraction failed: {str(e)}")

def generate_image_caption(image_bytes):
    """Generate AI-based description for an image."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    inputs = processor(image, return_tensors="pt")

    with torch.no_grad():
        caption_ids = model.generate(**inputs)
    
    caption = processor.decode(caption_ids[0], skip_special_tokens=True)
    return caption

def extract_pdf_images(filepath: str) -> list:
    """Extract images, generate AI-based descriptions, and return details."""
    images_data = []
    try:
        doc = fitz.open(filepath)
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            for img_index, img in enumerate(page.get_images(full=True)):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                
                # Get image dimensions
                pil_image = Image.open(io.BytesIO(image_bytes))
                width, height = pil_image.size
                
                # Generate AI-based description
                ai_description = generate_image_caption(image_bytes)
                
                images_data.append({
                    "page": page_num + 1,
                    "image_index": img_index,
                    "text": ai_description if ai_description else "Description not available",
                    "width": width,
                    "height": height
                })

        return images_data
    
    except Exception as e:
        raise Exception(f"Image extraction failed: {str(e)}")


def extract_math_formulas(text: str) -> list:
    """Identify mathematical formulas"""
    formulas = []
    math_patterns = [
        r'\$.*?\$',  # LaTeX inline
        r'\\\(.*?\\\)',  # LaTeX math mode
        r'\\begin\{equation\}.*?\\end\{equation\}',  # LaTeX equation
        r'\b[a-zA-Z]+\s*=\s*[^;\n]+',  # Variable assignments
        r'\b\d+\s*[\+\-\*/]\s*\d+',  # Basic arithmetic
        r'\b(sin|cos|tan|log|exp|sqrt)\([^)]+\)'  # Math functions
    ]
    
    for pattern in math_patterns:
        formulas.extend(re.findall(pattern, text))
    
    return formulas

@app.route('/parse-pdf', methods=['POST'])
def parse_pdf():
    if 'pdfFile' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['pdfFile']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
    
    filepath = None
    try:
        # Save temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Process PDF
        text_content = extract_pdf_text(filepath)
        tables = extract_pdf_tables(filepath)
        images = extract_pdf_images(filepath)
        formulas = extract_math_formulas(text_content)
        
        return jsonify({
            'text': text_content,
            'tables': tables,
            'images': images,
            'formulas': formulas,
            'status': 'success'
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500
        
    finally:
        if filepath and os.path.exists(filepath):
            os.remove(filepath)

if __name__ == '__main__':
    app.run(port=8000, debug=True)