# TASK.md

## 任务信息

**任务：** T-001 — 按设计方案实现 TextCount P0 并按工作流初始化项目
**关联项目项：** R1、R2、R3、R4、R5、R6、S1、S2、S3、S5、S6、C1–C7
**风险：** 高（涉及计数正确性、Unicode 分类与隐私边界）
**状态：** 已完成

## 目标

交付一个可构建、可测试、可部署的静态 Web 应用：粘贴中英混排文本即可得到可信统计，可切换统计
口径、核对多个目标词语、检查全角/半角与中文标点；正文只在本地处理；同时按 `AGENT_WORKFLOW_CN.md`
建立 `AGENTS.md` / `PROJECT.md` / `TASK.md` / `DEVLOG.md` 四个管理文件。

## 边界

**任务范围内：**

- 纯计算层：统计引擎、Unicode/字素工具、字面量查找、标点分类、口径定义。
- 应用层：文本唯一副本与 revision 机制、按需 Worker 与调度、偏好持久化。
- P0 界面：非受控原生输入框、三个主数字、统计/查找/符号检查三个工具面板、中英双语、
  深浅色、响应式、微动效与 `prefers-reduced-motion`。
- 测试：Vitest 单元回归（含方案 §12.2 全部样例）、Playwright 冒烟用例。
- 工程：Vite 构建与 `/textcount/` 子路径、GitHub Actions CI 与 Pages 发布、四个管理文件、
  技术选型决策记录。

**任务范围外：**

- P1：段落长度分布、词频排行、词云（R7，明确不阻塞首版）。
- 任何正文转换、替换、自动纠正（C2 / N1）。
- 账户、云端、后端、埋点、AI（N2 / N3）。
- 在真实 GitHub Pages 上完成首次发布（本任务只准备到"可发布"，见"下一步"）。

## 验收条件

- [x] `npm run typecheck` 通过（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）。
- [x] `npm test` 全部通过，且覆盖方案 §12.2 的每一条回归样例。
- [x] `vite build` 成功，产物为纯静态资源，无外部运行时请求，首屏 JS gzip ≤ 120 KiB。
- [x] 浏览器实测：`你好 AI 2026` → 混合字数 4、字素字符数 10、不含空白 8。
- [x] 浏览器实测：100 万字符文本被完整精确统计，且 `longtask` 观测为 0 条。
- [x] 浏览器实测：查找 `aaaa` 中的 `aa` 为 2 处，定位后选区落在原文正确偏移。
- [x] 浏览器实测：半角/全角括号混用触发"存在不同形式"，`。` 单独出现不误报。
- [x] 浏览器实测：切换界面语言与统计口径后正文与选区不变。
- [x] 真实刷新后正文消失，`localStorage` 中不含正文。
- [x] 未引入无关修改。
- [x] 已完成高风险等级要求的审查（见"验证"）。

## 计划

1. 脚手架：`package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、Git 初始化。
2. 纯计算层与其单元测试（先于任何 UI）。
3. 应用层：文本唯一副本、revision、Worker 协议与调度。
4. 界面、样式、双语文案。
5. 真实浏览器验证（计数、查找、符号、大文本、响应式、语言/主题切换）。
6. 管理文件与 CI/部署。

## 当前状态

**已完成：**

- `src/core/` 五个模块（`count`、`unicode`、`search`、`symbols`、`rules`），无 DOM/框架/Node 依赖。
- `src/app/` 协调器：唯一文本副本、`revision` 过期结果丢弃、按需 Worker 与主线程回退。
- `src/ui/` 全部 P0 界面与 `src/styles/` 设计 Token；中英双语字典（类型强制同构）。
- 132 个 Vitest 单元测试全绿；构建产物 22.24 KiB gzip JS + 3.96 KiB gzip CSS。
- 真实 Chromium 中的功能与性能验证（数据见 `DEVLOG.md` D-006）。
- `AGENTS.md`、`PROJECT.md`、`DEVLOG.md`、`README.md`、`docs/decisions/0001-tech-stack.md`。
- GitHub Actions：`ci.yml`（类型 + 测试 + 构建 + 产物）与 `deploy.yml`（Pages 发布）。

**进行中：**

- 无。

**下一步：**

- 在真实 GitHub Pages 项目子路径 `/textcount/` 上完成首次发布，并在浏览器 Network 面板确认
  页面脚本、CSS、Worker 与按需 chunk 全部来自本站子路径；届时把 S4 从"部分完成"升级为"已验证"，
  并补一条 DEVLOG 条目记录实测的完整 URL 与降级点。

**阻塞项：**

- 无。

## 验证

- `npm run typecheck` → 通过（无输出）。
- `npm test`（Vitest 5.0.4）→ 通过，**132 passed / 4 files**。
- `npm run build` → 通过：`dist/index.html` 2.02 kB、`index.js` 60.86 kB（gzip 22.24 kB）、
  `index.css` 17.81 kB（gzip 3.96 kB）、`analysis.worker.js` 8.51 kB。
- `npm run check`（类型 + 测试 + 构建）→ 通过。
- 真实 Chromium（`vite preview`，`http://127.0.0.1:4173/textcount/`）人工与脚本检查 →
  计数、查找、符号检查、语言切换、主题切换、390 px 响应式、1,000,000 字符压力全部通过；
  测量数据记录在 `DEVLOG.md` D-006。
- 高风险项审查：计数口径与 Unicode 分类由 `tests/unit/count.test.ts`、`unicode.test.ts` 的
  边界样例覆盖（Emoji ZWJ、旗帜、肤色修饰符、CRLF、CJK 扩展 B、全角数字等）；符号分类的
  `mixed` 语义经专项复核并修正（DEVLOG D-004）；隐私边界由刷新验证与构建产物检查确认
  （无外部请求、`localStorage` 仅语言偏好）。

## 任务备注

- 本任务的详细决策与失败方案见 `DEVLOG.md` 的 D-001 至 D-007，不在本文件重复。
- 用户提供的中文方案原件保留在仓库根目录，文件名保持原样（含百分号编码），避免破坏既有引用。
