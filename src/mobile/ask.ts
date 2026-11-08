/** Open Ask Alfie from anywhere in the phone app, optionally with a question to send. */
export const askAlfie = (message?: string) => window.dispatchEvent(new CustomEvent('m-ask-alfie', { detail: message }));
