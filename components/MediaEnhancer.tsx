import React, { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import {
  generateVideo,
  setupLiveSession,
  decodeAudioData,
  decode,
  encode,
  createBlob,
  runMultimediaTask,
  getGeminiInstance,
  generateSpeech,
  LiveSessionCallbacks,
  chatWithGemini,
  queryWithGoogleSearch,
  queryWithGoogleMaps,
  getWeatherFunctionDeclaration,
  mockGetWeather,
} from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import MarkdownRenderer from './MarkdownRenderer';
import { AspectRatio, Resolution, MediaTool, ChatMessage, GroundingChunk } from '../types';
import {
  AI_SYSTEM_INSTRUCTION_AUDIO_ANALYSIS,
  AI_SYSTEM_INSTRUCTION_CONVERSATION,
  AI_SYSTEM_INSTRUCTION_GENERAL_EDIT,
  AI_SYSTEM_INSTRUCTION_VIDEO_ANALYSIS,
  AI_SYSTEM_INSTRUCTION_IMAGE_ANALYSIS,
  DEFAULT_VOICE,
  GEMINI_FLASH_IMAGE_MODEL,
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
  GEMINI_LIVE_AUDIO_MODEL,
} from '../constants';
import { Chat, Modality, Session } from '@google/genai'; // Added Session import

interface LatLng {
  latitude: number;
  longitude: number;
}

interface MediaEnhancerProps {
  initialActiveTool: MediaTool;
}

const MediaEnhancer: React.FC<MediaEnhancerProps> = ({ initialActiveTool }) => {
  const [activeTool, setActiveTool] = useState<MediaTool>(initialActiveTool);

  // Video Generation States
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [videoResolution, setVideoResolution] = useState<Resolution>(Resolution['720p']);
  const [videoAspectRatio, setVideoAspectRatio] = useState<AspectRatio>(AspectRatio['16:9']);
  const [initialImageFile, setInitialImageFile] = useState<File | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Live Audio Conversation States
  const [isLiveSessionActive, setIsLiveSessionActive] = useState<boolean>(false);
  const [liveSessionLoading, setLiveSessionLoading] = useState<boolean>(false);
  const [liveSessionError, setLiveSessionError] = useState<string | null>(null);
  const audioInputContextRef = useRef<AudioContext | null>(null);
  const audioOutputContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const outputAudioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  // Corrected type from Promise<Chat> to Promise<Session>
  const liveSessionPromiseRef = useRef<Promise<Session> | null>(null);
  const currentInputTranscriptionRef = useRef<string>('');
  const currentOutputTranscriptionRef = useRef<string>('');
  const [transcriptionHistory, setTranscriptionHistory] = useState<ChatMessage[]>([]);
  const [liveChatMessages, setLiveChatMessages] = useState<ChatMessage[]>([]);
  const [showLiveTranscription, setShowLiveTranscription] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [functionCallStatus, setFunctionCallStatus] = useState<string>('');


  // Text-to-Speech States
  const [ttsText, setTtsText] = useState<string>('Hello, this is a test of the text-to-speech feature.');
  const [ttsLoading, setTtsLoading] = useState<boolean>(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  // General Multimedia Analysis/Editing States
  const [multimediaFile, setMultimediaFile] = useState<File | null>(null);
  const [multimediaPreview, setMultimediaPreview] = useState<string | null>(null);
  const [multimediaPrompt, setMultimediaPrompt] = useState<string>('Provide technical analysis and suggest improvements.');
  const [multimediaResult, setMultimediaResult] = useState<string>('');
  const [multimediaLoading, setMultimediaLoading] = useState<boolean>(false);
  const [multimediaError, setMultimediaError] = useState<string | null>(null);
  const [multimediaGroundingChunks, setMultimediaGroundingChunks] = useState<GroundingChunk[]>([]);
  const [useGoogleSearch, setUseGoogleSearch] = useState<boolean>(false);
  const [useGoogleMaps, setUseGoogleMaps] = useState<boolean>(false);


  useEffect(() => {
    // Cleanup for audio contexts on component unmount
    return () => {
      if (audioInputContextRef.current) audioInputContextRef.current.close();
      if (audioOutputContextRef.current) audioOutputContextRef.current.close();
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (liveSessionPromiseRef.current) {
        // Corrected: close() is on the resolved Session object, not the promise
        liveSessionPromiseRef.current.then((session) => session.close());
      }
    };
  }, []);

  useEffect(() => {
    if (useGoogleMaps) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            console.log('User location:', position.coords.latitude, position.coords.longitude);
          },
          (error) => {
            console.error('Error getting user location:', error);
            setMultimediaError('Could not get user location for Google Maps. Please enable location services.');
            setUseGoogleMaps(false); // Disable if location not available
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      } else {
        setMultimediaError('Geolocation is not supported by your browser for Google Maps.');
        setUseGoogleMaps(false);
      }
    } else {
      setUserLocation(null);
    }
  }, [useGoogleMaps]);

  useEffect(() => {
    // Update activeTool when initialActiveTool prop changes from App.tsx
    setActiveTool(initialActiveTool);
  }, [initialActiveTool]);


  // Video Generation Handlers
  const handleInitialImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setInitialImageFile(event.target.files[0]);
    } else {
      setInitialImageFile(null);
    }
  };

  const handleGenerateVideo = async () => {
    setVideoLoading(true);
    setVideoError(null);
    setGeneratedVideoUrl(null);
    try {
      let initialImageBase64: { base64Data: string; mimeType: string } | undefined;
      if (initialImageFile) {
        const reader = new FileReader();
        reader.readAsDataURL(initialImageFile);
        initialImageBase64 = await new Promise((resolve) => {
          reader.onloadend = () => {
            resolve({
              base64Data: (reader.result as string).split(',')[1],
              mimeType: initialImageFile.type,
            });
          };
        });
      }
      const videoUrl = await generateVideo(
        videoPrompt,
        videoResolution,
        videoAspectRatio,
        initialImageBase64,
      );
      setGeneratedVideoUrl(videoUrl);
    } catch (err: any) {
      console.error('Error generating video:', err);
      setVideoError(`Failed to generate video: ${err.message || 'Unknown error'}`);
    } finally {
      setVideoLoading(false);
    }
  };

  // Live Audio Conversation Handlers
  const startLiveSession = useCallback(async () => {
    setLiveSessionLoading(true);
    setLiveSessionError(null);
    setTranscriptionHistory([]);
    setLiveChatMessages([]);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';
    nextStartTimeRef.current = 0;
    outputAudioSourcesRef.current.forEach((source) => source.stop());
    outputAudioSourcesRef.current.clear();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      audioInputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      audioOutputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });

      // outputNode is needed to connect audioSource before playing
      const outputNode = audioOutputContextRef.current.createGain();
      outputNode.connect(audioOutputContextRef.current.destination);

      const source = audioInputContextRef.current.createMediaStreamSource(stream);
      scriptProcessorRef.current = audioInputContextRef.current.createScriptProcessor(4096, 1, 1);

      const callbacks: LiveSessionCallbacks = {
        onopen: () => {
          console.debug('Live session opened');
          setIsLiveSessionActive(true);
          setLiveSessionLoading(false);
        },
        onmessage: async (message) => {
          // Handle audio playback
          const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64EncodedAudioString && audioOutputContextRef.current) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioOutputContextRef.current.currentTime);
            try {
              const audioBuffer = await decodeAudioData(
                decode(base64EncodedAudioString),
                audioOutputContextRef.current,
                24000,
                1,
              );
              const audioSource = audioOutputContextRef.current.createBufferSource();
              audioSource.buffer = audioBuffer;
              audioSource.connect(outputNode); // Connect to outputNode
              audioSource.addEventListener('ended', () => {
                outputAudioSourcesRef.current.delete(audioSource);
              });
              audioSource.start(nextStartTimeRef.current);
              nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
              outputAudioSourcesRef.current.add(audioSource);
            } catch (audioErr) {
              console.error('Error decoding or playing audio:', audioErr);
              setLiveSessionError('Error playing audio response.');
            }
          }

          // Handle transcription updates
          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            currentOutputTranscriptionRef.current += text;
            setLiveChatMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.role === 'model' && lastMessage.isStreaming) {
                return [...prev.slice(0, -1), { ...lastMessage, content: currentOutputTranscriptionRef.current }];
              } else {
                // Only add new message if the content is not empty to avoid empty streaming messages
                return currentOutputTranscriptionRef.current.trim() !== ''
                  ? [...prev, { id: Date.now().toString(), role: 'model', content: currentOutputTranscriptionRef.current, isStreaming: true }]
                  : prev;
              }
            });
          } else if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            currentInputTranscriptionRef.current += text;
            setLiveChatMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.role === 'user' && lastMessage.isStreaming) {
                return [...prev.slice(0, -1), { ...lastMessage, content: currentInputTranscriptionRef.current }];
              } else {
                // Only add new message if the content is not empty to avoid empty streaming messages
                return currentInputTranscriptionRef.current.trim() !== ''
                  ? [...prev, { id: Date.now().toString(), role: 'user', content: currentInputTranscriptionRef.current, isStreaming: true }]
                  : prev;
              }
            });
          }

          // Handle turn completion
          if (message.serverContent?.turnComplete) {
            const fullInput = currentInputTranscriptionRef.current;
            const fullOutput = currentOutputTranscriptionRef.current;

            if (fullInput.trim()) { // Check for non-empty transcription
              setTranscriptionHistory(prev => [...prev, { id: Date.now().toString(), role: 'user', content: fullInput }]);
              setLiveChatMessages(prev => prev.map(msg =>
                msg.id === liveChatMessages[liveChatMessages.length - 2]?.id && msg.role === 'user' && msg.isStreaming
                  ? { ...msg, isStreaming: false, content: fullInput } : msg)); // Update content with fullInput
            }
            if (fullOutput.trim()) { // Check for non-empty transcription
              setTranscriptionHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', content: fullOutput }]);
              setLiveChatMessages(prev => prev.map(msg =>
                msg.id === liveChatMessages[liveChatMessages.length - 1]?.id && msg.role === 'model' && msg.isStreaming
                  ? { ...msg, isStreaming: false, content: fullOutput } : msg)); // Update content with fullOutput
            }

            currentInputTranscriptionRef.current = '';
            currentOutputTranscriptionRef.current = '';
          }

          // Handle interruption
          const interrupted = message.serverContent?.interrupted;
          if (interrupted) {
            for (const source of outputAudioSourcesRef.current.values()) { // Corrected: Use outputAudioSourcesRef.current
              source.stop();
              outputAudioSourcesRef.current.delete(source);
            }
            nextStartTimeRef.current = 0;
            console.log('Model response interrupted.');
          }

          // Handle function calls
          if (message.toolCall) {
            setFunctionCallStatus('Function call received...');
            for (const fc of message.toolCall.functionCalls) {
              console.debug('function call:', fc);
              let result = '';
              if (fc.name === 'getWeather' && fc.args.location) {
                result = await mockGetWeather(fc.args.location as string);
                setFunctionCallStatus(`Called getWeather for ${fc.args.location}. Result: ${result}`);
              } else {
                result = `Function ${fc.name} not implemented.`;
                setFunctionCallStatus(result);
              }

              liveSessionPromiseRef.current?.then((session) => {
                // sendToolResponse is a method on the Session object
                session.sendToolResponse({
                  functionResponses: {
                    id: fc.id,
                    name: fc.name,
                    response: { result: result },
                  },
                });
              });
            }
          }
        },
        onerror: (e) => {
          console.error('Live session error:', e);
          setLiveSessionError(`Live session error: ${(e as ErrorEvent).message || 'Unknown error'}`);
          stopLiveSession(); // Ensure session is stopped on error
        },
        onclose: (e) => {
          console.debug('Live session closed');
          // Only show error if it wasn't a manual close (e.g., from network issue or server)
          if (isLiveSessionActive && !liveSessionLoading) { // Check if it was active and not explicitly stopping
            setLiveSessionError(`Live session closed unexpectedly: Code ${(e as CloseEvent).code || 'Unknown'}`);
          }
          setIsLiveSessionActive(false);
          setLiveSessionLoading(false);
          stopLiveSession(); // Ensure session resources are released
        },
      };

      const ai = getGeminiInstance();
      // Corrected: live.connect returns Promise<Session>
      liveSessionPromiseRef.current = ai.live.connect({
        model: GEMINI_LIVE_AUDIO_MODEL,
        callbacks: callbacks,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: DEFAULT_VOICE } },
          },
          systemInstruction: AI_SYSTEM_INSTRUCTION_CONVERSATION,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [getWeatherFunctionDeclaration] }],
        },
      });

      // CRITICAL: Solely rely on sessionPromise resolves and then call `session.sendRealtimeInput`
      liveSessionPromiseRef.current.then((session) => {
        if (scriptProcessorRef.current && audioInputContextRef.current) {
          scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            // sendRealtimeInput is a method on the Session object
            session.sendRealtimeInput({ media: pcmBlob });
          };
          source.connect(scriptProcessorRef.current);
          scriptProcessorRef.current.connect(audioInputContextRef.current.destination);
        }
      }).catch((err) => {
        console.error('Error establishing live session connection:', err);
        setLiveSessionError(`Failed to establish live session: ${err.message || 'Unknown error'}`);
        setLiveSessionLoading(false);
        setIsLiveSessionActive(false);
        stopLiveSession();
      });
    } catch (err: any) {
      console.error('Failed to start live session:', err);
      setLiveSessionError(`Failed to start live session: ${err.message || 'Unknown error'}`);
      setLiveSessionLoading(false);
      setIsLiveSessionActive(false);
    }
  }, [isLiveSessionActive]); // Added isLiveSessionActive to dependencies to prevent stale closures

  const stopLiveSession = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioInputContextRef.current) {
      audioInputContextRef.current.close();
      audioInputContextRef.current = null;
    }
    if (audioOutputContextRef.current) {
      audioOutputContextRef.current.close();
      audioOutputContextRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    outputAudioSourcesRef.current.forEach((source) => source.stop());
    outputAudioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (liveSessionPromiseRef.current) {
      // Corrected: close() is on the resolved Session object, not the promise
      liveSessionPromiseRef.current.then((session) => {
        session.close();
      }).catch(e => console.error("Error closing live session:", e));
      liveSessionPromiseRef.current = null;
    }
    setIsLiveSessionActive(false);
    setLiveSessionLoading(false);
  }, []);

  // Text-to-Speech Handlers
  const handleGenerateSpeech = async () => {
    if (!ttsText.trim()) {
      setTtsError('Please enter text to convert to speech.');
      return;
    }
    setTtsLoading(true);
    setTtsError(null);
    try {
      const base64Audio = await generateSpeech(ttsText);
      const audioOutputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const outputNode = audioOutputContext.createGain(); // Create output node
      outputNode.connect(audioOutputContext.destination); // Connect output node to destination
      const audioBuffer = await decodeAudioData(decode(base64Audio), audioOutputContext, 24000, 1);

      const source = audioOutputContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputNode); // Connect source to output node
      source.start();
    } catch (err: any) {
      console.error('Error generating speech:', err);
      setTtsError(`Failed to generate speech: ${err.message || 'Unknown error'}`);
    } finally {
      setTtsLoading(false);
    }
  };


  // General Multimedia Analysis/Editing Handlers
  const handleMultimediaFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setMultimediaFile(file);
      setMultimediaError(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        setMultimediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setMultimediaFile(null);
      setMultimediaPreview(null);
    }
  };

  const handleMultimediaTask = async () => {
    if (!multimediaFile && !(useGoogleSearch || useGoogleMaps)) {
      setMultimediaError('Please upload a file or enable Google Search/Maps to proceed.');
      return;
    }
    if ((useGoogleSearch || useGoogleMaps) && !multimediaPrompt.trim()) {
      setMultimediaError('Please enter a prompt when using Google Search or Maps.');
      return;
    }


    setMultimediaLoading(true);
    setMultimediaError(null);
    setMultimediaResult('');
    setMultimediaGroundingChunks([]);

    try {
      let response;
      const parts: any[] = [];
      let systemInstruction = AI_SYSTEM_INSTRUCTION_GENERAL_EDIT;

      if (multimediaFile) {
        const reader = new FileReader();
        reader.readAsDataURL(multimediaFile);
        await new Promise<void>((resolve) => {
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1];
            const mimeType = multimediaFile.type;

            parts.push({ inlineData: { mimeType: mimeType, data: base64Data } });

            systemInstruction =
              mimeType.startsWith('image')
                ? AI_SYSTEM_INSTRUCTION_IMAGE_ANALYSIS
                : mimeType.startsWith('audio')
                  ? AI_SYSTEM_INSTRUCTION_AUDIO_ANALYSIS
                  : mimeType.startsWith('video')
                    ? AI_SYSTEM_INSTRUCTION_VIDEO_ANALYSIS
                    : AI_SYSTEM_INSTRUCTION_GENERAL_EDIT;
            resolve();
          };
        });
      }

      if (multimediaPrompt.trim()) {
        parts.push({ text: multimediaPrompt });
      }

      if (useGoogleSearch) {
        response = await queryWithGoogleSearch(multimediaPrompt);
      } else if (useGoogleMaps && userLocation) {
        response = await queryWithGoogleMaps(multimediaPrompt, userLocation.latitude, userLocation.longitude);
      } else {
        const model = multimediaFile?.type.startsWith('image') ? GEMINI_FLASH_IMAGE_MODEL : GEMINI_FLASH_MODEL; // Use Flash for general tasks. Pro for complex.
        response = await runMultimediaTask(model, parts, systemInstruction);
      }

      setMultimediaResult(response.text);

      if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        setMultimediaGroundingChunks(response.candidates[0].groundingMetadata.groundingChunks);
      }
    } catch (err: any) {
      console.error('Error performing multimedia task:', err);
      setMultimediaError(`Failed to process file: ${err.message || 'Unknown error'}`);
    } finally {
      setMultimediaLoading(false);
    }
  };

  const renderMediaPreview = () => {
    if (!multimediaPreview) return null;
    if (multimediaFile?.type.startsWith('image')) {
      return <img src={multimediaPreview} alt="Preview" className="max-w-full max-h-64 object-contain rounded-md shadow-md" />;
    } else if (multimediaFile?.type.startsWith('audio')) {
      return <audio controls src={multimediaPreview} className="w-full"></audio>;
    } else if (multimediaFile?.type.startsWith('video')) {
      return <video controls src={multimediaPreview} className="max-w-full max-h-64 object-contain rounded-md shadow-md"></video>;
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      <div className="flex justify-center p-4 bg-white dark:bg-gray-800 shadow-md">
        <button
          onClick={() => setActiveTool(MediaTool.MULTIMEDIA_ANALYSIS_EDITING)}
          className={`px-4 py-2 mx-2 rounded-md text-sm font-medium transition-colors duration-200
                        ${activeTool === MediaTool.MULTIMEDIA_ANALYSIS_EDITING
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
            }`}
        >
          Multimedia Analysis & Editing
        </button>
        <button
          onClick={() => setActiveTool(MediaTool.VIDEO_GENERATION)}
          className={`px-4 py-2 mx-2 rounded-md text-sm font-medium transition-colors duration-200
                        ${activeTool === MediaTool.VIDEO_GENERATION
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
            }`}
        >
          Video Generation
        </button>
        <button
          onClick={() => setActiveTool(MediaTool.AUDIO_CONVERSATION)}
          className={`px-4 py-2 mx-2 rounded-md text-sm font-medium transition-colors duration-200
                        ${activeTool === MediaTool.AUDIO_CONVERSATION
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
            }`}
        >
          Live Audio Conversation
        </button>
        <button
          onClick={() => setActiveTool(MediaTool.TEXT_TO_SPEECH)}
          className={`px-4 py-2 mx-2 rounded-md text-sm font-medium transition-colors duration-200
                        ${activeTool === MediaTool.TEXT_TO_SPEECH
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
            }`}
        >
          Text-to-Speech
        </button>
      </div>

      <div className="flex-grow p-6 overflow-y-auto">
        {/* Video Generation Section */}
        {activeTool === MediaTool.VIDEO_GENERATION && (
          <div className="flex flex-col md:flex-row h-full">
            <div className="w-full md:w-1/2 p-6 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Generate Video</h2>
              <div className="mb-4">
                <label htmlFor="video-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Video Prompt
                </label>
                <textarea
                  id="video-prompt"
                  rows={3}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                             focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  placeholder="e.g., A bustling market scene in a futuristic Tokyo, with neon signs and diverse characters."
                ></textarea>
              </div>

              <div className="mb-4">
                <label htmlFor="initial-image-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Optional: Initial Image for Video
                </label>
                <input
                  id="initial-image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleInitialImageChange}
                  className="block w-full text-sm text-gray-900 dark:text-gray-300
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-md file:border-0
                             file:text-sm file:font-semibold
                             file:bg-blue-50 file:text-blue-700
                             hover:file:bg-blue-100"
                />
              </div>

              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <label htmlFor="video-resolution-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Resolution
                  </label>
                  <select
                    id="video-resolution-select"
                    value={videoResolution}
                    onChange={(e) => setVideoResolution(e.target.value as Resolution)}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md
                               bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {Object.values(Resolution).map((res) => (
                      <option key={res} value={res}>
                        {res}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="video-aspect-ratio-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Aspect Ratio
                  </label>
                  <select
                    id="video-aspect-ratio-select"
                    value={videoAspectRatio}
                    onChange={(e) => setVideoAspectRatio(e.target.value as AspectRatio)}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md
                               bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {Object.values(AspectRatio).map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {videoError && <p className="text-red-500 text-sm mb-4">{videoError}</p>}

              <button
                onClick={handleGenerateVideo}
                disabled={videoLoading || !videoPrompt.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 mt-auto"
              >
                {videoLoading ? 'Generating Video (this may take minutes)...' : 'Generate Video'}
              </button>
            </div>

            <div className="w-full md:w-1/2 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Generated Video</h2>
              <div className="flex-grow flex justify-center items-center bg-white dark:bg-gray-800 p-4 rounded-md shadow-inner">
                {videoLoading && (
                  <div className="text-center text-gray-600 dark:text-gray-300 p-4">
                    <LoadingSpinner />
                    <p className="mt-2">Generating your video. This can take several minutes. Please be patient...</p>
                    <p className="mt-1 text-xs">For high-quality video generation, ensure you have sufficient API credits.</p>
                  </div>
                )}
                {generatedVideoUrl ? (
                  <video controls src={generatedVideoUrl} className="max-w-full max-h-full"></video>
                ) : (
                  !videoLoading && (
                    <p className="text-gray-500 dark:text-gray-400">Enter a prompt and generate a video.</p>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* Live Audio Conversation Section */}
        {activeTool === MediaTool.AUDIO_CONVERSATION && (
          <div className="flex flex-col md:flex-row h-full">
            <div className="w-full md:w-1/2 p-6 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Live Audio Conversation</h2>
              {liveSessionError && <p className="text-red-500 text-sm mb-4">{liveSessionError}</p>}
              {functionCallStatus && <p className="text-blue-500 text-sm mb-4">{functionCallStatus}</p>}

              <div className="flex-grow flex flex-col items-center justify-center p-4">
                {liveSessionLoading ? (
                  <LoadingSpinner />
                ) : (
                  <button
                    onClick={isLiveSessionActive ? stopLiveSession : startLiveSession}
                    className={`px-8 py-4 rounded-full text-lg font-bold shadow-lg transition-all duration-300
                               ${isLiveSessionActive
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    disabled={liveSessionLoading}
                  >
                    {isLiveSessionActive ? 'Stop Conversation' : 'Start Conversation'}
                  </button>
                )}
                {isLiveSessionActive && (
                  <p className="mt-4 text-green-600 dark:text-green-400 font-medium">Listening...</p>
                )}
              </div>

              <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    className="form-checkbox h-5 w-5 text-blue-600"
                    checked={showLiveTranscription}
                    onChange={(e) => setShowLiveTranscription(e.target.checked)}
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">Show Transcription</span>
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  When enabled, the chat window will display live transcriptions of the conversation.
                </p>
              </div>
            </div>

            <div className="w-full md:w-1/2 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Conversation Log</h2>
              <div className="flex-grow overflow-y-auto bg-white dark:bg-gray-800 p-4 rounded-md shadow-inner space-y-4">
                {liveChatMessages.length === 0 && !liveSessionLoading ? (
                  <p className="text-gray-500 dark:text-gray-400">Start a live conversation to see the log here.</p>
                ) : (
                  liveChatMessages.map((msg) => (
                    (showLiveTranscription || !msg.isStreaming) && (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg max-w-[80%] ${msg.role === 'user'
                            ? 'bg-blue-100 dark:bg-blue-900 self-end ml-auto text-blue-900 dark:text-blue-100'
                            : 'bg-gray-200 dark:bg-gray-700 self-start mr-auto text-gray-800 dark:text-gray-200'
                          } ${msg.isStreaming ? 'opacity-75' : ''}`}
                      >
                        <strong className="capitalize">{msg.role}:</strong> {msg.content}
                      </div>
                    )
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Text-to-Speech Section */}
        {activeTool === MediaTool.TEXT_TO_SPEECH && (
          <div className="flex flex-col md:flex-row h-full">
            <div className="w-full md:w-1/2 p-6 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Text-to-Speech</h2>
              <div className="mb-4">
                <label htmlFor="tts-text-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Text to Convert to Speech
                </label>
                <textarea
                  id="tts-text-input"
                  rows={6}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                             focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  placeholder="Enter text to convert to audio..."
                ></textarea>
              </div>

              {ttsError && <p className="text-red-500 text-sm mb-4">{ttsError}</p>}

              <button
                onClick={handleGenerateSpeech}
                disabled={ttsLoading || !ttsText.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 mt-auto"
              >
                {ttsLoading ? 'Generating Speech...' : 'Generate and Play Speech'}
              </button>
            </div>

            <div className="w-full md:w-1/2 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Audio Output</h2>
              <div className="flex-grow flex justify-center items-center bg-white dark:bg-gray-800 p-4 rounded-md shadow-inner">
                {ttsLoading ? (
                  <LoadingSpinner />
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    Enter text and click 'Generate and Play Speech' to hear the audio.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* General Multimedia Analysis/Editing Section */}
        {activeTool === MediaTool.MULTIMEDIA_ANALYSIS_EDITING && (
          <div className="flex flex-col md:flex-row h-full">
            <div className="w-full md:w-1/2 p-6 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Multimedia Analysis & Editing</h2>
              <div className="mb-4">
                <label htmlFor="multimedia-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload Image, Audio, or Video
                </label>
                <input
                  id="multimedia-upload"
                  type="file"
                  accept="image/*,audio/*,video/*"
                  onChange={handleMultimediaFileChange}
                  className="block w-full text-sm text-gray-900 dark:text-gray-300
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-md file:border-0
                             file:text-sm file:font-semibold
                             file:bg-blue-50 file:text-blue-700
                             hover:file:bg-blue-100"
                />
              </div>

              {multimediaPreview && (
                <div className="mb-4 flex-grow flex flex-col justify-center items-center bg-gray-100 dark:bg-gray-700 rounded-md p-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Media Preview</h3>
                  {renderMediaPreview()}
                </div>
              )}

              <div className="mb-4 mt-auto">
                <label htmlFor="multimedia-prompt-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Task Prompt
                </label>
                <textarea
                  id="multimedia-prompt-input"
                  rows={4}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                             focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  value={multimediaPrompt}
                  onChange={(e) => setMultimediaPrompt(e.target.value)}
                  placeholder="e.g., Analyze the audio quality and suggest improvements, or 'Edit this image to remove the background'."
                ></textarea>
              </div>

              <div className="mb-4">
                <label className="inline-flex items-center mr-4">
                  <input
                    type="checkbox"
                    className="form-checkbox h-5 w-5 text-blue-600"
                    checked={useGoogleSearch}
                    onChange={(e) => {
                      setUseGoogleSearch(e.target.checked);
                      if (e.target.checked) setUseGoogleMaps(false);
                    }}
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">Use Google Search</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    className="form-checkbox h-5 w-5 text-blue-600"
                    checked={useGoogleMaps}
                    onChange={(e) => {
                      setUseGoogleMaps(e.target.checked);
                      if (e.target.checked) setUseGoogleSearch(false);
                    }}
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">Use Google Maps (requires location)</span>
                </label>
              </div>


              {multimediaError && <p className="text-red-500 text-sm mb-4">{multimediaError}</p>}

              <button
                onClick={handleMultimediaTask}
                disabled={multimediaLoading || (!multimediaFile && !(useGoogleSearch || useGoogleMaps)) || ((useGoogleSearch || useGoogleMaps) && !multimediaPrompt.trim())}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {multimediaLoading ? 'Processing...' : 'Perform Task'}
              </button>
            </div>

            <div className="w-full md:w-1/2 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Result</h2>
              <div className="flex-grow overflow-y-auto bg-white dark:bg-gray-800 p-4 rounded-md shadow-inner">
                {multimediaLoading && <LoadingSpinner />}
                {multimediaResult && <MarkdownRenderer content={multimediaResult} className="text-gray-800 dark:text-gray-200" />}
                {multimediaGroundingChunks.length > 0 && (
                  <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Sources:</h3>
                    <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
                      {multimediaGroundingChunks.map((chunk, index) => (
                        <li key={index}>
                          {chunk.web && <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{chunk.web.title || chunk.web.uri}</a>}
                          {chunk.maps && <a href={chunk.maps.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{chunk.maps.title || chunk.maps.uri}</a>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!multimediaLoading && !multimediaResult && !multimediaError && (
                  <p className="text-gray-500 dark:text-gray-400">Upload a file and specify a task to see results here.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaEnhancer;