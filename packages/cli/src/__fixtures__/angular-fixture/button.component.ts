import { Component } from '@angular/core';

@Component({
  selector: 'app-button',
  styles: [`
    .btn { color: #00ff00; }
  `],
  template: `<button class="px-4 mt-[13px]">Click</button>`,
})
export class ButtonComponent {}
