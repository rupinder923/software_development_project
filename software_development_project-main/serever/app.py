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
from transformers import pipeline  # Add to imports

# Initialize multilingual processors (add near model initialization)
try:
    translator = pipeline("translation", model="Helsinki-NLP/opus-mt-mul-en")
    text_processor = pipeline("text2text-generation", model="facebook/m2m100_418M")
except Exception as e:
    logger.error(f"Multilingual processor initialization failed: {str(e)}")

def extract_pdf_text(filepath: str, target_lang: str = "en") -> str:
    """Extract and translate text content"""
    try:
        raw_text = ""
        with fitz.open(filepath) as doc:
            for page in doc:
                raw_text += page.get_text("text")
        
        if target_lang != "en":
            # Split into chunks to avoid token limits
            chunks = [raw_text[i:i+500] for i in range(0, len(raw_text), 500)]
            translated_chunks = []
            for chunk in chunks:
                translated = text_processor(chunk, forced_bos_token_id=text_processor.lang_code_to_id[target_lang])
                translated_chunks.append(translated[0]['generated_text'])
            return " ".join(translated_chunks)
        
        return raw_text
    except Exception as e:
        raise Exception(f"Text extraction/translation failed: {str(e)}")

def extract_pdf_tables(filepath: str, target_lang: str = "en") -> list:
    """Extract and translate table content"""
    try:
        tables = []
        with pdfplumber.open(filepath) as pdf:
            for page_num, page in enumerate(pdf.pages):
                for table in page.extract_tables():
                    translated_table = {
                        "page": page_num + 1,
                        "rows": [],
                        "summary": ""
                    }
                    
                    # Translate headers if they exist
                    if len(table) > 0 and any(cell.strip() for cell in table[0]):
                        headers = table[0]
                        if target_lang != "en":
                            headers = [translator(header, target_lang=target_lang)[0]['translation_text'] 
                                      for header in headers]
                        translated_table["headers"] = headers
                    
                    # Translate table content
                    for row in table[1 if 'headers' in translated_table else 0:]:
                        if target_lang != "en":
                            row = [translator(cell, target_lang=target_lang)[0]['translation_text'] 
                                  if cell.strip() else cell 
                                  for cell in row]
                        translated_table["rows"].append(row)
                    
                    # Generate summary
                    summary = f"Table with {len(translated_table['rows'])} rows"
                    if target_lang != "en":
                        summary = translator(summary, target_lang=target_lang)[0]['translation_text']
                    translated_table["summary"] = summary
                    
                    tables.append(translated_table)
        return tables
    except Exception as e:
        raise Exception(f"Table extraction failed: {str(e)}")

def generate_image_caption(image_bytes: bytes, target_lang: str = "en") -> dict:
    """Generate multilingual image descriptions"""
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        caption = image_captioner(image)[0]['generated_text']
        
        if target_lang != "en":
            caption = translator(caption, target_lang=target_lang)[0]['translation_text']
            
        return {
            "basic_description": caption,
            "width": image.width,
            "height": image.height,
            "aria-label": f"Image described as: {caption}" if target_lang == "en" else 
                         translator(f"Image described as: {caption}", target_lang=target_lang)[0]['translation_text']
        }
    except Exception as e:
        logger.error(f"Multilingual captioning failed: {str(e)}")
        return {
            "basic_description": "Image" if target_lang == "en" else 
                               translator("Image", target_lang=target_lang)[0]['translation_text'],
            "width": 0,
            "height": 0
        }

@app.route('/parse-pdf', methods=['POST'])
def parse_pdf():
    if 'pdfFile' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['pdfFile']
    target_lang = request.form.get('language', 'en')  # Get language from request
    
    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify({
            'text': extract_pdf_text(filepath, target_lang),
            'tables': extract_pdf_tables(filepath, target_lang),
            'images': extract_pdf_images(filepath, target_lang),
            'status': 'success',
            'language': target_lang,
            'accessibility': {
                'compliance': 'WCAG 2.1 AA',
                'features': ['alt-text', 'semantic-structure', 'multilingual']
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