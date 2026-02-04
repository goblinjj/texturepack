import { useState, useEffect, useRef, useCallback } from "react";
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

interface InputDialogState {
  isOpen: boolean;
  title: string;
  defaultValue: string;
  onConfirm: (value: string) => void;
}

interface DragState {
  charIndex: number;
  actionIndex: number;
  frameIndex: number;
}

interface AnimationPreview {
  charIndex: number;
  actionIndex: number;
  currentFrame: number;
  isPlaying: boolean;
  fps: number;
}

let frameIdCounter = 0;

interface AtlasPackerProps {
  importedFrames?: { base64: string }[];
  onClearImport?: () => void;
  onExportToCompress?: (imageBase64: string) => void;
}

export function AtlasPacker({ importedFrames, onClearImport, onExportToCompress }: AtlasPackerProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [atlasPreview, setAtlasPreview] = useState<string | null>(null);
  const [atlasJson, setAtlasJson] = useState<string | null>(null);
  const [padding, setPadding] = useState(2);
  const [expandedChars, setExpandedChars] = useState<Set<number>>(new Set());
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [inputDialog, setInputDialog] = useState<InputDialogState>({
    isOpen: false,
    title: "",
    defaultValue: "",
    onConfirm: () => {},
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Animation preview state
  const [animPreview, setAnimPreview] = useState<AnimationPreview | null>(null);
  const animIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (inputDialog.isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [inputDialog.isOpen]);

  const showInputDialog = (title: string, defaultValue: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setInputDialog({
        isOpen: true,
        title,
        defaultValue,
        onConfirm: (value) => {
          setInputDialog((prev) => ({ ...prev, isOpen: false }));
          resolve(value);
        },
      });
    });
  };

  const handleInputCancel = () => {
    setInputDialog((prev) => ({ ...prev, isOpen: false }));
    inputDialog.onConfirm("");
  };

  const handleInputConfirm = () => {
    const value = inputRef.current?.value || "";
    inputDialog.onConfirm(value);
  };

  useEffect(() => {
    if (importedFrames && importedFrames.length > 0) {
      (async () => {
        const charName = await showInputDialog("输入人物名称", "character");
        if (!charName) {
          onClearImport?.();
          return;
        }
        const actionName = await showInputDialog("输入动作名称", "action");
        if (!actionName) {
          onClearImport?.();
          return;
        }

        const newFrames = importedFrames.map((f, i) => ({
          id: `frame-${frameIdCounter++}`,
          name: `${i}.png`,
          base64: f.base64,
        }));

        const newChar: Character = {
          name: charName,
          actions: [{ name: actionName, frames: newFrames }],
        };

        setCharacters((prev) => {
          const newChars = [...prev, newChar];
          setExpandedChars(new Set([...expandedChars, newChars.length - 1]));
          setExpandedActions(new Set([...expandedActions, `${newChars.length - 1}-0`]));
          return newChars;
        });

        onClearImport?.();
      })();
    }
  }, [importedFrames]);

  const addCharacter = async () => {
    const name = await showInputDialog("输入人物名称", "");
    if (!name) return;
    setCharacters((prev) => {
      const newChars = [...prev, { name, actions: [] }];
      setExpandedChars(new Set([...expandedChars, newChars.length - 1]));
      return newChars;
    });
  };

  const addAction = async (charIndex: number) => {
    const name = await showInputDialog("输入动作名称", "");
    if (!name) return;
    setCharacters((prev) => {
      const newChars = prev.map((char, idx) => {
        if (idx !== charIndex) return char;
        return {
          ...char,
          actions: [...char.actions, { name, frames: [] }],
        };
      });
      setExpandedActions((prevActions) => new Set([...prevActions, `${charIndex}-${newChars[charIndex].actions.length - 1}`]));
      return newChars;
    });
  };

  const renameCharacter = async (charIndex: number) => {
    const currentName = characters[charIndex].name;
    const newName = await showInputDialog("重命名人物", currentName);
    if (!newName || newName === currentName) return;
    setCharacters((prev) => {
      const newChars = [...prev];
      newChars[charIndex].name = newName;
      return newChars;
    });
  };

  const renameAction = async (charIndex: number, actionIndex: number) => {
    const currentName = characters[charIndex].actions[actionIndex].name;
    const newName = await showInputDialog("重命名动作", currentName);
    if (!newName || newName === currentName) return;
    setCharacters((prev) => {
      const newChars = [...prev];
      newChars[charIndex].actions[actionIndex].name = newName;
      return newChars;
    });
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

  const toggleChar = (charIndex: number) => {
    const newSet = new Set(expandedChars);
    if (newSet.has(charIndex)) newSet.delete(charIndex);
    else newSet.add(charIndex);
    setExpandedChars(newSet);
  };

  const toggleAction = (key: string) => {
    const newSet = new Set(expandedActions);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setExpandedActions(newSet);
  };

  // Drag and drop handlers
  const handleDragStart = (charIndex: number, actionIndex: number, frameIndex: number) => {
    setDragState({ charIndex, actionIndex, frameIndex });
  };

  const handleDragOver = (e: React.DragEvent, frameIndex: number) => {
    e.preventDefault();
    setDragOverIndex(frameIndex);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, charIndex: number, actionIndex: number, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!dragState) return;
    if (dragState.charIndex !== charIndex || dragState.actionIndex !== actionIndex) return;
    if (dragState.frameIndex === targetIndex) return;

    setCharacters((prev) => {
      const newChars = prev.map((char, cIdx) => {
        if (cIdx !== charIndex) return char;
        return {
          ...char,
          actions: char.actions.map((action, aIdx) => {
            if (aIdx !== actionIndex) return action;
            const newFrames = [...action.frames];
            const [removed] = newFrames.splice(dragState.frameIndex, 1);
            newFrames.splice(targetIndex, 0, removed);
            return { ...action, frames: newFrames };
          }),
        };
      });
      return newChars;
    });

    setDragState(null);
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDragOverIndex(null);
  };

  // Animation preview handlers
  const startAnimation = useCallback((charIndex: number, actionIndex: number) => {
    const action = characters[charIndex]?.actions[actionIndex];
    if (!action || action.frames.length === 0) return;

    // Stop any existing animation
    if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current);
    }

    setAnimPreview({
      charIndex,
      actionIndex,
      currentFrame: 0,
      isPlaying: true,
      fps: 12,
    });
  }, [characters]);

  const stopAnimation = useCallback(() => {
    if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current);
      animIntervalRef.current = null;
    }
    setAnimPreview(null);
  }, []);

  const setAnimationFps = useCallback((fps: number) => {
    setAnimPreview((prev) => prev ? { ...prev, fps } : null);
  }, []);

  // Animation loop
  useEffect(() => {
    if (!animPreview?.isPlaying) return;

    const action = characters[animPreview.charIndex]?.actions[animPreview.actionIndex];
    if (!action || action.frames.length === 0) {
      stopAnimation();
      return;
    }

    animIntervalRef.current = window.setInterval(() => {
      setAnimPreview((prev) => {
        if (!prev) return null;
        const nextFrame = (prev.currentFrame + 1) % action.frames.length;
        return { ...prev, currentFrame: nextFrame };
      });
    }, 1000 / animPreview.fps);

    return () => {
      if (animIntervalRef.current) {
        clearInterval(animIntervalRef.current);
      }
    };
  }, [animPreview?.isPlaying, animPreview?.fps, animPreview?.charIndex, animPreview?.actionIndex, characters, stopAnimation]);

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
        {onExportToCompress && (
          <button
            onClick={() => atlasPreview && onExportToCompress(atlasPreview)}
            disabled={!atlasPreview}
          >
            导出到压缩
          </button>
        )}
      </div>
      <div className="workspace">
        <div className="group-panel">
          <div className="group-tree">
            {characters.map((char, charIdx) => (
              <div key={charIdx} className="tree-node">
                <div className="node-header" onClick={() => toggleChar(charIdx)}>
                  <span className="toggle">
                    {expandedChars.has(charIdx) ? "▼" : "▶"}
                  </span>
                  <span
                    className="node-name"
                    onDoubleClick={(e) => { e.stopPropagation(); renameCharacter(charIdx); }}
                    title="双击重命名"
                  >
                    {char.name}
                  </span>
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
                {expandedChars.has(charIdx) && (
                  <div className="node-children">
                    {char.actions.map((action, actionIdx) => {
                      const actionKey = `${charIdx}-${actionIdx}`;
                      return (
                        <div key={actionIdx} className="tree-node">
                          <div
                            className="node-header"
                            onClick={() => toggleAction(actionKey)}
                          >
                            <span className="toggle">
                              {expandedActions.has(actionKey) ? "▼" : "▶"}
                            </span>
                            <span
                              className="node-name"
                              onDoubleClick={(e) => { e.stopPropagation(); renameAction(charIdx, actionIdx); }}
                              title="双击重命名"
                            >
                              {action.name}
                            </span>
                            <span className="frame-count">({action.frames.length})</span>
                            {action.frames.length > 0 && (
                              <button
                                className="small-btn play-btn"
                                onClick={(e) => { e.stopPropagation(); startAnimation(charIdx, actionIdx); }}
                                title="预览动画"
                              >
                                ▶
                              </button>
                            )}
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
                                <div
                                  key={frame.id}
                                  className={`frame-item ${
                                    dragState?.charIndex === charIdx &&
                                    dragState?.actionIndex === actionIdx &&
                                    dragState?.frameIndex === frameIdx
                                      ? "dragging"
                                      : ""
                                  } ${
                                    dragOverIndex === frameIdx &&
                                    dragState?.charIndex === charIdx &&
                                    dragState?.actionIndex === actionIdx
                                      ? "drag-over"
                                      : ""
                                  }`}
                                  draggable
                                  onDragStart={() => handleDragStart(charIdx, actionIdx, frameIdx)}
                                  onDragOver={(e) => handleDragOver(e, frameIdx)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDrop(e, charIdx, actionIdx, frameIdx)}
                                  onDragEnd={handleDragEnd}
                                >
                                  <img src={frame.base64} alt="" draggable={false} />
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
      {inputDialog.isOpen && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-title">{inputDialog.title}</div>
            <input
              ref={inputRef}
              type="text"
              className="dialog-input"
              defaultValue={inputDialog.defaultValue}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInputConfirm();
                if (e.key === "Escape") handleInputCancel();
              }}
            />
            <div className="dialog-buttons">
              <button onClick={handleInputCancel}>取消</button>
              <button className="primary" onClick={handleInputConfirm}>确定</button>
            </div>
          </div>
        </div>
      )}
      {animPreview && (
        <div className="dialog-overlay" onClick={stopAnimation}>
          <div className="anim-preview-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="anim-preview-header">
              <span>
                动画预览 - {characters[animPreview.charIndex]?.name} / {characters[animPreview.charIndex]?.actions[animPreview.actionIndex]?.name}
              </span>
              <button className="close-btn" onClick={stopAnimation}>×</button>
            </div>
            <div className="anim-preview-content">
              {(() => {
                const action = characters[animPreview.charIndex]?.actions[animPreview.actionIndex];
                const frame = action?.frames[animPreview.currentFrame];
                return frame ? (
                  <img src={frame.base64} alt="" />
                ) : null;
              })()}
            </div>
            <div className="anim-preview-controls">
              <label>
                FPS:
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={animPreview.fps}
                  onChange={(e) => setAnimationFps(Number(e.target.value))}
                />
                <span>{animPreview.fps}</span>
              </label>
              <span className="frame-indicator">
                帧: {animPreview.currentFrame + 1} / {characters[animPreview.charIndex]?.actions[animPreview.actionIndex]?.frames.length || 0}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
