export class AudioProcessorManager {
    private worker: Worker | null = null;
    private initialized: boolean = false;
    private pendingRequests: Map<number, (data: Float32Array) => void> = new Map();
    private requestId: number = 0;
    private onError: ((error: string) => void) | null = null;
    private onInitialized: (() => void) | null = null;

    constructor() {
        // 创建Worker - 在实际项目中需要正确配置
        // 这里使用动态创建方式，实际使用时需要配合构建工具
    }

    async init(maxChannels: number = 8): Promise<void> {
        if (this.initialized) return;

        // 注意：在实际项目中，需要使用正确的Worker导入方式
        // 对于Create React App，可能需要使用worker-loader或自定义配置
        // 这里提供一个简单的实现
        
        // 简单的内联Worker（实际项目中推荐使用分离的文件）
        const workerCode = `
            // 简化版Worker，实际项目应使用完整的audioProcessor.worker.ts
            let processing = false;
            
            self.onmessage = (e) => {
                const msg = e.data;
                
                switch(msg.type) {
                    case 'init':
                        self.postMessage({ type: 'initialized' });
                        break;
                        
                    case 'setChannelData':
                        // 存储通道数据
                        self.channels = self.channels || {};
                        self.channels[msg.channelId] = msg.samples;
                        break;
                        
                    case 'processMix':
                        if (processing) return;
                        processing = true;
                        
                        // 简单的混音实现（无WASM时的降级方案）
                        const channels = self.channels || {};
                        const samples = new Float32Array(256);
                        let activeCount = 0;
                        
                        // 简单混音
                        Object.values(channels).forEach(channel => {
                            if (channel) {
                                for (let i = 0; i < Math.min(channel.length, 256); i++) {
                                    samples[i] += channel[i] * 0.5;
                                }
                                activeCount++;
                            }
                        });
                        
                        // 归一化
                        if (activeCount > 1) {
                            for (let i = 0; i < 256; i++) {
                                samples[i] = Math.max(-1, Math.min(1, samples[i]));
                            }
                        }
                        
                        self.postMessage({ type: 'processed', samples }, [samples.buffer]);
                        processing = false;
                        break;
                        
                    case 'destroy':
                        self.close();
                        break;
                }
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        
        this.worker = new Worker(blobUrl);
        
        this.worker.onmessage = (e: MessageEvent) => {
            const response = e.data;
            
            switch(response.type) {
                case 'initialized':
                    this.initialized = true;
                    if (this.onInitialized) {
                        this.onInitialized();
                    }
                    break;
                    
                case 'processed':
                    const callback = this.pendingRequests.get(this.requestId - 1);
                    if (callback) {
                        callback(response.samples);
                        this.pendingRequests.delete(this.requestId - 1);
                    }
                    break;
                    
                case 'error':
                    if (this.onError) {
                        this.onError(response.message);
                    }
                    break;
            }
        };

        this.worker.onerror = (error) => {
            console.error('Audio worker error:', error);
            if (this.onError) {
                this.onError(error.message);
            }
        };

        // 初始化Worker
        this.worker.postMessage({ type: 'init', maxChannels });

        return new Promise((resolve) => {
            this.onInitialized = () => {
                resolve();
            };
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
        this.worker.postMessage({ type: 'setNoiseThreshold', threshold });
    }

    setGain(gain: number): void {
        if (!this.worker || !this.initialized) return;
        this.worker.postMessage({ type: 'setGain', gain });
    }

    processMix(): Promise<Float32Array> {
        return new Promise((resolve) => {
            if (!this.worker || !this.initialized) {
                resolve(new Float32Array(256));
                return;
            }
            
            const id = this.requestId++;
            this.pendingRequests.set(id, resolve);
            this.worker.postMessage({ type: 'processMix' });
        });
    }

    destroy(): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'destroy' });
            this.worker.terminate();
            this.worker = null;
        }
        this.initialized = false;
        this.pendingRequests.clear();
    }
}
