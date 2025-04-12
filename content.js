// 小词列表，这些词将整体加粗或不处理
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

// 存储当前页面的处理状态
let currentUrl = window.location.href;
let currentDomain = new URL(currentUrl).hostname;
let isEnabled = false;
let boldLevel = 'Focus'; // 默认使用标准加粗级别
let currentMode = 'full'; // 默认使用全页处理模式

// 不同加粗级别的配置
const BOLD_LEVELS = {
    'Glance': {
        small: 0.3,    // 30%
        medium: 0.25,  // 25%
        large: 0.2     // 20%
    },
    'Focus': {
        small: 0.6,    // 60%
        medium: 0.5,   // 50%
        large: 0.4     // 40%
    },
    'Deep': {
        small: 0.8,    // 80%
        medium: 0.7,   // 70%
        large: 0.6     // 60%
    }
};

// 保存域名特定的设置
function saveDomainSettings() {
    chrome.storage.local.get(['domainSettings'], function(result) {
        const settings = result.domainSettings || {};
        settings[currentDomain] = {
            enabled: isEnabled,
            boldLevel: boldLevel,
            lastUsed: new Date().getTime()
        };
        
        // 只保留最近使用的100个域名设置
        const domains = Object.keys(settings).sort((a, b) => 
            settings[b].lastUsed - settings[a].lastUsed
        ).slice(0, 100);
        
        const trimmedSettings = {};
        domains.forEach(domain => {
            trimmedSettings[domain] = settings[domain];
        });
        
        chrome.storage.local.set({
            domainSettings: trimmedSettings,
            lastUsedLevel: boldLevel, // 保存最后使用的级别
            mode: currentMode // 保存当前模式
        });
    });
}

// 计算单词需要加粗的字母数量
function getBoldLength(word) {
    if (SMALL_WORDS.has(word.toLowerCase())) {
        return word.length; // 小词整体加粗
    }
    
    const length = word.length;
    const level = BOLD_LEVELS[boldLevel];
    
    if (length <= 3) return Math.ceil(length * level.small);
    if (length <= 5) return Math.ceil(length * level.medium);
    if (length <= 7) return Math.ceil(length * level.medium);
    return Math.ceil(length * level.large);
}

// 将文本转换为 Bionic Reading 格式
function convertToBionic(text, computedStyle) {
    // 使用正则表达式保留所有空白字符和标点符号
    const parts = text.split(/(\s+|[.,!?;:]|\b)/);
    let result = '';
    let lastPartWasWord = false;

    parts.forEach((part, index) => {
        // 检查是否是空白字符
        if (/^\s+$/.test(part)) {
            result += `<span style="white-space: pre-wrap">${part}</span>`;
            lastPartWasWord = false;
            return;
        }

        // 检查是否是标点符号
        if (/^[.,!?;:]$/.test(part)) {
            result += part;
            lastPartWasWord = false;
            return;
        }

        // 检查是否是纯英文单词
        if (part.match(/^[a-zA-Z]+$/)) {
            const boldLength = getBoldLength(part);
            const boldPart = part.substring(0, boldLength);
            const normalPart = part.substring(boldLength);
            
            // 使用 display: contents 来避免影响布局
            result += `<span class="bionic-bold" style="display: contents !important; font-weight: 700 !important; color: inherit;">${boldPart}</span>${normalPart}`;
            lastPartWasWord = true;
        } else {
            result += part;
            lastPartWasWord = false;
        }
    });

    return result;
}

// 检查元素是否应该被处理
function shouldProcessElement(element) {
    // 排除不应处理的元素
    const excludeSelectors = [
        'script', 'style', 'noscript', 'iframe', 'input', 'textarea',
        'button', 'select', 'option', 'code', 'pre',
        '[contenteditable="true"]',
        'svg', 'img', '.bionic-processed',
        'a[role="button"]', '[class*="button"]', '[class*="btn"]',
        '[role="button"]', '[role="tab"]', '[role="link"]',
        'button', '.button', '.btn',
        '[class*="upload"]', '[class*="download"]',
        '[class*="nav"]', '[class*="menu"]',
        '[class*="icon"]', '[class*="logo"]'
    ];
    
    // 检查是否在谷歌搜索页面
    if (window.location.hostname.includes('google.') && 
        (window.location.pathname.includes('/search') || document.querySelector('#search'))) {
        // 仅排除搜索结果区域的特定元素
        const searchResultSelectors = [
            '#search',              // 搜索结果主容器
            '.g',                   // 搜索结果项
            '.MjjYud',             // 搜索结果项容器
            '.VwiC3b',             // 搜索结果摘要
            '.LC20lb',             // 搜索结果标题
            '.yuRUbf',             // 标题容器
            '.IsZvec',             // 描述容器
            '.r8s4j',              // 搜索结果链接
            '.DKV0Md',             // 搜索结果描述
            '[data-content-feature="1"]', // 特殊搜索结果
            'div[data-hveid]'      // 搜索结果容器
        ].join(',');

        if (element.closest(searchResultSelectors)) {
            return false;
        }
    }
    
    // 检查是否匹配排除选择器
    if (element.closest(excludeSelectors.join(','))) return false;
    if (element.classList.contains('bionic-processed')) return false;
    
    // 检查是否是交互式元素
    const excludeElements = ['SCRIPT', 'STYLE', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'BUTTON', 'A'];
    if (excludeElements.includes(element.tagName)) return false;
    
    // 检查是否包含特殊属性
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.getAttribute('contenteditable') === 'true') return false;
    if (element.getAttribute('role') === 'button') return false;
    if (element.getAttribute('role') === 'link') return false;
    
    return true;
}

// 处理页面中的所有文本节点
function processTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        // 只处理包含字母的文本
        if (text.match(/[a-zA-Z]/) && shouldProcessElement(node.parentElement)) {
            // 获取计算后的样式
            const computedStyle = window.getComputedStyle(node.parentElement);
            const wrapper = document.createElement('span');
            wrapper.innerHTML = convertToBionic(text, computedStyle);
            wrapper.classList.add('bionic-processed');
            
            // 使用 display: contents 来避免影响布局
            wrapper.style.cssText = `
                display: contents !important;
                font: inherit;
                color: inherit;
                background: inherit;
                text-align: inherit;
                line-height: inherit;
                letter-spacing: inherit;
                word-spacing: inherit;
                white-space: pre-wrap !important;
                text-decoration: inherit;
                vertical-align: inherit;
                word-break: inherit;
                word-wrap: inherit;
                overflow-wrap: inherit;
            `;
            
            node.parentNode.replaceChild(wrapper, node);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE && shouldProcessElement(node)) {
        // 使用 TreeWalker 来遍历文本节点，保持原始的文本结构
        const walker = document.createTreeWalker(
            node,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 保留所有文本节点，包括空白
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );
        
        const nodes = [];
        let currentNode;
        while (currentNode = walker.nextNode()) {
            nodes.push(currentNode);
        }
        
        nodes.forEach(textNode => processTextNodes(textNode));
    }
}

// 处理新添加的内容
function observeNewContent() {
    const observer = new MutationObserver((mutations) => {
        if (!isEnabled) return;
        
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('bionic-processed')) {
                    if (currentMode === 'full') {
                        processTextNodes(node);
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// 监听 URL 变化
function observeUrlChanges() {
    const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            if (isEnabled) {
                setTimeout(() => {
                    processTextNodes(document.body);
                }, 500);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// 清除处理效果
function clearBionicReading() {
    const elements = document.querySelectorAll('.bionic-processed');
    elements.forEach(el => {
        const text = el.textContent;
        const textNode = document.createTextNode(text);
        el.parentNode.replaceChild(textNode, el);
    });
}

// 处理选中的文本
function processSelectedText() {
    if (!isEnabled) return;
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    // 处理选中区域中的文本节点
    processTextNodes(tempDiv);

    // 清除原有选区内容并插入处理后的内容
    range.deleteContents();
    range.insertNode(tempDiv);

    // 移除临时容器，保留其内容
    const parent = tempDiv.parentNode;
    while (tempDiv.firstChild) {
        parent.insertBefore(tempDiv.firstChild, tempDiv);
    }
    parent.removeChild(tempDiv);

    // 清除选区
    selection.removeAllRanges();
}

// 创建选区工具栏
function createSelectionToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'bionic-selection-toolbar';
    toolbar.style.cssText = `
        position: absolute;
        z-index: 10000;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 6px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        display: none;
        transition: all 0.2s ease;
        user-select: none;
    `;

    const button = document.createElement('button');
    button.textContent = '加粗文本';
    button.style.cssText = `
        background: #2196F3;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        transition: background-color 0.2s;
    `;
    button.onmouseover = () => {
        button.style.backgroundColor = '#1976D2';
    };
    button.onmouseout = () => {
        button.style.backgroundColor = '#2196F3';
    };
    button.onclick = () => {
        processSelectedText();
        hideToolbar();
    };

    toolbar.appendChild(button);
    document.body.appendChild(toolbar);
    return toolbar;
}

// 显示工具栏
function showToolbar(selection) {
    const toolbar = document.getElementById('bionic-selection-toolbar');
    if (!toolbar) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // 计算工具栏位置
    const toolbarHeight = toolbar.offsetHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // 将工具栏放在选区的上方或下方
    let top = rect.top + scrollTop - toolbarHeight - 10;
    if (top < scrollTop) {
        // 如果上方空间不够，放在下方
        top = rect.bottom + scrollTop + 10;
    }
    
    // 水平居中对齐
    const left = rect.left + scrollLeft + (rect.width / 2);
    
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
    toolbar.style.transform = 'translateX(-50%)';
    toolbar.style.display = 'block';
}

// 隐藏工具栏
function hideToolbar() {
    const toolbar = document.getElementById('bionic-selection-toolbar');
    if (toolbar) {
        toolbar.style.display = 'none';
    }
}

// 处理选区变化
function handleSelection() {
    if (!isEnabled || currentMode !== 'selection') return;
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText) {
        showToolbar(selection);
    } else {
        hideToolbar();
    }
}

// 初始化选区处理
function initializeSelectionHandler() {
    const toolbar = createSelectionToolbar();
    
    // 监听选区变化
    document.addEventListener('selectionchange', () => {
        // 使用防抖来避免频繁更新
        clearTimeout(window.selectionTimeout);
        window.selectionTimeout = setTimeout(handleSelection, 200);
    });
    
    // 点击其他区域时隐藏工具栏
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#bionic-selection-toolbar')) {
            const selection = window.getSelection();
            if (!selection.toString().trim() || !isEnabled) {
                hideToolbar();
            }
        }
    });
    
    // 监听滚动事件，更新工具栏位置
    window.addEventListener('scroll', () => {
        if (!isEnabled) return;
        const selection = window.getSelection();
        if (selection.toString().trim()) {
            showToolbar(selection);
        }
    }, { passive: true });
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'toggle') {
        if (request.isBlacklisted) {
            // 如果在黑名单中，强制禁用并移除所有效果
            isEnabled = false;
            removeAllBionicEffects();
            return;
        }
        
        if (request.isWhitelisted) {
            // 如果在白名单中，强制启用
            isEnabled = true;
            currentMode = request.mode;
            processTextNodes(document.body);
            return;
        }
        
        isEnabled = request.enabled;
        currentMode = request.mode;
        
        if (isEnabled) {
            processTextNodes(document.body);
        } else {
            removeAllBionicEffects();
        }
    } else if (request.action === 'changeMode') {
        const previousMode = currentMode;
        currentMode = request.mode;
        
        if (!isEnabled) return; // 如果插件未启用，不处理模式切换
        
        // 清除当前处理效果
        removeAllBionicEffects();
        hideToolbar();
        
        // 根据新模式应用效果
        if (currentMode === 'full') {
            processTextNodes(document.body);
        }
        
        saveDomainSettings();
    } else if (request.action === 'changeBoldLevel') {
        boldLevel = request.level;
        if (isEnabled) {
            removeAllBionicEffects();
            if (currentMode === 'full') {
                processTextNodes(document.body);
            }
        }
        saveDomainSettings();
    }
});

// 移除所有Bionic效果的函数
function removeAllBionicEffects() {
    const bionicElements = document.querySelectorAll('.bionic-bold');
    bionicElements.forEach(element => {
        const parent = element.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(element.textContent), element);
        }
    });
}

// 初始化
chrome.storage.local.get(['enabled', 'boldLevel', 'domainSettings', 'lastUsedLevel', 'mode'], function(result) {
    const domainSettings = result.domainSettings || {};
    const currentSettings = domainSettings[currentDomain];
    
    currentMode = result.mode || 'full';
    
    if (currentSettings) {
        // 使用当前域名的保存设置
        isEnabled = currentSettings.enabled;
        boldLevel = currentSettings.boldLevel;
    } else {
        // 使用全局设置或最后使用的设置
        isEnabled = result.enabled;
        boldLevel = result.lastUsedLevel || result.boldLevel || 'Focus';
    }
    
    if (isEnabled) {
        document.body.classList.add('bionic-active');
        if (currentMode === 'full') {
            processTextNodes(document.body);
        }
        saveDomainSettings();
    }
    
    // 初始化选区处理
    initializeSelectionHandler();
});

// 启动观察器
observeNewContent();
observeUrlChanges(); 