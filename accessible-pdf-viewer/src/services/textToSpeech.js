let currentUtterance = null;

export function speak(text, interrupt = true) {
    if ('speechSynthesis' in window) {
        if (interrupt && currentUtterance) {
            window.speechSynthesis.cancel();
        }
        
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.rate = 1.0;
        currentUtterance.pitch = 1.0;
        currentUtterance.lang = 'en-US';
        
        currentUtterance.onerror = (e) => {
            console.error('Speech error:', e);
        };
        
        window.speechSynthesis.speak(currentUtterance);
    }
}

export function stopSpeaking() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}