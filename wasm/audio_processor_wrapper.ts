interface AudioProcessorModuleType {
    _createAudioProcessor(maxChannels: number): number;
    _destroyAudioProcessor(processor: number): void;
    _setNoiseThreshold(processor: number, threshold: number): void;
    _setGain(processor: number, gain: number): void;
    _setChannelData(processor: number, channelId: number, samples: number, length: number): void;
    _processMix(processor: number, output: number, length: number): void;
    _getBufferSize(processor: number): number;
    _getActiveChannelCount(processor: number): number;
    _malloc(size: number): number;
    _free(ptr: number): void;
    HEAPF32: Float32Array;
}

export class LowLatencyAudioProcessor {
    private module: AudioProcessorModuleType | null = null;
    private processorPtr: number = 0;
    private initialized: boolean = false;
    private outputBufferPtr: number = 0;
    private channelBuffers: Map<number, number> = new Map();
    private maxChannels: number = 8;
    private bufferSize: number = 128;
    private wasmMemory: WebAssembly.Memory | null = null;

    async init(maxChannels: number = 8): Promise<void> {
        if (this.initialized) return;
        
        this.maxChannels = maxChannels;
        this.bufferSize = 128;
        
        try {
            const importObject = {
                env: {
                    memory: new WebAssembly.Memory({ initial: 256, maximum: 512 })
                }
            };
            
            const response = await fetch('/audio_processor.wasm');
            const bytes = await response.arrayBuffer();
            const result = await WebAssembly.instantiate(bytes, importObject);
            
            this.module = result.instance.exports as unknown as AudioProcessorModuleType;
            this.wasmMemory = importObject.env.memory;
            this.processorPtr = this.module._createAudioProcessor(maxChannels);
            this.bufferSize = this.module._getBufferSize(this.processorPtr);
            
            this.outputBufferPtr = this.module._malloc(this.bufferSize * 4);
            
            for (let i = 0; i < maxChannels; i++) {
                const buf = this.module._malloc(this.bufferSize * 4);
                this.channelBuffers.set(i, buf);
            }
            
            this.initialized = true;
        } catch (error) {
            console.warn('WASM not available, using JS fallback');
            this.initialized = true;
        }
    }

    setNoiseThreshold(threshold: number): void {
        if (!this.initialized || !this.module) return;
        this.module._setNoiseThreshold(this.processorPtr, threshold);
    }

    setGain(gain: number): void {
        if (!this.initialized || !this.module) return;
        this.module._setGain(this.processorPtr, gain);
    }

    setChannelData(channelId: number, samples: Float32Array): void {
        if (!this.initialized) return;
        
        if (!this.module) {
            this.channelBuffers.set(channelId, samples[0]);
            return;
        }
        
        const bufferPtr = this.channelBuffers.get(channelId);
        if (!bufferPtr) return;
        
        const copyLen = Math.min(samples.length, this.bufferSize);
        this.module.HEAPF32.set(samples.subarray(0, copyLen), bufferPtr / 4);
        this.module._setChannelData(this.processorPtr, channelId, bufferPtr, copyLen);
    }

    processMix(): Float32Array {
        if (!this.initialized) {
            return new Float32Array(this.bufferSize);
        }
        
        if (!this.module) {
            return this.jsFallbackMix();
        }
        
        this.module._processMix(this.processorPtr, this.outputBufferPtr, this.bufferSize);
        
        const result = new Float32Array(this.bufferSize);
        result.set(this.module.HEAPF32.subarray(
            this.outputBufferPtr / 4, 
            this.outputBufferPtr / 4 + this.bufferSize
        ));
        
        return result;
    }

    private jsFallbackMix(): Float32Array {
        const result = new Float32Array(this.bufferSize);
        let activeCount = 0;
        
        this.channelBuffers.forEach((data) => {
            if (data && typeof data === 'number') {
                for (let i = 0; i < this.bufferSize; i++) {
                    result[i] += data * 0.5;
                }
                activeCount++;
            }
        });
        
        if (activeCount > 1) {
            for (let i = 0; i < this.bufferSize; i++) {
                result[i] = Math.max(-1, Math.min(1, result[i]));
            }
        }
        
        return result;
    }

    getBufferSize(): number {
        return this.bufferSize;
    }

    getMaxChannels(): number {
        return this.maxChannels;
    }

    getActiveChannelCount(): number {
        if (!this.initialized || !this.module) return 0;
        return this.module._getActiveChannelCount(this.processorPtr);
    }

    destroy(): void {
        if (!this.initialized) return;
        
        if (this.module) {
            this.channelBuffers.forEach(buf => {
                this.module!._free(buf);
            });
            
            if (this.outputBufferPtr) {
                this.module._free(this.outputBufferPtr);
            }
            
            this.module._destroyAudioProcessor(this.processorPtr);
        }
        
        this.initialized = false;
        this.channelBuffers.clear();
    }
}
