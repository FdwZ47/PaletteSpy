<script setup lang="ts">
import { computed } from 'vue'

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

interface Props {
  palette: SavedPalette
}

const props = defineProps<Props>()
const emit = defineEmits<{
  remove: [id: string]
}>()

const colorHex = computed(() => rgbToHex(props.palette.styles.color))
const bgColorHex = computed(() => rgbToHex(props.palette.styles.backgroundColor))
const fontFamily = computed(() => 
  props.palette.styles.fontFamily.split(',')[0].replace(/['"]/g, '')
)

function rgbToHex(rgb: string): string {
  if (rgb.startsWith('#')) return rgb
  
  const result = rgb.match(/\d+/g)
  if (!result) return rgb
  
  const [r, g, b] = result.map(Number)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
   
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function copyCSS() {
  const css = `
/* ${props.palette.styles.tagName}${props.palette.styles.id ? '#' + props.palette.styles.id : ''}${props.palette.styles.className ? '.' + props.palette.styles.className.split(' ')[0] : ''} */
color: ${colorHex.value};
background-color: ${bgColorHex.value};
font-family: ${props.palette.styles.fontFamily};
font-size: ${props.palette.styles.fontSize};
font-weight: ${props.palette.styles.fontWeight};
`.trim()
  
  copyToClipboard(css)
}
</script>

<template>
  <div class="palette-item">
    <div class="palette-header">
      <div class="element-info">
        <span class="tag">{{ palette.styles.tagName }}</span>
        <span v-if="palette.styles.id" class="id">#{{ palette.styles.id }}</span>
        <span v-if="palette.styles.className" class="class">.{{ palette.styles.className.split(' ')[0] }}</span>
      </div>
      <div class="website">{{ palette.website }}</div>
    </div>
    
    <div class="colors-section">
      <div class="color-group">
        <label>Text Color</label>
        <div class="color-display">
          <div 
            class="color-swatch" 
            :style="{ backgroundColor: palette.styles.color }"
            @click="copyToClipboard(colorHex)"
          ></div>
          <span class="color-hex">{{ colorHex }}</span>
        </div>
      </div>
      
      <div class="color-group">
        <label>Background</label>
        <div class="color-display">
          <div 
            class="color-swatch" 
            :style="{ backgroundColor: palette.styles.backgroundColor }"
            @click="copyToClipboard(bgColorHex)"
          ></div>
          <span class="color-hex">{{ bgColorHex }}</span>
        </div>
      </div>
    </div>
    
    <div class="font-section">
      <div class="font-info">
        <span class="font-family">{{ fontFamily }}</span>
        <span class="font-details">{{ palette.styles.fontSize }} • {{ palette.styles.fontWeight }}</span>
      </div>
    </div>
    
    <div class="actions">
      <button @click="copyCSS" class="btn-copy">Copy CSS</button>
      <button @click="$emit('remove', palette.id)" class="btn-remove">🗑️</button>
    </div>
  </div>
</template>

<style lang="sass" scoped>
$pale: #FADFCA
$teal: #418994
$night: #02182B
$spice: #F68238

.palette-item
  background: $pale
  border: 2px solid $teal
  border-radius: .5rem
  padding: 1rem
  margin-bottom: 12px
  transition: all 0.2s ease
  &:hover
    border-color: $night

.palette-header
  display: flex
  justify-content: space-between
  align-items: center
  margin-bottom: .75rem
  

.element-info
  display: flex
  gap: 4px
  align-items: center

.tag
  background: $spice
  color: $night
  padding: .1rem .31rem
  border-radius: 4px
  font-size: .72rem
  font-weight: 500

.id
  background: #a7c957 
  color: #183a37
  padding: .1rem .3rem
  border-radius: 4px
  font-size: .75rem

.class
  background: #ffc107
  color: #183a37
  padding: .1rem .3rem
  border-radius: 4px
  font-size: .7rem

.website
  font-size: .68rem
  color: #6c757d
  font-weight: 500

.colors-section
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 12px
  margin-bottom: .8rem

.color-group
  label
    display: block
    font-size: 11px
    color: $night
    margin-bottom: .2rem
    text-transform: uppercase
    font-weight: 500

.color-display
  display: flex
  align-items: center
  gap: 8px

.color-swatch
  width: 1.5rem
  height: 1.5rem
  border-radius: .2rem
  border: 1px dashed $night
  cursor: pointer
  transition: all 0.1s ease

  &:hover
    transform: scale(1.3)
    border: 2px solid $night

.color-hex
  font-family: 'Monaco', 'Menlo', monospace
  font-size: .75rem
  color: #495057

.font-section
  margin-bottom: .65rem
  padding: .65rem
  background: rgba(0, 0, 0, 0.1)
  border-radius: .6rem
  transition: all .2s linear
  &:hover
    background: $night
    .font-family
      color: $pale
    .font-details
      color: $spice

.font-info
  display: flex
  flex-direction: column
  gap: 4px

.font-family
  font-weight: 600
  color: $night

.font-details
  font-size: .75rem
  color: #6c757d

.actions
  display: flex
  gap: 8px

.btn-copy, .btn-remove
  padding: .5rem .7rem
  border: none
  border-radius: .3rem
  font-size: 12px
  cursor: pointer
  transition: background-color 0.2s ease

.btn-copy
  background: #2d1e3e
  color: #bd5e8e
  font-weight: 600
  &:hover
    background: $teal
    color: $night

.btn-remove
  background: #D7263D
  font-size: .9rem
  transition: all .2s ease
  &:hover
    scale: 1.08
</style>