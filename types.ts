
export type AppMode = 'ROLE_SELECTION' | 'BABY_STATION' | 'PARENT_STATION';

export interface BabyStatus {
  isCrying: boolean;
  noiseLevel: number;
  lastEvent: string;
  statusMessage: string;
}

export interface LullabyOption {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

// Added missing FileData interface for GeminiService
export interface FileData {
  name: string;
  type: string;
  content: string;
}

// Added missing AnalysisResult interface for GeminiService
export interface AnalysisResult {
  summary: string;
  keyInsights: string[];
  suggestedQuestions: string[];
  visualizations: {
    label: string;
    type: 'bar' | 'pie' | 'line';
    data: { name: string; value: number }[];
  }[];
  entities: {
    name: string;
    type: string;
    details: string;
  }[];
}

export const LULLABIES: LullabyOption[] = [
  { id: 'calm', name: 'Gentle Clouds', description: 'Soft humming and ambient bells', prompt: 'Hum a very slow, breathy, gentle lullaby with soft "mm-mm" sounds and light whistling.' },
  { id: 'nature', name: 'Forest Stream', description: 'Nature sounds with soft singing', prompt: 'Sing a slow, whispering melody about a quiet forest and a sleepy owl.' },
  { id: 'classic', name: 'Twinkle Variations', description: 'A soft, melodic hummed classic', prompt: 'Hum the melody of Twinkle Twinkle Little Star extremely slowly and softly.' }
];
