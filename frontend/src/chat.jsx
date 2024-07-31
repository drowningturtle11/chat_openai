import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [userId] = useState(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      return storedUserId;
    } else {
      const newUserId = uuidv4();
      localStorage.setItem('userId', newUserId);
      return newUserId;
    }
  });
  const [isTyping, setIsTyping] = useState(false);
  const chatWindowRef = useRef(null);

  useEffect(() => {
    try {
      const storedMessages = localStorage.getItem('messages');
      if (storedMessages) {
        setMessages(JSON.parse(storedMessages));
      }
    } catch (error) {
      console.error('Error parsing stored messages:', error);
      localStorage.removeItem('messages'); // Clear invalid data
    }

    const fetchPreviousMessages = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/chat/history`, {
          params: { userId },
        });
        setMessages(response.data.messages);
        localStorage.setItem('messages', JSON.stringify(response.data.messages));
      } catch (error) {
        console.error('Error fetching previous messages:', error);
      }
    };

    fetchPreviousMessages();
  }, [userId]);

  useEffect(() => {
    const chatWindow = chatWindowRef.current;
    if (chatWindow) {
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }
    localStorage.setItem('messages', JSON.stringify(messages));
  }, [messages]);

  const sendMessage = async () => {
    if (input.trim()) {
      const newMessage = { role: 'user', content: input };
      setMessages((prevMessages) => [...prevMessages, newMessage]);
      setInput('');
      setIsTyping(true);

      try {
        const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/chat`, {
          userId,
          message: input,
        });

        const assistantMessage = {
          role: 'assistant',
          content: response.data.reply,
        };

        setMessages((prevMessages) => [...prevMessages, assistantMessage]);
      } catch (error) {
        console.error('Error sending message:', error);
      } finally {
        setIsTyping(false);
      }
    }
  };

  const clearChatHistory = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/chat/clear`, { userId });
      setMessages([]);
      localStorage.removeItem('messages');
    } catch (error) {
      console.error('Error clearing chat history:', error);
    }
  };

  return (
    <div className="chat-container">
      <div className="header">
        <h1>Financial Assistant</h1>
      </div>
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {isTyping && <div className="message assistant">Assistant is typing...</div>}
      </div>
      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
        <button onClick={clearChatHistory}>Clear Chat</button>
      </div>
    </div>
  );
};

export default Chat;
