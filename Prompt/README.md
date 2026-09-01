可以以此文件夹为工作目录，把题目下载到./Questions
在此文件夹下直接启动coding agent（最好有读图能力）即可让其按PROMPT.md要求生成参考答案。
注意修改PROMPT.md以改成你需要的语言。

## 归档题目和答案

右键运行 `Archive.ps1`，或在 PowerShell 中执行 `./Archive.ps1`，可以把 `Questions/` 和
`Sources/` 中的内容分别移动到 `_Archived/Questions/` 和 `_Archived/Sources/`。

- 执行前会显示待处理数量，并等待按 Enter 确认；输入 `Q` 可取消。
- 归档中存在同名文件或目录时，旧归档会被完整替换，并在界面中显示覆盖提示。
- 任意层级的 `.gitkeep` 均保留原位，不会被移动或删除。
