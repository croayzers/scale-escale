import { SubscriptionManager } from '../services/SubscriptionManager.js';

const SELECTOR = '[data-pro-feature]';

function markButtons(root = document) {
  const scope = root?.querySelectorAll ? root : document;
  const buttons = [...scope.querySelectorAll(SELECTOR)];

  buttons.forEach(button => {
    const unlocked = true;
    const forceBadge = button.dataset.proBadge !== 'off';

    button.classList.toggle('pro-button', forceBadge);
    button.classList.toggle('pro-locked', forceBadge && !unlocked);
    button.classList.toggle('pro-unlocked', forceBadge && unlocked);
    button.dataset.proState = unlocked ? 'unlocked' : 'locked';
  });

  return buttons.map(button => ({
    id: button.id || '',
    feature: button.dataset.proFeature || '',
    unlocked: button.dataset.proState === 'unlocked'
  }));
}

function bindPlanListener() {
  document.addEventListener('escale:plan-changed', () => {
    markButtons(document);
  });
}

function init() {
  bindPlanListener();
  markButtons(document);
}

export const ProButtonManager = {
  init,
  markButtons
};

window.markProButtons = root => markButtons(root || document);
