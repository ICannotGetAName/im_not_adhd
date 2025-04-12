document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('toggle');
    const boldLevels = document.querySelectorAll('.bold-level');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const selectionTip = document.getElementById('selectionTip');
    const whitelistBtn = document.getElementById('whitelistBtn');
    const blacklistBtn = document.getElementById('blacklistBtn');
    const removeFromListBtn = document.getElementById('removeFromListBtn');
    const listStatus = document.getElementById('listStatus');
    let currentTab;
    let currentDomain;
    let currentMode = 'full';

    // 获取当前标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        currentTab = tabs[0];
        currentDomain = new URL(currentTab.url).hostname;
        
        // 加载保存的状态
        chrome.storage.local.get(['enabled', 'boldLevel', 'domainSettings', 'mode', 'whitelist', 'blacklist'], function(result) {
            const domainSettings = result.domainSettings || {};
            const currentSettings = domainSettings[currentDomain];
            const whitelist = result.whitelist || [];
            const blacklist = result.blacklist || [];
            
            // 更新白名单/黑名单状态
            updateListStatus(whitelist, blacklist);
            
            // 恢复模式设置
            currentMode = result.mode || 'full';
            updateModeUI(currentMode);
            
            // 如果在黑名单中，禁用开关
            if (blacklist.includes(currentDomain)) {
                toggle.checked = false;
                toggle.disabled = true;
                return;
            }
            
            // 如果在白名单中，强制启用
            if (whitelist.includes(currentDomain)) {
                toggle.checked = true;
                toggle.disabled = true;
            } else if (currentSettings) {
                // 使用当前域名的设置
                toggle.checked = currentSettings.enabled;
                const boldLevel = currentSettings.boldLevel;
                const activeLevel = document.querySelector(`[data-level="${boldLevel}"]`);
                if (activeLevel) {
                    boldLevels.forEach(l => l.classList.remove('active'));
                    activeLevel.classList.add('active');
                    activeLevel.querySelector('input[type="radio"]').checked = true;
                }
            } else {
                // 使用全局设置
                toggle.checked = result.enabled || false;
                const boldLevel = result.boldLevel || 'Focus';
                const activeLevel = document.querySelector(`[data-level="${boldLevel}"]`);
                if (activeLevel) {
                    activeLevel.classList.add('active');
                    activeLevel.querySelector('input[type="radio"]').checked = true;
                }
            }
        });
    });

    // 更新白名单/黑名单状态显示
    function updateListStatus(whitelist, blacklist) {
        if (blacklist.includes(currentDomain)) {
            listStatus.textContent = '当前网站在黑名单中';
            listStatus.style.color = '#f44336';
            whitelistBtn.disabled = true;
            blacklistBtn.disabled = true;
            removeFromListBtn.style.display = 'block';
        } else if (whitelist.includes(currentDomain)) {
            listStatus.textContent = '当前网站在白名单中';
            listStatus.style.color = '#4CAF50';
            whitelistBtn.disabled = true;
            blacklistBtn.disabled = true;
            removeFromListBtn.style.display = 'block';
        } else {
            listStatus.textContent = '';
            whitelistBtn.disabled = false;
            blacklistBtn.disabled = false;
            removeFromListBtn.style.display = 'none';
        }
    }

    // 处理白名单添加
    whitelistBtn.addEventListener('click', function() {
        chrome.storage.local.get(['whitelist', 'blacklist'], function(result) {
            const whitelist = result.whitelist || [];
            const blacklist = result.blacklist || [];
            
            if (!whitelist.includes(currentDomain)) {
                whitelist.push(currentDomain);
                chrome.storage.local.set({whitelist: whitelist}, function() {
                    updateListStatus(whitelist, blacklist);
                    toggle.checked = true;
                    toggle.disabled = true;
                    
                    // 发送消息到content script强制启用
                    chrome.tabs.sendMessage(currentTab.id, {
                        action: 'toggle',
                        enabled: true,
                        mode: currentMode,
                        isWhitelisted: true
                    });
                });
            }
        });
    });

    // 处理黑名单添加
    blacklistBtn.addEventListener('click', function() {
        chrome.storage.local.get(['whitelist', 'blacklist'], function(result) {
            const whitelist = result.whitelist || [];
            const blacklist = result.blacklist || [];
            
            if (!blacklist.includes(currentDomain)) {
                blacklist.push(currentDomain);
                chrome.storage.local.set({blacklist: blacklist}, function() {
                    updateListStatus(whitelist, blacklist);
                    toggle.checked = false;
                    toggle.disabled = true;
                    
                    // 发送消息到content script强制禁用
                    chrome.tabs.sendMessage(currentTab.id, {
                        action: 'toggle',
                        enabled: false,
                        mode: currentMode,
                        isBlacklisted: true
                    });
                });
            }
        });
    });

    // 处理从列表中移除
    removeFromListBtn.addEventListener('click', function() {
        chrome.storage.local.get(['whitelist', 'blacklist'], function(result) {
            let whitelist = result.whitelist || [];
            let blacklist = result.blacklist || [];
            
            // 从白名单和黑名单中移除当前域名
            whitelist = whitelist.filter(domain => domain !== currentDomain);
            blacklist = blacklist.filter(domain => domain !== currentDomain);
            
            chrome.storage.local.set({
                whitelist: whitelist,
                blacklist: blacklist
            }, function() {
                updateListStatus(whitelist, blacklist);
                toggle.disabled = false;
                
                // 发送消息到content script更新状态
                chrome.tabs.sendMessage(currentTab.id, {
                    action: 'toggle',
                    enabled: toggle.checked,
                    mode: currentMode,
                    isWhitelisted: false,
                    isBlacklisted: false
                });
            });
        });
    });

    // 处理模式切换
    modeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const mode = btn.dataset.mode;
            const wasEnabled = toggle.checked;
            currentMode = mode;
            
            // 更新UI
            updateModeUI(mode);
            
            // 保存模式设置
            chrome.storage.local.set({mode: mode});
            
            // 如果插件是开启状态，发送模式切换消息
            if (wasEnabled) {
                chrome.tabs.sendMessage(currentTab.id, {
                    action: 'changeMode',
                    mode: mode,
                    enabled: true
                });
            }
        });
    });

    // 更新模式UI
    function updateModeUI(mode) {
        modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        selectionTip.classList.toggle('show', mode === 'selection');
    }

    // 处理开关切换
    toggle.addEventListener('change', function() {
        const enabled = toggle.checked;
        
        // 保存全局设置
        chrome.storage.local.set({enabled: enabled});
        
        // 发送消息到content script
        chrome.tabs.sendMessage(currentTab.id, {
            action: 'toggle',
            enabled: enabled,
            mode: currentMode
        });
    });

    // 处理加粗级别切换
    boldLevels.forEach(level => {
        level.addEventListener('click', function() {
            // 更新UI
            boldLevels.forEach(l => l.classList.remove('active'));
            level.classList.add('active');
            level.querySelector('input[type="radio"]').checked = true;

            // 保存全局设置
            const newLevel = level.dataset.level;
            chrome.storage.local.set({
                boldLevel: newLevel,
                lastUsedLevel: newLevel
            });

            // 如果插件是开启状态，发送加粗级别变化消息
            if (toggle.checked) {
                chrome.tabs.sendMessage(currentTab.id, {
                    action: 'changeBoldLevel',
                    level: newLevel
                });
            }
        });
    });
}); 