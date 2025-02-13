// src/services/gptService.ts
import { Question, UserContext, ExploreResponse } from '../types'; // Import Message type
import { Message } from "../types/index";

export class GPTService {
  private workerUrl: string;

  constructor() {
    this.workerUrl = import.meta.env.VITE_WORKER_URL;
  }

  private async makeApiRequest(endpoint: string, payload: any) {
    try {
      const response = await fetch(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint,
          payload
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      if (response.status === 429) {
        const data = await response.json();
        alert(`Too many requests. Please try again in ${Math.ceil(data.retryAfter)} seconds`);
      }

      const content = await response.json();
      return content;
    } catch (error) {
      console.error('API request error:', error);
      throw new Error('Failed to make API request');
    }
  }

  async getExploreContent(query: string, userContext: UserContext): Promise<ExploreResponse> {
    try {
      const content = await this.makeApiRequest('explore', { query, userContext });

      if (!content) {
        throw new Error('Empty response from API');
      }

      let parsedContent: any;
      try {
        parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (error) {
        console.error('JSON Parse Error:', error);
        throw new Error('Invalid JSON response from API');
      }

      // Validate the response structure
      if (!parsedContent.domain || !parsedContent.content ||
        !parsedContent.content.paragraph1 ||
        !parsedContent.content.paragraph2 ||
        !parsedContent.content.paragraph3) {
        throw new Error('Invalid response structure');
      }

      // Combine paragraphs into content
      const formattedContent = [
        parsedContent.content.paragraph1,
        parsedContent.content.paragraph2,
        parsedContent.content.paragraph3
      ].join('\n\n');

      // Ensure related topics and questions exist
      const relatedTopics = Array.isArray(parsedContent.relatedTopics)
        ? parsedContent.relatedTopics.slice(0, 5)
        : [];

      const relatedQuestions = Array.isArray(parsedContent.relatedQuestions)
        ? parsedContent.relatedQuestions.slice(0, 5)
        : [];

      return {
        content: formattedContent,
        relatedTopics: relatedTopics,
        relatedQuestions: relatedQuestions
      };

    } catch (error) {
      console.error('Explore content error:', error);
      throw new Error('Failed to generate explore content');
    }
  }

  async getPlaygroundQuestion(topic: string, level: number, userContext: UserContext): Promise<Question> {
    try {
      const content = await this.makeApiRequest('playground', { topic, level, userContext });

      if (!content) {
        throw new Error('Empty response received from API');
      }

      let parsedContent: Question;
      try {
        parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (error) {
        console.error('JSON Parse Error:', error);
        throw new Error('Invalid JSON response from API');
      }

      // Randomly shuffle the options and adjust correctAnswer accordingly
      const shuffled = this.shuffleOptionsAndAnswer(parsedContent);

      // Validate and format the question
      const formattedQuestion: Question = {
        text: shuffled.text || '',
        options: shuffled.options,
        correctAnswer: shuffled.correctAnswer,
        explanation: {
          correct: shuffled.explanation?.correct || 'Correct answer explanation',
          key_point: shuffled.explanation?.key_point || 'Key learning point'
        },
        difficulty: level,
        topic: topic,
        subtopic: parsedContent.subtopic || topic,
        questionType: 'conceptual',
        ageGroup: userContext.age.toString()
      };

      if (this.validateQuestionFormat(formattedQuestion)) {
        return formattedQuestion;
      }

      throw new Error('Generated question failed validation');
    } catch (error) {
      console.error('Question generation error:', error);
      throw new Error('Failed to generate valid question');
    }
  }

  async getTestQuestions(topic: string, examType: 'JEE' | 'NEET'): Promise<Question[]> {
    try {
      const content = await this.makeApiRequest('test', { topic, examType });

      if (!content) {
        console.error('Empty response from API');
        throw new Error('No content received from API');
      }

      let parsed;
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (error) {
        console.error('JSON parse error:', error);
        throw new Error('Failed to parse API response');
      }

      if (!parsed?.questions || !Array.isArray(parsed.questions)) {
        console.error('Invalid response structure:', parsed);
        throw new Error('Invalid response structure');
      }

      const processedQuestions = parsed.questions.map((q: Partial<Question>, index: number) => {
        const difficulty = Math.floor(index / 5) + 1;
        return {
          text: q.text || '',
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
          explanation: q.explanation || '',
          difficulty,
          topic,
          subtopic: q.subtopic || `${topic} Concept ${index + 1}`,
          examType,
          questionType: 'conceptual',
          ageGroup: '16-18'
        } as Question;
      });

      const validQuestions = processedQuestions.filter((q: Question) => this.validateQuestionFormat(q));

      if (validQuestions.length >= 5) {
        return validQuestions.slice(0, 15);
      }

      throw new Error(`Only ${validQuestions.length} valid questions generated`);
    } catch (error) {
      console.error('Test generation error:', error);
      throw new Error(`Failed to generate test questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async streamExploreContent(
    query: string,
    userContext: UserContext,
    chatHistory: Message[], // Added chatHistory parameter
    onChunk: (content: { text?: string, topics?: any[], questions?: any[] }) => void
  ): Promise<void> {
    try {
      const response = await fetch(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: 'streamExplore',
          payload: { query, userContext, chatHistory } // Include chatHistory in payload
        }),
      });

      if (response.status === 429) {
        const data = await response.json();
        alert(`Too many requests. Please try again in ${Math.ceil(data.retryAfter)} seconds`);
      }

      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status}`);
      }

      const data = await response.json();

      // Handle Gemini API response format
      if (data.candidates && data.candidates[0]?.content?.parts) {
        const content = data.candidates[0].content.parts[0].text;


        const [textContent, jsonStr] = content.split('---').map((part: string) => part.trim());

        let topics: any[] = [];
        let questions: any[] = [];


        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.topics && Array.isArray(parsed.topics)) {
              topics = parsed.topics.map((topic: { name: any; type: any; detail: any; }) => ({
                topic: topic.name,
                type: topic.type,
                reason: topic.detail
              }));
            }

            if (parsed.questions && Array.isArray(parsed.questions)) {
              questions = parsed.questions.map((question: { text: any; type: any; detail: any; }) => ({
                question: question.text,
                type: question.type,
                context: question.detail
              }));
            }
          } catch (error) {
            console.error('JSON parse error:', error);
          }
        }

        // Call onChunk with the parsed content
        onChunk({
          text: textContent,
          topics: topics.length > 0 ? topics : undefined,
          questions: questions.length > 0 ? questions : undefined
        });
      }
    } catch (error) {
      console.error('Stream error:', error);
      throw new Error('Failed to stream content');
    }
  }

  private validateQuestionFormat(question: Question): boolean {
    try {
      // Basic validation
      if (!question.text?.trim()) return false;
      if (!Array.isArray(question.options) || question.options.length !== 4) return false;
      if (question.options.some(opt => !opt?.trim())) return false;
      if (typeof question.correctAnswer !== 'number' ||
        question.correctAnswer < 0 ||
        question.correctAnswer > 3) return false;

      // Explanation validation
      if (!question.explanation?.correct?.trim() ||
        !question.explanation?.key_point?.trim()) return false;

      // Additional validation
      if (question.text.length < 10) return false;  // Too short
      if (question.options.length !== new Set(question.options).size) return false; // Duplicates
      if (question.explanation.correct.length < 5 ||
        question.explanation.key_point.length < 5) return false; // Too short explanations

      return true;
    } catch (error) {
      console.error('Validation error:', error);
      return false;
    }
  }

  private shuffleOptionsAndAnswer(question: Question): Question {
    const optionsWithIndex = question.options.map((opt, idx) => ({
      text: opt,
      isCorrect: idx === question.correctAnswer
    }));

    for (let i = optionsWithIndex.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optionsWithIndex[i], optionsWithIndex[j]] = [optionsWithIndex[j], optionsWithIndex[i]];
    }

    const newCorrectAnswer = optionsWithIndex.findIndex(opt => opt.isCorrect);

    return {
      ...question,
      options: optionsWithIndex.map(opt => opt.text),
      correctAnswer: newCorrectAnswer
    };
  }
}

export const gptService = new GPTService();

// import { Question, UserContext, ExploreResponse } from '../types';

// export class GPTService {
//   private workerUrl: string;

//   constructor() {
//     this.workerUrl = import.meta.env.VITE_WORKER_URL;
//   }

//   private async makeApiRequest(endpoint: string, payload: any) {
//     try {
//       const response = await fetch(this.workerUrl, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           endpoint,
//           payload
//         }),
//       });

//       if (!response.ok) {
//         throw new Error(`API request failed: ${response.status}`);
//       }

//       if (response.status === 429) {
//         const data = await response.json();
//         alert(`Too many requests. Please try again in ${Math.ceil(data.retryAfter)} seconds`);
//       }

//       const content = await response.json();
//       return content;
//     } catch (error) {
//       console.error('API request error:', error);
//       throw new Error('Failed to make API request');
//     }
//   }

//   async getExploreContent(query: string, userContext: UserContext): Promise<ExploreResponse> {
//     try {
//       const content = await this.makeApiRequest('explore', { query, userContext });
      
//       if (!content) {
//         throw new Error('Empty response from API');
//       }

//       let parsedContent: any;
//       try {
//         parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
//       } catch (error) {
//         console.error('JSON Parse Error:', error);
//         throw new Error('Invalid JSON response from API');
//       }

//       // Validate the response structure
//       if (!parsedContent.domain || !parsedContent.content ||
//         !parsedContent.content.paragraph1 ||
//         !parsedContent.content.paragraph2 ||
//         !parsedContent.content.paragraph3) {
//         throw new Error('Invalid response structure');
//       }

//       // Combine paragraphs into content
//       const formattedContent = [
//         parsedContent.content.paragraph1,
//         parsedContent.content.paragraph2,
//         parsedContent.content.paragraph3
//       ].join('\n\n');

//       // Ensure related topics and questions exist
//       const relatedTopics = Array.isArray(parsedContent.relatedTopics)
//         ? parsedContent.relatedTopics.slice(0, 5)
//         : [];

//       const relatedQuestions = Array.isArray(parsedContent.relatedQuestions)
//         ? parsedContent.relatedQuestions.slice(0, 5)
//         : [];

//       return {
//         content: formattedContent,
//         relatedTopics: relatedTopics,
//         relatedQuestions: relatedQuestions
//       };

//     } catch (error) {
//       console.error('Explore content error:', error);
//       throw new Error('Failed to generate explore content');
//     }
//   }

//   async getPlaygroundQuestion(topic: string, level: number, userContext: UserContext): Promise<Question> {
//     try {
//       const content = await this.makeApiRequest('playground', { topic, level, userContext });

//       if (!content) {
//         throw new Error('Empty response received from API');
//       }

//       let parsedContent: Question;
//       try {
//         parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
//       } catch (error) {
//         console.error('JSON Parse Error:', error);
//         throw new Error('Invalid JSON response from API');
//       }

//       // Randomly shuffle the options and adjust correctAnswer accordingly
//       const shuffled = this.shuffleOptionsAndAnswer(parsedContent);

//       // Validate and format the question
//       const formattedQuestion: Question = {
//         text: shuffled.text || '',
//         options: shuffled.options,
//         correctAnswer: shuffled.correctAnswer,
//         explanation: {
//           correct: shuffled.explanation?.correct || 'Correct answer explanation',
//           key_point: shuffled.explanation?.key_point || 'Key learning point'
//         },
//         difficulty: level,
//         topic: topic,
//         subtopic: parsedContent.subtopic || topic,
//         questionType: 'conceptual',
//         ageGroup: userContext.age.toString()
//       };

//       if (this.validateQuestionFormat(formattedQuestion)) {
//         return formattedQuestion;
//       }

//       throw new Error('Generated question failed validation');
//     } catch (error) {
//       console.error('Question generation error:', error);
//       throw new Error('Failed to generate valid question');
//     }
//   }

//   async getTestQuestions(topic: string, examType: 'JEE' | 'NEET'): Promise<Question[]> {
//     try {
//       const content = await this.makeApiRequest('test', { topic, examType });

//       if (!content) {
//         console.error('Empty response from API');
//         throw new Error('No content received from API');
//       }

//       let parsed;
//       try {
//         parsed = typeof content === 'string' ? JSON.parse(content) : content;
//       } catch (error) {
//         console.error('JSON parse error:', error);
//         throw new Error('Failed to parse API response');
//       }

//       if (!parsed?.questions || !Array.isArray(parsed.questions)) {
//         console.error('Invalid response structure:', parsed);
//         throw new Error('Invalid response structure');
//       }

//       const processedQuestions = parsed.questions.map((q: Partial<Question>, index: number) => {
//         const difficulty = Math.floor(index / 5) + 1;
//         return {
//           text: q.text || '',
//           options: Array.isArray(q.options) ? q.options : [],
//           correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
//           explanation: q.explanation || '',
//           difficulty,
//           topic,
//           subtopic: q.subtopic || `${topic} Concept ${index + 1}`,
//           examType,
//           questionType: 'conceptual',
//           ageGroup: '16-18'
//         } as Question;
//       });

//       const validQuestions = processedQuestions.filter((q: Question) => this.validateQuestionFormat(q));

//       if (validQuestions.length >= 5) {
//         return validQuestions.slice(0, 15);
//       }

//       throw new Error(`Only ${validQuestions.length} valid questions generated`);
//     } catch (error) {
//       console.error('Test generation error:', error);
//       throw new Error(`Failed to generate test questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
//     }
//   }

//   async streamExploreContent(
//     query: string,
//     userContext: UserContext,
//     onChunk: (content: { text?: string, topics?: any[], questions?: any[] }) => void
//   ): Promise<void> {
//     try {
//       const response = await fetch(this.workerUrl, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           endpoint: 'streamExplore',
//           payload: { query, userContext }
//         }),
//       });
      
//       if (response.status === 429) {
//         const data = await response.json();
//         alert(`Too many requests. Please try again in ${Math.ceil(data.retryAfter)} seconds`);
//       }

//       if (!response.ok) {
//         throw new Error(`Stream request failed: ${response.status}`);
//       }
  
//       const data = await response.json();
      
//       // Handle Gemini API response format
//       if (data.candidates && data.candidates[0]?.content?.parts) {
//         const content = data.candidates[0].content.parts[0].text;
        
        
//         const [textContent, jsonStr] = content.split('---').map((part: string) => part.trim());
        
//         let topics: any[] = [];
//         let questions: any[] = [];
        
     
//         if (jsonStr) {
//           try {
//             const parsed = JSON.parse(jsonStr);
            
//             if (parsed.topics && Array.isArray(parsed.topics)) {
//               topics = parsed.topics.map((topic: { name: any; type: any; detail: any; }) => ({
//                 topic: topic.name,
//                 type: topic.type,
//                 reason: topic.detail
//               }));
//             }
            
//             if (parsed.questions && Array.isArray(parsed.questions)) {
//               questions = parsed.questions.map((question: { text: any; type: any; detail: any; }) => ({
//                 question: question.text,
//                 type: question.type,
//                 context: question.detail
//               }));
//             }
//           } catch (error) {
//             console.error('JSON parse error:', error);
//           }
//         }
  
//         // Call onChunk with the parsed content
//         onChunk({
//           text: textContent,
//           topics: topics.length > 0 ? topics : undefined,
//           questions: questions.length > 0 ? questions : undefined
//         });
//       }
//     } catch (error) {
//       console.error('Stream error:', error);
//       throw new Error('Failed to stream content');
//     }
//   }

//   private validateQuestionFormat(question: Question): boolean {
//     try {
//       // Basic validation
//       if (!question.text?.trim()) return false;
//       if (!Array.isArray(question.options) || question.options.length !== 4) return false;
//       if (question.options.some(opt => !opt?.trim())) return false;
//       if (typeof question.correctAnswer !== 'number' ||
//         question.correctAnswer < 0 ||
//         question.correctAnswer > 3) return false;

//       // Explanation validation
//       if (!question.explanation?.correct?.trim() ||
//         !question.explanation?.key_point?.trim()) return false;

//       // Additional validation
//       if (question.text.length < 10) return false;  // Too short
//       if (question.options.length !== new Set(question.options).size) return false; // Duplicates
//       if (question.explanation.correct.length < 5 ||
//         question.explanation.key_point.length < 5) return false; // Too short explanations

//       return true;
//     } catch (error) {
//       console.error('Validation error:', error);
//       return false;
//     }
//   }

//   private shuffleOptionsAndAnswer(question: Question): Question {
//     const optionsWithIndex = question.options.map((opt, idx) => ({
//       text: opt,
//       isCorrect: idx === question.correctAnswer
//     }));

//     for (let i = optionsWithIndex.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [optionsWithIndex[i], optionsWithIndex[j]] = [optionsWithIndex[j], optionsWithIndex[i]];
//     }

//     const newCorrectAnswer = optionsWithIndex.findIndex(opt => opt.isCorrect);

//     return {
//       ...question,
//       options: optionsWithIndex.map(opt => opt.text),
//       correctAnswer: newCorrectAnswer
//     };
//   }
// }

// export const gptService = new GPTService();
