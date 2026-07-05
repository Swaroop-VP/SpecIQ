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
  const [dataLoadError, setDataLoadError] = useState(false);
  
  // Settings States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState('base');
  const [fontFamily, setFontFamily] = useState('default');

  useEffect(() => {
    const savedTheme = localStorage.getItem('speciq-theme') || 'dark';
    const savedFontSize = localStorage.getItem('speciq-fontsize') || 'base';
    const savedFontFamily = localStorage.getItem('speciq-fontfamily') || 'default';
    setTheme(savedTheme);
    setFontSize(savedFontSize);
    setFontFamily(savedFontFamily);
  }, []);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('speciq-theme', newTheme);
  };

  const handleFontSizeChange = (newSize: string) => {
    setFontSize(newSize);
    localStorage.setItem('speciq-fontsize', newSize);
  };

  const handleFontFamilyChange = (newFont: string) => {
    setFontFamily(newFont);
    localStorage.setItem('speciq-fontfamily', newFont);
  };

  const getFontFamilyStyle = () => {
    switch (fontFamily) {
      case 'arial': return { fontFamily: 'Arial, sans-serif' };
      case 'times': return { fontFamily: '"Times New Roman", Times, serif' };
      case 'calibri': return { fontFamily: 'Calibri, sans-serif' };
      case 'georgia': return { fontFamily: 'Georgia, serif' };
      default: return {}; // Uses Tailwind default sans
    }
  };

  const getProseSizeClass = () => {
    switch (fontSize) {
      case 'xs': return 'prose-sm text-xs md:text-sm';
      case 'sm': return 'prose-sm md:prose-base';
      case 'base': return 'prose-base md:prose-lg';
      case 'lg': return 'prose-lg md:prose-xl';
      case 'xl': return 'prose-xl md:prose-2xl';
      default: return 'prose-base md:prose-lg';
    }
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'xs': return 'text-xs md:text-sm';
      case 'sm': return 'text-sm md:text-base';
      case 'base': return 'text-base md:text-lg';
      case 'lg': return 'text-lg md:text-xl';
      case 'xl': return 'text-xl md:text-2xl';
      default: return 'text-base md:text-lg';
    }
  };

  
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const worker = useRef<Worker | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [fullScreenMsgIndex, setFullScreenMsgIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loadingMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loadingMessage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreenMsgIndex(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => setDocuments(data))
      .catch(err => {
        console.error("Could not load data.json", err);
        setDataLoadError(true);
      });

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

    let searchQuery = currentQuery;
    let isGenericMode = false;
    let isFollowUpMode = false;

    const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
    
    if (currentQuery.trim().startsWith('@')) {
       isFollowUpMode = true;
       if (lastUserMessage) {
         const cleanCurrentQuery = currentQuery.trim().substring(1).trim();
         searchQuery = lastUserMessage.text + ' ' + cleanCurrentQuery;
       }
    } else if (currentQuery.trim().startsWith('/')) {
       isGenericMode = true;
    }

    if (isGenericMode) {
      setLoadingMessage('Thinking...');
      
      try {
          const historyLength = Math.min(newMessages.length - 1, 4);
          const historySlice = newMessages.slice(-(historyLength + 1), -1);
          const historyText = historySlice.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n\n');

          const genericPrompt = `You are a highly capable general AI assistant. 
Your task is to answer the user's current question using your vast general knowledge.
The user is asking a general question outside the scope of their typical technical specifications database.

RECENT CONVERSATION HISTORY:
${historyText || 'No previous context.'}

USER QUESTION: ${currentQuery}
`;

          const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'generate', email: userEmail, token: sessionToken, prompt: genericPrompt })
          });

          const data = await response.json();
          const isError = data.status === 'error' || data.error;
          const errorText = data.message || data.error || "Unknown Error";

          if (isError) {
             if (errorText.includes('Session Invalid')) { handleLogout(errorText); return; }
             setMessages([...newMessages, { role: 'assistant', text: "*I encountered an issue. Please try again.*" }]);
          } else {
             const answer = data.text || data.result || "*I encountered an issue processing that query.*";
             setMessages([...newMessages, { role: 'assistant', text: answer }]);
          }
      } catch (err: any) {
          console.error(err);
          setMessages([...newMessages, { role: 'assistant', text: "*Please check your internet connection and try again.*" }]);
      } finally {
          setLoading(false);
          setLoadingMessage('');
      }
      return;
    }

    worker.current.postMessage({
      type: 'search',
      query: searchQuery,
      documentChunks: documents
    });

    worker.current.onmessage = async (event) => {
      const { status, message, topChunks, error } = event.data;

      if (status === 'progress') {
        // We'll ignore the detailed technical loading messages and just show a simple user-friendly message
        setLoadingMessage('Searching specifications...');
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

          // Grab the last 4 messages for context (exclude the very last one which is the current query added locally)
          const historyLength = Math.min(newMessages.length - 1, 4);
          const historySlice = newMessages.slice(-(historyLength + 1), -1);
          const historyText = historySlice.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n\n');

          const prompt = `
You are a highly capable technical assistant. I am providing you with the most relevant extracted text from technical specifications, as well as the recent conversation history for context.
Your task is to answer the user's current question accurately using ONLY the information contained within these specifications AND the recent conversation history.

CRITICAL INSTRUCTIONS FOR TONE AND ACCURACY:
1. NEVER use robotic filler phrases like "Based on the provided documents...", "In the provided sections...", or "provided text". Answer directly like an expert.
2. If the answer cannot be found in the specifications or history, you MUST state exactly: "I couldn't find any information about that in the specifications." Do not make up an answer.
3. You MUST extract and reproduce the rules, clauses, and specifications EXACTLY as they are written in the database. Do not summarize or paraphrase technical rules UNLESS the user explicitly asks you to explain or summarize them.

CRITICAL INSTRUCTIONS FOR CITATIONS & FORMATTING:
1. You MUST explicitly cite the source document for every claim you make.
2. When citing "Specs2019V1.pdf", write it as "CPWD Specifications Volume 1 2019". When citing "Specs2019V2.pdf", write it as "CPWD Specifications Volume 2 2019".
3. You MUST identify and include the Clause Number and (if available) the Page Number in your citation. You can find page numbers marked as "--- Page X ---" in the text. If the page number is not visible in the text, simply omit it.
4. You MUST format all citations in italics (e.g., *(CPWD Specifications Volume 1 2019, Clause 5.4.10.4)*).
5. NEVER use the words "Chunk", "Section", or "Index" in your citations.
6. Format your answers clearly using bullet points to separate different specifications, rules, or pieces of information for better readability.

RECENT CONVERSATION HISTORY:
${historyText || 'No previous context.'}

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

            const data = await response.json();
            
            // Check for explicit error formats
            const isError = data.status === 'error' || data.error;
            const errorText = data.message || data.error || "Unknown Error";

            if (isError) {
              if (errorText.includes('Session Invalid')) {
                 handleLogout(errorText);
                 return;
              }
              
              // Default user-friendly error for API crashes / Safety filter blocks
              let errorMsg = "*I encountered an issue processing that query. Please rephrase your question and try again.*";
              
              const retryMatch = errorText.match(/Please retry in ([\d\.]+)s/);
              if (retryMatch) {
                 const seconds = parseFloat(retryMatch[1]).toFixed(1);
                 errorMsg = `*Please retry after ${seconds} seconds.*`;
              } else if (errorText.toLowerCase().includes("quota") || errorText.includes("429")) {
                 errorMsg = "*Please wait a moment and try again.*";
              }
              
              setMessages([...newMessages, { role: 'assistant', text: errorMsg }]);
            } else {
               // Default user-friendly error for blank AI responses
               const answer = data.text || data.result || "*I encountered an issue processing that query. Please rephrase your question and try again.*";
               setMessages([...newMessages, { role: 'assistant', text: answer }]);
            }
        } catch (err: any) {
          console.error(err);
          // User-friendly network error
          setMessages([...newMessages, { role: 'assistant', text: "*Please check your internet connection and try again.*" }]);
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
        <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-8 relative overflow-hidden">
          
          {/* Subtle Ambient Background Glows */}
          <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

          <div className="max-w-md w-full bg-gray-900/60 backdrop-blur-xl p-10 rounded-2xl shadow-2xl border border-gray-700/50 flex flex-col items-center relative z-10 ring-1 ring-white/5">
            <h2 className="text-3xl font-bold mb-2 text-center text-blue-400">
              SpecIQ
            </h2>
            <p className="text-gray-400 mb-8 text-sm text-center leading-relaxed px-2 font-medium">
              Please sign in with your authorized Google account to access the CPWD specifications assistant.
            </p>
            {loading ? (
              <div className="text-blue-400 animate-pulse font-medium tracking-wide flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Authenticating...
              </div>
            ) : (
              <div className="hover:scale-105 transition-transform duration-300">
                <GoogleLogin
                  onSuccess={handleLoginSuccess}
                  onError={() => alert('Login Failed')}
                  theme="filled_black"
                  shape="pill"
                />
              </div>
            )}
          </div>

          <div className="mt-12 max-w-lg w-full text-center space-y-3 px-4 text-xs text-gray-500">
            <p className="leading-relaxed">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="inline-block w-4 h-4 mr-1.5 align-text-bottom">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
              AI responses may contain errors; always verify against official CPWD specifications.
            </p>
            
            <p className="leading-relaxed">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="inline-block w-4 h-4 mr-1.5 align-text-bottom">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              Privacy Note: We only require your email for secure access. Your chats are strictly private and never retained.
            </p>
          </div>
        </div>
      </GoogleOAuthProvider>
    );
  }

  return (
    <main className={`fixed inset-0 flex flex-col items-center pt-16 md:pt-20 p-4 md:p-8 transition-colors ${theme === 'dark' ? 'dark bg-[#0f172a] text-gray-100' : 'bg-gray-50 text-gray-900'}`} style={getFontFamilyStyle()}>
      <div className="flex flex-col w-full max-w-3xl h-full relative">
        <button 
            onClick={() => setIsSettingsOpen(true)}
            className="absolute -top-12 md:-top-16 -right-2 md:-right-6 p-2 md:p-2.5 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-gray-800 transition-all z-30"
            title="Settings"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 md:w-7 md:h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        </button>
        
        {documents.length === 0 && !dataLoadError && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 space-y-4">
            <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <div className="text-gray-500 dark:text-gray-400 text-lg font-medium tracking-wide animate-pulse">
              Loading...
            </div>
          </div>
        )}

        {messages.length === 0 && documents.length > 0 && !dataLoadError && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
             <div className="flex items-center justify-center py-6 text-gray-500 dark:text-gray-400 text-center px-4 md:px-8 text-lg font-medium">
               Ask any query from CPWD Specifications (Volume 1 & 2)
             </div>
          </div>
        )}

        {(messages.length > 0 || dataLoadError) && (
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 md:p-6 overflow-y-auto border border-gray-200 dark:border-gray-700 w-full transition-all duration-300">
            {dataLoadError && (
               <div className="bg-red-900/50 text-red-200 p-4 rounded-lg mb-4 text-center">
                  Network error: Failed to load specifications database. Please check your internet connection.
               </div>
            )}

            {messages.length > 0 && (
              <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    onDoubleClick={() => msg.role === 'assistant' && setFullScreenMsgIndex(i)}
                    className={`p-3 md:p-4 rounded-xl max-w-[95%] md:max-w-[85%] ${getFontSizeClass()} ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-200 dark:border-gray-600 cursor-pointer select-none'
                  }`}>
                    {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    ) : (
                        <div className={`prose max-w-none pointer-events-none ${theme === 'dark' ? 'prose-invert' : ''} ${getProseSizeClass()}`}>
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                    )}
                  </div>
                </div>
              ))}
              
              {loading && loadingMessage && (
                <div className="flex justify-start">
                  <div className={`bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 p-3 md:p-4 rounded-xl rounded-bl-none border border-gray-200 dark:border-gray-600/50 animate-pulse ${getFontSizeClass()}`}>
                    {loadingMessage}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
          </div>
        )}

        <div className="flex-none mt-4 pb-2 md:pb-0 w-full z-10">
          <form onSubmit={handleSearch} className="relative flex items-center w-full">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E.g. What is the minimum curing time for cement plaster?"
              disabled={documents.length === 0 || loading}
              className={`w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-full pl-6 pr-14 py-3 md:py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50 ${getFontSizeClass()}`}
            />
            <button 
              type="submit" 
              disabled={loading || !query.trim() || documents.length === 0}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed p-2 md:p-2.5 rounded-full text-white transition-colors flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
              </svg>
            </button>
          </form>
        </div>

        {fullScreenMsgIndex !== null && (
          <div 
            className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900 overflow-y-auto flex flex-col cursor-pointer select-none"
            onDoubleClick={() => setFullScreenMsgIndex(null)}
          >
            <div className="relative w-full min-h-screen p-4 md:p-8 cursor-auto pointer-events-auto">
              <button 
                onClick={() => setFullScreenMsgIndex(null)}
                className="fixed top-3 right-3 md:top-6 md:right-6 p-2 bg-gray-700/60 hover:bg-gray-600/80 rounded-full text-white shadow-xl backdrop-blur-md transition-colors cursor-pointer z-50"
                title="Close (Esc)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className={`prose max-w-none pt-8 md:pt-4 ${theme === 'dark' ? 'prose-invert' : ''} ${getProseSizeClass()}`}>
                <ReactMarkdown>{messages[fullScreenMsgIndex]?.text || ''}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Settings Drawer */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#1a202c] shadow-2xl border-l border-gray-200 dark:border-gray-800 z-50 transform transition-transform duration-300 ease-in-out ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Settings</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-8">
              {/* Theme Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Theme</label>
                <div className="flex rounded-lg shadow-sm">
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-l-lg border ${theme === 'dark' ? 'bg-blue-50 dark:bg-[#2c3e50] text-blue-700 dark:text-blue-100 border-blue-500 z-10' : 'bg-white dark:bg-[#2d3748] text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-r-lg border-t border-b border-r ${theme === 'light' ? 'bg-blue-50 dark:bg-[#2c3e50] text-blue-700 dark:text-blue-100 border-blue-500 border-l z-10' : 'bg-white dark:bg-[#2d3748] text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 border-l-0'}`}
                  >
                    Light
                  </button>
                </div>
              </div>

              {/* Font Size Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Font Size</label>
                <div className="flex flex-nowrap gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {['xs', 'sm', 'base', 'lg', 'xl'].map((size) => {
                    const textClass: Record<string, string> = { 'xs': 'text-xs', 'sm': 'text-sm', 'base': 'text-base', 'lg': 'text-lg', 'xl': 'text-xl' };
                    return (
                      <button
                        key={size}
                        onClick={() => handleFontSizeChange(size)}
                        className={`flex-1 py-2 px-1 flex items-center justify-center font-medium rounded-lg transition-all ${fontSize === size ? 'bg-white dark:bg-[#2c3e50] text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-gray-600' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'}`}
                      >
                        <span className={textClass[size]}>A</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Font Family Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Font Family</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'default', label: 'Default', style: {} },
                    { id: 'arial', label: 'Arial', style: { fontFamily: 'Arial, sans-serif' } },
                    { id: 'calibri', label: 'Calibri', style: { fontFamily: 'Calibri, sans-serif' } },
                    { id: 'times', label: 'Times New Roman', style: { fontFamily: '"Times New Roman", Times, serif' } },
                    { id: 'georgia', label: 'Georgia', style: { fontFamily: 'Georgia, serif' } }
                  ].map((font) => (
                    <button
                      key={font.id}
                      onClick={() => handleFontFamilyChange(font.id)}
                      style={font.style}
                      className={`py-1.5 px-3 text-sm rounded-full border transition-all ${fontFamily === font.id ? 'bg-blue-50 dark:bg-[#2c3e50] text-blue-700 dark:text-blue-100 border-blue-500 shadow-sm' : 'bg-white dark:bg-[#2d3748] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Commands Help Section */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                <label className="block text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2">COMMANDS</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Start your query with:</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex-none flex items-center justify-center w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono font-bold text-gray-700 dark:text-gray-300 shadow-sm">@</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">- To add the query to your previous few queries</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-none flex items-center justify-center w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono font-bold text-gray-700 dark:text-gray-300 shadow-sm">/</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">- To ask any general question out of CPWD Specifications</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 dark:border-gray-800 space-y-3">
              <div className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 truncate px-2">{userEmail}</div>
              <button 
                onClick={() => {
                  setIsSettingsOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center justify-center gap-2 bg-white dark:bg-[#2d3748] hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-medium py-3 px-4 rounded-lg shadow-sm border border-red-200 dark:border-red-900/50 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
        
        {/* Backdrop */}
        {isSettingsOpen && (
          <div 
            className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40"
            onClick={() => setIsSettingsOpen(false)}
          ></div>
        )}
      </div>
    </main>

  );
}
