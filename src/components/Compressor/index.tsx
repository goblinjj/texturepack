import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

interface ImageData {
  width: number;
  height: number;
  base64: string;
}

interface CompressResult {
  base64: string;
  width: number;
  height: number;
  size_bytes: number;
}

interface CompressorProps {
  importedImage?: string;
  onClearImport?: () => void;
}

export function Compressor({ importedImage, onClearImport }: CompressorProps) {
  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [compressedImage, setCompressedImage] = useState<CompressResult | null>(null);
  const [quality, setQuality] = useState(80);
  const [scale, setScale] = useState(100);
  const [isCompressing, setIsCompressing] = useState(false);

  const handleOpenImage = async () => {
    const path = await open({
      filters: [{ name: "Images", extensions: ["png"] }],
    });
    if (path) {
      const data = await invoke<ImageData>("load_image", { path });
      const size = await invoke<number>("get_image_size", { base64Input: data.base64 });
      setOriginalImage(data);
      setOriginalSize(size);
      setCompressedImage(null);
    }
  };

  // Handle imported image from Atlas
  useEffect(() => {
    if (importedImage) {
      (async () => {
        const img = new Image();
        img.src = importedImage;
        await new Promise((resolve) => { img.onload = resolve; });

        const size = await invoke<number>("get_image_size", { base64Input: importedImage });
        setOriginalImage({
          width: img.naturalWidth,
          height: img.naturalHeight,
          base64: importedImage,
        });
        setOriginalSize(size);
        setCompressedImage(null);
        onClearImport?.();
      })();
    }
  }, [importedImage, onClearImport]);

  const compress = useCallback(async () => {
    if (!originalImage) return;
    setIsCompressing(true);
    try {
      const result = await invoke<CompressResult>("compress_image", {
        base64Input: originalImage.base64,
        quality,
        scale,
      });
      setCompressedImage(result);
    } catch (e) {
      console.error("Compression failed:", e);
    }
    setIsCompressing(false);
  }, [originalImage, quality, scale]);

  // Auto-compress when parameters change
  useEffect(() => {
    if (originalImage) {
      const timer = setTimeout(compress, 300);
      return () => clearTimeout(timer);
    }
  }, [originalImage, quality, scale, compress]);

  const handleExport = async () => {
    if (!compressedImage) return;

    const dir = await open({ directory: true });
    if (!dir) return;

    await invoke("save_image", {
      base64Input: compressedImage.base64,
      path: `${dir}/compressed.png`,
    });

    alert(`已导出到 ${dir}/compressed.png`);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const savedPercent = originalSize && compressedImage
    ? ((1 - compressedImage.size_bytes / originalSize) * 100).toFixed(1)
    : 0;

  return (
    <div className="compressor">
      <div className="toolbar">
        <button onClick={handleOpenImage}>打开图片</button>
        <button onClick={handleExport} disabled={!compressedImage}>
          导出压缩图
        </button>
      </div>

      <div className="workspace">
        <div className="preview-container">
          <div className="preview-panel">
            <div className="preview-title">
              原图
              {originalImage && (
                <span className="preview-info">
                  {originalImage.width} x {originalImage.height}
                </span>
              )}
            </div>
            <div className="preview-area">
              {originalImage ? (
                <img src={originalImage.base64} alt="Original" />
              ) : (
                <div className="placeholder">点击"打开图片"或从 Atlas 导入</div>
              )}
            </div>
          </div>

          <div className="preview-panel">
            <div className="preview-title">
              压缩预览
              {compressedImage && (
                <span className="preview-info">
                  {compressedImage.width} x {compressedImage.height}
                </span>
              )}
            </div>
            <div className="preview-area">
              {isCompressing ? (
                <div className="placeholder">压缩中...</div>
              ) : compressedImage ? (
                <img src={compressedImage.base64} alt="Compressed" />
              ) : (
                <div className="placeholder">调整参数后自动预览</div>
              )}
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="control-row">
            <label>质量:</label>
            <input
              type="range"
              min="10"
              max="100"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
            <span className="value">{quality}</span>
          </div>

          <div className="control-row">
            <label>缩放:</label>
            <input
              type="range"
              min="10"
              max="100"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
            <span className="value">{scale}%</span>
            {originalImage && scale < 100 && (
              <span className="size-hint">
                → {Math.round(originalImage.width * scale / 100)} x {Math.round(originalImage.height * scale / 100)}
              </span>
            )}
          </div>

          <div className="size-comparison">
            <div className="size-row">
              <span>原始大小:</span>
              <span className="size-value">{formatSize(originalSize)}</span>
            </div>
            {compressedImage && (
              <>
                <div className="size-row">
                  <span>压缩后:</span>
                  <span className="size-value">{formatSize(compressedImage.size_bytes)}</span>
                </div>
                <div className="size-row saved">
                  <span>节省:</span>
                  <span className="size-value">{savedPercent}%</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
