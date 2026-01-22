
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
  ShieldAlert
} from 'lucide-react';
import { AppMode, BabyStatus, LULLABIES } from './types';

declare const Peer: any;

const NOISE_POLL_INTERVAL = 200; 
const HEARTBEAT_INTERVAL = 3000; 
const RECONNECT_TIMEOUT = 12000; 

// Silent 1x1 pixel black video (base64) to keep mobile browsers active
const SILENT_VIDEO_B64 = "data:video/mp4;base64,AAAAHGZ0eXBpc29tAAAAAGlzb21tcDQyAAAACHZyZWUAAAAIdHcmZgAAAABtZGF0AAAA72ZyZWUAAAAIdW5rbgAAAAhtb292AAAAbG12aGQAAAAA3u94ON7veDkAAAPoAAAAKAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACUHRyYWsAAABcdGtoZAAAAADe73g43u94OQAAAAEAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAgAAAAEAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAKAAAAAAABAAAAAAGIdHJmZgAAAABtZGF0AAAByWZyZWUAAAAIdW5rbgAAAAhtb292AAAAbG12aGQAAAAA3u94ON7veDkAAAPoAAAAKAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACUHRyYWsAAABcdGtoZAAAAADe73g43u94OQAAAAEAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAgAAAAEAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAKAAAAAAABAAAAAAGIdHJmZgAAAABtZGF0";

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' }
];

const VUMeter: React.FC<{ level: number, isAlert: boolean }> = ({ level, isAlert }) => {
  const segments = 15;
  const activeSegments = Math.ceil((level / 100) * segments);
  
  return (
    <div className="flex items-end gap-[2px] h-6 px-2">
      {[...Array(segments)].map((_, i) => {
        const isActive = i < activeSegments;
        let bgColor = 'bg-slate-800';
        let glow = '';
        
        if (isActive) {
          if (i < segments * 0.6) {
            bgColor = 'bg-blue-500';
            glow = 'shadow-[0_0_8px_rgba(59,130,246,0.5)]';
          } else if (i < segments * 0.85) {
            bgColor = 'bg-yellow-500';
            glow = 'shadow-[0_0_8px_rgba(234,179,8,0.5)]';
          } else {
            bgColor = 'bg-red-500';
            glow = 'shadow-[0_0_10px_rgba(239,68,68,0.8)]';
          }
        }

        return (
          <div 
            key={i} 
            className={`w-1.5 rounded-sm transition-all duration-150 ${bgColor} ${glow}`}
            style={{ 
              height: `${20 + (i * 5)}%`,
              opacity: isActive ? 1 : 0.2
            }}
          />
        );
      })}
    </div>
  );
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('ROLE_SELECTION');
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
  
  const babyMicEnabledRef = useRef(true);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [videoFlowing, setVideoFlowing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const keepAliveVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const babyIncomingAudioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<any>(null);
  const dataConnRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const pendingCallRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const wakeLockRef = useRef<any>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        if (wakeLockRef.current) return;
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Wake Lock acquired successfully');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock was released');
          wakeLockRef.current = null;
        });
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        if (isLive && mode === 'BABY_STATION') {
          console.log('App visible, re-acquiring lock and checking stream...');
          await requestWakeLock();
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
          }
          
          const vTrack = streamRef.current?.getVideoTracks()[0];
          const aTrack = streamRef.current?.getAudioTracks()[0];
          
          if (!vTrack || vTrack.readyState === 'ended' || !aTrack || aTrack.readyState === 'ended') {
            console.warn('Stream tracks ended during lock, restarting monitor...');
            startMonitoring(facingMode);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLive, mode, facingMode]);

  useEffect(() => {
    if (isLive && mode === 'BABY_STATION' && keepAliveVideoRef.current) {
      keepAliveVideoRef.current.play().catch(e => console.warn('Keep-alive play blocked', e));
    }
  }, [isLive, mode]);

  useEffect(() => {
    if (isLive && mode === 'BABY_STATION') {
      requestWakeLock();
      const lockInterval = setInterval(() => {
        if (!wakeLockRef.current) requestWakeLock();
      }, 5000);
      return () => {
        clearInterval(lockInterval);
        releaseWakeLock();
      };
    }
  }, [isLive, mode]);

  useEffect(() => {
    let interval: number | undefined;
    if (status.isCrying && mode === 'PARENT_STATION' && peerConnected) {
      const playAlert = () => {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioCtx.createOscillator();
          const gridNode = audioCtx.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
          oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.4); 
          gridNode.gain.setValueAtTime(0, audioCtx.currentTime);
          gridNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
          gridNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
          oscillator.connect(gridNode);
          gridNode.connect(audioCtx.destination);
          oscillator.start();
          oscillator.stop(audioCtx.currentTime + 0.4);
        } catch (e) {
          console.warn("Audio alert blocked", e);
        }
      };
      playAlert();
      interval = window.setInterval(playAlert, 4000);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [status.isCrying, mode, peerConnected]);

  useEffect(() => {
    babyMicEnabledRef.current = babyMicEnabled;
  }, [babyMicEnabled]);

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
    conn.on('open', () => {
      setPeerConnected(true);
      setIsConnecting(false);
      lastHeartbeatRef.current = Date.now();
    });
    conn.on('data', (data: any) => {
      lastHeartbeatRef.current = Date.now();
      if (data.type === 'HEARTBEAT') return;
      if (mode === 'PARENT_STATION') setStatus(data);
    });
    conn.on('error', () => setPeerConnected(false));
    conn.on('close', () => {
      setPeerConnected(false);
      dataConnRef.current = null;
    });
  }, [mode]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (mode === 'BABY_STATION' && dataConnRef.current?.open) {
        dataConnRef.current.send({ type: 'HEARTBEAT' });
      }
      if (mode === 'PARENT_STATION' && peerConnected) {
        if (Date.now() - lastHeartbeatRef.current > RECONNECT_TIMEOUT) {
          setPeerConnected(false);
          if (targetPeerId) connectToBaby();
        }
      }
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, [mode, peerConnected, targetPeerId]);

  const initPeer = useCallback((customId?: string) => {
    if (peerRef.current) peerRef.current.destroy();
    const peer = new Peer(mode === 'BABY_STATION' ? (customId || Math.floor(10000 + Math.random() * 90000).toString()) : undefined, {
      config: { iceServers: ICE_SERVERS, sdpSemantics: 'unified-plan' },
      debug: 1
    });
    peerRef.current = peer;
    peer.on('open', (id: string) => setPeerId(id));
    peer.on('disconnected', () => peer.reconnect());
    peer.on('error', (err: any) => {
      if (err.type === 'network' || err.type === 'server-error') setIsConnecting(false);
    });
    peer.on('connection', (conn: any) => handleDataConnection(conn));
    peer.on('call', (call: any) => {
      activeCallRef.current = call;
      if (mode === 'BABY_STATION') {
        if (!streamRef.current) { pendingCallRef.current = call; return; }
        streamRef.current.getAudioTracks().forEach(t => t.enabled = babyMicEnabledRef.current);
        call.answer(streamRef.current);
      } else {
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
    if (mode !== 'ROLE_SELECTION') initPeer();
    return () => {
      peerRef.current?.destroy();
      dataConnRef.current?.close();
      activeCallRef.current?.close();
    };
  }, [mode, initPeer]);

  const startAudioAnalysis = (stream: MediaStream) => {
    if (audioContextRef.current) audioContextRef.current.close();
    if (analysisIntervalRef.current) window.clearInterval(analysisIntervalRef.current);
    
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    
    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkNoise = () => {
      if (!analyserRef.current) return;
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
      
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength / 255; 
      const currentThreshold = 0.4 - (sensitivityRef.current / 100) * 0.38;
      const isCrying = average > currentThreshold;
      
      const newStatus: BabyStatus = {
        isCrying,
        noiseLevel: Math.round(average * 100),
        lastEvent: isCrying ? 'Cry Alert' : 'Normal',
        statusMessage: isCrying ? 'BABY IS CRYING' : 'Nursery is quiet'
      };

      if (mode === 'BABY_STATION') {
        setStatus(newStatus);
        if (dataConnRef.current && dataConnRef.current.open) {
          dataConnRef.current.send(newStatus);
        }
      }
    };
    analysisIntervalRef.current = window.setInterval(checkNoise, NOISE_POLL_INTERVAL);
  };

  const startMonitoring = async (targetFacingMode: 'user' | 'environment' = facingMode) => {
    setStreamError(null);
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const constraints = {
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { 
          facingMode: targetFacingMode, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 24 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn(`Track ${track.kind} was ended by OS/hardware`);
          if (document.visibilityState === 'visible') {
            setStreamError("Camera interrupted. Attempting restart...");
            setTimeout(() => startMonitoring(targetFacingMode), 2000);
          }
        };
      });

      stream.getAudioTracks().forEach(t => t.enabled = babyMicEnabledRef.current);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      startAudioAnalysis(stream);

      if (pendingCallRef.current) {
        pendingCallRef.current.answer(stream);
        pendingCallRef.current.on('stream', (s: MediaStream) => { setRemoteStream(s); setPeerConnected(true); });
        pendingCallRef.current = null;
      } else if (activeCallRef.current && activeCallRef.current.peerConnection) {
        // Safe access to peerConnection
        try {
          const senders = activeCallRef.current.peerConnection.getSenders();
          stream.getTracks().forEach(nt => {
            const sender = senders.find((s: any) => s.track?.kind === nt.kind);
            if (sender) sender.replaceTrack(nt);
          });
        } catch (e) {
          console.warn("Could not replace tracks on current call:", e);
        }
      }
      setIsLive(true);
    } catch (err) { 
      console.error("Monitor start failed", err);
      setStreamError("Camera access required. Please check permissions.");
    }
  };

  const flipCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (isLive) await startMonitoring(newMode);
  };

  const connectToBaby = async () => {
    if (!targetPeerId || !peerRef.current) return;
    setIsConnecting(true);
    try {
      if (dataConnRef.current) dataConnRef.current.close();
      if (activeCallRef.current) activeCallRef.current.close();
      const conn = peerRef.current.connect(targetPeerId, { reliable: true });
      handleDataConnection(conn);
      let localStreamForCall: MediaStream;
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localMicStreamRef.current = micStream;
        micStream.getAudioTracks().forEach(t => t.enabled = false);
        localStreamForCall = new MediaStream([...micStream.getAudioTracks(), createBlankVideoTrack()]);
      } catch (err) { localStreamForCall = new MediaStream([createBlankVideoTrack()]); }
      const call = peerRef.current.call(targetPeerId, localStreamForCall);
      activeCallRef.current = call;
      call.on('stream', (s: MediaStream) => { 
        setRemoteStream(s); 
        setPeerConnected(true); 
        setIsConnecting(false); 
      });
      call.on('error', () => setIsConnecting(false));
      setTimeout(() => { if (!peerConnected && isConnecting) setIsConnecting(false); }, 15000);
    } catch (err) { setIsConnecting(false); }
  };

  const toggleCrySimulation = () => {
    const newStatus = {
      ...status,
      isCrying: !status.isCrying,
      statusMessage: !status.isCrying ? 'SIMULATED CRY' : 'Nursery is quiet',
      noiseLevel: !status.isCrying ? 95 : 5
    };
    setStatus(newStatus);
    if (dataConnRef.current && dataConnRef.current.open) dataConnRef.current.send(newStatus);
  };

  useEffect(() => {
    if (!remoteStream || mode === 'BABY_STATION') { setVideoFlowing(false); return; }
    const checkVideo = () => {
      const vTrack = remoteStream.getVideoTracks()[0];
      setVideoFlowing(!!(vTrack && vTrack.enabled && vTrack.readyState === 'live'));
    };
    const interval = setInterval(checkVideo, 1000);
    return () => clearInterval(interval);
  }, [remoteStream, mode]);

  useEffect(() => {
    if (mode === 'BABY_STATION' && remoteStream && babyIncomingAudioRef.current) {
      babyIncomingAudioRef.current.srcObject = remoteStream;
      babyIncomingAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream, mode]);

  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (mode === 'PARENT_STATION' && remoteStream && videoEl) {
      videoEl.srcObject = remoteStream;
      videoEl.muted = isMuted;
      videoEl.play().catch(() => {});
    }
  }, [remoteStream, mode, isMuted]);

  if (mode === 'ROLE_SELECTION') {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans overflow-hidden">
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-900/40">
            <Baby className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Lullaby AI</h1>
          <p className="text-slate-400 text-sm">Select station mode to begin</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
          <button onClick={() => setMode('BABY_STATION')} className="group bg-slate-900/50 hover:bg-slate-900 p-8 rounded-3xl border border-slate-800 transition-all flex flex-col items-center text-center">
            <Activity className="w-8 h-8 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-semibold mb-1">Baby Station</h3>
            <p className="text-slate-500 text-xs">Transmitter for nursery</p>
          </button>
          <button onClick={() => setMode('PARENT_STATION')} className="group bg-slate-900/50 hover:bg-slate-900 p-8 rounded-3xl border border-slate-800 transition-all flex flex-col items-center text-center">
            <Monitor className="w-8 h-8 text-indigo-500 mb-4 group-hover:scale-110 transition-transform" />
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
        <audio ref={babyIncomingAudioRef} autoPlay />
        
        <video 
          ref={keepAliveVideoRef} 
          src={SILENT_VIDEO_B64} 
          loop 
          muted 
          playsInline 
          className="absolute w-1 h-1 opacity-0 pointer-events-none" 
        />
        
        {!isLive ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white">
            <div className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800 mb-8 w-full max-w-xs">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-2 block">Pairing Code</span>
              <div className="text-5xl font-mono font-bold tracking-tighter mb-4">{peerId || '-----'}</div>
              <button onClick={() => { navigator.clipboard.writeText(peerId); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className="text-xs text-slate-500 hover:text-white flex items-center gap-2 mx-auto transition-colors">
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            
            <div className="flex items-start gap-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-left max-w-xs mb-8">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-500 uppercase tracking-tighter mb-1">Critical Setup</p>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Mobile OS kills camera when screen is manually locked. Use <span className="text-white font-bold">Nursery Mode</span> inside the app instead of your power button to keep monitoring active.
                </p>
              </div>
            </div>

            <button onClick={() => startMonitoring()} className="bg-blue-600 hover:bg-blue-500 px-8 py-4 rounded-2xl font-bold shadow-lg transition-all flex items-center gap-3 active:scale-95">
              <Power className="w-5 h-5" /> Start Monitor
            </button>
            <button onClick={() => setMode('ROLE_SELECTION')} className="mt-6 text-slate-500 text-xs uppercase tracking-widest font-bold">Exit</button>
          </div>
        ) : (
          <div className="flex-1 relative flex flex-col">
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${stealthMode ? 'opacity-0' : 'opacity-100'}`} />
            
            {streamError && !stealthMode && (
              <div className="absolute inset-x-0 top-20 flex justify-center z-30 animate-in slide-in-from-top duration-300">
                <div className="bg-red-500/90 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-3 border border-red-400 shadow-lg">
                  <ShieldAlert className="w-4 h-4 text-white" />
                  <span className="text-xs font-bold text-white uppercase tracking-tight">{streamError}</span>
                </div>
              </div>
            )}

            {stealthMode && (
              <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-12 text-center select-none" onDoubleClick={() => setStealthMode(false)}>
                <div className="relative">
                  <Lock className="w-12 h-12 text-slate-900 mb-6" />
                  <div className="absolute inset-0 border-2 border-slate-900/5 rounded-full animate-ping" />
                </div>
                <h2 className="text-slate-900 text-sm font-bold uppercase tracking-[0.3em]">Nursery Mode Active</h2>
                <p className="text-slate-900 text-[10px] mt-4 max-w-[200px] leading-relaxed">Monitoring continues in background. Do not use power button. Double tap to unlock.</p>
                
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-5">
                  <div className={`w-1.5 h-1.5 rounded-full bg-blue-500 ${peerConnected ? 'animate-pulse' : ''}`} />
                  <span className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">System Operational</span>
                </div>
              </div>
            )}

            <div className={`absolute top-6 left-6 flex flex-col gap-2 transition-opacity duration-500 ${stealthMode ? 'opacity-0' : 'opacity-100'}`}>
              <div className="bg-red-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" /> Live
              </div>
              <div className="bg-slate-900/80 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 border border-white/10 backdrop-blur-sm">
                <Waves className="w-3 h-3 text-blue-400" /> {status.noiseLevel}% Noise
              </div>
              <div className="bg-slate-900/80 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 border border-white/10 backdrop-blur-sm">
                <BatteryCharging className="w-3 h-3 text-green-400" /> Keep Charging
              </div>
            </div>

            {!stealthMode && (
              <button onClick={() => {
                if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
                setMode('ROLE_SELECTION');
              }} className="absolute top-6 right-6 p-3 bg-black/40 rounded-xl backdrop-blur-md">
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}

            {showSettings && !stealthMode && (
              <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-xs shadow-2xl animate-in zoom-in duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-blue-500" /> Detection
                    </h3>
                    <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white"><XCircle className="w-6 h-6" /></button>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
                        <span>Sensitivity</span>
                        <span className="text-blue-400">{sensitivity}%</span>
                      </div>
                      <input type="range" min="1" max="100" value={sensitivity} onChange={(e) => setSensitivity(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                    <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                      <p className="text-[10px] text-slate-400 leading-relaxed italic">Adjust detection sensitivity for nursery sounds.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 transition-opacity duration-500 ${stealthMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div className="bg-slate-900/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 flex items-center gap-2">
                <button onClick={() => { const ns = !babyMicEnabled; setBabyMicEnabled(ns); streamRef.current?.getAudioTracks().forEach(t => t.enabled = ns); }} className={`p-4 rounded-xl transition-colors ${babyMicEnabled ? 'text-white hover:bg-white/10' : 'bg-red-500 text-white'}`}>
                  {babyMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button onClick={() => flipCamera()} className="p-4 text-white hover:bg-white/10 rounded-xl">
                  <SwitchCamera className="w-5 h-5" />
                </button>
                <button onClick={() => setStealthMode(true)} className="p-4 rounded-xl transition-colors bg-slate-800 text-white flex items-center gap-2 px-6 shadow-xl border border-white/10">
                  <Lock className="w-5 h-5" /> 
                  <span className="text-[10px] font-bold uppercase tracking-widest">Nursery Mode</span>
                </button>
                <button onClick={() => setShowSettings(!showSettings)} className={`p-4 rounded-xl transition-colors ${showSettings ? 'bg-slate-700 text-white' : 'text-white hover:bg-white/10'}`}>
                  <Settings2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col p-4 md:p-6 text-white overflow-hidden">
      <div className="flex items-center justify-between mb-4 h-12 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode('ROLE_SELECTION')} className="p-2 hover:bg-slate-900 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h2 className="text-sm font-bold tracking-tight leading-none">Parent Station</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-600'}`} />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{peerConnected ? 'Connected' : isConnecting ? 'Linking...' : 'Offline'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {peerConnected && (
            <div className="hidden sm:flex items-center gap-4 bg-slate-900/50 px-4 py-1.5 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2">
                <Gauge className={`w-3.5 h-3.5 transition-colors ${status.isCrying ? 'text-red-500' : 'text-blue-400'}`} />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 min-w-[50px]">Stability</span>
              </div>
              <div className="flex items-center gap-0.5">
                {[1,2,3].map(i => <div key={i} className={`w-1 rounded-full ${peerConnected ? 'bg-green-500' : 'bg-slate-800'}`} style={{ height: `${8 + (i*4)}px` }} />)}
              </div>
            </div>
          )}
          <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 transition-all duration-300 ${status.isCrying ? 'bg-red-500/10 border-red-500 text-red-500 animate-pulse' : 'bg-slate-900/50 border-slate-800 text-slate-500'}`}>
            <Baby className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{status.statusMessage}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        <div className="flex-[3] flex flex-col gap-4 min-h-0 overflow-hidden">
          <div className={`flex-1 bg-black rounded-3xl border overflow-hidden relative transition-all duration-500 ${status.isCrying ? 'border-red-500 ring-4 ring-red-500/50 shadow-2xl shadow-red-900/20 animate-alert-border' : 'border-slate-800/50'}`}>
            <video ref={remoteVideoRef} autoPlay playsInline className={`w-full h-full object-cover transition-opacity duration-700 ${videoFlowing ? 'opacity-100' : 'opacity-0'}`} />
            {status.isCrying && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-600 rounded-full flex items-center gap-2 shadow-2xl animate-alert-flash z-20">
                <AlertTriangle className="w-4 h-4 text-white" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Cry Alert</span>
              </div>
            )}
            {!peerConnected && !isConnecting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/80 backdrop-blur-sm">
                <Link2 className="w-8 h-8 text-slate-700 mb-4" />
                <h3 className="text-lg font-bold mb-4">Pair Nursery Device</h3>
                <div className="flex gap-2 w-full max-w-xs">
                  <input type="text" maxLength={5} placeholder="00000" value={targetPeerId} onChange={(e)=>setTargetPeerId(e.target.value.replace(/\D/g,''))} className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-center text-xl font-mono font-bold tracking-[0.2em] text-blue-500 focus:outline-none focus:border-blue-500" />
                  <button onClick={connectToBaby} disabled={targetPeerId.length < 5} className="bg-blue-600 px-5 rounded-xl hover:bg-blue-500 transition-all disabled:opacity-30"><Play className="w-5 h-5" /></button>
                </div>
              </div>
            )}
            {isConnecting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-sm">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Connecting Link...</p>
              </div>
            )}
            {peerConnected && !videoFlowing && !isConnecting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40">
                <WifiOff className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Audio Only Link</p>
                <p className="text-[8px] text-slate-700 uppercase mt-2">Station may be sleeping</p>
              </div>
            )}
            {peerConnected && (
              <button onClick={() => setIsMuted(!isMuted)} className={`absolute top-4 right-4 p-3 rounded-xl backdrop-blur-md transition-all z-10 ${isMuted ? 'bg-red-500/20 text-red-500 border border-red-500/40' : 'bg-black/40 text-white'}`}>
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            {peerConnected && <div className="sm:hidden absolute bottom-4 left-1/2 -translate-x-1/2 scale-75"><VUMeter level={status.noiseLevel} isAlert={status.isCrying} /></div>}
          </div>
          <div className="h-24 sm:h-28 shrink-0">
            <button 
              onMouseDown={() => { setIsTalking(true); localMicStreamRef.current?.getAudioTracks().forEach(t => t.enabled = true); }} 
              onMouseUp={() => { setIsTalking(false); localMicStreamRef.current?.getAudioTracks().forEach(t => t.enabled = false); }} 
              onMouseLeave={() => { setIsTalking(false); localMicStreamRef.current?.getAudioTracks().forEach(t => t.enabled = false); }} 
              onTouchStart={() => { setIsTalking(true); localMicStreamRef.current?.getAudioTracks().forEach(t => t.enabled = true); }} 
              onTouchEnd={() => { setIsTalking(false); localMicStreamRef.current?.getAudioTracks().forEach(t => t.enabled = false); }} 
              disabled={!peerConnected}
              className={`w-full h-full rounded-2xl border transition-all duration-300 flex items-center justify-center gap-4 select-none ${isTalking ? 'bg-blue-600 border-blue-400 shadow-lg scale-[0.98]' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'} ${!peerConnected && 'opacity-20 cursor-not-allowed'}`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isTalking ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-400'}`}><Mic className="w-6 h-6" /></div>
              <div className="text-left">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${isTalking ? 'text-blue-200' : 'text-slate-500'}`}>Push to Talk</p>
                <h3 className="text-lg font-bold">{isTalking ? 'Nursery listening...' : 'Hold to Speak'}</h3>
              </div>
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-[240px]">
          <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Lullabies</span><Radio className="w-3.5 h-3.5 text-purple-500" /></div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              {LULLABIES.map(l => (
                <button key={l.id} className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-purple-500/40 transition-all text-left group flex items-center justify-between">
                  <div className="min-w-0 pr-2"><p className="text-[11px] font-bold group-hover:text-purple-400 transition-colors truncate">{l.name}</p><p className="text-[9px] text-slate-600 truncate">{l.description}</p></div>
                  <Play className="w-3 h-3 text-slate-700 group-hover:text-purple-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 shrink-0">
            {peerConnected && (
              <button onClick={toggleCrySimulation} className={`p-4 rounded-2xl border text-[10px] font-bold uppercase tracking-tighter flex flex-col items-center gap-2 transition-all ${status.isCrying ? 'bg-green-600/10 border-green-500/40 text-green-400' : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:border-red-500/40'}`}>
                {status.isCrying ? <XCircle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                {status.isCrying ? 'Dismiss' : 'Test Cry'}
              </button>
            )}
            <button onClick={() => { if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current); setMode('ROLE_SELECTION'); }} className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-[10px] font-bold uppercase tracking-tighter text-slate-500 hover:text-red-400 transition-all flex flex-col items-center gap-2">
              <Zap className="w-4 h-4" /> End session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
