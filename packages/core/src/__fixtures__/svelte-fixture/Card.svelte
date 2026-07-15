<script>
  let isActive = true;
  let count = 0;
</script>

<style lang="scss">
  .container {
    $border: #333;
    border-color: $border;
    padding: 13px;
    .title { font-size: 15px; }
  }
</style>

<div class="container px-4 mt-[13px] bg-[#ff5733]"
     style="border-radius: 7px">
  <h1 style:color="#ff0000"
      style:padding="9px"
      class:rounded-[3px]={isActive}>
    Hello
  </h1>
  {#if count > 0}
    <span class="text-[11px]">Count: {count}</span>
  {/if}
</div>
