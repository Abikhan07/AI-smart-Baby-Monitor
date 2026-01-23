
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Baby, 
  Monitor, 
  Mic, 
  MicOff, 
  ChevronLeft, 
  Link2, 
  Power, 
  Activity, 
  Volume2, 
  VolumeX, 
  MessageSquare, 
  SwitchCamera,
  Settings2,
  Lock,
  Signal,
  Smartphone,
  Send,
  Sparkles,
  BrainCircuit,
  Upload,
  ShieldAlert,
  LogOut,
  Video,
  VideoOff,
  User
} from 'lucide-react';
// Capacitor Native Imports
import { KeepAwake } from '@capacitor-community/keep-awake';
import { AppMode, BabyStatus, FileData, AnalysisResult } from './types.ts';
import { GeminiService } from './services/gemini.ts';

declare const Peer: any;

const NOISE_POLL_INTERVAL = 200; 
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

const App: React.FC = () => {
  // Application State
  const [mode, setMode] = useState<AppMode>('ROLE_SELECTION');
  const [parentView, setParentView] = useState<'FEED' | 'AI_INSIGHTS'>('FEED');
  const [status, setStatus] = useState<BabyStatus>({
    isCrying: false,
    noiseLevel: 0,
    lastEvent: 'Standby',
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
  
  // UI Controls
  const [stealthMode, setStealthMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isTalking, setIsTalking] = useState(false);
  const isTalkingRef = useRef(false);
  const [isMuted, setIsMuted] = useState(true); 
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);

  // Baby Station specific
  const [babyMicEnabled, setBabyMicEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [localMicVolume, setLocalMicVolume] = useState(0);
  const [parentVideoVisible, setParentVideoVisible] = useState(false);

  // Parent Station specific
  const [parentCameraEnabled, setParentCameraEnabled] = useState(false);

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
  
  // DOM Refs
  const babyIncomingAudioRef = useRef<HTMLAudioElement>(null);
  const babyIncomingVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // Media Logic Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const localMicAnalyserRef = useRef<AnalyserNode | null>(null);
  const geminiRef = useRef<GeminiService | null>(null);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { geminiRef.current = new GeminiService(); }, []);

  // Screen Wake Lock implementation for Android (Robust native-bridge version)
  const requestWakeLock = async () => {
    // 1. Try Native Capacitor Plugin (Safest for Android)
    try {
      if (KeepAwake) {
        await KeepAwake.keepAwake();
        console.log('Native Android Wake Lock enabled');
        return;
      }
    } catch (e) {
      console.warn('Native KeepAwake plugin failed, falling back to Web API', e);
    }

    // 2. Fallback to Web Wake Lock API (If native fails or in browser)
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Web Screen Wake Lock is active');
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          console.error('WakeLock disallowed by policy. Ensure app is top-level and over HTTPS/Capacitor.');
        } else {
          console.error(`WakeLock error: ${err.name}, ${err.message}`);
        }
      }
    }
  };

  const releaseWakeLock = async () => {
    // 1. Release Native
    try {
      if (KeepAwake) await KeepAwake.allowSleep();
    } catch (e) { /* ignore */ }

    // 2. Release Web
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // Mic Visualization Loop
  useEffect(() => {
    let frameId: number;
    const dataArray = new Uint8Array(32);
    const loop = () => {
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
    if (data.type === 'PARENT_VIDEO_STATUS') {
      setParentVideoVisible(data.enabled);
      return;
    }
    if (data.noiseLevel !== undefined) {
      setStatus(data);
    }
  }, []);

  const createBlankVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0,0,1,1); }
    return (canvas as any).captureStream(1).getVideoTracks()[0];
  };

  const createSilentAudioTrack = () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dst = ctx.createMediaStreamDestination();
    const oscillator = ctx.createOscillator();
    oscillator.connect(dst);
    oscillator.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false; 
    return track;
  };

  const resetStation = () => {
    releaseWakeLock();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (localMicStreamRef.current) localMicStreamRef.current.getTracks().forEach(t => t.stop());
    if (remoteStreamRef.current) remoteStreamRef.current.getTracks().forEach(t => t.stop());

    if (activeCallRef.current) activeCallRef.current.close();
    if (dataConnRef.current) dataConnRef.current.close();
    if (peerRef.current) peerRef.current.destroy();

    peerRef.current = null;
    localStreamRef.current = null;
    localMicStreamRef.current = null;
    remoteStreamRef.current = null;
    activeCallRef.current = null;
    dataConnRef.current = null;

    setPeerId('');
    setPeerConnected(false);
    setIsLive(false);
    setStealthMode(false);
    setParentCameraEnabled(false);
    setParentVideoVisible(false);
    setStatus({
      isCrying: false,
      noiseLevel: 0,
      lastEvent: 'Standby',
      statusMessage: 'Nursery is quiet'
    });
    setMode('ROLE_SELECTION');
  };

  // Initialize Peer
  useEffect(() => {
    if (mode === 'ROLE_SELECTION' || peerRef.current) return;
    const initPeer = () => {
      if (typeof Peer === 'undefined') {
        setTimeout(initPeer, 500);
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
        
        let answerStream: MediaStream;
        if (mode === 'BABY_STATION' && localStreamRef.current) {
          answerStream = localStreamRef.current;
        } else {
          answerStream = new MediaStream([createBlankVideoTrack(), createSilentAudioTrack()]);
        }
        
        call.answer(answerStream);
        
        call.on('stream', (s: MediaStream) => {
          remoteStreamRef.current = s;
          if (mode === 'PARENT_STATION' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = s;
          } else if (mode === 'BABY_STATION') {
             if (babyIncomingAudioRef.current) {
               babyIncomingAudioRef.current.srcObject = s;
               if (audioUnlockedRef.current) babyIncomingAudioRef.current.play().catch(() => {});
             }
             if (babyIncomingVideoRef.current) {
               babyIncomingVideoRef.current.srcObject = s;
             }
          }
          setPeerConnected(true);
        });
      });
    };
    initPeer();
  }, [mode, handleData]);

  const unlockSpeaker = async () => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      setAudioUnlocked(true);
      audioUnlockedRef.current = true;
      if (babyIncomingAudioRef.current && babyIncomingAudioRef.current.srcObject) {
        babyIncomingAudioRef.current.muted = false;
        await babyIncomingAudioRef.current.play();
      }
    } catch (e) { console.error(e); }
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
      
      stream.getAudioTracks().forEach(t => t.enabled = babyMicEnabled);
      localStreamRef.current = stream;
      
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsLive(true);
      requestWakeLock(); // Attempt to prevent Android sleeping
      
      if (activeCallRef.current && activeCallRef.current.peerConnection) {
        const senders = activeCallRef.current.peerConnection.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        
        senders.forEach((sender: any) => {
          if (sender.track?.kind === 'video' && videoTrack) {
            sender.replaceTrack(videoTrack).catch(console.error);
          } else if (sender.track?.kind === 'audio' && audioTrack) {
            sender.replaceTrack(audioTrack).catch(console.error);
          }
        });
      }

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const interval = setInterval(() => {
        if (mode !== 'BABY_STATION' || !localStreamRef.current) { clearInterval(interval); return; }
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length / 255;
        const isCrying = avg > (0.42 - (sensitivityRef.current / 100) * 0.4);
        const newStatus = { 
          isCrying, noiseLevel: Math.round(avg * 100), 
          lastEvent: isCrying ? 'Cry' : 'Quiet', 
          statusMessage: isCrying ? 'BABY IS CRYING' : 'Nursery is quiet' 
        };
        setStatus(newStatus);
        if (dataConnRef.current?.open) dataConnRef.current.send(newStatus);
      }, NOISE_POLL_INTERVAL);
    } catch (e) { 
      setStreamError("Access denied."); 
    }
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
      
      const constraints = { audio: true, video: parentCameraEnabled };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localMicStreamRef.current = stream;
      requestWakeLock(); // Attempt to prevent Android sleeping
      
      stream.getAudioTracks().forEach(t => t.enabled = false);
      
      let videoTrack = parentCameraEnabled ? stream.getVideoTracks()[0] : createBlankVideoTrack();
      
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      localMicAnalyserRef.current = analyser;

      const call = peerRef.current.call(targetPeerId, new MediaStream([...stream.getAudioTracks(), videoTrack]));
      activeCallRef.current = call;
      call.on('stream', (s: MediaStream) => {
        remoteStreamRef.current = s;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = s;
          remoteVideoRef.current.muted = isMuted;
        }
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

  const toggleParentCamera = async () => {
    const newState = !parentCameraEnabled;
    setParentCameraEnabled(newState);
    
    if (dataConnRef.current?.open) {
      dataConnRef.current.send({ type: 'PARENT_VIDEO_STATUS', enabled: newState });
    }

    if (peerConnected && activeCallRef.current?.peerConnection) {
       try {
         let newTrack;
         if (newState) {
           if (localMicStreamRef.current?.getVideoTracks().length === 0) {
             const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
             const vTrack = vStream.getVideoTracks()[0];
             localMicStreamRef.current.addTrack(vTrack);
             newTrack = vTrack;
           } else {
             newTrack = localMicStreamRef.current?.getVideoTracks()[0];
           }
         } else {
           newTrack = createBlankVideoTrack();
         }
         
         const senders = activeCallRef.current.peerConnection.getSenders();
         const videoSender = senders.find((s: any) => s.track?.kind === 'video');
         if (videoSender && newTrack) {
           videoSender.replaceTrack(newTrack);
         }
       } catch (err) {
         console.error("Camera Toggle Error:", err);
       }
    }
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !geminiRef.current) return;
    setIsAnalyzing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      const fileData = { name: file.name, type: file.type, content };
      setUploadedFile(fileData);
      try {
        const result = await geminiRef.current!.analyzeFile(fileData);
        setAnalysisResult(result);
        setChatHistory([]);
      } catch (err) { console.error(err); } finally { setIsAnalyzing(false); }
    };
    if (file.type.startsWith('image/')) reader.readAsDataURL(file); else reader.readAsText(file);
  };

  const onQuestionAsk = async () => {
    if (!chatMessage.trim() || !uploadedFile || !geminiRef.current || isAsking) return;
    const currentMsg = chatMessage;
    setChatMessage('');
    setIsAsking(true);
    setChatHistory(prev => [...prev, { role: 'user', text: currentMsg }]);
    try {
      const answer = await geminiRef.current.askQuestion(uploadedFile, currentMsg, chatHistory);
      setChatHistory(prev => [...prev, { role: 'model', text: answer }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: "Service busy." }]);
    } finally { setIsAsking(false); }
  };

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="min-h-screen w-full bg-[#000000] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl">
            <Baby className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Lullaby AI</h1>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-[0.2em]">Android Station</p>
        </div>
        <div className="grid grid-cols-1 gap-4 w-full max-sm px-4">
          <button onClick={() => setMode('BABY_STATION')} className="bg-slate-900/80 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-lg">
            <Smartphone className="w-8 h-8 text-blue-500" />
            <div className="text-left w-full">
              <h3 className="text-lg font-bold uppercase tracking-tight">Baby Unit</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Place in nursery</p>
            </div>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="bg-slate-900/80 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-lg">
            <Monitor className="w-8 h-8 text-indigo-500" />
            <div className="text-left w-full">
              <h3 className="text-lg font-bold uppercase tracking-tight">Parent Unit</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Carry with you</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`fixed inset-0 ${stealthMode ? 'bg-[#000000]' : 'bg-[#020617]'} flex flex-col text-white transition-colors duration-500 overflow-hidden`}>
        <audio ref={babyIncomingAudioRef} autoPlay playsInline muted={false} />
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="bg-slate-900/50 p-8 rounded-[2rem] border border-slate-800 mb-8 w-full max-w-xs text-center">
              <span className="text-[9px] font-bold uppercase text-blue-500 mb-2 block tracking-widest">Nursery Access Code</span>
              <div className="text-5xl font-mono font-bold tracking-tighter text-white">{peerId || '-----'}</div>
            </div>
            <button onClick={() => startNurseryMonitor()} className="bg-blue-600 w-full max-w-xs py-5 rounded-[1.5rem] font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 shadow-2xl">
              <Power className="w-5 h-5" /> Start Monitor
            </button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-8 text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><ChevronLeft className="w-3 h-3" /> Back to menu</button>
          </div>
        ) : (
          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            <div className={`absolute top-16 right-4 w-36 h-48 rounded-[2rem] overflow-hidden border-2 border-white/20 bg-black shadow-2xl transition-all duration-700 ${parentVideoVisible && !stealthMode ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}>
               <video ref={babyIncomingVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2">
                 <span className="text-[8px] font-bold uppercase tracking-widest text-white/80">Parent</span>
               </div>
            </div>

            {!audioUnlocked && !stealthMode && (
              <div className="absolute inset-0 z-50 bg-[#000000]/95 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                  <Volume2 className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold mb-3 tracking-tight uppercase">Hardware Lock</h3>
                <p className="text-slate-400 text-xs mb-10 max-w-[240px] leading-relaxed">Android requires manual activation to receive parent talkback audio.</p>
                <button onClick={unlockSpeaker} className="bg-blue-600 px-10 py-4 rounded-[1.5rem] font-bold uppercase text-[10px] tracking-widest active:scale-95 shadow-lg">Enable Hardware</button>
              </div>
            )}

            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/20 backdrop-blur-md flex items-center justify-center z-40">
                <div className="bg-blue-600 px-8 py-5 rounded-[2rem] flex items-center gap-4 shadow-2xl animate-bounce border border-white/20">
                  <Mic className="w-6 h-6" />
                  <span className="font-bold uppercase tracking-widest text-[10px]">Parent Incoming</span>
                </div>
              </div>
            )}

            <div className={`absolute top-12 left-4 flex flex-col gap-2 z-20 transition-opacity ${stealthMode ? 'opacity-10' : 'opacity-100'}`}>
              <div className="bg-red-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" /> Live
              </div>
              <div className="bg-slate-900/80 backdrop-blur-xl px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg">
                <Activity className="w-3 h-3 text-blue-500" /> {status.noiseLevel}%
              </div>
            </div>

            <div className={`absolute top-12 right-4 z-30 transition-opacity ${stealthMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <button onClick={resetStation} className="bg-slate-900/80 backdrop-blur-xl p-3.5 rounded-2xl border border-white/10 text-white active:scale-90 shadow-lg">
                <LogOut className="w-6 h-6" />
              </button>
            </div>

            <div className={`absolute bottom-10 inset-x-0 flex items-center justify-center gap-4 transition-all ${stealthMode ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100'}`}>
              <div className="bg-slate-900/90 backdrop-blur-3xl p-4 rounded-[2.5rem] flex items-center gap-3 border border-slate-800 shadow-2xl">
                <button onClick={toggleBabyMic} className={`p-5 rounded-2xl transition-all active:scale-90 ${babyMicEnabled ? 'bg-slate-800' : 'bg-red-600'}`}>
                  {babyMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button onClick={flipCamera} className="p-5 rounded-2xl bg-slate-800 active:scale-90">
                  <SwitchCamera className="w-6 h-6" />
                </button>
                <button onClick={() => setStealthMode(true)} className="px-8 py-5 rounded-2xl bg-blue-600 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 active:scale-95">
                  <Lock className="w-4 h-4" /> Stealth
                </button>
              </div>
            </div>
            
            {stealthMode && (
              <div className="absolute inset-0 bg-[#000000] flex flex-col items-center justify-center cursor-pointer transition-opacity duration-1000" onDoubleClick={() => setStealthMode(false)}>
                <div className="opacity-10 flex flex-col items-center">
                   <Lock className="w-12 h-12 mb-6" />
                   <p className="text-white font-bold uppercase tracking-[0.5em] text-center text-[10px] select-none">
                     SECURE MONITORING<br/><span className="text-[7px] mt-4 block">DOUBLE TAP TO RESTORE</span>
                   </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col p-4 md:p-6 text-white overflow-hidden">
      {/* Native-style Mobile Header */}
      <div className="flex items-center justify-between mb-6 h-14 shrink-0 z-10 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={resetStation} className="p-2.5 bg-slate-900/50 rounded-2xl border border-slate-800 transition-all active:scale-90">
            <ChevronLeft className="w-6 h-6 text-slate-400" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-sm font-bold uppercase tracking-tight leading-none mb-1">Station Hub</h2>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-700'}`} />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                {peerConnected ? 'Active Link' : 'Standby'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-xl">
          <button onClick={() => setParentView('FEED')} className={`px-5 py-2.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest ${parentView === 'FEED' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Live</button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-5 py-2.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>AI</button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden mb-safe">
        {parentView === 'FEED' ? (
          <div className="flex-1 flex flex-col gap-4">
            {/* Monitor Window Optimized for OLED */}
            <div className={`flex-1 bg-[#000000] rounded-[2.5rem] border overflow-hidden relative transition-all duration-700 ${status.isCrying ? 'border-red-600 ring-8 ring-red-600/10' : 'border-slate-800'}`}>
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                muted={isMuted} 
                className="w-full h-full object-cover" 
              />
              
              {peerConnected && isMuted && (
                <div onClick={() => setIsMuted(false)} className="absolute inset-0 flex flex-col items-center justify-center bg-[#000000]/70 backdrop-blur-md cursor-pointer z-20">
                  <div className="bg-blue-600 p-6 rounded-[2rem] mb-4 shadow-2xl active:scale-90"><VolumeX className="w-8 h-8 text-white" /></div>
                  <p className="text-white font-bold uppercase tracking-[0.2em] text-[10px] opacity-80">Enable Audio Stream</p>
                </div>
              )}
              
              {!peerConnected && !isConnecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[#000000]/95 text-center z-30">
                  <div className="w-20 h-20 bg-blue-600/10 rounded-[2rem] flex items-center justify-center mb-8">
                     <Signal className="w-10 h-10 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-bold mb-4 uppercase tracking-tight">Sync Hardware</h3>
                  <div className="w-full max-w-xs flex flex-col gap-4">
                    <input type="text" maxLength={5} placeholder="00000" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="bg-slate-900/50 border border-slate-800 rounded-2xl px-6 py-5 text-center text-4xl font-mono font-bold text-blue-500 outline-none focus:border-blue-500 transition-colors" />
                    <button onClick={linkToNursery} className="bg-blue-600 py-5 rounded-2xl font-bold uppercase text-[11px] tracking-widest active:scale-95 shadow-xl transition-transform">
                      Establish Secure Link
                    </button>
                  </div>
                </div>
              )}

              {peerConnected && (
                <div className="absolute top-6 right-6 flex gap-3 z-40">
                  <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-2xl backdrop-blur-3xl transition-all border shadow-2xl active:scale-90 ${isMuted ? 'bg-red-600 border-red-400' : 'bg-slate-900/80 border-white/20'}`}>
                    {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile-Native Action Bar */}
            <div className="h-28 flex gap-4 shrink-0 pb-safe">
              <button 
                onMouseDown={() => setParentMic(true)} onMouseUp={() => setParentMic(false)} onMouseLeave={() => setParentMic(false)}
                onTouchStart={(e) => { e.preventDefault(); setParentMic(true); }} onTouchEnd={(e) => { e.preventDefault(); setParentMic(false); }}
                className={`flex-[2.5] h-full rounded-[2.5rem] border transition-all flex items-center justify-center gap-5 active:scale-[0.97] ${isTalking ? 'bg-blue-600 border-blue-400 shadow-[0_20px_40px_rgba(37,99,235,0.3)]' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
              >
                <div className={`w-14 h-14 rounded-3xl flex items-center justify-center transition-all shadow-lg ${isTalking ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-500'}`}>
                  {isTalking ? <Mic className="w-7 h-7 animate-pulse" /> : <MicOff className="w-7 h-7" />}
                </div>
                <div className="text-left">
                  <p className={`text-[8px] font-bold uppercase tracking-[0.2em] mb-1 ${isTalking ? 'text-blue-100' : 'text-slate-500'}`}>{isTalking ? 'Transmission' : 'Press & Hold'}</p>
                  <h3 className="text-xl font-bold uppercase tracking-tight leading-none">Talk Link</h3>
                </div>
              </button>

              <button 
                onClick={toggleParentCamera}
                className={`flex-1 h-full rounded-[2.5rem] border transition-all flex flex-col items-center justify-center gap-2 active:scale-[0.97] ${parentCameraEnabled ? 'bg-indigo-600 border-indigo-400 shadow-xl' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
              >
                {parentCameraEnabled ? <Video className="w-7 h-7" /> : <VideoOff className="w-7 h-7 text-slate-500" />}
                <span className={`text-[8px] font-bold uppercase tracking-widest ${parentCameraEnabled ? 'text-indigo-100' : 'text-slate-500'}`}>
                  {parentCameraEnabled ? 'On' : 'Off'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-slate-900/20 backdrop-blur-xl rounded-[2.5rem] border border-slate-800 p-5 flex flex-col lg:flex-row gap-5 overflow-hidden">
            <div className="flex-[1.2] overflow-y-auto custom-scrollbar pr-2 pb-safe">
              <div className="bg-slate-900/40 p-10 rounded-[2rem] text-center border border-slate-800 shadow-inner">
                <div className="w-16 h-16 bg-blue-600/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6">
                   <BrainCircuit className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold mb-3 tracking-tight">AI Diagnostic</h3>
                <p className="text-slate-500 text-[11px] mb-10 font-medium leading-relaxed">Upload baby logs or photos for pediatric-grade synthesis.</p>
                <input type="file" onChange={onFileUpload} className="hidden" id="file-hub-diag-v3" />
                <label htmlFor="file-hub-diag-v3" className="bg-blue-600 w-full py-5 rounded-[1.5rem] font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 cursor-pointer active:scale-95 shadow-xl transition-all">
                  <Upload className="w-4 h-4" /> {isAnalyzing ? 'Syncing...' : 'Upload Log'}
                </label>
              </div>
              
              {analysisResult && (
                <div className="mt-6 space-y-6">
                  <div className="bg-slate-900/60 p-8 rounded-[2rem] border border-slate-800 shadow-lg">
                    <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-3"><Sparkles className="w-4 h-4" /> System Insight</h4>
                    <p className="text-slate-200 text-sm leading-relaxed font-medium">{analysisResult.summary}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex-1 bg-black rounded-[2rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl mb-safe">
               <div className="p-5 border-b border-slate-800 flex items-center gap-3 bg-slate-900/40">
                 <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                 <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Assistant Node</span>
               </div>
               <div className="flex-1 p-5 space-y-5 overflow-y-auto custom-scrollbar">
                 {chatHistory.length === 0 && (
                   <div className="mt-20 flex flex-col items-center opacity-20">
                     <MessageSquare className="w-12 h-12 mb-4" />
                     <p className="text-center text-[10px] uppercase font-bold tracking-[0.3em]">Standby</p>
                   </div>
                 )}
                 {chatHistory.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[90%] p-5 rounded-[1.5rem] text-sm font-medium shadow-lg ${chat.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>{chat.text}</div>
                   </div>
                 ))}
               </div>
               <div className="p-5 bg-slate-900 border-t border-slate-800 flex gap-3 safe-bottom">
                 <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onQuestionAsk()} placeholder="Query node..." className="flex-1 bg-black border border-slate-800 rounded-2xl px-5 py-4 text-sm outline-none focus:border-blue-600 transition-colors" />
                 <button onClick={onQuestionAsk} disabled={!chatMessage.trim() || isAsking} className="p-4 bg-blue-600 rounded-2xl disabled:opacity-30 active:scale-95 shadow-xl"><Send className="w-5 h-5" /></button>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Persistent Mobile Status Bar */}
      <div className={`mt-4 lg:hidden px-6 py-4 rounded-[2rem] border flex items-center justify-between transition-all duration-1000 ${status.isCrying ? 'bg-red-600 text-white border-white animate-alert-border' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
        <div className="flex items-center gap-4">
          <Baby className={`w-5 h-5 ${status.isCrying ? 'animate-bounce' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{status.statusMessage}</span>
        </div>
        <div className="text-[10px] font-bold font-mono tracking-tighter">{status.noiseLevel}% SENS</div>
      </div>
    </div>
  );
};

export default App;
