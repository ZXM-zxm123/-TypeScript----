#include <emscripten.h>
#include <cmath>
#include <vector>
#include <algorithm>
#include <cstring>

// 低延迟配置
#define BUFFER_SIZE 128  // 从256降至128，减少延迟
#define MAX_MIX_CHANNELS 4
#define ATTENUATED_GAIN 0.3f

#if defined(__SSE__) || defined(__SSE2__)
#include <xmmintrin.h>
#include <emmintrin.h>
#define USE_SSE 1
#elif defined(__ARM_NEON)
#include <arm_neon.h>
#define USE_NEON 1
#endif

class LowLatencyAudioProcessor {
private:
    struct ChannelState {
        float buffer[BUFFER_SIZE];
        float volume;
        float lastEnergy;
        bool active;
        
        ChannelState() : volume(1.0f), lastEnergy(0.0f), active(false) {
            memset(buffer, 0, sizeof(buffer));
        }
    };

    ChannelState channels[MAX_MIX_CHANNELS * 2];
    float outputBuffer[BUFFER_SIZE];
    int maxChannels;
    float noiseThreshold;
    float gainMultiplier;
    int activeChannelCount;

public:
    LowLatencyAudioProcessor(int maxCh = 8) 
        : maxChannels(maxCh), noiseThreshold(0.05f), gainMultiplier(1.0f), activeChannelCount(0) {
    }

    inline float computeEnergyFast(const float* samples) {
        float energy = 0.0f;
        for (int i = 0; i < BUFFER_SIZE; ++i) {
            energy += samples[i] * samples[i];
        }
        return sqrtf(energy / BUFFER_SIZE);
    }

    inline void applyNoiseGate(float* samples) {
        for (int i = 0; i < BUFFER_SIZE; ++i) {
            float absVal = fabsf(samples[i]);
            if (absVal < noiseThreshold) {
                samples[i] *= 0.1f;
            }
        }
    }

    inline void applyGainClipping(float* samples) {
        for (int i = 0; i < BUFFER_SIZE; ++i) {
            samples[i] *= gainMultiplier;
            if (samples[i] > 1.0f) samples[i] = 1.0f;
            else if (samples[i] < -1.0f) samples[i] = -1.0f;
        }
    }

#ifdef USE_SSE
    inline void mixChannelsSSE(float* output, const std::vector<int>& indices) {
        for (int i = 0; i + 4 <= BUFFER_SIZE; i += 4) {
            __m128 sum = _mm_setzero_ps();
            
            for (int idx : indices) {
                const float* buf = channels[idx].buffer;
                float vol = channels[idx].volume;
                __m128 v = _mm_mul_ps(_mm_loadu_ps(&buf[i]), _mm_set1_ps(vol));
                sum = _mm_add_ps(sum, v);
            }
            
            _mm_storeu_ps(&output[i], sum);
        }
        
        for (int i = (BUFFER_SIZE & ~3); i < BUFFER_SIZE; ++i) {
            float sum = 0.0f;
            for (int idx : indices) {
                sum += channels[idx].buffer[i] * channels[idx].volume;
            }
            output[i] = sum;
        }
    }
#endif

#ifdef USE_NEON
    inline void mixChannelsNEON(float* output, const std::vector<int>& indices) {
        for (int i = 0; i + 4 <= BUFFER_SIZE; i += 4) {
            float32x4_t sum = vdupq_n_f32(0.0f);
            
            for (int idx : indices) {
                const float* buf = channels[idx].buffer;
                float vol = channels[idx].volume;
                float32x4_t v = vmulq_n_f32(vld1q_f32(&buf[i]), vdupq_n_f32(vol));
                sum = vaddq_f32(sum, v);
            }
            
            vst1q_f32(&output[i], sum);
        }
        
        for (int i = (BUFFER_SIZE & ~3); i < BUFFER_SIZE; ++i) {
            float sum = 0.0f;
            for (int idx : indices) {
                sum += channels[idx].buffer[i] * channels[idx].volume;
            }
            output[i] = sum;
        }
    }
#endif

    inline void mixChannelsScalar(float* output, const std::vector<int>& indices) {
        memset(output, 0, BUFFER_SIZE * sizeof(float));
        for (int idx : indices) {
            float vol = channels[idx].volume;
            const float* buf = channels[idx].buffer;
            for (int i = 0; i < BUFFER_SIZE; ++i) {
                output[i] += buf[i] * vol;
            }
        }
    }

    inline void setChannelDataInternal(int channelId, const float* samples) {
        if (channelId < 0 || channelId >= maxChannels) return;
        
        ChannelState& ch = channels[channelId];
        memcpy(ch.buffer, samples, BUFFER_SIZE * sizeof(float));
        ch.lastEnergy = computeEnergyFast(ch.buffer);
        ch.active = ch.lastEnergy > noiseThreshold * 0.5f;
    }

    inline void processMixInternal() {
        std::vector<std::pair<float, int>> activeChannels;
        
        for (int i = 0; i < maxChannels; ++i) {
            if (channels[i].active) {
                activeChannels.emplace_back(channels[i].lastEnergy, i);
            }
        }
        
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

        activeChannelCount = selectedIndices.size();

        if (selectedIndices.empty()) {
            memset(outputBuffer, 0, BUFFER_SIZE * sizeof(float));
        } else {
#ifdef USE_SSE
            mixChannelsSSE(outputBuffer, selectedIndices);
#elif USE_NEON
            mixChannelsNEON(outputBuffer, selectedIndices);
#else
            mixChannelsScalar(outputBuffer, selectedIndices);
#endif
        }

        applyNoiseGate(outputBuffer);
        applyGainClipping(outputBuffer);
    }

public:
    void setNoiseThreshold(float threshold) {
        noiseThreshold = std::max(0.0f, std::min(1.0f, threshold));
    }

    void setGain(float gain) {
        gainMultiplier = std::max(0.0f, std::min(5.0f, gain));
    }

    void setChannelData(int channelId, const float* samples, int length) {
        if (length != BUFFER_SIZE) {
            static float tempBuffer[BUFFER_SIZE];
            int copyLen = std::min(length, BUFFER_SIZE);
            memcpy(tempBuffer, samples, copyLen * sizeof(float));
            if (copyLen < BUFFER_SIZE) {
                memset(tempBuffer + copyLen, 0, (BUFFER_SIZE - copyLen) * sizeof(float));
            }
            setChannelDataInternal(channelId, tempBuffer);
        } else {
            setChannelDataInternal(channelId, samples);
        }
    }

    void processMix(float* output, int length) {
        processMixInternal();
        int copyLen = std::min(length, BUFFER_SIZE);
        memcpy(output, outputBuffer, copyLen * sizeof(float));
    }

    const float* getOutput() const {
        return outputBuffer;
    }

    int getBufferSize() const {
        return BUFFER_SIZE;
    }

    int getActiveChannelCount() const {
        return activeChannelCount;
    }
};

extern "C" {

EMSCRIPTEN_KEEPALIVE
LowLatencyAudioProcessor* createAudioProcessor(int maxChannels) {
    return new LowLatencyAudioProcessor(maxChannels);
}

EMSCRIPTEN_KEEPALIVE
void destroyAudioProcessor(LowLatencyAudioProcessor* processor) {
    delete processor;
}

EMSCRIPTEN_KEEPALIVE
void setNoiseThreshold(LowLatencyAudioProcessor* processor, float threshold) {
    if (processor) {
        processor->setNoiseThreshold(threshold);
    }
}

EMSCRIPTEN_KEEPALIVE
void setGain(LowLatencyAudioProcessor* processor, float gain) {
    if (processor) {
        processor->setGain(gain);
    }
}

EMSCRIPTEN_KEEPALIVE
void setChannelData(LowLatencyAudioProcessor* processor, int channelId, const float* samples, int length) {
    if (processor) {
        processor->setChannelData(channelId, samples, length);
    }
}

EMSCRIPTEN_KEEPALIVE
void processMix(LowLatencyAudioProcessor* processor, float* output, int length) {
    if (processor) {
        processor->processMix(output, length);
    }
}

EMSCRIPTEN_KEEPALIVE
int getBufferSize(LowLatencyAudioProcessor* processor) {
    if (processor) {
        return processor->getBufferSize();
    }
    return BUFFER_SIZE;
}

EMSCRIPTEN_KEEPALIVE
int getActiveChannelCount(LowLatencyAudioProcessor* processor) {
    if (processor) {
        return processor->getActiveChannelCount();
    }
    return 0;
}

}
