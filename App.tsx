
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
  
  // Audio state management
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
  const persistentPeerIdRef = useRef<string | null>(null);

  // Audio Processing Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const incomingAnalyserRef = useRef<AnalyserNode | null>(null);
  const localMicAnalyserRef = useRef<AnalyserNode | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);
  const geminiRef = useRef<GeminiService | null>(null);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    geminiRef.current = new GeminiService();
  }, []);

  // Handle stream attachment and visualization
  useEffect(() => {
    if (mode === 'PARENT_STATION' && remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    } else if (mode === 'BABY_STATION' && babyIncomingAudioRef.current && remoteStream) {
      if (babyIncomingAudioRef.current.srcObject !== remoteStream) {
        babyIncomingAudioRef.current.srcObject = remoteStream;
      }
      
      if (!incomingAnalyserRef.current) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioCtx.createMediaStreamSource(remoteStream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          incomingAnalyserRef.current = analyser;
          audioContextRef.current = audioCtx; 
        } catch (e) {
          console.warn("Incoming visualizer setup failed:", e);
        }
      }

      if (audioUnlocked) {
        babyIncomingAudioRef.current.play().catch(e => console.warn("Audio play blocked:", e));
      }
    }
  }, [remoteStream, mode, audioUnlocked]);

  // Visualizer loop for Baby Station (Incoming from Parent)
  useEffect(() => {
    let animationFrame: number;
    const dataArray = new Uint8Array(32);
    
    const updateLevels = () => {
      if (incomingAnalyserRef.current && isTalking) {
        incomingAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        setIncomingVolume(Math.round((sum / dataArray.length) / 255 * 100));
      } else {
        setIncomingVolume(0);
      }
      animationFrame = requestAnimationFrame(updateLevels);
    };
    
    updateLevels();
    return () => cancelAnimationFrame(animationFrame);
  }, [isTalking]);

  // Visualizer loop for Parent Station (Local Mic Check)
  useEffect(() => {
    let animationFrame: number;
    const dataArray = new Uint8Array(32);
    
    const updateLocalLevels = () => {
      if (localMicAnalyserRef.current && isTalking) {
        localMicAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        setLocalMicVolume(Math.round((sum / dataArray.length) / 255 * 100));
      } else {
        setLocalMicVolume(0);
      }
      animationFrame = requestAnimationFrame(updateLocalLevels);
    };
    
    if (mode === 'PARENT_STATION') updateLocalLevels();
    return () => cancelAnimationFrame(animationFrame);
  }, [isTalking, mode]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const unlockAudio = async () => {
    try {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      setAudioUnlocked(true);
      audioUnlockedRef.current = true;
      if (babyIncomingAudioRef.current) {
        babyIncomingAudioRef.current.muted = false;
        await babyIncomingAudioRef.current.play();
      }
    } catch (e) {
      console.warn("Unlock audio failed:", e);
    }
  };

  const toggleParentMic = (enabled: boolean) => {
    setIsTalking(enabled);
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
    
    if (dataConnRef.current?.open) {
      dataConnRef.current.send({ type: 'PARENT_TALK_STATUS', isTalking: enabled });
    }
  };

  const handleDataConnection = useCallback((conn: any) => {
    if (dataConnRef.current && dataConnRef.current !== conn) {
        dataConnRef.current.close();
    }
    dataConnRef.current = conn;
    
    conn.on('open', () => { 
      setPeerConnected(true); 
      setIsConnecting(false); 
      lastHeartbeatRef.current = Date.now(); 
    });
    
    conn.on('data', (data: any) => {
      lastHeartbeatRef.current = Date.now();
      if (data.type === 'HEARTBEAT') return;
      if (data.type === 'PARENT_TALK_STATUS') {
        setIsTalking(data.isTalking);
        if (data.isTalking && babyIncomingAudioRef.current && audioUnlockedRef.current) {
          babyIncomingAudioRef.current.play().catch(() => {});
        }
        return;
      }
      // Status updates only relevant for parent viewing baby
      setStatus(prev => {
          if (data.noiseLevel !== undefined) return data;
          return prev;
      });
    });
    
    conn.on('error', () => setPeerConnected(false));
    conn.on('close', () => { setPeerConnected(false); dataConnRef.current = null; });
  }, []); // Stable callback

  const initPeer = useCallback((customId?: string) => {
    if (typeof Peer === 'undefined') {
      setTimeout(() => initPeer(customId), 1000);
      return;
    }
    
    if (peerRef.current) return; // Prevent double init

    const id = mode === 'BABY_STATION' ? (customId || persistentPeerIdRef.current || Math.floor(10000 + Math.random() * 90000).toString()) : undefined;
    if (mode === 'BABY_STATION' && !persistentPeerIdRef.current) {
        persistentPeerIdRef.current = id as string;
    }

    const peer = new Peer(id, {
      config: { iceServers: ICE_SERVERS },
      debug: 1
    });
    
    peerRef.current = peer;
    
    peer.on('open', (newId: string) => {
        setPeerId(newId);
    });
    
    peer.on('disconnected', () => peer.reconnect());
    
    peer.on('error', (err: any) => { 
        console.error("PeerJS Error:", err);
        if (err.type === 'network' || err.type === 'server-error') setIsConnecting(false); 
    });
    
    peer.on('connection', (conn: any) => handleDataConnection(conn));
    
    peer.on('call', (call: any) => {
      console.log("Incoming call detected...");
      activeCallRef.current = call;
      if (mode === 'BABY_STATION') {
        if (!streamRef.current) { 
          pendingCallRef.current = call; 
          return; 
        }
        streamRef.current.getAudioTracks().forEach(t => t.enabled = babyMicEnabledRef.current);
        call.answer(streamRef.current);
      } else {
        // Parent answering nursery feed call (usually nursery initiates if previously connected, 
        // but here parent usually initiates). If nursery calls back:
        call.answer(new MediaStream([createBlankVideoTrack()]));
      }
      
      call.on('stream', (s: MediaStream) => { 
        setRemoteStream(s); 
        setPeerConnected(true); 
      });
      
      call.on('close', () => { 
          setRemoteStream(null); 
          activeCallRef.current = null; 
      });
    });
  }, [mode, handleDataConnection]);

  useEffect(() => {
    if (mode !== 'ROLE_SELECTION') {
        initPeer();
    }
    return () => {
      // Only destroy if changing mode back to role selection
      if (mode === 'ROLE_SELECTION') {
          peerRef.current?.destroy();
          peerRef.current = null;
          dataConnRef.current?.close();
          dataConnRef.current = null;
          activeCallRef.current?.close();
          activeCallRef.current = null;
          localMicStreamRef.current?.getTracks().forEach(t => t.stop());
          persistentPeerIdRef.current = null;
      }
    };
  }, [mode, initPeer]);

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
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      const checkNoise = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length / 255; 
        const isCrying = average > (0.4 - (sensitivityRef.current / 100) * 0.38);
        const newStatus = { isCrying, noiseLevel: Math.round(average * 100), lastEvent: isCrying ? 'Cry Alert' : 'Normal', statusMessage: isCrying ? 'BABY IS CRYING' : 'Nursery is quiet' };
        setStatus(newStatus);
        if (dataConnRef.current?.open) dataConnRef.current.send(newStatus);
      };
      analysisIntervalRef.current = window.setInterval(checkNoise, NOISE_POLL_INTERVAL);

      if (pendingCallRef.current) {
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
        
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(micStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        localMicAnalyserRef.current = analyser;

        micStream.getAudioTracks().forEach(t => t.enabled = true);
        setTimeout(() => {
           if (!isTalking) micStream.getAudioTracks().forEach(t => t.enabled = false);
        }, 800);

        localStreamForCall = new MediaStream([...micStream.getAudioTracks(), createBlankVideoTrack()]);
      } catch (err) { 
        localStreamForCall = new MediaStream([createBlankVideoTrack()]); 
      }
      
      const call = peerRef.current.call(targetPeerId, localStreamForCall);
      activeCallRef.current = call;
      call.on('stream', (s: MediaStream) => { 
        setRemoteStream(s); 
        setPeerConnected(true); 
        setIsConnecting(false); 
      });
    } catch (err) { 
      setIsConnecting(false); 
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleAskQuestion = async () => {
    if (!chatMessage.trim() || !uploadedFile || !geminiRef.current || isAsking) return;
    setChatHistory(prev => [...prev, { role: 'user', text: chatMessage }]);
    const currentMsg = chatMessage;
    setChatMessage('');
    setIsAsking(true);
    try {
      const response = await geminiRef.current.askQuestion(uploadedFile, currentMsg, chatHistory);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: "Error connecting to AI." }]);
    } finally { setIsAsking(false); }
  };

  const createBlankVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 1, 1); }
    return (canvas as any).captureStream(1).getVideoTracks()[0];
  };

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-hidden">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl"><Baby className="w-8 h-8 text-white" /></div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Lullaby AI</h1>
          <p className="text-slate-400 text-sm">Select station mode</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
          <button onClick={() => setMode('BABY_STATION')} className="bg-slate-900/50 p-8 rounded-3xl border border-slate-800 flex flex-col items-center transition-all hover:bg-slate-900">
            <Activity className="w-8 h-8 text-blue-500 mb-4" />
            <h3 className="text-xl font-semibold">Baby Station</h3>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="bg-slate-900/50 p-8 rounded-3xl border border-slate-800 flex flex-col items-center transition-all hover:bg-slate-900">
            <Monitor className="w-8 h-8 text-indigo-500 mb-4" />
            <h3 className="text-xl font-semibold">Parent Station</h3>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`h-screen w-full ${stealthMode ? 'bg-black' : 'bg-slate-950'} flex flex-col relative overflow-hidden`}>
        <audio ref={babyIncomingAudioRef} autoPlay playsInline muted={false} />
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-white">
            <div className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800 mb-8 w-full max-w-xs text-center">
              <span className="text-[10px] font-bold uppercase text-blue-500 mb-2 block">Pairing Code</span>
              <div className="text-5xl font-mono font-bold">{peerId || '-----'}</div>
            </div>
            <button onClick={() => startMonitoring()} className="bg-blue-600 px-8 py-4 rounded-2xl font-bold flex items-center gap-3"><Power className="w-5 h-5" /> Start Monitor</button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-6 text-slate-500 text-xs font-bold uppercase">Exit</button>
          </div>
        ) : (
          <div className="flex-1 relative h-full">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            {!audioUnlocked && !stealthMode && (
              <div className="absolute inset-0 z-[60] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-6 animate-bounce"><Volume2 className="w-10 h-10 text-white" /></div>
                <h3 className="text-xl font-bold mb-2">Unlock Nursery Speaker</h3>
                <p className="text-slate-400 text-sm mb-8">Tap to enable audio playback from the parent station.</p>
                <button onClick={unlockAudio} className="bg-blue-600 px-10 py-4 rounded-2xl font-bold text-white shadow-xl hover:bg-blue-500">Enable Speaker</button>
              </div>
            )}

            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/10 pointer-events-none flex flex-col items-center justify-center">
                <div className="bg-blue-600/90 backdrop-blur-md px-6 py-4 rounded-full flex items-center gap-4 animate-in zoom-in duration-300">
                  <div className="flex gap-1 items-end h-6">
                    <div className="w-2 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(4, incomingVolume * 0.8)}px` }} />
                    <div className="w-2 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(4, incomingVolume * 1.5)}px` }} />
                    <div className="w-2 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(4, incomingVolume * 0.7)}px` }} />
                  </div>
                  <span className="text-white font-bold uppercase tracking-widest text-sm">Parent is speaking...</span>
                </div>
                {incomingVolume < 5 && (
                  <div className="mt-4 bg-red-600/80 px-4 py-1.5 rounded-full text-[10px] font-bold text-white flex items-center gap-2 animate-pulse">
                     <AlertTriangle className="w-3 h-3" /> Signal Waiting...
                  </div>
                )}
              </div>
            )}

            {stealthMode && (
              <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-12" onDoubleClick={() => setStealthMode(false)}>
                <Lock className="w-12 h-12 text-slate-900" />
                <p className="text-slate-900 text-[10px] mt-4 font-bold uppercase tracking-widest">Double tap to unlock</p>
              </div>
            )}
            
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              <div className="bg-red-600 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2"><span className="w-2 h-2 bg-white rounded-full animate-pulse" /> Live</div>
              <div className="bg-slate-900/80 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 border border-white/10">{status.noiseLevel}% Noise</div>
              {audioUnlocked && <div className="bg-green-600/80 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 border border-white/10"><Headphones className="w-3 h-3" /> Speaker Ready</div>}
            </div>

            <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 ${stealthMode ? 'opacity-0' : 'opacity-100'}`}>
              <div className="bg-slate-900/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 flex items-center gap-2">
                <button onClick={() => { const ns = !babyMicEnabled; setBabyMicEnabled(ns); babyMicEnabledRef.current = ns; streamRef.current?.getAudioTracks().forEach(t => t.enabled = ns); }} className={`p-4 rounded-xl ${babyMicEnabled ? 'text-white' : 'bg-red-500'}`}>
                  {babyMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button onClick={() => setStealthMode(true)} className="p-4 rounded-xl bg-slate-800 text-white flex items-center gap-2 px-6"><Lock className="w-5 h-5" /> <span className="text-[10px] font-bold">Nursery Mode</span></button>
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
      <div className="flex items-center justify-between mb-4 h-12 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode('ROLE_SELECTION')} className="p-2 hover:bg-slate-900 rounded-lg"><ChevronLeft className="w-5 h-5 text-slate-400" /></button>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Parent Station</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_8px_green]' : 'bg-slate-600'}`} />
              <span className="text-[10px] font-bold text-slate-500 uppercase">{peerConnected ? 'Connected' : 'Offline'}</span>
            </div>
          </div>
        </div>
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button onClick={() => setParentView('FEED')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${parentView === 'FEED' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Feed</button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>AI Insights</button>
        </div>
        <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${status.isCrying ? 'bg-red-500/10 border-red-500 text-red-500 animate-pulse' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
          <Baby className="w-4 h-4" /> <span className="text-[10px] font-bold uppercase">{status.statusMessage}</span>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {parentView === 'FEED' ? (
          <div className="flex-[3] flex flex-col gap-4 min-h-0">
            <div className={`flex-1 bg-black rounded-3xl border overflow-hidden relative ${status.isCrying ? 'border-red-500 ring-4 ring-red-500/50' : 'border-slate-800/50'}`}>
              <video ref={remoteVideoRef} autoPlay playsInline muted={isMuted} className="w-full h-full object-cover" />
              {peerConnected && isMuted && (
                <div onClick={() => setIsMuted(false)} className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer group">
                  <div className="bg-blue-600 p-6 rounded-full mb-4 shadow-2xl transition-transform group-hover:scale-110"><VolumeX className="w-8 h-8 text-white" /></div>
                  <p className="text-white font-bold uppercase tracking-widest text-sm animate-pulse">Tap to Unmute Nursery</p>
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
                <button onClick={() => setIsMuted(!isMuted)} className={`absolute top-4 right-4 p-3 rounded-xl backdrop-blur-md transition-all ${isMuted ? 'bg-red-500' : 'bg-black/40 border border-white/10'}`}>
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              )}
            </div>
            <div className="h-28 shrink-0 relative">
              <button 
                onMouseDown={() => toggleParentMic(true)} 
                onMouseUp={() => toggleParentMic(false)} 
                onMouseLeave={() => toggleParentMic(false)}
                onTouchStart={(e) => { e.preventDefault(); toggleParentMic(true); }}
                onTouchEnd={(e) => { e.preventDefault(); toggleParentMic(false); }}
                className={`w-full h-full rounded-2xl border transition-all flex items-center justify-center gap-4 active:scale-[0.98] ${isTalking ? 'bg-blue-600 border-blue-400' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
              >
                <div className="relative">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isTalking ? 'bg-white text-blue-600 shadow-2xl' : 'bg-slate-800 text-slate-400'}`}>
                    {isTalking ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
                  </div>
                  {isTalking && (
                    <div className="absolute -right-2 top-0 bottom-0 w-1 bg-white/20 rounded-full overflow-hidden">
                      <div className="w-full bg-white absolute bottom-0 transition-all duration-75" style={{ height: `${localMicVolume}%` }} />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isTalking ? 'text-blue-100' : 'text-slate-500'}`}>{isTalking ? 'Speaking to Nursery' : 'Push to Talk'}</p>
                  <h3 className="text-xl font-bold">{isTalking ? 'Release to Stop' : 'Hold to Speak'}</h3>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-slate-900/30 rounded-3xl border border-slate-800 p-6 flex flex-col lg:flex-row gap-6">
            <div className="flex-[2] overflow-y-auto custom-scrollbar">
              <div className="bg-slate-900 p-8 rounded-2xl text-center border border-slate-800">
                <BrainCircuit className="w-10 h-10 text-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Health Data Analysis</h3>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.csv,.jpg,.jpeg,.png" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto mt-4 transition-all hover:scale-105 hover:bg-blue-500">
                  <Upload className="w-4 h-4" /> {isAnalyzing ? 'Analyzing...' : 'Upload Baby Log'}
                </button>
              </div>
              {analysisResult && (
                <div className="mt-8 space-y-6">
                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <h4 className="text-xs font-bold text-blue-500 uppercase mb-4 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" /> Summary</h4>
                    <p className="text-slate-300 text-sm leading-relaxed">{analysisResult.summary}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 bg-slate-950/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
               <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                 <MessageSquare className="w-4 h-4 text-blue-500" />
                 <span className="text-xs font-bold uppercase text-slate-500 tracking-widest">Assistant Chat</span>
               </div>
               <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar">
                 {chatHistory.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[85%] p-3 rounded-2xl text-xs ${chat.role === 'user' ? 'bg-blue-600' : 'bg-slate-800'}`}>{chat.text}</div>
                   </div>
                 ))}
                 {isAsking && <div className="p-3 bg-slate-800 w-12 rounded-2xl animate-pulse">...</div>}
               </div>
               <div className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
                 <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()} placeholder="Ask a question..." className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-blue-500" />
                 <button onClick={handleAskQuestion} disabled={!chatMessage.trim()} className="p-2.5 bg-blue-600 rounded-xl transition-all disabled:opacity-50"><Send className="w-4 h-4" /></button>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
