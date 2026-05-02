import React, { useState, useEffect, useRef, useCallback } from 'react';
import Whiteboard from './components/Whiteboard';
import VideoCall from './components/VideoCall';
import Chat from './components/Chat';
import UserList from './components/UserList';
import { User, DrawData, ChatMessage } from './types';
import { LowLatencyAudioProcessorManager, createLowLatencyAudioContext } from './utils/audioProcessorManager';

const App: React.FC = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [inRoom, setInRoom] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>([]);
  const [drawHistory, setDrawHistory] = useState<DrawData[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(true);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'whiteboard' | 'video'>('whiteboard');
  const [noiseThreshold, setNoiseThreshold] = useState(0.05);
  const [gain, setGain] = useState(1.5);
  const [audioProcessorReady, setAudioProcessorReady] = useState(false);
  const [audioLatency, setAudioLatency] = useState(0);

  const roomCodeInputRef = useRef<HTMLInputElement>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const audioProcessor = useRef<LowLatencyAudioProcessorManager | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    audioProcessor.current = new LowLatencyAudioProcessorManager({
      bufferSize: 128,
      maxChannels: 8,
      latencyHint: 'interactive',
      noiseThreshold: noiseThreshold,
      gain: gain
    });
    
    audioProcessor.current.onLatency((latency) => {
      setAudioLatency(latency);
    });
    
    const initAudio = async () => {
      try {
        await audioProcessor.current?.init();
        setAudioProcessorReady(true);
        console.log('Low-latency audio processor initialized');
      } catch (error) {
        console.warn('Audio processor not available:', error);
      }
    };

    if (inRoom) {
      initAudio();
    }

    return () => {
      audioProcessor.current?.destroy();
      audioContextRef.current?.close();
    };
  }, [inRoom]);

  useEffect(() => {
    const initWs = new WebSocket('ws://localhost:3001');
    initWs.onopen = () => {
      setWs(initWs);
    };

    initWs.onmessage = (event) => {
      handleMessage(JSON.parse(event.data));
    };

    initWs.onclose = () => {
      setWs(null);
    };

    return () => {
      initWs.close();
    };
  }, []);

  const handleMessage = (msg: any) => {
    switch (msg.type) {
      case 'roomCreated':
        setRoomCode(msg.roomCode);
        setUserId(msg.userId);
        setIsHost(true);
        setInRoom(true);
        setUsers([{ id: msg.userId, name: userName, isHost: true }]);
        initMedia();
        break;
      case 'joinedRoom':
        setRoomCode(msg.roomCode);
        setUserId(msg.userId);
        setIsHost(false);
        setInRoom(true);
        setUsers(msg.users);
        setDrawHistory(msg.whiteboardHistory);
        setMessages(msg.chatHistory);
        initMedia();
        break;
      case 'userJoined':
        setUsers(prev => [...prev, msg.user]);
        if (localStream && ws) {
          createPeerConnection(msg.user.id, true);
        }
        break;
      case 'userLeft':
      case 'userKicked':
        setUsers(prev => prev.filter(u => u.id !== msg.userId));
        remoteStreams.delete(msg.userId);
        setRemoteStreams(new Map(remoteStreams));
        const pc = peerConnections.current.get(msg.userId);
        if (pc) {
          pc.close();
          peerConnections.current.delete(msg.userId);
        }
        break;
      case 'hostChanged':
        setUsers(prev => prev.map(u => ({
          ...u,
          isHost: u.id === msg.hostId
        })));
        if (msg.hostId === userId) {
          setIsHost(true);
        }
        break;
      case 'signal':
        handleSignal(msg.fromId, msg.signal);
        break;
      case 'whiteboardDraw':
        setDrawHistory(prev => [...prev, msg.data]);
        break;
      case 'whiteboardClear':
        setDrawHistory([]);
        break;
      case 'chatMessage':
        setMessages(prev => [...prev, msg.message]);
        break;
      case 'kicked':
        alert('你已被踢出房间');
        leaveRoom();
        break;
      case 'error':
        alert(msg.message);
        break;
    }
  };

  const initMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          latency: 0.01
        }
      });
      setLocalStream(stream);
      
      setupLowLatencyAudio(stream);
      
      users.forEach(user => {
        if (user.id !== userId) {
          createPeerConnection(user.id, true);
        }
      });
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const setupLowLatencyAudio = (stream: MediaStream) => {
    if (!audioProcessor.current) return;

    audioContextRef.current = createLowLatencyAudioContext();
    if (!audioContextRef.current) {
      console.warn('Failed to create low-latency AudioContext');
      return;
    }

    const ctx = audioContextRef.current;
    
    try {
      sourceRef.current = ctx.createMediaStreamSource(stream);
      
      const bufferSize = 128;
      processorRef.current = ctx.createScriptProcessor(bufferSize, 1, 1);
      
      processorRef.current.onaudioprocess = (event) => {
        if (!audioProcessor.current || !isMicEnabled) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        
        audioProcessor.current.setChannelData(0, inputData);
        
        audioProcessor.current.processMix().then(({ samples, latency }) => {
          const outputData = event.outputBuffer.getChannelData(0);
          outputData.set(samples);
        }).catch(() => {});
      };
      
      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(ctx.destination);
      
      console.log('Low-latency audio chain established');
    } catch (error) {
      console.error('Error setting up audio processing:', error);
    }
  };

  const createPeerConnection = (peerId: string, initiate: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && ws) {
        ws.send(JSON.stringify({
          type: 'signal',
          targetId: peerId,
          signal: { candidate: event.candidate }
        }));
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      setRemoteStreams(prev => new Map(prev).set(peerId, stream));
    };

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    if (initiate) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          if (ws && pc.localDescription) {
            ws.send(JSON.stringify({
              type: 'signal',
              targetId: peerId,
              signal: { sdp: pc.localDescription }
            }));
          }
        });
    }

    return pc;
  };

  const handleSignal = (peerId: string, signal: any) => {
    let pc = peerConnections.current.get(peerId);
    if (!pc) {
      pc = createPeerConnection(peerId, false);
    }

    if (signal.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => {
          if (signal.sdp.type === 'offer') {
            return pc.createAnswer();
          }
        })
        .then(answer => {
          if (answer) {
            return pc.setLocalDescription(answer);
          }
        })
        .then(() => {
          if (ws && pc.localDescription) {
            ws.send(JSON.stringify({
              type: 'signal',
              targetId: peerId,
              signal: { sdp: pc.localDescription }
            }));
          }
        });
    } else if (signal.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  };

  const createRoom = () => {
    if (ws && userName) {
      ws.send(JSON.stringify({ type: 'createRoom', name: userName }));
    }
  };

  const joinRoom = (code: string) => {
    if (ws && userName && code) {
      ws.send(JSON.stringify({ type: 'joinRoom', roomCode: code, name: userName }));
    }
  };

  const leaveRoom = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    if (ws) {
      ws.send(JSON.stringify({ type: 'leaveRoom' }));
    }
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    setRemoteStreams(new Map());
    setInRoom(false);
    setRoomCode('');
    setUserId('');
    setIsHost(false);
    setUsers([]);
    setDrawHistory([]);
    setMessages([]);
  };

  const kickUser = (targetUserId: string) => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'kickUser', targetUserId }));
    }
  };

  const handleDraw = (data: DrawData) => {
    setDrawHistory(prev => [...prev, data]);
    if (ws) {
      ws.send(JSON.stringify({ type: 'whiteboardDraw', data }));
    }
  };

  const handleClear = () => {
    setDrawHistory([]);
    if (ws) {
      ws.send(JSON.stringify({ type: 'whiteboardClear' }));
    }
  };

  const handleSendMessage = (text: string) => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'chatMessage', text }));
    }
  };

  const toggleMic = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicEnabled(!isMicEnabled);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraEnabled(!isCameraEnabled);
    }
  };

  const shareScreen = async () => {
    try {
      if (isScreenSharing) {
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
        initMedia();
        setIsScreenSharing(false);
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const audioTrack = localStream?.getAudioTracks()[0];
        if (audioTrack) {
          screenStream.addTrack(audioTrack);
        }

        peerConnections.current.forEach(pc => {
          const senders = pc.getSenders();
          senders.forEach(sender => {
            if (sender.track?.kind === 'video') {
              sender.replaceTrack(screenStream.getVideoTracks()[0]);
            }
          });
        });

        setLocalStream(screenStream);
        setIsScreenSharing(true);

        screenStream.getVideoTracks()[0].onended = () => {
          initMedia();
          setIsScreenSharing(false);
        };
      }
    } catch (error) {
      console.error('Error sharing screen:', error);
    }
  };

  const startRecording = async () => {
    if (!localStream) return;

    const stream = new MediaStream();
    localStream.getTracks().forEach(track => stream.addTrack(track));

    mediaRecorder.current = new MediaRecorder(stream);
    recordedChunks.current = [];

    mediaRecorder.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.current.push(event.data);
      }
    };

    mediaRecorder.current.onstop = async () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      formData.append('roomCode', roomCode);
      formData.append('type', 'meeting');

      try {
        await fetch('/api/recordings', {
          method: 'POST',
          body: formData
        });
        alert('录制已保存');
      } catch (error) {
        console.error('Error saving recording:', error);
      }
    };

    mediaRecorder.current.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  const handleNoiseThresholdChange = (value: number) => {
    setNoiseThreshold(value);
    if (audioProcessor.current) {
      audioProcessor.current.setNoiseThreshold(value);
    }
  };

  const handleGainChange = (value: number) => {
    setGain(value);
    if (audioProcessor.current) {
      audioProcessor.current.setGain(value);
    }
  };

  if (!inRoom) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: '#fff',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>实时协作白板</h1>
          <input
            type="text"
            placeholder="请输入你的名字"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px'
            }}
          />
          <button
            onClick={createRoom}
            disabled={!userName}
            style={{
              width: '100%',
              padding: '12px',
              background: '#4CAF50',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              cursor: 'pointer',
              marginBottom: '15px'
            }}
          >
            创建房间
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              ref={roomCodeInputRef}
              type="text"
              placeholder="输入房间号"
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '16px'
              }}
            />
            <button
              onClick={() => joinRoom(roomCodeInputRef.current?.value || '')}
              disabled={!userName}
              style={{
                padding: '12px 24px',
                background: '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              加入
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '15px 20px',
        background: '#2c3e50',
        color: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>房间号: {roomCode}</span>
          {isHost && <span style={{ marginLeft: '15px', color: '#f39c12' }}>(主持人)</span>}
          {!audioProcessorReady && inRoom && (
            <span style={{ marginLeft: '15px', color: '#e74c3c' }}>
              (音频处理器初始化中...)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            style={{
              padding: '8px 16px',
              background: isRecording ? '#e74c3c' : '#9b59b6',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {isRecording ? '⏹️ 停止录制' : '⏺️ 开始录制'}
          </button>
          <button
            onClick={leaveRoom}
            style={{
              padding: '8px 16px',
              background: '#e74c3c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            离开房间
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ width: '250px', flexShrink: 0 }}>
          <UserList users={users} currentUserId={userId} isHost={isHost} onKickUser={kickUser} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#ecf0f1', padding: '10px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setActiveTab('whiteboard')}
              style={{
                padding: '8px 20px',
                background: activeTab === 'whiteboard' ? '#3498db' : '#bdc3c7',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              白板
            </button>
            <button
              onClick={() => setActiveTab('video')}
              style={{
                padding: '8px 20px',
                background: activeTab === 'video' ? '#3498db' : '#bdc3c7',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              视频
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex' }}>
            <div style={{ flex: 1 }}>
              {activeTab === 'whiteboard' ? (
                <Whiteboard
                  drawHistory={drawHistory}
                  onDraw={handleDraw}
                  onClear={handleClear}
                />
              ) : (
                <VideoCall
                  users={users}
                  localStream={localStream}
                  remoteStreams={remoteStreams}
                  onToggleMic={toggleMic}
                  onToggleCamera={toggleCamera}
                  onShareScreen={shareScreen}
                  isMicEnabled={isMicEnabled}
                  isCameraEnabled={isCameraEnabled}
                  isScreenSharing={isScreenSharing}
                />
              )}
            </div>
            <div style={{ width: '300px', flexShrink: 0 }}>
              <Chat messages={messages} onSendMessage={handleSendMessage} />
            </div>
          </div>
        </div>
      </div>

      <div style={{
        padding: '10px 20px',
        background: '#f8f9fa',
        borderTop: '1px solid #ddd',
        display: 'flex',
        gap: '20px',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>降噪阈值:</span>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={noiseThreshold}
            onChange={(e) => handleNoiseThresholdChange(parseFloat(e.target.value))}
          />
          <span>{noiseThreshold.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>增益:</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={gain}
            onChange={(e) => handleGainChange(parseFloat(e.target.value))}
          />
          <span>{gain.toFixed(1)}</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#7f8c8d' }}>
          <span style={{ 
            color: audioLatency < 10 ? '#27ae60' : audioLatency < 50 ? '#f39c12' : '#e74c3c',
            fontWeight: 'bold'
          }}>
            延迟: {audioLatency.toFixed(1)}ms
          </span>
          {' | '}128帧缓冲 | interactive模式
        </div>
      </div>
    </div>
  );
};

export default App;
