// ==UserScript==
// @name         知乎回答生成分享长图
// @namespace    https://tampermonkey.net/
// @version      2.13
// @description  在知乎“分享”弹窗中插入“生成图片”选项，导出分享卡片长图；并屏蔽划词后弹出的复制/喜欢/评论工具条
// @author       You
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @noframes
// @updateURL    https://raw.githubusercontent.com/zyt-code/userscripts/main/zhihu-share-img/zhihu-share.user.js
// @downloadURL  https://raw.githubusercontent.com/zyt-code/userscripts/main/zhihu-share-img/zhihu-share.user.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let currentActiveCard = null;
    let isGenerating = false; // 全局生成锁，防止并发触发下载

    function isZhuanlanPage() {
        return location.hostname === 'zhuanlan.zhihu.com';
    }

    function getZhuanlanArticleEl() {
        return document.querySelector('.Post-Main') ||
               document.querySelector('.Post-content') ||
               document.querySelector('article');
    }

    // 1. 卡片离屏渲染容器及排版样式
    GM_addStyle(`
        .AppHeader {
            transition: transform 0.2s ease;
        }
        html.zhihu-header-hidden .AppHeader {
            transform: translateY(-100%);
        }
        .CornerButton[aria-label="回到顶部"],
        .CornerAnimayedFlex--kanshanEntry {
            display: none !important;
        }
        .SearchMain + div {
            display: none !important;
        }
        .Search-container,
        .Topstory-container {
            width: calc(100% - 32px) !important;
            max-width: none !important;
        }
        .SearchMain,
        .Topstory-mainColumn {
            width: 100% !important;
            max-width: none !important;
            flex: 1 1 auto !important;
        }
        .SearchMain .ContentItem,
        .Topstory-mainColumn .ContentItem {
            padding-left: max(20px, calc((100% - 960px) / 2)) !important;
            padding-right: max(20px, calc((100% - 960px) / 2)) !important;
        }
        .SearchMain .RichContent-inner,
        .Topstory-mainColumn .RichContent-inner {
            max-width: 960px;
        }
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
        .share-card-qrcode-box img {
            width: 76px;
            height: 76px;
            display: block;
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
                       itemElement.querySelector('a[data-tooltip*="发布于"]') ||
                       itemElement.querySelector('a[data-tooltip*="编辑于"]');

        if (timeEl && timeEl.innerText.trim()) {
            return timeEl.innerText.trim();
        }

        const walker = document.createTreeWalker(itemElement, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode()) !== null) {
            const txt = node.textContent.trim();
            if (/^(发布于|编辑于)/.test(txt)) return txt;
        }
        return '';
    }

    // 6. 从当前浮层提取原生二维码（跳过尚未绘制的空白 canvas）
    function canvasHasInk(canvas) {
        if (!canvas || canvas.width < 8 || canvas.height < 8) return false;
        try {
            const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < data.length; i += 16) {
                if (data[i + 3] > 16 && (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248)) {
                    return true;
                }
            }
            return false;
        } catch (e) {
            return true;
        }
    }

    function collectQrSrcFrom(root) {
        if (!root || !root.querySelectorAll) return null;
        for (const canvas of root.querySelectorAll('canvas')) {
            if (!canvasHasInk(canvas)) continue;
            try { return canvas.toDataURL('image/png'); } catch (e) {}
        }
        for (const img of root.querySelectorAll('img')) {
            const src = img.currentSrc || img.src || img.getAttribute('data-actualsrc') || '';
            if (!src) continue;
            const cls = `${img.className} ${img.parentElement ? img.parentElement.className : ''}`.toLowerCase();
            if (src.startsWith('data:image') || /qr/i.test(src) || /qrcode/.test(cls)) {
                return src;
            }
        }
        return null;
    }

    function getShareQrCodeSrc(clickedElement) {
        let container = clickedElement;
        let foundQrContainer = false;
        for (let i = 0; i < 8; i++) {
            if (!container || !container.parentElement) break;
            container = container.parentElement;
            if (container.innerText && (container.innerText.includes('扫码分享') || container.innerText.includes('微信扫码'))) {
                foundQrContainer = true;
                break;
            }
        }

        if (foundQrContainer) {
            const src = collectQrSrcFrom(container);
            if (src) return src;
        }

        const labeled = document.querySelector('.ShareMenu-qrcode, .ShareMenu-qrCode, [class*="qrcode"], [class*="QrCode"]');
        return collectQrSrcFrom(labeled);
    }

    function getSharePageUrl() {
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical && canonical.href) return canonical.href;
        const og = document.querySelector('meta[property="og:url"]');
        if (og && og.content) return og.content;
        return location.href.split('#')[0];
    }

    function generateQrDataUrl(text) {
        if (typeof qrcode !== 'function' || !text) return null;
        try {
            const qr = qrcode(0, 'M');
            qr.addData(text);
            qr.make();
            return qr.createDataURL(4, 2);
        } catch (e) {
            return null;
        }
    }

    async function resolveQrImage(clickedElement) {
        let src = getShareQrCodeSrc(clickedElement);
        if (!src) {
            const deadline = Date.now() + 1500;
            while (!src && Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 100));
                src = getShareQrCodeSrc(clickedElement);
            }
        }
        if (src) {
            const asData = await imageToBase64(src);
            if (asData && asData.startsWith('data:image')) return asData;
        }
        return generateQrDataUrl(getSharePageUrl());
    }

    // 7. 生成并导出长图（带状态锁定）
    function readStatusText(target) {
        if (!target) return '';
        return target.nodeType === Node.TEXT_NODE ? target.nodeValue : target.innerText;
    }

    function writeStatusText(target, text) {
        if (!target) return;
        if (target.nodeType === Node.TEXT_NODE) {
            target.nodeValue = text;
        } else {
            target.innerText = text;
        }
    }

    async function generateCardImage(itemElement, rowElement, statusTarget) {
        if (isGenerating) return;

        let originalText = '';
        try {
            isGenerating = true;
            originalText = readStatusText(statusTarget);
            writeStatusText(statusTarget, '正在生成...');
            rowElement.classList.add('share-card-btn-loading');

            const qrCodeSrc = await resolveQrImage(rowElement);

            if (!itemElement) {
                alert('未能捕获到对应回答卡片，请将鼠标移至该回答后重试');
                return;
            }

            // 折叠状态自动展开，轮询直到展开按钮消失
            const expandBtn = itemElement.querySelector('.ContentItem-expandButton');
            if (expandBtn) {
                expandBtn.click();
                const deadline = Date.now() + 2000;
                while (itemElement.querySelector('.ContentItem-expandButton') && Date.now() < deadline) {
                    await new Promise(res => setTimeout(res, 50));
                }
            }

            const title = getAnswerTitle(itemElement);
            const author = getAuthorName(itemElement);
            const authorAvatarRaw = getAuthorAvatar(itemElement);
            const authorAvatarBase64 = await imageToBase64(authorAvatarRaw);
            const timeText = getAnswerTime(itemElement);

            let richTextEl = itemElement.querySelector('.RichText') ||
                             itemElement.querySelector('.CopyrightRichText-richText');
            if (!richTextEl && isZhuanlanPage()) {
                richTextEl = itemElement.querySelector('.Post-RichText');
            }
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
            card.replaceChildren();

            const titleEl = document.createElement('div');
            titleEl.className = 'share-card-title';
            titleEl.textContent = title;
            card.appendChild(titleEl);

            const authorRow = document.createElement('div');
            authorRow.className = 'share-card-author';
            if (authorAvatarBase64) {
                const avatar = document.createElement('img');
                avatar.className = 'share-card-author-avatar';
                avatar.src = authorAvatarBase64;
                authorRow.appendChild(avatar);
            }
            const nameEl = document.createElement('span');
            nameEl.className = 'share-card-author-name';
            nameEl.textContent = author;
            authorRow.appendChild(nameEl);
            card.appendChild(authorRow);

            const bodyEl = document.createElement('div');
            bodyEl.className = 'share-card-body';
            bodyEl.appendChild(clonedContent);
            card.appendChild(bodyEl);

            if (timeText) {
                const timeEl = document.createElement('div');
                timeEl.className = 'share-card-time';
                timeEl.textContent = timeText;
                card.appendChild(timeEl);
            }

            const footer = document.createElement('div');
            footer.className = 'share-card-footer';

            const footerLeft = document.createElement('div');
            footerLeft.className = 'share-card-footer-left';
            const tipEl = document.createElement('div');
            tipEl.className = 'share-card-footer-tip';
            tipEl.textContent = '长按或扫码阅读全文';
            const subEl = document.createElement('div');
            subEl.className = 'share-card-footer-sub';
            subEl.textContent = '知乎精选内容分享';
            footerLeft.appendChild(tipEl);
            footerLeft.appendChild(subEl);
            footer.appendChild(footerLeft);

            if (qrCodeSrc) {
                const qrWrap = document.createElement('div');
                qrWrap.className = 'share-card-qrcode-wrap';
                const qrBox = document.createElement('div');
                qrBox.className = 'share-card-qrcode-box';
                const qrImg = document.createElement('img');
                qrImg.alt = '二维码';
                qrImg.src = qrCodeSrc;
                qrBox.appendChild(qrImg);
                qrWrap.appendChild(qrBox);
                const qrLabel = document.createElement('span');
                qrLabel.className = 'share-card-qrcode-label';
                qrLabel.textContent = '微信扫码';
                qrWrap.appendChild(qrLabel);
                footer.appendChild(qrWrap);
            }
            card.appendChild(footer);

            const qrPreview = card.querySelector('.share-card-qrcode-box img');
            if (qrPreview && !qrPreview.complete) {
                await new Promise(res => { qrPreview.onload = res; qrPreview.onerror = res; });
            }

            // 提升懒加载地址后再等待正文内图片加载
            const images = card.querySelectorAll('.share-card-body img');
            images.forEach(img => {
                const realSrc = img.getAttribute('data-original') || img.getAttribute('data-actualsrc') || img.src;
                if (realSrc && img.src !== realSrc) {
                    img.src = realSrc;
                }
            });
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
            const unsafeNameChars = /[\\/:*?"<>|]/g;
            const safeTitle = title.replace(unsafeNameChars, '').slice(0, 20);
            const safeAuthor = author.replace(unsafeNameChars, '');
            downloadLink.download = `${safeTitle}_${safeAuthor}.png`;
            downloadLink.click();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } catch (err) {
            console.error('生成图片失败:', err);
            alert('生成图片失败，请查看控制台。');
        } finally {
            isGenerating = false;
            writeStatusText(statusTarget, originalText);
            rowElement.classList.remove('share-card-btn-loading');
        }
    }

    // 8. 悬停/点击分享区域捕获对应回答卡片
    function trackActiveCard(e) {
        const trigger = e.target.closest('.ShareMenu, button[aria-label*="分享"], .ContentItem-actions');
        if (trigger) {
            const card = trigger.closest('.ContentItem') || trigger.closest('.List-item') || trigger.closest('.Card')
                || (isZhuanlanPage() ? (trigger.closest('.Post-Main') || trigger.closest('.Post-content') || trigger.closest('article')) : null);
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
            let climb = 0;
            while (row && row.parentElement && row.parentElement.children.length === 1 && climb < 6) {
                row = row.parentElement;
                climb++;
            }
            if (!row || !row.parentElement) continue;

            const listContainer = row.parentElement;
            if (
                listContainer === document.body ||
                listContainer === document.documentElement ||
                listContainer.children.length <= 1
            ) continue;

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

                const itemElement = currentActiveCard || (isZhuanlanPage() ? getZhuanlanArticleEl() : null);
                generateCardImage(itemElement, newRow, clonedTextNode || newRow);
            });

            listContainer.insertBefore(newRow, row);
        }
    }

    // 10. 屏蔽划词后的复制/喜欢/评论/AI 解释工具条
    // 知乎用哈希类名渲染这条 tip，按按钮文案识别，避免误伤「复制链接」分享菜单。
    function looksLikeSelectionTip(el) {
        if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement) return false;
        if (el.id === 'zhihu-share-card-container' || el.closest('#zhihu-share-card-container')) return false;
        const text = (el.innerText || '').replace(/\s+/g, '');
        if (!text || text.length > 32) return false;
        if (text.includes('复制链接') || text.includes('生成图片')) return false;
        return text.includes('复制') && text.includes('喜欢') && text.includes('评论');
    }

    function suppressSelectionTip(node) {
        let el = node;
        for (let i = 0; i < 8 && el && el !== document.body; i++) {
            if (looksLikeSelectionTip(el)) {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
                el.setAttribute('data-zhihu-selection-tip-blocked', 'true');
                return;
            }
            el = el.parentElement;
        }
    }

    document.addEventListener('mouseup', () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        requestAnimationFrame(() => {
            const current = window.getSelection();
            if (!current || current.isCollapsed || !current.rangeCount) return;
            const rect = current.getRangeAt(0).getBoundingClientRect();
            if (!rect || (!rect.width && !rect.height)) return;
            const midX = rect.left + rect.width / 2;
            [rect.top - 28, rect.bottom + 28].forEach((y) => {
                const hit = document.elementFromPoint(midX, y);
                if (hit) suppressSelectionTip(hit);
            });
        });
    }, true);

    function removeSidebar() {
        document.querySelectorAll('[data-za-detail-view-path-module="RightSideBar"]')
            .forEach(element => element.remove());
    }

    function removeHeaderItems() {
        document.querySelectorAll('header a, header button, .AppHeader a, .AppHeader button').forEach(element => {
            const label = element.textContent.trim().replace(/\s+/g, ' ');
            if (label === '圈子' || /^AI Works(?:\s*Beta)?$/i.test(label) || label === '直答') {
                element.remove();
            }
        });
    }

    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        if (scrollY <= 80 || scrollY < lastScrollY) {
            document.documentElement.classList.remove('zhihu-header-hidden');
        } else if (scrollY > lastScrollY) {
            document.documentElement.classList.add('zhihu-header-hidden');
        }
        lastScrollY = scrollY;
    }, { passive: true });

    removeSidebar();
    removeHeaderItems();

    // 11. 监听 DOM 树变动（rAF 合并同帧多次 mutation）
    let pendingInject = false;
    const pendingTipNodes = [];
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) pendingTipNodes.push(node);
            }
        }
        if (pendingInject) return;
        pendingInject = true;
        requestAnimationFrame(() => {
            pendingInject = false;
            while (pendingTipNodes.length) {
                const node = pendingTipNodes.pop();
                if (node.isConnected) suppressSelectionTip(node);
            }
            removeSidebar();
            removeHeaderItems();
            tryInjectMenu();
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
