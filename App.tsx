
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Baby, 
  Monitor, 
  Mic, 
  MicOff, 
  ChevronLeft, 
  Play, 
  RefreshCw, 
  Bell, 
  Radio, 
  Link2, 
  Copy, 
  Check, 
  EyeOff, 
  Eye, 
  Power, 
  Activity, 
  Volume2, 
  VolumeX, 
  Zap, 
  MessageSquare, 
  SwitchCamera,
  AlertTriangle,
  XCircle,
  Waves,
  Volume1,
  Settings2,
  Sliders,
  Wifi,
  WifiOff,
  Gauge,
  Lock,
  Unlock,
  BatteryCharging,
  Info,
  ShieldAlert,
  BrainCircuit,
  Upload,
  FileText,
  Send,
  Sparkles,
  TrendingUp,
  History,
  Volume,
  UserRound
} from 'lucide-react';
import { AppMode, BabyStatus, LULLABIES, FileData, AnalysisResult } from './types.ts';
import { GeminiService } from './services/gemini.ts';

declare const Peer: any;

const NOISE_POLL_INTERVAL = 200; 
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('ROLE_SELECTION');
  const [parentView, setParentView] = useState<'FEED' | 'AI_INSIGHTS'>('FEED');
  const [status, setStatus] = useState<BabyStatus>({
    isCrying: false,
    noiseLevel: 0,
    lastEvent: 'System Ready',
    statusMessage: 'Nursery is quiet'
  });
  const [sensitivity, setSensitivity] = useState(60);
  const sensitivityRef = useRef(60);
  
  const [isLive, setIsLive] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [targetPeerId, setTargetPeerId] = useState<string>('');
  const [peerConnected, setPeerConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isMuted, setIsMuted] = useState(true); 
  const [babyMicEnabled, setBabyMicEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [streamError, setStreamError] = useState<string | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<FileData | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  const babyMicEnabledRef = useRef(true);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const babyIncomingAudioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<any>(null);
  const dataConnRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const pendingCallRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);
  const geminiRef = useRef<GeminiService | null>(null);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    geminiRef.current = new GeminiService();
  }, []);

  useEffect(() => {
    if (mode === 'PARENT_STATION' && remoteVideoRef.current && remoteStream) {
      console.log("Attaching remote stream to Parent station");
      remoteVideoRef.current.srcObject = remoteStream;
    } else if (mode === 'BABY_STATION' && babyIncomingAudioRef.current && remoteStream) {
      console.log("Attaching remote stream to Baby station audio output");
      babyIncomingAudioRef.current.srcObject = remoteStream;
      // Force play for browsers that block dynamic audio attachment
      babyIncomingAudioRef.current.play().catch(e => console.warn("Audio play blocked:", e));
    }
  }, [remoteStream, mode]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const toggleParentMic = (enabled: boolean) => {
    setIsTalking(enabled);
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log(`Parent mic ${enabled ? 'ENABLED' : 'DISABLED'}`);
    } else {
      console.warn("No local mic stream found to toggle");
    }
    
    // Notify baby station about parent talking status if data connection is open
    if (dataConnRef.current?.open) {
      dataConnRef.current.send({ type: 'PARENT_TALK_STATUS', isTalking: enabled });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !geminiRef.current) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setChatHistory([]);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const fileData: FileData = {
        name: file.name,
        type: file.type,
        content: content
      };
      setUploadedFile(fileData);
      try {
        const result = await geminiRef.current!.analyzeFile(fileData);
        setAnalysisResult(result);
      } catch (err) {
        console.error("AI Analysis failed", err);
      } finally {
        setIsAnalyzing(false);
      }
    };

    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleAskQuestion = async () => {
    if (!chatMessage.trim() || !uploadedFile || !geminiRef.current || isAsking) return;

    const userMsg = { role: 'user', text: chatMessage };
    setChatHistory(prev => [...prev, userMsg]);
    setChatMessage('');
    setIsAsking(true);

    try {
      const response = await geminiRef.current.askQuestion(uploadedFile, chatMessage, chatHistory);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: "Error connecting to AI. Please try again." }]);
    } finally {
      setIsAsking(false);
    }
  };

  const createBlankVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 1, 1); }
    const stream = (canvas as any).captureStream(1);
    return stream.getVideoTracks()[0];
  };

  const handleDataConnection = useCallback((conn: any) => {
    if (dataConnRef.current) dataConnRef.current.close();
    dataConnRef.current = conn;
    conn.on('open', () => { setPeerConnected(true); setIsConnecting(false); lastHeartbeatRef.current = Date.now(); });
    conn.on('data', (data: any) => {
      lastHeartbeatRef.current = Date.now();
      if (data.type === 'HEARTBEAT') return;
      if (data.type === 'PARENT_TALK_STATUS') {
        setIsTalking(data.isTalking);
        return;
      }
      if (mode === 'PARENT_STATION') setStatus(data);
    });
    conn.on('error', () => setPeerConnected(false));
    conn.on('close', () => { setPeerConnected(false); dataConnRef.current = null; });
  }, [mode]);

  const initPeer = useCallback((customId?: string) => {
    if (typeof Peer === 'undefined') {
      console.warn("PeerJS not loaded yet, retrying...");
      setTimeout(() => initPeer(customId), 1000);
      return;
    }
    if (peerRef.current) peerRef.current.destroy();
    const peer = new Peer(mode === 'BABY_STATION' ? (customId || Math.floor(10000 + Math.random() * 90000).toString()) : undefined, {
      config: { iceServers: ICE_SERVERS },
      debug: 1
    });
    peerRef.current = peer;
    peer.on('open', (id: string) => setPeerId(id));
    peer.on('disconnected', () => peer.reconnect());
    peer.on('error', (err: any) => { if (err.type === 'network' || err.type === 'server-error') setIsConnecting(false); });
    peer.on('connection', (conn: any) => handleDataConnection(conn));
    peer.on('call', (call: any) => {
      console.log("Receiving incoming call...");
      activeCallRef.current = call;
      if (mode === 'BABY_STATION') {
        if (!streamRef.current) { 
          console.log("Call received but camera not started. Queuing call.");
          pendingCallRef.current = call; 
          return; 
        }
        streamRef.current.getAudioTracks().forEach(t => t.enabled = babyMicEnabledRef.current);
        call.answer(streamRef.current);
      } else {
        call.answer(new MediaStream([createBlankVideoTrack()]));
      }
      call.on('stream', (s: MediaStream) => { 
        console.log("Received remote stream from call");
        setRemoteStream(s); 
        setPeerConnected(true); 
      });
      call.on('close', () => { setRemoteStream(null); activeCallRef.current = null; });
    });
  }, [mode, handleDataConnection]);

  useEffect(() => {
    if (mode !== 'ROLE_SELECTION') initPeer();
    return () => {
      peerRef.current?.destroy();
      dataConnRef.current?.close();
      activeCallRef.current?.close();
      localMicStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [mode, initPeer]);

  const startAudioAnalysis = (stream: MediaStream) => {
    if (audioContextRef.current) audioContextRef.current.close();
    if (analysisIntervalRef.current) window.clearInterval(analysisIntervalRef.current);
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const checkNoise = () => {
      if (!analyserRef.current) return;
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length / 255; 
      const currentThreshold = 0.4 - (sensitivityRef.current / 100) * 0.38;
      const isCrying = average > currentThreshold;
      const newStatus = { isCrying, noiseLevel: Math.round(average * 100), lastEvent: isCrying ? 'Cry Alert' : 'Normal', statusMessage: isCrying ? 'BABY IS CRYING' : 'Nursery is quiet' };
      if (mode === 'BABY_STATION') {
        setStatus(newStatus);
        if (dataConnRef.current?.open) dataConnRef.current.send(newStatus);
      }
    };
    analysisIntervalRef.current = window.setInterval(checkNoise, NOISE_POLL_INTERVAL);
  };

  const startMonitoring = async (targetFacingMode: 'user' | 'environment' = facingMode) => {
    setStreamError(null);
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: targetFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      stream.getAudioTracks().forEach(t => t.enabled = babyMicEnabledRef.current);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      startAudioAnalysis(stream);
      if (pendingCallRef.current) {
        console.log("Answering queued call with active stream");
        pendingCallRef.current.answer(stream);
        pendingCallRef.current = null;
      }
      setIsLive(true);
    } catch (err) { setStreamError("Camera access required."); }
  };

  const connectToBaby = async () => {
    if (!targetPeerId || !peerRef.current) return;
    setIsConnecting(true);
    try {
      const conn = peerRef.current.connect(targetPeerId, { reliable: true });
      handleDataConnection(conn);
      let localStreamForCall;
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localMicStreamRef.current = micStream;
        // Mic starts muted for parent station (push to talk mode)
        micStream.getAudioTracks().forEach(t => t.enabled = false);
        localStreamForCall = new MediaStream([...micStream.getAudioTracks(), createBlankVideoTrack()]);
      } catch (err) { 
        console.warn("Microphone access denied or failed", err);
        localStreamForCall = new MediaStream([createBlankVideoTrack()]); 
      }
      const call = peerRef.current.call(targetPeerId, localStreamForCall);
      activeCallRef.current = call;
      call.on('stream', (s: MediaStream) => { 
        console.log("Received remote feed from nursery");
        setRemoteStream(s); 
        setPeerConnected(true); 
        setIsConnecting(false); 
      });
      call.on('error', (e: any) => {
        console.error("Call linking error:", e);
        setIsConnecting(false);
      });
    } catch (err) { 
      console.error("Connection sequence failed:", err);
      setIsConnecting(false); 
    }
  };

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-hidden">
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-900/40"><Baby className="w-8 h-8 text-white" /></div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Lullaby AI</h1>
          <p className="text-slate-400 text-sm">Select station mode to begin</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
          <button onClick={() => setMode('BABY_STATION')} className="group bg-slate-900/50 hover:bg-slate-900 p-8 rounded-3xl border border-slate-800 transition-all flex flex-col items-center text-center">
            <Activity className="w-8 h-8 text-blue-500 mb-4 group-hover:scale-110" />
            <h3 className="text-xl font-semibold mb-1">Baby Station</h3>
            <p className="text-slate-500 text-xs">Transmitter for nursery</p>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="group bg-slate-900/50 hover:bg-slate-900 p-8 rounded-3xl border border-slate-800 transition-all flex flex-col items-center text-center">
            <Monitor className="w-8 h-8 text-indigo-500 mb-4 group-hover:scale-110" />
            <h3 className="text-xl font-semibold mb-1">Parent Station</h3>
            <p className="text-slate-500 text-xs">Receiver for monitoring</p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`h-screen w-full ${stealthMode ? 'bg-black' : 'bg-slate-950'} flex flex-col transition-colors duration-1000 overflow-hidden relative`}>
        <audio ref={babyIncomingAudioRef} autoPlay playsInline />
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white">
            <div className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800 mb-8 w-full max-w-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-2 block">Pairing Code</span>
              <div className="text-5xl font-mono font-bold tracking-tighter mb-4">{peerId || '-----'}</div>
              <button onClick={() => { navigator.clipboard.writeText(peerId); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className="text-xs text-slate-500 flex items-center gap-2 mx-auto">
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button onClick={() => startMonitoring()} className="bg-blue-600 hover:bg-blue-500 px-8 py-4 rounded-2xl font-bold flex items-center gap-3">
              <Power className="w-5 h-5" /> Start Monitor
            </button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-6 text-slate-500 text-xs font-bold uppercase">Exit</button>
          </div>
        ) : (
          <div className="flex-1 relative flex flex-col">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            {/* Visual indicator when parent is talking */}
            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/10 pointer-events-none flex items-center justify-center">
                <div className="bg-blue-600/80 backdrop-blur-md px-6 py-4 rounded-full flex items-center gap-4 animate-in zoom-in duration-300">
                  <div className="flex gap-1 items-center">
                    <div className="w-1.5 h-4 bg-white rounded-full animate-[bounce_1s_infinite]" />
                    <div className="w-1.5 h-8 bg-white rounded-full animate-[bounce_0.8s_infinite]" />
                    <div className="w-1.5 h-5 bg-white rounded-full animate-[bounce_1.2s_infinite]" />
                  </div>
                  <span className="text-white font-bold uppercase tracking-widest text-sm">Parent is speaking...</span>
                </div>
              </div>
            )}

            {stealthMode && (
              <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-12 text-center" onDoubleClick={() => setStealthMode(false)}>
                <Lock className="w-12 h-12 text-slate-900 mb-6" />
                <h2 className="text-slate-900 text-sm font-bold uppercase">Nursery Mode Active</h2>
                <p className="text-slate-900 text-[10px] mt-4">Double tap to unlock.</p>
              </div>
            )}
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              <div className="bg-red-600 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2"><span className="w-2 h-2 bg-white rounded-full animate-pulse" /> Live</div>
              <div className="bg-slate-900/80 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 border border-white/10">{status.noiseLevel}% Noise</div>
            </div>
            <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 ${stealthMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div className="bg-slate-900/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 flex items-center gap-2">
                <button onClick={() => { const ns = !babyMicEnabled; setBabyMicEnabled(ns); babyMicEnabledRef.current = ns; streamRef.current?.getAudioTracks().forEach(t => t.enabled = ns); }} className={`p-4 rounded-xl ${babyMicEnabled ? 'text-white' : 'bg-red-500 text-white'}`}>
                  {babyMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button onClick={() => setStealthMode(true)} className="p-4 rounded-xl bg-slate-800 text-white flex items-center gap-2 px-6">
                  <Lock className="w-5 h-5" /> <span className="text-[10px] font-bold uppercase">Nursery Mode</span>
                </button>
                <button onClick={() => setShowSettings(!showSettings)} className="p-4 rounded-xl text-white"><Settings2 className="w-5 h-5" /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PARENT STATION UI
  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col p-4 md:p-6 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 h-12 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode('ROLE_SELECTION')} className="p-2 hover:bg-slate-900 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5 text-slate-400" /></button>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Parent Station</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_8px_green]' : 'bg-slate-600'}`} />
              <span className="text-[10px] font-bold text-slate-500 uppercase">{peerConnected ? 'Connected' : isConnecting ? 'Linking...' : 'Offline'}</span>
              {!isMuted && peerConnected && (
                <div className="flex items-center gap-0.5 ml-1">
                  <div className="w-0.5 h-2 bg-green-400 rounded-full animate-[bounce_1s_infinite]" />
                  <div className="w-0.5 h-3 bg-green-400 rounded-full animate-[bounce_0.8s_infinite]" />
                  <div className="w-0.5 h-2 bg-green-400 rounded-full animate-[bounce_1.2s_infinite]" />
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button onClick={() => setParentView('FEED')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${parentView === 'FEED' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
            <Activity className="w-3.5 h-3.5" /> Feed
          </button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
            <BrainCircuit className="w-3.5 h-3.5" /> AI Insights
          </button>
        </div>

        <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${status.isCrying ? 'bg-red-500/10 border-red-500 text-red-500 animate-pulse' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
          <Baby className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase">{status.statusMessage}</span>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {parentView === 'FEED' ? (
          <>
            <div className="flex-[3] flex flex-col gap-4 min-h-0">
              <div className={`flex-1 bg-black rounded-3xl border overflow-hidden relative transition-all duration-500 ${status.isCrying ? 'border-red-500 ring-4 ring-red-500/50 animate-alert-border' : 'border-slate-800/50'}`}>
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  muted={isMuted}
                  className="w-full h-full object-cover" 
                />
                
                {peerConnected && isMuted && (
                  <div 
                    onClick={() => setIsMuted(false)}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer group"
                  >
                    <div className="bg-blue-600 p-6 rounded-full shadow-2xl shadow-blue-900/40 mb-4 group-hover:scale-110 transition-transform">
                      <VolumeX className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-white font-bold uppercase tracking-widest text-sm animate-pulse">Tap to Unmute Audio</p>
                  </div>
                )}

                {!peerConnected && !isConnecting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm text-center">
                    <Link2 className="w-8 h-8 text-slate-700 mb-4" />
                    <h3 className="text-lg font-bold mb-4">Pair Nursery Device</h3>
                    <div className="flex gap-2 w-full max-w-xs">
                      <input type="text" maxLength={5} placeholder="00000" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-center text-xl font-mono font-bold text-blue-500" />
                      <button onClick={connectToBaby} className="bg-blue-600 px-5 rounded-xl"><Play className="w-5 h-5" /></button>
                    </div>
                  </div>
                )}

                {peerConnected && (
                  <button 
                    onClick={() => setIsMuted(!isMuted)} 
                    className={`absolute top-4 right-4 p-3 rounded-xl backdrop-blur-md transition-all z-10 ${
                      isMuted 
                        ? 'bg-red-500 text-white shadow-lg shadow-red-900/20' 
                        : 'bg-black/40 text-white border border-white/10 hover:bg-black/60'
                    }`}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                )}
              </div>
              <div className="h-24 sm:h-28 shrink-0">
                <button 
                  onMouseDown={() => toggleParentMic(true)} 
                  onMouseUp={() => toggleParentMic(false)} 
                  onMouseLeave={() => toggleParentMic(false)}
                  onTouchStart={(e) => { e.preventDefault(); toggleParentMic(true); }}
                  onTouchEnd={(e) => { e.preventDefault(); toggleParentMic(false); }}
                  onTouchCancel={(e) => { e.preventDefault(); toggleParentMic(false); }}
                  className={`w-full h-full rounded-2xl border transition-all flex items-center justify-center gap-4 active:scale-[0.98] ${isTalking ? 'bg-blue-600 border-blue-400' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isTalking ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-400'}`}>
                    {isTalking ? <Mic className="w-6 h-6 animate-pulse" /> : <MicOff className="w-6 h-6" />}
                  </div>
                  <div className="text-left">
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${isTalking ? 'text-blue-200' : 'text-slate-500'}`}>Push to Talk</p>
                    <h3 className="text-lg font-bold">{isTalking ? 'Nursery listening...' : 'Hold to Speak'}</h3>
                  </div>
                </button>
              </div>
            </div>
            <div className="flex-1 hidden lg:flex flex-col gap-4">
              <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl p-4 flex flex-col">
                <span className="text-[10px] font-bold uppercase text-slate-500 mb-4">Quick Lullabies</span>
                <div className="space-y-2 overflow-y-auto custom-scrollbar">
                  {LULLABIES.map(l => (
                    <button key={l.id} className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500 transition-all text-left flex items-center justify-between group">
                      <div><p className="text-xs font-bold group-hover:text-blue-400">{l.name}</p><p className="text-[10px] text-slate-600">{l.description}</p></div>
                      <Play className="w-3 h-3 text-slate-700 group-hover:text-blue-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 bg-slate-900/30 rounded-3xl border border-slate-800 p-6 overflow-hidden">
            <div className="flex-[2] flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
                <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4"><BrainCircuit className="w-6 h-6 text-blue-500" /></div>
                <h3 className="text-xl font-bold mb-2">Health & Sleep Analysis</h3>
                <p className="text-slate-400 text-sm mb-6">Upload logs or photos of sleep charts for AI-powered pediatric insights.</p>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.csv,.jpg,.jpeg,.png" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto transition-all">
                  <Upload className="w-4 h-4" /> {isAnalyzing ? 'Analyzing...' : 'Upload Data'}
                </button>
              </div>

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-12 animate-pulse">
                  <Sparkles className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                  <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Processing Intelligence...</p>
                </div>
              )}

              {analysisResult && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h4 className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5" /> Summary
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">{analysisResult.summary}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <h4 className="text-xs font-bold text-green-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5" /> Key Insights
                      </h4>
                      <ul className="space-y-3">
                        {analysisResult.keyInsights.map((insight, idx) => (
                          <li key={idx} className="flex gap-3 text-sm text-slate-400">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0 mt-1.5" />
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <h4 className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5" /> Charted Data
                      </h4>
                      {analysisResult.visualizations.map((viz, idx) => (
                        <div key={idx} className="mb-4 last:mb-0">
                          <p className="text-[10px] text-slate-500 uppercase mb-2 font-bold">{viz.label}</p>
                          <div className="space-y-2">
                            {viz.data.map((d, i) => {
                              const maxVal = Math.max(...viz.data.map(x => x.value));
                              const pct = (d.value / maxVal) * 100;
                              return (
                                <div key={i}>
                                  <div className="flex justify-between text-[10px] mb-1">
                                    <span className="text-slate-400">{d.name}</span>
                                    <span className="text-slate-200">{d.value}</span>
                                  </div>
                                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col bg-slate-950/50 rounded-2xl border border-slate-800/50 overflow-hidden">
              <div className="p-4 border-bottom border-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold uppercase tracking-widest">Ask Assistant</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatHistory.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30 px-6">
                    <History className="w-8 h-8 mb-2" />
                    <p className="text-xs">Ask specific questions about the uploaded data here.</p>
                  </div>
                )}
                {chatHistory.map((chat, idx) => (
                  <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${chat.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      {chat.text}
                    </div>
                  </div>
                ))}
                {isAsking && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 p-3 rounded-2xl flex gap-1 animate-pulse">
                      <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
                <input 
                  type="text" 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder={uploadedFile ? "Ask about the data..." : "Upload a file first"} 
                  disabled={!uploadedFile || isAsking}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500 disabled:opacity-50" 
                />
                <button 
                  onClick={handleAskQuestion}
                  disabled={!uploadedFile || isAsking || !chatMessage.trim()}
                  className="p-2.5 bg-blue-600 rounded-xl hover:bg-blue-500 transition-all disabled:opacity-30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
