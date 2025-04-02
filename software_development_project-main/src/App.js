// PDF.js Configuration (keep this at top)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

// 1. First, keep your existing state and DOM references exactly as-is
const pdfState = {
    pdfDoc: null,
    pageNum: 1,
    pageRendering: false,
    scale: 1.0,
    scaleStep: 0.25
};

const container = document.getElementById('pdf-container');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next'); 
const pageNum = document.getElementById('page-num');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const pdfUpload = document.getElementById('pdf-upload');
const dropZone = document.getElementById('drop-zone');
const progressBar = document.querySelector('#progress-bar');
const statusMessage = document.getElementById('status-message');
const loadStatus = document.getElementById('load-status');

// 2. Add these NEW accessibility variables (add below your existing DOM refs)
const liveRegion = document.createElement('div');
liveRegion.id = 'a11y-live-region';
liveRegion.setAttribute('aria-live', 'polite');
liveRegion.className = 'sr-only';
document.body.appendChild(liveRegion);

const ttsButton = document.createElement('button');
ttsButton.id = 'tts-toggle';
ttsButton.innerHTML = '🔊 <span class="sr-only">Toggle Speech</span>';
document.body.appendChild(ttsButton);

// 3. Keep ALL your existing file handling code EXACTLY as-is
// (All your drag/drop, file upload, and progress functions stay unchanged)

// 4. Only modify the loadPDF function like this:
function loadPDF(data) {
    showStatus("Initializing PDF...", 100);
    
    pdfjsLib.getDocument({
        data: data,
        verbosity: 0
    }).promise.then(function(pdf) {
        pdfState.pdfDoc = pdf;
        disableControls(false);
        updatePageCount();
        renderPage(pdfState.pageNum);
        showStatus("PDF ready", 100);
        announceToScreen(`Loaded document with ${pdf.numPages} pages`); // NEW
    }).catch(function(error) {
        console.error("PDF load error:", error);
        let errorMsg = "Failed to load PDF";
        if (error.message.includes("password")) {
            errorMsg = "Password-protected PDFs are not supported";
        } else if (error.message.includes("invalid")) {
            errorMsg = "Invalid PDF file";
        }
        showError(errorMsg);
        container.innerHTML = `<p class="error">${errorMsg}</p>`;
        announceToScreen(errorMsg, 'assertive'); // NEW
    });
}
console.log("File loaded successfully!"); // Add this
pdfjsLib.getDocument(data).promise.then(function(pdf) {
    console.log("PDF document loaded:", pdf); // Add this
    pdfState.pdfDoc = pdf;
    disableControls(false);
    updatePageCount();
    renderPage(pdfState.pageNum);
}).catch(function(error) {
    console.error("PDF load error:", error); // This should show any errors
});
// 5. Add these NEW functions at the bottom (before event listeners)
function announceToScreen(message, priority = 'polite') {
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.textContent = message;
    setTimeout(() => liveRegion.textContent = '', 1000);
}

function toggleTTS() {
    if (!window.speechSynthesis) {
        announceToScreen("Text-to-speech not supported", 'assertive');
        return;
    }
    pdfState.ttsEnabled = !pdfState.ttsEnabled;
    announceToScreen(`Text-to-speech ${pdfState.ttsEnabled ? 'enabled' : 'disabled'}`);
    
    if (!pdfState.ttsEnabled) {
        window.speechSynthesis.cancel();
    }
}

function renderPage(num) {
    pdfState.pageRendering = true;
    container.innerHTML = '<div class="loading">Loading page...</div>';
    
    pdfState.pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: pdfState.scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Set display dimensions (not just resolution)
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        container.innerHTML = '';
        container.appendChild(canvas);

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        page.render(renderContext).promise.then(function() {
            pdfState.pageRendering = false;
            console.log("Page rendered successfully"); // Debug log
        });
    }).catch(function(error) {
        console.error("Render error:", error);
        container.innerHTML = '<p class="error">Error rendering page</p>';
    });
}
// 7. Add this NEW event listener (keep all your existing ones)
ttsButton.addEventListener('click', toggleTTS);

// 8. Keep ALL your existing event listeners exactly as they are
// (No changes to your current navigation, zoom, or keyboard handlers)