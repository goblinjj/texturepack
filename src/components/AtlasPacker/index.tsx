import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

interface SpriteFrame {
  id: string;
  name: string;
  base64: string;
  offsetX: number;
  offsetY: number;
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
  preRenderedFrames: string[]; // Pre-rendered frames with offset applied
  needsRerender: boolean; // Flag to trigger re-render when offsets change
}

interface SelectedFrame {
  charIndex: number;
  actionIndex: number;
  frameIndex: number;
}

let frameIdCounter = 0;

interface FrameWithAction {
  base64: string;
  actionName: string;
  frameIndex: number;
}

interface AtlasPackerProps {
  importedFrames?: { base64: string }[];
  importedFramesByAction?: FrameWithAction[];
  onClearImport?: () => void;
  onExportToCompress?: (imageBase64: string) => void;
}

export function AtlasPacker({ importedFrames, importedFramesByAction, onClearImport, onExportToCompress }: AtlasPackerProps) {
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

  // Selected frame for offset editing
  const [selectedFrame, setSelectedFrame] = useState<SelectedFrame | null>(null);

  // Column sync toggle for offset adjustment
  const [columnSyncEnabled, setColumnSyncEnabled] = useState(false);

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

        // Check if we have framesByAction data (from preprocessor with row/col info)
        if (importedFramesByAction && importedFramesByAction.length > 0) {
          // Group frames by action name
          const actionMap = new Map<string, { base64: string; frameIndex: number }[]>();
          for (const frame of importedFramesByAction) {
            if (!actionMap.has(frame.actionName)) {
              actionMap.set(frame.actionName, []);
            }
            actionMap.get(frame.actionName)!.push({
              base64: frame.base64,
              frameIndex: frame.frameIndex,
            });
          }

          // Sort frames within each action by frameIndex
          const actions: Action[] = [];
          for (const [actionName, frames] of actionMap) {
            frames.sort((a, b) => a.frameIndex - b.frameIndex);
            actions.push({
              name: actionName,
              frames: frames.map((f, i) => ({
                id: `frame-${frameIdCounter++}`,
                name: `${i}.png`,
                base64: f.base64,
                offsetX: 0,
                offsetY: 0,
              })),
            });
          }

          const newChar: Character = {
            name: charName,
            actions,
          };

          setCharacters((prev) => {
            const newChars = [...prev, newChar];
            const charIdx = newChars.length - 1;
            setExpandedChars(new Set([...expandedChars, charIdx]));
            const newExpandedActions = new Set(expandedActions);
            actions.forEach((_, actionIdx) => {
              newExpandedActions.add(`${charIdx}-${actionIdx}`);
            });
            setExpandedActions(newExpandedActions);
            return newChars;
          });

          onClearImport?.();
          return;
        }

        // Legacy flow: ask for action name
        const actionName = await showInputDialog("输入动作名称", "action");
        if (!actionName) {
          onClearImport?.();
          return;
        }

        const newFrames = importedFrames.map((f, i) => ({
          id: `frame-${frameIdCounter++}`,
          name: `${i}.png`,
          base64: f.base64,
          offsetX: 0,
          offsetY: 0,
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
  }, [importedFrames, importedFramesByAction]);

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
        offsetX: 0,
        offsetY: 0,
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

  const updateFrameOffset = (charIndex: number, actionIndex: number, frameIndex: number, offsetX: number, offsetY: number, syncColumn = false) => {
    setCharacters((prev) => {
      return prev.map((char, cIdx) => {
        if (cIdx !== charIndex) return char;
        return {
          ...char,
          actions: char.actions.map((action, aIdx) => {
            if (syncColumn) {
              // When column sync is enabled, update the same frame index across all actions
              return {
                ...action,
                frames: action.frames.map((frame, fIdx) => {
                  if (fIdx !== frameIndex) return frame;
                  return { ...frame, offsetX, offsetY };
                }),
              };
            } else {
              // Normal update: only update the specific frame in the specific action
              if (aIdx !== actionIndex) return action;
              return {
                ...action,
                frames: action.frames.map((frame, fIdx) => {
                  if (fIdx !== frameIndex) return frame;
                  return { ...frame, offsetX, offsetY };
                }),
              };
            }
          }),
        };
      });
    });
  };

  const selectFrame = (charIndex: number, actionIndex: number, frameIndex: number) => {
    setSelectedFrame({ charIndex, actionIndex, frameIndex });
  };

  const closeFrameEditor = () => {
    setSelectedFrame(null);
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
  const handleDragStart = (e: React.DragEvent, charIndex: number, actionIndex: number, frameIndex: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${charIndex}-${actionIndex}-${frameIndex}`);
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

  // Pre-render frames with offset applied to canvas
  const preRenderFrames = useCallback(async (frames: SpriteFrame[]): Promise<string[]> => {
    // Find the maximum dimensions needed (considering offsets)
    let maxWidth = 0;
    let maxHeight = 0;
    const images: HTMLImageElement[] = [];

    // Load all images first
    for (const frame of frames) {
      const img = new Image();
      img.src = frame.base64;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      images.push(img);

      // Calculate required canvas size (image size + max offset in either direction)
      const frameWidth = img.width + Math.abs(frame.offsetX) * 2;
      const frameHeight = img.height + Math.abs(frame.offsetY) * 2;
      maxWidth = Math.max(maxWidth, frameWidth);
      maxHeight = Math.max(maxHeight, frameHeight);
    }

    // Render each frame to canvas with offset pre-applied
    const renderedFrames: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const img = images[i];

      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = maxHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        renderedFrames.push(frame.base64);
        continue;
      }

      // Center the image, then apply offset
      const centerX = (maxWidth - img.width) / 2;
      const centerY = (maxHeight - img.height) / 2;
      ctx.drawImage(img, centerX + frame.offsetX, centerY + frame.offsetY);

      renderedFrames.push(canvas.toDataURL('image/png'));
    }

    return renderedFrames;
  }, []);

  // Animation preview handlers
  const startAnimation = useCallback(async (charIndex: number, actionIndex: number) => {
    const action = characters[charIndex]?.actions[actionIndex];
    if (!action || action.frames.length === 0) return;

    // Stop any existing animation
    if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current);
    }

    // Pre-render all frames with offsets applied
    const preRenderedFrames = await preRenderFrames(action.frames);

    setAnimPreview({
      charIndex,
      actionIndex,
      currentFrame: 0,
      isPlaying: true,
      fps: 12,
      preRenderedFrames,
      needsRerender: false,
    });
  }, [characters, preRenderFrames]);

  const stopAnimation = useCallback(() => {
    if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current);
      animIntervalRef.current = null;
    }
    setAnimPreview(null);
  }, []);

  const togglePlayPause = useCallback(() => {
    setAnimPreview((prev) => prev ? { ...prev, isPlaying: !prev.isPlaying } : null);
  }, []);

  const goToPrevFrame = useCallback(() => {
    if (!animPreview) return;
    const action = characters[animPreview.charIndex]?.actions[animPreview.actionIndex];
    if (!action || action.frames.length === 0) return;
    setAnimPreview((prev) => {
      if (!prev) return null;
      const prevFrame = (prev.currentFrame - 1 + action.frames.length) % action.frames.length;
      return { ...prev, currentFrame: prevFrame };
    });
  }, [animPreview, characters]);

  const goToNextFrame = useCallback(() => {
    if (!animPreview) return;
    const action = characters[animPreview.charIndex]?.actions[animPreview.actionIndex];
    if (!action || action.frames.length === 0) return;
    setAnimPreview((prev) => {
      if (!prev) return null;
      const nextFrame = (prev.currentFrame + 1) % action.frames.length;
      return { ...prev, currentFrame: nextFrame };
    });
  }, [animPreview, characters]);

  const setAnimationFps = useCallback((fps: number) => {
    setAnimPreview((prev) => prev ? { ...prev, fps } : null);
  }, []);

  // Update offset from animation preview and trigger re-render
  const updateAnimPreviewOffset = useCallback(async (deltaX: number, deltaY: number) => {
    if (!animPreview) return;

    const action = characters[animPreview.charIndex]?.actions[animPreview.actionIndex];
    if (!action) return;

    const frame = action.frames[animPreview.currentFrame];
    if (!frame) return;

    const newOffsetX = frame.offsetX + deltaX;
    const newOffsetY = frame.offsetY + deltaY;

    // Update the frame offset (with or without column sync)
    updateFrameOffset(
      animPreview.charIndex,
      animPreview.actionIndex,
      animPreview.currentFrame,
      newOffsetX,
      newOffsetY,
      columnSyncEnabled
    );

    // Mark that we need to re-render
    setAnimPreview((prev) => prev ? { ...prev, needsRerender: true } : null);
  }, [animPreview, characters, columnSyncEnabled, updateFrameOffset]);

  // Re-render frames when offsets change
  useEffect(() => {
    if (!animPreview?.needsRerender) return;

    const action = characters[animPreview.charIndex]?.actions[animPreview.actionIndex];
    if (!action || action.frames.length === 0) return;

    (async () => {
      const newPreRenderedFrames = await preRenderFrames(action.frames);
      setAnimPreview((prev) => prev ? {
        ...prev,
        preRenderedFrames: newPreRenderedFrames,
        needsRerender: false,
      } : null);
    })();
  }, [animPreview?.needsRerender, animPreview?.charIndex, animPreview?.actionIndex, characters, preRenderFrames]);

  // Keyboard shortcuts for animation preview
  useEffect(() => {
    if (!animPreview) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          updateAnimPreviewOffset(-1, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          updateAnimPreviewOffset(1, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          updateAnimPreviewOffset(0, -1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          updateAnimPreviewOffset(0, 1);
          break;
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case ',':
          e.preventDefault();
          goToPrevFrame();
          break;
        case '.':
          e.preventDefault();
          goToNextFrame();
          break;
        case 'Escape':
          e.preventDefault();
          stopAnimation();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [animPreview, updateAnimPreviewOffset, togglePlayPause, goToPrevFrame, goToNextFrame, stopAnimation]);

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

  const [isGenerating, setIsGenerating] = useState(false);

  const generateAtlas = async () => {
    const sprites: { name: string; base64: string; offsetX: number; offsetY: number }[] = [];

    characters.forEach((char) => {
      char.actions.forEach((action) => {
        action.frames.forEach((frame, frameIdx) => {
          sprites.push({
            name: `${char.name}_${action.name}_${frameIdx}`,
            base64: frame.base64,
            offsetX: frame.offsetX,
            offsetY: frame.offsetY,
          });
        });
      });
    });

    if (sprites.length === 0) {
      alert("没有可打包的图片");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await invoke<AtlasOutput>("create_atlas", { sprites, padding });
      setAtlasPreview(result.image_base64);
      setAtlasJson(result.json);
    } catch (error) {
      console.error("生成 Atlas 失败:", error);
      alert(`生成 Atlas 失败: ${error}`);
    } finally {
      setIsGenerating(false);
    }
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
        <button onClick={generateAtlas} disabled={characters.length === 0 || isGenerating}>
          {isGenerating ? "生成中..." : "生成 Atlas"}
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
                                  } ${
                                    selectedFrame?.charIndex === charIdx &&
                                    selectedFrame?.actionIndex === actionIdx &&
                                    selectedFrame?.frameIndex === frameIdx
                                      ? "selected"
                                      : ""
                                  }`}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, charIdx, actionIdx, frameIdx)}
                                  onDragOver={(e) => handleDragOver(e, frameIdx)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDrop(e, charIdx, actionIdx, frameIdx)}
                                  onDragEnd={handleDragEnd}
                                  onMouseUp={() => selectFrame(charIdx, actionIdx, frameIdx)}
                                >
                                  <img src={frame.base64} alt="" draggable={false} />
                                  <span className="frame-index">{frameIdx}</span>
                                  {(frame.offsetX !== 0 || frame.offsetY !== 0) && (
                                    <span className="offset-indicator" title={`偏移: ${frame.offsetX}, ${frame.offsetY}`}>
                                      ✦
                                    </span>
                                  )}
                                  <button
                                    className="remove-frame"
                                    onClick={(e) => { e.stopPropagation(); removeFrame(charIdx, actionIdx, frameIdx); }}
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
        {selectedFrame && (() => {
          const frame = characters[selectedFrame.charIndex]?.actions[selectedFrame.actionIndex]?.frames[selectedFrame.frameIndex];
          if (!frame) return null;
          return (
            <div className="frame-editor-panel">
              <div className="frame-editor-header">
                <span>帧偏移调整</span>
                <button className="close-btn" onClick={closeFrameEditor}>×</button>
              </div>
              <div className="frame-editor-preview">
                <div className="frame-preview-container">
                  <img
                    src={frame.base64}
                    alt=""
                    style={{ transform: `translate(${frame.offsetX}px, ${frame.offsetY}px)` }}
                  />
                  <div className="frame-crosshair" />
                </div>
              </div>
              <div className="frame-editor-controls">
                <div className="offset-control">
                  <label>X 偏移:</label>
                  <button onClick={() => updateFrameOffset(selectedFrame.charIndex, selectedFrame.actionIndex, selectedFrame.frameIndex, frame.offsetX - 1, frame.offsetY)}>-</button>
                  <input
                    type="number"
                    value={frame.offsetX}
                    onChange={(e) => updateFrameOffset(selectedFrame.charIndex, selectedFrame.actionIndex, selectedFrame.frameIndex, Number(e.target.value), frame.offsetY)}
                  />
                  <button onClick={() => updateFrameOffset(selectedFrame.charIndex, selectedFrame.actionIndex, selectedFrame.frameIndex, frame.offsetX + 1, frame.offsetY)}>+</button>
                </div>
                <div className="offset-control">
                  <label>Y 偏移:</label>
                  <button onClick={() => updateFrameOffset(selectedFrame.charIndex, selectedFrame.actionIndex, selectedFrame.frameIndex, frame.offsetX, frame.offsetY - 1)}>-</button>
                  <input
                    type="number"
                    value={frame.offsetY}
                    onChange={(e) => updateFrameOffset(selectedFrame.charIndex, selectedFrame.actionIndex, selectedFrame.frameIndex, frame.offsetX, Number(e.target.value))}
                  />
                  <button onClick={() => updateFrameOffset(selectedFrame.charIndex, selectedFrame.actionIndex, selectedFrame.frameIndex, frame.offsetX, frame.offsetY + 1)}>+</button>
                </div>
                <button
                  className="reset-btn"
                  onClick={() => updateFrameOffset(selectedFrame.charIndex, selectedFrame.actionIndex, selectedFrame.frameIndex, 0, 0)}
                >
                  重置
                </button>
              </div>
            </div>
          );
        })()}
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
      {animPreview && (() => {
        const currentFrameData = characters[animPreview.charIndex]?.actions[animPreview.actionIndex]?.frames[animPreview.currentFrame];
        return (
        <div className="dialog-overlay" onClick={stopAnimation}>
          <div className="anim-preview-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="anim-preview-header">
              <span>
                动画预览 - {characters[animPreview.charIndex]?.name} / {characters[animPreview.charIndex]?.actions[animPreview.actionIndex]?.name}
              </span>
              <button className="close-btn" onClick={stopAnimation}>×</button>
            </div>
            <div className="anim-preview-content">
              <div className="anim-frame-container">
                {animPreview.preRenderedFrames[animPreview.currentFrame] && (
                  <img
                    src={animPreview.preRenderedFrames[animPreview.currentFrame]}
                    alt=""
                  />
                )}
                <div className="anim-crosshair" />
              </div>
            </div>
            <div className="anim-preview-controls">
              <div className="playback-controls">
                <button className="frame-btn" onClick={goToPrevFrame} title="上一帧 (,)">⏮</button>
                <button className="play-pause-btn" onClick={togglePlayPause} title="播放/暂停 (空格)">
                  {animPreview.isPlaying ? '⏸' : '▶'}
                </button>
                <button className="frame-btn" onClick={goToNextFrame} title="下一帧 (.)">⏭</button>
              </div>
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
            <div className="anim-offset-controls">
              <div className="offset-row">
                <label>X:</label>
                <button onClick={() => updateAnimPreviewOffset(-1, 0)} title="← 快捷键">-</button>
                <span className="offset-value">{currentFrameData?.offsetX ?? 0}</span>
                <button onClick={() => updateAnimPreviewOffset(1, 0)} title="→ 快捷键">+</button>
                <label style={{ marginLeft: '16px' }}>Y:</label>
                <button onClick={() => updateAnimPreviewOffset(0, -1)} title="↑ 快捷键">-</button>
                <span className="offset-value">{currentFrameData?.offsetY ?? 0}</span>
                <button onClick={() => updateAnimPreviewOffset(0, 1)} title="↓ 快捷键">+</button>
              </div>
              <div className="sync-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={columnSyncEnabled}
                    onChange={(e) => setColumnSyncEnabled(e.target.checked)}
                  />
                  列同步（同步调整所有动作的相同帧）
                </label>
              </div>
              <div className="shortcut-hint">
                快捷键: ←→↑↓ 调整偏移 | 空格 播放/暂停 | , . 切换帧 | Esc 关闭
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
