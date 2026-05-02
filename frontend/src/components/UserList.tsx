import React from 'react';
import { User } from '../types';

interface UserListProps {
  users: User[];
  currentUserId: string;
  isHost: boolean;
  onKickUser: (userId: string) => void;
}

const UserList: React.FC<UserListProps> = ({ users, currentUserId, isHost, onKickUser }) => {
  return (
    <div style={{ height: '100%', background: '#f5f5f5', borderRight: '1px solid #ddd' }}>
      <div style={{ padding: '15px', background: '#fff', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>
        用户列表 ({users.length})
      </div>
      <div style={{ padding: '10px' }}>
        {users.map((user) => (
          <div key={user.id} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px',
            background: user.id === currentUserId ? '#e3f2fd' : '#fff',
            borderRadius: '8px',
            marginBottom: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div>
              <span style={{ fontWeight: 'bold' }}>{user.name}</span>
              {user.isHost && <span style={{ marginLeft: '8px', color: '#ff9800', fontSize: '12px' }}>(主持人)</span>}
              {user.id === currentUserId && <span style={{ marginLeft: '8px', color: '#4CAF50', fontSize: '12px' }}>(我)</span>}
            </div>
            {isHost && user.id !== currentUserId && (
              <button
                onClick={() => onKickUser(user.id)}
                style={{
                  padding: '5px 10px',
                  background: '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                踢出
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserList;
