export enum AspectRatio {
  '1:1' = '1:1',
  '3:4' = '3:4',
  '4:3' = '4:3',
  '9:16' = '9:16',
  '16:9' = '16:9',
}

export enum Resolution {
  '720p' = '720p',
  '1080p' = '1080p',
}

export enum MediaTool {
  IMAGE_ANALYSIS = 'IMAGE_ANALYSIS',
  IMAGE_GENERATION = 'IMAGE_GENERATION',
  VIDEO_GENERATION = 'VIDEO_GENERATION',
  AUDIO_CONVERSATION = 'AUDIO_CONVERSATION',
  TEXT_TO_SPEECH = 'TEXT_TO_SPEECH',
  MULTIMEDIA_ANALYSIS_EDITING = 'MULTIMEDIA_ANALYSIS_EDITING',
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  isStreaming?: boolean;
}

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { uri: string; title: string };
}