#include <emscripten.h>
#include <cmath>
#include <vector>
#include <algorithm>
#include <cstring>

// 配置参数
#define MAX_MIX_CHANNELS 4  // 最多同时混音4路强信号
#define ATTENUATED_GAIN 0.3f  // 其他路的衰减系数
#define BUFFER_SIZE 256  // 优化后的缓冲区大小，更小的延迟

#if defined(__SSE__) || defined(__SSE2__)
#include <xmmintrin.h>
#include <emmintrin.h>
#define USE_SSE 1
#elif defined(__ARM_NEON)
#include <arm_neon.h>
#define USE_NEON 1
#endif

class AudioProcessor {
private:
    struct ChannelState {
        float* buffer;
        int bufferSize;
        float volume;
        float lastEnergy;
        bool active;
        
        ChannelState() : buffer(nullptr), bufferSize(0), volume(1.0f), lastEnergy(0.0f), active(false) {}
    };

    std::vector<ChannelState> channels;
    float* outputBuffer;
    int maxChannels;
    float noiseThreshold;
    float gainMultiplier;

    float computeEnergy(const float* samples, int length) {
        float energy = 0.0f;
        for (int i = 0; i < length; ++i) {
            energy += samples[i] * samples[i];
        }
        return sqrt(energy / length);
    }

    void applyNoiseGate(float* samples, int length) {
        for (int i = 0; i < length; ++i) {
            if (fabs(samples[i]) < noiseThreshold) {
                samples[i] *= 0.1f;
            }
        }
    }

    void applyGain(float* samples, int length) {
        for (int i = 0; i < length; ++i) {
            samples[i] *= gainMultiplier;
            // 削波保护
            samples[i] = std::max(-1.0f, std::min(1.0f, samples[i]));
        }
    }

    // SIMD优化：SSE版本
#ifdef USE_SSE
    void mixChannelsSSE(float* output, const std::vector<int>& activeIndices, int length) {
        int i = 0;
        for (; i + 4 <= length; i += 4) {
            __m128 sum = _mm_setzero_ps();
            
            for (int idx : activeIndices) {
                const float* buf = channels[idx].buffer;
                float vol = channels[idx].volume;
                __m128 vec = _mm_loadu_ps(&buf[i]);
                __m128 v = _mm_mul_ps(vec, _mm_set1_ps(vol));
                sum = _mm_add_ps(sum, v);
            }
            
            _mm_storeu_ps(&output[i], sum);
        }
        
        // 处理剩余的样本
        for (; i < length; ++i) {
            float sum = 0.0f;
            for (int idx : activeIndices) {
                sum += channels[idx].buffer[i] * channels[idx].volume;
            }
            output[i] = sum;
        }
    }
#endif

    // SIMD优化：NEON版本
#ifdef USE_NEON
    void mixChannelsNEON(float* output, const std::vector<int>& activeIndices, int length) {
        int i = 0;
        for (; i + 4 <= length; i += 4) {
            float32x4_t sum = vdupq_n_f32(0.0f);
            
            for (int idx : activeIndices) {
                const float* buf = channels[idx].buffer;
                float vol = channels[idx].volume;
                float32x4_t vec = vld1q_f32(&buf[i]);
                float32x4_t v = vmulq_n_f32(vec, vol);
                sum = vaddq_f32(sum, v);
            }
            
            vst1q_f32(&output[i], sum);
        }
        
        for (; i < length; ++i) {
            float sum = 0.0f;
            for (int idx : activeIndices) {
                sum += channels[idx].buffer[i] * channels[idx].volume;
            }
            output[i] = sum;
        }
    }
#endif

    // 普通版本（无SIMD）
    void mixChannelsScalar(float* output, const std::vector<int>& activeIndices, int length) {
        memset(output, 0, length * sizeof(float));
        for (int idx : activeIndices) {
            float vol = channels[idx].volume;
            const float* buf = channels[idx].buffer;
            for (int i = 0; i < length; ++i) {
                output[i] += buf[i] * vol;
            }
        }
    }

public:
    AudioProcessor(int maxCh = 8) : maxChannels(maxCh), noiseThreshold(0.05f), gainMultiplier(1.0f) {
        channels.resize(maxChannels);
        outputBuffer = new float[BUFFER_SIZE];
        
        for (auto& ch : channels) {
            ch.buffer = new float[BUFFER_SIZE];
            ch.bufferSize = BUFFER_SIZE;
            memset(ch.buffer, 0, BUFFER_SIZE * sizeof(float));
        }
    }

    ~AudioProcessor() {
        delete[] outputBuffer;
        for (auto& ch : channels) {
            delete[] ch.buffer;
        }
    }

    void setNoiseThreshold(float threshold) {
        noiseThreshold = std::max(0.0f, std::min(1.0f, threshold));
    }

    void setGain(float gain) {
        gainMultiplier = std::max(0.0f, std::min(5.0f, gain));
    }

    void setChannelData(int channelId, const float* samples, int length) {
        if (channelId < 0 || channelId >= maxChannels) return;
        
        int copyLen = std::min(length, BUFFER_SIZE);
        memcpy(channels[channelId].buffer, samples, copyLen * sizeof(float));
        
        if (copyLen < BUFFER_SIZE) {
            memset(channels[channelId].buffer + copyLen, 0, (BUFFER_SIZE - copyLen) * sizeof(float));
        }
        
        // 计算音量能量
        channels[channelId].lastEnergy = computeEnergy(channels[channelId].buffer, BUFFER_SIZE);
        channels[channelId].active = channels[channelId].lastEnergy > noiseThreshold * 0.5f;
    }

    void processMix(float* output, int length) {
        // 选择最强的MAX_MIX_CHANNELS路强信号
        std::vector<std::pair<float, int>> activeChannels;
        
        for (int i = 0; i < maxChannels; ++i) {
            if (channels[i].active) {
                activeChannels.emplace_back(channels[i].lastEnergy, i);
            }
        }
        
        // 按能量排序，选择前MAX_MIX_CHANNELS个
        std::sort(activeChannels.rbegin(), activeChannels.rend(),
                  [](const auto& a, const auto& b) { return a.first > b.first; });
        
        std::vector<int> selectedIndices;
        for (size_t i = 0; i < activeChannels.size(); ++i) {
            if (i < MAX_MIX_CHANNELS) {
                channels[activeChannels[i].second].volume = 1.0f;
            } else {
                channels[activeChannels[i].second].volume = ATTENUATED_GAIN;
            }
            selectedIndices.push_back(activeChannels[i].second);
        }

        // 混音
        int processLen = std::min(length, BUFFER_SIZE);
        if (selectedIndices.empty()) {
            memset(output, 0, processLen * sizeof(float));
        } else {
#ifdef USE_SSE
            mixChannelsSSE(output, selectedIndices, processLen);
#elif USE_NEON
            mixChannelsNEON(output, selectedIndices, processLen);
#else
            mixChannelsScalar(output, selectedIndices, processLen);
#endif
        }

        // 应用噪声门和增益
        applyNoiseGate(output, processLen);
        applyGain(output, processLen);
    }

    int getBufferSize() const {
        return BUFFER_SIZE;
    }
};

// C API
extern "C" {

EMSCRIPTEN_KEEPALIVE
AudioProcessor* createAudioProcessor(int maxChannels) {
    return new AudioProcessor(maxChannels);
}

EMSCRIPTEN_KEEPALIVE
void destroyAudioProcessor(AudioProcessor* processor) {
    delete processor;
}

EMSCRIPTEN_KEEPALIVE
void setNoiseThreshold(AudioProcessor* processor, float threshold) {
    if (processor) {
        processor->setNoiseThreshold(threshold);
    }
}

EMSCRIPTEN_KEEPALIVE
void setGain(AudioProcessor* processor, float gain) {
    if (processor) {
        processor->setGain(gain);
    }
}

EMSCRIPTEN_KEEPALIVE
void setChannelData(AudioProcessor* processor, int channelId, const float* samples, int length) {
    if (processor) {
        processor->setChannelData(channelId, samples, length);
    }
}

EMSCRIPTEN_KEEPALIVE
void processMix(AudioProcessor* processor, float* output, int length) {
    if (processor) {
        processor->processMix(output, length);
    }
}

EMSCRIPTEN_KEEPALIVE
int getBufferSize(AudioProcessor* processor) {
    if (processor) {
        return processor->getBufferSize();
    }
    return BUFFER_SIZE;
}

EMSCRIPTEN_KEEPALIVE
float* allocateBuffer(int length) {
    return new float[length];
}

EMSCRIPTEN_KEEPALIVE
void freeBuffer(float* buffer) {
    delete[] buffer;
}

}
