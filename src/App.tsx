import { useState } from "react";
import { Preprocessor } from "./components/Preprocessor";
import { AtlasPacker } from "./components/AtlasPacker";
import { Compressor } from "./components/Compressor";
import "./App.css";

type Tab = "preprocess" | "atlas" | "compress";

export interface ExportedFrame {
  base64: string;
}

export interface FrameWithAction {
  base64: string;
  actionName: string;
  frameIndex: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("preprocess");
  const [exportedFrames, setExportedFrames] = useState<ExportedFrame[]>([]);
  const [exportedFramesByAction, setExportedFramesByAction] = useState<FrameWithAction[] | undefined>(undefined);
  const [exportedAtlasImage, setExportedAtlasImage] = useState<string | null>(null);

  const handleExportToAtlas = (frames: ExportedFrame[], framesByAction?: FrameWithAction[]) => {
    setExportedFrames(frames);
    setExportedFramesByAction(framesByAction);
    setActiveTab("atlas");
  };

  const handleExportToCompress = (imageBase64: string) => {
    setExportedAtlasImage(imageBase64);
    setActiveTab("compress");
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
        <button
          className={activeTab === "compress" ? "active" : ""}
          onClick={() => setActiveTab("compress")}
        >
          压缩
        </button>
      </nav>
      <main className="content">
        <div style={{ display: activeTab === "preprocess" ? "contents" : "none" }}>
          <Preprocessor onExportToAtlas={handleExportToAtlas} />
        </div>
        <div style={{ display: activeTab === "atlas" ? "contents" : "none" }}>
          <AtlasPacker
            importedFrames={exportedFrames}
            importedFramesByAction={exportedFramesByAction}
            onClearImport={() => { setExportedFrames([]); setExportedFramesByAction(undefined); }}
            onExportToCompress={handleExportToCompress}
          />
        </div>
        <div style={{ display: activeTab === "compress" ? "contents" : "none" }}>
          <Compressor
            importedImage={exportedAtlasImage || undefined}
            onClearImport={() => setExportedAtlasImage(null)}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
