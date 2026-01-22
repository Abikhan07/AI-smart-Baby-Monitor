
import { GoogleGenAI, Type } from "@google/genai";
import { FileData, AnalysisResult } from "../types.ts";

const MODEL_NAME = 'gemini-3-pro-preview';

export class GeminiService {
  /**
   * Analyzes a file (image or text) related to baby care using Gemini.
   * Instantiates a fresh GoogleGenAI client per call to ensure up-to-date configuration.
   */
  async analyzeFile(file: FileData): Promise<AnalysisResult> {
    // Fresh instance per call to ensure most up-to-date environment variables/keys
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const isImage = file.type.startsWith('image/');
    
    let parts: any[] = [];
    if (isImage) {
      parts.push({
        inlineData: {
          mimeType: file.type,
          data: file.content.split(',')[1]
        }
      });
      parts.push({ text: "Analyze this image in detail. Extract any data, text, or visual information related to baby care, health logs, or sleep patterns." });
    } else {
      parts.push({ text: `Analyze the following baby care log file named "${file.name}":\n\n${file.content}` });
    }

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "A concise summary of the data." },
            keyInsights: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Key findings about baby's behavior or health."
            },
            suggestedQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Questions the parent might want to ask."
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
      // Accessing .text as a property as per current SDK
      const text = response.text;
      if (!text) throw new Error("No response text from Gemini");
      return JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON", e);
      throw new Error("Invalid analysis response format");
    }
  }

  /**
   * Asks a question about an uploaded file using a chat session.
   */
  async askQuestion(file: FileData, question: string, history: {role: string, text: string}[]): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: `You are an expert pediatric consultant assistant. You are helping a parent understand logs/images related to their baby's care. Use the file "${file.name}" as context. Be encouraging, professional, and clear.`
      }
    });

    let prompt = question;
    if (history.length === 0) {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        prompt = `Based on this content: "${file.content.substring(0, 5000)}...", answer: ${question}`;
      } else {
        prompt = `Based on the previously uploaded image, answer: ${question}`;
      }
    }

    const result = await chat.sendMessage({ message: prompt });
    // Using .text property to extract output
    return result.text || "I'm sorry, I couldn't process that question at this time.";
  }
}
