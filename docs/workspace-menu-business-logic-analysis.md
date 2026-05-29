# Workspace Menu Business Logic Analysis

本文分析 `workspace-style-menu` 和 `workspace-settings-menu` 的业务意图，并参考 `/Users/ljc/Documents/workspace/agent/UXAI/packages/opencode/src/tool/internel_image_generate.ts` 的实现方式，说明后续应如何让菜单选择真正影响图片生成请求。

本文只做意图分析和方案整理，不涉及代码修改。

## 当前页面现状

当前页面中有两个主要菜单：

- `workspace-style-menu`：风格模型选择。
- `workspace-settings-menu`：图片比例和生成数量选择。

当前前端已经有这些状态：

```ts
selectedComposerStyleId
selectedAspectId
selectedImageCount
```

其中：

- `selectedComposerStyleId` 只存在于前端 UI 状态中。
- `selectedAspectId` 由 `agentState.width / agentState.height` 反推。
- `selectedImageCount` 来自 `agentState.numImage`。

当前逻辑里：

- 选择比例会更新 `agentState.width / height`。
- 选择数量会更新 `agentState.numImage`。
- 选择风格只更新 `selectedComposerStyleId`，没有写入 `agentState`，也没有进入后端生成参数。

因此目前 `workspace-settings-menu` 中的比例和数量已经部分参与生成链路；`workspace-style-menu` 主要还是展示状态，并未真正影响 `create_task payload`。

## 参考实现的核心思路

`internel_image_generate.ts` 的设计把菜单参数抽象成工具输入：

```ts
{
  capability,
  prompt,
  styleModel,
  aspectRatio,
  count,
  referenceImages,
  sourceImage,
  extra
}
```

其中与这两个菜单相关的是：

- `styleModel`
- `aspectRatio`
- `count`

这些字段不是 UI 装饰，而是明确参与 payload 组装。

## 风格模型的业务含义

参考实现中，`styleModel` 会进入：

```ts
getInternalStyleConfig(styleModel)
```

并映射为完整的风格配置：

```ts
type InternalStyleConfig = {
  taskType: string
  tagName: string
  target: string
  loras: Array<{
    name: string
    weight: number | string
  }>
  mode: string
}
```

也就是说，一个风格模型不仅仅是 prompt 里的一个词，而是会影响：

- `task_type`
- `args.tag_name`
- `args.target`
- `args.loras`
- `args.mode`

注意：参考实现里的 `targetSize` 字段在当前页面业务中不应再作为图片尺寸来源。真实输出尺寸由 `composerAspectOptions` 决定，并最终写入 `args.target_size`。

例如参考实现中：

```ts
{
  aliases: ["BDIcon", "bd-icon", "DBID"],
  config: {
    taskType: "txt2img_v2_performance",
    tagName: "BDIcon",
    target: "flux1-dev",
    loras: [{ name: "F.1_BDicon", weight: 0.8 }],
    mode: "performance"
  }
}
```

这说明 `workspace-style-menu` 的真实业务意图应该是：**选择一套生成模型配置**，而不是只改变右侧“模型”展示文案。

## 图片设置的业务含义

`workspace-settings-menu` 中有两个子设置：

- 比例：`aspectRatio`
- 数量：`count`

参考实现中：

```ts
getStudioAspectRatio(input)
getStudioCount(input)
```

分别负责解析比例和生成数量。

### 比例

比例会决定最终接口调用里的 `target_size`。

当前业务确认：风格模型配置里的 `targetSize` 不用于决定图片基础尺寸；真实图片尺寸由 `composerAspectOptions` 确定，并以如下格式进入最终接口：

```ts
target_size: {
  width: 1024,
  height: 1024
}
```

因此比例菜单的业务意图是：**直接决定最终生成图片的宽高尺寸**。

### 数量

数量会进入：

```ts
args.num_image
```

参考实现中支持 `1 / 2 / 3 / 4`，默认是 `1`：

```ts
if (value === 1 || value === 2 || value === 3 || value === 4) return value
return 1
```

当前项目默认 `numImage` 是 `2`，这和参考实现默认 `1` 不同。后续需要明确产品默认值，避免 UI 默认、后端默认和工具默认不一致。

## Payload 组装意图

参考实现最终普通生图 payload 是：

```ts
{
  user: {
    idx: userIdx
  },
  task_type: context.taskType,
  args: {
    tag_name: context.styleConfig.tagName,
    num_image: getStudioCount(input),
    target: context.styleConfig.target,
    target_size: context.targetSize,
    loras: context.styleConfig.loras,
    mode: context.styleConfig.mode,
    ref_img_list: [],
    customer_prompt: input.prompt,
    prompt: buildPrompt(input)
  }
}
```

这里的 `context.targetSize` 在参考实现中是上下文里的最终尺寸；映射到当前项目时，它不应来自风格模型配置里的 `targetSize`，而应由当前比例在 `composerAspectOptions` 中解析得到。

对应到当前页面，两个菜单应该最终影响：

| UI 菜单 | 字段 | 进入 payload 的位置 |
| --- | --- | --- |
| 风格模型 | `styleModel` | `task_type / tag_name / target / loras / mode` |
| 比例 | `aspectRatio` | `args.target_size` |
| 数量 | `count` | `args.num_image` |

## Prompt 中的工具参数表达

参考实现还支持从 prompt 中解析工具参数：

```ts
工具参数JSON：{...}
风格模型：xxx
画幅比例：1:1
生成数量：2
能力：image.generate
```

并在 `buildPrompt()` 中把菜单参数写回 prompt：

```ts
[
  input.prompt,
  conversationContext ? `上一轮生成摘要：\n${conversationContext}` : undefined,
  input.styleModel ? `风格模型：${input.styleModel}` : undefined,
  input.aspectRatio ? `画幅比例：${input.aspectRatio}` : undefined,
  input.count ? `生成数量：${input.count}` : undefined
]
```

这个设计有两个意图：

1. 结构化参数用于后端严格组装 payload。
2. 同样的参数也进入 prompt，让 LLM 或生成模型能感知用户选择。

对当前项目而言，建议也保留这两个通道：

- 结构化字段：用于确定 `create_task payload`。
- prompt 上下文：用于让 Agent 规划时理解用户选择。

## 当前项目应补齐的状态模型

建议把菜单选择从纯 UI 状态升级为会话状态。

当前 `ClientAgentState` 建议新增：

```ts
type ClientAgentState = {
  // existing fields...
  styleModel?: string
  aspectRatio?: string
}
```

也可以直接保存完整结构：

```ts
type ClientAgentState = {
  selectedStyleId?: string
  selectedStyleLabel?: string
  aspectRatio?: "1:1" | "2:3" | "3:4" | "9:16" | "3:2" | "4:3" | "16:9"
  width: number
  height: number
  numImage: number
}
```

关键是：**风格、比例、数量都应该跟随会话保存和恢复**，而不是只有风格停留在组件级 ref 中。

## 风格配置建议

参考实现中的风格配置可以迁移成当前项目的配置表。

建议形态：

```ts
type ImageStyleConfig = {
  id: string
  label: string
  aliases: string[]
  taskType: string
  tagName: string
  target: string
  loras: Array<{
    name: string
    weight: number | string
  }>
  mode: string
}
```

当前 `composerStyleOptions` 可以从这个配置派生 UI：

```ts
const composerStyleOptions = imageStyleConfigs.map((item) => ({
  id: item.id,
  label: item.label,
  icon: item.icon
}))
```

这样可以避免 UI 风格列表和后端 payload 配置分裂。

## 现有模型配置映射

当前页面 `composerStyleOptions` 中有 11 个风格选项：

```text
qianwen
bdicon
portrait
developer
agent
smart3d
abstract
yunbao
hdesign
harmony
abstract3d
```

参考实现 `internalStyleConfigs` 中也定义了一套风格配置，但它使用 `aliases` 做匹配，而不是使用当前页面的 `id`。两边可以整理成如下映射。

| 当前 UI id | 当前 UI label | 参考 aliases | taskType | tagName | target | loras | mode | 尺寸说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `qianwen` | 千问 | `千问`, `qwen`, `Qwen-Image` | `txt2img_qwen` | `Qwen-Image` | `flux1-dev` | `[]` | `performance` | 由 `composerAspectOptions` 决定 |
| `bdicon` | BDIcon | `BDIcon`, `bd-icon`, `DBID` | `txt2img_v2_performance` | `BDIcon` | `flux1-dev` | `[{ name: "F.1_BDicon", weight: 0.8 }]` | `performance` | 由 `composerAspectOptions` 决定 |
| `portrait` | 质感人像 | `质感人像`, `质感人物`, `portrait` | `txt2img_v2_performance` | `质感人像` | `flux1-krea-dev-fp8` | `[{ name: "F.1_textured_portrait", weight: 0.8 }]` | `performance` | 由 `composerAspectOptions` 决定 |
| `developer` | 开发者人物形象 | `开发者人物形象`, `developer` | `txt2img_v2_performance` | `开发者人物形象` | `flux1-dev` | `[{ name: "F.1_hwc3dcharacter_latest", weight: "0.8" }]` | `performance` | 仅 `1:1` 特殊为 `1280 x 1280`，其他比例使用统一尺寸 |
| `agent` | 小艺agent | `小艺agent`, `xiaoyi` | `txt2img_qwen` | `小艺agent` | `flux1-dev` | `[{ name: "F.1_xiaoyi_agent", weight: 0.85 }]` | `performance` | 由 `composerAspectOptions` 决定 |
| `smart3d` | 智慧3D | `智慧3D`, `smart-3d` | `txt2img_v2_performance` | `智慧3D` | `flux1-dev` | `[{ name: "F.1_intelligent3d", weight: 1 }]` | `hd` | 由 `composerAspectOptions` 决定 |
| `abstract` | 抽象几何背景 | `抽象几何背景`, `abstract` | `txt2img_v2_performance` | `抽象几何背景` | `flux1-dev` | `[{ name: "F.1_abstract_wallpaper", weight: 1 }]` | `performance` | 由 `composerAspectOptions` 决定 |
| `yunbao` | 云宝 | `云宝`, `yunbao` | `txt2img_v2_performance` | `云宝` | `flux1-dev` | `[{ name: "yunbao", weight: 1 }]` | `performance` | 由 `composerAspectOptions` 决定 |
| `hdesign` | H Design插画 | `H Design插画`, `hdesign-illustration` | `txt2img_v2_performance` | `H Design插画` | `flux1-dev` | `[{ name: "F.1_hdesign", weight: 1 }]` | `performance` | 由 `composerAspectOptions` 决定 |
| `harmony` | 鸿蒙插画 | `鸿蒙插画`, `hongmeng` | `txt2img_v2_performance` | `鸿蒙插画` | `flux1-dev` | `[{ name: "F.1_harmonyOSIllustration", weight: 1 }]` | `performance` | 由 `composerAspectOptions` 决定 |
| `abstract3d` | 3D抽象元素 | `3D抽象元素`, `3d-abstract` | `txt2img_v2_performance` | `3D抽象元素` | `flux1-dev` | `[{ name: "F.1_hwcbanner", weight: 0.8 }]` | `performance` | 由 `composerAspectOptions` 决定 |

`loras` 字段在最终接口调用时是数组对象结构，不是冒号字符串。上表为了贴近实际 payload，统一写成如下形式：

```ts
loras: [{ name: "F.1_intelligent3d", weight: 1 }]
```

千问的情况不使用 LoRA：

```ts
loras: []
```

参考实现中还有一个当前 UI 暂未接入的风格：

| 参考 aliases | taskType | tagName | target | loras | mode |
| --- | --- | --- | --- | --- | --- |
| `H Design 3D`, `hdesign3d` | `txt2img_v2_performance` | `H Design 3D` | `flux1-dev` | `[{ name: "F.1_hdesign_3d", weight: 1 }]` | `hd` |

这意味着当前 UI 的 `hdesign` 应对应 H Design 插画；H Design 3D 当前暂未接入。后续如果需要接入 H Design 3D，应新增独立 UI id，例如 `hdesign3d`，避免和 `hdesign` 插画配置混淆。

## 现有比例宽高映射

当前页面的 `composerAspectOptions` 应作为最终图片尺寸映射表。最终接口调用使用如下结构：

```ts
target_size: {
  width: 800,
  height: 1200
}
```

统一尺寸映射如下：

| ratio id | label | 当前 UI width | 当前 UI height |
| --- | --- | ---: | ---: |
| `1:1` | 1:1 | 1024 | 1024 |
| `2:3` | 2:3 | 800 | 1200 |
| `3:4` | 3:4 | 768 | 1024 |
| `9:16` | 9:16 | 720 | 1280 |
| `3:2` | 3:2 | 1200 | 800 |
| `4:3` | 4:3 | 1024 | 768 |
| `16:9` | 16:9 | 1280 | 720 |

其中横向比例由纵向比例宽高翻转可得：

- `3:2` 是 `2:3` 的宽高翻转，即 `1200 x 800`。
- `4:3` 是 `3:4` 的宽高翻转，即 `1024 x 768`。
- `16:9` 是 `9:16` 的宽高翻转，即 `1280 x 720`。

开发者人物形象存在一个特殊规则：

- 当风格模型为 `developer` 且比例为 `1:1` 时，`target_size` 为 `{ width: 1280, height: 1280 }`。
- 其他比例没有特殊尺寸，使用上面的统一尺寸映射。

因此后续实现中，`composerAspectOptions` 应输出最终 `target_size`；风格配置不再提供基础尺寸，只提供模型、LoRA 和模式等生成配置。

## 前端菜单选择后的意图

### handleSelectComposerStyle

当前逻辑：

```ts
selectedComposerStyleId.value = option.id
openComposerMenu.value = null
```

建议业务意图升级为：

1. 更新当前会话的 `agentState.styleModel` 或 `selectedStyleId`。
2. 根据当前风格和当前比例重新确定最终 `target_size`。
3. 如果风格为 `developer` 且比例为 `1:1`，使用特殊尺寸 `1280 x 1280`。
4. 其他情况使用 `composerAspectOptions` 的统一尺寸。
5. 保留当前 `numImage`。
6. 关闭菜单。

也就是说，风格切换应当影响生成参数，而不是只改变菜单高亮；但它不应通过风格配置里的 `targetSize` 决定尺寸，唯一特殊例外是开发者人物形象的 `1:1`。

### handleSelectAspect

当前逻辑直接写入 option 中固定的 `width / height`。

当前业务确认：比例本身就是最终尺寸选择，`composerAspectOptions` 提供最终 `target_size`。

建议：

1. 保存 `aspectRatio`。
2. 根据 `composerAspectOptions` 写回 `agentState.width / height`。
3. 如果当前风格是 `developer` 且比例是 `1:1`，写回 `1280 x 1280`。

### handleSelectImageCount

当前逻辑已经接近目标：

```ts
agentState.numImage = count
```

后续只需要确保它能进入后端 `args.num_image`，并和后端默认值保持一致。

## 后端 Agent 的意图

当前后端 `ImageGenerationAgent` 主要从 `state.width / height / numImage` 组装工具参数。

参考实现提示后端还应该接收：

- `styleModel`
- `aspectRatio`
- `count`

并通过配置映射得到：

- `taskType`
- `tagName`
- `target`
- `loras`
- `mode`

其中 `target_size` 不由风格配置决定，而由 `agentState.width / height`，也就是菜单比例映射后的最终尺寸决定。

建议后端不要信任 LLM 自己决定这些字段，而是：

1. LLM 可以知道用户选择了哪个风格和比例。
2. 后端根据结构化 state 查配置。
3. 后端固定组装 payload。

这与当前已设计的工具动作架构一致：LLM 负责规划，后端负责参数约束。

## 与工具动作架构的关系

`workspace-style-menu` 和 `workspace-settings-menu` 主要影响普通生图工具：

```ts
toolAction = "generate_image"
```

对 `super_resolution / cutout` 这类工具：

- 风格模型通常不参与 payload。
- 比例和数量通常也不参与 payload。
- 这些工具使用自己的 payload builder。

因此菜单参数应该按工具区分使用：

| toolAction | 使用风格 | 使用比例 | 使用数量 |
| --- | --- | --- | --- |
| `generate_image` | 是 | 是 | 是 |
| `super_resolution` | 否 | 否 | 否 |
| `cutout` | 否 | 否 | 固定 1 或按接口要求 |
| `inpaint` | 视接口而定 | 视接口而定 | 视接口而定 |
| `outpaint` | 视接口而定 | 视接口而定 | 视接口而定 |

## 推荐数据流

```text
用户选择风格 / 比例 / 数量
  -> 写入当前会话 agentState
  -> 前端请求 /api/agent/image 时通过 clientState 发送
  -> 后端 hydrateSession 合并状态
  -> Agent planNextStep 把结构化菜单状态提供给 LLM
  -> buildToolArgs 根据 state + style config 组装 payload
  -> create_task
```

普通生图时：

```text
styleModel
  -> getImageStyleConfig()
  -> task_type / tag_name / target / loras / mode

aspectRatio
  -> composerAspectOptions
  -> target_size: { width, height }

numImage
  -> args.num_image
```

## 需要注意的问题

### 1. 当前风格菜单尚未进入后端

当前 `selectedComposerStyleId` 没有写入 `clientState`。如果不改这一点，后端永远不知道用户选择了哪个风格。

### 2. 风格 id 与接口 alias 需要统一

当前 UI id 是：

```text
qianwen
bdicon
portrait
developer
agent
smart3d
abstract
yunbao
hdesign
harmony
abstract3d
```

参考实现使用中文名和 alias 混合匹配。后续建议建立明确的 `id -> config`，不要依赖 label 字符串匹配。

### 3. 比例应以统一尺寸表为准

当前业务确认比例对应的真实尺寸由 `composerAspectOptions` 决定，不再基于风格配置里的 `targetSize` 动态计算。需要修正现有部分尺寸值，并处理开发者人物形象 `1:1 = 1280 x 1280` 的特殊情况。

### 4. 默认数量要统一

当前项目默认 `numImage=2`，参考实现默认 `count=1`。需要产品确认默认值。

### 5. prompt 与结构化字段应保持一致

如果 prompt 中写了“风格模型：BDIcon”，但结构化字段是 `qianwen`，后端应该优先使用结构化字段，或者明确冲突处理规则。

建议优先级：

```text
结构化 clientState / request 字段
  > prompt 中的 工具参数JSON
  > prompt 文本中的标签
  > 默认配置
```

## 建议落地顺序

第一阶段：统一状态

1. 给 `ClientAgentState` 增加 `styleModel` / `aspectRatio`。
2. `handleSelectComposerStyle` 写入当前会话状态。
3. `handleSelectAspect` 保存比例，而不只是保存宽高。
4. localStorage 恢复时同步菜单高亮。

第二阶段：配置表

1. 新增统一的 `imageStyleConfigs`。
2. UI 的 `composerStyleOptions` 从配置派生。
3. 后端增加对应配置或共享配置。

第三阶段：payload 接入

1. 后端 `buildToolArgs` 根据 `state.styleModel` 解析风格配置。
2. 根据 `state.aspectRatio` 从统一尺寸表得到 `target_size`。
3. 对 `developer + 1:1` 特殊写入 `{ width: 1280, height: 1280 }`。
4. 将 `taskType / tagName / target / loras / mode / target_size / numImage` 写入普通生图 payload。

第四阶段：LLM 上下文

1. `planNextStep` 中加入当前风格、比例、数量。
2. `buildPlannerSystemPrompt` 中说明菜单参数是用户显式选择，应优先保留。
3. `finalPrompt` 中可追加风格模型、画幅比例、生成数量等上下文，但 payload 仍以结构化字段为准。

## 结论

参考实现的核心不是简单地“菜单选中后改几个字段”，而是把菜单选项当成图片生成工具的结构化输入。

对当前项目而言：

- `workspace-style-menu` 应该决定生成模型配置。
- `workspace-settings-menu` 应该决定画幅比例和生成数量。
- 这些状态应该保存到会话，并随 `/api/agent/image` 请求传给后端。
- 后端应该用配置表和 payload builder 固定生成 `create_task payload`。
- LLM 可以感知这些菜单选择，但不应该自由决定最终接口字段。
