@echo off
echo Building Audio Processor with SIMD optimization...

:: 检查Emscripten是否可用
where emcc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: emcc not found. Please install Emscripten SDK.
    exit /b 1
)

:: 构建配置
:: 启用SIMD (WASM_SIMD=1)
:: 启用优化 (-O3)
:: 启用内存增长 (ALLOW_MEMORY_GROWTH=1)

emcc audio_processor.cpp ^
    -o audio_processor.js ^
    -s EXPORTED_FUNCTIONS=["_createAudioProcessor","_destroyAudioProcessor","_setNoiseThreshold","_setGain","_setChannelData","_processMix","_getBufferSize","_allocateBuffer","_freeBuffer"] ^
    -s EXPORTED_RUNTIME_METHODS=["ccall","cwrap","getValue","setValue"] ^
    -s WASM=1 ^
    -s WASM_SIMD=1 ^
    -s ALLOW_MEMORY_GROWTH=1 ^
    -s MODULARIZE=1 ^
    -s EXPORT_ES6=1 ^
    -O3 ^
    -msimd128 ^
    -msse2

:: 检查构建结果
if %ERRORLEVEL% EQU 0 (
    echo Build successful!
    echo Output files: audio_processor.js and audio_processor.wasm
) else (
    echo Build failed!
    exit /b 1
)
