// src/components/Explore/ExploreView.tsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { SearchBar } from '../shared/SearchBar';
import { GPTService } from '../../services/gptService';
import { MarkdownComponentProps } from '../../types';
import { RelatedTopics } from './RelatedTopics';
import { RelatedQuestions } from './RelatedQuestions';
import { LoadingAnimation } from '../shared/LoadingAnimation';
import { UserContext } from '../../types';

interface Message {
  type: 'user' | 'ai';
  content?: string;
  topics?: Array<{
    topic: string;
    type: string;
    reason: string;
  }>;
  questions?: Array<{
    question: string;
    type: string;
    context: string;
  }>;
}

interface StreamChunk {
  text?: string;
  topics?: Array<{
    topic: string;
    type: string;
    reason: string;
  }>;
  questions?: Array<{
    question: string;
    type: string;
    context: string;
  }>;
}

interface ExploreViewProps {
  initialQuery?: string;
  onError: (message: string) => void;
  onRelatedQueryClick?: (query: string) => void;
  userContext: UserContext;
}

const MarkdownComponents: Record<string, React.FC<MarkdownComponentProps>> = {
  h1: ({ children, ...props }) => (
    <h1 className="text-xl sm:text-2xl font-bold text-gray-100 mt-4 mb-2" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-lg sm:text-xl font-semibold text-gray-100 mt-3 mb-2" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-base sm:text-lg font-medium text-gray-200 mt-2 mb-1" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="text-sm sm:text-base text-gray-300 my-1.5 leading-relaxed
      break-words" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-inside my-2 text-gray-300" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-inside my-2 text-gray-300" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="my-1 text-gray-300" {...props}>
      {children}
    </li>
  ),
  code: ({ children, inline, ...props }) => (
    inline ?
      <code className="bg-gray-700 px-1 rounded text-xs sm:text-sm" {...props}>{children}</code> :
      <code className="block bg-gray-700 p-2 rounded my-2 text-xs sm:text-sm overflow-x-auto" {...props}>
        {children}
      </code>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-4 border-gray-500 pl-4 my-2 text-gray-400 italic" {...props}>
      {children}
    </blockquote>
  ),
};

export const RelatedQueries: React.FC<{
  queries: Array<{
    query: string;
    type: string;
    context: string;
  }>;
  onQueryClick: (query: string) => void;
}> = ({ queries, onQueryClick }) => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'curiosity': return 'bg-blue-500/20 text-blue-400';
      case 'mechanism': return 'bg-green-500/20 text-green-400';
      case 'causality': return 'bg-yellow-500/20 text-yellow-400';
      case 'innovation': return 'bg-purple-500/20 text-purple-400';
      case 'insight': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="mt-6 pt-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3 px-2">
        Follow-up Questions
      </h3>
      <div className="rounded-lg bg-gray-800/50 divide-y divide-gray-700/50">
        {queries.map((query, index) => (
          <button
            key={index}
            onClick={() => onQueryClick(query.query)}
            className="w-full text-left hover:bg-gray-700/30 transition-all
              duration-200 group first:rounded-t-lg last:rounded-b-lg"
          >
            <div className="py-3 px-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-200 group-hover:text-primary
                      transition-colors line-clamp-2">
                      {query.query}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full
                      font-medium ${getTypeColor(query.type)}`}>
                      {query.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-1">
                    {query.context}
                  </p>
                </div>
                <span className="text-gray-400 group-hover:text-primary
                  transition-colors text-lg">
                  →
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export const ExploreView: React.FC<ExploreViewProps> = ({
  initialQuery,
  onError,
  onRelatedQueryClick,
  userContext
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showInitialSearch, setShowInitialSearch] = useState(!initialQuery);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const gptService = useMemo(() => new GPTService(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isFirstMessage = useRef(true);

  // Add a ref for the messages container
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFirstMessage.current && messages.length > 0) { // Condition to prevent initial scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    if (messages.length > 0) {
      isFirstMessage.current = false; // After first message set ref to false
    }
  }, [messages]);

  // Add effect to listen for reset (no changes needed)
  useEffect(() => {
    const handleReset = () => {
      setMessages([]);
      setShowInitialSearch(true);
    };

    window.addEventListener('resetExplore', handleReset);
    return () => window.removeEventListener('resetExplore', handleReset);
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    try {
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }

      setIsLoading(true);

      setMessages(prevMessages => [...prevMessages, { type: 'user', content: query }]);
      setMessages(prevMessages => [...prevMessages, { type: 'ai', content: '' }]);
      isFirstMessage.current = true;

      setShowInitialSearch(false);

      await gptService.streamExploreContent(
        query,
        userContext,
        messages as import("../../types/index").Message[], 
        (chunk: StreamChunk) => {
          setMessages(prevMessages => {
            const lastMessageIndex = prevMessages.length - 1;
            if (lastMessageIndex >= 0 && prevMessages[lastMessageIndex].type === 'ai') {
              const updatedMessages = [...prevMessages];
              updatedMessages[lastMessageIndex] = {
                ...updatedMessages[lastMessageIndex],
                content: (updatedMessages[lastMessageIndex].content || '') + (chunk.text || ''),
                topics: chunk.topics || updatedMessages[lastMessageIndex].topics,
                questions: chunk.questions || updatedMessages[lastMessageIndex].questions
              };
              return updatedMessages;
            } else {
              return [...prevMessages, {
                type: 'ai',
                content: chunk.text,
                topics: chunk.topics,
                questions: chunk.questions
              }];
            }
          });
        }
      );
    } catch (error) {
      console.error('Search error:', error);
      onError(error instanceof Error ? error.message : 'Failed to load content');
    } finally {
      setIsLoading(false);
    }
  }, [gptService, onError, userContext, messages]); // messages added to dependency array

  const handleRelatedQueryClick = useCallback((query: string) => {
    if (onRelatedQueryClick) {
      onRelatedQueryClick(query);
    }
    handleSearch(query);
  }, [handleSearch, onRelatedQueryClick]);

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery, handleSearch]);

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] flex flex-col" ref={containerRef}>
      {showInitialSearch ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4">
            What do you want to explore?
          </h1>

          <div className="w-full max-w-xl mx-auto">
            <SearchBar
              onSearch={handleSearch}
              placeholder="Enter what you want to explore..."
              centered={true}
              className="bg-gray-900/80"
            />

            <p className="text-sm text-gray-400 text-center mt-1">Press Enter to search</p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <span className="text-sm text-gray-400">Try:</span>
              <button
                onClick={() => handleSearch("Quantum Physics")}
                className="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30
                  border border-purple-500/30 transition-colors text-xs sm:text-sm text-purple-300"
              >
                ⚛️ Quantum Physics
              </button>
              <button
                onClick={() => handleSearch("Machine Learning")}
                className="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30
                  border border-blue-500/30 transition-colors text-xs sm:text-sm text-blue-300"
              >
                🤖 Machine Learning
              </button>
              <button
                onClick={() => handleSearch("World History")}
                className="px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30
                  border border-green-500/30 transition-colors text-xs sm:text-sm text-green-300"
              >
                🌍 World History
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div ref={messagesContainerRef} className="relative flex flex-col w-full">
          <div className="space-y-2 pb-16 overflow-y-auto"> {/* Added overflow-y-auto for scrollable chat history */}
        {messages.map((message, index) => (
              <div
                key={index}
                className="px-2 sm:px-4 w-full mx-auto"
              >
                <div className="max-w-3xl mx-auto">
                  {message.type === 'user' ? (
                    <div className="w-full">
                      <div className="flex-1 text-base sm:text-lg font-semibold text-gray-100">
                      {message.content}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="flex-1 min-w-0">
                        {!message.content && isLoading ? (
                          <div className="flex items-center space-x-2 py-2">
                            <LoadingAnimation />
                            <span className="text-sm text-gray-400">Thinking...</span>
                          </div>
                        ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                            components={{
                              ...MarkdownComponents,
                              p: ({ children }) => (
                                <p className="text-sm sm:text-base text-gray-300 my-1.5 leading-relaxed
                                  break-words">
                                  {children}
                                </p>
                              ),
                            }}
                            className="whitespace-pre-wrap break-words space-y-1.5"
                          >
                            {message.content || ''}
                      </ReactMarkdown>
                        )}

                        {message.topics && message.topics.length > 0 && (
                          <div className="mt-3">
                            <RelatedTopics
                              topics={message.topics}
                              onTopicClick={handleRelatedQueryClick}
                            />
                          </div>
                        )}

                        {message.questions && message.questions.length > 0 && (
                          <div className="mt-3">
                            <RelatedQuestions
                              questions={message.questions}
                              onQuestionClick={handleRelatedQueryClick}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div
              ref={messagesEndRef}
              className="h-8 w-full"
              aria-hidden="true"
            />
          </div>

          <div className="fixed bottom-12 left-0 right-0 bg-gradient-to-t from-background
            via-background to-transparent pb-1 pt-2 z-50">
            <div className="w-full px-2 sm:px-4 max-w-3xl mx-auto">
              <SearchBar
                onSearch={handleSearch}
                placeholder="Ask a follow-up question..."
                centered={false}
                className="bg-gray-900/80 backdrop-blur-lg border border-gray-700/50 h-10"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ExploreView.displayName = 'ExploreView';

// // src/components/Explore/ExploreView.tsx
// import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';
// import remarkMath from 'remark-math';
// import rehypeKatex from 'rehype-katex';
// import { SearchBar } from '../shared/SearchBar';
// import { GPTService } from '../../services/gptService';
// import { MarkdownComponentProps } from '../../types';
// import { RelatedTopics } from './RelatedTopics';
// import { RelatedQuestions } from './RelatedQuestions';
// import { LoadingAnimation } from '../shared/LoadingAnimation';
// import { UserContext } from '../../types';

// interface Message {
//   type: 'user' | 'ai';
//   content?: string;
//   topics?: Array<{
//     topic: string;
//     type: string;
//     reason: string;
//   }>;
//   questions?: Array<{
//     question: string;
//     type: string;
//     context: string;
//   }>;
// }

// interface StreamChunk {
//   text?: string;
//   topics?: Array<{
//     topic: string;
//     type: string;
//     reason: string;
//   }>;
//   questions?: Array<{
//     question: string;
//     type: string;
//     context: string;
//   }>;
// }

// interface ExploreViewProps {
//   initialQuery?: string;
//   onError: (message: string) => void;
//   onRelatedQueryClick?: (query: string) => void;
//   userContext: UserContext;
// }

// const MarkdownComponents: Record<string, React.FC<MarkdownComponentProps>> = {
//   h1: ({ children, ...props }) => (
//     <h1 className="text-xl sm:text-2xl font-bold text-gray-100 mt-4 mb-2" {...props}>
//       {children}
//     </h1>
//   ),
//   h2: ({ children, ...props }) => (
//     <h2 className="text-lg sm:text-xl font-semibold text-gray-100 mt-3 mb-2" {...props}>
//       {children}
//     </h2>
//   ),
//   h3: ({ children, ...props }) => (
//     <h3 className="text-base sm:text-lg font-medium text-gray-200 mt-2 mb-1" {...props}>
//       {children}
//     </h3>
//   ),
//   p: ({ children, ...props }) => (
//     <p className="text-sm sm:text-base text-gray-300 my-1.5 leading-relaxed 
//       break-words" {...props}>
//       {children}
//     </p>
//   ),
//   ul: ({ children, ...props }) => (
//     <ul className="list-disc list-inside my-2 text-gray-300" {...props}>
//       {children}
//     </ul>
//   ),
//   ol: ({ children, ...props }) => (
//     <ol className="list-decimal list-inside my-2 text-gray-300" {...props}>
//       {children}
//     </ol>
//   ),
//   li: ({ children, ...props }) => (
//     <li className="my-1 text-gray-300" {...props}>
//       {children}
//     </li>
//   ),
//   code: ({ children, inline, ...props }) => (
//     inline ? 
//       <code className="bg-gray-700 px-1 rounded text-xs sm:text-sm" {...props}>{children}</code> :
//       <code className="block bg-gray-700 p-2 rounded my-2 text-xs sm:text-sm overflow-x-auto" {...props}>
//         {children}
//       </code>
//   ),
//   blockquote: ({ children, ...props }) => (
//     <blockquote className="border-l-4 border-gray-500 pl-4 my-2 text-gray-400 italic" {...props}>
//       {children}
//     </blockquote>
//   ),
// };

// export const RelatedQueries: React.FC<{
//   queries: Array<{
//     query: string;
//     type: string;
//     context: string;
//   }>;
//   onQueryClick: (query: string) => void;
// }> = ({ queries, onQueryClick }) => {
//   const getTypeColor = (type: string) => {
//     switch (type) {
//       case 'curiosity': return 'bg-blue-500/20 text-blue-400';
//       case 'mechanism': return 'bg-green-500/20 text-green-400';
//       case 'causality': return 'bg-yellow-500/20 text-yellow-400';
//       case 'innovation': return 'bg-purple-500/20 text-purple-400';
//       case 'insight': return 'bg-red-500/20 text-red-400';
//       default: return 'bg-gray-500/20 text-gray-400';
//     }
//   };

//   return (
//     <div className="mt-6 pt-4">
//       <h3 className="text-sm font-medium text-gray-300 mb-3 px-2">
//         Follow-up Questions
//       </h3>
//       <div className="rounded-lg bg-gray-800/50 divide-y divide-gray-700/50">
//         {queries.map((query, index) => (
//           <button
//             key={index}
//             onClick={() => onQueryClick(query.query)}
//             className="w-full text-left hover:bg-gray-700/30 transition-all 
//               duration-200 group first:rounded-t-lg last:rounded-b-lg"
//           >
//             <div className="py-3 px-4">
//               <div className="flex items-start gap-3">
//                 <div className="flex-1 min-w-0">
//                   <div className="flex items-center gap-2 mb-1">
//                     <span className="text-sm text-gray-200 group-hover:text-primary 
//                       transition-colors line-clamp-2">
//                       {query.query}
//                     </span>
//                     <span className={`text-xs px-2 py-0.5 rounded-full 
//                       font-medium ${getTypeColor(query.type)}`}>
//                       {query.type}
//                     </span>
//                   </div>
//                   <p className="text-xs text-gray-400 line-clamp-1">
//                     {query.context}
//                   </p>
//                 </div>
//                 <span className="text-gray-400 group-hover:text-primary 
//                   transition-colors text-lg">
//                   →
//                 </span>
//               </div>
//             </div>
//           </button>
//         ))}
//       </div>
//     </div>
//   );
// };

// export const ExploreView: React.FC<ExploreViewProps> = ({ 
//   initialQuery, 
//   onError,
//   onRelatedQueryClick,
//   userContext
// }) => {
//   const [messages, setMessages] = useState<Message[]>([]);
//   const [showInitialSearch, setShowInitialSearch] = useState(!initialQuery);
//   const messagesEndRef = useRef<HTMLDivElement>(null);
//   const gptService = useMemo(() => new GPTService(), []);
//   const containerRef = useRef<HTMLDivElement>(null);
//   const [isLoading, setIsLoading] = useState(false);

//   // Add a ref for the messages container
//   const messagesContainerRef = useRef<HTMLDivElement>(null);

//   // More reliable scroll to top function
//   const scrollToTop = useCallback(() => {
//     // First try window scroll
//     window.scrollTo({ top: 0, behavior: 'smooth' });
    
//     // Also try scrolling container if it exists
//     if (messagesContainerRef.current) {
//       messagesContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
//     }

//     // Fallback with setTimeout to ensure scroll happens after render
//     setTimeout(() => {
//       window.scrollTo({ top: 0, behavior: 'instant' });
//     }, 100);
//   }, []);

//   // Call scroll on any message change
//   useEffect(() => {
//     if (messages.length > 0) {
//       scrollToTop();
//     }
//   }, [messages.length, scrollToTop]);

//   // Add effect to listen for reset
//   useEffect(() => {
//     const handleReset = () => {
//       setMessages([]);
//       setShowInitialSearch(true);
//     };

//     window.addEventListener('resetExplore', handleReset);
//     return () => window.removeEventListener('resetExplore', handleReset);
//   }, []);

//   const handleSearch = useCallback(async (query: string) => {
//     try {
//       if (window.navigator.vibrate) {
//         window.navigator.vibrate(50);
//       }

//       // Scroll before starting the search
//       scrollToTop();
      
//       setIsLoading(true);
//       setMessages([
//         { type: 'user', content: query },
//         { type: 'ai', content: '' }
//       ]);

//       setShowInitialSearch(false);

//       await gptService.streamExploreContent(
//         query,
//         userContext,
//         (chunk: StreamChunk) => {
//           setMessages([
//             { type: 'user', content: query },
//             {
//               type: 'ai',
//               content: chunk.text,
//               topics: chunk.topics,
//               questions: chunk.questions
//             }
//           ]);
//         }
//       );
//     } catch (error) {
//       console.error('Search error:', error);
//       onError(error instanceof Error ? error.message : 'Failed to load content');
//     } finally {
//       setIsLoading(false);
//     }
//   }, [gptService, onError, userContext, scrollToTop]);

//   const handleRelatedQueryClick = useCallback((query: string) => {
//     // Scroll before handling the click
//     scrollToTop();
    
//     if (onRelatedQueryClick) {
//       onRelatedQueryClick(query);
//     }
//     handleSearch(query);
//   }, [handleSearch, onRelatedQueryClick, scrollToTop]);

//   useEffect(() => {
//     if (initialQuery) {
//       handleSearch(initialQuery);
//     }
//   }, [initialQuery, handleSearch]);

//   return (
//     <div className="w-full min-h-[calc(100vh-4rem)] flex flex-col" ref={containerRef}>
//       {showInitialSearch ? (
//         <div className="flex-1 flex flex-col items-center justify-center px-4">
//           <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4">
//             What do you want to explore?
//           </h1>
          
//           <div className="w-full max-w-xl mx-auto">
//             <SearchBar
//               onSearch={handleSearch}
//               placeholder="Enter what you want to explore..."
//               centered={true}
//               className="bg-gray-900/80"
//             />
            
//             <p className="text-sm text-gray-400 text-center mt-1">Press Enter to search</p>
            
//             <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
//               <span className="text-sm text-gray-400">Try:</span>
//               <button
//                 onClick={() => handleSearch("Quantum Physics")}
//                 className="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 
//                   border border-purple-500/30 transition-colors text-xs sm:text-sm text-purple-300"
//               >
//                 ⚛️ Quantum Physics
//               </button>
//               <button
//                 onClick={() => handleSearch("Machine Learning")}
//                 className="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 
//                   border border-blue-500/30 transition-colors text-xs sm:text-sm text-blue-300"
//               >
//                 🤖 Machine Learning
//               </button>
//               <button
//                 onClick={() => handleSearch("World History")}
//                 className="px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 
//                   border border-green-500/30 transition-colors text-xs sm:text-sm text-green-300"
//               >
//                 🌍 World History
//               </button>
//             </div>
//           </div>
//         </div>
//       ) : (
//         <div ref={messagesContainerRef} className="relative flex flex-col w-full">
//           <div className="space-y-2 pb-16">
//         {messages.map((message, index) => (
//               <div 
//                 key={index} 
//                 className="px-2 sm:px-4 w-full mx-auto"
//               >
//                 <div className="max-w-3xl mx-auto">
//                   {message.type === 'user' ? (
//                     <div className="w-full">
//                       <div className="flex-1 text-base sm:text-lg font-semibold text-gray-100">
//                       {message.content}
//                       </div>
//                     </div>
//                   ) : (
//                     <div className="w-full">
//                       <div className="flex-1 min-w-0">
//                         {!message.content && isLoading ? (
//                           <div className="flex items-center space-x-2 py-2">
//                             <LoadingAnimation />
//                             <span className="text-sm text-gray-400">Thinking...</span>
//                           </div>
//                         ) : (
//                       <ReactMarkdown
//                         remarkPlugins={[remarkGfm, remarkMath]}
//                         rehypePlugins={[rehypeKatex]}
//                             components={{
//                               ...MarkdownComponents,
//                               p: ({ children }) => (
//                                 <p className="text-sm sm:text-base text-gray-300 my-1.5 leading-relaxed 
//                                   break-words">
//                                   {children}
//                                 </p>
//                               ),
//                             }}
//                             className="whitespace-pre-wrap break-words space-y-1.5"
//                           >
//                             {message.content || ''}
//                       </ReactMarkdown>
//                         )}

//                         {message.topics && message.topics.length > 0 && (
//                           <div className="mt-3">
//                             <RelatedTopics
//                               topics={message.topics}
//                               onTopicClick={handleRelatedQueryClick}
//                             />
//                           </div>
//                         )}

//                         {message.questions && message.questions.length > 0 && (
//                           <div className="mt-3">
//                             <RelatedQuestions
//                               questions={message.questions}
//                               onQuestionClick={handleRelatedQueryClick}
//                             />
//                           </div>
//                         )}
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               </div>
//             ))}
//             <div 
//               ref={messagesEndRef}
//               className="h-8 w-full"
//               aria-hidden="true"
//             />
//           </div>

//           <div className="fixed bottom-12 left-0 right-0 bg-gradient-to-t from-background 
//             via-background to-transparent pb-1 pt-2 z-50">
//             <div className="w-full px-2 sm:px-4 max-w-3xl mx-auto">
//               <SearchBar
//                 onSearch={handleSearch} 
//                 placeholder="Ask a follow-up question..."
//                 centered={false}
//                 className="bg-gray-900/80 backdrop-blur-lg border border-gray-700/50 h-10"
//               />
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// ExploreView.displayName = 'ExploreView';