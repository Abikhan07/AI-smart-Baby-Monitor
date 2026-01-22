
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
  Headphones,
  Signal,
  Smartphone
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
  // Navigation & Role State
  const [mode, setMode] = useState<AppMode>('ROLE_SELECTION');
  const [parentView, setParentView] = useState<'FEED' | 'AI_INSIGHTS'>('FEED');
  
  // Monitoring State
  const [status, setStatus] = useState<BabyStatus>({
    isCrying: false,
    noiseLevel: 0,
    lastEvent: 'System Init',
    statusMessage: 'Nursery is quiet'
  });
  const [sensitivity, setSensitivity] = useState(65);
  const sensitivityRef = useRef(65);
  const statusRef = useRef(status);

  // Connection State
  const [peerId, setPeerId] = useState<string>('');
  const [targetPeerId, setTargetPeerId] = useState<string>('');
  const [peerConnected, setPeerConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLive, setIsLive] = useState(false);
  
  // UI Interaction State
  const [stealthMode, setStealthMode] = useState(false);
  // Missing states fixed
  const [showSettings, setShowSettings] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  
  const [isTalking, setIsTalking] = useState(false);
  const isTalkingRef = useRef(false);
  const [isMuted, setIsMuted] = useState(true); 
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);
  
  // Volume Visualization
  const [incomingVolume, setIncomingVolume] = useState(0);
  const [localMicVolume, setLocalMicVolume] = useState(0);

  // AI & Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<FileData | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  // WebRTC Refs
  const peerRef = useRef<any>(null);
  const dataConnRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Missing ref fixed
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  
  // Element Refs
  const babyIncomingAudioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // Logic Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const incomingAnalyserRef = useRef<AnalyserNode | null>(null);
  const localMicAnalyserRef = useRef<AnalyserNode | null>(null);
  const nurseryAnalyserRef = useRef<AnalyserNode | null>(null);
  const geminiRef = useRef<GeminiService | null>(null);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    geminiRef.current = new GeminiService();
  }, []);

  // Persistent Visualizer Loop
  useEffect(() => {
    let frameId: number;
    const dataArray = new Uint8Array(32);
    
    const loop = () => {
      // Incoming volume (from Parent to Baby)
      if (incomingAnalyserRef.current && isTalkingRef.current) {
        incomingAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        setIncomingVolume(Math.round((sum / dataArray.length) / 255 * 100));
      } else {
        setIncomingVolume(0);
      }

      // Local mic feedback (for Parent)
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

  // Robust Data Handler
  const handleData = useCallback((data: any) => {
    if (data.type === 'HEARTBEAT') return;
    
    if (data.type === 'PARENT_TALK_STATUS') {
      setIsTalking(data.isTalking);
      isTalkingRef.current = data.isTalking;
      
      // Explicit play trigger on the station
      if (data.isTalking && babyIncomingAudioRef.current && audioUnlockedRef.current) {
        babyIncomingAudioRef.current.play().catch(() => {
          console.warn("Playback interrupted or blocked");
        });
      }
      return;
    }
    
    // Status updates (Baby -> Parent)
    if (data.noiseLevel !== undefined) {
      setStatus(data);
    }
  }, []);

  // Peer Initialization
  useEffect(() => {
    if (mode === 'ROLE_SELECTION' || peerRef.current) return;

    const startPeer = () => {
      if (typeof Peer === 'undefined') {
        setTimeout(startPeer, 500);
        return;
      }

      console.log("Starting PeerJS Node for role:", mode);
      const id = mode === 'BABY_STATION' ? Math.floor(10000 + Math.random() * 90000).toString() : undefined;
      const peer = new Peer(id, { 
        config: { iceServers: ICE_SERVERS },
        debug: 1 
      });
      peerRef.current = peer;

      peer.on('open', (newId: string) => setPeerId(newId));
      
      peer.on('connection', (conn: any) => {
        dataConnRef.current = conn;
        conn.on('open', () => { 
          setPeerConnected(true); 
          setIsConnecting(false); 
          console.log("Data channel established");
        });
        conn.on('data', handleData);
        conn.on('close', () => setPeerConnected(false));
        conn.on('error', () => setPeerConnected(false));
      });

      peer.on('call', (call: any) => {
        activeCallRef.current = call;
        
        // Nursery answers with its monitor stream, Parent answers with blank (one-way feed usually)
        const answerStream = (mode === 'BABY_STATION' && localStreamRef.current) 
          ? localStreamRef.current 
          : new MediaStream([createBlankVideoTrack()]);
          
        call.answer(answerStream);

        call.on('stream', (s: MediaStream) => {
          remoteStreamRef.current = s;
          if (mode === 'PARENT_STATION' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = s;
          } else if (mode === 'BABY_STATION' && babyIncomingAudioRef.current) {
            babyIncomingAudioRef.current.srcObject = s;
            setupVisualizer(s, 'incoming');
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
        console.error("Peer Failure:", err);
        if (err.type === 'peer-unavailable') setIsConnecting(false);
      });
    };

    startPeer();

    return () => {
      // Peer survives re-renders, destroyed only on full reset
    };
  }, [mode, handleData]);

  const unlockSpeaker = async () => {
    console.log("Unlocking nursery speaker hardware...");
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      setAudioUnlocked(true);
      audioUnlockedRef.current = true;
      
      if (babyIncomingAudioRef.current) {
        babyIncomingAudioRef.current.muted = false;
        if (babyIncomingAudioRef.current.srcObject) {
          await babyIncomingAudioRef.current.play();
        }
      }
    } catch (e) {
      console.error("Speaker unlock failed:", e);
    }
  };

  const setupVisualizer = (stream: MediaStream, type: 'incoming' | 'local' | 'nursery') => {
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

  const startNurseryMonitor = async () => {
    setStreamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      localStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsLive(true);

      const analyser = setupVisualizer(stream, 'nursery');
      if (analyser) {
        const interval = setInterval(() => {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length / 255;
          const isCrying = avg > (0.42 - (sensitivityRef.current / 100) * 0.4);
          
          const newStatus = { 
            isCrying, 
            noiseLevel: Math.round(avg * 100), 
            lastEvent: isCrying ? 'Cry Detected' : 'Quiet', 
            statusMessage: isCrying ? 'CRY ALERT DETECTED' : 'Nursery is peaceful' 
          };
          
          setStatus(newStatus);
          if (dataConnRef.current?.open) dataConnRef.current.send(newStatus);
        }, NOISE_POLL_INTERVAL);
      }
    } catch (e) {
      setStreamError("Please grant Camera and Mic permissions.");
    }
  };

  const linkToNursery = async () => {
    if (!targetPeerId || !peerRef.current) return;
    setIsConnecting(true);
    setStreamError(null);
    
    try {
      const conn = peerRef.current.connect(targetPeerId, { reliable: true });
      dataConnRef.current = conn;
      conn.on('open', () => {
        setPeerConnected(true);
        console.log("Connected to nursery data hub");
      });
      conn.on('data', handleData);

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Fixed localMicStreamRef initialization
      localMicStreamRef.current = micStream;
      setupVisualizer(micStream, 'local');
      
      // Mic starts muted for Push-to-Talk
      micStream.getAudioTracks().forEach(t => t.enabled = false);

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
      setStreamError("Failed to establish secure link.");
    }
  };

  const setParentMic = (enabled: boolean) => {
    setIsTalking(enabled);
    isTalkingRef.current = enabled;
    // Correctly using localMicStreamRef
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
      setChatHistory(prev => [...prev, { role: 'model', text: "AI insights unavailable right now." }]);
    } finally { setIsAsking(false); }
  };

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="h-screen w-full bg-[#020617] flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#1e293b,transparent)] opacity-50" />
        <div className="text-center mb-12 z-10">
          <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_-10px_rgba(37,99,235,0.6)] animate-pulse">
            <Baby className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-2 uppercase italic text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">Lullaby AI</h1>
          <p className="text-blue-500 text-xs font-black uppercase tracking-[0.4em]">Smart Nursery Station</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl w-full z-10">
          <button onClick={() => setMode('BABY_STATION')} className="bg-slate-900/40 backdrop-blur-md p-10 rounded-[2.5rem] border border-slate-800 flex flex-col items-center group transition-all hover:bg-slate-900/60 hover:border-blue-500/50 hover:-translate-y-1">
            <Smartphone className="w-12 h-12 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-black uppercase tracking-tight">Baby Unit</h3>
            <p className="text-slate-500 text-[10px] mt-2 font-bold uppercase tracking-widest opacity-60">Transmitter Station</p>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="bg-slate-900/40 backdrop-blur-md p-10 rounded-[2.5rem] border border-slate-800 flex flex-col items-center group transition-all hover:bg-slate-900/60 hover:border-indigo-500/50 hover:-translate-y-1">
            <Monitor className="w-12 h-12 text-indigo-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-black uppercase tracking-tight">Parent Unit</h3>
            <p className="text-slate-500 text-[10px] mt-2 font-bold uppercase tracking-widest opacity-60">Monitoring Receiver</p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`h-screen w-full ${stealthMode ? 'bg-black' : 'bg-[#020617]'} flex flex-col relative overflow-hidden transition-colors duration-1000`}>
        <audio ref={babyIncomingAudioRef} autoPlay playsInline muted={false} />
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-white z-10">
            {streamError && (
              <div className="mb-6 flex items-center gap-3 bg-red-600/20 border border-red-500/30 p-4 rounded-2xl text-red-500 text-xs font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-4">
                <AlertTriangle className="w-5 h-5" /> {streamError}
              </div>
            )}
            <div className="bg-slate-900/50 backdrop-blur-xl p-12 rounded-[3rem] border border-slate-800/50 mb-10 w-full max-w-sm text-center shadow-2xl">
              <span className="text-[11px] font-black uppercase text-blue-500 mb-4 block tracking-[0.3em] opacity-80">Nursery Access Key</span>
              <div className="text-6xl font-mono font-black tracking-tighter text-white drop-shadow-2xl">{peerId || '-----'}</div>
            </div>
            <button onClick={startNurseryMonitor} className="bg-blue-600 px-12 py-6 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] flex items-center gap-4 active:scale-95 transition-all shadow-[0_20px_40px_-10px_rgba(37,99,235,0.4)] hover:bg-blue-500"><Power className="w-6 h-6" /> Start Broadcast</button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-10 text-slate-600 text-[10px] font-black uppercase tracking-[0.4em] hover:text-slate-400 transition-colors">Abort System</button>
          </div>
        ) : (
          <div className="flex-1 relative h-full">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            {!audioUnlocked && !stealthMode && (
              <div className="absolute inset-0 z-[60] bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-10 text-center">
                <div className="w-28 h-28 bg-blue-600 rounded-[2.5rem] flex items-center justify-center mb-8 animate-pulse shadow-[0_0_60px_-10px_rgba(37,99,235,0.8)]"><Volume2 className="w-14 h-14 text-white" /></div>
                <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Hardware Lock</h3>
                <p className="text-slate-400 text-sm mb-12 max-w-xs font-bold uppercase tracking-wide leading-relaxed opacity-70">Tap below to authorize the speaker for remote parent communication.</p>
                <button onClick={unlockSpeaker} className="bg-blue-600 px-14 py-6 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] text-white shadow-2xl hover:bg-blue-500 active:scale-95 transition-all">Enable Link</button>
              </div>
            )}

            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/30 pointer-events-none flex flex-col items-center justify-center backdrop-blur-[4px] z-50">
                <div className="bg-blue-600/95 backdrop-blur-xl px-12 py-8 rounded-[3rem] flex flex-col items-center gap-6 shadow-[0_40px_80px_-20px_rgba(37,99,235,0.6)] animate-in zoom-in duration-500 border border-white/20">
                  <div className="flex gap-2.5 items-end h-12">
                    <div className="w-3.5 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(10, incomingVolume * 1.1)}px` }} />
                    <div className="w-3.5 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(10, incomingVolume * 2.0)}px` }} />
                    <div className="w-3.5 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(10, incomingVolume * 1.3)}px` }} />
                  </div>
                  <span className="text-white font-black uppercase tracking-[0.3em] text-xl">Parent Speaking</span>
                </div>
              </div>
            )}

            <div className={`absolute top-10 left-10 flex flex-col gap-4 z-20 ${stealthMode ? 'opacity-20' : 'opacity-100'}`}>
              <div className="bg-red-600/90 backdrop-blur-md px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3 shadow-xl border border-white/10"><span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]" /> Live Feed</div>
              <div className="bg-slate-900/80 backdrop-blur-md px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3 border border-white/10 shadow-xl"><Activity className="w-4 h-4 text-blue-500" /> {status.noiseLevel}% Noise</div>
              {audioUnlocked && <div className="bg-green-600/90 backdrop-blur-md px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-3 border border-white/10 shadow-xl"><Headphones className="w-4 h-4" /> Link Active</div>}
            </div>

            <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-8 transition-all duration-500 ${stealthMode ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100'}`}>
              <div className="bg-slate-900/80 backdrop-blur-2xl p-4 rounded-[2.5rem] border border-white/10 flex items-center gap-4 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)]">
                <button onClick={() => setStealthMode(true)} className="p-6 rounded-[1.5rem] bg-blue-600 text-white flex items-center gap-4 px-10 font-black uppercase text-[12px] tracking-[0.2em] shadow-xl hover:bg-blue-500 transition-all"><Lock className="w-5 h-5" /> Nursery Mode</button>
                <button onClick={() => setShowSettings(!showSettings)} className={`p-6 rounded-[1.5rem] transition-all shadow-xl ${showSettings ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}><Settings2 className="w-7 h-7" /></button>
              </div>
            </div>

            {showSettings && !stealthMode && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/95 backdrop-blur-3xl p-10 rounded-[3.5rem] border border-white/10 w-full max-w-xs z-[70] shadow-2xl animate-in zoom-in duration-300">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-black uppercase tracking-tight">Nursery Control</h3>
                  <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><XCircle className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="space-y-8">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cry Sensitivity</span>
                      <span className="text-blue-500 font-bold">{sensitivity}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={sensitivity} onChange={(e) => setSensitivity(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-600" />
                  </div>
                  <div className="pt-4 border-t border-white/5">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Adjust thresholds for automated crying detection alerts.</p>
                  </div>
                </div>
              </div>
            )}
            
            {stealthMode && (
              <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center p-12 animate-in fade-in duration-1000" onDoubleClick={() => setStealthMode(false)}>
                <div className="w-20 h-20 bg-slate-900/20 rounded-full flex items-center justify-center mb-8 border border-white/5"><Lock className="w-8 h-8 text-slate-900" /></div>
                <p className="text-slate-900 text-[11px] font-black uppercase tracking-[0.5em] text-center leading-relaxed">Nursery Security Active<br/><span className="text-[10px] mt-4 opacity-40 block tracking-widest font-bold">Double tap anywhere to restore UI</span></p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#020617] flex flex-col p-4 md:p-10 text-white overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-10%,#1e293b,transparent)] opacity-30 pointer-events-none" />
      
      <div className="flex items-center justify-between mb-8 h-16 shrink-0 z-10">
        <div className="flex items-center gap-5">
          <button onClick={() => setMode('ROLE_SELECTION')} className="p-4 hover:bg-slate-900 rounded-[1.2rem] transition-all bg-slate-900/50 border border-slate-800/50"><ChevronLeft className="w-7 h-7 text-slate-400" /></button>
          <div>
            <h2 className="text-xl font-black tracking-tight uppercase italic drop-shadow-lg">Parent Hub</h2>
            <div className="flex items-center gap-2.5 mt-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)] animate-pulse' : 'bg-slate-700'}`} />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{peerConnected ? 'Secure Connection' : isConnecting ? 'Establishing Link...' : 'Signal Standby'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex bg-slate-900/50 backdrop-blur-md p-2 rounded-[1.5rem] border border-slate-800/50 shadow-2xl">
          <button onClick={() => setParentView('FEED')} className={`px-8 py-3 rounded-[1rem] text-xs font-black uppercase tracking-widest transition-all ${parentView === 'FEED' ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/30' : 'text-slate-500 hover:text-slate-400'}`}>Monitor</button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-8 py-3 rounded-[1rem] text-xs font-black uppercase tracking-widest transition-all ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/30' : 'text-slate-500 hover:text-slate-400'}`}>Analysis</button>
        </div>

        <div className={`hidden lg:flex px-8 py-4 rounded-[1.5rem] border items-center gap-4 transition-all duration-700 ${status.isCrying ? 'bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_30px_-5px_rgba(239,68,68,0.2)] animate-pulse' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
          <Baby className={`w-6 h-6 ${status.isCrying ? 'animate-bounce' : ''}`} /> 
          <span className="text-[11px] font-black uppercase tracking-[0.25em]">{status.statusMessage}</span>
        </div>
      </div>

      <div className="flex-1 flex gap-8 min-h-0 overflow-hidden z-10">
        {parentView === 'FEED' ? (
          <div className="flex-[3] flex flex-col gap-8 min-h-0">
            {streamError && (
              <div className="flex items-center justify-center gap-4 bg-red-600/10 border border-red-500/40 p-4 rounded-3xl text-red-500 text-[10px] font-black uppercase tracking-[0.2em] animate-in slide-in-from-top-4">
                <ShieldAlert className="w-5 h-5" /> {streamError}
              </div>
            )}
            <div className={`flex-1 bg-black rounded-[3.5rem] border-2 overflow-hidden relative transition-all duration-1000 group ${status.isCrying ? 'border-red-500 ring-[12px] ring-red-500/20 shadow-[0_0_100px_-20px_rgba(239,68,68,0.3)]' : 'border-slate-800/50 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)]'}`}>
              <video ref={remoteVideoRef} autoPlay playsInline muted={isMuted} className="w-full h-full object-cover transition-transform duration-700" />
              
              {peerConnected && isMuted && (
                <div onClick={() => setIsMuted(false)} className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[6px] cursor-pointer group transition-all z-20">
                  <div className="bg-blue-600 p-10 rounded-[2.5rem] mb-8 shadow-2xl transition-all group-hover:scale-110 shadow-blue-900/60 group-hover:rotate-6"><VolumeX className="w-12 h-12 text-white" /></div>
                  <p className="text-white font-black uppercase tracking-[0.4em] text-[11px] animate-pulse">Activate Nursery Audio Stream</p>
                </div>
              )}
              
              {!peerConnected && !isConnecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-[#020617]/95 backdrop-blur-xl text-center z-30">
                  <div className="bg-slate-900/40 p-16 rounded-[4rem] border border-slate-800/50 w-full max-w-lg shadow-[0_50px_100px_-30px_rgba(0,0,0,0.6)]">
                    <div className="w-24 h-24 bg-blue-600/10 rounded-[2.2rem] flex items-center justify-center mx-auto mb-10"><Signal className="w-12 h-12 text-blue-500" /></div>
                    <h3 className="text-3xl font-black uppercase tracking-tighter mb-10">Input Nursery ID</h3>
                    <div className="flex flex-col gap-6">
                      <input type="text" maxLength={5} placeholder="00000" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="bg-[#020617] border border-slate-800 rounded-[2rem] px-8 py-8 text-center text-6xl font-mono font-black text-blue-500 outline-none focus:border-blue-500 transition-all shadow-inner tracking-[0.2em]" />
                      <button onClick={linkToNursery} className="bg-blue-600 py-8 rounded-[2rem] shadow-2xl shadow-blue-900/50 hover:bg-blue-500 active:scale-95 transition-all font-black uppercase tracking-[0.3em] text-xs flex items-center justify-center gap-4 mt-4"><Link2 className="w-6 h-6" /> Initialize Link</button>
                    </div>
                  </div>
                </div>
              )}

              {peerConnected && (
                <button onClick={() => setIsMuted(!isMuted)} className={`absolute top-10 right-10 p-5 rounded-[1.5rem] backdrop-blur-2xl transition-all shadow-2xl z-40 border-2 ${isMuted ? 'bg-red-600 border-red-400' : 'bg-slate-900/60 border-white/10'}`}>
                  {isMuted ? <VolumeX className="w-7 h-7 text-white" /> : <Volume2 className="w-7 h-7 text-white" />}
                </button>
              )}
            </div>

            <div className="h-36 shrink-0 relative">
              <button 
                onMouseDown={() => setParentMic(true)} 
                onMouseUp={() => setParentMic(false)} 
                onMouseLeave={() => setParentMic(false)}
                onTouchStart={(e) => { e.preventDefault(); setParentMic(true); }}
                onTouchEnd={(e) => { e.preventDefault(); setParentMic(false); }}
                className={`w-full h-full rounded-[3.5rem] border-2 transition-all flex items-center justify-center gap-10 active:scale-[0.96] ${isTalking ? 'bg-blue-600 border-blue-400 shadow-[0_30px_60px_-15px_rgba(37,99,235,0.6)]' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
              >
                <div className="relative">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${isTalking ? 'bg-white text-blue-600 shadow-2xl' : 'bg-slate-800 text-slate-500'}`}>
                    {isTalking ? <Mic className="w-12 h-12 animate-pulse" /> : <MicOff className="w-12 h-12" />}
                  </div>
                  {isTalking && (
                    <div className="absolute -right-5 top-3 bottom-3 w-2.5 bg-white/30 rounded-full overflow-hidden">
                      <div className="w-full bg-white absolute bottom-0 transition-all duration-75" style={{ height: `${localMicVolume}%` }} />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-[12px] font-black uppercase tracking-[0.4em] mb-2 ${isTalking ? 'text-blue-100' : 'text-slate-500'}`}>{isTalking ? 'Transmission Live' : 'Voice Terminal Idle'}</p>
                  <h3 className="text-4xl font-black uppercase tracking-tighter">{isTalking ? 'BROADCASTING' : 'HOLD TO TALK'}</h3>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-slate-900/20 backdrop-blur-md rounded-[4rem] border border-slate-800 p-10 flex flex-col lg:flex-row gap-10 overflow-hidden shadow-2xl">
            <div className="flex-[2] overflow-y-auto custom-scrollbar pr-6">
              <div className="bg-slate-900/60 p-16 rounded-[3.5rem] text-center border border-slate-800/50 shadow-inner">
                <div className="w-28 h-28 bg-blue-600/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-lg"><BrainCircuit className="w-14 h-14 text-blue-500" /></div>
                <h3 className="text-4xl font-black uppercase tracking-tighter mb-4">Diagnostic Lab</h3>
                <p className="text-slate-500 text-[13px] mb-12 font-bold uppercase tracking-wider max-w-sm mx-auto opacity-70 leading-relaxed">Upload pediatric health logs or nursery biometric imagery for intelligent AI synthesis.</p>
                <input type="file" onChange={onFileUpload} className="hidden" id="file-hub" />
                <label htmlFor="file-hub" className="bg-blue-600 px-12 py-6 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-5 mx-auto mt-4 cursor-pointer hover:bg-blue-500 transition-all inline-flex shadow-2xl shadow-blue-900/40 active:scale-95">
                  <Upload className="w-6 h-6" /> {isAnalyzing ? 'Processing Intelligence...' : 'Upload Data Unit'}
                </label>
              </div>
              
              {analysisResult && (
                <div className="mt-12 space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                  <div className="bg-slate-900/80 p-12 rounded-[3.5rem] border border-slate-800 shadow-2xl">
                    <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.5em] mb-8 flex items-center gap-4"><Sparkles className="w-6 h-6" /> Intelligence Output</h4>
                    <p className="text-slate-200 text-xl leading-relaxed font-semibold italic">{analysisResult.summary}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex-1 bg-[#020617]/90 rounded-[3.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]">
               <div className="p-8 border-b border-slate-800/50 flex items-center gap-5 bg-slate-900/20">
                 <MessageSquare className="w-7 h-7 text-blue-500" />
                 <span className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em]">AI Support Core</span>
               </div>
               <div className="flex-1 p-8 space-y-8 overflow-y-auto custom-scrollbar">
                 {chatHistory.length === 0 && (
                   <div className="text-center mt-32 px-10 opacity-30">
                     <p className="text-slate-400 text-sm font-black uppercase tracking-[0.2em] leading-relaxed italic">"Initialize AI context by uploading a pediatric data unit."</p>
                   </div>
                 )}
                 {chatHistory.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[90%] p-6 rounded-[2rem] text-[14px] leading-relaxed font-bold ${chat.role === 'user' ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>{chat.text}</div>
                   </div>
                 ))}
                 {isAsking && (
                    <div className="p-6 bg-slate-900 w-24 rounded-[2rem] flex gap-2.5 justify-center border border-slate-800">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                 )}
               </div>
               <div className="p-8 bg-slate-900/40 border-t border-slate-800/50 flex gap-5">
                 <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onQuestionAsk()} placeholder="Query Assistant..." className="flex-1 bg-[#020617] border border-slate-800 rounded-[2rem] px-8 py-6 text-sm outline-none focus:border-blue-600 transition-all font-bold placeholder:text-slate-800 tracking-wide" />
                 <button onClick={onQuestionAsk} disabled={!chatMessage.trim()} className="p-6 bg-blue-600 rounded-[2rem] hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-20 shadow-xl shadow-blue-900/40"><Send className="w-7 h-7" /></button>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
