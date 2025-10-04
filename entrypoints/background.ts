export default defineBackground(() => {
  console.log('PaletteSpy started 👍', { id: browser.runtime.id });
  
  browser.tabs.onRemoved.addListener(async (tabId) => {
    try {
      const result = await browser.storage.local.get(['spyModeState']);
      const spyModeState = result.spyModeState || {};
      
      if (spyModeState[tabId]) {
        delete spyModeState[tabId];
        await browser.storage.local.set({ spyModeState });
       
      }
    } catch (error) {
      console.error('Error cleaning up tab state:', error);
    }
  });
  
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'loading' && changeInfo.url) {
      try {
        const result = await browser.storage.local.get(['spyModeState']);
        const spyModeState = result.spyModeState || {};
        
        if (spyModeState[tabId]) {
          delete spyModeState[tabId];
          await browser.storage.local.set({ spyModeState });
          
        }
      } catch (error) {
        console.error('Error resetting tab state:', error);
      }
    }
  });
});
