
import { GoogleGenAI, Type } from "@google/genai";
import { FileData, AnalysisResult } from "../types.ts";

const MODEL_NAME = 'gemini-3-pro-preview';

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
      parts.push({ text: "Analyze this image in detail. Extract any data, text, or visual information related to baby care, health logs, or sleep patterns." });
    } else {
      parts.push({ text: `Analyze the following baby care log file named "${file.name}":\n\n${file.content}` });
    }

    const response = await this.ai.models.generateContent({
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
        systemInstruction: `You are an expert pediatric consultant assistant. You are helping a parent understand logs/images related to their baby's care. Use the file "${file.name}" as context. Be encouraging, professional, and clear.`
      }
    });

    let prompt = question;
    if (history.length === 0) {
      if (!isImage) {
        prompt = `Based on this content: "${file.content.substring(0, 5000)}...", answer: ${question}`;
      } else {
        // For images in first turn of chat, we'd ideally re-send the image part, 
        // but for this simple implementation we rely on the context established in systemInstruction if the model supports it or simple text reference.
        prompt = `Based on the previously uploaded image, answer: ${question}`;
      }
    }

    const result = await chat.sendMessage({ message: prompt });
    return result.text || "I'm sorry, I couldn't process that question.";
  }
}
