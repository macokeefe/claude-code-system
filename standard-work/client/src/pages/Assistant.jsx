import { useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { toolDefinitions, executeTool } from '../assistant/tools.js';

const MODEL = 'claude-opus-4-8';
const KEY_STORAGE = 'standard-work-anthropic-key';

const SYSTEM_PROMPT = `You are the built-in assistant of "Standard Work", a labor time tracking app used by a continuous improvement engineer at a furniture manufacturer.

The data model:
- SKUs are product variants. Each has an ordered list of steps and a computed total labor time.
- Steps are either unique (own observed time) or attached to a shared step ("tag"). A tag holds the canonical definition and time; every SKU attached to it inherits that time unless the SKU has a per-SKU override.
- Changing a tag's canonical time updates every SKU that inherits it. Every time change is recorded in an audit history.
- Times are stored in seconds and shown as m:ss. When calling tools, pass times as strings like "4:30", "12" (bare number = minutes), or "3 minutes 20 seconds".

Rules:
1. Answer from real data via tools — never guess values. Look up ids with list_skus / list_shared_steps when the user refers to things by name.
2. Before making any change, state exactly what will change and ask the user to confirm — unless their message already specifies the exact change unambiguously (e.g. "set Frame Assembly on SOLA-RA to 17:30"). Deleting anything always requires explicit confirmation.
3. Before changing a tag's canonical time, check which SKUs inherit it and mention them.
4. After a change, report the result briefly, including the new SKU total(s).
5. Be concise and concrete. Use m:ss time formatting in answers. This user thinks in terms of bottlenecks, takt time, and improvement targets — small analyses (longest steps, biggest aggregate contributors) are welcome when asked.`;

export default function Assistant() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '');
  const [keyInput, setKeyInput] = useState('');
  const [chat, setChat] = useState([]); // {role:'user'|'assistant'|'tool'|'error', text}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const apiMessages = useRef([]);
  const scrollRef = useRef();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, busy]);

  function saveKey() {
    const key = keyInput.trim();
    if (!key) return;
    localStorage.setItem(KEY_STORAGE, key);
    setApiKey(key);
    setKeyInput('');
  }

  function clearChat() {
    setChat([]);
    apiMessages.current = [];
  }

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setChat(c => [...c, { role: 'user', text }]);
    apiMessages.current.push({ role: 'user', content: text });

    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      defaultHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
    });

    try {
      // Manual tool-use loop: run tools against the app data until Claude
      // produces a final answer.
      for (let i = 0; i < 12; i++) {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          tools: toolDefinitions,
          messages: apiMessages.current,
        });

        apiMessages.current.push({ role: 'assistant', content: response.content });

        for (const block of response.content) {
          if (block.type === 'text' && block.text.trim()) {
            setChat(c => [...c, { role: 'assistant', text: block.text }]);
          }
        }

        if (response.stop_reason !== 'tool_use') break;

        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          setChat(c => [...c, { role: 'tool', text: block.name.replace(/_/g, ' ') }]);
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
            ...(result && result.error ? { is_error: true } : {}),
          });
        }
        apiMessages.current.push({ role: 'user', content: toolResults });
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        setChat(c => [...c, { role: 'error', text: 'The API key was rejected. Check it and re-enter it below.' }]);
        localStorage.removeItem(KEY_STORAGE);
        setApiKey('');
      } else if (err instanceof Anthropic.APIConnectionError) {
        setChat(c => [...c, { role: 'error', text: 'Could not reach api.anthropic.com — your network may block it, or you may be offline.' }]);
      } else {
        setChat(c => [...c, { role: 'error', text: err.message }]);
      }
      // Drop the failed exchange so the history stays consistent
      while (apiMessages.current.length && apiMessages.current[apiMessages.current.length - 1].role !== 'assistant') {
        if (apiMessages.current[apiMessages.current.length - 1].role === 'user' &&
            typeof apiMessages.current[apiMessages.current.length - 1].content === 'string') {
          apiMessages.current.pop();
          break;
        }
        apiMessages.current.pop();
      }
    }
    setBusy(false);
  }

  if (!apiKey) {
    return (
      <>
        <h1>Assistant</h1>
        <p className="subtitle">Ask questions about your labor data or have changes made for you — powered by Claude.</p>
        <div className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>One-time setup</h2>
          <ol style={{ paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Create an API key at <strong>console.anthropic.com</strong> → API Keys.</li>
            <li>Paste it below. It is stored only in this browser on this computer — never in the app file or your data.</li>
          </ol>
          <p className="muted">Note: questions and the data the assistant reads are sent to Anthropic's API to generate answers, so your network needs to allow api.anthropic.com.</p>
          <div className="row">
            <input type="password" placeholder="sk-ant-…" value={keyInput} onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()} />
            <button className="primary" style={{ flex: '0 0 auto' }} onClick={saveKey}>Save key</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <h1>Assistant</h1>
          <div className="muted">Ask about your data or tell it what to change — it confirms before changing anything.</div>
        </div>
        <div className="spacer" />
        <button className="small" onClick={clearChat}>New conversation</button>
        <button className="ghost small" onClick={() => { localStorage.removeItem(KEY_STORAGE); setApiKey(''); }}>Change API key</button>
      </div>

      <div className="card chat-box" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="empty">
            Try: “Which SKU has the most labor time and what's its bottleneck step?”<br />
            “Update Connector Pre-Assembly to 10:30 — we added a second fixture.”<br />
            “Which shared step should we improve first?”
          </div>
        )}
        {chat.map((m, i) => {
          if (m.role === 'tool') return <div key={i} className="chat-chip">⚙ {m.text}</div>;
          if (m.role === 'error') return <div key={i} className="alert error" style={{ alignSelf: 'stretch' }}>{m.text}</div>;
          return <div key={i} className={`chat-msg ${m.role}`}>{m.text}</div>;
        })}
        {busy && <div className="chat-chip">thinking…</div>}
      </div>

      <form onSubmit={send} className="toolbar">
        <input style={{ flex: 1 }} placeholder="Ask a question or describe a change…"
          value={input} onChange={e => setInput(e.target.value)} disabled={busy} autoFocus />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
      <p className="muted" style={{ fontSize: 12 }}>Conversation isn't saved — it resets when you leave this page. Data changes it makes are permanent (and tracked in history like any edit).</p>
    </>
  );
}
