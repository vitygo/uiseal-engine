<div class="px-4 mt-[13px] text-blue-500 bg-[#ff5733]"
     style="padding: 13px; color: #ff0000">
  <p class="{{ $isActive ? 'bg-red-500' : '' }} rounded-[7px]">
    {{ $name }}
  </p>
  @if($show)
    <span style="font-size: 15px">Hello</span>
  @endif
</div>
