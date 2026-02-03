import { useState } from "react";
import { Preprocessor } from "./components/Preprocessor";
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
          <Preprocessor />
        ) : (
          <div>Atlas 模块</div>
        )}
      </main>
    </div>
  );
}

export default App;
