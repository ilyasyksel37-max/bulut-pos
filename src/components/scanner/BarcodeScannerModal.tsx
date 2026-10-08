import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  X, Flashlight, Camera, RefreshCw, Volume2, VolumeX, 
  AlertCircle, CheckCircle2, Keyboard, Upload, Image as ImageIcon 
} from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  description?: string;
  continuous?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = "Kamera ile Barkod Oku",
  description = "Barkodu kamera çerçevesine hizalayın veya dosyadan yükleyin",
  continuous = true,
}) => {
  const [scannerReady, setScannerReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerElementId = "hd-barcode-reader-view";

  // Audio beep feedback using Web Audio API
  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // AudioContext not allowed or unsupported
    }
  }, [soundEnabled]);

  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSuccessfulScan = useCallback((decodedText: string) => {
    const cleanText = decodedText.trim();
    if (!cleanText) return;

    const now = Date.now();
    // Cooldown check: ignore if same barcode within 1.8 seconds, or any scan within 400ms
    if (cleanText === lastScannedCodeRef.current && now - lastScanTimeRef.current < 1800) {
      return;
    }
    if (now - lastScanTimeRef.current < 400) {
      return;
    }

    lastScanTimeRef.current = now;
    lastScannedCodeRef.current = cleanText;
    setLastScanned(cleanText);
    playBeep();
    triggerHaptic();
    onScan(cleanText);

    if (!continuous) {
      onClose();
    }
  }, [continuous, onScan, onClose, playBeep, triggerHaptic]);

  // Safely stop existing scanner instance
  const stopExistingScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch {
        // ignore
      }
      try {
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
  };

  // Start scanner with resilient fallbacks
  const startScanner = useCallback(async (specificCameraId?: string) => {
    setErrorMessage(null);
    setScannerReady(false);
    
    // Ensure cleanup of any previous instances before starting new one
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        console.warn("Cleanup error (ignorable):", e);
      }
    }

    try {
      // Create fresh container if it was somehow corrupted
      const container = document.getElementById(readerElementId);
      if (container) {
        container.innerHTML = "";
      }

      const html5Qrcode = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false,
      });

      scannerRef.current = html5Qrcode;

      const config = {
        fps: 20,
        qrbox: (w: number, h: number) => {
          const width = Math.floor(Math.min(w * 0.85, 300));
          const height = Math.floor(Math.min(h * 0.6, 160));
          return { width, height };
        },
        aspectRatio: 1.0, // Simplify aspect ratio for better compatibility
        videoConstraints: {
          facingMode: specificCameraId ? undefined : "environment"
        }
      };

      // Attempt 1: Start
      if (specificCameraId) {
        await html5Qrcode.start(
          specificCameraId,
          config,
          (decoded) => handleSuccessfulScan(decoded),
          () => {}
        );
      } else {
        try {
          // Standard environment start
          await html5Qrcode.start(
            { facingMode: "environment" },
            config,
            (decoded) => handleSuccessfulScan(decoded),
            () => {}
          );
        } catch (envError) {
          console.warn("Environment mode failed, falling back to basic start");
          // Attempt fallback: Just start with any camera
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices);
            const backCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('arka'));
            await html5Qrcode.start(
              backCamera ? backCamera.id : devices[0].id,
              config,
              (decoded) => handleSuccessfulScan(decoded),
              () => {}
            );
          } else {
            throw envError;
          }
        }
      }

      setScannerReady(true);

      // Populate camera list for selector
      try {
        const devs = await Html5Qrcode.getCameras();
        if (devs && devs.length > 0) setCameras(devs);
      } catch {}

      // Check torch
      try {
        const capabilities = html5Qrcode.getRunningTrackCapabilities();
        setHasTorch('torch' in capabilities);
      } catch {
        setHasTorch(false);
      }

    } catch (err: any) {
      console.error("Critical camera start error:", err);
      const msg = err?.message || String(err);
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setErrorMessage("Kamera izni reddedildi. Lütfen tarayıcı ayarlarından kamera iznini verip sayfayı yenileyin.");
      } else if (msg.includes("NotFound") || msg.includes("no camera")) {
        setErrorMessage("Kamera cihazı bulunamadı. Lütfen cihazınızda bir kamera olduğundan emin olun.");
      } else {
        setErrorMessage("Kamera başlatılamadı. Hata: " + msg);
      }
    }
  }, [handleSuccessfulScan]);

  // Handle image upload from file or camera roll
  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setErrorMessage(null);

    try {
      // Create temporary scanner instance for file scan if main is busy
      const fileScanner = new Html5Qrcode("file-scan-temp-container", false);
      const result = await fileScanner.scanFile(file, true);
      fileScanner.clear();

      if (result) {
        handleSuccessfulScan(result);
      } else {
        alert("Görselde barkod tespit edilemedi. Lütfen daha net bir fotoğraf seçin.");
      }
    } catch (err) {
      console.error("File scan error:", err);
      alert("Fotoğraftan barkod okunamadı. Lütfen barkodun net ve parlama yapmadığından emin olun.");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Toggle flashlight / torch
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextState = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }] as unknown as MediaTrackConstraintSet[],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.error("Torch toggle failed:", err);
    }
  };

  // Switch camera
  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    setTorchOn(false);
    startScanner(newId);
  };

  // Manual code submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccessfulScan(manualCode.trim());
    setManualCode('');
  };

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopExistingScanner();
      setScannerReady(false);
      setErrorMessage(null);
      setTorchOn(false);
      setLastScanned(null);
    }

    return () => {
      stopExistingScanner();
    };
  }, [isOpen, startScanner]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      {/* Hidden element for file scanning */}
      <div id="file-scan-temp-container" className="hidden" />

      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">{title}</h3>
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center transition-all"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport Area */}
        <div className="relative bg-black flex-1 min-h-[280px] sm:min-h-[350px] overflow-hidden flex items-center justify-center">
          {/* HTML5 QRCODE Target Container */}
          <div id={readerElementId} className="w-full h-full min-h-[280px] flex items-center justify-center" />

          {/* Custom HD Targeting Overlay */}
          {scannerReady && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {/* Outer dimmed border */}
              <div className="relative w-[85%] max-w-[340px] h-[150px] sm:h-[180px] border-2 border-blue-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                {/* 4 Corner Accents */}
                <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />

                {/* Animated Red Laser Scanning Line */}
                <div className="absolute left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_#ef4444] animate-laser" />

                {/* Center crosshair */}
                <div className="absolute inset-0 flex items-center justify-center opacity-40">
                  <div className="w-8 h-[1px] bg-blue-300" />
                  <div className="h-8 w-[1px] bg-blue-300" />
                </div>
              </div>

              <div className="mt-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700 text-white text-[10px] font-medium tracking-wide flex items-center gap-1.5 shadow-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Kamera Aktif • Barkodu Kutunun İçine Tutun</span>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {!scannerReady && !errorMessage && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-2.5 text-white p-4">
              <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs sm:text-sm font-medium text-slate-300 animate-pulse">Kamera Başlatılıyor...</p>
              <p className="text-[11px] text-slate-500 text-center">Lütfen tarayıcınızın kamera iznine onay verin</p>
            </div>
          )}

          {/* Error Display with Alternates */}
          {errorMessage && (
            <div className="absolute inset-0 bg-slate-950 p-4 sm:p-6 flex flex-col items-center justify-center text-center gap-3 text-white">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-red-400 mb-1">Kamera Açılamadı</h4>
                <p className="text-xs text-slate-400 max-w-xs">{errorMessage}</p>
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  onClick={() => startScanner(selectedCameraId)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tekrar Dene
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Fotoğraftan Oku
                </button>
                <button
                  onClick={() => setShowManualInput(true)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  Elle Yaz
                </button>
              </div>
            </div>
          )}

          {/* Last Scanned Notification */}
          {lastScanned && (
            <div className="absolute top-3 left-4 right-4 z-10 flex items-center justify-center animate-bounce">
              <div className="bg-emerald-600 text-white px-3.5 py-1.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold border border-emerald-400/30">
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>Okundu: {lastScanned}</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2.5 shrink-0">
          {/* Quick Toolbar */}
          <div className="flex items-center justify-between gap-2">
            {/* Camera Selector (if multiple) */}
            {cameras.length > 1 && (
              <div className="flex-1 max-w-[180px]">
                <select
                  value={selectedCameraId}
                  onChange={handleCameraChange}
                  className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-xl px-2 py-1.5 text-xs truncate focus:ring-2 focus:ring-blue-500"
                >
                  {cameras.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      {c.label || `Kamera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              {/* Photo Upload Scanner Option */}
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
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all"
                title="Fotoğraf Çek / Dosyadan Oku"
              >
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">{isProcessingFile ? 'Taranıyor...' : 'Fotoğraftan Tara'}</span>
              </button>

              {/* Torch Button */}
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2 rounded-xl border transition-all text-xs flex items-center gap-1 ${
                    torchOn
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="Fener Aç/Kapat"
                >
                  <Flashlight className={`w-3.5 h-3.5 ${torchOn ? 'fill-amber-400' : ''}`} />
                </button>
              )}

              {/* Sound Toggle */}
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-xl border transition-all text-xs ${
                  soundEnabled
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
                title="Bip Sesi"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Manual Input Toggle */}
              <button
                type="button"
                onClick={() => setShowManualInput(!showManualInput)}
                className={`px-2.5 py-2 rounded-xl border transition-all text-xs flex items-center gap-1 font-semibold ${
                  showManualInput
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
                title="Klavyeyle Barkod Yaz"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Elle Yaz</span>
              </button>
            </div>
          </div>

          {/* Manual Input Form */}
          {showManualInput && (
            <form onSubmit={handleManualSubmit} className="flex gap-2 pt-1 border-t border-slate-800/80 animate-fadeIn">
              <input
                type="text"
                placeholder="Barkod numarasını yazın (örn: 8690826010015)"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoFocus
                className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0"
              >
                Ekle
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
