
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // Media Logic Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const localMicAnalyserRef = useRef<AnalyserNode | null>(null);
  const geminiRef = useRef<GeminiService | null>(null);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { geminiRef.current = new GeminiService(); }, []);

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
    if (data.noiseLevel !== undefined) {
      setStatus(data);
    }
  }, []);

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
            if (audioUnlockedRef.current) babyIncomingAudioRef.current.play().catch(() => {});
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
      stream.getAudioTracks().forEach(t => t.enabled = babyMicEnabled);
      setIsLive(true);
      
      // CRITICAL FIX: Replace tracks in existing call if Parent already connected
      if (activeCallRef.current && activeCallRef.current.peerConnection) {
        const senders = activeCallRef.current.peerConnection.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        
        const vSender = senders.find((s: any) => s.track?.kind === 'video');
        const aSender = senders.find((s: any) => s.track?.kind === 'audio');
        
        if (vSender) vSender.replaceTrack(videoTrack);
        if (aSender) aSender.replaceTrack(audioTrack);
      }

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

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
          lastEvent: isCrying ? 'Cry' : 'Quiet', 
          statusMessage: isCrying ? 'BABY IS CRYING' : 'Nursery is quiet' 
        };
        setStatus(newStatus);
        if (dataConnRef.current?.open) dataConnRef.current.send(newStatus);
      }, NOISE_POLL_INTERVAL);
    } catch (e) { setStreamError("Access denied."); }
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
      micStream.getAudioTracks().forEach(t => t.enabled = false);
      
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(micStream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      localMicAnalyserRef.current = analyser;

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
      <div className="min-h-screen w-full bg-[#020617] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="mb-12">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <Baby className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Lullaby AI</h1>
          <p className="text-slate-400 text-sm font-medium">Smart Nursery System</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
          <button onClick={() => setMode('BABY_STATION')} className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex flex-col items-center gap-3 transition-all active:scale-95">
            <Smartphone className="w-8 h-8 text-blue-500" />
            <h3 className="text-lg font-semibold uppercase tracking-tight">Baby Unit</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Nursery Monitor</p>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex flex-col items-center gap-3 transition-all active:scale-95">
            <Monitor className="w-8 h-8 text-indigo-500" />
            <h3 className="text-lg font-semibold uppercase tracking-tight">Parent Unit</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Remote Receiver</p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'BABY_STATION') {
    return (
      <div className={`fixed inset-0 ${stealthMode ? 'bg-black' : 'bg-[#020617]'} flex flex-col text-white transition-colors duration-500`}>
        <audio ref={babyIncomingAudioRef} autoPlay playsInline muted={false} />
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="bg-slate-900 p-10 rounded-[2.5rem] border border-slate-800 mb-8 w-full max-w-xs text-center">
              <span className="text-[10px] font-bold uppercase text-blue-500 mb-2 block tracking-widest">Link Code</span>
              <div className="text-5xl font-mono font-bold tracking-widest">{peerId || '-----'}</div>
            </div>
            <button onClick={() => startNurseryMonitor()} className="bg-blue-600 px-10 py-5 rounded-2xl font-semibold text-sm uppercase tracking-widest flex items-center gap-3 active:scale-95 shadow-lg">
              <Power className="w-5 h-5" /> Start Broadcast
            </button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-8 text-slate-500 text-xs font-bold uppercase tracking-widest">Abort</button>
          </div>
        ) : (
          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            {!audioUnlocked && !stealthMode && (
              <div className="absolute inset-0 z-50 bg-[#020617]/95 flex flex-col items-center justify-center p-10 text-center">
                <Volume2 className="w-16 h-16 text-blue-500 mb-6 animate-pulse" />
                <h3 className="text-xl font-semibold mb-4 uppercase tracking-tight">Audio Terminal Locked</h3>
                <p className="text-slate-400 text-sm mb-10 max-w-xs font-medium">Enable hardware speaker for remote parent communication.</p>
                <button onClick={unlockSpeaker} className="bg-blue-600 px-8 py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest">Enable Link</button>
              </div>
            )}

            {isTalking && !stealthMode && (
              <div className="absolute inset-0 bg-blue-600/20 backdrop-blur-sm flex items-center justify-center z-40">
                <div className="bg-blue-600 px-8 py-5 rounded-full flex items-center gap-4 shadow-2xl animate-pulse border border-white/20">
                  <Mic className="w-6 h-6" />
                  <span className="font-bold uppercase tracking-widest text-xs">Parent is speaking</span>
                </div>
              </div>
            )}

            <div className={`absolute top-6 left-6 flex flex-col gap-2 z-20 transition-opacity ${stealthMode ? 'opacity-10' : 'opacity-100'}`}>
              <div className="bg-red-600 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" /> Broadcast
              </div>
              <div className="bg-slate-900/80 backdrop-blur px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" /> {status.noiseLevel}% Noise
              </div>
            </div>

            <div className={`absolute bottom-8 inset-x-0 flex items-center justify-center gap-4 transition-all ${stealthMode ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100'}`}>
              <div className="bg-slate-900/90 backdrop-blur-2xl p-4 rounded-[2.5rem] flex items-center gap-3 border border-slate-800 shadow-2xl">
                <button onClick={toggleBabyMic} className={`p-5 rounded-2xl transition-colors ${babyMicEnabled ? 'bg-slate-800' : 'bg-red-600'}`}>
                  {babyMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button onClick={flipCamera} className="p-5 rounded-2xl bg-slate-800 hover:bg-slate-700">
                  <SwitchCamera className="w-6 h-6" />
                </button>
                <button onClick={() => setStealthMode(true)} className="px-8 py-5 rounded-2xl bg-blue-600 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Nursery Mode
                </button>
                <button onClick={() => setShowSettings(!showSettings)} className="p-5 rounded-2xl bg-slate-800 hover:bg-slate-700">
                  <Settings2 className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            {stealthMode && (
              <div className="absolute inset-0 bg-black flex flex-col items-center justify-center cursor-pointer transition-opacity duration-1000" onDoubleClick={() => setStealthMode(false)}>
                <p className="text-slate-900 font-bold uppercase tracking-[0.5em] text-center text-[10px] select-none">
                  NURSERY SECURITY ACTIVE<br/><span className="text-[8px] opacity-30 mt-4 block">DOUBLE TAP TO UNLOCK</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col p-4 md:p-8 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 h-14 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode('ROLE_SELECTION')} className="p-2.5 hover:bg-slate-900 rounded-xl transition-all bg-slate-900/50">
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h2 className="text-sm font-semibold tracking-tight uppercase">Parent Hub</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {peerConnected ? 'Live' : 'Standby'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button onClick={() => setParentView('FEED')} className={`px-5 py-2.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest ${parentView === 'FEED' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Feed</button>
          <button onClick={() => setParentView('AI_INSIGHTS')} className={`px-5 py-2.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest ${parentView === 'AI_INSIGHTS' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>AI</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-hidden">
        {parentView === 'FEED' ? (
          <div className="flex-1 flex flex-col gap-6">
            {/* Monitor Window */}
            <div className={`flex-1 bg-black rounded-[2.5rem] border-2 overflow-hidden relative transition-all duration-700 ${status.isCrying ? 'border-red-500 ring-8 ring-red-500/10 shadow-[0_0_40px_-10px_rgba(239,68,68,0.4)]' : 'border-slate-800'}`}>
              <video ref={remoteVideoRef} autoPlay playsInline muted={isMuted} className="w-full h-full object-cover" />
              
              {peerConnected && isMuted && (
                <div onClick={() => setIsMuted(false)} className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer z-20">
                  <div className="bg-blue-600 p-8 rounded-3xl mb-4 shadow-2xl transition-transform active:scale-90"><VolumeX className="w-10 h-10 text-white" /></div>
                  <p className="text-white font-bold uppercase tracking-[0.2em] text-[10px] opacity-80">Enable Nursery Audio</p>
                </div>
              )}
              
              {!peerConnected && !isConnecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[#020617]/98 text-center z-30">
                  <div className="w-20 h-20 bg-blue-600/10 rounded-[2rem] flex items-center justify-center mb-8">
                    <Signal className="w-10 h-10 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-semibold mb-8 uppercase tracking-tight">Link Monitor</h3>
                  <div className="w-full max-w-xs flex flex-col gap-4">
                    <input type="text" maxLength={5} placeholder="00000" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-5 text-center text-4xl font-mono font-bold text-blue-500 outline-none focus:border-blue-600" />
                    <button onClick={linkToNursery} className="bg-blue-600 py-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 shadow-lg">
                      <Link2 className="w-4 h-4" /> Initialize Link
                    </button>
                  </div>
                </div>
              )}

              {peerConnected && (
                <button onClick={() => setIsMuted(!isMuted)} className={`absolute top-6 right-6 p-4 rounded-2xl backdrop-blur transition-all border-2 ${isMuted ? 'bg-red-600 border-red-400' : 'bg-slate-900/60 border-white/10'}`}>
                  {isMuted ? <VolumeX className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
                </button>
              )}
            </div>

            {/* Parent Talkback Bar */}
            <div className="h-32 shrink-0">
              <button 
                onMouseDown={() => setParentMic(true)} onMouseUp={() => setParentMic(false)} onMouseLeave={() => setParentMic(false)}
                onTouchStart={(e) => { e.preventDefault(); setParentMic(true); }} onTouchEnd={(e) => { e.preventDefault(); setParentMic(false); }}
                className={`w-full h-full rounded-[2.5rem] border-2 transition-all flex items-center justify-center gap-8 active:scale-[0.98] ${isTalking ? 'bg-blue-600 border-blue-400 shadow-xl' : 'bg-slate-900 border-slate-800'} ${!peerConnected && 'opacity-20 pointer-events-none'}`}
              >
                <div className="relative">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isTalking ? 'bg-white text-blue-600 shadow-lg scale-110' : 'bg-slate-800 text-slate-500'}`}>
                    {isTalking ? <Mic className="w-8 h-8 animate-pulse" /> : <MicOff className="w-8 h-8" />}
                  </div>
                  {isTalking && (
                    <div className="absolute -right-4 top-2 bottom-2 w-1.5 bg-white/30 rounded-full overflow-hidden">
                      <div className="w-full bg-white absolute bottom-0 transition-all duration-75" style={{ height: `${localMicVolume}%` }} />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-[10px] font-bold uppercase tracking-[0.3em] mb-1.5 ${isTalking ? 'text-blue-100' : 'text-slate-500'}`}>{isTalking ? 'Transmission Live' : 'Voice Link Idle'}</p>
                  <h3 className="text-2xl font-semibold uppercase tracking-tight">{isTalking ? 'Broadcasting' : 'Hold to Talk'}</h3>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-slate-900/30 backdrop-blur rounded-[3rem] border border-slate-800 p-6 flex flex-col lg:flex-row gap-6 overflow-hidden">
            <div className="flex-[1.5] overflow-y-auto custom-scrollbar pr-4">
              <div className="bg-slate-900 p-12 rounded-[2.5rem] text-center border border-slate-800">
                <BrainCircuit className="w-14 h-14 text-blue-500 mx-auto mb-6" />
                <h3 className="text-2xl font-semibold mb-4 uppercase tracking-tight">AI Diagnostic Lab</h3>
                <p className="text-slate-500 text-xs mb-10 max-w-xs mx-auto font-medium leading-relaxed">Securely upload nursery health logs or biometric imagery for intelligent pediatric synthesis.</p>
                <input type="file" onChange={onFileUpload} className="hidden" id="file-hub-3" />
                <label htmlFor="file-hub-3" className="bg-blue-600 px-10 py-5 rounded-2xl font-bold uppercase text-[10px] tracking-widest flex items-center gap-3 mx-auto cursor-pointer hover:bg-blue-500 transition-all shadow-lg active:scale-95 inline-flex">
                  <Upload className="w-4 h-4" /> {isAnalyzing ? 'Analyzing...' : 'Upload Data'}
                </label>
              </div>
              
              {analysisResult && (
                <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-5">
                  <div className="bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-xl">
                    <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Synthesis Report</h4>
                    <p className="text-slate-200 text-sm leading-relaxed font-medium">{analysisResult.summary}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex-1 bg-slate-950/90 rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
               <div className="p-6 border-b border-slate-800 flex items-center gap-3 bg-slate-900/40">
                 <MessageSquare className="w-5 h-5 text-blue-500" />
                 <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Assistant Hub</span>
               </div>
               <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
                 {chatHistory.length === 0 && <p className="text-center mt-20 text-slate-700 text-[10px] uppercase font-bold tracking-[0.4em] px-6 leading-relaxed">Provide context data to initialize assistant</p>}
                 {chatHistory.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[85%] p-5 rounded-[1.5rem] text-[13px] font-medium leading-relaxed ${chat.role === 'user' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>{chat.text}</div>
                   </div>
                 ))}
               </div>
               <div className="p-5 bg-slate-900 border-t border-slate-800 flex gap-3">
                 <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onQuestionAsk()} placeholder="Query AI Hub..." className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs outline-none focus:border-blue-600 font-semibold" />
                 <button onClick={onQuestionAsk} disabled={!chatMessage.trim() || isAsking} className="p-4 bg-blue-600 rounded-2xl hover:bg-blue-500 disabled:opacity-20 active:scale-90 transition-all shadow-xl"><Send className="w-6 h-6" /></button>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Crying Alert (Mobile/Small screens) */}
      <div className={`mt-6 lg:hidden px-6 py-4 rounded-3xl border flex items-center justify-between transition-all duration-700 ${status.isCrying ? 'bg-red-500/10 border-red-500 text-red-500 shadow-lg' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
        <div className="flex items-center gap-4">
          <Baby className={`w-5 h-5 ${status.isCrying ? 'animate-bounce' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{status.statusMessage}</span>
        </div>
        <div className="text-[10px] font-bold font-mono">{status.noiseLevel}% LVL</div>
      </div>
    </div>
  );
};

export default App;
