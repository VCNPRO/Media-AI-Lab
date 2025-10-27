import React, { useState } from 'react';
import { generateImage } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { AspectRatio } from '../types';

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio['1:1']);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt for image generation.');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const images = await generateImage(prompt, aspectRatio);
      setGeneratedImages(images);
    } catch (err: any) {
      console.error('Error generating image:', err);
      setError(`Failed to generate image: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      <div className="w-full md:w-1/2 p-6 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Image Generation</h2>
        <div className="mb-4">
          <label htmlFor="prompt-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Prompt
          </label>
          <textarea
            id="prompt-input"
            rows={4}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                       focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., A futuristic city at sunset with flying cars and towering skyscrapers, realistic, cinematic lighting."
          ></textarea>
        </div>

        <div className="mb-6">
          <label htmlFor="aspect-ratio-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Aspect Ratio
          </label>
          <select
            id="aspect-ratio-select"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
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

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 mt-auto"
        >
          {loading ? 'Generating...' : 'Generate Image'}
        </button>
      </div>

      <div className="w-full md:w-1/2 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Generated Images</h2>
        <div className="flex-grow overflow-y-auto bg-white dark:bg-gray-800 p-4 rounded-md shadow-inner flex flex-wrap justify-center gap-4">
          {loading && (
            <div className="text-center text-gray-600 dark:text-gray-300 p-4">
              <LoadingSpinner />
              <p className="mt-2">Generating your image. This might take a moment...</p>
            </div>
          )}
          {generatedImages.length > 0 ? (
            generatedImages.map((src, index) => (
              <img
                key={index}
                src={src}
                alt={`Generated ${index + 1}`}
                className="max-w-full h-auto max-h-80 object-contain rounded-md shadow-md border border-gray-200 dark:border-gray-700"
              />
            ))
          ) : (
            !loading && (
              <p className="text-gray-500 dark:text-gray-400">Enter a prompt and click "Generate" to see your images here.</p>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageGenerator;
