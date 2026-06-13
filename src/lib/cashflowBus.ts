// Lightweight event bus to coordinate cash-flow modal prompts across the app.

export type CashflowAction = "open" | "close";

const EVENT = "cashflow:request";

export function requestCashflowAction(action: CashflowAction) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { action } }));
}

export function onCashflowRequest(cb: (action: CashflowAction) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail.action);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
