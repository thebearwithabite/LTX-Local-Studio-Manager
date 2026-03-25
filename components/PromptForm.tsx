/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useCallback, useRef, useState} from 'react';
import {IngredientImage, ProjectAsset} from '../types';
import {
  ArrowRightIcon,
  FileUploadIcon,
  UploadCloudIcon,
  XMarkIcon,
  FileAudioIcon, // New import
} from './icons';
import AssetLibrary from './AssetLibrary';
import * as pdfjsLib from 'pdfjs-dist';
import { transcribeAudio } from '../services/audioService'; // New import

// Setup PDF.js worker from a CDN. The mjs build is required for modules.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

interface ProjectSetupFormProps {
  onGenerate: (
    script: string,
    createKeyframes: boolean,
  ) => void;
  isGenerating: boolean;
  onLoadProject: (jsonString: string) => void;
  
  // Asset Library Props
  assets: ProjectAsset[];
  onAnalyzeScriptForAssets: (script: string) => void;
  isAnalyzingAssets: boolean;
  onAddAsset: (asset: ProjectAsset) => void;
  onRemoveAsset: (id: string) => void;
  onUpdateAssetImage: (id: string, file: File) => void;
}

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });

const ProjectSetupForm: React.FC<ProjectSetupFormProps> = ({
  onGenerate,
  isGenerating,
  onLoadProject,
  assets,
  onAnalyzeScriptForAssets,
  isAnalyzingAssets,
  onAddAsset,
  onRemoveAsset,
  onUpdateAssetImage,
}) => {
  const [script, setScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createKeyframes, setCreateKeyframes] = useState(false); // Default to false for HIL
  const [isTranscribing, setIsTranscribing] = useState(false); // New state

  const scriptFileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null); // New ref

  const handleScriptFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Reset the input value to allow re-uploading the same file
      if (event.target) {
        event.target.value = '';
      }

      setError(null);

      if (file.name.endsWith('.gdoc')) {
        setError(
          'Google Doc files cannot be uploaded directly. In Google Docs, please use File > Download > Plain Text (.txt) and upload that file.',
        );
        return;
      }

      try {
        let text = '';
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
          const pageTexts = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .filter((item: any): item is {str: string} => 'str' in item)
              .map((item: any) => item.str)
              .join(' ');
            pageTexts.push(pageText);
          }
          text = pageTexts.join('\n\n');
        } else {
          text = await file.text();
        }
        setScript(text);
      } catch (e) {
        console.error('Failed to read file:', e);
        setError(
          'Could not read the script file. It may be corrupted or in an unsupported format. Please try again.',
        );
      }
    },
    [],
  );

  const handleAudioFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Reset input
    if (event.target) event.target.value = '';
    setError(null);

    // Simple size check (20MB soft limit for inline base64 safety)
    if (file.size > 20 * 1024 * 1024) {
        setError("Audio file is too large (max 20MB for browser upload). Please compress it or split it.");
        return;
    }

    setIsTranscribing(true);
    try {
        const base64 = await fileToBase64(file);
        const { result } = await transcribeAudio(base64, file.type);
        
        if (script.trim()) {
            if (window.confirm("Append transcript to existing script? Cancel to replace.")) {
                setScript(prev => prev + "\n\n" + result);
            } else {
                setScript(result);
            }
        } else {
            setScript(result);
        }
    } catch (e) {
        console.error("Transcription failed", e);
        setError("Audio transcription failed. Please try a different file.");
    } finally {
        setIsTranscribing(false);
    }
  };


  const handleUploadClick = () => {
    scriptFileInputRef.current?.click();
  };

  const handleLoadProjectClick = () => {
    projectFileInputRef.current?.click();
  };

  const handleAudioUploadClick = () => {
      audioFileInputRef.current?.click();
  };

  const handleProjectFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Reset input to allow re-uploading the same file
    if (event.target) event.target.value = '';
    
    try {
        const text = await file.text();
        onLoadProject(text);
    } catch (e) {
        console.error('Failed to read project file:', e);
        setError('Could not read the project file. Please ensure it is a valid text-based file.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (script.trim() && !isGenerating) {
      onGenerate(script, createKeyframes);
    }
  };

  const isSubmitDisabled = !script.trim() || isGenerating || isTranscribing;

  return (
    <div className="w-full max-w-6xl p-4 md:p-8 bg-[#1f1f1f] border border-gray-700 rounded-2xl shadow-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* Script Section */}
        <div>
          <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
            <label
              htmlFor="script-input"
              className="text-xl font-semibold text-gray-200">
              Step 1: The Script
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleLoadProjectClick}
                disabled={isGenerating || isTranscribing}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors text-sm disabled:bg-gray-700 disabled:cursor-not-allowed">
                Load Project (.json)
              </button>
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={isGenerating || isTranscribing}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors text-sm disabled:bg-gray-700 disabled:cursor-not-allowed">
                <FileUploadIcon className="w-4 h-4" />
                <span>Upload Script</span>
              </button>
              <button
                type="button"
                onClick={handleAudioUploadClick}
                disabled={isGenerating || isTranscribing}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors text-sm disabled:bg-gray-700 disabled:cursor-not-allowed border border-indigo-500">
                <FileAudioIcon className="w-4 h-4" />
                <span>{isTranscribing ? 'Transcribing...' : 'Upload Audio Episode'}</span>
              </button>
            </div>
            <input
              type="file"
              ref={scriptFileInputRef}
              onChange={handleScriptFileUpload}
              className="hidden"
              accept=".txt,.md,.rtf,.pdf,.gdoc"
              disabled={isGenerating || isTranscribing}
            />
            <input
              type="file"
              ref={projectFileInputRef}
              onChange={handleProjectFileSelect}
              className="hidden"
              accept=".json"
              disabled={isGenerating || isTranscribing}
            />
            <input
              type="file"
              ref={audioFileInputRef}
              onChange={handleAudioFileUpload}
              className="hidden"
              accept="audio/*"
              disabled={isGenerating || isTranscribing}
            />
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Paste your script, upload a text file, or upload an audio episode to auto-transcribe.
          </p>
          <div className="relative">
            <textarea
                id="script-input"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Paste your script here..."
                className="w-full bg-gray-900/50 focus:outline-none resize-y text-base text-gray-200 placeholder-gray-500 min-h-48 rounded-xl p-4 border border-gray-600 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                disabled={isGenerating || isTranscribing}
            />
            {isTranscribing && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-xl backdrop-blur-sm">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p className="text-white font-semibold">Listening & Transcribing...</p>
                </div>
            )}
          </div>
        </div>

        {/* Asset Library Section - Replaces the old Ingredients box */}
        <div>
          <div className="flex justify-between items-center mb-2">
             <label className="text-xl font-semibold text-gray-200">Step 2: Visual Assets</label>
          </div>
          <AssetLibrary 
            assets={assets}
            onAddAsset={onAddAsset}
            onRemoveAsset={onRemoveAsset}
            onUpdateAssetImage={onUpdateAssetImage}
            onAnalyzeScript={() => onAnalyzeScriptForAssets(script)}
            isAnalyzing={isAnalyzingAssets}
            hasScript={!!script.trim()}
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>

        {/* Settings & Generate */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-700">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-900/50 w-full md:w-auto">
            <label
              htmlFor="keyframes-switch"
              className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="keyframes-switch"
                className="sr-only peer"
                checked={createKeyframes}
                onChange={(e) => setCreateKeyframes(e.target.checked)}
                disabled={isGenerating}
              />
              <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
            <div className="flex flex-col">
              <label
                htmlFor="keyframes-switch"
                className="font-semibold text-gray-200 cursor-pointer text-sm">
                Auto-Generate Keyframes
              </label>
              <p className="text-xs text-gray-400">
                Generate images for all shots immediately.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl hover:bg-indigo-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed w-full md:w-auto">
            <span>Generate Shot Book</span>
            <ArrowRightIcon className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectSetupForm;