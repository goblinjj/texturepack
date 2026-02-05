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

interface FrameWithAction {
  base64: string;
  actionName: string;
  frameIndex: number;
}

interface PreprocessorProps {
  onExportToAtlas?: (frames: { base64: string }[], framesByAction?: FrameWithAction[]) => void;
}

export function Preprocessor({ onExportToAtlas }: PreprocessorProps) {
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

  // Generate equal split lines (including boundary lines)
  useEffect(() => {
    if (!image) return;
    const newHLines: number[] = [0]; // Start with top boundary
    const newVLines: number[] = [0]; // Start with left boundary
    for (let i = 1; i < rows; i++) {
      newHLines.push(Math.round((image.height / rows) * i));
    }
    for (let i = 1; i < cols; i++) {
      newVLines.push(Math.round((image.width / cols) * i));
    }
    newHLines.push(image.height); // End with bottom boundary
    newVLines.push(image.width);  // End with right boundary
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

    // Get boundary positions
    const leftBoundary = offsetX + vLines[0] * scaleX;
    const rightBoundary = offsetX + vLines[vLines.length - 1] * scaleX;
    const topBoundary = offsetY + hLines[0] * scaleY;
    const bottomBoundary = offsetY + hLines[hLines.length - 1] * scaleY;

    // Draw black overlay for discarded areas (outside boundaries)
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";

    // Top discarded area
    if (topBoundary > offsetY) {
      ctx.fillRect(offsetX, offsetY, rect.width, topBoundary - offsetY);
    }
    // Bottom discarded area
    if (bottomBoundary < offsetY + rect.height) {
      ctx.fillRect(offsetX, bottomBoundary, rect.width, offsetY + rect.height - bottomBoundary);
    }
    // Left discarded area (between top and bottom boundaries)
    if (leftBoundary > offsetX) {
      ctx.fillRect(offsetX, topBoundary, leftBoundary - offsetX, bottomBoundary - topBoundary);
    }
    // Right discarded area (between top and bottom boundaries)
    if (rightBoundary < offsetX + rect.width) {
      ctx.fillRect(rightBoundary, topBoundary, offsetX + rect.width - rightBoundary, bottomBoundary - topBoundary);
    }

    // Draw split lines
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;

    // Draw horizontal lines (first and last are boundaries - solid, others are dashed)
    hLines.forEach((y, i) => {
      const screenY = offsetY + y * scaleY;
      const isBoundary = i === 0 || i === hLines.length - 1;
      ctx.setLineDash(isBoundary ? [] : [5, 5]);
      ctx.beginPath();
      ctx.moveTo(leftBoundary, screenY);
      ctx.lineTo(rightBoundary, screenY);
      ctx.stroke();
    });

    // Draw vertical lines (first and last are boundaries - solid, others are dashed)
    vLines.forEach((x, i) => {
      const screenX = offsetX + x * scaleX;
      const isBoundary = i === 0 || i === vLines.length - 1;
      ctx.setLineDash(isBoundary ? [] : [5, 5]);
      ctx.beginPath();
      ctx.moveTo(screenX, topBoundary);
      ctx.lineTo(screenX, bottomBoundary);
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

      // Clamp between adjacent lines (boundaries can go to image edges)
      const minY = dragging.index === 0 ? 0 : hLines[dragging.index - 1] + 1;
      const maxY = dragging.index === hLines.length - 1 ? image.height : hLines[dragging.index + 1] - 1;
      newY = Math.max(minY, Math.min(maxY, newY));

      const newHLines = [...hLines];
      newHLines[dragging.index] = newY;
      setHLines(newHLines);
    } else {
      const mouseX = e.clientX - containerRect.left;
      let newX = Math.round((mouseX - offsetX) / scaleX);

      // Clamp between adjacent lines (boundaries can go to image edges)
      const minX = dragging.index === 0 ? 0 : vLines[dragging.index - 1] + 1;
      const maxX = dragging.index === vLines.length - 1 ? image.width : vLines[dragging.index + 1] - 1;
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
        {image && onExportToAtlas && (
          <button onClick={async () => {
            const config = {
              horizontal_lines: hLines.map((y) => ({ position: y })),
              vertical_lines: vLines.map((x) => ({ position: x })),
            };
            const splitImages = await invoke<string[]>("split_image", {
              base64Input: processedImage,
              config,
            });

            // Calculate rows and cols from split lines
            const numRows = hLines.length - 1;
            const numCols = vLines.length - 1;

            // Predefined action names
            const actionNames = ['idle', 'run', 'atk', 'hurt', 'magic', 'die'];

            // Create frames with action info (row = action, col = frame index)
            const framesByAction: FrameWithAction[] = [];
            for (let row = 0; row < numRows; row++) {
              const actionName = row < actionNames.length
                ? actionNames[row]
                : `action_${row + 1}`;
              for (let col = 0; col < numCols; col++) {
                const imageIndex = row * numCols + col;
                if (imageIndex < splitImages.length) {
                  framesByAction.push({
                    base64: splitImages[imageIndex],
                    actionName,
                    frameIndex: col,
                  });
                }
              }
            }

            onExportToAtlas(splitImages.map(base64 => ({ base64 })), framesByAction);
          }}>
            导出到 Atlas
          </button>
        )}
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
                style={{ pointerEvents: pickingColor ? "none" : "auto" }}
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
