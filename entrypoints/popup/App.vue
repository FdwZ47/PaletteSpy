
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import PaletteItem from '@/components/PaletteItem.vue'

interface ElementStyle {
  fontFamily: string
  fontSize: string
  fontWeight: string
  color: string
  backgroundColor: string
  tagName: string
  className: string
  id: string
  url: string
  timestamp: number
}

interface SavedPalette {
  id: string
  styles: ElementStyle
  website: string
  timestamp: number
}

const palettes = ref<SavedPalette[]>([])
const loading = ref(true)
const isSpyModeActive = ref(false)
const currentTab = ref<any>(null)

const sortedPalettes = computed(() => {
  const palettesArray = Array.isArray(palettes.value) ? palettes.value : []
  return [...palettesArray].sort((a, b) => b.timestamp - a.timestamp)
})

async function loadPalettes() {
  try {
    
    const result = await browser.storage.local.get(['savedPalettes'])
    palettes.value = result.savedPalettes || []
    
  } catch (error) {
    console.error('Failed to load palettes:', error)
    palettes.value = []
  } finally {
    loading.value = false
  }
}

async function loadSpyModeState() {
  try {
    const tab = await getCurrentTab()
    if (!tab?.id) return
    
    const result = await browser.storage.local.get(['spyModeState'])
    const spyModeState = result.spyModeState || {}
    
    isSpyModeActive.value = spyModeState[tab.id] === true

  } catch (error) {
    console.error('Failed to load spy mode state:', error)
  }
}

async function getCurrentTab() {
  try {
    const tabs = await browser.tabs.query({ 
      active: true, 
      currentWindow: true 
    })
    currentTab.value = tabs[0]
    return tabs[0]
  } catch (error) {
    console.error('Failed to get current tab:', error)
    return null
  }
}

async function toggleSpyMode() {
  try {
    const tab = await getCurrentTab()
    if (!tab || !tab.id) {
      console.error('No active tab found')
      return
    }

    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('moz-extension://') || tab.url?.startsWith('about:')) {
      alert('PaletteSpy cannot run on browser internal pages. Please try on a regular webpage.')
      return
    }

    isSpyModeActive.value = !isSpyModeActive.value
    
    await saveSpyModeState(tab.id, isSpyModeActive.value)
    
    try {
      await Promise.race([
        browser.tabs.sendMessage(tab.id, {
          action: 'toggleSpyMode',
          active: isSpyModeActive.value
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 1000)
        )
      ])
    } catch (messageError: any) {
      if (messageError?.message?.includes('Receiving end does not exist') || 
          messageError?.message?.includes('Timeout')) {
        
        isSpyModeActive.value = !isSpyModeActive.value
        
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-scripts/content.js']
          })
          
          setTimeout(async () => {
            try {
              isSpyModeActive.value = !isSpyModeActive.value
              await saveSpyModeState(tab.id!, isSpyModeActive.value)
              await browser.tabs.sendMessage(tab.id!, {
                action: 'toggleSpyMode',
                active: isSpyModeActive.value
              })
            } catch (retryError) {
              console.error('Failed to toggle spy mode after injection:', retryError)
              isSpyModeActive.value = false
              await saveSpyModeState(tab.id!, false)
              alert('Failed to activate PaletteSpy. Please refresh the page and try again.')
            }
          }, 500)
        } catch (injectionError) {
          console.error('Failed to inject content script:', injectionError)
          alert('Cannot inject PaletteSpy into this page. Please try on a different webpage.')
        }
      } else {
        throw messageError
      }
    }
  } catch (error) {
    console.error('Failed to toggle spy mode:', error)
    isSpyModeActive.value = false
    if (currentTab.value?.id) {
      await saveSpyModeState(currentTab.value.id, false)
    }
    alert('Failed to toggle spy mode. Please make sure you\'re on a regular webpage and try again.')
  }
}

async function removePalette(paletteId: string) {
  try {
    const currentPalettes = Array.isArray(palettes.value) ? palettes.value : []
    const filteredPalettes = currentPalettes.filter(p => p.id !== paletteId)
    
    palettes.value = filteredPalettes
    
    await browser.storage.local.set({ savedPalettes: filteredPalettes })
    
  } catch (error) {
    console.error('Failed to remove palette:', error)
  }
}

async function clearAllPalettes() {
  if (confirm('Are you sure you want to clear all saved palettes?')) {
    try {
      palettes.value = []
      await browser.storage.local.set({ savedPalettes: [] })
      
    } catch (error) {
      console.error('Failed to clear palettes:', error)
    }
  }
}

async function saveSpyModeState(tabId: number, isActive: boolean) {
  try {
    const result = await browser.storage.local.get(['spyModeState'])
    const spyModeState = result.spyModeState || {}
    
    if (isActive) {
      spyModeState[tabId] = true
    } else {
      delete spyModeState[tabId]
    }
    
    await browser.storage.local.set({ spyModeState })
  
  } catch (error) {
    console.error('Failed to save spy mode state:', error)
  }
}

onMounted(async () => {
  loadPalettes()
  await getCurrentTab()
  await loadSpyModeState()
  
  browser.storage.onChanged.addListener((changes) => {
    if (changes.savedPalettes) {
      
      palettes.value = changes.savedPalettes.newValue || []
    }
    
    if (changes.spyModeState) {
      loadSpyModeState()
    }
  })
  
  browser.tabs.onActivated.addListener(() => {
    getCurrentTab()
    loadSpyModeState()
  })
})
</script>


<template>
  <div class="app">
    <header class="header">
      <div class="logo-section">
        <img src="/icon/48.png" alt="PaletteSpy" class="logo">
        <h1>PaletteSpy</h1>
      </div>
      <div class="header-actions">
        <button 
          @click="toggleSpyMode" 
          :class="['spy-toggle', { active: isSpyModeActive }]"
          :disabled="!currentTab"
        >
          <span class="spy-icon">🔎</span>
          {{ isSpyModeActive ? 'Stop Spying' : 'Start Spying' }}
        </button>
        <div class="stats">
          {{ palettes.length }} saved
        </div>
      </div>
    </header>

    <div class="instructions" v-if="palettes.length === 0">
    
    <span class="instruction-item">Start Spy Mode from the above button</span>

     <span class="instruction-item">Hover over text to see palette</span>
    
    <span class="instruction-item">Press <strong>S</strong> to save!</span>
  </div>

    <div class="content">
      <div v-if="loading" class="loading">
        Loading palettes...
      </div>
      
      <div v-else-if="palettes.length === 0" class="empty-state">
        <div class="empty-icon">🎨</div>
        <p>No colors saved yet!</p>
        <p class="empty-subtitle">
          Click the <strong>Start Spying</strong> button above to begin collecting colors and fonts from any webpage.
        </p>
      </div>
      
      <div v-else class="palettes-list">
        <div class="list-header">
          <h2>Your Palette Collection</h2>
          <div class="actions">
            <button @click="clearAllPalettes" class="btn-clear">Clear All</button>
          </div>
        </div>
        
        <div class="palettes-container">
          <PaletteItem 
            v-for="palette in sortedPalettes" 
            :key="palette.id"
            :palette="palette"
            @remove="removePalette"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="sass" scoped>
$crimson: #D7263D
$night: #02182B
$btn: #006989
$border: #EAEBED

.app
  width: 400px
  min-height: 500px
  background: linear-gradient(135deg, $night 0%, $crimson 100%)

.header
  display: flex
  justify-content: space-between
  align-items: center
  padding: 1rem
  color: white
  box-shadow: 1px 6px 8px rgba(0, 0, 0, 0.4)
  
.logo-section
  display: flex
  align-items: center
  gap: .7rem

.logo
  width: 35px
  height: 35px

h1
  font-size: 20px
  font-weight: 600
  margin: 0

.header-actions
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: .8rem

.spy-toggle
  background: rgba(0, 0, 0, 0.2)
  border: 3px solid rgba(255, 255, 255, 0.3)
  color: white
  padding: .5rem 1rem
  border-radius: 20px
  font-size: .8rem
  font-weight: 500
  cursor: pointer
  transition: all 0.2s ease
  display: flex
  align-items: center
  gap: .4rem
  &:hover:not(:disabled)
    background: rgba(255, 255, 255, 0.3)
    transform: translateY(-1px)
    color: $night
    font-weight: 600
  &:disabled
    opacity: 0.5
    cursor: not-allowed
  &.active
    background: $btn
    border-color: $border
    box-shadow: 0 0 10px rgba(40, 167, 69, 0.5)

.spy-icon
  font-size: .85rem

.stats
  background: rgba(0, 0, 0, 0.2)
  padding: .2rem .8rem
  border-radius: .8rem
  font-size: .8rem
  font-weight: 500
  color: white

.instructions
  padding: 1rem
  box-shadow: 2px 10px 7px rgba(0, 0, 0, 0.3)
  display: flex
  flex-direction: column
  gap: 1ch

.instruction-item
  width: fit-content
  margin-bottom: 1ch
  font-size: .8rem
  background: $border
  color: $night
  padding: .2rem .4rem
  border-radius: 100vw
  font-weight: 500
  &:last-child
    margin-bottom: 0
  strong
    background: $night
    padding-inline: .4rem
    color: $border
    border-radius: .4rem

.content
  padding: 1rem

.loading
  text-align: center
  padding: 2.8rem
  color: #6c757d

.empty-state
  text-align: center
  padding: 3rem 1.2rem
  .empty-icon
    font-size: 3rem
    margin-bottom: 1rem
  p
    color: $night
    font-weight: 700
    &.empty-subtitle
      color: #6c757d
      font-size: .9rem
      font-weight: 400
      color: rgba(255, 255, 255, .6)
      strong
        color: rgba(255, 255, 255, .8)

kbd
  background: #e9ecef
  padding: 2px 6px
  border-radius: 3px
  font-family: monospace
  font-size: .7rem

.list-header
  display: flex
  justify-content: space-between
  align-items: center
  margin-bottom: 1rem
  

h2
  font-size: 1.1rem
  font-weight: 600
  margin: 0
  color: $border

.actions
  display: flex
  gap: 8px

.btn-clear
  padding: .3rem .7rem
  border: none
  border-radius: 4px
  font-size: .8rem
  cursor: pointer
  transition: background-color 0.2s ease
  background: $night
  color: $border
  &:hover
    background: $btn

.palettes-container
  max-height: 400px
  overflow-y: auto
  

</style>
