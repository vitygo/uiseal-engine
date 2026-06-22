import { useInput } from 'ink';

interface UseKeyboardOptions {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onEnter?: () => void;
  onQuit?: () => void;
  onSearch?: () => void;
  onBack?: () => void;
  enabled?: boolean;
}

export function useKeyboard({
  onUp,
  onDown,
  onLeft,
  onRight,
  onEnter,
  onQuit,
  onSearch,
  onBack,
  enabled = true,
}: UseKeyboardOptions) {
  useInput(
    (input, key) => {
      if (key.upArrow && onUp) onUp();
      else if (key.downArrow && onDown) onDown();
      else if (key.leftArrow && onLeft) onLeft();
      else if (key.rightArrow && onRight) onRight();
      else if (key.return && onEnter) onEnter();
      else if (input === 'q' && onQuit) onQuit();
      else if (input === '/' && onSearch) onSearch();
      else if (input === '' && key.escape && onBack) onBack();
    },
    { isActive: enabled },
  );
}
