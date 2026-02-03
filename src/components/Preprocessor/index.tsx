import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

interface ImageData {
  width: number;
  height: number;
  base64: string;
}

export function Preprocessor() {
  const [image, setImage] = useState<ImageData | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);

  const handleOpenImage = async () => {
    const path = await open({
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (path) {
      const data = await invoke<ImageData>("load_image", { path });
      setImage(data);
      setProcessedImage(data.base64);
    }
  };

  return (
    <div className="preprocessor">
      <div className="toolbar">
        <button onClick={handleOpenImage}>打开图片</button>
      </div>
      <div className="workspace">
        <div className="canvas-area">
          {processedImage ? (
            <img src={processedImage} alt="Preview" className="preview-image" />
          ) : (
            <div className="placeholder">点击"打开图片"加载图片</div>
          )}
        </div>
        <div className="sidebar">
          {image && (
            <div className="info">
              尺寸: {image.width} x {image.height}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
