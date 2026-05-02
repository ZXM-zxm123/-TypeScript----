# -TypeScript----
前端使用 React + TypeScript 实现白板 Canvas（绘图工具、文字、图形）和 WebRTC 音视频通话。Node.js 负责 WebSocket 信令、房间管理、用户列表。C++ 编写 WebAssembly 模块用于音频处理（降噪、增益控制），前端调用提升通话质量。支持屏幕共享、白板同步（绘制事件实时广播）、聊天。可录制白板操作和音频，保存到服务器。实现房间码、权限控制（主持人踢人）。输出前端、Node.js、C++（Wasm）完整代码及集成说明。
