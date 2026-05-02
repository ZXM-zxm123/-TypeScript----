import AudioProcessorModule from './audio_processor.js';

interface AudioProcessorModuleType {
  _createAudioProcessor(): number;
  _destroyAudioProcessor(processor: number): void;
  _setNoiseThreshold(processor: number, threshold: number): void;
  _setGain(processor: number, gain: number): void;
  _processAudio(processor: number, samples: number, length: number): void;
  _allocateBuffer(length: number): number;
  _freeBuffer(buffer: number): void;
  HEAPF32: Float32Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
}

export class WasmAudioProcessor {
  private module: AudioProcessorModuleType | null = null;
  private processorPtr: number = 0;
  private initialized: boolean = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    
    this.module = await AudioProcessorModule() as AudioProcessorModuleType;
    this.processorPtr = this.module._createAudioProcessor();
    this.initialized = true;
  }

  setNoiseThreshold(threshold: number): void {
    if (!this.initialized || !this.module) return;
    this.module._setNoiseThreshold(this.processorPtr, threshold);
  }

  setGain(gain: number): void {
    if (!this.initialized || !this.module) return;
    this.module._setGain(this.processorPtr, gain);
  }

  process(audioBuffer: Float32Array): Float32Array {
    if (!this.initialized || !this.module) {
      return audioBuffer;
    }

    const length = audioBuffer.length;
    const bufferPtr = this.module._malloc(length * 4);
    
    this.module.HEAPF32.set(audioBuffer, bufferPtr / 4);
    this.module._processAudio(this.processorPtr, bufferPtr, length);
    
    const processed = new Float32Array(this.module.HEAPF32.buffer, bufferPtr, length);
    const result = new Float32Array(processed);
    
    this.module._free(bufferPtr);
    
    return result;
  }

  destroy(): void {
    if (!this.initialized || !this.module) return;
    this.module._destroyAudioProcessor(this.processorPtr);
    this.initialized = false;
  }
}
