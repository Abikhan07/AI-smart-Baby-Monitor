
import { GoogleGenAI, Type } from "@google/genai";
import { FileData, AnalysisResult } from "../types";

const MODEL_NAME = 'gemini-3-flash-preview';

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // API key must be obtained from process.env.API_KEY directly.
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async analyzeFile(file: FileData): Promise<AnalysisResult> {
    const isImage = file.type.startsWith('image/');
    
    let parts: any[] = [];
    if (isImage) {
      parts.push({
        inlineData: {
          mimeType: file.type,
          data: file.content.split(',')[1]
        }
      });
      parts.push({ text: "Analyze this image in detail. Extract any data, text, or visual information." });
    } else {
      parts.push({ text: `Analyze the following file content named "${file.name}":\n\n${file.content}` });
    }

    // Using ai.models.generateContent directly as per guidelines.
    const response = await this.ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "A concise summary of the document." },
            keyInsights: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Key facts or takeaways from the content."
            },
            suggestedQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Questions the user might want to ask about this content."
            },
            visualizations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  type: { type: Type.STRING, description: "bar, pie, or line" },
                  data: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        value: { type: Type.NUMBER }
                      },
                      required: ["name", "value"]
                    }
                  }
                },
                required: ["label", "type", "data"]
              }
            },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  details: { type: Type.STRING }
                }
              }
            }
          },
          required: ["summary", "keyInsights", "suggestedQuestions", "visualizations", "entities"]
        }
      }
    });

    try {
      // Accessing text as a property on the response object.
      const text = response.text;
      if (!text) {
        throw new Error("No response text from Gemini");
      }
      return JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON", e);
      throw new Error("Invalid analysis response");
    }
  }

  async askQuestion(file: FileData, question: string, history: {role: string, text: string}[]): Promise<string> {
    const isImage = file.type.startsWith('image/');
    const chat = this.ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: `You are an expert document assistant. You are helping a user understand the file: ${file.name}. Use the provided file content as your primary source of truth.`
      }
    });

    let prompt = question;
    if (history.length === 0) {
      if (!isImage) {
        prompt = `Based on this document content: "${file.content.substring(0, 5000)}...", answer the following question: ${question}`;
      }
    }

    // Sending message to the chat session.
    const result = await chat.sendMessage({ message: prompt });
    return result.text || "I'm sorry, I couldn't process that question.";
  }
}
