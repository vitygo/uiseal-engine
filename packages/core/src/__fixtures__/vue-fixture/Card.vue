<template>
  <div class="px-4 mt-[13px] text-blue-500 bg-[#ff5733]" :style="{ padding: '11px', color: '#ff0000' }">
    <p style="margin: 7px; font-size: 15px">Hello</p>
    <span :class="{ 'rounded-[7px]': isRound }">World</span>
  </div>
</template>

<script setup>
const isRound = true;
const color = '#ff0000'; // script content is never checked
</script>

<style>
.btn { color: #00ff00; padding: 99px; }
</style>

<style lang="scss">
.card {
  $bg: #1a1a2e;
  background: $bg;
  padding: 88px;
  .inner { margin: 77px; }
}
</style>
