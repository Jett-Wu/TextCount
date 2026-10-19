# TextCount 界面精修任务：符号定位切换器 + 词云控件

> 这是一份独立任务书。仓库在 `C:\Users\yangj\Desktop\TextCount`。
> 目标：**只重新设计两个"能用但丑"的控件**，不改功能、不改计数逻辑、不新增依赖。

---

## 0. 项目与视觉基调（必读）

本地优先的纯前端文字统计工具。技术栈：Preact + TypeScript + 原生 CSS，**没有 CSS 框架、没有动画库、没有图标库**。
界面支持中 / 英 / 日 / 西 / 法 5 种语言。

视觉方向 **Calm Precision**：克制、安静、精确；系统字体；不靠阴影堆砌层次；动效 140–220ms，可中断；尊重 `prefers-reduced-motion`。

**硬性规则**

- 设计令牌唯一来源 `src/styles/tokens.css`，**只能用变量，不要写死颜色 / 字号 / 间距**。
  可用：`--surface`、`--surface-panel`、`--surface-hover`、`--surface-sunken`、`--border`、`--border-strong`、`--text`、`--text-muted`、`--accent`、`--accent-strong`、`--accent-soft`、`--accent-wash`、`--on-accent`、`--warn`、`--warn-soft`、`--shadow-sm`、`--radius-xs…--radius-pill`、`--space-1…--space-6`、`--size-control`、`--size-meta`、`--size-micro`、`--dur-tap`、`--dur-tab`、`--ease`
- 禁止：新增依赖、图标库、在线字体、任何外部请求。
- 正文与必要说明对比度 **≥ 4.5:1**（浅色、深色都要测）。
- 键盘可达、焦点清晰可见；`@media (pointer: coarse)` 下真实点击区 ≥ 44px，**不能靠重叠伪元素凑数**。
- `src/styles/app.css` 里**所有媒体查询必须留在文件最末尾**。写在基础规则之前会被源码顺序覆盖 —— 这个项目已经踩过两次。

---

## 1. 问题一：符号面板的「选中后逐处切换」

### 它是什么

「符号」工具列出正文中出现过的标点与符号。点某个符号会跳到它在正文中的第一处；选中之后出现一个切换器，可以前后翻到第 2、3…处并循环。

### 现在的实现

- JSX：`src/ui/InspectorPanel.tsx`
  - `navigation()` 函数在 **L138** 起
  - 高亮 chip 在 **L214**（`.chip--active`）与 **L255**（`.sym--active`）
- CSS：`src/styles/app.css`
  - **L1260** `.chip--active, .sym--active`
  - **L1270** `.chip-nav`
  - **L1276** `.chip-nav__position`
- 结构：`<span class="chip-nav">` 里放 `<button class="btn btn--icon">‹</button>` + `<span class="chip-nav__position">Match 1 of 4</span>` + `<button class="btn btn--icon">›</button>`，作为 chip 的**兄弟节点**插在可换行的 flex 行里。
- 文案：复用查找面板已有的 `search.prev` / `search.next` / `search.position`（5 语言都已有，**不要新增翻译键**）。

### 为什么丑（我的判断，你可以不同意，但必须解决这个问题）

1. 切换器用了带 1px 边框的 `.btn--icon`（32px 宽），比它服务的 chip 更"重" —— 喧宾夺主。
2. 英文文案是 `Match 1 of 4`，在 392px 侧栏里很长，把同一行的其他 chip 挤走，整组节奏被打断。
3. `‹` / 文字 / `›` 三个元素 + 4px 间距，读起来像一个**独立工具栏**，不像选中 chip 的附属物。
4. chip 的高亮只有"描边 + 淡底"，再加上旁边的切换器，视线有两个互相竞争的焦点。

### 期望

让切换器看起来是**选中 chip 的一部分**，而不是旁边多出来的一个控件；英文长度下也不能把行撑乱；键盘与触控可用性保持。

---

## 2. 问题二：词云上方的调整控件

### 它是什么

「分析 → 词云」上方一排控件：词数（20/30/40/60）、尺寸（S/M/L）、导出（PNG/SVG）。

### 现在的实现

- JSX：`src/ui/InsightsPanel.tsx` **L475–L530**
  - `.cloud-controls` → `.cloud-control` → `.cloud-control__label` + `.cloud-control__options` → `.cloud-option`
- CSS：`src/styles/app.css` **L1418** 起：`.cloud-controls`、`.cloud-control`、`.cloud-control__label`、`.cloud-control__options`、`.cloud-option`、`.cloud-option--on`、`.cloud-option:disabled`
- 当前样式：三组"灰色小标签 + 一排文字按钮"；选中项 = `--accent-soft` 底 + `--accent-strong` 字（13px）；**导出按钮与选择项用完全相同的样式**。

### 为什么丑

1. **选择器和动作按钮长得一模一样** —— `20/30/40`、`S/M/L` 是"选一个"，`PNG/SVG` 是"立刻下载文件"。视觉上无法区分，这是最严重的一处。
2. 标签与选项同字号同色，没有层级，整体像一张没排过的表单草稿。
3. 选中态太弱：淡紫底 + 紫字 + 13px，一眼看不出当前选的是哪个。
4. 392px 下换行成两行，三组宽度参差，节奏乱。
5. 距离下方画布只有 8px，控件与画布互相抢注意力。

### 期望

- **选择**与**动作**在视觉上明确分开（由你决定用什么手法）。
- 控件应当安静，画布才是主角。
- 5 种语言都不崩：英文 `Words / Size / Export`、日文 `語数 / サイズ / 書き出し` 都要看。

---

## 3. 绝对不能改坏的行为契约

### 符号切换器

- 点 chip 定位第 1 处；`‹` / `›` **双向循环**。
- 同一个符号会同时出现在「对应关系」和「分类统计」里 —— **任何时刻只能有一个切换器、一个高亮 chip**。
- 只出现一次的符号：能定位，但**不显示切换器**。
- 正文一改，旧的定位状态必须失效。

### 词云

- 词数改变 → 交给布局的**候选数**改变（不是"屏幕上词一定变多"，画布空间有限，放不下会如实报告）。
- 尺寸改变 → SVG `viewBox` 高度变（S/M/L = 220/300/420）。
- PNG 导出 = 画布 2 倍像素；SVG 导出 = 文字仍是 `<text>`，且**不含 `currentColor`**。
- 画布未就绪时导出按钮 disabled。

### 测试钩子

**你可以改类名，但必须同步改测试并保持覆盖等价。**现有钩子：

| 钩子 | 现状 |
|---|---|
| `.chip-nav` / `.chip-nav__position` | 后者带 `data-index` / `data-total` |
| `.chip--active` / `.sym--active` | 任何时刻恰好 1 个 |
| `data-testid="cloud-count" / "cloud-size" / "cloud-export"` | 控件分组 |
| `data-testid="cloud-placed"` | 带 `data-placed` / `data-total` |

测试文件：`tests/e2e/smoke.spec.ts`（符号相关约 L290–L362，词云相关约 L960–L1040）。

---

## 4. 交付要求

1. 修改 `src/ui/InspectorPanel.tsx`、`src/ui/InsightsPanel.tsx`、`src/styles/app.css`（必要时可动 `tokens.css`，但**不能留下未使用的令牌**）。
2. **前后对照截图**：
   - 视口：1440×900 与 390×844
   - 主题：浅色与深色各一套
   - 语言：5 种各一张（重点是英文与日文的文本长度是否会撑破布局）
   - 场景：符号面板选中出现 4 次的 `。`；词云面板默认状态
3. 跑检查：
   ```bash
   npm run check            # 类型 + 160 单测 + 构建
   npx playwright test      # Chromium E2E
   ```
   **跑 E2E 前先关掉自己手动启动的 `npm run preview`** —— Playwright 的 `reuseExistingServer` 会复用旧构建，导致新用例假失败。
4. 报告：改了什么、为什么这么改、截图路径、检查结果。**没跑过的检查不要写成通过。**

---

## 5. 可选方向（不限定，欢迎更好的方案）

- **符号切换器**：把位置计数做进 chip 内部（例如右下角角标 `2/4`），箭头只在 hover / focus 时淡入；或做成一枚贴在 chip 上的紧凑胶囊。
- **词云控件**：一行内「分段控件 + 图标按钮 + 原生 `title`」；或折叠成「词云设置」一行，点开才展开；导出用图标而非文字。
