#include <emscripten.h>
#include <cmath>
#include <vector>
#include <algorithm>

class AudioProcessor {
private:
    float noiseThreshold;
    float gainMultiplier;
    std::vector<float> prevSamples;
    static const size_t FILTER_SIZE = 32;

public:
    AudioProcessor() : noiseThreshold(0.05f), gainMultiplier(1.0f) {
        prevSamples.resize(FILTER_SIZE, 0.0f);
    }

    void setNoiseThreshold(float threshold) {
        noiseThreshold = std::max(0.0f, std::min(1.0f, threshold));
    }

    void setGain(float gain) {
        gainMultiplier = std::max(0.0f, std::min(5.0f, gain));
    }

    void process(float* samples, size_t length) {
        for (size_t i = 0; i < length; ++i) {
            float sample = samples[i];
            
            sample = applyNoiseGate(sample);
            
            sample = applySpectralSubtraction(sample, i);
            
            sample *= gainMultiplier;
            
            sample = std::max(-1.0f, std::min(1.0f, sample));
            
            samples[i] = sample;
            
            prevSamples[i % FILTER_SIZE] = sample;
        }
    }

private:
    float applyNoiseGate(float sample) {
        if (std::fabs(sample) < noiseThreshold) {
            return sample * 0.1f;
        }
        return sample;
    }

    float applySpectralSubtraction(float sample, size_t index) {
        float avgNoise = 0.0f;
        for (float s : prevSamples) {
            avgNoise += std::fabs(s);
        }
        avgNoise /= FILTER_SIZE;
        
        float processed = sample - avgNoise * 0.5f;
        
        return processed;
    }
};

EMSCRIPTEN_KEEPALIVE
AudioProcessor* createAudioProcessor() {
    return new AudioProcessor();
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
void processAudio(AudioProcessor* processor, float* samples, int length) {
    if (processor && samples) {
        processor->process(samples, static_cast<size_t>(length));
    }
}

EMSCRIPTEN_KEEPALIVE
float* allocateBuffer(int length) {
    return new float[length];
}

EMSCRIPTEN_KEEPALIVE
void freeBuffer(float* buffer) {
    delete[] buffer;
}
