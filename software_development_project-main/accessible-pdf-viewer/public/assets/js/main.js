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
    maxScale: 3.0,
    minScale: 0.5,
    language: 'en', // Default language
    preferences: {
        explanationDepth: 'detailed', // 'simple' or 'detailed'
        autoRead: false,
        highlightContent: true
    }
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
        'en': { 
            name: 'English', 
            translations: {
                'Document Text': 'Document Text',
                'Tables': 'Tables',
                'Images': 'Images',
                'Page': 'Page',
                'Dimensions': 'Dimensions',
                'Upload a PDF to begin': 'Upload a PDF to begin',
                'Processing PDF...': 'Processing PDF...'
            }
        },
        'es': { 
            name: 'Spanish',
            translations: {
                'Document Text': 'Texto del Documento',
                'Tables': 'Tablas',
                'Images': 'Imágenes',
                'Page': 'Página',
                'Dimensions': 'Dimensiones',
                'Upload a PDF to begin': 'Suba un PDF para comenzar',
                'Processing PDF...': 'Procesando PDF...'
            }
        },
        'fr': {
            name: 'French',
            translations: {
                'Document Text': 'Texte du Document',
                'Tables': 'Tableaux',
                'Images': 'Images',
                'Page': 'Page',
                'Dimensions': 'Dimensions',
                'Upload a PDF to begin': 'Téléchargez un PDF pour commencer',
                'Processing PDF...': 'Traitement du PDF...'
            }
        }
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
const explanationDepthSelect = document.getElementById('explanation-depth');
const autoReadCheckbox = document.getElementById('auto-read');
const highlightCheckbox = document.getElementById('highlight-content');

// Translation Helper
function translate(key) {
    const langData = tts.supportedLanguages[pdfState.language];
    return langData?.translations?.[key] || key;
}

// Display Results with Multilingual Support
function displayResults(data) {
    resultsDiv.innerHTML = '';
    
    // Text Content
    if (data.text) {
        const textSection = document.createElement('section');
        textSection.setAttribute('aria-label', translate('Document Text'));
        
        const heading = document.createElement('h2');
        heading.textContent = translate('Document Text');
        textSection.appendChild(heading);
        
        const textContent = document.createElement('div');
        textContent.className = 'text-content';
        textContent.innerHTML = data.text.replace(/\n/g, '<br>');
        
        if (pdfState.preferences.highlightContent) {
            textContent.classList.add('highlighted');
        }
        
        textSection.appendChild(textContent);
        resultsDiv.appendChild(textSection);
    }

    // Tables with Enhanced Accessibility
    if (data.tables?.length) {
        const tableSection = document.createElement('section');
        tableSection.setAttribute('aria-label', translate('Tables'));
        
        const heading = document.createElement('h2');
        heading.textContent = translate('Tables');
        tableSection.appendChild(heading);
        
        data.tables.forEach(table => {
            const tableContainer = document.createElement('div');
            tableContainer.className = 'table-container';
            tableContainer.setAttribute('role', 'region');
            tableContainer.setAttribute('aria-label', table.summary || translate('Data table'));
            
            const tableEl = document.createElement('table');
            tableEl.className = 'accessible-table';
            tableEl.setAttribute('aria-describedby', `table-desc-${table.table_num || Date.now()}`);
            
            // Add caption for screen readers
            const caption = document.createElement('caption');
            caption.id = `table-desc-${table.table_num || Date.now()}`;
            caption.textContent = table.summary || `${translate('Data table')} with ${table.rows.length} ${translate('rows')}`;
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
                row.forEach((cell, index) => {
                    const td = document.createElement('td');
                    td.textContent = cell;
                    if (table.headers?.[index]) {
                        td.setAttribute('data-header', table.headers[index]);
                    }
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
        imageSection.setAttribute('aria-label', translate('Images'));
        
        const heading = document.createElement('h2');
        heading.textContent = translate('Images');
        imageSection.appendChild(heading);
        
        data.images.forEach(img => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';
            imgContainer.setAttribute('role', 'img');
            imgContainer.setAttribute('aria-label', img['aria-label'] || translate('Document image'));
            
            const pageInfo = document.createElement('p');
            pageInfo.innerHTML = `<strong>${translate('Page')} ${img.page}:</strong> ${img.alt_text}`;
            imgContainer.appendChild(pageInfo);
            
            const dimensions = document.createElement('p');
            dimensions.textContent = `${translate('Dimensions')}: ${img.width} × ${img.height}px`;
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
        notice.textContent = `${translate('This document includes accessibility features')}: ${data.accessibility.features.join(', ')}`;
        resultsDiv.appendChild(notice);
    }

    // Auto-read if enabled
    if (pdfState.preferences.autoRead && tts.enabled) {
        readCurrentPage();
    }
}

// Helper Functions
function showStatus(message) {
    statusDiv.textContent = translate(message);
    statusDiv.style.display = 'block';
}

function showError(message) {
    statusDiv.innerHTML = `<span class="error">${translate(message)}</span>`;
    statusDiv.style.display = 'block';
}

function disableControls(disabled) {
    [prevBtn, nextBtn, zoomInBtn, zoomOutBtn, zoomResetBtn].forEach(btn => {
        btn.disabled = disabled;
    });
}

function updatePageCount() {
    if (pageNum && pdfState.pdfDoc) {
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
    formData.append('language', pdfState.language);
    
    return fetch('http://localhost:8000/parse-pdf', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
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
            
            // Auto-read if enabled
            if (pdfState.preferences.autoRead && tts.enabled) {
                readCurrentPage();
            }
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
    if (pdfState.scale < pdfState.maxScale) {
        pdfState.scale = Math.min(pdfState.scale + pdfState.scaleStep, pdfState.maxScale);
        renderPage(pdfState.pageNum);
    }
}

function onZoomOut() {
    if (pdfState.scale > pdfState.minScale) {
        pdfState.scale = Math.max(pdfState.scale - pdfState.scaleStep, pdfState.minScale);
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
    const voiceSelect = document.getElementById('voice-select');
    
    if (!voiceSelect) {
        console.error('Error: Could not find voice-select element');
        return;
    }

    voiceSelect.innerHTML = '';

    const currentLanguage = pdfState.language;
    const langVoices = tts.voices.filter(v => v.lang.startsWith(currentLanguage));
    const voicesToShow = langVoices.length > 0 ? langVoices : tts.voices;

    voicesToShow.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

    if (tts.voice) {
        voiceSelect.value = tts.voice.voiceURI;
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
    ttsButton.classList.remove('active');
}

// Language Handling
function setupLanguageSelector() {
    if (!languageSelector) return;
    
    for (const [code, langData] of Object.entries(tts.supportedLanguages)) {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = langData.name;
        languageSelector.appendChild(option);
    }
    
    languageSelector.addEventListener('change', (e) => {
        pdfState.language = e.target.value;
        updateVoiceSelector();
        
        // Update UI elements with translations
        container.querySelector('.upload-prompt').textContent = translate('Upload a PDF to begin');
        updatePageCount();
    });
}

// Content Explanation
function explainTable(table) {
    let explanation = '';
    
    if (pdfState.preferences.explanationDepth === 'simple') {
        explanation += `This table has ${table.headers?.length || 0} columns and ${table.rows.length} rows. `;
        if (table.headers?.length) {
            explanation += `The columns are: ${table.headers.join(', ')}. `;
        }
    } else {
        explanation += `Detailed table analysis: This table contains ${table.rows.length} rows of data. `;
        if (table.headers?.length) {
            explanation += `Column headers are: ${table.headers.join(', ')}. `;
        }
        explanation += "Here's the complete data: ";
        table.rows.forEach((row, i) => {
            explanation += `Row ${i + 1}: `;
            row.forEach((cell, j) => {
                const header = table.headers?.[j] || `Column ${j + 1}`;
                explanation += `${header} contains "${cell}". `;
            });
        });
    }
    
    return explanation;
}

function explainImage(image) {
    if (pdfState.preferences.explanationDepth === 'simple') {
        return `Image on page ${image.page} described as: ${image.alt_text}.`;
    } else {
        return `Detailed image description: On page ${image.page}, there is an image described as: "${image.alt_text}". ` +
               `The image dimensions are ${image.width} pixels wide by ${image.height} pixels tall. ` +
               `This visual content appears to show: ${image.alt_text}.`;
    }
}

function explainContent() {
    if (!pdfState.pdfDoc) {
        showError("No document loaded");
        return;
    }

    const currentLanguage = pdfState.language;
    let explanation = `Document explanations in ${tts.supportedLanguages[currentLanguage].name}: `;
    
    const sections = resultsDiv.querySelectorAll('section');
    sections.forEach(section => {
        const sectionType = section.getAttribute('aria-label');
        
        switch(sectionType) {
            case translate('Document Text'):
                explanation += "The document contains the following text: " + 
                              section.querySelector('.text-content').textContent + ". ";
                break;
                
            case translate('Tables'):
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
                
            case translate('Images'):
                section.querySelectorAll('.image-container').forEach(imgContainer => {
                    const img = {
                        page: imgContainer.querySelector('strong').textContent.replace(translate('Page'), '').replace(':', '').trim(),
                        alt_text: imgContainer.querySelector('p').textContent.split(':')[1].trim(),
                        width: imgContainer.querySelectorAll('p')[1].textContent.split('×')[0].replace(translate('Dimensions'), '').trim(),
                        height: imgContainer.querySelectorAll('p')[1].textContent.split('×')[1].replace('px', '').trim()
                    };
                    explanation += explainImage(img);
                });
                break;
        }
    });
    
    speakText(explanation);
    
    const explanationDiv = document.createElement('div');
    explanationDiv.className = 'explanation-content';
    explanationDiv.innerHTML = `
        <h3>${translate('Document Explanation')}</h3>
        <p>${explanation.replace(/\. /g, '.<br>')}</p>
    `;
    resultsDiv.appendChild(explanationDiv);
}

// Preferences Management
function setupPreferences() {
    if (explanationDepthSelect) {
        explanationDepthSelect.value = pdfState.preferences.explanationDepth;
        explanationDepthSelect.addEventListener('change', (e) => {
            pdfState.preferences.explanationDepth = e.target.value;
        });
    }

    if (autoReadCheckbox) {
        autoReadCheckbox.checked = pdfState.preferences.autoRead;
        autoReadCheckbox.addEventListener('change', (e) => {
            pdfState.preferences.autoRead = e.target.checked;
            if (e.target.checked && !tts.enabled) {
                toggleTTS();
            }
        });
    }

    if (highlightCheckbox) {
        highlightCheckbox.checked = pdfState.preferences.highlightContent;
        highlightCheckbox.addEventListener('change', (e) => {
            pdfState.preferences.highlightContent = e.target.checked;
            const textContent = document.querySelector('.text-content');
            if (textContent) {
                textContent.classList.toggle('highlighted', e.target.checked);
            }
        });
    }
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
    
    // Keyboard navigation
    const focusableElements = [prevBtn, nextBtn, zoomInBtn, zoomOutBtn, zoomResetBtn, ttsButton, explainContentBtn];
    focusableElements.forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                el.click();
            }
        });
        el.setAttribute('tabindex', '0');
    });

    // Skip navigation link
    const skipLink = document.createElement('a');
    skipLink.href = '#content-results';
    skipLink.textContent = 'Skip to content';
    skipLink.className = 'skip-link';
    document.body.prepend(skipLink);

    // Global keyboard shortcuts
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
    setupPreferences();
    console.log('Voice select element:', document.getElementById('voice-select'));
    container.innerHTML = `<p class="upload-prompt">${translate('Upload a PDF to begin')}</p>`;
    disableControls(true);
}

document.addEventListener('DOMContentLoaded', init);