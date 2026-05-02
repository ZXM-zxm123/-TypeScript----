import React, { useRef, useEffect, useState } from 'react';
import { User } from '../types';

interface VideoCallProps {
  users: User[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onShareScreen: () => void;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
}

const VideoCall: React.FC<VideoCallProps> = ({ 
  users, 
  localStream, 
  remoteStreams, 
  onToggleMic, 
  onToggleCamera, 
  onShareScreen, 
  isMicEnabled, 
  isCameraEnabled, 
  isScreenSharing 
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1a1a' }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', padding: '10px', overflow: 'auto' }}>
        <div style={{ position: 'relative', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{ position: 'absolute', bottom: '10px', left: '10px', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px' }}>
            我
          </div>
        </div>

        {Array.from(remoteStreams.entries()).map(([userId, stream]) => {
          const user = users.find(u => u.id === userId);
          return (
            <div key={userId} style={{ position: 'relative', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
              <video
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                ref={(el) => {
                  if (el && el.srcObject !== stream) {
                    el.srcObject = stream;
                  }
                }}
              />
              <div style={{ position: 'absolute', bottom: '10px', left: '10px', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px' }}>
                {user?.name || '用户'}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '15px', background: '#2d2d2d', display: 'flex', justifyContent: 'center', gap: '15px' }}>
        <button
          onClick={onToggleMic}
          style={{
            padding: '12px 24px',
            background: isMicEnabled ? '#4CAF50' : '#f44336',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >
          {isMicEnabled ? '🎤' : '🔇'}
        </button>
        <button
          onClick={onToggleCamera}
          style={{
            padding: '12px 24px',
            background: isCameraEnabled ? '#4CAF50' : '#f44336',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >
          {isCameraEnabled ? '📷' : '📷❌'}
        </button>
        <button
          onClick={onShareScreen}
          style={{
            padding: '12px 24px',
            background: isScreenSharing ? '#2196F3' : '#666',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >
          🖥️
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
