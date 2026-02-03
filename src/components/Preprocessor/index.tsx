import { useState, useRef } from "react";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleOpenImage = async () => {
    const path = await open({
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (path) {
      const data = await invoke<ImageData>("load_image", { path });
      setImage(data);
      setProcessedImage(data.base64);
      setColors([]);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!pickingColor || !imgRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    // Draw image to canvas to get pixel color
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

  const rgbToHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

  return (
    <div className="preprocessor">
      <div className="toolbar">
        <button onClick={handleOpenImage}>打开图片</button>
      </div>
      <div className="workspace">
        <div className="canvas-area">
          {processedImage ? (
            <img
              ref={imgRef}
              src={processedImage}
              alt="Preview"
              className={`preview-image ${pickingColor ? "picking" : ""}`}
              onClick={handleImageClick}
            />
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
