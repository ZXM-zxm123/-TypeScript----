import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f5f5' }}>
      <div style={{ padding: '15px', background: '#fff', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>
        聊天
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((msg) => (
        <div key={msg.id} style={{
          background: '#fff',
          padding: '10px 15px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          maxWidth: '80%'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#666', marginBottom: '5px' }}>
            {msg.userName}
          </div>
          <div style={{ wordWrap: 'break-word' }}>
            {msg.text}
          </div>
        </div>
      ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} style={{ padding: '15px', background: '#fff', borderTop: '1px solid #ddd', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="输入消息..."
          style={{ flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
        <button type="submit" style={{ padding: '10px 20px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          发送
        </button>
      </form>
    </div>
  );
};

export default Chat;
