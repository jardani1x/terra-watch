import { useState } from 'react';
import { useStore } from '../state/store';
import type { AnalystProvider } from '../lib/analyst';

const BRIEF_PROMPT = 'Summarize the current situational picture.';

/** Optional AI analyst — always-on local-rules brief (zero config, zero
 *  network) with an optional BYO-key LLM tier. Every reply is labeled with
 *  its real mode; an LLM failure falls back to the local brief rather than
 *  being hidden. Keys are stored only in this browser and sent only
 *  directly to the chosen provider — never to a Terra Watch server (there
 *  isn't one). */
export default function AnalystPanel() {
  const analyst = useStore((s) => s.analyst);
  const setProvider = useStore((s) => s.setAnalystProvider);
  const setKey = useStore((s) => s.setAnalystKey);
  const setBaseUrl = useStore((s) => s.setAnalystBaseUrl);
  const clearKey = useStore((s) => s.clearAnalystKey);
  const ask = useStore((s) => s.askAnalyst);
  const clearMessages = useStore((s) => s.clearAnalystMessages);

  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (q: string) => {
    const t = q.trim();
    if (!t || busy) return;
    setBusy(true);
    setQuestion('');
    try {
      await ask(t);
    } finally {
      setBusy(false);
    }
  };

  const configured = analyst.provider !== null && !!analyst.apiKey;

  return (
    <section aria-label="AI analyst">
      <div className="rail-sec-title">
        AI ANALYST{' '}
        <span className="tag" style={{ color: configured ? 'var(--amber)' : 'var(--muted)', borderColor: configured ? 'rgba(255,180,84,0.5)' : undefined }}>
          {configured ? 'BYO KEY · INFERENCE' : 'LOCAL RULES'}
        </span>
      </div>
      <p className="inspector-empty" style={{ marginTop: 0 }}>
        Ask about the current public feed. Works with zero setup using a
        rule-based brief; optionally add your own API key for an LLM-written
        answer, always cited to the events above and labeled as inference.
      </p>

      <select
        className="monitor-input"
        aria-label="AI analyst provider"
        value={analyst.provider ?? ''}
        onChange={(e) => setProvider((e.target.value || null) as AnalystProvider | null)}
      >
        <option value="">No key (local rules only)</option>
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="openai-compatible">OpenAI-compatible</option>
      </select>

      {analyst.provider && (
        <>
          <input
            className="monitor-input"
            type="password"
            aria-label="AI analyst API key"
            placeholder="API key (stored only in this browser)…"
            value={analyst.apiKey ?? ''}
            onChange={(e) => setKey(e.target.value || null)}
          />
          {analyst.provider === 'openai-compatible' && (
            <input
              className="monitor-input"
              aria-label="AI analyst base URL"
              placeholder="Base URL (default: https://api.openai.com/v1)…"
              value={analyst.baseUrl ?? ''}
              onChange={(e) => setBaseUrl(e.target.value || null)}
            />
          )}
          <div className="graph-actions" style={{ marginTop: -4, marginBottom: 8 }}>
            <button className="kbd" onClick={clearKey}>CLEAR KEY</button>
          </div>
        </>
      )}

      {analyst.messages.length === 0 ? (
        <p className="inspector-empty">No questions yet.</p>
      ) : (
        <div className="analyst-log">
          {analyst.messages.map((m, i) => (
            <div key={i} className={`analyst-msg analyst-msg-${m.role}`}>
              <div className="lr-meta">
                {m.role === 'user' ? 'YOU' : m.mode === 'llm' ? 'AI · INFERENCE' : 'LOCAL RULES'}
              </div>
              <div>{m.text}</div>
              {m.error && <div className="lr-meta" style={{ color: 'var(--danger)' }}>{m.error}</div>}
              {m.citations.length > 0 && (
                <div className="analyst-citations">
                  {m.citations.map((c, j) =>
                    c.url ? (
                      <a key={j} className="tag" href={c.url} target="_blank" rel="noopener noreferrer">{c.label}</a>
                    ) : (
                      <span key={j} className="tag">{c.label}</span>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        className="monitor-input"
        placeholder="Ask about the current view…"
        aria-label="Ask the AI analyst"
        value={question}
        disabled={busy}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(question); }}
      />
      <div className="graph-actions" style={{ marginTop: 4 }}>
        <button className="kbd" disabled={busy} onClick={() => void submit(question)}>ASK</button>
        <button className="kbd" disabled={busy} onClick={() => void submit(BRIEF_PROMPT)}>GENERATE BRIEF</button>
        {analyst.messages.length > 0 && <button className="kbd" onClick={clearMessages}>CLEAR</button>}
      </div>
    </section>
  );
}
