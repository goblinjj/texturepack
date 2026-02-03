# Sprite Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a macOS desktop app for processing images into Phaser-compatible sprite atlases.

**Architecture:** Tauri (Rust backend) + React (TypeScript frontend). Rust handles image processing (color removal, splitting, bin packing), React handles UI and canvas rendering.

**Tech Stack:** Tauri 2.x, React 18, TypeScript, Vite, image crate (Rust), rectangle-packer crate (Rust)

---

## Phase 1: Project Setup

### Task 1: Install Rust Toolchain

**Step 1: Install Rust via rustup**

Run:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

**Step 2: Reload shell and verify**

Run:
```bash
source "$HOME/.cargo/env" && rustc --version && cargo --version
```
Expected: Version numbers displayed (rustc 1.x.x, cargo 1.x.x)

---

### Task 2: Create Tauri + React Project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Create: `src/main.tsx`, `src/App.tsx`

**Step 1: Create project with Tauri CLI**

Run:
```bash
cd /Volumes/T7/work/texturepack
pnpm create tauri-app . --template react-ts --manager pnpm --yes
```

**Step 2: Verify project structure**

Run:
```bash
ls -la && ls -la src-tauri/
```
Expected: See `package.json`, `src-tauri/`, `src/` directories

**Step 3: Install dependencies**

Run:
```bash
pnpm install
```

**Step 4: Commit initial project**

```bash
git add -A
git commit -m "chore: initialize Tauri + React project"
```

---

### Task 3: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add image processing dependencies**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:
```toml
image = "0.25"
base64 = "0.22"
serde_json = "1.0"
```

**Step 2: Verify build**

Run:
```bash
cd /Volumes/T7/work/texturepack && pnpm tauri build --debug 2>&1 | tail -20
```
Expected: Build succeeds (may take a few minutes first time)

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "chore: add Rust image processing dependencies"
```

---

## Phase 2: Preprocessor Module - Backend

### Task 4: Image Loading Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add image loading command**

Replace content of `src-tauri/src/lib.rs`:
```rust
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, GenericImageView, ImageFormat};
use std::io::Cursor;
use tauri::command;

#[command]
fn load_image(path: String) -> Result<ImageData, String> {
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let (width, height) = img.dimensions();

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
    let base64_data = STANDARD.encode(buf.get_ref());

    Ok(ImageData {
        width,
        height,
        base64: format!("data:image/png;base64,{}", base64_data),
    })
}

#[derive(serde::Serialize)]
struct ImageData {
    width: u32,
    height: u32,
    base64: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 2: Add dialog plugin**

Run:
```bash
cd /Volumes/T7/work/texturepack && pnpm add @tauri-apps/plugin-dialog
cd src-tauri && cargo add tauri-plugin-dialog
```

**Step 3: Update tauri.conf.json permissions**

Add to `src-tauri/capabilities/default.json` in the `permissions` array:
```json
"dialog:default"
```

**Step 4: Verify compilation**

Run:
```bash
cd /Volumes/T7/work/texturepack && cd src-tauri && cargo check
```
Expected: Compiles without errors

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add image loading Tauri command"
```

---

### Task 5: Color Removal Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add color removal logic**

Add before `pub fn run()` in `src-tauri/src/lib.rs`:
```rust
#[derive(serde::Deserialize)]
struct ColorToRemove {
    r: u8,
    g: u8,
    b: u8,
    tolerance: u8,
}

#[command]
fn remove_colors(base64_input: String, colors: Vec<ColorToRemove>) -> Result<String, String> {
    // Decode base64 (strip data URL prefix if present)
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);

    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    let mut img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.to_rgba8();

    for (_, _, pixel) in img.enumerate_pixels_mut() {
        for color in &colors {
            let dr = (pixel[0] as i32 - color.r as i32).abs();
            let dg = (pixel[1] as i32 - color.g as i32).abs();
            let db = (pixel[2] as i32 - color.b as i32).abs();
            let distance = ((dr * dr + dg * dg + db * db) as f64).sqrt();

            if distance <= color.tolerance as f64 * 4.42 {  // Scale 0-100 to ~0-442 (max RGB distance)
                pixel[3] = 0; // Set alpha to transparent
                break;
            }
        }
    }

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(buf.get_ref())))
}
```

**Step 2: Register command**

Update `invoke_handler` in `run()`:
```rust
.invoke_handler(tauri::generate_handler![load_image, remove_colors])
```

**Step 3: Verify compilation**

Run:
```bash
cd /Volumes/T7/work/texturepack/src-tauri && cargo check
```

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add color removal Tauri command"
```

---

### Task 6: Image Split Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add split image logic**

Add before `pub fn run()`:
```rust
#[derive(serde::Deserialize)]
struct SplitLine {
    position: u32,
}

#[derive(serde::Deserialize)]
struct SplitConfig {
    horizontal_lines: Vec<SplitLine>,  // y positions
    vertical_lines: Vec<SplitLine>,    // x positions
}

#[command]
fn split_image(base64_input: String, config: SplitConfig) -> Result<Vec<String>, String> {
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);

    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let (width, height) = img.dimensions();

    // Build split points including edges
    let mut y_points: Vec<u32> = vec![0];
    y_points.extend(config.horizontal_lines.iter().map(|l| l.position));
    y_points.push(height);

    let mut x_points: Vec<u32> = vec![0];
    x_points.extend(config.vertical_lines.iter().map(|l| l.position));
    x_points.push(width);

    let mut results = Vec::new();

    // Iterate row by row, then column by column
    for row in 0..y_points.len() - 1 {
        for col in 0..x_points.len() - 1 {
            let x = x_points[col];
            let y = y_points[row];
            let w = x_points[col + 1] - x;
            let h = y_points[row + 1] - y;

            let cropped = img.crop_imm(x, y, w, h);
            let mut buf = Cursor::new(Vec::new());
            cropped.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
            results.push(format!("data:image/png;base64,{}", STANDARD.encode(buf.get_ref())));
        }
    }

    Ok(results)
}
```

**Step 2: Register command**

Update `invoke_handler`:
```rust
.invoke_handler(tauri::generate_handler![load_image, remove_colors, split_image])
```

**Step 3: Verify compilation**

Run:
```bash
cd /Volumes/T7/work/texturepack/src-tauri && cargo check
```

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add image split Tauri command"
```

---

## Phase 3: Preprocessor Module - Frontend

### Task 7: Basic App Layout

**Files:**
- Modify: `src/App.tsx`
- Create: `src/App.css`

**Step 1: Create basic two-tab layout**

Replace `src/App.tsx`:
```tsx
import { useState } from "react";
import "./App.css";

type Tab = "preprocess" | "atlas";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("preprocess");

  return (
    <div className="app">
      <nav className="tabs">
        <button
          className={activeTab === "preprocess" ? "active" : ""}
          onClick={() => setActiveTab("preprocess")}
        >
          预处理
        </button>
        <button
          className={activeTab === "atlas" ? "active" : ""}
          onClick={() => setActiveTab("atlas")}
        >
          Atlas 拼接
        </button>
      </nav>
      <main className="content">
        {activeTab === "preprocess" ? (
          <div>预处理模块</div>
        ) : (
          <div>Atlas 模块</div>
        )}
      </main>
    </div>
  );
}

export default App;
```

**Step 2: Create base styles**

Create `src/App.css`:
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
  color: #eee;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.tabs {
  display: flex;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
}

.tabs button {
  padding: 12px 24px;
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.tabs button:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.tabs button.active {
  color: #fff;
  background: #0f3460;
  border-bottom: 2px solid #e94560;
}

.content {
  flex: 1;
  overflow: hidden;
}
```

**Step 3: Verify dev server**

Run:
```bash
cd /Volumes/T7/work/texturepack && pnpm tauri dev
```
Expected: App opens with two tabs

**Step 4: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: add basic app layout with tabs"
```

---

### Task 8: Preprocessor Component - Image Loading

**Files:**
- Create: `src/components/Preprocessor/index.tsx`
- Create: `src/components/Preprocessor/styles.css`
- Modify: `src/App.tsx`

**Step 1: Create Preprocessor component**

Create `src/components/Preprocessor/index.tsx`:
```tsx
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
```

**Step 2: Create styles**

Create `src/components/Preprocessor/styles.css`:
```css
.preprocessor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.toolbar {
  padding: 12px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  display: flex;
  gap: 8px;
}

.toolbar button {
  padding: 8px 16px;
  background: #e94560;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
}

.toolbar button:hover {
  background: #ff6b6b;
}

.workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.canvas-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(45deg, #222 25%, transparent 25%),
    linear-gradient(-45deg, #222 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #222 75%),
    linear-gradient(-45deg, transparent 75%, #222 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: #2a2a2a;
  overflow: auto;
  padding: 20px;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.placeholder {
  color: #666;
  font-size: 14px;
}

.sidebar {
  width: 280px;
  background: #16213e;
  border-left: 1px solid #0f3460;
  padding: 16px;
  overflow-y: auto;
}

.info {
  font-size: 13px;
  color: #888;
  margin-bottom: 16px;
}
```

**Step 3: Update App.tsx**

Add import and use component in `src/App.tsx`:
```tsx
import { useState } from "react";
import { Preprocessor } from "./components/Preprocessor";
import "./App.css";

// ... rest of component, replace placeholder:
{activeTab === "preprocess" ? (
  <Preprocessor />
) : (
  <div>Atlas 模块</div>
)}
```

**Step 4: Verify**

Run: `pnpm tauri dev`
Expected: Can open and display an image

**Step 5: Commit**

```bash
git add src/components/Preprocessor src/App.tsx
git commit -m "feat: add Preprocessor component with image loading"
```

---

### Task 9: Color Picker and Removal UI

**Files:**
- Modify: `src/components/Preprocessor/index.tsx`
- Modify: `src/components/Preprocessor/styles.css`

**Step 1: Add color state and picker mode**

Update `src/components/Preprocessor/index.tsx`:
```tsx
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
```

**Step 2: Add color picker styles**

Add to `src/components/Preprocessor/styles.css`:
```css
.section {
  margin-bottom: 20px;
}

.section h3 {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 12px;
  color: #aaa;
}

.color-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.color-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #444;
}

.color-hex {
  width: 65px;
  font-family: monospace;
}

.color-item input[type="range"] {
  flex: 1;
  height: 4px;
}

.tolerance-value {
  width: 24px;
  text-align: right;
  color: #888;
}

.remove-btn {
  background: none;
  border: none;
  color: #e94560;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

.pick-btn {
  width: 100%;
  padding: 8px;
  background: #0f3460;
  border: 1px dashed #e94560;
  border-radius: 4px;
  color: #e94560;
  cursor: pointer;
  font-size: 12px;
}

.pick-btn.active {
  background: #e94560;
  color: white;
  border-style: solid;
}

.preview-image.picking {
  cursor: crosshair;
}
```

**Step 3: Verify**

Run: `pnpm tauri dev`
Expected: Can pick colors and see them removed with adjustable tolerance

**Step 4: Commit**

```bash
git add src/components/Preprocessor
git commit -m "feat: add color picker and removal UI"
```

---

### Task 10: Split Lines Editor

**Files:**
- Modify: `src/components/Preprocessor/index.tsx`
- Modify: `src/components/Preprocessor/styles.css`

**Step 1: Add split lines state and canvas overlay**

This is a larger update. Replace the entire `src/components/Preprocessor/index.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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
```

**Step 2: Add overlay and split control styles**

Add to `src/components/Preprocessor/styles.css`:
```css
.canvas-area {
  position: relative;
}

.overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

.preview-image {
  position: relative;
  z-index: 1;
}

.overlay-canvas {
  z-index: 2;
  cursor: default;
}

.split-controls {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.split-controls label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.split-controls input[type="number"] {
  width: 50px;
  padding: 4px 8px;
  background: #0f3460;
  border: 1px solid #1a4a7a;
  border-radius: 4px;
  color: white;
  font-size: 13px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.hint {
  margin-top: 8px;
  font-size: 11px;
  color: #666;
}
```

**Step 3: Add save_image command to Rust**

Add to `src-tauri/src/lib.rs` before `pub fn run()`:
```rust
#[command]
fn save_image(base64_input: String, path: String) -> Result<(), String> {
    let base64_clean = base64_input
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&base64_input);

    let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}
```

Update `invoke_handler`:
```rust
.invoke_handler(tauri::generate_handler![load_image, remove_colors, split_image, save_image])
```

**Step 4: Verify**

Run: `pnpm tauri dev`
Expected: Can set rows/cols, see split lines, drag them, and export

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add split lines editor with drag support and export"
```

---

## Phase 4: Atlas Module - Backend

### Task 11: Bin Packing Algorithm

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/atlas_packer.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add rectangle packer dependency**

Add to `src-tauri/Cargo.toml`:
```toml
rectangle-pack = "0.4"
```

**Step 2: Create atlas packer module**

Create `src-tauri/src/atlas_packer.rs`:
```rust
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, GenericImage, RgbaImage};
use rectangle_pack::{
    contains_smallest_box, pack_rects, volume_heuristic, GroupedRectsToPlace, RectToInsert,
    TargetBin,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Cursor;

#[derive(Deserialize)]
pub struct SpriteInput {
    pub name: String,
    pub base64: String,
}

#[derive(Serialize)]
pub struct AtlasOutput {
    pub image_base64: String,
    pub json: String,
}

#[derive(Serialize)]
struct PhaserFrame {
    frame: FrameRect,
    rotated: bool,
    trimmed: bool,
    #[serde(rename = "spriteSourceSize")]
    sprite_source_size: FrameRect,
    #[serde(rename = "sourceSize")]
    source_size: Size,
}

#[derive(Serialize)]
struct FrameRect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

#[derive(Serialize)]
struct Size {
    w: u32,
    h: u32,
}

#[derive(Serialize)]
struct PhaserMeta {
    image: String,
    size: Size,
    scale: u32,
}

#[derive(Serialize)]
struct PhaserAtlas {
    frames: BTreeMap<String, PhaserFrame>,
    meta: PhaserMeta,
}

pub fn pack_atlas(sprites: Vec<SpriteInput>, padding: u32) -> Result<AtlasOutput, String> {
    // Decode all images
    let mut images: Vec<(String, DynamicImage)> = Vec::new();

    for sprite in &sprites {
        let base64_clean = sprite
            .base64
            .strip_prefix("data:image/png;base64,")
            .unwrap_or(&sprite.base64);
        let bytes = STANDARD.decode(base64_clean).map_err(|e| e.to_string())?;
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        images.push((sprite.name.clone(), img));
    }

    if images.is_empty() {
        return Err("No images to pack".to_string());
    }

    // Prepare rectangles for packing
    let mut rects_to_place = GroupedRectsToPlace::new();
    for (i, (_, img)) in images.iter().enumerate() {
        rects_to_place.push_rect(
            i,
            None,
            RectToInsert::new(
                img.width() + padding * 2,
                img.height() + padding * 2,
                1,
            ),
        );
    }

    // Try different bin sizes until we find one that fits
    let mut bin_size = 256u32;
    let max_size = 4096u32;

    let placements = loop {
        let mut target_bins = BTreeMap::new();
        target_bins.insert(0, TargetBin::new(bin_size, bin_size, 1));

        match pack_rects(
            &rects_to_place,
            &mut target_bins,
            &volume_heuristic,
            &contains_smallest_box,
        ) {
            Ok(placements) => break placements,
            Err(_) => {
                bin_size *= 2;
                if bin_size > max_size {
                    return Err("Images too large to pack into 4096x4096".to_string());
                }
            }
        }
    };

    // Find actual bounds
    let mut max_x = 0u32;
    let mut max_y = 0u32;

    for (_, (_, locations)) in placements.packed_locations() {
        let loc = &locations[0];
        max_x = max_x.max(loc.x() + loc.width());
        max_y = max_y.max(loc.y() + loc.height());
    }

    // Create output image
    let mut output = RgbaImage::new(max_x, max_y);
    let mut frames = BTreeMap::new();

    for (rect_id, (_, locations)) in placements.packed_locations() {
        let loc = &locations[0];
        let (name, img) = &images[*rect_id];

        let x = loc.x() + padding;
        let y = loc.y() + padding;
        let w = img.width();
        let h = img.height();

        // Copy image to atlas
        output.copy_from(&img.to_rgba8(), x, y).map_err(|e| e.to_string())?;

        // Add frame to JSON
        frames.insert(
            name.clone(),
            PhaserFrame {
                frame: FrameRect { x, y, w, h },
                rotated: false,
                trimmed: false,
                sprite_source_size: FrameRect { x: 0, y: 0, w, h },
                source_size: Size { w, h },
            },
        );
    }

    // Encode output image
    let mut buf = Cursor::new(Vec::new());
    output
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let image_base64 = format!("data:image/png;base64,{}", STANDARD.encode(buf.get_ref()));

    // Generate Phaser JSON
    let atlas = PhaserAtlas {
        frames,
        meta: PhaserMeta {
            image: "atlas.png".to_string(),
            size: Size { w: max_x, h: max_y },
            scale: 1,
        },
    };
    let json = serde_json::to_string_pretty(&atlas).map_err(|e| e.to_string())?;

    Ok(AtlasOutput { image_base64, json })
}
```

**Step 3: Add command to lib.rs**

Add to `src-tauri/src/lib.rs`:
```rust
mod atlas_packer;

use atlas_packer::{pack_atlas, SpriteInput, AtlasOutput};

#[command]
fn create_atlas(sprites: Vec<SpriteInput>, padding: u32) -> Result<AtlasOutput, String> {
    pack_atlas(sprites, padding)
}
```

Update `invoke_handler`:
```rust
.invoke_handler(tauri::generate_handler![
    load_image, remove_colors, split_image, save_image, create_atlas
])
```

**Step 4: Verify compilation**

Run:
```bash
cd /Volumes/T7/work/texturepack/src-tauri && cargo check
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add atlas packing with bin packing algorithm"
```

---

## Phase 5: Atlas Module - Frontend

### Task 12: Atlas Packer Component - Group Management

**Files:**
- Create: `src/components/AtlasPacker/index.tsx`
- Create: `src/components/AtlasPacker/styles.css`
- Modify: `src/App.tsx`

**Step 1: Create AtlasPacker component**

Create `src/components/AtlasPacker/index.tsx`:
```tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import "./styles.css";

interface SpriteFrame {
  id: string;
  name: string;
  base64: string;
}

interface Action {
  name: string;
  frames: SpriteFrame[];
}

interface Character {
  name: string;
  actions: Action[];
}

interface AtlasOutput {
  image_base64: string;
  json: string;
}

let frameIdCounter = 0;

export function AtlasPacker() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [atlasPreview, setAtlasPreview] = useState<string | null>(null);
  const [atlasJson, setAtlasJson] = useState<string | null>(null);
  const [padding, setPadding] = useState(2);
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set());
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  const addCharacter = () => {
    const name = prompt("输入人物名称:");
    if (!name) return;
    setCharacters([...characters, { name, actions: [] }]);
    setExpandedChars(new Set([...expandedChars, name]));
  };

  const addAction = (charIndex: number) => {
    const name = prompt("输入动作名称:");
    if (!name) return;
    const newChars = [...characters];
    newChars[charIndex].actions.push({ name, frames: [] });
    setCharacters(newChars);
    setExpandedActions(new Set([...expandedActions, `${charIndex}-${name}`]));
  };

  const addFrames = async (charIndex: number, actionIndex: number) => {
    const paths = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ["png"] }],
    });

    if (!paths || paths.length === 0) return;

    const newChars = [...characters];
    const action = newChars[charIndex].actions[actionIndex];

    for (const path of paths) {
      const data = await invoke<{ base64: string }>("load_image", { path });
      action.frames.push({
        id: `frame-${frameIdCounter++}`,
        name: path.split("/").pop() || "unknown",
        base64: data.base64,
      });
    }

    setCharacters(newChars);
  };

  const removeFrame = (charIndex: number, actionIndex: number, frameIndex: number) => {
    const newChars = [...characters];
    newChars[charIndex].actions[actionIndex].frames.splice(frameIndex, 1);
    setCharacters(newChars);
  };

  const removeAction = (charIndex: number, actionIndex: number) => {
    const newChars = [...characters];
    newChars[charIndex].actions.splice(actionIndex, 1);
    setCharacters(newChars);
  };

  const removeCharacter = (charIndex: number) => {
    setCharacters(characters.filter((_, i) => i !== charIndex));
  };

  const toggleChar = (name: string) => {
    const newSet = new Set(expandedChars);
    if (newSet.has(name)) newSet.delete(name);
    else newSet.add(name);
    setExpandedChars(newSet);
  };

  const toggleAction = (key: string) => {
    const newSet = new Set(expandedActions);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setExpandedActions(newSet);
  };

  const generateAtlas = async () => {
    const sprites: { name: string; base64: string }[] = [];

    characters.forEach((char) => {
      char.actions.forEach((action) => {
        action.frames.forEach((frame, frameIdx) => {
          sprites.push({
            name: `${char.name}_${action.name}_${frameIdx}`,
            base64: frame.base64,
          });
        });
      });
    });

    if (sprites.length === 0) {
      alert("没有可打包的图片");
      return;
    }

    const result = await invoke<AtlasOutput>("create_atlas", { sprites, padding });
    setAtlasPreview(result.image_base64);
    setAtlasJson(result.json);
  };

  const exportAtlas = async () => {
    if (!atlasPreview || !atlasJson) return;

    const dir = await open({ directory: true });
    if (!dir) return;

    await invoke("save_image", {
      base64Input: atlasPreview,
      path: `${dir}/atlas.png`,
    });

    await invoke("save_file", {
      content: atlasJson,
      path: `${dir}/atlas.json`,
    });

    alert(`已导出到 ${dir}`);
  };

  return (
    <div className="atlas-packer">
      <div className="toolbar">
        <button onClick={addCharacter}>+ 新建人物</button>
        <button onClick={generateAtlas} disabled={characters.length === 0}>
          生成 Atlas
        </button>
        <button onClick={exportAtlas} disabled={!atlasPreview}>
          导出 Atlas + JSON
        </button>
      </div>
      <div className="workspace">
        <div className="group-panel">
          <div className="group-tree">
            {characters.map((char, charIdx) => (
              <div key={char.name} className="tree-node">
                <div className="node-header" onClick={() => toggleChar(char.name)}>
                  <span className="toggle">
                    {expandedChars.has(char.name) ? "▼" : "▶"}
                  </span>
                  <span className="node-name">{char.name}</span>
                  <button
                    className="small-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      addAction(charIdx);
                    }}
                  >
                    + 动作
                  </button>
                  <button
                    className="small-btn danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCharacter(charIdx);
                    }}
                  >
                    ×
                  </button>
                </div>
                {expandedChars.has(char.name) && (
                  <div className="node-children">
                    {char.actions.map((action, actionIdx) => {
                      const actionKey = `${charIdx}-${action.name}`;
                      return (
                        <div key={action.name} className="tree-node">
                          <div
                            className="node-header"
                            onClick={() => toggleAction(actionKey)}
                          >
                            <span className="toggle">
                              {expandedActions.has(actionKey) ? "▼" : "▶"}
                            </span>
                            <span className="node-name">{action.name}</span>
                            <button
                              className="small-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                addFrames(charIdx, actionIdx);
                              }}
                            >
                              + 帧
                            </button>
                            <button
                              className="small-btn danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAction(charIdx, actionIdx);
                              }}
                            >
                              ×
                            </button>
                          </div>
                          {expandedActions.has(actionKey) && (
                            <div className="frame-list">
                              {action.frames.map((frame, frameIdx) => (
                                <div key={frame.id} className="frame-item">
                                  <img src={frame.base64} alt="" />
                                  <span className="frame-index">{frameIdx}</span>
                                  <button
                                    className="remove-frame"
                                    onClick={() =>
                                      removeFrame(charIdx, actionIdx, frameIdx)
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {characters.length === 0 && (
              <div className="empty-hint">点击"新建人物"开始</div>
            )}
          </div>
        </div>
        <div className="preview-panel">
          <div className="preview-header">
            <span>Atlas 预览</span>
            <label>
              Padding:
              <input
                type="number"
                min="0"
                max="10"
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
              />
              px
            </label>
          </div>
          <div className="preview-area">
            {atlasPreview ? (
              <img src={atlasPreview} alt="Atlas Preview" />
            ) : (
              <div className="preview-placeholder">
                添加图片后点击"生成 Atlas"预览
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create styles**

Create `src/components/AtlasPacker/styles.css`:
```css
.atlas-packer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.atlas-packer .toolbar {
  padding: 12px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  display: flex;
  gap: 8px;
}

.atlas-packer .toolbar button {
  padding: 8px 16px;
  background: #e94560;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
}

.atlas-packer .toolbar button:disabled {
  background: #444;
  cursor: not-allowed;
}

.atlas-packer .workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.group-panel {
  width: 320px;
  background: #16213e;
  border-right: 1px solid #0f3460;
  overflow-y: auto;
}

.group-tree {
  padding: 12px;
}

.tree-node {
  margin-bottom: 4px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.node-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.toggle {
  color: #666;
  font-size: 10px;
  width: 12px;
}

.node-name {
  flex: 1;
}

.small-btn {
  padding: 2px 8px;
  background: #0f3460;
  border: none;
  border-radius: 3px;
  color: #aaa;
  cursor: pointer;
  font-size: 11px;
}

.small-btn:hover {
  background: #1a5a9a;
  color: white;
}

.small-btn.danger:hover {
  background: #e94560;
}

.node-children {
  padding-left: 20px;
}

.frame-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 8px 8px 32px;
}

.frame-item {
  position: relative;
  width: 48px;
  height: 48px;
  background: #0a0a1a;
  border: 1px solid #333;
  border-radius: 4px;
  overflow: hidden;
}

.frame-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.frame-index {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 10px;
  background: rgba(0, 0, 0, 0.7);
  padding: 1px 4px;
  border-radius: 2px;
}

.remove-frame {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  background: rgba(233, 69, 96, 0.8);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 12px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
}

.frame-item:hover .remove-frame {
  display: flex;
}

.empty-hint {
  color: #666;
  font-size: 13px;
  text-align: center;
  padding: 40px;
}

.preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preview-header {
  padding: 12px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.preview-header label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #888;
}

.preview-header input[type="number"] {
  width: 50px;
  padding: 4px 8px;
  background: #0f3460;
  border: 1px solid #1a4a7a;
  border-radius: 4px;
  color: white;
  font-size: 13px;
}

.preview-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(45deg, #222 25%, transparent 25%),
    linear-gradient(-45deg, #222 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #222 75%),
    linear-gradient(-45deg, transparent 75%, #222 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: #2a2a2a;
  overflow: auto;
  padding: 20px;
}

.preview-area img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  color: #666;
  font-size: 14px;
}
```

**Step 3: Add save_file command to Rust**

Add to `src-tauri/src/lib.rs`:
```rust
#[command]
fn save_file(content: String, path: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(())
}
```

Update `invoke_handler`:
```rust
.invoke_handler(tauri::generate_handler![
    load_image, remove_colors, split_image, save_image, create_atlas, save_file
])
```

**Step 4: Update App.tsx**

```tsx
import { useState } from "react";
import { Preprocessor } from "./components/Preprocessor";
import { AtlasPacker } from "./components/AtlasPacker";
import "./App.css";

type Tab = "preprocess" | "atlas";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("preprocess");

  return (
    <div className="app">
      <nav className="tabs">
        <button
          className={activeTab === "preprocess" ? "active" : ""}
          onClick={() => setActiveTab("preprocess")}
        >
          预处理
        </button>
        <button
          className={activeTab === "atlas" ? "active" : ""}
          onClick={() => setActiveTab("atlas")}
        >
          Atlas 拼接
        </button>
      </nav>
      <main className="content">
        {activeTab === "preprocess" ? <Preprocessor /> : <AtlasPacker />}
      </main>
    </div>
  );
}

export default App;
```

**Step 5: Verify**

Run: `pnpm tauri dev`
Expected: Can create characters, add actions, add frames, generate and export atlas

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add AtlasPacker component with group management and export"
```

---

### Task 13: Import from Preprocessor

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AtlasPacker/index.tsx`

**Step 1: Add shared state for split images**

Update `src/App.tsx`:
```tsx
import { useState } from "react";
import { Preprocessor } from "./components/Preprocessor";
import { AtlasPacker } from "./components/AtlasPacker";
import "./App.css";

type Tab = "preprocess" | "atlas";

export interface ExportedFrame {
  base64: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("preprocess");
  const [exportedFrames, setExportedFrames] = useState<ExportedFrame[]>([]);

  const handleExportToAtlas = (frames: ExportedFrame[]) => {
    setExportedFrames(frames);
    setActiveTab("atlas");
  };

  return (
    <div className="app">
      <nav className="tabs">
        <button
          className={activeTab === "preprocess" ? "active" : ""}
          onClick={() => setActiveTab("preprocess")}
        >
          预处理
        </button>
        <button
          className={activeTab === "atlas" ? "active" : ""}
          onClick={() => setActiveTab("atlas")}
        >
          Atlas 拼接
        </button>
      </nav>
      <main className="content">
        {activeTab === "preprocess" ? (
          <Preprocessor onExportToAtlas={handleExportToAtlas} />
        ) : (
          <AtlasPacker importedFrames={exportedFrames} onClearImport={() => setExportedFrames([])} />
        )}
      </main>
    </div>
  );
}

export default App;
```

**Step 2: Update Preprocessor to support export to Atlas**

Add prop and button to `src/components/Preprocessor/index.tsx`:

Add to props:
```tsx
interface PreprocessorProps {
  onExportToAtlas?: (frames: { base64: string }[]) => void;
}

export function Preprocessor({ onExportToAtlas }: PreprocessorProps) {
```

Add button in toolbar (after export button):
```tsx
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
    onExportToAtlas(splitImages.map(base64 => ({ base64 })));
  }}>
    导出到 Atlas
  </button>
)}
```

**Step 3: Update AtlasPacker to handle imports**

Update `src/components/AtlasPacker/index.tsx`:

Add props:
```tsx
interface AtlasPackerProps {
  importedFrames?: { base64: string }[];
  onClearImport?: () => void;
}

export function AtlasPacker({ importedFrames, onClearImport }: AtlasPackerProps) {
```

Add useEffect to handle imports:
```tsx
import { useState, useEffect } from "react";

// Inside component, after state declarations:
useEffect(() => {
  if (importedFrames && importedFrames.length > 0) {
    // Prompt for character and action name
    const charName = prompt("输入人物名称:", "character") || "character";
    const actionName = prompt("输入动作名称:", "action") || "action";

    const newFrames = importedFrames.map((f, i) => ({
      id: `frame-${frameIdCounter++}`,
      name: `${i}.png`,
      base64: f.base64,
    }));

    const newChar: Character = {
      name: charName,
      actions: [{ name: actionName, frames: newFrames }],
    };

    setCharacters([...characters, newChar]);
    setExpandedChars(new Set([...expandedChars, charName]));
    setExpandedActions(new Set([...expandedActions, `${characters.length}-${actionName}`]));

    onClearImport?.();
  }
}, [importedFrames]);
```

**Step 4: Verify**

Run: `pnpm tauri dev`
Expected: Can export split images directly to Atlas module

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add export from Preprocessor to Atlas module"
```

---

## Phase 6: Final Polish

### Task 14: App Icon and Window Config

**Files:**
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Update window config**

In `src-tauri/tauri.conf.json`, update:
```json
{
  "productName": "Sprite Tool",
  "version": "1.0.0",
  "identifier": "com.spritetool.app",
  "app": {
    "windows": [
      {
        "title": "Sprite Tool - 精灵图处理工具",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ]
  }
}
```

**Step 2: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore: configure app window and metadata"
```

---

### Task 15: Build Production App

**Step 1: Build release**

Run:
```bash
cd /Volumes/T7/work/texturepack && pnpm tauri build
```
Expected: Creates `.dmg` file in `src-tauri/target/release/bundle/dmg/`

**Step 2: Test the built app**

Run:
```bash
open src-tauri/target/release/bundle/dmg/*.dmg
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: ready for release v1.0.0"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-3 | Project setup (Rust, Tauri, deps) |
| 2 | 4-6 | Preprocessor backend (load, color removal, split) |
| 3 | 7-10 | Preprocessor frontend (UI, color picker, split lines) |
| 4 | 11 | Atlas backend (bin packing) |
| 5 | 12-13 | Atlas frontend (groups, import) |
| 6 | 14-15 | Polish and build |

Total: 15 tasks
