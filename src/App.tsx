import { useState } from "react";
import { Preprocessor } from "./components/Preprocessor";
import { AtlasPacker } from "./components/AtlasPacker";
import { Compressor } from "./components/Compressor";
import "./App.css";

type Tab = "preprocess" | "atlas" | "compress";

export interface ExportedFrame {
  base64: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("preprocess");
  const [exportedFrames, setExportedFrames] = useState<ExportedFrame[]>([]);
  const [exportedAtlasImage, setExportedAtlasImage] = useState<string | null>(null);

  const handleExportToAtlas = (frames: ExportedFrame[]) => {
    setExportedFrames(frames);
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
        {activeTab === "preprocess" && (
          <Preprocessor onExportToAtlas={handleExportToAtlas} />
        )}
        {activeTab === "atlas" && (
          <AtlasPacker
            importedFrames={exportedFrames}
            onClearImport={() => setExportedFrames([])}
            onExportToCompress={handleExportToCompress}
          />
        )}
        {activeTab === "compress" && (
          <Compressor
            importedImage={exportedAtlasImage || undefined}
            onClearImport={() => setExportedAtlasImage(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
