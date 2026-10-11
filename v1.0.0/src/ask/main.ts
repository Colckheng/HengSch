import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/700.css';
import '@fontsource/inter-tight/800.css';
import '../renderer/styles/index.css';
import './ask.css';

interface AskPayload {
  todoId: string;
  message: string;
  detail: string;
}

type AskAction = 'complete' | 'not-done' | 'cancel';

declare global {
  interface Window {
    askApi: {
      onPresent: (cb: (payload: AskPayload) => void) => () => void;
      answer: (action: AskAction) => Promise<void>;
    };
  }
}

const taskEl = document.getElementById('ask-task') as HTMLDivElement;
const questionEl = document.getElementById('ask-question') as HTMLDivElement;
const btnDone = document.getElementById('ask-btn-done') as HTMLButtonElement;
const btnNotDone = document.getElementById('ask-btn-notdone') as HTMLButtonElement;

let answered = false;

async function answer(action: AskAction): Promise<void> {
  if (answered) return;
  answered = true;
  await window.askApi.answer(action);
}

btnDone.addEventListener('click', () => void answer('complete'));
btnNotDone.addEventListener('click', () => void answer('not-done'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') void answer('cancel');
});

window.askApi.onPresent((payload) => {
  taskEl.textContent = payload.message;
  questionEl.textContent = payload.detail;
  // 默认聚焦「还没做」——防误触（延续 defaultId=1 语义）
  btnNotDone.focus();
});
