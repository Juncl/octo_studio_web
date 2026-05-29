<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue"

export type ComposerMenu = "mode" | "style" | "settings"

export type ComposerModeOption = {
  id: string
  label: string
  icon: string
  dividerBefore?: boolean
  dividerAfter?: boolean
}

export type ComposerStyleOption = {
  id: string
  label: string
  icon: string
}

export type ComposerAspectOption = {
  id: string
  label: string
  width: number
  height: number
  pw: number
  ph: number
}

const props = defineProps<{
  modelValue: string
  loading: boolean
  canSubmit: boolean
  openMenu: ComposerMenu | null
  selectedModeId: string
  selectedStyleId: string
  selectedAspectId: string
  selectedImageCount: number
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
  toggleMenu: [menu: ComposerMenu]
  selectMode: [option: ComposerModeOption]
  selectStyle: [option: ComposerStyleOption]
  selectAspect: [option: ComposerAspectOption]
  selectImageCount: [count: number]
  submit: []
}>()

const composerModeOptions: ComposerModeOption[] = [
  { id: "image", label: "图片生成", icon: "▧" },
  { id: "video", label: "视频生成", icon: "▣", dividerAfter: true },
  { id: "upscale", label: "变清晰", icon: "HD" },
  { id: "cutout", label: "抠图", icon: "◌" },
  { id: "inpaint", label: "局部重绘", icon: "◒" },
  { id: "outpaint", label: "扩图", icon: "□" },
  { id: "scene", label: "场景融合", icon: "▨", dividerBefore: true }
]

const composerStyleOptions: ComposerStyleOption[] = [
  { id: "qianwen", label: "千问", icon: "✦" },
  { id: "bdicon", label: "BDIcon", icon: "☁" },
  { id: "portrait", label: "质感人像", icon: "人" },
  { id: "developer", label: "开发者人物形象", icon: "Dev" },
  { id: "agent", label: "小艺agent", icon: "AI" },
  { id: "smart3d", label: "智慧3D", icon: "3D" },
  { id: "abstract", label: "抽象几何背景", icon: "◍" },
  { id: "yunbao", label: "云宝", icon: "云" },
  { id: "hdesign", label: "HDesign", icon: "H" },
  { id: "harmony", label: "鸿蒙插画", icon: "鸿" },
  { id: "abstract3d", label: "3D抽象元素", icon: "◇" }
]

const composerAspectOptions: ComposerAspectOption[] = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024, pw: 20, ph: 20 },
  { id: "2:3", label: "2:3", width: 768, height: 1152, pw: 12, ph: 20 },
  { id: "3:4", label: "3:4", width: 864, height: 1152, pw: 14, ph: 20 },
  { id: "9:16", label: "9:16", width: 720, height: 1280, pw: 10, ph: 20 },
  { id: "3:2", label: "3:2", width: 1152, height: 768, pw: 20, ph: 12 },
  { id: "4:3", label: "4:3", width: 1152, height: 864, pw: 20, ph: 14 },
  { id: "16:9", label: "16:9", width: 1280, height: 720, pw: 20, ph: 10 }
]

const composerImageCountOptions = [1, 2, 3, 4]

const selectedMode = computed(() => {
  return composerModeOptions.find((o) => o.id === props.selectedModeId) ?? composerModeOptions[0]
})

const selectedStyle = computed(() => {
  return composerStyleOptions.find((o) => o.id === props.selectedStyleId) ?? composerStyleOptions[0]
})

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault()
    emit("submit")
  }
}

function handleDocumentClick(e: MouseEvent) {
  if (!props.openMenu) return
  const menuEl = document.querySelector(".workspace-composer-menu")
  if (menuEl && !menuEl.contains(e.target as Node)) {
    emit("toggleMenu", props.openMenu)
  }
}

onMounted(() => document.addEventListener("click", handleDocumentClick))
onUnmounted(() => document.removeEventListener("click", handleDocumentClick))
</script>

<template>
  <div class="composer">
    <div
      v-if="openMenu === 'mode'"
      class="workspace-composer-menu workspace-mode-menu"
    >
      <template
        v-for="option in composerModeOptions"
        :key="option.id"
      >
        <span
          v-if="option.dividerBefore"
          class="workspace-menu-divider"
        />
        <button
          type="button"
          :class="
            option.id === selectedModeId
              ? 'workspace-menu-option workspace-mode-option active'
              : 'workspace-menu-option workspace-mode-option'
          "
          @click="emit('selectMode', option)"
        >
          <span class="workspace-menu-option-content">
            <span class="workspace-menu-option-icon workspace-mode-option-icon">
              {{ option.icon }}
            </span>
            <span class="workspace-menu-option-label">{{ option.label }}</span>
          </span>
        </button>
        <span
          v-if="option.dividerAfter"
          class="workspace-menu-divider"
        />
      </template>
    </div>

    <div
      v-if="openMenu === 'style'"
      class="workspace-composer-menu workspace-style-menu"
    >
      <header class="workspace-style-menu-header">
        <h3 class="workspace-style-menu-title">风格模型</h3>
      </header>
      <div class="workspace-style-menu-grid">
        <button
          v-for="option in composerStyleOptions"
          :key="option.id"
          type="button"
          :class="
            option.id === selectedStyleId
              ? 'workspace-style-option active'
              : 'workspace-style-option'
          "
          @click="emit('selectStyle', option)"
        >
          <span
            :class="`workspace-style-option-icon workspace-style-option-icon-${option.id}`"
          >
            {{ option.icon }}
          </span>
          <span class="workspace-style-option-label">{{ option.label }}</span>
          <span
            v-if="option.id === selectedStyleId"
            class="workspace-style-option-check"
          />
        </button>
      </div>
    </div>

    <div
      v-if="openMenu === 'settings'"
      class="workspace-composer-menu workspace-settings-menu img"
    >
      <header class="workspace-settings-menu-header">
        <h3 class="workspace-settings-menu-title">图片设置</h3>
      </header>

      <section class="workspace-settings-section">
        <h4 class="workspace-settings-section-title">选择比例</h4>
        <div class="workspace-aspect-options">
          <button
            v-for="option in composerAspectOptions"
            :key="option.id"
            type="button"
            :class="
              option.id === selectedAspectId
                ? 'workspace-aspect-option active'
                : 'workspace-aspect-option'
            "
            @click="emit('selectAspect', option)"
          >
            <span class="workspace-aspect-preview-box">
              <span
              class="workspace-aspect-preview"
              :style="{ width: `${option.pw}px`, height: `${option.ph}px` }"
            ></span>
            </span>
            <span class="workspace-aspect-label">{{ option.label }}</span>
          </button>
        </div>
      </section>

      <section class="workspace-settings-section workspace-count-section">
        <h4 class="workspace-settings-section-title">图片数量</h4>
        <div class="workspace-count-options">
          <button
            v-for="count in composerImageCountOptions"
            :key="count"
            type="button"
            :class="
              count === selectedImageCount
                ? 'workspace-count-option active'
                : 'workspace-count-option'
            "
            @click="emit('selectImageCount', count)"
          >
            {{ count }}张
          </button>
        </div>
      </section>
    </div>

    <div class="composer-input-row">
      <button class="composer-ref-btn" type="button" />
      <textarea
        :value="modelValue"
        class="composer-input"
        :disabled="loading"
        placeholder="上传参考图、输入文字，描述你想生成的图片。"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @keydown="handleKeyDown"
      />
    </div>

    <div class="composer-toolbar">
      <button
        class="composer-mode-btn"
        type="button"
        :aria-expanded="openMenu === 'mode'"
        @click.stop="emit('toggleMenu', 'mode')"
      >
        <span class="composer-btn-label">{{ selectedMode.label }}</span>
        <span class="composer-btn-caret" />
      </button>

      <button
        class="composer-style-btn"
        type="button"
        :aria-expanded="openMenu === 'style'"
        @click.stop="emit('toggleMenu', 'style')"
      >
        <span class="composer-btn-label">{{ selectedStyle.label }}</span>
        <span class="composer-btn-caret" />
      </button>

      <button
        class="composer-settings-btn"
        type="button"
        aria-label="生成参数"
        title="生成参数"
        :aria-expanded="openMenu === 'settings'"
        @click.stop="emit('toggleMenu', 'settings')"
      >
        <span class="composer-btn-icon" />
      </button>

      <button
        class="composer-preset-btn"
        type="button"
        aria-label="预设面板"
        title="预设面板"
      >
        <span class="composer-btn-icon" />
      </button>

      <button
        class="composer-send-btn"
        :class="{ 'composer-send-btn--loading': loading }"
        type="button"
        :disabled="!canSubmit"
        @click="emit('submit')"
      />
    </div>
  </div>
</template>

<style scoped>
.composer {
  position: relative;
  container-type: inline-size;
  min-height: 150px;
  padding: 16px 14px 18px;
  border-radius: 24px;
  background:
    linear-gradient(#fff, #fff) padding-box,
    linear-gradient(
      135deg,
      rgba(246, 97, 23, 0.7) 1%,
      rgba(95, 45, 255, 0.7) 8%,
      rgba(61, 93, 255, 0.7) 22%,
      rgba(104, 138, 255, 0.7) 43%,
      rgba(28, 171, 111, 0.7) 54%,
      rgba(61, 93, 255, 0.7) 87%,
      rgba(206, 7, 232, 0.7) 92%
    ) border-box;
  box-shadow:
    0 0 5px rgba(0, 0, 0, 0.15),
    0 0 10px rgba(74, 81, 255, 0.3),
    0 0 20px rgba(89, 74, 255, 0.2);
}

.composer-input-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  min-height: 64px;
}

.composer-ref-btn {
  width: 52px;
  height: 64px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0;
  padding: 0;
  appearance: none;
  background: transparent;
  color: #8c99a3;
  font-size: 0;
}

.composer-ref-btn::before {
  content: "";
  width: 52px;
  height: 64px;
  background: url("/studio/IconAdd.svg") center / 52px 64px no-repeat;
}

.composer-input {
  width: 100%;
  min-height: 64px;
  resize: none;
  border: 0;
  outline: none;
  padding-top: 0;
  background: transparent;
  color: #191919;
  font-size: 14px;
  line-height: 22px;
}

.composer-input::placeholder {
  color: rgba(15, 23, 42, 0.45);
}

.composer-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
}

.composer-toolbar button {
  min-width: 44px;
  height: 32px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-btn-defalut);
  color: #191919;
  font-size: 14px;
  line-height: 22px;
  transition: background-color 0.15s ease;
}

.composer-toolbar button:hover {
  background: var(--studio-btn-hover);
}

.composer-mode-btn,
.composer-style-btn {
  gap: 6px;
}

.composer-btn-label {
  pointer-events: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-btn-caret {
  pointer-events: none;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  overflow: hidden;
  font-size: 0;
  background: url("/studio/chevron_down.svg") center / contain no-repeat;
}

.composer-mode-btn {
  width: 98px;
  min-width: 98px;
  max-width: 98px;
  gap: 2px;
  overflow: hidden;
  white-space: nowrap;
}

.composer-style-btn {
  width: 70px;
  min-width: 70px;
  max-width: 70px;
  gap: 2px;
  overflow: hidden;
  white-space: nowrap;
}

.composer-toolbar .composer-settings-btn,
.composer-toolbar .composer-preset-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  max-height: 32px;
  padding: 0;
  font-size: 0;
}

.composer-btn-icon {
  pointer-events: none;
  width: 16px;
  height: 16px;
  display: block;
  overflow: hidden;
  font-size: 0;
  background: #191919;
}

.composer-settings-btn .composer-btn-icon {
  mask: url("/studio/IconParameter.svg") center / contain no-repeat;
  -webkit-mask: url("/studio/IconParameter.svg") center / contain no-repeat;
}

.composer-preset-btn .composer-btn-icon {
  mask: url("/studio/IconMaterial.svg") center / contain no-repeat;
  -webkit-mask: url("/studio/IconMaterial.svg") center / contain no-repeat;
}

.composer-send-btn {
  position: relative;
  min-width: 32px;
  max-width: 32px;
  width: 32px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
  color: inherit;
  font-size: 0;
  box-shadow: none;
  margin-left: auto;
  padding: 0;
}

.composer-toolbar .composer-send-btn {
  min-width: 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 0;
  background: transparent;
}

.composer-toolbar .composer-send-btn:hover,
.composer-toolbar .composer-send-btn:active {
  background: transparent;
  box-shadow: none;
  filter: none;
  transform: none;
}

.composer-send-btn::before {
  content: "";
  position: absolute;
  left: 50%;
  top: calc(50% - 0px);
  width: 52px;
  height: 52px;
  pointer-events: none;
  background: url(/studio/IconSend-blue.svg) center 6px / 50px 50px no-repeat !important;
  transform: translate(-50%, -50%);
}

.composer-send-btn:disabled {
  opacity: 0.45;
}

/* Menu styles (unchanged, already shared) */

.workspace-composer-menu {
  position: absolute;
  z-index: 30;
  bottom: 60px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(18px);
}

.workspace-composer-menu.img {
  left: 188px;
}

.workspace-mode-menu {
  left: 16px;
  width: 175px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
}

.workspace-menu-option {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #191919;
  text-align: left;
  font-size: 14px;
}

.workspace-menu-option.active {
  background: #f3f3f3;
}

.workspace-menu-option:hover {
  background: #dfdfdf;
}

.workspace-menu-divider {
  height: 1px;
  margin: 0 12px;
  background: rgba(0, 0, 0, 0.1);
}

.workspace-menu-option-content {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.workspace-menu-option-icon {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--studio-blue);
  font-size: 0;
  font-weight: 800;
}

.workspace-mode-option-icon {
  background: url("/studio/imgCreate1.svg") center / contain no-repeat;
}

.workspace-mode-option:nth-of-type(2) .workspace-mode-option-icon {
  background-image: url("/studio/imgCreate2.svg");
}

.workspace-mode-option:nth-of-type(3) .workspace-mode-option-icon {
  background-image: url("/studio/imgCreate3.svg");
}

.workspace-mode-option:nth-of-type(4) .workspace-mode-option-icon {
  background-image: url("/studio/imgCreate4.svg");
}

.workspace-mode-option:nth-of-type(5) .workspace-mode-option-icon {
  background-image: url("/studio/imgCreate5.svg");
}

.workspace-mode-option:nth-of-type(6) .workspace-mode-option-icon {
  background-image: url("/studio/imgCreate6.svg");
}

.workspace-mode-option:nth-of-type(7) .workspace-mode-option-icon {
  background-image: url("/studio/imgCreate7.svg");
}

.workspace-menu-option-label {
  overflow: hidden;
  color: #191919;
  font-size: 14px;
  line-height: 22px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.workspace-menu-option-check {
  margin-left: auto;
  color: #191919;
  font-size: 14px;
}

.workspace-style-menu {
  left: 118px;
  padding: 16px;
  width: min(414px, calc(100vw - 130px));
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(18px);
  border-radius: 12px;
}

.workspace-style-menu-header {
  margin-bottom: 16px;
}

.workspace-style-menu-title {
  margin: 0;
  color: #191919;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}

.workspace-style-menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-style-option {
  min-width: 0;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(25, 25, 25, 1);
  text-align: left;
  font-size: 14px;
}

.workspace-style-option.active {
  background: var(--studio-btn-defalut);
}

.workspace-style-option:hover {
  background: var(--studio-btn-hover);
}

.workspace-style-option-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  color: transparent;
  font-size: 0;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}

.workspace-style-option-icon-qianwen { background-image: url("/studio/studioModel1.png"); }
.workspace-style-option-icon-bdicon { background-image: url("/studio/studioModel2.png"); }
.workspace-style-option-icon-portrait { background-image: url("/studio/studioModel3.png"); }
.workspace-style-option-icon-developer { background-image: url("/studio/studioModel4.png"); }
.workspace-style-option-icon-agent { background-image: url("/studio/studioModel5.png"); }
.workspace-style-option-icon-smart3d { background-image: url("/studio/studioModel6.png"); }
.workspace-style-option-icon-abstract { background-image: url("/studio/studioModel7.png"); }
.workspace-style-option-icon-yunbao { background-image: url("/studio/studioModel8.png"); }
.workspace-style-option-icon-hdesign { background-image: url("/studio/studioModel9.png"); }
.workspace-style-option-icon-harmony { background-image: url("/studio/studioModel10.png"); }
.workspace-style-option-icon-abstract3d { background-image: url("/studio/studioModel11.png"); }

.workspace-style-option-label {
  overflow: hidden;
  font-size: 14px;
  color: #191919;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.workspace-style-option-check {
  margin-left: auto;
  font-size: 14px;
  width: 16px;
  height: 16px;
  margin-right: 4px;
  background: url("/studio/checkmark.svg") center / contain no-repeat;
}

.workspace-settings-menu {
  left: 16px;
  width: min(530px, calc(100vw - 80px));
  padding: 16px;
}

.workspace-settings-menu-header {
  margin-bottom: 16px;
}

.workspace-settings-menu-title {
  margin: 0;
  color: #191919;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  line-height: 22px;
}

.workspace-settings-section {
  margin-top: 0;
}

.workspace-count-section {
  margin-top: 18px;
}

.workspace-settings-section-title {
  margin: 0 0 8px;
  color: var(--studio-muted);
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  text-align: left;
}

.workspace-aspect-options,
.workspace-count-options {
  display: grid;
  overflow: hidden;
  border-radius: 8px;
  background: #F4F4F4;
}

.workspace-aspect-options {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-height: 54px;
  gap: 4px;
  padding: 4px;
}

.workspace-aspect-option,
.workspace-count-option {
  min-width: 0;
  border: 0;
  background: transparent;
  color: #191919;
}

.workspace-aspect-option {
  min-height: 54px;
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 6px 4px;
  border: 1px solid transparent;
  border-radius: 7px;
}

.workspace-aspect-option.active,
.workspace-count-option.active {
  border-color: #fff;
  background: #fff;
}

.workspace-aspect-option:hover,
.workspace-count-option:hover {
  background: rgba(255, 255, 255, 0.78);
}

.workspace-aspect-preview-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}
.workspace-aspect-preview {
  display: block;
  flex-shrink: 0;
  border: 1.5px solid #111827;
  border-radius: 2px;
}

.workspace-aspect-label {
  font-size: 12px;
  line-height: 1.2;
}

.workspace-aspect-option.active .workspace-aspect-label,
.workspace-count-option.active {
  font-weight: 800;
}

.workspace-count-options {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 4px;
  gap: 4px;
}

.workspace-count-option {
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 12px;
}

@keyframes composerSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
