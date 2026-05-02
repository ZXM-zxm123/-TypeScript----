import AudioProcessorModule from './audio_processor.js';

interface AudioProcessorModuleType {
    _createAudioProcessor(maxChannels: number): number;
    _destroyAudioProcessor(processor: number): void;
    _setNoiseThreshold(processor: number, threshold: number): void;
    _setGain(processor: number, gain: number): void;
    _setChannelData(processor: number, channelId: number, samples: number, length: number): void;
    _processMix(processor: number, output: number, length: number): void;
    _getBufferSize(processor: number): number;
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
    private outputBufferPtr: number = 0;
    private channelBuffers: Map<number, number> = new Map();
    private maxChannels: number = 8;
    private bufferSize: number = 256;

    async init(maxChannels: number = 8): Promise<void> {
        if (this.initialized) return;
        
        this.maxChannels = maxChannels;
        this.module = await AudioProcessorModule() as AudioProcessorModuleType;
        this.processorPtr = this.module._createAudioProcessor(maxChannels);
        this.bufferSize = this.module._getBufferSize(this.processorPtr);
        
        // 分配输出缓冲区
        this.outputBufferPtr = this.module._malloc(this.bufferSize * 4);
        
        // 预分配通道缓冲区
        for (let i = 0; i < maxChannels; i++) {
            const buf = this.module._malloc(this.bufferSize * 4);
            this.channelBuffers.set(i, buf);
        }
        
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

    setChannelData(channelId: number, samples: Float32Array): void {
        if (!this.initialized || !this.module) return;
        if (channelId < 0 || channelId >= this.maxChannels) return;
        
        const bufferPtr = this.channelBuffers.get(channelId);
        if (!bufferPtr) return;
        
        // 复制数据到WASM内存
        const copyLen = Math.min(samples.length, this.bufferSize);
        this.module.HEAPF32.set(samples.subarray(0, copyLen), bufferPtr / 4);
        
        // 处理
        this.module._setChannelData(this.processorPtr, channelId, bufferPtr, copyLen);
    }

    processMix(): Float32Array {
        if (!this.initialized || !this.module) {
            return new Float32Array(this.bufferSize);
        }
        
        // 处理混音
        this.module._processMix(this.processorPtr, this.outputBufferPtr, this.bufferSize);
        
        // 复制返回数据
        const result = new Float32Array(this.bufferSize);
        result.set(this.module.HEAPF32.subarray(this.outputBufferPtr / 4, this.outputBufferPtr / 4 + this.bufferSize));
        
        return result;
    }

    getBufferSize(): number {
        return this.bufferSize;
    }

    getMaxChannels(): number {
        return this.maxChannels;
    }

    destroy(): void {
        if (!this.initialized || !this.module) return;
        
        // 释放通道缓冲区
        this.channelBuffers.forEach(buf => {
            this.module!._free(buf);
        });
        
        // 释放输出缓冲区
        if (this.outputBufferPtr) {
            this.module._free(this.outputBufferPtr);
        }
        
        // 释放处理器
        this.module._destroyAudioProcessor(this.processorPtr);
        this.initialized = false;
        this.channelBuffers.clear();
    }
}
