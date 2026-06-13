import React, { useState, useRef, useEffect } from 'react';
import { Send, ArrowUp } from 'lucide-react';
import { chatStream } from '../utils/api';

export default function ChatPanel({ invoiceContext }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const messagesEndRef = useRef(null);

  const suggestionChips = [
    "What is the invoice amount?",
    "Is this invoice risky?",
    "What vendor issued this invoice?",
    "Does the math check out?"
  ];

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSendMessage = async (text) => {
    if (!text.trim() || loading) return;

    const userMsg = text.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    setStreamingText('');

    try {
      await chatStream(
        userMsg,
        invoiceContext,
        (chunk) => {
          setStreamingText(prev => prev + chunk);
        },
        () => {
          // Streaming completed successfully
          setMessages(prev => {
            const finalAssistantText = streamingText || '';
            // Make sure we take the latest streamingText state
            // But state inside callback can be stale.
            // The cleanest way is to use functional state updates or let streamingText flush.
            return prev;
          });
          setLoading(false);
        },
        (error) => {
          console.error(error);
          setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${error.message}` }]);
          setLoading(false);
        }
      );
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
      setLoading(false);
    }
  };

  // Sync streaming text to message thread when completed
  useEffect(() => {
    if (!loading && streamingText) {
      setMessages(prev => [...prev, { role: 'assistant', text: streamingText }]);
      setStreamingText('');
    }
  }, [loading]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800/80">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/20">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-zinc-100 font-semibold text-sm">AI Invoice Assistant</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
          claude-3.5-sonnet
        </span>
      </div>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400">
              ✨
            </div>
            <div>
              <h3 className="text-zinc-200 font-semibold text-sm">Ask about this invoice</h3>
              <p className="text-zinc-500 text-xs mt-1">
                The AI assistant has complete access to the extracted fields, vendor history, and risk triggers.
              </p>
            </div>
            
            {/* Suggestions */}
            <div className="grid grid-cols-1 gap-2 w-full pt-2">
              {suggestionChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(chip)}
                  className="text-left text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-indigo-400 px-4 py-2.5 rounded-xl transition-all duration-150"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-zinc-900 text-zinc-100 border border-zinc-800/80 rounded-bl-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Live streaming text bubble */}
        {loading && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-zinc-900 text-zinc-100 border border-zinc-800/80 rounded-bl-sm">
              {streamingText}
            </div>
          </div>
        )}

        {/* Floating spinner while waiting for first token */}
        {loading && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl px-5 py-3.5 flex items-center gap-1.5 rounded-bl-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Row */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(input);
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={loading}
            className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 focus:border-indigo-500 text-zinc-100 text-sm rounded-xl pl-4 pr-12 py-3.5 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2.5 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
