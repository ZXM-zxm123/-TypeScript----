@echo off
echo Building Low-Latency Audio Processor...

:: 检查Emscripten
where emcc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: emcc not found. Please install Emscripten SDK.
    exit /b 1
)

:: 优化构建配置
:: -O3: 最高优化级别
:: -s WASM_SIMD=1: 启用SIMD加速
:: -s ALLOW_MEMORY_GROWTH=1: 允许内存增长
:: -msimd128: 启用SIMD128指令
:: --closure 1: 启用Google Closure压缩
:: --llvm-opts 3: LLVM最高优化

emcc audio_processor.cpp ^
    -o audio_processor.js ^
    -s EXPORTED_FUNCTIONS=["_createAudioProcessor","_destroyAudioProcessor","_setNoiseThreshold","_setGain","_setChannelData","_processMix","_getBufferSize","_getActiveChannelCount"] ^
    -s EXPORTED_RUNTIME_METHODS=["ccall","cwrap","getValue","setValue"] ^
    -s WASM=1 ^
    -s WASM_SIMD=1 ^
    -s ALLOW_MEMORY_GROWTH=1 ^
    -s MODULARIZE=1 ^
    -s EXPORT_ES6=1 ^
    -s ENVIRONMENT=web ^
    -O3 ^
    -msimd128 ^
    -msse2 ^
    --closure 1 ^
    --llvm-opts 3

if %ERRORLEVEL% EQU 0 (
    echo ✅ Build successful!
    echo 📦 Output: audio_processor.js + audio_processor.wasm
    echo ⚡ Optimizations: SIMD ^| -O3 ^| closure ^| LLVM opts
    echo 📏 Buffer size: 128 samples
) else (
    echo ❌ Build failed!
    exit /b 1
)
