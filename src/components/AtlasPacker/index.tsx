import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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
                    onClick={(e) => { e.stopPropagation(); addAction(charIdx); }}
                  >
                    + 动作
                  </button>
                  <button
                    className="small-btn danger"
                    onClick={(e) => { e.stopPropagation(); removeCharacter(charIdx); }}
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
                              onClick={(e) => { e.stopPropagation(); addFrames(charIdx, actionIdx); }}
                            >
                              + 帧
                            </button>
                            <button
                              className="small-btn danger"
                              onClick={(e) => { e.stopPropagation(); removeAction(charIdx, actionIdx); }}
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
                                    onClick={() => removeFrame(charIdx, actionIdx, frameIdx)}
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
