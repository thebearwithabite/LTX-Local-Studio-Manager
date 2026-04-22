import React, { useState, useEffect } from 'react';
import { Search, Database, Download, Play, Trash2, Plus, Loader2, ExternalLink, ChevronDown, ChevronUp, Cloud, CloudUpload, CloudDownload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { curateFromUrl, findSources, curateSource } from './services/gemini';

interface CuratorData {
  source: {
    title: string;
    channel: string;
    url: string;
    date_watched: string;
    relevance_tags: string[];
  };
  techniques: any[];
  prompt_examples: any[];
  principles: any[];
  workflow_steps: any[];
  training_pairs: any[];
}

export default function App() {
  const [query, setQuery] = useState('');
  const [dataset, setDataset] = useState<CuratorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{current: number, total: number, message: string} | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'dataset' | 'dashboard'>('search');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isGoogleAuth, setIsGoogleAuth] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [daemonStatus, setDaemonStatus] = useState({ running: false, pid: null });

  const fetchDaemonStatus = async () => {
    try {
      const res = await fetch('/api/daemon/status');
      const data = await res.json();
      setDaemonStatus(data);
    } catch (e) {
      console.error("Failed to fetch daemon status", e);
    }
  };

  useEffect(() => {
    fetchDaemonStatus();
    const interval = setInterval(fetchDaemonStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleDaemon = async () => {
    const endpoint = daemonStatus.running ? '/api/daemon/stop' : '/api/daemon/start';
    try {
      await fetch(endpoint, { method: 'POST' });
      fetchDaemonStatus();
    } catch (e) {
      console.error("Failed to toggle daemon", e);
    }
  };

  const coverageTargets = [
    { id: 'prompt_craft', label: 'Prompt Craft', target: 200, icon: '✍️' },
    { id: 'camera_work', label: 'Camera Work', target: 100, icon: '🎥' },
    { id: 'continuity', label: 'Continuity', target: 50, icon: '🔗' },
    { id: 'lighting', label: 'Lighting', target: 50, icon: '💡' },
    { id: 'composition', label: 'Composition', target: 50, icon: '🖼️' },
    { id: 'audio', label: 'Audio Design', target: 30, icon: '🔊' },
    { id: 'workflow', label: 'Workflow', target: 30, icon: '⚙️' },
    { id: 'anti_patterns', label: 'Anti-Patterns', target: 100, icon: '🚫' },
  ];

  const getCoverageStats = () => {
    const stats: Record<string, number> = {
      prompt_craft: 0,
      camera_work: 0,
      continuity: 0,
      lighting: 0,
      composition: 0,
      audio: 0,
      workflow: 0,
      anti_patterns: 0,
    };

    dataset.forEach(entry => {
      entry.techniques.forEach(tech => {
        const cat = tech.category?.toLowerCase();
        if (stats[cat] !== undefined) {
          stats[cat]++;
        } else if (cat === 'audio_design') {
          stats.audio++;
        }

        if (tech.anti_pattern && tech.anti_pattern.toLowerCase() !== 'n/a' && tech.anti_pattern.length > 10) {
          stats.anti_patterns++;
        }
      });
    });

    return stats;
  };

  useEffect(() => {
    const saved = localStorage.getItem('director_dataset');
    if (saved) {
      try {
        setDataset(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load dataset", e);
      }
    }
    checkGoogleAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem('director_dataset', JSON.stringify(dataset));
  }, [dataset]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGoogleAuth(true);
        alert("Google Drive connected successfully!");
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkGoogleAuth = async () => {
    try {
      const res = await fetch('/api/auth/google/status');
      const data = await res.json();
      setIsGoogleAuth(data.authenticated);
    } catch (e) {
      console.error("Auth check failed", e);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, 'google_auth', 'width=600,height=700');
      } else {
        alert("Google OAuth is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to secrets.");
      }
    } catch (e) {
      console.error("Failed to get auth URL", e);
    }
  };

  const saveToDrive = async () => {
    if (!isGoogleAuth) {
      handleGoogleAuth();
      return;
    }
    setDriveLoading(true);
    try {
      const res = await fetch('/api/drive/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset })
      });
      if (res.ok) {
        alert("Dataset saved to Google Drive!");
      } else {
        const data = await res.json();
        if (res.status === 401) {
          setIsGoogleAuth(false);
          handleGoogleAuth();
        } else {
          alert("Failed to save: " + data.error);
        }
      }
    } catch (e) {
      console.error("Drive save failed", e);
    } finally {
      setDriveLoading(false);
    }
  };

  const loadFromDrive = async () => {
    if (!isGoogleAuth) {
      handleGoogleAuth();
      return;
    }
    setDriveLoading(true);
    try {
      const res = await fetch('/api/drive/load');
      if (res.ok) {
        const data = await res.json();
        if (data.dataset && Array.isArray(data.dataset)) {
          if (confirm(`Found dataset in Drive. Replace current dataset with ${data.dataset.length} entries?`)) {
            setDataset(data.dataset);
            alert("Dataset loaded successfully!");
          }
        } else {
          console.error("Invalid dataset format from Drive", data);
          alert("Failed to load: Dataset format is invalid.");
        }
      } else {
        const data = await res.json();
        if (res.status === 401) {
          setIsGoogleAuth(false);
          handleGoogleAuth();
        } else {
          alert("Failed to load: " + (data.error || "Unknown error"));
        }
      }
    } catch (e) {
      console.error("Drive load failed", e);
      alert("Failed to load from Drive. Check console.");
    } finally {
      setDriveLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setProgress({ current: 0, total: 5, message: "Finding sources..." });
    try {
      const sources = await findSources(query);
      setProgress({ current: 0, total: sources.length, message: "Starting curation..." });
      
      const newEntries = [];
      for (let i = 0; i < sources.length; i++) {
        setProgress({ current: i + 1, total: sources.length, message: `Curating video ${i + 1} of ${sources.length}: ${sources[i].title}` });
        const result = await curateSource(sources[i]);
        newEntries.push(result);
      }
      
      setDataset(prev => [...newEntries, ...prev]);
      setQuery('');
      setActiveTab('dataset');
    } catch (error) {
      console.error("Search failed", error);
      alert("Failed to curate content. Check console.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleAddUrl = async () => {
    const url = prompt("Enter URL to curate:");
    if (!url) return;

    setLoading(true);
    try {
      const result = await curateFromUrl(url);
      setDataset(prev => [result, ...prev]);
      setActiveTab('dataset');
    } catch (error) {
      console.error("URL curation failed", error);
      alert("Failed to curate URL.");
    } finally {
      setLoading(false);
    }
  };

  const exportToJsonl = () => {
    const trainingData = dataset.flatMap(entry => {
      const pairs = entry.training_pairs.map(pair => ({
        instruction: pair.instruction,
        output: pair.response,
        system: "You are an expert AI film director's assistant. You help filmmakers construct shots, write prompts for AI video generation, maintain visual continuity, and make creative decisions about camera work, lighting, composition, and audio design."
      }));

      const principles = entry.principles.map(p => ({
        instruction: p.qa_pair.question,
        output: p.qa_pair.answer,
        system: "You are an expert AI film director's assistant."
      }));

      return [...pairs, ...principles];
    });

    const blob = new Blob([trainingData.map(item => JSON.stringify(item)).join('\n')], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'director_finetune_ready.jsonl';
    a.click();
  };

  const clearDataset = () => {
    if (confirm("Clear all entries?")) {
      setDataset([]);
    }
  };

  const removeEntry = (index: number) => {
    setDataset(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/10 p-6 flex justify-between items-center sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-600/20">
            <Play className="fill-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">DIRECTOR'S ASSISTANT</h1>
            <p className="text-xs text-white/40 uppercase tracking-widest">Dataset Curator v1.0</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'search' ? 'bg-white text-black' : 'hover:bg-white/5'}`}
          >
            Search & Curate
          </button>
          <button 
            onClick={() => setActiveTab('dataset')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'dataset' ? 'bg-white text-black' : 'hover:bg-white/5'}`}
          >
            <Database size={16} />
            Dataset ({dataset.length})
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white text-black' : 'hover:bg-white/5'}`}
          >
            <Play size={16} className="rotate-90" />
            Dashboard
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className={`w-2 h-2 rounded-full ${daemonStatus.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs font-medium text-white/60">
              {daemonStatus.running ? 'DAEMON ACTIVE' : 'DAEMON IDLE'}
            </span>
          </div>
          
          <button 
            onClick={toggleDaemon}
            className={`p-2 rounded-xl transition-all duration-300 ${
              daemonStatus.running 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20'
            }`}
            title={daemonStatus.running ? "Stop Autonomous Loop" : "Start Autonomous Loop"}
          >
            {daemonStatus.running ? <Trash2 size={18} /> : <Play size={18} />}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'search' ? (
            <motion.div 
              key="search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12 py-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-bold tracking-tighter">Find the next <span className="text-orange-500 italic">technique.</span></h2>
                <p className="text-white/60 max-w-xl mx-auto">
                  Search for AI filmmaking tutorials, cinematography breakdowns, or prompt engineering guides to expand your model's knowledge.
                </p>
              </div>

              <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
                <input 
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for 'Veo cinematography' or 'LTX workflow'..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 px-8 text-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                />
                <button 
                  type="submit"
                  disabled={loading}
                  className="absolute right-3 top-3 bottom-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 px-6 rounded-xl flex items-center gap-2 font-bold transition-all"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Search size={20} />}
                  Curate
                </button>
              </form>

              <div className="flex justify-center gap-8">
                <button 
                  onClick={handleAddUrl}
                  className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors"
                >
                  <Plus size={16} />
                  Curate from specific URL
                </button>

                <div className="flex gap-4">
                  <button 
                    onClick={saveToDrive}
                    disabled={driveLoading}
                    className="flex items-center gap-2 text-sm text-white/40 hover:text-orange-500 transition-colors"
                  >
                    {driveLoading ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                    {isGoogleAuth ? "Save to Drive" : "Connect Drive"}
                  </button>
                  <button 
                    onClick={loadFromDrive}
                    disabled={driveLoading}
                    className="flex items-center gap-2 text-sm text-white/40 hover:text-orange-500 transition-colors"
                  >
                    {driveLoading ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
                    Load from Drive
                  </button>
                </div>
              </div>

              {loading && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                  {progress ? (
                    <div className="text-center space-y-2">
                      <p className="text-orange-500 font-mono animate-pulse">{progress.message}</p>
                      <p className="text-white/40 text-sm">{progress.current} / {progress.total} completed</p>
                    </div>
                  ) : (
                    <p className="text-orange-500 font-mono animate-pulse">ANALYZING CONTENT & EXTRACTING STRUCTURED DATA...</p>
                  )}
                </div>
              )}
            </motion.div>
          ) : activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold tracking-tighter uppercase italic">Dataset Coverage Dashboard</h2>
                <p className="text-white/40 max-w-xl mx-auto">
                  Tracking signal density and category distribution for the 2B parameter Director's Assistant model.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {coverageTargets.map(target => {
                  const count = getCoverageStats()[target.id] || 0;
                  const progress = Math.min((count / target.target) * 100, 100);
                  const isComplete = count >= target.target;

                  return (
                    <div key={target.id} className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-4 relative overflow-hidden group">
                      <div className="flex justify-between items-start">
                        <span className="text-3xl">{target.icon}</span>
                        <span className={`text-[10px] px-2 py-1 rounded uppercase font-bold ${isComplete ? 'bg-green-500/20 text-green-500' : 'bg-orange-500/20 text-orange-500'}`}>
                          {isComplete ? 'Target Reached' : 'In Progress'}
                        </span>
                      </div>
                      
                      <div>
                        <h3 className="font-bold text-lg">{target.label}</h3>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black">{count}</span>
                          <span className="text-white/20 text-sm">/ {target.target}</span>
                        </div>
                      </div>

                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className={`h-full ${isComplete ? 'bg-green-500' : 'bg-orange-500'}`}
                        />
                      </div>

                      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="text-8xl font-black italic">{target.label[0]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-orange-500/5 border border-orange-500/20 p-8 rounded-3xl">
                <h3 className="text-orange-500 font-bold uppercase tracking-widest text-xs mb-6">Quality Checklist Reasoning</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold shrink-0">1</div>
                      <p className="text-sm text-white/60"><span className="text-white font-bold">Signal Density:</span> 2B models require high-quality, concise data. Avoid fluff; focus on the directorial "why".</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold shrink-0">2</div>
                      <p className="text-sm text-white/60"><span className="text-white font-bold">Anti-Patterns:</span> Knowing what NOT to do is as valuable as knowing what to do. Capture common AI pitfalls.</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold shrink-0">3</div>
                      <p className="text-sm text-white/60"><span className="text-white font-bold">Continuity:</span> The hardest part of AI video. Prioritize techniques that solve temporal drift.</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold shrink-0">4</div>
                      <p className="text-sm text-white/60"><span className="text-white font-bold">Prompt Craft:</span> The primary interface. We need 200+ high-quality examples to teach the assistant how to translate vision.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="dataset"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold">Training Dataset</h2>
                  <p className="text-white/40">Collected {dataset.length} source entries</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={saveToDrive}
                    disabled={driveLoading}
                    className="p-3 rounded-xl border border-white/10 hover:bg-orange-500/10 hover:border-orange-500/50 text-white/40 hover:text-orange-500 transition-all"
                    title="Save to Google Drive"
                  >
                    {driveLoading ? <Loader2 size={20} className="animate-spin" /> : <CloudUpload size={20} />}
                  </button>
                  <button 
                    onClick={loadFromDrive}
                    disabled={driveLoading}
                    className="p-3 rounded-xl border border-white/10 hover:bg-orange-500/10 hover:border-orange-500/50 text-white/40 hover:text-orange-500 transition-all"
                    title="Load from Google Drive"
                  >
                    {driveLoading ? <Loader2 size={20} className="animate-spin" /> : <CloudDownload size={20} />}
                  </button>
                  <button 
                    onClick={clearDataset}
                    className="p-3 rounded-xl border border-white/10 hover:bg-red-500/10 hover:border-red-500/50 text-white/40 hover:text-red-500 transition-all"
                    title="Clear Dataset"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button 
                    onClick={exportToJsonl}
                    disabled={dataset.length === 0}
                    className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50"
                  >
                    <Download size={20} />
                    Export JSONL
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {dataset.length === 0 ? (
                  <div className="py-24 text-center border border-dashed border-white/10 rounded-3xl">
                    <Database size={48} className="mx-auto text-white/10 mb-4" />
                    <p className="text-white/40">No entries yet. Start by searching for content.</p>
                  </div>
                ) : (
                  dataset.map((entry, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                      <div 
                        className="p-6 flex justify-between items-center cursor-pointer hover:bg-white/[0.02]"
                        onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                      >
                        <div className="flex gap-4 items-center">
                          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-orange-500 font-bold">
                            {idx + 1}
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">{entry.source.title}</h3>
                            <div className="flex gap-3 text-xs text-white/40 uppercase tracking-wider">
                              <span>{entry.source.channel}</span>
                              <span>•</span>
                              <span>{entry.source.date_watched}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex gap-1">
                            {entry.source.relevance_tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-2 py-1 bg-white/5 rounded text-[10px] text-white/60">{tag}</span>
                            ))}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeEntry(idx); }} className="text-white/20 hover:text-red-500 p-2">
                            <Trash2 size={16} />
                          </button>
                          {expandedIndex === idx ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </div>

                      {expandedIndex === idx && (
                        <div className="p-8 border-t border-white/10 bg-black/40 space-y-8">
                          {/* Techniques */}
                          <section>
                            <h4 className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-4">Techniques</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {entry.techniques.map((tech, tIdx) => (
                                <div key={tIdx} className="p-4 bg-white/5 rounded-xl border border-white/5">
                                  <div className="flex justify-between items-start mb-2">
                                    <h5 className="font-bold">{tech.name}</h5>
                                    <span className="text-[10px] px-2 py-1 bg-orange-500/20 text-orange-500 rounded uppercase">{tech.category}</span>
                                  </div>
                                  <p className="text-sm text-white/60 mb-3">{tech.description}</p>
                                  <div className="text-xs space-y-2">
                                    <div className="text-white/40 italic"><span className="text-white/60 font-bold not-italic">When:</span> {tech.when_to_use}</div>
                                    <div className="p-2 bg-black rounded font-mono text-orange-400/80">{tech.example_prompt}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>

                          {/* Training Pairs */}
                          <section>
                            <h4 className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-4">Training Pairs (Fine-tuning Signal)</h4>
                            <div className="space-y-3">
                              {entry.training_pairs.map((pair, pIdx) => (
                                <div key={pIdx} className="p-4 bg-white/5 rounded-xl border-l-4 border-orange-600">
                                  <div className="text-sm font-bold text-white/40 mb-1 italic">" {pair.instruction} "</div>
                                  <div className="text-sm text-white/80">{pair.response}</div>
                                </div>
                              ))}
                            </div>
                          </section>

                          <div className="flex justify-end">
                            <a 
                              href={entry.source.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-xs text-white/40 hover:text-white"
                            >
                              View Source <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
