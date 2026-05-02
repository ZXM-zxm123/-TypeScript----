#!/bin/bash

emcc audio_processor.cpp \
  -o audio_processor.js \
  -s EXPORTED_FUNCTIONS="['_createAudioProcessor', '_destroyAudioProcessor', '_setNoiseThreshold', '_setGain', '_processAudio', '_allocateBuffer', '_freeBuffer']" \
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'getValue', 'setValue']" \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -O3
