import { WasmAudioProcessor } from '../../wasm/audio_processor_wrapper';

// 消息类型定义
type WorkerMessage = 
    | { type: 'init', maxChannels: number }
    | { type: 'setChannelData', channelId: number, samples: Float32Array }
    | { type: 'setNoiseThreshold', threshold: number }
    | { type: 'setGain', gain: number }
    | { type: 'processMix' }
    | { type: 'destroy' };

type WorkerResponse =
    | { type: 'initialized' }
    | { type: 'processed', samples: Float32Array }
    | { type: 'error', message: string };

let processor: WasmAudioProcessor | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    try {
        const message = e.data;
        
        switch (message.type) {
            case 'init':
                processor = new WasmAudioProcessor();
                await processor.init(message.maxChannels || 8);
                self.postMessage({ type: 'initialized' } as WorkerResponse);
                break;
                
            case 'setChannelData':
                if (processor) {
                    processor.setChannelData(message.channelId, message.samples);
                }
                break;
                
            case 'setNoiseThreshold':
                if (processor) {
                    processor.setNoiseThreshold(message.threshold);
                }
                break;
                
            case 'setGain':
                if (processor) {
                    processor.setGain(message.gain);
                }
                break;
                
            case 'processMix':
                if (processor) {
                    const result = processor.processMix();
                    // 传输Transferable对象以提高性能
                    self.postMessage(
                        { type: 'processed', samples: result } as WorkerResponse,
                        [result.buffer]
                    );
                }
                break;
                
            case 'destroy':
                if (processor) {
                    processor.destroy();
                    processor = null;
                }
                break;
        }
    } catch (error) {
        console.error('Audio processor worker error:', error);
        self.postMessage({ 
            type: 'error', 
            message: error instanceof Error ? error.message : 'Unknown error' 
        } as WorkerResponse);
    }
};

export {};
