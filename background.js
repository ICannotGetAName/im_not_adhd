// 存储上次处理的时间戳
let lastProcessedTime = 0;

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 检查页面是否完全加载完成
    if (changeInfo.status === 'complete' && tab.url) {
        // 避免在短时间内重复处理
        const currentTime = Date.now();
        if (currentTime - lastProcessedTime < 1000) {
            return;
        }
        lastProcessedTime = currentTime;

        // 获取当前插件状态
        chrome.storage.local.get(['enabled'], function(result) {
            if (result.enabled) {
                // 确保页面已经完全加载
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'toggle',
                        enabled: true
                    }, (response) => {
                        // 处理可能的错误
                        if (chrome.runtime.lastError) {
                            console.log('重试处理页面');
                            // 如果消息发送失败，稍后重试
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabId, {
                                    action: 'toggle',
                                    enabled: true
                                });
                            }, 1000);
                        }
                    });
                }, 500);
            }
        });
    }
});

// 监听导航完成事件
chrome.webNavigation?.onCompleted.addListener((details) => {
    if (details.frameId === 0) { // 只处理主框架
        chrome.storage.local.get(['enabled'], function(result) {
            if (result.enabled) {
                setTimeout(() => {
                    chrome.tabs.sendMessage(details.tabId, {
                        action: 'toggle',
                        enabled: true
                    });
                }, 500);
            }
        });
    }
}); 