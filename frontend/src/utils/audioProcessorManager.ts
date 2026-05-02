export interface AudioProcessorConfig {
    bufferSize: number;
    maxChannels: number;
    latencyHint: 'interactive' | 'balanced' | 'Playback';
    noiseThreshold: number;
    gain: number;
}

export class LowLatencyAudioProcessorManager {
    private worker: Worker | null = null;
    private initialized: boolean = false;
    private config: AudioProcessorConfig;
    private onLatencyUpdate: ((latency: number) => void) | null = null;

    constructor(config?: Partial<AudioProcessorConfig>) {
        this.config = {
            bufferSize: config?.bufferSize || 128,
            maxChannels: config?.maxChannels || 8,
            latencyHint: config?.latencyHint || 'interactive',
            noiseThreshold: config?.noiseThreshold || 0.05,
            gain: config?.gain || 1.5
        };
    }

    async init(): Promise<void> {
        if (this.initialized) return;

        const workerCode = `
            const BUFFER_SIZE = ${this.config.bufferSize};
            const MAX_CHANNELS = ${this.config.maxChannels};
            
            let processing = false;
            let channels = new Map();
            let noiseThreshold = ${this.config.noiseThreshold};
            let gain = ${this.config.gain};
            
            self.onmessage = (e) => {
                const msg = e.data;
                
                switch(msg.type) {
                    case 'init':
                        self.postMessage({ type: 'initialized', bufferSize: BUFFER_SIZE });
                        break;
                        
                    case 'setChannelData':
                        channels.set(msg.channelId, msg.samples);
                        break;
                        
                    case 'setNoiseThreshold':
                        noiseThreshold = msg.value;
                        break;
                        
                    case 'setGain':
                        gain = msg.value;
                        break;
                        
                    case 'processMix':
                        if (processing) {
                            self.postMessage({ type: 'processed', samples: new Float32Array(BUFFER_SIZE), latency: 0 });
                            return;
                        }
                        processing = true;
                        
                        const startTime = performance.now();
                        
                        // 收集活跃通道
                        const activeChannels = [];
                        channels.forEach((samples, id) => {
                            if (samples && samples.length > 0) {
                                const energy = computeEnergy(samples);
                                if (energy > noiseThreshold * 0.5) {
                                    activeChannels.push({ id, samples, energy });
                                }
                            }
                        });
                        
                        // 按能量排序
                        activeChannels.sort((a, b) => b.energy - a.energy);
                        
                        // 混音
                        const output = new Float32Array(BUFFER_SIZE);
                        const maxMixChannels = 4;
                        
                        activeChannels.forEach((ch, idx) => {
                            const vol = idx < maxMixChannels ? 1.0 : 0.3;
                            for (let i = 0; i < Math.min(ch.samples.length, BUFFER_SIZE); i++) {
                                output[i] += ch.samples[i] * vol;
                            }
                        });
                        
                        // 噪声门和增益
                        for (let i = 0; i < BUFFER_SIZE; i++) {
                            if (Math.abs(output[i]) < noiseThreshold) {
                                output[i] *= 0.1;
                            }
                            output[i] *= gain;
                            output[i] = Math.max(-1, Math.min(1, output[i]));
                        }
                        
                        const latency = performance.now() - startTime;
                        
                        self.postMessage(
                            { type: 'processed', samples: output, latency, activeChannels: activeChannels.length },
                            [output.buffer]
                        );
                        processing = false;
                        break;
                        
                    case 'destroy':
                        channels.clear();
                        self.close();
                        break;
                }
            };
            
            function computeEnergy(samples) {
                let energy = 0;
                for (let i = 0; i < samples.length; i++) {
                    energy += samples[i] * samples[i];
                }
                return Math.sqrt(energy / samples.length);
            }
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        
        this.worker = new Worker(blobUrl);
        
        this.worker.onmessage = (e: MessageEvent) => {
            const response = e.data;
            
            switch(response.type) {
                case 'initialized':
                    this.initialized = true;
                    break;
                    
                case 'processed':
                    if (this.onLatencyUpdate && response.latency !== undefined) {
                        this.onLatencyUpdate(response.latency);
                    }
                    break;
            }
        };

        this.worker.onerror = (error) => {
            console.error('Audio worker error:', error);
        };

        this.worker.postMessage({ type: 'init' });

        return new Promise((resolve) => {
            const checkInit = setInterval(() => {
                if (this.initialized) {
                    clearInterval(checkInit);
                    resolve();
                }
            }, 10);
        });
    }

    setChannelData(channelId: number, samples: Float32Array): void {
        if (!this.worker || !this.initialized) return;
        
        this.worker.postMessage(
            { type: 'setChannelData', channelId, samples },
            [samples.buffer]
        );
    }

    setNoiseThreshold(threshold: number): void {
        if (!this.worker || !this.initialized) return;
        this.worker.postMessage({ type: 'setNoiseThreshold', value: threshold });
    }

    setGain(gain: number): void {
        if (!this.worker || !this.initialized) return;
        this.worker.postMessage({ type: 'setGain', value: gain });
    }

    processMix(): Promise<{ samples: Float32Array; latency: number }> {
        return new Promise((resolve) => {
            if (!this.worker || !this.initialized) {
                resolve({ samples: new Float32Array(this.config.bufferSize), latency: 0 });
                return;
            }
            
            const timeout = setTimeout(() => {
                resolve({ samples: new Float32Array(this.config.bufferSize), latency: 999 });
            }, 50);
            
            const handler = (e: MessageEvent) => {
                if (e.data.type === 'processed') {
                    clearTimeout(timeout);
                    this.worker?.removeEventListener('message', handler);
                    resolve({ 
                        samples: e.data.samples, 
                        latency: e.data.latency || 0 
                    });
                }
            };
            
            this.worker.addEventListener('message', handler);
            this.worker.postMessage({ type: 'processMix' });
        });
    }

    onLatency(callback: (latency: number) => void): void {
        this.onLatencyUpdate = callback;
    }

    getConfig(): AudioProcessorConfig {
        return { ...this.config };
    }

    destroy(): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'destroy' });
            this.worker.terminate();
            this.worker = null;
        }
        this.initialized = false;
    }
}

export function createLowLatencyAudioContext(): AudioContext | null {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        
        const audioContext = new AudioContext({
            latencyHint: 'interactive',
            sampleRate: 48000
        });
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        return audioContext;
    } catch (error) {
        console.error('Failed to create low-latency AudioContext:', error);
        return null;
    }
}
