# 实时协作白板与音视频通话系统

这是一个完整的实时协作系统，包含白板绘图、音视频通话、屏幕共享、聊天等功能。

## 项目结构

```
.
├── frontend/          # React前端
├── server/            # Node.js后端
└── wasm/              # C++ WebAssembly音频处理模块
```

## 功能特性

### 前端 (React + TypeScript)
- **白板绘图**: 支持画笔、橡皮擦、直线、矩形、圆形、文字等工具
- **WebRTC音视频通话**: 多人实时音视频通话
- **屏幕共享**: 支持屏幕或窗口共享
- **聊天功能**: 实时文本聊天
- **录制功能**: 支持会议录制并保存到服务器
- **用户列表**: 显示房间内所有用户，支持主持人踢出用户
- **房间管理**: 创建/加入房间，自动生成房间码
- **权限控制**: 主持人可以踢出用户，主持人权限自动转移
- **低延迟音频**: 128帧缓冲，Web Worker处理，单向延迟<100ms

### 后端 (Node.js)
- **WebSocket信令服务器**: 处理WebRTC连接建立
- **房间管理**: 创建和管理房间
- **用户管理**: 管理房间内用户状态
- **录制文件存储**: 保存录制文件

### WebAssembly (C++)
- **音频处理**: 噪声抑制
- **增益控制**: 自动音量调节
- **多路混音**: 智能混音，支持最多8路音频
- **SIMD优化**: 使用SSE/NEON指令加速
- **低延迟**: 128帧缓冲，Web Worker异步处理，单向延迟<100ms
- **性能优化**: 见 [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md)
- **延迟优化**: 见 [LATENCY_OPTIMIZATION.md](LATENCY_OPTIMIZATION.md)

## 快速开始

### 1. 安装依赖

#### 后端
```bash
cd server
npm install
```

#### 前端
```bash
cd frontend
npm install
```

### 2. 编译WebAssembly (可选)

需要安装 Emscripten SDK: https://emscripten.org/docs/getting_started/downloads.html

```bash
cd wasm

# Linux/Mac
./build.sh

# Windows
build.bat
```

**注意**: 如果不编译WASM模块，系统会自动使用降级方案（纯JavaScript实现）。

### 3. 启动服务

#### 启动后端服务器
```bash
cd server
npm start
```
后端将在 http://localhost:3001 启动

#### 启动前端开发服务器
```bash
cd frontend
npm start
```
前端将在 http://localhost:3000 启动

## 使用说明

### 创建房间
1. 输入你的名字
2. 点击"创建房间"
3. 复制房间码分享给其他人

### 加入房间
1. 输入你的名字
2. 输入房间码
3. 点击"加入"

### 白板功能
- 选择绘图工具（画笔、橡皮擦、直线等）
- 选择颜色和线条宽度
- 在白板上绘制
- 点击"清空画布"清除所有内容

### 音视频通话
- 切换到"视频"标签页
- 使用底部控制栏：
  - 🎤: 开关麦克风
  - 📷: 开关摄像头
  - 🖥️: 共享屏幕

### 录制会议
1. 点击顶部"⏺️ 开始录制"按钮
2. 完成后点击"⏹️ 停止录制"
3. 录制文件将自动保存到服务器

### 聊天
- 在右侧聊天面板输入消息
- 按回车或点击"发送"按钮

### 音频处理
- 使用底部的滑块调节：
  - 降噪阈值: 调节噪声抑制强度
  - 增益: 调节音量
- 实时延迟显示（目标<100ms）

### 主持人权限
- 创建房间的用户默认为主持人
- 主持人可以在用户列表中踢出其他用户
- 主持人离开后，权限自动转移给下一个用户

## 技术栈

### 前端
- React 18
- TypeScript
- WebRTC API
- Canvas API
- Web Worker

### 后端
- Node.js
- Express
- WebSocket (ws库)
- Multer (文件上传)

### WebAssembly
- C++
- Emscripten
- SIMD指令集

## 注意事项

1. 使用HTTPS或localhost才能访问摄像头和麦克风
2. WebRTC需要在可信网络环境中使用
3. 录制功能需要浏览器支持MediaRecorder API
4. WebAssembly音频处理需要先编译wasm模块
5. 音频延迟优化默认启用，状态栏显示实时延迟

## 开发

### 后端开发
```bash
cd server
npm run dev  # 使用nodemon自动重启
```

### 前端开发
```bash
cd frontend
npm start
```

### WebAssembly开发
修改 `wasm/audio_processor.cpp` 后重新编译：
```bash
cd wasm
./build.sh
```

## 性能优化

### 音频延迟优化
- **缓冲区**: 128帧（从512降至128）
- **处理模式**: Web Worker异步处理
- **AudioContext**: interactive低延迟模式
- **目标延迟**: 单向<100ms

详细优化说明见：
- [LATENCY_OPTIMIZATION.md](LATENCY_OPTIMIZATION.md) - 延迟优化详解
- [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md) - 性能优化详解

## 许可证

MIT License
