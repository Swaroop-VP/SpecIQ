'use client';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";

// Configuration from User
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw_CUMjEssGfOY3C18I-4vyj8G24KsJQsX_l0LcizybDLdxPbzJkzeFWv2b73YOAgHC/exec';
const GOOGLE_CLIENT_ID = '1075256065526-g3bdu2ko7cim95cb973mkrd6agbaaqrp.apps.googleusercontent.com';

export default function Home() {
  const [sessionToken, setSessionToken] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const worker = useRef<Worker | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loadingMessage]);

  useEffect(() => {
    // Check for existing session
    const savedToken = localStorage.getItem('speciq_session_token');
    const savedEmail = localStorage.getItem('speciq_user_email');
    if (savedToken && savedEmail) {
      setSessionToken(savedToken);
      setUserEmail(savedEmail);
      setIsAuthenticated(true);
    }

    fetch('./data.json')
      .then(res => res.json())
      .then(data => setDocuments(data))
      .catch(err => console.error("Could not load data.json", err));

    worker.current = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    
    return () => {
      worker.current?.terminate();
    };
  }, []);

  const handleLogout = (message?: string) => {
    localStorage.removeItem('speciq_session_token');
    localStorage.removeItem('speciq_user_email');
    setIsAuthenticated(false);
    setSessionToken('');
    setUserEmail('');
    if (message) alert(message);
  };

  const handleLoginSuccess = async (credentialResponse: any) => {
    setLoading(true);
    try {
      const decoded = jwtDecode(credentialResponse.credential) as any;
      const email = decoded.email;
      
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login', email: email })
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        const token = result.token;
        localStorage.setItem('speciq_session_token', token);
        localStorage.setItem('speciq_user_email', email);
        setSessionToken(token);
        setUserEmail(email);
        setIsAuthenticated(true);
      } else {
        alert(`Login failed: ${result.message}`);
      }
    } catch (error) {
      alert(`Error during login: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || documents.length === 0 || !worker.current) return;

    const currentQuery = query;
    const newMessages = [...messages, { role: 'user', text: currentQuery } as const];
    setMessages(newMessages);
    setQuery('');
    setLoading(true);
    setLoadingMessage('Initializing...');

    worker.current.postMessage({
      type: 'search',
      query: currentQuery,
      documentChunks: documents
    });

    worker.current.onmessage = async (event) => {
      const { status, message, topChunks, error } = event.data;

      if (status === 'progress') {
        setLoadingMessage(message);
      } else if (status === 'error') {
        console.error(error);
        setMessages([...newMessages, { role: 'assistant', text: `Local Search Error: ${error}` }]);
        setLoading(false);
      } else if (status === 'complete') {
        setLoadingMessage('Thinking...');
        
        try {
          let context = "Here are the most relevant sections of the technical specification documents based on the user's query:\n\n";
          topChunks.forEach((chunk: any) => {
              context += `--- START SECTION (Source: ${chunk.document}) ---\n`;
              context += chunk.text;
              context += `\n--- END SECTION ---\n\n`;
          });

          const prompt = `
You are a highly capable technical assistant. I am providing you with the most relevant extracted text from technical specification documents.
Your task is to answer the user's question accurately using ONLY the information contained within these provided sections.
If the answer is not in the provided sections, state that clearly and do not make up an answer.

CRITICAL INSTRUCTIONS FOR CITATIONS & FORMATTING:
1. You MUST explicitly cite the source document for every claim you make.
2. When citing "Specs2019V1.pdf", write it as "CPWD Specifications Volume 1 2019". When citing "Specs2019V2.pdf", write it as "CPWD Specifications Volume 2 2019".
3. You MUST identify and include the Clause Number and (if available) the Page Number in your citation. You can find page numbers marked as "--- Page X ---" in the text. If the page number is not visible in the text, simply omit it. Do NOT write "Page not specified" or similar phrases.
4. You MUST format all citations in italics (e.g., *(CPWD Specifications Volume 1 2019, Clause 5.4.10.4)*).
5. NEVER use the words "Chunk", "Section", or "Index" in your citations. Write professional, natural references.
6. Format your answers clearly using bullet points to separate different specifications, rules, or pieces of information for better readability.

${context}

USER QUESTION: ${currentQuery}
`;

          const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ 
              action: 'generate', 
              email: userEmail,
              token: sessionToken,
              prompt: prompt 
            })
          });

          const result = await response.json();

          if (result.status === 'success') {
            setMessages([...newMessages, { role: 'assistant', text: result.text }]);
          } else {
            if (result.message && result.message.includes('Session Invalid')) {
               handleLogout(result.message);
            } else {
               setMessages([...newMessages, { role: 'assistant', text: `Error: ${result.message}` }]);
            }
          }
        } catch (err: any) {
          console.error(err);
          setMessages([...newMessages, { role: 'assistant', text: `Network Error: ${err.message}` }]);
        } finally {
          setLoading(false);
          setLoadingMessage('');
        }
      }
    };
  };

  if (!isAuthenticated) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-8">
          <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 flex flex-col items-center">
            <h2 className="text-3xl font-bold mb-2 text-center text-blue-400">SpecIQ</h2>
            <p className="text-gray-400 mb-8 text-sm text-center">
              Please sign in with your authorized Google account to access the specifications assistant.
            </p>
            {loading ? (
              <div className="text-blue-400 animate-pulse">Verifying...</div>
            ) : (
              <GoogleLogin
                onSuccess={handleLoginSuccess}
                onError={() => alert('Login Failed')}
                theme="filled_black"
                shape="pill"
              />
            )}
          </div>
        </div>
      </GoogleOAuthProvider>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-8">
      <div className="max-w-3xl w-full">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            SpecIQ
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{userEmail}</span>
              <button 
                  onClick={() => handleLogout()}
                  className="text-sm text-gray-400 hover:text-white"
              >
                  Sign Out
              </button>
            </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6 mb-6 min-h-[400px] max-h-[600px] overflow-y-auto border border-gray-700">
          {documents.length === 0 && (
             <div className="bg-red-900/50 text-red-200 p-4 rounded-lg mb-4 text-center">
                Warning: No document chunks found. Is the local processing script running?
             </div>
          )}

          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-center px-8 text-lg font-medium">
              Ask any question to CPWD Specifications Volume 1 & Volume 2 (2019). <br/> I will instantly search the clauses and analyze the specifications for you.
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-4 rounded-xl max-w-[85%] ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-gray-700 text-gray-200 rounded-bl-none border border-gray-600'
                  }`}>
                    {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    ) : (
                        <div className="prose prose-invert max-w-none">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                    )}
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 text-gray-400 p-4 rounded-xl rounded-bl-none border border-gray-600 animate-pulse">
                    {loadingMessage}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="E.g. What are the specifications for X?"
            disabled={documents.length === 0 || loading}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-6 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-lg disabled:opacity-50"
          />
          <button 
            type="submit" 
            disabled={loading || !query.trim() || documents.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-8 py-4 rounded-lg font-semibold transition-colors flex items-center justify-center min-w-[100px]"
          >
            Ask
          </button>
        </form>
      </div>
    </main>
  );
}
