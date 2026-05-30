<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue"

type DistanceResult = {
  left: number
  right: number
  top: number
  bottom: number
  realWidth: number
  realHeight: number
}

type Box = {
  x: number
  y: number
  width: number
  height: number
}

const props = defineProps<{
  imgData: HTMLImageElement
  imgWidth: number
  imgHeight: number
}>()

const emit = defineEmits<{
  updateEnlargingBtnAble: [able: boolean, isRatioBtn: boolean]
}>()

const stageConfig = reactive({
  width: 828,
  height: 420
})

const imageConfig = reactive({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  image: props.imgData
})

const rectConfig = reactive({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  fill: "rgb(244, 239, 250)",
  stroke: "rgb(173, 102, 255)",
  strokeWidth: 0.5,
  draggable: false,
  rotation: 0,
  name: "resizableRect"
})

const transformerConfig = {
  rotateEnabled: false,
  keepRatio: false,
  flipEnabled: false,
  borderStroke: "#0A59F7",
  borderStrokeWidth: 1,
  anchorFill: "#ffffff",
  anchorStroke: "#0A59F7",
  anchorStrokeWidth: 2,
  anchorSize: 10,
  enabledAnchors: [
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right"
  ],
  boundBoxFunc
}

const enlargingSize = reactive<Box[]>([
  { x: 0, y: 0, width: 0, height: 0 },
  { x: 0, y: 0, width: 0, height: 0 },
  { x: 0, y: 0, width: 0, height: 0 }
])

const changeRect = reactive({
  width: 0,
  height: 0
})

const showRect = ref(false)
const selectedNodes = ref<unknown[]>([])
const scale = ref(1)
const konvaLayer = ref<any>(null)
const konvaRect = ref<any>(null)

function sleepAsync(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function round2(value: number) {
  return Number(value.toFixed(2))
}

function loadImage() {
  imageConfig.image = props.imgData
  imageConfig.height = stageConfig.height * 0.5
  scale.value = imageConfig.height / props.imgHeight
  imageConfig.width = props.imgWidth * scale.value

  if (imageConfig.width > 235) {
    imageConfig.width = 235
    scale.value = imageConfig.width / props.imgWidth
    imageConfig.height = props.imgHeight * scale.value
  }

  imageConfig.x = (stageConfig.width - imageConfig.width) / 2
  imageConfig.y = (stageConfig.height - imageConfig.height) / 2

  rectConfig.x = imageConfig.x
  rectConfig.y = imageConfig.y
  rectConfig.width = imageConfig.width
  rectConfig.height = imageConfig.height
  changeRect.width = rectConfig.width
  changeRect.height = rectConfig.height

  showRect.value = true
  getEnlargingSizeList()
  bindTransformer()
}

async function bindTransformer() {
  await sleepAsync(100)
  const node = konvaRect.value?.getNode?.()

  if (!node) return

  selectedNodes.value = [node]
  await nextTick()
  konvaLayer.value?.getNode?.().batchDraw()
}

function getEnlargingSizeList() {
  const squareSide = Math.max(imageConfig.width, imageConfig.height)

  enlargingSize[0] = {
    width: squareSide,
    height: squareSide,
    x: (stageConfig.width - squareSide) / 2,
    y: (stageConfig.height - squareSide) / 2
  }

  let portraitWidth = imageConfig.width
  let portraitHeight = (imageConfig.width / 9) * 16

  if (portraitHeight < imageConfig.height) {
    portraitHeight = imageConfig.height
    portraitWidth = (imageConfig.height / 16) * 9
  }

  enlargingSize[1] = {
    width: portraitWidth,
    height: portraitHeight,
    x: (stageConfig.width - portraitWidth) / 2,
    y: (stageConfig.height - portraitHeight) / 2
  }

  let landscapeHeight = imageConfig.height
  let landscapeWidth = (imageConfig.height / 9) * 16

  if (landscapeWidth < imageConfig.width) {
    landscapeWidth = imageConfig.width
    landscapeHeight = (imageConfig.width / 16) * 9
  }

  enlargingSize[2] = {
    width: landscapeWidth,
    height: landscapeHeight,
    x: (stageConfig.width - landscapeWidth) / 2,
    y: (stageConfig.height - landscapeHeight) / 2
  }
}

async function setEnlargingSize(key: number) {
  const nextSize = enlargingSize[key]

  if (!nextSize) return

  selectedNodes.value = []
  showRect.value = false
  await sleepAsync(1)

  rectConfig.x = nextSize.x
  rectConfig.y = nextSize.y
  rectConfig.width = nextSize.width
  rectConfig.height = nextSize.height
  changeRect.width = nextSize.width
  changeRect.height = nextSize.height

  showRect.value = true
  await sleepAsync(1)

  const node = konvaRect.value?.getNode?.()

  if (node) {
    node.position({ x: rectConfig.x, y: rectConfig.y })
    node.size({ width: rectConfig.width, height: rectConfig.height })
    node.scale({ x: 1, y: 1 })
    selectedNodes.value = [node]
  }

  konvaLayer.value?.getNode?.().batchDraw()
  emit("updateEnlargingBtnAble", checkEnlarging(rectConfig), true)
}

function boundBoxFunc(oldBox: Box, newBox: Box) {
	console.log('oldBox: ', oldBox);
	console.log('newBox: ', newBox);

	const maxWidth = stageConfig.width
	const maxHeight = stageConfig.height

	const isLeftOut = newBox.x < 0
	const isRightOut = newBox.x + newBox.width > maxWidth
	const isTopOut = newBox.y < 0
	const isBottomOut = newBox.y + newBox.height > maxHeight

	if (isLeftOut) {
			newBox.width = newBox.width + newBox.x;
			newBox.x = 0
	}
	if (isRightOut) {
			newBox.x = oldBox.x
			newBox.width = oldBox.width
	}
	if (isTopOut) {
		newBox.height = newBox.height + newBox.y
		newBox.y = 0
	}
	if (isBottomOut) {
		newBox.y = oldBox.y
		newBox.height = oldBox.height
	}

	const minX = imageConfig.x
  const minY = imageConfig.y
  const minWidth = imageConfig.width
  const minHeight = imageConfig.height

	const isLeftIn = newBox.x > minX
	const isRighIn = round2(newBox.x + newBox.width) < round2(minX + minWidth)
	const isTopIn = newBox.y > minY
	const isBottomIn = round2(newBox.y + newBox.height) < round2(minY + minHeight)

	if (isLeftIn) {
		newBox.width = newBox.width - (minX - newBox.x)
		newBox.width = Math.round(newBox.width)
		newBox.x = minX
	}
	if (isRighIn) {
		newBox.width = minX - newBox.x + minWidth
		newBox.x = oldBox.x
	}
	if (isTopIn) {
		newBox.height = newBox.height - (minY - newBox. y)
		newBox.y = minY
	}
	if (isBottomIn) {
		newBox.height = minY - newBox.y + minHeight
		newBox.y = oldBox.y
	}

	newBox.x = Math.max(0, Math.min(newBox.x, maxWidth - newBox.width))
	newBox.y = Math.max(0, Math.min(newBox.y, maxHeight - newBox.height))

	changeRect.width = newBox.width
	changeRect.height = newBox.height

	emit('updateEnlargingBtnAble', checkEnlarging(newBox), false)

	return newBox
}

function checkEnlarging(node: Pick<Box, "width" | "height">) {
  const interpolateWidth = node.width - imageConfig.width
  const interpolateHeight = node.height - imageConfig.height

  return !(interpolateWidth < 0.5 && interpolateHeight < 0.5)
}

function getDistance(): DistanceResult {
  const node = konvaRect.value?.getNode?.()
  const x = node?.x?.() ?? rectConfig.x
  const y = node?.y?.() ?? rectConfig.y
  const width = changeRect.width
  const height = changeRect.height

  const left = Math.round(Math.abs(Math.round(imageConfig.x - x)) / scale.value)
  const right = Math.round(
    Math.abs(Math.round(x + width - (imageConfig.x + imageConfig.width))) / scale.value
  )
  const top = Math.round(Math.abs(Math.round(imageConfig.y - y)) / scale.value)
  const bottom = Math.round(
    Math.abs(Math.round(y + height - (imageConfig.y + imageConfig.height))) / scale.value
  )
  const realWidth = Math.round(width / scale.value)
  const realHeight = Math.round(height / scale.value)

  return {
    left,
    right,
    top,
    bottom,
    realWidth,
    realHeight
  }
}

onMounted(loadImage)

defineExpose({
  setEnlargingSize,
  getDistance
})
</script>

<template>
  <v-stage :config="stageConfig">
    <v-layer ref="konvaLayer">
      <v-rect
        v-if="showRect"
        ref="konvaRect"
        :config="rectConfig"
      />
      <v-image :config="imageConfig" />
      <v-transformer
        :config="transformerConfig"
        :nodes="selectedNodes"
      />
    </v-layer>
  </v-stage>
</template>
