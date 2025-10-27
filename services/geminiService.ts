import {
  GoogleGenAI,
  GenerateContentResponse,
  GenerateContentParameters,
  Modality,
  LiveServerMessage,
  Blob,
  GenerateImagesResponse,
  GenerateVideosOperation,
  Chat,
  FunctionDeclaration,
  Type,
  Session,
  GenerateVideosParameters,
} from '@google/genai';
import {
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
  IMAGEN_GENERATE_MODEL,
  GEMINI_FLASH_IMAGE_MODEL,
  VEO_FAST_GENERATE_MODEL,
  VEO_GENERATE_MODEL,
  GEMINI_LIVE_AUDIO_MODEL,
  GEMINI_TTS_MODEL,
  DEFAULT_VOICE,
} from '../constants';
import { AspectRatio, Resolution, ChatMessage } from '../types';

// Helper functions for audio encoding/decoding
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const checkAndSelectApiKey = async (): Promise<boolean> => {
  if (!(window as any).aistudio) {
    console.error('window.aistudio not found. Ensure the environment is correctly set up.');
    return false;
  }
  if (!(await (window as any).aistudio.hasSelectedApiKey())) {
    alert('Please select your API key for Google Gemini to proceed. Billing information: ai.google.dev/gemini-api/docs/billing');
    await (window as any).aistudio.openSelectKey();
    // Assume selection was successful to avoid race condition, actual key is in process.env.API_KEY
    return true;
  }
  return true;
};

export const getGeminiInstance = (): GoogleGenAI => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeImage = async (
  base64Image: string,
  mimeType: string,
  prompt: string,
  systemInstruction: string = '',
): Promise<GenerateContentResponse> => {
  const ai = getGeminiInstance();
  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64Image,
    },
  };
  const textPart = {
    text: prompt,
  };

  const config: GenerateContentParameters['config'] = {
    responseMimeType: 'text/plain',
  };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: GEMINI_FLASH_MODEL,
    contents: { parts: [imagePart, textPart] },
    config: config,
  });
  return response;
};

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  numberOfImages: number = 1,
): Promise<string[]> => {
  const ai = getGeminiInstance();
  const response: GenerateImagesResponse = await ai.models.generateImages({
    model: IMAGEN_GENERATE_MODEL,
    prompt: prompt,
    config: {
      numberOfImages: numberOfImages,
      outputMimeType: 'image/jpeg',
      aspectRatio: aspectRatio,
    },
  });

  if (!response.generatedImages || response.generatedImages.length === 0) {
    throw new Error('No images were generated.');
  }

  return response.generatedImages.map(
    (img) => `data:image/jpeg;base64,${img.image.imageBytes}`,
  );
};

export const runTextTask = async (
  model: typeof GEMINI_PRO_MODEL | typeof GEMINI_FLASH_MODEL,
  prompt: string,
  systemInstruction?: string,
): Promise<GenerateContentResponse> => {
  const ai = getGeminiInstance();
  const config: GenerateContentParameters['config'] = {};
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: config,
  });
  return response;
};

export const runMultimediaTask = async (
  model: typeof GEMINI_PRO_MODEL | typeof GEMINI_FLASH_MODEL | typeof GEMINI_FLASH_IMAGE_MODEL,
  parts: any[], // Array of text and/or inlineData parts
  systemInstruction?: string,
): Promise<GenerateContentResponse> => {
  const ai = getGeminiInstance();
  const config: GenerateContentParameters['config'] = {};
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  // If the model is GEMINI_FLASH_IMAGE_MODEL and includes image parts, set responseModalities
  if (model === GEMINI_FLASH_IMAGE_MODEL && parts.some(part => part.inlineData && part.inlineData.mimeType.startsWith('image'))) {
    config.responseModalities = [Modality.IMAGE];
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: model,
    contents: { parts: parts },
    config: config,
  });
  return response;
};

export const generateVideo = async (
  prompt: string,
  resolution: Resolution,
  aspectRatio: AspectRatio,
  initialImage?: { base64Data: string; mimeType: string },
): Promise<string> => {
  if (!(await checkAndSelectApiKey())) {
    throw new Error('API Key not selected.');
  }
  const ai = getGeminiInstance();

  let operation: GenerateVideosOperation;
  // Use GenerateVideosParameters['config'] for the videoConfig type
  const videoConfig: GenerateVideosParameters['config'] = {
    numberOfVideos: 1,
    resolution: resolution,
    aspectRatio: aspectRatio,
  };

  if (initialImage) {
    operation = await ai.models.generateVideos({
      model: VEO_FAST_GENERATE_MODEL,
      prompt: prompt,
      image: {
        imageBytes: initialImage.base64Data,
        mimeType: initialImage.mimeType,
      },
      config: videoConfig,
    });
  } else {
    operation = await ai.models.generateVideos({
      model: VEO_FAST_GENERATE_MODEL,
      prompt: prompt,
      config: videoConfig,
    });
  }


  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Poll every 10 seconds
    try {
      operation = await ai.operations.getVideosOperation({ operation: operation });
    } catch (error: any) {
      if (error.message && error.message.includes('Requested entity was not found.')) {
        await (window as any).aistudio.openSelectKey(); // Prompt user to re-select key
        throw new Error('API key might be invalid or expired. Please re-select your API key and try again.');
      }
      throw error;
    }
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) {
    throw new Error('Failed to retrieve video download link.');
  }

  // The response.body contains the MP4 bytes. You must append an API key when fetching from the download link.
  return `${downloadLink}&key=${process.env.API_KEY}`;
};

export interface LiveSessionCallbacks {
  onopen: () => void;
  onmessage: (message: LiveServerMessage) => Promise<void>;
  onerror: (e: Event) => void;
  onclose: (e: Event) => void;
}

export const setupLiveSession = async (
  callbacks: LiveSessionCallbacks,
  systemInstruction: string = '',
  voiceName: string = DEFAULT_VOICE, // Corrected type to string
) => {
  if (!(await checkAndSelectApiKey())) {
    throw new Error('API Key not selected.');
  }
  const ai = getGeminiInstance();

  const sessionPromise = ai.live.connect({
    model: GEMINI_LIVE_AUDIO_MODEL,
    callbacks: callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
      },
      systemInstruction: systemInstruction,
      inputAudioTranscription: {}, // Enable transcription for user input audio
      outputAudioTranscription: {}, // Enable transcription for model output audio
    },
  });
  return sessionPromise;
};

export const generateSpeech = async (
  text: string,
  voiceName: string = DEFAULT_VOICE, // Corrected type to string
): Promise<string> => {
  const ai = getGeminiInstance();
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName },
        },
      },
    },
  });

  const base64Audio =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('No audio data received from TTS API.');
  }
  return base64Audio;
};

export const chatWithGemini = async (
  model: typeof GEMINI_PRO_MODEL | typeof GEMINI_FLASH_MODEL,
  messages: ChatMessage[], // Use the ChatMessage interface from types.ts
  systemInstruction?: string,
): Promise<AsyncIterable<GenerateContentResponse>> => { // Updated return type
  // Transform internal ChatMessage format to Gemini's Content format
  const historyForGemini = messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  let initialHistoryForChatCreate = historyForGemini;
  let userMessageContentForSend: string | undefined;

  // Gemini chat expects alternating roles and the last message to be from the user,
  // which is then sent via sendMessageStream.
  // So, extract the last user message and pass the rest as initial history.
  const lastMessage = historyForGemini[historyForGemini.length - 1];

  if (lastMessage && lastMessage.role === 'user') {
    initialHistoryForChatCreate = historyForGemini.slice(0, -1); // Exclude the last user message
    userMessageContentForSend = (lastMessage.parts[0] as {text: string}).text; // Extract the text content
  } else {
    // This scenario should ideally be prevented by the calling component,
    // or handled with a more user-friendly error.
    throw new Error("Chat history must contain at least one user message to initiate a chat stream.");
  }

  const ai = getGeminiInstance();
  const chat: Chat = ai.chats.create({
    model: model,
    history: initialHistoryForChatCreate, // Pass the transformed history
    config: systemInstruction ? { systemInstruction } : undefined,
  });

  if (!userMessageContentForSend) {
    throw new Error("User message content for streaming is missing.");
  }

  const response = await chat.sendMessageStream({ message: userMessageContentForSend });
  return response;
};

export const queryWithGoogleSearch = async (
  prompt: string,
): Promise<GenerateContentResponse> => {
  const ai = getGeminiInstance();
  const response = await ai.models.generateContent({
    model: GEMINI_FLASH_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  return response;
};

export const queryWithGoogleMaps = async (
  prompt: string,
  latitude: number,
  longitude: number,
): Promise<GenerateContentResponse> => {
  const ai = getGeminiInstance();
  const response = await ai.models.generateContent({
    model: GEMINI_FLASH_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: latitude,
            longitude: longitude,
          },
        },
      },
    },
  });
  return response;
};

export const getWeatherFunctionDeclaration: FunctionDeclaration = {
  name: 'getWeather',
  parameters: {
    type: Type.OBJECT,
    description: 'Get the current weather for a given location.',
    properties: {
      location: {
        type: Type.STRING,
        description: 'The city or location to get weather for.',
      },
    },
    required: ['location'],
  },
};

export const mockGetWeather = async (location: string): Promise<string> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (location.toLowerCase().includes('san francisco')) {
        resolve(`The weather in ${location} is partly cloudy with a temperature of 60°F.`);
      } else if (location.toLowerCase().includes('new york')) {
        resolve(`The weather in ${location} is sunny with a temperature of 75°F.`);
      } else {
        resolve(`Weather data for ${location} is not available.`);
      }
    }, 1000);
  });
};