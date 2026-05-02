const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use('/recordings', express.static(path.join(__dirname, 'recordings')));

const upload = multer({ dest: 'recordings/' });

const rooms = new Map();
const users = new Map();

const generateRoomCode = () => {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
};

const broadcastToRoom = (roomCode, message, excludeId = null) => {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.users.forEach((userId) => {
    if (userId !== excludeId) {
      const user = users.get(userId);
      if (user && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(message));
      }
    }
  });
};

const getRoomUsers = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return [];
  
  return Array.from(room.users).map((userId) => {
    const user = users.get(userId);
    return user ? { id: user.id, name: user.name, isHost: user.isHost } : null;
  }).filter(Boolean);
};

wss.on('connection', (ws) => {
  const userId = uuidv4();
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'createRoom': {
          const roomCode = generateRoomCode();
          rooms.set(roomCode, {
            id: roomCode,
            hostId: userId,
            users: new Set([userId]),
            whiteboardHistory: [],
            chatHistory: []
          });
          
          users.set(userId, {
            id: userId,
            name: message.name,
            ws: ws,
            roomCode: roomCode,
            isHost: true
          });
          
          ws.send(JSON.stringify({
            type: 'roomCreated',
            roomCode: roomCode,
            userId: userId,
            isHost: true
          }));
          break;
        }
        
        case 'joinRoom': {
          const room = rooms.get(message.roomCode);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
            return;
          }
          
          room.users.add(userId);
          users.set(userId, {
            id: userId,
            name: message.name,
            ws: ws,
            roomCode: message.roomCode,
            isHost: false
          });
          
          const roomUsers = getRoomUsers(message.roomCode);
          const whiteboardHistory = room.whiteboardHistory;
          const chatHistory = room.chatHistory;
          
          ws.send(JSON.stringify({
            type: 'joinedRoom',
            roomCode: message.roomCode,
            userId: userId,
            isHost: false,
            users: roomUsers,
            whiteboardHistory: whiteboardHistory,
            chatHistory: chatHistory
          }));
          
          broadcastToRoom(message.roomCode, {
            type: 'userJoined',
            user: { id: userId, name: message.name, isHost: false }
          }, userId);
          break;
        }
        
        case 'leaveRoom': {
          const user = users.get(userId);
          if (!user) return;
          
          const room = rooms.get(user.roomCode);
          if (room) {
            room.users.delete(userId);
            
            if (room.users.size === 0) {
              rooms.delete(user.roomCode);
            } else {
              if (room.hostId === userId) {
                const newHostId = Array.from(room.users)[0];
                room.hostId = newHostId;
                const newHost = users.get(newHostId);
                if (newHost) {
                  newHost.isHost = true;
                }
                broadcastToRoom(user.roomCode, {
                  type: 'hostChanged',
                  hostId: newHostId
                });
              }
              
              broadcastToRoom(user.roomCode, {
                type: 'userLeft',
                userId: userId
              });
            }
          }
          
          users.delete(userId);
          break;
        }
        
        case 'kickUser': {
          const user = users.get(userId);
          if (!user || !user.isHost) return;
          
          const targetUser = users.get(message.targetUserId);
          if (!targetUser || targetUser.roomCode !== user.roomCode) return;
          
          if (targetUser.ws.readyState === WebSocket.OPEN) {
            targetUser.ws.send(JSON.stringify({ type: 'kicked' }));
          }
          
          const room = rooms.get(user.roomCode);
          if (room) {
            room.users.delete(message.targetUserId);
            broadcastToRoom(user.roomCode, {
              type: 'userKicked',
              userId: message.targetUserId
            });
          }
          
          users.delete(message.targetUserId);
          break;
        }
        
        case 'signal': {
          const user = users.get(userId);
          if (!user) return;
          
          const targetUser = users.get(message.targetId);
          if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
            targetUser.ws.send(JSON.stringify({
              type: 'signal',
              signal: message.signal,
              fromId: userId
            }));
          }
          break;
        }
        
        case 'whiteboardDraw': {
          const user = users.get(userId);
          if (!user) return;
          
          const room = rooms.get(user.roomCode);
          if (room) {
            room.whiteboardHistory.push(message.data);
            broadcastToRoom(user.roomCode, {
              type: 'whiteboardDraw',
              data: message.data,
              fromId: userId
            }, userId);
          }
          break;
        }
        
        case 'whiteboardClear': {
          const user = users.get(userId);
          if (!user) return;
          
          const room = rooms.get(user.roomCode);
          if (room) {
            room.whiteboardHistory = [];
            broadcastToRoom(user.roomCode, {
              type: 'whiteboardClear',
              fromId: userId
            }, userId);
          }
          break;
        }
        
        case 'chatMessage': {
          const user = users.get(userId);
          if (!user) return;
          
          const room = rooms.get(user.roomCode);
          const chatMsg = {
            id: uuidv4(),
            userId: userId,
            userName: user.name,
            text: message.text,
            timestamp: Date.now()
          };
          
          if (room) {
            room.chatHistory.push(chatMsg);
            broadcastToRoom(user.roomCode, {
              type: 'chatMessage',
              message: chatMsg
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    const user = users.get(userId);
    if (!user) return;
    
    const room = rooms.get(user.roomCode);
    if (room) {
      room.users.delete(userId);
      
      if (room.users.size === 0) {
        rooms.delete(user.roomCode);
      } else {
        if (room.hostId === userId) {
          const newHostId = Array.from(room.users)[0];
          room.hostId = newHostId;
          const newHost = users.get(newHostId);
          if (newHost) {
            newHost.isHost = true;
          }
          broadcastToRoom(user.roomCode, {
            type: 'hostChanged',
            hostId: newHostId
          });
        }
        
        broadcastToRoom(user.roomCode, {
          type: 'userLeft',
          userId: userId
        });
      }
    }
    
    users.delete(userId);
  });
});

app.post('/api/recordings', upload.single('file'), async (req, res) => {
  try {
    const { roomCode, type } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const newPath = path.join(__dirname, 'recordings', `${roomCode}-${Date.now()}-${type}${path.extname(req.file.originalname)}`);
    await fs.move(req.file.path, newPath);
    
    res.json({ success: true, path: `/recordings/${path.basename(newPath)}` });
  } catch (error) {
    console.error('Error saving recording:', error);
    res.status(500).json({ error: 'Failed to save recording' });
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
