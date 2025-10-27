import React, { useState } from 'react';
import ImageAnalyzer from './components/ImageAnalyzer';
import ImageGenerator from './components/ImageGenerator';
import MediaEnhancer from './components/MediaEnhancer';
import { MediaTool } from './types';

function App() {
  const [activeTool, setActiveTool] = useState<MediaTool>(MediaTool.IMAGE_ANALYSIS);

  const renderActiveTool = () => {
    switch (activeTool) {
      case MediaTool.IMAGE_ANALYSIS:
        return <ImageAnalyzer />;
      case MediaTool.IMAGE_GENERATION:
        return <ImageGenerator />;
      case MediaTool.VIDEO_GENERATION:
      case MediaTool.AUDIO_CONVERSATION:
      case MediaTool.TEXT_TO_SPEECH:
      case MediaTool.MULTIMEDIA_ANALYSIS_EDITING: // Add new media tool
        // MediaEnhancer covers these tools, its internal state will manage the specific sub-tool
        return <MediaEnhancer initialActiveTool={activeTool} />;
      default:
        return <div className="p-6 text-gray-700 dark:text-gray-300">Select a tool from the navigation.</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white flex flex-col">
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg sticky top-0 z-10">
        <h1 className="text-3xl font-extrabold text-center tracking-tight">Media AI Lab</h1>
        <p className="text-center text-sm mt-1 opacity-90">Powered by Google Gemini & Imagen</p>
      </header>

      <nav className="bg-white dark:bg-gray-800 shadow-md sticky top-[72px] md:top-[90px] z-10 p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setActiveTool(MediaTool.IMAGE_ANALYSIS)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
                        ${activeTool === MediaTool.IMAGE_ANALYSIS
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
          >
            Image Analysis
          </button>
          <button
            onClick={() => setActiveTool(MediaTool.IMAGE_GENERATION)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
                        ${activeTool === MediaTool.IMAGE_GENERATION
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
          >
            Image Generation
          </button>
          <button
            onClick={() => setActiveTool(MediaTool.MULTIMEDIA_ANALYSIS_EDITING)} // Set to new default tool when Media Enhancer is clicked
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200
                        ${[
                          MediaTool.VIDEO_GENERATION,
                          MediaTool.AUDIO_CONVERSATION,
                          MediaTool.TEXT_TO_SPEECH,
                          MediaTool.MULTIMEDIA_ANALYSIS_EDITING,
                        ].includes(activeTool) // Updated
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
          >
            Media Enhancer
          </button>
        </div>
      </nav>

      <main className="flex-grow container mx-auto p-4 md:p-6 overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl h-full flex flex-col">
          {renderActiveTool()}
        </div>
      </main>

      <footer className="bg-gray-900 text-gray-400 p-4 text-center text-sm">
        &copy; {new Date().getFullYear()} Media AI Lab. All rights reserved.
      </footer>
    </div>
  );
}

export default App;