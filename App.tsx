
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Baby, 
  Monitor, 
  Mic, 
  MicOff, 
  ChevronLeft, 
  Play, 
  Link2, 
  Power, 
  Activity, 
  Volume2, 
  VolumeX, 
  MessageSquare, 
  SwitchCamera,
  AlertTriangle,
  Settings2,
  Lock,
  Headphones,
  Signal,
  Smartphone,
  Send,
  Sparkles,
  BrainCircuit,
  Upload,
  ShieldAlert
} from 'lucide-react';
import { AppMode, BabyStatus, FileData, AnalysisResult } from './types.ts';
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

  // Connection State
  const [peerId, setPeerId] = useState<string>('');
  const [targetPeerId, setTargetPeerId] = useState<string>('');
  const [peerConnected, setPeerConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLive, setIsLive] = useState(false);
  
  // UI Interaction State
  const [stealthMode, setStealthMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  
  const [isTalking, setIsTalking] = useState(false);
  const isTalkingRef = useRef(false);
  const [isMuted, setIsMuted] = useState(true); 
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);

  // Baby Station Features
  const [babyMicEnabled, setBabyMicEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
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
  const geminiRef = useRef<GeminiService | null>(null);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    geminiRef.current = new GeminiService();
  }, []);

  // Visualizer Loop
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

  const handleData = useCallback((data: any) => {
    if (data.type === 'HEARTBEAT') return;
    if (data.type === 'PARENT_TALK_STATUS') {
      setIsTalking(data.isTalking);
      isTalkingRef.current = data.isTalking;
      if (data.isTalking && babyIncomingAudioRef.current && audioUnlockedRef.current) {
        babyIncomingAudioRef.current.play().catch(() => {});
      }
      return;
    }
    if (data.noiseLevel !== undefined) {
      setStatus(data);
    }
  }, []);

  // Peer Init
  useEffect(() => {
    if (mode === 'ROLE_SELECTION' || peerRef.current) return;
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
        conn.on('data', handleData);
        conn.on('close', () => setPeerConnected(false));
      });
      peer.on('call', (call: any) => {
        activeCallRef.current = call;
        // Baby Station answers with its stream
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
      });
    };
    startPeer();
  }, [mode, handleData]);

  const unlockSpeaker = async () => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      setAudioUnlocked(true);
      audioUnlockedRef.current = true;
      if (babyIncomingAudioRef.current) {
        babyIncomingAudioRef.current.muted = false;
        if (babyIncomingAudioRef.current.srcObject) await babyIncomingAudioRef.current.play();
      }
    } catch (e) { console.error(e); }
  };

  const setupVisualizer = (stream: MediaStream, type: 'incoming' | 'local' | 'nursery') => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = type === 'nursery' ? 256 : 64;
      source.connect(analyser);
      if (type === 'incoming') incomingAnalyserRef.current = analyser;
      else if (type === 'local') localMicAnalyserRef.current = analyser;
      return analyser;
    } catch (e) { return null; }
  };

  const createBlankVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0,0,1,1); }
    return (canvas as any).captureStream(1).getVideoTracks()[0];
  };

  const startNurseryMonitor = async (forceFacingMode?: 'user' | 'environment') => {
    setStreamError(null);
    const modeToUse = forceFacingMode || facingMode;
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: modeToUse, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      localStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      // Apply initial mic state
      stream.getAudioTracks().forEach(t => t.enabled = babyMicEnabled);
      
      setIsLive(true);
      const analyser = setupVisualizer(stream, 'nursery');
      if (analyser) {
        const interval = setInterval(() => {
          if (mode !== 'BABY_STATION') { clearInterval(interval); return; }
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length / 255;
          const isCrying = avg > (0.42 - (sensitivityRef.current / 100) * 0.4);
          const newStatus = { 
            isCrying, noiseLevel: Math.round(avg * 100), 
            lastEvent: isCrying ? 'Cry Detected' : 'Quiet', 
            statusMessage: isCrying ? 'CRY ALERT DETECTED' : 'Nursery is peaceful' 
          };
          setStatus(newStatus);
          if (dataConnRef.current?.open) dataConnRef.current.send(newStatus);
        }, NOISE_POLL_INTERVAL);
      }
      
      // If there's an active call, replace the track or re-initiate
      if (activeCallRef.current && activeCallRef.current.peerConnection) {
        const senders = activeCallRef.current.peerConnection.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const sender = senders.find((s: any) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
    } catch (e) { setStreamError("Hardware access denied."); }
  };

  const flipCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (isLive) startNurseryMonitor(newMode);
  };

  const toggleBabyMic = () => {
    const newState = !babyMicEnabled;
    setBabyMicEnabled(newState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = newState);
    }
  };

  const linkToNursery = async () => {
    if (!targetPeerId || !peerRef.current) return;
    setIsConnecting(true);
    setStreamError(null);
    try {
      const conn = peerRef.current.connect(targetPeerId, { reliable: true });
      dataConnRef.current = conn;
      conn.on('open', () => setPeerConnected(true));
      conn.on('data', handleData);
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localMicStreamRef.current = micStream;
      setupVisualizer(micStream, 'local');
      micStream.getAudioTracks().forEach(t => t.enabled = false);
      const call = peerRef.current.call(targetPeerId, new MediaStream([...micStream.getAudioTracks(), createBlankVideoTrack()]));
      activeCallRef.current = call;
      call.on('stream', (s: MediaStream) => {
        remoteStreamRef.current = s;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = s;
        setPeerConnected(true);
        setIsConnecting(false);
      });
    } catch (e) { setIsConnecting(false); setStreamError("Link failed."); }
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
      setChatHistory(prev => [...prev, { role: 'model', text: "Service busy." }]);
    } finally { setIsAsking(false); }
  };

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="h-screen w-full bg-[#020617] flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#1e293b,transparent)] opacity-50" />
        <div className="text-center mb-12 z-10">
          <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl animate-pulse"><Baby className="w-10 h-10 text-white" /></div>
          <h1 className="text-4xl font-black tracking-tight mb-2 uppercase italic text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">Lullaby AI</h1>
          <p className="text-blue-500 text-xs font-black uppercase tracking-[0.4em]">Smart Monitor System</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl w-full z-10">
          <button onClick={() => setMode('BABY_STATION')} className="bg-slate-900/40 backdrop-blur-md p-10 rounded-[2.5rem] border border-slate-800 flex flex-col items-center group transition-all hover:bg-slate-900/60">
            <Smartphone className="w-12 h-12 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-black uppercase">Baby Unit</h3>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="bg-slate-900/40 backdrop-blur-md p-10 rounded-[2.5rem] border border-slate-800 flex flex-col items-center group transition-all hover:bg-slate-900/60">
            <Monitor className="w-12 h-12 text-indigo-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-black uppercase">Parent Unit</h3>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`h-screen w-full ${stealthMode ? 'bg-black' : 'bg-[#020617]'} flex flex-col relative overflow-hidden`}>
        <audio ref={babyIncomingAudioRef} autoPlay playsInline muted={false} />
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-white z-10">
            <div className="bg-slate-900/50 backdrop-blur-xl p-12 rounded-[3rem] border border-slate-800/50 mb-10 w-full max-w-sm text-center">
              <span className="text-[11px] font-black uppercase text-blue-500 mb-4 block tracking-[0.3em]">Link Code</span>
              <div className="text-6xl font-mono font-black">{peerId || '-----'}</div>
            </div>
            <button onClick={() => startNurseryMonitor()} className="bg-blue-600 px-12 py-6 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] flex items-center gap-4"><Power className="w-6 h-6" /> Start Monitor</button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-10 text-slate-600 text-[10px] font-black uppercase tracking-[0.4em]">Exit</button>
          </div>
        ) : (
          <div className="flex-1 relative h-full">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            {!audioUnlocked && !stealthMode && (
              <div className="absolute inset-0 z-[60] bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-10 text-center">
                <div className="w-28 h-28 bg-blue-600 rounded-[2.5rem] flex items-center justify-center mb-8 animate-pulse shadow-xl"><Volume2 className="w-14 h-14 text-white" /></div>
                <h3 className="text-3xl font-black uppercase mb-4">Hardware Lock</h3>
                <p className="text-slate-400 text-sm mb-12 max-w-xs font-bold uppercase opacity-70">Authorize speaker for remote communication.</p>
                <button onClick={unlockSpeaker} className="bg-blue-600 px-14 py-6 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] text-white">Enable Speaker</button>
              </div>
            )}

            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/30 pointer-events-none flex flex-col items-center justify-center backdrop-blur-[4px] z-50">
                <div className="bg-blue-600/95 backdrop-blur-xl px-12 py-8 rounded-[3rem] flex flex-col items-center gap-6 shadow-2xl animate-in zoom-in duration-500">
                  <div className="flex gap-2.5 items-end h-12">
                    <div className="w-3.5 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(10, incomingVolume * 1.5)}px` }} />
                    <div className="w-3.5 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(10, incomingVolume * 2.5)}px` }} />
                    <div className="w-3.5 bg-white rounded-full transition-all duration-75" style={{ height: `${Math.max(10, incomingVolume * 1.8)}px` }} />
                  </div>
                  <span className="text-white font-black uppercase tracking-[0.3em]">Parent is Speaking</span>
                </div>
              </div>
            )}

            <div className={`absolute top-10 left-10 flex flex-col gap-4 z-20 ${stealthMode ? 'opacity-20' : 'opacity-100'}`}>
              <div className="bg-red-600/90 backdrop-blur-md px-5 py-2.5 rounded-full text-[11px] font-black uppercase flex items-center gap-3 border border-white/10"><span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" /> Live</div>
              <div className="bg-slate-900/80 backdrop-blur-md px-5 py-2.5 rounded-full text-[11px] font-black uppercase flex items-center gap-3 border border-white/10">{status.noiseLevel}% Noise</div>
            </div>

            <div className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 transition-all duration-500 ${stealthMode ? 'opacity-0' : 'opacity-100'}`}>
              <div className="bg-slate-900/80 backdrop-blur-2xl p-3 rounded-[2rem] border border-white/10 flex items-center gap-3 shadow-2xl">
                <button onClick={toggleBabyMic} className={`p-5 rounded-[1.2rem] transition-all ${babyMicEnabled ? 'bg-slate-800 text-white' : 'bg-red-600 text-white'}`}>
                  {babyMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button onClick={flipCamera} className="p-5 rounded-[1.2rem] bg-slate-800 text-white">
                  <SwitchCamera className="w-6 h-6" />
                </button>
                <button onClick={() => setStealthMode(true)} className="p-5 rounded-[1.2rem] bg-blue-600 text-white flex items-center gap-3 px-8 font-black uppercase text-[10px] tracking-widest"><Lock className="w-4 h-4" /> Nursery Mode</button>
                <button onClick={() => setShowSettings(!showSettings)} className="p-5 rounded-[1.2rem] bg-slate-800 text-white"><Settings2 className="w-6 h-6" /></button>
              </div>
            </div>
            
            {stealthMode && (
              <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center" onDoubleClick={() => setStealthMode(false)}>
                <Lock className="w-16 h-16 text-slate-900 mb-4" />
                <p className="text-slate-900 text-[11px] font-black uppercase tracking-[0.5em] text-center">Double tap to unlock</p>
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
              <div className={`w-2.5 h-2.5 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)]' : 'bg-slate-700'}`} />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{peerConnected ? 'Live Connection' : 'Ready to Link'}</span>
            </div>
          </div>
        </div>
        <div className="flex bg-slate-900/50 backdrop-blur-md p-2 rounded-[1.5rem] border border-slate-800/50 shadow-2xl">
          <button onClick={() => setParentView('FEED')} className={`px-8 py-3 rounded-[1rem] text-xs font-black transition-all ${parentView === 'FEED' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Monitor</button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-8 py-3 rounded-[1rem] text-xs font-black transition-all ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>AI Analysis</button>
        </div>
        <div className={`hidden lg:flex px-8 py-4 rounded-[1.5rem] border items-center gap-4 ${status.isCrying ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
          <Baby className="w-6 h-6" /> <span className="text-[11px] font-black uppercase tracking-widest">{status.statusMessage}</span>
        </div>
      </div>

      <div className="flex-1 flex gap-8 min-h-0 overflow-hidden z-10">
        {parentView === 'FEED' ? (
          <div className="flex-[3] flex flex-col gap-8 min-h-0">
            <div className={`flex-1 bg-black rounded-[3.5rem] border-2 overflow-hidden relative transition-all duration-1000 ${status.isCrying ? 'border-red-500 ring-[12px] ring-red-500/20 shadow-2xl shadow-red-500/20' : 'border-slate-800/50 shadow-2xl shadow-black'}`}>
              <video ref={remoteVideoRef} autoPlay playsInline muted={isMuted} className="w-full h-full object-cover" />
              {peerConnected && isMuted && (
                <div onClick={() => setIsMuted(false)} className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[6px] cursor-pointer group transition-all z-20">
                  <div className="bg-blue-600 p-10 rounded-[2.5rem] mb-8 shadow-2xl transition-all group-hover:scale-110 shadow-blue-900/60"><VolumeX className="w-12 h-12 text-white" /></div>
                  <p className="text-white font-black uppercase tracking-[0.4em] text-[11px] animate-pulse">Activate Nursery Audio</p>
                </div>
              )}
              {!peerConnected && !isConnecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-[#020617]/95 backdrop-blur-xl text-center z-30">
                  <div className="bg-slate-900/40 p-16 rounded-[4rem] border border-slate-800/50 w-full max-w-lg">
                    <div className="w-24 h-24 bg-blue-600/10 rounded-[2.2rem] flex items-center justify-center mx-auto mb-10"><Signal className="w-12 h-12 text-blue-500" /></div>
                    <h3 className="text-3xl font-black uppercase mb-10">Link Nursery Unit</h3>
                    <input type="text" maxLength={5} placeholder="00000" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="bg-[#020617] border border-slate-800 rounded-[2rem] px-8 py-8 text-center text-6xl font-mono font-black text-blue-500 mb-6 w-full" />
                    <button onClick={linkToNursery} className="w-full bg-blue-600 py-8 rounded-[2rem] shadow-2xl font-black uppercase tracking-[0.3em] flex items-center justify-center gap-4"><Link2 className="w-6 h-6" /> Initialize Link</button>
                  </div>
                </div>
              )}
              {peerConnected && (
                <button onClick={() => setIsMuted(!isMuted)} className={`absolute top-10 right-10 p-5 rounded-[1.5rem] backdrop-blur-2xl transition-all z-40 border-2 ${isMuted ? 'bg-red-600 border-red-400' : 'bg-slate-900/60 border-white/10'}`}>
                  {isMuted ? <VolumeX className="w-7 h-7 text-white" /> : <Volume2 className="w-7 h-7 text-white" />}
                </button>
              )}
            </div>

            <div className="h-36 shrink-0 relative">
              <button 
                onMouseDown={() => setParentMic(true)} onMouseUp={() => setParentMic(false)} onMouseLeave={() => setParentMic(false)}
                onTouchStart={(e) => { e.preventDefault(); setParentMic(true); }} onTouchEnd={(e) => { e.preventDefault(); setParentMic(false); }}
                className={`w-full h-full rounded-[3.5rem] border-2 transition-all flex items-center justify-center gap-10 active:scale-[0.96] ${isTalking ? 'bg-blue-600 border-blue-400 shadow-2xl shadow-blue-900/60' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
              >
                <div className="relative">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${isTalking ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-500'}`}>
                    {isTalking ? <Mic className="w-12 h-12 animate-pulse" /> : <MicOff className="w-12 h-12" />}
                  </div>
                  {isTalking && (
                    <div className="absolute -right-5 top-3 bottom-3 w-2.5 bg-white/30 rounded-full overflow-hidden">
                      <div className="w-full bg-white absolute bottom-0 transition-all duration-75" style={{ height: `${localMicVolume}%` }} />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-[12px] font-black uppercase tracking-[0.4em] mb-2 ${isTalking ? 'text-blue-100' : 'text-slate-500'}`}>Parent Terminal</p>
                  <h3 className="text-4xl font-black uppercase tracking-tighter">{isTalking ? 'BROADCASTING' : 'HOLD TO TALK'}</h3>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-slate-900/20 backdrop-blur-md rounded-[4rem] border border-slate-800 p-10 flex flex-col lg:flex-row gap-10 overflow-hidden shadow-2xl">
            <div className="flex-[2] overflow-y-auto custom-scrollbar pr-6">
              <div className="bg-slate-900/60 p-16 rounded-[3.5rem] text-center border border-slate-800/50">
                <div className="w-28 h-28 bg-blue-600/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-lg"><BrainCircuit className="w-14 h-14 text-blue-500" /></div>
                <h3 className="text-4xl font-black uppercase mb-4">Diagnostic Lab</h3>
                <p className="text-slate-500 text-[13px] mb-12 font-bold uppercase tracking-wider max-w-sm mx-auto opacity-70">Upload pediatric logs or nursery biometric photos for AI synthesis.</p>
                <input type="file" onChange={onFileUpload} className="hidden" id="file-hub" />
                <label htmlFor="file-hub" className="bg-blue-600 px-12 py-6 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-5 mx-auto mt-4 cursor-pointer hover:bg-blue-500 transition-all shadow-2xl shadow-blue-900/40">
                  <Upload className="w-6 h-6" /> {isAnalyzing ? 'Processing Intelligence...' : 'Upload Data Unit'}
                </label>
              </div>
              {analysisResult && (
                <div className="mt-12 space-y-10">
                  <div className="bg-slate-900/80 p-12 rounded-[3.5rem] border border-slate-800 shadow-2xl">
                    <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.5em] mb-8 flex items-center gap-4"><Sparkles className="w-6 h-6" /> Analysis Output</h4>
                    <p className="text-slate-200 text-xl leading-relaxed font-semibold">{analysisResult.summary}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 bg-[#020617]/90 rounded-[3.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
               <div className="p-8 border-b border-slate-800/50 flex items-center gap-5 bg-slate-900/20">
                 <MessageSquare className="w-7 h-7 text-blue-500" />
                 <span className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em]">AI Core</span>
               </div>
               <div className="flex-1 p-8 space-y-8 overflow-y-auto custom-scrollbar">
                 {chatHistory.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[90%] p-6 rounded-[2rem] text-[14px] leading-relaxed font-bold ${chat.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>{chat.text}</div>
                   </div>
                 ))}
               </div>
               <div className="p-8 bg-slate-900/40 border-t border-slate-800/50 flex gap-5">
                 <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onQuestionAsk()} placeholder="Query Assistant..." className="flex-1 bg-[#020617] border border-slate-800 rounded-[2rem] px-8 py-6 text-sm outline-none focus:border-blue-600 font-bold" />
                 <button onClick={onQuestionAsk} disabled={!chatMessage.trim()} className="p-6 bg-blue-600 rounded-[2rem] hover:bg-blue-500 shadow-xl"><Send className="w-7 h-7" /></button>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
