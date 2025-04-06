# Import required libraries
from flask import Flask, request, jsonify  # Flask web framework
from flask_cors import CORS  # Cross-Origin Resource Sharing
import os  # Operating system interfaces
import re  # Regular expressions
import io  # Input/output operations
import logging  # Logging facility
import traceback  # Stack trace printing
import psutil  # System monitoring
from werkzeug.utils import secure_filename  # Secure filename handling
import fitz  # PyMuPDF for PDF processing
import pdfplumber  # PDF text extraction
from PIL import Image  # Image processing
from transformers import BlipProcessor, BlipForConditionalGeneration  # Image captioning
import torch  # PyTorch for deep learning
from transformers import pipeline  # NLP pipelines
import latex2mathml.converter  # LaTeX to MathML conversion

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask application
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = './uploads'  # Directory for uploaded files
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB file size limit
app.config['ALLOWED_EXTENSIONS'] = {'pdf'}  # Only allow PDF files
CORS(app)  # Enable CORS for all routes

# Initialize AI models
try:
    # Image captioning model
    processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
    model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base") 
    
    # Translation model
    translator = pipeline("translation", model="Helsinki-NLP/opus-mt-mul-en")
    
    # Text processing model
    text_processor = pipeline("text2text-generation", model="facebook/m2m100_418M")
    
    logger.info("AI models loaded successfully")
except Exception as e:
    logger.error(f"Model initialization failed: {str(e)}")
    raise RuntimeError("Failed to initialize AI models") from e

# Create upload directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    """Check if the file has an allowed extension"""
    return ('.' in filename and 
            filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS'])

def extract_pdf_text(filepath: str, target_lang: str = "en") -> str:
    """
    Extract text content from PDF with accessibility tags
    Args:
        filepath: Path to the PDF file
        target_lang: Target language for translation (default: English)
    Returns:
        Extracted text with accessibility markup
    """
    try:
        text_content = ""
        with fitz.open(filepath) as doc:
            for page in doc:
                # Get text with structure preservation
                text_page = page.get_text("dict", flags=fitz.TEXT_PRESERVE_IMAGES)
                for block in text_page.get("blocks", []):
                    if block["type"] == 0:  # Text block
                        for line in block["lines"]:
                            for span in line["spans"]:
                                # Add accessibility attributes to text spans
                                text_content += f'<span role="text" aria-label="{span["text"]}">{span["text"]}</span>'
                            text_content += "\n"
                    elif block["type"] == 1:  # Image block
                        text_content += f'[Image: {block.get("alt", "No description")}]'
        
        # Translate text if target language isn't English
        if target_lang != "en":
            # Split text into chunks for translation (500 chars each)
            chunks = [text_content[i:i+500] for i in range(0, len(text_content), 500)]
            translated_chunks = []
            for chunk in chunks:
                translated = text_processor(chunk, forced_bos_token_id=text_processor.lang_code_to_id[target_lang])
                translated_chunks.append(translated[0]['generated_text'])
            return " ".join(translated_chunks)
        
        return text_content
    except Exception as e:
        raise Exception(f"Text extraction failed: {str(e)}")

def extract_pdf_tables(filepath: str, target_lang: str = "en") -> list:
    """
    Extract tables from PDF with accessibility metadata
    Args:
        filepath: Path to the PDF file
        target_lang: Target language for translation
    Returns:
        List of tables with accessibility information
    """
    try:
        tables = []
        with pdfplumber.open(filepath) as pdf:
            for page_num, page in enumerate(pdf.pages):
                # Extract all tables from the page
                for table_num, table in enumerate(page.extract_tables()):
                    table_data = {
                        "page": page_num + 1,
                        "table_num": table_num + 1,
                        "rows": table,
                        "summary": f"Table {table_num + 1} with {len(table)} rows",
                        "role": "table",
                        "accessibility": {
                            "headers": table[0] if len(table) > 0 else [],
                            "row_count": len(table),
                            "col_count": len(table[0]) if len(table) > 0 else 0
                        }
                    }
                    
                    # Translate table metadata if needed
                    if target_lang != "en":
                        table_data["summary"] = translator(table_data["summary"], target_lang=target_lang)[0]['translation_text']
                        if table_data["accessibility"]["headers"]:
                            table_data["accessibility"]["headers"] = [
                                translator(h, target_lang=target_lang)[0]['translation_text'] 
                                for h in table_data["accessibility"]["headers"]
                            ]
                    
                    tables.append(table_data)
        return tables
    except Exception as e:
        raise Exception(f"Table extraction failed: {str(e)}")

def extract_formulas(filepath: str, target_lang: str = "en") -> list:
    """
    Extract mathematical formulas from PDF
    Args:
        filepath: Path to the PDF file
        target_lang: Target language for description
    Returns:
        List of formulas with MathML and descriptions
    """
    try:
        formulas = []
        with pdfplumber.open(filepath) as pdf:
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text()
                # Find LaTeX formulas between $ symbols
                for match in re.finditer(r'\$(.*?)\$', text):
                    try:
                        latex = match.group(1)
                        # Convert LaTeX to MathML
                        mathml = latex2mathml.converter.convert(latex)
                        description = f"Mathematical formula: {latex}"
                        
                        # Translate description if needed
                        if target_lang != "en":
                            description = translator(description, target_lang=target_lang)[0]['translation_text']
                        
                        formulas.append({
                            "page": page_num + 1,
                            "latex": latex,
                            "mathml": mathml,
                            "description": description,
                            "role": "math",
                            "aria-label": description
                        })
                    except Exception as e:
                        logger.warning(f"Formula conversion failed: {str(e)}")
                        continue
        return formulas
    except Exception as e:
        raise Exception(f"Formula extraction failed: {str(e)}")

def generate_image_caption(image_bytes: bytes, target_lang: str = "en") -> dict:
    """
    Generate accessible descriptions for images
    Args:
        image_bytes: Binary image data
        target_lang: Target language for caption
    Returns:
        Dictionary with image description and metadata
    """
    try:
        # Open and convert image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Generate caption using BLIP model
        inputs = processor(image, return_tensors="pt")
        with torch.no_grad():
            caption_ids = model.generate(**inputs)
        caption = processor.decode(caption_ids[0], skip_special_tokens=True)
        
        # Translate caption if needed
        if target_lang != "en":
            caption = translator(caption, target_lang=target_lang)[0]['translation_text']
        
        return {
            "basic_description": caption,
            "width": image.width,
            "height": image.height,
            "role": "graphic",
            "aria-label": f"Image described as: {caption}"
        }
    except Exception as e:
        logger.error(f"Image captioning failed: {str(e)}")
        # Return default values if captioning fails
        return {
            "basic_description": "Image",
            "width": 0,
            "height": 0,
            "role": "graphic",
            "aria-label": "Image without description"
        }

def extract_pdf_images(filepath: str, target_lang: str = "en") -> list:
    """
    Extract images from PDF with accessibility data
    Args:
        filepath: Path to the PDF file
        target_lang: Target language for descriptions
    Returns:
        List of images with metadata and descriptions
    """
    images_data = []
    try:
        doc = fitz.open(filepath)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Get all images from the page
            for img_index, img in enumerate(page.get_images(full=True)):
                xref = img[0]
                base_image = doc.extract_image(xref)
                # Generate description for the image
                descriptions = generate_image_caption(base_image["image"], target_lang)
                
                images_data.append({
                    "page": page_num + 1,
                    "image_index": img_index + 1,
                    "alt_text": descriptions["basic_description"],
                    "width": descriptions["width"],
                    "height": descriptions["height"],
                    "role": "graphic",
                    "aria-label": descriptions["aria-label"],
                    "accessibility": {
                        "complies": bool(descriptions["basic_description"].strip()),
                        "warning": "" if descriptions["basic_description"].strip() 
                                  else "Missing detailed description"
                    }
                })
        return images_data
    except Exception as e:
        raise Exception(f"Image extraction failed: {str(e)}")

def check_wcag_compliance(content):
    """
    Validate content against WCAG 2.1 accessibility standards
    Args:
        content: Extracted PDF content
    Returns:
        Dictionary with compliance information
    """
    compliance = {
        "text": True,
        "tables": True,
        "images": True,
        "formulas": True,
        "score": 100,  # Start with perfect score
        "warnings": []
    }
    
    # Check images for alt text
    if content.get("images"):
        for img in content["images"]:
            if not img.get("alt_text", "").strip():
                compliance["images"] = False
                compliance["score"] -= 10  # Deduct points for missing alt text
                compliance["warnings"].append(
                    f"Image on page {img['page']} missing alt text")
    
    # Check tables for headers
    if content.get("tables"):
        for table in content["tables"]:
            if not table.get("accessibility", {}).get("headers"):
                compliance["tables"] = False
                compliance["score"] -= 5  # Deduct points for missing headers
                compliance["warnings"].append(
                    f"Table on page {table['page']} missing headers")
    
    # Check formulas for descriptions
    if content.get("formulas"):
        for formula in content["formulas"]:
            if not formula.get("description", "").strip():
                compliance["formulas"] = False
                compliance["score"] -= 5  # Deduct points for missing descriptions
                compliance["warnings"].append(
                    f"Formula on page {formula['page']} missing description")
    
    return compliance

@app.route('/parse-pdf', methods=['POST'])
def parse_pdf():
    """
    Main endpoint for PDF processing
    Accepts PDF file and returns structured content with accessibility info
    """
    # Check if file was uploaded
    if 'pdfFile' not in request.files:
        return jsonify({
            "status": "error",
            "error": "No file uploaded",
            "accessibility": {
                "error": "missing_file",
                "compliance": "WCAG 2.1 AA (failed)"
            }
        }), 400
    
    file = request.files['pdfFile']
    target_lang = request.form.get('language', 'en')  # Default to English
    
    # Validate file type
    if not allowed_file(file.filename):
        return jsonify({
            "status": "error",
            "error": "Invalid file type",
            "accessibility": {
                "error": "invalid_format",
                "compliance": "WCAG 2.1 AA (failed)"
            }
        }), 400

    filepath = None
    try:
        # Secure the filename and save temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Extract content with simplified structure
        content = {
            "text": extract_pdf_text(filepath, target_lang),
            "tables": [{
                "headers": table["accessibility"]["headers"],
                "rows": table["rows"],
                "summary": table["summary"]
            } for table in extract_pdf_tables(filepath, target_lang)],
            "images": [{
                "page": img["page"],
                "alt_text": img["alt_text"],
                "width": img["width"],
                "height": img["height"],
                "aria-label": img.get("aria-label", img["alt_text"])
            } for img in extract_pdf_images(filepath, target_lang)]
        }
        
        # Return successful response with extracted content
        return jsonify({
            "status": "success",
            **content,  # Unpack content directly into response
            "accessibility": {
                "features": [
                    "alt-text" if all(img.get("alt_text") for img in content["images"]) else "missing-alt-text",
                    "semantic-tables" if all(tbl.get("headers") for tbl in content["tables"]) else "simple-tables"
                ]
            }
        })
        
    except Exception as e:
        logger.error(f"Processing failed: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "accessibility": {
                "error_type": "processing_error",
                "compliance": "WCAG 2.1 AA (failed)"
            }
        }), 500
        
    finally:
        # Clean up - remove temporary file
        if filepath and os.path.exists(filepath):
            os.remove(filepath)

@app.route('/health')
def health_check():
    """
    System health check endpoint
    Returns service status and resource usage
    """
    return jsonify({
        "status": "operational",
        "memory_usage_mb": psutil.Process().memory_info().rss / 1024 / 1024,
        "models_loaded": bool(model),
        "system_load": os.getloadavg()[0]
    })

if __name__ == '__main__':
    # Start the Flask development server
    app.run(host='0.0.0.0', port=8000, debug=True)