
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Baby, 
  Monitor, 
  Mic, 
  MicOff, 
  ChevronLeft, 
  Power, 
  Activity, 
  Volume2, 
  VolumeX, 
  MessageSquare, 
  SwitchCamera,
  Lock,
  Signal,
  Smartphone,
  Send,
  Sparkles,
  BrainCircuit,
  Upload,
  LogOut,
  Video,
  VideoOff,
  Music,
  Moon,
  Wind
} from 'lucide-react';
// Capacitor Native Imports
import { KeepAwake } from '@capacitor-community/keep-awake';
import { AppMode, BabyStatus, FileData, AnalysisResult, LULLABIES, LullabyOption } from './types.ts';
import { GeminiService } from './services/gemini.ts';

declare const Peer: any;

const NOISE_POLL_INTERVAL = 200; 
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

const SLEEP_PREVENT_VIDEO_B64 = "data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAZptb292AAAAbG12aGQAAAAA190629fdOtkAAAPoAAAAKAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAGWlveHltAAAAEGJydm0AAAAAAQAAAAGhdHJhawAAAFx0a2hkAAAAAdfdOtrX3TrZAAAAAQAAAAAAAAPoAAAAAAAAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAYbWRpYQAAACBtZGhkAAAAA9fdOtrX3TrZAAAALAAAABQBAAEAAAAAAAAAImhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABUW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAPNzdGJsAAAAr3N0c2QAAAAAAAAAAQAAAJ9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAKAAoABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAM/+EAFWfCwAzYAtYCAgKAAAAAAwCAAAAeBIsXhEAAAAAAGHN0dHMAAAAAAAAAAQAAAAEAAAAUAAAAFHN0c3oAAAAAAAAAAAAAAAEAAABMc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0Y28AAAAAAAAAAQAAAEwAAAAidWR0YQAAABp0cm9sAAAAAQAAAAAAAAAAAAAAAAAAAAAA";

const App: React.FC = () => {
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

  const [peerId, setPeerId] = useState<string>('');
  const [targetPeerId, setTargetPeerId] = useState<string>('');
  const [peerConnected, setPeerConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  
  const [stealthMode, setStealthMode] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const isTalkingRef = useRef(false);
  const [isMuted, setIsMuted] = useState(true); 
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);

  const [babyMicEnabled, setBabyMicEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [localMicVolume, setLocalMicVolume] = useState(0);
  const [parentVideoVisible, setParentVideoVisible] = useState(false);
  const [parentCameraEnabled, setParentCameraEnabled] = useState(false);

  // Lullaby State
  const [activeLullaby, setActiveLullaby] = useState<string | null>(null);
  const activeLullabyRef = useRef<string | null>(null);
  const lullabyOscillatorRef = useRef<any>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<FileData | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  const peerRef = useRef<any>(null);
  const dataConnRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const babyIncomingAudioRef = useRef<HTMLAudioElement>(null);
  const babyIncomingVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const noSleepVideoRef = useRef<HTMLVideoElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const localMicAnalyserRef = useRef<AnalyserNode | null>(null);
  const geminiRef = useRef<GeminiService | null>(null);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { geminiRef.current = new GeminiService(); }, []);

  // Remote Stream Sync
  useEffect(() => {
    if (remoteStream) {
      if (mode === 'BABY_STATION' && babyIncomingVideoRef.current) {
        if (babyIncomingVideoRef.current.srcObject !== remoteStream) {
          babyIncomingVideoRef.current.srcObject = remoteStream;
          babyIncomingVideoRef.current.play().catch(() => {});
        }
      } else if (mode === 'PARENT_STATION' && remoteVideoRef.current) {
        if (remoteVideoRef.current.srcObject !== remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
      }
    }
  }, [remoteStream, mode, parentVideoVisible, peerConnected]);

  // Synthesis engine for Lullabies
  const playSynthesizedLullaby = (type: string) => {
    stopLullaby();
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const ctx = audioContextRef.current;
    
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.connect(ctx.destination);

    const playNote = (freq: number, time: number, duration: number) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      noteGain.gain.setValueAtTime(0, time);
      noteGain.gain.linearRampToValueAtTime(0.1, time + 0.1);
      noteGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(noteGain);
      noteGain.connect(gainNode);
      osc.start(time);
      osc.stop(time + duration);
      return osc;
    };

    let sequence: number[] = [];
    if (type === 'calm') sequence = [261.63, 329.63, 392.00, 523.25];
    else if (type === 'nature') sequence = [196.00, 246.94, 293.66, 392.00];
    else sequence = [261.63, 261.63, 392.00, 392.00, 440.00, 440.00, 392.00];

    let startTime = ctx.currentTime;
    const interval = setInterval(() => {
      if (activeLullabyRef.current !== type) { clearInterval(interval); return; }
      sequence.forEach((freq, i) => {
        playNote(freq, startTime + i * 0.8, 1.5);
      });
      startTime += sequence.length * 0.8;
    }, sequence.length * 800);

    lullabyOscillatorRef.current = { stop: () => { clearInterval(interval); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); } };
  };

  const stopLullaby = () => {
    if (lullabyOscillatorRef.current) {
      lullabyOscillatorRef.current.stop();
      lullabyOscillatorRef.current = null;
    }
    setActiveLullaby(null);
    activeLullabyRef.current = null;
  };

  const requestWakeLock = () => {
    if (noSleepVideoRef.current) noSleepVideoRef.current.play().catch(() => {});
    const activateLocks = async () => {
      try { if (KeepAwake?.keepAwake) await KeepAwake.keepAwake(); } catch (e) {}
      if ('wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (e) {}
      }
    };
    activateLocks();
  };

  const releaseWakeLock = async () => {
    try { if (KeepAwake?.allowSleep) await KeepAwake.allowSleep(); } catch (e) {}
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); wakeLockRef.current = null; } catch (e) {}
    }
  };

  const handleData = useCallback((data: any) => {
    if (data.type === 'HEARTBEAT') return;
    if (data.type === 'PARENT_TALK_STATUS') {
      setIsTalking(data.isTalking);
      isTalkingRef.current = data.isTalking;
      return;
    }
    if (data.type === 'PARENT_VIDEO_STATUS') {
      setParentVideoVisible(data.enabled);
      return;
    }
    if (data.type === 'LULLABY_COMMAND') {
      if (data.action === 'START') {
        setActiveLullaby(data.id);
        activeLullabyRef.current = data.id;
        playSynthesizedLullaby(data.id);
      } else {
        stopLullaby();
      }
      return;
    }
    if (data.noiseLevel !== undefined) setStatus(data);
  }, []);

  const createBlankVideoTrack = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d');
    let tick = 0;
    const interval = setInterval(() => {
      if (!ctx) { clearInterval(interval); return; }
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,320,240);
      ctx.fillStyle = '#080808';
      ctx.fillRect(tick % 320, 10, 2, 2);
      tick++;
    }, 200);
    const stream = (canvas as any).captureStream(5);
    const track = stream.getVideoTracks()[0];
    const originalStop = track.stop.bind(track);
    track.stop = () => { clearInterval(interval); originalStop(); };
    return track;
  };

  const createSilentAudioTrack = () => {
    const ctx = new AudioContext();
    const dst = ctx.createMediaStreamDestination();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false; 
    return track;
  };

  const resetStation = () => {
    releaseWakeLock();
    stopLullaby();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (localMicStreamRef.current) localMicStreamRef.current.getTracks().forEach(t => t.stop());
    setRemoteStream(null);
    if (activeCallRef.current) activeCallRef.current.close();
    if (dataConnRef.current) dataConnRef.current.close();
    if (peerRef.current) peerRef.current.destroy();
    peerRef.current = null;
    setMode('ROLE_SELECTION');
  };

  useEffect(() => {
    if (mode === 'ROLE_SELECTION' || peerRef.current) return;
    const initPeer = () => {
      if (typeof Peer === 'undefined') { setTimeout(initPeer, 500); return; }
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
        let answerStream = (mode === 'BABY_STATION' && localStreamRef.current) 
          ? localStreamRef.current 
          : new MediaStream([createBlankVideoTrack(), createSilentAudioTrack()]);
        call.answer(answerStream);
        call.on('stream', (s: MediaStream) => { setRemoteStream(s); setPeerConnected(true); });
      });
    };
    initPeer();
  }, [mode, handleData]);

  const unlockSpeaker = async () => {
    requestWakeLock();
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      setAudioUnlocked(true);
      audioUnlockedRef.current = true;
    } catch (e) { console.error(e); }
  };

  const startNurseryMonitor = async (forceFacingMode?: 'user' | 'environment') => {
    requestWakeLock();
    setStreamError(null);
    const modeToUse = forceFacingMode || facingMode;
    try {
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: modeToUse, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      stream.getAudioTracks().forEach(t => t.enabled = babyMicEnabled);
      localStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsLive(true);
      if (activeCallRef.current && activeCallRef.current.peerConnection) {
        const senders = activeCallRef.current.peerConnection.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        senders.forEach((sender: any) => {
          if (sender.track?.kind === 'video' && videoTrack) sender.replaceTrack(videoTrack).catch(console.error);
          else if (sender.track?.kind === 'audio' && audioTrack) sender.replaceTrack(audioTrack).catch(console.error);
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
    } catch (e) { setStreamError("Access denied."); }
  };

  // Fix: Added toggleBabyMic to handle microphone muting in the nursery
  const toggleBabyMic = () => {
    const newState = !babyMicEnabled;
    setBabyMicEnabled(newState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = newState);
    }
  };

  // Fix: Added flipCamera to switch between front and back cameras
  const flipCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    startNurseryMonitor(newMode);
  };

  const linkToNursery = async () => {
    requestWakeLock();
    if (!targetPeerId || !peerRef.current) return;
    setIsConnecting(true);
    try {
      const conn = peerRef.current.connect(targetPeerId, { reliable: true });
      dataConnRef.current = conn;
      conn.on('open', () => setPeerConnected(true));
      conn.on('data', handleData);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: parentCameraEnabled });
      localMicStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => t.enabled = false);
      let videoTrack = parentCameraEnabled ? stream.getVideoTracks()[0] : createBlankVideoTrack();
      const call = peerRef.current.call(targetPeerId, new MediaStream([...stream.getAudioTracks(), videoTrack]));
      activeCallRef.current = call;
      call.on('stream', (s: MediaStream) => { setRemoteStream(s); setPeerConnected(true); setIsConnecting(false); });
    } catch (e) { setIsConnecting(false); setStreamError("Link failed."); }
  };

  const triggerRemoteLullaby = (id: string) => {
    if (!dataConnRef.current?.open) return;
    const action = activeLullaby === id ? 'STOP' : 'START';
    dataConnRef.current.send({ type: 'LULLABY_COMMAND', id, action });
    setActiveLullaby(action === 'START' ? id : null);
  };

  const setParentMic = (enabled: boolean) => {
    setIsTalking(enabled);
    isTalkingRef.current = enabled;
    if (localMicStreamRef.current) localMicStreamRef.current.getAudioTracks().forEach(t => t.enabled = enabled);
    if (dataConnRef.current?.open) dataConnRef.current.send({ type: 'PARENT_TALK_STATUS', isTalking: enabled });
  };

  const toggleParentCamera = async () => {
    const newState = !parentCameraEnabled;
    setParentCameraEnabled(newState);
    if (dataConnRef.current?.open) dataConnRef.current.send({ type: 'PARENT_VIDEO_STATUS', enabled: newState });
    if (peerConnected && activeCallRef.current?.peerConnection) {
       try {
         let newTrack = newState 
          ? (await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })).getVideoTracks()[0]
          : createBlankVideoTrack();
         const videoSender = activeCallRef.current.peerConnection.getSenders().find((s: any) => s.track?.kind === 'video');
         if (videoSender) await videoSender.replaceTrack(newTrack);
       } catch (err) { console.error(err); }
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
    const msg = chatMessage; setChatMessage(''); setIsAsking(true);
    setChatHistory(prev => [...prev, { role: 'user', text: msg }]);
    try {
      const answer = await geminiRef.current.askQuestion(uploadedFile, msg, chatHistory);
      setChatHistory(prev => [...prev, { role: 'model', text: answer }]);
    } catch (err) { setChatHistory(prev => [...prev, { role: 'model', text: "Service busy." }]); }
    finally { setIsAsking(false); }
  };

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="mb-12">
          <div className="w-20 h-20 bg-blue-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl">
            <Baby className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tighter mb-3">Lullaby AI</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em]">Smart Monitoring Node</p>
        </div>
        <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
          <button onClick={() => setMode('BABY_STATION')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-lg group">
            <Smartphone className="w-8 h-8 text-blue-500 group-hover:scale-110 transition-transform" />
            <div className="text-left w-full">
              <h3 className="text-lg font-bold uppercase tracking-tight">Baby Unit</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Deploy in nursery</p>
            </div>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-lg group">
            <Monitor className="w-8 h-8 text-indigo-500 group-hover:scale-110 transition-transform" />
            <div className="text-left w-full">
              <h3 className="text-lg font-bold uppercase tracking-tight">Parent Unit</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Master control hub</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`fixed inset-0 ${stealthMode ? 'bg-black' : 'bg-[#020617]'} flex flex-col text-white transition-colors duration-1000 overflow-hidden`}>
        <video ref={noSleepVideoRef} loop muted playsInline className="hidden"><source src={SLEEP_PREVENT_VIDEO_B64} type="video/mp4" /></video>
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 mb-10 w-full max-w-xs text-center shadow-2xl">
              <span className="text-[10px] font-bold uppercase text-blue-500 mb-4 block tracking-widest">Nursery Node ID</span>
              <div className="text-6xl font-mono font-bold tracking-tighter text-white">{peerId || '-----'}</div>
            </div>
            <button onClick={() => startNurseryMonitor()} className="bg-blue-600 w-full max-w-xs py-6 rounded-[2rem] font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-4 active:scale-95 shadow-2xl">
              <Power className="w-5 h-5" /> Start Node
            </button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-12 text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><ChevronLeft className="w-3 h-3" /> System Menu</button>
          </div>
        ) : (
          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            <div className={`absolute top-16 right-4 w-40 h-56 rounded-[2.5rem] overflow-hidden border-2 border-white/10 bg-black shadow-2xl transition-all duration-700 ${parentVideoVisible && !stealthMode ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}>
               <video ref={babyIncomingVideoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />
            </div>

            {activeLullaby && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-6">
                <div className="w-24 h-24 bg-blue-600/30 backdrop-blur-3xl rounded-full flex items-center justify-center animate-pulse">
                  <Music className="w-10 h-10 text-blue-400" />
                </div>
                {!stealthMode && <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-blue-400 animate-bounce">Playing Lullaby</p>}
              </div>
            )}

            {!audioUnlocked && !stealthMode && (
              <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-10 text-center backdrop-blur-sm">
                <Volume2 className="w-12 h-12 text-blue-500 mb-8 animate-pulse" />
                <h3 className="text-2xl font-bold mb-4 uppercase tracking-tight">Audio Protocol</h3>
                <p className="text-slate-400 text-sm mb-12 max-w-[280px] leading-relaxed">System requires manual initialization to activate synthesized audio and remote talkback.</p>
                <button onClick={unlockSpeaker} className="bg-blue-600 w-full max-w-xs py-5 rounded-[1.5rem] font-bold uppercase text-[11px] tracking-widest active:scale-95 shadow-xl">Activate Hardware</button>
              </div>
            )}

            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-md flex items-center justify-center z-40">
                <div className="bg-blue-600 px-10 py-6 rounded-[2.5rem] flex items-center gap-4 shadow-2xl animate-bounce border border-white/20">
                  <Mic className="w-8 h-8" />
                  <span className="font-bold uppercase tracking-widest text-[12px]">Parent Online</span>
                </div>
              </div>
            )}

            <div className={`absolute bottom-10 inset-x-0 flex items-center justify-center gap-4 transition-all ${stealthMode ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100'}`}>
              <div className="bg-slate-900/90 backdrop-blur-3xl p-4 rounded-[3rem] flex items-center gap-4 border border-white/10 shadow-2xl">
                <button onClick={toggleBabyMic} className={`p-6 rounded-[1.5rem] transition-all active:scale-90 ${babyMicEnabled ? 'bg-slate-800' : 'bg-red-600'}`}>
                  {babyMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button onClick={flipCamera} className="p-6 rounded-[1.5rem] bg-slate-800 active:scale-90">
                  <SwitchCamera className="w-6 h-6" />
                </button>
                <button onClick={() => setStealthMode(true)} className="px-10 py-6 rounded-[1.5rem] bg-blue-600 font-bold text-[11px] uppercase tracking-widest flex items-center gap-3 active:scale-95">
                  <Lock className="w-4 h-4" /> Stealth
                </button>
              </div>
            </div>
            
            {stealthMode && (
              <div className="absolute inset-0 bg-black flex flex-col items-center justify-center cursor-pointer" onDoubleClick={() => setStealthMode(false)}>
                <Lock className="w-16 h-16 text-white/5 mb-8" />
                <p className="text-white/10 font-bold uppercase tracking-[0.5em] text-center text-[10px]">Active Secure Stream</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col p-4 md:p-6 text-white overflow-hidden">
      <video ref={noSleepVideoRef} loop muted playsInline className="hidden"><source src={SLEEP_PREVENT_VIDEO_B64} type="video/mp4" /></video>
      <div className="flex items-center justify-between mb-8 h-14 shrink-0 z-10 safe-top">
        <div className="flex items-center gap-4">
          <button onClick={resetStation} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 active:scale-90 transition-transform">
            <ChevronLeft className="w-6 h-6 text-slate-400" />
          </button>
          <div>
            <h2 className="text-lg font-bold tracking-tight mb-0.5 uppercase">Nursery Hub</h2>
            <div className="flex items-center gap-2">
              <Signal className={`w-3 h-3 ${peerConnected ? 'text-green-500' : 'text-slate-700'}`} />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {peerConnected ? 'Secure Protocol Active' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-2xl shadow-xl">
          <button onClick={() => setParentView('FEED')} className={`px-6 py-3 rounded-xl text-[10px] font-bold transition-all uppercase tracking-[0.1em] ${parentView === 'FEED' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Live Feed</button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-6 py-3 rounded-xl text-[10px] font-bold transition-all uppercase tracking-[0.1em] ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>AI Health</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-hidden mb-safe">
        {parentView === 'FEED' ? (
          <div className="flex-1 flex flex-col gap-6">
            <div className={`flex-1 bg-black rounded-[3rem] border overflow-hidden relative transition-all duration-700 shadow-2xl ${status.isCrying ? 'border-red-600 ring-8 ring-red-600/10 animate-alert-border' : 'border-slate-800'}`}>
              <video ref={remoteVideoRef} autoPlay playsInline muted={isMuted} className="w-full h-full object-cover" />
              
              {peerConnected && isMuted && (
                <div onClick={() => { setIsMuted(false); requestWakeLock(); }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md cursor-pointer z-20">
                  <div className="bg-blue-600 p-8 rounded-[2.5rem] mb-6 shadow-2xl active:scale-90"><VolumeX className="w-10 h-10 text-white" /></div>
                  <p className="text-white font-bold uppercase tracking-[0.3em] text-[11px]">Activate Monitoring Stream</p>
                </div>
              )}
              
              {!peerConnected && !isConnecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-10 bg-black/95 text-center z-30 backdrop-blur-sm">
                  <Smartphone className="w-16 h-16 text-blue-500 mb-8" />
                  <h3 className="text-2xl font-bold mb-6 uppercase tracking-tight">Sync Protocol</h3>
                  <div className="w-full max-w-xs flex flex-col gap-4">
                    <input type="text" maxLength={5} placeholder="00000" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="bg-slate-900 border border-slate-800 rounded-2xl px-8 py-6 text-center text-5xl font-mono font-bold text-blue-500 focus:border-blue-500 outline-none transition-colors shadow-inner" />
                    <button onClick={linkToNursery} className="bg-blue-600 py-6 rounded-2xl font-bold uppercase text-[12px] tracking-widest active:scale-95 shadow-2xl transition-all">Link Nursery Unit</button>
                  </div>
                </div>
              )}

              {peerConnected && !isMuted && (
                <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
                   <div className="bg-red-600/80 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-2 border border-red-400/50 shadow-lg">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Secure Live</span>
                   </div>
                   <button onClick={() => setIsMuted(true)} className="p-4 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-white/10 pointer-events-auto active:scale-90"><Volume2 className="w-5 h-5" /></button>
                </div>
              )}
            </div>

            <div className="h-44 grid grid-cols-2 gap-4 shrink-0 pb-safe">
              <div className="flex flex-col gap-3">
                <button 
                  onMouseDown={() => { setParentMic(true); requestWakeLock(); }} onMouseUp={() => setParentMic(false)} onMouseLeave={() => setParentMic(false)}
                  onTouchStart={(e) => { e.preventDefault(); setParentMic(true); requestWakeLock(); }} onTouchEnd={(e) => { e.preventDefault(); setParentMic(false); }}
                  className={`flex-1 rounded-[2.5rem] border transition-all flex flex-col items-center justify-center gap-3 active:scale-[0.97] ${isTalking ? 'bg-blue-600 border-blue-400 shadow-2xl' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isTalking ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-500'}`}>
                    {isTalking ? <Mic className="w-6 h-6 animate-pulse" /> : <MicOff className="w-6 h-6" />}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${isTalking ? 'text-white' : 'text-slate-500'}`}>Remote Talk</span>
                </button>
                <button 
                  onClick={() => { toggleParentCamera(); requestWakeLock(); }}
                  className={`h-16 rounded-[1.5rem] border transition-all flex items-center justify-center gap-3 active:scale-[0.97] ${parentCameraEnabled ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-900/60 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
                >
                  {parentCameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5 text-slate-500" />}
                  <span className="text-[9px] font-bold uppercase tracking-widest">{parentCameraEnabled ? 'Camera On' : 'Camera Off'}</span>
                </button>
              </div>

              <div className="bg-slate-900/40 rounded-[2.5rem] border border-slate-800 p-4 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                <span className="text-[9px] font-bold uppercase text-slate-500 tracking-widest px-2 mb-1">Lullaby Remote</span>
                {LULLABIES.map(l => (
                  <button 
                    key={l.id} 
                    onClick={() => triggerRemoteLullaby(l.id)} 
                    className={`p-3 rounded-2xl flex items-center gap-3 transition-all border ${activeLullaby === l.id ? 'bg-blue-600 border-blue-400' : 'bg-slate-800/50 border-transparent hover:border-slate-700'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
                  >
                    <div className="w-8 h-8 bg-black/20 rounded-xl flex items-center justify-center">
                      {l.id === 'calm' ? <Wind className="w-4 h-4" /> : l.id === 'nature' ? <Moon className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                    </div>
                    <div className="text-left">
                      <h4 className="text-[10px] font-bold uppercase leading-tight">{l.name}</h4>
                      <p className="text-[8px] text-white/40 truncate w-24">Synthesized</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-slate-900/20 backdrop-blur-xl rounded-[3rem] border border-slate-800 p-6 flex flex-col lg:flex-row gap-6 overflow-hidden">
            <div className="flex-[1.2] overflow-y-auto custom-scrollbar pr-3 pb-safe space-y-6">
              <div className="bg-slate-900/60 p-10 rounded-[2.5rem] text-center border border-slate-800 shadow-2xl group">
                <BrainCircuit className="w-12 h-12 text-blue-500 mx-auto mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold mb-4 tracking-tight uppercase">AI Health Scanner</h3>
                <p className="text-slate-500 text-[11px] mb-12 font-medium leading-relaxed uppercase tracking-widest">Upload Sleep logs or Health Photos</p>
                <input type="file" onChange={onFileUpload} className="hidden" id="file-hub-v4" />
                <label htmlFor="file-hub-v4" className="bg-blue-600 w-full py-6 rounded-[1.5rem] font-bold uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-4 cursor-pointer active:scale-95 shadow-xl transition-all">
                  <Upload className="w-5 h-5" /> {isAnalyzing ? 'SYNTHESIZING DATA...' : 'SCAN DOCUMENT'}
                </label>
              </div>
              
              {analysisResult && (
                <div className="space-y-6">
                  <div className="bg-slate-900/60 p-8 rounded-[2.5rem] border border-slate-800 shadow-lg">
                    <h4 className="text-[11px] font-bold text-blue-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3"><Sparkles className="w-4 h-4" /> System Summary</h4>
                    <p className="text-slate-200 text-sm leading-relaxed font-medium">{analysisResult.summary}</p>
                    
                    {analysisResult.visualizations?.map((viz, vIdx) => (
                      <div key={vIdx} className="mt-8">
                         <h5 className="text-[9px] font-bold uppercase text-slate-500 mb-4 tracking-widest">{viz.label}</h5>
                         <div className="flex items-end gap-2 h-32">
                           {viz.data.map((d, dIdx) => (
                             <div key={dIdx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                <div 
                                  className="w-full bg-blue-600 rounded-lg transition-all duration-1000 origin-bottom hover:bg-indigo-500 shadow-lg" 
                                  style={{ height: `${(d.value / Math.max(...viz.data.map(i => i.value))) * 100}%` }} 
                                />
                                <span className="text-[7px] font-bold uppercase text-slate-600 group-hover:text-blue-500">{d.name}</span>
                             </div>
                           ))}
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex-1 bg-black/60 rounded-[3rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl mb-safe">
               <div className="p-6 border-b border-slate-800 flex items-center gap-4 bg-slate-900/40">
                 <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                 <span className="text-[11px] font-bold uppercase text-slate-400 tracking-[0.2em]">Pediatric Node</span>
               </div>
               <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
                 {chatHistory.length === 0 && (
                   <div className="mt-32 flex flex-col items-center opacity-10">
                     <MessageSquare className="w-16 h-16 mb-6" />
                     <p className="text-center text-[11px] uppercase font-bold tracking-[0.5em]">System Ready</p>
                   </div>
                 )}
                 {chatHistory.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[90%] p-6 rounded-[2rem] text-[13px] font-medium shadow-2xl ${chat.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>{chat.text}</div>
                   </div>
                 ))}
               </div>
               <div className="p-6 bg-slate-900 border-t border-slate-800 flex gap-4 safe-bottom">
                 <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onQuestionAsk()} placeholder="Query AI node..." className="flex-1 bg-black border border-slate-800 rounded-2xl px-6 py-5 text-sm outline-none focus:border-blue-600 transition-colors shadow-inner" />
                 <button onClick={onQuestionAsk} disabled={!chatMessage.trim() || isAsking} className="p-5 bg-blue-600 rounded-2xl disabled:opacity-30 active:scale-95 shadow-2xl transition-transform"><Send className="w-6 h-6" /></button>
               </div>
            </div>
          </div>
        )}
      </div>

      <div className={`mt-6 lg:hidden px-8 py-5 rounded-[2.5rem] border flex items-center justify-between transition-all duration-1000 ${status.isCrying ? 'bg-red-600 text-white border-white' : 'bg-slate-900/60 border-slate-800 text-slate-500'}`}>
        <div className="flex items-center gap-5">
          <Baby className={`w-6 h-6 ${status.isCrying ? 'animate-bounce text-white' : 'text-blue-500'}`} />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]">{status.statusMessage}</span>
        </div>
        <div className="text-[10px] font-bold font-mono tracking-tighter bg-black/20 px-3 py-1.5 rounded-lg">{status.noiseLevel}% MONITOR</div>
      </div>
    </div>
  );
};

export default App;
