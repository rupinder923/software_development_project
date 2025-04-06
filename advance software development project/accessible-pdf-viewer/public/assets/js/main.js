// PDF.js Configuration
// Set the worker script path for PDF.js library
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
// Set verbosity level to only show errors
pdfjsLib.verbosity = pdfjsLib.VerbosityLevel.ERRORS;

// State Management
// Object to store the current state of the PDF viewer
const pdfState = {
    pdfDoc: null,          // Reference to the loaded PDF document
    pageNum: 1,            // Current page number
    pageRendering: false,  // Flag to track if a page is currently being rendered
    pageNumPending: null,  // Page number waiting to be rendered
    scale: 1.0,           // Current zoom scale
    scaleStep: 0.25,      // Zoom step size
    maxScale: 3.0,        // Maximum zoom level
    minScale: 0.5,        // Minimum zoom level
    language: 'en',       // Default language
    preferences: {        // User preferences
    explanationDepth: 'detailed', // Level of detail for explanations
    autoRead: false,              // Auto-read content with TTS
    highlightContent: true        // Highlight text content
    }
};


// TTS and Accessibility State
// Object to manage text-to-speech functionality
const tts = {
    enabled: false,       // TTS enabled state
    utterance: null,      // Current speech utterance
    speaking: false,      // Speech in progress flag
    voices: [],           // Available voices
    rate: 1,             // Speech rate
    voice: null,         // Selected voice
    supportedLanguages: { // Supported languages with translations
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
// Function to get translated text based on current language
function translate(key) {
    const langData = tts.supportedLanguages[pdfState.language];
    return langData?.translations?.[key] || key;
}

// Display Results with Multilingual Support
// Main function to display extracted PDF content
function displayResults(data) {
    resultsDiv.innerHTML = '';
    
    // Text Content
    if (data.metadata) {
        // Create section with accessible attributes
        const metaSection = document.createElement('section');
        metaSection.setAttribute('aria-label', translate('Document Information'));

        const heading = document.createElement('h2');
        heading.textContent = translate('Document Information');
        metaSection.appendChild(heading);
        
         // Add metadata fields in a definition list
        const metaList = document.createElement('dl');
        metaList.className = 'metadata-list';
        
          // Helper to add metadata items
        const addMetaItem = (label, value) => {
            if (value) {
                const dt = document.createElement('dt');
                dt.textContent = translate(label);
                const dd = document.createElement('dd');
                dd.textContent = value;
                metaList.appendChild(dt);
                metaList.appendChild(dd);

            }
        };
        
          // Add various metadata fields
        addMetaItem('Title', data.metadata.title);
        addMetaItem('Author', data.metadata.author);
        addMetaItem('Subject', data.metadata.subject);
        addMetaItem('Pages', data.metadata.pages);
        addMetaItem('Created', data.metadata.creationDate);
        addMetaItem('Modified', data.metadata.modificationDate);
        
        metaSection.appendChild(metaList);
        resultsDiv.appendChild(metaSection);
    }

    // Text Content Section (Enhanced)
    if (data.text) {
         // Create accessible text section
        const textSection = document.createElement('section');
        textSection.setAttribute('aria-label', translate('Document Text'));
        textSection.setAttribute('role', 'region');
        
        const heading = document.createElement('h2');
        heading.textContent = translate('Document Text');
        heading.setAttribute('id', 'text-section-heading');
        textSection.appendChild(heading);
        
        const textContent = document.createElement('div');
        textContent.className = 'text-content';
        textContent.setAttribute('aria-labelledby', 'text-section-heading');
        
        // Process text with paragraph detection
        const paragraphs = data.text.split(/\n\s*\n/);
        paragraphs.forEach(para => {
            if (para.trim()) {
                const p = document.createElement('p');
                p.innerHTML = para.replace(/\n/g, '<br>');
                textContent.appendChild(p);
            }
        });
        
        if (pdfState.preferences.highlightContent) {
            textContent.classList.add('highlighted');
        }
        
        // Add reading time estimate (New)
        const wordCount = data.text.split(/\s+/).length;
        const readingTime = Math.ceil(wordCount / 200); // 200 wpm average
        const readingInfo = document.createElement('p');
        readingInfo.className = 'reading-info';
        readingInfo.textContent = translate('Estimated reading time') + 
                                 `: ${readingTime} ${translate('minute' + (readingTime !== 1 ? 's' : ''))}`;
        textSection.appendChild(readingInfo);
        
        textSection.appendChild(textContent);
        resultsDiv.appendChild(textSection);
    }

    // Tables Section (Enhanced)
    if (data.tables?.length) {
          // Create accessible tables section
        const tableSection = document.createElement('section');
        tableSection.setAttribute('aria-label', translate('Tables'));
        tableSection.setAttribute('role', 'region');
        
        const heading = document.createElement('h2');
        heading.textContent = translate('Tables');
        heading.setAttribute('id', 'tables-section-heading');
        tableSection.appendChild(heading);
        
     // Add table of contents for navigation if many tables
        if (data.tables.length > 3) {
            const toc = document.createElement('nav');
            toc.setAttribute('aria-label', translate('Table of Tables'));
            const tocList = document.createElement('ol');
            
            data.tables.forEach((table, index) => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = `#table-${index}`;
                a.textContent = `${translate('Table')} ${index + 1}` + 
                               (table.summary ? `: ${table.summary}` : '');
                li.appendChild(a);
                tocList.appendChild(li);
            });
            
            toc.appendChild(tocList);
            tableSection.appendChild(toc);
        }
        
        // Process each table
        data.tables.forEach((table, index) => {
            const tableContainer = document.createElement('div');
            tableContainer.className = 'table-container';
            tableContainer.id = `table-${index}`;
            tableContainer.setAttribute('role', 'region');
            tableContainer.setAttribute('aria-label', table.summary || `${translate('Table')} ${index + 1}`);

             // Create accessible table with proper markup
            const tableEl = document.createElement('table');
            tableEl.className = 'accessible-table';
            tableEl.setAttribute('aria-describedby', `table-desc-${index}`);
            
            // Enhanced caption with navigation
            const caption = document.createElement('caption');
            caption.id = `table-desc-${index}`;
            
            const captionText = document.createElement('span');
            captionText.textContent = table.summary || `${translate('Table')} ${index + 1}`;
            caption.appendChild(captionText);
            
            // Add table navigation buttons (New)
            const navDiv = document.createElement('div');
            navDiv.className = 'table-nav';
            
            if (index > 0) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'table-nav-btn';
                prevBtn.textContent = `← ${translate('Previous Table')}`;
                prevBtn.onclick = () => document.getElementById(`table-${index-1}`).scrollIntoView();
                navDiv.appendChild(prevBtn);
            }
            
            if (index < data.tables.length - 1) {
                const nextBtn = document.createElement('button');
                nextBtn.className = 'table-nav-btn';
                nextBtn.textContent = `${translate('Next Table')} →`;
                nextBtn.onclick = () => document.getElementById(`table-${index+1}`).scrollIntoView();
                navDiv.appendChild(nextBtn);
            }
            
            caption.appendChild(navDiv);
            tableEl.appendChild(caption);
            
            // Headers with multilingual support
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
            
            // Table body with row headers if first column appears to be headers
            const tbody = document.createElement('tbody');
            table.rows.forEach((row, rowIndex) => {
                const tr = document.createElement('tr');
                
                row.forEach((cell, cellIndex) => {
                    // Check if first column should be treated as row headers
                    if (cellIndex === 0 && rowIndex > 0 && 
                        (table.headers?.[0]?.toLowerCase().includes('name') || 
                         table.headers?.[0]?.toLowerCase().includes('description'))) {
                        const th = document.createElement('th');
                        th.setAttribute('scope', 'row');
                        th.textContent = cell;
                        tr.appendChild(th);
                    } else {
                        const td = document.createElement('td');
                        td.textContent = cell;
                        if (table.headers?.[cellIndex]) {
                            td.setAttribute('data-header', table.headers[cellIndex]);
                        }
                        tr.appendChild(td);
                    }
                });
                
                tbody.appendChild(tr);
            });
            
            tableEl.appendChild(tbody);
            tableContainer.appendChild(tableEl);
            tableSection.appendChild(tableContainer);
        });
        
        resultsDiv.appendChild(tableSection);
    }

    // Images Section (Enhanced)
    if (data.images?.length) {
        // Create accessible images section
        const imageSection = document.createElement('section');
        imageSection.setAttribute('aria-label', translate('Images'));
        imageSection.setAttribute('role', 'region');
        
        const heading = document.createElement('h2');
        heading.textContent = translate('Images');
        heading.setAttribute('id', 'images-section-heading');
        imageSection.appendChild(heading);
        

        // Add view toggle (list/gallery)
        const viewToggle = document.createElement('div');
        viewToggle.className = 'view-toggle';
        
        const listViewBtn = document.createElement('button');
        listViewBtn.textContent = translate('List View');
        listViewBtn.className = 'active';
        listViewBtn.onclick = () => {
            imageSection.classList.remove('gallery-view');
            listViewBtn.classList.add('active');
            galleryViewBtn.classList.remove('active');
        };
        
        const galleryViewBtn = document.createElement('button');
        galleryViewBtn.textContent = translate('Gallery View');
        galleryViewBtn.onclick = () => {
            imageSection.classList.add('gallery-view');
            listViewBtn.classList.remove('active');
            galleryViewBtn.classList.add('active');
        };
        
        viewToggle.appendChild(listViewBtn);
        viewToggle.appendChild(galleryViewBtn);
        imageSection.appendChild(viewToggle);
        
        // Images container
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'images-container';

        // Process each image
        data.images.forEach((img, index) => {
            // Create image container with expandable view
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';
            imgContainer.id = `image-${index}`;
            imgContainer.setAttribute('role', 'figure');
            imgContainer.setAttribute('aria-label', img['aria-label'] || `${translate('Image')} ${index + 1}`);
            
            // Image thumbnail with expandable view (New)
            const imgThumbnail = document.createElement('img');
            imgThumbnail.src = img.thumbnail || img.src;
            imgThumbnail.alt = '';
            imgThumbnail.className = 'image-thumbnail';
            imgThumbnail.onclick = () => {
                // Toggle expanded view
                imgContainer.classList.toggle('expanded');
                if (imgContainer.classList.contains('expanded')) {
                    imgThumbnail.src = img.src;
                } else {
                    imgThumbnail.src = img.thumbnail || img.src;
                }
            };
            imgContainer.appendChild(imgThumbnail);
            
             // Add image info and description field
            const imgInfo = document.createElement('div');
            imgInfo.className = 'image-info';
            
             // ... build image info
            const pageInfo = document.createElement('p');
            pageInfo.innerHTML = `<strong>${translate('Page')} ${img.page}:</strong> ${img.alt_text}`;
            imgInfo.appendChild(pageInfo);
            
            const dimensions = document.createElement('p');
            dimensions.textContent = `${translate('Dimensions')}: ${img.width} × ${img.height}px`;
            imgInfo.appendChild(dimensions);
            
            // Image description textarea for user notes (New)
            if (pdfState.preferences.explanationDepth === 'detailed') {
                const descLabel = document.createElement('label');
                descLabel.textContent = translate('Add your description') + ':';
                descLabel.htmlFor = `image-desc-${index}`;
                imgInfo.appendChild(descLabel);
                
                const descInput = document.createElement('textarea');
                descInput.id = `image-desc-${index}`;
                descInput.rows = 2;
                descInput.placeholder = translate('Describe this image in your own words');
                imgInfo.appendChild(descInput);
            }
            
            imgContainer.appendChild(imgInfo);
            imagesContainer.appendChild(imgContainer);
        });
        
        imageSection.appendChild(imagesContainer);
        resultsDiv.appendChild(imageSection);
    }

    // Accessibility Features Section (Enhanced)
    if (data.accessibility) {

        // Create section showing accessibility info
        const accessibilitySection = document.createElement('section');
        accessibilitySection.className = 'accessibility-section';
        accessibilitySection.setAttribute('role', 'region');
        accessibilitySection.setAttribute('aria-label', translate('Accessibility Features'));
        
        const heading = document.createElement('h2');
        heading.textContent = translate('Accessibility Features');
        accessibilitySection.appendChild(heading);
        
        // List accessibility features with icons
        const featuresList = document.createElement('ul');
        featuresList.className = 'features-list';
        
        // Add feature with appropriate icon
        data.accessibility.features.forEach(feature => {
            const li = document.createElement('li');
            
            // Add icons for common accessibility features
            const icon = document.createElement('span');
            icon.className = 'feature-icon';
            icon.setAttribute('aria-hidden', 'true');
            
            if (feature.toLowerCase().includes('alt text')) {
                icon.textContent = '🖼️';
                li.textContent = translate('Images have alternative text descriptions');
            } else if (feature.toLowerCase().includes('heading')) {
                icon.textContent = '📑';
                li.textContent = translate('Document has proper heading structure');
            } else if (feature.toLowerCase().includes('table')) {
                icon.textContent = '📊';
                li.textContent = translate('Tables have proper markup for screen readers');
            } else {
                icon.textContent = '✓';
                li.textContent = feature;
            }
            
            li.prepend(icon);
            featuresList.appendChild(li);
        });
        
        accessibilitySection.appendChild(featuresList);
        
        // Add accessibility score if available (New)
        if (data.accessibility.score) {
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'accessibility-score';
            
            const scoreText = document.createElement('p');
            scoreText.textContent = `${translate('Accessibility Score')}: ${data.accessibility.score}/100`;
            scoreDiv.appendChild(scoreText);
            
            const scoreBar = document.createElement('div');
            scoreBar.className = 'score-bar';
            
            const scoreFill = document.createElement('div');
            scoreFill.className = 'score-fill';
            scoreFill.style.width = `${data.accessibility.score}%`;
            
            // Color coding based on score
            if (data.accessibility.score >= 80) {
                scoreFill.classList.add('high-score');
            } else if (data.accessibility.score >= 50) {
                scoreFill.classList.add('medium-score');
            } else {
                scoreFill.classList.add('low-score');
            }
            
            scoreBar.appendChild(scoreFill);
            scoreDiv.appendChild(scoreBar);
            
            accessibilitySection.appendChild(scoreDiv);
        }
        
        resultsDiv.appendChild(accessibilitySection);
    }

    // Auto-read if enabled
    if (pdfState.preferences.autoRead && tts.enabled) {
        readCurrentPage();
    }
}

// Helper Functions
// Show status message to user
function showStatus(message) {
    statusDiv.textContent = translate(message);
    statusDiv.style.display = 'block';
}

// Show error message
function showError(message) {
    statusDiv.innerHTML = `<span class="error">${translate(message)}</span>`;
    statusDiv.style.display = 'block';
}


// Enable/disable control buttons
function disableControls(disabled) {
    [prevBtn, nextBtn, zoomInBtn, zoomOutBtn, zoomResetBtn].forEach(btn => {
        btn.disabled = disabled;
    });
}


// Update page count display
function updatePageCount() {
    if (pageNum && pdfState.pdfDoc) {
        pageNum.textContent = `Page ${pdfState.pageNum} of ${pdfState.pdfDoc.numPages}`;
    }
}

// Drag and Drop Functions
// Prevent default drag behaviors
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop zone when dragging over
function highlight() {
    dropZone.classList.add('highlight');
}

function unhighlight() {
    dropZone.classList.remove('highlight');
}

// Handle dropped file
function handleDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
        handleFile(file);
    } else {
        showError("Please upload a valid PDF file");
    }
}


// Set up drag and drop event listeners
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
// Process uploaded PDF file
function handleFile(file) {
    showStatus("Processing PDF...");
    const fileReader = new FileReader();
    
    fileReader.onload = async function() {
        try {
            const typedArray = new Uint8Array(this.result);
            loadPDF(typedArray);
          await  sendFileToServer(file);
        } catch (error) {
            showError(error.message);
        }
    };
    
    fileReader.onerror = () => showError("File reading failed");
    fileReader.readAsArrayBuffer(file);
}

// Send PDF to backend for processing
async function sendFileToServer(file) {
    const formData = new FormData();
    formData.append('pdfFile', file);
    formData.append('language', pdfState.language);
    
    try {
        const response = await fetch('http://localhost:8000/parse-pdf', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        if (data.status === 'success') {
            displayResults(data);
        } else {
            throw new Error(data.error || 'Processing failed');
        }
    } catch (error) {
        showError(error.message);
    }
}

// PDF Rendering Functions
// Load PDF document
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


// Render a specific page
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
// Go to previous page
function onPrevPage() {
    if (pdfState.pageNum > 1) {
        pdfState.pageNum--;
        renderPage(pdfState.pageNum);
    }
}

// Go to next page
function onNextPage() {
    if (pdfState.pdfDoc && pdfState.pageNum < pdfState.pdfDoc.numPages) {
        pdfState.pageNum++;
        renderPage(pdfState.pageNum);
    }
}

// ... other navigation functions (next page, zoom in/out, reset zoom)
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
// Load available voices
async function loadVoices() {
    return new Promise(resolve => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
            tts.voices = voices;
            tts.voice = voices.find(v => v.default) || voices[0];
            updateVoiceSelector();
            resolve();
            
        } else {
             // Wait for voices to load
            speechSynthesis.onvoiceschanged = () => {
                tts.voices = speechSynthesis.getVoices();
                tts.voice = tts.voices.find(v => v.default) || tts.voices[0];
                updateVoiceSelector();
                resolve();
            };
        }
    });
}

// Update voice selector dropdown
function updateVoiceSelector() {
    const voiceSelect = document.getElementById('voice-select');
    
    if (!voiceSelect) {
        console.error('Error: Could not find voice-select element');
        return;
    }

    voiceSelect.innerHTML = '';

     // Filter voices by current language
    const currentLanguage = pdfState.language;
    const langVoices = tts.voices.filter(v => v.lang.startsWith(currentLanguage));
    const voicesToShow = langVoices.length > 0 ? langVoices : tts.voices;

   // Add voice options
    voicesToShow.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

     // Set selected voice
    if (tts.voice) {
        voiceSelect.value = tts.voice.voiceURI;
    }
}

// Toggle TTS on/off
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

// Read text from current page
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

// Speak text using TTS
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
    
    // Event handlers for speech
    tts.utterance.onend = () => {
        tts.speaking = false;
        ttsButton.classList.remove('active');
         // Auto-advance to next page if enabled
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

// Stop TTS
function stopTTS() {
    if (window.speechSynthesis) {
        speechSynthesis.cancel();
    }
    tts.speaking = false;
    ttsButton.classList.remove('active');
}

// Language Handling
// Set up language selector dropdown
function setupLanguageSelector() {
    if (!languageSelector) return;
    
     // Add supported languages to dropdown
    for (const [code, langData] of Object.entries(tts.supportedLanguages)) {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = langData.name;
        languageSelector.appendChild(option);
    }
    
    // Handle language change
    languageSelector.addEventListener('change', (e) => {
        pdfState.language = e.target.value;
        updateVoiceSelector();
        
        // Update UI elements with translations
        const uploadPrompt = container.querySelector('.upload-prompt');
        if (uploadPrompt) {
            uploadPrompt.innerHTML = translate('Upload a PDF to begin');
        } else {
            console.warn('Could not find .upload-prompt element');
        }
        updatePageCount();
    });
}

// Content Explanation
// Generate explanation for a table
function explainTable(table) {
    let explanation = '';
    
    
    // Simple or detailed explanation based on preference
    if (pdfState.preferences.explanationDepth === 'simple') {
        explanation += `This table has ${table.headers?.length || 0} columns and ${table.rows.length} rows. `;
        if (table.headers?.length) {
            explanation += `The columns are: ${table.headers.join(', ')}. `;
        }
    } else {
        // Detailed explanation with row-by-row data
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

// Generate explanation for an image
function explainImage(image) {
    // Simple or detailed image description
    if (pdfState.preferences.explanationDepth === 'simple') {
        return `Image on page ${image.page} described as: ${image.alt_text}.`;
    } else {
        // Detailed image description with dimensions
        return `Detailed image description: On page ${image.page}, there is an image described as: "${image.alt_text}". ` +
               `The image dimensions are ${image.width} pixels wide by ${image.height} pixels tall. ` +
               `This visual content appears to show: ${image.alt_text}.`;
    }
}

// Explain document content
function explainContent() {
    if (!pdfState.pdfDoc) {
        showError("No document loaded");
        return;
    }

    const currentLanguage = pdfState.language;
    // Build explanation by analyzing each content section
    let explanation = `Document explanations in ${tts.supportedLanguages[currentLanguage].name}: `;
    
    // Process each section (text, tables, images)
    const sections = resultsDiv.querySelectorAll('section');
    sections.forEach(section => {
        const sectionType = section.getAttribute('aria-label');
        
        switch(sectionType) {
            case translate('Document Text'):
                // Add text content explanation
                explanation += "The document contains the following text: " + 
                              section.querySelector('.text-content').textContent + ". ";
                break;
                
            case translate('Tables'):
                 // Add table explanations
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
                 // Add image explanations
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
    
    
    // Speak and display the explanation
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
// Set up preference controls
function setupPreferences() {
      // Explanation depth preference
    if (explanationDepthSelect) {
        explanationDepthSelect.value = pdfState.preferences.explanationDepth;
        explanationDepthSelect.addEventListener('change', (e) => {
            pdfState.preferences.explanationDepth = e.target.value;
        });
    }

    // Auto-read preference
    if (autoReadCheckbox) {
        autoReadCheckbox.checked = pdfState.preferences.autoRead;
        autoReadCheckbox.addEventListener('change', (e) => {
            pdfState.preferences.autoRead = e.target.checked;
            if (e.target.checked && !tts.enabled) {
                toggleTTS();
            }
        });
    }

    
    // Highlight content preference
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
// Set up file input handler
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

// Set up event listeners for controls
function setupEventListeners() {
    // Navigation buttons
    prevBtn.addEventListener('click', () => {
        stopTTS();
        onPrevPage();
    });
    
    nextBtn.addEventListener('click', () => {
        stopTTS();
        onNextPage();
    });
    
     // Zoom buttons
    zoomInBtn.addEventListener('click', onZoomIn);
    zoomOutBtn.addEventListener('click', onZoomOut);
    zoomResetBtn.addEventListener('click', onZoomReset);
       // TTS button
    ttsButton.addEventListener('click', toggleTTS);
    
     // Voice selection
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
        
        
        // Handle keyboard shortcuts
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
    await loadVoices();          // Load available TTS voices
    setupLanguageSelector();     // Set up language dropdown
    setupDragAndDrop();          // Enable drag and drop
    setupFileInput();            // Set up file input handler
    setupEventListeners();       // Add event listeners
    setupPreferences();          // Initialize preferences
    
    console.log('Voice select element:', document.getElementById('voice-select'));
     // Show initial prompt
    container.innerHTML = `<p class="upload-prompt">${translate('Upload a PDF to begin')}</p>`;
    disableControls(true);
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);