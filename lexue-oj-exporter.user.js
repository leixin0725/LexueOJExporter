// ==UserScript==
// @name         BIT 乐学 OJ 批量题目导出 Markdown
// @namespace    https://lexue.bit.edu.cn/
// @version      1.1.0
// @description  批量抓取乐学 OJ 题目，导出 Markdown、图片与公式
// @match        https://lexue.bit.edu.cn/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // =========================================================
  // 1. 基础工具
  // =========================================================

  function cleanText(text = '') {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/↵/g, '')
      .trim();
  }

  function preserveHtmlText(element) {
    if (!element) {
      return '';
    }

    let html = element.innerHTML;

    // 保留换行
    html = html.replace(/<br\s*\/?>/gi, '\n');

    // 保留 HTML 空格
    html = html.replace(/&nbsp;/gi, ' ');

    // 去除标签
    html = html.replace(/<[^>]*>/g, '');

    // 解码剩余实体
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;

    return textarea.value
      .replace(/↵/g, '');
  }
  
  function sanitizeFileName(name) {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseIds(input) {
    const ids = new Set();

    for (const partRaw of input.split(',')) {
      const part = partRaw.trim();

      if (!part) {
        continue;
      }

      // 单个 ID，例如：
      // 538753
      if (/^\d+$/.test(part)) {
        ids.add(Number(part));
        continue;
      }

      // 范围，例如：
      // 538753-538760
      const match = part.match(
        /^(\d+)\s*-\s*(\d+)$/
      );

      if (match) {
        const start = Number(match[1]);
        const end = Number(match[2]);

        if (end < start) {
          throw new Error(
            `非法范围：${part}`
          );
        }

        if (end - start > 1000) {
          throw new Error(
            `范围过大：${part}`
          );
        }

        for (
          let id = start;
          id <= end;
          id++
        ) {
          ids.add(id);
        }

        continue;
      }

      throw new Error(
        `无法识别：${part}`
      );
    }

    return [...ids].sort(
      (a, b) => a - b
    );
  }

  // =========================================================
  // 2. 请求网页
  // =========================================================

  async function fetchProblemHtml(id) {
    const url =
      `/mod/programming/view.php?id=${id}`;

    const response = await fetch(
      url,
      {
        credentials: 'include',
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.text();
  }

  // =========================================================
  // 3. WIRIS / MathML → LaTeX
  // =========================================================

  function decodeWirisMathML(raw) {
    if (!raw) {
      return '';
    }

    return raw
      // WIRIS 在 data-mathml 中使用这些特殊字符
      // 来代替 < > "
      .replace(/«/g, '<')
      .replace(/»/g, '>')
      .replace(/¨/g, '"')

      // WIRIS 有时会把实体：
      // &#8804;
      // 写成：
      // §#8804;
      .replace(/§#/g, '&#');
  }

  function extractMathMLFromSvgDataUrl(src) {
    if (
      !src ||
      !src.startsWith(
        'data:image/svg+xml'
      )
    ) {
      return '';
    }

    try {
      const commaIndex =
        src.indexOf(',');

      if (commaIndex === -1) {
        return '';
      }

      const encoded =
        src.slice(commaIndex + 1);

      const svg =
        decodeURIComponent(encoded);

      // WIRIS SVG 中存在：
      //
      // <!--MathML: <math>...</math>-->
      const match = svg.match(
        /<!--\s*MathML:\s*([\s\S]*?)-->/
      );

      return match
        ? match[1].trim()
        : '';
    } catch {
      return '';
    }
  }

  function mathOperatorToLatex(text) {
    const map = {
      '≤': '\\le',
      '≥': '\\ge',
      '≠': '\\ne',
      '×': '\\times',
      '÷': '\\div',
      '±': '\\pm',
      '∞': '\\infty',
      '∑': '\\sum',
      '∏': '\\prod',
      '√': '\\sqrt',
      '∈': '\\in',
      '∉': '\\notin',
      '→': '\\to',
      '←': '\\leftarrow',
      '⇒': '\\Rightarrow',
      '⇔': '\\Leftrightarrow',
      '∧': '\\land',
      '∨': '\\lor'
    };

    return map[text] ?? text;
  }

  function mathMLNodeToLatex(node) {
    if (!node) {
      return '';
    }

    // 文本节点。
    if (
      node.nodeType === Node.TEXT_NODE
    ) {
      return node.textContent ?? '';
    }

    if (
      node.nodeType !==
      Node.ELEMENT_NODE
    ) {
      return '';
    }

    const tag =
      node.tagName.toLowerCase();

    const children = () =>
      [...node.childNodes]
        .map(mathMLNodeToLatex)
        .join('');

    switch (tag) {
      case 'math':
      case 'mrow':
      case 'semantics':
        return children();

      case 'mi':
      case 'mn':
      case 'mtext':
        return cleanText(
          node.textContent ?? ''
        );

      case 'mo':
        return mathOperatorToLatex(
          cleanText(
            node.textContent ?? ''
          )
        );

      case 'msub': {
        const [base, sub] =
          [...node.children];

        return (
          `{${mathMLNodeToLatex(base)}}` +
          `_{${mathMLNodeToLatex(sub)}}`
        );
      }

      case 'msup': {
        const [base, sup] =
          [...node.children];

        return (
          `{${mathMLNodeToLatex(base)}}` +
          `^{${mathMLNodeToLatex(sup)}}`
        );
      }

      case 'msubsup': {
        const [base, sub, sup] =
          [...node.children];

        return (
          `{${mathMLNodeToLatex(base)}}` +
          `_{${mathMLNodeToLatex(sub)}}` +
          `^{${mathMLNodeToLatex(sup)}}`
        );
      }

      case 'mfrac': {
        const [num, den] =
          [...node.children];

        return (
          `\\frac{` +
          `${mathMLNodeToLatex(num)}}` +
          `{${mathMLNodeToLatex(den)}}`
        );
      }

      case 'msqrt':
        return (
          `\\sqrt{${children()}}`
        );

      case 'mroot': {
        const [value, index] =
          [...node.children];

        return (
          `\\sqrt[` +
          `${mathMLNodeToLatex(index)}]` +
          `{${mathMLNodeToLatex(value)}}`
        );
      }

      case 'mfenced': {
        const open =
          node.getAttribute('open') ??
          '(';

        const close =
          node.getAttribute('close') ??
          ')';

        const separator =
          node.getAttribute(
            'separators'
          ) ?? ',';

        const parts =
          [...node.children].map(
            mathMLNodeToLatex
          );

        return (
          open +
          parts.join(separator) +
          close
        );
      }

      case 'mover': {
        const [base, over] =
          [...node.children];

        const overText =
          cleanText(
            over?.textContent ?? ''
          );

        if (overText === '¯') {
          return (
            `\\overline{` +
            `${mathMLNodeToLatex(base)}}`
          );
        }

        return (
          `\\overset{` +
          `${mathMLNodeToLatex(over)}}` +
          `{${mathMLNodeToLatex(base)}}`
        );
      }

      case 'munder': {
        const [base, under] =
          [...node.children];

        return (
          `\\underset{` +
          `${mathMLNodeToLatex(under)}}` +
          `{${mathMLNodeToLatex(base)}}`
        );
      }

      default:
        // 对暂未专门处理的 MathML 标签，
        // 至少继续处理子节点。
        return children();
    }
  }

  function mathMLToLatex(mathml) {
    if (!mathml) {
      return '';
    }

    try {
      const normalized =
        decodeWirisMathML(mathml);

      const doc =
        new DOMParser().parseFromString(
          normalized,
          'application/xml'
        );

      // XML 解析失败。
      if (
        doc.querySelector(
          'parsererror'
        )
      ) {
        return '';
      }

      const root =
        doc.documentElement;

      return mathMLNodeToLatex(
        root
      )
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return '';
    }
  }

  function getWirisLatex(img) {
    // 优先使用 data-mathml。
    let mathml =
      img.getAttribute(
        'data-mathml'
      ) ?? '';

    // 有些 WIRIS 图片没有 data-mathml，
    // 但 MathML 藏在 SVG 注释里。
    if (!mathml) {
      mathml =
        extractMathMLFromSvgDataUrl(
          img.src
        );
    }

    const latex =
      mathMLToLatex(mathml);

    if (latex) {
      return latex;
    }

    // 实在无法转换时，
    // 至少保留 alt。
    return cleanText(
      img.alt ?? ''
    );
  }

  function isWirisFormula(img) {
    if (
      img.classList.contains(
        'Wirisformula'
      )
    ) {
      return true;
    }

    if (
      img.getAttribute('role') ===
      'math'
    ) {
      return true;
    }

    if (
      img.hasAttribute(
        'data-mathml'
      )
    ) {
      return true;
    }

    // 有些 WIRIS 公式没有 class，
    // 但 SVG 内部仍包含 MathML。
    if (
      img.src?.startsWith(
        'data:image/svg+xml'
      )
    ) {
      const mathml =
        extractMathMLFromSvgDataUrl(
          img.src
        );

      return Boolean(mathml);
    }

    return false;
  }

  // =========================================================
  // 4. HTML 正文 → Markdown
  // =========================================================

  function escapeMarkdownText(text) {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/↵/g, '');
  }

  function nodeToMarkdown(
    node,
    context
  ) {
    if (
      node.nodeType ===
      Node.TEXT_NODE
    ) {
      return escapeMarkdownText(
        node.textContent ?? ''
      );
    }

    if (
      node.nodeType !==
      Node.ELEMENT_NODE
    ) {
      return '';
    }

    const tag =
      node.tagName.toLowerCase();

    const children = () =>
      [...node.childNodes]
        .map(child =>
          nodeToMarkdown(
            child,
            context
          )
        )
        .join('');

    // =====================================================
    // 图片 / 公式
    // =====================================================

    if (tag === 'img') {
      if (isWirisFormula(node)) {
        const latex =
          getWirisLatex(node);

        return latex
          ? `$${latex}$`
          : '';
      }

      // 真正的图片。
      const src =
        node.getAttribute('src');

      if (!src) {
        return '';
      }

      const index =
        context.images.length + 1;

      const alt =
        cleanText(
          node.getAttribute(
            'alt'
          ) ?? ''
        ) ||
        `题目图片 ${index}`;

      const placeholder =
        `__OJ_IMAGE_${index}__`;

      context.images.push({
        index,
        src,
        alt,
        placeholder
      });

      return (
        `![${alt}]` +
        `(${placeholder})`
      );
    }

    // =====================================================
    // 块级元素
    // =====================================================

    if (
      /^h[1-6]$/.test(tag)
    ) {
      const level =
        Number(tag[1]);

      const content =
        children().trim();

      return (
        `\n\n${'#'.repeat(level)} ` +
        `${content}\n\n`
      );
    }

    if (tag === 'p') {
      const content =
        children().trim();

      return content
        ? `\n\n${content}\n\n`
        : '\n\n';
    }

    if (tag === 'div') {
      return children();
    }

    if (tag === 'br') {
      return '\n';
    }

    if (tag === 'hr') {
      return '\n\n---\n\n';
    }

    // =====================================================
    // 行内格式
    // =====================================================

    if (
      tag === 'strong' ||
      tag === 'b'
    ) {
      const content =
        children().trim();

      return content
        ? `**${content}**`
        : '';
    }

    if (
      tag === 'em' ||
      tag === 'i'
    ) {
      const content =
        children().trim();

      return content
        ? `*${content}*`
        : '';
    }

    if (tag === 'code') {
      return (
        `\`${children().trim()}\``
      );
    }

    if (tag === 'pre') {
      return (
        `\n\n\`\`\`text\n` +
        `${node.innerText.trim()}\n` +
        `\`\`\`\n\n`
      );
    }

    // =====================================================
    // 列表
    // =====================================================

    if (
      tag === 'ul' ||
      tag === 'ol'
    ) {
      const ordered =
        tag === 'ol';

      const items =
        [...node.children]
          .filter(
            el =>
              el.tagName.toLowerCase() ===
              'li'
          )
          .map((li, index) => {
            const content =
              [...li.childNodes]
                .map(child =>
                  nodeToMarkdown(
                    child,
                    context
                  )
                )
                .join('')
                .trim();

            const marker =
              ordered
                ? `${index + 1}.`
                : '-';

            return (
              `${marker} ${content}`
            );
          });

      return (
        `\n\n${items.join('\n')}\n\n`
      );
    }

    // =====================================================
    // 链接
    // =====================================================

    if (tag === 'a') {
      const content =
        children().trim();

      const href =
        node.getAttribute('href');

      if (
        !href ||
        href.startsWith(
          'javascript:'
        )
      ) {
        return content;
      }

      try {
        const absolute =
          new URL(
            href,
            location.origin
          ).href;

        return (
          `[${content}](${absolute})`
        );
      } catch {
        return content;
      }
    }

    // =====================================================
    // 其它标签：
    // 默认保留内部内容
    // =====================================================

    return children();
  }

  function htmlElementToMarkdown(
    element,
    context
  ) {
    let result =
      [...element.childNodes]
        .map(node =>
          nodeToMarkdown(
            node,
            context
          )
        )
        .join('');

    // 清理大量空行。
    result = result
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return result;
  }

  // =========================================================
  // 5. 解析题目
  // =========================================================

  function parseProblem(id, html) {
    const doc =
      new DOMParser()
        .parseFromString(
          html,
          'text/html'
        );

    const root =
      doc.querySelector(
        '.description'
      );

    if (!root) {
      throw new Error(
        '没有找到题面区域，可能未登录、无权限，或者这个 ID 不是 OJ 题目'
      );
    }

    // =====================================================
    // 标题
    // =====================================================

    let title = '';

    const previous =
      root.previousElementSibling;

    if (
      previous &&
      previous.tagName === 'H2'
    ) {
      title =
        cleanText(
          previous.innerText
        );
    }

    if (!title) {
      const headings =
        [...doc.querySelectorAll('h2')];

      title =
        cleanText(
          headings.find(
            h =>
              h.textContent?.trim()
          )?.innerText
        ) ||
        `Problem ${id}`;
    }

    const cleanTitle =
      title.replace(
        /^\s*\d+\s*[.、]\s*/,
        ''
      );

    // =====================================================
    // 正文
    // =====================================================

    const intro =
      root.querySelector(
        '.intro'
      );

    if (!intro) {
      throw new Error(
        '没有找到描述/输入/输出区域'
      );
    }

    const context = {
      images: []
    };

    const introMarkdown =
      htmlElementToMarkdown(
        intro,
        context
      );

    // =====================================================
    // 测试用例
    // =====================================================

    const table =
      root.querySelector(
        '.testcase-table table'
      );

    const cases = [];

    if (table?.tBodies?.[0]) {
      for (
        const [index, row]
        of [
          ...table.tBodies[0].rows
        ].entries()
      ) {
        
        const readLines =
          cell => {
            if (!cell) {
              return '';
            }

            const items =
              [
                ...cell.querySelectorAll(
                  'li'
                )
              ];

            if (
              items.length > 0
            ) {
              return items
                .map(
                  li =>
                    preserveHtmlText(li)
                )
                .join('\n');
            }

            return preserveHtmlText(cell)
              .replace(
                /^以文本方式显示\s*/,
                ''
              );
          };

        cases.push({
          name:
            cleanText(
              row.cells[0]
                ?.innerText
            ) ||
            `测试用例 ${index + 1}`,

          input:
            readLines(
              row.cells[1]
            ),

          output:
            readLines(
              row.cells[2]
            ),

          time:
            cleanText(
              row.cells[3]
                ?.innerText
            ),

          memory:
            cleanText(
              row.cells[4]
                ?.innerText
            ),

          process:
            cleanText(
              row.cells[5]
                ?.innerText
            )
        });
      }
    }

    // =====================================================
    // Markdown
    // =====================================================

    let md =
      `# ${cleanTitle}\n\n`;

    md +=
      `- 题目 ID：${id}\n`;

    md +=
      `- 来源：` +
      `https://lexue.bit.edu.cn/mod/programming/view.php?id=${id}\n\n`;

    md +=
      `${introMarkdown}\n`;

    for (
      const testCase of cases
    ) {
      md +=
        `\n## ${testCase.name}\n`;

      md +=
        `\n### 测试输入\n\n`;

      md +=
        `\`\`\`text\n` +
        `${testCase.input}\n` +
        `\`\`\`\n`;

      md +=
        `\n### 期待的输出\n\n`;

      md +=
        `\`\`\`text\n` +
        `${testCase.output}\n` +
        `\`\`\`\n`;

      md +=
        `\n- 时间限制：` +
        `${testCase.time || '未知'}\n`;

      md +=
        `- 内存限制：` +
        `${testCase.memory || '未知'}\n`;

      md +=
        `- 额外进程：` +
        `${testCase.process || '未知'}\n`;
    }

    return {
      id,
      title: cleanTitle,
      markdown: md,
      images: context.images
    };
  }

  // =========================================================
  // 6. 图片下载
  // =========================================================

  function extensionFromContentType(
    contentType
  ) {
    const type =
      contentType
        ?.split(';')[0]
        .trim()
        .toLowerCase();

    const map = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp'
    };

    return map[type] ?? '';
  }

  function extensionFromUrl(url) {
    try {
      const pathname =
        new URL(
          url,
          location.origin
        ).pathname;

      const match =
        pathname.match(
          /\.([a-zA-Z0-9]+)$/
        );

      return match
        ? match[1].toLowerCase()
        : '';
    } catch {
      return '';
    }
  }

  async function downloadImage(
    image,
    assetsHandle
  ) {
    const absoluteUrl =
      new URL(
        image.src,
        location.origin
      ).href;

    const response =
      await fetch(
        absoluteUrl,
        {
          credentials: 'include',
          cache: 'no-store'
        }
      );

    if (!response.ok) {
      throw new Error(
        `图片下载失败 HTTP ${response.status}`
      );
    }

    const blob =
      await response.blob();

    let extension =
      extensionFromContentType(
        blob.type
      );

    if (!extension) {
      extension =
        extensionFromUrl(
          absoluteUrl
        );
    }

    if (!extension) {
      extension = 'bin';
    }

    const fileName =
      `image_${image.index}.${extension}`;

    const fileHandle =
      await assetsHandle
        .getFileHandle(
          fileName,
          {
            create: true
          }
        );

    const writable =
      await fileHandle
        .createWritable();

    await writable.write(blob);
    await writable.close();

    return fileName;
  }

  // =========================================================
  // 7. 保存一道题
  // =========================================================

  async function saveProblem(
    directoryHandle,
    problem
  ) {
    const safeTitle =
      sanitizeFileName(
        problem.title
      );

    const mdFileName =
      `${problem.id}_${safeTitle}.md`;

    const assetsDirName =
      `${problem.id}_assets`;

    let markdown =
      problem.markdown;

    // 只有存在真实图片时，
    // 才创建 assets 文件夹。
    if (
      problem.images.length > 0
    ) {
      const assetsHandle =
        await directoryHandle
          .getDirectoryHandle(
            assetsDirName,
            {
              create: true
            }
          );

      for (
        const image
        of problem.images
      ) {
        try {
          const imageFileName =
            await downloadImage(
              image,
              assetsHandle
            );

          const relativePath =
            `${assetsDirName}/` +
            `${imageFileName}`;

          markdown =
            markdown.replaceAll(
              image.placeholder,
              relativePath
            );

          console.log(
            `[OJ Exporter] 图片完成：` +
            `${relativePath}`
          );
        } catch (error) {
          console.error(
            '[OJ Exporter] 图片下载失败：',
            image.src,
            error
          );

          // 图片下载失败时，
          // 退回使用原始 URL，
          // 至少不把图片引用彻底丢掉。
          markdown =
            markdown.replaceAll(
              image.placeholder,
              image.src
            );
        }
      }
    }

    // =====================================================
    // 写 Markdown 文件
    // =====================================================

    const fileHandle =
      await directoryHandle
        .getFileHandle(
          mdFileName,
          {
            create: true
          }
        );

    const writable =
      await fileHandle
        .createWritable();

    await writable.write(
      markdown
    );

    await writable.close();

    return mdFileName;
  }

  // =========================================================
  // 8. 主流程
  // =========================================================

  async function runExporter(
    directoryHandle
  ) {
    const input = prompt(
      [
        '请输入题目 ID。',
        '',
        '支持：',
        '538753',
        '538753,538754,538755',
        '538753-538760',
        '538753,538760-538765,538800'
      ].join('\n')
    );

    if (input === null) {
      return;
    }

    let ids;

    try {
      ids =
        parseIds(input);
    } catch (error) {
      alert(
        `ID 输入有误：\n` +
        `${error.message}`
      );

      return;
    }

    if (
      ids.length === 0
    ) {
      alert(
        '没有有效的题目 ID。'
      );

      return;
    }

    const success = [];
    const failed = [];

    for (
      let index = 0;
      index < ids.length;
      index++
    ) {
      const id =
        ids[index];

      console.log(
        `[OJ Exporter] ` +
        `${index + 1}/${ids.length} ` +
        `正在处理 ${id}`
      );

      try {
        const html =
          await fetchProblemHtml(
            id
          );

        const problem =
          parseProblem(
            id,
            html
          );

        console.log(
          `[OJ Exporter] ${id}：` +
          `发现 ${problem.images.length} 张真实图片`
        );

        const fileName =
          await saveProblem(
            directoryHandle,
            problem
          );

        success.push({
          id,
          fileName
        });

        console.log(
          `[OJ Exporter] ` +
          `完成：${id} → ${fileName}`
        );
      } catch (error) {
        failed.push({
          id,
          reason:
            error.message
        });

        console.error(
          `[OJ Exporter] ` +
          `${id} 失败：`,
          error
        );
      }

      // 避免连续高速请求学校服务器。
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            300
          )
      );
    }

    let message =
      `处理完成。\n\n` +
      `成功：${success.length}\n` +
      `失败：${failed.length}`;

    if (
      failed.length > 0
    ) {
      message +=
        '\n\n失败项：\n';

      for (
        const item
        of failed
      ) {
        message +=
          `${item.id}: ` +
          `${item.reason}\n`;
      }
    }

    alert(message);
  }

  // =========================================================
  // 9. 页面按钮
  // =========================================================

  const button =
    document.createElement(
      'button'
    );

  button.textContent =
    '导出 OJ 题目';

  Object.assign(
    button.style,
    {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '99999',
      padding: '10px 16px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      boxShadow:
        '0 2px 8px rgba(0,0,0,.25)'
    }
  );

  button.addEventListener(
    'click',
    async () => {
      if (
        !window.showDirectoryPicker
      ) {
        alert(
          '当前浏览器不支持直接写入本地目录。\n' +
          '建议使用最新版 Chrome 或 Edge。'
        );

        return;
      }

      let directoryHandle;

      try {
        // 必须直接响应点击事件，
        // 否则 Chrome 会报：
        // Must be handling a user gesture。
        directoryHandle =
          await window
            .showDirectoryPicker({
              mode: 'readwrite'
            });
      } catch (error) {
        if (
          error?.name ===
          'AbortError'
        ) {
          return;
        }

        console.error(
          '[OJ Exporter] 选择目录失败：',
          error
        );

        alert(
          `选择目录失败：\n` +
          `${error.message}`
        );

        return;
      }

      try {
        await runExporter(
          directoryHandle
        );
      } catch (error) {
        console.error(
          '[OJ Exporter]',
          error
        );

        alert(
          `导出失败：\n` +
          `${error.message}`
        );
      }
    }
  );

  document.body.appendChild(
    button
  );
})();