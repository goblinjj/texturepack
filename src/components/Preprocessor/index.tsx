import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

interface ImageData {
  width: number;
  height: number;
  base64: string;
}

interface ColorEntry {
  r: number;
  g: number;
  b: number;
  tolerance: number;
}

export function Preprocessor() {
  const [image, setImage] = useState<ImageData | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [colors, setColors] = useState<ColorEntry[]>([]);
  const [pickingColor, setPickingColor] = useState(false);

  // Split state
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(1);
  const [showSplitLines, setShowSplitLines] = useState(true);
  const [hLines, setHLines] = useState<number[]>([]);
  const [vLines, setVLines] = useState<number[]>([]);
  const [dragging, setDragging] = useState<{ type: "h" | "v"; index: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleOpenImage = async () => {
    const path = await open({
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (path) {
      const data = await invoke<ImageData>("load_image", { path });
      setImage(data);
      setProcessedImage(data.base64);
      setColors([]);
      setRows(1);
      setCols(1);
      setHLines([]);
      setVLines([]);
    }
  };

  // Generate equal split lines
  useEffect(() => {
    if (!image) return;
    const newHLines: number[] = [];
    const newVLines: number[] = [];
    for (let i = 1; i < rows; i++) {
      newHLines.push(Math.round((image.height / rows) * i));
    }
    for (let i = 1; i < cols; i++) {
      newVLines.push(Math.round((image.width / cols) * i));
    }
    setHLines(newHLines);
    setVLines(newVLines);
  }, [rows, cols, image]);

  // Draw split lines overlay
  const drawOverlay = useCallback(() => {
    if (!overlayRef.current || !imgRef.current || !image || !showSplitLines) return;

    const canvas = overlayRef.current;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    const container = containerRef.current!;
    const containerRect = container.getBoundingClientRect();

    canvas.width = containerRect.width;
    canvas.height = containerRect.height;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const offsetX = rect.left - containerRect.left;
    const offsetY = rect.top - containerRect.top;
    const scaleX = rect.width / image.width;
    const scaleY = rect.height / image.height;

    ctx.strokeStyle = "#e94560";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    // Draw horizontal lines
    hLines.forEach((y) => {
      const screenY = offsetY + y * scaleY;
      ctx.beginPath();
      ctx.moveTo(offsetX, screenY);
      ctx.lineTo(offsetX + rect.width, screenY);
      ctx.stroke();
    });

    // Draw vertical lines
    vLines.forEach((x) => {
      const screenX = offsetX + x * scaleX;
      ctx.beginPath();
      ctx.moveTo(screenX, offsetY);
      ctx.lineTo(screenX, offsetY + rect.height);
      ctx.stroke();
    });
  }, [hLines, vLines, image, showSplitLines]);

  useEffect(() => {
    drawOverlay();
    window.addEventListener("resize", drawOverlay);
    return () => window.removeEventListener("resize", drawOverlay);
  }, [drawOverlay, processedImage]);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!pickingColor || !imgRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = imgRef.current.naturalWidth;
    canvas.height = imgRef.current.naturalHeight;
    ctx.drawImage(imgRef.current, 0, 0);

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const newColor: ColorEntry = {
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      tolerance: 30,
    };

    setColors([...colors, newColor]);
    setPickingColor(false);
    applyColorRemoval([...colors, newColor]);
  };

  const applyColorRemoval = async (colorList: ColorEntry[]) => {
    if (!image) return;
    if (colorList.length === 0) {
      setProcessedImage(image.base64);
      return;
    }
    const result = await invoke<string>("remove_colors", {
      base64Input: image.base64,
      colors: colorList,
    });
    setProcessedImage(result);
  };

  const updateTolerance = (index: number, tolerance: number) => {
    const newColors = [...colors];
    newColors[index].tolerance = tolerance;
    setColors(newColors);
    applyColorRemoval(newColors);
  };

  const removeColor = (index: number) => {
    const newColors = colors.filter((_, i) => i !== index);
    setColors(newColors);
    applyColorRemoval(newColors);
  };

  // Drag handling for split lines
  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (!imgRef.current || !image || pickingColor) return;

    const rect = imgRef.current.getBoundingClientRect();
    const container = containerRef.current!;
    const containerRect = container.getBoundingClientRect();
    const offsetX = rect.left - containerRect.left;
    const offsetY = rect.top - containerRect.top;
    const scaleX = rect.width / image.width;
    const scaleY = rect.height / image.height;

    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    const threshold = 10;

    // Check horizontal lines
    for (let i = 0; i < hLines.length; i++) {
      const screenY = offsetY + hLines[i] * scaleY;
      if (Math.abs(mouseY - screenY) < threshold &&
          mouseX >= offsetX && mouseX <= offsetX + rect.width) {
        setDragging({ type: "h", index: i });
        return;
      }
    }

    // Check vertical lines
    for (let i = 0; i < vLines.length; i++) {
      const screenX = offsetX + vLines[i] * scaleX;
      if (Math.abs(mouseX - screenX) < threshold &&
          mouseY >= offsetY && mouseY <= offsetY + rect.height) {
        setDragging({ type: "v", index: i });
        return;
      }
    }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !imgRef.current || !image) return;

    const rect = imgRef.current.getBoundingClientRect();
    const container = containerRef.current!;
    const containerRect = container.getBoundingClientRect();
    const offsetY = rect.top - containerRect.top;
    const offsetX = rect.left - containerRect.left;
    const scaleX = rect.width / image.width;
    const scaleY = rect.height / image.height;

    if (dragging.type === "h") {
      const mouseY = e.clientY - containerRect.top;
      let newY = Math.round((mouseY - offsetY) / scaleY);

      // Clamp between adjacent lines
      const minY = dragging.index === 0 ? 1 : hLines[dragging.index - 1] + 1;
      const maxY = dragging.index === hLines.length - 1 ? image.height - 1 : hLines[dragging.index + 1] - 1;
      newY = Math.max(minY, Math.min(maxY, newY));

      const newHLines = [...hLines];
      newHLines[dragging.index] = newY;
      setHLines(newHLines);
    } else {
      const mouseX = e.clientX - containerRect.left;
      let newX = Math.round((mouseX - offsetX) / scaleX);

      const minX = dragging.index === 0 ? 1 : vLines[dragging.index - 1] + 1;
      const maxX = dragging.index === vLines.length - 1 ? image.width - 1 : vLines[dragging.index + 1] - 1;
      newX = Math.max(minX, Math.min(maxX, newX));

      const newVLines = [...vLines];
      newVLines[dragging.index] = newX;
      setVLines(newVLines);
    }
  };

  const handleOverlayMouseUp = () => {
    setDragging(null);
  };

  const handleExport = async () => {
    if (!processedImage || !image) return;

    const dir = await open({ directory: true });
    if (!dir) return;

    const config = {
      horizontal_lines: hLines.map((y) => ({ position: y })),
      vertical_lines: vLines.map((x) => ({ position: x })),
    };

    const splitImages = await invoke<string[]>("split_image", {
      base64Input: processedImage,
      config,
    });

    // Save each image
    for (let i = 0; i < splitImages.length; i++) {
      await invoke("save_image", {
        base64Input: splitImages[i],
        path: `${dir}/${i}.png`,
      });
    }

    alert(`已导出 ${splitImages.length} 张图片到 ${dir}`);
  };

  const rgbToHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

  return (
    <div className="preprocessor">
      <div className="toolbar">
        <button onClick={handleOpenImage}>打开图片</button>
        {image && <button onClick={handleExport}>导出分割图</button>}
      </div>
      <div className="workspace">
        <div className="canvas-area" ref={containerRef}>
          {processedImage ? (
            <>
              <img
                ref={imgRef}
                src={processedImage}
                alt="Preview"
                className={`preview-image ${pickingColor ? "picking" : ""}`}
                onClick={handleImageClick}
                onLoad={drawOverlay}
              />
              <canvas
                ref={overlayRef}
                className="overlay-canvas"
                onMouseDown={handleOverlayMouseDown}
                onMouseMove={handleOverlayMouseMove}
                onMouseUp={handleOverlayMouseUp}
                onMouseLeave={handleOverlayMouseUp}
              />
            </>
          ) : (
            <div className="placeholder">点击"打开图片"加载图片</div>
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
        <div className="sidebar">
          {image && (
            <>
              <div className="info">
                尺寸: {image.width} x {image.height}
              </div>

              <div className="section">
                <h3>消除颜色</h3>
                <div className="color-list">
                  {colors.map((color, i) => (
                    <div key={i} className="color-item">
                      <span
                        className="color-swatch"
                        style={{ background: rgbToHex(color.r, color.g, color.b) }}
                      />
                      <span className="color-hex">
                        {rgbToHex(color.r, color.g, color.b)}
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={color.tolerance}
                        onChange={(e) => updateTolerance(i, Number(e.target.value))}
                      />
                      <span className="tolerance-value">{color.tolerance}</span>
                      <button className="remove-btn" onClick={() => removeColor(i)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className={`pick-btn ${pickingColor ? "active" : ""}`}
                  onClick={() => setPickingColor(!pickingColor)}
                >
                  {pickingColor ? "取消拾取" : "+ 点击图片添加颜色"}
                </button>
              </div>

              <div className="section">
                <h3>分割设置</h3>
                <div className="split-controls">
                  <label>
                    行数:
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={rows}
                      onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
                    />
                  </label>
                  <label>
                    列数:
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={cols}
                      onChange={(e) => setCols(Math.max(1, Number(e.target.value)))}
                    />
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showSplitLines}
                    onChange={(e) => setShowSplitLines(e.target.checked)}
                  />
                  显示分割线
                </label>
                <p className="hint">拖动分割线可微调位置</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
