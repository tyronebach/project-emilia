/**
 * SpeechRecognizer - Web Speech API wrapper
 * Handles browser speech-to-text with fallback detection
 */

type SpeechRecognitionType = typeof window.SpeechRecognition;

export class SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private _isSupported: boolean;
  private isListening = false;

  constructor() {
    const SpeechRecognitionAPI = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;
    
    this._isSupported = !!SpeechRecognitionAPI;
    
    if (this._isSupported) {
      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
    }
  }

  get supported(): boolean {
    return this._isSupported;
  }

  async transcribe(
    onInterim?: (text: string) => void,
    onFinal?: (text: string) => void
  ): Promise<string> {
    if (!this.recognition) {
      throw new Error('Speech recognition not supported');
    }

    if (this.isListening) {
      this.abort();
    }

    return new Promise((resolve, reject) => {
      let finalTranscript = '';
      
      this.recognition!.onresult = (event) => {
        let interim = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
            onFinal?.(finalTranscript);
          } else {
            interim += transcript;
            onInterim?.(interim);
          }
        }
      };

      this.recognition!.onerror = (event) => {
        this.isListening = false;
        if (event.error === 'no-speech') {
          resolve(''); // No speech detected is not an error
        } else {
          reject(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      this.recognition!.onend = () => {
        this.isListening = false;
        resolve(finalTranscript);
      };

      this.isListening = true;
      this.recognition!.start();
    });
  }

  abort(): void {
    if (this.recognition && this.isListening) {
      this.recognition.abort();
      this.isListening = false;
    }
  }

  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }
}

export const speechRecognizer = new SpeechRecognizer();
