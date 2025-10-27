import React, { useState, ChangeEvent } from 'react';
import { analyzeImage } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import MarkdownRenderer from './MarkdownRenderer';
import { AI_SYSTEM_INSTRUCTION_IMAGE_ANALYSIS } from '../constants';

const ImageAnalyzer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('What do you see in this image? Provide a technical analysis.');
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      setError(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFile(null);
      setImagePreview(null);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError('Please upload an image first.');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisResult('');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onloadend = async () => {
        const base64Image = (reader.result as string).split(',')[1];
        const mimeType = selectedFile.type;
        const response = await analyzeImage(base64Image, mimeType, prompt, AI_SYSTEM_INSTRUCTION_IMAGE_ANALYSIS);
        setAnalysisResult(response.text);
      };
    } catch (err: any) {
      console.error('Error analyzing image:', err);
      setError(`Failed to analyze image: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      <div className="w-full md:w-1/2 p-6 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Image Analysis</h2>
        <div className="mb-4">
          <label htmlFor="image-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Upload Image
          </label>
          <input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-900 dark:text-gray-300
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-md file:border-0
                       file:text-sm file:font-semibold
                       file:bg-blue-50 file:text-blue-700
                       hover:file:bg-blue-100"
          />
        </div>

        {imagePreview && (
          <div className="mb-4 flex-grow flex flex-col justify-center items-center bg-gray-100 dark:bg-gray-700 rounded-md p-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Image Preview</h3>
            <img src={imagePreview} alt="Preview" className="max-w-full max-h-64 object-contain rounded-md shadow-md" />
          </div>
        )}

        <div className="mb-4 mt-auto">
          <label htmlFor="prompt-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Analysis Prompt
          </label>
          <textarea
            id="prompt-input"
            rows={4}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
                       focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Describe the main subject and its composition."
          ></textarea>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleAnalyze}
          disabled={loading || !selectedFile}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {loading ? 'Analyzing...' : 'Analyze Image'}
        </button>
      </div>

      <div className="w-full md:w-1/2 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Analysis Result</h2>
        <div className="flex-grow overflow-y-auto bg-white dark:bg-gray-800 p-4 rounded-md shadow-inner">
          {loading && <LoadingSpinner />}
          {analysisResult && <MarkdownRenderer content={analysisResult} className="text-gray-800 dark:text-gray-200" />}
          {!loading && !analysisResult && !error && (
            <p className="text-gray-500 dark:text-gray-400">Upload an image and click "Analyze" to see the results here.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageAnalyzer;
