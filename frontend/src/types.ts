export interface User {
  id: string;
  name: string;
  isHost: boolean;
}

export interface DrawData {
  type: 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  color: string;
  lineWidth: number;
  text?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

export interface PeerConnection {
  id: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}
