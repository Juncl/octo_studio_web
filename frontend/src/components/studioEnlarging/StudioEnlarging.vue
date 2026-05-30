<script setup lang="ts">
import { nextTick, ref, watch } from "vue"
import StudioEnlargingKonva from "./StudioEnlargingKonva.vue"

export type EnlargingImage = {
  id: string
  name: string
  src: string
  base64: string
  width: number
  height: number
}

type DistanceResult = {
  left: number
  right: number
  top: number
  bottom: number
  realWidth: number
  realHeight: number
}

export type OutpaintGeneratePayload = {
  prompt: string
  imageBase64: string
  left: number
  right: number
  top: number
  bottom: number
  realWidth: number
  realHeight: number
  numImage: 1
  sourceImage: {
    id: string
    name: string
    width: number
    height: number
  }
  ratio?: string
}

const props = defineProps<{
  image: EnlargingImage
}>()

const emit = defineEmits<{
  close: []
  generate: [params: OutpaintGeneratePayload]
}>()

const ratioOptions = [
  { name: "1:1", valueKey: 0 },
  { name: "9:16", valueKey: 1 },
  { name: "16:9", valueKey: 2 }
]

const imageElement = ref<HTMLImageElement | null>(null)
const showCanvas = ref(false)
const prompt = ref("")
const enlargingAble = ref(false)
const selectedRatioKey = ref<number | null>(null)
const creating = ref(false)
const loadError = ref("")
const konvaRef = ref<InstanceType<typeof StudioEnlargingKonva> | null>(null)

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()

    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = src
  })
}

async function loadIncomingImage() {
  showCanvas.value = false
  imageElement.value = null
  loadError.value = ""
  enlargingAble.value = false
  selectedRatioKey.value = null
  prompt.value = ""

  try {
    const img = await loadImageElement(props.image.src || props.image.base64)

    imageElement.value = img
    await nextTick()
    showCanvas.value = true
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}

function updateEnlargingBtnAble(able: boolean, isRatioBtn: boolean) {
  enlargingAble.value = able

  if (!isRatioBtn) {
    selectedRatioKey.value = null
  }
}

function changeImageRatio(key: number) {
  selectedRatioKey.value = key
  konvaRef.value?.setEnlargingSize(key)
}

function startCreate() {
  if (!enlargingAble.value || creating.value) return

  const distance = konvaRef.value?.getDistance() as DistanceResult | undefined

  if (!distance) return

  const params: OutpaintGeneratePayload = {
    prompt: prompt.value.trim(),
    imageBase64: props.image.base64,
    left: distance.left,
    right: distance.right,
    top: distance.top,
    bottom: distance.bottom,
    realWidth: distance.realWidth,
    realHeight: distance.realHeight,
    numImage: 1,
    sourceImage: {
      id: props.image.id,
      name: props.image.name,
      width: props.image.width,
      height: props.image.height
    },
    ratio:
      selectedRatioKey.value === null
        ? undefined
        : ratioOptions[selectedRatioKey.value]?.name
  }

  emit("generate", params)
}

watch(
  () => props.image,
  () => {
    loadIncomingImage()
  },
  {
    immediate: true
  }
)
</script>

<template>
  <section class="studio-enlarging">
    <header class="studio-enlarging-header">
      <div class="studio-enlarging-title-group">
        <h2 class="studio-enlarging-title">扩图</h2>
        <p class="studio-enlarging-meta">
          {{ image.name }} · {{ image.width }} x {{ image.height }}
        </p>
      </div>
      <button
        class="studio-enlarging-close"
        type="button"
        aria-label="关闭扩图"
        title="关闭扩图"
        @click="emit('close')"
      />
    </header>

    <div class="studio-enlarging-body">
      <div class="studio-enlarging-canvas-wrap">
        <StudioEnlargingKonva
          v-if="showCanvas && imageElement"
          ref="konvaRef"
          :img-data="imageElement"
          :img-width="image.width"
          :img-height="image.height"
          @update-enlarging-btn-able="updateEnlargingBtnAble"
        />
        <div v-else class="studio-enlarging-loading">
          {{ loadError || "正在加载图片" }}
        </div>
      </div>

      <footer class="studio-enlarging-controls">
        <div class="studio-enlarging-ratios" aria-label="扩图比例">
          <button
            v-for="option in ratioOptions"
            :key="option.valueKey"
            type="button"
            :class="
              selectedRatioKey === option.valueKey
                ? 'studio-enlarging-ratio active'
                : 'studio-enlarging-ratio'
            "
            @click="changeImageRatio(option.valueKey)"
          >
            {{ option.name }}
          </button>
        </div>

        <div class="studio-enlarging-prompt-row">
          <textarea
            v-model="prompt"
            class="studio-enlarging-prompt"
            maxlength="2000"
            placeholder="描述希望扩展出的画面内容"
          />
          <button
            class="studio-enlarging-create"
            type="button"
            :disabled="!enlargingAble || creating"
            @click="startCreate"
          >
            一键生成
          </button>
        </div>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.studio-enlarging {
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: 64px minmax(0, 1fr);
  background: #fff;
}

.studio-enlarging-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.studio-enlarging-title-group {
  min-width: 0;
}

.studio-enlarging-title {
  margin: 0;
  color: #191919;
  font-size: 16px;
  line-height: 24px;
  font-weight: 800;
}

.studio-enlarging-meta {
  margin: 2px 0 0;
  overflow: hidden;
  color: rgba(25, 25, 25, 0.58);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.studio-enlarging-close {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
}

.studio-enlarging-close::before {
  content: "";
  width: 16px;
  height: 16px;
  display: block;
  margin: 8px;
  background: #191919;
  mask: url("/studio/xmark.svg") center / contain no-repeat;
  -webkit-mask: url("/studio/xmark.svg") center / contain no-repeat;
}

.studio-enlarging-close:hover {
  background: rgba(25, 25, 25, 0.06);
}

.studio-enlarging-body {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 24px;
  gap: 18px;
}

.studio-enlarging-canvas-wrap {
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: #f8fbff;
}

.studio-enlarging-loading {
  color: rgba(25, 25, 25, 0.58);
  font-size: 14px;
}

.studio-enlarging-controls {
  display: grid;
  gap: 14px;
}

.studio-enlarging-ratios {
  display: flex;
  align-items: center;
  gap: 8px;
}

.studio-enlarging-ratio {
  height: 32px;
  min-width: 72px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: #f3f3f3;
  color: #191919;
  font-size: 14px;
  line-height: 22px;
}

.studio-enlarging-ratio:hover {
  background: #dfdfdf;
}

.studio-enlarging-ratio.active {
  background: rgba(10, 89, 247, 0.08);
  color: #0A59F7;
}

.studio-enlarging-prompt-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  align-items: stretch;
  gap: 12px;
}

.studio-enlarging-prompt {
  width: 100%;
  height: 76px;
  resize: none;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #191919;
  font-size: 14px;
  line-height: 22px;
}

.studio-enlarging-prompt:focus {
  border-color: rgba(10, 89, 247, 0.7);
}

.studio-enlarging-prompt::placeholder {
  color: rgba(25, 25, 25, 0.42);
}

.studio-enlarging-create {
  border: 0;
  border-radius: 8px;
  background: #0A59F7;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.studio-enlarging-create:hover:not(:disabled) {
  background: #0950de;
}

.studio-enlarging-create:disabled {
  opacity: 0.45;
}
</style>
