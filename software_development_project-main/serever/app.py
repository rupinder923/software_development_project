# server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
# Correct import
from llama_parse import LlamaParse  # Note the underscore (_)
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = './uploads'
CORS(app)

pdf_parser = LlamaParse(
    api_key="llx-FlpfPkgUWfhlx8qCCznImsQxBCGzYbBIt2wNRHlujG8J112K",  # can also be set in your env as LLAMA_CLOUD_API_KEY
    result_type="markdown",  # "markdown" and "text" are available
    verbose=True,
)
# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/parse-pdf', methods=['POST'])
def parse_pdf():
    if 'pdfFile' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['pdfFile']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
    
    try:
        # Save the file temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # # Process with LlamaParse
        documents = pdf_parser.load_data(filepath)
        
        # Extract structured data
        result = {
            'text': [doc.text for doc in documents],
            'tables': [doc.text for doc in documents if doc.metadata.get('content_type') == 'table'],
            'images': [doc.metadata for doc in documents if doc.metadata.get('content_type') == 'image']
        }
        
        return jsonify(result)
    
    except Exception as e:
        print(str(e))
        return jsonify({'error': str(e)}), 500
    
    finally:
        # Clean up
        if os.path.exists(filepath):
            os.remove(filepath)

if __name__ == '__main__':
    app.run(port=8000, debug=True)