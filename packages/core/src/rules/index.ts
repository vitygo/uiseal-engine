export { noHardcodedColor } from './no-hardcoded-color.js';
export { noArbitrarySpacing } from './no-arbitrary-spacing.js';
export { noArbitraryFontSize } from './no-arbitrary-font-size.js';
export { noUnauthorizedFontFamily } from './no-unauthorized-font-family.js';
export { noArbitraryRadius } from './no-arbitrary-radius.js';
export { enforceContrast } from './enforce-contrast.js';
export { noImgWithoutAlt } from './no-img-without-alt.js';
export { noDivButton } from './no-div-button.js';
export { noEmptyButton } from './no-empty-button.js';
export { noMissingFormLabel } from './no-missing-form-label.js';
export { noPositiveTabindex } from './no-positive-tabindex.js';
export { noAutofocus } from './no-autofocus.js';
export { noXssDangerous } from './no-xss-dangerous.js';
export { noEnvInClient } from './no-env-in-client.js';
export { noConsoleSensitive } from './no-console-sensitive.js';
export { noHardcodedCredentials } from './no-hardcoded-credentials.js';
export { noTodoWithoutTicket } from './no-todo-without-ticket.js';
export { noMagicNumbers } from './no-magic-numbers.js';
export { noOversizedComponent } from './no-oversized-component.js';
export { noConsoleLog } from './no-console-log.js';
export { noInlineStyles } from './no-inline-styles.js';

import { noHardcodedColor } from './no-hardcoded-color.js';
import { noArbitrarySpacing } from './no-arbitrary-spacing.js';
import { noArbitraryFontSize } from './no-arbitrary-font-size.js';
import { noUnauthorizedFontFamily } from './no-unauthorized-font-family.js';
import { noArbitraryRadius } from './no-arbitrary-radius.js';
import { enforceContrast } from './enforce-contrast.js';
import { noImgWithoutAlt } from './no-img-without-alt.js';
import { noDivButton } from './no-div-button.js';
import { noEmptyButton } from './no-empty-button.js';
import { noMissingFormLabel } from './no-missing-form-label.js';
import { noPositiveTabindex } from './no-positive-tabindex.js';
import { noAutofocus } from './no-autofocus.js';
import { noXssDangerous } from './no-xss-dangerous.js';
import { noEnvInClient } from './no-env-in-client.js';
import { noConsoleSensitive } from './no-console-sensitive.js';
import { noHardcodedCredentials } from './no-hardcoded-credentials.js';
import { noTodoWithoutTicket } from './no-todo-without-ticket.js';
import { noMagicNumbers } from './no-magic-numbers.js';
import { noOversizedComponent } from './no-oversized-component.js';
import { noConsoleLog } from './no-console-log.js';
import { noInlineStyles } from './no-inline-styles.js';

export const securityRules = [
  noXssDangerous,
  noEnvInClient,
  noConsoleSensitive,
  noHardcodedCredentials,
];

export const qualityRules = [
  noTodoWithoutTicket,
  noMagicNumbers,
  noOversizedComponent,
  noConsoleLog,
  noInlineStyles,
];

export const allRules = [
  noHardcodedColor,
  noArbitrarySpacing,
  noArbitraryFontSize,
  noUnauthorizedFontFamily,
  noArbitraryRadius,
  enforceContrast,
  noImgWithoutAlt,
  noDivButton,
  noEmptyButton,
  noMissingFormLabel,
  noPositiveTabindex,
  noAutofocus,
  ...securityRules,
  ...qualityRules,
];
