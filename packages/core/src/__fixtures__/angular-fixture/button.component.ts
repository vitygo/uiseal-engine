import { Component } from '@angular/core';

@Component({
  selector: 'app-button',
  styles: [`
    .btn { color: #ff0000; padding: 13px; border-radius: 7px; }
    .icon { font-size: 15px; }
  `],
  template: `
    <button class="btn px-4 mt-[13px]"
            [ngStyle]="{ 'color': '#00ff00' }"
            [style.margin.px]="9">
      Click me
    </button>
    <span [ngClass]="{ 'bg-[#ff5733]': isActive }">Status</span>
  `
})
export class ButtonComponent {
  isActive = true;
}
