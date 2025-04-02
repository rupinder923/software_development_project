// PDF.js Configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
pdfjsLib.verbosity = pdfjsLib.VerbosityLevel.ERRORS;

// State Management
const pdfState = {
    pdfDoc: null,
    pageNum: 1,
    pageRendering: false,
    pageNumPending: null,
    scale: 1.0,
    scaleStep: 0.25,
    language: 'en' // Default language
};

// TTS and Accessibility State
const tts = {
    enabled: false,
    utterance: null,
    speaking: false,
    voices: [],
    rate: 1,
    voice: null,
    supportedLanguages: {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German'
    }
};

// DOM Elements
const container = document.getElementById('pdf-container');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const pdfUpload = document.getElementById('pdf-upload');
const dropZone = document.getElementById('drop-zone');
const resultsDiv = document.getElementById('content-results');
const statusDiv = document.getElementById('status-message');
const pageNum = document.getElementById('page-num');
const ttsButton = document.getElementById('tts-toggle');
const voiceSelector = document.getElementById('voice-select');
const languageSelector = document.getElementById('language-select');
const explainContentBtn = document.getElementById('explain-content');


function displayResults(data) {
    resultsDiv.innerHTML = '';
    
    // Text Content
    if (data.text) {
        const textSection = document.createElement('section');
        textSection.setAttribute('aria-label', 'Extracted text');
        
        const heading = document.createElement('h2');
        heading.textContent = 'Document Text';
        textSection.appendChild(heading);
        
        const textContent = document.createElement('div');
        textContent.className = 'text-content';
        textContent.innerHTML = data.text.replace(/\n/g, '<br>');
        textSection.appendChild(textContent);
        
        resultsDiv.appendChild(textSection);
    }

    // Tables with Enhanced Accessibility
    if (data.tables?.length) {
        const tableSection = document.createElement('section');
        tableSection.setAttribute('aria-label', 'Extracted tables');
        
        const heading = document.createElement('h2');
        heading.textContent = 'Tables';
        tableSection.appendChild(heading);
        
        data.tables.forEach(table => {
            const tableContainer = document.createElement('div');
            tableContainer.className = 'table-container';
            tableContainer.setAttribute('role', 'region');
            tableContainer.setAttribute('aria-label', table.summary || 'Data table');
            
            const tableEl = document.createElement('table');
            tableEl.className = 'accessible-table';
            tableEl.setAttribute('aria-describedby', 'table-desc');
            
            // Add caption for screen readers
            const caption = document.createElement('caption');
            caption.id = 'table-desc';
            caption.textContent = table.summary || 'Data table with ' + table.rows.length + ' rows';
            tableEl.appendChild(caption);
            
            // Headers if available
            if (table.headers?.length) {
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                
                table.headers.forEach(header => {
                    const th = document.createElement('th');
                    th.setAttribute('scope', 'col');
                    th.textContent = header;
                    headerRow.appendChild(th);
                });
                
                thead.appendChild(headerRow);
                tableEl.appendChild(thead);
            }
            
            // Table body
            const tbody = document.createElement('tbody');
            table.rows.forEach(row => {
                const tr = document.createElement('tr');
                row.forEach(cell => {
                    const td = document.createElement('td');
                    td.textContent = cell;
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            
            tableEl.appendChild(tbody);
            tableContainer.appendChild(tableEl);
            tableSection.appendChild(tableContainer);
        });
        
        resultsDiv.appendChild(tableSection);
    }

    // Images with Enhanced Accessibility
    if (data.images?.length) {
        const imageSection = document.createElement('section');
        imageSection.setAttribute('aria-label', 'Extracted images');
        
        const heading = document.createElement('h2');
        heading.textContent = 'Images';
        imageSection.appendChild(heading);
        
        data.images.forEach(img => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';
            imgContainer.setAttribute('role', 'img');
            imgContainer.setAttribute('aria-label', img['aria-label'] || 'Document image');
            
            const pageInfo = document.createElement('p');
            pageInfo.innerHTML = `<strong>Page ${img.page}:</strong> ${img.alt_text}`;
            imgContainer.appendChild(pageInfo);
            
            const dimensions = document.createElement('p');
            dimensions.textContent = `Dimensions: ${img.width} × ${img.height}px`;
            imgContainer.appendChild(dimensions);
            
            imageSection.appendChild(imgContainer);
        });
        
        resultsDiv.appendChild(imageSection);
    }

    // Accessibility Features Notice
    if (data.accessibility) {
        const notice = document.createElement('div');
        notice.className = 'accessibility-notice';
        notice.setAttribute('role', 'status');
        notice.textContent = `This document includes accessibility features: ${data.accessibility.features.join(', ')}`;
        resultsDiv.appendChild(notice);
    }
}

// Helper Functions
function showStatus(message) {
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
}

function showError(message) {
    statusDiv.innerHTML = `<span class="error">${message}</span>`;
    statusDiv.style.display = 'block';
}

function disableControls(disabled) {
    [prevBtn, nextBtn, zoomInBtn, zoomOutBtn, zoomResetBtn].forEach(btn => {
        btn.disabled = disabled;
    });
}

function updatePageCount() {
    if (pdfState.pdfDoc) {
        pageNum.textContent = `Page ${pdfState.pageNum} of ${pdfState.pdfDoc.numPages}`;
    }
}

// Drag and Drop Functions
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
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
        handleFile(file);
    } else {
        showError("Please upload a valid PDF file");
    }
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
}

// File Handling
function handleFile(file) {
    showStatus("Processing PDF...");
    const fileReader = new FileReader();
    
    fileReader.onload = function() {
        try {
            const typedArray = new Uint8Array(this.result);
            loadPDF(typedArray);
            sendFileToServer(file);
        } catch (error) {
            showError(error.message);
        }
    };
    
    fileReader.onerror = () => showError("File reading failed");
    fileReader.readAsArrayBuffer(file);
}

function sendFileToServer(file) {
    const formData = new FormData();
    formData.append('pdfFile', file);
    
    return fetch('http://localhost:8000/parse-pdf', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            displayResults(data);
        } else {
            throw new Error(data.error || 'Processing failed');
        }
    })
    .catch(error => {
        showError(error.message);
    });
}

// PDF Rendering Functions
function loadPDF(data) {
    pdfjsLib.getDocument({
        data: data,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/cmaps/',
        cMapPacked: true,
        fontExtraProperties: true,
        disableFontFace: false,
        verbosity: pdfjsLib.VerbosityLevel.ERRORS
    }).promise.then(pdf => {
        pdfState.pdfDoc = pdf;
        disableControls(false);
        renderPage(1);
    }).catch(error => {
        showError("Failed to load PDF: " + error.message);
    });
}

function renderPage(num) {
    pdfState.pageRendering = true;
    pdfState.pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale: pdfState.scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        container.innerHTML = '';
        container.appendChild(canvas);
        
        page.render({
            canvasContext: context,
            viewport: viewport
        }).promise.then(() => {
            pdfState.pageRendering = false;
            updatePageCount();
        });
    });
}

// Navigation Functions
function onPrevPage() {
    if (pdfState.pageNum > 1) {
        pdfState.pageNum--;
        renderPage(pdfState.pageNum);
    }
}

function onNextPage() {
    if (pdfState.pdfDoc && pdfState.pageNum < pdfState.pdfDoc.numPages) {
        pdfState.pageNum++;
        renderPage(pdfState.pageNum);
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

// TTS Functions
async function loadVoices() {
    return new Promise(resolve => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
            tts.voices = voices;
            tts.voice = voices.find(v => v.default) || voices[0];
            updateVoiceSelector();
            resolve();
        } else {
            speechSynthesis.onvoiceschanged = () => {
                tts.voices = speechSynthesis.getVoices();
                tts.voice = tts.voices.find(v => v.default) || tts.voices[0];
                updateVoiceSelector();
                resolve();
            };
        }
    });
}

function updateVoiceSelector() {
    if (!voiceSelector) return;
    
    voiceSelector.innerHTML = '';
    const currentLanguage = pdfState.language;
    
    const langVoices = tts.voices.filter(v => v.lang.startsWith(currentLanguage));
    const voicesToShow = langVoices.length > 0 ? langVoices : tts.voices;
    
    voicesToShow.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelector.appendChild(option);
    });

    if (tts.voice) {
        voiceSelector.value = tts.voice.voiceURI;
    }
}

function toggleTTS() {
    tts.enabled = !tts.enabled;
    ttsButton.setAttribute('aria-pressed', tts.enabled);
    
    if (tts.enabled) {
        if (!window.speechSynthesis) {
            showError("Text-to-speech not supported in your browser");
            tts.enabled = false;
            ttsButton.setAttribute('aria-pressed', 'false');
            return;
        }
        readCurrentPage();
    } else {
        stopTTS();
    }
}

function readCurrentPage() {
    if (!tts.enabled || !pdfState.pdfDoc) return;
    
    pdfState.pdfDoc.getPage(pdfState.pageNum).then(page => {
        page.getTextContent().then(textContent => {
            const text = textContent.items.map(item => item.str).join(' ');
            
            if (!text.trim()) {
                showError("No readable text on this page");
                return;
            }
            
            speakText(text);
        }).catch(err => {
            showError("Failed to extract text: " + err.message);
        });
    }).catch(err => {
        showError("Failed to load page: " + err.message);
    });
}

function speakText(text) {
    if (!tts.enabled || !text.trim()) return;

    stopTTS();
    tts.utterance = new SpeechSynthesisUtterance(text);
    tts.utterance.voice = tts.voice;
    tts.utterance.rate = tts.rate;
    tts.utterance.pitch = 1;
    tts.utterance.lang = pdfState.language;
    
    tts.utterance.onstart = () => {
        tts.speaking = true;
        ttsButton.classList.add('active');
    };
    
    tts.utterance.onend = () => {
        tts.speaking = false;
        ttsButton.classList.remove('active');
        if (tts.enabled && pdfState.pageNum < pdfState.pdfDoc.numPages) {
            pdfState.pageNum++;
            renderPage(pdfState.pageNum);
            readCurrentPage();
        }
    };
    
    tts.utterance.onerror = (e) => {
        tts.speaking = false;
        ttsButton.classList.remove('active');
        if (e.error !== 'interrupted') {
            showError("Speech error: " + e.error);
        }
    };
    
    speechSynthesis.speak(tts.utterance);
}

function stopTTS() {
    if (window.speechSynthesis) {
        speechSynthesis.cancel();
    }
    tts.speaking = false;
}

// Language Handling
function setupLanguageSelector() {
    if (!languageSelector) return;
    
    for (const [code, name] of Object.entries(tts.supportedLanguages)) {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        languageSelector.appendChild(option);
    }
    
    languageSelector.addEventListener('change', (e) => {
        pdfState.language = e.target.value;
        updateVoiceSelector();
    });
}

// Content Explanation
function explainTable(table) {
    let explanation = '';
    explanation += `This table has ${table.headers?.length || 0} columns and ${table.rows.length} rows. `;
    
    if (table.headers?.length) {
        explanation += `The columns are: ${table.headers.join(', ')}. `;
    }
    
    explanation += "Here's the data: ";
    table.rows.forEach((row, i) => {
        explanation += `Row ${i + 1}: `;
        row.forEach((cell, j) => {
            const header = table.headers?.[j] || `Column ${j + 1}`;
            explanation += `${header} is ${cell}. `;
        });
    });
    
    return explanation;
}

function explainImage(image) {
    return `On page ${image.page}, there is an image described as: ${image.alt_text}. ` +
           `The image is ${image.width} pixels wide and ${image.height} pixels tall.`;
}

function explainContent() {
    if (!pdfState.pdfDoc) {
        showError("No document loaded");
        return;
    }

    const currentLanguage = pdfState.language;
    let explanation = `Document explanations in ${tts.supportedLanguages[currentLanguage]}: `;
    
    const sections = resultsDiv.querySelectorAll('section');
    sections.forEach(section => {
        const sectionType = section.getAttribute('aria-label');
        
        switch(sectionType) {
            case 'Extracted text':
                explanation += "The document contains the following text: " + 
                              section.querySelector('.text-content').textContent + ". ";
                break;
                
            case 'Extracted tables':
                section.querySelectorAll('.table-container').forEach(tableContainer => {
                    const table = {
                        headers: Array.from(tableContainer.querySelectorAll('th')).map(th => th.textContent),
                        rows: Array.from(tableContainer.querySelectorAll('tr')).map(tr => 
                            Array.from(tr.querySelectorAll('td')).map(td => td.textContent)
                        )
                    };
                    explanation += explainTable(table);
                });
                break;
                
            case 'Extracted images':
                section.querySelectorAll('.image-container').forEach(imgContainer => {
                    const img = {
                        page: imgContainer.querySelector('strong').textContent.replace('Page ', '').replace(':', ''),
                        alt_text: imgContainer.querySelector('p').textContent.split(':')[1].trim(),
                        width: imgContainer.querySelectorAll('p')[1].textContent.split('×')[0].trim().replace('Dimensions: ', ''),
                        height: imgContainer.querySelectorAll('p')[1].textContent.split('×')[1].trim().replace('px', '')
                    };
                    explanation += explainImage(img);
                });
                break;
        }
    });
    
    speakText(explanation);
    const explanationDiv = document.createElement('div');
    explanationDiv.className = 'explanation-content';
    explanationDiv.textContent = explanation;
    resultsDiv.appendChild(explanationDiv);
}

// Setup Functions
function setupFileInput() {
    pdfUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && file.type === "application/pdf") {
            handleFile(file);
        } else {
            showError("Invalid file type");
        }
    });
}

function setupEventListeners() {
    prevBtn.addEventListener('click', () => {
        stopTTS();
        onPrevPage();
    });
    
    nextBtn.addEventListener('click', () => {
        stopTTS();
        onNextPage();
    });
    
    zoomInBtn.addEventListener('click', onZoomIn);
    zoomOutBtn.addEventListener('click', onZoomOut);
    zoomResetBtn.addEventListener('click', onZoomReset);
    ttsButton.addEventListener('click', toggleTTS);
    
    if (voiceSelector) {
        voiceSelector.addEventListener('change', (e) => {
            tts.voice = tts.voices.find(v => v.voiceURI === e.target.value);
        });
    }
    
    if (explainContentBtn) {
        explainContentBtn.addEventListener('click', explainContent);
    }
    
    document.addEventListener('keydown', (e) => {
        if (!pdfState.pdfDoc) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        
        switch(e.key) {
            case 'ArrowLeft': onPrevPage(); break;
            case 'ArrowRight': onNextPage(); break;
            case '+': onZoomIn(); break;
            case '-': onZoomOut(); break;
            case '0': onZoomReset(); break;
            case 't': if (e.ctrlKey) toggleTTS(); break;
            case 'e': if (e.ctrlKey) explainContent(); break;
        }
    });
}

// Initialize the application
async function init() {
    await loadVoices();
    setupLanguageSelector();
    setupDragAndDrop();
    setupFileInput();
    setupEventListeners();
    container.innerHTML = '<p class="upload-prompt">Upload a PDF to begin</p>';
    disableControls(true);
}

document.addEventListener('DOMContentLoaded', init);