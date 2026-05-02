import React, { useRef, useEffect, useState } from 'react';
import { DrawData } from '../types';

interface WhiteboardProps {
  drawHistory: DrawData[];
  onDraw: (data: DrawData) => void;
  onClear: () => void;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ drawHistory, onDraw, onClear }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text'>('pen');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(5);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [tempCanvas, setTempCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawHistory.forEach(data => drawShape(ctx, data));
  }, [drawHistory]);

  const drawShape = (ctx: CanvasRenderingContext2D, data: DrawData) => {
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (data.type) {
      case 'pen':
      case 'eraser':
        ctx.globalCompositeOperation = data.type === 'eraser' ? 'destination-out' : 'source-over';
        ctx.beginPath();
        ctx.arc(data.x, data.y, data.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = data.type === 'eraser' ? 'rgba(0,0,0,1)' : data.color;
        ctx.fill();
        break;
      case 'line':
        if (data.x2 !== undefined && data.y2 !== undefined) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.beginPath();
          ctx.moveTo(data.x, data.y);
          ctx.lineTo(data.x2, data.y2);
          ctx.stroke();
        }
        break;
      case 'rectangle':
        if (data.x2 !== undefined && data.y2 !== undefined) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeRect(data.x, data.y, data.x2 - data.x, data.y2 - data.y);
        }
        break;
      case 'circle':
        if (data.x2 !== undefined && data.y2 !== undefined) {
          ctx.globalCompositeOperation = 'source-over';
          const radius = Math.sqrt(Math.pow(data.x2 - data.x, 2) + Math.pow(data.y2 - data.y, 2));
          ctx.beginPath();
          ctx.arc(data.x, data.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case 'text':
        if (data.text) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = data.color;
          ctx.font = `${data.lineWidth * 3}px Arial`;
          ctx.fillText(data.text, data.x, data.y);
        }
        break;
    }
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);

    if (tool === 'text') {
      const text = prompt('请输入文字:');
      if (text) {
        const data: DrawData = {
          type: 'text',
          x: pos.x,
          y: pos.y,
          color,
          lineWidth,
          text
        };
        onDraw(data);
      }
      setIsDrawing(false);
      return;
    }

    if (tool === 'pen' || tool === 'eraser') {
      const data: DrawData = {
        type: tool,
        x: pos.x,
        y: pos.y,
        color,
        lineWidth
      };
      onDraw(data);
    } else {
      const canvas = canvasRef.current;
      if (canvas) {
        const temp = document.createElement('canvas');
        temp.width = canvas.width;
        temp.height = canvas.height;
        const tempCtx = temp.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(canvas, 0, 0);
        }
        setTempCanvas(temp);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);

    if (tool === 'pen' || tool === 'eraser') {
      const data: DrawData = {
        type: tool,
        x: pos.x,
        y: pos.y,
        color,
        lineWidth
      };
      onDraw(data);
    } else if (tempCanvas) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(tempCanvas, 0, 0);
      drawShape(ctx, {
        type: tool,
        x: startPos.x,
        y: startPos.y,
        x2: pos.x,
        y2: pos.y,
        color,
        lineWidth
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);

    if (tool !== 'pen' && tool !== 'eraser' && tool !== 'text') {
      const data: DrawData = {
        type: tool,
        x: startPos.x,
        y: startPos.y,
        x2: pos.x,
        y2: pos.y,
        color,
        lineWidth
      };
      onDraw(data);
    }

    setIsDrawing(false);
    setTempCanvas(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px', background: '#f0f0f0', borderBottom: '1px solid #ccc', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <select value={tool} onChange={(e) => setTool(e.target.value as any)}>
          <option value="pen">画笔</option>
          <option value="eraser">橡皮擦</option>
          <option value="line">直线</option>
          <option value="rectangle">矩形</option>
          <option value="circle">圆形</option>
          <option value="text">文字</option>
        </select>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input type="range" min="1" max="50" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} />
        <button onClick={onClear}>清空画布</button>
      </div>
      <canvas
        ref={canvasRef}
        width={1200}
        height={700}
        style={{ flex: 1, cursor: 'crosshair', background: '#fff' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
};

export default Whiteboard;
