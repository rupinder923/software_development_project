// PDF.js Configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

// Check for Edge browser extensions
if (window.chrome?.runtime?.id || /Edge/.test(navigator.userAgent)) {
    console.warn("Running in Edge/Chrome with possible extension conflicts");
}

const pdfState = {
    pdfDoc: null,
    pageNum: 1,
    pageRendering: false,
    pageNumPending: null,
    scale: 1.0,
    scaleStep: 0.25,
    ttsEnabled: false
};

// DOM Elements
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

// Accessibility Elements
const liveRegion = document.getElementById('aria-live-region');

function updateLiveRegion(message) {
    liveRegion.textContent = message;
}


const ttsButton = document.createElement('button');
ttsButton.id = 'tts-toggle';
ttsButton.innerHTML = '🔊 <span class="sr-only">Toggle Text-to-Speech</span>';
Object.assign(ttsButton.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '1000'
});
document.body.appendChild(ttsButton);

// Initialize Viewer
init();

function init() {
    setupDragAndDrop();
    setupFileInput();
    setupEventListeners();
    container.innerHTML = '<p class="upload-prompt">Upload a PDF file to begin</p>';
    disableControls(true);
}

function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropZone.classList.add('highlight');
    }

    function unhighlight() {
        dropZone.classList.remove('highlight');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if (file && file.type === "application/pdf") {
            handleFile(file);
        } else {
            showError("Please drop a valid PDF file");
        }
    }
}

function setupFileInput() {
    pdfUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file || file.type !== "application/pdf") {
            alert("Please select a valid PDF file");
            return;
        }
        handleFile(file);
    });
}

function handleFile(file) {
    showStatus("Loading PDF...", 0);
    
    const fileReader = new FileReader();
    
    fileReader.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentLoaded = Math.round((e.loaded / e.total) * 100);
            showStatus(`Loading: ${percentLoaded}%`, percentLoaded);
        }
    };
    
    fileReader.onload = function() {
        try {
            const typedArray = new Uint8Array(this.result);
            loadPDF(typedArray);
        } catch (error) {
            showError(`File processing error: ${error.message}`);
        }
    };
    
    fileReader.onerror = function() {
        showError("Failed to read file");
    };
    
    fileReader.readAsArrayBuffer(file);
}

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
        announceToScreen(`Loaded document with ${pdf.numPages} pages`);
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
        announceToScreen(errorMsg, 'assertive');
    });
}

function renderPage(num) {
    const scrollTop = container.scrollTop;
    pdfState.pageRendering = true;
    container.innerHTML = '<div class="loading" aria-busy="true">Loading page...</div>';
    
    pdfState.pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: pdfState.scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
      
        
         // Reset scroll to top for new pages
    container.scrollTop = num === 1 ? 0 : scrollTop;
        // Accessibility enhancements
        canvas.setAttribute('tabindex', '0');
        canvas.setAttribute('aria-label', `Page ${num} content`);
        canvas.setAttribute('role', 'document');
        
        container.innerHTML = '';
        container.appendChild(canvas);
        
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        return page.render(renderContext).promise;
    }).then(function() {
        pdfState.pageRendering = false;
        // Restore scroll position
        container.scrollTop = scrollTop;
        
        if (pdfState.pageNumPending !== null) {
            renderPage(pdfState.pageNumPending);
            pdfState.pageNumPending = null;
        }
    }).catch(function(error) {
        console.error("Render error:", error);
    });
}
function readPageContent(page, pageNum) {
    page.getTextContent().then(function(textContent) {
        const text = textContent.items.map(item => item.str).join(' ');
        const cleanText = text.replace(/\s+/g, ' ').trim();
        
        if (cleanText) {
            speak(`Page ${pageNum}. ${cleanText.substring(0, 1000)}`);
        }
    });
}

function speak(text) {
    if (!pdfState.ttsEnabled || !window.speechSynthesis) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

function toggleTTS() {
    pdfState.ttsEnabled = !pdfState.ttsEnabled;
    announceToScreen(`Text-to-speech ${pdfState.ttsEnabled ? 'enabled' : 'disabled'}`);
    
    if (pdfState.ttsEnabled && pdfState.pdfDoc) {
        readCurrentPage();
    } else {
        window.speechSynthesis.cancel();
    }
}

function readCurrentPage() {
    if (pdfState.pdfDoc && pdfState.ttsEnabled) {
        pdfState.pdfDoc.getPage(pdfState.pageNum).then(page => {
            readPageContent(page, pdfState.pageNum);
        });
    }
}

function announceToScreen(message, priority = 'polite') {
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.textContent = message;
    setTimeout(() => liveRegion.textContent = '', 1000);
}

function setupEventListeners() {
    prevBtn.addEventListener('click', onPrevPage);
    nextBtn.addEventListener('click', onNextPage);
    zoomInBtn.addEventListener('click', onZoomIn);
    zoomOutBtn.addEventListener('click', onZoomOut);
    zoomResetBtn.addEventListener('click', onZoomReset);
    ttsButton.addEventListener('click', toggleTTS);
    document.addEventListener('keydown', onKeyDown);
}

function onPrevPage() {
    if (pdfState.pageNum <= 1) return;
    pdfState.pageNum--;
    queueRenderPage(pdfState.pageNum);
    updatePageCount(); // Add this line
}

function onNextPage() {
    if (!pdfState.pdfDoc || pdfState.pageNum >= pdfState.pdfDoc.numPages) return;
    pdfState.pageNum++;
    queueRenderPage(pdfState.pageNum);
    updatePageCount(); // Add this line
}
function queueRenderPage(num) {
    if (pdfState.pageRendering) {
        pdfState.pageNumPending = num;
    } else {
        renderPage(num);
        updatePageCount(); // Also call here for safety
    }
}

function onZoomIn() {
    pdfState.scale += pdfState.scaleStep;
    renderPage(pdfState.pageNum);
}

function onZoomOut() {
    if (pdfState.scale > pdfState.scaleStep) {
        pdfState.scale -= pdfState.scaleStep;
        renderPage(pdfState.pageNum);
    }
}

function onZoomReset() {
    pdfState.scale = 1.0;
    renderPage(pdfState.pageNum);
}

function onKeyDown(e) {
    if (!pdfState.pdfDoc) return;
    
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    
    switch(e.key) {
        case 'ArrowLeft': 
            if (e.altKey) goToFirstPage();
            else onPrevPage();
            break;
        case 'ArrowRight': 
            if (e.altKey) goToLastPage();
            else onNextPage();
            break;
        case 'Home': goToFirstPage();
            break;
        case 'End': goToLastPage();
            break;
        case 't': 
            if (e.ctrlKey) toggleTTS();
            break;
    }
}

function goToFirstPage() {
    if (pdfState.pdfDoc) {
        pdfState.pageNum = 1;
        renderPage(pdfState.pageNum);
    }
}

function goToLastPage() {
    if (pdfState.pdfDoc) {
        pdfState.pageNum = pdfState.pdfDoc.numPages;
        renderPage(pdfState.pageNum);
    }
}

function disableControls(disabled) {
    prevBtn.disabled = disabled;
    nextBtn.disabled = disabled;
    zoomInBtn.disabled = disabled;
    zoomOutBtn.disabled = disabled;
    zoomResetBtn.disabled = disabled;
}

function updatePageCount() {
    if (pdfState.pdfDoc) {
        const currentPage = pdfState.pageNum;
        const totalPages = pdfState.pdfDoc.numPages;
        pageNum.textContent = `Page: ${currentPage} of ${totalPages}`;
        // For screen readers
        pageNum.setAttribute('aria-label', `Page ${currentPage} of ${totalPages}`);
    }
}

function showStatus(message, percent) {
    loadStatus.style.display = 'block';
    statusMessage.textContent = message;
    progressBar.style.width = `${percent}%`;
    
    if (percent >= 100) {
        setTimeout(() => {
            loadStatus.style.display = 'none';
        }, 1000);
    }
}

function showError(message) {
    loadStatus.style.display = 'block';
    statusMessage.innerHTML = `<span class="error">${message}</span>`;
    progressBar.style.width = '0%';
}

// Filter Edge extension warnings
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
    if (!args.some(arg => typeof arg === 'string' && arg.includes('Host'))) {
        originalConsoleWarn.apply(console, args);
    }
};