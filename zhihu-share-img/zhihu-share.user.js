// ==UserScript==
// @name         知乎回答生成分享长图
// @namespace    https://tampermonkey.net/
// @version      2.2
// @description  在知乎“分享”弹窗中插入“生成图片”选项，导出包含作者头像、标题、正文、编辑时间及高清二维码的分享卡片（支持防重点击与 Loading）
// @author       You
// @match        https://www.zhihu.com/*
// @updateURL    https://raw.githubusercontent.com/zyt-code/userscripts/main/zhihu-share-img/zhihu-share.user.js
// @downloadURL  https://raw.githubusercontent.com/zyt-code/userscripts/main/zhihu-share-img/zhihu-share.user.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let currentActiveCard = null;
    let isGenerating = false; // 全局生成锁，防止并发触发下载

    // 1. 卡片离屏渲染容器及排版样式
    GM_addStyle(`
        #zhihu-share-card-container {
            position: fixed;
            left: -9999px;
            top: 0;
            width: 620px;
            background: #ffffff;
            padding: 36px 32px 28px 32px;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1a1a1a;
            line-height: 1.68;
            z-index: -9999;
        }
        .share-card-title {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 16px;
            line-height: 1.45;
            color: #121212;
        }
        .share-card-author {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid #ebebeb;
        }
        .share-card-author-avatar {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid #f0f0f0;
            flex-shrink: 0;
        }
        .share-card-author-name {
            font-size: 15px;
            font-weight: 600;
            color: #121212;
        }
        .share-card-body {
            font-size: 15px;
            color: #333333;
            line-height: 1.75;
            word-break: break-word;
        }
        .share-card-body p {
            margin-bottom: 14px;
        }
        .share-card-body img {
            max-width: 100%;
            border-radius: 4px;
            margin: 8px 0;
            display: block;
        }
        .share-card-time {
            margin-top: 18px;
            font-size: 13px;
            color: #8590a6;
            line-height: 1.5;
        }
        .share-card-footer {
            margin-top: 24px;
            padding-top: 18px;
            border-top: 1px dashed #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .share-card-footer-left {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .share-card-footer-tip {
            font-size: 14px;
            font-weight: 600;
            color: #444444;
        }
        .share-card-footer-sub {
            font-size: 12px;
            color: #999999;
        }
        .share-card-qrcode-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
        }
        .share-card-qrcode-box {
            width: 86px;
            height: 86px;
            background: #ffffff;
            border: 1px solid #e8e8e8;
            border-radius: 8px;
            padding: 5px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .share-card-qrcode-label {
            font-size: 11px;
            color: #999999;
            line-height: 1;
        }
        /* 正在生成时的禁用样式 */
        .share-card-btn-loading {
            opacity: 0.6 !important;
            cursor: not-allowed !important;
            pointer-events: none !important;
        }
    `);

    // 2. 头像转 Base64 规避跨域画布污染
    function imageToBase64(url) {
        if (!url) return Promise.resolve('');
        if (url.startsWith('data:image')) return Promise.resolve(url);
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || 80;
                    canvas.height = img.naturalHeight || 80;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    resolve(url);
                }
            };
            img.onerror = () => resolve(url);
            img.src = url;
        });
    }

    // 3. 提取回答标题
    function getAnswerTitle(itemElement) {
        if (itemElement) {
            const cardTitleEl = itemElement.querySelector('.ContentItem-title') ||
                                itemElement.querySelector('h2.ContentItem-title') ||
                                itemElement.querySelector('.QuestionItem-title');
            if (cardTitleEl && cardTitleEl.innerText.trim()) {
                return cardTitleEl.innerText.trim();
            }

            try {
                const zopData = itemElement.getAttribute('data-zop');
                if (zopData) {
                    const parsed = JSON.parse(zopData);
                    if (parsed.title) return parsed.title.trim();
                }
            } catch (e) {}
        }

        const questionHeaderEl = document.querySelector('.QuestionHeader-title') ||
                                 document.querySelector('h1.QuestionHeader-title') ||
                                 document.querySelector('h1.Post-Title') ||
                                 document.querySelector('h1');
        if (questionHeaderEl && questionHeaderEl.innerText.trim()) {
            return questionHeaderEl.innerText.trim();
        }

        return document.title.replace(/- 知乎.*$/, '').trim();
    }

    // 4. 提取回答者信息（昵称与头像）
    function getAuthorName(itemElement) {
        if (!itemElement) return '匿名用户';
        const authorEl = itemElement.querySelector('.AuthorInfo-name .UserLink-link') ||
                         itemElement.querySelector('.AuthorInfo-name') ||
                         itemElement.querySelector('.UserLink-link');
        return authorEl ? authorEl.innerText.trim() : '匿名用户';
    }

    function getAuthorAvatar(itemElement) {
        if (!itemElement) return '';
        const img = itemElement.querySelector('.AuthorInfo-avatar, .UserAvatar img, .AuthorInfo img, img.Avatar');
        return img ? (img.getAttribute('data-actualsrc') || img.src || '') : '';
    }

    // 5. 提取发布/编辑时间戳
    function getAnswerTime(itemElement) {
        if (!itemElement) return '';
        const timeEl = itemElement.querySelector('.ContentItem-time') ||
                       itemElement.querySelector('.ContentItem-time span') ||
                       itemElement.querySelector('a[data-tooltip*="发布于"]') ||
                       itemElement.querySelector('a[data-tooltip*="编辑于"]');

        if (timeEl && timeEl.innerText.trim()) {
            return timeEl.innerText.trim();
        }

        const walker = document.createTreeWalker(itemElement, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const txt = node.textContent.trim();
            if (/^(发布于|编辑于)/.test(txt)) return txt;
        }
        return '';
    }

    // 6. 从当前浮层提取原生二维码
    function getShareQrCodeSrc(clickedElement) {
        let container = clickedElement;
        for (let i = 0; i < 8; i++) {
            if (!container || !container.parentElement) break;
            container = container.parentElement;
            if (container.innerText && (container.innerText.includes('扫码分享') || container.innerText.includes('微信扫码'))) {
                break;
            }
        }
        if (!container) container = document.body;

        const canvas = container.querySelector('canvas');
        if (canvas) {
            try { return canvas.toDataURL('image/png'); } catch (e) {}
        }

        const imgs = container.querySelectorAll('img');
        for (const img of imgs) {
            if (img.src && (img.src.startsWith('data:image') || img.src.includes('qr') || img.width >= 50 || img.naturalWidth >= 50)) {
                return img.src;
            }
        }

        const fallbackImg = document.querySelector('.ShareMenu-qrcode img, .ShareMenu-qrCode img, [class*="qrcode"] img');
        return fallbackImg ? fallbackImg.src : null;
    }

    // 7. 生成并导出长图（带状态锁定）
    async function generateCardImage(itemElement, rowElement, statusTarget, qrCodeSrc) {
        if (isGenerating) return;
        isGenerating = true;

        const originalText = statusTarget.innerText;
        statusTarget.innerText = '正在生成...';
        rowElement.classList.add('share-card-btn-loading');

        try {
            if (!itemElement) {
                alert('未能捕获到对应回答卡片，请将鼠标移至该回答后重试');
                return;
            }

            // 折叠状态自动展开
            const expandBtn = itemElement.querySelector('.ContentItem-expandButton');
            if (expandBtn) {
                expandBtn.click();
                await new Promise(res => setTimeout(res, 300));
            }

            const title = getAnswerTitle(itemElement);
            const author = getAuthorName(itemElement);
            const authorAvatarRaw = getAuthorAvatar(itemElement);
            const authorAvatarBase64 = await imageToBase64(authorAvatarRaw);
            const timeText = getAnswerTime(itemElement);

            const richTextEl = itemElement.querySelector('.RichText') ||
                               itemElement.querySelector('.CopyrightRichText-richText');
            if (!richTextEl) {
                alert('未找到正文内容');
                return;
            }

            const clonedContent = richTextEl.cloneNode(true);
            clonedContent.querySelectorAll('button, .ContentItem-expandButton, .ContentItem-rightButton').forEach(el => el.remove());

            let card = document.getElementById('zhihu-share-card-container');
            if (!card) {
                card = document.createElement('div');
                card.id = 'zhihu-share-card-container';
                document.body.appendChild(card);
            }

            card.innerHTML = `
                <div class="share-card-title">${title}</div>
                <div class="share-card-author">
                    ${authorAvatarBase64 ? `<img class="share-card-author-avatar" src="${authorAvatarBase64}" />` : ''}
                    <span class="share-card-author-name">${author}</span>
                </div>
                <div class="share-card-body"></div>
                ${timeText ? `<div class="share-card-time">${timeText}</div>` : ''}
                <div class="share-card-footer">
                    <div class="share-card-footer-left">
                        <div class="share-card-footer-tip">长按或扫码阅读全文</div>
                        <div class="share-card-footer-sub">知乎精选内容分享</div>
                    </div>
                    ${qrCodeSrc ? `
                    <div class="share-card-qrcode-wrap">
                        <div class="share-card-qrcode-box">
                            <canvas id="share-card-qr-canvas" width="152" height="152" style="width: 76px; height: 76px; display: block;"></canvas>
                        </div>
                        <span class="share-card-qrcode-label">微信扫码</span>
                    </div>
                    ` : ''}
                </div>
            `;
            card.querySelector('.share-card-body').appendChild(clonedContent);

            // 在独立 canvas 绘制二维码
            if (qrCodeSrc) {
                const qrCanvas = card.querySelector('#share-card-qr-canvas');
                if (qrCanvas) {
                    await new Promise((resolve) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                            const ctx = qrCanvas.getContext('2d');
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
                            ctx.drawImage(img, 0, 0, qrCanvas.width, qrCanvas.height);
                            resolve();
                        };
                        img.onerror = resolve;
                        img.src = qrCodeSrc;
                    });
                }
            }

            // 等待正文内图片加载
            const images = card.querySelectorAll('.share-card-body img');
            if (images.length > 0) {
                await Promise.all(Array.from(images).map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(res => { img.onload = res; img.onerror = res; });
                }));
            }

            const canvas = await html2canvas(card, {
                useCORS: true,
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false
            });

            const imgUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = imgUrl;
            const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
            downloadLink.download = `${safeTitle}_${author}.png`;
            downloadLink.click();

            // 生成完成后关闭浮层
            document.body.click();
        } catch (err) {
            console.error('生成图片失败:', err);
            alert('生成图片失败，请查看控制台。');
        } finally {
            // 解除锁定并恢复按钮状态
            isGenerating = false;
            statusTarget.innerText = originalText;
            rowElement.classList.remove('share-card-btn-loading');
        }
    }

    // 8. 悬停/点击分享区域捕获对应回答卡片
    function trackActiveCard(e) {
        const trigger = e.target.closest('.ShareMenu, button[aria-label*="分享"], .ContentItem-actions');
        if (trigger) {
            const card = trigger.closest('.ContentItem') || trigger.closest('.List-item') || trigger.closest('.Card');
            if (card) {
                currentActiveCard = card;
            }
        }
    }
    document.addEventListener('mouseover', trackActiveCard, true);
    document.addEventListener('click', trackActiveCard, true);

    // 9. 注入“生成图片”菜单项
    function tryInjectMenu() {
        const xpathResult = document.evaluate(
            "//text()[normalize-space(.)='复制链接']",
            document.body,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
        );

        for (let i = 0; i < xpathResult.snapshotLength; i++) {
            const textNode = xpathResult.snapshotItem(i);
            const textParent = textNode.parentElement;
            if (!textParent) continue;

            let row = textParent;
            while (row && row.parentElement && row.parentElement.children.length === 1) {
                row = row.parentElement;
            }
            if (!row || !row.parentElement) continue;

            const listContainer = row.parentElement;

            if (listContainer.getAttribute('data-img-share-done') === 'true') continue;
            listContainer.setAttribute('data-img-share-done', 'true');

            const newRow = row.cloneNode(true);
            newRow.removeAttribute('id');

            const clonedTextNode = document.evaluate(
                ".//text()[normalize-space(.)='复制链接']",
                newRow,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (clonedTextNode) {
                clonedTextNode.textContent = '生成图片';
            }

            const svg = newRow.querySelector('svg');
            if (svg) {
                svg.innerHTML = `<path d="M4 5h3l1.5-2h7L17 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-2a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>`;
            }

            newRow.style.cursor = 'pointer';
            newRow.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                // 若当前正在处理上一张图片，直接拦截点击
                if (isGenerating) return;

                const qrCodeSrc = getShareQrCodeSrc(newRow);
                generateCardImage(currentActiveCard, newRow, clonedTextNode || newRow, qrCodeSrc);
            });

            listContainer.insertBefore(newRow, row);
        }
    }

    // 10. 监听 DOM 树变动
    const observer = new MutationObserver(() => {
        tryInjectMenu();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
