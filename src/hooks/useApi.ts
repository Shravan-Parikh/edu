// src/hooks/useApi.ts
import { useState } from "react";
import { Question, UserContext , Message} from "../types";
import { api } from "../services/api";

export const useApi = () => {
  const [isLoading, setIsLoading] = useState(false);

  const getQuestion = async (
    topic: string,
    level: number,
    userContext: UserContext
  ): Promise<Question> => {
    try {
      setIsLoading(true);
      return await api.getQuestion(topic, level, userContext);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTest = async (topic: string, examType: 'JEE' | 'NEET') => {
    setIsLoading(true);
    try {
      console.log('Generating test for:', { topic, examType });
      const questions = await api.generateTest(topic, examType);
      console.log('API response:', questions);
      return questions;
    } catch (err) {
      console.error('Test Generation Error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const explore = async (query: string, userContext: UserContext, chatHistory: Message[]) => { // Add chatHistory param
    setIsLoading(true);
    try {
      return await api.explore(query, userContext, chatHistory); // Pass chatHistory to api.explore
    } catch (err) {
      console.error("API Error:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    explore,
    getQuestion,
    generateTest,
  };
};
