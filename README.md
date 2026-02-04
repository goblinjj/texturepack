# Sprite Tool - 精灵图处理工具

一个用于游戏开发的精灵图处理桌面应用，支持图片预处理、Atlas 图集生成和图片压缩。

## 功能特性

### 预处理模块

- **图片加载** - 支持 PNG、JPG 格式
- **颜色消除** - 点击拾取颜色，一键消除背景色
  - 支持多次消除（处理多色背景）
  - 可调节容差值 (0-100)
  - 实时预览效果
- **图片分割** - 按行列数分割图片
  - 自动生成等分线
  - 拖动微调分割线位置
  - 边界线显示裁剪区域（黑色遮罩表示丢弃区域）
  - 导出为序号命名的 PNG 文件

### Atlas 拼接模块

- **层级管理** - 人物 > 动作 > 帧 的分组结构
- **帧排序** - 拖拽帧图片调整顺序
- **帧偏移调整** - 点击帧打开偏移编辑器，微调每帧的位置
- **动画预览** - 播放帧动画预览效果，支持 FPS 调节
- **重命名** - 双击人物或动作名称可重命名
- **紧密排列** - MaxRects bin packing 算法，最大化空间利用
- **Padding 设置** - 防止纹理采样边缘问题
- **Phaser 兼容** - 导出 JSON Hash 格式，可直接用于 Phaser 游戏引擎

### 压缩模块

- **质量压缩** - PNG 有损压缩，可调节质量 (10-100)
- **分辨率缩放** - 等比缩放 (10%-100%)，使用 Lanczos3 算法
- **实时预览** - 左右对比原图和压缩效果
- **文件大小对比** - 显示原始/压缩后大小和节省比例
- **多入口** - 从 Atlas 模块导入或直接打开文件

## 安装

### 下载

从 [Releases](https://github.com/goblinjj/texturepack/releases) 页面下载对应系统的安装包：

- **macOS (Apple Silicon)**: `Sprite-Tool-vx.x.x-aarch64-apple-darwin.dmg`
- **macOS (Intel)**: `Sprite-Tool-vx.x.x-x86_64-apple-darwin.dmg`

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/goblinjj/texturepack.git
cd texturepack

# 安装依赖
pnpm install

# 开发模式运行
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```

## 使用方法

### 预处理工作流

1. 点击 **打开图片** 加载素材图
2. 点击 **+ 点击图片添加颜色** 进入拾色模式
3. 点击图片上的背景色，该颜色会被消除（变透明）
4. 调节容差滑块微调消除范围
5. 设置 **行数** 和 **列数** 进行分割
6. 拖动边界线调整裁剪区域，拖动内部分割线微调位置
7. 点击 **导出分割图** 保存到本地，或点击 **导出到 Atlas** 直接进入拼接模块

### Atlas 拼接工作流

1. 点击 **+ 新建人物** 创建角色分组
2. 点击 **+ 动作** 添加动作（如 walk、run、idle）
3. 点击 **+ 帧** 导入该动作的帧图片
4. 拖动帧图片调整顺序
5. 点击帧图片打开偏移编辑器，微调位置
6. 点击动作旁的 **▶** 按钮预览动画效果
7. 设置 **Padding** 值（推荐 2px）
8. 点击 **生成 Atlas** 预览效果
9. 点击 **导出 Atlas + JSON** 保存文件
10. 或点击 **导出到压缩** 进入压缩模块

### 压缩工作流

1. 从 Atlas 模块点击 **导出到压缩**，或直接点击 **打开图片**
2. 调节 **质量** 滑块 (10-100)，数值越低压缩率越高
3. 调节 **缩放** 滑块 (10%-100%) 调整输出分辨率
4. 实时查看压缩预览和文件大小对比
5. 点击 **导出压缩图** 保存文件

### 输出格式

**atlas.json** (Phaser JSON Hash 格式):

```json
{
  "frames": {
    "player_walk_0": {
      "frame": { "x": 0, "y": 0, "w": 32, "h": 48 },
      "sourceSize": { "w": 32, "h": 48 },
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 48 },
      "pivot": { "x": 0.5, "y": 0.5 },
      "offset": { "x": 0, "y": -2 }
    },
    "player_walk_1": { "..." }
  },
  "meta": {
    "image": "atlas.png",
    "size": { "w": 256, "h": 128 },
    "scale": 1
  }
}
```

**在 Phaser 中使用**:

```javascript
// 加载
this.load.atlas('sprites', 'atlas.png', 'atlas.json');

// 创建动画
this.anims.create({
  key: 'player_walk',
  frames: this.anims.generateFrameNames('sprites', {
    prefix: 'player_walk_',
    start: 0,
    end: 3
  }),
  frameRate: 10,
  repeat: -1
});

// 播放
this.player.play('player_walk');

// 使用偏移量（如果需要）
const frameData = this.textures.getFrame('sprites', 'player_walk_0').customData;
// frameData.offset.x, frameData.offset.y
```

## 截图

| 预处理 | Atlas 拼接 | 压缩 |
|--------|-----------|------|
| 颜色消除 + 图片分割 | 帧管理 + 动画预览 | 质量 + 分辨率压缩 |

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **后端**: Tauri 2.x (Rust)
- **图像处理**: image crate, imagequant (Rust)
- **Bin Packing**: rectangle-pack crate (Rust)

## 开发

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装依赖
pnpm install

# 启动开发服务器
pnpm tauri dev
```

## License

MIT
