import { useEffect, useRef, useState, useCallback } from 'react';

export default function PhotoEditorModal({
  photoUrl,
  photoIndex,
  totalPhotos,
  isHero,
  onSave,
  onSetHero,
  onClose,
  notify,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const originalImageRef = useRef(null);

  // Transformations
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [flippedH, setFlippedH] = useState(false);

  // Color Filters
  const [brightness, setBrightness] = useState(100); // 100%
  const [contrast, setContrast] = useState(100); // 100%
  const [saturation, setSaturation] = useState(100); // 100%
  const [warmth, setWarmth] = useState(0); // -50 to +50

  // Modes & Tools: 'none' | 'crop' | 'erase' | 'magic'
  const [activeTool, setActiveTool] = useState('magic');
  const [cropRatio, setCropRatio] = useState('free'); // 'free' | '4:3' | '16:9' | '1:1'
  const [brushSize, setBrushSize] = useState(25);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [historyStack, setHistoryStack] = useState([]);

  // Crop rectangle state in canvas coordinates [x, y, w, h]
  const [cropBox, setCropBox] = useState(null);
  const [cropDrag, setCropDrag] = useState(null);

  // Load image
  useEffect(() => {
    if (!photoUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      renderCanvas();
    };
    img.src = photoUrl;
  }, [photoUrl]);

  // Render to canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = originalImageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');

    const isRotated90or270 = rotation % 180 !== 0;
    const targetWidth = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
    const targetHeight = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.save();
    // Move to center for rotation/flip
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flippedH ? -1 : 1, 1);

    // Apply color filters
    if (!showOriginal) {
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${
        warmth > 0 ? `sepia(${warmth * 0.4}%)` : ''
      }`;
    } else {
      ctx.filter = 'none';
    }

    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [rotation, flippedH, brightness, contrast, saturation, warmth, showOriginal]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // 1-Click "Smart Magic Pop / Vibrant"
  const applyMagicPop = () => {
    saveToHistory();
    setBrightness(105);
    setContrast(118);
    setSaturation(135);
    setWarmth(10);
    notify?.('✨ Smart Magic Pop applied! Colors and contrast enhanced.');
  };

  const resetFilters = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setWarmth(0);
    setRotation(0);
    setFlippedH(false);
    if (originalImageRef.current) renderCanvas();
  };

  // Flip Horizontally
  const toggleFlipH = () => {
    saveToHistory();
    setFlippedH((v) => !v);
  };

  // Rotate 90 deg
  const rotateClockwise = () => {
    saveToHistory();
    setRotation((r) => (r + 90) % 360);
  };

  // History Undo
  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL('image/jpeg', 0.95);
    setHistoryStack((prev) => [...prev.slice(-10), data]);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setHistoryStack((st) => st.slice(0, -1));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      renderCanvas();
    };
    img.src = prev;
  };

  // Apply Crop
  const handleApplyCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas || !cropBox) return;
    saveToHistory();

    const [cx, cy, cw, ch] = cropBox;
    if (cw < 10 || ch < 10) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cw;
    tempCanvas.height = ch;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);

    const croppedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalImageRef.current = img;
      setCropBox(null);
      setActiveTool('none');
      renderCanvas();
      notify?.('✂️ Photo cropped successfully');
    };
    img.src = croppedDataUrl;
  };

  // Watermark Eraser Healing Brush: inpainting clone-healing algorithm
  const healPatch = (canvas, cx, cy, radius) => {
    const ctx = canvas.getContext('2d');
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const w = Math.min(canvas.width - x0, radius * 2);
    const h = Math.min(canvas.height - y0, radius * 2);

    if (w <= 2 || h <= 2) return;

    // Grab surrounding border pixels to calculate median color texture
    const borderPixels = [];
    const borderImgData = ctx.getImageData(
      Math.max(0, x0 - 8),
      Math.max(0, y0 - 8),
      Math.min(canvas.width - x0, w + 16),
      Math.min(canvas.height - y0, h + 16)
    );
    const d = borderImgData.data;

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < d.length; i += 16) {
      rSum += d[i];
      gSum += d[i + 1];
      bSum += d[i + 2];
      count++;
    }
    const avgR = count ? rSum / count : 128;
    const avgG = count ? gSum / count : 128;
    const avgB = count ? bSum / count : 128;

    // Soft gradient heal
    const radGrad = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
    radGrad.addColorStop(0, `rgb(${avgR}, ${avgG}, ${avgB})`);
    radGrad.addColorStop(0.7, `rgba(${avgR}, ${avgG}, ${avgB}, 0.85)`);
    radGrad.addColorStop(1, `rgba(${avgR}, ${avgG}, ${avgB}, 0)`);

    ctx.save();
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Mouse & Touch events for Canvas (Eraser & Crop selection)
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    return [Math.round((clientX - rect.left) * scaleX), Math.round((clientY - rect.top) * scaleY)];
  };

  const handlePointerDown = (e) => {
    const [x, y] = getCanvasCoords(e);
    if (activeTool === 'erase') {
      saveToHistory();
      setIsDrawing(true);
      healPatch(canvasRef.current, x, y, brushSize);
    } else if (activeTool === 'crop') {
      setIsDrawing(true);
      setCropDrag([x, y]);
      setCropBox([x, y, 0, 0]);
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    const [x, y] = getCanvasCoords(e);
    if (activeTool === 'erase') {
      healPatch(canvasRef.current, x, y, brushSize);
    } else if (activeTool === 'crop' && cropDrag) {
      const [startX, startY] = cropDrag;
      let w = x - startX;
      let h = y - startY;

      // Enforce aspect ratio preset if selected
      if (cropRatio === '4:3') {
        const targetH = Math.round(Math.abs(w) * (3 / 4));
        h = h < 0 ? -targetH : targetH;
      } else if (cropRatio === '16:9') {
        const targetH = Math.round(Math.abs(w) * (9 / 16));
        h = h < 0 ? -targetH : targetH;
      } else if (cropRatio === '1:1') {
        const targetH = Math.abs(w);
        h = h < 0 ? -targetH : targetH;
      }

      const rx = w < 0 ? startX + w : startX;
      const ry = h < 0 ? startY + h : startY;
      setCropBox([Math.max(0, rx), Math.max(0, ry), Math.abs(w), Math.abs(h)]);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setCropDrag(null);
  };

  // Download high-res
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `BAM-Machine-Photo-${photoIndex + 1}-clean.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    notify?.('⬇ Photo downloaded!');
  };

  // Save changes back to parent
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const finalDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onSave(finalDataUrl, photoIndex);
    notify?.(`💾 Photo #${photoIndex + 1} updated and saved!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[96vh] w-full max-w-6xl flex-col rounded-xl border border-neutral-700 bg-ink-950 shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-ink-800 bg-ink-900/90 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-['Orbitron'] text-xs font-bold text-bam tracking-wider">BAM PHOTO STUDIO</span>
            <span className="text-xs text-neutral-400">· Photo {photoIndex + 1} of {totalPhotos}</span>
            {isHero && (
              <span className="rounded bg-bam px-2 py-0.5 text-[10px] font-black text-black shadow-sm">
                ★ HERO COVER
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isHero && onSetHero && (
              <button
                type="button"
                onClick={() => { onSetHero(photoIndex); notify?.('★ Set as Brochure Hero Cover!'); }}
                className="rounded border border-bam/40 bg-bam/15 px-2.5 py-1 text-xs font-bold text-bam hover:bg-bam hover:text-black transition"
              >
                ★ Set as Hero
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="rounded border border-neutral-700 bg-ink-800 px-2.5 py-1 text-xs font-semibold text-neutral-300 hover:text-white transition"
              title="Download clean high-res image"
            >
              ⬇ Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Studio Workspace: Canvas Center + Right/Bottom Control Panel */}
        <div className="flex flex-1 flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Canvas Viewing Area */}
          <div
            ref={containerRef}
            className="relative flex flex-1 items-center justify-center overflow-auto bg-black/70 p-4 select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <canvas
              ref={canvasRef}
              className={`max-h-full max-w-full rounded border border-neutral-800 shadow-lg object-contain transition-all ${
                activeTool === 'erase' ? 'cursor-crosshair' : activeTool === 'crop' ? 'cursor-crosshair' : 'cursor-default'
              }`}
            />

            {/* Crop Overlay Box */}
            {activeTool === 'crop' && cropBox && cropBox[2] > 0 && cropBox[3] > 0 && canvasRef.current && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-bam bg-bam/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                style={{
                  left: `${(cropBox[0] / canvasRef.current.width) * canvasRef.current.clientWidth + canvasRef.current.offsetLeft}px`,
                  top: `${(cropBox[1] / canvasRef.current.height) * canvasRef.current.clientHeight + canvasRef.current.offsetTop}px`,
                  width: `${(cropBox[2] / canvasRef.current.width) * canvasRef.current.clientWidth}px`,
                  height: `${(cropBox[3] / canvasRef.current.height) * canvasRef.current.clientHeight}px`,
                }}
              />
            )}

            {/* Quick Compare Indicator */}
            {showOriginal && (
              <div className="absolute top-4 left-4 rounded bg-red-600/80 px-2 py-1 text-xs font-bold text-white shadow">
                ORIGINAL (UNTOUCHED)
              </div>
            )}
          </div>

          {/* Right Controls Panel */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-ink-800 bg-ink-950 p-4 overflow-y-auto space-y-4 shrink-0">
            {/* Tool Tabs */}
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-ink-900 p-1 text-[11px] font-bold uppercase">
              <button
                type="button"
                onClick={() => setActiveTool('magic')}
                className={`rounded py-1.5 transition ${activeTool === 'magic' ? 'bg-bam text-black font-extrabold' : 'text-neutral-400 hover:text-white'}`}
              >
                ✨ Pop
              </button>
              <button
                type="button"
                onClick={() => setActiveTool('crop')}
                className={`rounded py-1.5 transition ${activeTool === 'crop' ? 'bg-bam text-black font-extrabold' : 'text-neutral-400 hover:text-white'}`}
              >
                ✂️ Crop
              </button>
              <button
                type="button"
                onClick={() => setActiveTool('erase')}
                className={`rounded py-1.5 transition ${activeTool === 'erase' ? 'bg-bam text-black font-extrabold' : 'text-neutral-400 hover:text-white'}`}
              >
                🩹 Erase
              </button>
              <button
                type="button"
                onClick={() => setActiveTool('none')}
                className={`rounded py-1.5 transition ${activeTool === 'none' ? 'bg-bam text-black font-extrabold' : 'text-neutral-400 hover:text-white'}`}
              >
                🔄 Flip
              </button>
            </div>

            {/* 1. MAGIC COLOR POP & SLIDERS */}
            {activeTool === 'magic' && (
              <div className="space-y-3 rounded-lg border border-ink-800 bg-ink-900/60 p-3">
                <button
                  type="button"
                  onClick={applyMagicPop}
                  className="w-full rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 py-2 text-xs font-black uppercase tracking-wider text-black shadow-md hover:brightness-110 active:scale-95 transition"
                >
                  ✨ Smart Magic Color Pop
                </button>
                <p className="text-[10px] text-neutral-400 text-center">
                  Boosts saturation (+35%) and contrast (+18%) to make yellow &amp; orange machinery pop.
                </p>

                <div className="space-y-2 pt-1 text-xs">
                  <div>
                    <div className="flex justify-between text-neutral-300"><span>Saturation</span><span>{saturation}%</span></div>
                    <input type="range" min="50" max="200" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full accent-bam" />
                  </div>
                  <div>
                    <div className="flex justify-between text-neutral-300"><span>Contrast</span><span>{contrast}%</span></div>
                    <input type="range" min="50" max="180" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-bam" />
                  </div>
                  <div>
                    <div className="flex justify-between text-neutral-300"><span>Brightness</span><span>{brightness}%</span></div>
                    <input type="range" min="60" max="150" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full accent-bam" />
                  </div>
                  <div>
                    <div className="flex justify-between text-neutral-300"><span>Warmth / Tone</span><span>{warmth}</span></div>
                    <input type="range" min="-30" max="30" value={warmth} onChange={(e) => setWarmth(Number(e.target.value))} className="w-full accent-bam" />
                  </div>
                </div>
              </div>
            )}

            {/* 2. CROP RATIOS */}
            {activeTool === 'crop' && (
              <div className="space-y-3 rounded-lg border border-ink-800 bg-ink-900/60 p-3 text-xs">
                <div className="font-bold text-neutral-200">Crop Ratio</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    ['free', 'Free Crop'],
                    ['4:3', '4:3 (Brochure Standard)'],
                    ['16:9', '16:9 (Wide)'],
                    ['1:1', '1:1 (Square)'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCropRatio(val)}
                      className={`rounded border px-2 py-1.5 text-center font-semibold transition ${
                        cropRatio === val ? 'border-bam bg-bam/20 text-bam' : 'border-neutral-700 bg-ink-900 text-neutral-300 hover:border-neutral-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-400">Click and drag over the image to draw your crop box.</p>
                {cropBox && cropBox[2] > 10 && (
                  <button
                    type="button"
                    onClick={handleApplyCrop}
                    className="w-full rounded bg-emerald-500 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 shadow transition"
                  >
                    ✓ Apply Crop
                  </button>
                )}
              </div>
            )}

            {/* 3. WATERMARK / STAMP ERASER */}
            {activeTool === 'erase' && (
              <div className="space-y-3 rounded-lg border border-ink-800 bg-ink-900/60 p-3 text-xs">
                <div className="font-bold text-neutral-200">Watermark / Dealer Stamp Eraser</div>
                <p className="text-[11px] text-neutral-400">
                  Paint directly over dealer phone numbers, corner watermarks, or auction logos to erase them cleanly.
                </p>
                <div>
                  <div className="flex justify-between text-neutral-300 mb-1">
                    <span>Brush Size</span><span>{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-bam"
                  />
                </div>
                {historyStack.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="w-full rounded border border-neutral-700 bg-ink-800 py-1 text-xs font-semibold text-neutral-300 hover:text-white"
                  >
                    ↩ Undo Last Stroke
                  </button>
                )}
              </div>
            )}

            {/* 4. ROTATE & FLIP */}
            <div className="space-y-2 rounded-lg border border-ink-800 bg-ink-900/60 p-3 text-xs">
              <div className="font-bold text-neutral-200">Orientation</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={toggleFlipH}
                  className="rounded border border-neutral-700 bg-ink-800 px-3 py-1.5 font-semibold text-neutral-200 hover:border-bam hover:text-white transition"
                >
                  ↔ Flip Horizontal
                </button>
                <button
                  type="button"
                  onClick={rotateClockwise}
                  className="rounded border border-neutral-700 bg-ink-800 px-3 py-1.5 font-semibold text-neutral-200 hover:border-bam hover:text-white transition"
                >
                  ↻ Rotate 90°
                </button>
              </div>
            </div>

            {/* Comparison & Reset */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onMouseDown={() => setShowOriginal(true)}
                onMouseUp={() => setShowOriginal(false)}
                onTouchStart={() => setShowOriginal(true)}
                onTouchEnd={() => setShowOriginal(false)}
                className="flex-1 rounded border border-neutral-700 bg-ink-900 py-1.5 text-xs font-semibold text-neutral-300 hover:text-white"
              >
                👁 Hold to Compare
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-red-300"
              >
                Reset
              </button>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-ink-800 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded border border-neutral-700 py-2 text-xs font-semibold text-neutral-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 rounded bg-bam py-2 text-xs font-black text-black shadow-md hover:brightness-110 active:scale-95 transition"
              >
                💾 Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
