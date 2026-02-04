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
