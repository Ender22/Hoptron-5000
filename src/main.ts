import { startGame } from './game/Game';
import { startViewer } from './viewer/viewer';

// Default boots the game shell; /?viewer opens the animation debug tool.
const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

if (params.has('viewer')) {
  void startViewer(root);
} else {
  void startGame(root);
}
