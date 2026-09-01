# BIT 乐学 OJ Exporter

一个用于导出北京理工大学乐学平台 OJ / Programming 题目的 Tampermonkey 用户脚本。

脚本可以复用当前浏览器已经登录的乐学会话，批量访问指定题目 ID，并将题目整理为适合阅读、归档以及交给 AI 分析的 Markdown 文件。

> 当前项目仍处于早期开发阶段，主要根据实际遇到的乐学 OJ 页面结构持续完善。

---

## 功能

目前支持：

- 复用浏览器当前的乐学登录状态
- 批量抓取 OJ 题目
- 支持单个题目 ID
- 支持多个离散 ID
- 支持连续 ID 范围
- 支持混合输入
- 每道题单独导出为 Markdown
- 提取题目：
  - 标题
  - 描述
  - 输入说明
  - 输出说明
  - 测试输入
  - 测试输出
  - 时间限制
  - 内存限制
  - 额外进程限制
- 下载题面中的真实图片到本地
- 自动将 Markdown 中的图片引用改为本地相对路径
- 识别乐学中由 WIRIS 渲染的数学公式
- 从 WIRIS 的 MathML 信息中恢复常见 LaTeX 公式
- 顺序抓取题目，避免短时间大量并发请求

---

## 示例

输入：

```text
538753
````

或者：

```text
538753,538754,538755
```

或者：

```text
538753-538760
```

也可以混合：

```text
538753,538760-538765,538800
```

脚本会依次访问：

```text
https://lexue.bit.edu.cn/mod/programming/view.php?id=538753
https://lexue.bit.edu.cn/mod/programming/view.php?id=538754
...
```

并将题目保存到你选择的本地目录。

---

## 输出结构

没有图片的题目：

```text
538753_猜数字看人品.md
```

包含图片的题目：

```text
538900_某道题.md

538900_assets/
├── image_1.png
├── image_2.jpg
└── ...
```

Markdown 中会使用本地相对路径：

```markdown
![样例解释](538900_assets/image_1.png)
```

因此只要 Markdown 和对应的 `assets` 目录一起保存，就不再依赖乐学中的原始图片 URL。

---

## Markdown 示例

导出的文件大致如下：

````markdown
# 猜数字看人品

- 题目 ID：538753
- 来源：https://lexue.bit.edu.cn/mod/programming/view.php?id=538753

## 描述

Tom 和 Jerry 做猜数字的游戏……

## 输入

游戏可能做很多次……

## 输出

对每一次游戏……

## 测试用例 1

### 测试输入

```text
5
too low
7
too high
6
right on
0
```

### 期待的输出

```text
Tom may be honest
```

- 时间限制：1秒
- 内存限制：1024KB
- 额外进程：0
````

---

# 安装

## 1. 安装 Tampermonkey

首先在 Chrome / Edge 等 Chromium 浏览器中安装 Tampermonkey。

项目目前依赖浏览器的 File System Access API，因此推荐使用较新的：

* Google Chrome
* Microsoft Edge

---

## 2. 安装脚本

打开 Tampermonkey：

1. 新建用户脚本
2. 删除默认内容
3. 粘贴本项目中的 `lexue-oj-exporter.user.js`
4. 保存脚本
5. 刷新乐学页面

脚本当前匹配：

```text
https://lexue.bit.edu.cn/*
```

---

# 使用方法

首先正常登录乐学：

```text
https://lexue.bit.edu.cn/
```

刷新页面后，右下角会出现：

```text
导出 OJ 题目
```

点击按钮。

---

## 第一步：选择保存目录

浏览器首先会弹出系统目录选择器。

选择题目 Markdown 和图片保存的位置。

例如：

```text
D:\SchoolWork\OJ
```

之所以必须先选择目录，是因为 Chrome 的 File System Access API 要求目录选择器必须直接由用户点击触发。

---

## 第二步：输入题目 ID

选择目录后，会弹出题目 ID 输入框。

### 单个 ID

```text
538753
```

### 多个 ID

```text
538753,538754,538755
```

### 连续范围

```text
538753-538760
```

### 混合

```text
538753,538760-538765,538800
```

重复 ID 会自动去重，并按照数值排序。

---

## 第三步：等待导出

脚本会按顺序：

```text
获取题目页面
↓
解析题面
↓
识别公式
↓
下载真实图片
↓
生成 Markdown
↓
保存到本地
```

浏览器控制台中也可以看到类似：

```text
[OJ Exporter] 1/5 正在处理 538753
[OJ Exporter] 完成：538753 → 538753_猜数字看人品.md
```

全部完成后会弹窗显示：

```text
处理完成。

成功：5
失败：0
```

---

# 登录认证原理

脚本不会保存你的乐学账号、密码或 Cookie。

它直接运行在：

```text
https://lexue.bit.edu.cn/
```

页面中，并通过：

```javascript
fetch(url, {
  credentials: 'include'
})
```

访问题目。

因此请求会自然携带当前浏览器已经登录乐学的会话信息。

整体过程相当于：

```text
正常登录乐学
↓
Tampermonkey 在乐学页面运行
↓
浏览器自己请求其他 OJ 页面
↓
脚本读取返回的 HTML
```

而不是：

```text
导出 Cookie
↓
在外部程序中模拟登录
↓
重新实现认证
```

如果登录状态过期，只需要正常重新登录乐学即可。

---

# 图片支持

乐学题面中的普通图片一般类似：

```html
<img
  src="https://lexue.bit.edu.cn/pluginfile.php/..."
  alt="样例解释">
```

脚本会：

1. 使用当前登录状态下载图片
2. 创建对应题目的 `assets` 目录
3. 保存图片
4. 将 Markdown 中的引用替换为本地相对路径

例如：

```text
538900_assets/image_1.png
```

Markdown：

```markdown
![样例解释](538900_assets/image_1.png)
```

如果图片下载失败，脚本目前会退回保留原始远程 URL，尽量避免直接丢失图片。

---

# 数学公式支持

乐学中的部分数学公式并不是 MathJax 或 KaTeX，而是由 WIRIS 公式编辑器生成的图片。

页面中可能类似：

```html
<img
  class="Wirisformula"
  role="math"
  data-mathml="..."
  src="data:image/svg+xml,...">
```

虽然网页最终显示的是 SVG 图片，但原始数学结构通常仍保存在：

```text
data-mathml
```

或者 SVG 内部的：

```text
<!--MathML: ... -->
```

中。

脚本会优先读取 MathML，并尽量恢复成 LaTeX。

例如：

```text
T
```

会导出为：

```markdown
$T$
```

上下标：

```text
aᵢ
```

会导出为类似：

```markdown
${a}_{i}$
```

约束：

```text
1 ≤ T ≤ 100
```

会导出为类似：

```markdown
$(1\le T\le100)$
```

---

# 当前公式支持情况

当前 MathML → LaTeX 转换器主要针对 OJ 题目中常见结构实现。

目前已处理：

* 普通变量
* 数字
* 运算符
* 上标
* 下标
* 同时包含上下标
* 分数
* 平方根
* n 次根
* 括号
* 常见关系运算符
* `mover`
* `munder`

例如：

```text
≤
≥
≠
×
÷
±
∞
∑
∏
√
∈
∉
→
⇒
```

等常见符号会转换成对应 LaTeX。

---

## 尚未完整覆盖

MathML 是一个很大的标准，目前转换器并不是完整实现。

以下结构可能仍然出现异常或格式不够理想：

* 矩阵
* 行列式
* 分段函数
* 多层复杂公式
* 特殊箭头
* 复杂积分
* 极限
* 复杂上下标组合
* 某些 WIRIS 特有输出
* 少见 MathML 标签

遇到新的公式结构时，可以根据实际页面中的 `data-mathml` 继续补充转换规则。

---

# 当前实现方式

项目目前是一个纯浏览器端 Tampermonkey 用户脚本，不依赖：

* Python
* Node.js
* 后端服务器
* 浏览器 Cookie 导出
* 外部数据库

主要依赖浏览器提供的：

```text
fetch
DOMParser
File System Access API
```

整体架构：

```text
Tampermonkey
│
├── ID Parser
│
├── fetch()
│   └── 复用浏览器登录状态
│
├── DOMParser
│
├── HTML → Markdown
│   ├── 普通文本
│   ├── 标题
│   ├── 列表
│   ├── 链接
│   ├── 图片
│   └── WIRIS MathML → LaTeX
│
├── 图片下载
│
└── File System Access API
    ├── 写入 Markdown
    └── 写入 assets
```

---

# 当前限制

## 1. 强依赖乐学当前 HTML 结构

脚本目前是根据实际观察到的乐学 OJ 页面开发的。

例如依赖：

```text
.description
.intro
.testcase-table
```

等 DOM 结构。

如果乐学未来更新页面模板，部分功能可能需要调整。

---

## 2. 只处理当前账号有权限访问的题目

脚本不会绕过：

* 登录
* 课程权限
* 题目权限
* 乐学本身的访问控制

如果浏览器本身无法正常访问某道题，脚本也无法导出。

---

## 3. 不建议大规模高速抓取

目前脚本使用顺序请求，并在题目之间加入短暂间隔。

设计目标是：

```text
导出自己的课程题目
```

而不是：

```text
高频扫描整个站点
```

请合理使用。

---

## 4. 浏览器兼容性

本项目使用：

```javascript
window.showDirectoryPicker()
```

因此需要支持 File System Access API 的浏览器。

推荐：

```text
Chrome
Edge
```

Firefox / Safari 当前可能无法直接使用完整的本地目录写入功能。

---

## 5. 图片与公式仍需继续测试

目前已经针对真实乐学页面测试过：

* 普通题面
* 测试样例
* `pluginfile.php` 图片
* WIRIS SVG 公式
* `data-mathml`

但不同教师、课程或者不同年代创建的题目，页面结构可能存在差异。

如果遇到无法正确导出的题目，可以在浏览器 DevTools 中检查对应元素的 HTML，并补充新的解析规则。

---

# 开发状态

当前可以大致视为：

```text
v1.x - 可用的早期版本
```

目前主要功能链已经跑通：

```text
批量 ID
✅

复用登录态
✅

题目正文
✅

测试输入输出
✅

本地 Markdown
✅

普通图片下载
✅

本地 assets
✅

WIRIS 公式识别
✅

基础 MathML → LaTeX
✅

完整 MathML 支持
🚧

完整 HTML → Markdown 转换
🚧

更多乐学页面兼容性
🚧

更完整的错误处理
🚧
```

---

# 可能的后续方向

后续可能继续加入：

* 更完整的 MathML → LaTeX 转换
* 更可靠的 HTML → Markdown 转换
* 导出进度 UI
* 取消批量任务
* 重试失败题目
* 已存在文件跳过 / 覆盖策略
* 自动记住上次保存目录
* 课程题目列表自动识别
* 从课程页面直接批量选择题目
* 导出题号、分值、开放时间等更多元数据
* JSON 输出
* 一键生成适合 AI Agent 使用的题目数据集
* GitHub 自动更新 userscript

---

# 隐私与安全

脚本：

* 不会上传你的账号信息
* 不会记录密码
* 不会导出 Cookie
* 不会向第三方服务器发送题目
* 不需要额外后端服务

所有操作均在浏览器本地完成。

题目内容是否可以公开、再分发或提交到第三方 AI 服务，仍应遵守课程、学校及题目来源方的相关规定。

---

# License

如果你准备将本项目作为开源项目发布，可以使用 MIT License。

---

## Disclaimer

本项目是一个非官方工具，与北京理工大学或乐学平台官方无关。

请仅用于你本人有正常访问权限的课程内容，并合理控制请求频率。
