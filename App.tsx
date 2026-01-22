
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
  UserRound,
  Headphones
} from 'lucide-react';
import { AppMode, BabyStatus, LULLABIES, FileData, AnalysisResult } from './types.ts';
import { GeminiService } from './services/gemini.ts';

declare const Peer: any;

const NOISE_POLL_INTERVAL = 250; 
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('ROLE_SELECTION');
  const modeRef = useRef<AppMode>('ROLE_SELECTION');
  const [parentView, setParentView] = useState<'FEED' | 'AI_INSIGHTS'>('FEED');
  const [status, setStatus] = useState<BabyStatus>({
    isCrying: false,
    noiseLevel: 0,
    lastEvent: 'System Ready',
    statusMessage: 'Nursery is quiet'
  });
  const statusRef = useRef(status);
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
  const isTalkingRef = useRef(false);
  const [isMuted, setIsMuted] = useState(true); 
  const [babyMicEnabled, setBabyMicEnabled] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);
  const [incomingVolume, setIncomingVolume] = useState(0);
  const [localMicVolume, setLocalMicVolume] = useState(0); 
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<FileData | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  // Persistent Refs for WebRTC
  const peerRef = useRef<any>(null);
  const dataConnRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  
  // Element Refs
  const babyIncomingAudioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // Logic Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const incomingAnalyserRef = useRef<AnalyserNode | null>(null);
  const localMicAnalyserRef = useRef<AnalyserNode | null>(null);
  const geminiRef = useRef<GeminiService | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    geminiRef.current = new GeminiService();
  }, []);

  // Visualizer Animation Loop
  useEffect(() => {
    let frameId: number;
    const dataArray = new Uint8Array(32);
    
    const loop = () => {
      if (incomingAnalyserRef.current && isTalkingRef.current) {
        incomingAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        setIncomingVolume(Math.round((sum / dataArray.length) / 255 * 100));
      } else {
        setIncomingVolume(0);
      }

      if (localMicAnalyserRef.current && isTalkingRef.current) {
        localMicAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        setLocalMicVolume(Math.round((sum / dataArray.length) / 255 * 100));
      } else {
        setLocalMicVolume(0);
      }
      frameId = requestAnimationFrame(loop);
    };
    
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Resilient handleData that uses Refs to avoid stale closure issues
  const handleIncomingData = useCallback((data: any) => {
    if (data.type === 'HEARTBEAT') return;
    
    if (data.type === 'PARENT_TALK_STATUS') {
      setIsTalking(data.isTalking);
      isTalkingRef.current = data.isTalking;
      
      // Force playback only if nursery audio is ready
      if (data.isTalking && babyIncomingAudioRef.current && audioUnlockedRef.current) {
        babyIncomingAudioRef.current.play().catch(() => {
          console.warn("Autoplay blocked or stream not ready during talk status update");
        });
      }
      return;
    }
    
    if (modeRef.current === 'PARENT_STATION') {
      if (data.noiseLevel !== undefined) {
        setStatus(data);
      }
    }
  }, []);

  const unlockAudio = async () => {
    console.log("Imperative audio unlock triggered...");
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Update state for UI, and Ref for persistent callbacks
      setAudioUnlocked(true);
      audioUnlockedRef.current = true;
      
      if (babyIncomingAudioRef.current) {
        babyIncomingAudioRef.current.muted = false;
        // Attempt immediate playback of existing stream if it exists
        if (babyIncomingAudioRef.current.srcObject) {
          await babyIncomingAudioRef.current.play();
        }
      }
    } catch (e) {
      console.error("Audio unlock sequence failed:", e);
    }
  };

  const setupAudioAnalysis = (stream: MediaStream, type: 'incoming' | 'local' | 'nursery') => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = type === 'nursery' ? 256 : 64;
      source.connect(analyser);
      
      if (type === 'incoming') incomingAnalyserRef.current = analyser;
      else if (type === 'local') localMicAnalyserRef.current = analyser;
      return analyser;
    } catch (e) {
      console.warn("Audio analysis setup failed:", e);
      return null;
    }
  };

  const createBlankVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 1, 1); }
    return (canvas as any).captureStream(1).getVideoTracks()[0];
  };

  // One-time Peer initialization when mode is set
  useEffect(() => {
    if (mode === 'ROLE_SELECTION') {
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      return;
    }

    if (peerRef.current) return;

    const startPeer = () => {
      if (typeof Peer === 'undefined') {
        setTimeout(startPeer, 500);
        return;
      }

      const id = mode === 'BABY_STATION' ? Math.floor(10000 + Math.random() * 90000).toString() : undefined;
      const peer = new Peer(id, { config: { iceServers: ICE_SERVERS }, debug: 1 });
      peerRef.current = peer;

      peer.on('open', (newId: string) => setPeerId(newId));
      
      peer.on('connection', (conn: any) => {
        dataConnRef.current = conn;
        conn.on('open', () => { setPeerConnected(true); setIsConnecting(false); });
        conn.on('data', handleIncomingData);
        conn.on('close', () => setPeerConnected(false));
      });

      peer.on('call', (call: any) => {
        activeCallRef.current = call;
        
        // Handle incoming stream differently based on station type
        if (mode === 'BABY_STATION') {
          // Baby station answers with nursery stream if available
          call.answer(streamRef.current || new MediaStream([createBlankVideoTrack()]));
        } else {
          // Parent station answers with blank (we only want baby stream)
          call.answer(new MediaStream([createBlankVideoTrack()]));
        }

        call.on('stream', (s: MediaStream) => {
          remoteStreamRef.current = s;
          if (mode === 'PARENT_STATION' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = s;
          } else if (mode === 'BABY_STATION' && babyIncomingAudioRef.current) {
            babyIncomingAudioRef.current.srcObject = s;
            setupAudioAnalysis(s, 'incoming');
            if (audioUnlockedRef.current) babyIncomingAudioRef.current.play().catch(() => {});
          }
          setPeerConnected(true);
        });

        call.on('close', () => {
          setPeerConnected(false);
          remoteStreamRef.current = null;
        });
      });

      peer.on('error', (err: any) => {
        console.error("PeerJS Connectivity Error:", err);
        if (err.type === 'peer-unavailable') setIsConnecting(false);
      });
    };

    startPeer();
  }, [mode, handleIncomingData]);

  const startNurseryMonitor = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsLive(true);

      const analyser = setupAudioAnalysis(stream, 'nursery');
      if (analyser) {
        const interval = setInterval(() => {
          if (modeRef.current !== 'BABY_STATION') { clearInterval(interval); return; }
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length / 255;
          const isCrying = avg > (0.4 - (sensitivityRef.current / 100) * 0.38);
          const newStatus = { 
            isCrying, 
            noiseLevel: Math.round(avg * 100), 
            lastEvent: isCrying ? 'Cry Alert' : 'Normal', 
            statusMessage: isCrying ? 'BABY IS CRYING' : 'Nursery is quiet' 
          };
          setStatus(newStatus);
          if (dataConnRef.current?.open) dataConnRef.current.send(newStatus);
        }, NOISE_POLL_INTERVAL);
      }
    } catch (e) {
      setStreamError("Hardware access denied.");
    }
  };

  const linkToNursery = async () => {
    if (!targetPeerId || !peerRef.current) return;
    setIsConnecting(true);
    
    try {
      const conn = peerRef.current.connect(targetPeerId, { reliable: true });
      dataConnRef.current = conn;
      conn.on('open', () => setPeerConnected(true));
      conn.on('data', handleIncomingData);

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localMicStreamRef.current = micStream;
      setupAudioAnalysis(micStream, 'local');
      
      // Warm up microphone connection
      micStream.getAudioTracks().forEach(t => t.enabled = true);
      setTimeout(() => { if(!isTalkingRef.current) micStream.getAudioTracks().forEach(t => t.enabled = false); }, 800);

      const call = peerRef.current.call(targetPeerId, new MediaStream([...micStream.getAudioTracks(), createBlankVideoTrack()]));
      activeCallRef.current = call;
      call.on('stream', (s: MediaStream) => {
        remoteStreamRef.current = s;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = s;
        setPeerConnected(true);
        setIsConnecting(false);
      });
    } catch (e) {
      setIsConnecting(false);
    }
  };

  const setParentMic = (enabled: boolean) => {
    setIsTalking(enabled);
    isTalkingRef.current = enabled;
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getAudioTracks().forEach(track => { track.enabled = enabled; });
    }
    if (dataConnRef.current?.open) {
      dataConnRef.current.send({ type: 'PARENT_TALK_STATUS', isTalking: enabled });
    }
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !geminiRef.current) return;
    setIsAnalyzing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setUploadedFile({ name: file.name, type: file.type, content });
      try {
        const result = await geminiRef.current!.analyzeFile({ name: file.name, type: file.type, content });
        setAnalysisResult(result);
      } catch (err) { console.error(err); } finally { setIsAnalyzing(false); }
    };
    if (file.type.startsWith('image/')) reader.readAsDataURL(file); else reader.readAsText(file);
  };

  const onQuestionAsk = async () => {
    if (!chatMessage.trim() || !uploadedFile || !geminiRef.current || isAsking) return;
    setChatHistory(prev => [...prev, { role: 'user', text: chatMessage }]);
    const question = chatMessage;
    setChatMessage('');
    setIsAsking(true);
    try {
      const response = await geminiRef.current.askQuestion(uploadedFile, question, chatHistory);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: "AI Service unavailable." }]);
    } finally { setIsAsking(false); }
  };

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-hidden">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-blue-900/40"><Baby className="w-8 h-8 text-white" /></div>
          <h1 className="text-3xl font-black tracking-tight mb-2">LULLABY AI</h1>
          <p className="text-slate-500 text-sm font-medium">Smart Nursery Ecosystem</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl w-full">
          <button onClick={() => setMode('BABY_STATION')} className="bg-slate-900/50 p-10 rounded-3xl border border-slate-800 flex flex-col items-center group transition-all hover:bg-slate-900 hover:border-blue-500/50">
            <Activity className="w-10 h-10 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold">Nursery Station</h3>
            <p className="text-slate-500 text-xs mt-2 font-medium">Transmitter Unit</p>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="bg-slate-900/50 p-10 rounded-3xl border border-slate-800 flex flex-col items-center group transition-all hover:bg-slate-900 hover:border-indigo-500/50">
            <Monitor className="w-10 h-10 text-indigo-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold">Parent Receiver</h3>
            <p className="text-slate-500 text-xs mt-2 font-medium">Monitoring Unit</p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`h-screen w-full ${stealthMode ? 'bg-black' : 'bg-slate-950'} flex flex-col relative overflow-hidden transition-colors duration-1000`}>
        <audio ref={babyIncomingAudioRef} autoPlay playsInline muted={false} />
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-white">
            <div className="bg-slate-900/40 p-10 rounded-3xl border border-slate-800 mb-8 w-full max-w-xs text-center shadow-inner">
              <span className="text-[10px] font-extrabold uppercase text-blue-500 mb-2 block tracking-widest">System Identifier</span>
              <div className="text-5xl font-mono font-black tracking-tighter text-white">{peerId || '-----'}</div>
            </div>
            <button onClick={startNurseryMonitor} className="bg-blue-600 px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest flex items-center gap-3 active:scale-95 transition-all shadow-xl shadow-blue-900/40 hover:bg-blue-500"><Power className="w-5 h-5" /> Activate Monitor</button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-8 text-slate-600 text-[10px] font-black uppercase tracking-[0.2em] hover:text-slate-400">Return to Menu</button>
          </div>
        ) : (
          <div className="flex-1 relative h-full">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            {!audioUnlocked && !stealthMode && (
              <div className="absolute inset-0 z-[60] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center">
                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mb-6 animate-pulse shadow-2xl shadow-blue-900/50"><Volume2 className="w-12 h-12 text-white" /></div>
                <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Link Nursery Speaker</h3>
                <p className="text-slate-400 text-sm mb-10 max-w-xs font-medium">Parent audio is currently muted. Tap below to hear when parents speak to the nursery.</p>
                <button onClick={unlockAudio} className="bg-blue-600 px-12 py-5 rounded-2xl font-black uppercase text-sm tracking-[0.1em] text-white shadow-xl hover:bg-blue-500 active:scale-95 transition-all">Link Audio Stream</button>
              </div>
            )}

            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/20 pointer-events-none flex flex-col items-center justify-center backdrop-blur-[2px]">
                <div className="bg-blue-600/90 backdrop-blur-md px-10 py-6 rounded-full flex items-center gap-6 shadow-2xl animate-in zoom-in duration-500 border border-white/20">
                  <div className="flex gap-2 items-end h-10">
                    <div className="w-3 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(8, incomingVolume * 0.9)}px` }} />
                    <div className="w-3 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(8, incomingVolume * 1.6)}px` }} />
                    <div className="w-3 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(8, incomingVolume * 0.8)}px` }} />
                  </div>
                  <span className="text-white font-black uppercase tracking-[0.15em] text-lg">Parent Active</span>
                </div>
              </div>
            )}

            <div className="absolute top-8 left-8 flex flex-col gap-3">
              <div className="bg-red-600 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg"><span className="w-2 h-2 bg-white rounded-full animate-pulse" /> Live Broadcast</div>
              <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-white/10 shadow-lg">{status.noiseLevel}% Ambient Noise</div>
              {audioUnlocked && <div className="bg-green-600/90 backdrop-blur-md px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-white/10 shadow-lg"><Headphones className="w-3.5 h-3.5" /> Speaker Linked</div>}
            </div>

            <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 transition-all duration-500 ${stealthMode ? 'opacity-0 scale-90' : 'opacity-100'}`}>
              <div className="bg-slate-900/80 backdrop-blur-xl p-3 rounded-3xl border border-white/10 flex items-center gap-3 shadow-2xl">
                <button onClick={() => { const ns = !babyMicEnabled; setBabyMicEnabled(ns); streamRef.current?.getAudioTracks().forEach(t => t.enabled = ns); }} className={`p-5 rounded-2xl transition-all shadow-lg ${babyMicEnabled ? 'bg-slate-800 text-white' : 'bg-red-600 text-white shadow-red-900/20'}`}>
                  {babyMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button onClick={() => setStealthMode(true)} className="p-5 rounded-2xl bg-blue-600 text-white flex items-center gap-3 px-8 font-black uppercase text-[11px] tracking-[0.15em] shadow-lg hover:bg-blue-500"><Lock className="w-4 h-4" /> Nursery Mode</button>
                <button onClick={() => setShowSettings(!showSettings)} className="p-5 rounded-2xl bg-slate-800 text-white shadow-lg hover:bg-slate-700"><Settings2 className="w-6 h-6" /></button>
              </div>
            </div>
            
            {stealthMode && (
              <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-12 animate-in fade-in duration-1000" onDoubleClick={() => setStealthMode(false)}>
                <Lock className="w-16 h-16 text-slate-900 mb-4" />
                <p className="text-slate-900 text-xs font-black uppercase tracking-[0.3em] text-center">Nursery Protection Active<br/><span className="text-[10px] mt-2 opacity-50 block">Double tap screen to unlock</span></p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col p-4 md:p-8 text-white overflow-hidden">
      <div className="flex items-center justify-between mb-6 h-14 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setMode('ROLE_SELECTION')} className="p-3 hover:bg-slate-900 rounded-2xl transition-colors bg-slate-900/50"><ChevronLeft className="w-6 h-6 text-slate-400" /></button>
          <div>
            <h2 className="text-lg font-black tracking-tight uppercase">Parent Receiver</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_10px_green]' : 'bg-slate-700'}`} />
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">{peerConnected ? 'Nursery Linked' : isConnecting ? 'Establishing Link...' : 'Signal Idle'}</span>
            </div>
          </div>
        </div>
        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
          <button onClick={() => setParentView('FEED')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${parentView === 'FEED' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-400'}`}>Monitor</button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-400'}`}>Health Hub</button>
        </div>
        <div className={`hidden md:flex px-6 py-3 rounded-2xl border items-center gap-3 transition-all duration-500 ${status.isCrying ? 'bg-red-500/10 border-red-500 text-red-500 shadow-lg shadow-red-900/10' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
          <Baby className={`w-5 h-5 ${status.isCrying ? 'animate-bounce' : ''}`} /> <span className="text-xs font-black uppercase tracking-widest">{status.statusMessage}</span>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
        {parentView === 'FEED' ? (
          <div className="flex-[3] flex flex-col gap-6 min-h-0">
            <div className={`flex-1 bg-black rounded-[2.5rem] border overflow-hidden relative transition-all duration-700 ${status.isCrying ? 'border-red-500 ring-[8px] ring-red-500/30' : 'border-slate-800/50 shadow-2xl shadow-black'}`}>
              <video ref={remoteVideoRef} autoPlay playsInline muted={isMuted} className="w-full h-full object-cover" />
              
              {peerConnected && isMuted && (
                <div onClick={() => setIsMuted(false)} className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[4px] cursor-pointer group transition-all">
                  <div className="bg-blue-600 p-8 rounded-full mb-6 shadow-2xl transition-transform group-hover:scale-110 shadow-blue-900/50"><VolumeX className="w-10 h-10 text-white" /></div>
                  <p className="text-white font-black uppercase tracking-[0.2em] text-sm animate-pulse">Activate Nursery Audio</p>
                </div>
              )}
              
              {!peerConnected && !isConnecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-950/95 backdrop-blur-md text-center">
                  <div className="bg-slate-900/50 p-12 rounded-[3rem] border border-slate-800 w-full max-w-md shadow-2xl">
                    <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6"><Link2 className="w-10 h-10 text-blue-500" /></div>
                    <h3 className="text-2xl font-black uppercase tracking-tight mb-8">Establish Connection</h3>
                    <div className="flex flex-col gap-4">
                      <input type="text" maxLength={5} placeholder="NURSERY ID" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="bg-slate-950 border border-slate-800 rounded-3xl px-6 py-6 text-center text-4xl font-mono font-black text-blue-500 outline-none focus:border-blue-500 transition-all shadow-inner tracking-[0.1em]" />
                      <button onClick={linkToNursery} className="bg-blue-600 py-6 rounded-3xl shadow-xl shadow-blue-900/40 hover:bg-blue-500 active:scale-95 transition-all font-black uppercase tracking-widest flex items-center justify-center gap-3 mt-2"><Play className="w-6 h-6" /> Start Secure Feed</button>
                    </div>
                  </div>
                </div>
              )}

              {peerConnected && (
                <button onClick={() => setIsMuted(!isMuted)} className={`absolute top-6 right-6 p-4 rounded-2xl backdrop-blur-xl transition-all shadow-2xl z-10 border ${isMuted ? 'bg-red-600 border-red-400' : 'bg-slate-900/40 border-white/10'}`}>
                  {isMuted ? <VolumeX className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
                </button>
              )}
            </div>

            <div className="h-32 shrink-0 relative">
              <button 
                onMouseDown={() => setParentMic(true)} 
                onMouseUp={() => setParentMic(false)} 
                onMouseLeave={() => setParentMic(false)}
                onTouchStart={(e) => { e.preventDefault(); setParentMic(true); }}
                onTouchEnd={(e) => { e.preventDefault(); setParentMic(false); }}
                className={`w-full h-full rounded-[2.5rem] border-2 transition-all flex items-center justify-center gap-8 active:scale-[0.97] ${isTalking ? 'bg-blue-600 border-blue-400 shadow-2xl shadow-blue-900/60' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-30 pointer-events-none'}`}
              >
                <div className="relative">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isTalking ? 'bg-white text-blue-600 shadow-2xl' : 'bg-slate-800 text-slate-500'}`}>
                    {isTalking ? <Mic className="w-10 h-10 animate-pulse" /> : <MicOff className="w-10 h-10" />}
                  </div>
                  {isTalking && (
                    <div className="absolute -right-4 top-2 bottom-2 w-2 bg-white/30 rounded-full overflow-hidden">
                      <div className="w-full bg-white absolute bottom-0 transition-all duration-75" style={{ height: `${localMicVolume}%` }} />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-[11px] font-black uppercase tracking-[0.25em] mb-1 ${isTalking ? 'text-blue-100' : 'text-slate-500'}`}>{isTalking ? 'MIC OPEN' : 'SYSTEM READY'}</p>
                  <h3 className="text-3xl font-black uppercase tracking-tighter">{isTalking ? 'SPEAKING...' : 'HOLD TO TALK'}</h3>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-slate-900/30 rounded-[3rem] border border-slate-800 p-8 flex flex-col lg:flex-row gap-8 overflow-hidden">
            <div className="flex-[2] overflow-y-auto custom-scrollbar pr-4">
              <div className="bg-slate-900 p-12 rounded-[2.5rem] text-center border border-slate-800 shadow-2xl">
                <div className="w-24 h-24 bg-blue-600/10 rounded-[2rem] flex items-center justify-center mx-auto mb-6"><BrainCircuit className="w-12 h-12 text-blue-500" /></div>
                <h3 className="text-3xl font-black uppercase tracking-tight mb-3">AI Diagnostic Lab</h3>
                <p className="text-slate-500 text-sm mb-10 font-medium max-w-sm mx-auto">Upload clinical sleep logs, nursery photos, or biometric data for advanced pediatric analysis.</p>
                <input type="file" onChange={onFileUpload} className="hidden" id="file-up" />
                <label htmlFor="file-up" className="bg-blue-600 px-10 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] flex items-center gap-4 mx-auto mt-4 cursor-pointer hover:bg-blue-500 transition-all inline-flex shadow-xl shadow-blue-900/30 active:scale-95">
                  <Upload className="w-5 h-5" /> {isAnalyzing ? 'Processing Intelligence...' : 'Upload Data Unit'}
                </label>
              </div>
              {analysisResult && (
                <div className="mt-10 space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-700">
                  <div className="bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 shadow-xl">
                    <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3"><Sparkles className="w-5 h-5" /> Intelligence Synthesis</h4>
                    <p className="text-slate-300 text-lg leading-relaxed font-medium">{analysisResult.summary}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 bg-slate-950/80 rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)]">
               <div className="p-6 border-b border-slate-800 flex items-center gap-4 bg-slate-900/30">
                 <MessageSquare className="w-6 h-6 text-blue-500" />
                 <span className="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Assistant Core</span>
               </div>
               <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
                 {chatHistory.length === 0 && (
                   <div className="text-center mt-20 px-8">
                     <p className="text-slate-600 text-sm font-medium italic">"Waiting for context. Upload a data unit to begin pediatric consultation."</p>
                   </div>
                 )}
                 {chatHistory.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[90%] p-5 rounded-[1.5rem] text-sm leading-relaxed font-medium ${chat.role === 'user' ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>{chat.text}</div>
                   </div>
                 ))}
                 {isAsking && (
                    <div className="p-5 bg-slate-800 w-20 rounded-[1.5rem] flex gap-2 justify-center">
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                 )}
               </div>
               <div className="p-5 bg-slate-900 border-t border-slate-800 flex gap-4">
                 <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onQuestionAsk()} placeholder="Ask specific questions..." className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4.5 text-sm outline-none focus:border-blue-600 transition-all font-medium placeholder:text-slate-700" />
                 <button onClick={onQuestionAsk} disabled={!chatMessage.trim()} className="p-4.5 bg-blue-600 rounded-2xl hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-30 shadow-lg shadow-blue-900/30"><Send className="w-6 h-6" /></button>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
