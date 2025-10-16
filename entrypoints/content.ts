export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('PaletteSpy: Content script loaded');
    
    try {
      browser.runtime.sendMessage({ action: 'contentScriptReady' }).catch(() => {});
    } catch (e) {}
    
    let isActive = false;
    let currentTooltip: HTMLDivElement | null = null;
    let lastHoveredElement: HTMLElement | null = null;
    let currentStyles: ElementStyle | null = null;
    let debounceTimeout: number | null = null;

    interface ElementStyle {
      fontFamily: string;
      fontSize: string;
      fontWeight: string;
      color: string;
      backgroundColor: string;
      tagName: string;
      className: string;
      id: string;
      url: string;
      timestamp: number;
    }

    interface SavedPalette {
      id: string;
      styles: ElementStyle;
      website: string;
      timestamp: number;
    }

    function hasInterestingStyles(element: HTMLElement, computedStyles: CSSStyleDeclaration): boolean {
      const tagName = element.tagName.toLowerCase();
      
      if (tagName === 'img') return true;
      
      const structuralTags = ['html', 'body', 'head', 'script', 'style', 'meta', 'link', 'br', 'hr'];
      if (structuralTags.includes(tagName)) return false;
      
      const rect = element.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return false;
      
      const containerTags = ['div', 'section', 'article', 'aside', 'main', 'nav', 'header', 'footer'];
      if (containerTags.includes(tagName)) {
        const directText = Array.from(element.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent?.trim() || '')
          .join('');
        
        if (!directText || directText.length < 3) {
          const bgColor = computedStyles.backgroundColor;
          const hasSolidBg = bgColor && 
                            bgColor !== 'rgba(0, 0, 0, 0)' && 
                            bgColor !== 'transparent' && 
                            !bgColor.includes('rgba') &&
                            bgColor.startsWith('rgb(');
          
          if (!hasSolidBg || rect.width < 50 || rect.height < 30) {
            return false;
          }
        }
      }
      
      const bgColor = computedStyles.backgroundColor;
      const hasBgColor = !!(bgColor && 
                         bgColor !== 'rgba(0, 0, 0, 0)' && 
                         bgColor !== 'transparent' && 
                         bgColor !== 'initial' &&
                         bgColor !== 'rgb(255, 255, 255)' &&
                         !bgColor.match(/rgba?\([^)]*,\s*0\)/));
      
      const textColor = computedStyles.color;
      const hasTextColor = !!(textColor && 
                            textColor !== 'rgb(0, 0, 0)' && 
                            textColor !== 'rgb(255, 255, 255)');
      
      const fontFamily = computedStyles.fontFamily.toLowerCase();
      const hasFont = !!(fontFamily && 
                      !fontFamily.includes('times') &&
                      !fontFamily.includes('serif') &&
                      !fontFamily.includes('sans-serif') &&
                      fontFamily !== 'initial');
      
      const interestingCount = [hasBgColor, hasTextColor, hasFont].filter(Boolean).length;
      return interestingCount >= 1;
    }

    function extractElementStyles(element: HTMLElement): ElementStyle | null {
      let styles: ElementStyle;
      
      try {
        const computedStyles = window.getComputedStyle(element);
        
        if (!hasInterestingStyles(element, computedStyles)) {
          return null;
        }
        
        const tagName = element.tagName.toLowerCase();
        let className = '';
        
        try {
          className = element.className ? String(element.className) : '';
          if (className && typeof className === 'string' && className.includes(' ')) {
            className = className.split(' ')[0];
          }
        } catch (e) {
          className = '';
        }

        if (tagName === 'img') {
          const imgElement = element as HTMLImageElement;
          styles = {
            tagName: tagName,
            id: element.id || '',
            className: className,
            color: 'transparent',
            backgroundColor: computedStyles.backgroundColor || 'transparent',
            fontFamily: 'N/A (Image)',
            fontSize: `${imgElement.width}x${imgElement.height}px`,
            fontWeight: 'N/A',
            url: window.location.href,
            timestamp: Date.now(),
          };
        } else {
          styles = {
            tagName: tagName,
            id: element.id || '',
            className: className,
            color: computedStyles.color || 'rgb(0, 0, 0)',
            backgroundColor: computedStyles.backgroundColor || 'rgba(0, 0, 0, 0)',
            fontFamily: computedStyles.fontFamily || 'serif',
            fontSize: computedStyles.fontSize || '16px',
            fontWeight: computedStyles.fontWeight || '400',
            url: window.location.href,
            timestamp: Date.now(),
          };
        }
      } catch (error) {
        console.error('Error extracting styles:', error);
        return null;
      }
      
      return styles;
    }

    function isExtensionContextValid(): boolean {
      try {
        return !!(browser?.runtime?.id);
      } catch (e) {
        return false;
      }
    }

    async function saveToStorage(styles: ElementStyle): Promise<boolean> {
      console.group('💾 PaletteSpy Save Process');
      
      try {
        if (!isExtensionContextValid()) {
          console.error('⚠️ Extension context is invalid - extension may have been reloaded');
          console.error('💡 Please refresh the page and try again');
          console.groupEnd();
          
          showSaveConfirmation(false, 'Extension reloaded - please refresh page');
          return false;
        }        
        const paletteItem = {
          id: `palette_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          website: window.location.hostname,
          styles: {
            fontFamily: styles.fontFamily,
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            color: styles.color,
            backgroundColor: styles.backgroundColor,
            tagName: styles.tagName,
            className: styles.className,
            id: styles.id,
            url: window.location.href,
            timestamp: styles.timestamp
          }
        };
        
        let existingPalettes = [];
        try {
          const result = await browser.storage.local.get(['savedPalettes']);          
          existingPalettes = Array.isArray(result.savedPalettes) ? result.savedPalettes : [];

        } catch (getError) {
          if (getError instanceof Error && getError.message.includes('Extension context invalidated')) {
            console.error('⚠️ Extension context invalidated - please refresh the page');
            showSaveConfirmation(false, 'Extension reloaded - refresh page');
            return false;
          }
          console.error('⚠️ Error getting storage (continuing with empty array):', getError);
          existingPalettes = [];
        }

        const updatedPalettes = [...existingPalettes, paletteItem];

        await browser.storage.local.set({ savedPalettes: updatedPalettes });

        return true;
      } catch (error) {
        if (error instanceof Error && error.message.includes('Extension context invalidated')) {
          console.error('⚠️ Extension context invalidated during save');
          console.groupEnd();
          showSaveConfirmation(false, 'Extension reloaded - refresh page');
          return false;
        }
        
        console.error('❌ Fatal error in save process:', error);
        console.error('Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack'
        });
        console.groupEnd();
        return false;
      }
    }

    function showSaveConfirmation(success: boolean, customMessage?: string) {
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000000;
        background: ${success ? '#4CAF50' : '#f44336'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        transform: translateX(400px);
        transition: transform 0.3s ease;
        max-width: 300px;
      `;
      
      const message = customMessage || (success ? '✓ Saved to palette!' : '✗ Failed to save');
      notification.textContent = message;
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.transform = 'translateX(0)';
      }, 10);
      
      setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 2000);
    }

    function rgbToHex(rgb: string): string {
      if (rgb.startsWith('#')) return rgb;
      
      const result = rgb.match(/\d+/g);
      if (!result) return rgb;
      
      const [r, g, b] = result.map(Number);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    function showTooltip(element: HTMLElement, styles: ElementStyle, event: MouseEvent) {
      if (currentTooltip) {
        currentTooltip.remove();
      }

      if (element.id === 'palette-spy-tooltip' || 
          element.id === 'palette-spy-indicator' ||
          element.closest('#palette-spy-tooltip') ||
          element.closest('#palette-spy-indicator')) {
        return;
      }

      const tooltip = document.createElement('div');
      tooltip.id = 'palette-spy-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        z-index: 999999;
        background: linear-gradient(135deg, rgba(20, 20, 20, 0.98), rgba(40, 40, 40, 0.98));
        color: white;
        padding: 12px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        line-height: 1.5;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);
        pointer-events: none;
        min-width: 200px;
        backdrop-filter: blur(10px);
      `;

      const textColor = styles.color;
      const bgColor = styles.backgroundColor;
      const textHex = rgbToHex(textColor);
      const bgHex = rgbToHex(bgColor);
      
      const hasTextColor = textColor && textColor !== 'rgb(0, 0, 0)' && textColor !== 'rgba(0, 0, 0, 0)' && textColor !== 'transparent';
      const hasBgColor = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' && bgColor !== 'initial';
      
      let colorSwatchesHTML = '';
      if (styles.tagName === 'img') {
        colorSwatchesHTML = `
          <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 8px; text-align: center;">
            🖼️ <strong>Image</strong> (${styles.fontSize})
          </div>
        `;
      } else {
        if (hasBgColor || hasTextColor) {
          colorSwatchesHTML = '<div style="display: flex; gap: 8px; margin-bottom: 10px;">';
          
          if (hasBgColor) {
            colorSwatchesHTML += `
              <div style="flex: 1; text-align: center;">
                <div style="width: 100%; height: 40px; background: ${bgColor}; border-radius: 6px; border: 2px solid rgba(255,255,255,0.2); margin-bottom: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
                <div style="font-size: 10px; opacity: 0.7;">Background</div>
                <div style="font-weight: bold; font-family: monospace; font-size: 11px;">${bgHex}</div>
              </div>
            `;
          }
          
          if (hasTextColor) {
            colorSwatchesHTML += `
              <div style="flex: 1; text-align: center;">
                <div style="width: 100%; height: 40px; background: ${textColor}; border-radius: 6px; border: 2px solid rgba(255,255,255,0.2); margin-bottom: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
                <div style="font-size: 10px; opacity: 0.7;">Text</div>
                <div style="font-weight: bold; font-family: monospace; font-size: 11px;">${textHex}</div>
              </div>
            `;
          }
          
          colorSwatchesHTML += '</div>';
        }
      }
      
      let fontInfoHTML = '';
      if (styles.tagName !== 'img') {
        const fontFamily = styles.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const fontSize = styles.fontSize;
        const fontWeight = styles.fontWeight;
        
        if (fontFamily !== 'serif' && fontFamily !== 'Times') {
          fontInfoHTML += `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px solid rgba(255,255,255,0.1);">
              <span style="opacity: 0.7;">Font:</span>
              <span style="font-weight: 500;">${fontFamily}</span>
            </div>
          `;
        }
        
        if (fontSize || fontWeight !== '400') {
          fontInfoHTML += `
            <div style="display: flex; justify-content: space-between; padding: 4px 0;">
              <span style="opacity: 0.7;">Size/Weight:</span>
              <span style="font-weight: 500;">${fontSize} / ${fontWeight}</span>
            </div>
          `;
        }
      }

      tooltip.innerHTML = `
        ${colorSwatchesHTML}
        ${fontInfoHTML}
        <div style="margin-top: 10px; padding: 8px; background: rgba(100, 108, 255, 0.2); border-radius: 4px; text-align: center; border: 1px solid rgba(100, 108, 255, 0.5);">
          <span style="font-size: 11px;">Press <kbd style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 3px; font-weight: bold;">S</kbd> to save</span>
        </div>
      `;

      const tooltipX = Math.min(event.clientX + 15, window.innerWidth - 250);
      const tooltipY = Math.max(event.clientY - 10, 10);

      tooltip.style.left = tooltipX + 'px';
      tooltip.style.top = tooltipY + 'px';

      document.body.appendChild(tooltip);
      currentTooltip = tooltip;
    }

    function updateTooltipPosition(event: MouseEvent) {
      if (currentTooltip) {
        const tooltipX = Math.min(event.clientX + 15, window.innerWidth - 250);
        const tooltipY = Math.max(event.clientY - 10, 10);
        
        currentTooltip.style.left = tooltipX + 'px';
        currentTooltip.style.top = tooltipY + 'px';
      }
    }

    function handleMouseMove(event: MouseEvent) {
      if (!isActive) return;

      const element = event.target as HTMLElement;
      
      updateTooltipPosition(event);
      
      if (element === lastHoveredElement) return;

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = window.setTimeout(() => {
        lastHoveredElement = element;
        const extractedStyles = extractElementStyles(element);
                
        if (extractedStyles) {
          currentStyles = extractedStyles;
          showTooltip(element, currentStyles, event);
        } else {
          if (currentTooltip) {
            currentTooltip.remove();
            currentTooltip = null;
          }
          currentStyles = null;
        }
      }, 30);
    }

    async function handleKeyPress(event: KeyboardEvent) {
      if (!isActive || !currentStyles) return;
      
      if (event.key.toLowerCase() === 's' && currentTooltip) {
        event.preventDefault();
        event.stopPropagation();
                
        if (currentTooltip) {
          currentTooltip.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.98), rgba(56, 142, 60, 0.98))';
          const savingMsg = currentTooltip.querySelector('div:last-child');
          if (savingMsg) {
            savingMsg.innerHTML = '<span style="font-size: 12px;">⏳ Saving...</span>';
          }
        }
        
        const success = await saveToStorage(currentStyles);
        
        if (success) {
          if (currentTooltip) {
            const msg = currentTooltip.querySelector('div:last-child');
            if (msg) {
              msg.innerHTML = '<span style="font-size: 12px; font-weight: bold;">✓ Saved to palette!</span>';
            }
          }
          showSaveConfirmation(true);
          
          setTimeout(() => {
            if (currentTooltip) {
              currentTooltip.remove();
              currentTooltip = null;
            }
          }, 1000);
        } else {
          console.error('❌ Save failed!');
          if (currentTooltip) {
            currentTooltip.style.background = 'linear-gradient(135deg, rgba(244, 67, 54, 0.98), rgba(211, 47, 47, 0.98))';
            const msg = currentTooltip.querySelector('div:last-child');
            if (msg) {
              msg.innerHTML = '<span style="font-size: 12px;">✗ Save failed!</span>';
            }
          }
          showSaveConfirmation(false);
        }
      }
    }

    function handleMouseLeave() {
      if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
      }
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
      }
      lastHoveredElement = null;
      currentStyles = null;
    }

    function setSpyMode(active: boolean) {
      isActive = active;
      
      if (isActive) {
        document.body.style.cursor = 'crosshair';
        document.addEventListener('keydown', handleKeyPress);
        showSpyModeIndicator(true);
      } else {
        document.body.style.cursor = '';
        document.removeEventListener('keydown', handleKeyPress);
        handleMouseLeave();
        showSpyModeIndicator(false);
      }
    }

    function showSpyModeIndicator(show: boolean) {
      const existingIndicator = document.getElementById('palette-spy-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }

      if (show) {
        const indicator = document.createElement('div');
        indicator.id = 'palette-spy-indicator';
        indicator.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000000;
          pointer-events: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 20px;
          border-radius: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
          pointer-events: none;
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          gap: 10px;
        `;
        
        indicator.innerHTML = `
          <span style="font-size: 18px;">👁️</span>
          <div>
            <div style="font-size: 13px; margin-bottom: 2px;">PaletteSpy Active</div>
            <div style="font-size: 10px; opacity: 0.9; font-weight: normal;">
              Hover element, press <kbd style="background: rgba(255,255,255,0.25); padding: 1px 5px; border-radius: 3px; font-weight: bold;">S</kbd> to save
            </div>
          </div>
        `;
        
        document.body.appendChild(indicator);
      }
    }

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      
      if (message.action === 'toggleSpyMode') {
        setSpyMode(message.active);
        sendResponse({ success: true, active: isActive });
        return true;
      }
      
      return false;
    });

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('keydown', handleKeyPress);
      if (currentTooltip) {
        currentTooltip.remove();
      }
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      document.body.style.cursor = '';
      const indicator = document.getElementById('palette-spy-indicator');
      if (indicator) {
        indicator.remove();
      }
    };
  },
});
