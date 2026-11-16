// Local CDP helper for the user-authorized, isolated research browser.
// Never read cookies, credentials, storage, private inboxes, or network payloads.
const [action, target, ...rest] = process.argv.slice(2);
const root = 'http://127.0.0.1:9223';
let tab;
if (action === 'new') {
  tab = await (await fetch(`${root}/json/new?${encodeURIComponent(target)}`, { method: 'PUT' })).json();
} else {
  const tabs = await (await fetch(`${root}/json/list`)).json();
  tab = tabs.find(t => t.id === target && t.type === 'page');
}
if (!tab) throw new Error('Research tab not found');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
try {
  if (action === 'front') {
    await call('Page.bringToFront');
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  if (action === 'hover') {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(rest[0]), y: Number(rest[1]) });
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  if (action === 'nav') await call('Page.navigate', { url: rest[0] });
  if (action === 'search') {
    const query = rest.join(' ');
    const search = await call('Runtime.evaluate', { expression: `(()=>{const e=[...document.querySelectorAll('[role="dialog"] input[type="search"]')].find(e=>/^Search in (GO stores|Mohamed|Moemen|Amro)/.test(e.placeholder));if(!e)return false;e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(query)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`, returnByValue: true });
    if (!search.result?.value) throw new Error('GO stores search input not found');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await new Promise(resolve => setTimeout(resolve, 6500));
  }
  if (action === 'new' || action === 'nav') await new Promise(resolve => setTimeout(resolve, 6500));
  const expression = action === 'eval64' ? Buffer.from(rest[0], 'base64').toString('utf8') : action === 'eval' ? rest.join(' ') : `(()=>{const post=/facebook\\.com\\/.*(?:posts\\/|permalink\\/|reel\\/)/.test(location.href);const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(e=>[...e.querySelectorAll('[role="heading"],h1,h2')].some(h=>/GO stores.*Post/.test(h.innerText)));const main=[...document.querySelectorAll('[role="main"],main')];const scope=post?dialogs:main.filter(e=>!/What's on your mind/.test(e.innerText));return JSON.stringify({title:document.title,url:location.href,text:scope.length?scope.map(e=>e.innerText).join('\\n').slice(0,45000):'Target content not available yet',links:scope.flatMap(e=>[...e.querySelectorAll('a[href]')]).map(a=>({text:a.innerText.slice(0,100),href:a.href})).filter(a=>a.text && !/messages|notifications|notif_|approval_id|stories\\//.test(a.href)).slice(0,220)})})()`;
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  console.log(JSON.stringify({ tab: tab.id, result: result.result?.value, error: result.exceptionDetails?.text }));
} finally { ws.close(); }
