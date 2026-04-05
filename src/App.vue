<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  KEY_LENGTH,
  buildSourcePreview,
  formatBytes,
  generateRandomBinaryKey,
  sanitizeKey,
  transformFileData,
  trimTextToBinaryLimit,
} from './utils/cipher'

const ACCENT_CELLS = new Set([1, 27, 28, 32])
const MODE_META = {
  encrypt: {
    actionLabel: 'Зашифровать',
    busyLabel: 'Шифруем...',
    outputTag: 'OUT / ENC',
    outputEmpty: 'Шифр',
    previewLabel: 'HEX',
  },
  decrypt: {
    actionLabel: 'Расшифровать',
    busyLabel: 'Расшифровываем...',
    outputTag: 'OUT / DEC',
    outputEmpty: 'Расшифровка',
    previewLabel: 'DATA',
  },
}

const keyValue = ref('')
const keyFileNote = ref('0 / 1')
const operationMode = ref('encrypt')

const sourceFile = ref(null)
const sourcePreview = ref('Ждёт файл')

const encryptedResult = ref(null)
const isEncrypting = ref(false)

const binaryKeyValue = computed(() => sanitizeKey(keyValue.value))

const keyBits = computed(() =>
  Array.from({ length: KEY_LENGTH }, (_, index) => binaryKeyValue.value[index] ?? ''),
)

const filledBitsCount = computed(() => binaryKeyValue.value.length)
const isKeyComplete = computed(() => binaryKeyValue.value.length === KEY_LENGTH)
const canEncrypt = computed(() => Boolean(sourceFile.value) && isKeyComplete.value && !isEncrypting.value)
const currentModeMeta = computed(() => MODE_META[operationMode.value])

const sourceMeta = computed(() => {
  if (!sourceFile.value) {
    return [
      { label: 'Статус', value: 'Пусто' },
      { label: 'Размер', value: '-' },
      { label: 'Тип', value: '-' },
    ]
  }

  return [
    { label: 'Статус', value: 'Ок' },
    { label: 'Размер', value: formatBytes(sourceFile.value.size) },
    { label: 'Тип', value: sourceFile.value.type || 'Не определён' },
  ]
})

const encryptedMeta = computed(() => {
  if (!encryptedResult.value) {
    return [
      { label: 'Статус', value: 'Пусто' },
      { label: 'Размер', value: '-' },
      { label: 'Ключ', value: `${filledBitsCount.value}/32` },
    ]
  }

  return [
    { label: 'Статус', value: 'Ок' },
    { label: 'Размер', value: formatBytes(encryptedResult.value.size) },
    { label: 'Ключ', value: '32/32' },
  ]
})

const encryptedFileName = computed(() => encryptedResult.value?.name ?? 'Нет результата')
const encryptedPreview = computed(() => encryptedResult.value?.preview ?? 'Пусто')
const shiftOperationsCount = computed(() => encryptedResult.value?.shiftCount ?? 0)
const resultTitle = computed(() =>
  encryptedResult.value ? encryptedFileName.value : currentModeMeta.value.outputEmpty,
)

function setOperationMode(nextMode) {
  if (nextMode === operationMode.value) {
    return
  }

  operationMode.value = nextMode
  clearEncryptedResult()
}

function setKeyValue(nextValue) {
  if (nextValue === keyValue.value) {
    return
  }

  keyValue.value = nextValue
  clearEncryptedResult()
}

function handleKeyBeforeInput(event) {
  if (!event.inputType.startsWith('insert')) {
    return
  }

  const input = event.target

  if (!(input instanceof HTMLInputElement)) {
    return
  }

  const currentValue = input.value
  const selectionStart = input.selectionStart ?? currentValue.length
  const selectionEnd = input.selectionEnd ?? currentValue.length
  const nextBaseValue = currentValue.slice(0, selectionStart) + currentValue.slice(selectionEnd)
  const remainingBinarySlots = KEY_LENGTH - sanitizeKey(nextBaseValue).length

  if (remainingBinarySlots <= 0) {
    event.preventDefault()
    return
  }

  const insertedText = event.data ?? ''
  const allowedText = trimTextToBinaryLimit(insertedText, remainingBinarySlots)

  if (allowedText === insertedText) {
    return
  }

  event.preventDefault()

  const nextValue =
    currentValue.slice(0, selectionStart) + allowedText + currentValue.slice(selectionEnd)

  input.value = nextValue

  const caretPosition = selectionStart + allowedText.length
  input.setSelectionRange(caretPosition, caretPosition)

  setKeyValue(nextValue)
  keyFileNote.value = '0 / 1'
}

function handleKeyInput(event) {
  setKeyValue(event.target.value)
  keyFileNote.value = '0 / 1'
}

function generateKey() {
  setKeyValue(generateRandomBinaryKey())
  keyFileNote.value = 'Сгенерирован 32/32'
}

async function handleSourceFileChange(event) {
  const file = event.target.files?.[0]

  if (!file) {
    return
  }

  sourceFile.value = file
  sourcePreview.value = '...'
  clearEncryptedResult()

  try {
    sourcePreview.value = await buildSourcePreview(file)
  } catch {
    sourcePreview.value = 'Ошибка чтения'
  }

  event.target.value = ''
}

async function encryptFile() {
  if (!canEncrypt.value || !sourceFile.value) {
    return
  }

  isEncrypting.value = true

  try {
    const result = await transformFileData(
      sourceFile.value,
      binaryKeyValue.value,
      operationMode.value,
    )
    const resultUrl = URL.createObjectURL(result.blob)

    clearEncryptedResult()
    encryptedResult.value = {
      name: result.fileName,
      preview: result.preview,
      size: result.blob.size,
      shiftCount: result.shiftCount,
      url: resultUrl,
    }
  } finally {
    isEncrypting.value = false
  }
}

function clearEncryptedResult() {
  if (encryptedResult.value?.url) {
    URL.revokeObjectURL(encryptedResult.value.url)
  }

  encryptedResult.value = null
}

onBeforeUnmount(() => {
  clearEncryptedResult()
})
</script>

<template>
  <main class="app-shell">
    <section class="dashboard">
      <header class="topbar">
        <div class="topbar-copy">
          <p class="eyebrow">TI</p>
          <h1>LFSR Cipher</h1>
        </div>
      </header>

      <section class="key-surface">
        <div class="key-main">
          <div class="section-head">
            <div>
              <p class="section-kicker">KEY</p>
              <h2>Ключ</h2>
            </div>

            <span class="count-badge" :class="{ 'is-ready': isKeyComplete }">
              {{ filledBitsCount }}/32
            </span>
          </div>

          <div class="mode-switch" role="group" aria-label="Режим обработки файла">
            <button
              type="button"
              class="mode-option"
              :class="{ 'is-active': operationMode === 'encrypt' }"
              @click="setOperationMode('encrypt')"
            >
              Encrypt
            </button>
            <button
              type="button"
              class="mode-option"
              :class="{ 'is-active': operationMode === 'decrypt' }"
              @click="setOperationMode('decrypt')"
            >
              Decrypt
            </button>
          </div>

          <div class="input-row">
            <label class="key-input-wrap" :class="{ 'is-ready': isKeyComplete }">
              <span class="sr-only">Бинарный ключ</span>
              <input
                :value="keyValue"
                class="key-input"
                maxlength="4096"
                placeholder="Бинарный ключ (0/1)"
                @beforeinput="handleKeyBeforeInput"
                @input="handleKeyInput"
              />
            </label>

            <button type="button" class="mini-file-button" @click="generateKey">
              <span>Генерация</span>
            </button>
          </div>

          <p class="support-text">{{ keyFileNote }}</p>

          <div class="bit-grid">
            <div
              v-for="(bit, index) in keyBits"
              :key="index"
              class="bit-cell"
              :class="{
                'is-filled': bit !== '',
                'is-accent': ACCENT_CELLS.has(index + 1),
              }"
            >
              <span class="bit-index">{{ index + 1 }}</span>
              <strong>{{ bit || '·' }}</strong>
            </div>
          </div>

          <button class="encrypt-button" :disabled="!canEncrypt" @click="encryptFile">
            {{ isEncrypting ? currentModeMeta.busyLabel : currentModeMeta.actionLabel }}
          </button>

          <p class="shift-counter">Сдвигов ключа: {{ shiftOperationsCount }}</p>
        </div>
      </section>

      <section class="file-stage">
        <article class="file-sheet">
          <div class="file-heading">
            <div>
              <p class="section-kicker">IN</p>
              <h3>{{ sourceFile?.name || 'Вход' }}</h3>
            </div>

            <label class="outline-button">
              <input class="sr-only" type="file" @change="handleSourceFileChange" />
              <span>{{ sourceFile ? 'Новый' : 'Файл' }}</span>
            </label>
          </div>

          <ul class="meta-list">
            <li v-for="item in sourceMeta" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </li>
          </ul>

          <div class="preview-stack">
            <p class="preview-label">DATA</p>
            <pre class="preview-box">{{ sourcePreview }}</pre>
          </div>
        </article>

        <article class="file-sheet">
          <div class="file-heading">
            <div>
              <p class="section-kicker">{{ currentModeMeta.outputTag }}</p>
              <h3>{{ resultTitle }}</h3>
            </div>

            <a
              v-if="encryptedResult?.url"
              :href="encryptedResult.url"
              :download="encryptedResult.name"
              class="outline-button"
            >
              Скачать
            </a>
            <span v-else class="ghost-action">Пусто</span>
          </div>

          <ul class="meta-list">
            <li v-for="item in encryptedMeta" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </li>
          </ul>

          <div class="preview-stack">
            <p class="preview-label">{{ currentModeMeta.previewLabel }}</p>
            <pre class="preview-box">{{ encryptedPreview }}</pre>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>

<style scoped></style>
