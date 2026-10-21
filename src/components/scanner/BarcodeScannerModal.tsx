import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  X, Flashlight, Camera, RefreshCw, Volume2, VolumeX, 
  AlertCircle, CheckCircle2, Keyboard, Upload, Image as ImageIcon,
  Zap, Sparkles, SwitchCamera, ZoomIn, ZoomOut, Monitor, Plus,
  Focus
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isDocInTenant } from '../../lib/tenant';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  onAddNewProduct?: (barcode: string) => void;
  title?: string;
  description?: string;
  continuous?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  onAddNewProduct,
  title = "Ultra Hızlı Barkod Okuyucu",
  description = "Gelişmiş sürekli otomatik odaklama & yüksek hızlı barkod tarama",
  continuous = true,
}) => {
  const [scannerReady, setScannerReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Default to 720p for fast focus and lightweight CPU processing
  const [activeResolution, setActiveResolution] = useState<'720p' | '1080p' | '4k'>('720p');
  const [liveResolution, setLiveResolution] = useState<{ width: number; height: number } | null>(null);

  const [hasTorch, setHasTorch] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.3); // 1.3x default zoom for comfortable distance
  const [focusPulse, setFocusPulse] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isContinuous, setIsContinuous] = useState(continuous);
  useEffect(() => {
    setIsContinuous(continuous);
  }, [continuous]);

  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanPulse, setScanPulse] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [scannedProductInfo, setScannedProductInfo] = useState<{ id: string; name: string; price: number } | null>(null);
  const [showPriceUpdateModal, setShowPriceUpdateModal] = useState(false);
  const [updatedPriceInput, setUpdatedPriceInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const frameCounterRef = useRef<number>(0);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTrackRef = useRef<MediaStreamTrack | null>(null);

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const onAddNewProductRef = useRef(onAddNewProduct);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
    onAddNewProductRef.current = onAddNewProduct;
  });

  // Initialize CodeReader with retail-specific formats and high-performance hints
  const getCodeReader = useCallback(() => {
    if (!codeReaderRef.current) {
      const hints = new Map<DecodeHintType, any>();
      // Focus strictly on common retail formats to minimize CPU overhead
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      codeReaderRef.current = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 500
      });
    }
    return codeReaderRef.current;
  }, []);

  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1850, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // AudioContext unsupported
    }
  }, [soundEnabled]);

  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([70, 40, 70]);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSuccessfulScan = useCallback((decodedText: string) => {
    const cleanText = decodedText.trim();
    if (!cleanText) return;

    const now = Date.now();
    if (cleanText === lastScannedCodeRef.current && now - lastScanTimeRef.current < 1600) {
      return;
    }
    if (now - lastScanTimeRef.current < 350) {
      return;
    }

    lastScanTimeRef.current = now;
    lastScannedCodeRef.current = cleanText;
    setLastScanned(cleanText);
    setScanPulse(true);
    setTimeout(() => setScanPulse(false), 800);

    // Query product by barcode in Firestore
    (async () => {
      try {
        const q = query(collection(db, 'products'), where('barcode', '==', cleanText));
        const snap = await getDocs(q);
        const match = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(p => isDocInTenant(p));
        if (match) {
          const price = Number((match as any).salePrice || (match as any).price || 0);
          setScannedProductInfo({ id: match.id, name: (match as any).name, price });
          setUpdatedPriceInput(String(price));
        } else {
          setScannedProductInfo(null);
        }
      } catch (e) {
        console.warn("Product lookup on scan error:", e);
      }
    })();

    playBeep();
    triggerHaptic();
    onScanRef.current(cleanText);

    if (!isContinuous) {
      onCloseRef.current();
    }
  }, [isContinuous, playBeep, triggerHaptic]);

  // Frame processing loop focusing on the target Viewfinder Region
  const runScanningLoop = useCallback(() => {
    if (!isScanningRef.current) return;
    const video = videoRef.current;

    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      scanTimerRef.current = setTimeout(runScanningLoop, 120);
      return;
    }

    try {
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      const reader = getCodeReader();

      // Viewfinder region: Center box (70% width x 45% height)
      // Processing only this region reduces pixel count by ~68%, drastically speeding up decoding on all mobile devices
      const cropW = Math.max(160, Math.round(vW * 0.70));
      const cropH = Math.max(120, Math.round(vH * 0.45));
      const cropX = Math.round((vW - cropW) / 2);
      const cropY = Math.round((vH - cropH) / 2);

      if (!cropCanvasRef.current) {
        cropCanvasRef.current = document.createElement('canvas');
      }
      const cropCanvas = cropCanvasRef.current;
      if (cropCanvas.width !== cropW || cropCanvas.height !== cropH) {
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
      }

      const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
      if (cropCtx) {
        cropCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        let detected = false;
        try {
          const result = reader.decodeFromCanvas(cropCanvas);
          if (result && result.getText()) {
            handleSuccessfulScan(result.getText());
            detected = true;
          }
        } catch {
          // NotFoundException is standard during active search
        }

        // If not detected in crop region, every 4th frame try the full canvas as fallback
        if (!detected && frameCounterRef.current % 4 === 0) {
          try {
            if (!fullCanvasRef.current) {
              fullCanvasRef.current = document.createElement('canvas');
            }
            const fullCanvas = fullCanvasRef.current;
            const maxDimension = 1280;
            let fullW = vW;
            let fullH = vH;
            if (vW > maxDimension) {
              fullW = maxDimension;
              fullH = Math.round((vH * maxDimension) / vW);
            }
            if (fullCanvas.width !== fullW || fullCanvas.height !== fullH) {
              fullCanvas.width = fullW;
              fullCanvas.height = fullH;
            }
            const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
            if (fullCtx) {
              fullCtx.drawImage(video, 0, 0, fullW, fullH);
              const fullResult = reader.decodeFromCanvas(fullCanvas);
              if (fullResult && fullResult.getText()) {
                handleSuccessfulScan(fullResult.getText());
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      // ignore
    }

    frameCounterRef.current = (frameCounterRef.current + 1) % 1000;
    if (isScanningRef.current) {
      scanTimerRef.current = setTimeout(runScanningLoop, 100);
    }
  }, [getCodeReader, handleSuccessfulScan]);

  const stopCamera = useCallback(async () => {
    isScanningRef.current = false;
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (activeTrackRef.current) {
      try {
        activeTrackRef.current.stop();
      } catch (e) {
        console.warn("Track stop error:", e);
      }
      activeTrackRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }

    setScannerReady(false);
    setTorchOn(false);
    setHasHardwareZoom(false);
    setLiveResolution(null);
  }, []);

  const applySafeAdvancedConstraints = useCallback(async (track: MediaStreamTrack) => {
    try {
      if (!track.applyConstraints) return;
      const caps = (track.getCapabilities && track.getCapabilities()) || {};
      const advanced: any[] = [];

      // Continuous autofocus if supported by device
      if ('focusMode' in caps && (caps as any).focusMode?.includes?.('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }

      // Hardware zoom if supported by device
      if ('zoom' in caps && typeof (caps as any).zoom === 'object') {
        setHasHardwareZoom(true);
        const zMin = (caps as any).zoom?.min || 1;
        const zMax = (caps as any).zoom?.max || 4;
        const targetZoom = Math.max(zMin, Math.min(zMax, zoomLevel));
        advanced.push({ zoom: targetZoom });
      }

      if (advanced.length > 0) {
        await track.applyConstraints({ advanced }).catch(() => {});
      }
    } catch {
      // Non-fatal, stream is running normally
    }
  }, [zoomLevel]);

  // Refresh and enumerate video input devices
  const refreshCameraDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const allDevs = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = allDevs
        .filter(d => d.kind === 'videoinput')
        .map((d, index) => ({
          id: d.deviceId,
          label: d.label || (index === 0 ? 'Varsayılan Web Kamera' : `Harici Kamera ${index + 1}`)
        }));
      if (videoDevs.length > 0) {
        setCameras(videoDevs);
      }
    } catch (e) {
      console.warn("Camera device enumeration notice:", e);
    }
  }, []);

  // Robust multi-tier camera startup guaranteeing compatibility with iOS Safari, Chrome, Android, and Desktop USB Webcams
  const startCamera = useCallback(async (cameraId?: string, res?: '720p' | '1080p' | '4k') => {
    setErrorMessage(null);
    setScannerReady(false);
    await stopCamera();

    const targetRes = res || activeResolution;
    let targetWidth = 1280;
    let targetHeight = 720;
    if (targetRes === '1080p') {
      targetWidth = 1920;
      targetHeight = 1080;
    } else if (targetRes === '4k') {
      targetWidth = 3840;
      targetHeight = 2160;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      console.warn("Camera mediaDevices API is not supported in this browser or environment.");
      setErrorMessage("Bu tarayıcı veya cihaz ortamında kamera API'si desteklenmiyor. Aşağıdaki 'Elle Barkod Yaz' veya 'Fotoğraftan Oku' seçeneğini kullanabilirsiniz.");
      setShowManualInput(true);
      return;
    }

    let stream: MediaStream | null = null;
    const selectedId = cameraId || selectedCameraId;

    // TIER 1: Standard request with ideal deviceId or environment facingMode + ideal resolution
    try {
      const videoConstraints: MediaTrackConstraints = {
        deviceId: selectedId ? { ideal: selectedId } : undefined,
        facingMode: selectedId ? undefined : { ideal: 'environment' },
        width: { ideal: targetWidth },
        height: { ideal: targetHeight }
      };
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints
      });
    } catch (tier1Err) {
      console.warn("Tier 1 camera start failed, attempting Tier 2:", tier1Err);

      // TIER 2: Basic request without strict resolution constraints (handles mobile Safari & desktop webcams)
      try {
        const videoConstraintsTier2: MediaTrackConstraints = selectedId
          ? { deviceId: { ideal: selectedId } }
          : { facingMode: { ideal: 'environment' } };

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraintsTier2
        });
      } catch (tier2Err) {
        console.warn("Tier 2 camera start failed, attempting Tier 3 (universal camera fallback):", tier2Err);

        // TIER 3: Universal fallback to any accessible video device (USB Webcam / Built-in Camera)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
          });
        } catch (tier3Err: any) {
          console.warn("Camera access not available in current environment:", tier3Err?.message || tier3Err);
          const msg = (tier3Err?.name || '') + ' ' + (tier3Err?.message || String(tier3Err));
          if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied') || msg.includes('SecurityError')) {
            setErrorMessage("Kamera izni verilmedi veya tarayıcı tarafından engellendi. Tarayıcınızın adres çubuğundaki kilit simgesine tıklayarak Kamera iznini 'İzin Ver' olarak onaylayın.");
          } else if (msg.includes('NotFound') || msg.includes('DevicesNotFoundError')) {
            setErrorMessage("Cihazınızda bağlı bir kamera veya web kamerası algılanamadı. Lütfen USB kameranızın takılı olduğundan emin olun veya aşağıdaki 'Elle Barkod Yaz' alanını kullanın.");
          } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
            setErrorMessage("Kamera başka bir uygulama (Zoom, Teams, başka bir sekme vb.) tarafından kullanılıyor olabilir. Lütfen diğer uygulamaları kapatıp tekrar deneyin.");
          } else {
            setErrorMessage("Kamera başlatılamadı (" + (tier3Err?.message || 'Bağlantı hatası') + "). Lütfen kamera iznini onaylayın veya harici web kamerası seçin.");
          }
          setShowManualInput(true);
          return;
        }
      }
    }

    if (!stream) {
      setErrorMessage("Kamera akışı alınamadı. Lütfen kamera iznini kontrol edin veya 'Elle Barkod Yaz' alanını kullanın.");
      setShowManualInput(true);
      return;
    }

    try {
      const track = stream.getVideoTracks()?.[0];
      activeTrackRef.current = track || null;

      if (!videoRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.setAttribute('autoplay', 'true');
      videoRef.current.setAttribute('muted', 'true');

      try {
        await videoRef.current.play();
      } catch (playErr) {
        console.warn("Video play notice:", playErr);
      }

      if (track) {
        const settings = track.getSettings?.() || {};
        if (settings.width && settings.height) {
          setLiveResolution({ width: settings.width, height: settings.height });
        }

        // Apply safe advanced constraints (autofocus, zoom) after stream is confirmed playing
        await applySafeAdvancedConstraints(track);
      }

      // Re-populate and update available cameras list after permission is granted
      refreshCameraDevices();

      setScannerReady(true);
      isScanningRef.current = true;
      runScanningLoop();

    } catch (err: any) {
      console.warn("Camera setup notice:", err);
      setErrorMessage("Kamera ayarlanırken hata oluştu. Lütfen tekrar deneyin veya elle giriş yapın.");
      setShowManualInput(true);
    }
  }, [activeResolution, cameras.length, selectedCameraId, stopCamera, applySafeAdvancedConstraints, runScanningLoop]);

  // Tap-to-focus / manual refocus feature
  const triggerRefocus = async () => {
    setFocusPulse(true);
    setTimeout(() => setFocusPulse(false), 900);

    const track = activeTrackRef.current;
    if (track && track.applyConstraints) {
      try {
        const caps = (track.getCapabilities && track.getCapabilities()) || {};
        if ('focusMode' in caps && (caps as any).focusMode?.includes?.('continuous')) {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as any]
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  };

  const toggleTorch = async () => {
    try {
      const track = activeTrackRef.current;
      if (track && track.applyConstraints) {
        const next = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: next } as any]
        });
        setTorchOn(next);
      } else {
        alert("Bu cihazda flaş kontrolü donanımsal olarak desteklenmiyor.");
      }
    } catch {
      alert("Bu cihaz veya tarayıcıda flaş kontrolü desteklenmiyor.");
    }
  };

  const handleZoomChange = async (val: number) => {
    const clamped = Math.max(1, Math.min(4, Math.round(val * 10) / 10));
    setZoomLevel(clamped);

    const track = activeTrackRef.current;
    if (track && track.applyConstraints) {
      try {
        const caps = (track.getCapabilities && track.getCapabilities()) || {};
        if ('zoom' in caps) {
          await track.applyConstraints({
            advanced: [{ zoom: clamped } as any]
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  };

  const handleResolutionSwitch = (res: '720p' | '1080p' | '4k') => {
    setActiveResolution(res);
    startCamera(selectedCameraId, res);
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedCameraId(id);
    startCamera(id, activeResolution);
  };

  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      const reader = getCodeReader();
      const result = await reader.decodeFromImageUrl(URL.createObjectURL(file));
      if (result) {
        handleSuccessfulScan(result.getText());
      } else {
        alert("Fotoğraftan barkod tespit edilemedi.");
      }
    } catch (err) {
      console.warn("Image scan error:", err);
      alert("Fotoğraftan barkod okunamadı. Lütfen net bir barkod görseli seçin.");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccessfulScan(manualCode.trim());
    setManualCode('');
  };

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isOpen) {
      timer = setTimeout(() => {
        startCamera(selectedCameraId, activeResolution);
      }, 100);
    } else {
      stopCamera();
      setLastScanned(null);
      setScanPulse(false);
      setErrorMessage(null);
    }

    return () => {
      if (timer) clearTimeout(timer);
      stopCamera();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[96vh] relative">
        
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between text-white shrink-0 bg-slate-900/90 backdrop-blur-sm z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base leading-tight">{title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border ${
                  activeResolution === '720p'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : activeResolution === '1080p'
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                }`}>
                  <Zap className="w-2.5 h-2.5 text-emerald-400" />
                  <span>{activeResolution === '720p' ? '720p HD (Hızlı Odak)' : activeResolution === '1080p' ? '1080p FHD' : '4K UHD'}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => startCamera(selectedCameraId, activeResolution)}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer"
              title="Kamerayı Yeniden Başlat"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Viewport & Viewfinder HUD */}
        <div 
          onClick={triggerRefocus}
          className="relative bg-black flex-1 min-h-[320px] sm:min-h-[400px] overflow-hidden flex items-center justify-center select-none cursor-crosshair group"
          title="Odaklamak için ekrana dokunun"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              // Visual zoom scaling on the preview for crisp display without distortion
              transform: zoomLevel > 1 ? `scale(${zoomLevel})` : undefined,
              transformOrigin: 'center center'
            }}
            className="w-full h-full object-cover contrast-[1.06] brightness-[1.03] transition-transform duration-200"
          />

          {/* Quick HUD Buttons (Torch & Refocus Floating Icons) */}
          {scannerReady && (
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerRefocus();
                }}
                className={`p-2.5 rounded-2xl backdrop-blur-md border transition-all text-xs flex items-center gap-1.5 shadow-xl ${
                  focusPulse 
                    ? 'bg-emerald-500 text-white border-emerald-400 scale-105 shadow-[0_0_20px_#10b981]' 
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700/80 active:scale-95'
                }`}
                title="Yeniden Odakla (Autofocus)"
              >
                <Focus className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-black hidden xs:inline">Odakla</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTorch();
                }}
                className={`p-2.5 rounded-2xl backdrop-blur-md border transition-all text-xs flex items-center gap-1.5 shadow-xl ${
                  torchOn 
                    ? 'bg-amber-500 text-slate-950 border-amber-300 font-black shadow-[0_0_25px_#f59e0b]' 
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700/80 active:scale-95'
                }`}
                title="Kamera Işığını Aç/Kapat"
              >
                <Flashlight className={`w-4 h-4 ${torchOn ? 'fill-slate-950 text-slate-950' : 'text-amber-400'}`} />
                <span className="text-[10px] font-black">{torchOn ? 'Işık Açık' : 'Işık'}</span>
              </button>
            </div>
          )}

          {/* HUD Viewfinder Overlay */}
          {scannerReady && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center z-10">
              {/* Target Bounding Box */}
              <div 
                className={`relative w-[85%] max-w-[340px] h-[160px] sm:h-[190px] rounded-2xl transition-all duration-200 ${
                  scanPulse 
                    ? 'border-4 border-emerald-400 shadow-[0_0_35px_#10b981] bg-emerald-500/15' 
                    : focusPulse
                      ? 'border-2 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                      : 'border-2 border-indigo-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.58)]'
                }`}
              >
                {/* Corner Accents */}
                <span className={`absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 rounded-tl-xl transition-colors ${scanPulse ? 'border-emerald-400' : 'border-indigo-400'}`} />
                <span className={`absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 rounded-tr-xl transition-colors ${scanPulse ? 'border-emerald-400' : 'border-indigo-400'}`} />
                <span className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 rounded-bl-xl transition-colors ${scanPulse ? 'border-emerald-400' : 'border-indigo-400'}`} />
                <span className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 rounded-br-xl transition-colors ${scanPulse ? 'border-emerald-400' : 'border-indigo-400'}`} />

                {/* Laser scan line */}
                {!scanPulse && (
                  <div className="absolute left-2 right-2 h-[2.5px] bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_14px_#ef4444] animate-laser" />
                )}

                {/* Center crosshair */}
                <div className="absolute inset-0 flex items-center justify-center opacity-40">
                  <div className="w-10 h-[1px] bg-indigo-300" />
                  <div className="h-10 w-[1px] bg-indigo-300" />
                </div>
              </div>

              {/* Status and guidance pill */}
              <div className="mt-3.5 px-3.5 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white text-[11px] font-semibold tracking-wide flex items-center gap-2 shadow-2xl">
                <span className={`w-2 h-2 rounded-full ${scanPulse ? 'bg-emerald-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
                <span className="font-bold">
                  {scanPulse ? 'Barkod Okundu!' : 'Barkodu kutuya ortalayın (15-20 cm mesafe)'}
                </span>

                {liveResolution && (
                  <span className="text-[9px] text-amber-300 font-mono border-l border-slate-700 pl-2 font-black flex items-center gap-1">
                    <Monitor className="w-2.5 h-2.5 text-indigo-400" />
                    <span>{liveResolution.width}x{liveResolution.height}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {!scannerReady && !errorMessage && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 text-white p-6 z-10">
              <div className="relative">
                <div className="w-12 h-12 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <Camera className="w-5 h-5 text-indigo-400 absolute inset-0 m-auto" />
              </div>
              <p className="text-sm font-bold text-slate-200 animate-pulse">Kamera Başlatılıyor...</p>
              <p className="text-xs text-slate-400 text-center max-w-xs">
                Sürekli otomatik odaklama & sensör ayarı yapılıyor.
              </p>
            </div>
          )}

          {/* Error Screen */}
          {errorMessage && (
            <div className="absolute inset-0 bg-slate-950 p-6 flex flex-col items-center justify-center text-center gap-3 text-white z-10 animate-fadeIn overflow-y-auto">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-base text-red-400 mb-1">Kamera Başlatılamadı</h4>
                <p className="text-xs text-slate-300 max-w-sm leading-relaxed">{errorMessage}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => startCamera(selectedCameraId, activeResolution)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tekrar Dene
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Fotoğraftan Oku
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualInput(true)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Keyboard className="w-4 h-4" />
                  Elle Barkod Yaz
                </button>
              </div>
            </div>
          )}

          {/* Scan Notification / Unknown Barcode Prompt */}
          {lastScanned && (
            <div className="absolute top-3 left-4 right-4 z-40 flex flex-col items-center justify-center animate-bounce">
              {scannedProductInfo ? (
                <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex flex-col items-center text-center gap-1 text-xs font-black border border-emerald-400/40">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Ürün Okundu: {scannedProductInfo.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-emerald-100">
                    <span>Mevcut Fiyat: <strong className="font-mono">{scannedProductInfo.price.toLocaleString('tr-TR')} ₺</strong></span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPriceUpdateModal(true);
                      }}
                      className="px-2 py-0.5 bg-white text-emerald-800 rounded-lg text-[10px] font-black hover:bg-emerald-50 shadow-xs cursor-pointer"
                    >
                      Fiyatı Güncelle
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex flex-col items-center text-center gap-1.5 text-xs font-black border border-amber-400/40">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-200" />
                    <span>Bulunamadı: <strong className="font-mono">{lastScanned}</strong></span>
                  </div>
                  {onAddNewProduct && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddNewProduct(lastScanned);
                        onClose();
                      }}
                      className="px-3 py-1 bg-white text-amber-900 rounded-xl text-xs font-black hover:bg-amber-50 shadow-md transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-600" />
                      <span>Bu Barkodla Yeni Ürün Ekle</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Price Update Modal */}
          {showPriceUpdateModal && scannedProductInfo && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl text-slate-900">
                <h3 className="font-black text-base">Ürün Fiyatını Güncelle</h3>
                <p className="text-xs text-slate-600 font-bold">{scannedProductInfo.name}</p>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Yeni Satış Fiyatı (TL)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={updatedPriceInput}
                    onChange={e => setUpdatedPriceInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-black text-sm text-slate-900"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPriceUpdateModal(false)}
                    className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const p = parseFloat(updatedPriceInput) || 0;
                        await updateDoc(doc(db, 'products', scannedProductInfo.id), {
                          salePrice: p,
                          price: p
                        });
                        alert(`Fiyat başarıyla güncellendi: ${p} ₺`);
                        setShowPriceUpdateModal(false);
                        setScannedProductInfo(prev => prev ? { ...prev, price: p } : null);
                      } catch (err: any) {
                        alert("Fiyat güncellenirken hata oluştu: " + err.message);
                      }
                    }}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black cursor-pointer"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2.5 shrink-0 z-20">
          
          {/* Zoom Presets Bar */}
          <div className="flex items-center justify-between gap-2 bg-slate-800/60 p-1.5 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-bold pl-1">
              <ZoomIn className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px]">Kamera Zoom (Yakınlaştırma):</span>
            </div>

            <div className="flex items-center gap-1">
              {[1.0, 1.2, 1.5, 2.0].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleZoomChange(preset)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                    Math.abs(zoomLevel - preset) < 0.05
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                >
                  {preset.toFixed(1)}x {preset === 1.5 ? '(Önerilen)' : ''}
                </button>
              ))}

              <div className="flex items-center gap-0.5 ml-1 bg-slate-800 border border-slate-700 rounded-xl p-0.5">
                <button 
                  type="button" 
                  onClick={() => handleZoomChange(zoomLevel - 0.2)} 
                  className="p-1 text-slate-300 hover:text-white cursor-pointer"
                  title="Uzaklaştır"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-300 px-1">{zoomLevel.toFixed(1)}x</span>
                <button 
                  type="button" 
                  onClick={() => handleZoomChange(zoomLevel + 0.2)} 
                  className="p-1 text-slate-300 hover:text-white cursor-pointer"
                  title="Yakınlaştır"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Primary Controls Row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {cameras.length > 0 && (
              <div className="flex items-center gap-1.5 flex-1 min-w-[130px] max-w-[210px]">
                <SwitchCamera className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={selectedCameraId}
                  onChange={handleCameraChange}
                  className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs truncate focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium cursor-pointer"
                >
                  <option value="">Varsayılan Kamera</option>
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || `Kamera ${c.id.substring(0, 5)}...`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Resolution Selector with 720p Recommended */}
            <div className="flex items-center gap-1 bg-slate-800/90 p-0.5 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => handleResolutionSwitch('720p')}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                  activeResolution === '720p' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="720p HD: Hızlı netleme ve yüksek okuma performansı sağlar"
              >
                720p HD
              </button>
              <button
                type="button"
                onClick={() => handleResolutionSwitch('1080p')}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                  activeResolution === '1080p' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1080p
              </button>
              <button
                type="button"
                onClick={() => handleResolutionSwitch('4k')}
                className={`px-1.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  activeResolution === '4k' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                4K
              </button>
            </div>

            {/* Continuous vs Single Mode */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setIsContinuous(false)}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                  !isContinuous ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tek
              </button>
              <button
                type="button"
                onClick={() => setIsContinuous(true)}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                  isContinuous ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Toplu
              </button>
            </div>

            {/* Utility actions */}
            <div className="flex items-center gap-1.5 ml-auto">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageFileScan}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                title="Fotoğraftan Barkod Oku"
              >
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">{isProcessingFile ? 'Taranıyor...' : 'Fotoğraf'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-emerald-400 hover:bg-slate-700 cursor-pointer"
                title={soundEnabled ? "Sesi Kapat" : "Sesi Aç"}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setShowManualInput(!showManualInput)}
                className={`px-2.5 py-1.5 rounded-xl border transition-all text-xs flex items-center gap-1 font-semibold cursor-pointer ${
                  showManualInput ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Elle Yaz</span>
              </button>
            </div>
          </div>

          {showManualInput && (
            <form onSubmit={handleManualSubmit} className="flex gap-2 pt-1 border-t border-slate-800/80 animate-fadeIn">
              <input
                type="text"
                placeholder="Barkod numarasını yazın (örn: 8690826010015)"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoFocus
                className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2 rounded-xl text-xs sm:text-sm focus:outline-none font-mono font-bold"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                Onayla
              </button>
            </form>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Sürekli Otomatik Odaklama (Continuous AF) & Bölge Kırpma Aktif</span>
            </span>
            <button
              type="button"
              onClick={() => handleSuccessfulScan("8690826010015")}
              className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Test Barkod Oku</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
